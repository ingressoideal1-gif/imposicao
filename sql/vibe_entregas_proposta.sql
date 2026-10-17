-- PROPOSTA LOCAL. NAO APLICADA. Requer revisao e autorizacao antes de executar.
-- Preserva as estruturas existentes; cria objetos exclusivos do Vibe Entregas.
-- O cadastro de acessos e explicito, por usuario e empresa, sem autopromocao.
BEGIN;
-- Gestores seguem o perfil ADM atual do Imposition, sem copiar permissoes.
CREATE FUNCTION public.ve_e_gestor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM imposition_user_permissions
    WHERE user_id=auth.uid() AND role='admin' AND perm_admin_view IS TRUE);
$$;
REVOKE ALL ON FUNCTION public.ve_e_gestor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_e_gestor() TO authenticated;
CREATE TABLE public.vibe_entregas_acessos (
  usuario uuid NOT NULL REFERENCES auth.users(id),
  empresa text NOT NULL,
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 120),
  ativo boolean NOT NULL DEFAULT true,
  gestor boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario, empresa)
);
CREATE TABLE public.vibe_entregas_registros (
  proposta uuid PRIMARY KEY REFERENCES public.propostas(id),
  expedicao bigint UNIQUE REFERENCES public.expedicoes(id),
  entregador uuid NOT NULL REFERENCES auth.users(id),
  entregador_nome text NOT NULL,
  assumida_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  recebedor text,
  foto text,
  observacao text,
  operacao uuid UNIQUE
);
CREATE TABLE public.vibe_entregas_tentativas (
  operacao uuid PRIMARY KEY,
  proposta uuid NOT NULL REFERENCES public.vibe_entregas_registros(proposta),
  entregador uuid NOT NULL REFERENCES auth.users(id),
  registrada_em timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL CHECK (motivo IN ('ausente','endereco','recusa')),
  observacao text
);
ALTER TABLE public.vibe_entregas_acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_entregas_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_entregas_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vibe_entregas_acessos, public.vibe_entregas_registros, public.vibe_entregas_tentativas FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ve_listar(p_busca text DEFAULT '', p_offset integer DEFAULT 0, p_filtro text DEFAULT 'disponivel')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM vibe_entregas_acessos WHERE usuario=auth.uid() AND ativo) THEN
    RAISE EXCEPTION 'Acesso ao Vibe Entregas nao autorizado';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_busca IS NULL OR length(p_busca)>30 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida') THEN RAISE EXCEPTION 'Busca invalida'; END IF;
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero), '[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero, jsonb_build_object(
      'chave',p.id,'id',p.id_int::text,'nome',p.cliente,
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
      AND ((p.status_interno='EXPEDICAO' AND ex.data_entrega IS NULL) OR (r.entregador=auth.uid() AND r.concluida_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (r.entregador IS NULL OR r.entregador=auth.uid())
      AND (p_busca='' OR p.id_int::text=p_busca)
      AND ((p_filtro='disponivel' AND r.proposta IS NULL) OR (p_filtro='minha' AND r.proposta IS NOT NULL AND r.concluida_em IS NULL) OR (p_filtro='concluida' AND r.concluida_em IS NOT NULL))
      AND (SELECT count(*) FROM expedicoes e2 WHERE e2.id_int=p.id_int)<=1
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;

CREATE FUNCTION public.ve_assumir(p_proposta uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p propostas%ROWTYPE; e expedicoes%ROWTYPE; r vibe_entregas_registros%ROWTYPE; nome text;
BEGIN
  SELECT * INTO STRICT p FROM propostas WHERE id=p_proposta FOR UPDATE;
  SELECT a.nome INTO nome FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL THEN RAISE EXCEPTION 'Acesso nao autorizado'; END IF;
  -- Ausencia de expedicao e valida; duplicidade continua sendo recusada.
  BEGIN
    SELECT * INTO STRICT e FROM expedicoes WHERE id_int=p.id_int FOR UPDATE;
  EXCEPTION WHEN no_data_found THEN e := NULL;
  END;
  IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY' OR e.data_entrega IS NOT NULL THEN RAISE EXCEPTION 'Pedido nao esta disponivel'; END IF;
  SELECT * INTO r FROM vibe_entregas_registros WHERE proposta=p.id;
  IF FOUND THEN
    IF r.entregador<>auth.uid() THEN RAISE EXCEPTION 'Pedido assumido por outro entregador'; END IF;
    RETURN jsonb_build_object('assumida',true);
  END IF;
  INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome) VALUES(p.id,e.id,auth.uid(),nome);
  RETURN jsonb_build_object('assumida',true);
END $$;

CREATE FUNCTION public.ve_registrar(p_proposta uuid,p_operacao uuid,p_resultado text,p_recebedor text,p_foto text,p_observacao text,p_volumes boolean)
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
  IF r.concluida_em IS NOT NULL OR e.data_entrega IS NOT NULL OR p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY' THEN RAISE EXCEPTION 'Pedido alterado; atualize a lista'; END IF;
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

REVOKE ALL ON FUNCTION public.ve_listar(text,integer,text),public.ve_assumir(uuid),public.ve_registrar(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_listar(text,integer,text),public.ve_assumir(uuid),public.ve_registrar(uuid,uuid,text,text,text,text,boolean) TO authenticated;

-- Bucket novo e privado; nao reutiliza nem altera buckets existentes.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('vibe-entregas-comprovantes','vibe-entregas-comprovantes',false,10485760,ARRAY['image/jpeg']);
CREATE FUNCTION public.ve_pode_acessar_foto(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM vibe_entregas_registros r JOIN propostas p ON p.id=r.proposta
    WHERE (public.ve_e_gestor() OR (r.entregador=auth.uid() AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo)))
      AND split_part(p_nome,'/',1)=r.entregador::text
      AND split_part(p_nome,'/',2)=p.id::text
      AND p_nome ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );
$$;
REVOKE ALL ON FUNCTION public.ve_pode_acessar_foto(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_pode_acessar_foto(text) TO authenticated;
CREATE POLICY ve_enviar_comprovante ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='vibe-entregas-comprovantes' AND (storage.foldername(name))[1]=auth.uid()::text
  AND public.ve_pode_acessar_foto(name)
);
CREATE POLICY ve_ler_comprovante_autorizado ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='vibe-entregas-comprovantes' AND public.ve_pode_acessar_foto(name)
);
-- Sem UPDATE/DELETE de objetos: a prova nao pode ser sobrescrita pelo navegador.
-- Gestores seguem o acesso administrativo global do Imposition.
-- Entregadores continuam restritos as empresas explicitamente cadastradas.
CREATE FUNCTION public.ve_acompanhar(p_busca text DEFAULT '',p_filtro text DEFAULT 'disponivel',p_de date DEFAULT current_date,p_ate date DEFAULT current_date,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb; inicio timestamptz; fim timestamptz;
BEGIN
  IF NOT public.ve_e_gestor() THEN RAISE EXCEPTION 'Acesso de gestor nao autorizado'; END IF;
  IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 OR p_filtro IS NULL OR p_filtro NOT IN ('disponivel','minha','concluida','tentativa') OR p_de IS NULL OR p_ate IS NULL OR p_de>p_ate OR p_ate-p_de>366 THEN RAISE EXCEPTION 'Filtros invalidos'; END IF;
  inicio := p_de::timestamp AT TIME ZONE 'America/Sao_Paulo';
  fim := (p_ate+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]'::jsonb) INTO resultado FROM (
    SELECT p.id_int AS numero,jsonb_build_object('pedido',p.id_int,'cliente',p.cliente,'status_erp',p.status_interno,
      'entregador',r.entregador_nome,'assumida_em',r.assumida_em,'concluida_em',r.concluida_em,
      'recebedor',r.recebedor,'observacao',r.observacao,'foto',r.foto,
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
        OR (p_filtro='concluida' AND r.concluida_em>=inicio AND r.concluida_em<fim)
        OR (p_filtro='tentativa' AND EXISTS(SELECT 1 FROM vibe_entregas_tentativas te WHERE te.proposta=p.id AND te.registrada_em>=inicio AND te.registrada_em<fim))
      )
    ORDER BY p.id_int LIMIT 51 OFFSET p_offset
  ) x;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.ve_acompanhar(text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_acompanhar(text,text,date,date,integer) TO authenticated;
COMMIT;
