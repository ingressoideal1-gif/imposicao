-- Atribuicao ADM por pedido, preservando as tabelas do ERP.
BEGIN;
ALTER TABLE public.vibe_entregas_registros ADD COLUMN prevista_em timestamptz;
ALTER TABLE public.vibe_entregas_rotas ADD COLUMN iniciada_em timestamptz;
CREATE OR REPLACE FUNCTION public.ve_acompanhar(p_busca text DEFAULT '',p_filtro text DEFAULT 'disponivel',p_de date DEFAULT current_date,p_ate date DEFAULT current_date,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb; inicio timestamptz; fim timestamptz;
BEGIN
  IF NOT public.ve_e_gestor() THEN RAISE EXCEPTION 'Acesso de gestor nao autorizado'; END IF;
  IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','deslocamento','concluida','tentativa') OR p_de IS NULL OR p_ate IS NULL OR p_de>p_ate OR p_ate-p_de>366 THEN RAISE EXCEPTION 'Filtros invalidos'; END IF;
  inicio := p_de::timestamp AT TIME ZONE 'America/Sao_Paulo';
  fim := (p_ate+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero,jsonb_build_object('chave',p.id,'empresa',p.empresa,'entregador_id',r.entregador,'pedido',p.id_int,'cliente',p.cliente,'status_erp',p.status_interno,
      'entregador',r.entregador_nome,'assumida_em',r.assumida_em,'concluida_em',r.concluida_em,
      'prevista_em',r.prevista_em,'recebedor',r.recebedor,'observacao',r.observacao,'foto',r.foto,
      'tentativas',coalesce((SELECT jsonb_agg(t.item ORDER BY t.momento DESC) FROM (
        SELECT te.registrada_em AS momento,jsonb_build_object('registrada_em',te.registrada_em,'motivo',te.motivo,'observacao',te.observacao) AS item
        FROM vibe_entregas_tentativas te WHERE te.proposta=p.id ORDER BY te.registrada_em DESC LIMIT 50
      ) t),'[]'::jsonb)) AS item
    FROM propostas p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE public.ve_e_gestor()
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND (
        (p_filtro='disponivel' AND r.proposta IS NULL AND p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
          AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
          AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL))
        OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL)
        OR (p_filtro='deslocamento' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL AND p.status_interno='EM TRANSITO')
        OR (p_filtro='concluida' AND r.concluida_em>=inicio AND r.concluida_em<fim)
        OR (p_filtro='tentativa' AND EXISTS(SELECT 1 FROM vibe_entregas_tentativas te WHERE te.proposta=p.id AND te.registrada_em>=inicio AND te.registrada_em<fim))
      )
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE FUNCTION public.ve_admin_atribuir_rota(p_proposta uuid,p_usuario uuid,p_anterior uuid DEFAULT NULL)
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
  salvo:=ve_admin_salvar_rota(gen_random_uuid(),p_usuario,ordem,destino.id,coalesce(destino.retorno,true));
  IF (salvo->>'confirmado') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Rota nao confirmada'; END IF;
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'pedido_atribuido_rota',p_proposta);
  RETURN salvo||jsonb_build_object('usuario',p_usuario);
END $$;
REVOKE ALL ON FUNCTION public.ve_admin_atribuir_rota(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_atribuir_rota(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ve_listar(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'disponivel')
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
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.proposta IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado','entregue','recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM propostas p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND upper(trim(p.frete_escolhido))='MOTOBOY'
      AND (((p.status_interno='EXPEDICAO' OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador IS NULL OR r.entregador=auth.uid())
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND ((p_filtro='disponivel' AND r.proposta IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.ve_registrar(p_proposta uuid,p_operacao uuid,p_resultado text,p_recebedor text,p_foto text,p_observacao text,p_volumes boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p propostas%ROWTYPE; r vibe_entregas_registros%ROWTYPE; e expedicoes%ROWTYPE; instante timestamptz:=now(); persistida uuid; data_persistida timestamptz;
BEGIN
  SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo) THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
  BEGIN
    SELECT * INTO STRICT e FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
  EXCEPTION WHEN no_data_found THEN e := NULL;
  END;
  SELECT * INTO STRICT r FROM vibe_entregas_registros WHERE proposta=p.id AND entregador=auth.uid() FOR UPDATE;
  IF r.operacao=p_operacao THEN RETURN jsonb_build_object('confirmada',true,'hora',r.concluida_em); END IF;
  IF EXISTS(SELECT 1 FROM vibe_entregas_tentativas WHERE operacao=p_operacao AND proposta=p.id AND entregador=auth.uid()) THEN RETURN jsonb_build_object('confirmada',true); END IF;
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
  RETURN jsonb_build_object('confirmada',true,'hora',instante);
END $$;

CREATE OR REPLACE FUNCTION public.ve_rotas_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.momento DESC),'[]'::jsonb) FROM (
    SELECT r.confirmada_em momento,jsonb_build_object('iniciada_em',r.iniciada_em,'id',r.id,'minha',r.usuario=auth.uid(),'retorno',r.retorno,'confirmada_em',r.confirmada_em,
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
CREATE OR REPLACE FUNCTION public.ve_admin_salvar_rota(p_id uuid,p_usuario uuid,p_ordem uuid[],p_anterior uuid DEFAULT NULL,p_retorno boolean DEFAULT true) RETURNS jsonb
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


CREATE FUNCTION public.ve_admin_iniciar_deslocamento(p_id uuid,p_previsoes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; p propostas%ROWTYPE; v vibe_entregas_registros%ROWTYPE;
  motorista uuid; instante timestamptz:=now(); previsao timestamptz; anterior timestamptz;
  chave uuid; pendentes integer:=0; persistida uuid; status_salvo text;
BEGIN
  IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
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
    IF v.entregador<>motorista THEN RAISE EXCEPTION 'Atribuicao alterada; atualize a rota'; END IF;
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
REVOKE ALL ON FUNCTION public.ve_admin_iniciar_deslocamento(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_iniciar_deslocamento(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.ve_rota_confirmar(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF EXISTS(SELECT 1 FROM vibe_entregas_rotas a WHERE a.usuario=auth.uid() AND a.ativa AND a.iniciada_em IS NOT NULL AND EXISTS(SELECT 1 FROM vibe_entregas_registros v WHERE v.proposta=ANY(a.pedidos) AND v.concluida_em IS NULL)) THEN RAISE EXCEPTION 'Rota em deslocamento nao pode ser substituida'; END IF;
  SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND usuario=auth.uid() FOR UPDATE;
  IF r.ordem IS NULL OR r.criada_em<now()-interval '30 minutes' THEN RAISE EXCEPTION 'Calcule novamente a rota'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(r.pedidos) x LEFT JOIN propostas p ON p.id=x
      LEFT JOIN vibe_entregas_registros v ON v.proposta=p.id
      WHERE p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR v.entregador IS DISTINCT FROM auth.uid() OR v.concluida_em IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)) THEN RAISE EXCEPTION 'Pedidos alterados; atualize a rota'; END IF;
  UPDATE vibe_entregas_rotas SET ativa=false WHERE usuario=auth.uid() AND ativa AND id<>p_id;
  UPDATE vibe_entregas_rotas SET ativa=true,confirmada_em=coalesce(confirmada_em,now()) WHERE id=p_id;
  RETURN true;
END $$;

COMMIT;
