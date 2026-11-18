-- Aplicar após lista_arte_contatos_guru_selecao.sql. A seleção do comprador no
-- Vibe usa propostas.chatguru_chat_id, vinculado ao cliente no Guru 3478.
BEGIN;

CREATE OR REPLACE FUNCTION public.imposition_arte_guru_ler(p_pedidos bigint[])
RETURNS TABLE(pedido bigint,codigo_cliente text,contato_id text,nome text,whatsapp text,
 valido boolean,guru_disponivel boolean,opcoes jsonb,revisao text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH pedidos AS (
  SELECT p.id_int::bigint pedido,p.id_cliente::text codigo_cliente,
   NULLIF(btrim(p.chatguru_chat_id),'') chat_vibe
  FROM public.propostas p
  WHERE p.id_int::bigint=ANY(p_pedidos) AND cardinality(p_pedidos) BETWEEN 1 AND 200
 ), disponiveis AS MATERIALIZED (
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
    ORDER BY (v.chat_id=p.chat_vibe) DESC NULLS LAST,
    v.atividade DESC NULLS LAST,v.origem_em DESC,v.fonte,v.chat_id) opcoes
   FROM disponiveis v WHERE v.codigo_cliente=p.codigo_cliente
  ) o ON true
 ), resolvidos AS (
  SELECT l.*,CASE WHEN l.opcoes->0->>'chat_id'=l.chat_vibe THEN l.opcoes->0 END escolhido
  FROM listas l
 )
 SELECT r.pedido,r.codigo_cliente,r.escolhido->>'contato_id',r.escolhido->>'nome',r.escolhido->>'whatsapp',
  r.escolhido IS NOT NULL,r.escolhido IS NOT NULL,r.opcoes,
  md5(jsonb_build_array(r.codigo_cliente,r.chat_vibe,r.opcoes)::text)
 FROM resolvidos r;
$$;

CREATE OR REPLACE FUNCTION public.imposition_arte_guru_selecionar(p_pedido bigint,p_contato_id text,p_revisao text,p_autor uuid)
RETURNS TABLE(pedido bigint,codigo_cliente text,contato_id text,nome text,whatsapp text,
 valido boolean,guru_disponivel boolean,opcoes jsonb,revisao text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 -- Rejeita gravações de clientes que ainda usam a versão anterior do painel.
 RAISE EXCEPTION 'Altere o comprador no Vibe' USING ERRCODE='42501';
END;
$$;

COMMIT;
