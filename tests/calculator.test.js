// Casos conferidos na calculadora oficial. Rodar: node --test tests/calculator.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calculator-model.js');

const qtds = (r) => r.itens.map((i) => i.qtd);

test('parede 2,8 × 4 m', () => {
  const r = C.calcular('parede', { altura: '2,8', comprimento: '4' });
  assert.equal(r.area, 11.2);
  assert.deepEqual(qtds(r), [23.52, 7.84, 25.76, 22.4, 280, 7.84, 1.12, 33.6, 11.76]);
});
test('forro FGE 20 m²', () => {
  assert.deepEqual(qtds(C.calcular('fge', { area: '20' })), [21, 34, 22, 25, 20, 25, 30, 240, 30, 7, 21]);
});
test('forro FGA 20 m²', () => {
  assert.deepEqual(qtds(C.calcular('fga', { area: '20' })), [21, 1.8, 25, 14, 60, 2.8, 90]);
});
test('revestimento colado 2,8 × 4 m', () => {
  assert.deepEqual(qtds(C.calcular('colado', { altura: '2.8', comprimento: '4' })), [11.76, 28, 3.92, 16.8]);
});
test('revestimento estruturado 2,8 × 4 m', () => {
  assert.deepEqual(qtds(C.calcular('estruturado', { altura: '2,8', comprimento: '4' })),
    [11.76, 7.728, 61.6, 22.4, 140, 3.92, 1.12, 16.8, 11.76]);
});
test('entradas inválidas', () => {
  for (const v of ['', '0', '-1', 'abc', '1e3', '1,2,3', '1.000,5', '2,8888', ' ', '+2']) {
    const r = C.calcular('fge', { area: v });
    assert.equal(r.ok, false, `deveria rejeitar "${v}"`);
  }
  assert.equal(C.parseNumero(' 2,5 '), 2.5);
});
test('limites de altura e área', () => {
  assert.equal(C.calcular('parede', { altura: '3', comprimento: '1' }).ok, true);
  assert.equal(C.calcular('parede', { altura: '3,01', comprimento: '1' }).ok, false);
  assert.equal(C.calcular('estruturado', { altura: '3,05', comprimento: '1' }).ok, true);
  assert.equal(C.calcular('colado', { altura: '6', comprimento: '1' }).ok, true);
  assert.equal(C.calcular('colado', { altura: '6,1', comprimento: '1' }).ok, false);
  assert.equal(C.calcular('fge', { area: '100000' }).ok, true);
  assert.equal(C.calcular('fge', { area: '100000,001' }).ok, false);
  assert.equal(C.calcular('parede', { altura: '3', comprimento: '40000' }).ok, false);
});

// Embalagens de compra e orçamento
const compras = (r) => r.itens.map((i) => i.qtdCompra);
const PRECOS = { 'chapa-st': 58, 'guia-70': 23, 'montante-70': 29, 'parafuso-metal': 24.9, parafuso: 27.99, massa: 54.99,
  'gesso-cola': 60, fita: 65, 'la-vidro': 280 };
const precoDe = (ref) => (PRECOS[ref] != null ? { preco: PRECOS[ref], fonte: 'media' } : null);

test('parede 2,8 × 4 m vira embalagens', () => {
  const r = C.calcular('parede', { altura: '2,8', comprimento: '4' });
  assert.deepEqual(compras(r), [9, 3, 9, 1, 1, 1, 1, 1, 1]);
  assert.equal(r.itens[0].unCompra, 'chapas');
  assert.equal(r.itens[3].unCompra, 'caixa');
  assert.equal(r.itens[8].opcional, true);
});
test('orçamento soma em centavos e deixa o opcional fora do total', () => {
  const o = C.orcar(C.calcular('parede', { altura: '2,8', comprimento: '4' }), precoDe);
  assert.equal(o.itens[0].subtotal, 522);
  assert.equal(o.total, 1084.88);
  assert.equal(o.opcional, 280);
  assert.equal(o.semPreco, 0);
});
test('item sem preço fica sob consulta', () => {
  const o = C.orcar(C.calcular('fga', { area: '20' }), () => null);
  assert.equal(o.total, 0);
  assert.equal(o.semPreco, 7);
  assert.equal(o.itens[0].subtotal, null);
});
test('embalagem nunca é zero e arredonda para cima', () => {
  const r = C.calcular('colado', { altura: '0,1', comprimento: '0,1' });
  r.itens.forEach((i) => assert.ok(i.qtdCompra >= 1));
  assert.deepEqual(compras(C.calcular('fge', { area: '20' })), [8, 12, 8, 25, 20, 2, 1, 1, 1, 1, 2]);
});
