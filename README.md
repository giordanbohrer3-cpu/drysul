# Drysul — site

**No ar:** https://giordanbohrer3-cpu.github.io/drysul/

Site da **Drysul — gesso e acabamento**. HTML, CSS e JavaScript puros, sem build. Única biblioteca: o Lenis (rolagem suave, licença MIT), copiado em `js/vendor/`. Publicado pelo GitHub Pages até a mudança para o domínio da loja.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Página única, na ordem da compra: topo com busca, catálogo, calculadora, ofertas, como funciona, soluções, inspiração, a Drysul, contato |
| `js/data.js` | **Fonte única de dados**: contato, categorias, produtos, preços e ofertas |
| `js/calculator-model.js` | Coeficientes, validação, embalagens de compra e orçamento da calculadora, e o atalho `entender()` que lê "parede de 4 × 2,8 m com madeira" (sem DOM, testável no Node) |
| `js/busca.js` | Regras da busca (sem DOM, testável no Node): sem acento, plural, sinônimos de balcão, erro de digitação, relevância e o filtro do catálogo, que nunca devolve a grade vazia havendo produtos |
| `js/app.js` | Catálogo, filtros, busca rápida, pedido/lista e barra do pedido, WhatsApp, calculadora e atalho "descreva a obra", menu |
| `js/checkout-model.js` | Regras da central de vendas: canal (site x WhatsApp), limite, validações (testável no Node) |
| `js/checkout.js` | Central de vendas: pedido → entrega → pagamento (Pix, crédito, débito, WhatsApp) → confirmação |
| `js/motion.js` | Parede 3D do topo: se monta ao abrir e desmonta com a rolagem em 4 etapas (fita, chapas, parafusos, estrutura), sem prender a página; escrita animada dos títulos, rolagem suave no computador (Lenis), canvas técnico, fundos que andam com a rolagem, pausa de efeitos; anima só o que está perto da tela. **Celular e tablet (toque):** sem 3D ligado à rolagem, sem paralaxe, sem cortina nas fotos, títulos inteiros e cabeçalho sem desfoque: as fotos ficam paradas e nítidas e a rolagem fica leve. Nada lê a posição da rolagem em JavaScript durante a rolagem (barra de progresso em CSS, cabeçalho compacto por IntersectionObserver) |
| `js/som.js` | Sons sintetizados no navegador (sem arquivos): clique, passar o mouse nos botões, sopro de ar na rolagem (segue a velocidade), swoosh nas etapas da parede do topo e trilha de piano generativa (8 frases em ciclos de tamanhos diferentes, à la *Music for Airports*: contínua e sem repetição). Começam no primeiro clique/toque; o ícone de som no canto direito do cabeçalho liga e desliga, e com o som ligado mostra o volume (salvo no aparelho) |
| `js/vendor/lenis.min.js` | Lenis 1.3.26 (MIT, licença em `js/vendor/LENIS-LICENSE.txt`); só no computador com mouse/trackpad |
| `css/styles.css` | Design system: tokens de cor (claro e escuro), escala de tipografia (`--fs-*`), de espaçamento (`--s-*`, `--sec-pad`) e de altura de botão (`--bh-*`); componentes, seções, responsivo, alvos de 44 px no toque |
| `css/motion.css` | Animações; estados ocultos só existem com efeitos ativos. 3D na rolagem em CSS (`animation-timeline`), com as entradas normais como alternativa em navegadores sem suporte |
| `assets/` | Logo e padrão vetoriais (do arquivo oficial da marca), fotos do manual em WebP, fonte Archivo (OFL) |
| `tests/calculator.test.js` | Casos conferidos com a calculadora de referência |
| `tests/busca.test.js` | Busca com o catálogo real: cada produto acha a si mesmo, plural, sinônimos, erro de digitação, medidas e categoria sem resultado |
| `tests/checkout.test.js` | Regras de roteamento e validação da central de vendas |

## Como editar

- **Preço, produto ou oferta:** edite `js/data.js`. `preco: null` mostra "Sob consulta".
- **Foto real de produto:** imagem 4:3 em `assets/img/` e, no produto, `foto` (800 px) e `fotoMini` (400 px). Sem foto, aparece o desenho técnico.
- **Telefone, endereço, Instagram:** objeto `loja` em `js/data.js` (rodapé, contato e WhatsApp leem dali).
- **Jornada curta:** a pessoa descreve a obra no topo, na calculadora ou na busca ("parede de drywall 4 × 2,8 m com ripado") →
  o site escolhe o sistema, preenche as medidas e calcula → "Adicionar à lista" põe todos os materiais na lista, com quantidade
  editável (somando com o que já estava) → "Ver lista e pedir orçamento" ou "Enviar pelo WhatsApp" direto do resultado.
  As medidas e o acabamento vão juntos na mensagem ("Calculado no site"). Todos os materiais que a calculadora usa (cola, lã,
  arame, regulador…) também estão no catálogo e na busca. No celular, a barra "Ver pedido" com o total fica no pé da tela.
- **Busca:** `SINONIMOS` e palavras ignoradas (`PARADAS`) no `js/busca.js` (gesso → chapa/drywall, placa → chapa, bucha → ancorador/parabolt…).
  Ordem: todos os termos batem → erro de digitação corrigido ("parafusso" → parafuso) → os que batem parte dos termos → mais procurados,
  com aviso e botão do WhatsApp. Com uma categoria escolhida e nada nela, a busca vale para todas ("massa" em Chapas mostra a massa).
- **Textos de exemplo dos campos:** `placeholder` (longo) e `data-ph-curto` (curto) no `index.html`; o site usa o longo quando cabe no campo.
- **Preços da calculadora:** cada material vira embalagem de compra (`COMPRA` no `js/calculator-model.js`) e usa o preço do produto da loja em `js/data.js`; sem preço da loja, usa a tabela `precosMedios` (médias de mercado de 03/10/2026, marcadas com “≈ média”). Para usar o preço da Drysul, preencha `preco` no produto. A mensagem do WhatsApp leva só os itens, sem preços da estimativa.
- **Limite da compra pelo site:** `vendas.limiteOnline` em `js/data.js` (atual: R$ 1.000).
- **WhatsApp:** as mensagens prontas ficam em `MSG_WHATS` no `js/app.js` (saudação pelo horário + motivo: contato, produto ou busca sem resultado).
- **Busca rápida:** botão no cabeçalho, tecla `/` ou `Ctrl+K`; usa os mesmos dados do catálogo. Os termos sugeridos estão em `POPULARES` no `js/app.js`.
- **Tema claro/escuro:** botão no cabeçalho; a escolha fica salva no navegador e, sem escolha, segue o aparelho. Cores em `:root` e `[data-theme="dark"]` no `css/styles.css`.

## Central de vendas

Pedidos só com itens de preço, sem quantidades vindas da calculadora e até o limite vão para a compra no site
(retirada na loja; Pix, crédito ou débito). Com cálculo de obra, item sob consulta, valor acima do limite
ou entrega no endereço, o pedido segue para o WhatsApp com a mensagem pronta.

Enquanto `vendas.demo` (em `js/data.js`) for `true`, a central está em **modo de teste**: nenhum pagamento é processado,
o cliente vê o aviso "Pagamento online em fase de testes" e o comprovante leva marca d'água. Para ligar a cobrança real:

1. Conta no provedor de pagamento (ex.: Mercado Pago ou PagBank) no CNPJ da loja.
2. Função no servidor (ex.: Cloudflare Workers) que recebe só `{id, qtd}`, recalcula os preços com o catálogo
   dela e cria a cobrança; as chaves secretas ficam só no servidor.
3. Checkout hospedado pelo provedor: o cartão é digitado no ambiente dele, nunca no site da loja.
4. Confirmação por webhook do provedor (assinatura verificada), e não pelo retorno do navegador.

## Testes

```bash
node --test tests/calculator.test.js tests/busca.test.js tests/checkout.test.js
```

## Imagens ilustrativas

Chapas e perfis ainda não têm foto da loja: usam imagens 3D (selo "Imagem ilustrativa"). As chapas levam a textura da foto
["Stapel Gipskartonplatten"](https://commons.wikimedia.org/wiki/File:Stapel_Gipskartonplatten.jpg), de RossKur, licença
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modificada (crédito também em "Créditos das imagens", no rodapé).
Ao receber fotos reais, troque os arquivos `assets/img/prod-<id>-800.webp`/`-400.webp` e remova `ilustrativa: true` em `js/data.js`.

## Pendências para a versão final

- Fotos originais dos produtos e catálogo completo (preços, marcas, medidas)
- Cidade/CEP e área de entrega (horário já no site: seg. a sex. 8h–18h, sáb. 8h–12h)
- Pagamento online real (acima) e `vendas.demo: false`
- Domínio próprio: remover o `noindex`, trocar `og:url`/`og:image`, "© 2026" → "© 2026 Drysul", apagar `proposta/`, SEO local (Schema.org LocalBusiness)
