// Mercado Pago de mentira (Orders API) para os testes: guarda as orders em memória, respeita X-Idempotency-Key,
// confere a soma dos itens e deixa o teste decidir o resultado do pagamento. Nenhuma chamada sai do computador.
const TOKEN = 'TEST-0000000000000000-000000-teste';

function resposta(status, corpo) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}
const centavos = (s) => Math.round(Number(s) * 100);
const reais = (c) => (c / 100).toFixed(2);

export function criarMp(opcoes = {}) {
  const orders = new Map(), porChave = new Map(), chamadas = [];
  const mp = {
    TOKEN, orders, chamadas,
    falharProximas: 0,          // falha de rede nas próximas N chamadas
    prefixo: opcoes.prefixo || 'ORDTST',
    checkoutHost: 'https://www.mercadopago.com.br',
    async fetch(endereco, opt = {}) {
      const u = new URL(endereco);
      const metodo = opt.method || 'GET';
      const corpo = opt.body ? JSON.parse(opt.body) : null;
      chamadas.push({ metodo, caminho: u.pathname, origem: u.origin, cab: opt.headers || {}, corpo });
      if (mp.falharProximas > 0) { mp.falharProximas--; throw new TypeError('fetch failed'); }
      if ((opt.headers || {}).authorization !== 'Bearer ' + TOKEN) return resposta(401, { code: 'unauthorized' });

      if (metodo === 'POST' && u.pathname === '/v1/orders') {
        const chave = opt.headers['x-idempotency-key'];
        if (!chave) return resposta(400, { code: 'idempotency_key_required' });
        if (porChave.has(chave)) return resposta(201, orders.get(porChave.get(chave)));
        const soma = corpo.items.reduce((s, i) => s + centavos(i.unit_price) * i.quantity, 0);
        if (soma !== centavos(corpo.total_amount)) return resposta(400, { code: 'total_amount_mismatch' });
        const id = mp.prefixo + String(orders.size + 1).padStart(10, '0');
        const order = {
          id, type: 'online', processing_mode: corpo.processing_mode, status: 'created', status_detail: 'created',
          external_reference: corpo.external_reference, total_amount: corpo.total_amount, total_paid_amount: '0.00',
          currency: 'BRL', checkout_url: mp.checkoutHost + '/checkout/v1/redirect?pref_id=' + id,
          items: corpo.items, config: corpo.config, transactions: { payments: [] }
        };
        orders.set(id, order); porChave.set(chave, id);
        return resposta(201, order);
      }
      const m = /^\/v1\/orders\/([A-Z0-9]+)(\/cancel)?$/.exec(u.pathname);
      if (m && orders.has(m[1])) {
        const order = orders.get(m[1]);
        if (metodo === 'POST' && m[2]) { order.status = 'cancelled'; return resposta(200, order); }
        if (metodo === 'GET' && !m[2]) return resposta(200, order);
      }
      return resposta(404, { code: 'not_found' });
    },
    // Resultado do pagamento, como o Mercado Pago mostraria ao consultar a order
    definir(id, resultado, valorPago) {
      const o = orders.get(id);
      const pago = valorPago != null ? valorPago : centavos(o.total_amount);
      const pg = (status, detalhe) => ({ id: 'PAY' + id.slice(3), status, status_detail: detalhe, amount: o.total_amount,
        paid_amount: status === 'processed' ? reais(pago) : '0.00', payment_method: { id: 'pix', type: 'bank_transfer' } });
      if (resultado === 'aprovado') { o.status = 'processed'; o.status_detail = 'accredited'; o.total_paid_amount = reais(pago); o.transactions.payments = [pg('processed', 'accredited')]; }
      if (resultado === 'recusado') { o.status = 'failed'; o.status_detail = 'failed'; o.transactions.payments = [pg('rejected', 'cc_rejected_other_reason')]; }
      if (resultado === 'pendente') { o.status = 'action_required'; o.status_detail = 'waiting_payment'; o.transactions.payments = [pg('action_required', 'waiting_transfer')]; }
      if (resultado === 'reembolsado') { o.status = 'refunded'; o.status_detail = 'refunded'; }
      return o;
    }
  };
  return mp;
}
