-- Ideal Control: zeramento e recebimento de leituras concorrentes.
-- Preparado em 22/09/2026. Aplicar somente com autorização para o banco alvo.
-- Pré-requisito: schema_acesso_zerar_entradas.sql e schema_acesso_entradas_unicas.sql.
-- A instalação não zera eventos nem altera registros existentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.producao_acesso_respeitar_zeramento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    corte timestamptz;
BEGIN
    -- Leitores concorrentes compartilham o lock. O zeramento exige FOR UPDATE
    -- e só prossegue quando as inserções anteriores terminarem (e vice-versa).
    SELECT entradas_zeradas_em INTO corte
      FROM public.producao_acesso_eventos
     WHERE id = NEW.evento_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'evento inexistente' USING ERRCODE = '23503';
    END IF;
    -- O botão já apaga as leituras anteriores. Um reenvio tardio recebe o
    -- mesmo tratamento: é confirmado sem reinseri-lo na contagem nova.
    IF corte IS NOT NULL AND NEW.momento <= corte THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acesso_leitura_respeitar_zeramento ON public.producao_acesso_leituras;
CREATE TRIGGER trg_acesso_leitura_respeitar_zeramento
    BEFORE INSERT ON public.producao_acesso_leituras
    FOR EACH ROW EXECUTE FUNCTION public.producao_acesso_respeitar_zeramento();

DROP TRIGGER IF EXISTS trg_acesso_entrada_respeitar_zeramento ON public.producao_acesso_entradas_unicas;
CREATE TRIGGER trg_acesso_entrada_respeitar_zeramento
    BEFORE INSERT ON public.producao_acesso_entradas_unicas
    FOR EACH ROW EXECUTE FUNCTION public.producao_acesso_respeitar_zeramento();

CREATE OR REPLACE FUNCTION public.producao_acesso_zerar_entradas(p_evento_id uuid)
RETURNS TABLE (zerado_em timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    anterior timestamptz;
    corte timestamptz;
BEGIN
    SELECT entradas_zeradas_em INTO anterior
      FROM public.producao_acesso_eventos
     WHERE id = p_evento_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'evento inexistente' USING ERRCODE = '23503';
    END IF;

    DELETE FROM public.producao_acesso_entradas_unicas WHERE evento_id = p_evento_id;
    DELETE FROM public.producao_acesso_leituras WHERE evento_id = p_evento_id;
    -- Relógio do banco depois de adquirir o lock. O now() da transação poderia
    -- ter sido calculado antes de uma espera por outro zeramento.
    corte := GREATEST(clock_timestamp(), anterior + interval '1 microsecond');
    UPDATE public.producao_acesso_eventos
       SET entradas_zeradas_em = corte
     WHERE id = p_evento_id;
    RETURN QUERY SELECT corte;
END;
$$;

REVOKE ALL ON FUNCTION public.producao_acesso_respeitar_zeramento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.producao_acesso_zerar_entradas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_respeitar_zeramento() TO service_role;
GRANT EXECUTE ON FUNCTION public.producao_acesso_zerar_entradas(uuid) TO service_role;

COMMIT;

-- Publicação: SQL primeiro, depois acesso-conta/acesso-interno e portaria,
-- depois frontend. A Edge não tem fallback para o zeramento antigo.
-- Recuperação: manter esta migração ao reverter o frontend; os triggers também
-- protegem o envio feito por versões anteriores dos aparelhos. Desfazer a RPC
-- exige antes restaurar as funções Edge; não remover proteções durante evento.
