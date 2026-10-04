-- Somente leitura no projeto vwbtitjlpelrcnsytzqw.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT strpos(p.prosrc, 'GROUP BY t.s->>''id''') > 0 AS alias_corrigido,
  NOT p.prosecdef AS permanece_invoker,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend_pode_executar,
  NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS usuario_nao_executa_direto,
  (SELECT count(*) FROM public.producao_mapas_teatro_pdf_exportacoes
   WHERE mapa_id IN ('aaa35d4c-3299-4caa-b672-ee06909ec5d6'::uuid,'a1184de9-1dd8-4d1a-a668-bfe124000e6a'::uuid)) AS exportacoes_dos_dois_mapas
FROM pg_proc p WHERE p.oid='public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)'::regprocedure;
COMMIT;
