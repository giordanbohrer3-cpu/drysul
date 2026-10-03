/* Drysul — aplicação: catálogo, busca, orçamento, calculadora, navegação e contatos. */
(function () {
  'use strict';

  var D = window.DRYSUL, C = window.DrysulCalc, V = window.DrysulVendas;
  var loja = D.loja;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fmt = C.fmt;

  var produtoPorId = {};
  D.produtos.forEach(function (p) { produtoPorId[p.id] = p; });
  // o que aparece no catálogo e na busca; os itens `catalogo: false` só entram na lista pela calculadora
  var catalogo = D.produtos.filter(function (p) { return p.catalogo !== false; });
  var catPorId = {};
  D.categorias.forEach(function (c) { catPorId[c.id] = c; });

  /* ---------- utilitários ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function ill(id, cls) {
    return '<svg class="ill ' + (cls || '') + '" viewBox="0 0 120 90" aria-hidden="true" focusable="false"><use href="#' + id + '"/></svg>';
  }
  function midia(p, cls) {
    if (!p.foto) return ill(p.icone, cls);
    return '<img src="' + esc(p.foto) + '"' + (p.fotoMini ? ' srcset="' + esc(p.fotoMini) + ' 400w, ' + esc(p.foto) + ' 800w" sizes="(max-width: 720px) 50vw, 400px"' : '') +
      ' width="800" height="600" alt="' + esc(p.nome + ' — ' + p.emb.toLowerCase() + (p.ilustrativa ? ' (imagem ilustrativa)' : '')) + '" loading="lazy" decoding="async">' +
      (p.ilustrativa ? '<span class="foto-nota" aria-hidden="true">Imagem ilustrativa</span>' : '');
  }
  function mini(p) {
    if (!p.foto) return ill(p.icone);
    return '<img class="mini" src="' + esc(p.fotoMini || p.foto) + '" width="104" height="78" alt="" loading="lazy" decoding="async">';
  }
  function precoPartes(v) {
    var s = BRL.format(v).replace(/ /g, ' ');
    return { moeda: 'R$', valor: s.replace('R$', '').trim() };
  }
  function icon(id) { return '<svg class="ic" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  /* ---------- contatos (fonte única: data.js) ---------- */
  var links = { whatsapp: loja.whatsUrl, tel: loja.telUrl, instagram: loja.instagramUrl, maps: loja.mapsUrl };
  $$('[data-store]').forEach(function (el) { el.textContent = loja[el.getAttribute('data-store')] || ''; });
  $$('[data-store-link]').forEach(function (el) { el.href = links[el.getAttribute('data-store-link')]; });
  // preços citados fora do catálogo (ex.: peças do hero) também vêm do data.js
  $$('[data-preco-id]').forEach(function (el) { var p = produtoPorId[el.getAttribute('data-preco-id')]; if (p && p.preco != null) el.textContent = BRL.format(p.preco); });

  /* ---------- toast ---------- */
  var toastEl = $('#toast'), toastTimer;
  // alto: sobe o aviso para não cobrir os botões presos no pé da tela (resultado da calculadora)
  function toast(msg, acao, alto) {
    clearTimeout(toastTimer);
    toastEl.classList.toggle('is-alto', !!alto);
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (acao ? '<button type="button">' + esc(acao.label) + '</button>' : '');
    if (acao) $('button', toastEl).addEventListener('click', function () { hideToast(); acao.run(); });
    requestAnimationFrame(function () { toastEl.classList.add('is-on'); });
    toastTimer = setTimeout(hideToast, 4200);
  }
  function hideToast() { toastEl.classList.remove('is-on'); }

  /* ==========================================================================
     Orçamento — estado da visita (sessionStorage)
     ========================================================================== */
  var KEY = 'drysul-orcamento';
  var q = carregar();

  /* itens: [{id, qtd}] (catálogo e materiais da calculadora); calculos: medidas que geraram itens, para a loja conferir */
  function carregar() {
    var vazio = { itens: [], calculos: [], nome: '', obs: '' };
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY));
      if (!s || !Array.isArray(s.itens)) return vazio;
      s.itens = s.itens.filter(function (i) { return produtoPorId[i.id] && i.qtd > 0; });
      var calculos = Array.isArray(s.calculos) ? s.calculos : [];
      // pedido salvo antes desta versão: a estimativa (bloco único) vira linhas da lista
      if (s.estimativa && Array.isArray(s.estimativa.itens)) {
        s.estimativa.itens.forEach(function (i) {
          if (i.opcional || !produtoPorId[i.ref] || !(i.qtdCompra > 0)) return;
          var l = s.itens.filter(function (x) { return x.id === i.ref; })[0];
          if (l) l.qtd = Math.min(999, l.qtd + i.qtdCompra); else s.itens.push({ id: i.ref, qtd: Math.min(999, i.qtdCompra) });
        });
        calculos.push({ sistema: s.estimativa.sistema, nome: s.estimativa.nome, dims: s.estimativa.dims, area: s.estimativa.area, acabamento: '' });
      }
      return { itens: s.itens, calculos: s.itens.length ? calculos : [], nome: s.nome || '', obs: s.obs || '' };
    } catch (e) { return vazio; }
  }
  function salvar() { try { sessionStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* sem armazenamento: segue em memória */ } }
  function linha(id) { for (var i = 0; i < q.itens.length; i++) if (q.itens[i].id === id) return q.itens[i]; return null; }

  function adicionar(id) {
    var l = linha(id);
    if (l) l.qtd = Math.min(999, l.qtd + 1);
    else q.itens.push({ id: id, qtd: 1 });
    mudou(true);
    toast(produtoPorId[id].nome + ' — adicionado ao pedido', { label: 'Ver pedido', run: abrirOrcamento });
  }
  function definirQtd(id, n) {
    var l = linha(id); if (!l) return;
    n = Math.max(1, Math.min(999, parseInt(n, 10) || 1));
    l.qtd = n; mudou();
  }
  function remover(id) { q.itens = q.itens.filter(function (i) { return i.id !== id; }); mudou(); }
  function mudou(bump) {
    if (!q.itens.length) q.calculos = []; // sem itens, as medidas guardadas não têm mais a que se referir
    salvar(); atualizarContadores(bump); atualizarBotoes(); atualizarFab();
    if (dlg.open) renderOrcamento();
  }
  function totalLinhas() { return q.itens.length; }

  function atualizarContadores(bump) {
    var n = totalLinhas();
    $$('[data-quote-count]').forEach(function (el) {
      el.textContent = n;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }

  function atualizarBotoes() {
    $$('.btn-add').forEach(function (b) {
      var l = linha(b.getAttribute('data-add'));
      b.classList.toggle('is-added', !!l);
      var label = $('span', b);
      if (label) label.textContent = l ? 'Na lista · ' + l.qtd : b.getAttribute('data-rotulo') || 'Adicionar';
      $('use', b).setAttribute('href', l ? '#i-check' : '#i-plus');
    });
    // nos cartões, depois de adicionar, o botão vira − quantidade + (sem abrir o pedido)
    $$('.add-box').forEach(function (box) {
      var l = linha(box.getAttribute('data-box'));
      box.classList.toggle('is-na-lista', !!l);
      $('output', box).textContent = l ? l.qtd : '';
    });
  }
  function diminuir(id) {
    var l = linha(id); if (!l) return;
    if (l.qtd > 1) { definirQtd(id, l.qtd - 1); return; }
    remover(id);
    toast(produtoPorId[id].nome + ' saiu da lista', { label: 'Desfazer', run: function () { adicionar(id); } });
  }

  /* ---------- WhatsApp com mensagem pronta ----------
     Toda conversa já abre com saudação pelo horário (e o nome, se a pessoa preencheu no pedido) e o motivo do contato. */
  function saudacao() { var h = new Date().getHours(); return h >= 5 && h < 12 ? 'Bom dia' : h < 18 && h >= 12 ? 'Boa tarde' : 'Boa noite'; }
  function abertura() {
    var nome = (q.nome || '').trim().split(/\s+/)[0];
    return saudacao() + ', Drysul!' + (nome ? ' Aqui é ' + nome + '.' : '');
  }
  function linkWhats(texto) { return loja.whatsUrl + '?text=' + encodeURIComponent(texto); }
  var MSG_WHATS = {
    contato: function () { return abertura() + ' Vim pelo site e gostaria de atendimento.'; },
    produto: function (p) {
      return abertura() + ' Vi no site o produto “' + p.nome + '” (' + p.emb.toLowerCase() + ').' +
        (p.preco == null ? ' Pode me passar preço e disponibilidade?' : ' Ainda está disponível?');
    },
    busca: function (termo) { return abertura() + ' Procurei por “' + termo + '” no site e não encontrei. Vocês trabalham com esse material?'; }
  };
  function hrefWhats(el) {
    var pid = el.getAttribute('data-whats-produto'), termo = el.getAttribute('data-whats-busca');
    if (pid && produtoPorId[pid]) return linkWhats(MSG_WHATS.produto(produtoPorId[pid]));
    if (termo) return linkWhats(MSG_WHATS.busca(termo));
    return linkWhats(MSG_WHATS.contato());
  }
  // o link é montado na hora do clique (a saudação acompanha o relógio) e também já fica pronto no href
  function prepararWhats(raiz) { $$('[data-whats], [data-whats-produto], [data-whats-busca]', raiz).forEach(function (a) { a.href = hrefWhats(a); }); }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('[data-whats], [data-whats-produto], [data-whats-busca]');
    if (a) a.href = hrefWhats(a);
  }, true);

  /* ---------- mensagem para WhatsApp ---------- */
  function mensagem() {
    var L = [saudacao() + ', Drysul! Gostaria de um orçamento.'];
    if (q.itens.length) {
      L.push('', '*Materiais*');
      q.itens.forEach(function (i) {
        var p = produtoPorId[i.id];
        var preco = p.preco != null ? BRL.format(p.preco) + '/' + p.un : 'sob consulta';
        L.push('• ' + i.qtd + ' × ' + p.nome + ' — ' + p.emb.toLowerCase() + ' (' + preco + ')');
      });
    }
    if (q.calculos.length) {
      L.push('', '*Calculado no site* (quantidades estimadas, para a equipe conferir)');
      q.calculos.forEach(function (c) { L.push('• ' + linhaContexto(c)); });
    }
    var sub = subtotal();
    if (sub.total > 0) L.push('', 'Subtotal de referência (itens com preço): ' + BRL.format(sub.total) + ' — a confirmar');
    if (q.obs.trim()) L.push('', 'Observações: ' + q.obs.trim());
    if (q.nome.trim()) L.push('Nome: ' + q.nome.trim());
    return L.join('\n').replace(/ /g, ' ');
  }
  // "9 chapas ST 1,20 × 2,40 m (consumo 23,52 m²)"; estimativas antigas, sem embalagem, mostram só o consumo
  function qtdEstimativa(i) {
    if (i.qtdCompra == null) return fmt(i.qtd) + ' ' + i.unidade;
    return i.qtdCompra + ' ' + i.unCompra + (i.detCompra ? ' ' + i.detCompra : '') + ' (consumo ' + fmt(i.qtd) + ' ' + i.unidade + ')';
  }
  function descMedidas(e) {
    return e.dims ? fmt(e.dims.comprimento) + ' m de comprimento × ' + fmt(e.dims.altura) + ' m de altura (' + fmt(e.area) + ' m²)' : fmt(e.area) + ' m²';
  }
  function subtotal() {
    var total = 0, consulta = 0, media = 0, nMedia = 0;
    q.itens.forEach(function (i) {
      var p = produtoPorId[i.id], m = D.precosMedios && D.precosMedios.precos[i.id];
      if (p.preco != null) total += Math.round(p.preco * 100) * i.qtd;
      else { consulta++; if (m != null) { media += Math.round(m * 100) * i.qtd; nMedia++; } }
    });
    return { total: total / 100, consulta: consulta, media: media / 100, nMedia: nMedia };
  }

  /* ---------- diálogo ---------- */
  var dlg = $('#orcamento');
  var atualizarFab = function () {};
  var elItens = $('#quote-items'), elEst = $('#quote-estimate'), elVazio = $('#quote-empty'), elSoma = $('#quote-sum');
  var inNome = $('#q-nome'), inObs = $('#q-obs'), btSend = $('#q-send'), btCopy = $('#q-copy'), fallback = $('#q-fallback');
  var elRota = $('#q-route'), btBuy = $('#q-buy');

  function avaliacao() { return V.avaliar(q, produtoPorId, D.vendas); }
  function renderRota() {
    var av = avaliacao(), online = av.canal === 'online';
    elRota.hidden = av.canal === 'vazio';
    btBuy.hidden = !online;
    btSend.classList.toggle('btn--primary', !online);
    btSend.classList.toggle('btn--outline', online);
    $('span', btSend).textContent = online ? 'Prefiro o WhatsApp' : 'Enviar pelo WhatsApp';
    if (av.canal === 'vazio') { elRota.innerHTML = ''; return; }
    elRota.className = 'route ' + (online ? 'route--online' : 'route--whats');
    elRota.innerHTML = online
      ? icon('i-check') + '<div><b>Pode comprar direto pelo site</b><span>Pix ou cartão · retirada na loja ou entrega combinada</span></div>'
      : icon('i-whats') + '<div><b>Este pedido segue pelo WhatsApp</b><ul>' + av.motivos.map(function (m) {
          return '<li>' + esc(V.textoMotivo(m, D.vendas.limiteOnline, function (v) { return BRL.format(v); })) + '</li>';
        }).join('') + '</ul></div>';
  }
  btBuy.addEventListener('click', function () {
    if (avaliacao().canal !== 'online' || !window.DrysulCheckout) return;
    var origem = dlg._retorno;
    fecharDialogo(dlg);
    window.DrysulCheckout.abrir(origem);
  });

  function renderOrcamento() {
    elItens.innerHTML = q.itens.length ? '<ul class="q-list">' + q.itens.map(function (i) {
      var p = produtoPorId[i.id], m = D.precosMedios && D.precosMedios.precos[p.id];
      var preco = p.preco != null ? BRL.format(p.preco) + ' / ' + p.un : m != null ? 'média ≈ ' + BRL.format(m) : 'Sob consulta';
      return '<li class="q-item" data-id="' + esc(p.id) + '">' + mini(p) +
        '<div><p class="q-item__name">' + esc(p.nome) + '</p><p class="q-item__meta">' + esc(p.emb) + ' · ' + preco + '</p></div>' +
        '<div class="q-item__ctrl">' +
          '<button type="button" data-q="dec" aria-label="Diminuir quantidade de ' + esc(p.nome) + '">' + icon('i-minus') + '</button>' +
          '<input type="number" inputmode="numeric" min="1" max="999" value="' + i.qtd + '" aria-label="Quantidade de ' + esc(p.nome) + '">' +
          '<button type="button" data-q="inc" aria-label="Aumentar quantidade de ' + esc(p.nome) + '">' + icon('i-plus') + '</button>' +
          '<button type="button" class="q-rm" data-q="rm" aria-label="Remover ' + esc(p.nome) + '">' + icon('i-trash') + '</button>' +
        '</div></li>';
    }).join('') + '</ul>' : '';

    elEst.innerHTML = q.calculos.length ? '<div class="q-calc">' + icon('i-calc') + '<div><p class="q-calc__t">Calculado no site</p><ul>' +
      q.calculos.map(function (c) { return '<li>' + esc(linhaContexto(c)) + '</li>'; }).join('') +
      '</ul><p class="q-calc__s">As quantidades vieram da calculadora; ajuste à vontade. A equipe confere antes de fechar.</p></div></div>' : '';

    var vazio = totalLinhas() === 0;
    elVazio.hidden = !vazio;
    var sub = subtotal();
    elSoma.hidden = sub.total <= 0 && sub.media <= 0;
    if (sub.media > 0) {
      // há itens sem preço da loja mas com preço médio de mercado: total estimado, como na calculadora
      var semRef = sub.consulta - sub.nMedia;
      elSoma.innerHTML = '<span>Total estimado da lista</span><strong>≈ ' + BRL.format(sub.total + sub.media) + '</strong>' +
        '<span>' + (sub.total > 0 ? BRL.format(sub.total) + ' com preço da loja + ' : '') + '≈ ' + BRL.format(sub.media) + ' por preço médio de mercado' +
        (semRef > 0 ? '. Fora da soma: ' + semRef + (semRef > 1 ? ' itens sob consulta' : ' item sob consulta') : '') + '. Valores confirmados pela equipe.</span>';
    } else if (sub.total > 0) {
      elSoma.innerHTML = '<span>Subtotal dos itens com preço publicado</span><strong>' + BRL.format(sub.total) + '</strong>' +
        '<span>Valor de referência, confirmado pela equipe' + (sub.consulta ? '. Fora da soma: ' + sub.consulta + (sub.consulta > 1 ? ' itens sob consulta' : ' item sob consulta') : '') + '.</span>';
    }
    inNome.value = q.nome; inObs.value = q.obs;
    atualizarEnvio();
  }
  function atualizarEnvio() {
    var vazio = totalLinhas() === 0 && !q.obs.trim();
    btSend.href = loja.whatsUrl + '?text=' + encodeURIComponent(mensagem());
    btSend.setAttribute('aria-disabled', vazio ? 'true' : 'false');
    btCopy.disabled = vazio;
    fallback.hidden = true;
    renderRota();
  }

  function abrirOrcamento(origem) {
    dlg._retorno = origem instanceof Element ? origem : document.activeElement;
    fecharMenu();
    renderOrcamento();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.documentElement.classList.add('dialog-open');
  }
  function fecharDialogo(d) {
    if (d.open) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
  }
  $$('dialog').forEach(function (d) {
    d.addEventListener('close', function () {
      var r = d._retorno, outroAberto = !!document.querySelector('dialog[open]');
      d._retorno = null;
      document.documentElement.classList.toggle('dialog-open', outroAberto);
      if (!outroAberto && r && document.contains(r)) { try { r.focus({ preventScroll: true }); } catch (e) {} }
      atualizarFab();
    });
    d.addEventListener('click', function (ev) { if (ev.target === d) fecharDialogo(d); });
  });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var add = t.closest('[data-add]');
    if (add) {
      adicionar(add.getAttribute('data-add'));
      // o "Adicionar" do cartão some (vira − n +): o foco passa para o "+", sem se perder
      var box = add.classList.contains('btn-add') && add.closest('.add-box');
      if (box && document.activeElement === add) { var mais = $('.qtd-step [data-add]', box); if (mais) mais.focus({ preventScroll: true }); }
      return;
    }
    var menos = t.closest('[data-menos]');
    if (menos) {
      var caixa = menos.closest('.add-box');
      diminuir(menos.getAttribute('data-menos'));
      if (caixa && !caixa.classList.contains('is-na-lista') && document.activeElement === menos) $('.btn-add', caixa).focus({ preventScroll: true });
      return;
    }
    if (t.closest('[data-open-quote]')) { ev.preventDefault(); abrirOrcamento(); return; }
    var op = t.closest('[data-open]');
    if (op) {
      var alvo = document.getElementById(op.getAttribute('data-open'));
      if (alvo) { alvo._retorno = op; fecharMenu(); alvo.showModal ? alvo.showModal() : alvo.setAttribute('open', ''); }
      return;
    }
    var cl = t.closest('[data-close]');
    if (cl) { fecharDialogo(cl.closest('dialog')); return; }
  });

  elItens.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-q]'); if (!b) return;
    var id = b.closest('.q-item').getAttribute('data-id'), l = linha(id);
    var a = b.getAttribute('data-q');
    if (a === 'inc') definirQtd(id, l.qtd + 1);
    else if (a === 'dec') { if (l.qtd > 1) definirQtd(id, l.qtd - 1); }
    else if (a === 'rm') { remover(id); toast('Item removido do pedido'); }
  });
  elItens.addEventListener('change', function (ev) {
    if (ev.target.matches('input')) definirQtd(ev.target.closest('.q-item').getAttribute('data-id'), ev.target.value);
  });
  inNome.addEventListener('input', function () { q.nome = inNome.value; salvar(); atualizarEnvio(); });
  inObs.addEventListener('input', function () { q.obs = inObs.value; salvar(); atualizarEnvio(); });
  btSend.addEventListener('click', function (ev) {
    if (btSend.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); return; }
    btSend.href = loja.whatsUrl + '?text=' + encodeURIComponent(mensagem());
  });
  btCopy.addEventListener('click', function () { copiar(mensagem(), 'Lista copiada — é só colar no WhatsApp ou e-mail.'); });

  function copiar(texto, ok) {
    function manual() {
      fallback.value = texto; fallback.hidden = false; fallback.focus(); fallback.select();
      toast('Selecione o texto e copie (Ctrl+C).');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(function () { toast(ok); }, manual);
    } else manual();
  }

  /* ==========================================================================
     Catálogo
     ========================================================================== */
  var filtro = { q: '', cat: 'todas', ordem: 'padrao' };
  var grid = $('#prod-grid'), info = $('#result-info'), vazioEl = $('#empty');
  var inBusca = $('#busca'), selOrdem = $('#ordem'), chipsEl = $('#filtros');

  function badge(p) {
    if (p.destaque) return '<span class="tag tag--orange">Linha Drysul</span>';
    if (p.oferta) return '<span class="tag">Oferta</span>';
    return '<span class="tag tag--line">Sob consulta</span>';
  }
  function precoHtml(p) {
    if (p.preco == null) return '<p class="price price--consult"><strong>Sob consulta</strong><span>por ' + esc(p.un) + '</span></p>';
    return '<p class="price"><strong>' + BRL.format(p.preco) + '</strong><span>por ' + esc(p.un) + '</span></p>';
  }
  function botaoAdd(p, cls, rotulo) {
    return '<button class="btn btn--sm btn-add ' + (cls || 'btn--outline') + '" type="button" data-add="' + esc(p.id) + '"' + (rotulo ? ' data-rotulo="' + esc(rotulo) + '"' : '') +
      ' aria-label="Adicionar ' + esc(p.nome) + ' à lista">' +
      '<svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg><span>' + esc(rotulo || 'Adicionar') + '</span></button>';
  }
  // cartão: "Adicionar"; já na lista: − quantidade + (o "+" usa o mesmo data-add, o "−" tira uma unidade)
  function caixaAdd(p, cls, rotulo) {
    return '<div class="add-box" data-box="' + esc(p.id) + '">' + botaoAdd(p, cls, rotulo) +
      '<div class="qtd-step" role="group" aria-label="Quantidade de ' + esc(p.nome) + ' na lista">' +
        '<button type="button" data-menos="' + esc(p.id) + '" aria-label="Tirar uma unidade de ' + esc(p.nome) + '">' + icon('i-minus') + '</button>' +
        '<output aria-live="polite"></output>' +
        '<button type="button" data-add="' + esc(p.id) + '" aria-label="Mais uma unidade de ' + esc(p.nome) + '">' + icon('i-plus') + '</button>' +
      '</div></div>';
  }
  // materiais que a calculadora sabe contar: o cartão oferece "Calcular quantidade" no sistema certo
  var CALC_DE = { 'chapa-st': 'parede', 'chapa-ru': 'parede', 'chapa-rf': 'parede', 'montante-70': 'parede', 'guia-70': 'parede',
    'perfil-forro': 'fge', cantoneira: 'fge', massa: 'parede', fita: 'parede', parafuso: 'parede', 'parafuso-metal': 'parede' };
  function cardProduto(p) {
    return '<article class="prod-card" data-tilt data-prod="' + esc(p.id) + '">' +
      '<div class="prod-card__media">' + badge(p) + midia(p) + '</div>' +
      '<div class="prod-card__body">' +
        '<p class="prod-card__cat">' + esc(catPorId[p.cat].nome) + '</p>' +
        '<h3 class="prod-card__name">' + esc(p.nome) + '</h3>' +
        '<p class="prod-card__emb">' + esc(p.emb) + '</p>' +
        '<p class="prod-card__detail">' + esc(p.detalhe) + '</p>' +
        (p.link ? '<a class="prod-card__src" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + icon('i-insta') + 'Ver publicação</a>' : '') +
        (CALC_DE[p.id] ? '<button class="prod-card__src prod-card__calc" type="button" data-calc-system="' + CALC_DE[p.id] + '">' + icon('i-calc') + 'Calcular quantidade</button>' : '') +
        (p.preco == null ? '<a class="prod-card__src prod-card__whats" data-whats-produto="' + esc(p.id) + '" href="' + esc(linkWhats(MSG_WHATS.produto(p))) + '" target="_blank" rel="noopener">' + icon('i-whats') + 'Perguntar<span class="hide-sm">no WhatsApp</span></a>' : '') +
        '<div class="prod-card__foot">' + precoHtml(p) + caixaAdd(p) + '</div>' +
      '</div></article>';
  }

  function rank(p) { return p.destaque ? 0 : p.oferta ? 1 : 2; }
  // com busca, a ordem "Destaques primeiro" vira ordem de relevância (o nome que bate vem antes)
  var aproximado = false;
  function listaFiltrada() {
    var base = catalogo.filter(function (p) { return filtro.cat === 'todas' || p.cat === filtro.cat; });
    aproximado = false;
    if (filtro.q.trim()) {
      var r = buscarProdutos(filtro.q, base);
      aproximado = r.aproximado;
      if (filtro.ordem === 'padrao') return r.lista;
      base = r.lista;
    }
    var lista = base;
    var ix = {}; catalogo.forEach(function (p, i) { ix[p.id] = i; });
    var cmp = {
      padrao: function (a, b) { return rank(a) - rank(b) || ix[a.id] - ix[b.id]; },
      az: function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); },
      za: function (a, b) { return b.nome.localeCompare(a.nome, 'pt-BR'); },
      preco: function (a, b) {
        if (a.preco == null && b.preco == null) return a.nome.localeCompare(b.nome, 'pt-BR');
        if (a.preco == null) return 1; if (b.preco == null) return -1;
        return a.preco - b.preco;
      }
    }[filtro.ordem];
    return lista.sort(cmp);
  }
  function renderCatalogo() {
    var lista = listaFiltrada();
    grid.innerHTML = lista.map(cardProduto).join('');
    vazioEl.hidden = lista.length > 0;
    var cat = filtro.cat === 'todas' ? '' : ' em ' + catPorId[filtro.cat].nome;
    info.textContent = lista.length
      ? (aproximado ? 'Nada com todos os termos. Mais próximos de “' + filtro.q.trim() + '”: ' + lista.length : lista.length + (lista.length > 1 ? ' materiais' : ' material') + cat + (filtro.q.trim() ? ' para “' + filtro.q.trim() + '”' : ''))
      : '';
    atualizarBotoes();
    sugerirCalculo($('#calc-sugestao'), filtro.q);
  }
  function renderChips() {
    var todos = [{ id: 'todas', nome: 'Todos', n: catalogo.length }].concat(D.categorias.map(function (c) {
      return { id: c.id, nome: c.nome, n: catalogo.filter(function (p) { return p.cat === c.id; }).length };
    }));
    chipsEl.innerHTML = todos.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + c.id + '" aria-pressed="' + (filtro.cat === c.id) + '">' + esc(c.nome) + ' <small>' + c.n + '</small></button>';
    }).join('');
  }
  function setCategoria(cat) {
    filtro.cat = cat;
    $$('.chip', chipsEl).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === cat)); });
    renderCatalogo();
  }
  chipsEl.addEventListener('click', function (ev) { var b = ev.target.closest('[data-cat]'); if (b) setCategoria(b.getAttribute('data-cat')); });
  var buscaTimer;
  inBusca.addEventListener('input', function () {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(function () { filtro.q = inBusca.value; renderCatalogo(); }, 120);
  });
  selOrdem.addEventListener('change', function () { filtro.ordem = selOrdem.value; renderCatalogo(); });
  $('#limpar').addEventListener('click', function () {
    inBusca.value = ''; filtro.q = ''; selOrdem.value = 'padrao'; filtro.ordem = 'padrao'; setCategoria('todas'); inBusca.focus();
  });
  function rolar(el) {
    if (window.DrysulMotion && window.DrysulMotion.rolarAte) window.DrysulMotion.rolarAte(el); else el.scrollIntoView({ block: 'start' });
  }
  function irParaCategoria(cat) {
    setCategoria(cat);
    rolar(document.getElementById('produtos'));
  }
  $$('[data-filter-link]').forEach(function (a) {
    a.addEventListener('click', function (ev) { ev.preventDefault(); irParaCategoria(a.getAttribute('data-filter-link')); });
  });

  /* Categorias */
  $('#cat-grid').innerHTML = D.categorias.map(function (c, i) {
    var n = catalogo.filter(function (p) { return p.cat === c.id; }).length;
    return '<button class="cat-card" type="button" data-reveal data-tilt data-cat-go="' + c.id + '">' +
      '<span class="cat-card__n">' + String(i + 1).padStart(2, '0') + '</span>' + ill(c.icone) +
      '<span class="cat-card__t">' + esc(c.nome) + '</span><span class="cat-card__d">' + esc(c.desc) + '</span>' +
      '<span class="cat-card__f"><span>' + n + ' itens no catálogo</span>' + icon('i-arrow') + '</span></button>';
  }).join('');
  $('#cat-grid').addEventListener('click', function (ev) { var b = ev.target.closest('[data-cat-go]'); if (b) irParaCategoria(b.getAttribute('data-cat-go')); });

  /* Destaques */
  $('#dest-grid').innerHTML = catalogo.filter(function (p) { return p.destaque; }).map(function (p) {
    var pr = precoPartes(p.preco);
    return '<article class="dest-card" data-reveal data-tilt>' +
      '<div class="dest-card__media"><span class="tag tag--orange">Linha Drysul</span>' + midia(p) + '</div>' +
      '<div class="dest-card__body">' +
        '<h3 class="dest-card__name">' + esc(p.nome) + '</h3>' +
        '<p class="dest-card__emb">' + esc(p.emb) + '</p>' +
        '<p class="dest-card__price"><small>' + pr.moeda + '</small><strong>' + pr.valor + '</strong><span>/ ' + esc(p.un) + '</span></p>' +
        '<p class="dest-card__detail">' + esc(p.detalhe) + '</p>' +
        caixaAdd(p, 'btn--primary', 'Adicionar à lista') +
      '</div></article>';
  }).join('');

  /* Ofertas */
  $('#offer-grid').innerHTML = catalogo.filter(function (p) { return p.oferta; }).map(function (p) {
    var pr = precoPartes(p.preco);
    return '<article class="offer" data-reveal data-tilt>' +
      '<div class="offer__media"><span class="tag tag--orange">Oferta</span>' + midia(p) + '</div>' +
      '<div class="offer__body">' +
        '<p class="offer__date">' + (p.publicada ? 'Publicada em ' + esc(p.publicada) : 'Publicada no Instagram') + '</p>' +
        '<h3 class="offer__name">' + esc(p.nome) + '</h3><p class="offer__emb">' + esc(p.emb) + '</p>' +
        '<p class="offer__price"><small>' + pr.moeda + '</small><strong>' + pr.valor + '</strong><span>/ ' + esc(p.un) + '</span></p>' +
        '<div class="offer__actions"><a class="prod-card__src" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + icon('i-insta') + 'Ver publicação</a>' + caixaAdd(p) + '</div>' +
      '</div></article>';
  }).join('');

  renderChips();
  renderCatalogo();
  prepararWhats();

  /* ==========================================================================
     Busca rápida — abre pelo cabeçalho, pela tecla / ou por Ctrl+K.
     Resultados na hora (sem acento e em qualquer ordem), com foto, preço, adicionar e WhatsApp.
     ========================================================================== */
  var bDlg = $('#busca-global'), bIn = $('#bg-input'), bCampo = $('#bg-campo'), bLista = $('#bg-lista'), bStatus = $('#bg-status');
  var bVazio = $('#bg-vazio'), bTermo = $('#bg-termo'), bWhats = $('#bg-whats'), bSug = $('#bg-sugestoes');
  var POPULARES = ['parede 4 × 2,8 m', 'forro 12 m²', 'chapa RU', 'parafuso', 'massa', 'montante 70'];
  function marcar(texto, termos) {
    // norm() mantém o comprimento dos nomes do catálogo, então as posições valem para o texto original
    var n = norm(texto), m = [];
    termos.forEach(function (t) { for (var i = n.indexOf(t); i !== -1; i = n.indexOf(t, i + t.length)) m.push([i, i + t.length]); });
    if (!m.length) return esc(texto);
    m.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    m.forEach(function (r) { if (r[0] < pos) r[0] = pos; if (r[1] <= r[0]) return; out += esc(texto.slice(pos, r[0])) + '<mark>' + esc(texto.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
    return out + esc(texto.slice(pos));
  }
  /* Busca do catálogo e da busca rápida: sem acento, em qualquer ordem, entende plural ("parafusos", "perfis") e os
     nomes do balcão ("gesso", "placa", "bucha", "massa corrida"). Todos os termos precisam bater; se nenhum produto tem
     todos, aparecem os que batem mais termos (aproximado). Nome conta mais que descrição. */
  var PARADAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, para: 1, pra: 1, com: 1, e: 1, a: 1, o: 1, as: 1, os: 1, em: 1, no: 1, na: 1,
    um: 1, uma: 1, quero: 1, preciso: 1, comprar: 1, x: 1, por: 1 };
  var SINONIMOS = { gesso: ['chapa', 'drywall'], acartonado: ['chapa', 'drywall'], placa: ['chapa', 'placa'], bucha: ['ancorador', 'parabolt'],
    chumbador: ['parabolt', 'ancorador'], corrida: ['massa'], teto: ['forro'], divisoria: ['drywall'] };
  function variantes(t) {
    var v = [t], sing = t;
    if (t.length > 3) {
      if (/is$/.test(t)) v.push(sing = t.slice(0, -2) + 'il');     // perfis → perfil (e não "perfi", que acha "superfície")
      else if (/oes$/.test(t)) v.push(sing = t.slice(0, -3) + 'ao'); // ...ões → ...ão
      else if (/s$/.test(t)) v.push(sing = t.slice(0, -1));        // parafusos → parafuso
    }
    return v.concat(SINONIMOS[t] || SINONIMOS[sing] || []);
  }
  // "forro de gesso 4x3": as medidas servem ao cálculo; para os produtos, a busca usa só "forro de gesso"
  var MEDIDA = '\\d+(?:[.,]\\d+)?\\s*(?:cm|m2|m²|metros?|m)?';
  var RE_PAR = new RegExp(MEDIDA + '\\s*(?:x|×|\\*|por)\\s*' + MEDIDA, 'gi'), RE_MEDIDA = new RegExp(MEDIDA + '(?![a-z])', 'gi');
  function semMedidas(texto) {
    return C.entender(texto) ? String(texto).replace(RE_PAR, ' ').replace(RE_MEDIDA, ' ') : texto;
  }
  function buscarProdutos(texto, universo) {
    var termos = norm(semMedidas(texto)).split(/\s+/).map(function (t) { return t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''); })
      .filter(function (t) { return t && !PARADAS[t]; });
    if (!termos.length) return { termos: [], lista: [], aproximado: false };
    var grupos = termos.map(variantes), todas = [].concat.apply([], grupos);
    var achados = (universo || catalogo).map(function (p, i) {
      var nome = norm(p.nome), cat = norm(catPorId[p.cat].nome), resto = norm(p.detalhe + ' ' + p.emb), bate = 0, nota = 0;
      var forte = false;
      grupos.forEach(function (vs, g) {
        var melhor = 0;
        // nome começa com o termo 5, palavra do nome 4, dentro do nome 3, categoria 2, descrição ou embalagem 1
        vs.forEach(function (t) {
          var k = nome.indexOf(t);
          melhor = Math.max(melhor, k === 0 ? 5 : k > 0 && nome[k - 1] === ' ' ? 4 : k > 0 ? 3 : cat.indexOf(t) !== -1 ? 2 : resto.indexOf(t) !== -1 ? 1 : 0);
        });
        if (melhor) { bate++; nota += melhor; if (termos[g].length > 2) forte = true; }
      });
      return bate ? { p: p, bate: bate, nota: nota, i: i, forte: forte } : null;
    }).filter(Boolean);
    // aproximado: só o que bate com algum termo de verdade (2 letras, como "lã", aparecem em tudo)
    var todos = achados.filter(function (x) { return x.bate === grupos.length; });
    if (!todos.length) achados = achados.filter(function (x) { return x.forte; });
    var aprox = !todos.length && achados.length > 0;
    var lista = (aprox ? achados : todos).sort(function (a, b) { return b.bate - a.bate || b.nota - a.nota || a.i - b.i; });
    return { termos: todas, lista: lista.map(function (x) { return x.p; }), aproximado: aprox };
  }
  function itemBusca(p, termos, i) {
    var preco = p.preco != null ? '<b>' + BRL.format(p.preco).replace(/\u00a0/g, ' ') + '</b><small>por ' + esc(p.un) + '</small>' : '<b class="is-consulta">Sob consulta</b><small>por ' + esc(p.un) + '</small>';
    return '<li class="bres" style="--i:' + Math.min(i, 8) + '">' +
      '<button class="bres__main" type="button" data-ir-produto="' + esc(p.id) + '">' +
        '<span class="bres__img">' + mini(p) + '</span>' +
        '<span class="bres__txt"><span class="bres__nome">' + marcar(p.nome, termos) + '</span><small>' + esc(catPorId[p.cat].nome) + ' · ' + esc(p.emb) + '</small></span>' +
        '<span class="bres__preco">' + preco + '</span>' +
      '</button>' +
      '<div class="bres__acoes">' + botaoAdd(p, 'btn--outline bres__add') +
        '<a class="bres__whats" data-whats-produto="' + esc(p.id) + '" href="' + esc(linkWhats(MSG_WHATS.produto(p))) + '" target="_blank" rel="noopener" aria-label="Perguntar sobre ' + esc(p.nome) + ' no WhatsApp" title="Perguntar no WhatsApp">' + icon('i-whats') + '</a>' +
      '</div></li>';
  }
  var bTimer = 0, bObra = null;
  // "parede 4 × 2,8 m" na busca: o primeiro resultado é o cálculo da obra, com a lista de materiais
  function itemCalculo(obra) {
    var falta = obra.faltando.length;
    return '<li class="bres bres--calc" style="--i:0"><button class="bres__main" type="button" data-calc-obra>' +
      '<span class="bres__img bres__img--calc">' + icon('i-calc') + '</span>' +
      '<span class="bres__txt"><span class="bres__nome">Calcular ' + esc(obra.rotulo) + '</span>' +
      '<small>' + (falta ? 'Informe as medidas e veja materiais e quantidades' : 'Materiais, quantidades e preço estimado') + (obra.acabamento ? ' · ' + esc(obra.acabamento.nome) : '') + '</small></span>' +
      '<span class="bres__preco"><b>Calcular</b>' + icon('i-arrow') + '</span></button></li>';
  }
  function renderBusca() {
    var texto = bIn.value.trim(), r = buscarProdutos(texto);
    bObra = C.entender(texto);
    var n = r.lista.length;
    bSug.hidden = !!texto;
    bVazio.hidden = !texto || n > 0 || !!bObra;
    bLista.innerHTML = (bObra ? itemCalculo(bObra) : '') + r.lista.map(function (p, i) { return itemBusca(p, r.termos, i + (bObra ? 1 : 0)); }).join('');
    if (texto && !n) { bTermo.textContent = '“' + texto + '”'; bWhats.setAttribute('data-whats-busca', texto); bWhats.href = linkWhats(MSG_WHATS.busca(texto)); }
    bStatus.textContent = !texto ? '' : (bObra ? 'Cálculo da obra' + (n ? ' e ' : '') : '') +
      (n ? (r.aproximado ? 'resultados aproximados: ' : '') + n + (n > 1 ? ' produtos' : ' produto') : bObra ? '' : 'Nenhum produto encontrado');
    atualizarBotoes();
    // a linha laranja corre por baixo do campo a cada busca
    bCampo.classList.remove('is-buscando'); void bCampo.offsetWidth; bCampo.classList.add('is-buscando');
  }
  $('#bg-cats').innerHTML = D.categorias.map(function (c) {
    return '<button class="chip" type="button" data-bg-cat="' + c.id + '"><svg class="chip__ic" viewBox="0 0 120 90" aria-hidden="true"><use href="#' + c.icone + '"/></svg>' + esc(c.nome) + '</button>';
  }).join('');
  $('#bg-populares').innerHTML = POPULARES.map(function (t) { return '<button class="chip" type="button" data-bg-termo="' + esc(t) + '">' + icon('i-search') + esc(t) + '</button>'; }).join('');

  function abrirBusca(origem, texto) {
    if (!bDlg) return;
    bDlg._retorno = origem instanceof Element ? origem : document.activeElement;
    fecharMenu();
    if (typeof texto === 'string') bIn.value = texto;
    renderBusca();
    if (typeof bDlg.showModal === 'function') bDlg.showModal(); else bDlg.setAttribute('open', '');
    document.documentElement.classList.add('dialog-open');
    bIn.focus(); bIn.select();
  }
  function irProduto(id) {
    bDlg._retorno = null; // o foco vai para o produto, não de volta ao botão da busca
    fecharDialogo(bDlg);
    filtro.q = ''; inBusca.value = ''; selOrdem.value = 'padrao'; filtro.ordem = 'padrao'; setCategoria('todas');
    var card = grid.querySelector('[data-prod="' + id + '"]');
    if (!card) return;
    // o cartão fica no meio da tela (abaixo do cabeçalho)
    var y = Math.max(0, card.getBoundingClientRect().top + window.scrollY - Math.max(90, (window.innerHeight - card.offsetHeight) / 2));
    if (window.DrysulMotion && window.DrysulMotion.rolarAte) window.DrysulMotion.rolarAte(y);
    else window.scrollTo({ top: y, behavior: 'auto' });
    card.classList.remove('is-achado'); void card.offsetWidth; card.classList.add('is-achado');
    setTimeout(function () { card.classList.remove('is-achado'); }, 2400);
    var botao = $('[data-add]', card); if (botao) setTimeout(function () { botao.focus({ preventScroll: true }); }, 60);
  }
  if (bDlg) {
    bIn.addEventListener('input', function () { clearTimeout(bTimer); bTimer = setTimeout(renderBusca, 90); });
    bDlg.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-calc-obra]')) { bDlg._retorno = null; fecharDialogo(bDlg); calcularObra(bObra); return; }
      var ir = ev.target.closest('[data-ir-produto]'); if (ir) { irProduto(ir.getAttribute('data-ir-produto')); return; }
      var cat = ev.target.closest('[data-bg-cat]');
      if (cat) { bDlg._retorno = null; fecharDialogo(bDlg); irParaCategoria(cat.getAttribute('data-bg-cat')); return; }
      var termo = ev.target.closest('[data-bg-termo]');
      if (termo) { bIn.value = termo.getAttribute('data-bg-termo'); renderBusca(); bIn.focus(); return; }
      if (ev.target.closest('[data-open-quote]')) { bDlg._retorno = null; fecharDialogo(bDlg); }
    });
    // setas: do campo para a lista e entre os resultados; Enter no campo abre o primeiro
    bDlg.addEventListener('keydown', function (ev) {
      var itens = $$('.bres__main', bLista), i = itens.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' && itens.length) { ev.preventDefault(); (itens[i + 1] || itens[0]).focus(); }
      else if (ev.key === 'ArrowUp' && itens.length) { ev.preventDefault(); if (i <= 0) bIn.focus(); else itens[i - 1].focus(); }
      else if (ev.key === 'Enter' && document.activeElement === bIn && itens.length) { ev.preventDefault(); itens[0].click(); }
    });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-open-busca]');
    if (b) { ev.preventDefault(); abrirBusca(b); }
  });
  document.addEventListener('keydown', function (ev) {
    if (!bDlg || bDlg.open || document.querySelector('dialog[open]')) return;
    var t = ev.target, digitando = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((ev.key === '/' && !digitando && !ev.ctrlKey && !ev.metaKey && !ev.altKey) || ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K'))) {
      ev.preventDefault(); abrirBusca(document.activeElement);
    }
  });

  // dica digitada na barra do cabeçalho (só com efeitos; para quando a aba some ou a busca está aberta)
  (function dicaDigitada() {
    var el = $('#search-dica'); if (!el) return;
    var frases = ['chapa RU', 'parede 4 × 2,8 m', 'parafuso GN25', 'massa 25 kg', 'forro 12 m²', 'montante 70', 'fita de papel'], f = 0, n = el.textContent.length, apagando = false;
    var larga = window.matchMedia('(min-width: 1240px)'); // abaixo disso a barra vira só a lupa e a dica fica escondida
    function passo() {
      var ativo = larga.matches && document.documentElement.classList.contains('motion-on') && !document.hidden && !(bDlg && bDlg.open);
      if (!ativo) { el.textContent = frases[f]; setTimeout(passo, 1200); return; }
      var alvo = frases[f];
      if (!apagando) { n++; el.textContent = alvo.slice(0, n); if (n >= alvo.length) { apagando = true; return setTimeout(passo, 1900); } return setTimeout(passo, 85); }
      n--; el.textContent = alvo.slice(0, Math.max(0, n));
      if (n <= 0) { apagando = false; f = (f + 1) % frases.length; return setTimeout(passo, 380); }
      setTimeout(passo, 40);
    }
    setTimeout(passo, 2600);
  })();

  /* ==========================================================================
     Calculadora
     ========================================================================== */
  var calc = { sistema: 'parede', valores: { altura: '', comprimento: '', area: '' }, resultado: null, acabamento: null, naLista: false };
  var tabs = $('#calc-systems'), form = $('#calc-form'), campos = $('#calc-fields'), desc = $('#calc-desc'), res = $('#calc-result');

  tabs.innerHTML = C.SISTEMAS.map(function (s, i) {
    return '<button class="calc-tab" type="button" id="tab-' + s.id + '" aria-controls="calc-form" data-sys="' + s.id + '" aria-pressed="' + (s.id === calc.sistema) + '">' +
      '<svg class="calc-tab__ic" viewBox="0 0 48 36" aria-hidden="true" focusable="false"><use href="#s-' + s.id + '"/></svg>' +
      '<small>' + String(i + 1).padStart(2, '0') + '</small>' + esc(s.curto) + '</button>';
  }).join('');

  function campoHtml(nome, rotulo, un, dica) {
    return '<div class="field"><label for="c-' + nome + '"><span>' + rotulo + '</span></label>' +
      '<div class="unit-input"><input id="c-' + nome + '" name="' + nome + '" inputmode="decimal" autocomplete="off" value="' + esc(calc.valores[nome]) + '" aria-describedby="c-' + nome + '-msg"><b>' + un + '</b></div>' +
      '<p class="field__hint" id="c-' + nome + '-msg">' + dica + '</p></div>';
  }
  function renderSistema() {
    var s = C.sistema(calc.sistema);
    $$('.calc-tab', tabs).forEach(function (t) {
      var on = t.getAttribute('data-sys') === s.id;
      t.setAttribute('aria-pressed', String(on));
    });
    form.setAttribute('aria-label', 'Medidas — ' + s.nome);
    desc.textContent = s.desc;
    campos.innerHTML = s.entrada === 'dimensoes'
      ? campoHtml('altura', 'Altura', 'm', 'Máximo de ' + fmt(s.alturaMax) + ' m para este sistema.') + campoHtml('comprimento', 'Comprimento', 'm', 'Soma dos trechos, em metros.')
      : campoHtml('area', 'Área do forro', 'm²', 'Comprimento × largura do ambiente.');
    if (calc.resultado && calc.resultado.sistema !== s.id) marcarDesatualizado();
    renderViz();
  }

  /* Desenho técnico ao vivo: elevação (paredes e revestimentos) ou planta (forros), em escala com as medidas */
  var vizEl = $('#calc-viz'), vizCap = $('#calc-viz-cap');
  function medida(v) { var n = C.parseNumero(v); return isFinite(n) && n > 0 ? n : null; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function renderViz() {
    if (!vizEl) return;
    var s = C.sistema(calc.sistema), W = 360, H = 210, g = '', exemplo = false, legenda;
    if (s.entrada === 'dimensoes') {
      var A = medida(calc.valores.altura), L = medida(calc.valores.comprimento);
      if (!A || !L) { exemplo = true; A = A || Math.min(2.8, s.alturaMax); L = L || 4; }
      var Ad = Math.min(A, s.alturaMax * 2), Ld = Math.min(L, 40);
      var k = Math.min((W - 84) / Ld, (H - 58) / Ad), w = Ld * k, h = Ad * k;
      var x0 = 56 + ((W - 84) - w) / 2, y0 = 14 + ((H - 58) - h) / 2;
      if (s.id !== 'parede') g += '<rect class="v-wall" x="' + r1(x0 - 9) + '" y="' + r1(y0 - 7) + '" width="' + r1(w + 18) + '" height="' + r1(h + 14) + '"/>';
      var n = 0;
      for (var px = 0; px < Ld - 1e-6; px += 1.2) {
        var pw = Math.min(1.2, Ld - px) * k;
        g += '<rect class="v-plate" style="--n:' + (n++) + '" x="' + r1(x0 + px * k) + '" y="' + r1(y0) + '" width="' + r1(pw) + '" height="' + r1(h) + '"/>';
      }
      if (s.id === 'parede' || s.id === 'estruturado') {
        var passo = Ld / 0.6 > 60 ? 1.2 : 0.6;
        for (var sx = 0; sx <= Ld + 1e-6; sx += passo) g += '<line class="v-stud" x1="' + r1(x0 + sx * k) + '" y1="' + r1(y0) + '" x2="' + r1(x0 + sx * k) + '" y2="' + r1(y0 + h) + '"/>';
        g += '<line class="v-guide" x1="' + r1(x0) + '" y1="' + r1(y0) + '" x2="' + r1(x0 + w) + '" y2="' + r1(y0) + '"/><line class="v-guide" x1="' + r1(x0) + '" y1="' + r1(y0 + h) + '" x2="' + r1(x0 + w) + '" y2="' + r1(y0 + h) + '"/>';
      } else {
        var pd = Math.max(0.4, Math.sqrt(Ld * Ad / 320), 9 / k); // pontos de cola: no máximo ~320 e nunca colados uns nos outros no desenho
        for (var cx = pd * 0.75; cx < Ld; cx += pd) for (var cy = pd * 0.75; cy < Ad; cy += pd) g += '<circle class="v-dot" cx="' + r1(x0 + cx * k) + '" cy="' + r1(y0 + cy * k) + '" r="1.6"/>';
      }
      var yb = y0 + h + 18;
      g += '<path class="v-dim" d="M' + r1(x0) + ' ' + r1(yb) + 'H' + r1(x0 + w) + 'M' + r1(x0) + ' ' + r1(yb - 5) + 'v10M' + r1(x0 + w) + ' ' + r1(yb - 5) + 'v10"/>' +
        '<text class="v-txt" x="' + r1(x0 + w / 2) + '" y="' + r1(yb + 15) + '" text-anchor="middle">' + fmt(L) + ' m</text>';
      var xl = x0 - 20;
      g += '<path class="v-dim" d="M' + r1(xl) + ' ' + r1(y0) + 'V' + r1(y0 + h) + 'M' + r1(xl - 5) + ' ' + r1(y0) + 'h10M' + r1(xl - 5) + ' ' + r1(y0 + h) + 'h10"/>' +
        '<text class="v-txt" x="' + r1(xl - 8) + '" y="' + r1(y0 + h / 2) + '" text-anchor="middle" transform="rotate(-90 ' + r1(xl - 8) + ' ' + r1(y0 + h / 2) + ')">' + fmt(A) + ' m</text>';
      legenda = exemplo ? 'Exemplo: ' + s.curto.toLowerCase() + ' de ' + fmt(L) + ' × ' + fmt(A) + ' m. Digite as medidas para ver a sua.' :
        s.nome + ': ' + fmt(L) + ' m × ' + fmt(A) + ' m' + (A > s.alturaMax ? ' (acima do limite de ' + fmt(s.alturaMax) + ' m)' : '');
    } else {
      var Ar = medida(calc.valores.area); if (!Ar) { exemplo = true; Ar = 12; }
      var lado = Math.sqrt(Math.min(Ar, 3000)), kk = Math.min((W - 60) / lado, (H - 40) / lado), sz = lado * kk;
      var qx = (W - sz) / 2, qy = (H - sz) / 2 - 4;
      g += '<rect class="v-plate" style="--n:0" x="' + r1(qx) + '" y="' + r1(qy) + '" width="' + r1(sz) + '" height="' + r1(sz) + '"/>';
      var pas = s.id === 'fge' ? 0.6 : 1.2;
      if (lado / pas > 30) pas = lado / 30;
      for (var gy = pas; gy < lado - 1e-6; gy += pas) g += '<line class="' + (s.id === 'fge' ? 'v-stud' : 'v-seam') + '" x1="' + r1(qx) + '" y1="' + r1(qy + gy * kk) + '" x2="' + r1(qx + sz) + '" y2="' + r1(qy + gy * kk) + '"/>';
      var ph = Math.max(1.2, lado / 11); // pendurais: no máximo ~11 × 11 no desenho
      if (s.id === 'fge') for (var hx = ph / 2; hx < lado; hx += ph) for (var hy = ph / 2; hy < lado; hy += ph) g += '<circle class="v-hang" cx="' + r1(qx + hx * kk) + '" cy="' + r1(qy + hy * kk) + '" r="2.4"/>';
      g += '<text class="v-txt v-txt--big" x="' + r1(W / 2) + '" y="' + r1(qy + sz / 2 + 7) + '" text-anchor="middle">' + fmt(Ar) + ' m²</text>';
      legenda = exemplo ? 'Exemplo: forro de ' + fmt(Ar) + ' m², visto de cima. Digite a área para ver o seu.' : s.nome + ': ' + fmt(Ar) + ' m², visto de cima';
    }
    vizEl.innerHTML = '<svg class="viz' + (exemplo ? ' is-exemplo' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" focusable="false">' + g + '</svg>';
    if (vizCap) vizCap.textContent = legenda;
  }
  function selecionarSistema(id, foco) {
    calc.sistema = id; renderSistema();
    var box = vizEl && vizEl.parentNode;
    if (box) { box.classList.remove('is-novo'); void box.offsetWidth; box.classList.add('is-novo'); clearTimeout(box._t); box._t = setTimeout(function () { box.classList.remove('is-novo'); }, 1200); }
    if (foco) { var f = $('input', campos); if (f) f.focus({ preventScroll: true }); }
  }
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest('[data-sys]'); if (b) selecionarSistema(b.getAttribute('data-sys')); });
  campos.addEventListener('input', function (ev) {
    if (!ev.target.name) return;
    calc.valores[ev.target.name] = ev.target.value;
    renderViz();
    if (ev.target.getAttribute('aria-invalid') === 'true') limparErro(ev.target);
    if (calc.resultado) marcarDesatualizado();
  });
  function limparErro(input) {
    input.removeAttribute('aria-invalid');
    var m = $('#' + input.id + '-msg'); m.className = 'field__hint'; m.textContent = m.getAttribute('data-hint') || m.textContent;
  }
  function marcarDesatualizado() {
    res.classList.add('is-stale');
    $$('[data-res-action]', res).forEach(function (b) { b.disabled = true; });
  }

  form.addEventListener('submit', function (ev) { ev.preventDefault(); calcularAgora(); });
  function calcularAgora() {
    var r = C.calcular(calc.sistema, calc.valores);
    $$('input', campos).forEach(function (inp) {
      var m = $('#' + inp.id + '-msg');
      if (!m.hasAttribute('data-hint')) m.setAttribute('data-hint', m.textContent);
      var erro = !r.ok && r.erros[inp.name];
      if (erro) { inp.setAttribute('aria-invalid', 'true'); m.className = 'field__err'; m.textContent = erro; }
      else { inp.removeAttribute('aria-invalid'); m.className = 'field__hint'; m.textContent = m.getAttribute('data-hint'); }
    });
    if (!r.ok) { var f = $('[aria-invalid="true"]', campos); if (f) f.focus(); return false; }
    calc.resultado = r; calc.naLista = false;
    calc.orcamento = C.orcar(r, precoCalc);
    renderResultado(r, calc.orcamento);
    return true;
  }
  // depois de calcular, a tela vai até o resultado: no computador, o painel inteiro (medidas, desenho e lista);
  // no celular, direto na lista de materiais. A posição vem do layout (offsetTop), e não da tela: as entradas
  // animadas e o 3D da rolagem deslocam o painel enquanto ele ainda está chegando.
  function topoReal(el) { var y = 0; for (var e = el; e; e = e.offsetParent) y += e.offsetTop; return y; }
  function irParaCalc(el) {
    var cel = window.matchMedia('(max-width: 1023px)').matches, y = Math.max(0, topoReal(el) - (cel ? 58 : 62) - 12);
    if (window.DrysulMotion && window.DrysulMotion.rolarAte) window.DrysulMotion.rolarAte(y); else window.scrollTo({ top: y });
  }
  function mostrarResultado() { irParaCalc(window.matchMedia('(max-width: 1023px)').matches ? res : $('.calc__panel')); }

  /* ---------- atalho "descreva a obra": texto → sistema e medidas → cálculo → lista ----------
     Vem do topo da página, do topo da calculadora, da busca rápida e da busca do catálogo. */
  function calcularObra(obra) {
    if (!obra) return;
    calc.sistema = obra.sistema;
    calc.valores = { altura: obra.valores.altura || '', comprimento: obra.valores.comprimento || '', area: obra.valores.area || '' };
    calc.acabamento = obra.acabamento || null;
    renderSistema();
    if (obra.faltando.length) {
      irParaCalc($('#atalho-calc') || document.getElementById('calculadora'));
      var nomes = { altura: 'a altura', comprimento: 'o comprimento', area: 'a área' };
      atalhoMsg('Falta ' + obra.faltando.map(function (k) { return nomes[k]; }).join(' e ') + ' para calcular ' + obra.nome.toLowerCase() + '.');
      setTimeout(function () { var f = $('[name="' + obra.faltando[0] + '"]', campos); if (f) f.focus({ preventScroll: true }); }, 450);
      return;
    }
    atalhoMsg('');
    if (calcularAgora()) setTimeout(mostrarResultado, 30);
    else irParaCalc($('.calc__panel'));
  }
  function atalhoMsg(t) { var m = $('#atalho-calc-msg'); if (m) m.textContent = t; }
  $$('[data-atalho-form]').forEach(function (f) {
    var inp = $('input', f);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var texto = inp.value.trim();
      if (!texto) { inp.focus(); return; }
      var obra = C.entender(texto);
      if (obra) { inp.blur(); calcularObra(obra); return; }
      // não é obra: vira busca de produto
      inp.blur(); abrirBusca(f, texto);
    });
  });
  $$('[data-atalho]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.closest('[data-atalho-form]'), inp = f && $('input', f);
      if (inp) inp.value = b.getAttribute('data-atalho');
      calcularObra(C.entender(b.getAttribute('data-atalho')));
    });
  });
  // busca do catálogo com cara de obra ("parede 4x2,8"): oferece o cálculo acima dos produtos
  function sugerirCalculo(el, texto) {
    if (!el) return;
    var obra = texto && texto.trim() ? C.entender(texto) : null;
    el.hidden = !obra;
    if (!obra) { el.innerHTML = ''; return; }
    el._obra = obra;
    el.innerHTML = icon('i-calc') + '<span>Parece uma obra: <b>' + esc(obra.rotulo) + '</b>. Calcule os materiais e as quantidades de uma vez.</span>' +
      '<button class="btn btn--primary btn--sm" type="button" data-sugestao-calc><span>Calcular materiais</span>' + icon('i-arrow') + '</button>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-sugestao-calc]');
    if (b) calcularObra(b.parentNode._obra);
  });

  // preço de cada material na estimativa: o da loja (produto com preço) ou o médio de mercado (data.js)
  function precoCalc(ref) {
    var p = produtoPorId[ref];
    if (p && p.preco != null) return { preco: p.preco, fonte: 'loja' };
    var m = D.precosMedios && D.precosMedios.precos[ref];
    return m != null ? { preco: m, fonte: 'media' } : null;
  }
  function renderResultado(r, o) {
    res.classList.remove('is-stale');
    res.innerHTML =
      '<div class="res__head"><div><p class="res__sys">' + esc(r.nome) + '</p><p class="res__dims">' +
        (r.dims ? fmt(r.dims.comprimento) + ' m × ' + fmt(r.dims.altura) + ' m de altura' : 'Área informada') + '</p></div>' +
        '<p class="res__area">' + conta(r.area) + '<small>m²</small></p></div>' +
      '<p class="stale-note">Medidas alteradas — calcule novamente para atualizar.</p>' +
      '<ul class="res__list">' + o.itens.map(function (i, n) {
        var preco = i.subtotal != null
          ? '<b>' + BRL.format(i.subtotal) + '</b><small>' + (i.fonte === 'media' ? '≈ ' : '') + BRL.format(i.preco) + '/' + esc(i.unSing) +
            (i.fonte === 'loja' ? ' · Drysul' : ' · média') + '</small>'
          : '<b class="is-consulta">Sob consulta</b>';
        return '<li style="--i:' + n + '"' + (i.opcional ? ' class="is-opc"' : '') + '>' + ill(ICONE_ITEM[i.id] || 'p-caixa', 'res__ic') +
          '<span class="res__nome">' + esc(i.nome) + '<small><b>' + conta(i.qtdCompra) + ' ' + esc(i.unCompra) + '</b>' +
            (i.detCompra ? ' ' + esc(i.detCompra) : '') + ' · consumo ' + fmt(i.qtd) + ' ' + esc(i.unidade) + '</small></span>' +
          '<span class="res__preco">' + preco + '</span></li>';
      }).join('') + '</ul>' +
      totalResultado(o) +
      (calc.acabamento ? '<p class="res__acab">' + icon('i-spark') + '<span>Acabamento desejado: <b>' + esc(calc.acabamento.nome) + '</b>. Vai junto no pedido.</span>' +
        (calc.acabamento.id ? '<button class="link-arrow" type="button" data-res-action="simular">Ver como fica ' + icon('i-arrow') + '</button>' : '') + '</p>' : '') +
      (o.itens.some(function (i) { return i.opcional; }) ? '<label class="res__opc"><input type="checkbox" data-res-opc> Incluir os opcionais na lista (' +
        esc(o.itens.filter(function (i) { return i.opcional; }).map(function (i) { return i.nome.replace(/\s*\(opcional\)/, '').toLowerCase(); }).join(', ')) + ')</label>' : '') +
      '<div class="res__actions">' +
        '<button class="btn btn--primary" type="button" data-res-action="lista">' + icon('i-list') + '<span>Adicionar à lista</span></button>' +
        '<a class="btn btn--whats" data-res-action="whats" href="' + esc(linkWhats(mensagemCalculo())) + '" target="_blank" rel="noopener">' + icon('i-whats') + '<span>Enviar pelo WhatsApp</span></a>' +
        '<button class="btn btn--outline btn--icone" type="button" data-res-action="copiar" aria-label="Copiar a lista de materiais" title="Copiar a lista">' + icon('i-copy') + '</button>' +
      '</div>';
    contarNumeros(res);
  }
  // botão principal do resultado: "Adicionar à lista" → depois de adicionar, "Ver lista e pedir orçamento"
  function marcarNaLista() {
    var b = $('[data-res-action="lista"], [data-res-action="ver"]', res); if (!b) return;
    b.setAttribute('data-res-action', calc.naLista ? 'ver' : 'lista');
    b.innerHTML = calc.naLista ? icon('i-check') + '<span>Ver lista e pedir orçamento</span>' : icon('i-list') + '<span>Adicionar à lista</span>';
  }
  // mensagem só deste cálculo (sem preços: quem confirma valores é a loja)
  function contextoCalculo(r) {
    return { sistema: r.sistema, nome: r.nome, dims: r.dims, area: r.area, acabamento: calc.acabamento ? calc.acabamento.nome : '' };
  }
  function linhaContexto(c) { return c.nome + ' — ' + descMedidas(c) + (c.acabamento ? ' · acabamento: ' + c.acabamento : ''); }
  function mensagemCalculo() {
    var r = calc.resultado; if (!r) return MSG_WHATS.contato();
    var L = [abertura() + ' Fiz o cálculo no site e gostaria de um orçamento.', '', '*' + linhaContexto(contextoCalculo(r)) + '*'];
    r.itens.forEach(function (i) { L.push('• ' + i.nome + ': ' + qtdEstimativa(i)); });
    L.push('', 'Quantidades estimadas pela calculadora do site, para a equipe conferir.');
    return L.join('\n');
  }
  // todos os materiais do cálculo viram linhas da lista (somando com o que já estava), com a medida guardada no pedido
  function adicionarCalculo() {
    var r = calc.resultado; if (!r) return;
    var opc = !!$('[data-res-opc]:checked', res), n = 0;
    r.itens.forEach(function (i) {
      if ((i.opcional && !opc) || !produtoPorId[i.ref]) return;
      var l = linha(i.ref);
      if (l) l.qtd = Math.min(999, l.qtd + i.qtdCompra); else q.itens.push({ id: i.ref, qtd: Math.min(999, i.qtdCompra) });
      n++;
    });
    q.calculos.push(contextoCalculo(r));
    calc.naLista = true;
    mudou(true);
    marcarNaLista();
    toast(n + ' materiais de ' + r.nome.toLowerCase() + ' na lista', { label: 'Ver lista', run: abrirOrcamento }, true);
  }
  function totalResultado(o) {
    var fora = [], media = o.itens.some(function (i) { return i.fonte === 'media'; });
    o.itens.forEach(function (i) { if (i.opcional && i.subtotal != null) fora.push(i.nome.replace(/\s*\(opcional\)/, '') + ' (opcional): + ' + BRL.format(i.subtotal)); });
    if (o.semPreco) fora.push(o.semPreco + (o.semPreco > 1 ? ' itens sob consulta' : ' item sob consulta'));
    return '<div class="res__total"><div><p>Total estimado dos materiais</p>' + (fora.length ? '<small>Fora do total: ' + esc(fora.join(' · ')) + '</small>' : '') + '</div>' +
      '<b>' + (media ? '≈ ' : '') + BRL.format(o.total) + '</b></div>' +
      '<p class="res__nota">Embalagens arredondadas para cima. “≈ média” = preço médio de mercado (' + esc(D.precosMedios.data) + '); “Drysul” = preço da loja. ' +
      'O valor final é confirmado pela loja no orçamento.</p>';
  }
  // números do resultado sobem de 0 até o valor (só com efeitos; o texto final é sempre o valor exato).
  // O número que anda fica oculto para leitores de tela; eles leem só o valor final, sem a contagem.
  function conta(v) { return '<span data-conta="' + v + '" aria-hidden="true">' + fmt(v) + '</span><span class="sr">' + fmt(v) + ' </span>'; }
  function contarNumeros(box) {
    if (!document.documentElement.classList.contains('motion-on')) return;
    var els = $$('[data-conta]', box), t0 = performance.now(), dur = 750;
    (function passo(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      els.forEach(function (el) {
        var v = +el.getAttribute('data-conta');
        el.textContent = k < 1 ? fmt(v % 1 === 0 ? Math.round(v * e) : Math.round(v * e * 10) / 10) : fmt(v);
      });
      if (k < 1) requestAnimationFrame(passo);
    })(t0);
  }
  var ICONE_ITEM = { chapa: 'p-chapa', guia: 'p-perfil', montante: 'p-perfil', s47: 'p-perfil', cantoneira: 'p-perfil', nervura: 'p-perfil',
    la: 'p-parafuso', ta: 'p-parafuso', massa: 'p-balde', cola: 'p-balde', fita: 'p-fita', 'la-mineral': 'p-la',
    regulador: 'p-peca', uniao: 'p-peca', juncao: 'p-peca', arame: 'p-arame' };
  res.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-res-action]'); if (!b || b.disabled || !calc.resultado) return;
    if (res.classList.contains('is-stale')) { ev.preventDefault(); return; } // medidas mudaram: calcule de novo
    var r = calc.resultado, acao = b.getAttribute('data-res-action');
    if (acao === 'lista') adicionarCalculo();
    else if (acao === 'ver') abrirOrcamento(b);
    else if (acao === 'whats') b.href = linkWhats(mensagemCalculo());
    else if (acao === 'simular') abrirSim({ acabamento: calc.acabamento.id, sup: C.sistema(calc.sistema).entrada === 'area' ? 'teto' : 'parede' });
    else {
      var txt = ['Estimativa Drysul — ' + r.nome + ', ' + descMedidas(r)].concat(r.itens.map(function (i) {
        return '• ' + i.nome + ': ' + qtdEstimativa(i);
      })).join('\n');
      copiar(txt, 'Estimativa copiada.');
    }
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-calc-system]'); if (!b) return;
    // o simulador manda junto o acabamento escolhido ("Ripado de madeira · Freijó"), que vai para o pedido
    var ac = b.getAttribute('data-calc-acab');
    calc.acabamento = ac ? { id: b.getAttribute('data-calc-acab-id') || '', nome: ac } : null; // de outro lugar: sem acabamento
    b.removeAttribute('data-calc-acab');
    selecionarSistema(b.getAttribute('data-calc-system'));
    rolar(document.getElementById('calculadora'));
    setTimeout(function () { var f = $('input', campos); if (f) f.focus({ preventScroll: true }); }, 500);
  });
  renderSistema();

  /* ==========================================================================
     Simulador de acabamento — o js/simulador.js só é baixado quando a seção se aproxima ou alguém clica
     ========================================================================== */
  var simCarregando = null;
  function carregarSim() {
    if (window.DrysulSim) return Promise.resolve(window.DrysulSim);
    if (!simCarregando) simCarregando = new Promise(function (ok, erro) {
      var sc = document.createElement('script');
      sc.src = 'js/simulador.js?v=17'; sc.async = true;
      sc.onload = function () { ok(window.DrysulSim); };
      sc.onerror = function () { simCarregando = null; sc.remove(); erro(new Error('simulador')); };
      document.head.appendChild(sc);
    });
    return simCarregando;
  }
  function abrirSim(op) {
    carregarSim().then(function (sim) { sim.abrir(op); }, function () { toast('Não foi possível abrir o simulador. Confira a conexão e tente de novo.'); });
  }
  $$('[data-sim-foto]').forEach(function (b) {
    b.addEventListener('click', function () { document.getElementById('sim-sec-' + b.getAttribute('data-sim-foto')).click(); });
  });
  ['camera', 'galeria'].forEach(function (n) {
    var inp = document.getElementById('sim-sec-' + n); if (!inp) return;
    inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; if (f) abrirSim({ arquivo: f }); inp.value = ''; });
  });
  $$('[data-sim-exemplo]').forEach(function (b) { b.addEventListener('click', function () { abrirSim({ exemplo: true }); }); });
  /* ---------- demonstração animada do simulador (o "vídeo" dos 4 passos) ----------
     Uma linha do tempo leve: a foto aparece, um dedo arrasta os 4 cantos, pinta a janela de verde, toca em Simular e
     arrasta a linha do antes/depois. Só anima com a demonstração na tela e com efeitos ligados; clicar num passo pula
     até ele. Também é usada dentro do simulador, antes da foto (window.DrysulTutorial). */
  var TUT_INI = [[205, 135], [1075, 135], [1075, 825], [205, 825]], TUT_FIM = [[18, 18], [1262, 18], [1262, 942], [18, 942]];
  var TUT_BTN = [640, 820], TUT_FIM_MS = 15800;
  var TUT_PASSOS = [0, 1500, 5700, 9100];
  var TUT_LEG = ['Tire a foto de frente', 'Arraste os 4 cantos até as quinas', 'Pinte o que não pode mudar', 'Toque em Simular', 'Arraste a linha e compare'];
  function suaveIO(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function faixa(t, a, b) { return Math.max(0, Math.min(1, (t - a) / (b - a))); }
  function lerpP(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function iniciarTutorial(el) {
    if (!el || el._tut) return; el._tut = true;
    var palco = el.querySelector('.sim-tut__palco'), circ = $$('.sim-tut__cantos circle', el), area = el.querySelector('.sim-tut__area');
    var traco = el.querySelector('.sim-tut__traco'), dedo = el.querySelector('.sim-tut__dedo'), leg = el.querySelector('.sim-tut__legenda');
    var comp = 0, larg = 1, alt = 1, t0 = 0, raf = 0, visivel = false, legAtual = -1, passoAtual = '';
    function medir() { var r = palco.getBoundingClientRect(); larg = r.width || 1; alt = r.height || 1; }
    function px(p) { return [p[0] / 1280 * larg, p[1] / 960 * alt]; }
    function ponto(k) { if (!comp) comp = traco.getTotalLength(); var q = traco.getPointAtLength(comp * k); return [q.x, q.y]; }
    function estado(t) {
      var passo = t < TUT_PASSOS[1] ? 1 : t < TUT_PASSOS[2] ? 2 : t < TUT_PASSOS[3] ? 3 : 4, i, k, h = [], d = null, dv = 0, aperto = 1;
      // cantos: cada um leva 1,05 s (o dedo chega em 0,35 s e arrasta em 0,7 s)
      for (i = 0; i < 4; i++) {
        var s0 = 1500 + i * 1050;
        k = suaveIO(faixa(t, s0 + 350, s0 + 1050)); h.push(lerpP(TUT_INI[i], TUT_FIM[i], k));
        if (t >= s0 && t < s0 + 1050) { d = t < s0 + 350 ? lerpP(i ? TUT_FIM[i - 1] : [640, 480], TUT_INI[i], suaveIO(faixa(t, s0, s0 + 350))) : h[i]; dv = 1; }
      }
      var pinta = faixa(t, 6000, 9000);
      if (t >= 5700 && t < 9100) { d = t < 6000 ? lerpP(TUT_FIM[3], ponto(0), suaveIO(faixa(t, 5700, 6000))) : ponto(pinta); dv = 1; }
      if (t >= 9100 && t < 10100) { d = lerpP(ponto(1), TUT_BTN, suaveIO(faixa(t, 9100, 9700))); dv = 1 - faixa(t, 9950, 10100); aperto = t > 9700 && t < 9900 ? 0.78 : 1; }
      var rev = suaveIO(faixa(t, 9900, 11100)) * 100, corte = 100;
      if (t >= 11100) {
        corte = t < 12500 ? 100 - 70 * suaveIO(faixa(t, 11300, 12500)) : t < 13500 ? 30 + 40 * suaveIO(faixa(t, 12500, 13500)) : 70 - 20 * suaveIO(faixa(t, 13500, 14300));
        d = [corte / 100 * 1280, 600]; dv = faixa(t, 11100, 11300) * (1 - faixa(t, 15000, 15400));
      }
      return { passo: passo, h: h, d: d, dv: dv, aperto: aperto, pinta: pinta, rev: rev, corte: corte,
        ov: t < 1500 ? 0 : 1 - faixa(t, 9900, 10500), flash: t > 250 && t < 650 ? 1 - Math.abs(t - 450) / 200 : 0,
        btn: t >= 9100 && t < 10300 ? 1 - faixa(t, 10000, 10300) : 0, leg: passo === 4 ? (t < 11100 ? 3 : 4) : passo - 1,
        prog: passo === 4 ? faixa(t, 9100, TUT_FIM_MS) : faixa(t, TUT_PASSOS[passo - 1], TUT_PASSOS[passo]), fim: t >= 11100 };
    }
    function aplicar(e) {
      e.h.forEach(function (p, i) { circ[i].setAttribute('cx', p[0].toFixed(1)); circ[i].setAttribute('cy', p[1].toFixed(1)); });
      area.setAttribute('points', e.h.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
      traco.style.strokeDashoffset = (1 - e.pinta).toFixed(4);
      var st = el.style;
      st.setProperty('--ov', e.ov.toFixed(3)); st.setProperty('--flash', e.flash.toFixed(3)); st.setProperty('--btn', e.btn.toFixed(3));
      st.setProperty('--a', (e.fim ? e.corte : 0).toFixed(2) + '%'); st.setProperty('--b', (e.fim ? 100 : e.rev).toFixed(2) + '%');
      st.setProperty('--corte', e.corte.toFixed(2) + '%'); st.setProperty('--prog', e.prog.toFixed(3));
      el.classList.toggle('is-fim', e.fim);
      if (e.d) { var q = px(e.d); dedo.style.transform = 'translate(' + q[0].toFixed(1) + 'px,' + q[1].toFixed(1) + 'px) scale(' + e.aperto + ')'; }
      dedo.style.opacity = e.dv.toFixed(3);
      if (String(e.passo) !== passoAtual) { passoAtual = String(e.passo); el.setAttribute('data-passo', passoAtual); }
      if (e.leg !== legAtual) { legAtual = e.leg; leg.innerHTML = '<b>' + Math.min(4, e.leg + 1) + '</b><span>' + TUT_LEG[e.leg] + '</span>'; }
    }
    function quadro(agora) {
      raf = 0;
      if (!visivel || document.documentElement.classList.contains('dialog-open') && !el.closest('dialog')) return;
      var t = (agora - t0) % TUT_FIM_MS;
      aplicar(estado(t));
      raf = requestAnimationFrame(quadro);
    }
    function ligar() { if (!raf && visivel && document.documentElement.classList.contains('motion-on')) { medir(); raf = requestAnimationFrame(quadro); } }
    function estatico() { var e = estado(14400); e.dv = 0; aplicar(e); el.setAttribute('data-passo', '4'); }
    $$('[data-tut]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var n = +b.getAttribute('data-tut');
        t0 = performance.now() - TUT_PASSOS[n - 1];
        if (!document.documentElement.classList.contains('motion-on')) { aplicar(estado(n === 4 ? 14400 : TUT_PASSOS[n] - 1)); }
        else ligar();
      });
    });
    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(palco);
    estatico();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visivel = es[es.length - 1].isIntersecting;
        if (visivel) { if (!t0) t0 = performance.now(); ligar(); }
      }, { threshold: 0.2 }).observe(el);
    }
    new MutationObserver(function () { if (document.documentElement.classList.contains('motion-on')) ligar(); else { cancelAnimationFrame(raf); raf = 0; estatico(); } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  window.DrysulTutorial = { iniciar: iniciarTutorial };
  $$('[data-sim-tut]').forEach(iniciarTutorial);

  var secSim = document.getElementById('simulador');
  if (secSim && 'IntersectionObserver' in window) {
    var simIO = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { simIO.disconnect(); carregarSim().catch(function () {}); }
    }, { rootMargin: '600px 0px' });
    simIO.observe(secSim);
  }

  /* ==========================================================================
     Tema claro / escuro — a escolha fica salva; sem escolha, segue o aparelho
     ========================================================================== */
  var raiz = document.documentElement, temaBtns = $$('[data-theme-toggle]');
  var mqEscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function temaSalvo() { try { return localStorage.getItem('drysul-tema'); } catch (e) { return null; } }
  // há dois botões de tema: o do cabeçalho e, em telas bem estreitas, um item dentro do menu
  function marcarTema() {
    var escuro = raiz.getAttribute('data-theme') === 'dark';
    temaBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', String(escuro));
      if (b.id === 'theme-toggle') { b.setAttribute('aria-label', escuro ? 'Ativar tema claro' : 'Ativar tema escuro'); b.title = escuro ? 'Tema claro' : 'Tema escuro'; }
      var t = $('span', b); if (t) t.textContent = escuro ? 'Tema claro' : 'Tema escuro';
    });
  }
  function aplicarTema(t) {
    var trocar = function () { raiz.setAttribute('data-theme', t); marcarTema(); };
    // transição suave entre os temas onde o navegador suporta (View Transitions); senão, troca direta
    if (document.startViewTransition && raiz.classList.contains('motion-on')) document.startViewTransition(trocar); else trocar();
  }
  temaBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('drysul-tema', t); } catch (e) {}
      aplicarTema(t);
    });
  });
  if (mqEscuro) {
    var seguirAparelho = function () { if (!temaSalvo()) aplicarTema(mqEscuro.matches ? 'dark' : 'light'); };
    if (mqEscuro.addEventListener) mqEscuro.addEventListener('change', seguirAparelho); else if (mqEscuro.addListener) mqEscuro.addListener(seguirAparelho);
  }
  marcarTema();

  /* ==========================================================================
     Navegação, cabeçalho, progresso, etapas e botão flutuante
     ========================================================================== */
  var header = $('.site-header'), menuBtn = $('#menu-btn'), bar = $('#progress-bar');
  function fecharMenu() {
    if (!header.classList.contains('menu-open')) return;
    header.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false');
    $('.sr', menuBtn).textContent = 'Abrir menu';
  }
  menuBtn.addEventListener('click', function () {
    var abrir = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', abrir);
    menuBtn.setAttribute('aria-expanded', String(abrir));
    $('.sr', menuBtn).textContent = abrir ? 'Fechar menu' : 'Abrir menu';
    $('use', menuBtn).setAttribute('href', abrir ? '#i-close' : '#i-menu');
  });
  $$('.nav a').forEach(function (a) { a.addEventListener('click', function () { fecharMenu(); $('use', menuBtn).setAttribute('href', '#i-menu'); }); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && header.classList.contains('menu-open')) { fecharMenu(); $('use', menuBtn).setAttribute('href', '#i-menu'); menuBtn.focus(); }
  });
  document.addEventListener('click', function (ev) {
    if (header.classList.contains('menu-open') && !header.contains(ev.target)) { fecharMenu(); $('use', menuBtn).setAttribute('href', '#i-menu'); }
  });

  // a altura da página fica guardada (medida só quando algo muda de tamanho): ler scrollHeight a cada
  // quadro forçava um layout extra no meio da rolagem
  var pend = false, maxRolagem = 0, compacto = null;
  function medirPagina() { maxRolagem = document.documentElement.scrollHeight - window.innerHeight; }
  function onScroll() {
    if (pend) return; pend = true;
    requestAnimationFrame(function () {
      pend = false;
      var y = window.scrollY, c = y > 24;
      if (c !== compacto) { compacto = c; header.classList.toggle('is-compact', c); }
      bar.style.transform = 'scaleX(' + (maxRolagem > 0 ? Math.min(1, y / maxRolagem) : 0).toFixed(4) + ')';
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { medirPagina(); onScroll(); });
  // a primeira medida vem do próprio ResizeObserver, depois do layout normal (medir já na carga forçava um layout extra)
  if ('ResizeObserver' in window) new ResizeObserver(function () { medirPagina(); onScroll(); }).observe(document.body);
  else window.addEventListener('load', function () { medirPagina(); onScroll(); });
  onScroll();

  if ('IntersectionObserver' in window) {
    var navLinks = $$('.nav__list a');
    var secs = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
    var navIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) {
          var on = a.getAttribute('href') === '#' + e.target.id;
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(function (s) { navIO.observe(s); });

    var stage = $('#story-stage'), steps = $$('.step');
    var stepIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (s) { s.classList.toggle('is-active', s === e.target); });
        stage.setAttribute('data-step', e.target.getAttribute('data-step'));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { stepIO.observe(s); });

    var heroVisivel = true, contatoVisivel = false, resVisivel = false;
    var fabIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.target.id === 'inicio') heroVisivel = e.isIntersecting;
        if (e.target.id === 'contato') contatoVisivel = e.isIntersecting;
        if (e.target.id === 'calc-result') resVisivel = e.isIntersecting;
      });
      atualizarFab();
    }, { threshold: 0.05 });
    fabIO.observe($('#inicio')); fabIO.observe($('#contato')); fabIO.observe(res);
    atualizarFab = function () {
      var fab = $('#fab');
      fab.hidden = false;
      var co = document.getElementById('checkout');
      fab.classList.toggle('is-hidden', heroVisivel || contatoVisivel || (resVisivel && !!calc.resultado) || dlg.open || (co && co.open) || totalLinhas() === 0);
    };
  }
  atualizarContadores();
  atualizarBotoes();
  function limparPedido() {
    q.itens = []; q.calculos = []; q.obs = '';
    mudou();
  }
  window.DrysulApp = {
    abrirOrcamento: abrirOrcamento, estado: function () { return q; }, mensagem: mensagem,
    avaliacao: avaliacao, produto: function (id) { return produtoPorId[id]; },
    limparPedido: limparPedido, toast: toast, copiar: copiar, BRL: BRL, esc: esc, ill: ill, mini: mini, icon: icon,
    abrirDialogo: function (d, origem) {
      d._retorno = origem || document.activeElement;
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      document.documentElement.classList.add('dialog-open'); atualizarFab();
    },
    fecharDialogo: fecharDialogo
  };
})();
