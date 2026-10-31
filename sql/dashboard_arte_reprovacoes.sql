-- Aplicar antes do frontend. Sem backfill: o passado nao identifica a acao.
BEGIN;
ALTER TABLE public.pedidos_modelos ADD COLUMN IF NOT EXISTS reprovacao_acao uuid;
ALTER TABLE public.pedidos_artes ADD COLUMN IF NOT EXISTS reprovacao_acao uuid;

CREATE TABLE IF NOT EXISTS public.imposition_reprovacoes_inicio (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    iniciado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.imposition_reprovacoes_inicio(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.imposition_reprovacoes_arte (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido bigint NOT NULL,
    acao uuid NOT NULL,
    ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    atendente text NOT NULL,
    designer text NOT NULL,
    UNIQUE (pedido, acao)
);
CREATE INDEX IF NOT EXISTS imposition_reprovacoes_arte_periodo
    ON public.imposition_reprovacoes_arte(ocorrido_em, id);
ALTER TABLE public.imposition_reprovacoes_inicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imposition_reprovacoes_arte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_reprovacoes_inicio, public.imposition_reprovacoes_arte FROM anon, authenticated;
GRANT SELECT ON public.imposition_reprovacoes_inicio, public.imposition_reprovacoes_arte TO authenticated;
CREATE POLICY painel_le_inicio ON public.imposition_reprovacoes_inicio FOR SELECT TO authenticated USING(true);
-- A visibilidade continua condicionada ao pedido que a sessao pode ler.
CREATE POLICY painel_le_reprovacoes ON public.imposition_reprovacoes_arte FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.propostas p WHERE p.id_int = pedido));

CREATE OR REPLACE FUNCTION public.imposition_capturar_reprovacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_status text; v_atendente text; v_designer text;
BEGIN
    IF NEW.reprovacao_acao IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.reprovacao_acao IS NOT DISTINCT FROM OLD.reprovacao_acao THEN RETURN NEW; END IF;
    v_status := upper(trim(CASE WHEN TG_TABLE_NAME = 'pedidos_modelos'
        THEN to_jsonb(NEW)->>'status_arte' ELSE to_jsonb(NEW)->>'status' END));
    IF v_status IS NULL OR v_status NOT IN ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERAÇÃO','EM ALTERACAO') THEN
        RAISE EXCEPTION 'Identificador de reprovacao exige status de reprovacao';
    END IF;
    SELECT nullif(trim(p.vendedor::text), '') INTO v_atendente
        FROM public.propostas p WHERE p.id_int = NEW.id_int LIMIT 1;
    SELECT nullif(trim(a.designer_nome), '') INTO v_designer
        FROM public.pedidos_artes a WHERE a.id_int = NEW.id_int
        ORDER BY a.created_at DESC NULLS LAST, a.id DESC LIMIT 1;
    INSERT INTO public.imposition_reprovacoes_arte(pedido, acao, atendente, designer)
        VALUES(NEW.id_int, NEW.reprovacao_acao, coalesce(v_atendente,'Não atribuído'), coalesce(v_designer,'Não atribuído'))
        ON CONFLICT (pedido, acao) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_capturar_reprovacao() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER imposition_reprovacao_modelo AFTER INSERT OR UPDATE OF reprovacao_acao ON public.pedidos_modelos
    FOR EACH ROW EXECUTE FUNCTION public.imposition_capturar_reprovacao();
CREATE TRIGGER imposition_reprovacao_pedido AFTER INSERT OR UPDATE OF reprovacao_acao ON public.pedidos_artes
    FOR EACH ROW EXECUTE FUNCTION public.imposition_capturar_reprovacao();
NOTIFY pgrst, 'reload schema';
COMMIT;
