/* Drysul — sons do site, todos sintetizados no navegador (sem arquivos de áudio).
   - Clique: um "toc" redondo e grave; adicionar ao pedido toca duas notas suaves.
   - Passar o mouse num botão: um sopro curto que sobe junto com o preenchimento de cor.
   - Rolagem: um sopro de ar macio (ruído marrom, só graves e médios, sem chiado) que acompanha a velocidade.
   - Trilha: piano de feltro sobre uma base aberta, em Ré maior. Oito frases curtas se repetem em ciclos de tamanhos
     diferentes (17,9 s, 19,7 s, 21,3 s…), a técnica de "Music for Airports" (Brian Eno, 1978): as frases se encontram
     sempre de um jeito novo, então a música é contínua e não se repete. Todas as notas são da mesma escala, então
     qualquer encontro soa bem; a base troca de acorde a cada 12,8 s (Ré · Si menor · Sol · Lá).
   O botão de som (canto direito do cabeçalho) liga e desliga tudo; com o som ligado, o volume aparece embaixo.
   A escolha e o volume ficam salvos. Pelos navegadores, o áudio só começa depois do primeiro clique, toque ou tecla. */
(function () {
  'use strict';
  var KEY = 'drysul-som', KEY_VOL = 'drysul-som-vol', VOL_PADRAO = 70;
  var caixa = document.getElementById('som'), btn = document.getElementById('som-toggle');
  var faixa = document.getElementById('som-vol'), faixaTxt = document.getElementById('som-vol-txt');
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // sem Web Audio: o botão continua escondido
  if (caixa) caixa.hidden = false;

  function ligado() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  function volume() {
    var v = NaN; try { v = parseInt(localStorage.getItem(KEY_VOL), 10); } catch (e) {}
    return v >= 5 && v <= 100 ? v : VOL_PADRAO;
  }
  // curva quadrática (o meio da faixa soa "meio"); no padrão (70%) fica ~4 dB acima da versão anterior, no máximo ~10 dB
  function ganho(v) { return 3.2 * Math.pow(v / 100, 2); }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ==========================================================================
     Motor: monta tudo num contexto de áudio (o da página ou um OfflineAudioContext nos testes)
     ========================================================================== */
  function Motor(c) {
    var M = {};
    // saída: mistura → compressor leve (segura picos) → volume escolhido → alto-falante
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -30; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    var vol = c.createGain(); vol.gain.value = ganho(volume());
    var mix = c.createGain();
    mix.connect(comp); comp.connect(vol); vol.connect(c.destination);
    // cliques e passagens do mouse passam por um passa-baixa: nada agudo
    var busClique = c.createGain(), lpc = c.createBiquadFilter();
    lpc.type = 'lowpass'; lpc.frequency.value = 1400; lpc.Q.value = 0.5;
    busClique.connect(lpc); lpc.connect(mix);
    var branco = bufferBranco(0.6);

    M.volume = function (v) { vol.gain.setTargetAtTime(ganho(v), c.currentTime, 0.06); };

    function bufferBranco(seg) {
      var n = Math.floor(c.sampleRate * seg), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    // ruído marrom (grave, sem grão) com a emenda cruzada: em loop, não estala
    function bufferMarrom(seg) {
      var n = Math.floor(c.sampleRate * seg), m = Math.floor(c.sampleRate * 0.25), tmp = new Float32Array(n + m), y = 0, i;
      for (i = 0; i < n + m; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; tmp[i] = y * 3.5; }
      var b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (i = 0; i < n; i++) d[i] = tmp[i];
      for (i = 0; i < m; i++) { var k = i / m; d[i] = tmp[i] * k + tmp[n + i] * (1 - k); }
      return b;
    }
    function panner(pan, destino) {
      if (!c.createStereoPanner) return destino;
      var p = c.createStereoPanner(); p.pan.value = pan; p.connect(destino); return p;
    }

    /* ---------- clique ---------- */
    // senoide com leve queda de afinação, ataque de 6 ms e decaimento rápido: soa como um toque macio
    function nota(t0, freq, atraso, dur, v) {
      var t = t0 + atraso, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * 1.1, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(busClique);
      o.start(t); o.stop(t + dur + 0.05);
    }
    var SONS = {
      clique: function (t) { nota(t, 420, 0, 0.08, 0.04); nota(t, 210, 0, 0.07, 0.02); },
      alternar: function (t) { nota(t, 330, 0, 0.1, 0.038); nota(t, 165, 0, 0.08, 0.018); },
      adicionar: function (t) { nota(t, 392, 0, 0.12, 0.04); nota(t, 523.25, 0.07, 0.18, 0.035); },
      // passar o mouse: sopro de ruído que "enche" de baixo para cima, como a cor entrando no botão
      hover: function (t) {
        var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = branco; f.type = 'bandpass'; f.Q.value = 1.1;
        f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(1150, t + 0.13);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.045); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        s.connect(f); f.connect(g); g.connect(busClique);
        s.start(t, Math.random() * 0.35); s.stop(t + 0.2);
      }
    };
    M.som = function (tipo, t) { (SONS[tipo] || SONS.clique)(t == null ? c.currentTime + 0.005 : t); };

    /* ---------- rolagem: ar ---------- */
    var rol = null;
    function montarRolagem() {
      rol = { bus: c.createGain(), lp: c.createBiquadFilter(), ar: bufferMarrom(4) };
      rol.bus.gain.value = 0;
      var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160; hp.Q.value = 0.5;
      rol.lp.type = 'lowpass'; rol.lp.frequency.value = 450; rol.lp.Q.value = 0.6;
      var s = c.createBufferSource(); s.buffer = rol.ar; s.loop = true;
      s.connect(hp); hp.connect(rol.lp); rol.lp.connect(rol.bus); rol.bus.connect(mix);
      s.start();
    }
    // força de 0 a 1 (velocidade da rolagem): mais rápido, mais presente e um pouco mais aberto; tudo com rampas longas
    M.rolar = function (forca, t) {
      if (!rol) return;
      t = t == null ? c.currentTime : t;
      rol.bus.gain.setTargetAtTime(0.008 * Math.pow(forca, 0.8), t, 0.09);
      rol.lp.frequency.setTargetAtTime(450 + 800 * forca, t, 0.15);
    };
    M.pararRolagem = function (t) { if (rol) rol.bus.gain.setTargetAtTime(0, t == null ? c.currentTime : t, 0.22); };

    /* ---------- trilha: piano de feltro em ciclos de tamanhos diferentes ---------- */
    // [período (s), início (s), notas: [midi, atraso (s)]] — Ré, Mi, Fá#, Lá, Si, Dó# (Ré maior sem o Sol)
    var FRASES = [
      [17.9, 0.8, [[78, 0]]],
      [19.7, 3.4, [[69, 0], [74, 0.62]]],
      [21.3, 7.6, [[73, 0], [76, 0.9]]],
      [23.6, 1.9, [[62, 0], [69, 0.46]]],
      [25.9, 11.2, [[71, 0], [78, 0.46], [76, 1.38]]],
      [29.3, 5.3, [[64, 0], [71, 0.7]]],
      [31.7, 14.8, [[81, 0]]],
      [34.1, 9.5, [[66, 0], [73, 0.46], [74, 0.92]]]
    ];
    // base aberta (quintas, sem terça: quem colore é o piano): Ré · Si menor · Sol · Lá
    var BASE = [[50, 57, 62], [47, 54, 59], [43, 50, 57], [45, 52, 57]], BASE_DUR = 12.8;
    var NIVEL_PIANO = 0.028, NIVEL_BASE = 0.0033;
    var tr = { bus: null, ativa: false, prox: [], proxBase: 0, iBase: 0 };

    function montarTrilha() {
      tr.bus = c.createGain(); tr.bus.gain.value = 0;
      var seco = c.createGain(); seco.gain.value = 0.62;
      tr.bus.connect(seco); seco.connect(mix);
      // sala: cauda de ~3,4 s que escurece no fim (filtro de um polo fechando), em estéreo
      var seg = 3.4, n = Math.floor(c.sampleRate * seg), ir = c.createBuffer(2, n, c.sampleRate), queda = Math.pow(0.001, 1 / n);
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch), y = 0, env = 1;
        for (var i = 0; i < n; i++) { y += (0.7 - 0.6 * i / n) * ((Math.random() * 2 - 1) - y); d[i] = y * env * Math.min(1, i / 400); env *= queda; }
      }
      var sala = c.createConvolver(); sala.buffer = ir;
      var molhado = c.createGain(); molhado.gain.value = 0.5;
      tr.bus.connect(sala); sala.connect(molhado); molhado.connect(mix);
      // eco leve, um de cada lado, com tempos diferentes: dá amplitude sem embolar
      [[0.46, -0.55], [0.69, 0.55]].forEach(function (e) {
        var dl = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
        dl.delayTime.value = e[0]; fb.gain.value = 0.28; lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.value = 0.16;
        tr.bus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(g); g.connect(panner(e[1], mix));
      });
    }

    // piano de feltro: duas "cordas" levemente desafinadas + harmônicos que somem antes (o brilho fica só no ataque), filtro que fecha
    // com o tempo (o brilho vai embora como num piano de verdade) e um toque abafado de feltro no ataque
    function piano(midi, t, vel, pan) {
      var f = hz(midi), dur = 2.4 + 2.6 * Math.max(0, Math.min(1, (84 - midi) / 22));
      var lp = c.createBiquadFilter(), sai = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 0.4;
      lp.frequency.setValueAtTime(Math.min(7000, f * (6 + 4 * vel)), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(260, f * 1.6), t + dur * 0.7);
      [[1, 0, 1, 1], [1, 3.5, 0.55, 1], [2.0016, 0, 0.32, 0.55], [3.004, 0, 0.12, 0.35], [4.008, 0, 0.07, 0.2], [5.02, 0, 0.035, 0.12]].forEach(function (p) {
        var o = c.createOscillator(), g = c.createGain(), a = p[2] * vel, fim = t + dur * p[3];
        o.frequency.value = f * p[0]; o.detune.value = p[1];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(a, t + 0.014);
        g.gain.exponentialRampToValueAtTime(a * 0.4, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, fim);
        o.connect(g); g.connect(lp); o.start(t); o.stop(fim + 0.05);
      });
      var s = c.createBufferSource(), fs = c.createBiquadFilter(), gs = c.createGain();
      s.buffer = branco; fs.type = 'lowpass'; fs.frequency.value = 900;
      gs.gain.setValueAtTime(0.0001, t); gs.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.004); gs.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(fs); fs.connect(gs); gs.connect(lp); s.start(t, Math.random() * 0.4); s.stop(t + 0.07);
      sai.gain.value = NIVEL_PIANO;
      lp.connect(sai); sai.connect(panner(pan, tr.bus));
    }
    // base: seno + triângulo + oitava bem baixa, filtro escuro, entra em 3 s e sai em 4 s (os acordes se cruzam)
    function base(midi, t0, dur, pan) {
      var f = hz(midi), lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(NIVEL_BASE, t0 + 3);
      g.gain.setValueAtTime(NIVEL_BASE, t0 + dur - 4);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      [['sine', 1, 0, 1], ['triangle', 1, 5, 0.5], ['sine', 2, -4, 0.22]].forEach(function (p) {
        var o = c.createOscillator(), og = c.createGain();
        o.type = p[0]; o.frequency.value = f * p[1]; o.detune.value = p[2]; og.gain.value = p[3];
        o.connect(og); og.connect(lp); o.start(t0); o.stop(t0 + dur + 0.1);
      });
      lp.connect(g); g.connect(panner(pan, tr.bus));
    }

    // agenda tudo o que cai antes de "ate" (segundos do contexto); a página chama a cada segundo, olhando 3 s à frente
    M.agendarTrilha = function (ate) {
      if (!tr.ativa) return;
      while (tr.proxBase < ate) {
        var acorde = BASE[tr.iBase % BASE.length];
        acorde.forEach(function (m, k) { base(m, tr.proxBase + k * 0.08, BASE_DUR + 4, -0.3 + k * 0.3); });
        tr.proxBase += BASE_DUR; tr.iBase++;
      }
      FRASES.forEach(function (fr, i) {
        while (tr.prox[i] < ate) {
          var t = tr.prox[i];
          tr.prox[i] += fr[0];
          if (Math.random() < 0.12) continue; // às vezes uma frase descansa: mais respiro
          var oitava = Math.random() < 0.08 && fr[2][fr[2].length - 1][0] <= 76 ? 12 : 0, vel = 0.55 + Math.random() * 0.35;
          var pan = -0.5 + (i % 4) * 0.33;
          fr[2].forEach(function (n) { piano(n[0] + oitava, t + n[1] + (Math.random() - 0.5) * 0.05, vel * (0.9 + Math.random() * 0.2), pan); });
        }
      });
    };
    M.ligarTrilha = function (t) {
      if (!tr.bus || tr.ativa) return;
      t = t == null ? c.currentTime : t;
      tr.ativa = true;
      tr.prox = FRASES.map(function (fr) { return t + fr[1]; });
      tr.proxBase = t + 0.2;
      tr.bus.gain.cancelScheduledValues(t);
      tr.bus.gain.setTargetAtTime(1, t, 2.2); // entra devagar, em ~6 s
    };
    M.desligarTrilha = function () {
      if (!tr.bus || !tr.ativa) return;
      tr.ativa = false;
      tr.bus.gain.cancelScheduledValues(c.currentTime);
      tr.bus.gain.setTargetAtTime(0, c.currentTime, 0.5);
    };
    M.trilhaAtiva = function () { return tr.ativa; };
    // o que pesa (gerar ruído, sala) fica para depois do primeiro toque
    M.completar = function () { if (!rol) { montarRolagem(); montarTrilha(); } };
    return M;
  }

  /* ==========================================================================
     Página: gestos, rolagem, botão e volume
     ========================================================================== */
  var ctx = null, M = null, ultimo = 0, timerTrilha = 0;
  function preparar() {
    if (!M) {
      ctx = new AC(); M = Motor(ctx);
      setTimeout(function () { M.completar(); if (ligado()) ligarTrilha(); }, 120);
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  function cicloTrilha() {
    clearTimeout(timerTrilha);
    if (!M || !M.trilhaAtiva()) return;
    M.agendarTrilha(ctx.currentTime + 3);
    timerTrilha = setTimeout(cicloTrilha, 1000);
  }
  function ligarTrilha() { if (!M) return; M.ligarTrilha(); cicloTrilha(); marcar(); }
  function desligarTrilha() { if (!M) return; M.desligarTrilha(); clearTimeout(timerTrilha); marcar(); }
  function tocar(tipo) {
    var agora = performance.now();
    if (!ligado() || !M || agora - ultimo < 45) return; // rótulo + campo disparam dois cliques: toca uma vez só
    ultimo = agora;
    try { M.som(tipo); } catch (e) { /* sem áudio: segue em silêncio */ }
  }

  function desbloquear() {
    if (!ligado()) return; // som desligado: nem monta o áudio
    preparar();
    ligarTrilha();
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
    if (M && ligado() && ctx.state === 'running') { try { M.som('hover'); } catch (e) {} }
  }, { passive: true });

  // rolagem: velocidade em px/ms vira a força do sopro; parou de rolar, o som some devagar
  var rolY = 0, rolT = 0, rolParar = 0;
  window.addEventListener('scroll', function () {
    if (!M || !ligado() || document.hidden) return;
    var agora = performance.now(), y = window.scrollY, dt = agora - rolT;
    if (dt > 200) { rolY = y; rolT = agora; return; }
    if (dt < 8) return;
    var v = Math.abs(y - rolY) / dt;
    rolY = y; rolT = agora;
    M.rolar(Math.min(1, Math.max(0, (v - 0.08) / 2.6)));
    clearTimeout(rolParar);
    rolParar = setTimeout(function () { M.pararRolagem(); }, 120);
  }, { passive: true });
  // aba escondida: o áudio pausa (economiza bateria) e volta junto
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (ligado()) ctx.resume();
  });

  /* ---------- botão e volume ---------- */
  function marcar() {
    if (!btn) return;
    var on = ligado();
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Desligar o som' : 'Ligar o som';
    if (caixa) { caixa.classList.toggle('is-mudo', !on); caixa.classList.toggle('is-tocando', on && !!M && M.trilhaAtiva()); }
  }
  function pintarFaixa(v) {
    if (!faixa) return;
    faixa.value = v;
    faixa.style.setProperty('--v', ((v - 5) / 95 * 100).toFixed(1) + '%');
    faixa.setAttribute('aria-valuetext', v + '%');
    if (faixaTxt) faixaTxt.textContent = v + '%';
  }
  var tPainel = 0;
  function abrirPainel(ms) {
    if (!caixa) return;
    caixa.classList.add('is-aberto');
    clearTimeout(tPainel); tPainel = setTimeout(fecharPainel, ms || 3500);
  }
  function fecharPainel() { clearTimeout(tPainel); if (caixa) caixa.classList.remove('is-aberto'); }

  if (btn) btn.addEventListener('click', function () {
    var on = !ligado();
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    preparar();
    if (on) { ctx.resume(); ligarTrilha(); tocar('alternar'); abrirPainel(); }
    else {
      fecharPainel(); desligarTrilha(); M.pararRolagem();
      setTimeout(function () { if (!ligado()) ctx.suspend(); }, 2500);
    }
    marcar();
  });
  if (faixa) {
    faixa.addEventListener('input', function () {
      var v = Math.max(5, Math.min(100, parseInt(faixa.value, 10) || VOL_PADRAO));
      try { localStorage.setItem(KEY_VOL, String(v)); } catch (e) {}
      pintarFaixa(v);
      if (M) M.volume(v);
      if (caixa.classList.contains('is-aberto')) abrirPainel(4000); // mexendo no volume: o painel não fecha no meio
    });
    faixa.addEventListener('pointerdown', function () { if (caixa.classList.contains('is-aberto')) abrirPainel(6000); });
  }
  // toque fora ou Esc fecham o painel
  document.addEventListener('pointerdown', function (ev) { if (caixa && caixa.classList.contains('is-aberto') && !caixa.contains(ev.target)) fecharPainel(); }, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && caixa && caixa.classList.contains('is-aberto')) fecharPainel(); });

  pintarFaixa(volume());
  marcar();
  // contexto e motor expostos só para os testes medirem o volume (renderização offline)
  window.DrysulSom = { tocar: tocar, ligado: ligado, contexto: function () { return ctx; }, _Motor: Motor };
})();
