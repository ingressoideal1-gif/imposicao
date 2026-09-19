-- PROPOSTA, NAO APLICADA. Exige ok do mantenedor e janela operacional.
-- Alvo: e-deal/producao: public.pedidos_bancos e public.pedidos_modelos_banco.
-- Efeito: anon conserva SELECT temporariamente; perde toda escrita e privilegios
-- administrativos. authenticated/postgres/service_role ficam inalterados.
-- Impacto conhecido: NewProd sem sessao ainda possui caminhos de criar, atualizar,
-- vincular e excluir bancos diretamente; esses comandos passarao a falhar. Aplicar
-- somente aceitando gestao temporaria de bancos pelo painel web autenticado.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;

DO $revisao$
DECLARE
    nomes text[] := ARRAY['pedidos_bancos','pedidos_modelos_banco'];
    nome text;
    alvo oid;
    outros_antes jsonb;
    outros_depois jsonb;
    colunas_antes jsonb;
    colunas_depois jsonb;
BEGIN
    IF current_setting('imposition.bancos_escrita_anon_revisada',true) IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Proposta pendente do ok do mantenedor e da janela operacional';
    END IF;
    IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Executor divergente'; END IF;

    FOREACH nome IN ARRAY nomes LOOP
        alvo := to_regclass(format('public.%I',nome));
        IF alvo IS NULL OR NOT EXISTS (
            SELECT 1 FROM pg_class WHERE oid=alvo AND relkind='r'
              AND relowner=to_regrole('postgres') AND NOT relrowsecurity
        ) THEN RAISE EXCEPTION 'Tabela/dono/RLS divergente: %',nome; END IF;
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
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Papel anon privilegiado';
        END IF;

        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
          INTO outros_antes FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.oid=alvo AND a.grantee<>to_regrole('anon');
        SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
          INTO colunas_antes FROM pg_attribute
          WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;

        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM anon',nome);

        IF NOT has_table_privilege('anon',alvo,'SELECT')
           OR has_table_privilege('anon',alvo,'INSERT')
           OR has_table_privilege('anon',alvo,'UPDATE')
           OR has_table_privilege('anon',alvo,'DELETE')
           OR has_table_privilege('anon',alvo,'TRUNCATE')
           OR has_table_privilege('anon',alvo,'REFERENCES')
           OR has_table_privilege('anon',alvo,'TRIGGER')
           OR has_table_privilege('anon',alvo,'MAINTAIN') THEN
            RAISE EXCEPTION 'Pos-condicao anon divergente: %',nome;
        END IF;
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
          INTO outros_depois FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.oid=alvo AND a.grantee<>to_regrole('anon');
        SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
          INTO colunas_depois FROM pg_attribute
          WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;
        IF outros_antes IS DISTINCT FROM outros_depois OR colunas_antes IS DISTINCT FROM colunas_depois THEN
            RAISE EXCEPTION 'ACL de outros consumidores/colunas mudou: %',nome;
        END IF;
    END LOOP;
END;
$revisao$;
COMMIT;

SELECT c.relname AS tabela,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_le,
       has_table_privilege('anon',c.oid,'INSERT') AS anon_insere,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_atualiza,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_exclui
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('pedidos_bancos','pedidos_modelos_banco')
ORDER BY c.relname;
