/* Drysul — sons de clique bem suaves.
   Sintetizados no navegador (sem arquivos): um "toc" redondo, grave e curto, com volume baixo e filtro que corta
   os agudos. Adicionar ao pedido toca duas notas suaves subindo. O botão "Som" da barra liga e desliga, e a
   escolha fica salva no navegador. */
(function () {
  'use strict';
  var KEY = 'drysul-som', btn = document.getElementById('som-toggle');
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { if (btn) btn.hidden = true; return; }

  var ctx = null, saida = null, ultimo = 0;
  function ligado() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  // o áudio só nasce no primeiro clique (exigência dos navegadores) e passa por um passa-baixa: nada de agudo
  function preparar() {
    if (!ctx) {
      ctx = new AC();
      saida = ctx.createGain(); saida.gain.value = 1;
      var filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 1400; filtro.Q.value = 0.5;
      saida.connect(filtro); filtro.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  // senoide com leve queda de afinação, ataque de 6 ms e decaimento rápido: soa como um toque macio
  function nota(freq, atraso, dur, vol) {
    var t = ctx.currentTime + 0.005 + atraso, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.1, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(saida);
    o.start(t); o.stop(t + dur + 0.05);
  }
  var SONS = {
    clique: function () { nota(420, 0, 0.08, 0.04); nota(210, 0, 0.07, 0.02); },
    alternar: function () { nota(330, 0, 0.1, 0.038); nota(165, 0, 0.08, 0.018); },
    adicionar: function () { nota(392, 0, 0.12, 0.04); nota(523.25, 0.07, 0.18, 0.035); }
  };
  function tocar(tipo) {
    var agora = performance.now();
    if (!ligado() || agora - ultimo < 45) return; // um rótulo e o seu campo disparam dois cliques: toca uma vez só
    ultimo = agora;
    try { preparar(); (SONS[tipo] || SONS.clique)(); } catch (e) { /* sem áudio: segue em silêncio */ }
  }

  var ALVO = 'button, a[href], summary, [role="button"], label.opt, input[type="checkbox"], input[type="radio"], select';
  document.addEventListener('click', function (ev) {
    if (!ev.isTrusted || !ev.target.closest) return;
    var el = ev.target.closest(ALVO);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el === btn) return;
    tocar(el.closest('[data-add]') ? 'adicionar' : el.matches('#theme-toggle, #motion-toggle, .calc-tab, .chip, [aria-pressed]') ? 'alternar' : 'clique');
  }, true);

  function marcar() {
    if (!btn) return;
    var on = ligado();
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Desligar os sons dos cliques' : 'Ligar os sons dos cliques');
    btn.title = on ? 'Sons dos cliques ligados' : 'Sons dos cliques desligados';
    var uso = btn.querySelector('use'); if (uso) uso.setAttribute('href', on ? '#i-som' : '#i-mudo');
  }
  if (btn) btn.addEventListener('click', function () {
    var on = !ligado();
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    marcar();
    if (on) tocar('alternar');
  });
  marcar();
  window.DrysulSom = { tocar: tocar, ligado: ligado };
})();
