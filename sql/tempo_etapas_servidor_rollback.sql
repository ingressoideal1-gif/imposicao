-- Recuperacao operacional: interrompe os novos registros; preserva TODO o historico.
-- Restaurar tambem o frontend da entrega anterior, por revert revisado.
BEGIN;
SET LOCAL lock_timeout='5s';
DROP TRIGGER IF EXISTS etapa_arte_por_status ON public.pedidos_artes;
DROP TRIGGER IF EXISTS etapa_arte_por_modelo ON public.pedidos_modelos;
DROP TRIGGER IF EXISTS etapa_arte_por_proposta ON public.propostas;
DROP TRIGGER IF EXISTS etapa_arte_por_link ON public.pedidos_links_cliente;
COMMIT;
-- Nao apagar tabelas, historico ou horarios como parte de rollback.
