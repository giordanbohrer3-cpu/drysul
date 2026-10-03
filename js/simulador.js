/* Drysul — simulador de acabamento.
   O cliente tira (ou escolhe) uma foto da parede ou do teto, marca os 4 cantos e escolhe um acabamento.
   Tudo roda no aparelho, em WebGL 2: a foto não sai do navegador, sem servidor e sem serviço de IA.
   Como funciona:
   - os 4 cantos definem uma homografia (a perspectiva da superfície na foto);
   - o acabamento é uma textura gerada aqui, em metros reais, aplicada com essa perspectiva e com mipmaps;
   - a luz e as sombras da foto (luminância bem desfocada, que apaga tijolo e reboco mas guarda a iluminação)
     multiplicam o acabamento, e a cor média da luz tinge de leve: o resultado parece da mesma foto;
   - um pincel protege janelas, móveis e objetos que ficam na frente da superfície.
   Carregado sob demanda pelo app.js (window.DrysulSim.abrir). */
(function () {
  'use strict';

  var D = window.DRYSUL || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var reduz = function () { return !document.documentElement.classList.contains('motion-on'); };
  var MAX_LADO = 1600;           // a foto é reduzida para este lado maior (memória e velocidade no celular)
  var EXEMPLO = {
    url: 'assets/img/sim-exemplo.webp',
    credito: 'Foto de exemplo: Kai Kemmann, CC BY-SA 4.0 (Wikimedia Commons)',
    // cantos e áreas protegidas já marcados na foto de exemplo (1280 × 960)
    cantos: [[0, 0], [1280, 0], [1280, 946], [0, 946]],
    protegidas: [
      { t: 'pol', p: [[292, 208], [958, 208], [958, 227], [937, 227], [937, 960], [305, 960], [305, 227], [292, 227]] }, // varão, cortinas e janela
      { t: 'eli', x: 330, y: 942, rx: 130, ry: 127 }, // ventilador
      { t: 'pol', p: [[0, 810], [16, 820], [34, 845], [80, 918], [76, 931], [36, 931], [24, 852], [0, 834]] }, // luminária da esquerda
      { t: 'eli', x: 751, y: 4, rx: 124, ry: 55 }     // luminária do teto
    ]
  };

  /* ---------- acabamentos ---------- */
  var TINTA = [['Branco gelo', '#EDECE7'], ['Cinza névoa', '#C9CAC5'], ['Areia', '#D8C8AE'], ['Verde sálvia', '#A2AD93'],
    ['Terracota', '#BF8062'], ['Azul Drysul', '#2C3968'], ['Grafite', '#46494E']];
  var MADEIRA = [['Freijó', '#B48A5E'], ['Carvalho', '#9E7349'], ['Cumaru', '#86583A'], ['Nogueira', '#5C402F'], ['Pinus claro', '#CDA97C']];
  var CIMENTO = [['Claro', '#B4B2AD'], ['Médio', '#9A9893'], ['Escuro', '#74726D']];
  var ACABS = [
    { id: 'liso', nome: 'Drywall liso', desc: 'Chapa tratada e pintada', tons: TINTA, sup: ['parede', 'teto'], calc: { parede: 'colado', teto: 'fge' }, padrao: false },
    { id: 'forro', nome: 'Forro com tabica', desc: 'Forro de drywall com sombra no perímetro', tons: TINTA.slice(0, 3), sup: ['teto'], calc: { teto: 'fge' }, padrao: false },
    { id: 'placa3d', nome: 'Placa 3D de gesso', desc: 'Relevo em ondas, placas de 50 cm', tons: TINTA, sup: ['parede', 'teto'], padrao: true },
    { id: 'ripado', nome: 'Ripado de madeira', desc: 'Ripas de 4,5 cm com frestas', tons: MADEIRA, sup: ['parede', 'teto'], padrao: true },
    { id: 'lambri', nome: 'Lambri de madeira', desc: 'Réguas de 12 cm encaixadas', tons: MADEIRA, sup: ['parede', 'teto'], padrao: true },
    { id: 'cimento', nome: 'Cimento queimado', desc: 'Efeito com massa sobre o drywall', tons: CIMENTO, sup: ['parede', 'teto'], padrao: false }
  ];
  function acab(id) { for (var i = 0; i < ACABS.length; i++) if (ACABS[i].id === id) return ACABS[i]; return ACABS[0]; }

  /* ---------- estado ---------- */
  var S = {
    foto: null, W: 0, H: 0, nome: '',
    cantos: null, sup: 'parede', acab: 'liso', tom: 0, escala: 1, girar: false, luz: 0.85, brilho: 1,
    modo: 'cantos', corte: 0.5, pincel: 1, tracos: [], tracoAtual: null, revela: 1, exemplo: false
  };
  var dlg, raiz, cv, gl, prog, U = {}, TX = {}, est = null, texChave = '', aniso = null;
  var masc, mctx, MASC_K = 0.5;  // máscara de proteção em meia resolução
  var lupa, lctx;
  var montado = false;

  /* ---------- utilidades de cor e ruído ---------- */
  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb(a, k) { return 'rgb(' + Math.round(clamp(a[0] * k, 0, 255)) + ',' + Math.round(clamp(a[1] * k, 0, 255)) + ',' + Math.round(clamp(a[2] * k, 0, 255)) + ')'; }
  function semente(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function tela(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  // canvas pequeno de ruído cinza; desenhado esticado vira nuvem (suavização bilinear do próprio canvas)
  function ruido(w, h, seed) {
    var c = tela(w, h), x = c.getContext('2d'), d = x.createImageData(c.width, c.height), r = semente(seed);
    for (var i = 0; i < d.data.length; i += 4) { var v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  }
  function nuvem(ctx, w, h, oitavas, modo) {
    ctx.save(); ctx.globalCompositeOperation = modo || 'overlay'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    oitavas.forEach(function (o, i) { ctx.globalAlpha = o[1]; ctx.drawImage(ruido(o[0], Math.max(2, Math.round(o[0] * h / w)), 7 + i * 13), 0, 0, w, h); });
    ctx.restore();
  }

  /* ---------- geradores de textura: (ctx, w, h, D = px por metro, cor, escala) ---------- */
  var GERA = {
    liso: function (x, w, h, D, cor) {
      x.fillStyle = rgb(hex(cor), 1); x.fillRect(0, 0, w, h);
      nuvem(x, w, h, [[6, 0.05], [24, 0.035], [Math.min(512, w / 3), 0.03]], 'soft-light');
    },
    forro: function (x, w, h, D, cor) {
      GERA.liso(x, w, h, D, cor);
      var g = Math.max(2, 0.015 * D), s = Math.max(4, 0.05 * D);
      // sombra suave para dentro e a fresta escura da tabica no perímetro
      [[0, 0, w, s, 0, 0, 0, s], [0, h - s, w, s, 0, h, 0, h - s], [0, 0, s, h, 0, 0, s, 0], [w - s, 0, s, h, w, 0, w - s, 0]].forEach(function (b) {
        var gr = x.createLinearGradient(b[4], b[5], b[6], b[7]); gr.addColorStop(0, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(b[0], b[1], b[2], b[3]);
      });
      x.strokeStyle = 'rgba(22,20,18,.92)'; x.lineWidth = g; x.strokeRect(g / 2, g / 2, w - g, h - g);
    },
    placa3d: function (x, w, h, D, cor, esc) {
      var lado = Math.max(16, Math.round(0.5 * esc * D)), t = tela(lado, lado), tx = t.getContext('2d'), img = tx.createImageData(lado, lado);
      var base = hex(cor), L = [-0.45, -0.6, 0.66];
      function alt(u, v) { return 0.5 + 0.5 * Math.sin(2 * Math.PI * (u + 0.22 * Math.sin(2 * Math.PI * v))); }
      for (var j = 0; j < lado; j++) for (var i = 0; i < lado; i++) {
        var u = i / lado, v = j / lado, e = 1 / lado;
        var dx = (alt(u + e, v) - alt(u - e, v)) * 0.075 * lado / 2, dy = (alt(u, v + e) - alt(u, v - e)) * 0.075 * lado / 2;
        var n = Math.hypot(dx, dy, 1), k = 0.8 + 0.3 * ((-dx * L[0] - dy * L[1] + L[2]) / n);
        var p = (j * lado + i) * 4; img.data[p] = base[0] * k; img.data[p + 1] = base[1] * k; img.data[p + 2] = base[2] * k; img.data[p + 3] = 255;
      }
      tx.putImageData(img, 0, 0);
      tx.strokeStyle = 'rgba(0,0,0,.045)'; tx.lineWidth = 1; tx.strokeRect(0.5, 0.5, lado - 1, lado - 1);
      x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, w, h);
      nuvem(x, w, h, [[8, 0.04]], 'soft-light');
    },
    ripado: function (x, w, h, D, cor, esc) {
      var base = hex(cor), r = semente(31), ripa = 0.045 * esc * D, fresta = 0.015 * esc * D, passo = ripa + fresta;
      x.fillStyle = rgb(base, 0.16); x.fillRect(0, 0, w, h);
      var veio = ruido(Math.max(4, Math.round(ripa / 2)), 18, 5);
      for (var px = fresta / 2, i = 0; px < w; px += passo, i++) {
        var k = 0.9 + r() * 0.2;
        x.fillStyle = rgb(base, k); x.fillRect(px, 0, ripa, h);
        x.save(); x.beginPath(); x.rect(px, 0, ripa, h); x.clip();
        x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.32;
        x.drawImage(veio, px - r() * ripa, -r() * h * 0.5, ripa * 2, h * 1.6);
        x.restore();
        var hl = Math.max(1, ripa * 0.08);
        x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(px, 0, hl, h);
        x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(px + ripa - hl * 1.4, 0, hl * 1.4, h);
      }
    },
    lambri: function (x, w, h, D, cor, esc) {
      var base = hex(cor), r = semente(47), alt = 0.12 * esc * D, junta = Math.max(1, 0.004 * D);
      var veio = ruido(24, Math.max(3, Math.round(alt / 3)), 9);
      for (var py = 0, l = 0; py < h; py += alt, l++) {
        var pos = -r() * 2.4 * D;
        while (pos < w) {
          var comp = (1.4 + r() * 1.6) * D, k = 0.88 + r() * 0.22;
          x.fillStyle = rgb(base, k); x.fillRect(pos, py, comp, alt);
          x.save(); x.beginPath(); x.rect(pos, py, comp, alt); x.clip();
          x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.3;
          x.drawImage(veio, pos - r() * comp, py, comp * 2.2, alt);
          x.restore();
          x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(pos + comp - junta, py, junta, alt);
          pos += comp;
        }
        x.fillStyle = 'rgba(0,0,0,.42)'; x.fillRect(0, py + alt - junta, w, junta);
        x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, py, w, Math.max(1, junta * 0.8));
      }
    },
    cimento: function (x, w, h, D, cor) {
      x.fillStyle = rgb(hex(cor), 1); x.fillRect(0, 0, w, h);
      nuvem(x, w, h, [[3, 0.22], [7, 0.16], [18, 0.12], [48, 0.07], [Math.min(700, w / 2), 0.06]], 'overlay');
    }
  };

  /* ---------- homografia: quadrado unitário (u, v) → pixels da foto ---------- */
  function homografia(c) {
    var x0 = c[0][0], y0 = c[0][1], x1 = c[1][0], y1 = c[1][1], x2 = c[2][0], y2 = c[2][1], x3 = c[3][0], y3 = c[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    var g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  }
  function inversa(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-12;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function areaSinal(c) { var s = 0; for (var i = 0; i < 4; i++) { var a = c[i], b = c[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function dentro(c, x, y, sinal) {
    for (var i = 0; i < 4; i++) { var a = c[i], b = c[(i + 1) % 4]; if (((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) * sinal < 0) return false; }
    return true;
  }

  /* ---------- WebGL ---------- */
  var VS = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uFoto,uSombra,uMasc,uAcab;',
    'uniform vec2 uTam;uniform mat3 uHinv;uniform vec2 uC[4];uniform float uSinal,uMedia,uLuz,uExpo,uBrilho,uCorte,uRevela,uVerMasc,uTem;uniform vec3 uTinta;',
    'out vec4 cor;',
    'vec3 lin(vec3 c){return pow(c,vec3(2.2));}vec3 srgb(vec3 c){return pow(clamp(c,0.,1.),vec3(1./2.2));}',
    'float lado(vec2 a,vec2 b,vec2 p){vec2 e=b-a;return (e.x*(p.y-a.y)-e.y*(p.x-a.x))/max(length(e),1e-4);}',
    'void main(){',
    ' vec2 p=vec2(gl_FragCoord.x,uTam.y-gl_FragCoord.y);vec2 t=p/uTam;',
    ' vec3 foto=texture(uFoto,t).rgb;',
    ' vec3 h=uHinv*vec3(p,1.);vec2 uv=h.xy/h.z;',
    ' float d=min(min(lado(uC[0],uC[1],p),lado(uC[1],uC[2],p)),min(lado(uC[2],uC[3],p),lado(uC[3],uC[0],p)))*uSinal;',
    ' float m=texture(uMasc,t).r;',
    ' float cob=clamp(d+.5,0.,1.)*uTem*(1.-m);',
    ' float w=t.x*.78+t.y*.22;cob*=smoothstep(w-.08,w,uRevela*1.08);',
    ' vec3 ac=lin(texture(uAcab,clamp(uv,0.,1.)).rgb);',
    ' float s=texture(uSombra,t).r;s=s*s/max(uMedia,.002);s=clamp(s,.3,1.45);',
    ' float luz=mix(1.,s,uLuz)*mix(1.,uExpo,uLuz)*uBrilho;',
    ' vec3 res=srgb(ac*luz*uTinta);',
    ' vec3 o=mix(foto,res,cob);',
    ' if(uCorte>=0.&&p.x<uCorte)o=foto;',
    ' if(uVerMasc>.5)o=mix(o,vec3(.937,.314,.137),m*.5);',
    ' cor=vec4(o,1.);',
    '}'
  ].join('\n');

  function sh(tipo, src) { var s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function iniciarGL() {
    gl = cv.getContext('webgl2', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    ['uFoto', 'uSombra', 'uMasc', 'uAcab', 'uTam', 'uHinv', 'uC', 'uSinal', 'uMedia', 'uLuz', 'uExpo', 'uBrilho', 'uCorte', 'uRevela', 'uVerMasc', 'uTem', 'uTinta']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    ['foto', 'sombra', 'masc', 'acab'].forEach(function (n, i) { TX[n] = gl.createTexture(); gl.uniform1i(U['u' + n[0].toUpperCase() + n.slice(1)], i); });
    aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return true;
  }
  function textura(nome, unidade, fonte, mip, w, h) {
    gl.activeTexture(gl.TEXTURE0 + unidade); gl.bindTexture(gl.TEXTURE_2D, TX[nome]);
    if (fonte instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, fonte);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fonte);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); }
  }

  /* ---------- foto: redução, luz desfocada e estatísticas ---------- */
  function prepararFoto(img, opcoes) {
    var k = Math.min(1, MAX_LADO / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var W = Math.round((img.naturalWidth || img.width) * k), H = Math.round((img.naturalHeight || img.height) * k);
    S.foto = tela(W, H); S.W = W; S.H = H;
    S.foto.getContext('2d').drawImage(img, 0, 0, W, H);
    cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
    textura('foto', 0, S.foto, false);
    // luz: luminância linear em baixa resolução, desfocada com 3 passadas de caixa (aproxima uma gaussiana)
    var sw = Math.min(360, W), sh2 = Math.round(sw * H / W), p = tela(sw, sh2), px = p.getContext('2d');
    px.drawImage(S.foto, 0, 0, sw, sh2);
    var dd = px.getImageData(0, 0, sw, sh2).data, n = sw * sh2, Lm = new Float32Array(n), R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      R[i] = Math.pow(dd[i * 4] / 255, 2.2); G[i] = Math.pow(dd[i * 4 + 1] / 255, 2.2); B[i] = Math.pow(dd[i * 4 + 2] / 255, 2.2);
      Lm[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    }
    var raio = Math.max(2, Math.round(Math.max(sw, sh2) * 0.035));
    est = { sw: sw, sh: sh2, raio: raio, L: Lm, Bg: borrar(Lm, sw, sh2, raio), B: null, R: R, G: G, Bc: B };
    // máscara de proteção
    masc = tela(W * MASC_K, H * MASC_K); mctx = masc.getContext('2d');
    S.tracos = (opcoes && opcoes.protegidas) ? opcoes.protegidas.map(function (f) { var o = {}; for (var k2 in f) o[k2] = f[k2]; return o; }) : [];
    redesenharMascara();
    S.cantos = opcoes && opcoes.cantos ? opcoes.cantos.map(function (c) { return [c[0] * W / 1280, c[1] * H / 960]; })
      : [[W * 0.16, H * 0.14], [W * 0.84, H * 0.14], [W * 0.84, H * 0.86], [W * 0.16, H * 0.86]];
    texChave = '';
    atualizarEstatisticas();
  }
  function borrar(a, w, h, r) { for (var k = 0; k < 3; k++) { a = caixa(a, w, h, r, true); a = caixa(a, w, h, r, false); } return a; }
  function caixa(src, w, h, r, horiz) {
    var out = new Float32Array(src.length), x, y, s, i, a, b, len = horiz ? w : h, lin = horiz ? h : w;
    for (var l = 0; l < lin; l++) {
      s = 0;
      var at = function (k) { k = clamp(k, 0, len - 1); return horiz ? src[l * w + k] : src[k * w + l]; };
      for (i = -r; i <= r; i++) s += at(i);
      for (i = 0; i < len; i++) {
        if (horiz) out[l * w + i] = s / (2 * r + 1); else out[i * w + l] = s / (2 * r + 1);
        a = at(i - r); b = at(i + r + 1); s += b - a;
      }
    }
    return out;
  }
  /* Luz da superfície: desfoque normalizado (soma ponderada ÷ soma dos pesos) que ignora as áreas protegidas e quase
     tudo fora dos cantos. Sem isso, cortinas claras e janelas "vazam" um halo de luz para o acabamento.
     Depois: média dessa luz (normaliza a sombra), exposição e tinta da luz, só na área marcada e livre. */
  function atualizarEstatisticas() {
    if (!est) return;
    var sw = est.sw, sh = est.sh, n = sw * sh, mc = tela(sw, sh), mx = mc.getContext('2d');
    mx.drawImage(masc, 0, 0, sw, sh);
    var md = mx.getImageData(0, 0, sw, sh).data, P = new Float32Array(n), PL = new Float32Array(n), livre = new Uint8Array(n);
    var c = S.cantos, sinal = areaSinal(c) >= 0 ? 1 : -1, sx = S.W / sw, sy = S.H / sh, x, y, i;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      i = y * sw + x;
      var dentroQ = dentro(c, (x + 0.5) * sx, (y + 0.5) * sy, sinal), w = (1 - md[i * 4] / 255) * (dentroQ ? 1 : 0.08);
      P[i] = w; PL[i] = est.L[i] * w; livre[i] = dentroQ && md[i * 4] < 128 ? 1 : 0;
    }
    P = borrar(P, sw, sh, est.raio); PL = borrar(PL, sw, sh, est.raio);
    var B = new Float32Array(n), u8 = new Uint8Array(n);
    for (i = 0; i < n; i++) { B[i] = P[i] > 0.02 ? PL[i] / P[i] : est.Bg[i]; u8[i] = Math.round(Math.sqrt(clamp(B[i], 0, 1)) * 255); }
    est.B = B;
    textura('sombra', 1, u8, false, sw, sh);
    var sb = 0, sl = 0, sr = 0, sg = 0, sbb = 0, cnt = 0;
    for (i = 0; i < n; i++) { if (!livre[i]) continue; sb += B[i]; sl += est.L[i]; sr += est.R[i]; sg += est.G[i]; sbb += est.Bc[i]; cnt++; }
    n = cnt;
    if (!n) { S.media = 0.2; S.expo = 1; S.tinta = [1, 1, 1]; return; }
    S.media = sb / n;
    S.expo = clamp((sl / n) / 0.32, 0.42, 1);
    var lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sbb || 1e-6;
    S.tinta = [sr / lum, sg / lum, sbb / lum].map(function (v) { return clamp(1 + (v - 1) * 0.3, 0.85, 1.15); });
  }

  /* ---------- textura do acabamento em metros reais ---------- */
  function medidas() {
    var c = S.cantos, larg = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2, alt = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
    var asp = clamp(larg / Math.max(alt, 1), 0.2, 6), Wm, Hm;
    if (S.sup === 'parede') { Hm = 2.7; Wm = Hm * asp; } else { Wm = 3.6; Hm = Wm / asp; }
    return { Wm: Wm, Hm: Hm, ppm: Math.max(larg / Wm, alt / Hm) };
  }
  function gerarAcabamento(forcar) {
    var a = acab(S.acab), m = medidas();
    var chave = [a.id, S.tom, S.escala.toFixed(2), S.girar, m.Wm.toFixed(1), m.Hm.toFixed(1)].join('|');
    if (!forcar && chave === texChave) return;
    texChave = chave;
    var lim = 2048 / Math.max(m.Wm, m.Hm), Dp = clamp(m.ppm * 1.3, 60, lim);
    var w = Math.round(m.Wm * Dp), h = Math.round(m.Hm * Dp), cor = a.tons[Math.min(S.tom, a.tons.length - 1)][1];
    var t = tela(w, h), x = t.getContext('2d');
    if (S.girar && a.padrao) {
      var r = tela(h, w); GERA[a.id](r.getContext('2d'), h, w, Dp, cor, S.escala);
      x.translate(w, 0); x.rotate(Math.PI / 2); x.drawImage(r, 0, 0);
    } else GERA[a.id](x, w, h, Dp, cor, S.escala);
    textura('acab', 3, t, true);
  }

  /* ---------- máscara (pincel) ---------- */
  function raioPincel() { return Math.hypot(S.W, S.H) * [0.012, 0.025, 0.05][S.pincel]; }
  function pintar(x, y, r) {
    var k = MASC_K, g = mctx.createRadialGradient(x * k, y * k, r * k * 0.55, x * k, y * k, r * k);
    g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x * k, y * k, r * k, 0, Math.PI * 2); mctx.fill();
  }
  function aplicarTraco(t) {
    var k = MASC_K;
    if (t.t === 'ret') { mctx.fillStyle = '#fff'; mctx.fillRect(t.x * k * S.W / 1280, t.y * k * S.H / 960, t.w * k * S.W / 1280, t.h * k * S.H / 960); return; }
    if (t.t === 'pol') {
      mctx.fillStyle = '#fff'; mctx.beginPath();
      t.p.forEach(function (q, i) { var x = q[0] * k * S.W / 1280, y = q[1] * k * S.H / 960; if (i) mctx.lineTo(x, y); else mctx.moveTo(x, y); });
      mctx.closePath(); mctx.fill(); return;
    }
    if (t.t === 'eli') { mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.ellipse(t.x * k * S.W / 1280, t.y * k * S.H / 960, t.rx * k * S.W / 1280, t.ry * k * S.H / 960, 0, 0, Math.PI * 2); mctx.fill(); return; }
    for (var i = 0; i < t.p.length; i++) {
      var a = t.p[Math.max(0, i - 1)], b = t.p[i], d = dist(a, b), passos = Math.max(1, Math.ceil(d / (t.r * 0.3)));
      for (var s = 1; s <= passos; s++) pintar(a[0] + (b[0] - a[0]) * s / passos, a[1] + (b[1] - a[1]) * s / passos, t.r);
    }
  }
  function redesenharMascara() {
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, masc.width, masc.height);
    S.tracos.forEach(aplicarTraco);
    textura('masc', 2, masc, false);
  }

  /* ---------- desenho ---------- */
  var pedido = 0;
  function render() { if (!pedido) pedido = requestAnimationFrame(desenhar); }
  function desenhar() {
    pedido = 0;
    if (!S.foto) return;
    var Hinv = inversa(homografia(S.cantos));
    gl.uniform2f(U.uTam, S.W, S.H);
    gl.uniformMatrix3fv(U.uHinv, false, [Hinv[0], Hinv[3], Hinv[6], Hinv[1], Hinv[4], Hinv[7], Hinv[2], Hinv[5], Hinv[8]]);
    gl.uniform2fv(U.uC, [].concat.apply([], S.cantos));
    gl.uniform1f(U.uSinal, areaSinal(S.cantos) >= 0 ? 1 : -1);
    gl.uniform1f(U.uMedia, S.media); gl.uniform1f(U.uLuz, S.luz); gl.uniform1f(U.uExpo, S.expo); gl.uniform1f(U.uBrilho, S.brilho);
    gl.uniform3fv(U.uTinta, S.tinta);
    gl.uniform1f(U.uCorte, S.modo === 'comparar' ? S.corte * S.W : -1);
    gl.uniform1f(U.uRevela, S.revela);
    gl.uniform1f(U.uVerMasc, S.modo === 'pincel' ? 1 : 0);
    gl.uniform1f(U.uTem, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    posicionarOverlay();
  }
  function revelar() {
    if (reduz()) { S.revela = 1; render(); return; }
    var t0 = performance.now(), dur = 950;
    (function passo(t) {
      var k = clamp((t - t0) / dur, 0, 1); S.revela = 1 - Math.pow(1 - k, 3); desenhar();
      if (k < 1) requestAnimationFrame(passo);
    })(t0);
  }

  /* ---------- interface ---------- */
  function montar() {
    dlg = document.getElementById('simulador-dlg');
    raiz = $('#sim-app', dlg);
    raiz.innerHTML =
      '<header class="sim__top"><div><p class="eyebrow">Simulador de acabamento</p><h2 class="sim__titulo" id="sim-titulo">Veja na sua obra</h2></div>' +
        '<button class="icon-btn sim__fechar" type="button" data-sim="fechar" aria-label="Fechar simulador"><svg class="ic"><use href="#i-close"/></svg></button></header>' +
      '<div class="sim__corpo">' +
        '<div class="sim__palco" id="sim-palco">' +
          '<div class="sim__vazio" id="sim-vazio">' +
            '<svg class="sim__vazio-ic" viewBox="0 0 64 48" aria-hidden="true"><rect x="4" y="10" width="56" height="34" rx="4"/><circle cx="32" cy="27" r="10"/><path d="M22 10l4-6h12l4 6"/></svg>' +
            '<p class="sim__vazio-t">Fotografe a parede ou o teto de frente, com boa luz.</p>' +
            '<div class="sim__vazio-acoes">' +
              '<button class="btn btn--primary" type="button" data-sim="camera"><svg class="ic"><use href="#i-camera"/></svg><span>Tirar foto</span></button>' +
              '<button class="btn btn--outline" type="button" data-sim="galeria"><svg class="ic"><use href="#i-image"/></svg><span>Escolher foto</span></button>' +
            '</div>' +
            '<button class="link-arrow" type="button" data-sim="exemplo">Usar a foto de exemplo <svg class="ic"><use href="#i-arrow"/></svg></button>' +
            '<p class="sim__priv"><svg class="ic"><use href="#i-lock"/></svg> A foto fica só no seu aparelho: nada é enviado.</p>' +
          '</div>' +
          '<div class="sim__quadro" id="sim-quadro" hidden>' +
            '<canvas id="sim-canvas" aria-label="Foto com o acabamento simulado" role="img"></canvas>' +
            '<svg class="sim__linhas" id="sim-linhas" aria-hidden="true"><polygon/></svg>' +
            ['Canto superior esquerdo', 'Canto superior direito', 'Canto inferior direito', 'Canto inferior esquerdo'].map(function (n, i) {
              return '<button class="sim__canto" type="button" data-canto="' + i + '" aria-label="' + n + ' (use as setas para mover)"></button>';
            }).join('') +
            '<div class="sim__corte" id="sim-corte" hidden><span class="sim__corte-rot">Antes</span><span class="sim__corte-al" aria-hidden="true"></span><span class="sim__corte-rot">Depois</span></div>' +
            '<canvas class="sim__lupa" id="sim-lupa" width="132" height="132" hidden></canvas>' +
            '<p class="sim__credito" id="sim-credito" hidden></p>' +
          '</div>' +
          '<p class="sim__dica" id="sim-dica" aria-live="polite"></p>' +
        '</div>' +
        '<div class="sim__painel" id="sim-painel" hidden>' +
          '<div class="sim__grupo"><p class="sim__rot">Superfície</p><div class="seg" role="group" aria-label="Superfície">' +
            '<button type="button" data-sup="parede" aria-pressed="true">Parede</button><button type="button" data-sup="teto" aria-pressed="false">Teto</button></div></div>' +
          '<div class="sim__grupo"><p class="sim__rot">Ferramenta</p><div class="seg seg--3" role="group" aria-label="Ferramenta">' +
            '<button type="button" data-modo="cantos" aria-pressed="true">Cantos</button><button type="button" data-modo="pincel" aria-pressed="false">Proteger</button><button type="button" data-modo="comparar" aria-pressed="false">Antes/depois</button></div>' +
            '<div class="sim__pincel" id="sim-pincel" hidden><div class="seg" role="group" aria-label="Tamanho do pincel">' +
              '<button type="button" data-pincel="0" aria-pressed="false">Fino</button><button type="button" data-pincel="1" aria-pressed="true">Médio</button><button type="button" data-pincel="2" aria-pressed="false">Grosso</button></div>' +
              '<div class="sim__pincel-acoes"><button class="btn btn--sm btn--outline" type="button" data-sim="desfazer">Desfazer</button><button class="btn btn--sm btn--outline" type="button" data-sim="limpar">Limpar</button></div></div>' +
          '</div>' +
          '<div class="sim__grupo"><p class="sim__rot">Acabamento</p><div class="sim__acabs" id="sim-acabs" role="radiogroup" aria-label="Acabamento"></div></div>' +
          '<div class="sim__grupo"><p class="sim__rot" id="sim-tons-rot">Cor</p><div class="sim__tons" id="sim-tons" role="radiogroup" aria-labelledby="sim-tons-rot"></div></div>' +
          '<details class="sim__ajustes"><summary>Ajustes finos</summary>' +
            '<label class="sim__faixa" id="sim-escala-box"><span>Tamanho do padrão</span><input type="range" min="0.6" max="1.8" step="0.05" value="1" data-ajuste="escala"></label>' +
            '<label class="sim__faixa"><span>Luz e sombra da foto</span><input type="range" min="0" max="1" step="0.05" value="0.85" data-ajuste="luz"></label>' +
            '<label class="sim__faixa"><span>Brilho</span><input type="range" min="0.7" max="1.3" step="0.02" value="1" data-ajuste="brilho"></label>' +
            '<button class="btn btn--sm btn--outline" type="button" data-sim="girar" id="sim-girar">Girar o padrão 90°</button>' +
          '</details>' +
          '<div class="sim__acoes">' +
            '<button class="btn btn--primary" type="button" data-sim="salvar"><svg class="ic"><use href="#i-download"/></svg><span>Salvar imagem</span></button>' +
            '<a class="btn btn--whats" id="sim-whats" href="#" target="_blank" rel="noopener"><svg class="ic"><use href="#i-whats"/></svg><span>Pedir orçamento</span></a>' +
            '<button class="btn btn--outline" type="button" data-sim="calcular" id="sim-calcular"><svg class="ic"><use href="#i-calc"/></svg><span>Calcular materiais</span></button>' +
            '<button class="btn btn--outline" type="button" data-sim="trocar"><svg class="ic"><use href="#i-image"/></svg><span>Trocar foto</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<input type="file" accept="image/*" capture="environment" id="sim-in-camera" hidden>' +
      '<input type="file" accept="image/*" id="sim-in-galeria" hidden>';
    cv = $('#sim-canvas', raiz); lupa = $('#sim-lupa', raiz); lctx = lupa.getContext('2d');
    var ok = false;
    try { ok = iniciarGL(); } catch (e) { ok = false; }
    if (!ok) {
      $('#sim-vazio', raiz).innerHTML = '<p class="sim__vazio-t">Este navegador não consegue rodar o simulador (precisa de WebGL 2).</p>' +
        '<p class="sim__priv">Atualize o navegador ou abra o site no Chrome, Safari ou Edge recentes.</p>';
    }
    montarAcabs();
    ligarEventos();
    montado = true;
  }

  function montarAcabs() {
    var box = $('#sim-acabs', raiz);
    box.innerHTML = ACABS.map(function (a) {
      return '<button type="button" class="sim-acab" role="radio" data-acab="' + a.id + '" aria-checked="false">' +
        '<canvas class="sim-acab__mini" width="96" height="72" aria-hidden="true"></canvas><span class="sim-acab__nome">' + a.nome + '</span></button>';
    }).join('');
    $$('.sim-acab', box).forEach(function (b) {
      var a = acab(b.getAttribute('data-acab')), c = $('canvas', b), x = c.getContext('2d');
      GERA[a.id](x, 96, 72, 120, a.tons[0][1], 1);
    });
  }
  function renderPainel() {
    var a = acab(S.acab);
    $$('[data-sup]', raiz).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sup') === S.sup)); });
    $$('[data-modo]', raiz).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === S.modo)); });
    $$('[data-pincel]', raiz).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-pincel') === S.pincel)); });
    $('#sim-pincel', raiz).hidden = S.modo !== 'pincel';
    $$('.sim-acab', raiz).forEach(function (b) {
      var x = acab(b.getAttribute('data-acab'));
      b.hidden = x.sup.indexOf(S.sup) === -1;
      b.setAttribute('aria-checked', String(x.id === a.id));
    });
    $('#sim-tons-rot', raiz).textContent = a.tons === MADEIRA ? 'Tom da madeira' : a.tons === CIMENTO ? 'Tom' : 'Cor';
    $('#sim-tons', raiz).innerHTML = a.tons.map(function (t, i) {
      return '<button type="button" class="sim-tom" role="radio" data-tom="' + i + '" aria-checked="' + (i === S.tom) + '" title="' + t[0] + '">' +
        '<span class="sim-tom__cor" style="background:' + t[1] + '"></span><span class="sim-tom__nome">' + t[0] + '</span></button>';
    }).join('');
    $('#sim-escala-box', raiz).hidden = !a.padrao;
    $('#sim-girar', raiz).hidden = !a.padrao;
    $('#sim-calcular', raiz).hidden = !a.calc || !a.calc[S.sup];
    var dica = { cantos: 'Arraste os 4 cantos até as quinas ' + (S.sup === 'teto' ? 'do teto.' : 'da parede.'),
      pincel: 'Pinte por cima de janelas, portas e móveis para mantê-los como na foto.',
      comparar: 'Arraste a linha para comparar o antes e o depois.' }[S.modo];
    $('#sim-dica', raiz).textContent = dica;
    $('#sim-quadro', raiz).setAttribute('data-modo', S.modo);
    $('#sim-corte', raiz).hidden = S.modo !== 'comparar';
    var tom = a.tons[Math.min(S.tom, a.tons.length - 1)][0];
    var txt = 'Olá, Drysul! Fiz uma simulação no site: ' + a.nome.toLowerCase() + ' (' + tom.toLowerCase() + ') ' +
      (S.sup === 'teto' ? 'no teto' : 'na parede') + '. Gostaria de um orçamento. Posso mandar a foto da simulação por aqui.';
    var wa = (D.loja && D.loja.whatsUrl) || 'https://wa.me/5555992010668';
    $('#sim-whats', raiz).href = wa + '?text=' + encodeURIComponent(txt);
  }

  /* ---------- overlay: cantos, linhas, corte ---------- */
  var escalaTela = 1;
  function ajustarTamanho() {
    if (!S.foto) return;
    var palco = $('#sim-palco', raiz), q = $('#sim-quadro', raiz);
    var dica = $('#sim-dica', raiz).offsetHeight + 12;
    // folga de 28 px para os cantos (44 px de toque) não saírem do palco
    var cs = getComputedStyle(palco), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    var aw = palco.clientWidth - padX - 28, ah = palco.clientHeight - padY - dica - 28;
    escalaTela = Math.min(aw / S.W, ah / S.H);
    q.style.width = Math.round(S.W * escalaTela) + 'px'; q.style.height = Math.round(S.H * escalaTela) + 'px';
    posicionarOverlay();
  }
  function posicionarOverlay() {
    if (!S.cantos) return;
    var k = escalaTela, pts = S.cantos.map(function (c) { return (c[0] * k).toFixed(1) + ',' + (c[1] * k).toFixed(1); }).join(' ');
    $('#sim-linhas polygon', raiz).setAttribute('points', pts);
    $$('.sim__canto', raiz).forEach(function (b, i) { b.style.transform = 'translate(' + (S.cantos[i][0] * k).toFixed(1) + 'px,' + (S.cantos[i][1] * k).toFixed(1) + 'px)'; });
    var corte = $('#sim-corte', raiz); corte.style.left = (S.corte * S.W * k).toFixed(1) + 'px';
  }

  /* ---------- eventos ---------- */
  var arrasto = null;
  function pontoFoto(ev) {
    var r = cv.getBoundingClientRect();
    return [clamp((ev.clientX - r.left) / r.width * S.W, 0, S.W), clamp((ev.clientY - r.top) / r.height * S.H, 0, S.H)];
  }
  function mostrarLupa(p, ev) {
    if (ev.pointerType !== 'touch') return;
    var z = 2.6, L = 132, r = $('#sim-quadro', raiz).getBoundingClientRect();
    lctx.save(); lctx.clearRect(0, 0, L, L); lctx.beginPath(); lctx.arc(L / 2, L / 2, L / 2 - 2, 0, Math.PI * 2); lctx.clip();
    lctx.drawImage(S.foto, p[0] - L / 2 / z / escalaTela, p[1] - L / 2 / z / escalaTela, L / z / escalaTela, L / z / escalaTela, 0, 0, L, L);
    lctx.restore();
    lctx.strokeStyle = '#EF5023'; lctx.lineWidth = 2;
    lctx.beginPath(); lctx.moveTo(L / 2 - 10, L / 2); lctx.lineTo(L / 2 + 10, L / 2); lctx.moveTo(L / 2, L / 2 - 10); lctx.lineTo(L / 2, L / 2 + 10); lctx.stroke();
    lupa.hidden = false;
    var lx = clamp(ev.clientX - r.left - L / 2, 0, r.width - L), ly = ev.clientY - r.top - L - 46;
    if (ly < 0) ly = ev.clientY - r.top + 46;
    lupa.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
  }
  function ligarEventos() {
    raiz.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-sim],[data-sup],[data-modo],[data-pincel],[data-acab],[data-tom]');
      if (!b) return;
      if (b.hasAttribute('data-sup')) { S.sup = b.getAttribute('data-sup'); if (acab(S.acab).sup.indexOf(S.sup) === -1) { S.acab = 'liso'; S.tom = 0; } texChave = ''; aplicar(true); return; }
      if (b.hasAttribute('data-modo')) { S.modo = b.getAttribute('data-modo'); renderPainel(); render(); return; }
      if (b.hasAttribute('data-pincel')) { S.pincel = +b.getAttribute('data-pincel'); renderPainel(); return; }
      if (b.hasAttribute('data-acab')) { S.acab = b.getAttribute('data-acab'); S.tom = 0; aplicar(true); return; }
      if (b.hasAttribute('data-tom')) { S.tom = +b.getAttribute('data-tom'); aplicar(false); return; }
      var acao = b.getAttribute('data-sim');
      if (acao === 'fechar') fechar();
      else if (acao === 'camera') $('#sim-in-camera', raiz).click();
      else if (acao === 'galeria' || acao === 'trocar') $('#sim-in-galeria', raiz).click();
      else if (acao === 'exemplo') carregarExemplo();
      else if (acao === 'desfazer') { S.tracos.pop(); redesenharMascara(); atualizarEstatisticas(); render(); }
      else if (acao === 'limpar') { S.tracos = []; redesenharMascara(); atualizarEstatisticas(); render(); }
      else if (acao === 'girar') { S.girar = !S.girar; gerarAcabamento(); render(); }
      else if (acao === 'salvar') salvar(b);
      else if (acao === 'calcular') calcular();
    });
    raiz.addEventListener('input', function (ev) {
      var a = ev.target.getAttribute('data-ajuste'); if (!a) return;
      S[a] = parseFloat(ev.target.value);
      if (a === 'escala') gerarAcabamento();
      render();
    });
    ['camera', 'galeria'].forEach(function (n) {
      $('#sim-in-' + n, raiz).addEventListener('change', function (ev) { var f = ev.target.files && ev.target.files[0]; if (f) carregarArquivo(f); ev.target.value = ''; });
    });
    var q = $('#sim-quadro', raiz);
    q.addEventListener('pointerdown', function (ev) {
      if (!S.foto || ev.button > 0) return;
      var canto = ev.target.closest('.sim__canto');
      if (canto) { arrasto = { tipo: 'canto', i: +canto.getAttribute('data-canto') }; }
      else if (S.modo === 'pincel') {
        var p = pontoFoto(ev); S.tracoAtual = { t: 'p', r: raioPincel(), p: [p] }; S.tracos.push(S.tracoAtual);
        aplicarTraco(S.tracoAtual); textura('masc', 2, masc, false); render(); arrasto = { tipo: 'pincel' };
      } else if (S.modo === 'comparar') { arrasto = { tipo: 'corte' }; moverCorte(ev); }
      else return;
      q.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    q.addEventListener('pointermove', function (ev) {
      if (!arrasto) return;
      var p = pontoFoto(ev);
      if (arrasto.tipo === 'canto') { S.cantos[arrasto.i] = p; mostrarLupa(p, ev); render(); }
      else if (arrasto.tipo === 'pincel') {
        var t = S.tracoAtual, ult = t.p[t.p.length - 1];
        if (dist(ult, p) > t.r * 0.25) { t.p.push(p); aplicarTraco({ t: 'p', r: t.r, p: [ult, p] }); textura('masc', 2, masc, false); render(); }
      } else if (arrasto.tipo === 'corte') moverCorte(ev);
    });
    var soltar = function () {
      if (!arrasto) return;
      if (arrasto.tipo === 'canto') { lupa.hidden = true; atualizarEstatisticas(); gerarAcabamento(); render(); }
      else if (arrasto.tipo === 'pincel') { atualizarEstatisticas(); render(); }
      arrasto = null; S.tracoAtual = null;
    };
    q.addEventListener('pointerup', soltar); q.addEventListener('pointercancel', soltar);
    q.addEventListener('keydown', function (ev) {
      var b = ev.target.closest('.sim__canto'); if (!b) return;
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!d) return;
      ev.preventDefault();
      var i = +b.getAttribute('data-canto'), passo = (ev.shiftKey ? 0.03 : 0.005) * Math.max(S.W, S.H);
      S.cantos[i] = [clamp(S.cantos[i][0] + d[0] * passo, 0, S.W), clamp(S.cantos[i][1] + d[1] * passo, 0, S.H)];
      atualizarEstatisticas(); gerarAcabamento(); render();
    });
    window.addEventListener('resize', function () { if (dlg && dlg.open) ajustarTamanho(); });
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('dialog-open'); });
    dlg.addEventListener('cancel', function () { document.documentElement.classList.remove('dialog-open'); });
  }
  function moverCorte(ev) { var r = cv.getBoundingClientRect(); S.corte = clamp((ev.clientX - r.left) / r.width, 0, 1); render(); }

  function aplicar(trocouAcab) {
    renderPainel();
    if (!S.foto) return;
    gerarAcabamento();
    if (trocouAcab) revelar(); else render();
    if (window.DrysulSom && trocouAcab) window.DrysulSom.tocar('alternar');
  }

  /* ---------- carregar fotos ---------- */
  function mostrarFoto(credito) {
    $('#sim-vazio', raiz).hidden = true; $('#sim-quadro', raiz).hidden = false; $('#sim-painel', raiz).hidden = false;
    var c = $('#sim-credito', raiz); c.hidden = !credito; c.textContent = credito || '';
    renderPainel(); ajustarTamanho(); gerarAcabamento(true); revelar();
  }
  function carregarImagem(url, opcoes, credito) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      try { prepararFoto(img, opcoes); } catch (e) { erroFoto(); return; }
      if (opcoes && opcoes.revogar) URL.revokeObjectURL(url);
      mostrarFoto(credito);
    };
    img.onerror = erroFoto;
    img.src = url;
  }
  function erroFoto() {
    $('#sim-dica', raiz).textContent = 'Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.';
  }
  function carregarArquivo(f) {
    S.exemplo = false; S.modo = 'cantos'; S.sup = S.sup || 'parede';
    carregarImagem(URL.createObjectURL(f), { revogar: true }, '');
  }
  function carregarExemplo() {
    S.exemplo = true; S.modo = 'cantos'; S.sup = 'parede'; S.acab = 'liso'; S.tom = 0;
    carregarImagem(EXEMPLO.url, { cantos: EXEMPLO.cantos, protegidas: EXEMPLO.protegidas }, EXEMPLO.credito);
  }

  /* ---------- salvar / compartilhar ---------- */
  function salvar(btn) {
    var modo = S.modo; S.modo = 'cantos'; S.revela = 1; desenhar();
    var out = tela(S.W, S.H), x = out.getContext('2d');
    x.drawImage(cv, 0, 0);
    S.modo = modo; render();
    var a = acab(S.acab), tom = a.tons[Math.min(S.tom, a.tons.length - 1)][0];
    var f = Math.max(12, Math.round(S.W / 70)), txt = 'Simulação Drysul · ' + a.nome + ' · ' + tom;
    x.font = '700 ' + f + 'px Archivo, Arial, sans-serif';
    var tw = x.measureText(txt).width, pad = f * 0.7, bw = tw + pad * 2, bh = f * 2.1;
    x.fillStyle = 'rgba(17,26,56,.86)'; x.fillRect(S.W - bw - f, S.H - bh - f, bw, bh);
    x.fillStyle = '#EF5023'; x.fillRect(S.W - bw - f, S.H - bh - f, Math.max(3, f / 5), bh);
    x.fillStyle = '#ECECE6'; x.textBaseline = 'middle'; x.fillText(txt, S.W - bw - f + pad, S.H - f - bh / 2);
    out.toBlob(function (blob) {
      if (!blob) return;
      var nome = 'simulacao-drysul.jpg', arq = typeof File === 'function' ? new File([blob], nome, { type: 'image/jpeg' }) : null;
      if (arq && navigator.canShare && navigator.canShare({ files: [arq] }) && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ files: [arq], title: 'Simulação Drysul', text: txt }).catch(function () {});
        return;
      }
      var url = URL.createObjectURL(blob), l = document.createElement('a');
      l.href = url; l.download = nome; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, 'image/jpeg', 0.9);
  }
  function calcular() {
    var a = acab(S.acab), sis = a.calc && a.calc[S.sup]; if (!sis) return;
    fechar();
    var alvo = document.querySelector('.sim-calc[data-calc-system="' + sis + '"]');
    if (alvo) setTimeout(function () { alvo.click(); }, 60);
  }

  /* ---------- abrir / fechar ---------- */
  function abrir(op) {
    if (!montado) montar();
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    document.documentElement.classList.add('dialog-open');
    if (!gl) return;
    op = op || {};
    if (op.arquivo) carregarArquivo(op.arquivo);
    else if (op.exemplo) carregarExemplo();
    else if (S.foto) { renderPainel(); ajustarTamanho(); render(); }
    requestAnimationFrame(ajustarTamanho);
  }
  function fechar() { if (dlg.open) dlg.close(); document.documentElement.classList.remove('dialog-open'); }

  // _quadro: imagem atual sem o selo (usada nos testes e para gerar a imagem da seção)
  window.DrysulSim = { abrir: abrir, fechar: fechar, _estado: S,
    _quadro: function () { S.revela = 1; var m = S.modo; S.modo = 'cantos'; desenhar(); var u = cv.toDataURL('image/png'); S.modo = m; render(); return u; } };
})();
