-- Piloto: leitura consistente do pedido e das versoes do Storage.
-- Nao instala triggers, nao altera tabelas nem dados comerciais/Storage.
-- A Edge autentica a estacao e verifica permissoes antes de chamar esta RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.piloto_decodificar_url(p_texto text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE saida bytea := ''::bytea; i integer := 1; c text;
BEGIN
  WHILE i <= length(p_texto) LOOP
    c := substr(p_texto,i,1);
    IF c = '%' THEN
      IF substr(p_texto,i+1,2) !~ '^[0-9A-Fa-f]{2}$' THEN RETURN NULL; END IF;
      saida := saida || decode(substr(p_texto,i+1,2),'hex'); i := i+3;
    ELSE
      saida := saida || convert_to(c,'UTF8'); i := i+1;
    END IF;
  END LOOP;
  RETURN convert_from(saida,'UTF8');
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN RETURN NULL;
END $$;

CREATE FUNCTION public.piloto_snapshot_pedido(p_pedido text, p_empresa_id text, p_host text, p_revisao text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
SET statement_timeout = '20s' AS $$
DECLARE doc jsonb; rev text; linhas jsonb; urls jsonb; pedido_num integer;
BEGIN
  IF p_pedido !~ '^[1-9][0-9]{0,9}$' OR p_pedido::bigint > 2147483647
     OR p_host !~ '^[a-z0-9-]+\.supabase\.co$'
     OR (p_revisao <> '' AND p_revisao !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'pedido/revisao invalido';
  END IF;
  pedido_num := p_pedido::integer;
  -- Um snapshot de banco, incluindo bancos compartilhados e produto efetivo.
  WITH modelos AS MATERIALIZED (
    SELECT to_jsonb(m) AS j FROM public.pedidos_modelos m WHERE m.id_int=pedido_num ORDER BY m.id
  ), origens AS MATERIALIZED (
    SELECT to_jsonb(p) AS j FROM public.produtos_proposta p
    WHERE p.id_int=pedido_num AND p.id IN (SELECT (j->>'id_produto_proposta_origem')::bigint FROM modelos
      WHERE j->>'id_produto_proposta_origem' ~ '^[1-9][0-9]{0,18}$') ORDER BY p.id
  ), numeros AS MATERIALIZED (
    SELECT to_jsonb(n) AS j FROM public.producao_numeracoes n
    WHERE n.id::text IN (SELECT coalesce(nullif(j->>'amostra_num_id',''),j->>'numeracao_id') FROM modelos) ORDER BY n.id
  ), produtos AS MATERIALIZED (
    SELECT to_jsonb(p) AS j FROM public.produtos p WHERE p.id_produto::text IN (
      SELECT j->>'id_produto' FROM modelos UNION SELECT j->>'id_produto' FROM origens) ORDER BY p.id_produto
  )
  SELECT jsonb_build_object(
    'modelos',coalesce((SELECT jsonb_agg(j ORDER BY j->>'id') FROM modelos),'[]'::jsonb),
    'numeracoes',coalesce((SELECT jsonb_agg(j ORDER BY j->>'id') FROM numeros),'[]'::jsonb),
    'origens',coalesce((SELECT jsonb_agg(j ORDER BY j->>'id') FROM origens),'[]'::jsonb),
    'produtos',coalesce((SELECT jsonb_agg(j ORDER BY j->>'id_produto') FROM produtos),'[]'::jsonb),
    'bancos',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.pedidos_bancos b WHERE b.id_int=pedido_num),'[]'::jsonb),
    'vinculos',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.modelo_id) FROM public.pedidos_modelos_banco v
      WHERE v.modelo_id IN (SELECT j->>'id' FROM modelos)),'[]'::jsonb),
    'pedidos',coalesce((SELECT jsonb_agg(jsonb_build_object('id_int',p.id_int,'status_interno',p.status_interno,
      'revisao',encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex'))) FROM public.propostas p WHERE p.id_int=pedido_num),'[]'::jsonb),
    'prazos',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.data_termino,p.id) FROM public.propostas_os p WHERE p.id_int=pedido_num),'[]'::jsonb)
  ) INTO doc;
  IF jsonb_array_length(doc->'modelos') > 128 THEN RAISE EXCEPTION 'limite de modelos'; END IF;
  -- Mesmos guardas de empresa da Edge; tabelas legadas sem empresa permanecem legadas.
  FOR linhas IN SELECT value FROM jsonb_array_elements(doc->'modelos')
    UNION ALL SELECT value FROM jsonb_array_elements(doc->'numeracoes')
    UNION ALL SELECT value FROM jsonb_array_elements(doc->'origens')
    UNION ALL SELECT value FROM jsonb_array_elements(doc->'produtos')
    UNION ALL SELECT value FROM jsonb_array_elements(doc->'bancos')
    UNION ALL SELECT value FROM jsonb_array_elements(doc->'vinculos') LOOP
    IF coalesce(linhas->>'empresa_id',linhas->>'id_empresa') IS NOT NULL
      AND coalesce(linhas->>'empresa_id',linhas->>'id_empresa') IS DISTINCT FROM p_empresa_id THEN
      RAISE EXCEPTION 'empresa divergente';
    END IF;
  END LOOP;
  -- URLs de arte e referencias dos bancos. Caminhos desconhecidos nao ganham
  -- dispensa de revalidacao HTTP. last_accessed_at nao altera o conteudo.
  WITH fontes AS (
    SELECT DISTINCT v #>> '{}' AS url FROM jsonb_path_query(
      jsonb_build_array(doc->'modelos',doc->'numeracoes'), '$.** ? (@.type() == "string")') v
    WHERE v #>> '{}' LIKE 'https://%'
  ), caminhos AS (
    SELECT url,CASE WHEN url LIKE 'https://' || p_host || '/storage/v1/object/%' THEN
      public.piloto_decodificar_url(substring(split_part(url,'?',1) FROM
        '^https://[^/]+/storage/v1/object/(?:public|authenticated|sign)/(.+)$')) END AS caminho FROM fontes
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('url',c.url,
    'objeto',CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'bucket',o.bucket_id,
      'name',o.name,'version',o.version,'updated_at',o.updated_at,'created_at',o.created_at,
      'metadata',o.metadata,'user_metadata',o.user_metadata) END) ORDER BY c.url),'[]'::jsonb)
  INTO urls FROM caminhos c LEFT JOIN storage.objects o ON o.bucket_id=split_part(c.caminho,'/',1)
    AND o.name=substring(c.caminho FROM position('/' IN c.caminho)+1)
    AND o.archived_at IS NULL AND coalesce(o.is_delete_marker,false)=false;
  doc := doc || jsonb_build_object('recursos',urls);
  rev := encode(sha256(convert_to(doc::text,'UTF8')),'hex');
  RETURN jsonb_build_object('pedido',p_pedido,'revisao',rev,'sem_mudanca',rev=p_revisao)
    || CASE WHEN rev=p_revisao THEN '{}'::jsonb ELSE jsonb_build_object('snapshot',doc) END;
END $$;

REVOKE ALL ON FUNCTION public.piloto_decodificar_url(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.piloto_snapshot_pedido(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.piloto_decodificar_url(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.piloto_snapshot_pedido(text,text,text,text) TO service_role;
COMMENT ON FUNCTION public.piloto_snapshot_pedido(text,text,text,text) IS
  'Piloto: snapshot somente leitura; acesso exclusivo service_role pela Edge autenticada.';
NOTIFY pgrst,'reload schema';
COMMIT;
-- Recuperacao: desativar o fluxo novo/voltar o pacote do Piloto. Estas funcoes
-- podem permanecer sem consumidores; nao exigem restaurar dados comerciais.
