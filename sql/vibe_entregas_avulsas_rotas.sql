-- Preparacao local: aplicar apos avulsas e rotas_mistas, com backup das funcoes.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.propostas WHERE empresa::text='__VIBE_AVULSA__')
 THEN RAISE EXCEPTION 'Identificador interno de avulsa em uso no ERP'; END IF;
END $$;
-- A chave operacional continua sendo UUID. A origem fica explicitamente referenciada.
ALTER TABLE public.vibe_entregas_registros
 ADD COLUMN pedido_erp uuid REFERENCES public.propostas(id),
 ADD COLUMN entrega_avulsa uuid REFERENCES public.vibe_entregas_avulsas(id);
UPDATE public.vibe_entregas_registros SET pedido_erp=proposta
 WHERE pedido_erp IS NULL AND entrega_avulsa IS NULL;
ALTER TABLE public.vibe_entregas_registros
 DROP CONSTRAINT vibe_entregas_registros_proposta_fkey,
 ADD CONSTRAINT ve_registro_origem CHECK (
 (pedido_erp IS NOT NULL AND entrega_avulsa IS NULL AND proposta=pedido_erp) OR
 (pedido_erp IS NULL AND entrega_avulsa IS NOT NULL AND proposta=entrega_avulsa));
CREATE FUNCTION public.ve_registro_origem() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM vibe_entregas_avulsas WHERE id=NEW.proposta) THEN
  IF EXISTS(SELECT 1 FROM propostas WHERE id=NEW.proposta) THEN RAISE EXCEPTION 'Identificador de entrega duplicado'; END IF;
  NEW.pedido_erp:=NULL; NEW.entrega_avulsa:=NEW.proposta;
 ELSE NEW.pedido_erp:=NEW.proposta; NEW.entrega_avulsa:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ve_registro_origem BEFORE INSERT OR UPDATE OF proposta ON public.vibe_entregas_registros
FOR EACH ROW EXECUTE FUNCTION public.ve_registro_origem();
ALTER TABLE public.vibe_entregas_rotas
 DROP CONSTRAINT vibe_entregas_rotas_ultima_entrega_fkey,
 ADD CONSTRAINT vibe_entregas_rotas_ultima_entrega_fkey FOREIGN KEY(ultima_entrega) REFERENCES public.vibe_entregas_registros(proposta);

-- Visao privada de leitura. Avulsas nao recebem numero, endereco ou registro no ERP.
CREATE VIEW public.ve_itens_entrega AS
 SELECT id,id_int,cliente::text,empresa::text,frete_escolhido::text,status_interno::text,
 id_endereco_ent::text,obs_entrega::text,false AS avulsa FROM public.propostas WHERE empresa IS NULL OR empresa::text<>'__VIBE_AVULSA__'
 UNION ALL
 SELECT id,NULL::bigint,nome,'__VIBE_AVULSA__','MOTOBOY',status,NULL::text,'',true FROM public.vibe_entregas_avulsas;
CREATE VIEW public.ve_acessos_entrega AS
 SELECT usuario,empresa::text,nome,ativo,gestor FROM public.vibe_entregas_acessos
 UNION ALL SELECT usuario,'__VIBE_AVULSA__',nome,ativo,false FROM public.vibe_entregas_entregadores WHERE ativo;
REVOKE ALL ON public.ve_itens_entrega,public.ve_acessos_entrega FROM PUBLIC,anon,authenticated;

-- Locks nas tabelas de origem, antes de ler a visao UNION.
CREATE FUNCTION public.ve_travar_item(p_id uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM propostas WHERE id=p_id FOR UPDATE;
 PERFORM 1 FROM vibe_entregas_avulsas WHERE id=p_id FOR UPDATE;
END $$;
CREATE FUNCTION public.ve_item_rotulo(p_id uuid,p_numero bigint) RETURNS jsonb LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_numero IS NOT NULL THEN to_jsonb(p_numero)
 ELSE (SELECT to_jsonb('AV-'||numero) FROM vibe_entregas_avulsas WHERE id=p_id) END;
$$;
-- Somente RPCs internas podem escrever pela visao; o acesso direto e revogado.
CREATE FUNCTION public.ve_item_status() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE salvo text;
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR (to_jsonb(NEW)-'status_interno') IS DISTINCT FROM (to_jsonb(OLD)-'status_interno')
 THEN RAISE EXCEPTION 'Somente status de entrega pode ser alterado'; END IF;
 IF OLD.avulsa THEN
  UPDATE vibe_entregas_avulsas SET status=NEW.status_interno WHERE id=OLD.id AND status=OLD.status_interno RETURNING status INTO salvo;
 ELSE
  UPDATE propostas SET status_interno=NEW.status_interno WHERE id=OLD.id AND status_interno=OLD.status_interno RETURNING status_interno INTO salvo;
 END IF;
 IF salvo IS DISTINCT FROM NEW.status_interno THEN RAISE EXCEPTION 'Status nao persistido'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ve_item_status INSTEAD OF UPDATE ON public.ve_itens_entrega
FOR EACH ROW EXECUTE FUNCTION public.ve_item_status();
REVOKE ALL ON FUNCTION public.ve_travar_item(uuid),public.ve_item_rotulo(uuid,bigint),public.ve_item_status(),public.ve_registro_origem() FROM PUBLIC,anon,authenticated;
-- FUNCOES DE COMPATIBILIDADE
CREATE OR REPLACE FUNCTION public.ve_listar(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'minha')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM ve_acessos_entrega WHERE usuario=auth.uid() AND ativo) THEN
    RAISE EXCEPTION 'Acesso ao Vibe Entregas nao autorizado';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_busca IS NULL OR length(p_busca)>30 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida') THEN RAISE EXCEPTION 'Busca invalida'; END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero), '[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero, jsonb_build_object(
      'status_erp',p.status_interno,'prevista_em',r.prevista_em,'avulsa',p.avulsa,'chave',p.id,'id',ve_item_rotulo(p.id,p.id_int)#>>'{}','nome',p.cliente,
      'endereco',concat_ws(', ',en.endereco,en.numero,en.complemento,en.bairro,en.cidade,en.uf,en.cep),
      'volumes',ex.qtd_volumes,'nota',coalesce(p.obs_entrega,''),
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.entregador IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado','entregue','recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM ve_itens_entrega p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND upper(trim(p.frete_escolhido))='MOTOBOY'
      AND (((p.status_interno IN ('EM PRODUCAO','EXPEDICAO') OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador=auth.uid() OR (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND p.status_interno='EXPEDICAO'))
      AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
      AND ((p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.ve_assumir(p_proposta uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p ve_itens_entrega%ROWTYPE; r vibe_entregas_registros%ROWTYPE; rota vibe_entregas_rotas%ROWTYPE;
  motorista uuid:=auth.uid(); nome text; ordem uuid[]; nova uuid; gravado uuid;
BEGIN
  IF motorista IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=motorista AND ativo) THEN RAISE EXCEPTION 'Entregador sem acesso ativo'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(motorista::text,0));
  SELECT * INTO rota FROM vibe_entregas_rotas WHERE usuario=motorista AND ativa FOR UPDATE;
  PERFORM ve_travar_item(p_proposta);
  SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=p_proposta;
  SELECT a.nome INTO nome FROM ve_acessos_entrega a WHERE a.usuario=motorista AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL THEN RAISE EXCEPTION 'Pedido sem acesso'; END IF;
  SELECT * INTO r FROM vibe_entregas_registros WHERE proposta=p.id FOR UPDATE;
  IF r.concluida_em IS NOT NULL OR (r.entregador IS NOT NULL AND r.entregador<>motorista) THEN RAISE EXCEPTION 'Pedido ja atribuido ou concluido; atualize a lista'; END IF;
  IF p.status_interno NOT IN ('EXPEDICAO','EM TRANSITO') OR p.status_interno IS NULL
    OR ve_modalidade(p.frete_escolhido) IS NULL
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
  ordem:=ve_agrupar_paradas(ordem);
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

CREATE OR REPLACE FUNCTION public.ve_registrar(p_proposta uuid,p_operacao uuid,p_resultado text,p_recebedor text,p_foto text,p_observacao text,p_volumes boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p ve_itens_entrega%ROWTYPE; r vibe_entregas_registros%ROWTYPE; e expedicoes%ROWTYPE; instante timestamptz:=now(); persistida uuid; data_persistida timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  PERFORM 1 FROM vibe_entregas_rotas WHERE usuario=auth.uid() AND ativa FOR UPDATE;
  PERFORM ve_travar_item(p_proposta);
  SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=p_proposta;
  IF NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo) THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
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
  UPDATE ve_itens_entrega SET status_interno='ENTREGUE' WHERE id=p.id RETURNING id INTO persistida;
  IF persistida IS DISTINCT FROM p.id OR NOT EXISTS(SELECT 1 FROM ve_itens_entrega WHERE id=p.id AND status_interno='ENTREGUE') THEN RAISE EXCEPTION 'Status de entrega nao persistido'; END IF;
  UPDATE vibe_entregas_rotas SET ultima_entrega=p.id,previsao_revisao=previsao_revisao+1 WHERE usuario=auth.uid() AND ativa AND p.id=ANY(ordem);
  UPDATE vibe_entregas_registros v SET prevista_em=NULL WHERE v.entregador=auth.uid() AND v.concluida_em IS NULL AND EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=auth.uid() AND rt.ativa AND p.id=ANY(rt.ordem) AND v.proposta=ANY(rt.ordem));
  RETURN jsonb_build_object('confirmada',true,'hora',instante);
END $$;

CREATE OR REPLACE FUNCTION public.ve_pode_acessar_foto(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM vibe_entregas_registros r JOIN ve_itens_entrega p ON p.id=r.proposta
    WHERE (public.ve_e_gestor() OR (r.entregador=auth.uid() AND EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))
      AND split_part(p_nome,'/',1)=r.entregador::text
      AND split_part(p_nome,'/',2)=p.id::text
      AND p_nome ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );
$$;

CREATE OR REPLACE FUNCTION public.ve_acompanhar(p_busca text DEFAULT '',p_filtro text DEFAULT 'disponivel',p_de date DEFAULT current_date,p_ate date DEFAULT current_date,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb; inicio timestamptz; fim timestamptz;
BEGIN
  IF NOT public.ve_e_gestor() THEN RAISE EXCEPTION 'Acesso de gestor nao autorizado'; END IF;
  IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','deslocamento','concluida','tentativa') OR p_de IS NULL OR p_ate IS NULL OR p_de>p_ate OR p_ate-p_de>366 THEN RAISE EXCEPTION 'Filtros invalidos'; END IF;
  inicio := p_de::timestamp AT TIME ZONE 'America/Sao_Paulo';
  fim := (p_ate+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero,jsonb_build_object('avulsa',p.avulsa,'chave',p.id,'empresa',p.empresa,'entregador_id',r.entregador,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'status_erp',p.status_interno,
      'entregador',r.entregador_nome,'assumida_em',r.assumida_em,'concluida_em',r.concluida_em,
      'prevista_em',r.prevista_em,'recebedor',r.recebedor,'observacao',r.observacao,'foto',r.foto,
      'tentativas',coalesce((SELECT jsonb_agg(t.item ORDER BY t.momento DESC) FROM (
        SELECT te.registrada_em AS momento,jsonb_build_object('registrada_em',te.registrada_em,'motivo',te.motivo,'observacao',te.observacao) AS item
        FROM vibe_entregas_tentativas te WHERE te.proposta=p.id ORDER BY te.registrada_em DESC LIMIT 50
      ) t),'[]'::jsonb)) AS item
    FROM ve_itens_entrega p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE public.ve_e_gestor()
      AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
      AND (
        (p_filtro='disponivel' AND r.entregador IS NULL AND p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
          AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
          AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL))
        OR (p_filtro='minha' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL)
        OR (p_filtro='deslocamento' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL AND p.status_interno='EM TRANSITO')
        OR (p_filtro='concluida' AND r.concluida_em>=inicio AND r.concluida_em<fim)
        OR (p_filtro='tentativa' AND EXISTS(SELECT 1 FROM vibe_entregas_tentativas te WHERE te.proposta=p.id AND te.registrada_em>=inicio AND te.registrada_em<fim))
      )
    ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.ve_rota_reservar(p_id uuid,p_pedidos uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE dados jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR coalesce(cardinality(p_pedidos),0) NOT BETWEEN 1 AND 20
    OR (SELECT count(DISTINCT x) FROM unnest(p_pedidos) x)<>cardinality(p_pedidos) THEN RAISE EXCEPTION 'Selecione de 1 a 20 pedidos distintos'; END IF;
  -- Serializa reservas entre todas as instancias da Edge Function.
  PERFORM pg_advisory_xact_lock(83412917);
  IF EXISTS(SELECT 1 FROM vibe_entregas_rotas WHERE id=p_id) THEN RAISE EXCEPTION 'Calculo ja solicitado; atualize antes de tentar novamente'; END IF;
  IF (SELECT count(*) FROM vibe_entregas_rotas WHERE usuario=auth.uid() AND criada_em>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')>=20
    OR (SELECT count(*) FROM vibe_entregas_rotas WHERE criada_em>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')>=200 THEN RAISE EXCEPTION 'Limite diario de calculos atingido'; END IF;
  SELECT jsonb_agg(jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'endereco',ve_previsao_endereco(p.id)) ORDER BY selecionado.pos) INTO dados
    FROM unnest(p_pedidos) WITH ORDINALITY selecionado(id,pos)
    JOIN ve_itens_entrega p ON p.id=selecionado.id
    JOIN vibe_entregas_registros r ON r.proposta=p.id AND r.entregador=auth.uid() AND r.concluida_em IS NULL
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    WHERE p.status_interno='EXPEDICAO' AND ve_modalidade(p.frete_escolhido) IS NOT NULL
      AND ex.data_entrega IS NULL AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
      AND ve_previsao_endereco(p.id) IS NOT NULL
      AND EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo);
  IF coalesce(jsonb_array_length(dados),0)<>cardinality(p_pedidos) THEN RAISE EXCEPTION 'Pedido indisponivel, sem autorizacao ou com endereco incompleto'; END IF;
  INSERT INTO vibe_entregas_rotas(id,usuario,pedidos) VALUES(p_id,auth.uid(),p_pedidos);
  RETURN dados;
END $$;

CREATE OR REPLACE FUNCTION public.ve_rota_confirmar(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  IF EXISTS(SELECT 1 FROM vibe_entregas_rotas a WHERE a.usuario=auth.uid() AND a.ativa AND a.iniciada_em IS NOT NULL AND EXISTS(SELECT 1 FROM vibe_entregas_registros v WHERE v.proposta=ANY(a.pedidos) AND v.concluida_em IS NULL)) THEN RAISE EXCEPTION 'Rota em deslocamento nao pode ser substituida'; END IF;
  SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND usuario=auth.uid() FOR UPDATE;
  IF r.ordem IS NULL OR r.criada_em<now()-interval '30 minutes' THEN RAISE EXCEPTION 'Calcule novamente a rota'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(r.pedidos) x LEFT JOIN ve_itens_entrega p ON p.id=x
      LEFT JOIN vibe_entregas_registros v ON v.proposta=p.id
      WHERE p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR v.entregador IS DISTINCT FROM auth.uid() OR v.concluida_em IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)) THEN RAISE EXCEPTION 'Pedidos alterados; atualize a rota'; END IF;
  UPDATE vibe_entregas_rotas SET ativa=false WHERE usuario=auth.uid() AND ativa AND id<>p_id;
  UPDATE vibe_entregas_rotas SET ativa=true,confirmada_em=coalesce(confirmada_em,now()) WHERE id=p_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.ve_rotas_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.momento DESC),'[]'::jsonb) FROM (
    SELECT r.confirmada_em momento,jsonb_build_object('previsao_pendente',r.iniciada_em IS NOT NULL AND r.previsao_revisao<>r.previsao_calculada_revisao AND EXISTS(SELECT 1 FROM vibe_entregas_registros pv WHERE pv.proposta=ANY(r.ordem) AND pv.concluida_em IS NULL),'iniciada_em',r.iniciada_em,'id',r.id,'minha',r.usuario=auth.uid(),'retorno',r.retorno,'confirmada_em',r.confirmada_em,
      'paradas',(SELECT jsonb_agg(jsonb_build_object('prevista_em',v.prevista_em,'modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'entregador',v.entregador_nome,
        'tipo_conclusao',v.tipo_conclusao,'entregue',v.concluida_em IS NOT NULL,'status_erp',p.status_interno,'endereco',ve_previsao_endereco(p.id)) ORDER BY u.pos)
        FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN ve_itens_entrega p ON p.id=u.id JOIN vibe_entregas_registros v ON v.proposta=p.id)) item
    FROM vibe_entregas_rotas r WHERE r.ativa AND r.confirmada_em IS NOT NULL
      AND auth.uid() IS NOT NULL AND (public.ve_e_gestor() OR NOT EXISTS(SELECT 1 FROM unnest(r.pedidos) selecionado(id)
        LEFT JOIN ve_itens_entrega p ON p.id=selecionado.id WHERE p.id IS NULL OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a
        WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa AND r.usuario=auth.uid())))
    ORDER BY r.confirmada_em DESC LIMIT 50
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.ve_admin_pedidos_rota(p_usuario uuid,p_busca text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]') FROM (
 SELECT p.id_int numero,jsonb_build_object('avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'empresa',p.empresa) item
 FROM ve_itens_entrega p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
 WHERE p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
 AND (r.entregador IS NULL OR (r.entregador=p_usuario AND r.concluida_em IS NULL))
 AND EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo)
 AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
 AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
 AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
 ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset) x);
END $$;

CREATE OR REPLACE FUNCTION public.ve_admin_salvar_rota(p_id uuid,p_usuario uuid,p_ordem uuid[],p_anterior uuid DEFAULT NULL,p_retorno boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE atual vibe_entregas_rotas%ROWTYPE; p ve_itens_entrega%ROWTYPE; registro vibe_entregas_registros%ROWTYPE; nome text; gravado uuid;
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
 IF (SELECT count(*) FROM ve_itens_entrega WHERE id=ANY(p_ordem))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 p_ordem:=ve_agrupar_paradas(p_ordem);
 -- Mesma ordem de locks das confirmacoes de entrega: proposta antes do registro.
 PERFORM ve_travar_item(x) FROM unnest(p_ordem) x ORDER BY x;
 FOR p IN SELECT * FROM ve_itens_entrega WHERE id=ANY(p_ordem) ORDER BY id LOOP
  SELECT * INTO registro FROM vibe_entregas_registros WHERE proposta=p.id FOR UPDATE;
  SELECT a.nome INTO nome FROM ve_acessos_entrega a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL OR (registro.entregador IS NOT NULL AND registro.entregador<>p_usuario) THEN RAISE EXCEPTION 'Pedido sem acesso ou com outro entregador'; END IF;
  IF registro.concluida_em IS NOT NULL THEN
   IF atual.id IS NULL OR NOT p.id=ANY(atual.pedidos) THEN RAISE EXCEPTION 'Entrega concluida fora da rota'; END IF;
  ELSE
   IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR ve_modalidade(p.frete_escolhido) IS NULL
    OR (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)>1 OR EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
   IF registro.proposta IS NULL THEN INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome) VALUES(p.id,(SELECT e.id FROM expedicoes e WHERE e.id_int=p.id_int),p_usuario,nome); ELSIF registro.entregador IS NULL THEN UPDATE vibe_entregas_registros SET entregador=p_usuario,entregador_nome=nome,assumida_em=now(),prevista_em=NULL WHERE proposta=p.id; END IF;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM ve_itens_entrega WHERE id=ANY(p_ordem))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 UPDATE vibe_entregas_rotas SET ativa=false WHERE id=atual.id;
 INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa) VALUES(p_id,p_usuario,p_ordem,p_ordem,p_retorno,now(),true) RETURNING id INTO gravado;
 IF gravado IS NULL THEN RAISE EXCEPTION 'Rota nao persistida'; END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_salva',p_id);
 RETURN jsonb_build_object('id',gravado,'confirmado',true);
END $$;

CREATE OR REPLACE FUNCTION public.ve_admin_atribuir_rota(p_proposta uuid,p_usuario uuid,p_anterior uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  p ve_itens_entrega%ROWTYPE; registro vibe_entregas_registros%ROWTYPE;
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
  PERFORM ve_travar_item(p_proposta);
  SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=p_proposta;
  SELECT * INTO registro FROM vibe_entregas_registros WHERE proposta=p_proposta FOR UPDATE;
  IF registro.concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Entrega concluida nao pode ser transferida'; END IF;
  IF registro.entregador IS DISTINCT FROM p_anterior AND registro.entregador IS DISTINCT FROM p_usuario THEN
    RAISE EXCEPTION 'Entregador alterado por outra sessao; atualize a lista';
  END IF;
  IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR ve_modalidade(p.frete_escolhido) IS NULL
    OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
    OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL)
    THEN RAISE EXCEPTION 'Pedido indisponivel para entrega'; END IF;
  SELECT a.nome INTO nome FROM ve_acessos_entrega a JOIN vibe_entregas_entregadores d ON d.usuario=a.usuario
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

CREATE OR REPLACE FUNCTION public.ve_admin_iniciar_deslocamento(p_id uuid,p_previsoes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; p ve_itens_entrega%ROWTYPE; v vibe_entregas_registros%ROWTYPE;
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
  -- Trava ve_itens_entrega em ordem fixa, como a gravacao administrativa de rotas.
  PERFORM ve_travar_item(x) FROM unnest(r.ordem) x ORDER BY x;
  FOREACH chave IN ARRAY r.ordem LOOP
    SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=chave;
    PERFORM 1 FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
    SELECT * INTO STRICT v FROM vibe_entregas_registros WHERE proposta=chave FOR UPDATE;
    IF v.entregador<>motorista THEN RAISE EXCEPTION 'Atribuicao alterada; atualize a rota'; END IF;
    IF v.concluida_em IS NOT NULL THEN CONTINUE; END IF;
    IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR ve_modalidade(p.frete_escolhido) IS NULL
      OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
      OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL)
      OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega WHERE usuario=motorista AND empresa=p.empresa AND ativo)
      THEN RAISE EXCEPTION 'Pedido indisponivel; revise a rota'; END IF;
    IF jsonb_typeof(p_previsoes->chave::text) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Informe a previsao de cada pedido'; END IF;
    previsao:=(p_previsoes->>chave::text)::timestamptz;
    IF previsao<instante OR previsao>instante+interval '7 days' OR previsao<anterior THEN RAISE EXCEPTION 'Previsoes devem seguir a ordem da rota, entre agora e sete dias'; END IF;
    anterior:=previsao;
    UPDATE vibe_entregas_registros SET prevista_em=previsao WHERE proposta=chave RETURNING proposta INTO persistida;
    IF persistida IS DISTINCT FROM chave THEN RAISE EXCEPTION 'Previsao nao persistida'; END IF;
    UPDATE ve_itens_entrega SET status_interno='EM TRANSITO' WHERE id=chave AND status_interno='EXPEDICAO' RETURNING status_interno INTO status_salvo;
    IF status_salvo IS DISTINCT FROM 'EM TRANSITO' THEN RAISE EXCEPTION 'Deslocamento nao persistido'; END IF;
    pendentes:=pendentes+1;
  END LOOP;
  IF pendentes=0 OR (SELECT count(*) FROM jsonb_object_keys(p_previsoes))<>pendentes THEN RAISE EXCEPTION 'Confira os pedidos pendentes e suas previsoes'; END IF;
  UPDATE vibe_entregas_rotas SET iniciada_em=instante WHERE id=p_id RETURNING id INTO persistida;
  IF persistida IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Inicio da rota nao persistido'; END IF;
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_em_deslocamento',p_id);
  RETURN jsonb_build_object('confirmado',true,'iniciada_em',instante,'pedidos',pendentes);
END $$;

CREATE OR REPLACE FUNCTION public.ve_admin_mapa(p_apos uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) FROM (
  SELECT p.id,jsonb_build_object(
   'empresa',p.empresa,'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'entregador_id',v.entregador,
   'entregador',v.entregador_nome,'status_erp',p.status_interno,'prevista_em',v.prevista_em,
   'endereco',concat_ws(', ',en.endereco,en.numero,en.bairro,en.cidade,en.uf,en.cep),
   'endereco_completo',nullif(trim(en.endereco),'') IS NOT NULL AND nullif(trim(en.numero),'') IS NOT NULL
      AND nullif(trim(en.cidade),'') IS NOT NULL AND nullif(trim(en.uf),'') IS NOT NULL,
   'rota_id',rt.id,'ordem',array_position(rt.ordem,p.id),'retorno',rt.retorno,'iniciada_em',rt.iniciada_em
  ) item FROM ve_itens_entrega p
  LEFT JOIN vibe_entregas_registros v ON v.proposta=p.id
  LEFT JOIN LATERAL (SELECT ex.id_endereco_entrega FROM expedicoes ex WHERE ex.id_int=p.id_int ORDER BY ex.id LIMIT 1) ex ON true
  LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
  LEFT JOIN LATERAL (SELECT r.id,r.ordem,r.retorno,r.iniciada_em FROM vibe_entregas_rotas r
    WHERE r.ativa AND r.confirmada_em IS NOT NULL AND r.usuario=v.entregador AND p.id=ANY(r.ordem)
    ORDER BY r.confirmada_em DESC,r.id LIMIT 1) rt ON true
  WHERE (p_apos IS NULL OR p.id>p_apos) AND (p.status_interno IN ('EM PRODUCAO','EXPEDICAO')
      OR (p.status_interno='EM TRANSITO' AND v.entregador IS NOT NULL AND rt.iniciada_em IS NOT NULL))
    AND upper(trim(p.frete_escolhido))='MOTOBOY' AND v.concluida_em IS NULL
    AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
    AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
  ORDER BY p.id LIMIT 201
 ) x);
END $$;

CREATE OR REPLACE FUNCTION public.ve_admin_retirar_entregador(p_proposta uuid,p_anterior uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p ve_itens_entrega%ROWTYPE; r vibe_entregas_registros%ROWTYPE; rota vibe_entregas_rotas%ROWTYPE; persistida uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_proposta IS NULL OR p_anterior IS NULL THEN RAISE EXCEPTION 'Pedido e entregador obrigatorios'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_anterior::text,0));
 SELECT * INTO rota FROM vibe_entregas_rotas WHERE usuario=p_anterior AND ativa FOR UPDATE;
 PERFORM ve_travar_item(p_proposta);
  SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=p_proposta;
 SELECT * INTO STRICT r FROM vibe_entregas_registros WHERE proposta=p_proposta FOR UPDATE;
 IF r.entregador IS DISTINCT FROM p_anterior THEN RAISE EXCEPTION 'Entregador alterado; atualize a lista'; END IF;
 IF r.concluida_em IS NOT NULL OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Entrega concluida nao pode ser retirada'; END IF;
 IF coalesce(p.status_interno,'') NOT IN ('EXPEDICAO','EM TRANSITO') OR ve_modalidade(p.frete_escolhido) IS NULL OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1 THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
 IF p.status_interno='EM TRANSITO' AND (rota.id IS NULL OR rota.iniciada_em IS NULL OR NOT p.id=ANY(rota.ordem)) THEN RAISE EXCEPTION 'Deslocamento fora da rota Vibe'; END IF;
 IF rota.id IS NOT NULL THEN
  UPDATE vibe_entregas_rotas SET pedidos=array_remove(pedidos,p.id),ordem=array_remove(ordem,p.id),ativa=cardinality(array_remove(ordem,p.id))>0 WHERE id=rota.id RETURNING id INTO persistida;
  IF persistida IS NULL THEN RAISE EXCEPTION 'Rota nao atualizada'; END IF;
 END IF;
 UPDATE vibe_entregas_registros SET entregador=NULL,entregador_nome=NULL,assumida_em=NULL,prevista_em=NULL,operacao=NULL WHERE proposta=p.id AND entregador=p_anterior AND concluida_em IS NULL RETURNING proposta INTO persistida;
 IF persistida IS NULL THEN RAISE EXCEPTION 'Retirada nao persistida'; END IF;
 IF p.status_interno='EM TRANSITO' THEN
  UPDATE ve_itens_entrega SET status_interno='EXPEDICAO' WHERE id=p.id AND status_interno='EM TRANSITO' RETURNING id INTO persistida;
  IF persistida IS NULL THEN RAISE EXCEPTION 'Retorno para expedicao nao persistido'; END IF;
 END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'pedido_retirado_entregador:'||p_anterior::text,p.id);
 RETURN jsonb_build_object('confirmado',true,'retirada',true,'proposta',p.id);
END $$;

CREATE OR REPLACE FUNCTION public.ve_previsao_endereco(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT endereco FROM vibe_entregas_avulsas WHERE id=p_id),ve_destino_fixo(p.frete_escolhido),concat_ws(', ',en.endereco,en.numero,en.complemento,en.bairro,en.cidade,en.uf,en.cep))
 FROM ve_itens_entrega p LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
 LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
 WHERE p.id=p_id AND (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)<=1
 AND (EXISTS(SELECT 1 FROM vibe_entregas_avulsas WHERE id=p_id) OR ve_destino_fixo(p.frete_escolhido) IS NOT NULL OR (nullif(trim(en.endereco),'') IS NOT NULL AND nullif(trim(en.numero),'') IS NOT NULL AND nullif(trim(en.cidade),'') IS NOT NULL AND nullif(trim(en.uf),'') IS NOT NULL));
$$;

CREATE OR REPLACE FUNCTION public.ve_previsao_contexto(p_id uuid,p_iniciar boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; paradas jsonb;
BEGIN
 SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND ativa;
 IF p_iniciar THEN
  IF r.iniciada_em IS NOT NULL OR NOT (ve_admin_edita() OR (r.usuario=auth.uid() AND EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=auth.uid() AND ativo) AND NOT EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) JOIN ve_itens_entrega p ON p.id=u.id WHERE NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))) THEN RAISE EXCEPTION 'Inicio ADM indisponivel'; END IF;
 ELSE
  IF r.iniciada_em IS NULL OR NOT (ve_admin_edita() OR (r.usuario=auth.uid() AND NOT EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) LEFT JOIN ve_itens_entrega p ON p.id=u.id WHERE p.id IS NULL OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))) THEN RAISE EXCEPTION 'Acesso nao permitido'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'endereco',ve_previsao_endereco(p.id)) ORDER BY u.pos),'[]') INTO paradas
 FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN ve_itens_entrega p ON p.id=u.id JOIN vibe_entregas_registros v ON v.proposta=p.id
 WHERE v.concluida_em IS NULL AND v.entregador=r.usuario;
 IF EXISTS(SELECT 1 FROM unnest(r.ordem) u(id) LEFT JOIN vibe_entregas_registros v ON v.proposta=u.id WHERE v.entregador IS DISTINCT FROM r.usuario) THEN RAISE EXCEPTION 'Atribuicao alterada'; END IF;
 RETURN jsonb_build_object('id',r.id,'revisao',r.previsao_revisao,'agora',now(),'pendente',jsonb_array_length(paradas)>0 AND r.previsao_revisao<>r.previsao_calculada_revisao,
 'origem',CASE WHEN r.ultima_entrega IS NULL THEN 'Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130, Brasil' ELSE ve_previsao_endereco(r.ultima_entrega) END,'paradas',paradas);
END $$;

CREATE OR REPLACE FUNCTION public.ve_iniciar_deslocamento_proprio(p_id uuid,p_previsoes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE; p ve_itens_entrega%ROWTYPE; v vibe_entregas_registros%ROWTYPE;
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
  -- Trava ve_itens_entrega em ordem fixa, como a gravacao administrativa de rotas.
  PERFORM ve_travar_item(x) FROM unnest(r.ordem) x ORDER BY x;
  FOREACH chave IN ARRAY r.ordem LOOP
    SELECT * INTO STRICT p FROM ve_itens_entrega WHERE id=chave;
    PERFORM 1 FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
    SELECT * INTO STRICT v FROM vibe_entregas_registros WHERE proposta=chave FOR UPDATE;
    IF v.entregador IS DISTINCT FROM motorista THEN RAISE EXCEPTION 'Atribuicao alterada; atualize a rota'; END IF;
    IF v.concluida_em IS NOT NULL THEN CONTINUE; END IF;
    IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR ve_modalidade(p.frete_escolhido) IS NULL
      OR (SELECT count(*) FROM expedicoes WHERE id_int=p.id_int)>1
      OR EXISTS(SELECT 1 FROM expedicoes WHERE id_int=p.id_int AND data_entrega IS NOT NULL)
      OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega WHERE usuario=motorista AND empresa=p.empresa AND ativo)
      THEN RAISE EXCEPTION 'Pedido indisponivel; revise a rota'; END IF;
    IF jsonb_typeof(p_previsoes->chave::text) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Informe a previsao de cada pedido'; END IF;
    previsao:=(p_previsoes->>chave::text)::timestamptz;
    IF previsao<instante OR previsao>instante+interval '7 days' OR previsao<anterior THEN RAISE EXCEPTION 'Previsoes devem seguir a ordem da rota, entre agora e sete dias'; END IF;
    anterior:=previsao;
    UPDATE vibe_entregas_registros SET prevista_em=previsao WHERE proposta=chave RETURNING proposta INTO persistida;
    IF persistida IS DISTINCT FROM chave THEN RAISE EXCEPTION 'Previsao nao persistida'; END IF;
    UPDATE ve_itens_entrega SET status_interno='EM TRANSITO' WHERE id=chave AND status_interno='EXPEDICAO' RETURNING status_interno INTO status_salvo;
    IF status_salvo IS DISTINCT FROM 'EM TRANSITO' THEN RAISE EXCEPTION 'Deslocamento nao persistido'; END IF;
    pendentes:=pendentes+1;
  END LOOP;
  IF pendentes=0 OR (SELECT count(*) FROM jsonb_object_keys(p_previsoes))<>pendentes THEN RAISE EXCEPTION 'Confira os pedidos pendentes e suas previsoes'; END IF;
  UPDATE vibe_entregas_rotas SET iniciada_em=instante WHERE id=p_id RETURNING id INTO persistida;
  IF persistida IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Inicio da rota nao persistido'; END IF;
  INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_em_deslocamento',p_id);
  RETURN jsonb_build_object('confirmado',true,'iniciada_em',instante,'pedidos',pendentes);
END $$;

CREATE OR REPLACE FUNCTION public.ve_previsao_aplicar(p_id uuid,p_usuario uuid,p_revisao bigint,p_ordem uuid[],p_previsoes jsonb,p_iniciar boolean) RETURNS jsonb
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
  PERFORM ve_travar_item(x) FROM unnest(p_ordem) x ORDER BY x;
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

CREATE OR REPLACE FUNCTION public.ve_listar_modalidades(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'minha',p_modalidade text DEFAULT 'motoboy')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM ve_acessos_entrega WHERE usuario=auth.uid() AND ativo) THEN
    RAISE EXCEPTION 'Acesso ao Vibe Entregas nao autorizado';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_busca IS NULL OR length(p_busca)>30 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida') THEN RAISE EXCEPTION 'Busca invalida'; END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero), '[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero, jsonb_build_object(
      'status_erp',p.status_interno,'prevista_em',r.prevista_em,'modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'id',ve_item_rotulo(p.id,p.id_int)#>>'{}','nome',p.cliente,
      'endereco',ve_previsao_endereco(p.id),
      'volumes',ex.qtd_volumes,'nota',coalesce(p.obs_entrega,''),
      'estado',CASE WHEN r.concluida_em IS NOT NULL THEN 'concluida' WHEN r.entregador IS NOT NULL THEN 'minha' ELSE 'disponivel' END,
      'registro',CASE WHEN r.concluida_em IS NOT NULL THEN jsonb_build_object('resultado',CASE WHEN r.tipo_conclusao='repasse' THEN 'repasse' ELSE 'entregue' END,'recebedor',r.recebedor,'hora',r.concluida_em) END
    ) AS item
    FROM ve_itens_entrega p
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    LEFT JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
      AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
      AND ((((p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))) OR (p.status_interno='EM TRANSITO' AND r.entregador=auth.uid())) AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador=auth.uid() OR (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int)))))
      AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
      AND ((p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

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
    SELECT p.id_int AS numero,jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'empresa',p.empresa,'entregador_id',r.entregador,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'status_erp',p.status_interno,
      'entregador',r.entregador_nome,'assumida_em',r.assumida_em,'tipo_conclusao',r.tipo_conclusao,'concluida_em',r.concluida_em,
      'prevista_em',r.prevista_em,'recebedor',r.recebedor,'observacao',r.observacao,'foto',r.foto,
      'tentativas',coalesce((SELECT jsonb_agg(t.item ORDER BY t.momento DESC) FROM (
        SELECT te.registrada_em AS momento,jsonb_build_object('registrada_em',te.registrada_em,'motivo',te.motivo,'observacao',te.observacao) AS item
        FROM vibe_entregas_tentativas te WHERE te.proposta=p.id ORDER BY te.registrada_em DESC LIMIT 50
      ) t),'[]'::jsonb)) AS item
    FROM ve_itens_entrega p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
    WHERE public.ve_e_gestor()
      AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
      AND (p_filtro IN ('concluida','tentativa') OR (
        r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO'
          OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))
          OR (p.status_interno='EM TRANSITO' AND EXISTS(SELECT 1 FROM vibe_entregas_rotas rt WHERE rt.usuario=r.entregador AND rt.ativa AND rt.iniciada_em IS NOT NULL AND p.id=ANY(rt.ordem))))
        AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
        AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL)))
      AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
      AND (
        (p_filtro='disponivel' AND r.entregador IS NULL AND r.concluida_em IS NULL AND (p.status_interno='EXPEDICAO' OR (p.status_interno IN ('NOVO','AGUARDANDO','EM PRODUCAO') AND ve_expedicao_hoje(p.id_int))) AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
          AND (SELECT count(*) FROM expedicoes ex WHERE ex.id_int=p.id_int)<=1
          AND NOT EXISTS(SELECT 1 FROM expedicoes ex WHERE ex.id_int=p.id_int AND ex.data_entrega IS NOT NULL))
        OR (p_filtro='minha' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL)
        OR (p_filtro='deslocamento' AND r.entregador IS NOT NULL AND r.concluida_em IS NULL AND p.status_interno='EM TRANSITO')
        OR (p_filtro='concluida' AND r.concluida_em>=inicio AND r.concluida_em<fim)
        OR (p_filtro='tentativa' AND EXISTS(SELECT 1 FROM vibe_entregas_tentativas te WHERE te.proposta=p.id AND te.registrada_em>=inicio AND te.registrada_em<fim))
      )
    ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE OR REPLACE FUNCTION public.ve_admin_mapa_modalidades(p_apos uuid DEFAULT NULL,p_modalidade text DEFAULT 'motoboy') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.id),'[]'::jsonb) FROM (
  SELECT p.id,jsonb_build_object(
   'empresa',p.empresa,'modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'entregador_id',v.entregador,
   'entregador',v.entregador_nome,'status_erp',p.status_interno,'prevista_em',v.prevista_em,
   'endereco',ve_previsao_endereco(p.id),
   'endereco_completo',ve_previsao_endereco(p.id) IS NOT NULL,
   'rota_id',rt.id,'ordem',array_position(rt.ordem,p.id),'retorno',rt.retorno,'iniciada_em',rt.iniciada_em
  ) item FROM ve_itens_entrega p
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

CREATE OR REPLACE FUNCTION public.ve_admin_pedidos_rota_modalidades(p_usuario uuid,p_busca text DEFAULT '',p_offset integer DEFAULT 0,p_modalidade text DEFAULT 'motoboy') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_modalidade IS NULL OR p_modalidade NOT IN ('todas','motoboy','veppo','aereo') THEN RAISE EXCEPTION 'Modalidade invalida'; END IF;
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]') FROM (
 SELECT p.id_int numero,jsonb_build_object('modalidade',ve_modalidade(p.frete_escolhido),'avulsa',p.avulsa,'chave',p.id,'pedido',ve_item_rotulo(p.id,p.id_int),'cliente',p.cliente,'empresa',p.empresa) item
 FROM ve_itens_entrega p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
 WHERE p.status_interno='EXPEDICAO' AND (ve_modalidade(p.frete_escolhido) IS NOT NULL AND (p_modalidade='todas' OR ve_modalidade(p.frete_escolhido)=p_modalidade))
 AND (r.entregador IS NULL OR (r.entregador=p_usuario AND r.concluida_em IS NULL))
 AND EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo)
 AND (p_busca='' OR upper(ve_item_rotulo(p.id,p.id_int)#>>'{}')=upper(p_busca))
 AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
 AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
 ORDER BY p.id_int,p.id LIMIT 51 OFFSET p_offset) x);
END $$;

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
 -- Mesma ordem de travas da confirmacao individual: rota, ve_itens_entrega, expedicoes, registros.
 PERFORM ve_travar_item(x) FROM unnest(rota.ordem) x ORDER BY x;
 PERFORM 1 FROM expedicoes WHERE id_int IN (SELECT id_int FROM ve_itens_entrega WHERE id=ANY(rota.ordem)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM vibe_entregas_registros WHERE proposta=ANY(rota.ordem) ORDER BY proposta FOR UPDATE;
 SELECT ve_modalidade(frete_escolhido) INTO modo FROM ve_itens_entrega WHERE id=p_pedidos[1];
 IF modo IS NULL OR modo NOT IN ('veppo','aereo') THEN RAISE EXCEPTION 'Modalidade nao permite repasse em grupo'; END IF;
 SELECT array_agg(p.id ORDER BY p.id) INTO esperados FROM ve_itens_entrega p JOIN vibe_entregas_registros v ON v.proposta=p.id
 WHERE p.id=ANY(rota.ordem) AND p.id=ANY(informados) AND ve_modalidade(p.frete_escolhido)=modo AND v.concluida_em IS NULL;
 IF esperados IS DISTINCT FROM informados THEN RAISE EXCEPTION 'Selecao alterada; atualize e confira os pedidos da rota'; END IF;
 IF EXISTS(SELECT 1 FROM ve_itens_entrega p JOIN vibe_entregas_registros v ON v.proposta=p.id WHERE p.id=ANY(esperados)
 AND (p.status_interno IS DISTINCT FROM 'EM TRANSITO' OR v.entregador IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM ve_acessos_entrega a WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa)
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
COMMIT;
