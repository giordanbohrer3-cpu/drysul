// Cloudflare Pages: copia só o site público para dist/ (sem código do servidor, testes, docs nem segredos).
// /api e /admin rodam pelas Pages Functions (functions/), que usam worker/src. Sem banco e credenciais no projeto,
// o pagamento online fica desligado e a compra segue pelo WhatsApp; o painel fica fechado.
// Uso: node scripts/build-pages.mjs   (comando de build do projeto no Pages; diretório de saída: dist)
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname, saida = join(raiz, 'dist');
const fora = new Set(readFileSync(join(raiz, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .concat(['functions', 'scripts', 'dist', 'package.json', 'package-lock.json', '.nojekyll']));
const ignorar = (p) => { const r = relative(raiz, p).split(sep)[0]; return fora.has(r) || (r.startsWith('.dev.vars')); };

rmSync(saida, { recursive: true, force: true });
for (const nome of readdirSync(raiz)) { const p = join(raiz, nome); if (!ignorar(p)) cpSync(p, join(saida, nome), { recursive: true, filter: (q) => !ignorar(q) }); }
// endereço público nas prévias de link (WhatsApp, redes): SITE_URL nas variáveis do projeto, ou o pages.dev
const site = (process.env.SITE_URL || 'https://drysul.pages.dev/').replace(/\/?$/, '/');
const idx = join(saida, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replaceAll('https://giordanbohrer3-cpu.github.io/drysul/', site));
// 404 de verdade (sem ela o Pages devolve a página inicial para qualquer endereço)
writeFileSync(join(saida, '404.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta name="robots" content="noindex"><title>Página não encontrada · Drysul</title><link rel="stylesheet" href="/css/legal.css"></head>' +
  '<body><main class="legal"><h1>Página não encontrada</h1><p><a href="/">Voltar ao site da Drysul</a></p></main></body></html>');
for (const f of ['index.html', '_headers', 'privacidade.html']) if (!existsSync(join(saida, f))) throw new Error('faltou ' + f);
console.log('dist pronto →', site);
