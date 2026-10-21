# Pagamentos online da Drysul: Cloudflare + Mercado Pago

Guia de implantação, configuração do Mercado Pago, mudança para domínio próprio e checklist de segurança.
Situação atual: **pronto para testes**. A produção fica **bloqueada** (`PAGAMENTOS_ATIVOS = "false"`) até a loja autorizar
e o checklist do fim estar completo. Nada aqui ativa cobrança real sozinho.

---

## 1. Arquitetura

```
Navegador ──► Cloudflare (um endereço só: workers.dev agora, domínio da loja depois)
               ├─ Static Assets ── index.html, css/, js/, assets/  (o site, servido direto, sem passar pelo Worker)
               └─ Worker (/api/*) ── worker/src/
                    ├─ D1 (SQLite) ── pedidos, itens_pedido, transacoes, pagamentos, eventos_webhook
                    └─ Mercado Pago ── Orders API (Checkout Pro): criar e consultar orders
Mercado Pago ──► POST /api/webhooks/mercadopago  (notificação assinada; o Worker relê a order no Mercado Pago)
```

O GitHub Pages continua publicando o mesmo site como vitrine. Lá não existe `/api`, então a compra pelo site fica
desativada e tudo vai para o WhatsApp, como antes.

### Fluxo de uma compra

1. O cliente monta a lista e, na central de vendas, escolhe **Pix ou cartão**.
2. O site envia `POST /api/pedidos` só com **produto, quantidade e contato** (+ `Idempotency-Key`).
   O servidor recalcula preço e total com o **mesmo** `js/data.js` e as mesmas regras de `js/checkout-model.js`.
   Se o total mostrado no navegador for diferente, nada é criado (`409 preco_alterado`).
3. `POST /api/pedidos/:id/pagamento` cria a order no Mercado Pago (`X-Idempotency-Key` fixo por tentativa) e devolve o
   `checkout_url` oficial. O cliente paga **no Mercado Pago** (Pix ou cartão). A Drysul não vê dados de cartão.
4. O Mercado Pago volta para `/?pedido=<id>&retorno=...`. **O retorno não confirma nada:** o site só pergunta ao servidor.
5. O Mercado Pago avisa o servidor pelo webhook. O servidor confere a assinatura e **lê a order de novo na API**.
   O pedido só vira `pago` com `status = processed`, valor pago **igual** ao total do pedido, moeda BRL e
   `external_reference` igual ao id do pedido. Valor diferente vira `divergente` (conferência manual), nunca `pago`.
6. Sem webhook (atraso, falha), a tela de acompanhamento pede `GET /api/pedidos/:id?atualizar=1`, e o servidor consulta o Mercado Pago.
7. Pago → `GET /api/pedidos/:id/comprovante` devolve o comprovante com **código de verificação assinado (HMAC)**.

### Endpoints

| Método e caminho | Para quê | Proteção |
|---|---|---|
| `GET /api/status` | O site descobre se o pagamento online está ativo e se é teste | Público. Em teste, lista os **nomes** do que falta configurar; nunca valores |
| `POST /api/pedidos` | Cria o pedido (preço calculado no servidor) | `Idempotency-Key`, mesma origem, JSON, validação de tudo |
| `POST /api/pedidos/:id/pagamento` | Abre o checkout do Mercado Pago | Token do pedido, mesma origem, uma tentativa por vez, até 5 |
| `GET /api/pedidos/:id[?atualizar=1]` | Status do pedido (atualiza no Mercado Pago no máximo a cada 5 s) | Token do pedido |
| `GET /api/pedidos/:id/comprovante` | Comprovante, **só se pago** | Token do pedido |
| `GET /api/comprovantes/verificar?numero=&codigo=` | Confere se um comprovante é válido (sem dados pessoais) | Código de 48 bits |
| `POST /api/webhooks/mercadopago` | Notificações do Mercado Pago | Assinatura `x-signature` (HMAC-SHA256) + releitura na API |

O token do pedido é um HMAC do id com a `CHAVE_PEDIDOS`: não fica no banco e não vai na URL. O site guarda no
`localStorage` do aparelho (30 dias) para acompanhar o pagamento na volta do Mercado Pago. Sem ele, o pedido "não existe" (404).

### Estados do pedido

| Status | Quando |
|---|---|
| `aguardando` | Criado; checkout aberto ou ainda não pago |
| `pendente` | Mercado Pago processando (ex.: Pix gerado e não pago) |
| `pago` | Confirmado na API, valor certo. Só aqui existe comprovante |
| `recusado` / `expirado` / `cancelado` | Sem pagamento; o cliente pode tentar de novo (nova order, nova chave) |
| `divergente` | Pago com valor/moeda diferente: a loja confere no painel do Mercado Pago |
| `reembolsado` | Devolvido depois de pago: o comprovante deixa de valer na verificação |

### Ambientes

| | `local` (computador) | `teste` (workers.dev) | `producao` |
|---|---|---|---|
| Comando | `npx wrangler dev` | `npx wrangler deploy --env teste` | `npx wrangler deploy --env producao` |
| Banco D1 | local (`.wrangler/`) | `drysul-teste` | `drysul-producao` (separado) |
| Credenciais | `.dev.vars` (teste) | segredos do Worker (**teste**) | segredos do Worker (**produção**) |
| Cobra de verdade | não | não | só com `PAGAMENTOS_ATIVOS = "true"` |

Travas no código (`worker/src/config.js` e `pedidos.js`):
- Produção sem `PAGAMENTOS_ATIVOS="true"`, sem `SITE_URL` https, sem segredos ou com token `TEST-` → não cria pedidos.
- **Trava de ambiente:** no teste, uma order que não seja de teste (o id de teste começa com `ORDTST`, como na documentação
  do Mercado Pago) é cancelada na hora e o checkout não é entregue; na produção, o contrário. Se o Mercado Pago mudar esse
  prefixo, a criação falha com mensagem clara (falha segura): ajuste `ordemDeTeste()` em `pedidos.js`.
- `AMBIENTE=local` fora de `localhost` (deploy sem `--env`) fica bloqueado; `MP_API_BASE` só vale no computador.
- O site recusa redirecionar para qualquer checkout que não seja `*.mercadopago.com(.br)`.

---

## 2. Hospedagem gratuita no Cloudflare

O plano gratuito do Workers inclui Static Assets e D1. Pedidos de arquivos estáticos não passam pelo Worker
(`run_worker_first: ["/api/*"]`). Limites atuais: <https://developers.cloudflare.com/workers/platform/pricing/>
e <https://developers.cloudflare.com/d1/platform/pricing/> (confira antes de lançar; mudam com o tempo).

Pré-requisitos: conta gratuita no Cloudflare e Node.js 22 ou mais novo.

```bash
npm install                       # instala o wrangler na versão fixada no package.json
npx wrangler login                # abre o navegador para autorizar a sua conta Cloudflare

# 1) Banco de teste
npx wrangler d1 create drysul-teste
#    copie o "database_id" mostrado para env.teste.d1_databases[0].database_id no wrangler.jsonc
npx wrangler d1 migrations apply DB --env teste --remote

# 2) Publicar o ambiente de teste (site + API)
npx wrangler deploy --env teste
#    → https://drysul-teste.<seu-subdominio>.workers.dev

# 3) Segredos do teste (o terminal pede o valor; ele não aparece na tela nem fica em arquivo)
npx wrangler secret put MP_ACCESS_TOKEN --env teste      # Access Token de TESTE do Mercado Pago
npx wrangler secret put MP_WEBHOOK_SECRET --env teste    # assinatura secreta das notificações (seção 3)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # gera a chave abaixo
npx wrangler secret put CHAVE_PEDIDOS --env teste        # cole a chave gerada (64 caracteres)
```

Confira em `https://drysul-teste.<seu-subdominio>.workers.dev/api/status`: `"pagamentoOnline": true` e `"pendencias": []`.

### No computador

```bash
cp .dev.vars.example .dev.vars    # preencha com credenciais de TESTE (o arquivo está no .gitignore)
npx wrangler d1 migrations apply DB --local
npx wrangler dev                  # http://localhost:8787
```

### Variáveis e segredos

| Nome | Onde | Valor |
|---|---|---|
| `AMBIENTE` | `wrangler.jsonc` (vars) | `local`, `teste` ou `producao` |
| `PAGAMENTOS_ATIVOS` | `wrangler.jsonc` (vars) | `"true"` no teste; `"false"` na produção até a autorização |
| `SITE_URL` | `wrangler.jsonc` (vars) | Endereço público sem barra no fim. Obrigatório na produção; no teste vem da própria requisição |
| `MP_ACCESS_TOKEN` | **segredo** | Access Token do Mercado Pago (teste no teste, produção na produção) |
| `MP_WEBHOOK_SECRET` | **segredo** | Assinatura secreta das notificações |
| `CHAVE_PEDIDOS` | **segredo** | 64 caracteres aleatórios; diferente em cada ambiente |
| `MP_API_BASE` | só `.dev.vars` | Simulador local do Mercado Pago (ignorado fora do computador) |

### Consultar pedidos (a loja ainda não tem painel)

```bash
npx wrangler d1 execute DB --env teste --remote --command \
  "SELECT numero, status, total_centavos/100.0 AS total, cliente_nome, criado_em FROM pedidos ORDER BY criado_em DESC LIMIT 20"
```
No painel do Mercado Pago, a order mostra `Pedido DS-...` na descrição e o id do pedido como referência externa.

---

## 3. Mercado Pago, passo a passo (ambiente de teste)

Documentação oficial: <https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/overview>

1. **Aplicação:** em <https://www.mercadopago.com.br/developers/panel/app>, entre com a conta da loja e crie uma aplicação
   de pagamentos online com **Checkout Pro** (integração pela API de Orders).
2. **Credenciais de teste:** Suas integrações → a aplicação → **Credenciais de teste** → *Access Token*.
   Grave com `npx wrangler secret put MP_ACCESS_TOKEN --env teste`. Nunca cole o token em arquivo, chat ou print.
3. **Notificações (webhook):** Suas integrações → a aplicação → **Webhooks → Configurar notificações**.
   - URL: `https://drysul-teste.<seu-subdominio>.workers.dev/api/webhooks/mercadopago`
   - Evento: **Order (Mercado Pago)**
   - Salve e copie a **assinatura secreta** → `npx wrangler secret put MP_WEBHOOK_SECRET --env teste`.
   - Use URLs diferentes para teste e produção.
4. **Contas e cartões de teste:** crie um comprador de teste em *Contas de teste* e pague com os cartões de teste
   (<https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/integration-test/test-purchase-with-card>).
   O nome do titular decide o resultado (ex.: `APRO` aprovado, `OTHE` recusado, `CONT` pendente; confira a lista na página).
5. **Roteiro de teste no workers.dev:**
   - aprovado → a tela mostra "Pagamento aprovado" e o comprovante com marca d'água de teste;
   - recusado → "Pagamento não aprovado" e "Tentar de novo";
   - pendente (Pix gerado e não pago) → "Pagamento em análise";
   - recarregar a página na volta → mesmo resultado;
   - fechar o Mercado Pago e voltar sem pagar → "Aguardando o pagamento";
   - `GET /api/comprovantes/verificar?numero=DS-...&codigo=...` → `"valido": true`.
6. **Histórico de notificações:** no painel de Webhooks, confira se as entregas recebem `200`. `401` = segredo errado;
   `502` = o servidor não conseguiu consultar o Mercado Pago (ele reenvia depois).

### O que precisa ser confirmado no primeiro teste real
Foi testado com um Mercado Pago **simulado** (mesmo formato da documentação), sem credenciais reais. No primeiro teste
com a conta de teste da loja, confirme:
- se as notificações chegam assinadas e com `200` (formato da assinatura conferido com o SDK oficial `mercadopago@3.6.1`;
  o servidor aceita o `data.id` como chega ou em minúsculas);
- se o id das orders de teste começa com `ORDTST` (trava de ambiente);
- se `expiration_time: "PT1H"` é aceito (se não for, use `"P1D"` em `worker/src/mercadopago.js`);
- se os pagamentos aprovados aparecem com `status` `processed`/`approved` e o método (Pix, crédito, débito) no comprovante.

---

## 4. Produção (só com autorização da loja)

1. Complete o checklist da seção 6.
2. `npx wrangler d1 create drysul-producao` → `database_id` em `env.producao` → `npx wrangler d1 migrations apply DB --env producao --remote`.
3. Segredos de **produção**: `MP_ACCESS_TOKEN` (credenciais de produção), `MP_WEBHOOK_SECRET` (aba de produção dos Webhooks),
   `CHAVE_PEDIDOS` nova — todos com `--env producao`.
4. No `wrangler.jsonc`, em `env.producao.vars`: `SITE_URL` com o endereço público e, por último, `PAGAMENTOS_ATIVOS: "true"`.
   Faça isso num commit próprio, com a autorização registrada.
5. `npx wrangler deploy --env producao` e configure a URL de produção nos Webhooks do Mercado Pago.
6. Compra real de valor baixo, retirada, reembolso pelo painel; confira `reembolsado` no banco.

Para desligar a cobrança a qualquer momento: `PAGAMENTOS_ATIVOS: "false"` e `npx wrangler deploy --env producao`.
Pedidos já pagos continuam sendo confirmados (webhook e status seguem funcionando).

---

## 5. Domínio próprio depois, sem reescrever código

Nada no código depende do endereço: o site chama `api/...` por caminho relativo, e as URLs de retorno saem de `SITE_URL`.

1. Registre o domínio (ex.: `drysul.com.br` no Registro.br).
2. No Cloudflare: **Add a site** (plano gratuito) e troque os servidores DNS no Registro.br pelos que o Cloudflare indicar.
3. Ligue o domínio ao Worker de produção, de um destes jeitos:
   - painel: Workers & Pages → `drysul` → Settings → **Domains & Routes** → *Add* → **Custom domain** → `www.drysul.com.br`
     (e `drysul.com.br`);
   - ou no `wrangler.jsonc`, em `env.producao`:
     `"routes": [{ "pattern": "www.drysul.com.br", "custom_domain": true }, { "pattern": "drysul.com.br", "custom_domain": true }]`.
   O Cloudflare cria o certificado HTTPS sozinho.
4. `SITE_URL: "https://www.drysul.com.br"` em `env.producao.vars` → `npx wrangler deploy --env producao`.
5. Mercado Pago → Webhooks: troque a URL para `https://www.drysul.com.br/api/webhooks/mercadopago`.
6. Redirecione `drysul.com.br` → `www` (Rules → Redirect Rules) e, se quiser, desligue o workers.dev da produção
   (`"workers_dev": false` em `env.producao`).
7. HTTPS sempre: SSL/TLS → Edge Certificates → *Always Use HTTPS* e, depois de tudo funcionando, HSTS.
8. Ajustes de conteúdo já listados no README: `og:url`/`og:image`, tirar o `noindex`, apagar `proposta/`.
9. GitHub Pages: deixe como vitrine ou troque a página por um redirecionamento para o domínio.

---

## 6. Checklist de segurança antes da produção

**Credenciais**
- [ ] Tokens e segredos só por `wrangler secret put --env producao`. Nunca em arquivo, commit, print, e-mail ou chat.
- [ ] `.dev.vars` só com credenciais de **teste** e fora do git (já está no `.gitignore` e no `.assetsignore`).
- [ ] `CHAVE_PEDIDOS` de 64 caracteres aleatórios, diferente no teste e na produção.
- [ ] Contas do Cloudflare, do Mercado Pago e do GitHub com verificação em duas etapas; acesso só de quem precisa.

**Configuração**
- [ ] Banco D1 de produção separado do de teste; migração aplicada.
- [ ] `SITE_URL` em https e correto; URL de produção nos Webhooks com o evento *Order (Mercado Pago)*.
- [ ] `/api/status` na produção responde `pagamentoOnline: true` só depois da autorização.
- [ ] Regra de limite de requisições para `/api/*` (Security → WAF → Rate limiting rules).

**Testes**
- [ ] `npm test` passando (inclui os testes do servidor).
- [ ] Roteiro da seção 3 completo no ambiente de teste com a conta de teste real do Mercado Pago.
- [ ] Compra real de valor baixo + reembolso na produção.

**Negócio e dados pessoais (LGPD)**
- [ ] Preços e itens do `js/data.js` confirmados (as ofertas do Instagram são de 09/09/2026) e limite online (R$ 1.000).
- [ ] O servidor guarda nome, WhatsApp e e-mail de quem compra: aviso de privacidade no site e prazo para apagar dados.
- [ ] Regras de retirada, troca/devolução e nota fiscal combinadas e publicadas.
- [ ] Quem da loja confere pedidos pagos e `divergente` (painel do Mercado Pago + consulta ao D1).

**Limitações conhecidas (não são falhas de segurança)**
- Estoque não é controlado pelo servidor: a loja confirma na retirada.
- Entrega no endereço continua pelo WhatsApp.
- Sem painel administrativo e sem envio de comprovante por e-mail.
- O comprovante fica no aparelho de quem comprou; outro aparelho não abre o pedido (sem o token).

---

## 7. Operação (painel, estoque, migração 0002)

- **Migração nova** `worker/migrations/0002_operacao.sql` (só acrescenta): histórico do pedido, retirada, aceite dos termos,
  estoque com reserva, limites e auditoria. Aplicar: `npx wrangler d1 migrations apply DB --env teste --remote`
  (faça `wrangler d1 export` antes na produção). Desfazer, só com backup e autorização: `worker/migrations-reverter/0002.sql`.
- **Painel `/admin`:** Cloudflare Zero Trust → Access → *Applications* → *Self-hosted*: domínio do site, caminhos `/admin` e
  `/api/admin`; política *Allow* só para os e-mails da equipe; exija login com verificação em duas etapas (ex.: Google com
  2FA). Copie o *Application Audience (AUD) Tag* e o domínio da equipe (`<equipe>.cloudflareaccess.com`) para
  `ACCESS_AUD` e `ACCESS_TEAM_DOMAIN`, e defina `ADMIN_EMAILS` (`"email:dono,email:atendente"`) no `wrangler.jsonc`.
  Sem isso o painel responde "não configurado" (fechado por padrão).
- **Estoque:** só os produtos cadastrados no painel são controlados (reserva na criação do pedido, baixa no pagamento,
  liberação ao expirar/cancelar, devolução opcional no reembolso). Sem cadastro, o item é confirmado na retirada, como antes.
- **Retirada (logística):** `em_preparacao` → `pronto_retirada` → `retirado` (ou `cancelado`), separada do status financeiro.
- **Cancelar/reembolsar:** no painel (papel dono). Reembolso pela API do Mercado Pago com chave fixa por pedido (repetir não duplica).
- **Agendador:** a cada 30 min (`triggers.crons`) libera reservas vencidas, limpa limites e aplica `RETENCAO_DIAS_NAO_PAGOS` se definido.
- **Notificações por e-mail:** não implementadas (dependem de um provedor de e-mail e de conta da loja). O cliente acompanha pelo site e pelo WhatsApp.
- **Rollback de código:** `npx wrangler rollback --env producao` volta à versão anterior do Worker (o banco não volta junto).
