-- Drysul: pedidos e pagamentos (Cloudflare D1, SQLite).
-- Aplicar: npx wrangler d1 migrations apply DB --env teste --remote

-- Pedido feito pelo site. Preço e total são calculados pelo servidor, em centavos.
CREATE TABLE pedidos (
  id TEXT PRIMARY KEY,                 -- UUID; vai para o Mercado Pago como external_reference
  numero TEXT NOT NULL UNIQUE,         -- número curto mostrado ao cliente (DS-ddmm-XXXX)
  chave_idem TEXT NOT NULL UNIQUE,     -- Idempotency-Key enviada pelo site: o mesmo clique não cria dois pedidos
  hash_conteudo TEXT NOT NULL,         -- impede reutilizar a mesma chave com outro conteúdo
  ambiente TEXT NOT NULL CHECK (ambiente IN ('local', 'teste', 'producao')),
  status TEXT NOT NULL,                -- aguardando | pendente | pago | recusado | expirado | cancelado | reembolsado | divergente
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  entrega TEXT NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  cliente_email TEXT,
  mp_order_id TEXT,                    -- tentativa de pagamento atual
  tentativas INTEGER NOT NULL DEFAULT 0,
  codigo TEXT,                         -- código de verificação do comprovante (HMAC), gerado só quando pago
  pago_em TEXT,
  consultado_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE itens_pedido (
  pedido_id TEXT NOT NULL REFERENCES pedidos (id),
  produto_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  emb TEXT NOT NULL,
  un TEXT NOT NULL,
  qtd INTEGER NOT NULL CHECK (qtd BETWEEN 1 AND 999),
  unit_centavos INTEGER NOT NULL CHECK (unit_centavos > 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  PRIMARY KEY (pedido_id, produto_id)
);

-- Uma "order" do Mercado Pago por tentativa de pagamento
CREATE TABLE transacoes (
  mp_order_id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL REFERENCES pedidos (id),
  tentativa INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_detail TEXT,
  total_pago_centavos INTEGER NOT NULL DEFAULT 0,
  checkout_url TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX transacoes_por_pedido ON transacoes (pedido_id);

-- Pagamentos dentro de cada order (Pix, cartão...), como o Mercado Pago informa
CREATE TABLE pagamentos (
  mp_payment_id TEXT PRIMARY KEY,
  mp_order_id TEXT NOT NULL REFERENCES transacoes (mp_order_id),
  pedido_id TEXT NOT NULL REFERENCES pedidos (id),
  status TEXT,
  status_detail TEXT,
  valor_centavos INTEGER,
  metodo TEXT,
  tipo TEXT,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX pagamentos_por_pedido ON pagamentos (pedido_id);

-- Notificações recebidas (x-request-id): a mesma notificação repetida não é processada duas vezes
CREATE TABLE eventos_webhook (
  chave TEXT PRIMARY KEY,
  mp_order_id TEXT,
  acao TEXT,
  processado INTEGER NOT NULL DEFAULT 0,
  resultado TEXT,
  recebido_em TEXT NOT NULL
);
