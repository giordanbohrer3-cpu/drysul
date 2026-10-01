# Drysul — site

Site da **Drysul — gesso e acabamento** (proposta em demonstração).

**No ar:** https://giordanbohrer3-cpu.github.io/drysul/


Proposta de site para a **Drysul — gesso e acabamento**. HTML, CSS e JavaScript puros, sem build. Única biblioteca: o Lenis (rolagem suave, licença MIT), copiado em `js/vendor/`. A demonstração é publicada pelo GitHub Pages.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Página única: hero, categorias, linha Drysul, catálogo, ofertas, calculadora, como funciona, soluções, inspiração, a Drysul, contato |
| `js/data.js` | **Fonte única de dados**: contato, categorias, produtos, preços e ofertas |
| `js/calculator-model.js` | Coeficientes e validação da calculadora (sem DOM, testável no Node) |
| `js/app.js` | Catálogo, busca, filtros, pedido/orçamento, WhatsApp, calculadora, menu |
| `js/checkout-model.js` | Regras da central de vendas: canal (site x WhatsApp), limite, validações (testável no Node) |
| `js/checkout.js` | Central de vendas: pedido → entrega → pagamento (Pix, crédito, débito, WhatsApp) → confirmação |
| `js/motion.js` | Hero fixo que desmonta a parede em 4 etapas (fita, chapa, parafusos, estrutura), escrita animada dos títulos, rolagem suave no computador (Lenis), canvas técnico, fundos que andam com a rolagem, pausa de efeitos; anima só o que está perto da tela |
| `js/som.js` | Sons sintetizados no navegador (sem arquivos), todos bem baixos: clique, passar o mouse nos botões, papel na rolagem (segue a velocidade), virada de página nas etapas do topo e trilha de cordas lenta ao fundo. Começam no primeiro clique/toque; o botão "Som" liga e desliga tudo |
| `js/vendor/lenis.min.js` | Lenis 1.3.26 (MIT, licença em `js/vendor/LENIS-LICENSE.txt`); só no computador com mouse/trackpad |
| `css/styles.css` | Design system (tokens semânticos com tema claro e escuro, componentes, seções, responsivo) |
| `css/motion.css` | Animações; estados ocultos só existem com efeitos ativos. 3D na rolagem em CSS (`animation-timeline`), com as entradas normais como alternativa em navegadores sem suporte |
| `assets/` | Logo e padrão vetoriais (do arquivo oficial da marca), fotos do manual em WebP, fonte Archivo (OFL) |
| `tests/calculator.test.js` | Casos conferidos com a calculadora de referência |
| `tests/checkout.test.js` | Regras de roteamento e validação da central de vendas |

## Como editar

- **Preço, produto ou oferta:** edite `js/data.js`. `preco: null` mostra "Sob consulta".
- **Foto real de produto:** imagem 4:3 em `assets/img/` e, no produto, `foto` (800 px) e `fotoMini` (400 px). Sem foto, aparece o desenho técnico.
- **Telefone, endereço, Instagram:** objeto `loja` em `js/data.js` (rodapé, contato e WhatsApp leem dali).
- **Limite da compra pelo site:** `vendas.limiteOnline` em `js/data.js` (atual: R$ 1.000).
- **WhatsApp:** as mensagens prontas ficam em `MSG_WHATS` no `js/app.js` (saudação pelo horário + motivo: contato, produto ou busca sem resultado).
- **Busca rápida:** botão no cabeçalho, tecla `/` ou `Ctrl+K`; usa os mesmos dados do catálogo. Os termos sugeridos estão em `POPULARES` no `js/app.js`.
- **Tema claro/escuro:** botão no cabeçalho; a escolha fica salva no navegador e, sem escolha, segue o aparelho. Cores em `:root` e `[data-theme="dark"]` no `css/styles.css`.

## Central de vendas

Pedidos só com itens de preço, sem estimativa da calculadora e até o limite vão para a compra no site
(retirada na loja; Pix, crédito ou débito). Com cálculo de obra, item sob consulta, valor acima do limite
ou entrega no endereço, o pedido segue para o WhatsApp com a mensagem pronta.

Na demonstração nenhum pagamento é processado. Para a versão real:

1. Conta no provedor de pagamento (ex.: Mercado Pago ou PagBank) no CNPJ da loja.
2. Função no servidor (ex.: Cloudflare Workers) que recebe só `{id, qtd}`, recalcula os preços com o catálogo
   dela e cria a cobrança; as chaves secretas ficam só no servidor.
3. Checkout hospedado pelo provedor: o cartão é digitado no ambiente dele, nunca no site da loja.
4. Confirmação por webhook do provedor (assinatura verificada), e não pelo retorno do navegador.

## Testes

```bash
node --test tests/calculator.test.js tests/checkout.test.js
```

## Imagens ilustrativas

Chapas e perfis ainda não têm foto da loja: usam imagens 3D (selo "Imagem ilustrativa"). As chapas levam a textura da foto
["Stapel Gipskartonplatten"](https://commons.wikimedia.org/wiki/File:Stapel_Gipskartonplatten.jpg), de RossKur, licença
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modificada (crédito também no diálogo "Sobre a demo").
Ao receber fotos reais, troque os arquivos `assets/img/prod-<id>-800.webp`/`-400.webp` e remova `ilustrativa: true` em `js/data.js`.

## Pendências para a versão final

- Fotos originais dos produtos e catálogo completo (preços, marcas, medidas)
- Cidade/CEP, horário de atendimento e área de entrega
- Domínio próprio, remover o `noindex` e a barra "Demo", SEO local (Schema.org LocalBusiness)
