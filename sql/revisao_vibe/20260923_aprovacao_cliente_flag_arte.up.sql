-- Aplicada em producao via SQL Editor em 23/09/2026, conforme relato do usuario
-- e releitura independente dos metadados. Incorporar no versionamento do ERP.
-- Corrige o trigger de pedidos_modelos: anon pode decidir a arte, mas nao pode
-- mais atualizar propostas.em_arte desde a revogacao de 22/09/2026.
-- Nao concede privilegios de tabela a anon nem muda o corpo da funcao.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
DECLARE
    v_funcao oid := to_regprocedure('public.atualiza_flag_arte_proposta()');
    v_proc pg_proc%ROWTYPE;
    v_gatilhos integer;
BEGIN
    IF v_funcao IS NULL THEN
        RAISE EXCEPTION 'funcao de sincronizacao da arte nao encontrada';
    END IF;
    SELECT * INTO v_proc FROM pg_proc WHERE oid = v_funcao;
    IF v_proc.proowner IS DISTINCT FROM to_regrole('postgres')
       OR v_proc.prosecdef
       OR EXISTS (SELECT 1 FROM unnest(coalesce(v_proc.proconfig, ARRAY[]::text[])) c
                   WHERE c LIKE 'search_path=%')
       OR v_proc.prosrc NOT ILIKE '%UPDATE public.propostas%'
       OR v_proc.prosrc NOT ILIKE '%SET em_arte = v_has_arte_pendente%' THEN
        RAISE EXCEPTION 'definicao ou proprietario divergente da funcao de arte';
    END IF;
    SELECT count(*) INTO v_gatilhos FROM pg_trigger
     WHERE tgfoid = v_funcao AND NOT tgisinternal;
    IF v_gatilhos <> 1 THEN
        RAISE EXCEPTION 'numero de gatilhos da funcao divergente';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgfoid = v_funcao
           AND tgrelid = 'public.pedidos_modelos'::regclass
           AND tgname = 'trg_sync_arte_pendente'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'gatilho de pedidos_modelos divergente';
    END IF;
    IF has_table_privilege('anon', 'public.propostas', 'UPDATE')
       OR NOT has_table_privilege('postgres', 'public.propostas', 'UPDATE') THEN
        RAISE EXCEPTION 'privilegios de propostas divergentes';
    END IF;
END;
$preflight$;

ALTER FUNCTION public.atualiza_flag_arte_proposta() SECURITY DEFINER;
ALTER FUNCTION public.atualiza_flag_arte_proposta()
    SET search_path = pg_catalog, public;

DO $verificacao$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
         WHERE p.oid = 'public.atualiza_flag_arte_proposta()'::regprocedure
           AND p.proowner = to_regrole('postgres')
           AND p.prosecdef
           AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                        WHERE c = 'search_path=pg_catalog, public')
    ) OR has_table_privilege('anon', 'public.propostas', 'UPDATE') THEN
        RAISE EXCEPTION 'seguranca da funcao nao confirmada';
    END IF;
END;
$verificacao$;
COMMIT;
