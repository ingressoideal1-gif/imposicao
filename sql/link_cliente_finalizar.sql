-- ADITIVO. Preparado localmente; não aplicado ao Supabase.
-- Implantar antes do frontend que chama link_cliente_finalizar.
-- Não modifica grants de tabelas nem as RPCs legadas.
BEGIN;

CREATE OR REPLACE FUNCTION public.link_cliente_finalizar(
    p_numero text,
    p_token text,
    p_confirmacoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_link public.pedidos_links_cliente%ROWTYPE;
    v_arte public.pedidos_artes%ROWTYPE;
    v_num bigint;
    v_total_modelos bigint;
    v_aprovados bigint;
    v_total_artes bigint;
    v_afetadas bigint;
    v_corrigir boolean;
    v_status text;
    v_selo text;
    v_obs jsonb;
    v_decisoes jsonb;
    v_portal jsonb;
    v_frete text;
    v_documento text;
    v_ja_finalizado boolean;
    v_mensagem text;
    v_status_os text;
BEGIN
    -- A URL é a credencial do cliente. Nenhum id de pedido/modelo vindo do
    -- corpo da requisição pode substituir a relação validada aqui.
    SELECT l.* INTO STRICT v_link
      FROM public.pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero AND l.token = p_token AND l.ativo IS TRUE
       FOR UPDATE;
    v_num := v_link.numero_pedido::bigint;
    IF v_num <= 0 OR (v_link.id_int IS NOT NULL AND v_link.id_int::text <> p_numero) THEN
        RAISE EXCEPTION 'link incompatível com o pedido';
    END IF;
    IF jsonb_typeof(p_confirmacoes) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_confirmacoes->'entrega') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_confirmacoes->'faturamento') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'confirme Entrega e Nota antes de finalizar';
    END IF;

    -- Serializa duas finalizações do mesmo link e impede alteração das linhas
    -- lidas durante esta transação. Não altera a decisão individual dos modelos.
    PERFORM m.id FROM public.pedidos_modelos m WHERE m.id_int = v_num ORDER BY m.id FOR UPDATE;
    SELECT count(*), count(*) FILTER (WHERE upper(btrim(coalesce(m.status_arte, ''))) IN (
        'APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'
    )) INTO v_total_modelos, v_aprovados
      FROM public.pedidos_modelos m WHERE m.id_int = v_num;
    IF v_total_modelos = 0 OR v_aprovados <> v_total_modelos THEN
        RAISE EXCEPTION 'existem artes sem aprovação persistida';
    END IF;

    PERFORM a.id FROM public.pedidos_artes a WHERE a.id_int = v_num ORDER BY a.id FOR UPDATE;
    SELECT count(*) INTO v_total_artes FROM public.pedidos_artes a WHERE a.id_int = v_num;
    IF v_total_artes = 0 THEN RAISE EXCEPTION 'pedido sem registro de arte'; END IF;
    SELECT a.* INTO v_arte FROM public.pedidos_artes a WHERE a.id_int = v_num
     ORDER BY a.created_at DESC NULLS LAST, a.id DESC LIMIT 1;
    v_obs := v_arte.observacoes;
    v_decisoes := v_obs->'confirmacoes_portal';
    v_corrigir := p_confirmacoes->'entrega' = 'false'::jsonb
               OR p_confirmacoes->'faturamento' = 'false'::jsonb;
    v_status := CASE WHEN v_corrigir THEN 'Corrigir Dados' ELSE 'APROVADO' END;
    v_selo := CASE WHEN v_corrigir THEN 'CORRIGIR' ELSE 'APROVADO' END;

    -- Compara com o banco, sem transformar a memória antiga de uma aba em
    -- nova aprovação. ALTERADO exige nova conferência pelos botões das abas.
    IF EXISTS (
        SELECT 1 FROM public.pedidos_artes a WHERE a.id_int = v_num AND (
            a.entrega_dados IS DISTINCT FROM v_selo
            OR a.observacoes->'confirmacoes_portal'->>'selo' IS DISTINCT FROM v_selo
            OR a.observacoes->'confirmacoes_portal'->'entrega' IS DISTINCT FROM p_confirmacoes->'entrega'
            OR a.observacoes->'confirmacoes_portal'->'faturamento' IS DISTINCT FROM p_confirmacoes->'faturamento'
        )
    ) THEN RAISE EXCEPTION 'as conferências mudaram; reabra o link'; END IF;
    IF (CASE WHEN p_confirmacoes->'entrega' = 'false'::jsonb
             THEN coalesce(v_obs->>'correcao_entrega', '(sem detalhes)') ELSE '' END)
            IS DISTINCT FROM p_confirmacoes->>'textoEntrega'
       OR (CASE WHEN p_confirmacoes->'faturamento' = 'false'::jsonb
                THEN coalesce(v_obs->>'correcao_faturamento', '(sem detalhes)') ELSE '' END)
            IS DISTINCT FROM p_confirmacoes->>'textoFaturamento' THEN
        RAISE EXCEPTION 'salve as correções antes de finalizar';
    END IF;

    -- Reutiliza a mesma resolução de cliente/endereço/frete do portal.
    v_portal := public.link_cliente_pedido(p_numero, p_token);
    IF v_portal IS NULL OR jsonb_typeof(v_portal->'pedido') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'não foi possível conferir os dados do pedido';
    END IF;
    v_frete := upper(btrim(coalesce(nullif(v_portal->'pedido'->>'frete_escolhido', ''),
                                    v_portal->'frete'->>'servico', '')));
    v_documento := regexp_replace(coalesce(v_portal->'cliente'->>'documento', ''), '[^0-9]', '', 'g');
    IF p_confirmacoes->'entrega' = 'true'::jsonb AND v_frete NOT LIKE 'RETIR%'
       AND jsonb_typeof(v_portal->'endereco') = 'object' AND length(v_documento) <> 11
       AND (btrim(coalesce(v_portal->'endereco'->>'recebedor', '')) = ''
            OR btrim(coalesce(v_portal->'endereco'->>'cpf_recebedor', '')) = '') THEN
        RAISE EXCEPTION 'confira o recebedor na aba Entrega';
    END IF;

    -- O marcador é gravado na mesma transação do status e do chat. Se a
    -- resposta se perder na rede, repetir a chamada não duplica a mensagem.
    v_ja_finalizado := coalesce((v_decisoes->'finalizado') = 'true'::jsonb, false)
                      AND v_link.status_arte IS NOT DISTINCT FROM v_status;
    UPDATE public.pedidos_artes a
       SET status = v_status,
           observacoes = jsonb_set(a.observacoes, '{confirmacoes_portal,finalizado}', 'true'::jsonb)
     WHERE a.id_int = v_num;
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
    IF v_afetadas <> v_total_artes OR EXISTS (
        SELECT 1 FROM public.pedidos_artes a WHERE a.id_int = v_num AND (
            a.status IS DISTINCT FROM v_status OR a.entrega_dados IS DISTINCT FROM v_selo
            OR a.observacoes->'confirmacoes_portal'->'finalizado' IS DISTINCT FROM 'true'::jsonb
        )
    ) THEN RAISE EXCEPTION 'status do pedido não confirmado'; END IF;

    UPDATE public.pedidos_links_cliente l SET status_arte = v_status
     WHERE l.id = v_link.id AND l.ativo IS TRUE;
    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
    IF v_afetadas <> 1 OR NOT EXISTS (
        SELECT 1 FROM public.pedidos_links_cliente l
         WHERE l.id = v_link.id AND l.ativo IS TRUE AND l.status_arte = v_status
    ) THEN RAISE EXCEPTION 'status do link não confirmado'; END IF;

    IF left(v_link.os_id, 5) <> 'vibe_' THEN
        UPDATE public.producao_ordens_servico o SET status = v_status
         WHERE o.id::text = v_link.os_id AND o.numero = v_num
         RETURNING o.status INTO v_status_os;
        IF NOT FOUND OR v_status_os IS DISTINCT FROM v_status THEN
            RAISE EXCEPTION 'status da ordem de serviço não confirmado';
        END IF;
    END IF;

    IF NOT v_ja_finalizado THEN
        v_mensagem := '✅ O CLIENTE CONFIRMOU os dados de entrega e faturamento.';
        IF v_corrigir THEN
            v_mensagem := '⚠️ O CLIENTE REPORTOU DADOS INCORRETOS:';
            IF p_confirmacoes->'entrega' = 'false'::jsonb THEN
                v_mensagem := v_mensagem || E'\n\n[ENTREGA] ' || (p_confirmacoes->>'textoEntrega');
            END IF;
            IF p_confirmacoes->'faturamento' = 'false'::jsonb THEN
                v_mensagem := v_mensagem || E'\n\n[FATURAMENTO] ' || (p_confirmacoes->>'textoFaturamento');
            END IF;
        END IF;
        INSERT INTO public.propostas_chat(id_int, tipo, setor, visivel_externo, mensagem, autor_nome)
        VALUES (v_num, 'PRODUCAO', 'Cliente', true, v_mensagem, 'Cliente (aprovação online)');
        GET DIAGNOSTICS v_afetadas = ROW_COUNT;
        IF v_afetadas <> 1 THEN RAISE EXCEPTION 'registro da finalização não confirmado'; END IF;
    END IF;
    -- Triggers de OS/chat também podem tocar o pedido. O recibo é emitido
    -- somente depois de conferir o resultado de todas as escritas.
    IF (SELECT count(*) FROM public.pedidos_artes a WHERE a.id_int = v_num) <> v_total_artes
    OR EXISTS (SELECT 1 FROM public.pedidos_artes a WHERE a.id_int = v_num AND (
        a.status IS DISTINCT FROM v_status OR a.entrega_dados IS DISTINCT FROM v_selo
        OR a.observacoes->'confirmacoes_portal'->'finalizado' IS DISTINCT FROM 'true'::jsonb
        OR a.observacoes->'confirmacoes_portal'->'entrega' IS DISTINCT FROM p_confirmacoes->'entrega'
        OR a.observacoes->'confirmacoes_portal'->'faturamento' IS DISTINCT FROM p_confirmacoes->'faturamento'
    )) OR NOT EXISTS (SELECT 1 FROM public.pedidos_links_cliente l
        WHERE l.id = v_link.id AND l.ativo IS TRUE AND l.status_arte = v_status)
    OR (left(v_link.os_id, 5) <> 'vibe_' AND NOT EXISTS (
        SELECT 1 FROM public.producao_ordens_servico o
         WHERE o.id::text = v_link.os_id AND o.numero = v_num AND o.status = v_status
    )) THEN
        RAISE EXCEPTION 'a finalização foi modificada durante a gravação';
    END IF;
    RETURN jsonb_build_object('ok', true, 'numero', p_numero, 'status', v_status,
                             'entrega_dados', v_selo, 'finalizado', true);
    -- Nenhuma exceção de escrita é engolida: uma falha desfaz toda a operação.
END;
$$;

REVOKE ALL ON FUNCTION public.link_cliente_finalizar(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_finalizar(text, text, jsonb) TO anon, authenticated;
COMMENT ON FUNCTION public.link_cliente_finalizar(text, text, jsonb) IS
'Finaliza o portal pelo link ativo: verifica modelos e conferências persistidos; grava pedido, link, OS local e chat na mesma transação. Repetição confirmada não duplica o chat.';
COMMIT;

-- Recuperação de código: retirar primeiro o frontend consumidor; depois,
-- mediante autorização, DROP FUNCTION public.link_cliente_finalizar(text,text,jsonb).
-- Retirar a função não desfaz decisões já confirmadas de clientes.
