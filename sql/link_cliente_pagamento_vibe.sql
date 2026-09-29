-- Aplicar antes das Edge Functions e do frontend. Não chama o ERP nem altera cobranças.
BEGIN;

CREATE TABLE public.pedidos_links_pagamento_vibe (
    numero_pedido text PRIMARY KEY CHECK (numero_pedido ~ '^[1-9][0-9]{0,14}$'),
    url text,
    tentativa_em timestamptz,
    tentar_apos timestamptz,
    reserva uuid,
    codigo text,
    CHECK (url IS NULL OR url LIKE 'https://vibe.ai-ideal.com.br/p/' || numero_pedido || '-%')
);
ALTER TABLE public.pedidos_links_pagamento_vibe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_links_pagamento_vibe FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedidos_links_pagamento_vibe TO service_role;
CREATE INDEX ON public.pedidos_links_pagamento_vibe(tentativa_em);

-- Reserva distribuída: uma tentativa por pedido e até 30 por minuto neste sistema.
-- O par número/token é conferido inclusive para leitura de um link já salvo.
CREATE FUNCTION public.reservar_link_pagamento_vibe(p_numero text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v public.pedidos_links_pagamento_vibe%ROWTYPE;
    v_agora timestamptz := clock_timestamp();
BEGIN
    IF p_numero IS NULL OR p_numero !~ '^[1-9][0-9]{0,14}$' OR p_token IS NULL
       OR length(p_token) NOT BETWEEN 6 AND 200 THEN RETURN NULL; END IF;
    IF (SELECT count(*) FROM public.pedidos_links_cliente
         WHERE numero_pedido = p_numero AND token = p_token AND ativo IS TRUE
           AND (id_int IS NULL OR id_int::text = p_numero)) <> 1
    THEN RETURN NULL; END IF;

    PERFORM pg_advisory_xact_lock(9282026, 1);
    SELECT * INTO v FROM public.pedidos_links_pagamento_vibe WHERE numero_pedido = p_numero;
    IF v.url IS NOT NULL THEN RETURN jsonb_build_object('url', v.url); END IF;
    IF v.tentar_apos > v_agora THEN RETURN '{}'::jsonb; END IF;
    IF (SELECT count(*) FROM public.pedidos_links_pagamento_vibe
        WHERE tentativa_em > v_agora - interval '1 minute') >= 30
    THEN RETURN '{}'::jsonb; END IF;

    INSERT INTO public.pedidos_links_pagamento_vibe(numero_pedido, tentativa_em, tentar_apos, reserva)
    VALUES (p_numero, v_agora, v_agora + interval '5 minutes', gen_random_uuid())
    ON CONFLICT (numero_pedido) DO UPDATE SET tentativa_em = EXCLUDED.tentativa_em,
        tentar_apos = EXCLUDED.tentar_apos, reserva = EXCLUDED.reserva
    RETURNING * INTO v;
    RETURN jsonb_build_object('reserva', v.reserva);
END;
$$;

CREATE FUNCTION public.concluir_link_pagamento_vibe(p_numero text, p_reserva uuid, p_url text, p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.pedidos_links_pagamento_vibe%ROWTYPE;
BEGIN
    IF p_codigo IS NULL OR p_codigo !~ '^[A-Z0-9_]{1,30}$' THEN RETURN NULL; END IF;
    IF p_url IS NOT NULL AND (p_codigo <> '200' OR
       p_url !~ ('^https://vibe[.]ai-ideal[.]com[.]br/p/' || p_numero || '-[A-Za-z0-9_-]+$'))
    THEN RETURN NULL; END IF;
    UPDATE public.pedidos_links_pagamento_vibe
       SET url = p_url, codigo = p_codigo, reserva = NULL,
           tentar_apos = CASE WHEN p_url IS NOT NULL THEN NULL
               WHEN p_codigo IN ('401', '404', '503', 'SEM_CHAVE') THEN clock_timestamp() + interval '1 hour'
               ELSE clock_timestamp() + interval '5 minutes' END
     WHERE numero_pedido = p_numero AND reserva = p_reserva AND url IS NULL
     RETURNING * INTO v;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('url', v.url, 'codigo', v.codigo);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_link_pagamento_vibe(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.concluir_link_pagamento_vibe(text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_link_pagamento_vibe(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.concluir_link_pagamento_vibe(text,uuid,text,text) TO service_role;
COMMIT;
