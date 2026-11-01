# Hospedagem no Cloudflare Pages (drysul.pages.dev)

Migração do GitHub Pages para o Cloudflare Pages, **plano gratuito**, sem mudar o site. O GitHub Pages continua no ar
até a nova hospedagem ser validada (não desligue antes).

## Configuração usada
| Item | Valor |
|---|---|
| Projeto | `drysul` → `https://drysul.pages.dev` (se o nome estiver ocupado, o Cloudflare cria `drysul-xxx.pages.dev`) |
| Branch de produção | `main` |
| Build | `node scripts/build-pages.mjs` (sem dependências; gera `dist/`) |
| Saída | `dist/` — só o site público: sem `worker/`, testes, docs, painel, `package.json`, segredos |
| Publicação | GitHub Actions (`.github/workflows/cloudflare-pages.yml`) com `wrangler pages deploy` |
| Cabeçalhos | `_headers` (CSP, HSTS, X-Frame-Options...) aplicados pelo Pages |
| 404 | `dist/404.html` gerado no build |
| Prévias de link | `og:url`/`og:image` trocados no `dist` para `SITE_URL` (padrão `https://drysul.pages.dev/`) |
| Compra online | **Desativada**: o Pages não tem `/api`, então o checkout só oferece WhatsApp (preços ainda não confirmados) |

Os caminhos do site já são relativos: nada dependia de `/drysul/`, exceto as tags de prévia, trocadas no build.

## Ligar (uma vez, no navegador)
1. Conta gratuita em <https://dash.cloudflare.com> → anote o **Account ID** (página inicial da conta).
2. *My Profile → API Tokens → Create Token → Custom token*: permissão **Account → Cloudflare Pages → Edit**, só na sua conta.
3. No GitHub, repositório `drysul` → *Settings → Secrets and variables → Actions*:
   - *Secrets*: `CLOUDFLARE_API_TOKEN` (o token) e `CLOUDFLARE_ACCOUNT_ID`;
   - *Variables*: `CF_PAGES_ATIVO` = `true` (e, opcional, `SITE_URL` se o endereço final for outro).
4. *Actions → Publicar no Cloudflare Pages → Run workflow*. Depois disso, cada push na `main` publica sozinho.

Alternativa sem token: *Workers & Pages → Create → Pages → Connect to Git* (repositório `drysul`, build
`node scripts/build-pages.mjs`, saída `dist`). Atenção: a raiz tem um `wrangler.jsonc` do servidor de pagamentos;
se o build do Pages reclamar dele, use o caminho do GitHub Actions acima.

## Voltar atrás
*Workers & Pages → drysul → Deployments* → escolher uma publicação anterior → **Rollback**. O GitHub Pages segue como reserva.

## Domínio próprio depois (`drysul.com.br`)
1. Registrar o domínio (Registro.br).
2. Cloudflare → *Add a site* (plano Free) → trocar os servidores DNS no Registro.br pelos indicados pelo Cloudflare.
3. *Workers & Pages → drysul → Custom domains → Set up a domain*: `www.drysul.com.br` e `drysul.com.br`. O Cloudflare
   cria o DNS e o certificado HTTPS sozinho.
4. GitHub → variável `SITE_URL` = `https://www.drysul.com.br/` e publicar de novo (prévias de link).
5. Redirecionar o domínio sem `www` para o `www` (*Rules → Redirect Rules*) e ligar *Always Use HTTPS*.
6. Quando tudo estiver validado: tirar o `noindex` e, se quiser, desligar o GitHub Pages.
(Pagamentos online e painel: ver `docs/PAGAMENTOS.md`, que usa Workers — outro passo, com autorização.)
