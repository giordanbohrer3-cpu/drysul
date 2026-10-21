/* Configuração por ambiente. Os valores vêm do wrangler.jsonc (vars) e dos segredos do Cloudflare (wrangler secret put).
   Regra de ouro: na dúvida, bloqueia. Produção só cobra com PAGAMENTOS_ATIVOS = "true", credenciais de produção,
   segredo do webhook, chave dos pedidos e SITE_URL em https. */

const MP_API = 'https://api.mercadopago.com';
const AMBIENTES = ['local', 'teste', 'producao'];

function localhost(host) { return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'; }

export function lerConfig(env, url) {
  let ambiente = AMBIENTES.indexOf(env.AMBIENTE) !== -1 ? env.AMBIENTE : null;
  const pendencias = [];
  if (!ambiente) pendencias.push('AMBIENTE');
  // "local" publicado por engano (deploy sem --env) não cobra nem aceita endereço de API trocado
  if (ambiente === 'local' && !localhost(url.hostname)) { pendencias.push('AMBIENTE local fora do computador'); ambiente = null; }

  const token = env.MP_ACCESS_TOKEN || '';
  const segredoWebhook = env.MP_WEBHOOK_SECRET || '';
  const chave = env.CHAVE_PEDIDOS || '';
  const site = String(env.SITE_URL || url.origin).replace(/\/+$/, '');

  if (!token) pendencias.push('MP_ACCESS_TOKEN');
  if (!segredoWebhook) pendencias.push('MP_WEBHOOK_SECRET');
  if (chave.length < 32) pendencias.push('CHAVE_PEDIDOS (32+ caracteres)');
  if (env.PAGAMENTOS_ATIVOS !== 'true') pendencias.push('PAGAMENTOS_ATIVOS');
  if (ambiente !== 'local' && !/^https:\/\//.test(site)) pendencias.push('SITE_URL em https');
  if (ambiente === 'producao') {
    if (!env.SITE_URL) pendencias.push('SITE_URL');
    if (/^TEST-/.test(token)) pendencias.push('credencial de produção (a atual é de teste)');
  }
  if (!env.DB) pendencias.push('banco D1 (DB)');

  return {
    ambiente: ambiente || 'bloqueado',
    teste: ambiente !== 'producao',
    site,
    token, segredoWebhook, chave,
    apiBase: ambiente === 'local' && env.MP_API_BASE ? String(env.MP_API_BASE).replace(/\/+$/, '') : MP_API,
    // cobrar: criar pedidos e abrir o checkout. consultar: webhook e status continuam com o checkout desligado,
    // para nenhum pagamento já feito se perder.
    podeCobrar: pendencias.length === 0,
    podeConsultar: !!(ambiente && token && segredoWebhook && chave.length >= 32 && env.DB),
    pendencias
  };
}

// O checkout precisa ser do Mercado Pago (ou do simulador local, só no computador)
export function checkoutConfiavel(cfg, endereco) {
  let u;
  try { u = new URL(endereco); } catch (e) { return false; }
  if (cfg.ambiente === 'local' && localhost(u.hostname)) return true;
  return u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname);
}
