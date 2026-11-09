-- Aplicar após as views de contatos do remetente 3478. Não altera contatos ERP.
BEGIN;
CREATE TABLE public.imposition_arte_contatos_guru (
 pedido bigint PRIMARY KEY CHECK(pedido>0), codigo_cliente text NOT NULL,
 fonte text NOT NULL, chat_id text NOT NULL, autor uuid NOT NULL,
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.imposition_arte_contatos_guru_historico (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, pedido bigint NOT NULL,
 anterior jsonb, atual jsonb NOT NULL, autor uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.imposition_arte_contatos_guru ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imposition_arte_contatos_guru_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_arte_contatos_guru,public.imposition_arte_contatos_guru_historico FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.imposition_arte_contatos_guru TO service_role;
GRANT SELECT,INSERT ON public.imposition_arte_contatos_guru_historico TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.imposition_arte_contatos_guru_historico_id_seq TO service_role;

CREATE FUNCTION public.imposition_arte_guru_ler(p_pedidos bigint[])
RETURNS TABLE(pedido bigint,codigo_cliente text,contato_id text,nome text,whatsapp text,
 valido boolean,guru_disponivel boolean,opcoes jsonb,revisao text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH pedidos AS (
  SELECT p.id_int::bigint pedido,p.id_cliente::text codigo_cliente,
   CASE WHEN c.id_cliente::text=p.id_cliente::text THEN
    CASE WHEN length(regexp_replace(c.whats,'[^0-9]','','g')) IN (10,11)
    THEN '55'||regexp_replace(c.whats,'[^0-9]','','g') ELSE regexp_replace(c.whats,'[^0-9]','','g') END END numero_erp,
   s.pedido IS NOT NULL escolha_salva,s.codigo_cliente codigo_salvo,s.fonte,s.chat_id,s.atualizado_em
  FROM public.propostas p LEFT JOIN public.contatos c ON c.id::text=p.id_contato::text
  LEFT JOIN public.imposition_arte_contatos_guru s ON s.pedido=p.id_int::bigint
  WHERE p.id_int::bigint=ANY(p_pedidos) AND cardinality(p_pedidos) BETWEEN 1 AND 200
 ), disponiveis AS MATERIALIZED (
  -- Uma leitura da base por lote, inclusive quando vários pedidos são do mesmo cliente.
  SELECT v.*,coalesce(c.ultima_mensagem,c.cadastro) atividade,c.origem_em
  FROM public.chatguru_contatos_3478 v
  JOIN public.chatguru_contatos_importados c ON c.fonte=v.fonte AND c.chat_id=v.chat_id
  WHERE v.codigo_cliente IN (SELECT p.codigo_cliente FROM pedidos p)
   AND v.whatsapp_remetente='555195343478' AND c.telefone_valido
   AND v.telefone_normalizado ~ '^[1-9][0-9]{10,14}$'
 ), listas AS (
  SELECT p.*,coalesce(o.opcoes,'[]'::jsonb) opcoes FROM pedidos p
  LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('contato_id',v.fonte||'#'||v.chat_id,'fonte',v.fonte,'chat_id',v.chat_id,
    'nome',v.nome_chatguru,'whatsapp',v.telefone_normalizado)
    ORDER BY (v.telefone_normalizado=p.numero_erp) DESC NULLS LAST,
    v.atividade DESC NULLS LAST,v.origem_em DESC,v.fonte,v.chat_id) opcoes
   FROM disponiveis v WHERE v.codigo_cliente=p.codigo_cliente
  ) o ON true
 ), resolvidos AS (
  SELECT l.*,CASE WHEN escolha_salva THEN
   (SELECT o FROM jsonb_array_elements(l.opcoes) o WHERE o->>'fonte'=l.fonte AND o->>'chat_id'=l.chat_id AND l.codigo_salvo=l.codigo_cliente)
   ELSE l.opcoes->0 END escolhido FROM listas l
 )
 SELECT r.pedido,r.codigo_cliente,r.escolhido->>'contato_id',r.escolhido->>'nome',r.escolhido->>'whatsapp',
  r.escolhido IS NOT NULL,r.escolhido IS NOT NULL,r.opcoes,
  md5(jsonb_build_array(r.codigo_cliente,r.numero_erp,r.escolha_salva,r.codigo_salvo,r.fonte,r.chat_id,r.atualizado_em,r.opcoes)::text)
 FROM resolvidos r;
$$;

CREATE FUNCTION public.imposition_arte_guru_selecionar(p_pedido bigint,p_contato_id text,p_revisao text,p_autor uuid)
RETURNS TABLE(pedido bigint,codigo_cliente text,contato_id text,nome text,whatsapp text,
 valido boolean,guru_disponivel boolean,opcoes jsonb,revisao text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE atual record; opcao jsonb; anterior jsonb; novo jsonb;
BEGIN
 IF p_autor IS NULL OR p_pedido IS NULL OR p_pedido<=0 THEN RAISE EXCEPTION 'Selecao invalida'; END IF;
 -- Serializa seleções do mesmo pedido; a revisão também verifica troca de cliente e opções.
 PERFORM 1 FROM public.propostas p WHERE p.id_int::bigint=p_pedido FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 SELECT * INTO STRICT atual FROM public.imposition_arte_guru_ler(ARRAY[p_pedido]);
 IF p_revisao IS DISTINCT FROM atual.revisao THEN RAISE EXCEPTION 'Lista alterada; recarregue os contatos' USING ERRCODE='40001'; END IF;
 SELECT o INTO opcao FROM jsonb_array_elements(atual.opcoes) o WHERE o->>'contato_id'=p_contato_id;
 IF opcao IS NULL THEN RAISE EXCEPTION 'Contato indisponivel para este cliente no 3478' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(s) INTO anterior FROM public.imposition_arte_contatos_guru s WHERE s.pedido=p_pedido;
 INSERT INTO public.imposition_arte_contatos_guru AS s(pedido,codigo_cliente,fonte,chat_id,autor)
 VALUES(p_pedido,atual.codigo_cliente,opcao->>'fonte',opcao->>'chat_id',p_autor)
 ON CONFLICT ON CONSTRAINT imposition_arte_contatos_guru_pkey DO UPDATE SET codigo_cliente=excluded.codigo_cliente,fonte=excluded.fonte,
  chat_id=excluded.chat_id,autor=excluded.autor,atualizado_em=clock_timestamp();
 SELECT to_jsonb(s) INTO novo FROM public.imposition_arte_contatos_guru s WHERE s.pedido=p_pedido;
 INSERT INTO public.imposition_arte_contatos_guru_historico(pedido,anterior,atual,autor) VALUES(p_pedido,anterior,novo,p_autor);
 RETURN QUERY SELECT * FROM public.imposition_arte_guru_ler(ARRAY[p_pedido]);
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_arte_guru_ler(bigint[]),public.imposition_arte_guru_selecionar(bigint,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.imposition_arte_guru_ler(bigint[]),public.imposition_arte_guru_selecionar(bigint,text,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
