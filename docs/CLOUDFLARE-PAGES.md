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
| Publicação | GitHub Actions (`.github/workflows/cloudflare-pages.yml`): testes → `build-pages.mjs` → `preparar-deploy-pages.mjs` (fora do repositório) → `wrangler pages deploy` |
| Cabeçalhos | `_headers` (CSP, HSTS, X-Frame-Options...) aplicados pelo Pages |
| 404 | `dist/404.html` gerado no build |
| Prévias de link | `og:url`/`og:image` trocados no `dist` para `SITE_URL` (padrão `https://drysul.pages.dev/`) |
| `/api` e `/admin` | Pages Functions (`functions/`), com o mesmo servidor de `worker/src`. Padrão publicado: **produção travada, sem banco** → checkout só com WhatsApp e painel fechado |
| Cache | CSS/JS 1 ano (sempre com `?v=N`), imagens e fontes 7 dias (`_headers`) |

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

## Ligar pagamentos no drysul.pages.dev (quando a loja autorizar)
Tudo fica no mesmo endereço (`https://drysul.pages.dev/api/...`). Nada liga sozinho.
1. **Token**: no Cloudflare, edite o token e acrescente **D1: Editar** (além de Pages: Editar).
2. **Banco**: *Armazenamento e bancos de dados → D1 → Criar* (`drysul-pages`) e copie o **ID**.
3. **GitHub → Variables**: `D1_ID` = o ID; `DRYSUL_AMBIENTE` = `teste` (credenciais de teste) e `PAGAMENTOS_ATIVOS` = `true`.
   A publicação aplica as migrações sozinha.
4. **Segredos no Cloudflare** (*Workers e Pages → drysul → Configurações → Variáveis e segredos*, tipo **Secreto**, ambiente Produção):
   `MP_ACCESS_TOKEN` (de teste), `MP_WEBHOOK_SECRET`, `CHAVE_PEDIDOS` (64 caracteres aleatórios).
5. **Mercado Pago → Webhooks**: URL `https://drysul.pages.dev/api/webhooks/mercadopago`, evento *Order (Mercado Pago)*.
6. Rode a publicação de novo e confira `https://drysul.pages.dev/api/status` (`"pagamentoOnline": true`).
7. Produção real: `DRYSUL_AMBIENTE` = `producao`, credenciais de produção e o checklist de `docs/PAGAMENTOS.md`.

Painel `/admin`: crie uma aplicação no Cloudflare Access (Zero Trust) para `drysul.pages.dev/admin` e `drysul.pages.dev/api/admin`,
e preencha `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ADMIN_EMAILS` nas Variables do GitHub.
Diferença do Worker: o Pages não tem agendador; use **Rodar manutenção** no painel (libera reservas vencidas e aplica a retenção).

## Navegadores
Verificação automática (eslint-plugin-compat e doiuse) contra **Safari/iOS 15+, Firefox 115+, Chrome/Edge 100+, Samsung 16+**:
- JavaScript: só usos já protegidos (`navigator.connection`, `requestIdleCallback` com alternativa).
- CSS: máscaras com prefixo `-webkit-`; `dvh/svh` com reserva em `vh`; `:has()` só em detalhes visuais (Firefox 115–120 ignora);
  rolagem 3D, `overscroll-behavior` e `scrollbar` são melhorias que versões antigas apenas não mostram.
- Safari/iOS real **não** foi testado (o ambiente de testes só tem Chromium). Roteiro rápido num iPhone e num Mac:
  abrir o site → aceitar/recusar o aviso de privacidade → arrastar a vitrine para os lados (a página não pode rolar junto) →
  buscar "chapa" → adicionar um item → abrir o pedido e o botão do WhatsApp → calculadora (parede 4 × 2,8 m) → tema escuro →
  rolar até o rodapé e voltar ao topo (a parede 3D se monta de novo).
