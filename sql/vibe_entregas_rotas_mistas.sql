-- Rotas mistas: aplicar somente na publicacao autorizada. Sem alteracao de dados existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.ve_agrupar_paradas(p_ordem uuid[]) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT p_ordem $$;
CREATE OR REPLACE FUNCTION public.ve_listar_modalidades(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'minha',p_modalidade text DEFAULT 'motoboy')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM vibe_entregas_acessos WHERE usuario=auth.uid() AND ativo) THEN
    RAISE EXCEPTION 'Acesso ao Vibe Entregas nao autorizado';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_busca IS NULL OR length(p_busca)>30 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida') THEN RAISE EXCEPTION 'Busca invalida'; END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero), '[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero, jsonb_build_object(
      'status_erp',p.status_interno,'prevista_em',r.prevista_em,'modalidade',ve_modalidade(p.frete_escolhido),'chave',p.id,'id',p.id_int::text,'nome',p.cliente,
      'endereco',ve_previsao_endereco(p.id),
      'volumes',ex.qtd_volumes,'nota',coalesce(p.obs_entrega,''),
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.entregador IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado',CASE WHEN r.tipo_conclusao='repasse' THEN 'repasse' ELSE 'entregue' END,'recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM propostas p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
      AND ((((p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))) OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador=auth.uid() OR (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int)))))
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND ((p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

REVOKE ALL ON FUNCTION public.ve_listar_modalidades(text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_listar_modalidades(text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ve_acompanhar_modalidades(p_busca text DEFAULT '',p_filtro text DEFAULT 'disponivel',p_de date DEFAULT current_date,p_ate date DEFAULT current_date,p_offset integer DEFAULT 0,p_modalidade text DEFAULT 'motoboy')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb; inicio timestamptz; fim timestamptz;
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
  IF NOT public.ve_e_gestor() THEN RAISE EXCEPTION 'Acesso de gestor nao autorizado'; END IF;
  IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','deslocamento','concluida','tentativa') OR p_de IS NULL OR p_ate IS NULL OR p_de>p_ate OR p_ate-p_de>366 THEN RAISE EXCEPTION 'Filtros invalidos'; END IF;
  inicio := p_de::timestamp AT TIME ZONE 'America/Sao_Paulo';
  fim := (p_ate+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero,jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'chave',p.id,'empresa',p.empresa,'entregador_id',r.entregador,'pedido',p.id_int,'cliente',p.cliente,'status_erp',p.status_interno,
      'entregador',r.entregador_nome,'assumida_em',r.assumida_em,'tipo_conclusao',r.tipo_conclusao,'concluida_em',r.concluida_em,
      'prevista_em',r.prevista_em,'recebedor',r.recebedor,'observacao',r.observacao,'foto',r.foto,
      'tentativas',coalesce((SELECT jsonb_agg(t.item ORDER BY t.momento DESC) FROM (
        SELECT te.registrada_em AS momento,jsonb_build_object('registrada_em',te.registrada_em,'motivo',te.motivo,'observacao',te.observacao) AS item
        FROM vibe_entregas_tentativas te WHERE te.proposta=p.id ORDER BY te.registrada_em DESC LIMIT 50
      ) t),'[]'::jsonb)) AS item
    FROM propostas p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE public.ve_e_gestor()
      AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
      AND (p_filtro IN ('concluida','tentativa') OR (
        r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO'
          OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))
          OR (p.status_interno='EM TRANSITO' AND EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=r.entregador AND rt.ativa AND rt.iniciada_em IS NOT NULL AND p.id=ANY(rt.ordem))))
        AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
        AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL)))
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND (
        (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))) AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
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

REVOKE ALL ON FUNCTION public.ve_acompanhar_modalidades(text,text,date,date,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_acompanhar_modalidades(text,text,date,date,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ve_admin_mapa_modalidades(p_apos uuid DEFAULT NULL,p_modalidade text DEFAULT 'motoboy') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) FROM (
  SELECT p.id,jsonb_build_object(
   'empresa',p.empresa,'modalidade',ve_modalidade(p.frete_escolhido),'chave',p.id,'pedido',p.id_int,'cliente',p.cliente,'entregador_id',v.entregador,
   'entregador',v.entregador_nome,'status_erp',p.status_interno,'prevista_em',v.prevista_em,
   'endereco',ve_previsao_endereco(p.id),
   'endereco_completo',ve_previsao_endereco(p.id) IS NOT NULL,
   'rota_id',rt.id,'ordem',array_position(rt.ordem,p.id),'retorno',rt.retorno,'iniciada_em',rt.iniciada_em
  ) item FROM propostas p
  LEFT JOIN vibe_entregas_registros v ON v.proposta=p.id
  LEFT JOIN LATERAL (SELECT ex.id_endereco_entrega FROM expedicoes ex WHERE ex.id_int=p.id_int ORDER BY ex.id LIMIT 1) ex ON true
  LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
  LEFT JOIN LATERAL (SELECT r.id,r.ordem,r.retorno,r.iniciada_em FROM vibe_entregas_rotas r
    WHERE r.ativa AND r.confirmada_em IS NOT NULL AND r.usuario=v.entregador AND p.id=ANY(r.ordem)
    ORDER BY r.confirmada_em DESC,r.id LIMIT 1) rt ON true
  WHERE (p_apos IS NULL OR p.id>p_apos) AND ((p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int)))
      OR (p.status_interno='EM TRANSITO' AND v.entregador IS NOT NULL AND rt.iniciada_em IS NOT NULL))
    AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade)) AND v.concluida_em IS NULL
    AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
    AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
  ORDER BY p.id LIMIT 201
 ) x);
END $$;

REVOKE ALL ON FUNCTION public.ve_admin_mapa_modalidades(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_mapa_modalidades(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ve_admin_pedidos_rota_modalidades(p_usuario uuid,p_busca text DEFAULT '',p_offset integer DEFAULT 0,p_modalidade text DEFAULT 'motoboy') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]') FROM (
 SELECT p.id_int numero,jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'chave',p.id,'pedido',p.id_int,'cliente',p.cliente,'empresa',p.empresa) item
 FROM propostas p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
 WHERE p.status_interno='EXPEDICAO' AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
 AND (r.entregador IS NULL OR (r.entregador=p_usuario AND r.concluida_em IS NULL))
 AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo)
 AND (p_busca='' OR p.id_int::text=p_busca)
 AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
 AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
 ORDER BY p.id_int LIMIT 51 OFFSET p_offset) x);
END $$;

REVOKE ALL ON FUNCTION public.ve_admin_pedidos_rota_modalidades(uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_pedidos_rota_modalidades(uuid,text,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.ve_registrar_repasse(p_rota uuid,p_pedidos uuid[],p_operacao uuid,p_recebedor text,p_foto text,p_observacao text,p_volumes boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rota vibe_entregas_rotas%ROWTYPE; anterior vibe_entregas_repasses%ROWTYPE; modo text;
 esperados uuid[]; informados uuid[]; chave uuid; instante timestamptz:=now(); total integer;
BEGIN
 IF auth.uid() IS NULL OR p_operacao IS NULL OR p_rota IS NULL OR coalesce(cardinality(p_pedidos),0) NOT BETWEEN 1 AND 20
 OR (SELECT count(DISTINCT id) FROM unnest(p_pedidos) id)<>cardinality(p_pedidos)
 OR p_volumes IS DISTINCT FROM true OR coalesce(length(trim(p_recebedor)),0) NOT BETWEEN 2 AND 120 OR coalesce(length(p_observacao),0)>500 THEN RAISE EXCEPTION 'Confira o grupo, recebedor e volumes'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=auth.uid() AND ativo) THEN RAISE EXCEPTION 'Entregador inativo'; END IF;
 SELECT array_agg(id ORDER BY id) INTO informados FROM unnest(p_pedidos) id;
 SELECT * INTO anterior FROM vibe_entregas_repasses WHERE operacao=p_operacao;
 IF FOUND THEN
  IF anterior.entregador IS DISTINCT FROM auth.uid() OR anterior.rota IS DISTINCT FROM p_rota OR anterior.pedidos IS DISTINCT FROM informados
    OR anterior.foto IS DISTINCT FROM p_foto OR anterior.recebedor IS DISTINCT FROM trim(p_recebedor) OR anterior.observacao IS DISTINCT FROM p_observacao THEN RAISE EXCEPTION 'Operacao de repasse ja utilizada'; END IF;
  RETURN jsonb_build_object('confirmada',true,'tipo','repasse','hora',anterior.registrada_em);
 END IF;
 SELECT * INTO STRICT rota FROM vibe_entregas_rotas WHERE id=p_rota AND usuario=auth.uid() AND ativa AND iniciada_em IS NOT NULL FOR UPDATE;
 -- Mesma ordem de travas da confirmacao individual: rota, propostas, expedicoes, registros.
 PERFORM 1 FROM propostas WHERE id=ANY(rota.ordem) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM expedicoes WHERE id_int IN (SELECT id_int FROM propostas WHERE id=ANY(rota.ordem)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM vibe_entregas_registros WHERE proposta=ANY(rota.ordem) ORDER BY proposta FOR UPDATE;
 SELECT ve_modalidade(frete_escolhido) INTO modo FROM propostas WHERE id=p_pedidos[1];
 IF modo IS NULL OR modo NOT IN ('veppo','aereo') THEN RAISE EXCEPTION 'Modalidade nao permite repasse em grupo'; END IF;
 SELECT array_agg(p.id ORDER BY p.id) INTO esperados FROM propostas p JOIN vibe_entregas_registros v ON v.proposta=p.id
 WHERE p.id=ANY(rota.ordem) AND p.id=ANY(informados) AND ve_modalidade(p.frete_escolhido)=modo AND v.concluida_em IS NULL;
 IF esperados IS DISTINCT FROM informados THEN RAISE EXCEPTION 'Selecao alterada; atualize e confira os pedidos da rota'; END IF;
 IF EXISTS(SELECT 1 FROM propostas p JOIN vibe_entregas_registros v ON v.proposta=p.id WHERE p.id=ANY(esperados)
 AND (p.status_interno IS DISTINCT FROM 'EM TRANSITO' OR v.entregador IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
 OR (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)>1
 OR EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL))) THEN RAISE EXCEPTION 'Pedidos alterados ou sem acesso'; END IF;
 -- Um comprovante, ancorado em um pedido do grupo, segue as politicas privadas existentes.
 IF NOT EXISTS(SELECT 1 FROM unnest(esperados) id WHERE p_foto=auth.uid()::text||'/'||id::text||'/'||p_operacao::text||'.jpg') THEN RAISE EXCEPTION 'Foto invalida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='vibe-entregas-comprovantes' AND name=p_foto AND (metadata->>'size')::bigint BETWEEN 1 AND 10485760 AND metadata->>'mimetype'='image/jpeg') THEN RAISE EXCEPTION 'Comprovante nao recebido'; END IF;
 INSERT INTO vibe_entregas_repasses(operacao,rota,entregador,modalidade,pedidos,recebedor,foto,observacao,registrada_em)
 VALUES(p_operacao,p_rota,auth.uid(),modo,esperados,trim(p_recebedor),p_foto,p_observacao,instante);
 UPDATE vibe_entregas_registros SET concluida_em=instante,tipo_conclusao='repasse',recebedor=trim(p_recebedor),foto=p_foto,observacao=p_observacao
 WHERE proposta=ANY(esperados) AND entregador=auth.uid() AND concluida_em IS NULL;
 GET DIAGNOSTICS total=ROW_COUNT;
 IF total<>cardinality(esperados) THEN RAISE EXCEPTION 'Repasse nao persistido para todos os pedidos'; END IF;
 UPDATE vibe_entregas_rotas SET ultima_entrega=esperados[1],previsao_revisao=previsao_revisao+1 WHERE id=p_rota;
 UPDATE vibe_entregas_registros SET prevista_em=NULL WHERE proposta=ANY(rota.ordem) AND concluida_em IS NULL;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'repasse_transportadora:'||modo,p_rota);
 -- O trecho local terminou. ERP permanece EM TRANSITO, sem gravar expedicoes.data_entrega.
 RETURN jsonb_build_object('confirmada',true,'tipo','repasse','hora',instante,'pedidos',esperados);
END $$;
REVOKE ALL ON FUNCTION public.ve_registrar_repasse(uuid,uuid[],uuid,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_registrar_repasse(uuid,uuid[],uuid,text,text,text,boolean) TO authenticated;
COMMIT;
