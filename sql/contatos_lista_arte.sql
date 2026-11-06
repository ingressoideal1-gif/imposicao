-- Contato selecionado do pedido. Executar antes de publicar a API/tela.
BEGIN;
CREATE OR REPLACE FUNCTION public.imposition_contatos_arte_ler(p_pedidos bigint[])
RETURNS TABLE(pedido bigint, contato_id text, nome text, whatsapp text, valido boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.id_int::bigint, p.id_contato::text, c.nome_contato::text, c.whats::text,
    c.id IS NOT NULL AND coalesce(c.id_cliente::text = p.id_cliente::text OR c.id_cliente::text = p.id_faturado::text, false)
  FROM public.propostas p
  LEFT JOIN public.contatos c ON c.id::text = p.id_contato::text
  WHERE p.id_int::bigint = ANY(p_pedidos) AND cardinality(p_pedidos) BETWEEN 1 AND 200;
$$;

CREATE OR REPLACE FUNCTION public.imposition_contato_arte_salvar(
  p_pedido bigint, p_contato_id text, p_nome_anterior text, p_whatsapp_anterior text,
  p_nome text, p_whatsapp text
) RETURNS TABLE(pedido bigint, contato_id text, nome text, whatsapp text, valido boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  proposta public.propostas%ROWTYPE;
  contato public.contatos%ROWTYPE;
BEGIN
  IF p_pedido IS NULL OR p_pedido <= 0 OR p_contato_id IS NULL OR p_contato_id !~ '^[1-9][0-9]*$'
     OR p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 1 AND 150 OR p_nome ~ '[[:cntrl:]]'
     OR p_whatsapp IS NULL OR p_whatsapp !~ '^[+]?[0-9 ()\.\-]{10,32}$'
     OR regexp_replace(p_whatsapp, '[^0-9]', '', 'g') !~ '^[1-9][0-9]{9,14}$' THEN
    RAISE EXCEPTION 'Dados de contato invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT proposta FROM public.propostas p WHERE p.id_int::bigint = p_pedido FOR UPDATE;
  IF proposta.id_contato::text IS DISTINCT FROM p_contato_id THEN
    RAISE EXCEPTION 'Contato selecionado mudou' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO STRICT contato FROM public.contatos c WHERE c.id::text = p_contato_id FOR UPDATE;
  IF NOT coalesce(contato.id_cliente::text = proposta.id_cliente::text OR contato.id_cliente::text = proposta.id_faturado::text, false) THEN
    RAISE EXCEPTION 'Contato nao pertence ao cliente' USING ERRCODE = '42501';
  END IF;
  IF contato.nome_contato::text IS DISTINCT FROM p_nome_anterior OR contato.whats::text IS DISTINCT FROM p_whatsapp_anterior THEN
    RAISE EXCEPTION 'Contato alterado por outro usuario' USING ERRCODE = '40001';
  END IF;
  UPDATE public.contatos c SET nome_contato = btrim(p_nome), whats = btrim(p_whatsapp) WHERE c.id = contato.id;
  RETURN QUERY SELECT * FROM public.imposition_contatos_arte_ler(ARRAY[p_pedido]);
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_contatos_arte_ler(bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.imposition_contato_arte_salvar(bigint,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.imposition_contatos_arte_ler(bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.imposition_contato_arte_salvar(bigint,text,text,text,text,text) TO service_role;
COMMIT;
