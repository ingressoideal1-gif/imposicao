-- Inventario de seguranca: somente catalogos, sem executar funcoes da aplicacao.
-- Alvo confirmado pelo usuario: e-deal / producao / vwbtitjlpelrcnsytzqw.
-- Revisar projeto/conexao ANTES de executar.
-- O rotulo nao comprova a identidade do servidor; conferir no painel/conexao.
-- Guardar o JSON fora do Git. Expressoes de policies podem conter literais privados.
-- Nao retorna corpos de funcoes, dados comerciais, tokens ou objetos do Storage.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog;

WITH
contexto AS (
    SELECT 'vwbtitjlpelrcnsytzqw'::text AS projeto,
           'producao'::text AS ambiente
),
-- Todos os schemas nao internos: nao presumir que apenas public e exposto.
schemas AS (
    SELECT n.oid, n.nspname, n.nspowner, n.nspacl
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
      AND n.nspname <> 'information_schema'
),
papeis_api AS (
    SELECT oid, rolname, rolsuper, rolbypassrls, rolinherit
    FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
),
relacoes AS (
    SELECT c.*, n.nspname AS schema
    FROM pg_catalog.pg_class c JOIN schemas n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
funcoes AS (
    SELECT p.*, n.nspname AS schema
    FROM pg_catalog.pg_proc p JOIN schemas n ON n.oid = p.pronamespace
    WHERE p.prokind IN ('f', 'p')
),
politicas AS (
    SELECT c.schema, c.relname AS tabela, p.polname AS nome,
           p.polcmd::text AS comando, p.polpermissive AS permissiva,
           ARRAY(SELECT CASE WHEN papel = 0 THEN 'PUBLIC'
                             ELSE pg_catalog.pg_get_userbyid(papel)::text END
                 FROM unnest(p.polroles) papel ORDER BY 1) AS papeis,
           ARRAY(SELECT r.rolname::text FROM papeis_api r
                 WHERE EXISTS (SELECT 1 FROM unnest(p.polroles) papel
                               WHERE CASE WHEN papel = 0 THEN true
                                     ELSE pg_catalog.pg_has_role(r.oid, papel, 'USAGE') END)
                 ORDER BY 1) AS papeis_efetivos,
           pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS usando,
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS verificando
    FROM pg_catalog.pg_policy p JOIN relacoes c ON c.oid = p.polrelid
),
acessos AS (
    SELECT c.schema, c.relname AS tabela, r.rolname AS papel,
           pg_catalog.has_schema_privilege(r.oid, c.relnamespace, 'USAGE') AS schema_usage,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') AS selecionar,
           pg_catalog.has_any_column_privilege(r.oid, c.oid, 'SELECT') AS selecionar_coluna,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') AS inserir,
           pg_catalog.has_any_column_privilege(r.oid, c.oid, 'INSERT') AS inserir_coluna,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') AS atualizar,
           pg_catalog.has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS atualizar_coluna,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS excluir,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS truncar,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES') AS referenciar,
           pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER') AS criar_trigger,
           (r.rolsuper OR r.rolbypassrls OR
             (pg_catalog.pg_has_role(r.oid, c.relowner, 'USAGE') AND NOT c.relforcerowsecurity))
             AS ignora_rls
    FROM relacoes c CROSS JOIN papeis_api r
),
acl_tabelas AS (
    SELECT c.schema, c.relname AS tabela,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END AS destinatario,
           pg_catalog.pg_get_userbyid(a.grantor) AS concedente,
           a.privilege_type AS privilegio, a.is_grantable AS pode_conceder
    FROM relacoes c CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
),
acl_colunas AS (
    SELECT c.schema, c.relname AS tabela, att.attname AS coluna,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END AS destinatario,
           pg_catalog.pg_get_userbyid(a.grantor) AS concedente,
           a.privilege_type AS privilegio, a.is_grantable AS pode_conceder
    FROM relacoes c JOIN pg_catalog.pg_attribute att ON att.attrelid = c.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a
    WHERE att.attnum > 0 AND NOT att.attisdropped
),
metadados_funcoes AS (
    SELECT p.schema, p.proname AS nome,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos,
           pg_catalog.pg_get_userbyid(p.proowner) AS dono,
           p.prosecdef AS security_definer,
           (SELECT substr(opcao, 13) FROM unnest(p.proconfig) opcao
            WHERE opcao LIKE 'search_path=%' LIMIT 1) AS search_path,
           pg_catalog.md5(p.prosrc) AS hash_corpo_para_comparacao,
           coalesce((SELECT jsonb_agg(jsonb_build_object(
               'papel', r.rolname,
               'schema_usage', pg_catalog.has_schema_privilege(r.oid, p.pronamespace, 'USAGE'),
               'executar', pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE'))
               ORDER BY r.rolname) FROM papeis_api r), '[]'::jsonb) AS acessos,
           coalesce((SELECT jsonb_agg(jsonb_build_object(
               'destinatario', CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                   ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,
               'concedente', pg_catalog.pg_get_userbyid(a.grantor),
               'privilegio', a.privilege_type, 'pode_conceder', a.is_grantable))
               FROM pg_catalog.aclexplode(coalesce(p.proacl,
                    pg_catalog.acldefault('f', p.proowner))) a), '[]'::jsonb) AS acl
    FROM funcoes p
),
padroes AS (
    SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS dono,
           CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE n.nspname END AS schema,
           d.defaclobjtype::text AS tipo,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END AS destinatario,
           a.privilege_type AS privilegio, a.is_grantable AS pode_conceder
    FROM pg_catalog.pg_default_acl d LEFT JOIN schemas n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace = 0 OR n.oid IS NOT NULL
),
gatilhos AS (
    SELECT c.schema, c.relname AS tabela, t.tgname AS nome,
           t.tgenabled::text AS habilitado, t.tgtype AS tipo,
           n.nspname AS funcao_schema, p.proname AS funcao,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos
    FROM pg_catalog.pg_trigger t JOIN relacoes c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE NOT t.tgisinternal
),
dependencias_views AS (
    SELECT DISTINCT v.schema, v.relname AS view,
           n.nspname AS origem_schema, c.relname AS origem
    FROM relacoes v JOIN pg_catalog.pg_rewrite w ON w.ev_class = v.oid
    JOIN pg_catalog.pg_depend d ON d.classid = 'pg_catalog.pg_rewrite'::regclass
         AND d.objid = w.oid AND d.refclassid = 'pg_catalog.pg_class'::regclass
    JOIN pg_catalog.pg_class c ON c.oid = d.refobjid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE v.relkind IN ('v', 'm') AND c.oid <> v.oid
)
SELECT jsonb_build_object(
    'formato', 'imposition-rls-v1',
    'contexto', (SELECT jsonb_build_object(
        'projeto', projeto, 'ambiente', ambiente,
        'coletado_em', current_timestamp, 'banco', current_database(),
        'usuario_coleta', current_user,
        'server_version_num', current_setting('server_version_num')::integer,
        'read_only', current_setting('transaction_read_only') = 'on',
        'schemas_api_na_sessao', current_setting('pgrst.db_schemas', true),
        'limites', ARRAY['Sem dados de negocio ou execucao de funcoes da aplicacao',
            'Configuracao efetiva da Data API e Edge Functions exige conferencia externa',
            'Buckets e fluxos reais ainda precisam de validacao',
            'Dependencias dinamicas de funcoes e triggers exigem revisao separada']
    ) FROM contexto),
    'papeis', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'nome', rolname, 'superuser', rolsuper, 'bypassrls', rolbypassrls,
        'herda', rolinherit) ORDER BY rolname) FROM papeis_api), '[]'::jsonb),
    'schemas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'nome', n.nspname, 'dono', pg_catalog.pg_get_userbyid(n.nspowner),
        'acessos', (SELECT jsonb_agg(jsonb_build_object(
            'papel', r.rolname,
            'usar', pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE'),
            'criar', pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE'))
            ORDER BY r.rolname) FROM papeis_api r)) ORDER BY n.nspname) FROM schemas n), '[]'::jsonb),
    'relacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'schema', c.schema, 'nome', c.relname, 'tipo', c.relkind::text,
        'dono', pg_catalog.pg_get_userbyid(c.relowner),
        'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
        'security_invoker', coalesce('security_invoker=true' = ANY(c.reloptions), false))
        ORDER BY c.schema, c.relname) FROM relacoes c), '[]'::jsonb),
    'politicas', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY schema,tabela,nome) FROM politicas p), '[]'::jsonb),
    'acessos', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY schema,tabela,papel) FROM acessos a), '[]'::jsonb),
    'acl_tabelas', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM acl_tabelas a), '[]'::jsonb),
    'acl_colunas', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM acl_colunas a), '[]'::jsonb),
    'colunas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'schema', c.schema, 'tabela', c.relname, 'nome', a.attname,
        'tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull) ORDER BY c.schema,c.relname,a.attnum)
        FROM relacoes c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        WHERE a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
    'constraints', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'schema', c.schema, 'tabela', c.relname, 'nome', k.conname,
        'tipo', k.contype::text, 'validada', k.convalidated,
        'colunas', ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(attnum, ordem)
                         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = x.attnum
                         ORDER BY x.ordem),
        'referencia_schema', n.nspname, 'referencia_tabela', origem.relname,
        'colunas_referenciadas', ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(attnum, ordem)
                         JOIN pg_catalog.pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = x.attnum
                         ORDER BY x.ordem)))
        FROM pg_catalog.pg_constraint k JOIN relacoes c ON c.oid = k.conrelid
        LEFT JOIN pg_catalog.pg_class origem ON origem.oid = k.confrelid
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = origem.relnamespace), '[]'::jsonb),
    'indices', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'schema', c.schema, 'tabela', c.relname, 'nome', ic.relname,
        'unico', i.indisunique, 'valido', i.indisvalid, 'parcial', i.indpred IS NOT NULL,
        'chaves', ARRAY(SELECT CASE WHEN x.attnum = 0 THEN '(expressao)' ELSE a.attname::text END
                       FROM unnest(i.indkey) WITH ORDINALITY x(attnum, ordem)
                       LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = x.attnum
                       WHERE x.ordem <= i.indnkeyatts ORDER BY x.ordem)))
        FROM pg_catalog.pg_index i JOIN relacoes c ON c.oid = i.indrelid
        JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid), '[]'::jsonb),
    'funcoes', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY schema,nome,argumentos) FROM metadados_funcoes f), '[]'::jsonb),
    'privilegios_padrao', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM padroes p), '[]'::jsonb),
    'gatilhos', coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM gatilhos g), '[]'::jsonb),
    'dependencias_views', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM dependencias_views v), '[]'::jsonb),
    'herancas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'membro', pg_catalog.pg_get_userbyid(m.member),
        'papel', pg_catalog.pg_get_userbyid(m.roleid),
        'admin_option', m.admin_option)) FROM pg_catalog.pg_auth_members m), '[]'::jsonb),
    'publicacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'nome', p.pubname, 'todas_tabelas', p.puballtables,
        'insert', p.pubinsert, 'update', p.pubupdate, 'delete', p.pubdelete))
        FROM pg_catalog.pg_publication p), '[]'::jsonb),
    'publicacao_tabelas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'publicacao', p.pubname, 'schema', p.schemaname, 'tabela', p.tablename))
        FROM pg_catalog.pg_publication_tables p), '[]'::jsonb)
) AS auditoria_rls;

ROLLBACK;
