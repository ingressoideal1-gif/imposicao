-- Somente metadados. Executar antes/depois da migracao especifica IdGen.
BEGIN READ ONLY;
SELECT
  to_regclass('idgen_app.pedidos_editor')::text AS tabela_idgen,
  to_regprocedure('public.idgen_editor_operar(uuid,text,jsonb)')::text AS rpc_idgen,
  (SELECT md5(string_agg(concat_ws('|', n.nspname, c.relname, c.relrowsecurity,
      c.relforcerowsecurity, c.relacl::text), E'\n' ORDER BY n.nspname,c.relname))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p')) AS tabelas_acl_hash,
  (SELECT md5(string_agg(concat_ws('|', n.nspname, p.proname,
      pg_get_function_identity_arguments(p.oid), p.proacl::text, pg_get_functiondef(p.oid)),
      E'\n' ORDER BY p.oid))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('public','auth','storage') AND p.prokind='f'
     AND NOT (n.nspname='public' AND p.proname='idgen_editor_operar')) AS funcoes_legadas_hash,
  (SELECT md5(string_agg(row_to_json(p)::text,E'\n' ORDER BY schemaname,tablename,policyname))
   FROM pg_policies p WHERE schemaname IN ('public','auth','storage')) AS politicas_hash;
COMMIT;
