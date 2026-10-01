/* Drysul — sons do site, todos sintetizados no navegador (sem arquivos) e bem baixos.
   - Clique: um "toc" redondo e grave; adicionar ao pedido toca duas notas suaves.
   - Passar o mouse num botão: um sopro curto que sobe junto com o preenchimento de cor.
   - Rolagem: textura de papel que acompanha a velocidade; ao mudar de etapa no topo, uma "virada de página".
   - Fundo: cordas lentas (violinos, viola e cello) em Ré maior, um acorde a cada ~9 s, quase imperceptível.
   O botão "Som" da barra liga e desliga tudo; a escolha fica salva. Pelos navegadores, o áudio só começa
   depois do primeiro clique, toque ou tecla. */
(function () {
  'use strict';
  var KEY = 'drysul-som', btn = document.getElementById('som-toggle');
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { if (btn) btn.hidden = true; return; }

  var ctx = null, mestre = null, busClique = null, busFundo = null, busRolagem = null, ruido = null, ultimo = 0;
  function ligado() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }

  /* ---------- montagem do áudio (no primeiro gesto) ---------- */
  function preparar() {
    if (!ctx) {
      ctx = new AC();
      // um compressor leve no fim segura qualquer pico: nada salta do volume combinado
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -30; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      mestre = ctx.createGain(); mestre.gain.value = 1;
      mestre.connect(comp); comp.connect(ctx.destination);
      // cliques e passagens do mouse passam por um passa-baixa: nada agudo
      busClique = ctx.createGain();
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.5;
      busClique.connect(lp); lp.connect(mestre);
      ruido = bufferRuido(0.6);
      // o resto (textura de papel, sala da trilha) é montado logo depois, em outra tarefa: o primeiro toque não espera
      setTimeout(function () { montarRolagem(); montarFundo(); if (ligado()) ligarFundo(); }, 120);
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  function bufferRuido(seg) {
    var n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* ---------- clique ---------- */
  // senoide com leve queda de afinação, ataque de 6 ms e decaimento rápido: soa como um toque macio
  function nota(freq, atraso, dur, vol) {
    var t = ctx.currentTime + 0.005 + atraso, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.1, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(busClique);
    o.start(t); o.stop(t + dur + 0.05);
  }
  var SONS = {
    clique: function () { nota(420, 0, 0.08, 0.04); nota(210, 0, 0.07, 0.02); },
    alternar: function () { nota(330, 0, 0.1, 0.038); nota(165, 0, 0.08, 0.018); },
    adicionar: function () { nota(392, 0, 0.12, 0.04); nota(523.25, 0.07, 0.18, 0.035); },
    // passar o mouse: sopro de ruído que "enche" de baixo para cima, como a cor entrando no botão
    hover: function () {
      var t = ctx.currentTime + 0.003, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = ruido; f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(1150, t + 0.13);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.045); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      s.connect(f); f.connect(g); g.connect(busClique);
      s.start(t, Math.random() * 0.35); s.stop(t + 0.2);
    }
  };
  function tocar(tipo) {
    var agora = performance.now();
    if (!ligado() || !ctx || agora - ultimo < 45) return; // rótulo + campo disparam dois cliques: toca uma vez só
    ultimo = agora;
    try { (SONS[tipo] || SONS.clique)(); } catch (e) { /* sem áudio: segue em silêncio */ }
  }

  /* ---------- rolagem: papel ---------- */
  var rol = { fonte: null, filtro: null, ultimoY: 0, ultimoT: 0, parar: 0 };
  function bufferPapel(seg) {
    // ruído "granulado": pequenas rajadas de 4 a 25 ms com força variada, como fibras de papel roçando
    var n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    var env = 0, alvo = 0, resta = 0;
    for (var i = 0; i < n; i++) {
      if (resta-- <= 0) { alvo = Math.random() < 0.4 ? 0.25 + Math.random() * 0.75 : Math.random() * 0.15; resta = (0.004 + Math.random() * 0.021) * ctx.sampleRate; }
      env += (alvo - env) * 0.015;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    return b;
  }
  function montarRolagem() {
    busRolagem = ctx.createGain(); busRolagem.gain.value = 0;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    rol.filtro = ctx.createBiquadFilter(); rol.filtro.type = 'bandpass'; rol.filtro.frequency.value = 1600; rol.filtro.Q.value = 0.7;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
    rol.fonte = ctx.createBufferSource(); rol.fonte.buffer = bufferPapel(1.6); rol.fonte.loop = true;
    rol.fonte.connect(hp); hp.connect(rol.filtro); rol.filtro.connect(lp); lp.connect(busRolagem); busRolagem.connect(mestre);
    rol.fonte.start();
  }
  function aoRolar() {
    if (!busRolagem || !ligado() || document.hidden) return;
    var agora = performance.now(), y = window.scrollY, dt = agora - rol.ultimoT;
    if (dt > 200) { rol.ultimoY = y; rol.ultimoT = agora; return; }
    if (dt < 8) return;
    var v = Math.abs(y - rol.ultimoY) / dt; // px por ms
    rol.ultimoY = y; rol.ultimoT = agora;
    var forca = Math.min(1, Math.max(0, (v - 0.08) / 2.6)), t = ctx.currentTime;
    busRolagem.gain.setTargetAtTime(0.01 * Math.pow(forca, 0.75), t, 0.05);
    rol.filtro.frequency.setTargetAtTime(1300 + forca * 1300, t, 0.08); // mais rápido, um pouco mais "claro"
    clearTimeout(rol.parar);
    rol.parar = setTimeout(function () { busRolagem.gain.setTargetAtTime(0, ctx.currentTime, 0.12); }, 90);
  }
  // virada de página quando a parede do topo muda de etapa
  function virarPagina() {
    if (!busRolagem || !ligado()) return;
    var t = ctx.currentTime + 0.01, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = rol.fonte.buffer; f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.16); f.frequency.exponentialRampToValueAtTime(1200, t + 0.32);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    s.connect(f); f.connect(g); g.connect(mestre);
    s.start(t, Math.random() * 1.1); s.stop(t + 0.4);
  }

  /* ---------- fundo: cordas lentas ---------- */
  var fundo = { ativo: false, prox: 0, timer: 0, i: 0 };
  // Ré maior, condução de vozes suave (o Lá3 atravessa todos): Dmaj9 · Bm7(11) · Gmaj9 · Asus4 → A
  var ACORDES = [
    { baixo: 38, vozes: [57, 61, 64, 66], violino: 73 },
    { baixo: 47, vozes: [57, 62, 64, 66], violino: 74 },
    { baixo: 43, vozes: [57, 59, 62, 66], violino: 71 },
    { baixo: 45, vozes: [57, 62, 64, 69], violino: 69 },
    { baixo: 45, vozes: [57, 61, 64, 69], violino: null }
  ];
  var DUR = 9; // segundos por acorde (~60 BPM, dois compassos)
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function reverb() {
    // resposta de sala gerada: ruído com queda exponencial de ~3 s, em estéreo
    var seg = 2.8, n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(2, n, ctx.sampleRate);
    var queda = Math.pow(0.001, 1 / n); // cai 60 dB até o fim, multiplicando amostra a amostra (barato)
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c), env = 1; for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * env; env *= queda; } }
    var cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  function montarFundo() {
    busFundo = ctx.createGain(); busFundo.gain.value = 0;
    var seco = ctx.createGain(); seco.gain.value = 0.55;
    var molhado = ctx.createGain(); molhado.gain.value = 0.9;
    var rv = reverb();
    busFundo.connect(seco); seco.connect(mestre);
    busFundo.connect(rv); rv.connect(molhado); molhado.connect(mestre);
  }
  // uma voz de corda: duas serras levemente desafinadas, vibrato que entra devagar, filtro escuro e envelope longo
  function corda(midi, t0, dur, vol, pan, corte, vib) {
    var g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    f.type = 'lowpass'; f.frequency.value = corte; f.Q.value = 0.6;
    // entra em 3,5 s, sustenta e sai em 5 s: o próximo acorde já está entrando, então não há "buraco"
    var ataque = Math.min(3.5, dur * 0.4), saida = Math.min(5, dur * 0.45);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + ataque);
    g.gain.setValueAtTime(vol, t0 + dur - saida);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 4.6 + Math.random() * 0.6;
    lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(vib, t0 + dur * 0.4);
    lfo.connect(lg);
    [-7, 6].forEach(function (cents) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(midi); o.detune.value = cents;
      lg.connect(o.detune); o.connect(f); o.start(t0); o.stop(t0 + dur + 0.1);
    });
    lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(busFundo); } else g.connect(busFundo);
  }
  function agendarFundo() {
    if (!fundo.ativo) return;
    var agora = ctx.currentTime;
    if (fundo.prox < agora) fundo.prox = agora + 0.2;
    while (fundo.prox < agora + 12) {
      var a = ACORDES[fundo.i % ACORDES.length], t0 = fundo.prox, dur = DUR + 5.5; // sobreposição entre acordes
      corda(a.baixo, t0, dur, 0.0045, 0, 380, 3);
      a.vozes.forEach(function (m, k) { corda(m, t0 + k * 0.12, dur, 0.002, -0.45 + k * 0.3, 1100, 7); });
      if (a.violino && fundo.i % 2 === 0) corda(a.violino, t0 + 2.2, 7, 0.0013, 0.25, 1700, 14);
      fundo.prox += DUR; fundo.i++;
    }
    fundo.timer = setTimeout(agendarFundo, 4000);
  }
  function ligarFundo() {
    if (!ctx || !busFundo || fundo.ativo) return;
    fundo.ativo = true;
    busFundo.gain.cancelScheduledValues(ctx.currentTime);
    busFundo.gain.setTargetAtTime(1, ctx.currentTime, 2.5); // entra devagar, em ~7 s
    agendarFundo();
  }
  function desligarFundo() {
    if (!ctx || !fundo.ativo) return;
    fundo.ativo = false; clearTimeout(fundo.timer);
    busFundo.gain.cancelScheduledValues(ctx.currentTime);
    busFundo.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    fundo.prox = 0;
  }

  /* ---------- eventos ---------- */
  function desbloquear() {
    if (!ligado()) return; // som desligado: nem monta o áudio
    preparar();
    ligarFundo();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (tipo) { document.addEventListener(tipo, desbloquear, { capture: true, passive: true }); });

  var ALVO = 'button, a[href], summary, [role="button"], label.opt, input[type="checkbox"], input[type="radio"], select';
  document.addEventListener('click', function (ev) {
    if (!ev.isTrusted || !ev.target.closest) return;
    var el = ev.target.closest(ALVO);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el === btn || !ligado()) return;
    preparar();
    tocar(el.closest('[data-add]') ? 'adicionar' : el.matches('#theme-toggle, #motion-toggle, .calc-tab, .chip, [aria-pressed]') ? 'alternar' : 'clique');
  }, true);

  // passar o mouse: só em aparelhos com mouse, uma vez por entrada no botão
  var HOVER = 'button, .btn, [role="button"], .chip, .calc-tab, .search-bar, .theme-btn, .icon-btn, .bres__whats';
  var mqMouse = window.matchMedia('(hover: hover) and (pointer: fine)'), sobre = null, ultHover = 0;
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType !== 'mouse' || !mqMouse.matches || !ev.target.closest) return;
    var el = ev.target.closest(HOVER);
    if (el === sobre) return;
    sobre = el;
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var agora = performance.now(); if (agora - ultHover < 70) return; ultHover = agora;
    if (ctx && ligado() && ctx.state === 'running') { try { SONS.hover(); } catch (e) {} }
  }, { passive: true });

  window.addEventListener('scroll', aoRolar, { passive: true });
  var hero = document.querySelector('.hero');
  if (hero && 'MutationObserver' in window) {
    var passo = hero.getAttribute('data-step');
    new MutationObserver(function () {
      var novo = hero.getAttribute('data-step');
      if (novo !== passo) { passo = novo; virarPagina(); }
    }).observe(hero, { attributes: true, attributeFilter: ['data-step'] });
  }
  // aba escondida: o áudio pausa (economiza bateria) e volta junto
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (ligado()) ctx.resume();
  });

  function marcar() {
    if (!btn) return;
    var on = ligado();
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Desligar os sons do site' : 'Ligar os sons do site');
    btn.title = on ? 'Sons ligados' : 'Sons desligados';
    var uso = btn.querySelector('use'); if (uso) uso.setAttribute('href', on ? '#i-som' : '#i-mudo');
  }
  if (btn) btn.addEventListener('click', function () {
    var on = !ligado();
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    marcar();
    preparar();
    if (on) { ctx.resume(); ligarFundo(); tocar('alternar'); }
    else { desligarFundo(); if (busRolagem) busRolagem.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(function () { if (!ligado()) ctx.suspend(); }, 2500); }
  });
  marcar();
  // contexto e agendamento expostos só para medir o volume nos testes (renderização offline)
  window.DrysulSom = { tocar: tocar, ligado: ligado, contexto: function () { return ctx; }, _agendar: agendarFundo };
})();
