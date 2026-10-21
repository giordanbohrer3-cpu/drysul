-- Operação da loja: histórico do pedido, retirada, aceite dos termos, estoque com reserva, limites de uso e auditoria.
-- Só acrescenta (não apaga dados). Para desfazer: worker/migrations-reverter/0002.sql (manual, com backup antes).

ALTER TABLE pedidos ADD COLUMN status_entrega TEXT NOT NULL DEFAULT 'aguardando_pagamento';
ALTER TABLE pedidos ADD COLUMN termos_versao TEXT;
ALTER TABLE pedidos ADD COLUMN termos_aceitos_em TEXT;
ALTER TABLE pedidos ADD COLUMN reserva_ate TEXT;
ALTER TABLE pedidos ADD COLUMN estoque_baixado_em TEXT;
ALTER TABLE pedidos ADD COLUMN anonimizado_em TEXT;
CREATE INDEX pedidos_por_status ON pedidos (status, criado_em);
CREATE INDEX pedidos_por_telefone ON pedidos (cliente_telefone);

-- Histórico (financeiro e retirada): quem mudou, de onde, quando
CREATE TABLE pedido_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id TEXT NOT NULL REFERENCES pedidos (id),
  tipo TEXT NOT NULL,          -- criado | pagamento | entrega | reembolso | cancelamento | anonimizado
  de TEXT, para TEXT,
  origem TEXT NOT NULL,        -- cliente | webhook | consulta | sistema | admin:<email>
  detalhe TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX pedido_eventos_por_pedido ON pedido_eventos (pedido_id, id);

-- Estoque só dos produtos que a loja cadastrar no painel; sem linha aqui = não controlado (confirmado na retirada)
CREATE TABLE estoque (
  produto_id TEXT PRIMARY KEY,
  quantidade INTEGER NOT NULL,
  reservado INTEGER NOT NULL DEFAULT 0 CHECK (reservado >= 0),
  atualizado_em TEXT NOT NULL
);
CREATE TABLE reservas (
  pedido_id TEXT NOT NULL REFERENCES pedidos (id),
  produto_id TEXT NOT NULL REFERENCES estoque (produto_id),
  qtd INTEGER NOT NULL CHECK (qtd > 0),
  estado TEXT NOT NULL DEFAULT 'ativa',   -- ativa | liberada | baixada
  PRIMARY KEY (pedido_id, produto_id)
);
CREATE TABLE estoque_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id TEXT NOT NULL,
  pedido_id TEXT,
  tipo TEXT NOT NULL,          -- reserva | liberacao | baixa | devolucao | ajuste
  qtd INTEGER NOT NULL,
  origem TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX estoque_movimentos_por_produto ON estoque_movimentos (produto_id, id);

-- Limite de requisições por IP (o IP é guardado só como resumo criptográfico)
CREATE TABLE limites (chave TEXT PRIMARY KEY, contagem INTEGER NOT NULL, janela_fim INTEGER NOT NULL);

CREATE TABLE auditoria_admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL, acao TEXT NOT NULL, alvo TEXT, detalhe TEXT, criado_em TEXT NOT NULL
);
