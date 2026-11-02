// Pages Functions (functions/): /api e /admin do drysul.pages.dev usam o mesmo servidor e ficam fechados por padrão.
// node --test tests/pages.test.mjs   (Node 22+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as api } from '../functions/api/[[rota]].js';
import { onRequest as painel } from '../functions/admin/_middleware.js';
import { criarD1 } from './apoio/d1-falso.mjs';

const B = 'https://drysul.pages.dev';
const padrao = { AMBIENTE: 'producao', PAGAMENTOS_ATIVOS: 'false', SITE_URL: B }; // o que o deploy publica sem configuração
const req = (c, o = {}) => new Request(B + c, Object.assign({ headers: { origin: B, 'content-type': 'application/json' } }, o));

test('padrão publicado: pagamento online desligado, sem listar o que falta', async () => {
  const r = await api({ request: req('/api/status'), env: padrao });
  const d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.pagamentoOnline, false); assert.equal(d.pendencias, undefined);
  const p = await api({ request: req('/api/pedidos', { method: 'POST', body: '{}', headers: { origin: B, 'content-type': 'application/json', 'idempotency-key': 'chave-pages-teste-01' } }), env: padrao });
  assert.equal(p.status, 503);
});

test('painel fechado sem Access configurado; nem o HTML sai', async () => {
  let chamou = false;
  const r = await painel({ request: req('/admin/'), env: padrao, next: async () => { chamou = true; return new Response('painel'); } });
  assert.equal(r.status, 503); assert.equal(chamou, false);
  const a = await api({ request: req('/api/admin/resumo'), env: padrao });
  assert.equal(a.status, 503);
});

test('configurado (teste): a rota do pedido funciona pela Function, com o mesmo banco', async () => {
  const env = { AMBIENTE: 'teste', PAGAMENTOS_ATIVOS: 'true', MP_ACCESS_TOKEN: 'TEST-x', MP_WEBHOOK_SECRET: 's', CHAVE_PEDIDOS: 'k'.repeat(64), DB: criarD1(new URL('../worker/migrations/', import.meta.url)) };
  const corpo = JSON.stringify({ itens: [{ id: 'fita', qtd: 1 }], entrega: 'retirada', cliente: { nome: 'Teste', telefone: '55999991234' }, aceiteTermos: '2026-10-21' });
  const r = await api({ request: req('/api/pedidos', { method: 'POST', body: corpo, headers: { origin: B, 'content-type': 'application/json', 'idempotency-key': 'chave-pages-teste-02' } }), env });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).pedido.totalCentavos, 6500);
});
