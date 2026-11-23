-- Aplicar após lista_arte_contatos_guru_vibe.sql. Reaplicar aquele SQL para reverter.
BEGIN;

CREATE OR REPLACE FUNCTION public.imposition_arte_guru_ler(p_pedidos bigint[])
RETURNS TABLE(pedido bigint,codigo_cliente text,contato_id text,nome text,whatsapp text,
 valido boolean,guru_disponivel boolean,opcoes jsonb,revisao text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH pedidos AS (
  SELECT p.id_int::bigint pedido,p.id_cliente::text codigo_cliente,
   NULLIF(btrim(p.chatguru_chat_id),'') chat_vibe,
   NULLIF(btrim(c.nome_contato),'') nome_pedido,
   CASE WHEN tel.numero ~ '^[1-9][0-9]{10,14}$' THEN tel.numero END numero_pedido
  FROM public.propostas p
  LEFT JOIN public.contatos c
   ON c.id::text=p.id_contato::text AND c.id_cliente::text=p.id_cliente::text
  LEFT JOIN LATERAL (
   SELECT regexp_replace(c.whats,'[^0-9]','','g') digitos
   WHERE btrim(c.whats) ~ '^[+]?[0-9 ().-]+$'
  ) d ON true
  LEFT JOIN LATERAL (
   SELECT CASE WHEN btrim(c.whats) NOT LIKE '+%' AND d.digitos ~ '^[1-9][0-9]{9,10}$'
    THEN '55'||d.digitos ELSE d.digitos END numero
  ) tel ON true
  WHERE p.id_int::bigint=ANY(p_pedidos) AND cardinality(p_pedidos) BETWEEN 1 AND 200
 ), disponiveis AS MATERIALIZED (
  SELECT v.*,coalesce(c.ultima_mensagem,c.cadastro) atividade,c.origem_em
  FROM public.chatguru_contatos_3478 v
  JOIN public.chatguru_contatos_importados c ON c.fonte=v.fonte AND c.chat_id=v.chat_id
  WHERE v.codigo_cliente IN (SELECT p.codigo_cliente FROM pedidos p)
   AND v.whatsapp_remetente='555195343478' AND c.telefone_valido
   AND v.telefone_normalizado ~ '^[1-9][0-9]{10,14}$'
 ), listas AS (
  SELECT p.*,coalesce(o.opcoes,'[]'::jsonb) opcoes,o.conversas_do_numero FROM pedidos p
  LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('contato_id',v.fonte||'#'||v.chat_id,'fonte',v.fonte,'chat_id',v.chat_id,
    'nome',v.nome_chatguru,'whatsapp',v.telefone_normalizado)
    ORDER BY (v.chat_id=p.chat_vibe) DESC NULLS LAST,
    (p.chat_vibe IS NULL AND v.telefone_normalizado=p.numero_pedido) DESC NULLS LAST,
    v.atividade DESC NULLS LAST,v.origem_em DESC,v.fonte,v.chat_id) opcoes,
    count(*) FILTER (WHERE v.telefone_normalizado=p.numero_pedido) conversas_do_numero
   FROM disponiveis v WHERE v.codigo_cliente=p.codigo_cliente
  ) o ON true
 ), resolvidos AS (
  SELECT l.*,
   CASE WHEN l.opcoes->0->>'chat_id'=l.chat_vibe THEN l.opcoes->0 END comprador_vibe,
   -- Sem seleção do Vibe, o envio exige uma conversa 3478 do cliente com o mesmo número.
   CASE WHEN l.chat_vibe IS NULL AND l.conversas_do_numero=1 THEN l.opcoes->0 END conversa_pedido
  FROM listas l
 )
 SELECT r.pedido,r.codigo_cliente,coalesce(r.comprador_vibe,r.conversa_pedido)->>'contato_id',
  CASE WHEN r.comprador_vibe IS NOT NULL THEN r.comprador_vibe->>'nome' ELSE r.nome_pedido END,
  CASE WHEN r.comprador_vibe IS NOT NULL THEN r.comprador_vibe->>'whatsapp' ELSE r.numero_pedido END,
  coalesce(r.comprador_vibe,r.conversa_pedido) IS NOT NULL,
  coalesce(r.comprador_vibe,r.conversa_pedido) IS NOT NULL,
  CASE WHEN r.comprador_vibe IS NULL AND (r.nome_pedido IS NOT NULL OR r.numero_pedido IS NOT NULL)
   THEN jsonb_build_array(jsonb_build_object('origem','pedido','contato_id',r.conversa_pedido->>'contato_id',
    'nome',r.nome_pedido,'whatsapp',r.numero_pedido))
   ELSE r.opcoes END,
  md5(jsonb_build_array(r.codigo_cliente,r.chat_vibe,r.opcoes,r.nome_pedido,r.numero_pedido)::text)
 FROM resolvidos r;
$$;

COMMIT;
