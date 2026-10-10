// Busca da central de ajuda. Rodar: node --test tests/ajuda.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/ajuda.js');
const { DRYSUL } = require('../js/data.js');

const grupos = DRYSUL.ajuda;
const primeira = termo => { const r = A.buscar(grupos, termo)[0]; return r && grupos[r.grupo].itens[r.item].p; };

test('cada dúvida tem pergunta e resposta, e as perguntas não se repetem', () => {
  const vistas = new Set();
  grupos.forEach(g => {
    assert.ok(g.tema && g.itens.length, 'tema com itens');
    g.itens.forEach(it => {
      assert.ok(it.p.endsWith('?'), 'pergunta termina com "?": ' + it.p);
      assert.ok(it.r.length > 20, 'resposta: ' + it.p);
      assert.ok(!vistas.has(it.p), 'repetida: ' + it.p); vistas.add(it.p);
      if (it.acao) assert.ok(it.acao.rotulo && (it.acao.href || ['rota', 'whatsapp', 'tel'].includes(it.acao.loja)), 'ação válida: ' + it.p);
    });
  });
});

test('entende a pergunta do jeito que a pessoa escreve, sem acento e com palavras parecidas', () => {
  assert.equal(primeira('frete'), 'Vocês entregam? Quanto custa o frete?');
  assert.equal(primeira('voces entregam em casa'), 'Vocês entregam? Quanto custa o frete?');
  assert.equal(primeira('pago com cartão?'), 'Quais são as formas de pagamento?');
  assert.equal(primeira('PIX'), 'Quais são as formas de pagamento?');
  assert.equal(primeira('endereço'), 'Onde fica a loja?');
  assert.equal(primeira('horario de sabado'), 'Qual é o horário de atendimento?');
  assert.equal(primeira('banheiro'), 'Posso usar drywall no banheiro?');
  assert.equal(primeira('chapa verde'), 'Qual chapa usar: ST, RU ou RF?');
  assert.equal(primeira('pendurar televisão'), 'Drywall aguenta TV, armário ou prateleira?');
  assert.equal(primeira('letra pequena'), 'As letras estão pequenas. Como aumento?');
  assert.equal(primeira('precisa de senha'), 'Preciso fazer cadastro ou criar senha?');
});

test('plural e singular dão no mesmo', () => {
  assert.equal(primeira('entregas'), primeira('entrega'));
  assert.equal(primeira('chapas'), primeira('chapa'));
});

test('sem palavra útil ou sem resposta: lista vazia', () => {
  assert.deepEqual(A.buscar(grupos, ''), []);
  assert.deepEqual(A.buscar(grupos, 'de o a'), []);
  assert.deepEqual(A.buscar(grupos, 'xilofone'), []);
});

test('normalizar tira acento, caixa e pontuação', () => {
  assert.equal(A.normalizar('  Ação, É  já?! '), 'acao e ja');
});
