/* Estoque com reserva. Só controla produtos com linha na tabela `estoque` (o resto é confirmado na retirada).
   Toda mudança é condicional (WHERE ...) e em lote (transação do D1): duas compras da última unidade não passam
   juntas, e repetir um aviso do Mercado Pago não baixa o estoque duas vezes. */
import { ErroHttp, agora } from './util.js';

const RESERVA_MS = 2 * 3600000; // a order expira em 1 h; a reserva dura um pouco mais

export function reservaAte() { return new Date(Date.now() + RESERVA_MS).toISOString(); }

async function controlados(db, ids) {
  if (!ids.length) return new Set();
  const r = await db.prepare('SELECT produto_id FROM estoque WHERE produto_id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all();
  return new Set((r.results || []).map((x) => x.produto_id));
}

// Reserva antes de gravar o pedido. Falta de estoque = 409, e o que já foi reservado volta.
export async function reservar(db, linhas) {
  const ctl = await controlados(db, linhas.map((l) => l.id));
  const alvo = linhas.filter((l) => ctl.has(l.id));
  if (!alvo.length) return [];
  const quando = agora();
  const res = await db.batch(alvo.map((l) => db.prepare(
    'UPDATE estoque SET reservado = reservado + ?, atualizado_em = ? WHERE produto_id = ? AND quantidade - reservado >= ?'
  ).bind(l.qtd, quando, l.id, l.qtd)));
  const falta = alvo.filter((l, i) => res[i].meta.changes !== 1);
  if (falta.length) {
    const ok = alvo.filter((l, i) => res[i].meta.changes === 1);
    if (ok.length) await db.batch(ok.map((l) => db.prepare('UPDATE estoque SET reservado = reservado - ? WHERE produto_id = ?').bind(l.qtd, l.id)));
    throw new ErroHttp(409, 'estoque_insuficiente', 'Não há estoque suficiente para este pedido.', { produtos: falta.map((l) => l.id) });
  }
  return alvo;
}
// Desfaz uma reserva feita para um pedido que não chegou a ser gravado
export function desfazer(db, alvo) {
  return alvo.length ? db.batch(alvo.map((l) => db.prepare('UPDATE estoque SET reservado = reservado - ? WHERE produto_id = ?').bind(l.qtd, l.id))) : null;
}
// Comandos que gravam as reservas junto com o pedido (mesmo lote)
export function registrarReservas(db, pedidoId, alvo, quando) {
  return alvo.flatMap((l) => [
    db.prepare('INSERT INTO reservas (pedido_id, produto_id, qtd) VALUES (?, ?, ?)').bind(pedidoId, l.id, l.qtd),
    db.prepare("INSERT INTO estoque_movimentos (produto_id, pedido_id, tipo, qtd, origem, criado_em) VALUES (?, ?, 'reserva', ?, 'cliente', ?)").bind(l.id, pedidoId, l.qtd, quando)
  ]);
}

const ATIVA = "SELECT 1 FROM reservas r WHERE r.pedido_id = ?1 AND r.produto_id = estoque.produto_id AND r.estado = 'ativa'";
// Libera as reservas ativas do pedido (idempotente)
export function liberar(db, pedidoId, origem) {
  const q = agora();
  return db.batch([
    db.prepare("INSERT INTO estoque_movimentos (produto_id, pedido_id, tipo, qtd, origem, criado_em) SELECT produto_id, pedido_id, 'liberacao', qtd, ?2, ?3 FROM reservas WHERE pedido_id = ?1 AND estado = 'ativa'").bind(pedidoId, origem, q),
    db.prepare("UPDATE estoque SET reservado = reservado - (SELECT r.qtd FROM reservas r WHERE r.pedido_id = ?1 AND r.produto_id = estoque.produto_id AND r.estado = 'ativa'), atualizado_em = ?2 WHERE EXISTS (" + ATIVA + ')').bind(pedidoId, q),
    db.prepare("UPDATE reservas SET estado = 'liberada' WHERE pedido_id = ?1 AND estado = 'ativa'").bind(pedidoId)
  ]);
}

// Reserva de novo (nova tentativa depois de a reserva ter vencido). Sem estoque = 409.
export async function renovar(db, pedidoId) {
  const r = await db.prepare(
    "SELECT i.produto_id AS id, i.qtd FROM itens_pedido i JOIN estoque e ON e.produto_id = i.produto_id " +
    "LEFT JOIN reservas r ON r.pedido_id = i.pedido_id AND r.produto_id = i.produto_id AND r.estado = 'ativa' WHERE i.pedido_id = ? AND r.pedido_id IS NULL"
  ).bind(pedidoId).all();
  const faltam = r.results || [];
  if (faltam.length) {
    const alvo = await reservar(db, faltam);
    const q = agora();
    await db.batch(alvo.flatMap((l) => [
      db.prepare("INSERT INTO reservas (pedido_id, produto_id, qtd, estado) VALUES (?, ?, ?, 'ativa') ON CONFLICT (pedido_id, produto_id) DO UPDATE SET estado = 'ativa', qtd = excluded.qtd").bind(pedidoId, l.id, l.qtd),
      db.prepare("INSERT INTO estoque_movimentos (produto_id, pedido_id, tipo, qtd, origem, criado_em) VALUES (?, ?, 'reserva', ?, 'cliente', ?)").bind(l.id, pedidoId, l.qtd, q)
    ]));
  }
  await db.prepare('UPDATE pedidos SET reserva_ate = ? WHERE id = ?').bind(reservaAte(), pedidoId).run();
}

// Baixa do estoque quando o pagamento é confirmado: uma vez só por pedido (estoque_baixado_em)
export function baixar(db, pedidoId) {
  const q = agora();
  const pode = "EXISTS (SELECT 1 FROM pedidos p WHERE p.id = ?1 AND p.status = 'pago' AND p.estoque_baixado_em IS NULL)";
  return db.batch([
    db.prepare("INSERT INTO estoque_movimentos (produto_id, pedido_id, tipo, qtd, origem, criado_em) SELECT i.produto_id, i.pedido_id, 'baixa', i.qtd, 'sistema', ?2 FROM itens_pedido i JOIN estoque e ON e.produto_id = i.produto_id WHERE i.pedido_id = ?1 AND " + pode).bind(pedidoId, q),
    db.prepare("UPDATE estoque SET quantidade = quantidade - (SELECT i.qtd FROM itens_pedido i WHERE i.pedido_id = ?1 AND i.produto_id = estoque.produto_id), " +
      "reservado = reservado - COALESCE((SELECT r.qtd FROM reservas r WHERE r.pedido_id = ?1 AND r.produto_id = estoque.produto_id AND r.estado = 'ativa'), 0), atualizado_em = ?2 " +
      'WHERE produto_id IN (SELECT produto_id FROM itens_pedido WHERE pedido_id = ?1) AND ' + pode).bind(pedidoId, q),
    db.prepare("UPDATE reservas SET estado = 'baixada' WHERE pedido_id = ?1 AND estado = 'ativa' AND " + pode).bind(pedidoId),
    db.prepare("UPDATE pedidos SET estoque_baixado_em = ?2 WHERE id = ?1 AND status = 'pago' AND estoque_baixado_em IS NULL").bind(pedidoId, q)
  ]);
}

// Devolução ao estoque (reembolso com produto de volta à loja), uma vez por pedido
export function devolver(db, pedidoId, origem) {
  const q = agora();
  const pode = "EXISTS (SELECT 1 FROM pedidos p WHERE p.id = ?1 AND p.estoque_baixado_em IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM estoque_movimentos m WHERE m.pedido_id = ?1 AND m.tipo = 'devolucao')";
  return db.batch([
    db.prepare("UPDATE estoque SET quantidade = quantidade + (SELECT i.qtd FROM itens_pedido i WHERE i.pedido_id = ?1 AND i.produto_id = estoque.produto_id), atualizado_em = ?3 " +
      'WHERE produto_id IN (SELECT produto_id FROM itens_pedido WHERE pedido_id = ?1) AND ' + pode).bind(pedidoId, origem, q),
    db.prepare("INSERT INTO estoque_movimentos (produto_id, pedido_id, tipo, qtd, origem, criado_em) SELECT i.produto_id, i.pedido_id, 'devolucao', i.qtd, ?2, ?3 FROM itens_pedido i JOIN estoque e ON e.produto_id = i.produto_id WHERE i.pedido_id = ?1 AND " + pode).bind(pedidoId, origem, q)
  ]);
}

// Reservas vencidas de pedidos não pagos voltam ao estoque (rodado pelo agendador e antes de novas reservas)
export async function liberarVencidas(db) {
  const r = await db.prepare("SELECT DISTINCT p.id FROM pedidos p JOIN reservas r ON r.pedido_id = p.id AND r.estado = 'ativa' WHERE p.status <> 'pago' AND p.reserva_ate < ?").bind(agora()).all();
  for (const x of r.results || []) await liberar(db, x.id, 'sistema');
  return (r.results || []).length;
}
