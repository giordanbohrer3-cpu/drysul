# Drysul — site

Site da **Drysul — gesso e acabamento** (proposta em demonstração).

**No ar:** https://giordanbohrer3-cpu.github.io/drysul/


Proposta de site para a **Drysul — gesso e acabamento**. HTML, CSS e JavaScript puros: sem build e sem dependências. A demonstração é publicada pelo GitHub Pages.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Página única: hero, categorias, linha Drysul, catálogo, ofertas, calculadora, como funciona, soluções, inspiração, a Drysul, contato |
| `js/data.js` | **Fonte única de dados**: contato, categorias, produtos, preços e ofertas |
| `js/calculator-model.js` | Coeficientes e validação da calculadora (sem DOM, testável no Node) |
| `js/app.js` | Catálogo, busca, filtros, pedido/orçamento, WhatsApp, calculadora, menu |
| `js/checkout-model.js` | Regras da central de vendas: canal (site x WhatsApp), limite, validações (testável no Node) |
| `js/checkout.js` | Central de vendas: pedido → entrega → pagamento (Pix, crédito, débito, WhatsApp) → confirmação |
| `js/motion.js` | Canvas técnico, entradas ao rolar, parallax, camadas do hero, ponteiro, pausa de efeitos |
| `css/styles.css` | Design system (tokens, componentes, seções, responsivo) |
| `css/motion.css` | Animações; estados ocultos só existem com efeitos ativos |
| `assets/` | Logo e padrão vetoriais (do arquivo oficial da marca), fotos do manual em WebP, fonte Archivo (OFL) |
| `tests/calculator.test.js` | Casos conferidos com a calculadora de referência |
| `tests/checkout.test.js` | Regras de roteamento e validação da central de vendas |

## Como editar

- **Preço, produto ou oferta:** edite `js/data.js`. `preco: null` mostra "Sob consulta".
- **Foto real de produto:** imagem 4:3 em `assets/img/` e, no produto, `foto` (800 px) e `fotoMini` (400 px). Sem foto, aparece o desenho técnico.
- **Telefone, endereço, Instagram:** objeto `loja` em `js/data.js` (rodapé, contato e WhatsApp leem dali).
- **Limite da compra pelo site:** `vendas.limiteOnline` em `js/data.js` (atual: R$ 1.000).

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

## Pendências para a versão final

- Fotos originais dos produtos e catálogo completo (preços, marcas, medidas)
- Cidade/CEP, horário de atendimento e área de entrega
- Domínio próprio, remover o `noindex` e a barra "Demo", SEO local (Schema.org LocalBusiness)
