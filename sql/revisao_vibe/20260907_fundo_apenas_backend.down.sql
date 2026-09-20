-- Rollback da proposta 20260907_fundo_apenas_backend.up.sql.
-- EXCLUSIVO do Vibe, por migration versionada e decisao explicita da equipe.
-- Efeito: restaura o baseline distinto de cada RPC; somente remover reabre
-- para PUBLIC/anon. Publicar volta a authenticated, preservando service_role.
-- Nao e recuperacao automatica recomendada para um erro do frontend.
-- Exige baseline posterior sem grants paralelos; se houver divergencia, aborta.
-- Restaura privilegios equivalentes; proacl NULL versus ACL explicita pode diferir.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
    assinatura text;
    alvo oid;
    dono oid;
    servico oid := to_regrole('service_role');
    acl aclitem[];
    esperados oid[];
    papel text;
BEGIN
    IF current_setting('imposition.fundo_rollback_publico_aprovado', true) IS DISTINCT FROM 'sim' THEN
        RAISE EXCEPTION 'Rollback que reabre escrita publica nao foi aprovado';
    END IF;
    FOREACH papel IN ARRAY ARRAY['postgres', 'anon', 'authenticated', 'service_role'] LOOP
        IF to_regrole(papel) IS NULL THEN RAISE EXCEPTION 'Papel ausente: %', papel; END IF;
    END LOOP;
    FOREACH assinatura IN ARRAY ARRAY[
        'public.publicar_fundo_do_pwa(text,numeric,text,text,text)',
        'public.remover_fundo_do_pwa()'
    ] LOOP
        alvo := to_regprocedure(assinatura);
        IF alvo IS NULL THEN RAISE EXCEPTION 'Assinatura ausente: %', assinatura; END IF;
        SELECT p.proowner, coalesce(p.proacl, acldefault('f', p.proowner))
          INTO dono, acl FROM pg_proc p WHERE p.oid = alvo;
        IF dono IS DISTINCT FROM to_regrole('postgres')::oid
           OR NOT EXISTS (SELECT 1 FROM aclexplode(acl) a WHERE a.grantee = dono AND a.privilege_type = 'EXECUTE')
           OR NOT EXISTS (SELECT 1 FROM aclexplode(acl) a
                          WHERE a.grantee = servico AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable)
           OR EXISTS (SELECT 1 FROM aclexplode(acl) a
                      WHERE a.grantee NOT IN (dono, servico) OR a.grantor <> dono
                         OR (a.grantee = servico AND a.is_grantable)) THEN
            RAISE EXCEPTION 'ACL mudou apos UP; rollback exige revisao: %', assinatura;
        END IF;
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', assinatura);
        esperados := ARRAY[dono, to_regrole('authenticated')::oid, servico];
        IF assinatura = 'public.remover_fundo_do_pwa()' THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon', assinatura);
            esperados := esperados || ARRAY[0::oid, to_regrole('anon')::oid];
        END IF;
        SELECT coalesce(p.proacl, acldefault('f', p.proowner))
          INTO acl FROM pg_proc p WHERE p.oid = alvo;
        IF EXISTS (SELECT 1 FROM unnest(esperados) e(papel)
                   WHERE NOT EXISTS (SELECT 1 FROM aclexplode(acl) a
                                     WHERE a.grantee = e.papel AND a.privilege_type = 'EXECUTE'))
           OR EXISTS (SELECT 1 FROM aclexplode(acl) a
                      WHERE NOT (a.grantee = ANY(esperados)) OR a.grantor <> dono
                         OR (a.grantee <> dono AND a.is_grantable))
           OR has_function_privilege('anon', alvo, 'EXECUTE')
                IS DISTINCT FROM (assinatura = 'public.remover_fundo_do_pwa()')
           OR NOT has_function_privilege('authenticated', alvo, 'EXECUTE')
           OR NOT has_function_privilege('service_role', alvo, 'EXECUTE') THEN
            RAISE EXCEPTION 'Restauracao do baseline falhou: %', assinatura;
        END IF;
    END LOOP;
END;
$migration$;

COMMIT;
