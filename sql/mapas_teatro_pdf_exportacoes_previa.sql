-- SOMENTE LEITURA. Projeto esperado: vwbtitjlpelrcnsytzqw.
-- Não retorna configurações, arquivos, chaves ou informações pessoais.
-- Resultado consolidado para a CLI/Management API, que retorna a última consulta.
SELECT jsonb_build_object(
  'banco', current_database(), 'versao', current_setting('server_version'),
  'colunas_mapa', (SELECT jsonb_agg(jsonb_build_object('campo',column_name,'tipo',data_type))
    FROM information_schema.columns WHERE table_schema='public' AND table_name='producao_mapas_teatro'),
  'colunas_permissoes', (SELECT jsonb_agg(jsonb_build_object('campo',column_name,'tipo',data_type))
    FROM information_schema.columns WHERE table_schema='public' AND table_name='imposition_user_permissions'
      AND column_name IN ('user_id','role')),
  'mapas', (SELECT count(*) FROM public.producao_mapas_teatro),
  'tabela_preexistente', to_regclass('public.producao_mapas_teatro_pdf_exportacoes'),
  'rpc_preexistente', to_regprocedure('public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)'),
  'bucket', (SELECT jsonb_build_object('public',public,'limite',file_size_limit) FROM storage.buckets WHERE id='mapas-teatro-pdfs'),
  'politicas_storage', (SELECT jsonb_agg(jsonb_build_object('nome',policyname,'modo',permissive,'papeis',roles,'acao',cmd))
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
  'mapas_com_ids_invalidos', (SELECT count(*) FROM (
    SELECT m.id FROM public.producao_mapas_teatro m
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.config->'setores')='array'
      THEN m.config->'setores' ELSE '[]'::jsonb END) s(setor)
    GROUP BY m.id HAVING count(*) FILTER (WHERE nullif(btrim(s.setor->>'id'),'') IS NULL)>0
      OR count(*) <> count(DISTINCT s.setor->>'id')
  ) invalidos)
) AS previa;
