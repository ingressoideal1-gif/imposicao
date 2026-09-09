-- Aditivo e somente leitura. Instalar separadamente do frontend, após revisar
-- o esquema implantado. Não altera linhas nem permissões de tabelas existentes.
BEGIN;

CREATE FUNCTION public.link_cliente_bancos_modelos(p_numero text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_prop public.propostas%ROWTYPE;
    v_model public.pedidos_modelos%ROWTYPE;
    v_vinc public.pedidos_modelos_banco%ROWTYPE;
    v_banco public.pedidos_bancos%ROWTYPE;
    v_numero bigint;
    v_count bigint;
    v_empresa text;
    v_colunas text[];
    v_headers jsonb;
    v_rows jsonb;
    v_modelos jsonb := '[]'::jsonb;
BEGIN
    IF p_numero IS NULL OR p_numero !~ '^[0-9]+$' OR NULLIF(btrim(p_token), '') IS NULL THEN
        RETURN NULL;
    END IF;
    BEGIN
        v_numero := p_numero::bigint;
    EXCEPTION WHEN numeric_value_out_of_range THEN
        RETURN NULL;
    END;

    -- Não escolher uma identidade arbitrária quando o par não for único.
    SELECT count(*) INTO v_count FROM public.pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero AND l.token = p_token AND l.ativo IS TRUE;
    IF v_count <> 1 THEN RETURN NULL; END IF;
    SELECT l.* INTO STRICT v_link FROM public.pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero AND l.token = p_token AND l.ativo IS TRUE;

    -- O caminho novo pertence aos pedidos Vibe; não emprestar um banco comercial
    -- a uma OS local que por acaso tenha o mesmo número.
    IF v_link.os_id IS NOT NULL AND left(v_link.os_id, 5) <> 'vibe_' THEN
        RETURN jsonb_build_object('versao', 1, 'numero_pedido', p_numero,
                                  'banco_comercial', false, 'modelos', '[]'::jsonb);
    END IF;
    IF v_link.os_id IS DISTINCT FROM ('vibe_' || v_numero::text)
       OR (NULLIF(v_link.id_int::text, '') IS NOT NULL AND v_link.id_int::text <> v_numero::text) THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO v_count FROM public.propostas p WHERE p.id_int = v_numero;
    IF v_count <> 1 THEN RETURN NULL; END IF;
    SELECT p.* INTO STRICT v_prop FROM public.propostas p WHERE p.id_int = v_numero;
    -- As instalações do parceiro variam no nome da coluna de empresa. O número
    -- comercial precisa ser único acima; quando há empresa explícita, conferir
    -- também os relacionamentos. Não presumir uma coluna nova nas tabelas nossas.
    v_empresa := COALESCE(to_jsonb(v_prop)->>'empresa_id', to_jsonb(v_prop)->>'id_empresa');
    IF COALESCE(to_jsonb(v_link)->>'empresa_id', to_jsonb(v_link)->>'id_empresa', v_empresa)
       IS DISTINCT FROM v_empresa THEN RETURN NULL; END IF;

    FOR v_model IN SELECT m.* FROM public.pedidos_modelos m
        WHERE m.id_int = v_numero ORDER BY m.id
    LOOP
        IF COALESCE(to_jsonb(v_model)->>'empresa_id', to_jsonb(v_model)->>'id_empresa', v_empresa)
           IS DISTINCT FROM v_empresa THEN
            RETURN NULL;
        END IF;
        SELECT count(*) INTO v_count FROM public.pedidos_modelos m WHERE m.id = v_model.id;
        IF v_count <> 1 THEN RETURN NULL; END IF;
        SELECT count(*) INTO v_count FROM public.pedidos_modelos_banco v
         WHERE v.modelo_id = v_model.id::text;
        IF v_count = 0 THEN
            v_modelos := v_modelos || jsonb_build_array(jsonb_build_object(
                'modelo_id', v_model.id::text, 'banco', NULL, 'csv_mapa', NULL));
            CONTINUE;
        END IF;
        IF v_count <> 1 THEN RETURN NULL; END IF;
        SELECT v.* INTO STRICT v_vinc FROM public.pedidos_modelos_banco v
         WHERE v.modelo_id = v_model.id::text;
        SELECT b.* INTO v_banco FROM public.pedidos_bancos b
         WHERE b.id = v_vinc.banco_id AND b.id_int = v_numero;
        IF NOT FOUND OR COALESCE(to_jsonb(v_banco)->>'empresa_id', to_jsonb(v_banco)->>'id_empresa', v_empresa)
           IS DISTINCT FROM v_empresa THEN
            v_modelos := v_modelos || jsonb_build_array(jsonb_build_object(
                'modelo_id', v_model.id::text, 'erro', 'vinculo_invalido'));
            CONTINUE;
        END IF;
        IF (v_vinc.csv_mapa IS NOT NULL AND jsonb_typeof(v_vinc.csv_mapa) <> 'object')
           OR jsonb_typeof(v_banco.csv_headers) IS DISTINCT FROM 'array'
           OR (v_banco.csv_data IS NOT NULL AND jsonb_typeof(v_banco.csv_data) <> 'array') THEN
            v_modelos := v_modelos || jsonb_build_array(jsonb_build_object(
                'modelo_id', v_model.id::text, 'erro', 'banco_invalido'));
            CONTINUE;
        END IF;

        -- Projeção por modelo. O mapa por elemento aponta direto à coluna;
        -- o legado declara csv_column na numeração, eventualmente remapeado.
        -- Considerar o ID salvo e o nome que o reconciliador pode selecionar.
        SELECT COALESCE(array_agg(DISTINCT coluna) FILTER (WHERE NULLIF(coluna, '') IS NOT NULL), ARRAY[]::text[])
          INTO v_colunas FROM (
            SELECT btrim(value) AS coluna
              FROM jsonb_each_text(COALESCE(v_vinc.csv_mapa, '{}'::jsonb))
            UNION ALL
            SELECT COALESCE(NULLIF(btrim(v_vinc.csv_mapa->>('el:' || (e.value->>'id'))), ''),
                            NULLIF(btrim(v_vinc.csv_mapa->>(e.value->>'csv_column')), ''),
                            NULLIF(btrim(e.value->>'csv_column'), ''))
              FROM public.producao_numeracoes n
              CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n.elements, '[]'::jsonb)) e
             WHERE (n.id::text = v_model.amostra_num_id::text
                    OR lower(btrim(n.name)) = lower(btrim(v_model.gabarito_operacional)))
               AND e.value->>'source' = 'database'
          ) colunas;

        SELECT COALESCE(jsonb_agg(h.value ORDER BY h.ord), '[]'::jsonb) INTO v_headers
          FROM jsonb_array_elements(v_banco.csv_headers) WITH ORDINALITY h(value, ord)
         WHERE h.value #>> '{}' = ANY(v_colunas);

        -- Ordem e IDs originais: a seleção e o filtro das linhas continuam no
        -- resolvedor existente do cliente. Nunca compactar/renumerar o banco.
        SELECT COALESCE(jsonb_agg(
            COALESCE((SELECT jsonb_object_agg(k.key, k.value)
                        FROM jsonb_each(CASE WHEN jsonb_typeof(r.value) = 'object' THEN r.value ELSE '{}'::jsonb END) k
                       WHERE k.key = ANY(v_colunas) OR k.key IN ('__id', '__ativo')), '{}'::jsonb)
            || jsonb_build_object('__fotos', COALESCE((
                SELECT jsonb_object_agg(f.key, (
                    SELECT COALESCE(jsonb_object_agg(meta.key, meta.value), '{}'::jsonb)
                      FROM jsonb_each(CASE WHEN jsonb_typeof(f.value) = 'object' THEN f.value ELSE '{}'::jsonb END) meta
                     WHERE meta.key IN ('url', 'cx', 'cy', 'zoom', 'rot')))
                  FROM jsonb_each(CASE WHEN jsonb_typeof(r.value->'__fotos') = 'object'
                                      THEN r.value->'__fotos' ELSE '{}'::jsonb END) f
                 WHERE f.key = ANY(v_colunas)), '{}'::jsonb))
            ORDER BY r.ord), '[]'::jsonb)
          INTO v_rows FROM jsonb_array_elements(COALESCE(v_banco.csv_data, '[]'::jsonb)) WITH ORDINALITY r(value, ord);

        v_modelos := v_modelos || jsonb_build_array(jsonb_build_object(
            'modelo_id', v_model.id::text, 'csv_mapa', v_vinc.csv_mapa,
            'banco', jsonb_build_object('id', v_banco.id, 'csv_headers', v_headers, 'csv_data', v_rows)));
    END LOOP;
    RETURN jsonb_build_object('versao', 1, 'numero_pedido', p_numero, 'modelos', v_modelos);
END;
$$;

REVOKE ALL ON FUNCTION public.link_cliente_bancos_modelos(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_bancos_modelos(text, text) TO anon, authenticated;
COMMENT ON FUNCTION public.link_cliente_bancos_modelos(text, text) IS
'Banco projetado por modelo do pedido autorizado por numero e token ativo. Somente leitura; sem registrar abertura ou aprovacao.';
COMMIT;
