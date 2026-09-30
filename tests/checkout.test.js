// Regras da central de vendas. Rodar: node --test tests/checkout.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/checkout-model.js');

const produtos = {
  massa: { id: 'massa', preco: 54.99 },
  fita: { id: 'fita', preco: 65 },
  parafuso: { id: 'parafuso', preco: 27.99 },
  chapa: { id: 'chapa', preco: null }
};
const cfg = { limiteOnline: 500 };

test('pedido pequeno só com itens de preço vai para a compra no site', () => {
  const r = V.avaliar({ itens: [{ id: 'massa', qtd: 3 }, { id: 'fita', qtd: 1 }] }, produtos, cfg);
  assert.equal(r.canal, 'online');
  assert.equal(r.subtotal, 229.97);
  assert.deepEqual(r.motivos, []);
});

test('soma em centavos, sem erro de ponto flutuante', () => {
  const r = V.avaliar({ itens: [{ id: 'parafuso', qtd: 3 }] }, produtos, cfg);
  assert.equal(r.subtotal, 83.97);
});

test('estimativa da calculadora vai para o WhatsApp', () => {
  const r = V.avaliar({ itens: [{ id: 'massa', qtd: 1 }], estimativa: { area: 11.2 } }, produtos, cfg);
  assert.equal(r.canal, 'whatsapp');
  assert.deepEqual(r.motivos, ['calculo']);
});

test('item sob consulta vai para o WhatsApp', () => {
  const r = V.avaliar({ itens: [{ id: 'chapa', qtd: 2 }, { id: 'fita', qtd: 1 }] }, produtos, cfg);
  assert.equal(r.canal, 'whatsapp');
  assert.deepEqual(r.motivos, ['consulta']);
});

test('valor acima do limite vai para o WhatsApp; no limite ainda é online', () => {
  assert.equal(V.avaliar({ itens: [{ id: 'fita', qtd: 8 }] }, produtos, cfg).canal, 'whatsapp'); // 520
  assert.equal(V.avaliar({ itens: [{ id: 'fita', qtd: 7 }] }, produtos, { limiteOnline: 455 }).canal, 'online'); // 455
});

test('lista vazia e itens inválidos são ignorados', () => {
  assert.equal(V.avaliar({ itens: [] }, produtos, cfg).canal, 'vazio');
  const r = V.avaliar({ itens: [{ id: 'inexistente', qtd: 1 }, { id: 'massa', qtd: 0 }, { id: 'massa', qtd: 5000 }] }, produtos, cfg);
  assert.equal(r.canal, 'vazio');
});

test('validação de contato', () => {
  assert.ok(V.telefoneValido('(55) 99201-0668'));
  assert.ok(V.telefoneValido('55 3332-1234'));
  assert.ok(V.telefoneValido('+55 55 99201-0668'));
  assert.ok(!V.telefoneValido('99201-0668'));
  assert.ok(!V.telefoneValido('abc'));
  assert.equal(V.formatarTelefone('55992010668'), '(55) 99201-0668');
  assert.ok(V.emailValido(''));
  assert.ok(V.emailValido('cliente@exemplo.com.br'));
  assert.ok(!V.emailValido('cliente@'));
});

test('número do pedido', () => {
  assert.equal(V.numeroPedido(new Date(2026, 8, 30), 0), 'DS-3009-0000');
  assert.match(V.numeroPedido(), /^DS-\d{4}-[0-9A-Z]{4}$/);
});

test('comprovante: dados pessoais mascarados', () => {
  assert.equal(V.mascararTelefone('(55) 99201-0668'), '(55) 9••••-0668');
  assert.equal(V.mascararTelefone('55 3332-1234'), '(55) ••••-1234');
  assert.equal(V.mascararTelefone('123'), '');
  assert.equal(V.mascararEmail('maria@exemplo.com.br'), 'ma•••@exemplo.com.br');
  assert.equal(V.mascararEmail(''), '');
});

test('comprovante: código de verificação muda com qualquer alteração', () => {
  const base = { numero: 'DS-3009-AB12', dataISO: '2026-09-30T15:00:00.000Z', status: 'pago', pagamento: 'pix', total: 174.98,
    itens: [{ id: 'fita', qtd: 1, unit: 65 }, { id: 'massa', qtd: 2, unit: 54.99 }] };
  const c1 = V.codigoVerificacao(V.conteudoComprovante(base));
  assert.match(c1, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(c1, V.codigoVerificacao(V.conteudoComprovante(base)), 'determinístico');
  assert.notEqual(c1, V.codigoVerificacao(V.conteudoComprovante({ ...base, total: 175.98 })));
  assert.notEqual(c1, V.codigoVerificacao(V.conteudoComprovante({ ...base, itens: [{ id: 'fita', qtd: 2, unit: 65 }, base.itens[1]] })));
});
