/* Pedidos e pagamentos.
   - O navegador manda produto, quantidade e contato; preço e total são do servidor (catalogo.js).
   - "Pago" só depois de ler a order no Mercado Pago: status processed, valor pago igual ao total do pedido e
     external_reference igual ao id do pedido. O retorno do navegador e o corpo do webhook nunca confirmam nada.
   - O comprovante só existe para pedido pago, com código assinado pelo servidor (HMAC). */
import * as db from './db.js';
import * as mp from './mercadopago.js';
import { ErroProvedor } from './mercadopago.js';
import { precificar, regras as V } from './catalogo.js';
import { checkoutConfiavel } from './config.js';
import { assinaturaValida } from './webhook.js';
import { ErroHttp, json, lerJson, agora, sha256, hmac, iguais, uuidDe, aleatorio, centavosDeTexto } from './util.js';

export const ID_PEDIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORDER_ABERTA = ['created', 'action_required', 'processing'];
const VALIDADE_CHECKOUT = 55 * 60000; // a order expira em 1 h (expiration_time PT1H)
const MAX_TENTATIVAS = 5;
const INTERVALO_CONSULTA = 5000;
const RESERVA = 30000; // tempo máximo para abrir uma order depois de reservar a tentativa

const indisponivel = () => new ErroHttp(503, 'pagamento_indisponivel', 'Pagamento online indisponível. Envie o pedido pelo WhatsApp.');
const naoEncontrado = () => new ErroHttp(404, 'pedido_nao_encontrado', 'Pedido não encontrado.');

function limparTexto(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function ordemDeTeste(id) { return /^ORDTST/i.test(String(id)); }

// O token do pedido é derivado da chave do servidor: não fica guardado no banco e pode ser reenviado
// quando o mesmo pedido é repetido (resposta perdida na rede).
function tokenDe(cfg, id) { return hmac(cfg.chave, 'pedido:' + id); }

async function autorizar(request, cfg, id) {
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(request.headers.get('authorization') || '');
  if (!m || !iguais(m[1].toLowerCase(), await tokenDe(cfg, id))) throw naoEncontrado();
}
async function carregar(env, id) {
  const p = await db.pedido(env.DB, id);
  if (!p) throw naoEncontrado();
  return p;
}

function aberta(t) {
  return !!(t && ORDER_ABERTA.indexOf(t.status) !== -1 && t.checkout_url && Date.now() - Date.parse(t.criado_em) < VALIDADE_CHECKOUT);
}
function resumo(p, t) {
  return {
    id: p.id, numero: p.numero, status: p.status, totalCentavos: p.total_centavos, teste: p.ambiente !== 'producao',
    checkoutUrl: (p.status === 'aguardando' || p.status === 'pendente') && aberta(t) ? t.checkout_url : null,
    pagoEm: p.pago_em || null
  };
}

/* ---------- GET /api/status ---------- */
export function status(cfg) {
  const r = { ok: true, provedor: 'mercadopago', ambiente: cfg.ambiente, teste: cfg.teste, pagamentoOnline: cfg.podeCobrar };
  if (cfg.ambiente !== 'producao') r.pendencias = cfg.pendencias; // só nomes, nunca valores
  return json(r);
}

/* ---------- POST /api/pedidos ---------- */
export async function criarPedido(request, env, cfg) {
  if (!cfg.podeCobrar) throw indisponivel();
  const chaveIdem = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(chaveIdem)) throw new ErroHttp(400, 'chave_idempotencia', 'Envie o cabeçalho Idempotency-Key.');
  const corpo = await lerJson(request);
  const { linhas, totalCentavos } = precificar(corpo.itens, corpo.calculos);
  if (corpo.entrega !== 'retirada') throw new ErroHttp(422, 'atendimento_whatsapp', 'Entrega no endereço é combinada no WhatsApp.', { motivos: ['entrega'] });

  const c = corpo.cliente || {};
  const nome = limparTexto(c.nome, 80);
  const telefone = String(c.telefone || '').replace(/\D/g, '').slice(-13);
  const email = limparTexto(c.email, 120);
  if (nome.length < 3) throw new ErroHttp(422, 'nome_invalido', 'Informe o nome.');
  if (!V.telefoneValido(telefone)) throw new ErroHttp(422, 'telefone_invalido', 'Informe um WhatsApp com DDD.');
  if (email && !V.emailValido(email)) throw new ErroHttp(422, 'email_invalido', 'Confira o e-mail.');

  // O site mostra um total. Se o catálogo do servidor discordar (página antiga, valor alterado no navegador),
  // nada é criado: o cliente vê o valor certo antes de pagar.
  if (corpo.totalCentavos !== undefined && corpo.totalCentavos !== totalCentavos) {
    throw new ErroHttp(409, 'preco_alterado', 'Os preços foram atualizados.', {
      totalCentavos, linhas: linhas.map((l) => ({ id: l.id, qtd: l.qtd, unitCentavos: l.unitCentavos, totalCentavos: l.totalCentavos }))
    });
  }

  const hash = await sha256(JSON.stringify([linhas.map((l) => [l.id, l.qtd]), 'retirada', nome, telefone, email]));
  const repetir = async (p) => {
    if (p.hash_conteudo !== hash) throw new ErroHttp(422, 'chave_reutilizada', 'Esta chave já foi usada em outro pedido.');
    return json({ pedido: resumo(p, null), token: await tokenDe(cfg, p.id), repetido: true }, 200);
  };
  const existente = await db.pedidoPorChave(env.DB, chaveIdem);
  if (existente) return repetir(existente);

  const quando = agora();
  const p = {
    id: crypto.randomUUID(), chave_idem: chaveIdem, hash_conteudo: hash, ambiente: cfg.ambiente, status: 'aguardando',
    total_centavos: totalCentavos, entrega: 'retirada', cliente_nome: nome, cliente_telefone: telefone,
    cliente_email: email || null, criado_em: quando, atualizado_em: quando
  };
  for (let i = 0; i < 4; i++) {
    p.numero = V.numeroPedido(new Date(Date.now() - 3 * 3600000), aleatorio()); // dia e mês no horário de Brasília
    try {
      await db.inserirPedido(env.DB, p, linhas);
      return json({ pedido: resumo(p, null), token: await tokenDe(cfg, p.id) }, 201);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
      const corrida = await db.pedidoPorChave(env.DB, chaveIdem); // dois cliques ao mesmo tempo
      if (corrida) return repetir(corrida);
    }
  }
  throw new ErroHttp(503, 'tente_novamente', 'Tente novamente.');
}

/* ---------- POST /api/pedidos/:id/pagamento ---------- */
export async function iniciarPagamento(request, env, cfg, id) {
  if (!cfg.podeCobrar) throw indisponivel();
  await autorizar(request, cfg, id);
  let p = await carregar(env, id);
  try { p = await atualizarDoProvedor(env, cfg, p, true); } catch (e) { if (!(e instanceof ErroProvedor)) throw e; }
  let t = p.mp_order_id ? await db.transacao(env.DB, p.mp_order_id) : null;

  if (p.status === 'pago') throw new ErroHttp(409, 'ja_pago', 'Este pedido já está pago.', { pedido: resumo(p, t) });
  if (p.status === 'divergente' || p.status === 'reembolsado') throw new ErroHttp(409, 'pedido_encerrado', 'Fale com a loja sobre este pedido.', { pedido: resumo(p, t) });
  if (aberta(t)) return json({ pedido: resumo(p, t), checkoutUrl: t.checkout_url });
  if (p.status === 'pendente') throw new ErroHttp(409, 'pagamento_pendente', 'Há um pagamento em análise. Aguarde a confirmação.', { pedido: resumo(p, t) });
  if (p.tentativas >= MAX_TENTATIVAS) throw new ErroHttp(429, 'muitas_tentativas', 'Limite de tentativas. Fale com a loja no WhatsApp.');
  // outra requisição reservou uma tentativa há pouco e ainda está abrindo a order (clique duplo)
  const emAndamento = () => new ErroHttp(409, 'tente_novamente', 'O pagamento já está sendo aberto. Tente de novo em instantes.');
  if (p.tentativas > (await db.ultimaTentativaGravada(env.DB, p.id)) && Date.now() - Date.parse(p.atualizado_em) < RESERVA) throw emAndamento();

  const n = p.tentativas + 1;
  if (!(await db.reservarTentativa(env.DB, p.id, p.tentativas, agora()))) throw emAndamento();
  let order;
  try {
    // mesma tentativa = mesma chave: se a resposta se perder, repetir não cria outra order
    order = await mp.criarOrder(cfg, p, await db.itens(env.DB, p.id), await uuidDe('drysul:' + p.id + ':' + n));
  } catch (e) {
    await db.liberarTentativa(env.DB, p.id, n);
    if (e instanceof ErroProvedor) throw new ErroHttp(502, 'provedor_indisponivel', 'Não foi possível abrir o pagamento agora. Tente de novo.');
    throw e;
  }

  const idOk = typeof order.id === 'string' && /^ORD[A-Z0-9]{1,60}$/i.test(order.id);
  if (!idOk || order.external_reference !== p.id || centavosDeTexto(order.total_amount) !== p.total_centavos || !checkoutConfiavel(cfg, order.checkout_url)) {
    console.error('order inesperada', idOk ? order.id : '(sem id)');
    throw new ErroHttp(502, 'resposta_inesperada', 'Resposta inesperada do Mercado Pago. Nada foi cobrado.');
  }
  // Trava de ambiente: credencial de produção no site de teste (ou o contrário) cancela a order na hora
  if (ordemDeTeste(order.id) !== cfg.teste) {
    try { await mp.cancelarOrder(cfg, order.id); } catch (e) { /* sem checkout_url ela expira sozinha */ }
    console.error('credencial do ambiente errado', cfg.ambiente);
    throw new ErroHttp(503, 'credencial_trocada', cfg.teste
      ? 'Credencial de produção no ambiente de teste: pagamento bloqueado.'
      : 'Credencial de teste em produção: pagamento bloqueado.');
  }

  const quando = agora();
  await db.inserirTransacao(env.DB, {
    mp_order_id: order.id, pedido_id: p.id, tentativa: n, status: String(order.status || 'created'), status_detail: order.status_detail || null,
    total_pago_centavos: centavosDeTexto(order.total_paid_amount) || 0, checkout_url: order.checkout_url, criado_em: quando, atualizado_em: quando
  });
  await db.definirTransacaoAtual(env.DB, p.id, order.id, quando);
  p = await db.pedido(env.DB, p.id);
  t = await db.transacao(env.DB, order.id);
  return json({ pedido: resumo(p, t), checkoutUrl: order.checkout_url }, 201);
}

/* ---------- leitura no Mercado Pago (fonte da verdade) ---------- */
function statusDe(order, pagamentos, pagoCentavos, totalPedido) {
  const s = String(order.status || '').toLowerCase();
  if (s === 'processed') {
    const certo = pagoCentavos === totalPedido && centavosDeTexto(order.total_amount) === totalPedido && (!order.currency || order.currency === 'BRL');
    return certo ? 'pago' : 'divergente';
  }
  if (/refund|charged_back/.test(s)) return 'reembolsado';
  if (s === 'expired') return 'expirado';
  if (s === 'cancelled' || s === 'canceled') return 'cancelado';
  if (s === 'failed') return 'recusado';
  if (/action_required|processing|in_process|pending/.test(s)) return 'pendente';
  const est = pagamentos.map((x) => String((x && x.status) || '').toLowerCase());
  if (est.some((x) => /pending|in_process|action_required|processing/.test(x))) return 'pendente';
  if (est.length && est.every((x) => /rejected|failed|cancel/.test(x))) return 'recusado';
  return 'aguardando';
}
function transicaoPermitida(de, para) {
  if (de === 'pago') return para === 'reembolsado';
  return de !== 'reembolsado' && de !== 'divergente';
}
async function codigoComprovante(cfg, p, pagoEm) {
  const h = (await hmac(cfg.chave, ['comprovante', p.id, p.numero, p.total_centavos, pagoEm].join('|'))).toUpperCase();
  return h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12);
}

export async function sincronizar(env, cfg, order) {
  const id = order && order.external_reference;
  if (typeof id !== 'string' || !ID_PEDIDO.test(id) || typeof order.id !== 'string') return 'sem_pedido';
  if (ordemDeTeste(order.id) !== cfg.teste) return 'ambiente_trocado';
  const p = await db.pedido(env.DB, id);
  if (!p) return 'sem_pedido';

  const quando = agora();
  const pagamentos = (order.transactions && Array.isArray(order.transactions.payments)) ? order.transactions.payments : [];
  const pagoCentavos = centavosDeTexto(order.total_paid_amount) || 0;
  const novo = statusDe(order, pagamentos, pagoCentavos, p.total_centavos);

  if (!(await db.transacao(env.DB, order.id))) {
    // order nossa (mesmo external_reference) sem registro local, ex.: queda entre criar e gravar
    await db.inserirTransacao(env.DB, { mp_order_id: order.id, pedido_id: p.id, tentativa: 0, status: 'created', status_detail: null,
      total_pago_centavos: 0, checkout_url: null, criado_em: quando, atualizado_em: quando });
  }
  const ops = [db.atualizarTransacao(env.DB, { mp_order_id: order.id, status: String(order.status || '').slice(0, 40),
    status_detail: order.status_detail ? String(order.status_detail).slice(0, 80) : null, total_pago_centavos: pagoCentavos, atualizado_em: quando })];
  pagamentos.forEach((x) => {
    if (!x || !x.id) return;
    const metodo = x.payment_method || {};
    ops.push(db.gravarPagamento(env.DB, {
      mp_payment_id: String(x.id).slice(0, 64), mp_order_id: order.id, pedido_id: p.id,
      status: x.status ? String(x.status).slice(0, 40) : null, status_detail: x.status_detail ? String(x.status_detail).slice(0, 80) : null,
      valor_centavos: centavosDeTexto(x.paid_amount != null ? x.paid_amount : x.amount),
      metodo: metodo.id ? String(metodo.id).slice(0, 40) : null, tipo: metodo.type ? String(metodo.type).slice(0, 40) : null, atualizado_em: quando
    }));
  });
  await env.DB.batch(ops);

  // Dinheiro que entrou vale de qualquer tentativa; o resto só da tentativa atual
  let alvo = null;
  const extra = {};
  if (novo === 'pago' || novo === 'divergente') { alvo = novo; extra.mp_order_id = order.id; }
  else if (order.id === p.mp_order_id) alvo = novo;
  if (!alvo || alvo === p.status || !transicaoPermitida(p.status, alvo)) return p.status;
  if (alvo === 'pago') { extra.pago_em = quando; extra.codigo = await codigoComprovante(cfg, p, quando); }
  if (alvo === 'divergente') console.error('pagamento divergente', p.numero);
  return (await db.mudarStatus(env.DB, p.id, p.status, alvo, extra, quando)) ? alvo : p.status;
}

async function atualizarDoProvedor(env, cfg, p, forcar) {
  if (!p.mp_order_id || (p.status !== 'aguardando' && p.status !== 'pendente')) return p;
  if (!forcar && p.consultado_em && Date.now() - Date.parse(p.consultado_em) < INTERVALO_CONSULTA) return p;
  await db.marcarConsulta(env.DB, p.id, agora());
  await sincronizar(env, cfg, await mp.obterOrder(cfg, p.mp_order_id));
  return db.pedido(env.DB, p.id);
}

/* ---------- GET /api/pedidos/:id ---------- */
export async function consultar(request, env, cfg, id, url) {
  if (!cfg.podeConsultar) throw indisponivel();
  await autorizar(request, cfg, id);
  let p = await carregar(env, id);
  let provedorRespondeu = null;
  if (url.searchParams.get('atualizar') === '1') {
    try { p = await atualizarDoProvedor(env, cfg, p, false); provedorRespondeu = true; }
    catch (e) { if (!(e instanceof ErroProvedor)) throw e; provedorRespondeu = false; }
  }
  const t = p.mp_order_id ? await db.transacao(env.DB, p.mp_order_id) : null;
  return json({ pedido: resumo(p, t), provedorRespondeu });
}

/* ---------- GET /api/pedidos/:id/comprovante ---------- */
function formaDePagamento(pg) {
  if (!pg) return 'mercadopago';
  if (pg.metodo === 'pix') return 'pix';
  if (pg.tipo === 'credit_card') return 'credito';
  if (pg.tipo === 'debit_card' || pg.tipo === 'prepaid_card') return 'debito';
  if (pg.tipo === 'ticket') return 'boleto';
  if (pg.tipo === 'account_money') return 'saldo';
  return 'mercadopago';
}
export async function comprovante(request, env, cfg, id) {
  if (!cfg.podeConsultar) throw indisponivel();
  await autorizar(request, cfg, id);
  const p = await carregar(env, id);
  if (p.status !== 'pago') {
    throw new ErroHttp(409, 'nao_pago', 'O comprovante sai depois que o Mercado Pago confirma o pagamento.', { status: p.status });
  }
  const linhas = await db.itens(env.DB, p.id);
  const pg = await db.pagamentoAprovado(env.DB, p.id, p.mp_order_id);
  return json({
    comprovante: {
      numero: p.numero, dataISO: p.pago_em, status: 'pago', teste: p.ambiente !== 'producao',
      pagamento: formaDePagamento(pg), transacao: pg ? pg.mp_payment_id : p.mp_order_id, entrega: p.entrega,
      cliente: { nome: p.cliente_nome, telefone: V.mascararTelefone(p.cliente_telefone), email: V.mascararEmail(p.cliente_email) },
      itens: linhas.map((l) => ({ id: l.produto_id, nome: l.nome, emb: l.emb, un: l.un, qtd: l.qtd, unit: l.unit_centavos / 100, total: l.total_centavos / 100 })),
      total: p.total_centavos / 100, codigo: p.codigo
    }
  });
}

/* ---------- GET /api/comprovantes/verificar?numero=&codigo= ---------- */
export async function verificarComprovante(env, cfg, url) {
  if (!cfg.podeConsultar) throw indisponivel();
  const numero = String(url.searchParams.get('numero') || '').trim().toUpperCase();
  const codigo = String(url.searchParams.get('codigo') || '').trim().toUpperCase();
  if (!/^DS-\d{4}-[0-9A-Z]{4}$/.test(numero) || !/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(codigo)) {
    throw new ErroHttp(400, 'dados_invalidos', 'Informe o número do pedido e o código do comprovante.');
  }
  const p = await db.pedidoPorNumero(env.DB, numero);
  if (!p || !p.codigo || !iguais(p.codigo, codigo)) return json({ valido: false });
  if (p.status !== 'pago') return json({ valido: false, status: p.status });
  return json({ valido: true, numero: p.numero, status: p.status, totalCentavos: p.total_centavos, pagoEm: p.pago_em, teste: p.ambiente !== 'producao' });
}

/* ---------- POST /api/webhooks/mercadopago ---------- */
export async function webhook(request, env, cfg, url) {
  if (!cfg.podeConsultar) throw new ErroHttp(503, 'indisponivel', 'Indisponível.');
  const dataId = url.searchParams.get('data.id') || '';
  const tipo = url.searchParams.get('type') || url.searchParams.get('topic') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const assinatura = request.headers.get('x-signature') || '';
  const texto = await request.text();
  if (texto.length > 65536) throw new ErroHttp(413, 'grande_demais', 'Notificação grande demais.');
  if (!(await assinaturaValida({ assinatura, requestId, dataId, segredo: cfg.segredoWebhook }))) {
    console.warn('webhook com assinatura inválida');
    throw new ErroHttp(401, 'assinatura_invalida', 'Assinatura inválida.');
  }
  if (tipo !== 'order' || !/^ORD[A-Z0-9]{1,60}$/i.test(dataId)) return json({ ok: true, ignorado: true });

  let acao = null;
  try { acao = String(JSON.parse(texto).action || '').slice(0, 60) || null; } catch (e) { /* o corpo não é usado para decidir nada */ }
  const chave = requestId ? 'req:' + requestId.slice(0, 120) : 'sig:' + (await sha256(assinatura + '|' + dataId));
  const ev = await db.evento(env.DB, chave);
  if (ev && ev.processado) return json({ ok: true, duplicado: true });
  await db.registrarEvento(env.DB, { chave, mp_order_id: dataId, acao, recebido_em: agora() });

  let resultado;
  try {
    resultado = await sincronizar(env, cfg, await mp.obterOrder(cfg, dataId));
  } catch (e) {
    if (!(e instanceof ErroProvedor)) throw e;
    // order que esta conta não enxerga: confirma o recebimento para o aviso não se repetir
    if (e.status === 404) resultado = 'order_nao_encontrada';
    // sem 200 o Mercado Pago reenvia a notificação mais tarde
    else throw new ErroHttp(502, 'provedor_indisponivel', 'Mercado Pago indisponível.');
  }
  await db.concluirEvento(env.DB, chave, resultado);
  return json({ ok: true, resultado });
}
