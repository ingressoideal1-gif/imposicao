-- Migração: Adicionar coluna modo_pdf à tabela pedidos_modelos
-- Permite que cada modelo de pedido opere no modo PDF multi-página
-- Quando ativo, desconsidera cor cadastrada e numeração cadastrada

ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS modo_pdf BOOLEAN DEFAULT false;

-- Comentário da coluna para documentação
COMMENT ON COLUMN pedidos_modelos.modo_pdf IS 'Quando true, o modelo opera em modo PDF multi-página: sem cor/numeração, upload de PDF com visualização página-a-página';
