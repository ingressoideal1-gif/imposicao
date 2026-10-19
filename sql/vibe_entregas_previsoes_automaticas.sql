-- Contrato local para previsões automáticas; não aplicado em produção.
BEGIN;
ALTER TABLE public.vibe_entregas_rotas ADD COLUMN previsao_revisao bigint NOT NULL DEFAULT 0;
ALTER TABLE public.vibe_entregas_rotas ADD COLUMN previsao_calculada_revisao bigint NOT NULL DEFAULT -1;
ALTER TABLE public.vibe_entregas_rotas ADD COLUMN ultima_entrega uuid REFERENCES public.propostas(id);
CREATE FUNCTION public.ve_previsao_endereco(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT concat_ws(', ',en.endereco,en.numero,en.complemento,en.bairro,en.cidade,en.uf,en.cep)
 FROM propostas p LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
 JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
 WHERE p.id=p_id AND (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)<=1
 AND nullif(trim(en.endereco),'') IS NOT NULL AND nullif(trim(en.numero),'') IS NOT NULL AND nullif(trim(en.cidade),'') IS NOT NULL AND nullif(trim(en.uf),'') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.ve_previsao_endereco(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.ve_previsao_contexto(p_id uuid,p_iniciar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; paradas jsonb;
BEGIN
 SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND ativa;
 IF p_iniciar THEN
  IF r.iniciada_em IS NOT NULL OR NOT (ve_admin_edita() OR (r.usuario=auth.uid() AND EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=auth.uid() AND ativo) AND NOT EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) JOIN propostas p ON p.id=u.id WHERE NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))) THEN RAISE EXCEPTION 'Inicio ADM indisponivel'; END IF;
 ELSE
  IF r.iniciada_em IS NULL OR NOT (ve_admin_edita() OR (r.usuario=auth.uid() AND NOT EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) LEFT JOIN propostas p ON p.id=u.id WHERE p.id IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))) THEN RAISE EXCEPTION 'Acesso nao permitido'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('chave',p.id,'pedido',p.id_int,'endereco',ve_previsao_endereco(p.id)) ORDER BY u.pos),'[]') INTO paradas
 FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN propostas p ON p.id=u.id JOIN vibe_entregas_registros v ON v.proposta=p.id
 WHERE v.concluida_em IS NULL AND v.entregador=r.usuario;
 IF EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) LEFT JOIN vibe_entregas_registros v ON v.proposta=u.id WHERE v.entregador IS DISTINCT FROM r.usuario) THEN RAISE EXCEPTION 'Atribuicao alterada'; END IF;
 RETURN jsonb_build_object('id',r.id,'revisao',r.previsao_revisao,'agora',now(),'pendente',jsonb_array_length(paradas)>0 AND r.previsao_revisao<>r.previsao_calculada_revisao,
 'origem',CASE WHEN r.ultima_entrega IS NULL THEN 'Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130, Brasil' ELSE ve_previsao_endereco(r.ultima_entrega) END,'paradas',paradas);
END $$;
REVOKE ALL ON FUNCTION public.ve_previsao_contexto(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_previsao_contexto(uuid,boolean) TO authenticated;
CREATE FUNCTION public.ve_iniciar_deslocamento_proprio(p_id uuid,p_previsoes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; p propostas%ROWTYPE; v vibe_entregas_registros%ROWTYPE;
  motorista uuid; instante timestamptz:=now(); previsao timestamptz; anterior timestamptz;
  chave uuid; pendentes integer:=0; persistida uuid; status_salvo text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_rotas WHERE id=p_id AND usuario=auth.uid()) THEN RAISE EXCEPTION 'Acesso somente a propria rota'; END IF;
  SELECT usuario INTO STRICT motorista FROM vibe_entregas_rotas WHERE id=p_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(motorista::text,0));
  SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND ativa FOR UPDATE;
  IF r.iniciada_em IS NOT NULL THEN RETURN jsonb_build_object('confirmado',true,'iniciada_em',r.iniciada_em); END IF;
  IF NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=motorista AND ativo) THEN RAISE EXCEPTION 'Entregador inativo'; END IF;
  IF jsonb_typeof(p_previsoes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe a previsao de cada pedido'; END IF;
  -- Trava propostas em ordem fixa, como a gravacao administrativa de rotas.
  PERFORM 1 FROM propostas WHERE id=ANY(r.ordem) ORDER BY id FOR UPDATE;
  FOREACH chave IN ARRAY r.ordem LOOP
    SELECT * INTO STRICT p FROM propostas WHERE id=chave;
    PERFORM 1 FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
    SELECT * INTO STRICT v FROM vibe_entregas_registros WHERE proposta=chave FOR UPDATE;
    IF v.entregador IS DISTINCT FROM motorista THEN RAISE EXCEPTION 'Atribuicao alterada; atualize a rota'; END IF;
    IF v.concluida_em IS NOT NULL THEN CONTINUE; END IF;
    IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY'
      OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
      OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL)
      OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos WHERE usuario=motorista AND empresa=p.empresa AND ativo)
      THEN RAISE EXCEPTION 'Pedido indisponivel; revise a rota'; END IF;
    IF jsonb_typeof(p_previsoes->chave::text) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Informe a previsao de cada pedido'; END IF;
    previsao:=(p_previsoes->>chave::text)::timestamptz;
    IF previsao<instante OR previsao>instante+interval '7 days' OR previsao<anterior THEN RAISE EXCEPTION 'Previsoes devem seguir a ordem da rota, entre agora e sete dias'; END IF;
    anterior:=previsao;
    UPDATE vibe_entregas_registros SET prevista_em=previsao WHERE proposta=chave RETURNING proposta INTO persistida;
    IF persistida IS DISTINCT FROM chave THEN RAISE EXCEPTION 'Previsao nao persistida'; END IF;
    UPDATE propostas SET status_interno='EM TRANSITO' WHERE id=chave AND status_interno='EXPEDICAO' RETURNING status_interno INTO status_salvo;
    IF status_salvo IS DISTINCT FROM 'EM TRANSITO' THEN RAISE EXCEPTION 'Deslocamento nao persistido'; END IF;
    pendentes:=pendentes+1;
  END LOOP;
  IF pendentes=0 OR (SELECT count(*) FROM jsonb_object_keys(p_previsoes))<>pendentes THEN RAISE EXCEPTION 'Confira os pedidos pendentes e suas previsoes'; END IF;
  UPDATE vibe_entregas_rotas SET iniciada_em=instante WHERE id=p_id RETURNING id INTO persistida;
  IF persistida IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Inicio da rota nao persistido'; END IF;
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_em_deslocamento',p_id);
  RETURN jsonb_build_object('confirmado',true,'iniciada_em',instante,'pedidos',pendentes);
END $$;
REVOKE ALL ON FUNCTION public.ve_iniciar_deslocamento_proprio(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ve_iniciar_deslocamento_proprio(uuid,jsonb) TO service_role;

CREATE FUNCTION public.ve_previsao_aplicar(p_id uuid,p_usuario uuid,p_revisao bigint,p_ordem uuid[],p_previsoes jsonb,p_iniciar boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; motorista uuid; pendentes uuid[]; chave uuid; valor timestamptz; anterior timestamptz; salvo uuid; resultado jsonb;
BEGIN
 IF p_usuario IS NULL OR p_iniciar IS NULL THEN RAISE EXCEPTION 'Solicitacao invalida'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_usuario::text,true);
 SELECT usuario INTO STRICT motorista FROM vibe_entregas_rotas WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(motorista::text,0));
 SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND ativa FOR UPDATE;
 PERFORM ve_previsao_contexto(p_id,p_iniciar);
 IF r.previsao_revisao IS DISTINCT FROM p_revisao THEN RAISE EXCEPTION 'Rota atualizada durante calculo'; END IF;
 SELECT array_agg(u.id ORDER BY u.pos) INTO pendentes FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN vibe_entregas_registros v ON v.proposta=u.id WHERE v.concluida_em IS NULL;
 IF pendentes IS DISTINCT FROM p_ordem OR coalesce(cardinality(p_ordem),0)=0 OR jsonb_typeof(p_previsoes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Paradas alteradas'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_previsoes))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Previsoes incompletas'; END IF;
 IF p_iniciar THEN
  IF ve_admin_edita() THEN resultado:=ve_admin_iniciar_deslocamento(p_id,p_previsoes); ELSE resultado:=ve_iniciar_deslocamento_proprio(p_id,p_previsoes); END IF;
 ELSE
  PERFORM 1 FROM propostas WHERE id=ANY(p_ordem) ORDER BY id FOR UPDATE;
  FOREACH chave IN ARRAY p_ordem LOOP
   IF jsonb_typeof(p_previsoes->chave::text) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Previsao invalida'; END IF;
   valor:=(p_previsoes->>chave::text)::timestamptz;
   IF valor<now() OR valor>now()+interval '7 days' OR valor<anterior THEN RAISE EXCEPTION 'Previsao fora de ordem ou expirada'; END IF;
   anterior:=valor;
   UPDATE vibe_entregas_registros SET prevista_em=valor WHERE proposta=chave AND entregador=motorista AND concluida_em IS NULL RETURNING proposta INTO salvo;
   IF salvo IS DISTINCT FROM chave THEN RAISE EXCEPTION 'Previsao nao persistida'; END IF;
  END LOOP;
  resultado:=jsonb_build_object('confirmado',true,'atualizado',true);
 END IF;
 UPDATE vibe_entregas_rotas SET previsao_calculada_revisao=p_revisao WHERE id=p_id;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.ve_previsao_aplicar(uuid,uuid,bigint,uuid[],jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ve_previsao_aplicar(uuid,uuid,bigint,uuid[],jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.ve_registrar(p_proposta uuid,p_operacao uuid,p_resultado text,p_recebedor text,p_foto text,p_observacao text,p_volumes boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p propostas%ROWTYPE; r vibe_entregas_registros%ROWTYPE; e expedicoes%ROWTYPE; instante timestamptz:=now(); persistida uuid; data_persistida timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  PERFORM 1 FROM vibe_entregas_rotas WHERE usuario=auth.uid() AND ativa FOR UPDATE;
  SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo) THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
  BEGIN
    SELECT * INTO STRICT e FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
  EXCEPTION WHEN no_data_found THEN e := NULL;
  END;
  SELECT * INTO STRICT r FROM vibe_entregas_registros WHERE proposta=p.id AND entregador=auth.uid() FOR UPDATE;
  IF r.operacao=p_operacao THEN RETURN jsonb_build_object('confirmada',true,'hora',r.concluida_em); END IF;
  IF EXISTS(SELECT 1 FROM vibe_entregas_tentativas WHERE operacao=p_operacao AND proposta=p.id AND entregador=auth.uid()) THEN RETURN jsonb_build_object('confirmada',true); END IF;
  IF NOT EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=auth.uid() AND rt.ativa AND rt.iniciada_em IS NOT NULL AND p.id=ANY(rt.ordem)) THEN RAISE EXCEPTION 'Inicie sua rota antes de registrar a entrega'; END IF;
  IF r.expedicao IS NOT NULL AND r.expedicao IS DISTINCT FROM e.id THEN RAISE EXCEPTION 'Expedicao alterada'; END IF;
  IF r.concluida_em IS NOT NULL OR e.data_entrega IS NOT NULL OR coalesce(p.status_interno,'') NOT IN ('EXPEDICAO','EM TRANSITO') OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY' THEN RAISE EXCEPTION 'Pedido alterado; atualize a lista'; END IF;
  IF p_operacao IS NULL OR coalesce(length(p_observacao),0)>500 THEN RAISE EXCEPTION 'Registro invalido'; END IF;
  IF p_resultado IN ('ausente','endereco','recusa') THEN
    INSERT INTO vibe_entregas_tentativas(operacao,proposta,entregador,motivo,observacao) VALUES(p_operacao,p.id,auth.uid(),p_resultado,p_observacao);
    RETURN jsonb_build_object('confirmada',true,'hora',instante);
  END IF;
  IF p_resultado IS DISTINCT FROM 'entregue' OR p_volumes IS DISTINCT FROM true OR coalesce(length(trim(p_recebedor)),0) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Confira recebedor e volumes'; END IF;
  IF p_foto IS DISTINCT FROM (auth.uid()::text||'/'||p.id::text||'/'||p_operacao::text||'.jpg') THEN RAISE EXCEPTION 'Foto invalida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='vibe-entregas-comprovantes' AND name=p_foto AND (metadata->>'size')::bigint BETWEEN 1 AND 10485760 AND metadata->>'mimetype'='image/jpeg') THEN RAISE EXCEPTION 'Comprovante nao recebido'; END IF;
  UPDATE vibe_entregas_registros SET expedicao=e.id,concluida_em=instante,recebedor=trim(p_recebedor),foto=p_foto,observacao=p_observacao,operacao=p_operacao WHERE proposta=p.id RETURNING proposta INTO persistida;
  IF persistida IS DISTINCT FROM p.id THEN RAISE EXCEPTION 'Comprovante nao persistido'; END IF;
  -- Nao cria registro operacional no ERP quando ele nao existe.
  IF e.id IS NOT NULL THEN
    UPDATE expedicoes SET data_entrega=instante WHERE id=e.id RETURNING data_entrega INTO data_persistida;
    IF data_persistida IS DISTINCT FROM instante THEN RAISE EXCEPTION 'Data de entrega nao persistida'; END IF;
  END IF;
  UPDATE propostas SET status_interno='ENTREGUE' WHERE id=p.id RETURNING id INTO persistida;
  IF persistida IS DISTINCT FROM p.id OR NOT EXISTS(SELECT 1 FROM propostas WHERE id=p.id AND status_interno='ENTREGUE') THEN RAISE EXCEPTION 'Status de entrega nao persistido'; END IF;
  UPDATE vibe_entregas_rotas SET ultima_entrega=p.id,previsao_revisao=previsao_revisao+1 WHERE usuario=auth.uid() AND ativa AND p.id=ANY(ordem);
  UPDATE vibe_entregas_registros v SET prevista_em=NULL WHERE v.entregador=auth.uid() AND v.concluida_em IS NULL AND EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=auth.uid() AND rt.ativa AND p.id=ANY(rt.ordem) AND v.proposta=ANY(rt.ordem));
  RETURN jsonb_build_object('confirmada',true,'hora',instante);
END $$;

CREATE OR REPLACE FUNCTION public.ve_rotas_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.momento DESC),'[]'::jsonb) FROM (
    SELECT r.confirmada_em momento,jsonb_build_object('previsao_pendente',r.iniciada_em IS NOT NULL AND r.previsao_revisao<>r.previsao_calculada_revisao AND EXISTS(SELECT 1 FROM vibe_entregas_registros pv WHERE pv.proposta=ANY(r.ordem) AND pv.concluida_em IS NULL),'iniciada_em',r.iniciada_em,'id',r.id,'minha',r.usuario=auth.uid(),'retorno',r.retorno,'confirmada_em',r.confirmada_em,
      'paradas',(SELECT jsonb_agg(jsonb_build_object('prevista_em',v.prevista_em,'chave',p.id,'pedido',p.id_int,'entregador',v.entregador_nome,
        'entregue',v.concluida_em IS NOT NULL,'status_erp',p.status_interno,'endereco',(SELECT concat_ws(', ',en.endereco,en.numero,en.bairro,en.cidade,en.uf,en.cep) FROM enderecos en WHERE en.id::text=coalesce((SELECT ex.id_endereco_entrega::text FROM expedicoes ex WHERE ex.id_int=p.id_int ORDER BY ex.id LIMIT 1),p.id_endereco_ent))) ORDER BY u.pos)
        FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN propostas p ON p.id=u.id JOIN vibe_entregas_registros v ON v.proposta=p.id)) item
    FROM vibe_entregas_rotas r WHERE r.ativa AND r.confirmada_em IS NOT NULL
      AND auth.uid() IS NOT NULL AND (public.ve_e_gestor() OR NOT EXISTS(SELECT 1 FROM unnest(r.pedidos) selecionado(id)
        LEFT JOIN propostas p ON p.id=selecionado.id WHERE p.id IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a
        WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa AND r.usuario=auth.uid())))
    ORDER BY r.confirmada_em DESC LIMIT 50
  ) x;
$$;
COMMIT;
