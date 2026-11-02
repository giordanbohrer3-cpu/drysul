// Painel da loja no Pages: sem login válido do Cloudflare Access (e papel em ADMIN_EMAILS), nem o HTML é entregue.
import { autenticar } from '../../worker/src/admin.js';
import { lerConfig } from '../../worker/src/config.js';

export async function onRequest(ctx) {
  try { await autenticar(ctx.request, ctx.env, lerConfig(ctx.env, new URL(ctx.request.url))); }
  catch (e) {
    return new Response('Acesso restrito à equipe da Drysul.', { status: e.status || 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const r = await ctx.next();
  const h = new Headers(r.headers); h.set('cache-control', 'no-store'); h.set('x-robots-tag', 'noindex');
  return new Response(r.body, { status: r.status, headers: h });
}
