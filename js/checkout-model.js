/* Central de vendas — regras puras (sem DOM), testáveis no Node.
   Decide o canal do pedido:
   - "online": só itens com preço, sem estimativa da calculadora, subtotal até o limite → compra pelo site
   - "whatsapp": tem cálculo de parede/forro, item sob consulta ou valor acima do limite → atendimento
   Na versão final, o servidor refaz este cálculo com o catálogo dele: preço vindo do navegador não é confiável. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DrysulVendas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var QTD_MAX = 999;

  function centavos(v) { return Math.round(v * 100); }

  function avaliar(pedido, produtos, cfg) {
    var linhas = [], totalC = 0, consulta = 0;
    (pedido.itens || []).forEach(function (i) {
      var p = produtos[i.id];
      var qtd = Math.floor(Number(i.qtd));
      if (!p || !(qtd >= 1 && qtd <= QTD_MAX)) return;
      if (p.preco == null) { consulta++; linhas.push({ id: p.id, qtd: qtd, preco: null, total: null }); return; }
      var t = centavos(p.preco) * qtd;
      totalC += t;
      linhas.push({ id: p.id, qtd: qtd, preco: p.preco, total: t / 100 });
    });

    var subtotal = totalC / 100;
    if (!linhas.length && !pedido.estimativa) return { canal: 'vazio', motivos: [], subtotal: 0, linhas: [] };

    var motivos = [];
    if (pedido.estimativa) motivos.push('calculo');
    if (consulta) motivos.push('consulta');
    if (subtotal > cfg.limiteOnline) motivos.push('limite');
    return { canal: motivos.length ? 'whatsapp' : 'online', motivos: motivos, subtotal: subtotal, linhas: linhas };
  }

  function textoMotivo(m, limite, fmtBRL) {
    return {
      calculo: 'Tem cálculo de parede, forro ou revestimento: a equipe converte a estimativa em embalagens.',
      consulta: 'Tem itens sob consulta: preço e disponibilidade são confirmados pela equipe.',
      limite: 'Pedido acima de ' + fmtBRL(limite) + ': atendimento para condições e entrega.'
    }[m];
  }

  // Telefone BR com DDD: 10 ou 11 dígitos
  function telefoneValido(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.length === 13 && d.indexOf('55') === 0) d = d.slice(2);
    return /^[1-9]{2}9?\d{8}$/.test(d);
  }
  function formatarTelefone(s) {
    var d = String(s || '').replace(/\D/g, '').slice(-11);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return s;
  }
  function emailValido(s) { return !s || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim()); }

  function numeroPedido(data, aleatorio) {
    var d = data || new Date();
    var r = (aleatorio != null ? aleatorio : Math.random());
    var sufixo = Math.floor(r * 1679616).toString(36).toUpperCase();
    while (sufixo.length < 4) sufixo = '0' + sufixo;
    var mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return 'DS-' + dd + mm + '-' + sufixo;
  }

  // Comprovante: dados pessoais mascarados (o comprovante costuma ser compartilhado)
  function mascararTelefone(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.length === 13 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length < 10) return '';
    return '(' + d.slice(0, 2) + ') ' + (d.length === 11 ? d[2] + '••••' : '••••') + '-' + d.slice(-4);
  }
  function mascararEmail(s) {
    var m = /^([^@\s]+)@([^@\s]+)$/.exec(String(s || '').trim());
    if (!m) return '';
    return m[1].slice(0, Math.min(2, m[1].length)) + '•••@' + m[2];
  }

  // Código de verificação do comprovante: resumo do conteúdo (FNV-1a de 2 × 32 bits).
  // Na versão final, o código vem assinado pelo servidor da loja (HMAC), e a loja confere no painel.
  function codigoVerificacao(texto) {
    var s = String(texto), h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    var hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
    return hex.slice(0, 4) + '-' + hex.slice(4, 8) + '-' + hex.slice(8, 12);
  }
  function conteudoComprovante(r) {
    return [r.numero, r.dataISO, r.status, r.pagamento, r.total.toFixed(2),
      r.itens.map(function (i) { return i.id + ':' + i.qtd + ':' + i.unit.toFixed(2); }).join(',')].join('|');
  }

  return {
    mascararTelefone: mascararTelefone, mascararEmail: mascararEmail,
    codigoVerificacao: codigoVerificacao, conteudoComprovante: conteudoComprovante,
    QTD_MAX: QTD_MAX, avaliar: avaliar, textoMotivo: textoMotivo,
    telefoneValido: telefoneValido, formatarTelefone: formatarTelefone, emailValido: emailValido,
    numeroPedido: numeroPedido
  };
});
