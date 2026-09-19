-- ADITIVO: cria/seleciona cadastro fiscal pelo link validado do pedido.
-- Aplicar junto da revisao de link_cliente_pedido_enderecos_portal.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.clientes_faturamento_portal (
    id bigserial PRIMARY KEY,
    id_cliente_titular integer NOT NULL,
    id_cliente_faturamento integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_cliente_titular, id_cliente_faturamento)
);
REVOKE ALL ON TABLE public.clientes_faturamento_portal FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_cliente_salvar_faturamento(
    p_numero text, p_token text, p_id_cliente integer, p_cadastro jsonb,
    p_novo boolean, p_anterior_id integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_prop public.propostas%ROWTYPE;
    v_depois public.propostas%ROWTYPE;
    v_cli public.clientes%ROWTYPE;
    v_end public.enderecos%ROWTYPE;
    v_portal jsonb;
    v_id integer;
    v_documento text;
    v_tipo text;
    v_chave text;
    v_quantidade integer;
    v_seq text;
    v_soma integer;
    v_n integer;
    v_i integer;
BEGIN
    SELECT * INTO STRICT v_link FROM public.pedidos_links_cliente
     WHERE numero_pedido = p_numero AND token = p_token AND ativo IS TRUE FOR UPDATE;
    IF p_numero !~ '^[1-9][0-9]*$'
       OR (v_link.id_int IS NOT NULL AND v_link.id_int::text <> p_numero) THEN
        RAISE EXCEPTION 'link incompatível com o pedido';
    END IF;
    SELECT * INTO STRICT v_prop FROM public.propostas WHERE id_int = p_numero::bigint FOR UPDATE;
    IF v_prop.id_cliente IS NULL THEN RAISE EXCEPTION 'pedido sem cliente'; END IF;
    IF COALESCE(v_prop.id_faturado, v_prop.id_cliente) IS DISTINCT FROM p_anterior_id THEN
        RAISE EXCEPTION 'os dados da nota mudaram; reabra o link';
    END IF;
    IF jsonb_typeof(p_cadastro) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'cadastro inválido'; END IF;

    FOREACH v_chave IN ARRAY ARRAY['nome','documento','ins_estadual','email','telefone','cep','endereco',
        'numero','complemento','bairro','cidade','uf'] LOOP
        IF jsonb_typeof(p_cadastro->v_chave) IS DISTINCT FROM 'string'
           OR p_cadastro->>v_chave IS DISTINCT FROM btrim(p_cadastro->>v_chave)
           OR (v_chave NOT IN ('ins_estadual','email','telefone','complemento') AND btrim(p_cadastro->>v_chave) = '')
           OR length(p_cadastro->>v_chave) > (CASE v_chave WHEN 'nome' THEN 150 WHEN 'documento' THEN 14
                WHEN 'ins_estadual' THEN 30 WHEN 'email' THEN 150 WHEN 'telefone' THEN 30 WHEN 'cep' THEN 8
                WHEN 'endereco' THEN 200 WHEN 'numero' THEN 20 WHEN 'complemento' THEN 150
                WHEN 'uf' THEN 2 ELSE 100 END) THEN
            RAISE EXCEPTION 'campo fiscal inválido: %', v_chave;
        END IF;
    END LOOP;
    v_documento := p_cadastro->>'documento';
    IF v_documento !~ '^([0-9]{11}|[0-9]{14})$' OR v_documento = repeat(substr(v_documento,1,1),length(v_documento))
       OR p_cadastro->>'cep' !~ '^[0-9]{8}$' OR p_cadastro->>'uf' !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'documento, CEP ou UF inválido';
    END IF;
    v_tipo := CASE length(v_documento) WHEN 11 THEN 'CPF' ELSE 'CNPJ' END;
    IF v_tipo = 'CPF' THEN
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

    IF p_novo THEN
        -- Nao associa silenciosamente um cadastro global achado por documento:
        -- isso revelaria dados de outro cliente a quem apenas adivinhasse um CPF.
        IF EXISTS (SELECT 1 FROM public.clientes c
                    WHERE regexp_replace(coalesce(c.documento,''),'[^0-9]','','g') = v_documento) THEN
            RAISE EXCEPTION 'este documento já possui cadastro; procure o atendimento para vinculá-lo';
        END IF;
        -- Usa a sequence do ERP quando houver. Em bases legadas sem sequence, o
        -- advisory lock torna MAX+1 serial dentro deste fluxo e a unicidade da
        -- chave ainda impede duas linhas iguais.
        v_seq := pg_get_serial_sequence('public.clientes', 'id_cliente');
        IF v_seq IS NOT NULL THEN
            EXECUTE format('SELECT nextval(%L)', v_seq) INTO v_id;
        ELSE
            PERFORM pg_advisory_xact_lock(hashtext('portal-clientes-id-cliente'));
            SELECT coalesce(max(id_cliente), 0) + 1 INTO v_id FROM public.clientes;
        END IF;
        INSERT INTO public.clientes (id_cliente, nome, fantasia, documento, tipo_pessoa, ins_estadual,
            email_financeiro, whatsapp_1)
        VALUES (v_id, p_cadastro->>'nome', CASE WHEN v_tipo = 'CNPJ' THEN p_cadastro->>'nome' ELSE NULL END,
            v_documento, v_tipo, NULLIF(p_cadastro->>'ins_estadual',''), NULLIF(p_cadastro->>'email',''),
            NULLIF(p_cadastro->>'telefone',''));
        INSERT INTO public.enderecos (id_cliente, tipo_endereco, obs, cep, endereco, numero, complemento, bairro, cidade, uf)
        VALUES (v_id, 'PRINCIPAL', 'portal-faturamento', p_cadastro->>'cep', p_cadastro->>'endereco',
            p_cadastro->>'numero', p_cadastro->>'complemento', p_cadastro->>'bairro',
            p_cadastro->>'cidade', p_cadastro->>'uf');
    ELSE
        v_id := p_id_cliente;
        IF v_id IS NULL OR NOT (
            v_id IN (v_prop.id_cliente, COALESCE(v_prop.id_faturado, v_prop.id_cliente))
            OR EXISTS (SELECT 1 FROM public.clientes_faturamento_portal f
                        WHERE f.id_cliente_titular = v_prop.id_cliente AND f.id_cliente_faturamento = v_id)
        ) THEN RAISE EXCEPTION 'cadastro fiscal não pertence a este cliente'; END IF;
        SELECT * INTO STRICT v_cli FROM public.clientes WHERE id_cliente = v_id FOR UPDATE;
        v_documento := regexp_replace(coalesce(v_cli.documento,''),'[^0-9]','','g');
        IF length(v_documento) = 11 THEN
            -- CPF pode ser editado, mas o documento que identifica o cadastro nao muda.
            IF p_cadastro->>'documento' <> v_documento THEN RAISE EXCEPTION 'o CPF do cadastro não pode ser trocado'; END IF;
            UPDATE public.clientes SET nome = p_cadastro->>'nome', ins_estadual = NULLIF(p_cadastro->>'ins_estadual',''),
                email_financeiro = NULLIF(p_cadastro->>'email',''), whatsapp_1 = NULLIF(p_cadastro->>'telefone','')
             WHERE id_cliente = v_id;
            SELECT * INTO v_end FROM public.enderecos WHERE id_cliente = v_id
             ORDER BY CASE WHEN upper(btrim(coalesce(tipo_endereco,''))) = 'PRINCIPAL' THEN 0 ELSE 1 END,
                      data_criacao DESC NULLS LAST, id LIMIT 1 FOR UPDATE;
            IF v_end.id IS NULL THEN
                INSERT INTO public.enderecos (id_cliente,tipo_endereco,obs,cep,endereco,numero,complemento,bairro,cidade,uf)
                VALUES (v_id,'PRINCIPAL','portal-faturamento',p_cadastro->>'cep',p_cadastro->>'endereco',
                    p_cadastro->>'numero',p_cadastro->>'complemento',p_cadastro->>'bairro',p_cadastro->>'cidade',p_cadastro->>'uf');
            ELSE
                UPDATE public.enderecos SET cep=p_cadastro->>'cep', endereco=p_cadastro->>'endereco',
                    numero=p_cadastro->>'numero', complemento=p_cadastro->>'complemento', bairro=p_cadastro->>'bairro',
                    cidade=p_cadastro->>'cidade', uf=p_cadastro->>'uf' WHERE id=v_end.id;
            END IF;
        ELSIF length(v_documento) <> 14 THEN
            RAISE EXCEPTION 'cadastro sem CPF ou CNPJ válido';
        END IF;
    END IF;

    INSERT INTO public.clientes_faturamento_portal (id_cliente_titular,id_cliente_faturamento)
    VALUES (v_prop.id_cliente,v_id) ON CONFLICT DO NOTHING;
    UPDATE public.propostas SET id_faturado = v_id WHERE id_int = p_numero::bigint;
    GET DIAGNOSTICS v_quantidade = ROW_COUNT;
    IF v_quantidade <> 1 THEN RAISE EXCEPTION 'vínculo fiscal não confirmado'; END IF;
    SELECT * INTO STRICT v_depois FROM public.propostas WHERE id_int = p_numero::bigint;
    IF (to_jsonb(v_depois) - ARRAY['id_faturado','updated_at'])
        IS DISTINCT FROM (to_jsonb(v_prop) - ARRAY['id_faturado','updated_at']) THEN
        RAISE EXCEPTION 'a atualização afetaria outros dados do pedido; procure o atendimento';
    END IF;
    v_portal := public.link_cliente_pedido(p_numero,p_token);
    IF (v_portal->'pedido'->>'id_cliente')::integer IS DISTINCT FROM v_id THEN
        RAISE EXCEPTION 'cadastro fiscal persistido diverge do solicitado';
    END IF;
    RETURN jsonb_build_object('ok',true,'numero',p_numero,'id_cliente',v_id,
        'cliente',v_portal->'cliente','endereco_faturamento',v_portal->'endereco_faturamento',
        'cadastros_faturamento',v_portal->'cadastros_faturamento');
END;
$$;
REVOKE ALL ON FUNCTION public.link_cliente_salvar_faturamento(text,text,integer,jsonb,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_salvar_faturamento(text,text,integer,jsonb,boolean,integer) TO anon, authenticated;
COMMIT;
