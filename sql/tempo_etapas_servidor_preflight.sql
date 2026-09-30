-- SOMENTE LEITURA. Projeto e-deal (vwbtitjlpelrcnsytzqw).
-- Devolve um unico resultado para exportar/copiar no SQL Editor.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'contexto', jsonb_build_object('banco',current_database(),'usuario',current_user,
     'versao',current_setting('server_version'),'somente_leitura',current_setting('transaction_read_only')),
 'colunas', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name,c.column_name) FROM (
     SELECT table_name,column_name,data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('pedidos_artes','pedidos_modelos','propostas','pedidos_links_cliente','imposition_tempo_no_card')
     AND column_name IN ('id','id_int','numero_pedido','status','status_arte','status_impressao','status_interno','entrega_dados','ativo','cliente_abriu_em','created_at')
 ) c),
 'indices', (SELECT jsonb_agg(to_jsonb(i)) FROM (
     SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
     AND tablename IN ('pedidos_artes','pedidos_modelos','propostas','pedidos_links_cliente')
 ) i),
 'gatilhos', (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
     SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definicao
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal
     AND c.relname IN ('pedidos_artes','pedidos_modelos','propostas','pedidos_links_cliente','imposition_tempo_no_card')
 ) t),
 'tabela_nova_deve_ser_null',to_regclass('public.imposition_etapas_arte'),
 'historico_deve_ser_null',to_regclass('public.imposition_etapas_arte_historico'),
 'pedidos_baseline', (SELECT count(*) FROM (
     SELECT id_int FROM public.pedidos_artes WHERE id_int IS NOT NULL
     UNION SELECT id_int FROM public.pedidos_modelos WHERE id_int IS NOT NULL
     UNION SELECT numero_pedido::bigint FROM public.pedidos_links_cliente WHERE numero_pedido ~ '^\d+$'
 ) ids),
 'relogios_legados', (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (
     SELECT id_int,card,desde,credito_segundos,atualizado_em FROM public.imposition_tempo_no_card
     WHERE id_int IN (22899,22843,22830,22816,22815,22806,22800,22602) ORDER BY id_int DESC
 ) r)
) AS preflight_tempo;
COMMIT;
