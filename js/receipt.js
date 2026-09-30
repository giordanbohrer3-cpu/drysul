/* Comprovante do pedido: tela, imagem PNG (galeria/WhatsApp), impressão/PDF e compartilhamento.
   DEMONSTRAÇÃO: o comprovante leva marca d'água e não tem valor. Na versão final ele é emitido pelo
   servidor da loja só depois da confirmação do provedor de pagamento, com código assinado e cópia por e-mail. */
(function () {
  'use strict';

  var A = window.DrysulApp, V = window.DrysulVendas, D = window.DRYSUL;
  if (!A || !V || !D) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var BRL = A.BRL, esc = A.esc, loja = D.loja, DEMO = !!(D.vendas && D.vendas.demo);
  var KEY = 'drysul-comprovante';
  var PAG = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', whatsapp: 'Combinar no atendimento' };

  function dataHora(iso) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function recebimento(r) {
    return r.entrega === 'entrega' ? 'Entrega no endereço (taxa combinada no WhatsApp)' : 'Retirada na loja: ' + loja.endereco + ', ' + loja.bairro;
  }

  /* ---------- dados ---------- */
  function montar(o) {
    var r = {
      demo: DEMO,
      numero: o.numero,
      dataISO: new Date().toISOString(),
      status: o.pago ? 'pago' : 'aguardando',
      pagamento: o.pagamento,
      transacao: o.pago ? (DEMO ? 'DEMO-' : '') + Math.random().toString(36).slice(2, 10).toUpperCase() : null,
      entrega: o.entrega,
      cliente: { nome: o.nome, telefone: V.mascararTelefone(o.telefone), email: V.mascararEmail(o.email) },
      itens: o.linhas.map(function (l) {
        var p = A.produto(l.id);
        return { id: l.id, nome: p.nome, emb: p.emb, un: p.un, qtd: l.qtd, unit: p.preco, total: l.total };
      }),
      total: o.total
    };
    r.codigo = V.codigoVerificacao(V.conteudoComprovante(r));
    try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  function ultimo() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } }

  function titulo(r) { return r.status === 'pago' ? 'Comprovante de pagamento' : 'Comprovante de pedido'; }
  function statusTxt(r) {
    if (r.status !== 'pago') return 'Aguardando confirmação da loja';
    return r.demo ? 'Pagamento aprovado (simulado)' : 'Pagamento aprovado';
  }

  /* ---------- HTML ---------- */
  function linhaMeta(k, v) { return v ? '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>' : ''; }
  function html(r) {
    return '<article class="rcpt' + (r.demo ? ' rcpt--demo' : '') + '" aria-label="' + esc(titulo(r)) + ' ' + esc(r.numero) + '">' +
      '<header class="rcpt__head"><svg class="logo logo--light" viewBox="0 0 1752.7 556.3" aria-hidden="true"><use href="#logo-drysul"/></svg>' +
        '<p>' + esc(titulo(r)) + '</p></header>' +
      (r.demo ? '<p class="rcpt__demo">Demonstração · nenhum valor foi cobrado · sem validade</p>' : '') +
      '<div class="rcpt__status rcpt__status--' + r.status + '">' + A.icon(r.status === 'pago' ? 'i-check' : 'i-clock') + '<span>' + esc(statusTxt(r)) + '</span></div>' +
      '<p class="rcpt__total"><small>' + (r.status === 'pago' ? 'Total pago' : 'Total dos produtos') + '</small><strong>' + BRL.format(r.total) + '</strong></p>' +
      '<dl class="rcpt__meta">' +
        linhaMeta('Pedido', r.numero) + linhaMeta('Data e hora', dataHora(r.dataISO)) +
        linhaMeta('Pagamento', PAG[r.pagamento]) + linhaMeta('ID da transação', r.transacao) +
        linhaMeta('Recebimento', recebimento(r)) + linhaMeta('Cliente', r.cliente.nome) +
        linhaMeta('WhatsApp', r.cliente.telefone) + linhaMeta('E-mail', r.cliente.email) +
      '</dl>' +
      '<table class="rcpt__items"><caption class="sr">Itens do pedido</caption><thead><tr><th scope="col">Item</th><th scope="col">Total</th></tr></thead><tbody>' +
        r.itens.map(function (i) {
          return '<tr><td><b>' + i.qtd + ' × ' + esc(i.nome) + '</b><span>' + esc(i.emb) + ' · ' + BRL.format(i.unit) + ' cada</span></td><td>' + BRL.format(i.total) + '</td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<div class="rcpt__code"><span>Código de verificação</span><strong>' + esc(r.codigo) + '</strong><small>Confira com a loja pelo WhatsApp ou na retirada.</small></div>' +
      '<footer class="rcpt__foot"><p>' + esc(loja.nome) + ' — ' + esc(loja.assinatura) + '</p><p>' + esc(loja.endereco) + ' · ' + esc(loja.bairro) + '</p>' +
        '<p>' + esc(loja.telefone) + ' · ' + esc(loja.instagram) + '</p><p>Documento sem valor fiscal. A nota fiscal é emitida pela loja.</p></footer>' +
    '</article>';
  }
  function acoes() {
    var podeCompartilhar = !!(navigator.canShare && window.File);
    return '<div class="rcpt-actions">' +
      '<button class="btn btn--primary" type="button" data-rc="png">' + A.icon('i-download') + '<span>Salvar imagem</span></button>' +
      '<button class="btn btn--outline" type="button" data-rc="print">' + A.icon('i-print') + '<span>Imprimir ou PDF</span></button>' +
      (podeCompartilhar ? '<button class="btn btn--outline" type="button" data-rc="share">' + A.icon('i-share') + '<span>Compartilhar</span></button>' : '') +
      '<a class="btn btn--outline" data-rc="whats" target="_blank" rel="noopener" href="#">' + A.icon('i-whats') + '<span>Enviar para a loja</span></a>' +
    '</div>';
  }

  function mensagemLoja(r) {
    var L = [(r.status === 'pago' ? 'Olá, Drysul! Paguei o pedido ' : 'Olá, Drysul! Quero fazer o pedido ') + r.numero + ' pelo site.', '', '*Itens*'];
    r.itens.forEach(function (i) { L.push('• ' + i.qtd + ' × ' + i.nome + ' — ' + i.emb.toLowerCase() + ' = ' + BRL.format(i.total)); });
    L.push('', 'Total: ' + BRL.format(r.total), 'Pagamento: ' + PAG[r.pagamento] + (r.status === 'pago' ? ' — ' + statusTxt(r).toLowerCase() : ''));
    if (r.transacao) L.push('ID da transação: ' + r.transacao);
    L.push('Recebimento: ' + recebimento(r), 'Código de verificação: ' + r.codigo, 'Data: ' + dataHora(r.dataISO));
    L.push('', 'Nome: ' + r.cliente.nome);
    return L.join('\n').replace(/ /g, ' ');
  }

  /* ---------- imagem PNG (canvas) ---------- */
  var logoImg = null;
  function carregarLogo() {
    if (logoImg) return logoImg;
    logoImg = new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { ok(im); }; im.onerror = function () { ok(null); };
      im.src = 'assets/logo-drysul-claro.svg';
    });
    return logoImg;
  }
  function quebrar(ctx, texto, largura) {
    var palavras = String(texto).split(' '), linhas = [], atual = '';
    palavras.forEach(function (p) {
      var t = atual ? atual + ' ' + p : p;
      if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = p; } else atual = t;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }
  function desenhar(ctx, r, logo, W, medir) {
    var P = 64, y = 0, F = 'Archivo, Arial, sans-serif', txt = function (s) { return String(s).replace(/ /g, ' '); };
    function font(peso, tam, larg) { ctx.font = (larg ? larg + ' ' : '') + peso + ' ' + tam + 'px ' + F; }
    function texto(s, x, yy, cor, alinhar) { if (!medir) { ctx.fillStyle = cor; ctx.textAlign = alinhar || 'left'; ctx.fillText(txt(s), x, yy); } }

    // cabeçalho
    if (!medir) { ctx.fillStyle = '#111A38'; ctx.fillRect(0, 0, W, 190); }
    if (!medir && logo) ctx.drawImage(logo, P, 52, 86 * 1752.7 / 556.3, 86);
    font(800, 26); texto(titulo(r).toUpperCase(), W - P, 108, '#EF5023', 'right');
    y = 190;
    if (r.demo) {
      if (!medir) { ctx.fillStyle = '#FFF1B8'; ctx.fillRect(0, y, W, 64); }
      font(700, 26); texto('DEMONSTRAÇÃO · nenhum valor foi cobrado · sem validade', W / 2, y + 42, '#5B4A00', 'center');
      y += 64;
    }
    // status e total
    y += 70;
    var ok = r.status === 'pago';
    if (!medir) {
      ctx.fillStyle = ok ? '#E8F4EC' : '#FFF1EB'; ctx.beginPath(); ctx.arc(P + 26, y - 12, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ok ? '#1F7A4D' : '#C23E17'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      if (ok) { ctx.moveTo(P + 14, y - 12); ctx.lineTo(P + 23, y - 3); ctx.lineTo(P + 39, y - 22); }
      else { ctx.moveTo(P + 26, y - 26); ctx.lineTo(P + 26, y - 12); ctx.lineTo(P + 36, y - 6); }
      ctx.stroke();
    }
    font(800, 34); texto(statusTxt(r), P + 70, y, ok ? '#1F7A4D' : '#C23E17');
    y += 70;
    font(600, 26); texto(ok ? 'Total pago' : 'Total dos produtos', P, y, '#4E524F');
    y += 78;
    font(850, 84, 'condensed'); texto(BRL.format(r.total), P, y, '#10162B');
    y += 40;
    if (!medir) { ctx.fillStyle = 'rgba(16,22,43,.14)'; ctx.fillRect(P, y, W - 2 * P, 2); }
    y += 24;
    // metadados
    [['Pedido', r.numero], ['Data e hora', dataHora(r.dataISO)], ['Pagamento', PAG[r.pagamento]], ['ID da transação', r.transacao],
     ['Recebimento', recebimento(r)], ['Cliente', r.cliente.nome], ['WhatsApp', r.cliente.telefone], ['E-mail', r.cliente.email]]
      .forEach(function (m) {
        if (!m[1]) return;
        font(600, 24); var lin = quebrar(ctx, txt(m[1]), W - 2 * P - 300);
        y += 40; texto(m[0], P, y, '#4E524F');
        font(700, 26);
        lin.forEach(function (l, i) { texto(l, W - P, y + i * 34, '#10162B', 'right'); });
        y += (lin.length - 1) * 34 + 8;
      });
    y += 30;
    if (!medir) { ctx.fillStyle = 'rgba(16,22,43,.14)'; ctx.fillRect(P, y, W - 2 * P, 2); }
    // itens
    y += 56; font(800, 22, 'expanded'); texto('ITENS', P, y, '#C23E17');
    r.itens.forEach(function (i) {
      font(700, 28); var lin = quebrar(ctx, i.qtd + ' × ' + i.nome, W - 2 * P - 240);
      y += 48;
      lin.forEach(function (l, k) { texto(l, P, y + k * 36, '#10162B'); });
      font(800, 28); texto(BRL.format(i.total), W - P, y, '#10162B', 'right');
      y += (lin.length - 1) * 36 + 36;
      font(500, 23); texto(i.emb + ' · ' + BRL.format(i.unit) + ' cada', P, y, '#4E524F');
      y += 14;
    });
    // código
    y += 40;
    if (!medir) { ctx.fillStyle = '#F5F5F1'; ctx.fillRect(P, y, W - 2 * P, 150); ctx.strokeStyle = '#10162B'; ctx.lineWidth = 3; ctx.strokeRect(P, y, W - 2 * P, 150); }
    font(700, 22); texto('CÓDIGO DE VERIFICAÇÃO', W / 2, y + 44, '#4E524F', 'center');
    font(850, 52, 'condensed'); texto(r.codigo, W / 2, y + 102, '#10162B', 'center');
    font(500, 20); texto('Confira com a loja pelo WhatsApp ou na retirada.', W / 2, y + 134, '#4E524F', 'center');
    y += 150;
    // rodapé
    y += 56; font(700, 24); texto(loja.nome + ' — ' + loja.assinatura, W / 2, y, '#10162B', 'center');
    font(500, 22);
    y += 34; texto(loja.endereco + ' · ' + loja.bairro, W / 2, y, '#4E524F', 'center');
    y += 32; texto(loja.telefone + ' · ' + loja.instagram, W / 2, y, '#4E524F', 'center');
    y += 32; texto('Documento sem valor fiscal. A nota fiscal é emitida pela loja.', W / 2, y, '#4E524F', 'center');
    y += 56;
    if (!medir && r.demo) {
      ctx.save(); ctx.translate(W / 2, y / 2 + 80); ctx.rotate(-0.42);
      font(900, 120, 'condensed'); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(239,80,35,.13)';
      for (var k = -3; k <= 3; k++) ctx.fillText('DEMONSTRAÇÃO', 0, k * 300);
      ctx.restore();
    }
    return y;
  }
  function gerarPng(r) {
    var W = 1080;
    return Promise.all([carregarLogo(), document.fonts ? document.fonts.ready : Promise.resolve()]).then(function (res) {
      var logo = res[0], cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      cv.width = W; cv.height = 10;
      var H = Math.ceil(desenhar(ctx, r, logo, W, true));
      cv.height = H;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      desenhar(ctx, r, logo, W, false);
      return new Promise(function (ok, erro) { cv.toBlob(function (b) { b ? ok(b) : erro(new Error('toBlob')); }, 'image/png'); });
    });
  }
  function nomeArquivo(r) { return 'comprovante-drysul-' + r.numero + '.png'; }

  /* ---------- ações ---------- */
  function ligar(container, r) {
    var wa = $('[data-rc="whats"]', container);
    if (wa) wa.href = loja.whatsUrl + '?text=' + encodeURIComponent(mensagemLoja(r));
    container.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-rc]'); if (!b) return;
      var acao = b.getAttribute('data-rc');
      if (acao === 'png') {
        b.disabled = true;
        gerarPng(r).then(function (blob) {
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = nomeArquivo(r); document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          A.toast('Comprovante salvo como imagem.');
        }).catch(function () { A.toast('Não foi possível gerar a imagem. Use "Imprimir ou PDF".'); })
          .then(function () { b.disabled = false; });
      } else if (acao === 'print') {
        imprimir(r);
      } else if (acao === 'share') {
        gerarPng(r).then(function (blob) {
          var f = new File([blob], nomeArquivo(r), { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: titulo(r), text: titulo(r) + ' ' + r.numero + ' — Drysul' });
          A.toast('Compartilhamento indisponível neste aparelho. Use "Salvar imagem".');
        }).catch(function (e) { if (!e || e.name !== 'AbortError') A.toast('Não foi possível compartilhar.'); });
      }
    });
  }

  function imprimir(r) {
    var raiz = document.getElementById('print-root');
    if (!raiz) { raiz = document.createElement('div'); raiz.id = 'print-root'; document.body.appendChild(raiz); }
    raiz.innerHTML = html(r);
    document.documentElement.classList.add('printing');
    var fim = function () { document.documentElement.classList.remove('printing'); raiz.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(function () { if (!window.matchMedia('print').matches) fim(); }, 1000);
  }

  /* Renderiza comprovante + ações dentro de um contêiner */
  function mostrar(container, r) {
    container.innerHTML = html(r) + acoes();
    ligar(container, r);
  }

  /* Reabrir o último comprovante da visita */
  var dlg = document.getElementById('comprovante');
  function abrirUltimo(origem) {
    var r = ultimo(); if (!r || !dlg) return;
    mostrar($('#rc-body', dlg), r);
    A.abrirDialogo(dlg, origem);
  }
  var btUltimo = document.getElementById('q-last-receipt');
  function atualizarBotao() {
    var r = ultimo();
    if (!btUltimo) return;
    btUltimo.hidden = !r;
    if (r) $('span', btUltimo).textContent = 'Ver comprovante do pedido ' + r.numero;
  }
  if (btUltimo) btUltimo.addEventListener('click', function () {
    var origem = document.getElementById('orcamento')._retorno;
    A.fecharDialogo(document.getElementById('orcamento'));
    abrirUltimo(origem);
  });
  atualizarBotao();

  window.DrysulRecibo = {
    montar: function (o) { var r = montar(o); atualizarBotao(); return r; },
    mostrar: mostrar, mensagemLoja: mensagemLoja, gerarPng: gerarPng, abrirUltimo: abrirUltimo, ultimo: ultimo
  };
})();
