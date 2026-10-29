-- Atualizacao explicita solicitada: nao compara o snapshot antigo do pedido.
-- Aditiva: mantem as RPCs anteriores para retorno da aplicacao.
BEGIN;
CREATE FUNCTION public.imposition_tracedraw_atualizar_documento(
 p_pedido integer, p_esperados jsonb, p_itens jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 ids bigint[]; quantidade integer; atuais jsonb; itens jsonb := '[]'::jsonb;
 item jsonb; atual jsonb;
BEGIN
 IF p_pedido IS NULL OR jsonb_typeof(p_esperados) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Lote invalido'; END IF;
 IF jsonb_array_length(p_esperados) NOT BETWEEN 1 AND 100
    OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Tamanho de lote invalido'; END IF;
 SELECT array_agg((x->>'id')::bigint ORDER BY (x->>'id')::bigint),count(DISTINCT x->>'id')
 INTO ids,quantidade FROM jsonb_array_elements(p_esperados) x;
 IF quantidade<>jsonb_array_length(p_esperados) THEN RAISE EXCEPTION 'Modelos repetidos ou invalidos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_esperados) x
           WHERE (x->>'id_int')::integer IS DISTINCT FROM p_pedido)
 THEN RAISE EXCEPTION 'Outro pedido'; END IF;
 -- Autorizacao existente antes de qualquer leitura/bloqueio dos registros.
 PERFORM public.imposition_tracedraw_estado(p_pedido,ids[1]);
 PERFORM id FROM public.pedidos_modelos WHERE id_int=p_pedido AND id=ANY(ids) ORDER BY id FOR UPDATE;
 SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id),count(*) INTO atuais,quantidade
 FROM public.pedidos_modelos m WHERE m.id_int=p_pedido AND m.id=ANY(ids);
 IF quantidade<>cardinality(ids) THEN RAISE EXCEPTION 'Modelo ausente ou de outro pedido'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
   IF (item->>'p_pedido')::integer IS DISTINCT FROM p_pedido
      OR item->>'p_restaurar' IS NOT NULL
      OR NOT coalesce((item->>'p_modelo')::bigint=ANY(ids),false)
   THEN RAISE EXCEPTION 'Identidade do lote divergente'; END IF;
   SELECT value INTO atual FROM jsonb_array_elements(atuais)
    WHERE (value->>'id')::bigint=(item->>'p_modelo')::bigint;
   itens:=itens||jsonb_build_array(jsonb_set(item,'{p_base}',atual,true));
 END LOOP;
 -- Sob os mesmos locks: preserva permissao, mapa, idempotencia, auditoria,
 -- validacao dos arquivos, backup e confirmacao integral da RPC existente.
 RETURN public.imposition_tracedraw_publicar_documento(p_pedido,atuais,itens);
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_tracedraw_atualizar_documento(integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.imposition_tracedraw_atualizar_documento(integer,jsonb,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
