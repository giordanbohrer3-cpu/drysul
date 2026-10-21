/* Utilidades do servidor: respostas JSON, erros, valores em centavos e criptografia (Web Crypto). */

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: CABECALHOS });
}

// Erro com status HTTP e código estável (o site decide o que mostrar pelo código, não pela mensagem)
export class ErroHttp extends Error {
  constructor(status, codigo, mensagem, extra) {
    super(mensagem);
    this.status = status; this.codigo = codigo; this.extra = extra || null;
  }
}

export function respostaErro(e) {
  return json(Object.assign({ erro: e.codigo, mensagem: e.message }, e.extra || {}), e.status);
}

export async function lerJson(request, limite = 16384) {
  const tipo = request.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(tipo)) throw new ErroHttp(415, 'tipo_invalido', 'Envie os dados em JSON.');
  const texto = await request.text();
  if (texto.length > limite) throw new ErroHttp(413, 'pedido_grande_demais', 'Pedido grande demais.');
  try { return JSON.parse(texto); } catch (e) { throw new ErroHttp(400, 'json_invalido', 'JSON inválido.'); }
}

export function agora() { return new Date().toISOString(); }

// Valores em centavos (inteiros) para nunca somar dinheiro em ponto flutuante
export function centavosDeTexto(v) {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(v == null ? '' : v).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}
export function textoDeCentavos(c) {
  return Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
}

const cod = new TextEncoder();
function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', cod.encode(texto)));
}
export async function hmac(chave, texto) {
  const k = await crypto.subtle.importKey('raw', cod.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, cod.encode(texto)));
}
// Comparação em tempo constante (não revela em que caractere a assinatura difere)
export function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// UUID com a forma 8-4-4-4-12 derivado de um texto: a mesma tentativa sempre gera a mesma chave
export async function uuidDe(texto) {
  const h = await sha256(texto);
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-');
}
export function aleatorio() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
