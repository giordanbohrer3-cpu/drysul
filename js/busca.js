/* Busca de produtos — regras puras (sem DOM), testáveis no Node. Usada pelo catálogo e pela busca rápida.
   - Sem acento e em qualquer ordem; entende plural ("parafusos", "perfis") e os nomes do balcão ("gesso", "placa",
     "bucha", "massa corrida").
   - Ordem de tentativa: todos os termos batem (exato) → os que batem mais termos (aproximado) → erro de digitação
     de 1 ou 2 letras ("parafusso" → parafuso) → nada. Quem chama decide o que mostrar no "nada" (nunca uma tela vazia).
   - Nome vale mais que categoria, que vale mais que descrição.
   - Texto só com palavras vazias ("de") ou só medidas ("4 × 2,8 m", quando é obra) não filtra: devolve tudo. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DrysulBusca = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  var PARADAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, para: 1, pra: 1, com: 1, e: 1, a: 1, o: 1, as: 1, os: 1, em: 1, no: 1, na: 1,
    um: 1, uma: 1, quero: 1, preciso: 1, comprar: 1, x: 1, por: 1 };
  var SINONIMOS = { gesso: ['chapa', 'drywall'], acartonado: ['chapa', 'drywall'], placa: ['chapa', 'placa'], bucha: ['ancorador', 'parabolt'],
    chumbador: ['parabolt', 'ancorador'], corrida: ['massa'], teto: ['forro'], divisoria: ['drywall'], isolamento: ['la'],
    acustico: ['la'], cola: ['cola'], pendural: ['arame'] };

  // "forro de gesso 4x3": as medidas servem ao cálculo; para os produtos, a busca usa só "forro de gesso"
  var MEDIDA = '\\d+(?:[.,]\\d+)?\\s*(?:cm|m2|m²|metros?|m)?';
  var RE_PAR = new RegExp(MEDIDA + '\\s*(?:x|×|\\*|por)\\s*' + MEDIDA, 'gi'), RE_MEDIDA = new RegExp(MEDIDA + '(?![a-z])', 'gi');
  function semMedidas(texto) { return String(texto).replace(RE_PAR, ' ').replace(RE_MEDIDA, ' '); }

  function termosDe(texto, ignorarMedidas) {
    return norm(ignorarMedidas ? semMedidas(texto) : texto).split(/\s+/)
      .map(function (t) { return t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''); })
      .filter(function (t) { return t && !PARADAS[t]; });
  }
  function variantes(t) {
    var v = [t], sing = t;
    if (t.length > 3) {
      if (/is$/.test(t)) v.push(sing = t.slice(0, -2) + 'il');        // perfis → perfil (e não "perfi", que acha "superfície")
      else if (/oes$/.test(t)) v.push(sing = t.slice(0, -3) + 'ao');  // ...ões → ...ão
      else if (/s$/.test(t)) v.push(sing = t.slice(0, -1));           // parafusos → parafuso
    }
    return v.concat(SINONIMOS[t] || SINONIMOS[sing] || []);
  }

  // distância de edição com troca de vizinhas (Damerau restrita); para no meio quando passa do limite
  function distancia(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      var menor = Infinity;
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        if (d[i][j] < menor) menor = d[i][j];
      }
      if (menor > max) return max + 1;
    }
    return d[a.length][b.length];
  }

  /* produtos: [{ id, nome, cat, detalhe, emb }]; opcoes.categorias: { id: nome }; opcoes.ignorarMedidas: texto é obra.
     Devolve { lista, termos (para marcar no texto), modo: 'tudo' | 'exato' | 'aproximado' | 'digitacao' | 'nada', corrigido }. */
  function buscar(texto, produtos, opcoes) {
    opcoes = opcoes || {};
    var cats = opcoes.categorias || {};
    var termos = termosDe(texto, opcoes.ignorarMedidas);
    if (!termos.length) return { lista: produtos.slice(), termos: [], modo: 'tudo', corrigido: '' };
    var grupos = termos.map(variantes);
    var idx = produtos.map(function (p, i) {
      return { p: p, i: i, nome: norm(p.nome), cat: norm(cats[p.cat] || p.cat || ''), resto: norm((p.detalhe || '') + ' ' + (p.emb || '')) };
    });
    // nome começa com o termo 5, palavra do nome 4, dentro do nome 3, categoria 2, descrição ou embalagem 1
    function nota(x, vs) {
      var melhor = 0;
      vs.forEach(function (t) {
        var k = x.nome.indexOf(t);
        melhor = Math.max(melhor, k === 0 ? 5 : k > 0 && x.nome[k - 1] === ' ' ? 4 : k > 0 ? 3 : x.cat.indexOf(t) !== -1 ? 2 : x.resto.indexOf(t) !== -1 ? 1 : 0);
      });
      return melhor;
    }
    function ordenar(a, b) { return b.bate - a.bate || b.nota - a.nota || a.i - b.i; }
    var achados = idx.map(function (x) {
      var bate = 0, soma = 0, forte = false;
      grupos.forEach(function (vs, g) { var n = nota(x, vs); if (n) { bate++; soma += n; if (termos[g].length > 2) forte = true; } });
      return bate ? { p: x.p, i: x.i, bate: bate, nota: soma, forte: forte } : null;
    }).filter(Boolean);
    var todos = achados.filter(function (x) { return x.bate === grupos.length; });
    if (todos.length) return { lista: todos.sort(ordenar).map(pegar), termos: [].concat.apply([], grupos), modo: 'exato', corrigido: '' };

    // erro de digitação: cada termo longo sem achado vira a palavra mais parecida do catálogo
    var palavras = {};
    idx.forEach(function (x) { (x.nome + ' ' + x.cat + ' ' + x.resto).split(/[^a-z0-9]+/).forEach(function (w) { if (w.length >= 3) palavras[w] = 1; }); });
    var trocou = false, corrigidos = termos.map(function (t) {
      if (t.length < 4 || achados.some(function (x) { return nota(idx[x.i], [t]); })) return t;
      var max = t.length <= 5 ? 1 : 2, melhor = null, dm = max + 1;
      Object.keys(palavras).forEach(function (w) { var dd = distancia(t, w, max); if (dd < dm || (dd === dm && melhor && w.length < melhor.length)) { dm = dd; melhor = w; } });
      if (melhor && dm <= max) { trocou = true; return melhor; }
      return t;
    });
    if (trocou) {
      var r = buscar(corrigidos.join(' '), produtos, { categorias: cats });
      if (r.modo === 'exato' || r.modo === 'aproximado') return { lista: r.lista, termos: r.termos, modo: 'digitacao', corrigido: corrigidos.join(' ') };
    }

    // aproximado: só o que bate com algum termo de verdade (2 letras, como "lã", aparecem em tudo)
    var aprox = achados.filter(function (x) { return x.forte; });
    if (aprox.length) return { lista: aprox.sort(ordenar).map(pegar), termos: [].concat.apply([], grupos), modo: 'aproximado', corrigido: '' };
    return { lista: [], termos: [], modo: 'nada', corrigido: '' };
  }
  function pegar(x) { return x.p; }

  /* Catálogo: categoria escolhida + texto da busca.
     - A categoria só restringe se tiver o que foi buscado; senão a busca vale para todas (escopo 'todas'):
       quem escolheu "Chapas" e depois digita "massa" vê a massa, e não "nada encontrado".
     - Nada bate: devolve os sugeridos (escopo 'sugeridos'), então a grade nunca fica vazia havendo produtos. */
  function filtrarCatalogo(texto, produtos, opcoes) {
    opcoes = opcoes || {};
    var cat = opcoes.cat || 'todas';
    function daCat(l) { return cat === 'todas' ? l : l.filter(function (p) { return p.cat === cat; }); }
    var r = String(texto || '').trim() ? buscar(texto, produtos, opcoes) : { lista: produtos.slice(), termos: [], modo: 'tudo', corrigido: '' };
    var lista, escopo = 'categoria';
    if (r.modo === 'tudo') lista = daCat(r.lista);
    else {
      lista = daCat(r.lista);
      if (!lista.length && r.lista.length) { lista = r.lista; escopo = 'todas'; }
    }
    if (!lista.length && produtos.length) {
      var sug = typeof opcoes.sugeridos === 'function' ? opcoes.sugeridos(produtos) : produtos.filter(function (p) { return p.destaque || p.oferta; }).slice(0, 8);
      lista = sug.length ? sug : produtos.slice(0, 8);
      escopo = 'sugeridos';
    }
    return { lista: lista, termos: r.termos, modo: r.modo, corrigido: r.corrigido, escopo: escopo };
  }

  return { norm: norm, buscar: buscar, filtrarCatalogo: filtrarCatalogo, semMedidas: semMedidas, termosDe: termosDe, distancia: distancia };
});
