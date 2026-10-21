/* Acesso ao banco D1. Todas as consultas usam parâmetros (bind), nunca texto concatenado. */

export function pedido(db, id) {
  return db.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
}
export function pedidoPorChave(db, chave) {
  return db.prepare('SELECT * FROM pedidos WHERE chave_idem = ?').bind(chave).first();
}
export function pedidoPorNumero(db, numero) {
  return db.prepare('SELECT * FROM pedidos WHERE numero = ?').bind(numero).first();
}
export async function itens(db, pedidoId) {
  const r = await db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY rowid').bind(pedidoId).all();
  return r.results || [];
}

// Pedido e itens entram juntos (batch do D1 é uma transação)
export function inserirPedido(db, p, linhas) {
  const ins = db.prepare(
    'INSERT INTO pedidos (id, numero, chave_idem, hash_conteudo, ambiente, status, total_centavos, entrega, ' +
    'cliente_nome, cliente_telefone, cliente_email, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(p.id, p.numero, p.chave_idem, p.hash_conteudo, p.ambiente, p.status, p.total_centavos, p.entrega,
    p.cliente_nome, p.cliente_telefone, p.cliente_email, p.criado_em, p.atualizado_em);
  const insItem = db.prepare(
    'INSERT INTO itens_pedido (pedido_id, produto_id, nome, emb, un, qtd, unit_centavos, total_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  return db.batch([ins].concat(linhas.map((l) =>
    insItem.bind(p.id, l.id, l.nome, l.emb, l.un, l.qtd, l.unitCentavos, l.totalCentavos))));
}

// Reserva o número da próxima tentativa: só uma requisição ganha a corrida
export async function reservarTentativa(db, id, atual, quando) {
  const r = await db.prepare('UPDATE pedidos SET tentativas = ?, atualizado_em = ? WHERE id = ? AND tentativas = ?')
    .bind(atual + 1, quando, id, atual).run();
  return r.meta.changes === 1;
}
export function liberarTentativa(db, id, reservada) {
  return db.prepare('UPDATE pedidos SET tentativas = ? WHERE id = ? AND tentativas = ?').bind(reservada - 1, id, reservada).run();
}

export async function ultimaTentativaGravada(db, pedidoId) {
  const r = await db.prepare('SELECT MAX(tentativa) AS n FROM transacoes WHERE pedido_id = ?').bind(pedidoId).first();
  return (r && r.n) || 0;
}
export function transacao(db, mpOrderId) {
  return db.prepare('SELECT * FROM transacoes WHERE mp_order_id = ?').bind(mpOrderId).first();
}
export function inserirTransacao(db, t) {
  return db.prepare(
    'INSERT OR IGNORE INTO transacoes (mp_order_id, pedido_id, tentativa, status, status_detail, total_pago_centavos, checkout_url, criado_em, atualizado_em) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(t.mp_order_id, t.pedido_id, t.tentativa, t.status, t.status_detail, t.total_pago_centavos, t.checkout_url, t.criado_em, t.atualizado_em).run();
}
export function definirTransacaoAtual(db, pedidoId, mpOrderId, quando) {
  return db.prepare("UPDATE pedidos SET mp_order_id = ?, status = 'aguardando', atualizado_em = ? WHERE id = ? AND status NOT IN ('pago', 'divergente', 'reembolsado')")
    .bind(mpOrderId, quando, pedidoId).run();
}
export function atualizarTransacao(db, t) {
  return db.prepare('UPDATE transacoes SET status = ?, status_detail = ?, total_pago_centavos = ?, atualizado_em = ? WHERE mp_order_id = ?')
    .bind(t.status, t.status_detail, t.total_pago_centavos, t.atualizado_em, t.mp_order_id);
}
export function gravarPagamento(db, p) {
  return db.prepare(
    'INSERT INTO pagamentos (mp_payment_id, mp_order_id, pedido_id, status, status_detail, valor_centavos, metodo, tipo, atualizado_em) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (mp_payment_id) DO UPDATE SET status = excluded.status, ' +
    'status_detail = excluded.status_detail, valor_centavos = excluded.valor_centavos, metodo = excluded.metodo, tipo = excluded.tipo, atualizado_em = excluded.atualizado_em'
  ).bind(p.mp_payment_id, p.mp_order_id, p.pedido_id, p.status, p.status_detail, p.valor_centavos, p.metodo, p.tipo, p.atualizado_em);
}
export async function pagamentoAprovado(db, pedidoId, mpOrderId) {
  return db.prepare("SELECT * FROM pagamentos WHERE pedido_id = ? AND mp_order_id = ? AND status IN ('approved', 'processed') ORDER BY atualizado_em DESC")
    .bind(pedidoId, mpOrderId).first();
}

// Troca de status condicionada ao status anterior: duas atualizações ao mesmo tempo não se atropelam
export async function mudarStatus(db, id, de, para, extra, quando) {
  const r = await db.prepare(
    'UPDATE pedidos SET status = ?, mp_order_id = COALESCE(?, mp_order_id), codigo = COALESCE(?, codigo), pago_em = COALESCE(?, pago_em), ' +
    'atualizado_em = ? WHERE id = ? AND status = ?'
  ).bind(para, extra.mp_order_id || null, extra.codigo || null, extra.pago_em || null, quando, id, de).run();
  return r.meta.changes === 1;
}
export function marcarConsulta(db, id, quando) {
  return db.prepare('UPDATE pedidos SET consultado_em = ? WHERE id = ?').bind(quando, id).run();
}

export function evento(db, chave) {
  return db.prepare('SELECT * FROM eventos_webhook WHERE chave = ?').bind(chave).first();
}
export function registrarEvento(db, e) {
  return db.prepare('INSERT OR IGNORE INTO eventos_webhook (chave, mp_order_id, acao, recebido_em) VALUES (?, ?, ?, ?)')
    .bind(e.chave, e.mp_order_id, e.acao, e.recebido_em).run();
}
export function concluirEvento(db, chave, resultado) {
  return db.prepare('UPDATE eventos_webhook SET processado = 1, resultado = ? WHERE chave = ?').bind(resultado, chave).run();
}
