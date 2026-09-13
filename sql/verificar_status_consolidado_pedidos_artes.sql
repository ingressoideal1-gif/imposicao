-- Verificação somente leitura após status_consolidado_pedidos_artes.sql.
SELECT
    (SELECT count(*) FROM public.pedidos_artes
      WHERE upper(btrim(coalesce(status, ''))) = 'APROVADO'
        AND upper(btrim(coalesce(entrega_dados, ''))) <> 'APROVADO') AS aprovado_sem_entrega,
    (SELECT count(*) FROM public.pedidos_artes
      WHERE upper(btrim(coalesce(status, ''))) = 'AGUARDANDO_APROVACAO') AS aguardando_antigo,
    (SELECT count(*) FROM public.pedidos_artes
      WHERE upper(btrim(coalesce(status, ''))) = 'APROVADO PARCIAL') AS parcial_antigo,
    (SELECT count(*) FROM public.pedidos_artes
      WHERE upper(btrim(coalesce(entrega_dados, ''))) = 'CORRIGIR'
        AND status <> 'Corrigir Dados') AS correcao_sem_prioridade,
    (SELECT count(*) FROM public.pedidos_artes_status_backup_20260913) AS registros_no_backup,
    position('Em Aprovação' in pg_get_functiondef(
        'public.link_cliente_visto(text,text)'::regprocedure
    )) > 0 AS abertura_grava_em_aprovacao;
