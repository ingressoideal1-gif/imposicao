-- Limita a consulta de CPF feita por um link publico do Portal do Pedido.
BEGIN;
CREATE TABLE IF NOT EXISTS public.portal_consultas_documento (
    id bigserial PRIMARY KEY,
    link_id uuid NOT NULL REFERENCES public.pedidos_links_cliente(id) ON DELETE CASCADE,
    documento_hash text NOT NULL CHECK (documento_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_consultas_documento_link_data_idx
    ON public.portal_consultas_documento(link_id, created_at DESC);
ALTER TABLE public.portal_consultas_documento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_consultas_documento FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_cliente_registrar_consulta_documento(
    p_numero text, p_token text, p_documento_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_total integer;
    v_distintos integer;
BEGIN
    SELECT * INTO STRICT v_link FROM public.pedidos_links_cliente
     WHERE numero_pedido = p_numero AND token = p_token AND ativo IS TRUE FOR UPDATE;
    IF p_numero !~ '^[1-9][0-9]*$'
       OR (v_link.id_int IS NOT NULL AND v_link.id_int::text <> p_numero)
       OR p_documento_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'consulta invalida';
    END IF;
    SELECT count(*), count(DISTINCT documento_hash) INTO v_total, v_distintos
      FROM public.portal_consultas_documento
     WHERE link_id = v_link.id AND created_at >= now() - interval '1 hour';
    IF v_total >= 10 OR (v_distintos >= 5 AND NOT EXISTS (
        SELECT 1 FROM public.portal_consultas_documento
         WHERE link_id = v_link.id AND documento_hash = p_documento_hash
           AND created_at >= now() - interval '1 hour'
    )) THEN
        RETURN jsonb_build_object('ok', false);
    END IF;
    INSERT INTO public.portal_consultas_documento(link_id, documento_hash)
    VALUES (v_link.id, p_documento_hash);
    RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN no_data_found THEN
    RAISE EXCEPTION 'link invalido';
END;
$$;
REVOKE ALL ON FUNCTION public.link_cliente_registrar_consulta_documento(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_registrar_consulta_documento(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.portal_segredo_cpfhub() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, vault
AS $$
DECLARE v_segredo text;
BEGIN
    SELECT decrypted_secret INTO v_segredo
      FROM vault.decrypted_secrets WHERE name = 'CPFHUB_TOKEN'
     ORDER BY updated_at DESC LIMIT 1;
    IF coalesce(v_segredo, '') = '' THEN RAISE EXCEPTION 'CPFHUB_TOKEN não configurado'; END IF;
    RETURN v_segredo;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_segredo_cpfhub() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_segredo_cpfhub() TO service_role;
COMMIT;
