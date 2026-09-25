-- CORRECAO PREPARADA, NAO APLICADA.
-- Link do Cliente: o BEFORE INSERT de enderecos substitui recebedor/documento
-- pelos dados do cliente comercial. A RPC restaura os campos validados pelo
-- link antes de conferir o endereco salvo. Nenhum pedido existente e alterado.
-- Alvo: funcao public.link_cliente_salvar_entrega(text,text,jsonb,jsonb).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migracao$
DECLARE
    v_funcao oid := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_definicao text;
    v_alvo text := $alvo$    UPDATE public.propostas SET id_endereco_ent = v_id::text WHERE id_int = p_numero::bigint;$alvo$;
    v_reposicao text := $novo$    -- O gatilho BEFORE INSERT preenche estes campos com o cliente comercial,
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
    UPDATE public.propostas SET id_endereco_ent = v_id::text WHERE id_int = p_numero::bigint;$novo$;
BEGIN
    SELECT pg_get_functiondef(v_funcao) INTO v_definicao;
    IF (SELECT p.proowner <> to_regrole('postgres') OR NOT p.prosecdef
               OR NOT ('search_path=pg_catalog, public' = ANY(coalesce(p.proconfig, ARRAY[]::text[])))
          FROM pg_proc p WHERE p.oid = v_funcao)
       OR md5(v_definicao) <> '1826ab5a1d2ff00515a47198e01ff6a7'
       OR length(v_definicao) - length(replace(v_definicao, v_alvo, '')) <> length(v_alvo)
       OR NOT has_function_privilege('anon', v_funcao, 'EXECUTE')
       OR NOT EXISTS (
           SELECT 1 FROM pg_trigger t
           JOIN pg_proc f ON f.oid = t.tgfoid
            WHERE t.tgrelid = 'public.enderecos'::regclass
              AND t.tgname = 'trg_preencher_dados_recebedor_endereco'
              AND NOT t.tgisinternal
              AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT%'
              AND position('NEW.recebedor :=' IN f.prosrc) > 0
              AND position('NEW.cpf_recebedor :=' IN f.prosrc) > 0
       ) THEN
        RAISE EXCEPTION 'definicao, gatilho ou privilegios da entrega divergentes; nada alterado';
    END IF;

    EXECUTE replace(v_definicao, v_alvo, v_reposicao);

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
         WHERE p.oid = v_funcao
           AND p.proowner = to_regrole('postgres')
           AND p.prosecdef
           AND 'search_path=pg_catalog, public' = ANY(coalesce(p.proconfig, ARRAY[]::text[]))
           AND position('recebedor da entrega nao confirmado' IN p.prosrc) > 0
    ) OR NOT has_function_privilege('anon', v_funcao, 'EXECUTE') THEN
        RAISE EXCEPTION 'correcao da entrega nao confirmada; transacao revertida';
    END IF;
END;
$migracao$;
COMMIT;

SELECT md5(pg_get_functiondef('public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure))
           AS hash_funcao_instalada,
       position('recebedor da entrega nao confirmado' IN p.prosrc) > 0 AS correcao_instalada
FROM pg_proc p
WHERE p.oid = 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
