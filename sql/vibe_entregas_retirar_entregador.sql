-- Preparada localmente; não executa retiradas ao aplicar a migração.
BEGIN;
-- Mantém o registro para preservar tentativas e seus relacionamentos.
ALTER TABLE public.vibe_entregas_registros ALTER COLUMN entregador DROP NOT NULL;
ALTER TABLE public.vibe_entregas_registros ALTER COLUMN entregador_nome DROP NOT NULL;
ALTER TABLE public.vibe_entregas_registros ALTER COLUMN assumida_em DROP NOT NULL;
CREATE FUNCTION public.ve_admin_retirar_entregador(p_proposta uuid,p_anterior uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p propostas%ROWTYPE; r vibe_entregas_registros%ROWTYPE; rota vibe_entregas_rotas%ROWTYPE; persistida uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_proposta IS NULL OR p_anterior IS NULL THEN RAISE EXCEPTION 'Pedido e entregador obrigatorios'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_anterior::text,0));
 SELECT * INTO rota FROM vibe_entregas_rotas WHERE usuario=p_anterior AND ativa FOR UPDATE;
 SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
 SELECT * INTO STRICT r FROM vibe_entregas_registros WHERE proposta=p_proposta FOR UPDATE;
 IF r.entregador IS DISTINCT FROM p_anterior THEN RAISE EXCEPTION 'Entregador alterado; atualize a lista'; END IF;
 IF r.concluida_em IS NOT NULL OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Entrega concluida nao pode ser retirada'; END IF;
 IF coalesce(p.status_interno,'') NOT IN ('EXPEDICAO','EM TRANSITO') OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY' OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1 THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
 IF p.status_interno='EM TRANSITO' AND (rota.id IS NULL OR rota.iniciada_em IS NULL OR NOT p.id=ANY(rota.ordem)) THEN RAISE EXCEPTION 'Deslocamento fora da rota Vibe'; END IF;
 IF rota.id IS NOT NULL THEN
  UPDATE vibe_entregas_rotas SET pedidos=array_remove(pedidos,p.id),ordem=array_remove(ordem,p.id),ativa=cardinality(array_remove(ordem,p.id))>0 WHERE id=rota.id RETURNING id INTO persistida;
  IF persistida IS NULL THEN RAISE EXCEPTION 'Rota nao atualizada'; END IF;
 END IF;
 UPDATE vibe_entregas_registros SET entregador=NULL,entregador_nome=NULL,assumida_em=NULL,prevista_em=NULL,operacao=NULL WHERE proposta=p.id AND entregador=p_anterior AND concluida_em IS NULL RETURNING proposta INTO persistida;
 IF persistida IS NULL THEN RAISE EXCEPTION 'Retirada nao persistida'; END IF;
 IF p.status_interno='EM TRANSITO' THEN
  UPDATE propostas SET status_interno='EXPEDICAO' WHERE id=p.id AND status_interno='EM TRANSITO' RETURNING id INTO persistida;
  IF persistida IS NULL THEN RAISE EXCEPTION 'Retorno para expedicao nao persistido'; END IF;
 END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'pedido_retirado_entregador:'||p_anterior::text,p.id);
 RETURN jsonb_build_object('confirmado',true,'retirada',true,'proposta',p.id);
END $$;
REVOKE ALL ON FUNCTION public.ve_admin_retirar_entregador(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_retirar_entregador(uuid,uuid) TO authenticated;
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
        (p_filtro='disponivel' AND r.entregador IS NULL AND p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
          AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
          AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL))
        OR (p_filtro='minha' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL)
        OR (p_filtro='deslocamento' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL AND p.status_interno='EM TRANSITO')
        OR (p_filtro='concluida' AND r.concluida_em>=inicio AND r.concluida_em<fim)
        OR (p_filtro='tentativa' AND EXISTS(SELECT 1 FROM vibe_entregas_tentativas te WHERE te.proposta=p.id AND te.registrada_em>=inicio AND te.registrada_em<fim))
      )
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

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
  IF registro.proposta IS NOT NULL AND registro.entregador IS DISTINCT FROM p_usuario THEN
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
   IF registro.proposta IS NULL THEN INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome) VALUES(p.id,(SELECT e.id FROM expedicoes e WHERE e.id_int=p.id_int),p_usuario,nome); ELSIF registro.entregador IS NULL THEN UPDATE vibe_entregas_registros SET entregador=p_usuario,entregador_nome=nome,assumida_em=now(),prevista_em=NULL WHERE proposta=p.id; END IF;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM propostas WHERE id=ANY(p_ordem))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 UPDATE vibe_entregas_rotas SET ativa=false WHERE id=atual.id;
 INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa) VALUES(p_id,p_usuario,p_ordem,p_ordem,p_retorno,now(),true) RETURNING id INTO gravado;
 IF gravado IS NULL THEN RAISE EXCEPTION 'Rota nao persistida'; END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_salva',p_id);
 RETURN jsonb_build_object('id',gravado,'confirmado',true);
END $$;
CREATE OR REPLACE FUNCTION public.ve_admin_pedidos_rota(p_usuario uuid,p_busca text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]') FROM (
 SELECT p.id_int numero,jsonb_build_object('chave',p.id,'pedido',p.id_int,'cliente',p.cliente,'empresa',p.empresa) item
 FROM propostas p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
 WHERE p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
 AND (r.entregador IS NULL OR (r.entregador=p_usuario AND r.concluida_em IS NULL))
 AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo)
 AND (p_busca='' OR p.id_int::text=p_busca)
 AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
 AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
 ORDER BY p.id_int LIMIT 51 OFFSET p_offset) x);
END $$;
COMMIT;
