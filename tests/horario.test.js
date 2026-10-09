// Horário da loja ("Aberto agora"). Rodar: node --test tests/horario.test.js
// As datas estão em UTC; a loja fica em UTC−3 (America/Sao_Paulo, sem horário de verão desde 2019).
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/horario.js');
const { DRYSUL } = require('../js/data.js');

const horario = DRYSUL.loja.horario;
const em = iso => H.status(new Date(iso), horario);

test('o horário vem do data.js: seg. a sex. 8h–18h e sáb. 8h–12h', () => {
  assert.deepEqual(horario, [
    { dias: [1, 2, 3, 4, 5], abre: '08:00', fecha: '18:00' },
    { dias: [6], abre: '08:00', fecha: '12:00' }
  ]);
});

test('quarta às 10h (horário da loja): aberto, fecha às 18h', () => {
  assert.deepEqual(em('2026-10-07T13:00:00Z'), { aberto: true, fechando: false, texto: 'Aberto agora', detalhe: 'fecha às 18h' });
});

test('na última hora avisa quanto falta', () => {
  assert.equal(em('2026-10-07T20:30:00Z').detalhe, 'fecha em 30 min');
  assert.equal(em('2026-10-10T14:15:00Z').detalhe, 'fecha em 45 min'); // sábado 11h15
});

test('antes de abrir: abre hoje às 8h', () => {
  const r = em('2026-10-07T10:30:00Z'); // quarta 7h30
  assert.equal(r.aberto, false);
  assert.equal(r.detalhe, 'abre hoje às 8h');
});

test('fecha na hora exata e depois aponta o próximo dia', () => {
  assert.equal(em('2026-10-07T21:00:00Z').aberto, false);          // quarta 18h em ponto
  assert.equal(em('2026-10-07T21:00:00Z').detalhe, 'abre amanhã às 8h');
  assert.equal(em('2026-10-10T15:00:00Z').detalhe, 'abre segunda às 8h'); // sábado 12h
  assert.equal(em('2026-10-11T15:00:00Z').detalhe, 'abre amanhã às 8h');  // domingo
});

test('conta no fuso da loja, não no UTC: 1h UTC de quinta ainda é quarta 22h em Ijuí', () => {
  assert.deepEqual(H.relogio(new Date('2026-10-08T01:00:00Z')), { dia: 3, min: 22 * 60 });
});

test('hora com minutos', () => {
  assert.equal(H.hora(8 * 60), '8h');
  assert.equal(H.hora(17 * 60 + 30), '17h30');
  assert.equal(H.hora(7 * 60 + 5), '7h05');
});
