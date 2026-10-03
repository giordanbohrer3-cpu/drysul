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

// Atalho "descreva a obra"
const ent = (t) => C.entender(t);
test('entende a frase do cliente: parede 4 × 2,8 m com madeira', () => {
  const r = ent('Quero fazer uma parede de drywall, gesso, acabamento em madeira... de 4 × 2,8 m.');
  assert.equal(r.sistema, 'parede');
  assert.deepEqual(r.valores, { altura: '2,8', comprimento: '4' });
  assert.deepEqual(r.faltando, []);
  assert.equal(r.acabamento.id, 'ripado');
  assert.equal(r.rotulo, 'Parede drywall · 4 × 2,8 m');
  assert.equal(C.calcular(r.sistema, r.valores).area, 11.2);
});
test('forros: área direta, par de medidas e aramado', () => {
  assert.deepEqual(ent('forro de gesso 12 m²').valores, { area: '12' });
  assert.equal(ent('forro de gesso 12 m²').sistema, 'fge');
  const t = ent('lambri de madeira no teto 3x4');
  assert.deepEqual([t.sistema, t.valores.area, t.acabamento.id], ['fge', '12', 'lambri']);
  assert.deepEqual([ent('forro aramado de 20 metros quadrados').sistema, ent('forro aramado de 20 metros quadrados').valores.area], ['fga', '20']);
});
test('revestimento, rótulos de altura e centímetros', () => {
  const c = ent('cobrir parede de tijolo 3 por 2,7 com cimento queimado');
  assert.deepEqual([c.sistema, c.valores.altura, c.valores.comprimento, c.acabamento.id], ['colado', '2,7', '3', 'cimento']);
  assert.deepEqual(ent('parede com 2,80 m de altura e 5 m de comprimento').valores, { altura: '2,8', comprimento: '5' });
  assert.deepEqual(ent('parede altura de 2,6 e comprimento de 7').valores, { altura: '2,6', comprimento: '7' });
  assert.deepEqual(ent('parede 280 cm x 4 m').valores, { altura: '2,8', comprimento: '4' });
  assert.equal(ent('revestimento estruturado 2,5 x 6').sistema, 'estruturado');
});
test('falta medida: pede só o que falta', () => {
  assert.deepEqual(ent('parede de 4 metros').faltando, ['altura']);
  assert.deepEqual(ent('parede').faltando, ['altura', 'comprimento']);
  assert.deepEqual(ent('forro').faltando, ['area']);
});
test('busca de produto não vira obra', () => {
  for (const t of ['drywall', 'gesso', 'chapa ru', 'parafuso 4,8 x 19', 'chapa de drywall 1,20 x 2,40', 'massa 25 kg', 'montante 70', '']) {
    assert.equal(ent(t), null, `"${t}" não é obra`);
  }
  assert.equal(ent('4x2,8').sistema, 'parede');
});
