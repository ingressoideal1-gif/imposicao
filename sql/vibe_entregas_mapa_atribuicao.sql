-- Novas rotas sem retorno por padrao; configuracoes existentes preservadas.
BEGIN;
ALTER TABLE public.vibe_entregas_rotas ALTER COLUMN retorno SET DEFAULT false;
CREATE OR REPLACE FUNCTION public.ve_admin_atribuir_rota(p_proposta uuid,p_usuario uuid,p_anterior uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  p propostas%ROWTYPE; registro vibe_entregas_registros%ROWTYPE;
  origem vibe_entregas_rotas%ROWTYPE; destino vibe_entregas_rotas%ROWTYPE;
  motorista uuid; nome text; ordem uuid[]; restantes uuid[]; nova uuid; salvo jsonb;
BEGIN
  IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
  IF p_proposta IS NULL OR p_usuario IS NULL THEN RAISE EXCEPTION 'Selecione um entregador'; END IF;
  -- Mesma trava das demais edicoes de rota; ordem fixa para transferencias cruzadas.
  FOR motorista IN SELECT DISTINCT x FROM unnest(ARRAY[p_usuario,p_anterior]) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(motorista::text,0));
  END LOOP;
  SELECT * INTO destino FROM vibe_entregas_rotas WHERE usuario=p_usuario AND ativa FOR UPDATE;
  IF p_anterior IS NOT NULL AND p_anterior<>p_usuario THEN
    SELECT * INTO origem FROM vibe_entregas_rotas WHERE usuario=p_anterior AND ativa FOR UPDATE;
  END IF;
  SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
  SELECT * INTO registro FROM vibe_entregas_registros WHERE proposta=p_proposta FOR UPDATE;
  IF registro.concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Entrega concluida nao pode ser transferida'; END IF;
  IF registro.entregador IS DISTINCT FROM p_anterior AND registro.entregador IS DISTINCT FROM p_usuario THEN
    RAISE EXCEPTION 'Entregador alterado por outra sessao; atualize a lista';
  END IF;
  IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY'
    OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
    OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL)
    THEN RAISE EXCEPTION 'Pedido indisponivel para entrega'; END IF;
  SELECT a.nome INTO nome FROM vibe_entregas_acessos a JOIN vibe_entregas_entregadores d ON d.usuario=a.usuario
    WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo AND d.ativo;
  IF nome IS NULL THEN RAISE EXCEPTION 'Entregador inativo ou sem acesso a empresa'; END IF;
  IF registro.entregador=p_usuario AND p_proposta=ANY(destino.ordem) THEN
    RETURN jsonb_build_object('confirmado',true,'id',destino.id,'usuario',p_usuario);
  END IF;
  IF destino.iniciada_em IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM vibe_entregas_registros WHERE proposta=ANY(destino.pedidos) AND concluida_em IS NULL)
      THEN RAISE EXCEPTION 'Rota em deslocamento; finalize as entregas antes de incluir pedidos'; END IF;
    UPDATE vibe_entregas_rotas SET ativa=false WHERE id=destino.id;
    destino:=NULL;
  END IF;
  ordem:=coalesce(destino.ordem,ARRAY[]::uuid[]);
  IF NOT p_proposta=ANY(ordem) THEN ordem:=array_append(ordem,p_proposta); END IF;
  IF cardinality(ordem)>20 THEN RAISE EXCEPTION 'Rota com limite de 20 paradas; revise a rota antes de atribuir'; END IF;
  IF registro.proposta IS NOT NULL AND registro.entregador<>p_usuario THEN
    UPDATE vibe_entregas_registros SET entregador=p_usuario,entregador_nome=nome,assumida_em=now(),prevista_em=NULL
      WHERE proposta=p_proposta AND concluida_em IS NULL RETURNING proposta INTO nova;
    IF nova IS NULL THEN RAISE EXCEPTION 'Atribuicao nao persistida'; END IF;
    IF origem.id IS NOT NULL AND p_proposta=ANY(origem.pedidos) THEN
      restantes:=array_remove(origem.ordem,p_proposta);
      UPDATE vibe_entregas_rotas SET ativa=false WHERE id=origem.id;
      IF cardinality(restantes)>0 THEN
        INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa)
          VALUES(gen_random_uuid(),p_anterior,restantes,restantes,origem.retorno,now(),true);
      END IF;
    END IF;
  END IF;
  -- Reutiliza validacao completa, persistencia confirmada e auditoria da rota.
  salvo:=ve_admin_salvar_rota(gen_random_uuid(),p_usuario,ordem,destino.id,coalesce(destino.retorno,false));
  IF (salvo->>'confirmado') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Rota nao confirmada'; END IF;
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'pedido_atribuido_rota',p_proposta);
  RETURN salvo||jsonb_build_object('usuario',p_usuario);
END $$;
CREATE OR REPLACE FUNCTION public.ve_admin_salvar_rota(p_id uuid,p_usuario uuid,p_ordem uuid[],p_anterior uuid DEFAULT NULL,p_retorno boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE atual vibe_entregas_rotas%ROWTYPE; p propostas%ROWTYPE; registro vibe_entregas_registros%ROWTYPE; nome text; gravado uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_id IS NULL OR p_usuario IS NULL OR p_retorno IS NULL OR coalesce(cardinality(p_ordem),0) NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT x) FROM unnest(p_ordem) x)<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Selecione de 1 a 20 pedidos distintos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_usuario::text,0));
 IF NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=p_usuario AND ativo) THEN RAISE EXCEPTION 'Entregador inativo'; END IF;
 IF EXISTS(SELECT 1 FROM vibe_entregas_rotas WHERE id=p_id AND usuario=p_usuario AND ativa AND ordem=p_ordem AND retorno=p_retorno) THEN RETURN jsonb_build_object('id',p_id,'confirmado',true); END IF;
 SELECT * INTO atual FROM vibe_entregas_rotas WHERE usuario=p_usuario AND ativa FOR UPDATE;
 IF atual.iniciada_em IS NOT NULL THEN RAISE EXCEPTION 'Rota em deslocamento nao pode ser alterada'; END IF;
 IF atual.id IS DISTINCT FROM p_anterior THEN RAISE EXCEPTION 'Rota alterada por outra sessao; atualize'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(atual.pedidos) x JOIN vibe_entregas_registros r ON r.proposta=x WHERE r.concluida_em IS NOT NULL AND NOT x=ANY(p_ordem)) THEN RAISE EXCEPTION 'Preserve as entregas concluidas'; END IF;
 -- Mesma ordem de locks das confirmacoes de entrega: proposta antes do registro.
 FOR p IN SELECT * FROM propostas WHERE id=ANY(p_ordem) ORDER BY id FOR UPDATE LOOP
  SELECT * INTO registro FROM vibe_entregas_registros WHERE proposta=p.id FOR UPDATE;
  SELECT a.nome INTO nome FROM vibe_entregas_acessos a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL OR (registro.entregador IS NOT NULL AND registro.entregador<>p_usuario) THEN RAISE EXCEPTION 'Pedido sem acesso ou com outro entregador'; END IF;
  IF registro.concluida_em IS NOT NULL THEN
   IF atual.id IS NULL OR NOT p.id=ANY(atual.pedidos) THEN RAISE EXCEPTION 'Entrega concluida fora da rota'; END IF;
  ELSE
   IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY'
    OR (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)>1 OR EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
   IF registro.proposta IS NULL THEN INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome) VALUES(p.id,(SELECT e.id FROM expedicoes e WHERE e.id_int=p.id_int),p_usuario,nome); END IF;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM propostas WHERE id=ANY(p_ordem))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 UPDATE vibe_entregas_rotas SET ativa=false WHERE id=atual.id;
 INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa) VALUES(p_id,p_usuario,p_ordem,p_ordem,p_retorno,now(),true) RETURNING id INTO gravado;
 IF gravado IS NULL THEN RAISE EXCEPTION 'Rota nao persistida'; END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_salva',p_id);
 RETURN jsonb_build_object('id',gravado,'confirmado',true);
END $$;
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
  WHERE (p_apos IS NULL OR p.id>p_apos) AND p.status_interno IN ('EXPEDICAO','EM TRANSITO')
    AND upper(trim(p.frete_escolhido))='MOTOBOY' AND v.concluida_em IS NULL
    AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
    AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
  ORDER BY p.id LIMIT 201
 ) x);
END $$;
COMMIT;
