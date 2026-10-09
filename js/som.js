/* Drysul — sons de interface, sintetizados no navegador (sem arquivos de áudio) e bem baixos, no espírito dos
   toques do iPhone: curtos, limpos e quase só sentidos. Sem música.
   - Toque (clique em botão ou link): um "tic" curto e macio.
   - Alternar (tema, filtros, abas, botões de liga/desliga): um clique um pouco mais grave, como uma chave.
   - Adicionar ao pedido: duas notas de vidro, suaves, subindo.
   - Rolagem: um sopro de ar quase imperceptível que acompanha a velocidade.
   - Parede do topo: a cada etapa da desmontagem, um "swoosh" baixinho.
   Sem botão próprio: os sons seguem o interruptor "Pausar efeitos" do rodapé (e o "menos movimento" do aparelho,
   que já começa com os efeitos pausados). Pelos navegadores, o áudio só começa depois do primeiro toque ou tecla. */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var html = document.documentElement;
  try { localStorage.removeItem('drysul-som'); localStorage.removeItem('drysul-som-vol'); } catch (e) {} // do botão antigo
  function ligado() { return html.classList.contains('motion-on'); }

  /* ==========================================================================
     Motor: monta os sons num contexto de áudio (o da página ou um OfflineAudioContext nos testes)
     ========================================================================== */
  var MESTRE = 0.55; // volume geral: os níveis abaixo já são baixos; aqui é a última régua
  function Motor(c) {
    var M = {};
    var mestre = c.createGain(); mestre.gain.value = MESTRE;
    // nada agudo nem estridente: corta acima de 6 kHz
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.5;
    mestre.connect(lp); lp.connect(c.destination);
    var ruido = (function () {
      var n = Math.floor(c.sampleRate * 0.5), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();

    // um "tic": rajada curtíssima de ruído filtrado (o corpo do toque) + um seno breve (a cor da nota)
    function tic(t, freq, nivel, dur) {
      var s = c.createBufferSource(), bp = c.createBiquadFilter(), gs = c.createGain();
      s.buffer = ruido; bp.type = 'bandpass'; bp.frequency.value = freq * 2.2; bp.Q.value = 1.4;
      gs.gain.setValueAtTime(0.0001, t);
      gs.gain.exponentialRampToValueAtTime(nivel * 0.55, t + 0.0015);
      gs.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      s.connect(bp); bp.connect(gs); gs.connect(mestre);
      s.start(t, Math.random() * 0.4); s.stop(t + 0.02);
      var o = c.createOscillator(), go = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * 1.06, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
      go.gain.setValueAtTime(0.0001, t);
      go.gain.exponentialRampToValueAtTime(nivel, t + 0.002);
      go.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(go); go.connect(mestre);
      o.start(t); o.stop(t + dur + 0.02);
    }
    // nota de vidro: seno com um harmônico leve e cauda curta (o "tim" de confirmação)
    function vidro(t, freq, nivel, dur) {
      [[1, 1], [2.01, 0.18]].forEach(function (p) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq * p[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(nivel * p[1], t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (p[0] > 1 ? 0.5 : 1));
        o.connect(g); g.connect(mestre); o.start(t); o.stop(t + dur + 0.02);
      });
    }
    var SONS = {
      toque: function (t) { tic(t, 1250, 0.05, 0.045); },
      alternar: function (t) { tic(t, 820, 0.055, 0.05); tic(t + 0.028, 1100, 0.03, 0.035); },
      adicionar: function (t) { vidro(t, 1318.5, 0.032, 0.22); vidro(t + 0.075, 1760, 0.028, 0.32); }
    };
    M.som = function (tipo, t) { (SONS[tipo] || SONS.toque)(t == null ? c.currentTime + 0.004 : t); };

    /* ---------- rolagem: ar quase imperceptível ---------- */
    var rol = null;
    M.completar = function () {
      if (rol) return;
      // ruído marrom (grave, sem chiado), com a emenda cruzada para o loop não estalar
      var n = Math.floor(c.sampleRate * 3), m = Math.floor(c.sampleRate * 0.25), tmp = new Float32Array(n + m), y = 0, i;
      for (i = 0; i < n + m; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; tmp[i] = y * 3.5; }
      var ar = c.createBuffer(1, n, c.sampleRate), d = ar.getChannelData(0);
      for (i = 0; i < n; i++) d[i] = tmp[i];
      for (i = 0; i < m; i++) { var k = i / m; d[i] = tmp[i] * k + tmp[n + i] * (1 - k); }
      rol = { bus: c.createGain(), lp: c.createBiquadFilter(), ar: ar };
      rol.bus.gain.value = 0;
      var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180; hp.Q.value = 0.5;
      rol.lp.type = 'lowpass'; rol.lp.frequency.value = 420; rol.lp.Q.value = 0.6;
      var s = c.createBufferSource(); s.buffer = ar; s.loop = true;
      s.connect(hp); hp.connect(rol.lp); rol.lp.connect(rol.bus); rol.bus.connect(mestre);
      s.start();
    };
    M.rolar = function (forca, t) {
      if (!rol) return;
      t = t == null ? c.currentTime : t;
      rol.bus.gain.setTargetAtTime(0.009 * Math.pow(forca, 0.9), t, 0.12);
      rol.lp.frequency.setTargetAtTime(420 + 500 * forca, t, 0.18);
    };
    M.pararRolagem = function (t) { if (rol) rol.bus.gain.setTargetAtTime(0, t == null ? c.currentTime : t, 0.25); };
    // etapa da parede: um sopro curto que sobe e desce
    M.swoosh = function (t) {
      if (!rol) return;
      t = t == null ? c.currentTime + 0.01 : t;
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = rol.ar; f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(340, t); f.frequency.exponentialRampToValueAtTime(820, t + 0.2); f.frequency.exponentialRampToValueAtTime(460, t + 0.46);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.024, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      s.connect(f); f.connect(g); g.connect(mestre);
      s.start(t, Math.random() * 2); s.stop(t + 0.55);
    };
    return M;
  }

  /* ==========================================================================
     Página: gestos, cliques, rolagem e etapas da parede
     ========================================================================== */
  var ctx = null, M = null, ultimo = 0;
  function preparar() {
    if (!M) { ctx = new AC(); M = Motor(ctx); setTimeout(function () { M.completar(); }, 120); }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  function tocar(tipo) {
    var agora = performance.now();
    if (!ligado() || !M || agora - ultimo < 45) return; // rótulo + campo disparam dois cliques: toca uma vez só
    ultimo = agora;
    try { M.som(tipo); } catch (e) { /* sem áudio: segue em silêncio */ }
  }
  // o áudio só nasce no primeiro gesto (regra dos navegadores) e só com os efeitos ligados
  ['pointerdown', 'keydown', 'touchend'].forEach(function (tipo) {
    document.addEventListener(tipo, function () { if (ligado()) preparar(); }, { capture: true, passive: true });
  });

  var ALVO = 'button, a[href], summary, [role="button"], label.opt, input[type="checkbox"], input[type="radio"], select';
  document.addEventListener('click', function (ev) {
    if (!ev.isTrusted || !ev.target.closest || !ligado()) return;
    var el = ev.target.closest(ALVO);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    preparar();
    tocar(el.closest('[data-add]') ? 'adicionar' : el.matches('#theme-toggle, [data-theme-toggle], .calc-tab, .chip, [aria-pressed]') ? 'alternar' : 'toque');
  }, true);

  // rolagem: velocidade em px/ms vira a força do sopro; parou de rolar, o som some devagar.
  // Só lê a posição quando o áudio já existe e os efeitos estão ligados (nada de leitura à toa durante a rolagem).
  var rolY = 0, rolT = 0, rolParar = 0;
  window.addEventListener('scroll', function () {
    if (!M || !ligado() || document.hidden) return;
    var agora = performance.now(), y = window.scrollY, dt = agora - rolT;
    if (dt > 200) { rolY = y; rolT = agora; return; }
    if (dt < 12) return;
    var v = Math.abs(y - rolY) / dt;
    rolY = y; rolT = agora;
    M.rolar(Math.min(1, Math.max(0, (v - 0.1) / 2.8)));
    clearTimeout(rolParar);
    rolParar = setTimeout(function () { M.pararRolagem(); }, 140);
  }, { passive: true });
  var parede = document.getElementById('wall-rig'); // a etapa fica na própria parede
  if (parede && 'MutationObserver' in window) {
    var passo = parede.getAttribute('data-step');
    new MutationObserver(function () {
      var novo = parede.getAttribute('data-step');
      if (novo !== passo) { passo = novo; if (M && ligado()) M.swoosh(); }
    }).observe(parede, { attributes: true, attributeFilter: ['data-step'] });
  }
  // efeitos pausados: o som para junto; aba escondida: o áudio pausa (economiza bateria) e volta junto
  new MutationObserver(function () { if (ctx && !ligado()) { if (M) M.pararRolagem(); ctx.suspend(); } })
    .observe(html, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (ligado()) ctx.resume();
  });

  // contexto e motor expostos só para os testes medirem o volume (renderização offline)
  window.DrysulSom = { tocar: tocar, ligado: ligado, contexto: function () { return ctx; }, _Motor: Motor };
})();
