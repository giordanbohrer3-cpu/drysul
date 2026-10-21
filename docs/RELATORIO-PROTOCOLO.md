# Protocolo Master — diagnóstico, implementação e testes (21/10/2026)

**Stack:** HTML/CSS/JS sem build (site) + Cloudflare Workers (`worker/`) + D1 (SQLite) + Mercado Pago Checkout Pro (Orders API).
**Hospedagem:** GitHub Pages (vitrine, sem servidor) e Cloudflare (preparado, **não publicado**). Sem login de clientes (compra
sem conta, com token por pedido). Painel da equipe atrás do Cloudflare Access. Nenhum deploy foi feito nesta etapa.

Legenda: ✅ IMPLEMENTADO · 🟡 PARCIAL · ❌ AUSENTE · ➖ NÃO APLICÁVEL · 🔒 BLOQUEADO POR DEPENDÊNCIA EXTERNA

## Checklist dos 40 itens

| # | Item | Status | Situação real |
|---|---|---|---|
| 1 | Política de privacidade | 🟡 | `privacidade.html` (rascunho): faltam razão social, CNPJ, encarregado, e-mail, prazos |
| 2 | Termos de uso/serviço | 🟡 | `termos.html` (rascunho), aceite com versão e data no pedido; falta prazo de retirada e revisão jurídica |
| 3 | Aviso e gestão de cookies | ✅ | Aviso com aceitar/recusar/alterar; não há cookies próprios de rastreamento; Google só com permissão |
| 4 | Trocas, devoluções, reembolso | 🟡 | `trocas.html` (CDC art. 49/26/18/35) + reembolso no painel; faltam regras comerciais da loja |
| 5 | Formulários adequados à LGPD | ✅ | Só nome, WhatsApp e e-mail opcional; finalidade explicada; aceite explícito |
| 6 | Minimização de dados | ✅ | Sem CPF/endereço (retirada); IP só como resumo; dados mascarados no comprovante |
| 7 | Controle de scripts de rastreamento | ✅ | Nenhum script de terceiros; CSP só permite a própria origem e o iframe do Google |
| 8 | Acessibilidade digital | ✅ | axe WCAG 2.2 AA: 0 violações (24 cenários + checkout + painel + páginas jurídicas + aviso) |
| 9 | Textos alternativos | ✅ | Coberto pelo axe (image-alt) |
| 10 | Contraste | ✅ | Coberto pelo axe (color-contrast), claro e escuro |
| 11 | Navegação por teclado | ✅ | Testes de Tab/foco anteriores + foco visível no painel; sem armadilhas |
| 12 | Autenticidade de avaliações | ➖ | O site não exibe avaliações |
| 13 | Sem publicidade enganosa | 🟡 | Preços vêm do `data.js`; ofertas do Instagram são de 09/09/2026: a loja precisa confirmar validade |
| 14 | Licenciamento de imagens | 🟡 | Créditos no rodapé (CC BY 4.0); fotos da loja e do Instagram da loja; Street View só embutido. Falta termo de uso das fotos |
| 15 | Identificação e contato | 🟡 | Endereço, telefone, Instagram no site; **faltam CNPJ e razão social** (Decreto 7.962, art. 2º) |
| 16 | Conformidade técnica LGPD | 🟡 | Bases legais, retenção configurável, anonimização, auditoria; falta definir prazos e encarregado |
| 17 | Mapa de riscos jurídicos | 🟡 | `docs/CONFORMIDADE.md` lista riscos e pendências; sem parecer jurídico |
| 18 | HTTPS/TLS | ✅ | Cloudflare/GitHub Pages só HTTPS; HSTS no `_headers`; produção exige `SITE_URL` https |
| 19 | SQLi, XSS, CSRF | ✅ | SQL só com parâmetros; CSP + escape de saída; POST exige JSON + mesma origem + token |
| 20 | Autenticação segura e MFA (admin) | 🟡 | Access + JWT verificado no Worker; MFA depende da política configurada no Access 🔒 |
| 21 | Permissões por função | ✅ | Papéis dono/atendente; testes de acesso negado |
| 22 | Proteção de APIs | ✅ | Token HMAC por pedido, 404 sem token, validação de tudo, assinatura no webhook |
| 23 | Rate limiting | ✅ | Por IP (resumo) em pedidos, pagamento, consultas e verificação; teste do 429 |
| 24 | Tokens, senhas e segredos | ✅ | Só *secrets* do Worker; `.dev.vars` fora do git e do site; varredura sem segredos |
| 25 | Security headers | ✅ | CSP (com hash do script do topo), HSTS, X-Frame-Options, nosniff, Referrer, Permissions, COOP; 0 violações de CSP no navegador |
| 26 | Auditoria de dependências | ✅ | Só `wrangler` (dev), versão fixa e lockfile; `npm audit`: 0 vulnerabilidades |
| 27 | OWASP Top 10 / ASVS | 🟡 | Controles principais cobertos e testados; sem auditoria ASVS formal nem pentest |
| 28 | Backups e recuperação testada | 🟡 | Time Travel do D1 + export; restauração testada **localmente** (contagens iguais, integridade ok); remoto 🔒 |
| 29 | Criptografia em trânsito e repouso | ✅ | TLS; D1 cifrado em repouso pela Cloudflare (gerenciado pelo fornecedor) |
| 30 | Isolamento entre usuários | ✅ | Pedido só com o token dele; teste de acesso a pedido alheio = 404 |
| 31 | Logs de auditoria protegidos | ✅ | `auditoria_admin` + `pedido_eventos` só pelo painel (papel dono); logs do Workers sem dados pessoais |
| 32 | Monitoramento | 🟡 | Observability do Workers ligado; falta alerta de disponibilidade externo 🔒 |
| 33 | Plano de recuperação de incidentes | ✅ | `docs/CONFORMIDADE.md` §5 (conter, registrar, avaliar, comunicar ANPD/titulares, corrigir) |
| 34 | Consentimento e revogação | ✅ | Registro com finalidade, versão e data; revogação pelo rodapé |
| 35 | Retenção e exclusão | 🟡 | Rotina automática pronta; **prazo a definir pela loja** (sem prazo, nada é apagado) |
| 36 | Canal para direitos dos titulares | 🟡 | WhatsApp + consulta/anonimização no painel; falta e-mail oficial e prazo de resposta |
| 37 | Revisão de fornecedores | 🟡 | Mapeados (Cloudflare, Mercado Pago, Google, Meta); faltam contratos/DPAs revisados |
| 38 | Plano de resposta a vazamentos | ✅ | Mesmo plano do item 33, com segredos a trocar e travas a desligar |
| 39 | Fluxos comerciais claros | ✅ | Resumo das condições + aceite antes de pagar; status do pedido sempre do servidor |
| 40 | Testes e validação pré-publicação | 🟡 | 89 testes automáticos + navegador; falta teste com a conta real de teste do Mercado Pago 🔒 e revisão humana |

## Prioridades restantes
- **P0 (antes de vender):** preencher CNPJ/razão social/contatos e revisar os 3 textos jurídicos; testar no ambiente de
  teste com credenciais de teste do Mercado Pago; configurar Access com MFA; definir prazos (retirada, retenção, resposta ao titular).
- **P1:** e-mail transacional (provedor + conta) 🔒; monitor de disponibilidade; confirmar preços/ofertas; estoque real cadastrado.
- **P2:** entrega com frete (hoje orçamento pelo WhatsApp, sem cobrança de valor indefinido); área do cliente (hoje token por pedido); cadastro de produtos no painel (hoje `js/data.js` + deploy).
- **P3:** sitemap/canonical/dados estruturados (dependem do domínio definitivo); parcelamento/boleto (configuração do Mercado Pago).

## E-commerce (Fase 6) — situação
| Bloco | Status | Observação |
|---|---|---|
| Catálogo | 🟡 | Busca, filtros, BRL, unidades (rolo, caixa, balde, un.); edição via `data.js`; sem SKU/variação formal |
| Carrinho | ✅ | Persistente na visita, preço sempre recalculado no servidor |
| Checkout | ✅ | Revisão, identificação, retirada, pagamento, resumo + aceite, confirmação e acompanhamento; sem conta |
| Pagamentos | ✅ (teste) | Pix/cartão no Checkout Pro; webhook assinado; idempotência; reembolso; produção travada |
| Pedidos | ✅ | Status financeiro e de retirada separados, histórico, *snapshot* de preços |
| Estoque | ✅ | Opcional por produto: reserva, baixa única, expiração, devolução, concorrência testada |
| Frete | ➖/🔒 | Só retirada online; entrega vira orçamento no WhatsApp (sem cobrança de valor indefinido) |
| Trocas/devoluções | 🟡 | Política (rascunho), reembolso e cancelamento no painel; sem formulário próprio |
| Área do cliente | ➖ | Compra sem conta; acesso ao pedido por token no aparelho |
| Painel | ✅ | Pedidos, detalhe, retirada, cancelar, reembolsar, estoque, titulares, auditoria, resumo com dados reais |
| Comunicação | 🔒 | E-mail transacional depende de provedor |

## Testes executados (resultados reais)
- `npm test`: **89/89** (48 do site + 26 de pagamentos + 15 de operação: aceite, 429, estoque insuficiente, última unidade
  simultânea, baixa única com webhook repetido, Pix expirado, falha no meio da criação, frete indisponível, login/JWT
  inválido/expirado/de outra aplicação, papéis, cancelamento, reembolso idempotente com reposição, titulares, retenção, erros sem detalhes).
- Navegador (wrangler dev + Mercado Pago simulado): 6 fluxos de pagamento ok; aviso de privacidade (registro, revogação,
  Street View só com permissão); **0 violações de CSP**; painel; páginas jurídicas.
- Acessibilidade (axe): 0 violações em todos os cenários testados.
- Regressão: e2e do site ok; build (`wrangler deploy --dry-run`) teste e produção ok; `node --check` em todos os JS; `npm audit` 0.
- Restauração de backup: local, contagens idênticas, integridade e chaves estrangeiras ok.
- **Não executado:** compra no sandbox real do Mercado Pago (sem credenciais), Safari/iPhone real, deploy, testes remotos no D1.
