# LGPD, segurança e operação — Drysul

Documento operacional. **Não é parecer jurídico:** os textos de `privacidade.html`, `termos.html` e `trocas.html` são
rascunhos técnicos com campos `[A CONFIRMAR PELA LOJA]` e precisam de revisão por responsável jurídico antes de publicar.
Referências: LGPD (Lei 13.709/2018), CDC (Lei 8.078/1990), Decreto 7.962/2013, guias da ANPD (cookies; incidentes).

## 1. Mapa de dados (o que existe hoje)

| Dado | Onde fica | Finalidade | Base legal (art. 7º) | Retenção |
|---|---|---|---|---|
| Nome, WhatsApp, e-mail (opcional) do comprador | D1 `pedidos` | Pedido, pagamento, retirada, comprovante | Execução de contrato (V) | Pagos: prazo fiscal/defesa (art. 16). Não pagos: `RETENCAO_DIAS_NAO_PAGOS` (definir) |
| Itens, valores, status, histórico | D1 `itens_pedido`, `pedido_eventos`, `transacoes`, `pagamentos` | Venda, conciliação, obrigações fiscais | Contrato (V) e obrigação legal (II) | Igual ao pedido; sem dado pessoal após anonimização |
| Aceite dos termos (versão e data) | D1 `pedidos.termos_*` | Prova do aceite (Decreto 7.962, art. 4º) | Contrato (V) | Igual ao pedido |
| Resumo SHA-256 do IP + contador | D1 `limites` | Limitar abuso e força bruta | Legítimo interesse (IX) | Apagado a cada 30 min após a janela |
| E-mail e ações da equipe | D1 `auditoria_admin` | Rastrear ações administrativas | Legítimo interesse (IX) / segurança (art. 46) | Definir (sugestão: enquanto houver pedido relacionado) |
| Escolha de privacidade, tema, lista, token do pedido | `localStorage`/`sessionStorage` do aparelho | Funcionamento | Essencial; mapa do Google por consentimento (I) | No aparelho; o cliente apaga |

Não há cookies de rastreamento, analytics nem publicidade. Dados de cartão nunca passam pela Drysul (Checkout Pro).

## 2. Fornecedores que recebem dados

| Fornecedor | Recebe | Transferência internacional |
|---|---|---|
| Cloudflare (Workers, D1, Access) | Tudo o que o site guarda | Sim (infraestrutura global); avaliar cláusulas contratuais do fornecedor (art. 33) |
| Mercado Pago | Itens, valor, nº do pedido, e-mail (se informado) | Conforme política do Mercado Pago |
| Google (mapa/Street View) | Dados de navegação de quem permite/abre o mapa | Sim |
| Meta/WhatsApp | O que o cliente mesmo envia na conversa | Sim |

## 3. Direitos dos titulares (art. 18)

Canal: WhatsApp da loja (e o e-mail a definir). Prazo de resposta: **definir** (a LGPD fala em 15 dias para a declaração completa, art. 19, II).
No painel (`/admin` → "Pedidos de titulares"), papel **dono**:
- **Consultar:** lista os pedidos e dados ligados ao telefone/e-mail (acesso e confirmação).
- **Anonimizar:** apaga nome, telefone e e-mail dos pedidos **não pagos**; os pagos ficam (obrigação legal/fiscal, art. 16, I) e a resposta informa isso.
- **Correção:** hoje, pela equipe no atendimento (sem tela própria).
Toda consulta e anonimização fica em `auditoria_admin`. Antes de atender, confirme a identidade do titular (ex.: código do comprovante).

## 4. Consentimento (Google)
`js/consentimento.js` registra no aparelho `{versao, data, finalidades}`. "Só o essencial" mantém o mapa desligado
(abre só se a pessoa tocar). O rodapé ("Privacidade e cookies") reabre a escolha para mudar ou revogar.

## 5. Incidente de segurança (vazamento, acesso indevido)

1. **Conter (até 1 h):** trocar segredos (`wrangler secret put` de `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `CHAVE_PEDIDOS`),
   desligar cobrança (`PAGAMENTOS_ATIVOS: "false"` + deploy), revogar acessos no Cloudflare Access, `wrangler rollback` se o código for a causa.
2. **Registrar:** data, o que aconteceu, dados e titulares afetados, causa, medidas (use `auditoria_admin`, `pedido_eventos`, logs do Workers).
3. **Avaliar risco** (dados expostos, quantidade, sensibilidade, possibilidade de dano).
4. **Comunicar** à ANPD e aos titulares quando houver risco ou dano relevante, no prazo da regulamentação vigente da ANPD
   (Resolução CD/ANPD nº 15/2024: 3 dias úteis — confirme a regra em vigor), com o conteúdo do art. 48, §1º.
5. **Corrigir e revisar:** causa raiz, testes, atualização deste documento.

Responsáveis: **definir** (dono da loja = controlador; encarregado/DPO; contato técnico).

## 6. Segurança implementada (resumo)
HTTPS (Cloudflare) e HSTS; CSP e cabeçalhos (`_headers`); consultas SQL só com parâmetros; validação de todas as entradas no
servidor; preço recalculado no servidor; tokens HMAC por pedido; webhook com assinatura HMAC + releitura no provedor;
idempotência em pedido, pagamento, reembolso e baixa de estoque; limite de requisições por IP (resumo do IP); painel atrás do
Cloudflare Access (MFA configurável) com verificação do JWT no Worker, papéis (dono/atendente) e auditoria; erros sem
detalhes internos; segredos só como *secrets*; testes de autorização e acesso indevido.

## 7. Backup e restauração
D1 tem recuperação no tempo (*Time Travel*) automática; confira o prazo do seu plano em
<https://developers.cloudflare.com/d1/reference/time-travel/>. Backup manual antes de qualquer migração:
`npx wrangler d1 export DB --env producao --remote --output backup-AAAA-MM-DD.sql`.
Restauração (num banco novo, nunca por cima do de produção sem autorização):
`npx wrangler d1 create drysul-restauracao` → `npx wrangler d1 execute <banco> --remote --file backup.sql`.
Testado localmente: dump do banco local restaurado em banco vazio com as mesmas contagens e `integrity_check` ok.
