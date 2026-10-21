/* Central de vendas — compra em 4 etapas: pedido → entrega → pagamento → pronto.
   Pagamento online (Pix ou cartão) pelo Checkout Pro do Mercado Pago, através do servidor da loja (worker/, no Cloudflare):
   o servidor recalcula o pedido com o catálogo dele, abre o checkout oficial e só marca "pago" depois de confirmar
   com o Mercado Pago. O retorno do navegador nunca confirma pagamento: esta tela só mostra o que o servidor responde.
   Sem servidor (ex.: GitHub Pages) ou com o pagamento online desligado, a compra segue pelo WhatsApp. */
(function () {
  'use strict';

  var A = window.DrysulApp, V = window.DrysulVendas, D = window.DRYSUL;
  if (!A || !V || !D) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BRL = A.BRL, esc = A.esc, loja = D.loja;

  var dlg = $('#checkout'), form = $('#co-form'), aviso = $('#co-teste');
  var secoes = $$('.co-step', form), marcas = $$('#co-steps li');
  var btNext = $('#co-next'), btBack = $('#co-back');
  var elLinhas = $('#co-lines'), elTotal = $('#co-total'), elNota = $('#co-total-note'), elRes = $('#co-result');
  var elHint = $('#co-pay-hint'), elOff = $('#co-pay-off'), elAlerta = $('#co-alerta'), elAnuncio = $('#co-anuncio');
  var st = { etapa: 1, av: null, numero: null, recibo: null, servidor: null, pedido: null, acomp: null, ocupado: false };

  /* ---------- servidor da loja ---------- */
  var API = 'api/'; // relativo: no Cloudflare vira /api/; no GitHub Pages não existe e a compra fica no WhatsApp
  var KEY_PED = 'drysul-pedidos-online', KEY_IDEM = 'drysul-chave-pedido';

  function pedir(metodo, caminho, o) {
    o = o || {};
    var h = { accept: 'application/json' };
    if (o.corpo) h['content-type'] = 'application/json';
    if (o.token) h.authorization = 'Bearer ' + o.token;
    if (o.chave) h['idempotency-key'] = o.chave;
    var ctl = window.AbortController ? new AbortController() : null;
    var tm = ctl && setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(API + caminho, { method: metodo, headers: h, body: o.corpo ? JSON.stringify(o.corpo) : undefined, cache: 'no-store', credentials: 'same-origin', signal: ctl && ctl.signal })
      .then(function (r) {
        if (tm) clearTimeout(tm);
        return r.text().then(function (t) { var d = null; try { d = JSON.parse(t); } catch (e) {} return { ok: r.ok, status: r.status, dados: d }; });
      }, function (e) { if (tm) clearTimeout(tm); throw e; });
  }
  var statusServidor = null;
  function servidor() {
    if (!statusServidor) {
      statusServidor = pedir('GET', 'status').then(function (r) {
        return r.ok && r.dados && r.dados.provedor === 'mercadopago' ? r.dados : null;
      }, function () { return null; });
    }
    return statusServidor;
  }

  function armazem(nome) { try { return window[nome]; } catch (e) { return null; } }
  function ler(nome, k) { try { return JSON.parse(armazem(nome).getItem(k)); } catch (e) { return null; } }
  function gravar(nome, k, v) { try { armazem(nome).setItem(k, JSON.stringify(v)); } catch (e) {} }
  // token de cada pedido fica neste aparelho (30 dias) para acompanhar o pagamento depois de voltar do Mercado Pago
  function guardarPedido(p) {
    var t = ler('localStorage', KEY_PED) || {}, agora = Date.now();
    Object.keys(t).forEach(function (k) { if (!t[k] || agora - t[k].em > 30 * 864e5) delete t[k]; });
    t[p.id] = { token: p.token, numero: p.numero, em: agora };
    gravar('localStorage', KEY_PED, t);
  }
  function pedidoGuardado(id) { var t = ler('localStorage', KEY_PED); return (t && t[id]) || null; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)), h = '';
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    for (var i = 0; i < 16; i++) h += (b[i] + 256).toString(16).slice(1) + ([3, 5, 7, 9].indexOf(i) !== -1 ? '-' : '');
    return h;
  }
  // Mesma compra (mesmos itens e dados) = mesma chave: clique duplo ou página recarregada não criam outro pedido
  function chaveDoPedido(corpo) {
    var conteudo = JSON.stringify(corpo), s = ler('sessionStorage', KEY_IDEM);
    if (s && s.conteudo === conteudo) return s.chave;
    var chave = uuid();
    gravar('sessionStorage', KEY_IDEM, { conteudo: conteudo, chave: chave });
    return chave;
  }
  function checkoutOficial(url) {
    var u; try { u = new URL(url); } catch (e) { return false; }
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return true;
    return u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname);
  }

  function online() { return !!(st.servidor && st.servidor.pagamentoOnline); }
  function atualizarAviso() {
    if (!aviso) return;
    var s = st.servidor;
    aviso.hidden = !!(s && s.pagamentoOnline && !s.teste);
    $('span', aviso).innerHTML = s && s.pagamentoOnline
      ? '<strong>Ambiente de testes do Mercado Pago:</strong> nenhum valor real é cobrado. Use os cartões e as contas de teste do Mercado Pago.'
      : '<strong>Pagamento online ainda não está ativo:</strong> nada é cobrado pelo site. Para comprar agora, escolha <b>Conversar no WhatsApp</b> na etapa de pagamento.';
  }
  function conectar() {
    return servidor().then(function (s) {
      st.servidor = s; atualizarAviso();
      if (st.etapa === 3) ajustarPagamento();
      atualizarRodape();
      return s;
    });
  }

  function valor(nome) { var el = form.elements[nome]; return el ? String(el.value || '').trim() : ''; }
  function entrega() { return valor('entrega') || 'retirada'; }
  function pagamento() { return valor('pagamento') || 'mercadopago'; }

  /* ---------- abrir ---------- */
  function abrir(origem) {
    st.av = A.avaliacao();
    if (st.av.canal !== 'online') { A.toast('Este pedido segue pelo WhatsApp.'); A.abrirOrcamento(origem); return; }
    pararAcompanhamento();
    st.numero = null; st.recibo = null; st.pedido = null;
    renderLinhas();
    irPara(1, false);
    A.abrirDialogo(dlg, origem);
    conectar();
  }

  function renderLinhas() {
    elLinhas.innerHTML = st.av.linhas.map(function (l) {
      var p = A.produto(l.id);
      return '<li class="co-line">' + A.mini(p) +
        '<div><p class="co-line__n">' + esc(p.nome) + '</p><p class="co-line__m">' + esc(p.emb) + ' · ' + l.qtd + ' × ' + BRL.format(p.preco) + '</p></div>' +
        '<b>' + BRL.format(l.total) + '</b></li>';
    }).join('');
    elTotal.textContent = BRL.format(st.av.subtotal);
  }

  /* ---------- navegação entre etapas ---------- */
  function irPara(n, foco) {
    st.etapa = n;
    secoes.forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
    marcas.forEach(function (m) {
      var k = Number(m.getAttribute('data-s'));
      m.classList.toggle('is-done', k < n);
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    if (n === 3) { ajustarPagamento(); alertar(''); }
    atualizarRodape();
    form.scrollTop = 0;
    if (foco !== false) { var h = $('.co-h', secoes[n - 1]) || $('h3', secoes[n - 1]); if (h) h.focus({ preventScroll: true }); }
  }

  function atualizarRodape() {
    elNota.textContent = st.acomp ? 'Retirada na loja, sem custo' : entrega() === 'entrega' ? '+ taxa de entrega a combinar' : 'Retirada na loja, sem custo';
    btBack.hidden = st.etapa === 1 || st.etapa === 4;
    var rotulo = {
      1: 'Continuar',
      2: 'Ir para o pagamento',
      3: pagamento() === 'whatsapp' ? 'Enviar pedido no WhatsApp' : 'Pagar com Mercado Pago',
      4: st.acomp && !st.acomp.pago ? 'Fechar' : 'Concluir'
    }[st.etapa];
    if (!st.ocupado) $('span', btNext).textContent = rotulo;
  }

  function ajustarPagamento() {
    var soWhats = entrega() === 'entrega', semOnline = !online();
    elHint.hidden = !soWhats;
    elOff.hidden = soWhats || !semOnline;
    var aceite = $('#co-aceite'); if (aceite) aceite.closest('.co-aceite').hidden = soWhats || semOnline || pagamento() === 'whatsapp';
    $$('input[name="pagamento"]', form).forEach(function (r) {
      r.disabled = r.value !== 'whatsapp' && (soWhats || semOnline);
      r.closest('.opt').classList.toggle('is-disabled', r.disabled);
    });
    if (soWhats || semOnline) form.elements.pagamento.value = 'whatsapp';
    else if (pagamento() === 'whatsapp' && !st.escolheuWhats) form.elements.pagamento.value = 'mercadopago';
  }

  function ocupado(sim, texto) {
    st.ocupado = sim;
    btNext.disabled = sim; btBack.disabled = sim;
    btNext.setAttribute('aria-busy', sim ? 'true' : 'false');
    if (sim) $('span', btNext).textContent = texto; else atualizarRodape();
  }
  function alertar(msg) {
    if (!elAlerta) return;
    elAlerta.textContent = msg;
    elAlerta.hidden = !msg;
  }

  /* ---------- validação dos dados ---------- */
  function erro(input, msg) {
    var m = document.getElementById(input.getAttribute('aria-describedby'));
    if (msg) { input.setAttribute('aria-invalid', 'true'); m.textContent = msg; m.hidden = false; }
    else { input.removeAttribute('aria-invalid'); m.textContent = ''; m.hidden = true; }
    return !msg;
  }
  function validarDados() {
    var nome = form.elements.nome, tel = form.elements.telefone, email = form.elements.email;
    var ok = [
      erro(nome, nome.value.trim().length < 3 ? 'Informe seu nome para identificarmos o pedido.' : ''),
      erro(tel, V.telefoneValido(tel.value) ? '' : 'Informe um WhatsApp com DDD, ex.: (55) 99999-9999.'),
      erro(email, V.emailValido(email.value) ? '' : 'Confira o e-mail ou deixe em branco.')
    ];
    if (ok.indexOf(false) !== -1) { var f = $('[aria-invalid="true"]', form); if (f) f.focus(); return false; }
    tel.value = V.formatarTelefone(tel.value);
    return true;
  }

  /* ---------- pagamento online ---------- */
  var MENSAGENS = {
    preco_alterado: 'Os preços mudaram desde que a página abriu. Recarregue a página para ver os valores atualizados antes de pagar.',
    atendimento_whatsapp: 'Este pedido precisa de atendimento. Envie pelo WhatsApp: a equipe confirma tudo com você.',
    pagamento_indisponivel: 'O pagamento online está indisponível agora. Envie o pedido pelo WhatsApp.',
    provedor_indisponivel: 'O Mercado Pago não respondeu. Tente de novo em instantes.',
    muitas_tentativas: 'Limite de tentativas atingido. Fale com a loja no WhatsApp.',
    pagamento_pendente: 'Já existe um pagamento deste pedido em análise. Aguarde a confirmação.',
    nome_invalido: 'Confira seu nome na etapa Entrega.',
    telefone_invalido: 'Confira seu WhatsApp na etapa Entrega.',
    email_invalido: 'Confira seu e-mail na etapa Entrega.',
    estoque_insuficiente: 'Não há estoque suficiente de algum item. Diminua a quantidade ou fale com a loja no WhatsApp.',
    muitas_requisicoes: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    termos_nao_aceitos: 'Para pagar, marque que leu e aceita os termos e as políticas.'
  };
  function falhou(r) {
    var cod = r && r.dados && r.dados.erro;
    ocupado(false);
    if (cod === 'atendimento_whatsapp' || cod === 'pagamento_indisponivel') {
      if (cod === 'pagamento_indisponivel' && st.servidor) st.servidor = Object.assign({}, st.servidor, { pagamentoOnline: false });
      st.escolheuWhats = true; form.elements.pagamento.value = 'whatsapp';
      ajustarPagamento(); atualizarRodape(); atualizarAviso();
    }
    alertar(MENSAGENS[cod] || 'Não foi possível abrir o pagamento. Tente de novo ou envie o pedido pelo WhatsApp.');
  }
  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  function pagarOnline() {
    alertar('');
    var aceite = $('#co-aceite');
    if (aceite && !aceite.checked) { alertar(MENSAGENS.termos_nao_aceitos); aceite.focus(); return; }
    ocupado(true, 'Abrindo o Mercado Pago…');
    var corpo = {
      itens: st.av.linhas.map(function (l) { return { id: l.id, qtd: l.qtd }; }),
      entrega: 'retirada',
      cliente: { nome: valor('nome'), telefone: valor('telefone'), email: valor('email') },
      totalCentavos: Math.round(st.av.subtotal * 100),
      aceiteTermos: D.vendas.termosVersao
    };
    pedir('POST', 'pedidos', { corpo: corpo, chave: chaveDoPedido(corpo) }).then(function (r) {
      if (!r.ok || !r.dados || !r.dados.pedido) return falhou(r);
      st.pedido = { id: r.dados.pedido.id, token: r.dados.token, numero: r.dados.pedido.numero };
      guardarPedido(st.pedido);
      return abrirPagamento(st.pedido, 0);
    }).catch(function () { falhou(null); alertar('Sem conexão com a loja. Confira a internet e tente de novo.'); });
  }
  function abrirPagamento(p, tentativa) {
    return pedir('POST', 'pedidos/' + p.id + '/pagamento', { corpo: {}, token: p.token }).then(function (r) {
      var cod = r.dados && r.dados.erro;
      if (r.ok && r.dados.checkoutUrl && checkoutOficial(r.dados.checkoutUrl)) {
        location.assign(r.dados.checkoutUrl); // o botão fica ocupado até a página do Mercado Pago abrir
        return;
      }
      if (cod === 'tente_novamente' && tentativa < 3) return esperar(1500).then(function () { return abrirPagamento(p, tentativa + 1); });
      if (cod === 'ja_pago' || cod === 'pagamento_pendente') { ocupado(false); acompanhar(p.id); return; }
      falhou(r);
    });
  }

  /* ---------- acompanhamento: o status vem só do servidor ---------- */
  function pararAcompanhamento() {
    if (st.acomp && st.acomp.timer) clearTimeout(st.acomp.timer);
    st.acomp = null;
  }
  function acompanhar(id) {
    var g = pedidoGuardado(id), aberto = dlg.open;
    pararAcompanhamento();
    st.acomp = { id: id, token: g && g.token, numero: g && g.numero, voltas: 0, timer: null, pago: false };
    irPara(4, false);
    if (!aberto) A.abrirDialogo(dlg);
    if (!g) { mostrarEstado('sem_token'); return; }
    mostrarEstado('verificando');
    consultar();
  }
  function consultar() {
    var ac = st.acomp; if (!ac) return;
    ac.timer = null;
    pedir('GET', 'pedidos/' + ac.id + '?atualizar=1', { token: ac.token }).then(function (r) {
      if (st.acomp !== ac) return;
      if (r.status === 404) return mostrarEstado('sem_token');
      if (!r.ok || !r.dados || !r.dados.pedido) throw new Error('status');
      ac.pedido = r.dados.pedido;
      elTotal.textContent = BRL.format(ac.pedido.totalCentavos / 100);
      if (ac.pedido.status === 'pago') return carregarComprovante(ac);
      mostrarEstado(ac.pedido.status);
      if (ac.pedido.status === 'aguardando' || ac.pedido.status === 'pendente') agendar(ac);
    }).catch(function () {
      if (st.acomp !== ac) return;
      mostrarEstado('sem_conexao'); agendar(ac);
    });
  }
  function agendar(ac) {
    if (!dlg.open) return;
    ac.voltas++;
    if (ac.voltas > 40) { mostrarEstado('demorando'); return; }
    ac.timer = setTimeout(consultar, ac.voltas <= 10 ? 3000 : 10000); // ~30 s rápidos, depois a cada 10 s (≈ 5 min)
  }
  function carregarComprovante(ac) {
    return pedir('GET', 'pedidos/' + ac.id + '/comprovante', { token: ac.token }).then(function (r) {
      if (st.acomp !== ac) return;
      if (!r.ok || !r.dados || !r.dados.comprovante) throw new Error('comprovante');
      ac.pago = true;
      st.recibo = window.DrysulRecibo.doServidor(r.dados.comprovante);
      A.limparPedido();
      renderComprovante(st.recibo, 'Pagamento aprovado',
        'O Mercado Pago confirmou o pagamento. Guarde seu comprovante: na retirada, informe o número do pedido e o código de verificação.');
      atualizarRodape();
      var h = $('.co-h', elRes); if (h) h.focus({ preventScroll: true });
      A.toast('Pedido ' + st.recibo.numero + ' pago.');
    }).catch(function () { if (st.acomp === ac) { mostrarEstado('sem_conexao'); agendar(ac); } });
  }

  var ESTADOS = {
    verificando: ['i-clock', 'Confirmando o pagamento', 'Estamos conferindo com o Mercado Pago. Leva alguns segundos.'],
    aguardando: ['i-clock', 'Aguardando o pagamento', 'O Mercado Pago ainda não confirmou o pagamento deste pedido. Se você já pagou, a confirmação aparece aqui sozinha.'],
    pendente: ['i-clock', 'Pagamento em análise', 'O Mercado Pago está processando o pagamento (por exemplo, um Pix ainda não pago). O comprovante aparece aqui assim que ele for confirmado.'],
    recusado: ['i-info', 'Pagamento não aprovado', 'O Mercado Pago não aprovou o pagamento. Você pode tentar de novo ou falar com a loja.'],
    expirado: ['i-info', 'O prazo para pagar terminou', 'Nenhum pagamento foi confirmado a tempo. Você pode tentar de novo.'],
    cancelado: ['i-info', 'Pagamento cancelado', 'Nenhum pagamento foi confirmado. Você pode tentar de novo.'],
    divergente: ['i-info', 'Precisamos conferir este pagamento', 'Fale com a loja no WhatsApp informando o número do pedido.'],
    reembolsado: ['i-info', 'Pagamento devolvido', 'Este pagamento foi devolvido. Fale com a loja no WhatsApp se tiver dúvidas.'],
    sem_conexao: ['i-info', 'Sem conexão com a loja', 'Tentando de novo… Confira a internet.'],
    demorando: ['i-clock', 'A confirmação está demorando', 'Se você pagou, o comprovante aparece aqui quando o Mercado Pago confirmar. Você também pode falar com a loja.'],
    sem_token: ['i-info', 'Pedido não encontrado neste aparelho', 'Abra pelo mesmo aparelho e navegador em que fez a compra, ou fale com a loja no WhatsApp.']
  };
  function mostrarEstado(nome) {
    var ac = st.acomp, e = ESTADOS[nome] || ESTADOS.aguardando, p = ac && ac.pedido;
    var num = p ? p.numero : ac && ac.numero;
    var acoes = [];
    if (p && p.checkoutUrl && checkoutOficial(p.checkoutUrl) && (nome === 'aguardando' || nome === 'pendente')) {
      acoes.push('<a class="btn btn--primary" href="' + esc(p.checkoutUrl) + '">' + A.icon('i-lock') + '<span>Voltar ao pagamento</span></a>');
    }
    if (online() && ac && ac.token && /^(recusado|expirado|cancelado)$/.test(nome)) {
      acoes.push('<button class="btn btn--primary" type="button" data-co="tentar">' + A.icon('i-arrow') + '<span>Tentar de novo</span></button>');
    }
    if (nome === 'demorando') acoes.push('<button class="btn btn--outline" type="button" data-co="verificar"><span>Verificar de novo</span></button>');
    if (nome !== 'verificando') {
      acoes.push('<a class="btn btn--outline" target="_blank" rel="noopener" href="' + loja.whatsUrl + '?text=' +
        encodeURIComponent('Olá, Drysul! Quero falar sobre o pagamento ' + (num ? 'do pedido ' + num : 'de um pedido') + ' feito pelo site.') + '">' + A.icon('i-whats') + '<span>Falar com a loja</span></a>');
    }
    if (ac && ac.anunciado !== nome && elAnuncio) { ac.anunciado = nome; elAnuncio.textContent = e[1]; }
    elRes.innerHTML = '<div class="co-ok co-ok--' + esc(nome) + '">' + A.icon(e[0]) +
      '<h3 class="co-h" tabindex="-1">' + esc(e[1]) + '</h3>' +
      (num ? '<p>Pedido <b>' + esc(num) + '</b>' + (p ? ' · <b>' + BRL.format(p.totalCentavos / 100) + '</b>' : '') + '</p>' : '') +
      '<p class="co-ok__info">' + esc(e[2]) + '</p>' +
      (acoes.length ? '<div class="co-acoes">' + acoes.join('') + '</div>' : '') + '</div>';
    atualizarRodape();
  }
  elRes.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-co]'); if (!b || !st.acomp) return;
    var ac = st.acomp;
    if (b.getAttribute('data-co') === 'verificar') { ac.voltas = 0; mostrarEstado('verificando'); consultar(); }
    if (b.getAttribute('data-co') === 'tentar') {
      b.disabled = true;
      abrirPagamento({ id: ac.id, token: ac.token }, 0).then(function () { b.disabled = false; }, function () {
        b.disabled = false; mostrarEstado('sem_conexao');
      });
    }
  });

  /* ---------- resultado do WhatsApp (etapa 4) ---------- */
  function renderComprovante(r, tituloTela, info) {
    elRes.innerHTML = '<div class="co-ok">' + A.icon(r.status === 'pago' ? 'i-check' : 'i-whats') +
      '<h3 class="co-h" tabindex="-1">' + esc(tituloTela) + '</h3><p class="co-ok__info">' + esc(info) + '</p></div><div id="co-rcpt"></div>';
    window.DrysulRecibo.mostrar($('#co-rcpt', elRes), r);
  }

  /* ---------- ações ---------- */
  function avancar() {
    if (st.ocupado) return;
    if (st.etapa === 1) { irPara(2); return; }
    if (st.etapa === 2) { if (validarDados()) irPara(3); return; }
    if (st.etapa === 3) {
      if (pagamento() !== 'whatsapp') { if (online()) pagarOnline(); return; }
      st.numero = V.numeroPedido();
      st.recibo = window.DrysulRecibo.montar({
        numero: st.numero, pagamento: 'whatsapp', entrega: entrega(),
        nome: valor('nome'), telefone: valor('telefone'), email: valor('email'),
        linhas: st.av.linhas, total: st.av.subtotal
      });
      window.open(loja.whatsUrl + '?text=' + encodeURIComponent(window.DrysulRecibo.mensagemLoja(st.recibo)), '_blank', 'noopener');
      renderComprovante(st.recibo, 'Pedido enviado para o WhatsApp',
        'A conversa abriu com o pedido pronto. A equipe confirma estoque' + (entrega() === 'entrega' ? ', taxa de entrega' : '') + ' e forma de pagamento.');
      irPara(4);
      return;
    }
    if (st.etapa === 4) {
      if (!st.acomp) A.limparPedido();
      A.fecharDialogo(dlg);
    }
  }
  btNext.addEventListener('click', avancar);
  btBack.addEventListener('click', function () { if (st.etapa > 1 && !st.ocupado) irPara(st.etapa - 1); });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); avancar(); });
  form.addEventListener('change', function (ev) {
    if (ev.target.name === 'pagamento') st.escolheuWhats = ev.target.value === 'whatsapp';
    if (ev.target.name === 'entrega' || ev.target.name === 'pagamento') { alertar(''); atualizarRodape(); if (st.etapa === 3) ajustarPagamento(); }
  });
  form.addEventListener('input', function (ev) { if (ev.target.getAttribute('aria-invalid') === 'true') erro(ev.target, ''); });
  form.elements.telefone.addEventListener('blur', function () {
    if (V.telefoneValido(this.value)) this.value = V.formatarTelefone(this.value);
  });
  $('[data-co="editar"]', form).addEventListener('click', function () {
    var origem = dlg._retorno;
    A.fecharDialogo(dlg);
    A.abrirOrcamento(origem);
  });
  dlg.addEventListener('close', function () {
    if (st.ocupado) ocupado(false);
    if (!st.acomp) return;
    pararAcompanhamento();
    // fechou o acompanhamento: tira o pedido da URL (recarregar não reabre)
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}
  });

  /* ---------- volta do Mercado Pago ---------- */
  (function retorno() {
    var id = new URLSearchParams(location.search).get('pedido');
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return;
    // os parâmetros que o Mercado Pago acrescenta (status, payment_id...) não valem como confirmação: saem da URL
    try { history.replaceState(history.state, '', location.pathname + '?pedido=' + id + location.hash); } catch (e) {}
    conectar().then(function (s) { if (s) acompanhar(id); });
  })();

  window.DrysulCheckout = { abrir: abrir };
})();
