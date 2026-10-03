/* Drysul — dados da loja, categorias, produtos e ofertas.
   Fonte única: contato, preços e ofertas são lidos daqui por toda a página.
   Preço null = "sob consulta". Foto real: `foto` (800 px, 4:3) e `fotoMini` (400 px); sem foto, aparece o desenho técnico.
   `ilustrativa: true` marca imagens que não são do produto da loja (aparece o selo "Imagem ilustrativa"). */
(function (root) {
  'use strict';

  var loja = {
    nome: 'Drysul',
    assinatura: 'gesso e acabamento',
    endereco: 'Rua Albino Brendler, 596',
    bairro: 'Bairro Assis Brasil',
    telefone: '(55) 99201-0668',
    whatsapp: '5555992010668',
    instagram: '@drysul.loja',
    instagramUrl: 'https://www.instagram.com/drysul.loja/'
  };
  loja.telUrl = 'tel:+' + loja.whatsapp;
  loja.whatsUrl = 'https://wa.me/' + loja.whatsapp;
  loja.mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(loja.endereco + ' - Assis Brasil');

  var categorias = [
    { id: 'chapas', nome: 'Chapas', icone: 'p-chapa', desc: 'Drywall ST, RU e RF para paredes, forros e revestimentos.' },
    { id: 'perfis', nome: 'Perfis', icone: 'p-perfil', desc: 'Guias, montantes e perfis de forro para a estrutura.' },
    { id: 'fixacao', nome: 'Fixação', icone: 'p-parafuso', desc: 'Parafusos, ancoradores e parabolts por caixa ou unidade.' },
    { id: 'acabamento', nome: 'Massas e fitas', icone: 'p-balde', desc: 'Tratamento de juntas e acabamento pronto para pintura.' }
  ];

  var PRECO_LOJA = 'Preço informado pela loja em 30/09/2026';
  var PRECO_INSTA = 'Oferta publicada no Instagram em 09/09/2026';
  var PRECO_INSTA_SEM_DATA = 'Oferta publicada no Instagram da loja';

  var produtos = [
    // Linha Drysul — preços informados pela loja (30/09/2026)
    { id: 'fita', foto: 'assets/img/prod-fita-800.webp', fotoMini: 'assets/img/prod-fita-400.webp', nome: 'Fita de papel perfurada Drysul', cat: 'acabamento', icone: 'p-fita',
      emb: 'Rolo', un: 'rolo', preco: 65.00, fonte: PRECO_LOJA, destaque: true,
      detalhe: 'Para tratamento de juntas entre chapas. Medidas do rolo confirmadas no atendimento.' },
    { id: 'parafuso', foto: 'assets/img/prod-parafuso-800.webp', fotoMini: 'assets/img/prod-parafuso-400.webp', nome: 'Parafusos para drywall Drysul', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 1.000 unidades', un: 'caixa', preco: 27.99, fonte: PRECO_LOJA, destaque: true,
      detalhe: 'Fixação de chapas na estrutura. Bitola e comprimento confirmados no atendimento.' },
    { id: 'massa', foto: 'assets/img/prod-massa-800.webp', fotoMini: 'assets/img/prod-massa-400.webp', nome: 'Massa para drywall Drysul', cat: 'acabamento', icone: 'p-balde',
      emb: 'Balde de 25 kg', un: 'balde', preco: 54.99, fonte: PRECO_LOJA, destaque: true,
      detalhe: 'Tratamento de juntas e acabamento de superfícies em drywall.' },

    // Ofertas publicadas no Instagram (09/09/2026)
    { id: 'ancorador', foto: 'assets/img/prod-ancorador-800.webp', fotoMini: 'assets/img/prod-ancorador-400.webp', publicada: '09/09/2026', nome: 'Ancorador', cat: 'fixacao', icone: 'p-ancora',
      emb: 'Por unidade', un: 'un.', preco: 19.90, fonte: PRECO_INSTA, oferta: true,
      link: 'https://www.instagram.com/drysul.loja/p/DdFD94yn_6Y/',
      detalhe: 'Ancoragem de cargas. Especificação confirmada no atendimento.' },
    { id: 'parafuso-metal', foto: 'assets/img/prod-parafuso-metal-800.webp', fotoMini: 'assets/img/prod-parafuso-metal-400.webp', publicada: '09/09/2026', nome: 'Parafuso metal/steel 4,8 × 19', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 200 unidades', un: 'caixa', preco: 24.90, fonte: PRECO_INSTA, oferta: true,
      link: 'https://www.instagram.com/drysul.loja/p/DdFDOiJnxd1/',
      detalhe: 'Fixação metal com metal na estrutura.' },
    { id: 'parafuso-glassroc', foto: 'assets/img/prod-parafuso-glassroc-800.webp', fotoMini: 'assets/img/prod-parafuso-glassroc-400.webp', publicada: '09/09/2026', nome: 'Parafuso Glassroc 35 × 3,5 mm', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 500 unidades', un: 'caixa', preco: 119.00, fonte: PRECO_INSTA, oferta: true,
      link: 'https://www.instagram.com/drysul.loja/p/DdFCqS8Hx-O/',
      detalhe: 'Para placas cimentícias Glassroc.' },
    { id: 'parafuso-costura', foto: 'assets/img/prod-parafuso-costura-800.webp', fotoMini: 'assets/img/prod-parafuso-costura-400.webp', publicada: '09/09/2026', nome: 'Parafuso de costura 4,8 × 19 sextavado', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 500 unidades', un: 'caixa', preco: 137.90, fonte: PRECO_INSTA, oferta: true,
      link: 'https://www.instagram.com/drysul.loja/p/DdFBrSUnxJV/',
      detalhe: 'Cabeça sextavada para união de perfis.' },
    { id: 'parabolt', foto: 'assets/img/prod-parabolt-800.webp', fotoMini: 'assets/img/prod-parabolt-400.webp', publicada: '09/09/2026', nome: 'Parabolt zincado 1/2 × 4', cat: 'fixacao', icone: 'p-ancora',
      emb: 'Por unidade', un: 'un.', preco: 4.90, fonte: PRECO_INSTA, oferta: true,
      link: 'https://www.instagram.com/drysul.loja/p/DdFBMFan2vL/',
      detalhe: 'Chumbador para fixação em concreto.' },
    { id: 'gn25-broca', foto: 'assets/img/prod-gn25-broca-800.webp', fotoMini: 'assets/img/prod-gn25-broca-400.webp', nome: 'Parafuso GN25 ponta broca 3,5 × 25', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 1.000 unidades', un: 'caixa', preco: 84.90, fonte: PRECO_INSTA_SEM_DATA, oferta: true,
      link: loja.instagramUrl,
      detalhe: 'Fixa chapas de drywall na estrutura; a ponta broca vence perfis de aço mais espessos.' },
    { id: 'gn25-agulha', foto: 'assets/img/prod-gn25-agulha-800.webp', fotoMini: 'assets/img/prod-gn25-agulha-400.webp', nome: 'Parafuso GN25 ponta agulha 3,5 × 25', cat: 'fixacao', icone: 'p-caixa',
      emb: 'Caixa com 1.000 unidades', un: 'caixa', preco: 59.90, fonte: PRECO_INSTA_SEM_DATA, oferta: true,
      link: loja.instagramUrl,
      detalhe: 'Fixa chapas de drywall nos perfis leves da estrutura, com ponta agulha.' },

    // Referências de catálogo — sob consulta. Imagens ilustrativas: chapas em 3D com a textura de uma foto do
    // Wikimedia Commons ("Stapel Gipskartonplatten", RossKur, CC BY 4.0, modificada); perfis em 3D.
    { id: 'chapa-st', foto: 'assets/img/prod-chapa-st-800.webp', fotoMini: 'assets/img/prod-chapa-st-400.webp', ilustrativa: true, nome: 'Chapa de drywall ST', cat: 'chapas', icone: 'p-chapa',
      emb: 'Chapa', un: 'chapa', preco: null,
      detalhe: 'Standard — paredes, forros e revestimentos em áreas secas.' },
    { id: 'chapa-ru', foto: 'assets/img/prod-chapa-ru-800.webp', fotoMini: 'assets/img/prod-chapa-ru-400.webp', ilustrativa: true, nome: 'Chapa de drywall RU', cat: 'chapas', icone: 'p-chapa',
      emb: 'Chapa', un: 'chapa', preco: null,
      detalhe: 'Resistente à umidade — banheiros, cozinhas e áreas molháveis.' },
    { id: 'chapa-rf', foto: 'assets/img/prod-chapa-rf-800.webp', fotoMini: 'assets/img/prod-chapa-rf-400.webp', ilustrativa: true, nome: 'Chapa de drywall RF', cat: 'chapas', icone: 'p-chapa',
      emb: 'Chapa', un: 'chapa', preco: null,
      detalhe: 'Resistente ao fogo — áreas que pedem proteção passiva.' },
    { id: 'montante-70', foto: 'assets/img/prod-montante-70-800.webp', fotoMini: 'assets/img/prod-montante-70-400.webp', ilustrativa: true, nome: 'Montante 70', cat: 'perfis', icone: 'p-perfil',
      emb: 'Barra', un: 'barra', preco: null,
      detalhe: 'Perfil vertical da estrutura de paredes e revestimentos.' },
    { id: 'guia-70', foto: 'assets/img/prod-guia-70-800.webp', fotoMini: 'assets/img/prod-guia-70-400.webp', ilustrativa: true, nome: 'Guia 70', cat: 'perfis', icone: 'p-perfil',
      emb: 'Barra', un: 'barra', preco: null,
      detalhe: 'Perfil de piso e teto que recebe os montantes.' },
    { id: 'perfil-forro', foto: 'assets/img/prod-perfil-forro-800.webp', fotoMini: 'assets/img/prod-perfil-forro-400.webp', ilustrativa: true, nome: 'Perfil para forro', cat: 'perfis', icone: 'p-perfil',
      emb: 'Barra', un: 'barra', preco: null,
      detalhe: 'Estrutura de forro com reguladores e uniões.' },
    { id: 'cantoneira', foto: 'assets/img/prod-cantoneira-800.webp', fotoMini: 'assets/img/prod-cantoneira-400.webp', ilustrativa: true, nome: 'Cantoneira para forro', cat: 'perfis', icone: 'p-perfil',
      emb: 'Barra', un: 'barra', preco: null,
      detalhe: 'Arremate de perímetro do forro junto às paredes.' }
  ];

  // Central de vendas: pedidos com preço, sem cálculo de obra e até este valor podem ser comprados no site.
  // Acima disso, com estimativa da calculadora ou item sob consulta, o pedido segue para o WhatsApp.
  var vendas = {
    limiteOnline: 1000, // R$ — definido em 30/09/2026
    demo: true          // modo de teste: enquanto o provedor de pagamento não está ligado, nada é cobrado e a central avisa
  };

  // Preços médios de mercado, usados só na estimativa da calculadora enquanto a loja não informa o preço dela.
  // Mediana de preços publicados por lojas de drywall do Brasil (pesquisa de 03/10/2026). Preço da loja (produto com
  // `preco`) sempre tem prioridade. Para trocar pelo preço da Drysul: preencha `preco` no produto ou ajuste aqui.
  // Sem valor aqui nem no produto (ex.: junção H) = "sob consulta", fora do total.
  var precosMedios = {
    data: '03/10/2026',
    precos: {
      'chapa-st': 58.00,     // chapa ST 12,5 mm, 1,20 × 2,40 m
      'guia-70': 23.00,      // barra de 3 m
      'montante-70': 29.00,  // barra de 3 m
      'perfil-forro': 16.00, // perfil S47/F530, barra de 3 m
      'cantoneira': 8.50,    // 25 × 30 mm, barra de 3 m
      'regulador': 1.20,     // unidade
      'uniao': 1.30,         // emenda S47/F530, unidade
      'arame-10': 19.00,     // kg (cerca de 14 m)
      'arame-18': 13.00,     // kg
      'gesso-cola': 60.00,   // saco de 20 kg
      'la-vidro': 280.00,    // rolo de 15 m², 50 mm
      'nervura': 20.00       // m² de chapa em tiras
    }
  };

  root.DRYSUL = { loja: loja, categorias: categorias, produtos: produtos, vendas: vendas, precosMedios: precosMedios };
})(typeof self !== 'undefined' ? self : this);
