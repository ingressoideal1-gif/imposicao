-- Supabase vwbtitjlpelrcnsytzqw, PostgreSQL 17+. Aplicacao manual autorizada.
-- Somente public.pedidos_links_cliente.link; numeros, tokens e demais dados preservados.
-- Inspecao inicial: 89 linhas. Nao retorna links ou tokens.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.pedidos_links_cliente IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
    expression_before text;
    expected_expression text := '(((''https://imposition.ai-ideal.com.br/cliente/''::text || numero_pedido) || ''-''::text) || (token)::text)';
    fingerprint_before text;
    fingerprint_after text;
BEGIN
    IF current_setting('server_version_num')::int < 170000 THEN
        RAISE EXCEPTION 'Requer PostgreSQL 17 ou superior';
    END IF;
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO expression_before
      FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid='public.pedidos_links_cliente'::regclass
       AND a.attname='link' AND a.attgenerated='s';
    IF expression_before IS DISTINCT FROM expected_expression THEN
        RAISE EXCEPTION 'Expressao inesperada: interrompido sem alteracoes';
    END IF;
    SELECT md5(coalesce(string_agg((to_jsonb(t)-'link')::text, '' ORDER BY id), ''))
      INTO fingerprint_before FROM public.pedidos_links_cliente t;
    ALTER TABLE public.pedidos_links_cliente ALTER COLUMN link SET EXPRESSION AS (
        'https://ideal-imposition.vercel.app/cliente/' || numero_pedido || '-' || token
    );
    SELECT md5(coalesce(string_agg((to_jsonb(t)-'link')::text, '' ORDER BY id), ''))
      INTO fingerprint_after FROM public.pedidos_links_cliente t;
    IF fingerprint_before IS DISTINCT FROM fingerprint_after THEN
        RAISE EXCEPTION 'Dados fora da coluna link foram alterados';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pedidos_links_cliente
        WHERE link IS DISTINCT FROM ('https://ideal-imposition.vercel.app/cliente/' || numero_pedido || '-' || token)) THEN
        RAISE EXCEPTION 'Validacao dos links falhou';
    END IF;
END
$migration$;
ANALYZE public.pedidos_links_cliente (link);
COMMIT;
SELECT count(*) AS total,
       count(*) FILTER (WHERE link LIKE 'https://ideal-imposition.vercel.app/cliente/%') AS dominio_destino
  FROM public.pedidos_links_cliente;
