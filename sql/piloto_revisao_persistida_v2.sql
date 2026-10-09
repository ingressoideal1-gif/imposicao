-- NOVA migracao. Revisar/aplicar separadamente em producao, nunca como teste.
-- Nao altera valores comerciais. A RPC v1 permanece disponivel para rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.piloto_revisoes_pedidos (
  pedido integer PRIMARY KEY CHECK (pedido > 0),
  epoca uuid NOT NULL DEFAULT gen_random_uuid(),
  revisao bigint NOT NULL DEFAULT 1 CHECK (revisao > 0),
  alterado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.piloto_revisoes_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piloto_revisoes_pedidos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.piloto_revisoes_pedidos TO service_role;

-- Dependencias compartilhadas usam um contador global conservador. Isso
-- impede perder uma alteracao concorrente com a vinculacao de um modelo.
CREATE TABLE public.piloto_revisao_catalogo (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revisao bigint NOT NULL DEFAULT 1,
  epoca uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO public.piloto_revisao_catalogo DEFAULT VALUES;
ALTER TABLE public.piloto_revisao_catalogo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piloto_revisao_catalogo FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.piloto_revisao_catalogo TO service_role;

CREATE FUNCTION public.piloto_marcar_pedidos_v2(ids integer[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
  -- Ordem estavel evita inversao de locks numa alteracao compartilhada.
  FOR n IN SELECT DISTINCT i FROM unnest(ids) i WHERE i > 0 ORDER BY i LOOP
    INSERT INTO public.piloto_revisoes_pedidos(pedido) VALUES(n)
    ON CONFLICT(pedido) DO UPDATE SET revisao=piloto_revisoes_pedidos.revisao+1,
      alterado_em=clock_timestamp();
  END LOOP;
END $$;

CREATE FUNCTION public.piloto_invalidar_pedido_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; b jsonb; ids integer[];
BEGIN
  a := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  b := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  IF a=b THEN RETURN NULL; END IF;
  IF TG_TABLE_SCHEMA='storage' OR TG_TABLE_NAME IN ('producao_numeracoes','produtos','producao_mapas_teatro') THEN
    IF TG_TABLE_SCHEMA='storage' AND TG_OP='UPDATE'
      AND (a-'last_accessed_at')=(b-'last_accessed_at') THEN RETURN NULL; END IF;
    UPDATE public.piloto_revisao_catalogo SET revisao=revisao+1 WHERE id;
    RETURN NULL;
  ELSIF TG_TABLE_NAME='pedidos_modelos_banco' THEN
    SELECT array_agg(DISTINCT id_int ORDER BY id_int) INTO ids FROM public.pedidos_modelos
      WHERE id::text IN (a->>'modelo_id',b->>'modelo_id');
  ELSE
    SELECT array_agg(DISTINCT v::integer ORDER BY v::integer) INTO ids
      FROM (VALUES(a->>'id_int'),(b->>'id_int')) t(v) WHERE v ~ '^[1-9][0-9]{0,9}$';
  END IF;
  PERFORM public.piloto_marcar_pedidos_v2(ids);
  RETURN NULL;
END $$;

-- Lock de migracao: instalacao dos triggers e carga inicial sao atomicas.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos_modelos','produtos_proposta','propostas','propostas_os',
    'pedidos_bancos','pedidos_modelos_banco','pedidos_artes','producao_numeracoes',
    'produtos','producao_mapas_teatro'] LOOP
    EXECUTE format('CREATE TRIGGER piloto_revisao_v2 AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.piloto_invalidar_pedido_v2()',t);
  END LOOP;
END $$;
CREATE TRIGGER piloto_revisao_v2 AFTER INSERT OR UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.piloto_invalidar_pedido_v2();
INSERT INTO public.piloto_revisoes_pedidos(pedido)
  SELECT DISTINCT id_int FROM public.pedidos_modelos WHERE id_int > 0
  ON CONFLICT DO NOTHING;

CREATE FUNCTION public.piloto_snapshot_pedido_v2(p_pedido text,p_empresa_id text,p_host text,p_revisao text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
SET statement_timeout='20s' AS $$
DECLARE n integer; contador bigint; ep uuid; compartilhada bigint; cep uuid; rev text; r jsonb; doc jsonb;
BEGIN
  IF p_pedido !~ '^[1-9][0-9]{0,9}$' OR p_pedido::bigint>2147483647
    OR p_host !~ '^[a-z0-9-]+\.supabase\.co$' OR p_empresa_id IS NULL
    OR p_revisao IS NULL OR (p_revisao<>'' AND p_revisao !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'pedido/revisao invalido';
  END IF;
  n:=p_pedido::integer;
  SELECT revisao,epoca INTO compartilhada,cep FROM public.piloto_revisao_catalogo WHERE id;
  IF compartilhada IS NULL THEN RAISE EXCEPTION 'catalogo sem sinal'; END IF;
  SELECT revisao,epoca INTO contador,ep FROM public.piloto_revisoes_pedidos WHERE pedido=n;
  IF contador IS NULL THEN RAISE EXCEPTION 'pedido sem sinal de revisao'; END IF;
  -- Empresa e protocolo fazem parte da chave; recibos nao atravessam escopos.
  rev:=encode(sha256(convert_to(jsonb_build_array('piloto-v2',p_empresa_id,p_host,n,ep,contador,cep,compartilhada)::text,'UTF8')),'hex');
  IF rev=p_revisao THEN
    RETURN jsonb_build_object('protocolo',2,'pedido',p_pedido,'revisao',rev,'sem_mudanca',true);
  END IF;
  -- Mesma snapshot MVCC da leitura do contador; alteracao concorrente sera
  -- detectada na segunda conferencia, antes de ativar o cache local.
  r:=public.piloto_snapshot_pedido(p_pedido,p_empresa_id,p_host,'');
  doc:=r->'snapshot';
  doc:=doc || jsonb_build_object(
    'artes',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.pedidos_artes a WHERE a.id_int=n),'[]'::jsonb),
    'mapas',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.producao_mapas_teatro m
      WHERE m.id::text IN (SELECT x->>'mapa_teatro_id' FROM jsonb_array_elements(doc->'modelos') x)),'[]'::jsonb));
  RETURN jsonb_build_object('protocolo',2,'pedido',p_pedido,'revisao',rev,'sem_mudanca',false,'snapshot',doc);
END $$;
REVOKE ALL ON FUNCTION public.piloto_marcar_pedidos_v2(integer[]),
  public.piloto_invalidar_pedido_v2(),public.piloto_snapshot_pedido_v2(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.piloto_snapshot_pedido_v2(text,text,text,text) TO service_role;
COMMIT;
