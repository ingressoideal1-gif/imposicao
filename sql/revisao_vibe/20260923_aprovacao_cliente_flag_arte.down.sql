-- ROLLBACK LOCAL, NAO APLICADO. Recria a falha de aprovacao anonima enquanto
-- o fluxo continuar atualizando propostas por este trigger.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
         WHERE p.oid = to_regprocedure('public.atualiza_flag_arte_proposta()')
           AND p.proowner = to_regrole('postgres')
           AND p.prosecdef
           AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                        WHERE c = 'search_path=pg_catalog, public')
    ) THEN
        RAISE EXCEPTION 'estado da funcao divergente; rollback interrompido';
    END IF;
END;
$preflight$;

ALTER FUNCTION public.atualiza_flag_arte_proposta() SECURITY INVOKER;
ALTER FUNCTION public.atualiza_flag_arte_proposta() RESET search_path;

DO $verificacao$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
         WHERE p.oid = 'public.atualiza_flag_arte_proposta()'::regprocedure
           AND NOT p.prosecdef
           AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                            WHERE c LIKE 'search_path=%')
    ) THEN
        RAISE EXCEPTION 'rollback da funcao nao confirmado';
    END IF;
END;
$verificacao$;
COMMIT;
