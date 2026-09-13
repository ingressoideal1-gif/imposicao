-- Padroniza a capitalização do status consolidado do pedido.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pedidos_artes_enviar_arte_backup_20260913 AS
SELECT id, status AS status_anterior
  FROM public.pedidos_artes
 WHERE false;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_artes_enviar_arte_backup_20260913_id_idx
    ON public.pedidos_artes_enviar_arte_backup_20260913 (id);

INSERT INTO public.pedidos_artes_enviar_arte_backup_20260913 (id, status_anterior)
SELECT id, status
  FROM public.pedidos_artes
 WHERE status = 'ENVIAR ARTE'
ON CONFLICT DO NOTHING;

UPDATE public.pedidos_artes
   SET status = 'Enviar Arte'
 WHERE status = 'ENVIAR ARTE';

COMMIT;

-- Verificação:
-- SELECT status, count(*) FROM public.pedidos_artes
--  WHERE upper(btrim(coalesce(status, ''))) = 'ENVIAR ARTE'
--  GROUP BY status ORDER BY status;
