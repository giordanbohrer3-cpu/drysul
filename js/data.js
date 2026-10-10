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
    cidade: 'Ijuí', uf: 'RS',
    telefone: '(55) 99201-0668',
    whatsapp: '5555992010668',
    instagram: '@drysul.loja',
    instagramUrl: 'https://www.instagram.com/drysul.loja/',
    // horário comercial (0 = domingo): o "Aberto agora" do topo é calculado daqui, no fuso da loja (js/horario.js)
    horario: [
      { dias: [1, 2, 3, 4, 5], abre: '08:00', fecha: '18:00' },
      { dias: [6], abre: '08:00', fecha: '12:00' }
    ]
  };
  loja.telUrl = 'tel:+' + loja.whatsapp;
  loja.whatsUrl = 'https://wa.me/' + loja.whatsapp;
  // mapa pelo endereço completo (conferido no Google Maps em 09/10/2026: "R. Albino Brendler, 596 - Assis Brasil, Ijuí - RS").
  // Pelo nome não: "Drysul Ijuí" no Maps cai em outra empresa enquanto a loja não tiver o Perfil da Empresa no Google.
  var enderecoMapa = loja.endereco + ' - ' + loja.bairro.replace(/^Bairro /, '') + ', ' + loja.cidade + ' - ' + loja.uf;
  loja.mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(enderecoMapa);
  loja.rotaUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(enderecoMapa);
  loja.mapaEmbed = 'https://www.google.com/maps?q=' + encodeURIComponent(enderecoMapa) + '&z=16&hl=pt-BR&output=embed';
  // fachada: o Street View do Google embutido (o Google permite embutir; print da imagem do Street View não é permitido).
  // Coordenadas que o próprio Google Maps dá para o endereço (10/10/2026), olhando a 175°: a frente da loja, da rua.
  loja.coordenadas = { lat: -28.3879422, lng: -53.9053878 };
  loja.fachadaEmbed = 'https://www.google.com/maps/embed?pb=!3m1!1spt-BR!5m1!1spt-BR!6m7!1m6!2m2!1d' + loja.coordenadas.lat +
    '!2d' + loja.coordenadas.lng + '!3f175!4f0!5f1';
  // foto da fachada tirada pela loja: quando existir, vira a capa do cartão e o Street View só abre a pedido.
  // Ex.: 'assets/img/fachada-800.webp'
  loja.fotoFachada = null;

  var categorias = [
    { id: 'chapas', nome: 'Chapas', icone: 'p-chapa', desc: 'Drywall ST, RU e RF para paredes, forros e revestimentos.' },
    { id: 'perfis', nome: 'Perfis', icone: 'p-perfil', desc: 'Guias, montantes e perfis de forro para a estrutura.' },
    { id: 'fixacao', nome: 'Fixação', icone: 'p-parafuso', desc: 'Parafusos, ancoradores e parabolts por caixa ou unidade.' },
    { id: 'acabamento', nome: 'Acabamento', icone: 'p-balde', desc: 'Massas, fitas, cola e lã mineral: juntas, acabamento e isolamento.' }
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
      detalhe: 'Arremate de perímetro do forro junto às paredes.' },

    // Acessórios e materiais que a calculadora também usa: sob consulta, com o desenho técnico no lugar da foto.
    // O preço médio de referência (só para a estimativa) fica em `precosMedios`.
    { id: 'regulador', nome: 'Regulador S47', cat: 'perfis', icone: 'p-peca', emb: 'Unidade', un: 'un.', preco: null,
      detalhe: 'Regula a altura do forro estruturado.' },
    { id: 'uniao', nome: 'União S47', cat: 'perfis', icone: 'p-peca', emb: 'Unidade', un: 'un.', preco: null,
      detalhe: 'Emenda dos perfis de forro.' },
    { id: 'arame-10', nome: 'Arame galvanizado nº 10', cat: 'fixacao', icone: 'p-arame', emb: 'Kg (cerca de 14 m)', un: 'kg', preco: null,
      detalhe: 'Pendural do forro estruturado.' },
    { id: 'arame-18', nome: 'Arame nº 18 encapado', cat: 'fixacao', icone: 'p-arame', emb: 'Kg', un: 'kg', preco: null,
      detalhe: 'Fixação do forro aramado.' },
    { id: 'gesso-cola', nome: 'Cola para drywall', cat: 'acabamento', icone: 'p-balde', emb: 'Saco de 20 kg', un: 'saco', preco: null,
      detalhe: 'Gesso cola para revestimento colado e forro aramado.' },
    { id: 'la-vidro', nome: 'Lã mineral para isolamento', cat: 'acabamento', icone: 'p-la', emb: 'Rolo de 15 m², 50 mm', un: 'rolo', preco: null,
      detalhe: 'Isolamento acústico e térmico dentro da parede ou sobre o forro.' },
    { id: 'nervura', nome: 'Nervura para forro aramado', cat: 'chapas', icone: 'p-chapa', emb: 'm² de chapa em tiras', un: 'm²', preco: null,
      detalhe: 'Reforço das chapas do forro aramado.' },
    { id: 'juncao-h', nome: 'Junção H', cat: 'perfis', icone: 'p-peca', emb: 'Unidade', un: 'un.', preco: null,
      detalhe: 'Emenda das chapas do forro aramado.' }
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

  // Foto de exemplo de cada sistema da calculadora (fotos da loja, marcadas como ilustrativas). No computador aparece
  // ao passar o mouse na aba; no celular, ao tocar nela. `pos` = enquadramento (object-position) para fotos em pé.
  var fotosSistemas = {
    parede: { foto: 'assets/img/amb-sala-800.webp', legenda: 'Paredes de drywall com as juntas tratadas, prontas para a pintura.' },
    fge: { foto: 'assets/img/amb-janelas-800.webp', legenda: 'Forro de chapas no teto, com as juntas já tratadas.', pos: '50% 22%' },
    fga: { foto: 'assets/img/amb-pintor-800.webp', legenda: 'Acabamento do forro: massa nas juntas antes da pintura.', pos: '50% 16%' },
    colado: { foto: 'assets/img/amb-massa-800.webp', legenda: 'Massa e tela aplicadas sobre a parede existente.', pos: '40% 38%' },
    estruturado: { foto: 'assets/img/amb-instalacao-800.webp', legenda: 'Estrutura montada, isolamento e chapas sendo parafusadas.', pos: '62% 30%' }
  };

  // Central de ajuda (botão "Ajuda" do cabeçalho): dúvidas frequentes em linguagem simples. Só o que o site e a loja
  // já confirmam; o que depende da loja (entrega, frete, pagamento) manda para o WhatsApp. `tags` = palavras que a busca
  // da ajuda também entende. `acao` = botão embaixo da resposta: `href` (link) ou `loja` (rota, whatsapp, tel).
  // Esta lista também serve de base para um futuro assistente: ele só deve responder o que estiver aqui.
  var ajuda = [
    { tema: 'Pedido e compra', itens: [
      { p: 'Como faço um pedido pelo site?', tags: 'comprar encomendar lista orçamento',
        r: 'Escolha os produtos no catálogo e toque em Adicionar, ou calcule a obra na calculadora e leve a lista para o pedido.\nDepois toque em Pedido, no alto da tela, e em Enviar pelo WhatsApp. A mensagem já vai pronta: a equipe confere os itens, o preço e a entrega com você.',
        acao: { rotulo: 'Ver o catálogo', href: '#produtos' } },
      { p: 'Preciso fazer cadastro ou criar senha?', tags: 'conta login cadastrar registrar',
        r: 'Não. O pedido é feito pelo WhatsApp, sem cadastro e sem senha. Seu nome é opcional.' },
      { p: 'O preço do site é o preço da loja?', tags: 'valor preço caro barato desconto',
        r: 'Os produtos com preço mostram o valor informado pela loja. Os itens "sob consulta" têm o preço confirmado pela equipe.\nNa calculadora, quando a loja ainda não informou o preço de um item, aparece uma média de mercado, só como estimativa. O valor final é sempre confirmado no atendimento.' },
      { p: 'Quais são as formas de pagamento?', tags: 'pagar pix cartão boleto parcelar dinheiro',
        r: 'As formas e as condições de pagamento são combinadas com a equipe no atendimento, pelo WhatsApp ou na loja.',
        acao: { rotulo: 'Perguntar no WhatsApp', loja: 'whatsapp' } },
      { p: 'As ofertas do Instagram valem no site?', tags: 'promoção oferta instagram',
        r: 'As ofertas mostradas aqui foram publicadas no Instagram @drysul.loja. O prazo e o estoque de cada oferta são confirmados no atendimento.',
        acao: { rotulo: 'Ver as ofertas', href: '#ofertas' } }
    ] },
    { tema: 'Loja, retirada e entrega', itens: [
      { p: 'Onde fica a loja?', tags: 'endereço localização mapa rua bairro chegar',
        r: loja.endereco + ', ' + loja.bairro.replace(/^Bairro /, 'bairro ') + ', ' + loja.cidade + ' (' + loja.uf + ').',
        acao: { rotulo: 'Como chegar', loja: 'rota' } },
      // texto à mão: se mudar o loja.horario (lá em cima), mude aqui também
      { p: 'Qual é o horário de atendimento?', tags: 'hora horário aberto fechado sábado domingo',
        r: 'Segunda a sexta, das 8h às 18h. Sábado, das 8h às 12h. Domingo, fechado.' },
      { p: 'Posso retirar o material na loja?', tags: 'retirar buscar pegar balcão',
        r: 'Sim. Combine o pedido pelo WhatsApp e retire na loja, em ' + loja.cidade + ', no horário de atendimento.' },
      { p: 'Vocês entregam? Quanto custa o frete?', tags: 'entrega frete entregar caminhão prazo cep',
        r: 'Pergunte pelo WhatsApp: a equipe informa se entrega no seu endereço, o prazo e o valor do frete.',
        acao: { rotulo: 'Perguntar no WhatsApp', loja: 'whatsapp' } }
    ] },
    { tema: 'Calculadora e materiais', itens: [
      { p: 'Como uso a calculadora?', tags: 'calcular quantidade medida metro conta',
        r: 'Escolha o sistema (parede, forro ou revestimento), informe as medidas em metros e toque em Calcular. A lista sai com as quantidades e vai para o pedido com um toque.\nTambém dá para escrever do seu jeito, por exemplo: parede de 4 × 2,8 m.',
        acao: { rotulo: 'Abrir a calculadora', href: '#calculadora' } },
      { p: 'A conta da calculadora é exata?', tags: 'precisão exato certo errado sobra perda',
        r: 'É uma estimativa com coeficientes de consumo de mercado, já com perdas. Não substitui um projeto técnico: a equipe confere as quantidades antes de fechar o pedido.' },
      { p: 'Qual chapa usar: ST, RU ou RF?', tags: 'chapa placa branca verde rosa umidade fogo standard',
        r: 'ST (branca) é a chapa padrão, para áreas secas, como quartos e salas.\nRU (verde) resiste à umidade: use em banheiros, cozinhas e lavanderias.\nRF (rosa) resiste ao fogo: para locais que pedem proteção contra incêndio.\nNa dúvida, pergunte à equipe.' },
      { p: 'Posso usar drywall no banheiro?', tags: 'banheiro box molhado água úmido chuveiro cozinha',
        r: 'Sim, com chapa RU (verde). Nas partes que recebem água direto, como o box do chuveiro, a parede precisa de impermeabilização antes do revestimento. A equipe indica os materiais.' },
      { p: 'Drywall aguenta TV, armário ou prateleira?', tags: 'peso pendurar fixar televisão armário prateleira bucha reforço',
        r: 'Aguenta, desde que a estrutura receba um reforço (de madeira ou metálico) no lugar da fixação e se usem buchas próprias para drywall. Planeje antes de fechar a parede e confirme o peso com a equipe.' },
      { p: 'Qual a diferença entre forro FGE e FGA?', tags: 'forro teto rebaixo estruturado aramado',
        r: 'FGE é o forro estruturado: chapas parafusadas numa estrutura de perfis metálicos presa ao teto.\nFGA é o forro aramado: chapas de forro presas com arame, nervuras e cola.\nA calculadora tem os dois. Se não souber qual é o seu, pergunte à equipe.' }
    ] },
    { tema: 'Usando o site', itens: [
      { p: 'As letras estão pequenas. Como aumento?', tags: 'letra pequena zoom aumentar ler enxergar fonte',
        r: 'No celular, encoste dois dedos na tela e afaste um do outro.\nNo computador, segure a tecla Ctrl e aperte + (no Mac, Command e +). Para voltar ao normal, Ctrl e 0.' },
      { p: 'Como falo com uma pessoa da loja?', tags: 'atendente atendimento humano telefone ligar conversar',
        r: 'Toque no botão verde do WhatsApp, no canto da tela, ou ligue para ' + loja.telefone + ' no horário de atendimento.',
        acao: { rotulo: 'Ligar para a loja', loja: 'tel' } },
      { p: 'Minha lista fica salva?', tags: 'salvar guardar lista perder sumiu dados',
        r: 'Sua lista fica guardada só neste aparelho, enquanto esta aba estiver aberta. Ao fechar, ela some: antes disso, envie pelo WhatsApp ou toque em Copiar lista.\nNada é enviado sem você confirmar no WhatsApp.' }
    ] }
  ];

  root.DRYSUL = { loja: loja, categorias: categorias, produtos: produtos, vendas: vendas, precosMedios: precosMedios, fotosSistemas: fotosSistemas, ajuda: ajuda };
})(typeof self !== 'undefined' ? self : this);
