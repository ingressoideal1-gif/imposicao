-- Consulta adicional do portal. Não altera notas, pedidos nem a RPC principal.
-- Aplicar somente com autorização para migração no ambiente de destino.
BEGIN;
CREATE OR REPLACE FUNCTION public.link_cliente_notas_fiscais(p_numero text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_numero bigint;
    v_notas jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.pedidos_links_cliente l
        WHERE l.numero_pedido = p_numero AND l.token = p_token AND l.ativo IS TRUE
    ) THEN
        RETURN '[]'::jsonb;
    END IF;
    BEGIN
        v_numero := p_numero::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN '[]'::jsonb;
    END;
    -- propostas.id_int possui índice UNIQUE global. A empresa emitente da nota
    -- é escolhida no Vibe; propostas.empresa é texto, não o ID da emitente.
    IF NOT EXISTS (SELECT 1 FROM public.propostas WHERE id_int = v_numero) THEN
        RETURN '[]'::jsonb;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tipo', n.tipo, 'numero', n.numero, 'url', n.url
    ) ORDER BY n.criada DESC, n.tipo, n.numero, n.url), '[]'::jsonb)
    INTO v_notas
    FROM (
        SELECT CASE WHEN tipo_nota = 'REMESSA' THEN 'NF-e de remessa' ELSE 'NF-e' END AS tipo,
            numero_nf AS numero, btrim(url_danfe) AS url, created_at AS criada
        FROM public.notas_fiscais
        WHERE id_int = v_numero AND status = 'AUTORIZADA' AND ambiente = 'producao'
          AND data_cancelamento IS NULL AND btrim(url_danfe) ~ '^https://[^[:space:]]+$'
        UNION ALL
        SELECT 'NFS-e', numero_nfse, btrim(url_pdf), created_at
        FROM public.notas_servico
        WHERE id_int = v_numero AND status = 'AUTORIZADA' AND ambiente = 'producao'
          AND data_cancelamento IS NULL AND btrim(url_pdf) ~ '^https://[^[:space:]]+$'
    ) n;
    RETURN v_notas;
END;
$$;
REVOKE ALL ON FUNCTION public.link_cliente_notas_fiscais(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_notas_fiscais(text,text) TO anon, authenticated;
COMMENT ON FUNCTION public.link_cliente_notas_fiscais(text,text) IS
    'Documentos fiscais emitidos em produção do pedido validado por link ativo e token.';
COMMIT;
