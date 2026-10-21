/* Preço do pedido calculado pelo servidor, com o mesmo catálogo (js/data.js) e as mesmas regras (js/checkout-model.js)
   do site. O navegador manda só produto e quantidade; preço, total e canal saem daqui. */
import * as dadosMod from '../../js/data.js';
import * as regrasMod from '../../js/checkout-model.js';
import { ErroHttp } from './util.js';

const D = (dadosMod.default && dadosMod.default.DRYSUL) || globalThis.DRYSUL;
const V = (regrasMod.default && regrasMod.default.avaliar) ? regrasMod.default : globalThis.DrysulVendas;
if (!D || !V) throw new Error('Catálogo indisponível no servidor');

export const regras = V;
export const loja = D.loja;
export const limiteOnline = D.vendas.limiteOnline;
export const termosVersao = D.vendas.termosVersao; // versão dos termos que o cliente aceita no checkout
const PRODUTOS = Object.create(null);
D.produtos.forEach((p) => { PRODUTOS[p.id] = p; });
const MAX_LINHAS = 50;
export function produtoExiste(id) { return !!PRODUTOS[id]; }

export function precificar(itens, calculos) {
  if (!Array.isArray(itens) || !itens.length) throw new ErroHttp(422, 'pedido_vazio', 'O pedido está vazio.');
  if (itens.length > MAX_LINHAS) throw new ErroHttp(422, 'pedido_grande_demais', 'Itens demais no pedido.');
  const vistos = new Set();
  const limpos = itens.map((i) => {
    const id = i && typeof i.id === 'string' ? i.id : '';
    const qtd = i ? i.qtd : null;
    if (!PRODUTOS[id]) throw new ErroHttp(422, 'produto_invalido', 'Produto não encontrado no catálogo.', { produto: id.slice(0, 40) });
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > V.QTD_MAX) throw new ErroHttp(422, 'quantidade_invalida', 'Quantidade inválida.', { produto: id });
    if (vistos.has(id)) throw new ErroHttp(422, 'produto_repetido', 'Produto repetido no pedido.', { produto: id });
    vistos.add(id);
    return { id, qtd };
  });

  const av = V.avaliar({ itens: limpos, calculos: calculos ? [1] : [] }, PRODUTOS, { limiteOnline });
  if (av.canal !== 'online') {
    throw new ErroHttp(422, 'atendimento_whatsapp', 'Este pedido segue pelo WhatsApp.', { motivos: av.motivos });
  }
  const linhas = av.linhas.map((l) => {
    const p = PRODUTOS[l.id];
    const unit = Math.round(p.preco * 100);
    return { id: p.id, nome: p.nome, emb: p.emb, un: p.un, qtd: l.qtd, unitCentavos: unit, totalCentavos: unit * l.qtd };
  });
  return { linhas, totalCentavos: linhas.reduce((s, l) => s + l.totalCentavos, 0) };
}
