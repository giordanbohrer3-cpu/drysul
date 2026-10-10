/* Drysul — faixa de informações do topo e abertura "Quem somos".
   - Status da loja ("Aberto agora · fecha às 18h"), calculado no fuso da loja pelo js/horario.js e refeito a cada minuto.
   - Faixa: abaixo de 1100 px mostra uma informação por vez e troca sozinha. Para com o mouse em cima, com o foco do
     teclado, fora da tela e com a aba escondida; o botão de pausa (e os efeitos pausados) mostram todas numa fileira.
   - Cartão da loja: a fachada no Street View do Google entra sozinha depois da carga; o mapa só carrega a pedido. */
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

  /* ---------- fachada (Street View) e mapa ----------
     A fachada entra sozinha uma vez: depois da carga da página, com o cartão perto da tela, sem economia de dados e
     com a rolagem parada (o Street View baixa uns 700 KB e não deve disputar a rolagem). Ela chega "travada" sob um
     véu, para o dedo ou a roda do mouse continuarem rolando a página; um toque no véu libera o giro, e o véu volta
     quando o mouse sai do cartão ou o cartão sai da tela. O mapa só carrega quando a pessoa pede. */
  $$('[data-mapa]').forEach(function (box) {
    var vista = $('.mapa__vista', box), capa = $('[data-mapa-abrir]', box), veu = $('.mapa__veu', box);
    var abas = $$('[data-mapa-vista]', box);
    var fontes = {
      fachada: { src: loja.fachadaEmbed, titulo: 'Fachada da Drysul no Street View do Google: ' + loja.endereco + ', ' + loja.cidade },
      mapa: { src: loja.mapaEmbed, titulo: 'Mapa da Drysul: ' + loja.endereco + ', ' + loja.bairro + ', ' + loja.cidade }
    };
    if (!vista || !capa || !fontes.fachada.src) return;
    var mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
    var frame = null, atual = '';

    // foto própria da fachada (data.js): vira a capa, e aí o Street View não entra sozinho
    if (loja.fotoFachada) {
      var img = document.createElement('img');
      img.src = loja.fotoFachada; img.alt = ''; img.decoding = 'async'; img.className = 'mapa__foto';
      capa.insertBefore(img, capa.firstChild);
    }

    function travar(sim) {
      if (!veu) return;
      $('span', veu).textContent = (mouse.matches ? 'Clique' : 'Toque') + ' para girar 360°';
      veu.setAttribute('aria-label', 'Liberar a imagem da fachada para girar e andar pela rua');
      veu.hidden = !sim;
    }
    function marcarAba(qual) {
      abas.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mapa-vista') === qual)); });
    }
    function mostrar(qual, pelaPessoa) {
      var f = fontes[qual];
      if (!f || !f.src) return;
      marcarAba(qual);
      if (!frame) {
        frame = document.createElement('iframe');
        frame.setAttribute('allowfullscreen', '');
        frame.referrerPolicy = 'no-referrer-when-downgrade';
        frame.addEventListener('load', function () {
          // um instante para o panorama desenhar antes de cobrir o desenho
          setTimeout(function () {
            box.classList.add('is-vivo');
            setTimeout(function () {
              var tinhaFoco = document.activeElement === capa;
              capa.hidden = true;
              if (tinhaFoco) (veu && !veu.hidden ? veu : frame).focus({ preventScroll: true }); // o foco não se perde
            }, 450);
          }, 350);
        });
        vista.insertBefore(frame, veu);
      }
      if (atual !== qual) { frame.src = f.src; frame.title = f.titulo; atual = qual; }
      box.setAttribute('data-vista', qual);
      // a fachada gira com um dedo e prende a rolagem: chega travada, a não ser que a pessoa tenha pedido agora
      travar(qual === 'fachada' && !pelaPessoa);
      if (pelaPessoa) { box.classList.add('is-vivo'); capa.hidden = true; }
    }

    // o botão da capa some: o foco vai para a imagem, não se perde no topo da página
    capa.addEventListener('click', function () { mostrar('fachada', true); frame.focus(); });
    abas.forEach(function (b) { b.addEventListener('click', function () { mostrar(b.getAttribute('data-mapa-vista'), true); }); });
    if (veu) veu.addEventListener('click', function () { veu.hidden = true; if (frame) frame.focus(); });
    // trava de novo quando o mouse sai do cartão ou o cartão sai da tela
    vista.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && atual === 'fachada' && veu && veu.hidden) travar(true); });

    if (!('IntersectionObserver' in window)) return;
    var economia = navigator.connection && navigator.connection.saveData;
    var rolouEm = 0, perto = false, pronto = document.readyState === 'complete';
    window.addEventListener('scroll', function () { rolouEm = Date.now(); }, { passive: true });
    function tentar() {
      if (frame || economia || loja.fotoFachada || !perto || !pronto) return;
      if (Date.now() - rolouEm < 500) { setTimeout(tentar, 300); return; } // espera a rolagem parar
      var ir = function () { if (!frame && perto) mostrar('fachada', false); };
      if (window.requestIdleCallback) requestIdleCallback(ir, { timeout: 1500 }); else setTimeout(ir, 200);
    }
    if (!pronto) window.addEventListener('load', function () { pronto = true; setTimeout(tentar, 600); });
    new IntersectionObserver(function (es) {
      perto = es[es.length - 1].isIntersecting;
      if (perto) tentar();
      else if (atual === 'fachada' && veu && veu.hidden) travar(true);
    }, { rootMargin: '250px 0px' }).observe(vista);
  });
})();
