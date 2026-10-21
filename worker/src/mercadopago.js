/* Cliente mínimo da Orders API do Mercado Pago (Checkout Pro).
   Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order */
import { textoDeCentavos } from './util.js';

const TEMPO_LIMITE = 10000;

// Falha de comunicação ou resposta inesperada do provedor (nunca vira "pago")
export class ErroProvedor extends Error {
  constructor(mensagem, status) { super(mensagem); this.status = status || 0; }
}

async function chamar(cfg, metodo, caminho, corpo, chaveIdem) {
  const cab = { accept: 'application/json', authorization: 'Bearer ' + cfg.token };
  if (corpo) cab['content-type'] = 'application/json';
  if (chaveIdem) cab['x-idempotency-key'] = chaveIdem;
  let r;
  try {
    r = await fetch(cfg.apiBase + caminho, {
      method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_LIMITE)
    });
  } catch (e) {
    throw new ErroProvedor('Sem resposta do Mercado Pago');
  }
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { /* resposta não JSON */ }
  if (!r.ok || !dados) {
    // só o status e o código do erro vão para o log: a resposta pode ter dados do comprador
    console.error('mercadopago', metodo, caminho.split('/').slice(0, 3).join('/'), r.status, dados && (dados.code || dados.error));
    throw new ErroProvedor('Mercado Pago respondeu ' + r.status, r.status);
  }
  return dados;
}

export function criarOrder(cfg, pedido, linhas, chaveIdem) {
  const volta = (r) => cfg.site + '/?pedido=' + encodeURIComponent(pedido.id) + '&retorno=' + r;
  const corpo = {
    type: 'online',
    processing_mode: 'manual', // "Para Checkout Pro, o único valor possível é manual"
    external_reference: pedido.id,
    total_amount: textoDeCentavos(pedido.total_centavos),
    description: 'Pedido ' + pedido.numero + ' - Drysul',
    expiration_time: 'PT1H',
    items: linhas.map((l) => ({
      title: l.nome.slice(0, 150),
      unit_price: textoDeCentavos(l.unit_centavos),
      quantity: l.qtd,
      unit_measure: 'unit',
      total_amount: textoDeCentavos(l.total_centavos)
    })),
    config: { online: { success_url: volta('aprovado'), pending_url: volta('pendente'), failure_url: volta('falha'), auto_return: 'all' } }
  };
  if (pedido.cliente_email) corpo.payer = { email: pedido.cliente_email };
  return chamar(cfg, 'POST', '/v1/orders', corpo, chaveIdem);
}

export function obterOrder(cfg, id) {
  return chamar(cfg, 'GET', '/v1/orders/' + encodeURIComponent(id));
}

export function cancelarOrder(cfg, id) {
  return chamar(cfg, 'POST', '/v1/orders/' + encodeURIComponent(id) + '/cancel');
}

// Reembolso total da order (estorno pelo provedor). Mesma chave = o mesmo reembolso, nunca dois.
export function reembolsarOrder(cfg, id, chaveIdem) {
  return chamar(cfg, 'POST', '/v1/orders/' + encodeURIComponent(id) + '/refund', null, chaveIdem);
}
