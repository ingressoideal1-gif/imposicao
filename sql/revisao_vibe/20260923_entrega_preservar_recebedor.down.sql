-- ROLLBACK PREPARADO, NAO APLICADO. Reintroduz a falha para recebedor diferente
-- do cliente comercial; usar somente se a correcao precisar ser revertida.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $reversao$
DECLARE
    v_funcao oid := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_definicao text;
    v_alvo text := $alvo$    -- O gatilho BEFORE INSERT preenche estes campos com o cliente comercial,
    -- mesmo quando o link validado informou outro recebedor. Corrigir somente
    -- a linha exclusiva recem-criada; outros INSERTs seguem usando o gatilho.
    UPDATE public.enderecos
       SET recebedor = p_endereco->>'recebedor',
           cpf_recebedor = p_endereco->>'cpf_recebedor',
           ie_recebedor = CASE
               WHEN regexp_replace(coalesce((
                   SELECT c.documento FROM public.clientes c
                    WHERE c.id_cliente = v_prop.id_cliente
               ), ''), '[^0-9]', '', 'g') = p_endereco->>'cpf_recebedor'
               THEN ie_recebedor ELSE NULL
           END
     WHERE id = v_id AND id_cliente = v_prop.id_cliente;
    GET DIAGNOSTICS v_quantidade = ROW_COUNT;
    IF v_quantidade <> 1 THEN RAISE EXCEPTION 'recebedor da entrega nao confirmado'; END IF;
    UPDATE public.propostas SET id_endereco_ent = v_id::text WHERE id_int = p_numero::bigint;$alvo$;
    v_original text := $original$    UPDATE public.propostas SET id_endereco_ent = v_id::text WHERE id_int = p_numero::bigint;$original$;
BEGIN
    SELECT pg_get_functiondef(v_funcao) INTO v_definicao;
    IF (SELECT p.proowner <> to_regrole('postgres') OR NOT p.prosecdef
               OR NOT ('search_path=pg_catalog, public' = ANY(coalesce(p.proconfig, ARRAY[]::text[])))
          FROM pg_proc p WHERE p.oid = v_funcao)
       OR length(v_definicao) - length(replace(v_definicao, v_alvo, '')) <> length(v_alvo)
       OR NOT has_function_privilege('anon', v_funcao, 'EXECUTE') THEN
        RAISE EXCEPTION 'funcao da entrega mudou; reversao interrompida';
    END IF;
    EXECUTE replace(v_definicao, v_alvo, v_original);
    IF position('recebedor da entrega nao confirmado' IN
                (SELECT p.prosrc FROM pg_proc p WHERE p.oid = v_funcao)) > 0 THEN
        RAISE EXCEPTION 'reversao da entrega nao confirmada';
    END IF;
END;
$reversao$;
COMMIT;
