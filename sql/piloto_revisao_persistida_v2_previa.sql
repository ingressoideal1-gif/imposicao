-- Somente leitura, antes da migracao autorizada no projeto e-deal.
BEGIN READ ONLY;
SELECT current_database() AS banco,current_user AS executor,
  (SELECT count(*) FROM public.pedidos_modelos) AS modelos,
  (SELECT count(DISTINCT id_int) FROM public.pedidos_modelos WHERE id_int>0) AS sinais_previstos,
  to_regclass('public.piloto_revisoes_pedidos')::text AS tabela_v2_existente,
  to_regclass('public.piloto_revisao_catalogo')::text AS catalogo_v2_existente,
  to_regprocedure('public.piloto_snapshot_pedido(text,text,text,text)')::text AS rpc_v1;
SELECT table_schema,table_name,column_name,data_type
FROM information_schema.columns
WHERE (table_schema='public' AND table_name IN
 ('pedidos_modelos','produtos_proposta','propostas','propostas_os','pedidos_bancos',
  'pedidos_modelos_banco','pedidos_artes','producao_numeracoes','produtos','producao_mapas_teatro'))
 OR (table_schema='storage' AND table_name='objects')
ORDER BY table_schema,table_name,ordinal_position;
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE t.tgname='piloto_revisao_v2';
COMMIT;
