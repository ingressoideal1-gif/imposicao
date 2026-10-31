-- Somente metadados; nenhuma escrita ou dado pessoal. Alvo: projeto configurado no repositório.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT jsonb_build_object(
    'postgres', current_setting('server_version'),
    'fila_instalada', to_regnamespace('arte_fila') IS NOT NULL,
    'colunas', (SELECT jsonb_agg(to_jsonb(c)) FROM (
        SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
        FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('pedidos_artes','pedidos_modelos','produtos_proposta','propostas',
            'usuarios','pedidos_links_cliente','imposition_user_permissions')
        AND (column_name IN ('id','id_int','status','status_interno','status_arte','amostra_status',
            'status_impressao','impressao','entrega_dados','designer_uid','designer_nome','created_at',
            'user_id','nome_usuario','setor','numero_pedido','ativo','cliente_abriu_em','role',
            'perm_lista_arte_view','perm_lista_arte_edit','empresa_id','id_empresa','tenant_id')
            OR (is_nullable='NO' AND column_default IS NULL))
        ORDER BY table_name,ordinal_position
    ) c),
    'indices', (SELECT jsonb_agg(to_jsonb(i)) FROM (
        SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
        AND tablename IN ('pedidos_artes','pedidos_modelos','produtos_proposta','propostas','usuarios','pedidos_links_cliente')
    ) i),
    'gatilhos', (SELECT jsonb_agg(to_jsonb(t)) FROM (
        SELECT c.relname AS tabela,t.tgname AS gatilho,p.proname AS funcao
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
        WHERE n.nspname='public' AND NOT t.tgisinternal
        AND c.relname IN ('pedidos_artes','pedidos_modelos','produtos_proposta','propostas','usuarios','pedidos_links_cliente')
    ) t)
) AS previa;
COMMIT;
