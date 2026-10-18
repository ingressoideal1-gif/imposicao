-- Aplicar em transação após revisão. Não altera dados do ERP.
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
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.proposta IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado','entregue','recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM propostas p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND upper(trim(p.frete_escolhido))='MOTOBOY'
      AND (((p.status_interno IN ('EM PRODUCAO','EXPEDICAO') OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND r.entregador=auth.uid()
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
  IF NOT EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=auth.uid() AND rt.ativa AND rt.iniciada_em IS NOT NULL AND p.id=ANY(rt.ordem)) THEN RAISE EXCEPTION 'Aguarde a liberacao da rota pelo ADM'; END IF;
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

-- Atribuição e planejamento passam exclusivamente pelo ADM.
REVOKE EXECUTE ON FUNCTION public.ve_assumir(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ve_rota_confirmar(uuid) FROM authenticated, anon, PUBLIC;
COMMIT;
