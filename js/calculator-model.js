/* Calculadora de materiais — modelo puro (sem DOM), testável no Node.
   Coeficientes por m² conferidos na calculadora pública da Gypsum em 29/09/2026:
   https://www.gypsum.com.br/pt-br/centro-de-apoio/calculo-materiais/
   Resultado = estimativa de consumo; não converte para embalagens nem soma perdas. */
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
        ['chapa', 'Chapa de drywall', 2.1, 'm²'],
        ['guia', 'Guia 70', 0.7, 'm'],
        ['montante', 'Montante 70', 2.3, 'm'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 2, 'un.'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 25, 'un.'],
        ['massa', 'Massa para juntas', 0.7, 'kg'],
        ['cola', 'Cola', 0.1, 'kg'],
        ['fita', 'Fita de papel para juntas', 3, 'm'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²']
      ] },
    { id: 'fge', nome: 'Forro estruturado (FGE)', curto: 'Forro FGE', entrada: 'area',
      desc: 'Forro com perfis S47, reguladores e cantoneira. Arame considerado para rebaixo de 1 m.',
      itens: [
        ['chapa', 'Chapa de drywall', 1.05, 'm²'],
        ['s47', 'Perfil S47', 1.7, 'm'],
        ['cantoneira', 'Cantoneira', 1.1, 'm'],
        ['regulador', 'Regulador S47', 1.25, 'un.'],
        ['uniao', 'União S47', 1, 'un.'],
        ['arame', 'Arame nº 10 (rebaixo de 1 m)', 1.25, 'm'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 1.5, 'un.'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 12, 'un.'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm'],
        ['massa', 'Massa para juntas', 0.35, 'kg'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²']
      ] },
    { id: 'fga', nome: 'Forro aramado (FGA)', curto: 'Forro FGA', entrada: 'area',
      desc: 'Forro de chapas ST para forro aramado, com nervuras, cola e junção H.',
      itens: [
        ['chapa', 'Chapa ST para forro aramado', 1.05, 'm²'],
        ['nervura', 'Nervura', 0.09, 'm²'],
        ['cola', 'Cola para forro aramado', 1.25, 'kg'],
        ['massa', 'Massa para juntas', 0.7, 'kg'],
        ['fita', 'Fita de papel para juntas', 3, 'm'],
        ['arame', 'Arame nº 18 encapado', 0.14, 'kg'],
        ['juncao', 'Junção H', 4.5, 'un.']
      ] },
    { id: 'colado', nome: 'Revestimento colado', curto: 'Rev. colado', entrada: 'dimensoes', alturaMax: 6,
      desc: 'Chapas ST ou RU coladas direto na parede existente. Altura até 6 m.',
      itens: [
        ['chapa', 'Chapa ST ou RU', 1.05, 'm²'],
        ['cola', 'Cola para drywall', 2.5, 'kg'],
        ['massa', 'Massa para juntas', 0.35, 'kg'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm']
      ] },
    { id: 'estruturado', nome: 'Revestimento estruturado', curto: 'Rev. estruturado', entrada: 'dimensoes', alturaMax: 3.05,
      desc: 'Chapas sobre estrutura de guias e montantes 70. Altura até 3,05 m.',
      itens: [
        ['chapa', 'Chapa ST ou RU', 1.05, 'm²'],
        ['guia', 'Guia 70', 0.69, 'm'],
        ['montante', 'Montante 70', 5.5, 'm'],
        ['la', 'Parafuso LA 9,5 (metal/metal)', 2, 'un.'],
        ['ta', 'Parafuso TA 25 (chapa/metal)', 12.5, 'un.'],
        ['massa', 'Massa para juntas', 0.35, 'kg'],
        ['cola', 'Cola', 0.1, 'kg'],
        ['fita', 'Fita de papel para juntas', 1.5, 'm'],
        ['la-mineral', 'Lã mineral (opcional)', 1.05, 'm²']
      ] }
  ];

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
        return { id: it[0], nome: it[1], qtd: arred(area * it[2]), unidade: it[3] };
      })
    };
  }

  function fmt(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  return { SISTEMAS: SISTEMAS, AREA_MAX: AREA_MAX, sistema: sistema, parseNumero: parseNumero, calcular: calcular, fmt: fmt };
});
