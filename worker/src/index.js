/* Drysul: servidor da loja no Cloudflare Workers.
   O site (HTML, CSS, JS e imagens) sai direto do Static Assets; só /api/* passa por aqui (run_worker_first). */
import { lerConfig } from './config.js';
import * as pedidos from './pedidos.js';
import { ErroHttp, respostaErro } from './util.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
// [método, caminho, ação, exige mesma origem (POST vindo do site)]
const ROTAS = [
  ['GET', /^\/api\/status$/, (c) => pedidos.status(c.cfg)],
  ['POST', /^\/api\/pedidos$/, (c) => pedidos.criarPedido(c.request, c.env, c.cfg), true],
  ['GET', new RegExp('^/api/pedidos/' + ID + '$'), (c, m) => pedidos.consultar(c.request, c.env, c.cfg, m[1], c.url)],
  ['POST', new RegExp('^/api/pedidos/' + ID + '/pagamento$'), (c, m) => pedidos.iniciarPagamento(c.request, c.env, c.cfg, m[1]), true],
  ['GET', new RegExp('^/api/pedidos/' + ID + '/comprovante$'), (c, m) => pedidos.comprovante(c.request, c.env, c.cfg, m[1])],
  ['GET', /^\/api\/comprovantes\/verificar$/, (c) => pedidos.verificarComprovante(c.env, c.cfg, c.url)],
  ['POST', /^\/api\/webhooks\/mercadopago$/, (c) => pedidos.webhook(c.request, c.env, c.cfg, c.url)]
];

function mesmaOrigem(request, cfg, url) {
  const o = request.headers.get('origin');
  return !o || o === url.origin || o === cfg.site;
}

export async function rotear(request, env) {
  const url = new URL(request.url);
  try {
    const cfg = lerConfig(env, url);
    let metodoErrado = false;
    for (const [metodo, caminho, acao, origem] of ROTAS) {
      const m = caminho.exec(url.pathname);
      if (!m) continue;
      if (request.method !== metodo) { metodoErrado = true; continue; }
      if (origem && !mesmaOrigem(request, cfg, url)) throw new ErroHttp(403, 'origem_invalida', 'Origem não permitida.');
      return await acao({ request, env, cfg, url }, m);
    }
    throw metodoErrado ? new ErroHttp(405, 'metodo_invalido', 'Método não permitido.') : new ErroHttp(404, 'nao_encontrado', 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof ErroHttp) return respostaErro(e);
    console.error('erro interno', e && e.message);
    return respostaErro(new ErroHttp(500, 'erro_interno', 'Erro interno. Tente de novo.'));
  }
}

export default {
  fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    return rotear(request, env);
  }
};
