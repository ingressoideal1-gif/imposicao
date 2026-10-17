-- PROPOSTA LOCAL, NAO APLICADA. Executar somente apos vibe_entregas_proposta.sql.
BEGIN;
CREATE TABLE public.vibe_entregas_rotas (
  id uuid PRIMARY KEY, usuario uuid NOT NULL REFERENCES auth.users(id),
  pedidos uuid[] NOT NULL, ordem uuid[], retorno boolean NOT NULL DEFAULT true, criada_em timestamptz NOT NULL DEFAULT now(),
  confirmada_em timestamptz, ativa boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX ve_rota_ativa ON public.vibe_entregas_rotas(usuario) WHERE ativa;
ALTER TABLE public.vibe_entregas_rotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vibe_entregas_rotas FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ve_rota_reservar(p_id uuid,p_pedidos uuid[]) RETURNS jsonb
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
  SELECT jsonb_agg(jsonb_build_object('chave',p.id,'pedido',p.id_int,'endereco',concat_ws(', ',en.endereco,en.numero,en.complemento,en.bairro,en.cidade,en.uf,en.cep)) ORDER BY selecionado.pos) INTO dados
    FROM unnest(p_pedidos) WITH ORDINALITY selecionado(id,pos)
    JOIN propostas p ON p.id=selecionado.id
    JOIN vibe_entregas_registros r ON r.proposta=p.id AND r.entregador=auth.uid() AND r.concluida_em IS NULL
    LEFT JOIN expedicoes ex ON ex.id_int=p.id_int
    JOIN enderecos en ON en.id::text=coalesce(ex.id_endereco_entrega::text,p.id_endereco_ent)
    WHERE p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
      AND ex.data_entrega IS NULL AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
      AND nullif(trim(en.endereco),'') IS NOT NULL AND nullif(trim(en.numero),'') IS NOT NULL
      AND nullif(trim(en.cidade),'') IS NOT NULL AND nullif(trim(en.uf),'') IS NOT NULL
      AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=auth.uid() AND a.empresa=p.empresa AND a.ativo);
  IF coalesce(jsonb_array_length(dados),0)<>cardinality(p_pedidos) THEN RAISE EXCEPTION 'Pedido indisponivel, sem autorizacao ou com endereco incompleto'; END IF;
  INSERT INTO vibe_entregas_rotas(id,usuario,pedidos) VALUES(p_id,auth.uid(),p_pedidos);
  RETURN dados;
END $$;

-- Somente a Edge Function grava a ordem calculada. Metricas do Google nao sao persistidas.
CREATE FUNCTION public.ve_rota_resultado(p_id uuid,p_usuario uuid,p_ordem uuid[],p_retorno boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM vibe_entregas_rotas WHERE id=p_id AND usuario=p_usuario FOR UPDATE;
  IF r.ordem IS NOT NULL OR p_ordem IS NULL OR cardinality(p_ordem)<>cardinality(r.pedidos)
    OR NOT p_ordem @> r.pedidos OR NOT r.pedidos @> p_ordem THEN RAISE EXCEPTION 'Ordem invalida'; END IF;
  UPDATE vibe_entregas_rotas SET ordem=p_ordem,retorno=p_retorno WHERE id=p_id;
  RETURN true;
END $$;

CREATE FUNCTION public.ve_rota_confirmar(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_rotas%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
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

CREATE FUNCTION public.ve_rotas_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.momento DESC),'[]'::jsonb) FROM (
    SELECT r.confirmada_em momento,jsonb_build_object('id',r.id,'minha',r.usuario=auth.uid(),'retorno',r.retorno,'confirmada_em',r.confirmada_em,
      'paradas',(SELECT jsonb_agg(jsonb_build_object('chave',p.id,'pedido',p.id_int,'entregador',v.entregador_nome,
        'entregue',v.concluida_em IS NOT NULL,'status_erp',p.status_interno,'endereco',(SELECT concat_ws(', ',en.endereco,en.numero,en.bairro,en.cidade,en.uf,en.cep) FROM enderecos en WHERE en.id::text=coalesce((SELECT ex.id_endereco_entrega::text FROM expedicoes ex WHERE ex.id_int=p.id_int ORDER BY ex.id LIMIT 1),p.id_endereco_ent))) ORDER BY u.pos)
        FROM unnest(r.ordem) WITH ORDINALITY u(id,pos) JOIN propostas p ON p.id=u.id JOIN vibe_entregas_registros v ON v.proposta=p.id)) item
    FROM vibe_entregas_rotas r WHERE r.ativa AND r.confirmada_em IS NOT NULL
      AND auth.uid() IS NOT NULL AND (public.ve_e_gestor() OR NOT EXISTS(SELECT 1 FROM unnest(r.pedidos) selecionado(id)
        LEFT JOIN propostas p ON p.id=selecionado.id WHERE p.id IS NULL OR NOT EXISTS(SELECT 1 FROM vibe_entregas_acessos a
        WHERE a.usuario=auth.uid() AND a.ativo AND a.empresa=p.empresa AND r.usuario=auth.uid())))
    ORDER BY r.confirmada_em DESC LIMIT 50
  ) x;
$$;
REVOKE ALL ON FUNCTION public.ve_rota_reservar(uuid,uuid[]),public.ve_rota_confirmar(uuid),public.ve_rotas_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_rota_reservar(uuid,uuid[]),public.ve_rota_confirmar(uuid),public.ve_rotas_status() TO authenticated;
REVOKE ALL ON FUNCTION public.ve_rota_resultado(uuid,uuid,uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ve_rota_resultado(uuid,uuid,uuid[],boolean) TO service_role;
COMMIT;
