-- Aplicar antes de publicar o frontend correspondente.
-- Não usa updated_at para inventar histórico de status antigos.
-- Prévia: SELECT count(*) FROM public.pedidos_modelos;
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
    IF to_regprocedure('public.carimba_status_dos_paineis()') IS NOT NULL
       OR EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='pedidos_modelos'
           AND column_name IN ('status_impressao_registrado_em','acabamento_status_registrado_em')) THEN
        RAISE EXCEPTION 'Precondicao mudou: registro de horarios ja existe. Conferir antes de reaplicar.';
    END IF;
END;
$$;
ALTER TABLE public.pedidos_modelos
    ADD COLUMN IF NOT EXISTS status_impressao_registrado_em timestamptz,
    ADD COLUMN IF NOT EXISTS acabamento_status_registrado_em timestamptz;

CREATE OR REPLACE FUNCTION public.carimba_status_dos_paineis()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status_impressao_registrado_em := statement_timestamp();
        NEW.acabamento_status_registrado_em := statement_timestamp();
    ELSE
        IF NEW.status_impressao IS DISTINCT FROM OLD.status_impressao THEN
            NEW.status_impressao_registrado_em := statement_timestamp();
        ELSE
            NEW.status_impressao_registrado_em := OLD.status_impressao_registrado_em;
        END IF;
        -- Sem escolha manual, o acabamento deriva do status de impressão.
        IF NEW.acabamento_status IS DISTINCT FROM OLD.acabamento_status
           OR (NULLIF(BTRIM(NEW.acabamento_status), '') IS NULL
               AND NEW.status_impressao IS DISTINCT FROM OLD.status_impressao) THEN
            NEW.acabamento_status_registrado_em := statement_timestamp();
        ELSE
            NEW.acabamento_status_registrado_em := OLD.acabamento_status_registrado_em;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_carimba_status_dos_paineis
BEFORE INSERT OR UPDATE ON public.pedidos_modelos
FOR EACH ROW EXECUTE FUNCTION public.carimba_status_dos_paineis();
COMMIT;

-- Verificação após aplicação:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='pedidos_modelos'
-- AND column_name IN ('status_impressao_registrado_em','acabamento_status_registrado_em');
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.pedidos_modelos'::regclass
-- AND tgname='trg_carimba_status_dos_paineis';
-- Recuperação: restaurar primeiro o frontend anterior. Para interromper novos
-- carimbos, remover somente trg_carimba_status_dos_paineis e sua função em
-- transação autorizada; manter as colunas para preservar os horários coletados.
-- Os gatilhos antigos de Impresso/Pronto permanecem intactos.
