-- Somente leitura. Executar com o responsavel pelo banco compartilhado.
SELECT current_database() AS ambiente,
  (SELECT count(DISTINCT id_int) FROM public.pedidos_modelos WHERE id_int>0) AS sinais_previstos;

SELECT n.nspname,t.relname,g.tgname,pg_get_triggerdef(g.oid)
FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE g.tgname='piloto_revisao_v2' ORDER BY n.nspname,t.relname;
-- Esperados 11 triggers (10 tabelas public, storage.objects).
SELECT pedido,revisao,alterado_em FROM public.piloto_revisoes_pedidos
WHERE pedido IN (23161,23195,23293) ORDER BY pedido;
SELECT id,revisao,epoca FROM public.piloto_revisao_catalogo;
SELECT has_function_privilege('anon','public.piloto_snapshot_pedido_v2(text,text,text,text)','EXECUTE') AS anon_deve_ser_false,
  has_function_privilege('authenticated','public.piloto_snapshot_pedido_v2(text,text,text,text)','EXECUTE') AS authenticated_deve_ser_false,
  has_function_privilege('service_role','public.piloto_snapshot_pedido_v2(text,text,text,text)','EXECUTE') AS service_role_deve_ser_true;
