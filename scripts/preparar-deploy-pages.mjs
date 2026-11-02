// Monta a pasta de publicação do Cloudflare Pages fora do repositório (o wrangler.jsonc da raiz é do Worker):
//   <destino>/site        ← dist/ (site público)
//   <destino>/functions   ← /api e /admin (Pages Functions), que importam worker/src e js/
//   <destino>/wrangler.jsonc ← configuração do Pages (variáveis e banco D1) a partir das variáveis do GitHub
// Padrão seguro: AMBIENTE "producao" com PAGAMENTOS_ATIVOS "false" e sem banco → pagamento online desligado.
// Uso: node scripts/build-pages.mjs && node scripts/preparar-deploy-pages.mjs /caminho/destino
import { cpSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname, dest = process.argv[2];
if (!dest) throw new Error('informe a pasta de destino');
if (!existsSync(join(raiz, 'dist', 'index.html'))) throw new Error('rode antes: node scripts/build-pages.mjs');
mkdirSync(dest, { recursive: true });
cpSync(join(raiz, 'dist'), join(dest, 'site'), { recursive: true });
cpSync(join(raiz, 'functions'), join(dest, 'functions'), { recursive: true });
cpSync(join(raiz, 'worker'), join(dest, 'worker'), { recursive: true });
mkdirSync(join(dest, 'js'), { recursive: true });
for (const f of ['data.js', 'checkout-model.js']) cpSync(join(raiz, 'js', f), join(dest, 'js', f));

const v = (n, padrao) => (process.env[n] || '').trim() || padrao;
const cfg = {
  name: 'drysul',
  pages_build_output_dir: './site',
  compatibility_date: '2026-10-01',
  vars: {
    AMBIENTE: v('DRYSUL_AMBIENTE', 'producao'), // teste = credenciais de teste do Mercado Pago
    PAGAMENTOS_ATIVOS: v('PAGAMENTOS_ATIVOS', 'false'),
    SITE_URL: v('SITE_URL', 'https://drysul.pages.dev').replace(/\/+$/, ''),
    ACCESS_TEAM_DOMAIN: v('ACCESS_TEAM_DOMAIN', ''), ACCESS_AUD: v('ACCESS_AUD', ''), ADMIN_EMAILS: v('ADMIN_EMAILS', ''),
    RETENCAO_DIAS_NAO_PAGOS: v('RETENCAO_DIAS_NAO_PAGOS', '')
  }
};
if (v('D1_ID', '')) cfg.d1_databases = [{ binding: 'DB', database_name: v('D1_NOME', 'drysul-pages'), database_id: v('D1_ID', ''), migrations_dir: './worker/migrations' }];
writeFileSync(join(dest, 'wrangler.jsonc'), JSON.stringify(cfg, null, 2) + '\n');
console.log('publicação pronta em', dest, '| ambiente', cfg.vars.AMBIENTE, '| pagamentos', cfg.vars.PAGAMENTOS_ATIVOS, '| banco', cfg.d1_databases ? 'sim' : 'não');
