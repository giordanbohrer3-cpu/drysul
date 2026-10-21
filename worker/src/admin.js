/* Painel da loja (/admin e /api/admin/*).
   Acesso: Cloudflare Access na frente (login com verificação em duas etapas) + o Worker confere o token do Access
   (JWT RS256: assinatura, audiência, emissor e validade) e o papel do e-mail em ADMIN_EMAILS ("email:dono,email:atendente").
   dono: tudo. atendente: consultar e atualizar a retirada. Cada ação fica registrada em auditoria_admin. */
import * as db from './db.js';
import * as mp from './mercadopago.js';
import * as estoque from './estoque.js';
import { sincronizar, aposMudanca, ID_PEDIDO } from './pedidos.js';
import { produtoExiste } from './catalogo.js';
import { ErroHttp, json, lerJson, agora, uuidDe } from './util.js';
import { ErroProvedor } from './mercadopago.js';

const PERMISSOES = { dono: ['ler', 'entrega', 'cancelar', 'reembolsar', 'estoque', 'titulares'], atendente: ['ler', 'entrega'] };
const ENTREGA = { // retirada na loja: de → para permitidos
  aguardando_pagamento: ['cancelado'], em_preparacao: ['pronto_retirada', 'cancelado'],
  pronto_retirada: ['retirado', 'em_preparacao', 'cancelado'], retirado: [], cancelado: []
};

/* ---------- JWT do Cloudflare Access ---------- */
let chaves = { em: 0, lista: null, de: '' };
function b64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0)); }
async function chavesAccess(equipe, forcar) {
  if (!forcar && chaves.lista && chaves.de === equipe && Date.now() - chaves.em < 600000) return chaves.lista;
  const r = await fetch('https://' + equipe + '/cdn-cgi/access/certs');
  if (!r.ok) throw new ErroHttp(503, 'acesso_indisponivel', 'Login indisponível.');
  chaves = { em: Date.now(), lista: (await r.json()).keys || [], de: equipe };
  return chaves.lista;
}
export async function verificarJwt(token, equipe, aud) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  let cab, dados;
  try { cab = JSON.parse(new TextDecoder().decode(b64url(partes[0]))); dados = JSON.parse(new TextDecoder().decode(b64url(partes[1]))); } catch (e) { return null; }
  if (cab.alg !== 'RS256') return null;
  // chave nova (rotação do Access): busca a lista de novo antes de recusar
  const jwk = (await chavesAccess(equipe)).find((k) => k.kid === cab.kid) || (await chavesAccess(equipe, true)).find((k) => k.kid === cab.kid);
  if (!jwk) return null;
  const k = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, b64url(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  const t = Date.now() / 1000, auds = [].concat(dados.aud || []);
  if (!ok || dados.iss !== 'https://' + equipe || auds.indexOf(aud) === -1 || !(dados.exp > t) || (dados.nbf && dados.nbf > t + 60)) return null;
  return dados;
}
function papeis(env) {
  const m = {};
  String(env.ADMIN_EMAILS || '').split(',').forEach((x) => { const [e, p] = x.trim().split(':'); if (e && PERMISSOES[p]) m[e.toLowerCase()] = p; });
  return m;
}
export async function autenticar(request, env, cfg) {
  let email = null;
  // só no computador: e-mail fixo para testar o painel sem o Access
  if (cfg.ambiente === 'local' && env.ADMIN_DEV_EMAIL) email = env.ADMIN_DEV_EMAIL;
  else {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new ErroHttp(503, 'painel_desligado', 'Painel não configurado (Cloudflare Access).');
    const d = await verificarJwt(request.headers.get('cf-access-jwt-assertion'), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (!d || !d.email) throw new ErroHttp(401, 'nao_autenticado', 'Entre pelo login da loja.');
    email = d.email;
  }
  email = String(email).toLowerCase();
  const papel = papeis(env)[email];
  if (!papel) throw new ErroHttp(403, 'sem_permissao', 'Este e-mail não tem acesso ao painel.');
  return { email, papel, pode: (acao) => PERMISSOES[papel].indexOf(acao) !== -1 };
}
function exigir(u, acao) { if (!u.pode(acao)) throw new ErroHttp(403, 'sem_permissao', 'Seu papel não permite esta ação.'); }
function auditar(env, u, acao, alvo, detalhe) {
  return env.DB.prepare('INSERT INTO auditoria_admin (email, acao, alvo, detalhe, criado_em) VALUES (?, ?, ?, ?, ?)')
    .bind(u.email, acao, alvo || null, detalhe ? JSON.stringify(detalhe).slice(0, 500) : null, agora()).run();
}
async function pedidoOu404(env, id) {
  if (!ID_PEDIDO.test(id)) throw new ErroHttp(404, 'pedido_nao_encontrado', 'Pedido não encontrado.');
  const p = await db.pedido(env.DB, id);
  if (!p) throw new ErroHttp(404, 'pedido_nao_encontrado', 'Pedido não encontrado.');
  return p;
}
const todos = async (env, sql, ...v) => (await env.DB.prepare(sql).bind(...v).all()).results || [];

/* ---------- rotas ---------- */
export async function rotear(request, env, cfg, url) {
  const u = await autenticar(request, env, cfg);
  const c = url.pathname.replace(/^\/api\/admin/, '');
  const m = /^\/pedidos\/([0-9a-f-]{36})(\/(entrega|cancelar|reembolsar))?$/.exec(c);
  const POST = request.method === 'POST';
  if (POST && request.headers.get('origin') && request.headers.get('origin') !== url.origin) throw new ErroHttp(403, 'origem_invalida', 'Origem não permitida.');

  if (c === '/eu' && !POST) return json({ email: u.email, papel: u.papel });
  if (c === '/resumo' && !POST) { exigir(u, 'ler'); return resumo(env); }
  if (c === '/pedidos' && !POST) {
    exigir(u, 'ler');
    const st = url.searchParams.get('status'), en = url.searchParams.get('entrega');
    const lista = await todos(env, 'SELECT id, numero, status, status_entrega, total_centavos, cliente_nome, cliente_telefone, pago_em, criado_em FROM pedidos ' +
      'WHERE (?1 IS NULL OR status = ?1) AND (?2 IS NULL OR status_entrega = ?2) ORDER BY criado_em DESC LIMIT 200', st || null, en || null);
    return json({ pedidos: lista });
  }
  if (m && !m[2] && !POST) {
    exigir(u, 'ler');
    const p = await pedidoOu404(env, m[1]);
    return json({
      pedido: p,
      itens: await todos(env, 'SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY rowid', p.id),
      transacoes: await todos(env, 'SELECT * FROM transacoes WHERE pedido_id = ? ORDER BY criado_em', p.id),
      pagamentos: await todos(env, 'SELECT * FROM pagamentos WHERE pedido_id = ?', p.id),
      eventos: await todos(env, 'SELECT * FROM pedido_eventos WHERE pedido_id = ? ORDER BY id', p.id)
    });
  }
  if (m && m[3] === 'entrega' && POST) {
    exigir(u, 'entrega');
    const p = await pedidoOu404(env, m[1]), para = String((await lerJson(request)).status || '');
    if ((ENTREGA[p.status_entrega] || []).indexOf(para) === -1) throw new ErroHttp(409, 'transicao_invalida', 'Mudança de retirada não permitida.', { de: p.status_entrega });
    if (para === 'cancelado' && p.status === 'pago') throw new ErroHttp(409, 'reembolse_antes', 'Pedido pago: faça o reembolso para cancelar.');
    const r = await env.DB.prepare('UPDATE pedidos SET status_entrega = ?, atualizado_em = ? WHERE id = ? AND status_entrega = ?').bind(para, agora(), p.id, p.status_entrega).run();
    if (!r.meta.changes) throw new ErroHttp(409, 'tente_novamente', 'O pedido mudou. Atualize a tela.');
    await db.registrarEventoPedido(env.DB, p.id, 'entrega', p.status_entrega, para, 'admin:' + u.email).run();
    await auditar(env, u, 'entrega', p.numero, { de: p.status_entrega, para });
    return json({ ok: true, statusEntrega: para });
  }
  if (m && m[3] === 'cancelar' && POST) {
    exigir(u, 'cancelar');
    const p = await pedidoOu404(env, m[1]);
    if (p.status === 'pago' || p.status === 'divergente' || p.status === 'reembolsado') throw new ErroHttp(409, 'reembolse_antes', 'Pedido pago: use o reembolso.');
    if (p.status === 'cancelado') return json({ ok: true, status: 'cancelado' });
    if (p.mp_order_id) {
      try { await mp.cancelarOrder(cfg, p.mp_order_id); } catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        // cancelar falhou no provedor: confere se não foi pago nesse meio tempo
        const st = await sincronizar(env, cfg, await mp.obterOrder(cfg, p.mp_order_id), 'admin:' + u.email);
        if (st === 'pago') throw new ErroHttp(409, 'ja_pago', 'O pagamento acabou de ser confirmado: use o reembolso.');
      }
    }
    if (!(await db.mudarStatus(env.DB, p.id, p.status, 'cancelado', {}, agora()))) throw new ErroHttp(409, 'tente_novamente', 'O pedido mudou. Atualize a tela.');
    await aposMudanca(env, p.id, p.status, 'cancelado', 'admin:' + u.email, 'cancelado no painel');
    await auditar(env, u, 'cancelar', p.numero);
    return json({ ok: true, status: 'cancelado' });
  }
  if (m && m[3] === 'reembolsar' && POST) {
    exigir(u, 'reembolsar');
    const p = await pedidoOu404(env, m[1]), corpo = await lerJson(request);
    if (p.status !== 'pago' && p.status !== 'divergente') throw new ErroHttp(409, 'nao_pago', 'Só pedidos pagos podem ser reembolsados.');
    try { await mp.reembolsarOrder(cfg, p.mp_order_id, await uuidDe('drysul:reembolso:' + p.id)); } catch (e) {
      if (e instanceof ErroProvedor) throw new ErroHttp(502, 'provedor_indisponivel', 'O Mercado Pago não confirmou o reembolso. Tente de novo (não duplica).');
      throw e;
    }
    // o status vem da order relida no provedor, como em qualquer pagamento
    const st = await sincronizar(env, cfg, await mp.obterOrder(cfg, p.mp_order_id), 'admin:' + u.email);
    if (st === 'reembolsado' && corpo.reporEstoque === true) await estoque.devolver(env.DB, p.id, 'admin:' + u.email);
    await auditar(env, u, 'reembolsar', p.numero, { status: st, reporEstoque: corpo.reporEstoque === true });
    return json({ ok: true, status: st });
  }
  if (c === '/estoque' && !POST) {
    exigir(u, 'ler');
    return json({ estoque: await todos(env, 'SELECT * FROM estoque ORDER BY produto_id'),
      movimentos: await todos(env, 'SELECT * FROM estoque_movimentos ORDER BY id DESC LIMIT 100') });
  }
  if (c === '/estoque' && POST) {
    exigir(u, 'estoque');
    const corpo = await lerJson(request), id = String(corpo.produto || ''), q = corpo.quantidade;
    if (!produtoExiste(id)) throw new ErroHttp(422, 'produto_invalido', 'Produto não encontrado no catálogo.');
    const atual = await env.DB.prepare('SELECT * FROM estoque WHERE produto_id = ?').bind(id).first();
    if (q === null) { // deixa de controlar (só sem reservas ativas)
      if (atual && atual.reservado > 0) throw new ErroHttp(409, 'reservado', 'Há reservas ativas deste produto.');
      await env.DB.prepare('DELETE FROM estoque WHERE produto_id = ? AND reservado = 0').bind(id).run();
    } else {
      if (!Number.isInteger(q) || q < 0 || q > 1000000) throw new ErroHttp(422, 'quantidade_invalida', 'Quantidade inválida.');
      await env.DB.batch([
        env.DB.prepare('INSERT INTO estoque (produto_id, quantidade, atualizado_em) VALUES (?1, ?2, ?3) ON CONFLICT (produto_id) DO UPDATE SET quantidade = ?2, atualizado_em = ?3').bind(id, q, agora()),
        env.DB.prepare("INSERT INTO estoque_movimentos (produto_id, tipo, qtd, origem, criado_em) VALUES (?, 'ajuste', ?, ?, ?)").bind(id, q - (atual ? atual.quantidade : 0), 'admin:' + u.email, agora())
      ]);
    }
    await auditar(env, u, 'estoque', id, { de: atual ? atual.quantidade : null, para: q });
    return json({ ok: true });
  }
  if (c === '/titulares' && POST) return titulares(request, env, u);
  if (c === '/auditoria' && !POST) { exigir(u, 'titulares'); return json({ auditoria: await todos(env, 'SELECT * FROM auditoria_admin ORDER BY id DESC LIMIT 200') }); }
  throw new ErroHttp(404, 'nao_encontrado', 'Rota não encontrada.');
}

async function resumo(env) {
  const um = (sql, ...v) => env.DB.prepare(sql).bind(...v).first();
  const desde = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
  const vendas = async (d) => (await um("SELECT COUNT(*) AS n, COALESCE(SUM(total_centavos), 0) AS c FROM pedidos WHERE status = 'pago' AND pago_em >= ?", desde(d)));
  return json({
    // números vindos só do banco: nada estimado
    porStatus: await todos(env, 'SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status'),
    porRetirada: await todos(env, "SELECT status_entrega, COUNT(*) AS n FROM pedidos WHERE status = 'pago' GROUP BY status_entrega"),
    vendas: { hoje: await vendas(1), semana: await vendas(7), mes: await vendas(30) },
    estoqueBaixo: await todos(env, 'SELECT produto_id, quantidade, reservado FROM estoque WHERE quantidade - reservado <= 2 ORDER BY quantidade - reservado')
  });
}

/* ---------- LGPD: acesso e eliminação a pedido do titular ---------- */
async function titulares(request, env, u) {
  exigir(u, 'titulares');
  const corpo = await lerJson(request);
  const tel = String(corpo.telefone || '').replace(/\D/g, '').slice(-11), email = String(corpo.email || '').trim().toLowerCase();
  if (!tel && !email) throw new ErroHttp(422, 'dados_invalidos', 'Informe o telefone ou o e-mail do titular.');
  const onde = '(?1 <> \'\' AND substr(cliente_telefone, -11) = ?1) OR (?2 <> \'\' AND lower(cliente_email) = ?2)';
  const pedidos = await todos(env, 'SELECT id, numero, status, status_entrega, cliente_nome, cliente_telefone, cliente_email, total_centavos, criado_em, pago_em FROM pedidos WHERE ' + onde, tel, email);
  if (corpo.acao === 'consultar') { await auditar(env, u, 'titular_consulta', null, { pedidos: pedidos.length }); return json({ pedidos }); }
  if (corpo.acao !== 'anonimizar') throw new ErroHttp(422, 'acao_invalida', 'Ação: consultar ou anonimizar.');
  // Pedidos pagos/reembolsados ficam (obrigação fiscal e defesa em processo: LGPD art. 16); o resto perde os dados pessoais
  const apagar = pedidos.filter((p) => ['pago', 'reembolsado', 'divergente'].indexOf(p.status) === -1);
  const q = agora();
  for (const p of apagar) {
    await env.DB.batch([
      env.DB.prepare("UPDATE pedidos SET cliente_nome = 'Titular anonimizado', cliente_telefone = '', cliente_email = NULL, anonimizado_em = ? WHERE id = ?").bind(q, p.id),
      db.registrarEventoPedido(env.DB, p.id, 'anonimizado', null, null, 'admin:' + u.email, 'pedido do titular')
    ]);
  }
  await auditar(env, u, 'titular_anonimizar', null, { anonimizados: apagar.length, retidos: pedidos.length - apagar.length });
  return json({ anonimizados: apagar.length, retidos: pedidos.length - apagar.length, motivoRetencao: 'pedidos pagos: obrigação legal/fiscal (LGPD art. 16, I)' });
}

/* ---------- agendador (cron): reservas vencidas, limites antigos e retenção ---------- */
export async function rotinas(env) {
  const liberadas = await estoque.liberarVencidas(env.DB);
  await db.limparLimites(env.DB);
  let anonimizados = 0;
  const dias = Number(env.RETENCAO_DIAS_NAO_PAGOS); // prazo definido pela loja; sem valor, nada é apagado
  if (dias > 0) {
    const r = await env.DB.prepare("UPDATE pedidos SET cliente_nome = 'Titular anonimizado', cliente_telefone = '', cliente_email = NULL, anonimizado_em = ?1 " +
      "WHERE anonimizado_em IS NULL AND status NOT IN ('pago', 'reembolsado', 'divergente') AND criado_em < ?2").bind(agora(), new Date(Date.now() - dias * 864e5).toISOString()).run();
    anonimizados = r.meta.changes;
  }
  return { liberadas, anonimizados };
}
