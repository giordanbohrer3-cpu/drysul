// Cloudflare Pages Functions: /api/* do drysul.pages.dev usa o mesmo servidor da loja (worker/src).
// Sem banco (D1) e sem credenciais configurados no projeto, ele responde "pagamento indisponível" e o site segue no WhatsApp.
import { rotear } from '../../worker/src/index.js';

export const onRequest = (ctx) => rotear(ctx.request, ctx.env);
