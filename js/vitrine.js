/* Drysul — vitrine 3D: um anel com os produtos, preços e ofertas girando devagar logo abaixo do topo.
   - Dados: os próprios produtos do data.js (ofertas e linha Drysul primeiro). Clicar leva ao produto no catálogo.
   - Movimento: só o anel gira (uma animação de transform, que o navegador roda no compositor); os cartões ficam
     parados dentro dele. Fora da tela ou com a aba escondida, o anel para.
   - Mouse em cima: o anel desacelera até parar. Arrastar (ou deslizar no celular) gira o anel, com inércia.
   - Teclado: o cartão focado vem para a frente. Botão de pausa (conteúdo que se move sozinho precisa poder parar).
   - Sem efeitos (menos movimento no aparelho ou efeitos pausados): vira uma faixa plana com rolagem lateral. */
(function () {
  'use strict';
  var D = window.DRYSUL, A = window.DrysulApp;
  var raiz = document.getElementById('vitrine');
  if (!raiz || !D || !A) return;
  var html = document.documentElement, esc = A.esc;
  var palco = raiz.querySelector('.vitrine__palco'), anel = raiz.querySelector('.vitrine__anel'), pausaBtn = raiz.querySelector('.vitrine__pausa');

  /* ---------- cartões ---------- */
  // ordem: ofertas, linha Drysul, os que têm preço e, por fim, os "sob consulta" (sort estável mantém a do catálogo)
  function peso(p) { return p.oferta ? 0 : p.destaque ? 1 : p.preco != null ? 2 : 3; }
  var itens = D.produtos.slice().sort(function (a, b) { return peso(a) - peso(b); });
  var n = itens.length;
  anel.innerHTML = itens.map(function (p, i) {
    var temPreco = p.preco != null, preco = temPreco ? A.BRL.format(p.preco) : '';
    var selo = p.oferta ? '<span class="vt__selo">Oferta</span>' : p.destaque ? '<span class="vt__selo vt__selo--linha">Linha Drysul</span>' : '';
    var rotulo = p.nome + (temPreco ? ', ' + preco + ' por ' + p.un : ', sob consulta') + (p.oferta ? '. Oferta' : '') + '. Ver no catálogo';
    return '<li class="vt" style="--i:' + i + '">' +
      '<button class="vt__card' + (p.oferta ? ' vt__card--oferta' : '') + '" type="button" data-vt="' + esc(p.id) + '" aria-label="' + esc(rotulo) + '">' +
        '<span class="vt__foto">' + (p.fotoMini
          ? '<img src="' + esc(p.fotoMini) + '" width="400" height="300" alt="" decoding="async" fetchpriority="low" draggable="false">'
          : A.ill(p.icone)) + '</span>' +
        '<span class="vt__info">' + selo +
          '<span class="vt__nome">' + esc(p.nome) + '</span>' +
          '<span class="vt__preco">' + (temPreco ? '<b>' + preco + '</b><small>/' + esc(p.un) + '</small>' : '<b class="is-consulta">Sob consulta</b>') + '</span>' +
        '</span>' +
      '</button></li>';
  }).join('');
  // sem loading="lazy" de propósito: o giro roda fora da thread principal, então o navegador não percebe a foto
  // chegando à frente e ela ficava em branco. São miniaturas leves (2–9 KB) com prioridade baixa.
  var lis = Array.prototype.slice.call(anel.children);
  // um só ponto de parada no Tab (o cartão atual); as setas passam de um produto a outro
  var botoes = lis.map(function (li) { return li.querySelector('[data-vt]'); }), atual = 0;
  function marcarAtual(i) { botoes[atual].tabIndex = -1; atual = i; botoes[i].tabIndex = 0; }
  botoes.forEach(function (b, i) { b.tabIndex = i === 0 ? 0 : -1; });

  /* ---------- geometria do anel ----------
     Raio para os n cartões caberem lado a lado: R = (largura + vão) / (2·tan(π/n)). O anel recua R para o
     cartão da frente ficar no plano da tela (tamanho real), e os outros se afastam em curva. */
  var R = 0, DUR = n * 3600; // 3,6 s por cartão na frente: dá para ler nome e preço com calma
  function px(nome) { return parseFloat(getComputedStyle(raiz).getPropertyValue(nome)) || 0; }
  function medir() {
    var r = (px('--vt-w') + px('--vt-gap')) / (2 * Math.tan(Math.PI / n));
    if (Math.abs(r - R) < 0.5) return false;
    R = r;
    anel.style.setProperty('--raio', R.toFixed(1) + 'px');
    anel.style.setProperty('--passo', (360 / n).toFixed(4) + 'deg');
    return true;
  }

  /* ---------- animação ---------- */
  var anim = null, taxa = 1, alvoTaxa = 1, rafTaxa = 0, visivel = false;
  var motivos = {}; // por que está parado: mouse em cima, arrasto, foco, botão de pausa
  // segue o interruptor de efeitos do site (que já respeita o "menos movimento" do aparelho)
  function ligado() { return html.classList.contains('motion-on') && typeof anel.animate === 'function'; }
  function criar() {
    var t = anim ? anim.currentTime || 0 : 0;
    if (anim) anim.cancel();
    anim = anel.animate([
      { transform: 'translateZ(' + (-R).toFixed(1) + 'px) rotateY(0deg)' },
      { transform: 'translateZ(' + (-R).toFixed(1) + 'px) rotateY(-360deg)' }
    ], { duration: DUR, iterations: Infinity });
    anim.currentTime = t;
    anim.playbackRate = taxa;
    if (!visivel) anim.pause();
  }
  function aplicarTaxa() { if (!anim) return; if (anim.updatePlaybackRate) anim.updatePlaybackRate(taxa); else anim.playbackRate = taxa; }
  // a velocidade muda devagar (desacelera até parar e volta a acelerar): nada de tranco
  function passoTaxa() {
    rafTaxa = 0;
    taxa += (alvoTaxa - taxa) * 0.14;
    if (Math.abs(alvoTaxa - taxa) < 0.01) taxa = alvoTaxa;
    aplicarTaxa();
    if (taxa !== alvoTaxa) rafTaxa = requestAnimationFrame(passoTaxa);
  }
  function rever() {
    var parado = Object.keys(motivos).some(function (k) { return motivos[k]; });
    alvoTaxa = parado ? 0 : 1;
    if (!rafTaxa && taxa !== alvoTaxa) rafTaxa = requestAnimationFrame(passoTaxa);
  }
  function parar(m) { motivos[m] = true; rever(); }
  function soltar(m) { motivos[m] = false; rever(); }
  function tempo() { return anim ? anim.currentTime || 0 : 0; }
  // o tempo fica sempre dentro de uma volta: girar para trás (arrasto ou inércia) deixava o tempo negativo, a animação
  // saía de cena e o anel parava no primeiro produto até o tempo voltar a ser positivo (segundos parado)
  function irPara(t) { if (anim) anim.currentTime = ((t % DUR) + DUR) % DUR; marcarFrente(); }

  // o cartão que passa pela frente acende (conta leve, 5 vezes por segundo, sem ler o layout)
  var frente = -1, timerFrente = 0;
  function marcarFrente() {
    if (!anim) return;
    var k = ((tempo() % DUR) + DUR) % DUR / DUR, i = Math.round(k * n) % n;
    if (i === frente) return;
    if (lis[frente]) lis[frente].classList.remove('is-frente');
    frente = i; lis[i].classList.add('is-frente');
  }
  function relogio(on) {
    clearInterval(timerFrente); timerFrente = 0;
    if (on) { marcarFrente(); timerFrente = setInterval(marcarFrente, 200); }
  }

  /* ---------- liga e desliga (efeitos do site, tela, visibilidade) ---------- */
  function sincronizar() {
    var on = ligado();
    raiz.classList.toggle('is-3d', on);
    if (!on) {
      if (anim) { anim.cancel(); anim = null; }
      relogio(false);
      if (lis[frente]) lis[frente].classList.remove('is-frente'); frente = -1;
      return;
    }
    medir(); criar(); relogio(visivel);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visivel = es[es.length - 1].isIntersecting;
      raiz.classList.toggle('is-fora', !visivel); // pausa também o pulso e o brilho decorativos (CSS)
      if (anim) { if (visivel) anim.play(); else anim.pause(); }
      relogio(visivel && !!anim);
    }, { rootMargin: '80px 0px' }).observe(raiz);
  } else visivel = true;
  new MutationObserver(sincronizar).observe(html, { attributes: true, attributeFilter: ['class'] });
  if ('ResizeObserver' in window) new ResizeObserver(function () { if (anim && medir()) criar(); }).observe(palco);
  document.addEventListener('visibilitychange', function () { if (anim) { if (document.hidden) anim.pause(); else if (visivel) anim.play(); } });
  sincronizar();

  /* ---------- mouse em cima: desacelera até parar ---------- */
  palco.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') parar('sobre'); });
  palco.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') soltar('sobre'); });

  /* ---------- arrastar / deslizar: gira com inércia ----------
     Dedo (eventos de toque) e mouse (eventos de ponteiro) separados: no Safari do iPhone o ponteiro com pan-y cancelava
     o arrasto no meio (tranco) e a parte vertical do gesto rolava a página. Agora, decidido que o gesto é horizontal,
     o toque segura a página (preventDefault) até soltar; gesto mais vertical é rolagem e o anel não interfere.
     Enquanto arrasta, a animação fica pausada e o anel segue o dedo direto (sem disputar com a troca de velocidade). */
  var arr = null, arrastou = false, rafInercia = 0;
  function msPorPx() { return DUR / (2 * Math.PI * R); }
  // a foto do cartão não pode ser arrastada pelo navegador: isso cancelava o gesto de girar
  palco.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
  function inicio(x, y, id) {
    if (!anim) return;
    cancelAnimationFrame(rafInercia); rafInercia = 0;
    arr = { x: x, y: y, x0: x, y0: y, t: performance.now(), v: 0, id: id, ativo: false };
    arrastou = false;
  }
  // devolve true quando o gesto é (ou virou) arrasto horizontal
  function mover(x, y) {
    if (!arr) return false;
    if (!arr.ativo) {
      var dx0 = x - arr.x0, dy0 = y - arr.y0;
      if (Math.abs(dx0) < 6 && Math.abs(dy0) < 6) return false;
      if (Math.abs(dy0) >= Math.abs(dx0)) { arr = null; if (motivos.arrasto) retomar(); return false; } // rolagem da página
      arr.ativo = true; arrastou = true; arr.x = x; arr.t = performance.now();
      palco.classList.add('is-arrastando');
      parar('arrasto'); anim.pause();
      return true;
    }
    var agora = performance.now(), dt = Math.max(1, agora - arr.t), d = -(x - arr.x) * msPorPx();
    irPara(tempo() + d);
    arr.v = arr.v * 0.6 + (d / dt) * 0.4; // velocidade suavizada (ms de animação por ms de relógio)
    arr.x = x; arr.y = y; arr.t = agora;
    return true;
  }
  function retomar() {
    // volta a girar do zero e acelera devagar até o ritmo normal (sem tranco)
    taxa = 0; aplicarTaxa();
    if (anim && visivel && !document.hidden) anim.play();
    soltar('arrasto');
  }
  function fim() {
    if (!arr) return;
    var ativo = arr.ativo, v = Math.max(-40, Math.min(40, arr.v)), t0 = performance.now();
    if (performance.now() - arr.t > 90) v = 0; // dedo parado antes de soltar: sem inércia
    arr = null;
    palco.classList.remove('is-arrastando');
    // um toque que parou a inércia sem virar arrasto: o anel volta a girar
    if (!ativo) { if (motivos.arrasto) retomar(); return; }
    // inércia: o anel segue girando e freia sozinho; depois volta ao ritmo normal
    (function inercia(t) {
      var dt = Math.min(48, t - t0); t0 = t;
      irPara(tempo() + v * dt);
      v *= Math.exp(-dt / 320);
      if (Math.abs(v) > 0.5) rafInercia = requestAnimationFrame(inercia);
      else { rafInercia = 0; retomar(); }
    })(t0);
  }
  // dedo
  palco.addEventListener('touchstart', function (ev) {
    if (ev.touches.length !== 1) { arr = null; return; }
    var t = ev.touches[0]; inicio(t.clientX, t.clientY, 'toque');
  }, { passive: true });
  palco.addEventListener('touchmove', function (ev) {
    if (!arr || ev.touches.length !== 1) return;
    var t = ev.touches[0];
    if (mover(t.clientX, t.clientY) && ev.cancelable) ev.preventDefault(); // segura a página durante o arrasto
  }, { passive: false });
  palco.addEventListener('touchend', fim);
  palco.addEventListener('touchcancel', fim);
  // mouse e caneta
  palco.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'touch' || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    inicio(ev.clientX, ev.clientY, ev.pointerId);
  });
  palco.addEventListener('pointermove', function (ev) {
    if (!arr || ev.pointerId !== arr.id) return;
    var eraAtivo = arr.ativo;
    if (mover(ev.clientX, ev.clientY) && !eraAtivo) { try { palco.setPointerCapture(ev.pointerId); } catch (e) {} }
  });
  function fimPonteiro(ev) { if (arr && ev.pointerId === arr.id) fim(); }
  palco.addEventListener('pointerup', fimPonteiro);
  palco.addEventListener('pointercancel', fimPonteiro);

  /* ---------- clique: vai ao produto no catálogo (um arrasto não conta como clique) ---------- */
  anel.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-vt]'); if (!b) return;
    if (arrastou) { arrastou = false; ev.preventDefault(); return; }
    if (A.irProduto) A.irProduto(b.getAttribute('data-vt'));
  });

  /* ---------- teclado: o cartão focado gira até a frente ---------- */
  var rafFoco = 0;
  function trazer(i) {
    if (!anim) return;
    var alvo = i / n * DUR, atual = tempo(), base = ((atual % DUR) + DUR) % DUR;
    var delta = ((alvo - base) % DUR + DUR * 1.5) % DUR - DUR / 2; // caminho mais curto
    var ini = atual, t0 = performance.now();
    cancelAnimationFrame(rafFoco);
    (function passo(t) {
      var k = Math.min(1, (t - t0) / 520), e = 1 - Math.pow(1 - k, 3);
      irPara(ini + delta * e);
      if (k < 1) rafFoco = requestAnimationFrame(passo);
    })(t0);
  }
  // só o foco do teclado para o anel: o clique ou o arrasto do mouse também focam o cartão, e o anel ficava parado
  anel.addEventListener('focusin', function (ev) {
    var li = ev.target.closest('.vt'); if (!li) return;
    marcarAtual(lis.indexOf(li));
    if (!ev.target.matches(':focus-visible')) return;
    parar('foco'); trazer(atual);
  });
  anel.addEventListener('keydown', function (ev) {
    var ir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key], i;
    if (ir) i = (atual + ir + n) % n; else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else return;
    ev.preventDefault(); marcarAtual(i); botoes[i].focus({ preventScroll: true });
  });
  anel.addEventListener('focusout', function (ev) { if (!anel.contains(ev.relatedTarget)) soltar('foco'); });

  /* ---------- botão de pausa ---------- */
  if (pausaBtn) pausaBtn.addEventListener('click', function () {
    var pausar = pausaBtn.getAttribute('aria-pressed') !== 'true';
    pausaBtn.setAttribute('aria-pressed', String(pausar));
    pausaBtn.setAttribute('aria-label', pausar ? 'Girar a vitrine' : 'Pausar a vitrine');
    pausaBtn.querySelector('use').setAttribute('href', pausar ? '#i-play' : '#i-pause');
    if (pausar) parar('botao'); else soltar('botao');
  });
})();
