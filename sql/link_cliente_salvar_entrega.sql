-- ADITIVO: aplicar antes do frontend. Não executar como parte dos testes.
-- Cria um endereço de entrega específico do pedido, preservando cadastro e nota.
BEGIN;
CREATE OR REPLACE FUNCTION public.link_cliente_salvar_entrega(
    p_numero text, p_token text, p_endereco jsonb, p_anterior jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_prop public.propostas%ROWTYPE;
    v_depois public.propostas%ROWTYPE;
    v_arte public.pedidos_artes%ROWTYPE;
    v_id uuid;
    v_portal jsonb;
    v_atual jsonb;
    v_gravado jsonb;
    v_chave text;
    v_documento text;
    v_soma integer;
    v_n integer;
    v_i integer;
    v_quantidade integer;
BEGIN
    SELECT * INTO STRICT v_link FROM public.pedidos_links_cliente
     WHERE numero_pedido = p_numero AND token = p_token AND ativo IS TRUE FOR UPDATE;
    IF p_numero !~ '^[1-9][0-9]*$'
       OR (v_link.id_int IS NOT NULL AND v_link.id_int::text <> p_numero) THEN
        RAISE EXCEPTION 'link incompatível com o pedido';
    END IF;
    PERFORM id FROM public.pedidos_modelos WHERE id_int = p_numero::bigint ORDER BY id FOR UPDATE;
    PERFORM id FROM public.pedidos_artes WHERE id_int = p_numero::bigint ORDER BY id FOR UPDATE;
    SELECT * INTO STRICT v_arte FROM public.pedidos_artes WHERE id_int = p_numero::bigint
     ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1;
    IF EXISTS (SELECT 1 FROM public.pedidos_artes WHERE id_int = p_numero::bigint AND (
        entrega_dados = 'APROVADO'
        OR observacoes->'confirmacoes_portal'->'entrega' = 'true'::jsonb
        OR observacoes->'confirmacoes_portal'->'finalizado' = 'true'::jsonb
    )) THEN RAISE EXCEPTION 'desfaça a confirmação antes de editar a entrega'; END IF;
    SELECT * INTO STRICT v_prop FROM public.propostas WHERE id_int = p_numero::bigint FOR UPDATE;
    IF v_prop.id_cliente IS NULL THEN RAISE EXCEPTION 'pedido sem cliente'; END IF;
    v_portal := public.link_cliente_pedido(p_numero, p_token);
    IF upper(btrim(coalesce(nullif(v_portal->'pedido'->>'frete_escolhido', ''),
        v_portal->'frete'->>'servico', ''))) LIKE 'RETIR%' THEN
        RAISE EXCEPTION 'retirada não utiliza endereço de entrega';
    END IF;
    IF jsonb_typeof(p_endereco) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'endereço inválido'; END IF;
    FOREACH v_chave IN ARRAY ARRAY['recebedor','cpf_recebedor','cep','endereco','numero','complemento','bairro','cidade','uf'] LOOP
        IF jsonb_typeof(p_endereco->v_chave) IS DISTINCT FROM 'string'
           OR p_endereco->>v_chave IS DISTINCT FROM btrim(p_endereco->>v_chave)
           OR (v_chave <> 'complemento' AND btrim(p_endereco->>v_chave) = '')
           OR length(p_endereco->>v_chave) > (CASE v_chave
               WHEN 'recebedor' THEN 150 WHEN 'cpf_recebedor' THEN 14 WHEN 'cep' THEN 8
               WHEN 'endereco' THEN 200 WHEN 'numero' THEN 20 WHEN 'complemento' THEN 150
               WHEN 'uf' THEN 2 ELSE 100 END) THEN
            RAISE EXCEPTION 'campo de entrega inválido: %', v_chave;
        END IF;
    END LOOP;
    IF p_endereco->>'cep' !~ '^[0-9]{8}$'
       OR p_endereco->>'uf' NOT IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
            'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') THEN
        RAISE EXCEPTION 'CEP ou UF inválido';
    END IF;
    v_documento := p_endereco->>'cpf_recebedor';
    IF v_documento !~ '^([0-9]{11}|[0-9]{14})$'
       OR v_documento = repeat(substr(v_documento,1,1),length(v_documento)) THEN
        RAISE EXCEPTION 'CPF ou CNPJ inválido';
    END IF;
    IF length(v_documento) = 11 THEN
        FOR v_n IN 9..10 LOOP
            v_soma := 0;
            FOR v_i IN 1..v_n LOOP
                v_soma := v_soma + substr(v_documento,v_i,1)::integer * (v_n + 2 - v_i);
            END LOOP;
            IF mod(mod(v_soma * 10,11),10) <> substr(v_documento,v_n+1,1)::integer THEN
                RAISE EXCEPTION 'CPF inválido';
            END IF;
        END LOOP;
    ELSE
        -- CNPJ: dois dígitos, com pesos 5..2/9..2 e 6..2/9..2.
        FOR v_n IN 1..2 LOOP
            v_soma := 0;
            FOR v_i IN 1..(11 + v_n) LOOP
                v_soma := v_soma + substr(v_documento,v_i,1)::integer *
                    CASE WHEN v_i <= (3 + v_n) THEN (5 + v_n - v_i) ELSE (13 + v_n - v_i) END;
            END LOOP;
            IF (CASE WHEN mod(v_soma,11) < 2 THEN 0 ELSE 11 - mod(v_soma,11) END)
                <> substr(v_documento,12+v_n,1)::integer THEN
                RAISE EXCEPTION 'CNPJ inválido';
            END IF;
        END LOOP;
    END IF;
    v_atual := v_portal->'endereco';
    -- Repetir após perda da resposta não cria outro endereço.
    IF (coalesce(nullif(v_atual, 'null'::jsonb), '{}'::jsonb) - 'do_cadastro') = p_endereco THEN
        RETURN jsonb_build_object('ok',true,'numero',p_numero,'endereco',v_atual);
    END IF;
    IF v_atual IS DISTINCT FROM coalesce(p_anterior,'null'::jsonb) THEN
        RAISE EXCEPTION 'o endereço mudou; reabra o link antes de salvar';
    END IF;
    INSERT INTO public.enderecos (id_cliente, tipo_endereco, obs, recebedor, cpf_recebedor,
        cep, endereco, numero, complemento, bairro, cidade, uf)
    VALUES (v_prop.id_cliente, 'ENTREGA', 'portal-entrega-pedido:' || p_numero,
        p_endereco->>'recebedor', p_endereco->>'cpf_recebedor',
        p_endereco->>'cep', p_endereco->>'endereco', p_endereco->>'numero', p_endereco->>'complemento',
        p_endereco->>'bairro', p_endereco->>'cidade', p_endereco->>'uf') RETURNING id INTO STRICT v_id;
    UPDATE public.propostas SET id_endereco_ent = v_id::text WHERE id_int = p_numero::bigint;
    GET DIAGNOSTICS v_quantidade = ROW_COUNT;
    IF v_quantidade <> 1 THEN RAISE EXCEPTION 'vínculo do endereço não confirmado'; END IF;
    SELECT * INTO STRICT v_depois FROM public.propostas WHERE id_int = p_numero::bigint;
    -- Um gatilho legado pode recalcular totais em qualquer UPDATE de proposta.
    -- Se houver efeito além do vínculo/timestamp, reverte a operação inteira.
    IF (to_jsonb(v_depois) - ARRAY['id_endereco_ent','updated_at'])
        IS DISTINCT FROM (to_jsonb(v_prop) - ARRAY['id_endereco_ent','updated_at']) THEN
        RAISE EXCEPTION 'a atualização afetaria outros dados do pedido; procure o atendimento';
    END IF;
    v_gravado := public.link_cliente_pedido(p_numero,p_token)->'endereco';
    IF (v_gravado - 'do_cadastro') IS DISTINCT FROM p_endereco THEN
        RAISE EXCEPTION 'endereço persistido diverge do solicitado';
    END IF;
    RETURN jsonb_build_object('ok',true,'numero',p_numero,'endereco',v_gravado);
END;
$$;
REVOKE ALL ON FUNCTION public.link_cliente_salvar_entrega(text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_salvar_entrega(text,text,jsonb,jsonb) TO anon, authenticated;
COMMIT;
