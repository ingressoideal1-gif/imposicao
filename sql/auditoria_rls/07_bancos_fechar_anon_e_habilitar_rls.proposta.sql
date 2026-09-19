-- PROPOSTA FINAL, NAO APLICADA.
-- Exige todas as estacoes aplicaveis em NewProd >= 1.2.335, comparacao do
-- baseline de trafego, aviso de alvo/efeito/janela e ok expresso do mantenedor.
-- Alvo: e-deal/producao: public.pedidos_bancos e public.pedidos_modelos_banco.
-- Efeito: remove todo privilegio de anon e habilita RLS sem policy direta.
-- O painel e o NewProd usam Edge Functions com service_role. O portal publico
-- conserva somente a RPC SECURITY DEFINER validada abaixo.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;

DO $revisao$
DECLARE
    nomes text[] := ARRAY['pedidos_bancos','pedidos_modelos_banco'];
    nome text;
    alvo oid;
    rpc oid := to_regprocedure('public.link_cliente_bancos_modelos(text,text)');
    outros_antes jsonb;
    outros_depois jsonb;
    colunas_antes jsonb;
    colunas_depois jsonb;
BEGIN
    IF current_setting('imposition.bancos_fechamento_anon_revisado',true)
       IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Fechamento pendente do ok do mantenedor e da janela operacional';
    END IF;
    IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Executor divergente'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
       OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Papeis de acesso divergentes';
    END IF;
    IF rpc IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid=rpc AND proowner=to_regrole('postgres') AND prosecdef
          AND COALESCE(array_to_string(proconfig,','),'') LIKE '%search_path=pg_catalog, public%'
    ) OR NOT has_function_privilege('anon',rpc,'EXECUTE') THEN
        RAISE EXCEPTION 'RPC publica de bancos ausente ou divergente';
    END IF;

    FOREACH nome IN ARRAY nomes LOOP
        alvo := to_regclass(format('public.%I',nome));
        IF alvo IS NULL OR NOT EXISTS (
            SELECT 1 FROM pg_class WHERE oid=alvo AND relkind='r'
              AND relowner=to_regrole('postgres') AND NOT relrowsecurity
        ) THEN RAISE EXCEPTION 'Tabela/dono/RLS divergente: %',nome; END IF;
        IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=alvo) THEN
            RAISE EXCEPTION 'Policy inesperada: %',nome;
        END IF;
        IF NOT has_table_privilege('anon',alvo,'SELECT')
           OR NOT has_table_privilege('anon',alvo,'INSERT')
           OR NOT has_table_privilege('anon',alvo,'UPDATE')
           OR NOT has_table_privilege('anon',alvo,'DELETE')
           OR NOT has_table_privilege('anon',alvo,'TRUNCATE')
           OR NOT has_table_privilege('anon',alvo,'REFERENCES')
           OR NOT has_table_privilege('anon',alvo,'TRIGGER')
           OR NOT has_table_privilege('anon',alvo,'MAINTAIN') THEN
            RAISE EXCEPTION 'ACL anon divergente: %',nome;
        END IF;

        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
          INTO outros_antes FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.oid=alvo AND a.grantee<>to_regrole('anon');
        SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
          INTO colunas_antes FROM pg_attribute
          WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;

        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon',nome);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',nome);

        IF has_table_privilege('anon',alvo,'SELECT')
           OR has_table_privilege('anon',alvo,'INSERT')
           OR has_table_privilege('anon',alvo,'UPDATE')
           OR has_table_privilege('anon',alvo,'DELETE')
           OR has_table_privilege('anon',alvo,'TRUNCATE')
           OR has_table_privilege('anon',alvo,'REFERENCES')
           OR has_table_privilege('anon',alvo,'TRIGGER')
           OR has_table_privilege('anon',alvo,'MAINTAIN')
           OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=alvo)
           OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=alvo) THEN
            RAISE EXCEPTION 'Pos-condicao de fechamento divergente: %',nome;
        END IF;
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
          INTO outros_depois FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.oid=alvo AND a.grantee<>to_regrole('anon');
        SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
          INTO colunas_depois FROM pg_attribute
          WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;
        IF outros_antes IS DISTINCT FROM outros_depois
           OR colunas_antes IS DISTINCT FROM colunas_depois THEN
            RAISE EXCEPTION 'ACL de outros consumidores/colunas mudou: %',nome;
        END IF;
    END LOOP;
END;
$revisao$;
COMMIT;

SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_le,
       has_table_privilege('anon',c.oid,'INSERT') AS anon_insere,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_atualiza,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_exclui,
       has_table_privilege('anon',c.oid,'TRUNCATE') AS anon_trunca,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('pedidos_bancos','pedidos_modelos_banco')
ORDER BY c.relname;
