-- PROPOSTA PARA REVISAO, NAO APLICADA. Nao executar pelo coletor de leitura.
-- Alvo: e-deal / producao / vwbtitjlpelrcnsytzqw / public.pagamentos_v2.
-- Baseline: coleta 20260916T101419582Z-d7541dc6, PostgreSQL 17.4.
-- Efeito: retirar somente DELETE direto de anon. Zero linhas de negocio alteradas.
-- Antes de aplicar: revisar outros consumidores do ERP, testar em ambiente isolado
-- e configurar imposition.pagamentos_delete_anon_revisado=sim na sessao aprovada.
-- Confirmar projeto pela conexao: current_database() nao identifica project ref.
-- Nao altera SELECT, authenticated, service_role, policies, RPCs ou financeiro.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

DO $revisao$
DECLARE
    alvo oid := pg_catalog.to_regclass('public.pagamentos_v2');
    antes jsonb;
    depois jsonb;
BEGIN
    IF current_setting('imposition.pagamentos_delete_anon_revisado', true) IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Proposta pendente de revisao de consumidores e validacao isolada';
    END IF;
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Aplicar somente pelo responsavel do banco no contexto revisado';
    END IF;
    IF alvo IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        WHERE c.oid = alvo AND c.relkind = 'r' AND c.relrowsecurity
          AND c.relowner = pg_catalog.to_regrole('postgres')
    ) THEN
        RAISE EXCEPTION 'Tabela, dono ou RLS diferente do baseline';
    END IF;
    IF pg_catalog.to_regrole('anon') IS NULL
       OR pg_catalog.to_regrole('authenticated') IS NULL
       OR pg_catalog.to_regrole('service_role') IS NULL THEN
        RAISE EXCEPTION 'Papeis esperados ausentes';
    END IF;
    IF NOT pg_catalog.has_table_privilege('anon', alvo, 'SELECT')
       OR NOT pg_catalog.has_table_privilege('anon', alvo, 'DELETE')
       OR pg_catalog.has_any_column_privilege('anon', alvo, 'INSERT')
       OR pg_catalog.has_any_column_privilege('anon', alvo, 'UPDATE') THEN
        RAISE EXCEPTION 'Privilegios anon divergentes; reavaliar o snapshot, nao forcar';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
               WHERE rolname = 'anon' AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Papel anon possui privilegio inesperado';
    END IF;

    -- Compara todos os grants efetivos destes papeis antes/depois, inclusive
    -- MAINTAIN (PostgreSQL 17+) enumerado pelo ACL do baseline.
    SELECT jsonb_agg(jsonb_build_object('papel', r.rolname, 'privilegio', p.nome,
           'permitido', pg_catalog.has_table_privilege(r.oid, alvo, p.nome))
           ORDER BY r.rolname,p.nome) INTO antes
    FROM pg_catalog.pg_roles r
    CROSS JOIN (SELECT DISTINCT a.privilege_type AS nome
                FROM pg_catalog.pg_class c
                CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
                WHERE c.oid = alvo) p
    WHERE r.rolname IN ('authenticated','service_role');

    REVOKE DELETE ON TABLE public.pagamentos_v2 FROM anon;

    IF pg_catalog.has_table_privilege('anon', alvo, 'DELETE') THEN
        RAISE EXCEPTION 'DELETE ainda herdado de outro papel/PUBLIC; rollback e revisao necessarios';
    END IF;
    IF NOT pg_catalog.has_table_privilege('anon', alvo, 'SELECT') THEN
        RAISE EXCEPTION 'Leitura anon alterada indevidamente';
    END IF;

    SELECT jsonb_agg(jsonb_build_object('papel', r.rolname, 'privilegio', p.nome,
           'permitido', pg_catalog.has_table_privilege(r.oid, alvo, p.nome))
           ORDER BY r.rolname,p.nome) INTO depois
    FROM pg_catalog.pg_roles r
    CROSS JOIN (SELECT DISTINCT a.privilege_type AS nome
                FROM pg_catalog.pg_class c
                CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
                WHERE c.oid = alvo) p
    WHERE r.rolname IN ('authenticated','service_role');
    IF antes IS DISTINCT FROM depois THEN
        RAISE EXCEPTION 'Privilegios de consumidores autenticados alterados; rollback';
    END IF;
END;
$revisao$;

COMMIT;

-- Verificacao de metadados. Nao enviar DELETE a registros reais para testar.
SELECT pg_catalog.has_table_privilege('anon','public.pagamentos_v2','SELECT') AS anon_le,
       pg_catalog.has_table_privilege('anon','public.pagamentos_v2','DELETE') AS anon_exclui,
       pg_catalog.has_table_privilege('authenticated','public.pagamentos_v2','DELETE') AS autenticado_exclui,
       pg_catalog.has_table_privilege('service_role','public.pagamentos_v2','DELETE') AS backend_exclui;

-- Recuperacao: erro antes do COMMIT reverte a transacao (encerrar com ROLLBACK
-- se a sessao permanecer abortada). Depois do COMMIT, corrigir o consumidor
-- autorizado afetado. Nao reabrir DELETE anon automaticamente.
