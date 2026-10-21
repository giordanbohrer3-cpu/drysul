/* Drysul: servidor da loja no Cloudflare Workers.
   O site (HTML, CSS, JS e imagens) sai direto do Static Assets; só /api/* passa por aqui (run_worker_first). */
import { lerConfig } from './config.js';
import * as pedidos from './pedidos.js';
import * as admin from './admin.js';
import { contarUso } from './db.js';
import { ErroHttp, respostaErro, sha256 } from './util.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
// Limite por IP (janela de 10 min): impede abuso e força bruta. O IP vira um resumo, não fica guardado.
const LIMITES = { pedidos: 10, pagamento: 20, consulta: 300, verificar: 30 };
async function limitar(request, env, nome) {
  if (!env.DB) return;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const n = await contarUso(env.DB, nome + ':' + (await sha256('ip:' + ip)).slice(0, 24), 600);
  if (n > LIMITES[nome]) throw new ErroHttp(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde alguns minutos.');
}
// [método, caminho, ação, exige mesma origem (POST vindo do site), limite]
const ROTAS = [
  ['GET', /^\/api\/status$/, (c) => pedidos.status(c.cfg)],
  ['POST', /^\/api\/pedidos$/, (c) => pedidos.criarPedido(c.request, c.env, c.cfg), true, 'pedidos'],
  ['GET', new RegExp('^/api/pedidos/' + ID + '$'), (c, m) => pedidos.consultar(c.request, c.env, c.cfg, m[1], c.url), false, 'consulta'],
  ['POST', new RegExp('^/api/pedidos/' + ID + '/pagamento$'), (c, m) => pedidos.iniciarPagamento(c.request, c.env, c.cfg, m[1]), true, 'pagamento'],
  ['GET', new RegExp('^/api/pedidos/' + ID + '/comprovante$'), (c, m) => pedidos.comprovante(c.request, c.env, c.cfg, m[1]), false, 'consulta'],
  ['GET', /^\/api\/comprovantes\/verificar$/, (c) => pedidos.verificarComprovante(c.env, c.cfg, c.url), false, 'verificar'],
  ['*', /^\/api\/admin\//, (c) => admin.rotear(c.request, c.env, c.cfg, c.url)],
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
    for (const [metodo, caminho, acao, origem, limite] of ROTAS) {
      const m = caminho.exec(url.pathname);
      if (!m) continue;
      if (metodo !== '*' && request.method !== metodo) { metodoErrado = true; continue; }
      if (origem && !mesmaOrigem(request, cfg, url)) throw new ErroHttp(403, 'origem_invalida', 'Origem não permitida.');
      if (limite) await limitar(request, env, limite);
      return await acao({ request, env, cfg, url }, m);
    }
    throw metodoErrado ? new ErroHttp(405, 'metodo_invalido', 'Método não permitido.') : new ErroHttp(404, 'nao_encontrado', 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof ErroHttp) return respostaErro(e);
    console.error('erro interno', e && e.message);
    return respostaErro(new ErroHttp(500, 'erro_interno', 'Erro interno. Tente de novo.'));
  }
}

// O HTML do painel também passa pelo Worker: sem login válido, nem a página é entregue
async function paginaAdmin(request, env) {
  try { await admin.autenticar(request, env, lerConfig(env, new URL(request.url))); }
  catch (e) { return new Response('Acesso restrito à equipe da Drysul.', { status: e.status || 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }); }
  const r = await env.ASSETS.fetch(request);
  const h = new Headers(r.headers); h.set('cache-control', 'no-store'); h.set('x-robots-tag', 'noindex');
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  fetch(request, env) {
    const caminho = new URL(request.url).pathname;
    if (caminho === '/admin' || caminho.startsWith('/admin/')) return paginaAdmin(request, env);
    if (!caminho.startsWith('/api/')) return env.ASSETS.fetch(request);
    return rotear(request, env);
  },
  // Agendador (wrangler.jsonc → triggers.crons): reservas vencidas, limites antigos e retenção de dados
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(admin.rotinas(env).then((r) => console.log('rotinas', JSON.stringify(r))));
  }
};
