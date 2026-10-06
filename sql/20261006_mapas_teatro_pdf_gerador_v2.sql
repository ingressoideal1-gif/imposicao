-- Preparado; NAO aplicado pelo agente. Revisar o ambiente antes de executar.
-- Projeto esperado: vwbtitjlpelrcnsytzqw. Nao altera mapas, assentos ou PDFs antigos.
-- Salvar os resultados desta previa como recuperacao da definicao vigente.
SELECT pg_get_functiondef(to_regprocedure(
  'public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)')) AS rpc_antes;
SELECT conname, pg_get_constraintdef(oid) AS definicao_antes
FROM pg_constraint
WHERE conrelid = 'public.producao_mapas_teatro_pdf_exportacoes'::regclass;
SELECT gerador_versao, count(*) AS exportacoes
FROM public.producao_mapas_teatro_pdf_exportacoes GROUP BY gerador_versao;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $migration$
DECLARE
  rpc regprocedure := to_regprocedure(
    'public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)');
  definicao text;
  restricao text;
  guarda_antiga text := 'p_gerador IS DISTINCT FROM ''a3-v1-20261003''';
  guarda_nova text := '(p_gerador IS NULL OR p_gerador NOT IN (''a3-v1-20261003'', ''a3-v2-20261006''))';
BEGIN
  IF rpc IS NULL THEN RAISE EXCEPTION 'RPC ausente: conferir a entrega anterior.'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = rpc) THEN
    RAISE EXCEPTION 'RPC deve permanecer SECURITY INVOKER: revisar antes de continuar.';
  END IF;
  definicao := pg_get_functiondef(rpc);
  IF strpos(definicao, guarda_antiga) = 0 THEN
    RAISE EXCEPTION 'Guarda do gerador mudou ou migracao ja aplicada: revisar a definicao vigente.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO restricao FROM pg_constraint
  WHERE conrelid = 'public.producao_mapas_teatro_pdf_exportacoes'::regclass
    AND conname = 'producao_mapas_teatro_pdf_exportacoes_gerador_versao_check'
    AND contype = 'c';
  IF regexp_replace(restricao, '\s', '', 'g') IS DISTINCT FROM
      'CHECK((gerador_versao=''a3-v1-20261003''::text))' THEN
    RAISE EXCEPTION 'CHECK do gerador inesperado ou migracao ja aplicada: revisar antes de continuar.';
  END IF;
  ALTER TABLE public.producao_mapas_teatro_pdf_exportacoes
    DROP CONSTRAINT producao_mapas_teatro_pdf_exportacoes_gerador_versao_check;
  ALTER TABLE public.producao_mapas_teatro_pdf_exportacoes
    ADD CONSTRAINT producao_mapas_teatro_pdf_exportacoes_gerador_versao_check
    CHECK (gerador_versao IN ('a3-v1-20261003', 'a3-v2-20261006'));
  -- Altera apenas a guarda da versao na funcao VIGENTE. Preserva correcoes
  -- anteriores (inclusive aliases), autorizacao, SECURITY INVOKER e grants.
  EXECUTE replace(definicao, guarda_antiga, guarda_nova);
END $migration$;
COMMIT;

SELECT conname, pg_get_constraintdef(oid) AS definicao_depois
FROM pg_constraint
WHERE conrelid = 'public.producao_mapas_teatro_pdf_exportacoes'::regclass
  AND conname = 'producao_mapas_teatro_pdf_exportacoes_gerador_versao_check';
SELECT pg_get_functiondef(to_regprocedure(
  'public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)')) AS rpc_depois;
SELECT gerador_versao, count(*) AS exportacoes
FROM public.producao_mapas_teatro_pdf_exportacoes GROUP BY gerador_versao;
-- Recuperacao: antes do COMMIT, ROLLBACK desfaz o DDL. Depois da entrega,
-- reverter frontend/Edge para o gerador anterior, mantendo suporte de leitura
-- a ambas as versoes. Nao excluir registros v2 nem restaurar o CHECK v1
-- enquanto houver exportacoes v2. Recuperar a RPC exige revisar o backup
-- vigente; nao reutilizar a funcao original de 03/10 sobre correcoes posteriores.
