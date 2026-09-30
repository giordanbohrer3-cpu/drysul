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
      ' width="800" height="600" alt="' + esc(p.nome + ' — ' + p.emb.toLowerCase()) + '" loading="lazy" decoding="async">';
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

  /* ---------- toast ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg, acao) {
    clearTimeout(toastTimer);
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

  function carregar() {
    var vazio = { itens: [], estimativa: null, nome: '', obs: '' };
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY));
      if (!s || !Array.isArray(s.itens)) return vazio;
      s.itens = s.itens.filter(function (i) { return produtoPorId[i.id] && i.qtd > 0; });
      return { itens: s.itens, estimativa: s.estimativa || null, nome: s.nome || '', obs: s.obs || '' };
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
    salvar(); atualizarContadores(bump); atualizarBotoes(); atualizarFab();
    if (dlg.open) renderOrcamento();
  }
  function totalLinhas() { return q.itens.length + (q.estimativa ? 1 : 0); }

  function atualizarContadores(bump) {
    var n = totalLinhas();
    $$('[data-quote-count]').forEach(function (el) {
      el.textContent = n;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }

  function atualizarBotoes() {
    $$('[data-add]').forEach(function (b) {
      var l = linha(b.getAttribute('data-add'));
      b.classList.toggle('is-added', !!l);
      var label = $('span', b);
      if (label) label.textContent = l ? 'Na lista · ' + l.qtd : 'Adicionar';
      $('use', b).setAttribute('href', l ? '#i-check' : '#i-plus');
    });
  }

  /* ---------- mensagem para WhatsApp ---------- */
  function mensagem() {
    var L = ['Olá, Drysul! Gostaria de um orçamento.'];
    if (q.itens.length) {
      L.push('', '*Materiais*');
      q.itens.forEach(function (i) {
        var p = produtoPorId[i.id];
        var preco = p.preco != null ? BRL.format(p.preco) + '/' + p.un : 'sob consulta';
        L.push('• ' + i.qtd + ' × ' + p.nome + ' — ' + p.emb.toLowerCase() + ' (' + preco + ')');
      });
    }
    if (q.estimativa) {
      var e = q.estimativa;
      L.push('', '*Estimativa da calculadora* — ' + e.nome + ', ' + descMedidas(e));
      e.itens.forEach(function (i) { L.push('• ' + i.nome + ': ' + fmt(i.qtd) + ' ' + i.unidade); });
    }
    var sub = subtotal();
    if (sub.total > 0) L.push('', 'Subtotal de referência (itens com preço): ' + BRL.format(sub.total) + ' — a confirmar');
    if (q.obs.trim()) L.push('', 'Observações: ' + q.obs.trim());
    if (q.nome.trim()) L.push('Nome: ' + q.nome.trim());
    return L.join('\n').replace(/ /g, ' ');
  }
  function descMedidas(e) {
    return e.dims ? fmt(e.dims.altura) + ' × ' + fmt(e.dims.comprimento) + ' m (' + fmt(e.area) + ' m²)' : fmt(e.area) + ' m²';
  }
  function subtotal() {
    var total = 0, consulta = 0;
    q.itens.forEach(function (i) {
      var p = produtoPorId[i.id];
      if (p.preco != null) total += p.preco * i.qtd; else consulta++;
    });
    return { total: Math.round(total * 100) / 100, consulta: consulta };
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
      var p = produtoPorId[i.id];
      var preco = p.preco != null ? BRL.format(p.preco) + ' / ' + p.un : 'Sob consulta';
      return '<li class="q-item" data-id="' + esc(p.id) + '">' + mini(p) +
        '<div><p class="q-item__name">' + esc(p.nome) + '</p><p class="q-item__meta">' + esc(p.emb) + ' · ' + preco + '</p></div>' +
        '<div class="q-item__ctrl">' +
          '<button type="button" data-q="dec" aria-label="Diminuir quantidade de ' + esc(p.nome) + '">' + icon('i-minus') + '</button>' +
          '<input type="number" inputmode="numeric" min="1" max="999" value="' + i.qtd + '" aria-label="Quantidade de ' + esc(p.nome) + '">' +
          '<button type="button" data-q="inc" aria-label="Aumentar quantidade de ' + esc(p.nome) + '">' + icon('i-plus') + '</button>' +
          '<button type="button" class="q-rm" data-q="rm" aria-label="Remover ' + esc(p.nome) + '">' + icon('i-trash') + '</button>' +
        '</div></li>';
    }).join('') + '</ul>' : '';

    if (q.estimativa) {
      var e = q.estimativa;
      elEst.innerHTML = '<div class="q-est"><div class="q-est__head"><div><p class="q-est__t">Estimativa · ' + esc(e.nome) + '</p>' +
        '<p class="q-est__s">' + esc(descMedidas(e)) + ' — consumo estimado</p></div>' +
        '<button type="button" class="q-rm" data-q="rm-est" aria-label="Remover estimativa">' + icon('i-trash') + '</button></div>' +
        '<ul>' + e.itens.map(function (i) { return '<li><span>' + esc(i.nome) + '</span><b>' + fmt(i.qtd) + ' ' + esc(i.unidade) + '</b></li>'; }).join('') + '</ul></div>';
    } else elEst.innerHTML = '';

    var vazio = totalLinhas() === 0;
    elVazio.hidden = !vazio;
    var sub = subtotal();
    elSoma.hidden = sub.total <= 0;
    if (sub.total > 0) {
      var extra = [];
      if (sub.consulta) extra.push(sub.consulta + (sub.consulta > 1 ? ' itens sob consulta' : ' item sob consulta'));
      if (q.estimativa) extra.push('estimativa da calculadora');
      elSoma.innerHTML = '<span>Subtotal dos itens com preço publicado</span><strong>' + BRL.format(sub.total) + '</strong>' +
        '<span>Valor de referência, confirmado pela equipe' + (extra.length ? '. Fora da soma: ' + extra.join(' e ') : '') + '.</span>';
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
    if (add) { adicionar(add.getAttribute('data-add')); return; }
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
  elEst.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-q="rm-est"]')) { q.estimativa = null; mudou(); toast('Estimativa removida'); }
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
  function botaoAdd(p, cls) {
    return '<button class="btn btn--sm btn-add ' + (cls || 'btn--outline') + '" type="button" data-add="' + esc(p.id) + '" aria-label="Adicionar ' + esc(p.nome) + ' ao orçamento">' +
      '<svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg><span>Adicionar</span></button>';
  }
  function cardProduto(p) {
    return '<article class="prod-card" data-tilt>' +
      '<div class="prod-card__media">' + badge(p) + midia(p) + '</div>' +
      '<div class="prod-card__body">' +
        '<p class="prod-card__cat">' + esc(catPorId[p.cat].nome) + '</p>' +
        '<h3 class="prod-card__name">' + esc(p.nome) + '</h3>' +
        '<p class="prod-card__emb">' + esc(p.emb) + '</p>' +
        '<p class="prod-card__detail">' + esc(p.detalhe) + '</p>' +
        (p.link ? '<a class="prod-card__src" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + icon('i-insta') + 'Ver publicação</a>' : '') +
        '<div class="prod-card__foot">' + precoHtml(p) + botaoAdd(p) + '</div>' +
      '</div></article>';
  }

  function rank(p) { return p.destaque ? 0 : p.oferta ? 1 : 2; }
  function listaFiltrada() {
    var termos = norm(filtro.q).split(/\s+/).filter(Boolean);
    var lista = D.produtos.filter(function (p) {
      if (filtro.cat !== 'todas' && p.cat !== filtro.cat) return false;
      if (!termos.length) return true;
      var alvo = norm([p.nome, p.detalhe, p.emb, catPorId[p.cat].nome].join(' '));
      return termos.every(function (t) { return alvo.indexOf(t) !== -1; });
    });
    var ix = {}; D.produtos.forEach(function (p, i) { ix[p.id] = i; });
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
      ? lista.length + (lista.length > 1 ? ' materiais' : ' material') + cat + (filtro.q ? ' para “' + filtro.q.trim() + '”' : '')
      : '';
    atualizarBotoes();
  }
  function renderChips() {
    var todos = [{ id: 'todas', nome: 'Todos', n: D.produtos.length }].concat(D.categorias.map(function (c) {
      return { id: c.id, nome: c.nome, n: D.produtos.filter(function (p) { return p.cat === c.id; }).length };
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
  function irParaCategoria(cat) {
    setCategoria(cat);
    document.getElementById('produtos').scrollIntoView({ block: 'start' });
  }
  $$('[data-filter-link]').forEach(function (a) {
    a.addEventListener('click', function (ev) { ev.preventDefault(); irParaCategoria(a.getAttribute('data-filter-link')); });
  });

  /* Categorias */
  $('#cat-grid').innerHTML = D.categorias.map(function (c, i) {
    var n = D.produtos.filter(function (p) { return p.cat === c.id; }).length;
    return '<button class="cat-card" type="button" data-reveal data-tilt data-cat-go="' + c.id + '">' +
      '<span class="cat-card__n">' + String(i + 1).padStart(2, '0') + '</span>' + ill(c.icone) +
      '<span class="cat-card__t">' + esc(c.nome) + '</span><span class="cat-card__d">' + esc(c.desc) + '</span>' +
      '<span class="cat-card__f"><span>' + n + ' itens no catálogo</span>' + icon('i-arrow') + '</span></button>';
  }).join('');
  $('#cat-grid').addEventListener('click', function (ev) { var b = ev.target.closest('[data-cat-go]'); if (b) irParaCategoria(b.getAttribute('data-cat-go')); });

  /* Destaques */
  $('#dest-grid').innerHTML = D.produtos.filter(function (p) { return p.destaque; }).map(function (p) {
    var pr = precoPartes(p.preco);
    return '<article class="dest-card" data-reveal data-tilt>' +
      '<div class="dest-card__media"><span class="tag tag--orange">Linha Drysul</span>' + midia(p) + '</div>' +
      '<div class="dest-card__body">' +
        '<h3 class="dest-card__name">' + esc(p.nome) + '</h3>' +
        '<p class="dest-card__emb">' + esc(p.emb) + '</p>' +
        '<p class="dest-card__price"><small>' + pr.moeda + '</small><strong>' + pr.valor + '</strong><span>/ ' + esc(p.un) + '</span></p>' +
        '<p class="dest-card__detail">' + esc(p.detalhe) + '</p>' +
        botaoAdd(p, 'btn--primary') +
      '</div></article>';
  }).join('');

  /* Ofertas */
  $('#offer-grid').innerHTML = D.produtos.filter(function (p) { return p.oferta; }).map(function (p) {
    var pr = precoPartes(p.preco);
    return '<article class="offer" data-reveal>' +
      '<div class="offer__top"><span class="tag">Oferta</span><span class="offer__date">Publicada em 09/09/2026</span></div>' +
      '<div><div class="offer__main">' + ill(p.icone) + '<div><h3 class="offer__name">' + esc(p.nome) + '</h3><p class="offer__emb">' + esc(p.emb) + '</p></div></div></div>' +
      '<div><p class="offer__price"><small>' + pr.moeda + '</small><strong>' + pr.valor + '</strong><span>/ ' + esc(p.un) + '</span></p>' +
      '<div class="offer__actions"><a class="prod-card__src" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + icon('i-insta') + 'Ver publicação</a>' + botaoAdd(p) + '</div></div>' +
      '</article>';
  }).join('');

  renderChips();
  renderCatalogo();

  /* ==========================================================================
     Calculadora
     ========================================================================== */
  var calc = { sistema: 'parede', valores: { altura: '', comprimento: '', area: '' }, resultado: null };
  var tabs = $('#calc-systems'), form = $('#calc-form'), campos = $('#calc-fields'), desc = $('#calc-desc'), res = $('#calc-result');

  tabs.innerHTML = C.SISTEMAS.map(function (s, i) {
    return '<button class="calc-tab" type="button" id="tab-' + s.id + '" aria-controls="calc-form" data-sys="' + s.id + '" aria-pressed="' + (s.id === calc.sistema) + '">' +
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
  }
  function selecionarSistema(id, foco) {
    calc.sistema = id; renderSistema();
    if (foco) { var f = $('input', campos); if (f) f.focus({ preventScroll: true }); }
  }
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest('[data-sys]'); if (b) selecionarSistema(b.getAttribute('data-sys')); });
  campos.addEventListener('input', function (ev) {
    if (!ev.target.name) return;
    calc.valores[ev.target.name] = ev.target.value;
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

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var r = C.calcular(calc.sistema, calc.valores);
    $$('input', campos).forEach(function (inp) {
      var m = $('#' + inp.id + '-msg');
      if (!m.hasAttribute('data-hint')) m.setAttribute('data-hint', m.textContent);
      var erro = !r.ok && r.erros[inp.name];
      if (erro) { inp.setAttribute('aria-invalid', 'true'); m.className = 'field__err'; m.textContent = erro; }
      else { inp.removeAttribute('aria-invalid'); m.className = 'field__hint'; m.textContent = m.getAttribute('data-hint'); }
    });
    if (!r.ok) { var f = $('[aria-invalid="true"]', campos); if (f) f.focus(); return; }
    calc.resultado = r;
    renderResultado(r);
  });

  function renderResultado(r) {
    res.classList.remove('is-stale');
    res.innerHTML =
      '<div class="res__head"><div><p class="res__sys">' + esc(r.nome) + '</p><p class="res__dims">' +
        (r.dims ? fmt(r.dims.altura) + ' m × ' + fmt(r.dims.comprimento) + ' m' : 'Área informada') + '</p></div>' +
        '<p class="res__area">' + fmt(r.area) + '<small>m²</small></p></div>' +
      '<p class="stale-note">Medidas alteradas — calcule novamente para atualizar.</p>' +
      '<ul class="res__list">' + r.itens.map(function (i, n) {
        return '<li style="--i:' + n + '"><span>' + esc(i.nome) + '</span><b>' + fmt(i.qtd) + '<small>' + esc(i.unidade) + '</small></b></li>';
      }).join('') + '</ul>' +
      '<div class="res__actions">' +
        '<button class="btn btn--primary" type="button" data-res-action="orcamento">' + icon('i-list') + '<span>Levar ao orçamento</span></button>' +
        '<button class="btn btn--outline" type="button" data-res-action="copiar">' + icon('i-copy') + '<span>Copiar estimativa</span></button>' +
      '</div>';
  }
  res.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-res-action]'); if (!b || b.disabled || !calc.resultado) return;
    var r = calc.resultado;
    if (b.getAttribute('data-res-action') === 'orcamento') {
      var substituiu = !!q.estimativa;
      q.estimativa = { sistema: r.sistema, nome: r.nome, dims: r.dims, area: r.area, itens: r.itens };
      mudou(true);
      toast(substituiu ? 'Estimativa atualizada no pedido' : 'Estimativa adicionada ao pedido', { label: 'Ver pedido', run: abrirOrcamento });
    } else {
      var txt = ['Estimativa Drysul — ' + r.nome + ', ' + descMedidas(r)].concat(r.itens.map(function (i) {
        return '• ' + i.nome + ': ' + fmt(i.qtd) + ' ' + i.unidade;
      })).join('\n');
      copiar(txt, 'Estimativa copiada.');
    }
  });
  $$('[data-calc-system]').forEach(function (b) {
    b.addEventListener('click', function () {
      selecionarSistema(b.getAttribute('data-calc-system'));
      document.getElementById('calculadora').scrollIntoView({ block: 'start' });
      setTimeout(function () { var f = $('input', campos); if (f) f.focus({ preventScroll: true }); }, 500);
    });
  });
  renderSistema();

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

  var pend = false;
  function onScroll() {
    if (pend) return; pend = true;
    requestAnimationFrame(function () {
      pend = false;
      var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      header.classList.toggle('is-compact', y > 24);
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ')';
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
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

    var heroVisivel = true, contatoVisivel = false;
    var fabIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.target.id === 'inicio') heroVisivel = e.isIntersecting;
        if (e.target.id === 'contato') contatoVisivel = e.isIntersecting;
      });
      atualizarFab();
    }, { threshold: 0.05 });
    fabIO.observe($('#inicio')); fabIO.observe($('#contato'));
    atualizarFab = function () {
      var fab = $('#fab');
      fab.hidden = false;
      var co = document.getElementById('checkout');
      fab.classList.toggle('is-hidden', heroVisivel || contatoVisivel || dlg.open || (co && co.open) || totalLinhas() === 0);
    };
  }
  atualizarContadores();
  atualizarBotoes();
  function limparPedido() {
    q.itens = []; q.estimativa = null; q.obs = '';
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
