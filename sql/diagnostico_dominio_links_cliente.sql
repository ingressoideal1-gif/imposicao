-- Diagnostico somente leitura. Preparado localmente; nao aplicado.
-- Alvo esperado: Supabase vwbtitjlpelrcnsytzqw, public.pedidos_links_cliente.
-- Confirmar ambiente antes de executar. Nao retorna tokens nem URLs completas.
-- A expressao da coluna gerada precisa ser conhecida antes de preparar a
-- alteracao; nao reaplicar link_pronto_para_o_erp.sql como migracao de dominio.

BEGIN TRANSACTION READ ONLY;

SELECT current_setting('server_version_num') AS versao_postgresql;

SELECT a.attname AS coluna,
       a.attgenerated AS tipo_geracao,
       pg_get_expr(d.adbin, d.adrelid) AS expressao
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = to_regclass('public.pedidos_links_cliente')
   AND a.attname = 'link'
   AND NOT a.attisdropped;

-- Agregados somente: quantifica o impacto sem revelar credenciais de clientes.
SELECT count(*) AS total,
       count(*) FILTER (WHERE ativo IS TRUE) AS ativos,
       count(*) FILTER (
           WHERE link LIKE 'https://ideal-imposition.vercel.app/cliente/%'
       ) AS dominio_vercel,
       count(*) FILTER (
           WHERE link LIKE 'https://imposition.ai-ideal.com.br/cliente/%'
       ) AS dominio_cloudflare,
       count(*) FILTER (WHERE link IS NULL) AS sem_link
  FROM public.pedidos_links_cliente;

ROLLBACK;
