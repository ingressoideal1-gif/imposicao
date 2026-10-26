-- Nova migracao; nao reaplicar data_do_status_impresso.sql depois desta.
-- Preparacao local: aplicar em producao somente com autorizacao e preflight.
-- Nao reconstitui datas perdidas nem altera registros existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.pedidos_modelos IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF to_regprocedure('public.carimba_status_impressao_em()') IS NULL
       OR to_regprocedure('public.carimba_status_dos_paineis()') IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'public.pedidos_modelos'::regclass
             AND tgname = 'trg_carimba_status_impressao_em' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'Precondicao mudou: conferir os gatilhos de impressao e horarios antes de aplicar.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.carimba_status_impressao_em()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    antes_impresso boolean;
    agora_impresso boolean;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        antes_impresso := upper(btrim(coalesce(OLD.status_impressao, ''))) = 'IMPRESSO';
        IF TG_OP = 'DELETE' THEN
            IF antes_impresso OR OLD.status_impressao_em IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'Modelo impresso: o registro de impressao e permanente e nao pode ser excluido.';
            END IF;
            RETURN OLD;
        END IF;
    END IF;

    agora_impresso := upper(btrim(coalesce(NEW.status_impressao, ''))) = 'IMPRESSO';
    IF TG_OP = 'INSERT' THEN
        -- O cliente nao escolhe nem antecipa a hora da confirmacao.
        NEW.status_impressao_em := CASE WHEN agora_impresso THEN statement_timestamp() ELSE NULL END;
        RETURN NEW;
    END IF;

    IF antes_impresso THEN
        IF NOT agora_impresso THEN
            IF upper(btrim(coalesce(NEW.status_impressao, ''))) <> 'AGUARDANDO'
               OR current_setting('imposition.retorno_manual_modelo', true) IS DISTINCT FROM OLD.id::text THEN
                RAISE EXCEPTION USING ERRCODE = '23514',
                    MESSAGE = 'Modelo impresso: retornar a Aguardando exige a acao manual do operador.';
            END IF;
            NEW.status_impressao_em := OLD.status_impressao_em;
            RETURN NEW;
        END IF;
        -- Repeticao, caixa/espacos e payloads antigos nao renovam os carimbos.
        NEW.status_impressao := OLD.status_impressao;
        NEW.status_impressao_em := OLD.status_impressao_em;
        NEW.status_impressao_registrado_em := OLD.status_impressao_registrado_em;
        IF NEW.acabamento_status IS NOT DISTINCT FROM OLD.acabamento_status THEN
            NEW.acabamento_status_registrado_em := OLD.acabamento_status_registrado_em;
        END IF;
    ELSIF OLD.status_impressao_em IS NOT NULL THEN
        -- Preservar tambem evidencias legadas; nao inventar uma nova hora.
        NEW.status_impressao_em := OLD.status_impressao_em;
    ELSE
        NEW.status_impressao_em := CASE WHEN agora_impresso THEN statement_timestamp() ELSE NULL END;
    END IF;
    RETURN NEW;
END;
$$;

-- UPDATE sem lista de colunas: protege tambem PATCH apenas no horario.
DROP TRIGGER trg_carimba_status_impressao_em ON public.pedidos_modelos;
CREATE TRIGGER trg_carimba_status_impressao_em
BEFORE INSERT OR UPDATE OR DELETE ON public.pedidos_modelos
FOR EACH ROW EXECUTE FUNCTION public.carimba_status_impressao_em();

COMMENT ON COLUMN public.pedidos_modelos.status_impressao_em IS
    'Primeira confirmacao de impressao, permanente. Novas confirmacoes usam hora do servidor; valores legados preservados, inclusive ausencia de hora. Reimpressao nao renova o carimbo.';
COMMENT ON FUNCTION public.carimba_status_impressao_em() IS
    'Protege hora original e impede regressao automatica. Retorno manual via RPC preserva a impressao anterior. SECURITY INVOKER.';

-- Operacao explicita, sem elevar privilegios: respeita grants e RLS da tabela.
-- Lock + carimbo esperado recusam uma tela antiga e repeticao da mesma acao.
CREATE FUNCTION public.retornar_impressao_aguardando(
    p_modelo_id bigint, p_pedido_id bigint, p_status_registrado_em timestamptz
)
RETURNS SETOF public.pedidos_modelos
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    modelo public.pedidos_modelos%ROWTYPE;
    anterior text;
BEGIN
    SELECT * INTO modelo FROM public.pedidos_modelos
    WHERE id=p_modelo_id AND id_int=p_pedido_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Modelo nao encontrado ou sem acesso.';
    END IF;
    IF upper(btrim(coalesce(modelo.status_impressao,''))) <> 'IMPRESSO'
       OR modelo.status_impressao_registrado_em IS DISTINCT FROM p_status_registrado_em THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='O status mudou. Atualize o pedido antes de retornar a Aguardando.';
    END IF;
    anterior := current_setting('imposition.retorno_manual_modelo', true);
    PERFORM set_config('imposition.retorno_manual_modelo', p_modelo_id::text, true);
    UPDATE public.pedidos_modelos SET status_impressao='Aguardando'
    WHERE id=p_modelo_id AND id_int=p_pedido_id RETURNING * INTO modelo;
    IF NOT FOUND OR modelo.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Retorno nao confirmado pelo banco.';
    END IF;
    PERFORM set_config('imposition.retorno_manual_modelo', coalesce(anterior,''), true);
    RETURN NEXT modelo;
END;
$$;
REVOKE ALL ON FUNCTION public.retornar_impressao_aguardando(bigint,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retornar_impressao_aguardando(bigint,bigint,timestamptz) TO anon, authenticated, service_role;
COMMIT;
