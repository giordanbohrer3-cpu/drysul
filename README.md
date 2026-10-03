# Drysul — site

Site da **Drysul — gesso e acabamento**.

**No ar:** https://giordanbohrer3-cpu.github.io/drysul/


Site da **Drysul — gesso e acabamento**. HTML, CSS e JavaScript puros, sem build. Única biblioteca: o Lenis (rolagem suave, licença MIT), copiado em `js/vendor/`. Publicado pelo GitHub Pages até a mudança para o domínio da loja.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Página única: hero, categorias, linha Drysul, catálogo, ofertas, calculadora, simulador, como funciona, soluções, inspiração, a Drysul, contato |
| `js/data.js` | **Fonte única de dados**: contato, categorias, produtos, preços e ofertas |
| `js/calculator-model.js` | Coeficientes, validação, embalagens de compra e orçamento da calculadora, e o atalho `entender()` que lê "parede de 4 × 2,8 m com madeira" (sem DOM, testável no Node) |
| `js/app.js` | Catálogo, busca (sinônimos de balcão, plural, relevância), filtros, pedido/lista, WhatsApp, calculadora e atalho "descreva a obra", menu |
| `js/checkout-model.js` | Regras da central de vendas: canal (site x WhatsApp), limite, validações (testável no Node) |
| `js/checkout.js` | Central de vendas: pedido → entrega → pagamento (Pix, crédito, débito, WhatsApp) → confirmação |
| `js/motion.js` | Hero fixo que desmonta a parede em 4 etapas (fita, chapa, parafusos, estrutura), escrita animada dos títulos, rolagem suave no computador (Lenis), canvas técnico, fundos que andam com a rolagem, pausa de efeitos; anima só o que está perto da tela |
| `js/simulador.js` | Simulador de acabamento em passos guiados (foto → cantos → proteger → Simular → resultado): perspectiva pelos 4 cantos, pincel para proteger objetos (verde = fica igual, laranja = muda) e 6 acabamentos gerados no próprio navegador (WebGL 2). Carregado só quando a seção se aproxima; a foto não sai do aparelho. A demonstração animada dos 4 passos fica no `app.js` (`iniciarTutorial`) |
| `js/som.js` | Sons sintetizados no navegador (sem arquivos): clique, passar o mouse nos botões, sopro de ar na rolagem (segue a velocidade), swoosh nas etapas do topo e trilha de piano generativa (8 frases em ciclos de tamanhos diferentes, à la *Music for Airports*: contínua e sem repetição). Começam no primeiro clique/toque; o ícone de som no canto direito do cabeçalho liga e desliga, e com o som ligado mostra o volume (salvo no aparelho) |
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
- **Jornada curta:** a pessoa descreve a obra no topo, na calculadora ou na busca ("parede de drywall 4 × 2,8 m com ripado") →
  o site escolhe o sistema, preenche as medidas e calcula → "Adicionar à lista" põe todos os materiais na lista, com quantidade
  editável (somando com o que já estava) → "Ver lista e pedir orçamento" ou "Enviar pelo WhatsApp" direto do resultado.
  As medidas e o acabamento vão juntos na mensagem ("Calculado no site"). Materiais que só a calculadora usa (cola, lã, arame,
  regulador…) estão em `js/data.js` com `catalogo: false`: entram na lista, mas não no catálogo nem na busca.
- **Sinônimos da busca:** `SINONIMOS` no `js/app.js` (gesso → chapa/drywall, placa → chapa, bucha → ancorador/parabolt…).
- **Preços da calculadora:** cada material vira embalagem de compra (`COMPRA` no `js/calculator-model.js`) e usa o preço do produto da loja em `js/data.js`; sem preço da loja, usa a tabela `precosMedios` (médias de mercado de 03/10/2026, marcadas com “≈ média”). Para usar o preço da Drysul, preencha `preco` no produto. A mensagem do WhatsApp leva só os itens, sem preços da estimativa.
- **Simulador:** acabamentos, cores e tons em `ACABS` no `js/simulador.js`; a foto de exemplo e as áreas protegidas dela em `EXEMPLO`.
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
node --test tests/calculator.test.js tests/checkout.test.js
```

## Simulador de acabamento

Tudo roda no navegador do cliente, sem servidor nem serviço de IA: os 4 cantos definem a perspectiva, o acabamento é
gerado em metros reais e aplicado com mipmaps, e a luz da foto (luminância bem desfocada, ignorando as áreas protegidas)
multiplica o acabamento. Precisa de WebGL 2 (navegadores atuais); sem ele, o simulador avisa e o resto do site segue normal.
Foto de exemplo: [“Unverputzte Ziegelwand in Wohnraum”](https://commons.wikimedia.org/wiki/File:Unverputzte_Ziegelwand_in_Wohnraum_im_Erdgescho%C3%9F,_Carrer_de_l%27Arquebisbe_Company,_75,_46011_Val%C3%A8ncia,_Valencia,_Spain.jpg),
de Kai Kemmann, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); `sim-depois-960.webp` é uma modificação feita pelo simulador, sob a mesma licença.

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
