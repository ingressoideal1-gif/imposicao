-- SOMENTE LEITURA. Conferir após a migração, antes de habilitar o frontend.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='mapas-teatro-pdfs';
SELECT relname, relrowsecurity FROM pg_class WHERE oid='public.producao_mapas_teatro_pdf_exportacoes'::regclass;
SELECT policyname, permissive, roles, cmd FROM pg_policies
WHERE (schemaname='public' AND tablename='producao_mapas_teatro_pdf_exportacoes')
   OR (schemaname='storage' AND tablename='objects' AND policyname='mapas_pdf_apenas_backend');
SELECT has_table_privilege('anon','public.producao_mapas_teatro_pdf_exportacoes','SELECT') AS anon_le,
       has_table_privilege('authenticated','public.producao_mapas_teatro_pdf_exportacoes','INSERT') AS usuario_grava,
       has_function_privilege('authenticated','public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)','EXECUTE') AS usuario_finaliza;
SELECT mapa_id,revisao_exportacao,gerador_versao,jsonb_array_length(arquivos) AS documentos,criado_em
FROM public.producao_mapas_teatro_pdf_exportacoes ORDER BY criado_em DESC LIMIT 20;
SELECT jsonb_build_object(
  'bucket', (SELECT jsonb_build_object('id',id,'public',public,'limite',file_size_limit,'tipos',allowed_mime_types)
    FROM storage.buckets WHERE id='mapas-teatro-pdfs'),
  'rls', (SELECT relrowsecurity FROM pg_class WHERE oid='public.producao_mapas_teatro_pdf_exportacoes'::regclass),
  'anon_le', has_table_privilege('anon','public.producao_mapas_teatro_pdf_exportacoes','SELECT'),
  'usuario_grava', has_table_privilege('authenticated','public.producao_mapas_teatro_pdf_exportacoes','INSERT'),
  'usuario_finaliza', has_function_privilege('authenticated','public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)','EXECUTE'),
  'backend_finaliza', has_function_privilege('service_role','public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)','EXECUTE'),
  'rpc_security_definer', (SELECT prosecdef FROM pg_proc WHERE oid='public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)'::regprocedure),
  'politicas', (SELECT jsonb_agg(jsonb_build_object('nome',policyname,'modo',permissive,'papeis',roles,'acao',cmd)) FROM pg_policies
    WHERE (schemaname='public' AND tablename='producao_mapas_teatro_pdf_exportacoes')
      OR (schemaname='storage' AND tablename='objects' AND policyname='mapas_pdf_apenas_backend')),
  'mapas', (SELECT count(*) FROM public.producao_mapas_teatro),
  'exportacoes', (SELECT count(*) FROM public.producao_mapas_teatro_pdf_exportacoes),
  'arquivos', (SELECT count(*) FROM storage.objects WHERE bucket_id='mapas-teatro-pdfs')
) AS verificacao;
