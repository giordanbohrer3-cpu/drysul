// Operação da loja (worker/): estoque com reserva, limite de requisições, aceite dos termos, painel (login, papéis,
// cancelamento, reembolso), LGPD (titulares e retenção) e falhas no meio da criação do pedido.
// node --test tests/operacao.test.mjs   (Node 22+)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { criarD1 } from './apoio/d1-falso.mjs';
import { criarMp } from './apoio/mp-falso.mjs';
import worker, { rotear } from '../worker/src/index.js';
import { rotinas } from '../worker/src/admin.js';

const SITE = 'https://drysul-teste.exemplo.workers.dev', SEGREDO = 'segredo-webhook', CHAVE = 'k'.repeat(64);
const EQUIPE = 'drysul.cloudflareaccess.com', AUD = 'aud-painel-teste';
const fetchOriginal = globalThis.fetch;
let env, mp, chavesJwt, kid;

beforeEach(async () => {
  mp = criarMp();
  chavesJwt = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  kid = 'k' + Math.random().toString(36).slice(2);
  const jwk = Object.assign(await webcrypto.subtle.exportKey('jwk', chavesJwt.publicKey), { kid, alg: 'RS256' });
  globalThis.fetch = async (u, o) => String(u) === 'https://' + EQUIPE + '/cdn-cgi/access/certs'
    ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }) : mp.fetch(u, o);
  env = { AMBIENTE: 'teste', PAGAMENTOS_ATIVOS: 'true', MP_ACCESS_TOKEN: mp.TOKEN, MP_WEBHOOK_SECRET: SEGREDO, CHAVE_PEDIDOS: CHAVE,
    ACCESS_TEAM_DOMAIN: EQUIPE, ACCESS_AUD: AUD, ADMIN_EMAILS: 'dona@drysul.exemplo:dono,balcao@drysul.exemplo:atendente',
    DB: criarD1(new URL('../worker/migrations/', import.meta.url)) };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function jwt(email, extra = {}) {
  const t = Math.floor(Date.now() / 1000);
  const corpo = b64({ alg: 'RS256', kid }) + '.' + b64(Object.assign({ email, aud: [AUD], iss: 'https://' + EQUIPE, iat: t, exp: t + 600 }, extra));
  const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', chavesJwt.privateKey, new TextEncoder().encode(corpo));
  return corpo + '.' + Buffer.from(sig).toString('base64url');
}
async function api(metodo, caminho, { corpo, token, cab = {}, ip = '10.0.0.1' } = {}) {
  const h = Object.assign({ origin: SITE, 'cf-connecting-ip': ip }, cab);
  if (corpo !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  const r = await rotear(new Request(SITE + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env);
  return { status: r.status, dados: await r.json() };
}
const admin = async (metodo, caminho, email, corpo) => api(metodo, '/api/admin' + caminho, { corpo, cab: { 'cf-access-jwt-assertion': await jwt(email) } });
const CLIENTE = { nome: 'Maria Teste', telefone: '(55) 99999-1234', email: 'maria@exemplo.com' };
const corpoPedido = (itens, extra) => Object.assign({ itens, entrega: 'retirada', cliente: CLIENTE, aceiteTermos: '2026-10-21' }, extra);
let seq = 0;
async function pedido(itens, extra, ip) {
  const c = await api('POST', '/api/pedidos', { corpo: corpoPedido(itens, extra), cab: { 'idempotency-key': 'chave-operacao-' + String(seq++).padStart(4, '0') }, ip: ip || '10.9.0.' + seq });
  return c;
}
async function pagar(c) {
  const p = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token, ip: '10.8.0.' + seq });
  return p.dados.checkoutUrl.split('pref_id=')[1];
}
async function notificar(orderId, rid) {
  const ts = String(Date.now()), v1 = createHmac('sha256', SEGREDO).update('id:' + orderId + ';request-id:' + rid + ';ts:' + ts + ';').digest('hex');
  return api('POST', '/api/webhooks/mercadopago?data.id=' + orderId + '&type=order', { corpo: { action: 'order.processed' }, cab: { 'x-request-id': rid, 'x-signature': 'ts=' + ts + ',v1=' + v1 } });
}
const linha = (sql, ...v) => ({ ...env.DB.banco.prepare(sql).get(...v) });
async function definirEstoque(produto, quantidade) {
  const r = await admin('POST', '/estoque', 'dona@drysul.exemplo', { produto, quantidade });
  assert.equal(r.status, 200);
}

/* ---------- aceite e limites ---------- */
test('sem aceite dos termos (versão atual) o pedido não é criado', async () => {
  for (const aceite of [undefined, '2020-01-01']) {
    const r = await pedido([{ id: 'fita', qtd: 1 }], { aceiteTermos: aceite });
    assert.equal(r.status, 422); assert.equal(r.dados.erro, 'termos_nao_aceitos');
  }
  const ok = await pedido([{ id: 'fita', qtd: 1 }]);
  assert.equal(ok.status, 201);
  assert.equal(linha('SELECT termos_versao AS v FROM pedidos').v, '2026-10-21');
  assert.equal(linha("SELECT COUNT(*) AS n FROM pedido_eventos WHERE tipo = 'criado'").n, 1);
});

test('limite de requisições: o 11º pedido do mesmo IP em 10 min recebe 429', async () => {
  const st = [];
  for (let i = 0; i < 11; i++) st.push((await pedido([{ id: 'fita', qtd: 1 }], {}, '10.7.7.7')).status);
  assert.deepEqual(st.slice(0, 10).every((s) => s === 201), true);
  assert.equal(st[10], 429);
  assert.equal((await pedido([{ id: 'fita', qtd: 1 }], {}, '10.7.7.8')).status, 201); // outro IP segue normal
  assert.equal(linha('SELECT COUNT(*) AS n FROM limites WHERE chave LIKE ?', '%10.7.7.7%').n, 0); // IP não é guardado
});

/* ---------- estoque ---------- */
test('estoque insuficiente: 409 e nada é reservado nem gravado', async () => {
  await definirEstoque('fita', 2);
  const r = await pedido([{ id: 'fita', qtd: 3 }, { id: 'massa', qtd: 1 }]);
  assert.equal(r.status, 409); assert.equal(r.dados.erro, 'estoque_insuficiente'); assert.deepEqual(r.dados.produtos, ['fita']);
  assert.equal(linha("SELECT reservado FROM estoque WHERE produto_id = 'fita'").reservado, 0);
  assert.equal(linha('SELECT COUNT(*) AS n FROM pedidos').n, 0);
});

test('duas compras simultâneas da última unidade: só uma reserva passa', async () => {
  await definirEstoque('massa', 1);
  const [a, b] = await Promise.all([pedido([{ id: 'massa', qtd: 1 }]), pedido([{ id: 'massa', qtd: 1 }])]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.deepEqual(linha("SELECT quantidade, reservado FROM estoque WHERE produto_id = 'massa'"), { quantidade: 1, reservado: 1 });
});

test('pago: baixa o estoque uma vez só, mesmo com aviso repetido; retirada passa a "em preparação"', async () => {
  await definirEstoque('fita', 5);
  const c = await pedido([{ id: 'fita', qtd: 2 }]);
  const order = await pagar(c);
  mp.definir(order, 'aprovado');
  await notificar(order, 'r1'); await notificar(order, 'r2'); await notificar(order, 'r1');
  assert.deepEqual(linha("SELECT quantidade, reservado FROM estoque WHERE produto_id = 'fita'"), { quantidade: 3, reservado: 0 });
  assert.equal(linha("SELECT COUNT(*) AS n FROM estoque_movimentos WHERE tipo = 'baixa'").n, 1);
  assert.equal(linha('SELECT status_entrega AS s FROM pedidos').s, 'em_preparacao');
});

test('Pix expirado: reserva volta ao estoque; reserva vencida é liberada pelo agendador', async () => {
  await definirEstoque('fita', 2);
  const c = await pedido([{ id: 'fita', qtd: 2 }]);
  const order = await pagar(c);
  mp.orders.get(order).status = 'expired';
  assert.equal((await notificar(order, 'exp')).dados.resultado, 'expirado');
  assert.equal(linha("SELECT reservado FROM estoque WHERE produto_id = 'fita'").reservado, 0);
  // outro pedido que ninguém pagou: a reserva vence e o agendador devolve
  const d = await pedido([{ id: 'fita', qtd: 1 }]);
  env.DB.banco.prepare('UPDATE pedidos SET reserva_ate = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', d.dados.pedido.id);
  const ev = []; await worker.scheduled({}, env, { waitUntil: (p) => ev.push(p) }); await Promise.all(ev);
  assert.equal(linha("SELECT reservado FROM estoque WHERE produto_id = 'fita'").reservado, 0);
});

test('falha no meio da criação do pedido: a reserva é desfeita', async () => {
  await definirEstoque('fita', 3);
  const original = env.DB.batch;
  env.DB.batch = async (lista) => { if (lista.length > 3) throw new Error('D1 indisponível'); return original(lista); };
  const r = await pedido([{ id: 'fita', qtd: 2 }]);
  env.DB.batch = original;
  assert.equal(r.status, 500); assert.equal(r.dados.erro, 'erro_interno'); assert.equal(JSON.stringify(r.dados).includes('D1'), false);
  assert.equal(linha("SELECT reservado FROM estoque WHERE produto_id = 'fita'").reservado, 0);
  assert.equal(linha('SELECT COUNT(*) AS n FROM pedidos').n, 0);
});

test('frete/entrega indisponível online: vai para orçamento no WhatsApp, sem cobrança', async () => {
  const r = await pedido([{ id: 'fita', qtd: 1 }], { entrega: 'entrega' });
  assert.equal(r.status, 422); assert.equal(r.dados.erro, 'atendimento_whatsapp'); assert.equal(mp.chamadas.length, 0);
});

/* ---------- painel: login e papéis ---------- */
test('painel: sem login, token falso, expirado ou de outra aplicação → bloqueado; e-mail sem papel → 403', async () => {
  assert.equal((await api('GET', '/api/admin/pedidos')).status, 401);
  for (const extra of [{ exp: 1 }, { aud: ['outra'] }, { iss: 'https://outra.cloudflareaccess.com' }]) {
    assert.equal((await api('GET', '/api/admin/pedidos', { cab: { 'cf-access-jwt-assertion': await jwt('dona@drysul.exemplo', extra) } })).status, 401);
  }
  const falso = (await jwt('dona@drysul.exemplo')).replace(/\.[^.]+$/, '.' + Buffer.from('x'.repeat(256)).toString('base64url'));
  assert.equal((await api('GET', '/api/admin/pedidos', { cab: { 'cf-access-jwt-assertion': falso } })).status, 401);
  assert.equal((await admin('GET', '/pedidos', 'estranho@exemplo.com')).status, 403);
  assert.equal((await admin('GET', '/pedidos', 'dona@drysul.exemplo')).status, 200);
  const pg = await worker.fetch(new Request(SITE + '/admin/'), Object.assign({}, env, { ASSETS: { fetch: () => new Response('painel') } }));
  assert.equal(pg.status, 401); // nem o HTML do painel sai sem login
});

test('papéis: atendente consulta e muda a retirada, mas não cancela, reembolsa nem mexe no estoque', async () => {
  const c = await pedido([{ id: 'fita', qtd: 1 }]);
  const order = await pagar(c); mp.definir(order, 'aprovado'); await notificar(order, 'pg');
  const id = c.dados.pedido.id;
  assert.equal((await admin('POST', '/pedidos/' + id + '/entrega', 'balcao@drysul.exemplo', { status: 'pronto_retirada' })).status, 200);
  assert.equal((await admin('POST', '/pedidos/' + id + '/entrega', 'balcao@drysul.exemplo', { status: 'aguardando_pagamento' })).status, 409);
  assert.equal((await admin('POST', '/pedidos/' + id + '/reembolsar', 'balcao@drysul.exemplo', {})).status, 403);
  assert.equal((await admin('POST', '/estoque', 'balcao@drysul.exemplo', { produto: 'fita', quantidade: 9 })).status, 403);
  const d = await admin('GET', '/pedidos/' + id, 'balcao@drysul.exemplo');
  assert.deepEqual(d.dados.eventos.map((e) => e.para), ['aguardando', 'aguardando', 'pago', 'em_preparacao', 'pronto_retirada']);
  assert.equal(linha("SELECT COUNT(*) AS n FROM auditoria_admin WHERE acao = 'entrega'").n, 1);
});

/* ---------- cancelamento e reembolso ---------- */
test('cancelar pedido não pago: cancela no Mercado Pago, libera estoque; pago não cancela sem reembolso', async () => {
  await definirEstoque('fita', 1);
  const c = await pedido([{ id: 'fita', qtd: 1 }]);
  const order = await pagar(c);
  const r = await admin('POST', '/pedidos/' + c.dados.pedido.id + '/cancelar', 'dona@drysul.exemplo');
  assert.equal(r.status, 200);
  assert.equal(mp.orders.get(order).status, 'cancelled');
  assert.equal(linha("SELECT reservado FROM estoque WHERE produto_id = 'fita'").reservado, 0);
  const d = await pedido([{ id: 'massa', qtd: 1 }]);
  const o2 = await pagar(d); mp.definir(o2, 'aprovado'); await notificar(o2, 'p2');
  assert.equal((await admin('POST', '/pedidos/' + d.dados.pedido.id + '/cancelar', 'dona@drysul.exemplo')).status, 409);
});

test('reembolso: pelo Mercado Pago, com chave fixa (repetir não duplica), status lido do provedor e estoque reposto', async () => {
  await definirEstoque('fita', 4);
  const c = await pedido([{ id: 'fita', qtd: 2 }]);
  const order = await pagar(c); mp.definir(order, 'aprovado'); await notificar(order, 'pg');
  const id = c.dados.pedido.id;
  const a = await admin('POST', '/pedidos/' + id + '/reembolsar', 'dona@drysul.exemplo', { reporEstoque: true });
  assert.equal(a.status, 200); assert.equal(a.dados.status, 'reembolsado');
  await admin('POST', '/pedidos/' + id + '/reembolsar', 'dona@drysul.exemplo', { reporEstoque: true }); // repetição
  assert.equal(mp.reembolsos.size, 1);
  assert.deepEqual(linha("SELECT quantidade, reservado FROM estoque WHERE produto_id = 'fita'"), { quantidade: 4, reservado: 0 });
  assert.equal(linha("SELECT COUNT(*) AS n FROM estoque_movimentos WHERE tipo = 'devolucao'").n, 1);
  assert.equal(linha('SELECT status_entrega AS s FROM pedidos WHERE id = ?', id).s, 'cancelado');
  const comp = await api('GET', '/api/pedidos/' + id + '/comprovante', { token: c.dados.token });
  assert.equal(comp.status, 409); // reembolsado não tem comprovante de pagamento válido
});

/* ---------- LGPD ---------- */
test('titular: consulta e anonimização preservam pedidos pagos (obrigação legal) e ficam auditadas', async () => {
  const pago = await pedido([{ id: 'fita', qtd: 1 }]);
  const o = await pagar(pago); mp.definir(o, 'aprovado'); await notificar(o, 'pg');
  await pedido([{ id: 'massa', qtd: 1 }]);
  const q = await admin('POST', '/titulares', 'dona@drysul.exemplo', { acao: 'consultar', telefone: '55999991234' });
  assert.equal(q.dados.pedidos.length, 2);
  const a = await admin('POST', '/titulares', 'dona@drysul.exemplo', { acao: 'anonimizar', telefone: '(55) 99999-1234' });
  assert.deepEqual([a.dados.anonimizados, a.dados.retidos], [1, 1]);
  assert.equal(linha("SELECT COUNT(*) AS n FROM pedidos WHERE cliente_nome = 'Titular anonimizado' AND cliente_telefone = '' AND cliente_email IS NULL").n, 1);
  assert.equal(linha("SELECT cliente_nome FROM pedidos WHERE status = 'pago'").cliente_nome, 'Maria Teste');
  assert.equal((await admin('POST', '/titulares', 'balcao@drysul.exemplo', { acao: 'consultar', telefone: '55999991234' })).status, 403);
  assert.equal(linha("SELECT COUNT(*) AS n FROM auditoria_admin WHERE acao LIKE 'titular_%'").n, 2);
});

test('retenção: só com prazo definido pela loja; anonimiza não pagos antigos e mantém os pagos', async () => {
  const c = await pedido([{ id: 'fita', qtd: 1 }]);
  env.DB.banco.prepare("UPDATE pedidos SET criado_em = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await rotinas(env)).anonimizados, 0); // sem RETENCAO_DIAS_NAO_PAGOS: nada é apagado
  env.RETENCAO_DIAS_NAO_PAGOS = '90';
  assert.equal((await rotinas(env)).anonimizados, 1);
  assert.equal(linha('SELECT cliente_telefone AS t FROM pedidos WHERE id = ?', c.dados.pedido.id).t, '');
});

test('respostas não expõem detalhes internos nem segredos', async () => {
  const resp = await rotear(new Request(SITE + '/api/pedidos', { method: 'POST', body: '{quebrado',
    headers: { origin: SITE, 'content-type': 'application/json', 'idempotency-key': 'chave-quebrada-0001' } }), env);
  const r = { status: resp.status, dados: await resp.json() };
  assert.equal(r.status, 400);
  const tudo = JSON.stringify(r.dados) + JSON.stringify((await admin('GET', '/resumo', 'dona@drysul.exemplo')).dados);
  for (const s of [mp.TOKEN, SEGREDO, CHAVE, 'stack', 'at ']) assert.equal(tudo.includes(s), false, s);
});
