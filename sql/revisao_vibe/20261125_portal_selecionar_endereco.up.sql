-- Expõe a identidade do endereço e vincula a seleção sem criar cópia.
-- Esta fase é aditiva e mantém a API anterior durante a publicação do portal.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migracao$
DECLARE
    v_leitura regprocedure := 'public.link_cliente_pedido(text,text)'::regprocedure;
    v_gravacao regprocedure := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_leitura_sql text := pg_get_functiondef(v_leitura);
    v_endereco text := $ref$'endereco', CASE WHEN v_end.id IS NULL THEN NULL ELSE jsonb_build_object($ref$;
    v_opcao text := $ref$'tipo_endereco', COALESCE(NULLIF(btrim(e.tipo_endereco), ''), 'Endereço cadastrado'),$ref$;
    v_id_atual text := $ref$'endereco_entrega_id', CASE WHEN v_end.id_cliente = v_prop.id_cliente THEN v_end.id END, $ref$;
    v_id_opcao text := $ref$'id', e.id, $ref$;
    v_validacao_inicio text := $ref$    IF jsonb_typeof(p_endereco) IS DISTINCT FROM 'object' THEN$ref$;
    v_validacao_fim text := $ref$    v_atual := v_portal->'endereco';$ref$;
    v_gravacao_corpo text;
BEGIN
    IF current_user <> 'postgres'
       OR to_regprocedure('public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb)') IS NOT NULL
       OR to_regprocedure('public.link_cliente_validar_endereco_entrega(jsonb)') IS NOT NULL
       OR (SELECT count(*) FROM pg_proc WHERE oid IN (v_leitura, v_gravacao)
              AND proowner = to_regrole('postgres') AND prosecdef) <> 2
       OR md5(replace(pg_get_functiondef(v_gravacao), E'\r\n', E'\n')) NOT IN (
            'f413431961f9f59959430b31c69db16e', 'b274c4e9fd03a7f87e01a06eae73985f')
       OR (SELECT count(*) FROM pg_proc p
              CROSS JOIN LATERAL aclexplode(p.proacl) a
             WHERE p.oid = v_gravacao AND a.grantor = p.proowner
               AND a.grantee IN (to_regrole('anon'), to_regrole('authenticated'))
               AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable) <> 2
       OR strpos(v_leitura_sql, $ref$'endereco_entrega_id'$ref$) > 0
       OR strpos(v_leitura_sql, v_id_opcao || v_opcao) > 0
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_endereco, '')) <> length(v_endereco)
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_opcao, '')) <> length(v_opcao)
       OR strpos(v_leitura_sql, $ref$COALESCE(e.obs, '') NOT LIKE 'portal-entrega-pedido:%'$ref$) = 0 THEN
        RAISE EXCEPTION 'definições ou privilégios da entrega divergentes; nada alterado';
    END IF;

    EXECUTE replace(replace(v_leitura_sql, v_endereco, v_id_atual || v_endereco),
                    v_opcao, v_id_opcao || v_opcao);

    -- Reutiliza a validação vigente dos nove campos, sem executar o gravador.
    SELECT prosrc INTO STRICT v_gravacao_corpo FROM pg_proc WHERE oid = v_gravacao;
    EXECUTE $ddl$
        CREATE FUNCTION public.link_cliente_validar_endereco_entrega(p_endereco jsonb) RETURNS void
        LANGUAGE plpgsql SET search_path = pg_catalog, public
        AS $validacao$
        DECLARE
            v_chave text;
            v_documento text;
            v_soma integer;
            v_n integer;
            v_i integer;
        BEGIN
    $ddl$ || substr(v_gravacao_corpo, strpos(v_gravacao_corpo, v_validacao_inicio),
                    strpos(v_gravacao_corpo, v_validacao_fim) - strpos(v_gravacao_corpo, v_validacao_inicio)) || $ddl$
        END;
        $validacao$
    $ddl$;
END;
$migracao$;

REVOKE ALL ON FUNCTION public.link_cliente_validar_endereco_entrega(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.link_cliente_definir_endereco_entrega(
    p_numero text, p_token text, p_acao text, p_endereco_id uuid, p_endereco jsonb, p_anterior jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_prop public.propostas%ROWTYPE;
    v_depois public.propostas%ROWTYPE;
    v_endereco public.enderecos%ROWTYPE;
    v_portal jsonb;
    v_atual jsonb;
    v_exibido uuid;
    v_candidato jsonb;
    v_normalizado jsonb;
    v_gravado jsonb;
    v_quantidade integer;
BEGIN
    IF p_acao IS NULL OR p_acao NOT IN ('selecionar', 'confirmar', 'criar')
       OR (p_acao = 'criar') IS DISTINCT FROM (p_endereco_id IS NULL) THEN
        RAISE EXCEPTION 'ação ou referência de endereço inválida';
    END IF;

    IF p_acao = 'criar' THEN
        -- O gravador validado conserva a criação, o recebedor e o retry existentes.
        v_gravado := public.link_cliente_salvar_entrega(p_numero, p_token, p_endereco, p_anterior);
        v_portal := public.link_cliente_pedido(p_numero, p_token);
        IF v_portal->>'endereco_entrega_id' IS NULL
           OR v_portal->'endereco' IS DISTINCT FROM v_gravado->'endereco' THEN
            RAISE EXCEPTION 'endereço persistido diverge do solicitado';
        END IF;
        RETURN v_gravado || jsonb_build_object('endereco_id', v_portal->'endereco_entrega_id',
                                              'enderecos_entrega', v_portal->'enderecos_entrega');
    END IF;

    SELECT * INTO STRICT v_link FROM public.pedidos_links_cliente
     WHERE numero_pedido = p_numero AND token = p_token AND ativo IS TRUE FOR UPDATE;
    IF p_numero !~ '^[1-9][0-9]*$'
       OR (v_link.id_int IS NOT NULL AND v_link.id_int::text <> p_numero) THEN
        RAISE EXCEPTION 'link incompatível com o pedido';
    END IF;
    PERFORM id FROM public.pedidos_modelos WHERE id_int = p_numero::bigint ORDER BY id FOR UPDATE;
    PERFORM id FROM public.pedidos_artes WHERE id_int = p_numero::bigint ORDER BY id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'pedido sem registro de arte'; END IF;
    SELECT * INTO STRICT v_prop FROM public.propostas WHERE id_int = p_numero::bigint FOR UPDATE;
    IF v_prop.id_cliente IS NULL THEN RAISE EXCEPTION 'pedido sem cliente'; END IF;

    v_portal := public.link_cliente_pedido(p_numero, p_token);
    IF upper(btrim(coalesce(nullif(v_portal->'pedido'->>'frete_escolhido', ''),
        v_portal->'frete'->>'servico', ''))) LIKE 'RETIR%' THEN
        RAISE EXCEPTION 'retirada não utiliza endereço de entrega';
    END IF;
    v_atual := v_portal->'endereco';
    v_exibido := (v_portal->>'endereco_entrega_id')::uuid;
    IF p_acao = 'confirmar' AND v_exibido IS DISTINCT FROM p_endereco_id THEN
        RAISE EXCEPTION 'o endereço mudou; reabra o link antes de salvar';
    END IF;

    SELECT e.* INTO v_endereco FROM public.enderecos e
     WHERE e.id = p_endereco_id AND e.id_cliente = v_prop.id_cliente
       AND (COALESCE(e.obs, '') NOT LIKE 'portal-entrega-pedido:%'
            OR e.id::text = v_prop.id_endereco_ent)
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'endereço indisponível para este pedido'; END IF;

    v_candidato := jsonb_build_object(
        'recebedor', v_endereco.recebedor, 'cpf_recebedor', v_endereco.cpf_recebedor,
        'cep', v_endereco.cep, 'endereco', v_endereco.endereco, 'numero', v_endereco.numero,
        'complemento', v_endereco.complemento, 'bairro', v_endereco.bairro,
        'cidade', v_endereco.cidade, 'uf', v_endereco.uf);
    IF v_candidato IS DISTINCT FROM p_endereco THEN
        RAISE EXCEPTION 'o endereço mudou; reabra o link antes de salvar';
    END IF;
    SELECT jsonb_object_agg(chave, CASE WHEN chave IN ('cep', 'cpf_recebedor')
               THEN regexp_replace(coalesce(valor, ''), '[^0-9]', '', 'g')
               ELSE regexp_replace(coalesce(valor, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') END)
      INTO v_normalizado FROM jsonb_each_text(v_candidato) AS campos(chave, valor);
    PERFORM public.link_cliente_validar_endereco_entrega(v_normalizado);

    IF v_prop.id_endereco_ent = p_endereco_id::text AND v_exibido = p_endereco_id
       AND (v_atual - 'do_cadastro') = p_endereco THEN
        RETURN jsonb_build_object('ok', true, 'numero', p_numero, 'endereco', v_atual, 'endereco_id', p_endereco_id,
                                  'enderecos_entrega', v_portal->'enderecos_entrega');
    END IF;
    IF EXISTS (SELECT 1 FROM public.pedidos_artes WHERE id_int = p_numero::bigint AND (
        entrega_dados = 'APROVADO'
        OR observacoes->'confirmacoes_portal'->'entrega' = 'true'::jsonb
        OR observacoes->'confirmacoes_portal'->'finalizado' = 'true'::jsonb
    )) THEN RAISE EXCEPTION 'use Alterar antes de modificar a entrega'; END IF;
    IF v_atual IS DISTINCT FROM coalesce(p_anterior, 'null'::jsonb) THEN
        RAISE EXCEPTION 'o endereço mudou; reabra o link antes de salvar';
    END IF;

    UPDATE public.propostas SET id_endereco_ent = p_endereco_id::text WHERE id_int = p_numero::bigint;
    GET DIAGNOSTICS v_quantidade = ROW_COUNT;
    IF v_quantidade <> 1 THEN RAISE EXCEPTION 'vínculo do endereço não confirmado'; END IF;
    SELECT * INTO STRICT v_depois FROM public.propostas WHERE id_int = p_numero::bigint;
    IF (to_jsonb(v_depois) - ARRAY['id_endereco_ent','updated_at'])
       IS DISTINCT FROM (to_jsonb(v_prop) - ARRAY['id_endereco_ent','updated_at']) THEN
        RAISE EXCEPTION 'a atualização afetaria outros dados do pedido; procure o atendimento';
    END IF;

    v_portal := public.link_cliente_pedido(p_numero, p_token);
    v_gravado := v_portal->'endereco';
    IF v_depois.id_endereco_ent IS DISTINCT FROM p_endereco_id::text
       OR (v_portal->>'endereco_entrega_id')::uuid IS DISTINCT FROM p_endereco_id
       OR (v_gravado - 'do_cadastro') IS DISTINCT FROM p_endereco THEN
        RAISE EXCEPTION 'endereço persistido diverge do solicitado';
    END IF;
    RETURN jsonb_build_object('ok', true, 'numero', p_numero, 'endereco', v_gravado, 'endereco_id', p_endereco_id,
                              'enderecos_entrega', v_portal->'enderecos_entrega');
END;
$$;

REVOKE ALL ON FUNCTION public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb) TO anon, authenticated;

DO $$
DECLARE
    v_gravacao regprocedure := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_nova regprocedure := 'public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb)'::regprocedure;
    v_validacao regprocedure := 'public.link_cliente_validar_endereco_entrega(jsonb)'::regprocedure;
BEGIN
    IF NOT has_function_privilege('anon', v_gravacao, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_gravacao, 'EXECUTE')
       OR NOT has_function_privilege('anon', v_nova, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_nova, 'EXECUTE')
       OR has_function_privilege('anon', v_validacao, 'EXECUTE')
       OR has_function_privilege('authenticated', v_validacao, 'EXECUTE') THEN
        RAISE EXCEPTION 'privilégios da fase de compatibilidade divergentes; nada alterado';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
