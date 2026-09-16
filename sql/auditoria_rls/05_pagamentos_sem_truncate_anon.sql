-- e-deal / producao / vwbtitjlpelrcnsytzqw.
-- Somente REVOKE TRUNCATE de anon; nenhum TRUNCATE executado.
-- Mantem todos os demais ACLs, inclusive de coluna, authenticated e service_role.
-- Pressupoe revisao 04 aplicada. Falhas abortam a transacao; nao reabrir anon.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;
DO $revisao$
DECLARE
    alvo oid := to_regclass('public.pagamentos_v2');
    esperado jsonb;
    depois jsonb;
    colunas_antes jsonb;
    colunas_depois jsonb;
BEGIN
    IF current_setting('imposition.pagamentos_truncate_anon_revisado',true) IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Revisao de consumidores ausente';
    END IF;
    IF current_user <> 'postgres' OR alvo IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_class WHERE oid=alvo AND relkind='r' AND relrowsecurity
            AND relowner=to_regrole('postgres')
    ) THEN RAISE EXCEPTION 'Executor, tabela ou RLS divergente'; END IF;
    IF has_table_privilege('anon',alvo,'DELETE') OR NOT has_table_privilege('anon',alvo,'TRUNCATE')
        OR NOT has_table_privilege('anon',alvo,'SELECT') THEN
        RAISE EXCEPTION 'Baseline diferente da revisao 04';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Papel anon privilegiado';
    END IF;
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      INTO esperado FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE c.oid=alvo AND NOT (a.grantee=to_regrole('anon') AND a.privilege_type='TRUNCATE');
    SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
      INTO colunas_antes FROM pg_attribute WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;

    REVOKE TRUNCATE ON TABLE public.pagamentos_v2 FROM anon;

    IF has_table_privilege('anon',alvo,'TRUNCATE') THEN
        RAISE EXCEPTION 'TRUNCATE herdado; reverter e revisar';
    END IF;
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      INTO depois FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=alvo;
    SELECT jsonb_agg(jsonb_build_object('coluna',attname,'acl',attacl::text) ORDER BY attnum)
      INTO colunas_depois FROM pg_attribute WHERE attrelid=alvo AND attnum>0 AND NOT attisdropped;
    IF esperado IS DISTINCT FROM depois OR colunas_antes IS DISTINCT FROM colunas_depois THEN
        RAISE EXCEPTION 'ACLs diferentes do efeito previsto';
    END IF;
END;
$revisao$;
COMMIT;
SELECT has_table_privilege('anon','public.pagamentos_v2','TRUNCATE') AS anon_esvazia;
