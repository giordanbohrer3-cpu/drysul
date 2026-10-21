-- Desfaz 0002_operacao.sql. NÃO roda sozinho: faça backup (wrangler d1 export) e rode à mão, só com autorização.
DROP TABLE IF EXISTS auditoria_admin;
DROP TABLE IF EXISTS limites;
DROP TABLE IF EXISTS estoque_movimentos;
DROP TABLE IF EXISTS reservas;
DROP TABLE IF EXISTS estoque;
DROP TABLE IF EXISTS pedido_eventos;
DROP INDEX IF EXISTS pedidos_por_telefone;
DROP INDEX IF EXISTS pedidos_por_status;
ALTER TABLE pedidos DROP COLUMN anonimizado_em;
ALTER TABLE pedidos DROP COLUMN estoque_baixado_em;
ALTER TABLE pedidos DROP COLUMN reserva_ate;
ALTER TABLE pedidos DROP COLUMN termos_aceitos_em;
ALTER TABLE pedidos DROP COLUMN termos_versao;
ALTER TABLE pedidos DROP COLUMN status_entrega;
DELETE FROM d1_migrations WHERE name = '0002_operacao.sql';
