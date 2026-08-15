-- ============================================================================
--  REPARO: o carimbo total_credenciais dos pedidos
--  Cole INTEIRO no editor SQL do Supabase e rode. Pode rodar quantas vezes quiser.
-- ============================================================================
--
--  O QUE ACONTECEU
--
--  Até a v581 o fechamento da publicação media o total trazendo as credenciais e
--  contando a lista — e o PostgREST corta toda resposta em 1.000 linhas, em
--  silêncio. O pedido 18560, de 2.000 ingressos, fechou às 12:03 UTC de 15/08/2026
--  com o carimbo `total_credenciais = 1000`, tendo as 2.000 gravadas e corretas.
--
--  O código já conta certo (pelo Content-Range). Este arquivo conserta o carimbo
--  gravado, para todos os pedidos de uma vez, a partir do que existe de verdade.
--  Ele não toca em `publicado_em`: reabrir e fechar continua sendo ato do agente.
-- ============================================================================


-- ─── 1. Antes: o carimbo e a contagem real, lado a lado ─────────────────────
SELECT
    p.pedido_id_int,
    p.total_credenciais                                          AS carimbo,
    (SELECT count(*) FROM producao_acesso_credenciais c
      WHERE c.pedido_id_int = p.pedido_id_int)                   AS real,
    p.publicado_em
FROM producao_acesso_pedidos p
ORDER BY p.pedido_id_int;


-- ─── 2. O reparo ────────────────────────────────────────────────────────────
--
-- Só toca em pedido cujo carimbo diverge da contagem real; os demais ficam
-- exatamente como estão.
UPDATE producao_acesso_pedidos AS p
   SET total_credenciais = r.real,
       updated_at        = now()
  FROM (
        SELECT pedido_id_int, count(*) AS real
          FROM producao_acesso_credenciais
         GROUP BY pedido_id_int
       ) AS r
 WHERE r.pedido_id_int = p.pedido_id_int
   AND p.total_credenciais IS DISTINCT FROM r.real;


-- ─── 3. Depois: tem de ficar tudo igual ─────────────────────────────────────
SELECT
    p.pedido_id_int,
    p.total_credenciais                                          AS carimbo,
    (SELECT count(*) FROM producao_acesso_credenciais c
      WHERE c.pedido_id_int = p.pedido_id_int)                   AS real
FROM producao_acesso_pedidos p
ORDER BY p.pedido_id_int;
