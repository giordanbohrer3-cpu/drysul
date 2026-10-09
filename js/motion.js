/* Drysul — efeitos: fundo técnico em canvas, entradas ao rolar, parallax, camadas do hero,
   luz no ponteiro, inclinação de cartões, botões magnéticos e controle de pausa.
   Rolagem nativa (sem scroll hijacking). Tudo respeita prefers-reduced-motion e o botão de pausa. */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var KEY = 'drysul-motion';
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var on = root.classList.contains('motion-on');
  // efeitos pesados (3D ligado à rolagem, paralaxe) só no computador com mouse; no toque a página rola leve
  var mqRico = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  // a posição da rolagem é lida uma vez, no evento de rolagem (com estilo e layout em dia); os quadros só usam o valor.
  // Ler scrollY dentro do quadro, depois de escrever estilos, obrigava o navegador a recalcular tudo no meio da rolagem.
  // Só se lê enquanto o topo (a parede) está perto da tela; depois disso a rolagem não tem nenhuma leitura em JS.
  var rolY = window.scrollY, topoPerto = true;
  window.addEventListener('scroll', function () { if (topoPerto || mqRico.matches) rolY = window.scrollY; }, { passive: true });
  var hasIO = 'IntersectionObserver' in window;

  function pref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  /* ---------- controle de pausa ---------- */
  var toggle = $('#motion-toggle');
  function updateToggle() {
    if (!toggle) return;
    var label = on ? 'Pausar efeitos e sons' : 'Ativar efeitos e sons'; // os sons seguem este interruptor
    $('span', toggle).textContent = label;
    toggle.setAttribute('aria-label', label);
    $('use', toggle).setAttribute('href', on ? '#i-pause' : '#i-play');
    toggle.title = mqReduce.matches && !pref() ? 'Seu dispositivo pede menos movimento — efeitos reduzidos' : '';
  }
  function apply(v) {
    on = v;
    root.classList.toggle('motion-on', v);
    root.classList.toggle('motion-paused', !v);
    syncPin();
    updateToggle();
    if (v) { revealVisibleNow(); requestUpdate(); startCanvas(); ligarLenis(); }
    else { resetTransforms(); stopCanvas(); drawStatic(); desligarLenis(); }
  }
  function syncPin() { if (typeof syncParede === 'function') syncParede(false); }
  if (toggle) toggle.addEventListener('click', function () {
    var next = !on;
    try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch (e) {}
    apply(next);
  });
  var onMq = function () { if (!pref()) apply(!mqReduce.matches); else updateToggle(); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMq); else if (mqReduce.addListener) mqReduce.addListener(onMq);

  /* ---------- entradas ao rolar ---------- */
  $$('[data-stagger]').forEach(function (g) {
    $$('[data-reveal]', g).forEach(function (el, i) { el.style.setProperty('--d', Math.min(i, 6) * 80 + 'ms'); });
  });
  var revealIO = hasIO ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, mqRico.matches ? { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    : { rootMargin: '0px 0px 6% 0px', threshold: 0 }) : null; // no toque, começa um pouco antes de entrar: nada fica escondido na tela
  function observeReveals() {
    $$('[data-reveal]:not(.is-in)').forEach(function (el) {
      if (revealIO) revealIO.observe(el); else el.classList.add('is-in');
    });
  }
  // Ao reativar efeitos, o que já está na tela não deve sumir para reanimar
  function revealVisibleNow() {
    var vh = window.innerHeight;
    $$('[data-reveal]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-in');
      if (r.bottom <= 0) el.classList.add('is-in'); // acima da tela: já foi lido
    });
  }
  observeReveals();

  /* ---------- rolagem suave (computador com mouse ou trackpad) ----------
     O Lenis interpola a roda do mouse: a página e tudo o que anda com a rolagem se movem sem degraus.
     No toque, a rolagem nativa do celular já é fluida e não é alterada. */
  var lenis = null;
  function deslocTopo() { return -((parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 76) + 12); }
  function ligarLenis() {
    if (lenis || !on || !window.Lenis || !mqFine.matches) return;
    try {
      lenis = new window.Lenis({
        autoRaf: true, lerp: 0.1, smoothWheel: true, syncTouch: false, anchors: false,
        prevent: function (n) { return !!(n && n.closest && n.closest('dialog, .chips, .calc__systems, [data-lenis-prevent]')); }
      });
    } catch (e) { lenis = null; }
  }
  // um temporizador interno do Lenis pode recolocar a classe logo depois do destroy: limpa agora e de novo em seguida
  function limparClassesLenis() {
    if (lenis) return;
    Array.prototype.slice.call(root.classList).forEach(function (c) { if (c === 'lenis' || c.indexOf('lenis-') === 0) root.classList.remove(c); });
  }
  function desligarLenis() { if (lenis) { lenis.destroy(); lenis = null; limparClassesLenis(); setTimeout(limparClassesLenis, 700); setTimeout(limparClassesLenis, 1600); } }
  // destino em pixels, calculado na hora (cabeçalho fixo descontado): preciso mesmo com o hero alto e fixo
  // o cabeçalho fica no fluxo e encolhe depois de 24px de rolagem: a página sobe junto, então o destino já conta com isso
  function rolarAte(el) {
    if (!el) return;
    var y = 0;
    if (typeof el === 'number') y = Math.max(0, el); // destino já em pixels
    else if (el !== 'topo') {
      var hdr = document.querySelector('.site-header');
      var hAgora = hdr ? hdr.offsetHeight : 0;
      var base = el.getBoundingClientRect().top + window.scrollY;
      var hFim = base + deslocTopo() > 24 ? (window.matchMedia('(max-width: 1023px)').matches ? 58 : 62) : hAgora;
      y = Math.max(0, base - (hAgora && hdr.classList.contains('is-compact') ? 0 : hAgora - hFim) - hFim - 12);
    }
    if (lenis) lenis.scrollTo(y, { lerp: 0.1 });
    else if (el === 'topo' || typeof el === 'number') window.scrollTo({ top: y, behavior: on ? 'smooth' : 'auto' });
    else el.scrollIntoView({ block: 'start', behavior: on ? 'smooth' : 'auto' });
  }
  // links internos (#secao) com a rolagem suave ligada: o próprio motion.js leva até o destino
  document.addEventListener('click', function (ev) {
    if (!lenis || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a || a.closest('dialog')) return;
    var id = a.getAttribute('href').slice(1);
    if (id === 'top') { ev.preventDefault(); rolarAte('topo'); return; }
    var alvo = id && document.getElementById(id);
    if (!alvo) return;
    ev.preventDefault();
    rolarAte(alvo);
  });
  if (mqFine.addEventListener) mqFine.addEventListener('change', function () { if (mqFine.matches) ligarLenis(); else desligarLenis(); });

  /* ---------- formas técnicas flutuando ao fundo das seções claras ---------- */
  var FLUTUA = { categorias: ['p-chapa', 'p-perfil', 'p-parafuso'], produtos: ['p-caixa', 'p-chapa', 'p-fita'], ofertas: ['p-ancora', 'p-perfil', 'p-parafuso'],
    calculadora: ['p-chapa', 'p-balde', 'p-perfil'], solucoes: ['p-perfil', 'p-chapa', 'p-fita'], inspiracao: ['p-balde', 'p-chapa', 'p-parafuso'] };
  Object.keys(FLUTUA).forEach(function (id) {
    var sec = document.getElementById(id); if (!sec || $('.floaters', sec)) return;
    var box = document.createElement('div');
    box.className = 'floaters'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = FLUTUA[id].map(function (ic, i) {
      return '<svg class="floater floater--' + i + '" viewBox="0 0 120 90" focusable="false"><use href="#' + ic + '"/></svg>';
    }).join('');
    sec.insertBefore(box, sec.firstChild);
  });

  /* ---------- escrita animada ----------
     Rótulos (eyebrow) são digitados com cursor; títulos surgem letra a letra. Começa quando o texto entra
     na tela e segue em ritmo próprio, para nunca ficar pela metade se a pessoa parar de rolar. O texto
     completo fica num span só para leitores de tela; as letras animadas ficam escondidas deles. */
  function escHtml(t) { return t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var digitando = [];
  // seções de compra (catálogo e calculadora, .sec-head--compacto) ficam com o texto parado: leitura imediata
  // no toque (celular e tablet) os títulos ficam inteiros: dividir em letras animadas custava quadros na rolagem
  function semEfeito(el) { return !mqRico.matches || !!el.closest('.sec-head--compacto'); }
  $$('.sec-head .eyebrow, .contact__head .eyebrow, .about__copy > .eyebrow').filter(function (el) { return !semEfeito(el); }).forEach(function (el) {
    var txt = el.textContent.replace(/\s+/g, ' ').trim();
    el._tw = txt;
    el.setAttribute('data-type', 'digitar');
    el.innerHTML = '<span class="sr">' + escHtml(txt) + '</span><span class="tw-typed" aria-hidden="true"></span><span class="tw-caret" aria-hidden="true"></span>';
    $('.tw-typed', el).textContent = on ? '' : txt;
    digitando.push(el);
  });
  $$('.sec-title, .contact__title').filter(function (el) { return !semEfeito(el); }).forEach(function (el) {
    var txt = el.textContent.replace(/\s+/g, ' ').trim(), i = 0;
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    (function copiar(origem, destino) {
      Array.prototype.slice.call(origem.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { destino.appendChild(document.createTextNode(' ')); return; }
            var ws = document.createElement('span'); ws.className = 'tw-w';
            w.split('').forEach(function (ch) {
              var c = document.createElement('span'); c.className = 'tw-c'; c.style.setProperty('--i', i++); c.textContent = ch; ws.appendChild(c);
            });
            destino.appendChild(ws);
          });
        } else if (n.nodeType === 1) {
          var clone = n.cloneNode(false); destino.appendChild(clone); copiar(n, clone);
        }
      });
    })(el, vis);
    el.textContent = '';
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = txt;
    el.appendChild(sr); el.appendChild(vis);
    el.setAttribute('data-type', 'letras');
    digitando.push(el);
  });
  function digitar(el) {
    if (el._tipo) return;
    if (el.getAttribute('data-type') === 'letras') { el.classList.add('is-typed'); el._tipo = 1; return; }
    var alvo = $('.tw-typed', el), txt = el._tw, n = 0, t0 = performance.now(), passo = Math.max(18, Math.min(42, 620 / txt.length));
    el._tipo = 1; el.classList.add('is-typing');
    (function tic(t) {
      if (!on) { alvo.textContent = txt; el.classList.remove('is-typing'); return; }
      var k = Math.min(txt.length, Math.floor((t - t0) / passo));
      if (k !== n) { n = k; alvo.textContent = txt.slice(0, n); }
      if (n < txt.length) requestAnimationFrame(tic);
      else setTimeout(function () { el.classList.remove('is-typing'); }, 1400);
    })(t0);
  }
  function completarEscrita() {
    digitando.forEach(function (el) {
      if (el.getAttribute('data-type') === 'digitar') { $('.tw-typed', el).textContent = el._tw; el.classList.remove('is-typing'); }
      el.classList.add('is-typed'); el._tipo = 1;
    });
  }
  var escritaIO = hasIO ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { digitar(e.target); escritaIO.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.6 }) : null;
  if (!on || !escritaIO) completarEscrita(); else digitando.forEach(function (el) { escritaIO.observe(el); });

  /* ---------- 3D na rolagem: só perto da tela ----------
     As animações estão no CSS (animation-timeline). Aqui só se decide quem as recebe: blocos a até uma tela
     de distância ganham .s3d, então o navegador atualiza poucas linhas de tempo por quadro, não todas. */
  var S3D = '.marquee, .cat-card, .dest-card, .prod-card, .offer, .calc__panel, ' +
    '.step, .acc__item, .values li, .info-card, .about__media, .ph, .footer__grid > *';
  // No celular (toque) não há 3D na rolagem: as fotos ficam paradas e nítidas, e a rolagem não paga camadas 3D.
  var s3dIO = hasIO && window.CSS && CSS.supports && CSS.supports('animation-timeline: view()') ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.target.isConnected) { s3dIO.unobserve(e.target); return; }
      e.target.classList.toggle('s3d', e.isIntersecting && mqRico.matches);
    });
  }, { rootMargin: '100% 0px' }) : null;
  function observar3d(raiz) { if (s3dIO && mqRico.matches) $$(S3D, raiz).forEach(function (el) { s3dIO.observe(el); }); }
  observar3d();
  if (s3dIO && mqRico.addEventListener) mqRico.addEventListener('change', function () {
    if (mqRico.matches) { observar3d(); $$('.section').forEach(function (el) { secIO.observe(el); }); return; }
    s3dIO.disconnect(); secIO.disconnect();
    $$('.s3d').forEach(function (el) { el.classList.remove('s3d'); });
    $$('.sec-on').forEach(function (el) { el.classList.remove('sec-on'); });
  });
  var gradeCatalogo = $('#prod-grid'); // o catálogo é redesenhado a cada filtro
  if (s3dIO && gradeCatalogo && 'MutationObserver' in window) {
    new MutationObserver(function () { observar3d(gradeCatalogo); }).observe(gradeCatalogo, { childList: true });
  }
  // fundos que andam com a rolagem (padrão, brilho, formas) só nas seções perto da tela
  if (s3dIO) {
    var secIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('sec-on', e.isIntersecting); });
    }, { rootMargin: '50% 0px' });
    if (mqRico.matches) $$('.section').forEach(function (el) { secIO.observe(el); });
  }
  // animações contínuas (parede flutuando, faixa, ícones da calculadora) param fora da tela
  if (hasIO) {
    var vivoIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('anim-off', !e.isIntersecting); });
    });
    $$('.wall, .marquee, .calc__ph-ill').forEach(function (el) { vivoIO.observe(el); });
  }

  /* ---------- parallax e camadas ---------- */
  var parallax = $$('[data-parallax]'), photos = $$('[data-parallax-img]'), drift = $('[data-drift]');
  var hero = $('.hero');

  /* ---------- hero: parede drywall que desmonta com a rolagem ----------
     Sem palco fixo (o topo é compacto e a página não fica presa). Ao abrir, a parede se monta sozinha a partir das
     peças soltas; rolando, desmonta enquanto passa pela tela: a fita sai, as chapas abrem, os parafusos aparecem e
     fica a estrutura (guias e montantes). O valor desenhado persegue o da rolagem com amortecimento, então a roda do
     mouse não dá degraus. Sem efeitos fica uma pose parada, com as chapas entreabertas. --rmx/--rmy seguem o mouse. */
  var heroEl = $('.hero'), pinEl = $('.hero__pin'), rig = $('#wall-rig'), arteEl = $('.hero__art');
  var P0 = 0.14; // parede montada e já girada em 3D: a pose do começo
  var parede = { alvo: P0, atual: P0, intro: false, semPar: null, passo: -1, ini: 0, fim: 1, vista: false, paralaxe: false, desloc: 0 };
  (function montarParafusos() {
    var box = $('#wall-screws'); if (!box) return;
    var cols = [100, 194, 206, 300], rows = [40, 120, 200, 280, 360, 440], html = ''; // bordas ficam na dobradiça das chapas
    rows.forEach(function (y, r) {
      cols.forEach(function (x, c) {
        var d = r / rows.length * 0.68 + c * 0.018;
        html += '<span class="sc" style="left:' + x + 'px;top:' + y + 'px;--z:34px;--d:' + d.toFixed(3) + '">' +
          '<i class="sc__shaft"></i><i class="sc__head"></i></span>';
      });
    });
    box.innerHTML = html;
  })();
  function suave(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function trecho(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  // Cada variável vai só para os elementos que a usam e só é gravada quando muda: mexer na parede inteira
  // a cada quadro recalcularia o estilo de centenas de elementos (pesado no celular).
  var VARS_PAREDE = rig ? {
    '--rot': [rig], '--rot2': [rig],
    '--tape': [$('.wl--tape', rig)], '--tapeo': [$('.wl--tape', rig)],
    '--sep': [$('.wl--back', rig), $('.wl--plate-a', rig), $('.wl--plate-b', rig), $('#wall-screws'), $('.wl-label--parafuso', rig)],
    '--scr': [$('#wall-screws')]
  } : {};
  var gravadas = {};
  function pv(nome, v) {
    var txt = typeof v === 'number' ? v.toFixed(4) : String(v);
    if (gravadas[nome] === txt || !VARS_PAREDE[nome]) return;
    gravadas[nome] = txt;
    VARS_PAREDE[nome].forEach(function (el) { if (el) el.style.setProperty(nome, txt); });
  }
  function aplicarParede(p) {
    if (!rig) return;
    pv('--rot', suave(trecho(p, 0, 0.16)));
    pv('--rot2', suave(trecho(p, 0.36, 0.82)));
    pv('--tape', suave(trecho(p, 0.14, 0.3)));
    pv('--tapeo', trecho(p, 0.33, 0.4));
    pv('--sep', suave(trecho(p, 0.36, 0.54)));
    var scr = trecho(p, 0.53, 0.72);
    pv('--scr', scr);
    var semPar = scr <= 0;
    if (semPar !== parede.semPar) { parede.semPar = semPar; rig.classList.toggle('sem-parafusos', semPar); }
    // etapa: 0 montada, 1 fita, 2 chapas, 3 parafusos, 4 guias e montantes (acende o rótulo da peça)
    var passo = p < 0.2 ? 0 : p < 0.35 ? 1 : p < 0.53 ? 2 : p < 0.73 ? 3 : 4;
    if (passo !== parede.passo) { parede.passo = passo; rig.setAttribute('data-step', passo); }
  }
  function aplicarEstatica() {
    if (!rig) return;
    // chapas entreabertas: dá para ver estrutura, fita e parafusos sem peças soltas no ar
    [['--rot', 1], ['--rot2', 0], ['--tape', 0.2], ['--tapeo', 0], ['--sep', 0.35], ['--scr', 1]].forEach(function (v) { pv(v[0], v[1]); });
    rig.classList.remove('sem-parafusos'); parede.semPar = false;
    rig.removeAttribute('data-step');
    parede.passo = -1;
  }
  function paredeViva() { return on && parede.vista; }
  // trecho da rolagem em que a parede desmonta: começa quando ela está inteira na tela (ou no topo da página)
  // e termina quando o meio dela chega perto do cabeçalho; mede no resize, não a cada quadro
  // Computador: a parede está à direita, já na tela; ela sobe mais devagar que a página (paralaxe de 30%) para
  // dar tempo de ver as 4 etapas. Tablet e celular: ela vem depois dos atalhos e desmonta enquanto atravessa a tela.
  var mqLado = window.matchMedia('(min-width: 1024px)');
  function medirParede() {
    parede.vista = !!rig && !!arteEl && arteEl.offsetHeight > 0;
    if (!parede.vista) return;
    rolY = window.scrollY; // medição fora da rolagem (carga e resize): aqui a leitura é barata
    var r = arteEl.getBoundingClientRect(), topo = r.top + rolY - (parede.desloc || 0), vh = window.innerHeight;
    var cab = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 64;
    parede.paralaxe = mqLado.matches;
    if (parede.paralaxe) {
      parede.ini = 0;
      parede.fim = Math.max(320, (topo + r.height - cab) * 0.75);
    } else {
      parede.ini = Math.max(0, topo + r.height * 0.7 - vh);
      parede.fim = Math.max(parede.ini + 260, topo + r.height * 0.5 - cab - vh * 0.08);
    }
    if (!parede.paralaxe && parede.desloc) { parede.desloc = 0; arteEl.style.transform = ''; }
  }
  function paralaxeParede() {
    if (!parede.paralaxe || !paredeViva()) return;
    var d = Math.round(clamp(rolY, 0, parede.fim * 1.4) * 0.3);
    if (d !== parede.desloc) { parede.desloc = d; arteEl.style.transform = 'translate3d(0,' + d + 'px,0)'; }
  }
  function progressoParede() { return P0 + (1 - P0) * clamp((rolY - parede.ini) / (parede.fim - parede.ini), 0, 1); }
  var paredeRaf = 0, paredeT = 0;
  function seguirParede() {
    if (paredeRaf || parede.intro || !paredeViva()) return;
    paredeT = performance.now();
    paredeRaf = requestAnimationFrame(passoParede);
  }
  function passoParede(t) {
    paredeRaf = 0;
    if (!paredeViva() || parede.intro) return;
    var dt = Math.min(64, Math.max(0, t - paredeT)); paredeT = t;
    parede.alvo = progressoParede();
    var d = parede.alvo - parede.atual;
    parede.atual = Math.abs(d) < 0.0004 ? parede.alvo : parede.atual + d * (1 - Math.exp(-dt / (lenis ? 60 : 95)));
    aplicarParede(parede.atual);
    if (parede.atual !== parede.alvo) paredeRaf = requestAnimationFrame(passoParede);
  }
  // abertura: as peças soltas se juntam (só se a parede já está na tela; senão ela entra montada pela rolagem)
  function introParede() {
    var r = arteEl.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.75 || r.bottom < 0) return;
    var t0 = performance.now(), de = 0.7, dur = 1700;
    parede.intro = true;
    (function passo(t) {
      if (!paredeViva()) { parede.intro = false; return; }
      parede.alvo = progressoParede();
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      parede.atual = de + (parede.alvo - de) * e;
      aplicarParede(parede.atual);
      if (k < 1) requestAnimationFrame(passo); else { parede.intro = false; parede.atual = parede.alvo; aplicarParede(parede.atual); }
    })(t0);
  }
  // liga/desliga junto com os efeitos e com a largura da tela
  function syncParede(comIntro) {
    if (!rig) return;
    medirParede();
    if (!paredeViva()) { aplicarEstatica(); return; }
    parede.alvo = parede.atual = progressoParede();
    aplicarParede(parede.atual);
    paralaxeParede();
    if (comIntro) introParede();
  }
  var visible = new Set();
  var visIO = hasIO ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
      if (e.target === hero) { topoPerto = e.isIntersecting; if (topoPerto) rolY = window.scrollY; }
    });
    requestUpdate();
  }, { rootMargin: '120px 0px' }) : null;
  var targets = parallax.map(function (el) { return el.parentElement; })
    .concat(photos.map(function (el) { return el.parentElement; }))
    .concat(drift ? [drift.parentElement] : [], hero ? [hero] : []);
  targets.forEach(function (t) { if (visIO) visIO.observe(t); });

  var ticking = false;
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  var paralaxeLimpa = false;
  function update() {
    ticking = false;
    if (!on) return;
    if (rig && hero && visible.has(hero)) { paralaxeParede(); seguirParede(); }
    // paralaxe de fotos e camadas: só no computador (no celular, mexer em fotos a cada quadro dava tranco)
    if (!mqRico.matches) {
      if (!paralaxeLimpa) { paralaxeLimpa = true; parallax.concat(photos, drift ? [drift] : []).forEach(function (el) { el.style.transform = ''; }); }
      return;
    }
    paralaxeLimpa = false;
    var vh = window.innerHeight, escritas = [];
    // 1º todas as leituras (posições), 2º todas as escritas: intercalar as duas forçava um layout por elemento
    parallax.forEach(function (el) {
      var p = el.parentElement; if (!visible.has(p)) return;
      var r = p.getBoundingClientRect(), s = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      escritas.push([el, 'translate3d(0,' + clamp((r.top + r.height / 2 - vh / 2) * -s, -48, 48).toFixed(1) + 'px,0)']);
    });
    photos.forEach(function (img) {
      var f = img.parentElement; if (!visible.has(f)) return;
      var r = f.getBoundingClientRect(), prog = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      escritas.push([img, 'translate3d(0,' + (-prog * r.height * 0.06).toFixed(1) + 'px,0)']);
    });
    if (drift && visible.has(drift.parentElement)) {
      var dr = drift.parentElement.getBoundingClientRect();
      escritas.push([drift, 'translate3d(' + (-clamp((vh - dr.top) / (vh + dr.height), 0, 1) * 22).toFixed(2) + 'vw,0,0)']);
    }
    escritas.forEach(function (w) { w[0].style.transform = w[1]; });
  }
  function resetTransforms() {
    completarEscrita();
    parallax.concat(photos, drift ? [drift] : []).forEach(function (el) { el.style.transform = ''; });
    if (rig) { aplicarEstatica(); rig.style.setProperty('--rmx', 0); rig.style.setProperty('--rmy', 0); }
    if (arteEl) { arteEl.style.transform = ''; parede.desloc = 0; }
    $$('.is-tilting').forEach(function (el) { el.classList.remove('is-tilting'); el.style.transform = ''; });
    $$('[data-magnetic]').forEach(function (el) { el.style.transform = ''; });
  }
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', function () { if (rig) { var antes = paredeViva(); medirParede(); if (antes && !paredeViva()) aplicarEstatica(); } requestUpdate(); });

  /* ---------- ponteiro: luz, inclinação e magnetismo (só mouse/trackpad) ---------- */
  var tiltEl = null, magEl = null, pointerFrame = 0, lastEv = null, luzHero = $('.hero__light');
  function onPointer(ev) {
    if (!on || !mqFine.matches || ev.pointerType === 'touch') return;
    lastEv = ev;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
  }
  function applyPointer() {
    pointerFrame = 0;
    var ev = lastEv; if (!ev) return;
    var t = ev.target instanceof Element ? ev.target : null;

    if (hero && t && hero.contains(t)) {
      var hr = (pinEl || hero).getBoundingClientRect();
      if (luzHero) {
        luzHero.style.setProperty('--px', ((ev.clientX - hr.left) / hr.width * 100).toFixed(1) + '%');
        luzHero.style.setProperty('--py', ((ev.clientY - hr.top) / hr.height * 100).toFixed(1) + '%');
      }
      if (rig) {
        rig.style.setProperty('--rmx', ((ev.clientX - hr.left) / hr.width * 2 - 1).toFixed(3));
        rig.style.setProperty('--rmy', ((ev.clientY - hr.top) / hr.height * 2 - 1).toFixed(3));
      }
    }

    var tilt = t && t.closest('[data-tilt]');
    if (tiltEl && tiltEl !== tilt) releaseTilt(tiltEl);
    tiltEl = tilt;
    if (tilt) {
      var r = tilt.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
      tilt.classList.add('is-tilting');
      tilt.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      tilt.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      tilt.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * 5).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 6).toFixed(2) + 'deg) translateY(-4px)';
    }

    var mag = t && t.closest('[data-magnetic]');
    if (magEl && magEl !== mag) magEl.style.transform = '';
    magEl = mag;
    if (mag) {
      var m = mag.getBoundingClientRect();
      var dx = clamp((ev.clientX - (m.left + m.width / 2)) * 0.12, -4, 4);
      var dy = clamp((ev.clientY - (m.top + m.height / 2)) * 0.2, -3, 3);
      mag.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    }
  }
  function releaseTilt(el) { el.classList.remove('is-tilting'); el.style.transform = ''; }
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerleave', function () {
    if (tiltEl) releaseTilt(tiltEl); if (magEl) magEl.style.transform = ''; tiltEl = magEl = null;
  });

  /* ---------- fundo técnico em canvas ---------- */
  function TechCanvas(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.dark = cv.getAttribute('data-canvas') === 'dark';
    this.visible = false; this.w = 0; this.h = 0; this.crosses = [];
    if (!('ResizeObserver' in window)) this.resize(); // com o observer, o tamanho chega no 1º aviso dele, sem forçar layout na carga
  }
  TechCanvas.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.25 : 1.5);
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(clamp(this.w * this.h / 26000, 10, 70));
    this.crosses = [];
    for (var i = 0; i < n; i++) {
      this.crosses.push({ gx: Math.floor(Math.random() * 40), gy: Math.floor(Math.random() * 40), ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.9, hot: Math.random() < 0.35 });
    }
  };
  TechCanvas.prototype.draw = function (t) {
    var c = this.ctx, w = this.w, h = this.h, dark = this.dark || root.getAttribute('data-theme') === 'dark';
    if (!w || !h) return;
    if (!this.live) { this.live = true; this.cv.classList.add('is-live'); }
    c.clearRect(0, 0, w, h);
    var minor = 24, major = 120, off = (t * 0.008) % major;
    var ink = dark ? '216,217,210' : '16,22,43';

    c.lineWidth = 1;
    c.strokeStyle = 'rgba(' + ink + ',' + (dark ? 0.04 : 0.035) + ')';
    c.beginPath();
    for (var x = (off % minor) - minor; x < w; x += minor) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); }
    for (var y = (off % minor) - minor; y < h; y += minor) { c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); }
    c.stroke();
    c.strokeStyle = 'rgba(' + ink + ',' + (dark ? 0.08 : 0.06) + ')';
    c.beginPath();
    for (x = off - major; x < w; x += major) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); }
    for (y = off - major; y < h; y += major) { c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); }
    c.stroke();

    // guias de construção
    var rot = t * 0.00004;
    c.save();
    c.setLineDash([4, 7]);
    c.strokeStyle = dark ? 'rgba(239,80,35,.22)' : 'rgba(239,80,35,.16)';
    c.beginPath(); c.arc(w * 0.8, h * 0.28, Math.min(w, h) * 0.34, rot, rot + Math.PI * 1.35); c.stroke();
    c.beginPath(); c.moveTo(0, h * 0.86); c.lineTo(w, h * 0.52); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = 'rgba(' + ink + ',' + (dark ? 0.12 : 0.08) + ')';
    c.beginPath(); c.moveTo(w * 0.62, 0); c.lineTo(w * 0.62, h); c.stroke();
    c.restore();

    // cruzes de marcação intermitentes
    for (var i = 0; i < this.crosses.length; i++) {
      var k = this.crosses[i];
      var a = Math.pow(Math.max(0, Math.sin(t * 0.001 * k.sp + k.ph)), 3);
      if (a < 0.02) continue;
      var cx = ((k.gx * major / 2 + off) % (w + major)) - major / 4, cy = ((k.gy * major / 2 + off) % (h + major)) - major / 4;
      if (dark && cx < w * 0.52 && w > 900) continue; // não cruzar o texto
      c.strokeStyle = k.hot ? 'rgba(239,80,35,' + (a * 0.75).toFixed(3) + ')' : 'rgba(' + ink + ',' + (a * (dark ? 0.5 : 0.35)).toFixed(3) + ')';
      c.beginPath(); c.moveTo(cx - 5, cy); c.lineTo(cx + 5, cy); c.moveTo(cx, cy - 5); c.lineTo(cx, cy + 5); c.stroke();
    }

    // passagem sutil de luz
    var band = 280, pos = ((t * 0.00006) % 1.6 - 0.3) * (w + band);
    var g = c.createLinearGradient(pos - band, 0, pos + band, 0);
    var lum = dark ? '255,255,255' : '239,80,35';
    g.addColorStop(0, 'rgba(' + lum + ',0)'); g.addColorStop(0.5, 'rgba(' + lum + ',' + (dark ? 0.035 : 0.025) + ')'); g.addColorStop(1, 'rgba(' + lum + ',0)');
    c.fillStyle = g; c.fillRect(pos - band, 0, band * 2, h);
  };

  var canvases = $$('canvas[data-canvas]').map(function (cv) { return new TechCanvas(cv); });

  // Durante rolagem e toques o fundo congela: a thread principal fica livre para o 3D e para responder.
  // O relógio próprio (vt) só anda quando desenha, então o fundo retoma de onde parou, sem salto.
  var raf = 0, last = 0, vt = 0, pausaAte = 0;
  function pausarFundo() { pausaAte = performance.now() + 180; }
  window.addEventListener('scroll', pausarFundo, { passive: true });
  document.addEventListener('pointerdown', pausarFundo, { passive: true });
  document.addEventListener('keydown', pausarFundo);
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return; // ~30 fps
    var dt = Math.min(t - last, 100);
    last = t;
    if (t < pausaAte) return;
    vt += dt;
    canvases.forEach(function (cv) { if (cv.visible) cv.draw(vt); });
  }
  function startCanvas() { if (!raf && on && !document.hidden && canvases.length) raf = requestAnimationFrame(loop); }
  function stopCanvas() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function drawStatic() { canvases.forEach(function (cv) { cv.draw(4000); }); }

  if (hasIO) {
    var cvIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { canvases.forEach(function (cv) { if (cv.cv === e.target) cv.visible = e.isIntersecting; }); });
    });
    canvases.forEach(function (cv) { cvIO.observe(cv.cv); });
  } else canvases.forEach(function (cv) { cv.visible = true; });
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function (es) {
      es.forEach(function (e) { canvases.forEach(function (cv) { if (cv.cv === e.target) { cv.resize(); if (!on) cv.draw(4000); } }); });
      requestUpdate();
    });
    canvases.forEach(function (cv) { ro.observe(cv.cv); });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopCanvas(); else startCanvas(); });

  /* ---------- início ---------- */
  updateToggle();
  function startWhenIdle() {
    var go = function () { if (on) startCanvas(); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 600);
  }
  // parede: mede no próximo quadro (o layout já sai junto com a pintura, sem um layout extra no meio do script)
  if (rig) { aplicarEstatica(); if (on) requestAnimationFrame(function () { syncParede(true); }); }
  if (on) {
    requestUpdate();
    if (document.readyState === 'complete') startWhenIdle(); else window.addEventListener('load', startWhenIdle, { once: true });
  } else drawStatic();
  if (on) ligarLenis();
  window.DrysulMotion = { refresh: observeReveals, isOn: function () { return on; }, rolarAte: rolarAte };
})();
