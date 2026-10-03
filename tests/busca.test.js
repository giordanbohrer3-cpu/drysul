// Busca e filtro do catálogo com o catálogo real. Rodar: node --test tests/busca.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/busca.js');
const { DRYSUL: D } = require('../js/data.js');

const categorias = Object.fromEntries(D.categorias.map((c) => [c.id, c.nome]));
const P = D.produtos;
const ids = (l) => l.map((p) => p.id);
const busca = (t, o) => B.buscar(t, P, { categorias, ...o });
const cat = (t, o) => B.filtrarCatalogo(t, P, { categorias, ...o });

test('todo produto é achado pelo próprio nome, em primeiro', () => {
  for (const p of P) assert.equal(busca(p.nome).lista[0].id, p.id, p.nome);
});
test('toda categoria lista os seus produtos', () => {
  for (const c of D.categorias) {
    const r = busca(c.nome).lista;
    for (const p of P.filter((x) => x.cat === c.id)) assert.ok(ids(r).includes(p.id), `${c.nome} → ${p.nome}`);
  }
});
test('categoria escolhida não esconde o que existe em outra (causa do "nenhum material encontrado")', () => {
  const r = cat('massa', { cat: 'chapas' });
  assert.equal(r.escopo, 'todas');
  assert.equal(r.lista[0].id, 'massa');
  const f = cat('parafuso', { cat: 'chapas' });
  assert.ok(f.lista.length >= 6 && f.lista.every((p) => p.cat === 'fixacao'));
  // quando a categoria tem o termo, ela continua valendo
  const s = cat('chapa', { cat: 'chapas' });
  assert.equal(s.escopo, 'categoria'); assert.ok(s.lista.every((p) => p.cat === 'chapas'));
});
test('materiais que a calculadora usa também aparecem na busca', () => {
  assert.equal(busca('cola').lista[0].id, 'gesso-cola');
  assert.equal(busca('lã mineral').lista[0].id, 'la-vidro');
  assert.ok(ids(busca('arame').lista).includes('arame-10'));
  assert.equal(busca('regulador').lista[0].id, 'regulador');
});
test('nomes do balcão, plural e relevância', () => {
  assert.equal(busca('gesso').lista[0].cat, 'chapas');
  assert.equal(busca('placa de gesso').lista[0].cat, 'chapas');
  assert.equal(busca('massa corrida').lista[0].id, 'massa');
  assert.deepEqual(ids(busca('bucha').lista).slice(0, 2).sort(), ['ancorador', 'parabolt']);
  assert.equal(busca('parafusos').lista.filter((p) => /parafuso/i.test(p.nome)).length, 6);
  assert.ok(!ids(busca('perfis').lista).includes('massa'), '"perfis" não pode achar "superfície"');
  assert.equal(busca('chapa').lista.slice(0, 3).every((p) => p.cat === 'chapas'), true);
});
test('erro de digitação', () => {
  const r = busca('parafusso');
  assert.equal(r.modo, 'digitacao'); assert.equal(r.corrigido, 'parafuso');
  assert.match(r.lista[0].nome, /parafuso/i);
  assert.equal(busca('montnte').lista[0].id, 'montante-70');
});
test('texto sem palavra útil ou só medidas não zera o catálogo', () => {
  assert.equal(cat('de').lista.length, P.length);
  assert.equal(cat('4x2,8', { ignorarMedidas: true }).lista.length, P.length);
  assert.equal(cat('   ').lista.length, P.length);
});
test('nada bate: a grade mostra os sugeridos, nunca vazia', () => {
  const r = cat('xyz123');
  assert.equal(r.modo, 'nada'); assert.equal(r.escopo, 'sugeridos');
  assert.ok(r.lista.length > 0);
});
test('especificação com medidas acha o produto certo', () => {
  assert.equal(busca('parafuso 4,8 x 19').lista.length, 2);
  assert.equal(busca('chapa 1,20 x 2,40').lista[0].cat, 'chapas');
});
