-- Ativar após confirmar que o portal publicado usa a RPC nova.
-- Revoga somente as chamadas públicas diretas à rotina antiga de criação.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $ativacao$
DECLARE
    v_leitura regprocedure := 'public.link_cliente_pedido(text,text)'::regprocedure;
    v_gravacao regprocedure := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_nova regprocedure := 'public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb)'::regprocedure;
    v_validacao regprocedure := 'public.link_cliente_validar_endereco_entrega(jsonb)'::regprocedure;
    v_leitura_sql text := pg_get_functiondef(v_leitura);
    v_id_atual text := $ref$'endereco_entrega_id', CASE WHEN v_end.id_cliente = v_prop.id_cliente THEN v_end.id END, 'endereco', CASE WHEN v_end.id IS NULL THEN NULL ELSE jsonb_build_object($ref$;
    v_id_opcao text := $ref$'id', e.id, 'tipo_endereco', COALESCE(NULLIF(btrim(e.tipo_endereco), ''), 'Endereço cadastrado'),$ref$;
BEGIN
    IF current_user <> 'postgres'
       OR (SELECT count(*) FROM pg_proc WHERE oid IN (v_leitura, v_gravacao, v_nova)
              AND proowner = to_regrole('postgres') AND prosecdef) <> 3
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_id_atual, '')) <> length(v_id_atual)
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_id_opcao, '')) <> length(v_id_opcao)
       OR md5(replace(pg_get_functiondef(v_gravacao), E'\r\n', E'\n')) NOT IN (
            'f413431961f9f59959430b31c69db16e', 'b274c4e9fd03a7f87e01a06eae73985f')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_nova
                         AND 'search_path=pg_catalog, public' = ANY(p.proconfig)
                         AND md5(replace(p.prosrc, E'\r\n', E'\n')) = '55ed5fe487a6e00e99e8d2d5633d2ce3')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_validacao
                         AND p.proowner = to_regrole('postgres') AND NOT p.prosecdef
                         AND 'search_path=pg_catalog, public' = ANY(p.proconfig)
                         AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'ca3348c54fb56000e8395cc7adb6e0ca')
       OR (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
             WHERE p.oid = v_gravacao AND a.grantor = p.proowner
               AND a.grantee IN (to_regrole('anon'), to_regrole('authenticated'))
               AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable) <> 2
       OR NOT has_function_privilege('anon', v_nova, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_nova, 'EXECUTE')
       OR has_function_privilege('anon', v_validacao, 'EXECUTE')
       OR has_function_privilege('authenticated', v_validacao, 'EXECUTE') THEN
        RAISE EXCEPTION 'definições ou privilégios da entrega divergentes; nada alterado';
    END IF;

    REVOKE EXECUTE ON FUNCTION public.link_cliente_salvar_entrega(text,text,jsonb,jsonb) FROM anon, authenticated;
    IF has_function_privilege('anon', v_gravacao, 'EXECUTE')
       OR has_function_privilege('authenticated', v_gravacao, 'EXECUTE')
       OR NOT has_function_privilege('anon', v_nova, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_nova, 'EXECUTE') THEN
        RAISE EXCEPTION 'privilégios após a ativação divergentes; nada alterado';
    END IF;
END;
$ativacao$;

NOTIFY pgrst, 'reload schema';
COMMIT;
