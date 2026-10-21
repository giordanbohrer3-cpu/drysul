/* Assinatura das notificações do Mercado Pago (cabeçalho x-signature: "ts=...,v1=...").
   Manifesto igual ao validador do SDK oficial (mercadopago@3.6.1, utils/webhook):
   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", com HMAC-SHA256 em hexadecimal.
   A documentação antiga pede data.id em minúsculas e o SDK usa o valor como chegou: as duas formas são aceitas,
   e as duas exigem o segredo. A notificação só avisa; o estado do pagamento é sempre lido de novo no Mercado Pago. */
import { hmac, iguais } from './util.js';

export function lerAssinatura(cabecalho) {
  const partes = {};
  String(cabecalho || '').split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return partes.ts && partes.v1 ? { ts: partes.ts, v1: partes.v1.toLowerCase() } : null;
}

export function manifesto(dataId, requestId, ts) {
  const p = [];
  if (dataId) p.push('id:' + dataId);
  if (requestId) p.push('request-id:' + requestId);
  p.push('ts:' + ts);
  return p.join(';') + ';';
}

export async function assinaturaValida({ assinatura, requestId, dataId, segredo }) {
  const a = lerAssinatura(assinatura);
  if (!a || !segredo || !/^[0-9a-f]{64}$/.test(a.v1)) return false;
  const ids = dataId && dataId !== dataId.toLowerCase() ? [dataId, dataId.toLowerCase()] : [dataId];
  let ok = false;
  for (const id of ids) ok = iguais(await hmac(segredo, manifesto(id, requestId, a.ts)), a.v1) || ok;
  return ok;
}
