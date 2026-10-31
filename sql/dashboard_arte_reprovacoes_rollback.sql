-- Reverter o frontend antes. Preserva integralmente o historico e as colunas.
BEGIN;
ALTER TABLE public.pedidos_modelos DISABLE TRIGGER imposition_reprovacao_modelo;
ALTER TABLE public.pedidos_artes DISABLE TRIGGER imposition_reprovacao_pedido;
COMMIT;
