/* Painel da loja: só lê e grava pela API (/api/admin), que confere login e papel em cada chamada. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var dataBR = function (s) { return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
  function el(tag, txt, attrs) { var e = document.createElement(tag); if (txt != null) e.textContent = String(txt); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); return e; }
  function erro(msg) { var e = $('#erro'); e.textContent = msg || ''; e.hidden = !msg; }
  function api(metodo, caminho, corpo) {
    return fetch('../api/admin' + caminho, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'content-type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.mensagem || 'Erro ' + r.status); return d; }); });
  }
  function resumo() {
    return api('GET', '/resumo').then(function (d) {
      var box = $('#resumo'); box.textContent = '';
      [['Vendas hoje', d.vendas.hoje], ['Vendas 7 dias', d.vendas.semana], ['Vendas 30 dias', d.vendas.mes]].forEach(function (v) {
        var c = el('div'); c.appendChild(el('span', v[0])); c.appendChild(el('b', BRL.format(v[1].c / 100))); c.appendChild(el('small', v[1].n + ' pedido(s) pagos')); box.appendChild(c);
      });
      d.porRetirada.forEach(function (x) { var c = el('div'); c.appendChild(el('span', 'Pagos · ' + x.status_entrega)); c.appendChild(el('b', x.n)); box.appendChild(c); });
      d.estoqueBaixo.forEach(function (x) { var c = el('div'); c.appendChild(el('span', 'Estoque baixo · ' + x.produto_id)); c.appendChild(el('b', x.quantidade - x.reservado)); box.appendChild(c); });
    });
  }
  function pedidos() {
    var f = new FormData($('#filtro')), q = new URLSearchParams();
    ['status', 'entrega'].forEach(function (k) { if (f.get(k)) q.set(k, f.get(k)); });
    return api('GET', '/pedidos?' + q).then(function (d) {
      var tb = $('#pedidos'); tb.textContent = '';
      if (!d.pedidos.length) { var tr = el('tr'); tr.appendChild(el('td', 'Nenhum pedido.', { colspan: 6 })); tb.appendChild(tr); }
      d.pedidos.forEach(function (p) {
        var tr = el('tr', null, { tabindex: '0' });
        var b = el('td'); b.appendChild(el('button', p.numero, { type: 'button', 'data-id': p.id })); tr.appendChild(b);
        [dataBR(p.criado_em), p.cliente_nome, BRL.format(p.total_centavos / 100), p.status, p.status_entrega].forEach(function (v) { tr.appendChild(el('td', v)); });
        tb.appendChild(tr);
      });
    });
  }
  function acao(rotulo, fn) { var b = el('button', rotulo, { type: 'button' }); b.addEventListener('click', function () { b.disabled = true; fn().then(atualizar, function (e) { erro(e.message); }).then(function () { b.disabled = false; }); }); return b; }
  var aberto = null;
  function detalhe(id) {
    aberto = id;
    return api('GET', '/pedidos/' + id).then(function (d) {
      var p = d.pedido, box = $('#det'); box.textContent = ''; $('#detalhe').hidden = false;
      $('#h-detalhe').textContent = 'Pedido ' + p.numero;
      var dl = el('dl');
      [['Cliente', p.cliente_nome], ['WhatsApp', p.cliente_telefone], ['E-mail', p.cliente_email || '—'], ['Total', BRL.format(p.total_centavos / 100)],
       ['Pagamento', p.status], ['Retirada', p.status_entrega], ['Pago em', dataBR(p.pago_em)], ['Código do comprovante', p.codigo || '—'],
       ['Termos aceitos', (p.termos_versao || '—') + ' em ' + dataBR(p.termos_aceitos_em)], ['Ambiente', p.ambiente]].forEach(function (x) { dl.appendChild(el('dt', x[0])); dl.appendChild(el('dd', x[1])); });
      box.appendChild(dl);
      var itens = el('ul'); d.itens.forEach(function (i) { itens.appendChild(el('li', i.qtd + ' × ' + i.nome + ' (' + i.emb + ') = ' + BRL.format(i.total_centavos / 100))); }); box.appendChild(itens);
      var ac = el('div', null, { class: 'adm__acoes' });
      var proximos = { em_preparacao: ['pronto_retirada'], pronto_retirada: ['retirado', 'em_preparacao'] }[p.status_entrega] || [];
      proximos.forEach(function (s) { ac.appendChild(acao('Retirada: ' + s, function () { return api('POST', '/pedidos/' + p.id + '/entrega', { status: s }); })); });
      if (['aguardando', 'pendente', 'recusado', 'expirado'].indexOf(p.status) !== -1) ac.appendChild(acao('Cancelar pedido', function () { return confirm('Cancelar o pedido ' + p.numero + '?') ? api('POST', '/pedidos/' + p.id + '/cancelar') : Promise.resolve(); }));
      if (p.status === 'pago' || p.status === 'divergente') ac.appendChild(acao('Reembolsar no Mercado Pago', function () {
        if (!confirm('Reembolsar ' + BRL.format(p.total_centavos / 100) + ' do pedido ' + p.numero + '?')) return Promise.resolve();
        return api('POST', '/pedidos/' + p.id + '/reembolsar', { reporEstoque: confirm('Os produtos voltam ao estoque?') });
      }));
      box.appendChild(ac);
      var hist = el('ol'); d.eventos.forEach(function (e) { hist.appendChild(el('li', dataBR(e.criado_em) + ' · ' + e.tipo + ': ' + (e.de || '—') + ' → ' + (e.para || '—') + ' (' + e.origem + ')' + (e.detalhe ? ' · ' + e.detalhe : ''))); });
      box.appendChild(el('h3', 'Histórico')); box.appendChild(hist);
      $('#h-detalhe').focus();
    });
  }
  function estoque() {
    return api('GET', '/estoque').then(function (d) {
      var tb = $('#estoque'); tb.textContent = '';
      d.estoque.forEach(function (x) { var tr = el('tr'); [x.produto_id, x.quantidade, x.reservado, x.quantidade - x.reservado].forEach(function (v) { tr.appendChild(el('td', v)); }); tb.appendChild(tr); });
    });
  }
  function atualizar() { erro(''); return Promise.all([resumo(), pedidos(), estoque(), aberto ? detalhe(aberto) : null]).catch(function (e) { erro(e.message); }); }
  $('#filtro').addEventListener('submit', function (ev) { ev.preventDefault(); pedidos().catch(function (e) { erro(e.message); }); });
  $('#pedidos').addEventListener('click', function (ev) { var b = ev.target.closest('[data-id]') || (ev.target.closest('tr') && ev.target.closest('tr').querySelector('[data-id]')); if (b) detalhe(b.getAttribute('data-id')).catch(function (e) { erro(e.message); }); });
  $('#form-estoque').addEventListener('submit', function (ev) {
    ev.preventDefault(); var f = new FormData(ev.target), q = String(f.get('quantidade') || '').trim();
    api('POST', '/estoque', { produto: String(f.get('produto')).trim(), quantidade: q === '' ? null : Number(q) }).then(atualizar, function (e) { erro(e.message); });
  });
  $('#form-titular').addEventListener('submit', function (ev) {
    ev.preventDefault(); var f = new FormData(ev.target), a = ev.submitter ? ev.submitter.value : 'consultar';
    if (a === 'anonimizar' && !confirm('Anonimizar os dados deste titular nos pedidos não pagos?')) return;
    api('POST', '/titulares', { acao: a, telefone: f.get('telefone'), email: f.get('email') }).then(function (d) { var o = $('#titular'); o.hidden = false; o.textContent = JSON.stringify(d, null, 2); }, function (e) { erro(e.message); });
  });
  api('GET', '/eu').then(function (d) { $('#eu').textContent = d.email + ' · ' + d.papel; return atualizar(); }, function (e) { $('#eu').textContent = ''; erro(e.message); });
})();
