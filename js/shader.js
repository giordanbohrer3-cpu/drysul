/* Fundos com profundidade em shader (WebGL): grade técnica em perspectiva que some na névoa, luz quente no horizonte.
   Custo mínimo: meia resolução; no computador anima a ~30 qps só com o fundo na tela, aba visível, efeitos ligados e
   sem rolagem; no celular/tablet desenha um quadro parado (profundidade sem custo contínuo). Sem WebGL, com economia
   de dados ou "menos movimento", nada muda: o canvas 2D de sempre (motion.js) cuida do fundo. */
(function () {
  'use strict';
  var html = document.documentElement, conn = navigator.connection;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || (conn && conn.saveData)) return;
  var ANIMA = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FS = 'precision mediump float;uniform vec2 r;uniform float t,esc;' +
    'void main(){vec2 uv=gl_FragCoord.xy/r;float asp=r.x/r.y;vec2 p=vec2((uv.x-.5)*asp,uv.y);float hz=.66,d=hz-p.y,a=0.;' +
    'if(d>0.){float z=.32/d;vec2 g=vec2(p.x*z,z+t*.045);vec2 f=abs(fract(g*1.6)-.5);' +
    'float ln=1.-smoothstep(.0,.035+.012*z,min(f.x,f.y));a=ln*exp(-z*.42)*smoothstep(0.,.12,d);}' +
    'float gl=exp(-pow((p.y-hz)*5.,2.))*(.55+.12*sin(t*.5));' +
    'float lx=(fract(t*.025)*2.4-1.2)*asp;float luz=exp(-pow(p.x-lx,2.)*2.5)*exp(-pow((p.y-hz)*3.,2.));' +
    'vec3 tinta=mix(vec3(.063,.086,.169),vec3(1.),esc);vec3 lar=vec3(.937,.314,.137);' +
    'float at=a*mix(.09,.13,esc),ag=gl*mix(.07,.1,esc)+luz*.08;' +
    'float al=clamp(at+ag,0.,1.);vec3 c=(tinta*at+lar*ag)/max(al,.001);gl_FragColor=vec4(c*al,al);}';

  var fundos = [];
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-canvas]'), function (cv) {
    var gl = cv.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    if (!gl) return;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(function (s) {
      var sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return; // fica com o canvas 2D
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var tipo = cv.getAttribute('data-canvas');
    cv.removeAttribute('data-canvas'); cv.setAttribute('data-shader', tipo); // o motion.js deixa este fundo com o shader
    fundos.push({ cv: cv, gl: gl, tipo: tipo, u: { r: gl.getUniformLocation(prog, 'r'), t: gl.getUniformLocation(prog, 't'), esc: gl.getUniformLocation(prog, 'esc') }, vis: false });
  });
  if (!fundos.length) return;

  function medir(f) {
    var esc = Math.min(window.devicePixelRatio || 1, 2) * 0.5, w = Math.round(f.cv.clientWidth * esc), h = Math.round(f.cv.clientHeight * esc);
    if (w && h && (f.cv.width !== w || f.cv.height !== h)) { f.cv.width = w; f.cv.height = h; }
  }
  function desenhar(f, t) {
    if (!f.cv.width) medir(f);
    var g = f.gl;
    g.viewport(0, 0, f.cv.width, f.cv.height);
    g.uniform2f(f.u.r, f.cv.width, f.cv.height); g.uniform1f(f.u.t, t);
    g.uniform1f(f.u.esc, f.tipo === 'dark' || html.getAttribute('data-theme') === 'dark' ? 1 : 0);
    g.drawArrays(g.TRIANGLES, 0, 3);
    f.cv.classList.add('is-live');
  }
  var parado = function () { fundos.forEach(function (f) { medir(f); desenhar(f, 24); }); };

  if ('ResizeObserver' in window) new ResizeObserver(function () { fundos.forEach(medir); if (!ANIMA) parado(); }).observe(document.body);
  new MutationObserver(function () { if (!ANIMA) parado(); else iniciar(); }).observe(html, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (!ANIMA) { parado(); return; }

  // Computador: anima só o necessário
  var raf = 0, ultimo = 0, relogio = 0, pausaAte = 0;
  window.addEventListener('scroll', function () { pausaAte = performance.now() + 180; }, { passive: true });
  function ativo() { return !document.hidden && html.classList.contains('motion-on') && fundos.some(function (f) { return f.vis; }); }
  function quadro(ts) {
    raf = 0;
    if (!ativo()) return;
    if (ts - ultimo >= 33 && ts > pausaAte) {
      relogio += Math.min(ts - ultimo, 100) / 1000; ultimo = ts;
      fundos.forEach(function (f) { if (f.vis) desenhar(f, relogio); });
    } else if (!ultimo) ultimo = ts;
    raf = requestAnimationFrame(quadro);
  }
  function iniciar() { if (!raf && ativo()) raf = requestAnimationFrame(quadro); }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { fundos.forEach(function (f) { if (f.cv === e.target) { f.vis = e.isIntersecting; if (f.vis && !f.cv.classList.contains('is-live')) desenhar(f, relogio); } }); });
    iniciar();
  }, { rootMargin: '100px 0px' });
  fundos.forEach(function (f) { io.observe(f.cv); });
  document.addEventListener('visibilitychange', iniciar);
})();
