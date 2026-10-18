-- Todas as entregas Motoboy pendentes, inclusive antes da expedicao.
BEGIN;
CREATE OR REPLACE FUNCTION public.ve_admin_mapa(p_apos uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) FROM (
  SELECT p.id,jsonb_build_object(
   'empresa',p.empresa,'chave',p.id,'pedido',p.id_int,'cliente',p.cliente,'entregador_id',v.entregador,
   'entregador',v.entregador_nome,'status_erp',p.status_interno,'prevista_em',v.prevista_em,
   'endereco',concat_ws(', ',en.endereco,en.numero,en.bairro,en.cidade,en.uf,en.cep),
   'endereco_completo',nullif(trim(en.endereco),'') IS NOT NULL AND nullif(trim(en.numero),'') IS NOT NULL
      AND nullif(trim(en.cidade),'') IS NOT NULL AND nullif(trim(en.uf),'') IS NOT NULL,
   'rota_id',rt.id,'ordem',array_position(rt.ordem,p.id),'retorno',rt.retorno,'iniciada_em',rt.iniciada_em
  ) item FROM propostas p
  LEFT JOIN vibe_entregas_registros v ON v.proposta=p.id
  LEFT JOIN LATERAL (SELECT ex.id_endereco_entrega FROM expedicoes ex WHERE ex.id_int=p.id_int ORDER BY ex.id LIMIT 1) ex ON true
  LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
  LEFT JOIN LATERAL (SELECT r.id,r.ordem,r.retorno,r.iniciada_em FROM vibe_entregas_rotas r
    WHERE r.ativa AND r.confirmada_em IS NOT NULL AND r.usuario=v.entregador AND p.id=ANY(r.ordem)
    ORDER BY r.confirmada_em DESC,r.id LIMIT 1) rt ON true
  WHERE (p_apos IS NULL OR p.id>p_apos) AND p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO','EXPEDICAO','EM TRANSITO')
    AND upper(trim(p.frete_escolhido))='MOTOBOY' AND v.concluida_em IS NULL
    AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
    AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
  ORDER BY p.id LIMIT 201
 ) x);
END $$;
COMMIT;
