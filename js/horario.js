/* Drysul — horário da loja: "Aberto agora · fecha às 18h", "Fechado · abre segunda às 8h".
   Puro (sem DOM), testável no Node. Conta no fuso da loja (America/Sao_Paulo), não no do aparelho de quem visita.
   Feriados não entram: vale o horário comercial informado em `loja.horario` no data.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DrysulHorario = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUSO = 'America/Sao_Paulo';
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var SEMANA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // dia da semana (0 = domingo) e minutos desde a meia-noite, no fuso da loja
  function relogio(data, fuso) {
    try {
      var partes = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso || FUSO, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(data);
      var m = {};
      partes.forEach(function (p) { m[p.type] = p.value; });
      var dia = SEMANA_EN.indexOf(m.weekday);
      if (dia >= 0) return { dia: dia, min: (Number(m.hour) % 24) * 60 + Number(m.minute) };
    } catch (e) { /* navegador sem fusos: usa o relógio do aparelho */ }
    return { dia: data.getDay(), min: data.getHours() * 60 + data.getMinutes() };
  }

  function minutos(hhmm) { var p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function hora(min) { var h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? (m < 10 ? '0' : '') + m : ''); }

  // faixa do dia: { abre, fecha } em minutos, ou null se a loja não abre
  function faixa(horario, dia) {
    for (var i = 0; i < (horario || []).length; i++) {
      var h = horario[i];
      if (h.dias.indexOf(dia) >= 0) return { abre: minutos(h.abre), fecha: minutos(h.fecha) };
    }
    return null;
  }

  /* status(data, horario) → { aberto, fechando, texto, detalhe }
     horario: [{ dias: [1, 2, 3, 4, 5], abre: '08:00', fecha: '18:00' }, …] (0 = domingo) */
  function status(data, horario, fuso) {
    var r = relogio(data, fuso), hoje = faixa(horario, r.dia);
    if (hoje && r.min >= hoje.abre && r.min < hoje.fecha) {
      var falta = hoje.fecha - r.min;
      return falta <= 60
        ? { aberto: true, fechando: true, texto: 'Aberto agora', detalhe: 'fecha em ' + falta + ' min' }
        : { aberto: true, fechando: false, texto: 'Aberto agora', detalhe: 'fecha às ' + hora(hoje.fecha) };
    }
    if (hoje && r.min < hoje.abre) return { aberto: false, fechando: false, texto: 'Fechado agora', detalhe: 'abre hoje às ' + hora(hoje.abre) };
    for (var d = 1; d <= 7; d++) {
      var dia = (r.dia + d) % 7, f = faixa(horario, dia);
      if (f) return { aberto: false, fechando: false, texto: 'Fechado agora', detalhe: 'abre ' + (d === 1 ? 'amanhã' : DIAS[dia]) + ' às ' + hora(f.abre) };
    }
    return { aberto: false, fechando: false, texto: 'Fechado agora', detalhe: '' };
  }

  return { status: status, relogio: relogio, hora: hora, faixa: faixa };
});
