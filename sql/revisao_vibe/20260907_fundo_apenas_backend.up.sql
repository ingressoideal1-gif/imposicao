-- Proposta de migration: Imposition / fundo do PWA / privilegios v1.
-- Aplicacao EXCLUSIVA pelo repositorio versionado do Vibe, apos revisao.
-- Pre-requisito operacional: consumidores migrados para rotas autenticadas
-- que verificam perm_admin_edit. Codigo local migrado; deploy e estacoes
-- ainda precisam de validacao. Este arquivo NAO libera a revogacao sozinho.
-- Baseline informado pelo Vibe: publicar = postgres/authenticated/service_role;
-- remover = postgres/PUBLIC/anon/authenticated/service_role.
-- Grantor postgres e ausencia de grant option para nao donos ainda exigidos.
-- Se a ACL instalada diferir, ABORTAR e revisar UP/DOWN juntos com o snapshot.
-- Nao modifica corpo de funcao, tabela, SELECT, policy ou link_cliente_*.
-- Rollback: arquivo .down.sql separado; ele restaura a escrita publica antiga.
-- A equipe deve adaptar cabecalho/controle de transacao ao seu migrador.
-- Referencia: https://www.postgresql.org/docs/current/sql-revoke.html

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
    assinatura text;
    alvo oid;
    dono oid;
    acl aclitem[];
    papel text;
    esperados oid[];
BEGIN
    -- Marcador a ser habilitado pela equipe na migration aprovada, somente
    -- depois da validacao dos consumidores. Este rascunho falha por padrao.
    IF current_setting('imposition.fundo_consumidores_validados', true) IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Consumidores do fundo ainda nao confirmados como migrados';
    END IF;
    FOREACH papel IN ARRAY ARRAY['postgres', 'anon', 'authenticated', 'service_role'] LOOP
        IF to_regrole(papel) IS NULL THEN
            RAISE EXCEPTION 'Papel esperado ausente: %', papel;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('publicar_fundo_do_pwa', 'remover_fundo_do_pwa')) <> 2 THEN
        RAISE EXCEPTION 'Quantidade de funcoes/overloads diferente do baseline';
    END IF;
    FOREACH assinatura IN ARRAY ARRAY[
        'public.publicar_fundo_do_pwa(text,numeric,text,text,text)',
        'public.remover_fundo_do_pwa()'
    ] LOOP
        alvo := to_regprocedure(assinatura);
        IF alvo IS NULL THEN RAISE EXCEPTION 'Assinatura ausente: %', assinatura; END IF;
        SELECT p.proowner, coalesce(p.proacl, acldefault('f', p.proowner))
          INTO dono, acl FROM pg_proc p WHERE p.oid = alvo;
        esperados := ARRAY[to_regrole('postgres')::oid,
                            to_regrole('authenticated')::oid,
                            to_regrole('service_role')::oid];
        IF assinatura = 'public.remover_fundo_do_pwa()' THEN
            esperados := esperados || ARRAY[0::oid, to_regrole('anon')::oid];
        END IF;
        IF dono IS DISTINCT FROM to_regrole('postgres')::oid
           OR EXISTS (SELECT 1 FROM unnest(esperados) e(papel)
                      WHERE NOT EXISTS (SELECT 1 FROM aclexplode(acl) a
                                        WHERE a.grantee = e.papel AND a.privilege_type = 'EXECUTE'))
           OR EXISTS (SELECT 1 FROM aclexplode(acl) a
                      WHERE NOT (a.grantee = ANY(esperados)) OR a.grantor <> dono
                         OR (a.grantee <> dono AND a.is_grantable)) THEN
            RAISE EXCEPTION 'ACL fora do baseline; revisar rollback antes de aplicar: %', assinatura;
        END IF;

        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated RESTRICT', assinatura);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', assinatura);

        IF has_function_privilege('anon', alvo, 'EXECUTE')
           OR has_function_privilege('authenticated', alvo, 'EXECUTE')
           OR NOT has_function_privilege('service_role', alvo, 'EXECUTE') THEN
            RAISE EXCEPTION 'Privilegios efetivos inesperados apos migracao: %', assinatura;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_proc p,
                   LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   WHERE p.oid = alvo AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
            RAISE EXCEPTION 'EXECUTE de PUBLIC permaneceu: %', assinatura;
        END IF;
    END LOOP;
END;
$migration$;

COMMIT;
