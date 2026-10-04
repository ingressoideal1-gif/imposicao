-- Projeto autorizado: vwbtitjlpelrcnsytzqw. Corrige somente a função de finalização.
-- Zero mapas/modelos/arquivos alterados; mantém grants, bloqueio da linha e validações.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $correcao$
DECLARE
  alvo regprocedure := to_regprocedure('public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid)');
  definicao text;
  anterior text := 'GROUP BY s->>''id'' HAVING nullif(btrim(s->>''id''), '''') IS NULL OR count(*) > 1';
  corrigido text := 'GROUP BY t.s->>''id'' HAVING nullif(btrim(t.s->>''id''), '''') IS NULL OR count(*) > 1';
BEGIN
  IF alvo IS NULL THEN RAISE EXCEPTION 'Função de publicação ausente; conferir implantação.'; END IF;
  definicao := pg_get_functiondef(alvo);
  IF strpos(definicao, anterior) = 0 THEN
    IF strpos(definicao, corrigido) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'Definição inesperada; nenhuma alteração aplicada.';
  END IF;
  IF length(definicao) - length(replace(definicao, anterior, '')) <> length(anterior) THEN
    RAISE EXCEPTION 'Mais de uma referência encontrada; nenhuma alteração aplicada.';
  END IF;
  -- s é também uma variável PL/pgSQL. A coluna da consulta deve ser t.s.
  EXECUTE replace(definicao, anterior, corrigido);
END $correcao$;
COMMIT;
