/* Calculadora de materiais — modelo puro (sem DOM), testável no Node.
   Coeficientes por m² conferidos na calculadora pública da Gypsum em 29/09/2026:
   https://www.gypsum.com.br/pt-br/centro-de-apoio/calculo-materiais/
   Resultado = estimativa de consumo; não soma perdas. Cada item vira embalagens de compra (COMPRA), arredondadas
   para cima, e orcar() aplica os preços que a página passar (da loja ou médios de mercado). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DrysulCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AREA_MAX = 100000; // proteção da interface, não regra técnica

  var SISTEMAS = [
    { id: 'parede', nome: 'Parede drywall', curto: 'Parede', entrada: 'dimensoes', alturaMax: 3,
      desc: 'Parede com guias e montantes 70 e chapa dos dois lados. Altura até 3 m.',
      itens: [
        ['chapa', 'Chapa de drywall', 2.1, 'm²', 'chapa'],
        ['guia', 'Guia 70', 0.7, 'm', 'guia'],
        ['montante', 'Montante 70', 2.3, 'm', 'montante'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 2, 'un.', 'parafLA'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 25, 'un.', 'parafTA'],
        ['massa', 'Massa para juntas', 0.7, 'kg', 'massa'],
        ['cola', 'Cola', 0.1, 'kg', 'cola'],
        ['fita', 'Fita de papel para juntas', 3, 'm', 'fita'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²', 'lamin']
      ] },
    { id: 'fge', nome: 'Forro estruturado (FGE)', curto: 'Forro FGE', entrada: 'area',
      desc: 'Forro com perfis S47, reguladores e cantoneira. Arame considerado para rebaixo de 1 m.',
      itens: [
        ['chapa', 'Chapa de drywall', 1.05, 'm²', 'chapa'],
        ['s47', 'Perfil S47', 1.7, 'm', 's47'],
        ['cantoneira', 'Cantoneira', 1.1, 'm', 'cantoneira'],
        ['regulador', 'Regulador S47', 1.25, 'un.', 'regulador'],
        ['uniao', 'União S47', 1, 'un.', 'uniao'],
        ['arame', 'Arame nº 10 (rebaixo de 1 m)', 1.25, 'm', 'arame10'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 1.5, 'un.', 'parafLA'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 12, 'un.', 'parafTA'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm', 'fita'],
        ['massa', 'Massa para juntas', 0.35, 'kg', 'massa'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²', 'lamin']
      ] },
    { id: 'fga', nome: 'Forro aramado (FGA)', curto: 'Forro FGA', entrada: 'area',
      desc: 'Forro de chapas ST para forro aramado, com nervuras, cola e junção H.',
      itens: [
        ['chapa', 'Chapa ST para forro aramado', 1.05, 'm²', 'chapa'],
        ['nervura', 'Nervura', 0.09, 'm²', 'nervura'],
        ['cola', 'Cola para forro aramado', 1.25, 'kg', 'cola'],
        ['massa', 'Massa para juntas', 0.7, 'kg', 'massa'],
        ['fita', 'Fita de papel para juntas', 3, 'm', 'fita'],
        ['arame', 'Arame nº 18 encapado', 0.14, 'kg', 'arame18'],
        ['juncao', 'Junção H', 4.5, 'un.', 'juncao']
      ] },
    { id: 'colado', nome: 'Revestimento colado', curto: 'Rev. colado', entrada: 'dimensoes', alturaMax: 6,
      desc: 'Chapas ST ou RU coladas direto na parede existente. Altura até 6 m.',
      itens: [
        ['chapa', 'Chapa ST ou RU', 1.05, 'm²', 'chapa'],
        ['cola', 'Cola para drywall', 2.5, 'kg', 'cola'],
        ['massa', 'Massa para juntas', 0.35, 'kg', 'massa'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm', 'fita']
      ] },
    { id: 'estruturado', nome: 'Revestimento estruturado', curto: 'Rev. estruturado', entrada: 'dimensoes', alturaMax: 3.05,
      desc: 'Chapas sobre estrutura de guias e montantes 70. Altura até 3,05 m.',
      itens: [
        ['chapa', 'Chapa ST ou RU', 1.05, 'm²', 'chapa'],
        ['guia', 'Guia 70', 0.69, 'm', 'guia'],
        ['montante', 'Montante 70', 5.5, 'm', 'montante'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 2, 'un.', 'parafLA'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 12.5, 'un.', 'parafTA'],
        ['massa', 'Massa para juntas', 0.35, 'kg', 'massa'],
        ['cola', 'Cola', 0.1, 'kg', 'cola'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm', 'fita'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²', 'lamin']
      ] }
  ];

  /* Embalagem de compra de cada material: `por` = quanto cabe numa embalagem, na unidade do consumo.
     `ref` = id do produto em data.js (preço da loja) ou da tabela de preços médios. */
  var COMPRA = {
    chapa:      { ref: 'chapa-st', por: 2.88, un: 'chapa', pl: 'chapas', det: 'ST 1,20 × 2,40 m' },
    guia:       { ref: 'guia-70', por: 3, un: 'barra', pl: 'barras', det: 'de 3 m' },
    montante:   { ref: 'montante-70', por: 3, un: 'barra', pl: 'barras', det: 'de 3 m' },
    s47:        { ref: 'perfil-forro', por: 3, un: 'barra', pl: 'barras', det: 'de 3 m' },
    cantoneira: { ref: 'cantoneira', por: 3, un: 'barra', pl: 'barras', det: 'de 3 m' },
    regulador:  { ref: 'regulador', por: 1, un: 'un.', pl: 'un.', det: '' },
    uniao:      { ref: 'uniao', por: 1, un: 'un.', pl: 'un.', det: '' },
    arame10:    { ref: 'arame-10', por: 14, un: 'kg', pl: 'kg', det: '(cerca de 14 m por kg)' },
    arame18:    { ref: 'arame-18', por: 1, un: 'kg', pl: 'kg', det: '' },
    parafLA:    { ref: 'parafuso-metal', por: 200, un: 'caixa', pl: 'caixas', det: 'com 200' },
    parafTA:    { ref: 'parafuso', por: 1000, un: 'caixa', pl: 'caixas', det: 'com 1.000' },
    massa:      { ref: 'massa', por: 25, un: 'balde', pl: 'baldes', det: 'de 25 kg' },
    fita:       { ref: 'fita', por: 150, un: 'rolo', pl: 'rolos', det: 'de 150 m' },
    cola:       { ref: 'gesso-cola', por: 20, un: 'saco', pl: 'sacos', det: 'de 20 kg' },
    lamin:      { ref: 'la-vidro', por: 15, un: 'rolo', pl: 'rolos', det: 'de 15 m²' },
    nervura:    { ref: 'nervura', por: 1, un: 'm²', pl: 'm²', det: '' },
    juncao:     { ref: 'juncao-h', por: 1, un: 'un.', pl: 'un.', det: '' }
  };

  function sistema(id) {
    for (var i = 0; i < SISTEMAS.length; i++) if (SISTEMAS[i].id === id) return SISTEMAS[i];
    return null;
  }

  // Aceita "2,8" ou "2.8", até 3 casas decimais. Rejeita sinais, texto, notação científica e milhar.
  function parseNumero(valor) {
    var s = String(valor == null ? '' : valor).trim();
    if (!/^\d{1,6}(?:[.,]\d{1,3})?$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }

  function arred(n) { return Math.round(n * 1000) / 1000; }

  function calcular(id, entrada) {
    var sis = sistema(id);
    if (!sis) return { ok: false, erros: { geral: 'Sistema desconhecido.' } };
    var erros = {}, area, dims = null;
    entrada = entrada || {};

    if (sis.entrada === 'dimensoes') {
      var a = parseNumero(entrada.altura), c = parseNumero(entrada.comprimento);
      if (isNaN(a)) erros.altura = 'Informe a altura em metros (ex.: 2,8).';
      else if (a <= 0) erros.altura = 'A altura deve ser maior que zero.';
      else if (a > sis.alturaMax) erros.altura = 'Altura máxima para este sistema: ' + fmt(sis.alturaMax) + ' m.';
      if (isNaN(c)) erros.comprimento = 'Informe o comprimento em metros (ex.: 4).';
      else if (c <= 0) erros.comprimento = 'O comprimento deve ser maior que zero.';
      if (!erros.altura && !erros.comprimento) { area = a * c; dims = { altura: a, comprimento: c }; }
    } else {
      var ar = parseNumero(entrada.area);
      if (isNaN(ar)) erros.area = 'Informe a área em m² (ex.: 20).';
      else if (ar <= 0) erros.area = 'A área deve ser maior que zero.';
      else area = ar;
    }
    if (area !== undefined && area > AREA_MAX) {
      erros[sis.entrada === 'area' ? 'area' : 'comprimento'] = 'Área acima do limite desta calculadora (' + fmt(AREA_MAX) + ' m²).';
    }
    for (var k in erros) if (Object.prototype.hasOwnProperty.call(erros, k)) return { ok: false, erros: erros };

    area = arred(area);
    return {
      ok: true,
      sistema: sis.id,
      nome: sis.nome,
      dims: dims,
      area: area,
      itens: sis.itens.map(function (it) {
        var qtd = arred(area * it[2]), c = COMPRA[it[4]];
        var n = Math.max(1, Math.ceil(qtd / c.por - 1e-9));
        return {
          id: it[0], nome: it[1], qtd: qtd, unidade: it[3], opcional: /\(opcional\)/.test(it[1]),
          ref: c.ref, qtdCompra: n, unCompra: n === 1 ? c.un : c.pl, unSing: c.un, detCompra: c.det
        };
      })
    };
  }

  /* Orçamento da estimativa. precoDe(ref) devolve { preco, fonte: 'loja' | 'media' } ou null (sob consulta).
     Contas em centavos. Itens opcionais aparecem com preço, mas ficam fora do total. */
  function orcar(resultado, precoDe) {
    var totalC = 0, semPreco = 0, opcionalC = 0;
    var itens = resultado.itens.map(function (i) {
      var p = precoDe(i.ref), o = {};
      for (var k in i) if (Object.prototype.hasOwnProperty.call(i, k)) o[k] = i[k];
      if (!p || p.preco == null) { o.preco = null; o.fonte = null; o.subtotal = null; if (!i.opcional) semPreco++; return o; }
      var c = Math.round(p.preco * 100) * i.qtdCompra;
      o.preco = p.preco; o.fonte = p.fonte; o.subtotal = c / 100;
      if (i.opcional) opcionalC += c; else totalC += c;
      return o;
    });
    return { itens: itens, total: totalC / 100, opcional: opcionalC / 100, semPreco: semPreco };
  }

  function fmt(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  /* Atalho "descreva a obra": "Quero uma parede de drywall de 4 × 2,8 m com acabamento em madeira" →
     { sistema: 'parede', valores: { altura: '2,8', comprimento: '4' }, faltando: [], acabamento: { id: 'ripado', … } }.
     Devolve null quando o texto é busca de produto ("chapa RU", "parafuso 4,8 × 19") e não obra.
     Sem rótulo, a menor medida é a altura; nos sistemas de hoje as quantidades dependem só da área, então trocar
     altura e comprimento não muda a lista (só o limite de altura e o desenho). */
  var OBRA = [
    ['fga', /aramad/, true],
    ['fge', /\bforro|\bteto|rebaix/, true],
    ['estruturado', /revestimento estruturad|\bestruturad/, true],
    ['colado', /revesti|colad|cobrir|parede existente/, true],
    ['parede', /parede|divisori/, true],
    ['parede', /drywall|acartonad|gesso/, false] // palavra fraca: sozinha é busca de produto
  ];
  var ACABAMENTOS = [
    ['lambri', 'Lambri de madeira', /lambri/],
    ['ripado', 'Ripado de madeira', /ripad|\bripas?\b|madeira/],
    ['placa3d', 'Placa 3D', /\b3 ?d\b/],
    ['cimento', 'Cimento queimado', /cimento/],
    ['forro', 'Forro com tabica', /tabica/],
    ['liso', 'Drywall liso', /\bliso|pintad|pintura/]
  ];
  var PRODUTO = /parafus|broca|agulha|bucha|ancor|parabolt|chumbad|fita|massa|chapa|placa|montante|guia|perfil|cantoneir|caixa|unidade|\bmm\b|glassroc|costura|sextavad|gn ?25/;
  function entender(texto) {
    var t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[×*]/g, ' x ').replace(/²/g, '2').replace(/metros? quadrados?/g, 'm2');
    var N = '(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(cm)?', U = '\\s*(?:m|metros?)?\\s*', m;
    function num(s, cm) { var v = Number(s.replace(',', '.')); return cm ? v / 100 : v; }
    var sis = null, forte = false, acab = null, i;
    for (i = 0; i < OBRA.length; i++) if (OBRA[i][1].test(t)) { sis = OBRA[i][0]; forte = OBRA[i][2]; break; }
    for (i = 0; i < ACABAMENTOS.length; i++) if (ACABAMENTOS[i][2].test(t)) { acab = { id: ACABAMENTOS[i][0], nome: ACABAMENTOS[i][1] }; break; }
    var a = null, b = null, area = null, alt = null, comp = null, unico = null;
    if ((m = new RegExp(N + U + '(?:x|por)\\s*' + N).exec(t))) { a = num(m[1], m[2]); b = num(m[3], m[4]); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); }
    if ((m = new RegExp(N + '\\s*m ?2\\b').exec(t)) || (m = new RegExp('area\\s*(?:de\\s*)?' + N).exec(t))) area = num(m[1], m[2]);
    // "2,8 m de altura" vem antes de "altura 2,8": em "altura e 5 m de comprimento" o 5 não é a altura
    if ((m = new RegExp(N + U + 'de\\s*(?:altura|alto)').exec(t)) || (m = new RegExp('(?:altura|alto|pe[ -]?direito)\\D{0,14}?' + N).exec(t))) alt = num(m[1], m[2]);
    if ((m = new RegExp(N + U + 'de\\s*(?:comprimento|largura|extensao|comprido)').exec(t)) || (m = new RegExp('(?:comprimento|largura|extensao)\\D{0,14}?' + N).exec(t))) comp = num(m[1], m[2]);
    if (a == null && area == null && alt == null && comp == null && (m = new RegExp(N).exec(t))) unico = num(m[1], m[2]);
    var temMedida = a != null || area != null || alt != null || comp != null;
    if (!sis) {
      // sem palavra de obra: só um par de medidas solto ("4 × 2,8") vira parede; especificação de produto não
      if (a == null || PRODUTO.test(t)) return null;
      sis = 'parede';
    } else if (!forte && (!temMedida || PRODUTO.test(t))) return null;
    if (unico != null && !forte) return null;

    var s = sistema(sis), valores = {}, faltando = [], rot;
    if (s.entrada === 'area') {
      var ar = area != null ? area : a != null ? a * b : alt != null && comp != null ? alt * comp : null;
      if (ar != null && ar > 0) { ar = arred(ar); valores.area = txt(ar); rot = (a != null && area == null ? fmt(a) + ' × ' + fmt(b) + ' m (' + fmt(ar) + ' m²)' : fmt(ar) + ' m²'); }
      else faltando.push('area');
    } else {
      if (a != null) {
        if (alt == null && comp == null) { alt = Math.min(a, b); comp = Math.max(a, b); }
        else if (alt == null) alt = comp === a ? b : a;
        else if (comp == null) comp = alt === a ? b : a;
      }
      if (alt == null && comp == null && unico != null) comp = unico;
      if (alt != null) valores.altura = txt(alt); else faltando.push('altura');
      if (comp != null) valores.comprimento = txt(comp); else faltando.push('comprimento');
      if (!faltando.length) rot = fmt(comp) + ' × ' + fmt(alt) + ' m';
    }
    return { sistema: sis, nome: s.nome, valores: valores, faltando: faltando, acabamento: acab, rotulo: s.nome + (rot ? ' · ' + rot : '') };
  }
  function txt(n) { return String(arred(n)).replace('.', ','); }

  return { SISTEMAS: SISTEMAS, COMPRA: COMPRA, AREA_MAX: AREA_MAX, sistema: sistema, parseNumero: parseNumero, calcular: calcular, orcar: orcar, fmt: fmt, entender: entender };
});
