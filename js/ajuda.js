/* Drysul — central de ajuda e boas-vindas.
   - Busca nas dúvidas frequentes (função pura, testada em tests/ajuda.test.js): entende a pergunta do jeito que a
     pessoa escreve, sem acento e com palavras parecidas (tags do data.js), e ordena pelas que mais batem.
   - Diálogo "Ajuda" (botão do cabeçalho e do menu): contato em destaque, status da loja e as dúvidas por tema, com
     letras grandes e botões largos (pensado para quem tem mais idade). Sem resposta, a pergunta vai pronta para o WhatsApp.
   - Balão de boas-vindas: aparece uma vez (de novo só depois de 30 dias), alguns segundos depois da carga, se a lista
     estiver vazia e nada estiver aberto. "Só quero dar uma olhadinha" fecha. Não rouba o foco de ninguém. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DrysulAjuda = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VAZIAS = ' a o e as os um uma de do da dos das no na nos nas em para pra por com sem que como qual quais eu meu minha voce voces se me ao ja tem ter da e ou mais muito '.split(' ').reduce(function (m, w) { if (w) m[w] = 1; return m; }, {});

  function normalizar(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // "entregas" acha "entrega", "chapas" acha "chapa": compara pela raiz simples
  function raiz(w) { return w.length > 4 ? w.replace(/(oes|aes|es|s)$/, '') : w; }

  // grupos = DRYSUL.ajuda; devolve [{ grupo, item, pontos }] das que batem, das mais para as menos parecidas
  function buscar(grupos, termo) {
    var palavras = normalizar(termo).split(' ').filter(function (w) { return w.length > 1 && !VAZIAS[w]; }).map(raiz);
    if (!palavras.length) return [];
    var achados = [];
    (grupos || []).forEach(function (g, gi) {
      g.itens.forEach(function (it, ii) {
        var titulo = ' ' + normalizar(it.p) + ' ', resto = ' ' + normalizar(it.r + ' ' + (it.tags || '') + ' ' + g.tema) + ' ';
        var pontos = 0;
        palavras.forEach(function (w) {
          if (titulo.indexOf(' ' + w) >= 0) pontos += 3;
          else if (resto.indexOf(' ' + w) >= 0) pontos += 1;
        });
        if (pontos) achados.push({ grupo: gi, item: ii, pontos: pontos });
      });
    });
    return achados.sort(function (a, b) { return b.pontos - a.pontos || a.grupo - b.grupo || a.item - b.item; });
  }

  var api = { normalizar: normalizar, buscar: buscar };
  if (typeof document === 'undefined') return api;

  /* ==========================================================================
     Página
     ========================================================================== */
  function iniciar() {
    var D = window.DRYSUL, App = window.DrysulApp;
    var dlg = document.getElementById('ajuda');
    if (!D || !D.ajuda || !dlg) return;
    var loja = D.loja, grupos = D.ajuda;
    var lista = document.getElementById('ajuda-lista'), campo = document.getElementById('ajuda-busca');
    var aviso = document.getElementById('ajuda-aviso'), semResposta = document.getElementById('ajuda-sem');
    var html = document.documentElement;
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    var whats = function (texto) { return loja.whatsUrl + '?text=' + encodeURIComponent(texto); };

    function botaoAcao(a) {
      var b = el('a', 'btn btn--outline btn--sm ajuda__acao');
      if (a.href) { b.href = a.href; b.setAttribute('data-close', ''); }
      else if (a.loja === 'rota') { b.href = loja.rotaUrl; b.target = '_blank'; b.rel = 'noopener'; }
      else if (a.loja === 'whatsapp') { b.href = loja.whatsUrl; b.target = '_blank'; b.rel = 'noopener'; b.setAttribute('data-whats', 'contato'); }
      else if (a.loja === 'tel') { b.href = loja.telUrl; }
      b.appendChild(el('span', '', a.rotulo));
      return b;
    }

    // monta as dúvidas: tema > pergunta (abre e fecha) > resposta e um botão quando faz sentido
    grupos.forEach(function (g, gi) {
      var sec = el('section', 'ajuda__grupo'); sec.setAttribute('data-grupo', gi);
      sec.appendChild(el('h3', 'ajuda__tema', g.tema));
      g.itens.forEach(function (it, ii) {
        var d = el('details', 'ajuda__item'); d.setAttribute('data-item', gi + '-' + ii);
        var s = el('summary'); s.appendChild(el('span', '', it.p));
        var mais = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mais.setAttribute('class', 'ic'); mais.setAttribute('aria-hidden', 'true');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-plus'); mais.appendChild(use);
        s.appendChild(mais); d.appendChild(s);
        var resp = el('div', 'ajuda__resp');
        it.r.split('\n').forEach(function (par) { resp.appendChild(el('p', '', par)); });
        if (it.acao) resp.appendChild(botaoAcao(it.acao));
        d.appendChild(resp);
        sec.appendChild(d);
      });
      lista.appendChild(sec);
    });

    // busca: esconde o que não bate, abre a melhor resposta e diz quantas achou
    var fundo = 0;
    function filtrar() {
      var termo = campo.value.trim(), itens = $$('.ajuda__item', lista);
      if (!termo) {
        itens.forEach(function (d) { d.hidden = false; d.classList.remove('is-achado'); });
        $$('.ajuda__grupo', lista).forEach(function (s) { s.hidden = false; });
        aviso.textContent = ''; semResposta.hidden = true;
        return;
      }
      var achados = buscar(grupos, termo), chaves = {};
      achados.forEach(function (a) { chaves[a.grupo + '-' + a.item] = true; });
      itens.forEach(function (d) { var ok = !!chaves[d.getAttribute('data-item')]; d.hidden = !ok; d.classList.toggle('is-achado', ok); if (!ok) d.open = false; });
      $$('.ajuda__grupo', lista).forEach(function (s) { s.hidden = !$('.ajuda__item:not([hidden])', s); });
      if (achados.length) {
        var melhor = $('[data-item="' + achados[0].grupo + '-' + achados[0].item + '"]', lista);
        if (melhor) melhor.open = true;
      }
      semResposta.hidden = achados.length > 0;
      $('a', semResposta).href = whats('Olá! Tenho uma dúvida: ' + termo);
      // o leitor de tela ouve o resultado só quando a pessoa para de digitar
      clearTimeout(fundo);
      fundo = setTimeout(function () {
        aviso.textContent = achados.length ? (achados.length === 1 ? '1 resposta encontrada.' : achados.length + ' respostas encontradas.') : 'Nenhuma resposta encontrada. Você pode mandar a pergunta no WhatsApp.';
      }, 500);
    }
    if (campo) campo.addEventListener('input', filtrar);
    var form = campo && campo.form;
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); filtrar(); var a = $('.ajuda__item.is-achado summary', lista); if (a) a.focus(); });

    function abrir(origem) {
      // o menu do celular fecha antes (o diálogo abre por cima)
      var cab = $('.site-header'), mb = document.getElementById('menu-btn');
      if (cab && mb && cab.classList.contains('menu-open')) mb.click();
      fecharBalao(false);
      if (App && App.abrirDialogo) App.abrirDialogo(dlg, origem);
      else if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-open-ajuda]');
      if (b) { ev.preventDefault(); abrir(b); }
    });
    dlg.addEventListener('close', function () { if (campo && campo.value) { campo.value = ''; filtrar(); } });

    /* ---------- balão de boas-vindas ---------- */
    var CHAVE = 'drysul-boas-vindas', TRINTA_DIAS = 30 * 864e5, balao = null;
    function jaViu() { try { var v = +localStorage.getItem(CHAVE); return v > 0 && Date.now() - v < TRINTA_DIAS; } catch (e) { return false; } }
    function marcar() { try { localStorage.setItem(CHAVE, String(Date.now())); } catch (e) {} }
    function listaVazia() { var q = App && App.estado && App.estado(); return !q || (!q.itens.length && !q.calculos.length); }
    // não interrompe: aba escondida, diálogo ou menu aberto, ou alguém digitando
    function ocupado() {
      var a = document.activeElement, cab = $('.site-header');
      if (document.hidden || $('dialog[open]')) return true;
      if (cab && cab.classList.contains('menu-open')) return true;
      return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    }
    function fecharBalao(lembrar) {
      if (!balao) return;
      var b = balao; balao = null;
      html.classList.remove('tem-balao');
      b.classList.remove('is-on');
      setTimeout(function () { b.remove(); }, 400);
      if (lembrar !== false) marcar();
    }
    function mostrarBalao() {
      if (balao || jaViu() || !listaVazia()) return;
      if (ocupado()) { setTimeout(mostrarBalao, 4000); return; }
      marcar(); // aparece uma vez, mesmo que a pessoa não toque em nada
      balao = el('aside', 'boas'); balao.setAttribute('aria-labelledby', 'boas-titulo');
      var fechar = el('button', 'boas__x'); fechar.type = 'button'; fechar.setAttribute('aria-label', 'Fechar');
      fechar.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-close"/></svg>';
      var t = el('p', 'boas__titulo', 'Primeira vez por aqui?'); t.id = 'boas-titulo';
      var txt = el('p', 'boas__txt', 'A gente ajuda a achar o material certo e a calcular a sua obra.');
      var acoes = el('div', 'boas__acoes');
      var ajudaBtn = el('button', 'btn btn--primary btn--sm'); ajudaBtn.type = 'button'; ajudaBtn.setAttribute('data-open-ajuda', '');
      ajudaBtn.appendChild(el('span', '', 'Preciso de ajuda'));
      var calc = el('a', 'btn btn--outline btn--sm'); calc.href = '#calculadora'; calc.appendChild(el('span', '', 'Calcular minha obra'));
      var olhar = el('button', 'boas__olhar', 'Só quero dar uma olhadinha'); olhar.type = 'button';
      acoes.appendChild(ajudaBtn); acoes.appendChild(calc);
      balao.appendChild(fechar); balao.appendChild(t); balao.appendChild(txt); balao.appendChild(acoes); balao.appendChild(olhar);
      [fechar, olhar, calc].forEach(function (b) { b.addEventListener('click', function () { fecharBalao(); }); });
      balao.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { fecharBalao(); var z = document.getElementById('zap'); if (z) z.focus(); } });
      document.body.appendChild(balao);
      html.classList.add('tem-balao');
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (balao) balao.classList.add('is-on'); }); });
    }
    if (!jaViu()) {
      var esperar = function () { setTimeout(mostrarBalao, 7000); };
      if (document.readyState === 'complete') esperar(); else window.addEventListener('load', esperar);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  return api;
});
