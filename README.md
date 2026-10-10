# Drysul — site

**No ar:** https://giordanbohrer3-cpu.github.io/drysul/

Site da **Drysul — gesso e acabamento**. HTML, CSS e JavaScript puros, sem build. Única biblioteca: o Lenis (rolagem suave, licença MIT), copiado em `js/vendor/`. Publicado pelo GitHub Pages até a mudança para o domínio da loja.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Página única: faixa de informações, faixa laranja do topo, abertura "Quem somos" (em teste), topo com busca, catálogo, calculadora, ofertas, como funciona, soluções, inspiração, a Drysul, contato |
| `js/data.js` | **Fonte única de dados**: contato, cidade, horário, links do mapa e da fachada, categorias, produtos, preços, ofertas e as dúvidas da central de ajuda |
| `js/horario.js` | "Aberto agora · fecha às 18h" / "Fechado agora · abre amanhã às 8h", no fuso da loja (America/Sao_Paulo), a partir de `loja.horario` (sem DOM, testável no Node) |
| `js/abertura.js` | Status da loja na faixa e na abertura (refeito a cada minuto); faixa de informações (no celular troca uma por vez, pausa com o dedo/foco/botão, vira fileira sem efeitos); "Fale conosco" do botão do WhatsApp quando a pessoa começa a rolar; cartão da loja: fachada no Street View do Google (entra sozinha depois da carga, travada sob um véu para não prender a rolagem) e mapa sob pedido |
| `js/ajuda.js` | Central de ajuda (botão "Ajuda" no cabeçalho e "Preciso de ajuda" no menu): contato em destaque, busca nas dúvidas (sem acento, plural e palavras parecidas; a busca é testável no Node) e respostas por tema; sem resposta, a pergunta vai pronta para o WhatsApp. Balão de boas-vindas ("Só quero dar uma olhadinha") uma vez a cada 30 dias |
| `js/calculator-model.js` | Coeficientes, validação, embalagens de compra e orçamento da calculadora, e o atalho `entender()` que lê "parede de 4 × 2,8 m com madeira" (sem DOM, testável no Node) |
| `js/busca.js` | Regras da busca (sem DOM, testável no Node): sem acento, plural, sinônimos de balcão, erro de digitação, relevância e o filtro do catálogo, que nunca devolve a grade vazia havendo produtos |
| `js/app.js` | Catálogo, filtros, busca rápida, pedido/lista e barra do pedido, WhatsApp, calculadora e atalho "descreva a obra", menu |
| `js/checkout-model.js` | Regras da central de vendas: canal (site x WhatsApp), limite, validações (testável no Node) |
| `js/checkout.js` | Central de vendas: pedido → entrega → pagamento (Pix, crédito, débito, WhatsApp) → confirmação |
| `js/vitrine.js` | Vitrine 3D logo abaixo da parede do topo: um anel com os produtos, preços e ofertas do `data.js` girando devagar (só o anel anima, no compositor). Mouse em cima desacelera até parar; arrastar ou deslizar gira com inércia; clicar leva ao produto no catálogo; Tab entra num cartão e as setas passam de um a outro (o focado vem para a frente); botão de pausa. Sem efeitos, vira uma faixa plana com rolagem lateral |
| `js/motion.js` | Parede 3D do topo: se monta ao abrir e desmonta com a rolagem em 4 etapas (fita, chapas, parafusos, estrutura), sem prender a página; escrita animada dos títulos, rolagem suave no computador (Lenis), canvas técnico, fundos que andam com a rolagem, pausa de efeitos; anima só o que está perto da tela. **Celular e tablet (toque):** sem 3D ligado à rolagem, sem paralaxe, sem cortina nas fotos, títulos inteiros e cabeçalho sem desfoque: as fotos ficam paradas e nítidas e a rolagem fica leve. Nada lê a posição da rolagem em JavaScript durante a rolagem (barra de progresso em CSS, cabeçalho compacto por IntersectionObserver) |
| `js/som.js` | Sons de interface sintetizados no navegador (sem arquivos), bem baixos, no espírito dos toques do iPhone: "tic" no clique, clique de chave ao alternar (tema, filtros, abas), duas notas de vidro ao adicionar ao pedido, ar quase imperceptível na rolagem e um swoosh baixinho nas etapas da parede. Sem música e sem botão próprio: seguem o "Pausar efeitos e sons" do rodapé; com "menos movimento" no aparelho, já começam desligados. O áudio só nasce no primeiro toque |
| `js/vendor/lenis.min.js` | Lenis 1.3.26 (MIT, licença em `js/vendor/LENIS-LICENSE.txt`); só no computador com mouse/trackpad |
| `css/styles.css` | Design system: tokens de cor (claro e escuro), escala de tipografia (`--fs-*`), de espaçamento (`--s-*`, `--sec-pad`) e de altura de botão (`--bh-*`); componentes, seções, responsivo, alvos de 44 px no toque |
| `css/motion.css` | Animações; estados ocultos só existem com efeitos ativos. 3D na rolagem em CSS (`animation-timeline`), com as entradas normais como alternativa em navegadores sem suporte |
| `assets/` | Logo e padrão vetoriais (do arquivo oficial da marca), fotos do manual em WebP, fonte Archivo (OFL) |
| `tests/calculator.test.js` | Casos conferidos com a calculadora de referência |
| `tests/busca.test.js` | Busca com o catálogo real: cada produto acha a si mesmo, plural, sinônimos, erro de digitação, medidas e categoria sem resultado |
| `tests/checkout.test.js` | Regras de roteamento e validação da central de vendas |
| `tests/horario.test.js` | Aberto/fechado, "fecha em X min", próximo dia de abertura e fuso da loja |
| `tests/ajuda.test.js` | Dúvidas bem formadas e a busca da ajuda com perguntas do jeito que as pessoas escrevem |

## Como editar

- **Preço, produto ou oferta:** edite `js/data.js`. `preco: null` mostra "Sob consulta".
- **Foto real de produto:** imagem 4:3 em `assets/img/` e, no produto, `foto` (800 px) e `fotoMini` (400 px). Sem foto, aparece o desenho técnico.
- **Telefone, endereço, Instagram:** objeto `loja` em `js/data.js` (rodapé, contato e WhatsApp leem dali).
- **Jornada curta:** a pessoa descreve a obra no topo, na calculadora ou na busca ("parede de drywall 4 × 2,8 m com ripado") →
  o site escolhe o sistema, preenche as medidas e calcula → "Adicionar à lista" põe todos os materiais na lista, com quantidade
  editável (somando com o que já estava) → "Ver lista e pedir orçamento" ou "Enviar pelo WhatsApp" direto do resultado.
  As medidas e o acabamento vão juntos na mensagem ("Calculado no site"). Todos os materiais que a calculadora usa (cola, lã,
  arame, regulador…) também estão no catálogo e na busca. No celular, a barra "Ver pedido" com o total fica no pé da tela.
- **Vitrine 3D:** mostra todos os produtos do `data.js`, com ofertas e linha Drysul primeiro (ordem em `peso()` no `js/vitrine.js`). Preço e selo ("Oferta", "Linha Drysul") vêm do próprio produto: mudou no `data.js`, muda na vitrine. Velocidade: `DUR` (3,6 s por cartão).
- **Busca:** `SINONIMOS` e palavras ignoradas (`PARADAS`) no `js/busca.js` (gesso → chapa/drywall, placa → chapa, bucha → ancorador/parabolt…).
  Ordem: todos os termos batem → erro de digitação corrigido ("parafusso" → parafuso) → os que batem parte dos termos → mais procurados,
  com aviso e botão do WhatsApp. Com uma categoria escolhida e nada nela, a busca vale para todas ("massa" em Chapas mostra a massa).
- **Textos de exemplo dos campos:** `placeholder` (longo) e `data-ph-curto` (curto) no `index.html`; o site usa o longo quando cabe no campo.
- **Preços da calculadora:** cada material vira embalagem de compra (`COMPRA` no `js/calculator-model.js`) e usa o preço do produto da loja em `js/data.js`; sem preço da loja, usa a tabela `precosMedios` (médias de mercado de 03/10/2026, marcadas com “≈ média”). Para usar o preço da Drysul, preencha `preco` no produto. A mensagem do WhatsApp leva só os itens, sem preços da estimativa.
- **Limite da compra pelo site:** `vendas.limiteOnline` em `js/data.js` (atual: R$ 1.000).
- **WhatsApp:** as mensagens prontas ficam em `MSG_WHATS` no `js/app.js` (saudação pelo horário + motivo: contato, produto ou busca sem resultado).
- **Busca rápida:** botão no cabeçalho, tecla `/` ou `Ctrl+K`; usa os mesmos dados do catálogo. Os termos sugeridos estão em `POPULARES` no `js/app.js`.
- **Tema claro/escuro:** botão no cabeçalho; a escolha fica salva no navegador e, sem escolha, segue o aparelho. Cores em `:root` e `[data-theme="dark"]` no `css/styles.css`. As partes escuras (cabeçalho, topo, seções azuis, rodapé) usam `--escuro-1`, `--escuro-2`, `--escuro-3`: no tema claro elas ficam um tom mais claras, para a troca de tema aparecer já no topo.
- **WhatsApp flutuante:** botão `.zap` no canto inferior direito, a página toda, com a mensagem de contato de `MSG_WHATS`. No celular ele sobe acima da barra "Ver pedido" e das ações da calculadora. O rótulo "Fale conosco" aparece sozinho uma vez quando a pessoa começa a rolar (e no computador ao passar o mouse).
- **Horário da loja:** `loja.horario` em `js/data.js` (0 = domingo). O "Aberto agora" da faixa e da abertura sai daí; os textos fixos do horário estão na abertura (`.abertura__horas`) e no contato. Feriados não entram.
- **Faixa de informações (topo):** os quatro itens estão no `index.html` (`.topbar__item`). O primeiro é o status da loja; os outros são links. Mais de quatro não cabem lado a lado no computador.
- **Abertura "Quem somos" (em teste):** `<section class="abertura">` no início do `<main>`. Para voltar ao formato anterior, basta mover a seção para depois do hero (ou perto do contato). A foto aparece só no computador; no celular ela deixava a rolagem dos primeiros segundos travada, e o cartão do mapa ocupa o lugar. Ao trocar pela foto da fachada, use a mesma `<picture>` e meça a rolagem de novo no celular.
- **Foto de exemplo na calculadora:** `fotosSistemas` em `js/data.js` (foto, legenda e enquadramento de cada sistema; hoje fotos da loja, marcadas "Foto ilustrativa"). No computador, passar o mouse (ou focar pelo teclado) numa aba mostra um cartão com a foto, que desliza entre as abas, com luz quente indireta que acompanha o mouse. No celular e no tablet, tocar na aba mostra a foto no topo do formulário, antes de calcular. As fotos só são baixadas na primeira aproximação do mouse ou no toque.
- **Mapa:** `loja.mapaEmbed` (consulta pelo endereço completo; pelo nome, "Drysul Ijuí" no Google Maps cai em outra empresa até a loja ter o Perfil da Empresa no Google). O mapa só carrega quando a pessoa toca em "Mapa".
- **Fachada no cartão da loja:** `loja.fachadaEmbed` (Street View do Google embutido, pelas coordenadas de `loja.coordenadas`, olhando a 175°). O Google permite embutir o Street View; **print da imagem do Street View não é permitido**, por isso a foto não é um arquivo do site. Ela entra sozinha depois da carga, perto da tela, com a rolagem parada e sem "economia de dados"; chega sob um véu ("Toque para girar 360°") para o dedo continuar rolando a página. Quando a loja mandar a foto da fachada dela, ponha o arquivo em `assets/img/` e o caminho em `loja.fotoFachada`: a foto vira a capa e o Street View passa a abrir só a pedido.
- **Faixa laranja do topo:** `.marquee--topo` no início do `<main>`, a mesma faixa de mais abaixo correndo no sentido contrário. As palavras ficam nas duas trilhas (4 cópias cada, para não abrir buraco em telas largas).
- **Central de ajuda:** as dúvidas ficam em `ajuda` no `js/data.js` (tema, pergunta, resposta, palavras extras para a busca e um botão opcional). Só entra o que a loja confirma; frete e pagamento mandam para o WhatsApp. O horário da resposta é escrito à mão: mudou o `loja.horario`, mude ali também. Essa lista também é a base para um futuro assistente.
- **Balão de boas-vindas:** criado pelo `js/ajuda.js` 7 s depois da carga, só se a lista estiver vazia e nada estiver aberto; aparece uma vez a cada 30 dias (`localStorage`, chave `drysul-boas-vindas`). Para tirar, apague o bloco "balão de boas-vindas" do arquivo.
- **Desempenho no celular:** o topo (`.hero`) e o catálogo ficam em camadas próprias no celular e no tablet (`will-change` no `css/styles.css`). Sem isso, mudar o tamanho de algo no topo podia fazer o navegador fundir a vitrine com o catálogo numa camada de ~7.000 px recalculada a cada quadro (medido: 3× mais quadros lentos). Ao mexer no topo, meça a rolagem de novo.

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
node --test tests/calculator.test.js tests/busca.test.js tests/checkout.test.js tests/horario.test.js tests/ajuda.test.js
```

## Imagens ilustrativas

Chapas e perfis ainda não têm foto da loja: usam imagens 3D (selo "Imagem ilustrativa"). As chapas levam a textura da foto
["Stapel Gipskartonplatten"](https://commons.wikimedia.org/wiki/File:Stapel_Gipskartonplatten.jpg), de RossKur, licença
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modificada (crédito também em "Créditos das imagens", no rodapé).
Ao receber fotos reais, troque os arquivos `assets/img/prod-<id>-800.webp`/`-400.webp` e remova `ilustrativa: true` em `js/data.js`.

## Pendências para a versão final

- Fotos originais dos produtos e catálogo completo (preços, marcas, medidas)
- Área e taxa de entrega (cidade já no site: Ijuí/RS; horário: seg. a sex. 8h–18h, sáb. 8h–12h — confirmar com a loja, e feriados)
- Abertura "Quem somos": foto da fachada tirada pela loja (o Street View fica até ela chegar; print do Google não pode) e a história real (ano, quem fundou); hoje o texto é genérico e a foto é a da marca
- Central de ajuda: a loja confirmar as respostas (retirada, horário, feriados) e completar entrega, frete e pagamento
- Perfil da Empresa no Google para a Drysul (pelo nome, a busca no Maps cai em outra empresa)
- Pagamento online real (acima) e `vendas.demo: false`
- Domínio próprio: remover o `noindex`, trocar `og:url`/`og:image`, "© 2026" → "© 2026 Drysul", apagar `proposta/`, SEO local (Schema.org LocalBusiness)
