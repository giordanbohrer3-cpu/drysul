// Servidor da loja (worker/): pedidos, pagamento pelo Mercado Pago, webhook e comprovante.
// Roda com D1 em memória (node:sqlite) e Mercado Pago simulado: nenhuma chamada real, nenhum valor cobrado.
// node --test tests/worker.test.mjs   (Node 22+)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { criarD1 } from './apoio/d1-falso.mjs';
import { criarMp } from './apoio/mp-falso.mjs';
import { rotear } from '../worker/src/index.js';
import { manifesto, assinaturaValida } from '../worker/src/webhook.js';

const SITE = 'https://drysul-teste.exemplo.workers.dev';
const SEGREDO = 'segredo-do-webhook-de-teste';
const CHAVE = 'k'.repeat(64);
const MIGRACOES = new URL('../worker/migrations/', import.meta.url);
const fetchOriginal = globalThis.fetch;

let env, mp, respostas;
beforeEach(() => {
  mp = criarMp();
  globalThis.fetch = mp.fetch;
  respostas = [];
  env = { AMBIENTE: 'teste', PAGAMENTOS_ATIVOS: 'true', MP_ACCESS_TOKEN: mp.TOKEN, MP_WEBHOOK_SECRET: SEGREDO, CHAVE_PEDIDOS: CHAVE, DB: criarD1(MIGRACOES) };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

async function api(metodo, caminho, { corpo, token, cab = {}, base = SITE, ambiente = env } = {}) {
  const h = Object.assign({ origin: base }, cab);
  if (corpo !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  const r = await rotear(new Request(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), ambiente);
  const texto = await r.text();
  respostas.push(texto);
  return { status: r.status, dados: JSON.parse(texto), cab: r.headers };
}

const CLIENTE = { nome: 'Maria Teste', telefone: '(55) 99999-1234', email: 'maria@exemplo.com' };
// 2 rolos de fita (65,00) + 1 balde de massa (54,99) = 184,99
const ITENS = [{ id: 'fita', qtd: 2 }, { id: 'massa', qtd: 1 }];
const pedidoValido = (extra) => Object.assign({ itens: ITENS, entrega: 'retirada', cliente: CLIENTE, totalCentavos: 18499 }, extra);

async function criar(extra, chave = 'chave-de-teste-0001') {
  return api('POST', '/api/pedidos', { corpo: pedidoValido(extra), cab: { 'idempotency-key': chave } });
}
async function criarEPagar() {
  const c = await criar();
  const p = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token });
  return { id: c.dados.pedido.id, token: c.dados.token, numero: c.dados.pedido.numero, pag: p };
}
function assinar(dataId, requestId, ts = String(Date.now())) {
  return 'ts=' + ts + ',v1=' + createHmac('sha256', SEGREDO).update('id:' + dataId + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
}
async function notificar(orderId, requestId, assinatura) {
  return api('POST', '/api/webhooks/mercadopago?data.id=' + orderId + '&type=order', {
    corpo: { action: 'order.processed', type: 'order', data: { id: orderId, status: 'processed' } },
    cab: { 'x-request-id': requestId, 'x-signature': assinatura !== undefined ? assinatura : assinar(orderId, requestId), origin: 'https://api.mercadopago.com' }
  });
}
const chamadasMp = (metodo, caminho) => mp.chamadas.filter((c) => c.metodo === metodo && (!caminho || c.caminho.startsWith(caminho))).length;

/* ---------- pedido válido ---------- */
test('pedido válido: o servidor calcula o total e grava pedido e itens', async () => {
  const r = await criar();
  assert.equal(r.status, 201);
  assert.equal(r.dados.pedido.totalCentavos, 18499);
  assert.equal(r.dados.pedido.status, 'aguardando');
  assert.equal(r.dados.pedido.teste, true);
  assert.match(r.dados.pedido.numero, /^DS-\d{4}-[0-9A-Z]{4}$/);
  assert.match(r.dados.token, /^[0-9a-f]{64}$/);
  assert.equal(r.cab.get('cache-control'), 'no-store');
  const itens = env.DB.banco.prepare('SELECT produto_id, qtd, unit_centavos, total_centavos FROM itens_pedido ORDER BY rowid').all();
  assert.deepEqual(itens.map((i) => [i.produto_id, i.qtd, i.unit_centavos, i.total_centavos]), [['fita', 2, 6500, 13000], ['massa', 1, 5499, 5499]]);
});

test('pagamento: cria a order no Mercado Pago com o total do servidor e devolve o checkout oficial', async () => {
  const { id, pag } = await criarEPagar();
  assert.equal(pag.status, 201);
  assert.match(pag.dados.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.br\//);
  const envio = mp.chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/v1/orders');
  assert.equal(envio.corpo.total_amount, '184.99');
  assert.equal(envio.corpo.processing_mode, 'manual');
  assert.equal(envio.corpo.external_reference, id);
  assert.match(envio.cab['x-idempotency-key'], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(envio.corpo.config.online.success_url, SITE + '/?pedido=' + id + '&retorno=aprovado');
  assert.equal(envio.corpo.config.online.auto_return, 'all');
});

/* ---------- produto sem preço e pedidos inválidos ---------- */
test('produto sem preço (sob consulta) não é vendido online: vai para o WhatsApp', async () => {
  const r = await criar({ itens: [{ id: 'fita', qtd: 1 }, { id: 'chapa-st', qtd: 10 }], totalCentavos: undefined });
  assert.equal(r.status, 422);
  assert.equal(r.dados.erro, 'atendimento_whatsapp');
  assert.deepEqual(r.dados.motivos, ['consulta']);
  assert.equal(chamadasMp('POST'), 0);
});

test('pedidos inválidos: produto inexistente, quantidade fora do limite, repetido, acima do limite, entrega, vazio', async () => {
  const casos = [
    [{ itens: [{ id: 'nao-existe', qtd: 1 }] }, 'produto_invalido'],
    [{ itens: [{ id: 'fita', qtd: 0 }] }, 'quantidade_invalida'],
    [{ itens: [{ id: 'fita', qtd: 1.5 }] }, 'quantidade_invalida'],
    [{ itens: [{ id: 'fita', qtd: '2' }] }, 'quantidade_invalida'],
    [{ itens: [{ id: 'fita', qtd: 1000 }] }, 'quantidade_invalida'],
    [{ itens: [{ id: 'fita', qtd: 1 }, { id: 'fita', qtd: 1 }] }, 'produto_repetido'],
    [{ itens: [{ id: 'parafuso-costura', qtd: 8 }] }, 'atendimento_whatsapp'], // 8 × 137,90 = 1.103,20 > 1.000
    [{ calculos: true }, 'atendimento_whatsapp'],
    [{ entrega: 'entrega' }, 'atendimento_whatsapp'],
    [{ itens: [] }, 'pedido_vazio'],
    [{ cliente: { nome: 'Jo', telefone: '55999991234' } }, 'nome_invalido'],
    [{ cliente: { nome: 'Maria', telefone: '123' } }, 'telefone_invalido']
  ];
  let n = 0;
  for (const [extra, codigo] of casos) {
    const r = await criar(Object.assign({ totalCentavos: undefined }, extra), 'chave-invalida-' + String(n++).padStart(4, '0'));
    assert.equal(r.status, 422, codigo);
    assert.equal(r.dados.erro, codigo);
  }
  assert.equal(env.DB.banco.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 0);
});

/* ---------- alteração maliciosa de valores ---------- */
test('valores alterados no navegador: preço e total enviados são ignorados ou recusados', async () => {
  // total adulterado: nada é criado, e o cliente recebe o valor certo
  const r1 = await criar({ totalCentavos: 1 });
  assert.equal(r1.status, 409);
  assert.equal(r1.dados.erro, 'preco_alterado');
  assert.equal(r1.dados.totalCentavos, 18499);
  // preço adulterado dentro dos itens: o servidor usa o catálogo
  const r2 = await criar({ itens: [{ id: 'fita', qtd: 2, preco: 0.01, total: 0.02 }, { id: 'massa', qtd: 1, preco: 0.01 }], totalCentavos: undefined, subtotal: 0.03 }, 'chave-maliciosa-0002');
  assert.equal(r2.status, 201);
  assert.equal(r2.dados.pedido.totalCentavos, 18499);
  const p = await api('POST', '/api/pedidos/' + r2.dados.pedido.id + '/pagamento', { token: r2.dados.token });
  assert.equal(p.status, 201);
  const envio = mp.chamadas.find((c) => c.caminho === '/v1/orders');
  assert.equal(envio.corpo.total_amount, '184.99');
  assert.deepEqual(envio.corpo.items.map((i) => i.unit_price), ['65.00', '54.99']);
});

test('valor pago diferente do total: pedido fica divergente, sem comprovante', async () => {
  const { id, token, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado', 100); // pagou R$ 1,00
  const w = await notificar(orderId, 'req-divergente');
  assert.equal(w.status, 200);
  assert.equal(w.dados.resultado, 'divergente');
  const c = await api('GET', '/api/pedidos/' + id + '/comprovante', { token });
  assert.equal(c.status, 409);
});

/* ---------- aprovado, recusado, pendente ---------- */
test('pagamento aprovado: só vira "pago" depois de ler a order no Mercado Pago; comprovante e verificação', async () => {
  const { id, token, numero, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  // o navegador voltou com "approved" na URL, mas o Mercado Pago ainda não confirmou: continua aguardando
  let s = await api('GET', '/api/pedidos/' + id + '?atualizar=1&status=approved&collection_status=approved', { token });
  assert.equal(s.dados.pedido.status, 'aguardando');
  assert.equal((await api('GET', '/api/pedidos/' + id + '/comprovante', { token })).status, 409);

  mp.definir(orderId, 'aprovado');
  const w = await notificar(orderId, 'req-aprovado-1');
  assert.equal(w.status, 200);
  assert.equal(w.dados.resultado, 'pago');
  s = await api('GET', '/api/pedidos/' + id, { token });
  assert.equal(s.dados.pedido.status, 'pago');
  assert.equal(s.dados.pedido.checkoutUrl, null);

  const c = await api('GET', '/api/pedidos/' + id + '/comprovante', { token });
  assert.equal(c.status, 200);
  const r = c.dados.comprovante;
  assert.equal(r.numero, numero);
  assert.equal(r.total, 184.99);
  assert.equal(r.pagamento, 'pix');
  assert.equal(r.teste, true);
  assert.match(r.codigo, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(r.cliente.telefone, '(55) 9••••-1234');
  assert.equal(r.cliente.email, 'ma•••@exemplo.com');

  const v = await api('GET', '/api/comprovantes/verificar?numero=' + numero + '&codigo=' + r.codigo);
  assert.equal(v.dados.valido, true);
  assert.equal(v.dados.totalCentavos, 18499);
  const falso = await api('GET', '/api/comprovantes/verificar?numero=' + numero + '&codigo=0000-0000-0000');
  assert.equal(falso.dados.valido, false);

  // pago não volta a abrir pagamento
  const de_novo = await api('POST', '/api/pedidos/' + id + '/pagamento', { token });
  assert.equal(de_novo.status, 409);
  assert.equal(de_novo.dados.erro, 'ja_pago');
});

test('pagamento recusado: sem comprovante; nova tentativa cria outra order com outra chave', async () => {
  const { id, token, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'recusado');
  const s = await api('GET', '/api/pedidos/' + id + '?atualizar=1', { token });
  assert.equal(s.dados.pedido.status, 'recusado');
  assert.equal((await api('GET', '/api/pedidos/' + id + '/comprovante', { token })).status, 409);

  const p2 = await api('POST', '/api/pedidos/' + id + '/pagamento', { token });
  assert.equal(p2.status, 201);
  assert.notEqual(p2.dados.checkoutUrl, pag.dados.checkoutUrl);
  assert.equal(p2.dados.pedido.status, 'aguardando');
  const chaves = mp.chamadas.filter((c) => c.caminho === '/v1/orders').map((c) => c.cab['x-idempotency-key']);
  assert.equal(new Set(chaves).size, 2);
  // aviso atrasado da tentativa recusada não muda o pedido
  const w = await notificar(orderId, 'req-recusado-atrasado');
  assert.equal(w.dados.resultado, 'aguardando');
});

test('pagamento pendente: continua pendente, reaproveita o mesmo checkout e não emite comprovante', async () => {
  const { id, token, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'pendente');
  const w = await notificar(orderId, 'req-pendente');
  assert.equal(w.dados.resultado, 'pendente');
  const s = await api('GET', '/api/pedidos/' + id, { token });
  assert.equal(s.dados.pedido.status, 'pendente');
  assert.equal(s.dados.pedido.checkoutUrl, pag.dados.checkoutUrl);
  const p2 = await api('POST', '/api/pedidos/' + id + '/pagamento', { token });
  assert.equal(p2.dados.checkoutUrl, pag.dados.checkoutUrl);
  assert.equal(chamadasMp('POST', '/v1/orders'), 1);
  assert.equal((await api('GET', '/api/pedidos/' + id + '/comprovante', { token })).status, 409);
});

test('reembolso depois de pago: o comprovante deixa de valer', async () => {
  const { id, token, numero, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado');
  await notificar(orderId, 'req-r1');
  const codigo = (await api('GET', '/api/pedidos/' + id + '/comprovante', { token })).dados.comprovante.codigo;
  mp.definir(orderId, 'reembolsado');
  assert.equal((await notificar(orderId, 'req-r2')).dados.resultado, 'reembolsado');
  const v = await api('GET', '/api/comprovantes/verificar?numero=' + numero + '&codigo=' + codigo);
  assert.deepEqual(v.dados, { valido: false, status: 'reembolsado' });
});

/* ---------- webhook ---------- */
test('webhook duplicado: processado uma vez só', async () => {
  const { pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado');
  const ass = assinar(orderId, 'req-dup');
  const a = await notificar(orderId, 'req-dup', ass);
  const b = await notificar(orderId, 'req-dup', ass);
  assert.equal(a.dados.resultado, 'pago');
  assert.equal(b.dados.duplicado, true);
  assert.equal(chamadasMp('GET', '/v1/orders/'), 1); // só o primeiro aviso consultou o Mercado Pago
  // aviso novo (outro x-request-id) da mesma order: idempotente, o pedido continua pago e o código não muda
  const codigo = env.DB.banco.prepare('SELECT codigo FROM pedidos').get().codigo;
  const c = await notificar(orderId, 'req-dup-2');
  assert.equal(c.dados.resultado, 'pago');
  assert.equal(env.DB.banco.prepare('SELECT codigo FROM pedidos').get().codigo, codigo);
});

test('webhook com assinatura inválida, adulterada ou ausente é recusado sem consultar o Mercado Pago', async () => {
  const { pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado');
  const antes = mp.chamadas.length;
  const ruins = [
    'ts=1,v1=' + '0'.repeat(64),
    assinar('ORDTST9999999999', 'req-x'),                          // assinatura de outra order
    assinar(orderId, 'outro-request-id'),                           // outro x-request-id
    'ts=1742505638683,v1=' + createHmac('sha256', 'segredo-errado').update(manifesto(orderId, 'req-x', '1742505638683')).digest('hex'),
    ''
  ];
  for (const s of ruins) {
    const r = await notificar(orderId, 'req-x', s);
    assert.equal(r.status, 401);
  }
  assert.equal(mp.chamadas.length, antes);
  assert.equal(env.DB.banco.prepare('SELECT status FROM pedidos').get().status, 'aguardando');
});

test('assinatura: manifesto igual ao do SDK oficial, data.id como chegou ou em minúsculas', async () => {
  assert.equal(manifesto('ORD01ABC', 'req-1', '1704908010'), 'id:ORD01ABC;request-id:req-1;ts:1704908010;');
  assert.equal(manifesto('', '', '1'), 'ts:1;');
  const ts = '1704908010';
  const minusc = 'ts=' + ts + ',v1=' + createHmac('sha256', SEGREDO).update('id:ord01abc;request-id:r;ts:' + ts + ';').digest('hex');
  assert.equal(await assinaturaValida({ assinatura: minusc, requestId: 'r', dataId: 'ORD01ABC', segredo: SEGREDO }), true);
  assert.equal(await assinaturaValida({ assinatura: minusc, requestId: 'r', dataId: 'ORD01ABD', segredo: SEGREDO }), false);
});

/* ---------- falha de comunicação ---------- */
test('falha de comunicação ao abrir o pagamento: erro claro e a nova tentativa usa a mesma chave', async () => {
  const c = await criar();
  mp.falharProximas = 1;
  const r1 = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token });
  assert.equal(r1.status, 502);
  assert.equal(r1.dados.erro, 'provedor_indisponivel');
  const r2 = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token });
  assert.equal(r2.status, 201);
  assert.equal(env.DB.banco.prepare('SELECT tentativas FROM pedidos').get().tentativas, 1);
});

test('falha de comunicação no webhook: responde erro para o Mercado Pago reenviar; o reenvio processa', async () => {
  const { pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado');
  mp.falharProximas = 1;
  const a = await notificar(orderId, 'req-falha');
  assert.equal(a.status, 502);
  assert.equal(env.DB.banco.prepare('SELECT status FROM pedidos').get().status, 'aguardando');
  const b = await notificar(orderId, 'req-falha');
  assert.equal(b.status, 200);
  assert.equal(b.dados.resultado, 'pago');
});

test('falha de comunicação na consulta: mostra o último status salvo, sem inventar resultado', async () => {
  const { id, token } = await criarEPagar();
  mp.falharProximas = 1;
  const s = await api('GET', '/api/pedidos/' + id + '?atualizar=1', { token });
  assert.equal(s.status, 200);
  assert.equal(s.dados.provedorRespondeu, false);
  assert.equal(s.dados.pedido.status, 'aguardando');
});

/* ---------- recarregamento da página / clique duplo ---------- */
test('recarregar a página ou clicar duas vezes não duplica pedido nem cobrança', async () => {
  const a = await criar();
  const b = await criar();
  assert.equal(b.status, 200);
  assert.equal(b.dados.repetido, true);
  assert.equal(b.dados.pedido.id, a.dados.pedido.id);
  assert.equal(b.dados.token, a.dados.token);
  const [p1, p2] = await Promise.all([
    api('POST', '/api/pedidos/' + a.dados.pedido.id + '/pagamento', { token: a.dados.token }),
    api('POST', '/api/pedidos/' + a.dados.pedido.id + '/pagamento', { token: a.dados.token })
  ]);
  const p3 = await api('POST', '/api/pedidos/' + a.dados.pedido.id + '/pagamento', { token: a.dados.token });
  assert.deepEqual([p1.status, p2.status].sort(), [201, 409]); // o segundo clique espera o primeiro
  assert.equal(p3.dados.checkoutUrl, (p1.dados.checkoutUrl || p2.dados.checkoutUrl));
  assert.equal(chamadasMp('POST', '/v1/orders'), 1);
  // depois de recarregar, o status vem do banco
  const s = await api('GET', '/api/pedidos/' + a.dados.pedido.id, { token: a.dados.token });
  assert.equal(s.dados.pedido.numero, a.dados.pedido.numero);
  // mesma chave com outro conteúdo é recusada
  const c = await criar({ itens: [{ id: 'fita', qtd: 3 }], totalCentavos: undefined });
  assert.equal(c.status, 422);
  assert.equal(c.dados.erro, 'chave_reutilizada');
  assert.equal(env.DB.banco.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 1);
});

/* ---------- segurança das credenciais e trava de produção ---------- */
test('pedido de outra pessoa: sem o token certo, o pedido "não existe"', async () => {
  const { id } = await criarEPagar();
  for (const token of [undefined, 'f'.repeat(64), 'abc']) {
    const r = await api('GET', '/api/pedidos/' + id, { token });
    assert.equal(r.status, 404);
    assert.equal((await api('GET', '/api/pedidos/' + id + '/comprovante', { token })).status, 404);
    assert.equal((await api('POST', '/api/pedidos/' + id + '/pagamento', { token })).status, 404);
  }
});

test('POST de outro site é recusado (origem)', async () => {
  const r = await api('POST', '/api/pedidos', { corpo: pedidoValido(), cab: { 'idempotency-key': 'chave-origem-0001', origin: 'https://golpe.exemplo' } });
  assert.equal(r.status, 403);
});

test('nenhuma resposta expõe token do Mercado Pago, segredo do webhook ou chave do servidor', async () => {
  const { id, token, pag } = await criarEPagar();
  const orderId = pag.dados.checkoutUrl.split('pref_id=')[1];
  mp.definir(orderId, 'aprovado');
  await notificar(orderId, 'req-seg');
  await api('GET', '/api/pedidos/' + id + '/comprovante', { token });
  await api('GET', '/api/status');
  await api('GET', '/api/nada');
  const tudo = respostas.join('\n');
  for (const s of [mp.TOKEN, SEGREDO, CHAVE]) assert.equal(tudo.includes(s), false);
});

test('produção bloqueada: sem PAGAMENTOS_ATIVOS="true" não cria pedido nem chama o Mercado Pago', async () => {
  const prod = Object.assign({}, env, { AMBIENTE: 'producao', PAGAMENTOS_ATIVOS: 'false', SITE_URL: 'https://www.drysul.exemplo', MP_ACCESS_TOKEN: 'APP_USR-producao' });
  const s = await api('GET', '/api/status', { ambiente: prod });
  assert.equal(s.dados.pagamentoOnline, false);
  assert.equal(s.dados.teste, false);
  assert.equal(s.dados.pendencias, undefined); // produção não lista o que falta
  const r = await api('POST', '/api/pedidos', { corpo: pedidoValido(), cab: { 'idempotency-key': 'chave-producao-0001' }, base: 'https://www.drysul.exemplo', ambiente: prod });
  assert.equal(r.status, 503);
  assert.equal(mp.chamadas.length, 0);
});

test('produção recusa credencial de teste, falta de SITE_URL e de segredos', async () => {
  const base = { AMBIENTE: 'producao', PAGAMENTOS_ATIVOS: 'true', SITE_URL: 'https://www.drysul.exemplo', MP_ACCESS_TOKEN: 'APP_USR-x', MP_WEBHOOK_SECRET: 's', CHAVE_PEDIDOS: CHAVE, DB: env.DB };
  const variantes = [{ MP_ACCESS_TOKEN: 'TEST-123' }, { SITE_URL: '' }, { SITE_URL: 'http://www.drysul.exemplo' }, { MP_WEBHOOK_SECRET: '' }, { CHAVE_PEDIDOS: 'curta' }];
  for (const v of variantes) {
    const s = await api('GET', '/api/status', { ambiente: Object.assign({}, base, v), base: 'https://www.drysul.exemplo' });
    assert.equal(s.dados.pagamentoOnline, false, JSON.stringify(v));
  }
  const ok = await api('GET', '/api/status', { ambiente: base, base: 'https://www.drysul.exemplo' });
  assert.equal(ok.dados.pagamentoOnline, true);
});

test('trava de ambiente: credencial de produção no site de teste cancela a order e não devolve checkout', async () => {
  mp.prefixo = 'ORD'; // ids de produção (sem "TST")
  const c = await criar();
  const r = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token });
  assert.equal(r.status, 503);
  assert.equal(r.dados.erro, 'credencial_trocada');
  assert.equal(r.dados.checkoutUrl, undefined);
  assert.ok(mp.chamadas.some((x) => x.metodo === 'POST' && x.caminho.endsWith('/cancel')));
});

test('checkout fora do Mercado Pago é recusado', async () => {
  mp.checkoutHost = 'https://mercadopago.com.br.golpe.exemplo';
  const c = await criar();
  const r = await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token });
  assert.equal(r.status, 502);
  assert.equal(r.dados.checkoutUrl, undefined);
});

test('ambiente "local" publicado por engano não cobra e não aceita outro endereço de API', async () => {
  const local = Object.assign({}, env, { AMBIENTE: 'local', MP_API_BASE: 'https://api-falsa.exemplo' });
  const s = await api('GET', '/api/status', { ambiente: local, base: 'https://drysul-local.exemplo.workers.dev' });
  assert.equal(s.dados.pagamentoOnline, false);
  // no teste, MP_API_BASE é ignorado: as chamadas vão para a API oficial
  const teste = Object.assign({}, env, { MP_API_BASE: 'https://api-falsa.exemplo' });
  const c = await api('POST', '/api/pedidos', { corpo: pedidoValido(), cab: { 'idempotency-key': 'chave-base-api-0001' }, ambiente: teste });
  await api('POST', '/api/pedidos/' + c.dados.pedido.id + '/pagamento', { token: c.dados.token, ambiente: teste });
  assert.ok(mp.chamadas.length > 0);
  assert.ok(mp.chamadas.every((x) => x.origem === 'https://api.mercadopago.com'));
});

test('repositório: nenhum segredo no wrangler.jsonc; segredos locais fora do git e fora do site publicado', () => {
  const cfg = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(cfg, /"(MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET|CHAVE_PEDIDOS)"\s*:/);
  assert.doesNotMatch(cfg, /(APP_USR|TEST)-\d/);
  assert.match(cfg, /"producao"[\s\S]*"PAGAMENTOS_ATIVOS": "false"/);
  const gi = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gi, /^\.dev\.vars$/m);
  const ai = readFileSync(new URL('../.assetsignore', import.meta.url), 'utf8').split('\n');
  for (const item of ['worker', '.dev.vars*', 'wrangler.jsonc', 'tests', '.git']) assert.ok(ai.includes(item), item);
  // o site não tem mais simulação de aprovação nem QR Code ilustrativo
  const co = readFileSync(new URL('../js/checkout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(co, /Simular pagamento|qrDemo|QR Code ilustrativo/);
});
