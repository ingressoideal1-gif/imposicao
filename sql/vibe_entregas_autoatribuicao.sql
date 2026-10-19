-- Atribuicao pelo proprio entregador. Independente das previsoes Google.
BEGIN;
CREATE OR REPLACE FUNCTION public.ve_listar(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'minha')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM vibe_entregas_acessos WHERE usuario=auth.uid() AND ativo) THEN
    RAISE EXCEPTION 'Acesso ao Vibe Entregas nao autorizado';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_busca IS NULL OR length(p_busca)>30 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida') THEN RAISE EXCEPTION 'Busca invalida'; END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero), '[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero, jsonb_build_object(
      'status_erp',p.status_interno,'prevista_em',r.prevista_em,'chave',p.id,'id',p.id_int::text,'nome',p.cliente,
      'endereco',concat_ws(', ',en.endereco,en.numero,en.complemento,en.bairro,en.cidade,en.uf,en.cep),
      'volumes',ex.qtd_volumes,'nota',coalesce(p.obs_entrega,''),
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.entregador IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado','entregue','recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM propostas p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND upper(trim(p.frete_escolhido))='MOTOBOY'
      AND (((p.status_interno IN ('EM PRODUCAO','EXPEDICAO') OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador=auth.uid() OR (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND p.status_interno='EXPEDICAO'))
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND ((p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.ve_assumir(p_proposta uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p propostas%ROWTYPE; r vibe_entregas_registros%ROWTYPE; rota vibe_entregas_rotas%ROWTYPE;
  motorista uuid:=auth.uid(); nome text; ordem uuid[]; nova uuid; gravado uuid;
BEGIN
  IF motorista IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=motorista AND ativo) THEN RAISE EXCEPTION 'Entregador sem acesso ativo'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(motorista::text,0));
  SELECT * INTO rota FROM vibe_entregas_rotas WHERE usuario=motorista AND ativa FOR UPDATE;
  SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
  SELECT a.nome INTO nome FROM vibe_entregas_acessos a WHERE a.usuario=motorista AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL THEN RAISE EXCEPTION 'Pedido sem acesso'; END IF;
  SELECT * INTO r FROM vibe_entregas_registros WHERE proposta=p.id FOR UPDATE;
  IF r.concluida_em IS NOT NULL OR (r.entregador IS NOT NULL AND r.entregador<>motorista) THEN RAISE EXCEPTION 'Pedido ja atribuido ou concluido; atualize a lista'; END IF;
  IF p.status_interno NOT IN ('EXPEDICAO','EM TRANSITO') OR p.status_interno IS NULL
    OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY'
    OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
    OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
  IF r.entregador=motorista AND p.id=ANY(rota.ordem) THEN RETURN jsonb_build_object('confirmado',true,'id',rota.id); END IF;
  IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
  IF rota.iniciada_em IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM vibe_entregas_registros WHERE proposta=ANY(rota.pedidos) AND concluida_em IS NULL) THEN RAISE EXCEPTION 'Finalize a rota em deslocamento antes de assumir outra entrega'; END IF;
    UPDATE vibe_entregas_rotas SET ativa=false WHERE id=rota.id;
    rota:=NULL;
  END IF;
  ordem:=coalesce(rota.ordem,ARRAY[]::uuid[]);
  IF NOT p.id=ANY(ordem) THEN ordem:=array_append(ordem,p.id); END IF;
  IF cardinality(ordem)>20 THEN RAISE EXCEPTION 'Limite de 20 paradas por rota'; END IF;
  IF r.proposta IS NULL THEN
    INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome)
      VALUES(p.id,(SELECT id FROM expedicoes WHERE id_int=p.id_int),motorista,nome) RETURNING proposta INTO gravado;
  ELSE
    UPDATE vibe_entregas_registros SET entregador=motorista,entregador_nome=nome,assumida_em=now(),prevista_em=NULL
      WHERE proposta=p.id AND concluida_em IS NULL AND (entregador IS NULL OR entregador=motorista) RETURNING proposta INTO gravado;
  END IF;
  IF gravado IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Atribuicao nao persistida'; END IF;
  UPDATE vibe_entregas_rotas SET ativa=false WHERE id=rota.id;
  nova:=gen_random_uuid();
  INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa)
    VALUES(nova,motorista,ordem,ordem,coalesce(rota.retorno,false),now(),true);
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(motorista,'pedido_autoatribuido',p.id);
  RETURN jsonb_build_object('confirmado',true,'id',nova);
END $$;
REVOKE ALL ON FUNCTION public.ve_assumir(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_assumir(uuid) TO authenticated;
COMMIT;


