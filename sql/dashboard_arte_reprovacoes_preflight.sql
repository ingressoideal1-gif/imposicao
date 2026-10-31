BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT current_database() AS banco,
    to_regclass('public.imposition_reprovacoes_arte') AS registro_deve_ser_null,
    to_regclass('public.imposition_reprovacoes_inicio') AS inicio_deve_ser_null;
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND (
    (table_name='propostas' AND column_name IN ('id_int','vendedor')) OR
    (table_name='pedidos_artes' AND column_name IN ('id','id_int','status','designer_nome','created_at','reprovacao_acao')) OR
    (table_name='pedidos_modelos' AND column_name IN ('id','id_int','status_arte','reprovacao_acao')))
ORDER BY table_name,column_name;
SELECT tablename, policyname, roles, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('propostas','pedidos_artes','pedidos_modelos');
COMMIT;
