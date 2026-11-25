-- Restaura a API anterior antes ou depois da ativação. Preserva os registros.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migracao$
DECLARE
    v_leitura regprocedure := 'public.link_cliente_pedido(text,text)'::regprocedure;
    v_gravacao regprocedure := 'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure;
    v_nova regprocedure := 'public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb)'::regprocedure;
    v_validacao regprocedure := 'public.link_cliente_validar_endereco_entrega(jsonb)'::regprocedure;
    v_leitura_sql text := pg_get_functiondef(v_leitura);
    v_endereco text := $ref$'endereco', CASE WHEN v_end.id IS NULL THEN NULL ELSE jsonb_build_object($ref$;
    v_opcao text := $ref$'tipo_endereco', COALESCE(NULLIF(btrim(e.tipo_endereco), ''), 'Endereço cadastrado'),$ref$;
    v_id_atual text := $ref$'endereco_entrega_id', CASE WHEN v_end.id_cliente = v_prop.id_cliente THEN v_end.id END, $ref$ || v_endereco;
    v_id_opcao text := $ref$'id', e.id, $ref$ || v_opcao;
    v_grants integer;
BEGIN
    SELECT count(*) INTO v_grants FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE p.oid = v_gravacao AND a.grantor = p.proowner
       AND a.grantee IN (to_regrole('anon'), to_regrole('authenticated'))
       AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable;
    IF current_user <> 'postgres'
       OR md5(replace(pg_get_functiondef(v_gravacao), E'\r\n', E'\n')) NOT IN (
            'f413431961f9f59959430b31c69db16e', 'b274c4e9fd03a7f87e01a06eae73985f')
       OR (SELECT count(*) FROM pg_proc WHERE oid IN (v_leitura, v_gravacao, v_nova, v_validacao)
             AND proowner = to_regrole('postgres')) <> 4
       OR v_grants NOT IN (0, 2)
       OR has_function_privilege('anon', v_gravacao, 'EXECUTE') IS DISTINCT FROM (v_grants = 2)
       OR has_function_privilege('authenticated', v_gravacao, 'EXECUTE') IS DISTINCT FROM (v_grants = 2)
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_id_atual, '')) <> length(v_id_atual)
       OR length(v_leitura_sql) - length(replace(v_leitura_sql, v_id_opcao, '')) <> length(v_id_opcao) THEN
        RAISE EXCEPTION 'definições ou privilégios da entrega divergentes; nada alterado';
    END IF;

    EXECUTE replace(replace(v_leitura_sql, v_id_atual, v_endereco), v_id_opcao, v_opcao);
END;
$migracao$;

GRANT EXECUTE ON FUNCTION public.link_cliente_salvar_entrega(text,text,jsonb,jsonb) TO anon, authenticated;
DROP FUNCTION public.link_cliente_definir_endereco_entrega(text,text,text,uuid,jsonb,jsonb);
DROP FUNCTION public.link_cliente_validar_endereco_entrega(jsonb);

NOTIFY pgrst, 'reload schema';
COMMIT;
