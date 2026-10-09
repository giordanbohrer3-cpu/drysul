/* Drysul — faixa de informações do topo e abertura "Quem somos".
   - Status da loja ("Aberto agora · fecha às 18h"), calculado no fuso da loja pelo js/horario.js e refeito a cada minuto.
   - Faixa: abaixo de 1100 px mostra uma informação por vez e troca sozinha. Para com o mouse em cima, com o foco do
     teclado, fora da tela e com a aba escondida; o botão de pausa (e os efeitos pausados) mostram todas numa fileira.
   - Mapa: o do Google só carrega quando a pessoa toca no desenho (o mapa embutido pesa mais que a página inteira). */
(function () {
  'use strict';
  var D = window.DRYSUL, H = window.DrysulHorario;
  if (!D || !H) return;
  var loja = D.loja, html = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function efeitos() { return html.classList.contains('motion-on'); }

  /* ---------- status da loja ---------- */
  function atualizarStatus() {
    var s = H.status(new Date(), loja.horario);
    var estado = s.aberto ? (s.fechando ? 'fechando' : 'aberto') : 'fechado';
    $$('[data-status-loja]').forEach(function (el) { el.setAttribute('data-estado', estado); });
    $$('[data-status-texto]').forEach(function (el) { el.textContent = s.texto; });
    $$('[data-status-detalhe]').forEach(function (el) { el.textContent = s.detalhe; });
    $$('[data-status-curto]').forEach(function (el) {
      var b = document.createElement('b'); b.textContent = s.texto;
      el.textContent = '';
      el.appendChild(b);
      if (s.detalhe) el.appendChild(document.createTextNode(' · ' + s.detalhe));
    });
  }
  atualizarStatus();
  // refaz na virada de cada minuto (e ao voltar para a aba)
  setTimeout(function () { atualizarStatus(); setInterval(atualizarStatus, 60000); }, 60000 - Date.now() % 60000 + 50);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizarStatus(); });

  /* ---------- faixa de informações ---------- */
  var topbar = $('#topbar');
  if (topbar) {
    var itens = $$('.topbar__item', topbar), btn = $('.topbar__pausa', topbar);
    var mqGiro = window.matchMedia('(max-width: 1099px)');
    var atual = 0, timer = 0, pausado = false, segurando = false, naTela = true;
    var deveGirar = function () { return mqGiro.matches && efeitos() && !pausado && !segurando && naTela && !document.hidden && itens.length > 1; };
    var mostrar = function (i) {
      var velho = itens[atual];
      atual = (i + itens.length) % itens.length;
      var novo = itens[atual];
      if (velho === novo) return;
      velho.classList.remove('is-on');
      velho.classList.add('is-saindo');
      setTimeout(function () { velho.classList.remove('is-saindo'); }, 600);
      novo.classList.add('is-on');
    };
    var agendar = function () {
      clearInterval(timer); timer = 0;
      if (deveGirar()) timer = setInterval(function () { mostrar(atual + 1); }, 4200);
    };
    var modo = function () {
      topbar.classList.toggle('is-fileira', mqGiro.matches && (pausado || !efeitos()));
      agendar();
    };
    if (btn) btn.addEventListener('click', function () {
      pausado = !pausado;
      btn.setAttribute('aria-pressed', String(pausado));
      btn.setAttribute('aria-label', pausado ? 'Voltar a passar os avisos' : 'Pausar os avisos');
      var use = $('use', btn); if (use) use.setAttribute('href', pausado ? '#i-play' : '#i-pause');
      modo();
    });
    topbar.addEventListener('pointerenter', function () { segurando = true; agendar(); });
    topbar.addEventListener('pointerleave', function () { segurando = false; agendar(); });
    topbar.addEventListener('focusin', function () { segurando = true; agendar(); });
    topbar.addEventListener('focusout', function (e) { if (!topbar.contains(e.relatedTarget)) { segurando = false; agendar(); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { naTela = es[es.length - 1].isIntersecting; agendar(); }).observe(topbar);
    document.addEventListener('visibilitychange', agendar);
    new MutationObserver(modo).observe(html, { attributes: true, attributeFilter: ['class'] });
    if (mqGiro.addEventListener) mqGiro.addEventListener('change', modo); else if (mqGiro.addListener) mqGiro.addListener(modo);
    modo();
  }

  /* ---------- "Fale conosco" no botão do WhatsApp ----------
     Aparece uma vez quando os botões da abertura saem da tela por cima (a pessoa começou a rolar), para não cobrir
     o "Chamar no WhatsApp" da primeira tela. Sem a abertura, aparece 2,5 s depois da carga. */
  var zap = $('#zap'), acoes = $('.abertura__acoes');
  if (zap) {
    var rotulo = function () { zap.classList.add('is-rotulo'); };
    if (acoes && 'IntersectionObserver' in window) {
      var obsRotulo = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        if (!e.isIntersecting && e.boundingClientRect.top < 0) { rotulo(); obsRotulo.disconnect(); }
      });
      obsRotulo.observe(acoes);
    } else setTimeout(rotulo, 2500);
  }

  /* ---------- mapa sob demanda ---------- */
  $$('[data-mapa]').forEach(function (box) {
    var capa = $('[data-mapa-abrir]', box);
    if (!capa || !loja.mapaEmbed) return;
    capa.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = loja.mapaEmbed;
      f.title = 'Mapa da Drysul: ' + loja.endereco + ', ' + loja.bairro + ', ' + loja.cidade;
      f.setAttribute('allowfullscreen', '');
      f.referrerPolicy = 'no-referrer-when-downgrade';
      capa.replaceWith(f);
      f.focus(); // o botão sumiu: o foco vai para o mapa, não se perde no topo da página
    });
  });
})();
