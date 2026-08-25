-- ════════════════════════════════════════════════════════════════════════════════
-- CONSERTO DE DADO: tirar a distribuicao VAZIA dos modelos do pedido 21146
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECEU
-- Os tres modelos do 21146 (Tchequia, Macedonia, Organizacao) estao com
-- `csv_selecao = {"ids": [], "tipo": "linhas"}` — uma distribuicao vazia.
--
-- Em `pedidos_modelos.csv_selecao`, NULO e LISTA VAZIA sao coisas diferentes:
--   NULO        -> nunca distribuido, o modelo leva o banco INTEIRO
--   LISTA VAZIA -> houve distribuicao e este modelo nao ficou com NENHUMA linha
--
-- A lista vazia foi gravada quando o 🧩 Distribuir foi aplicado enquanto aquelas
-- numeracoes ainda estavam sem banco: o modelo que nao recebe linha nenhuma sai
-- com `ids: []`. Depois que o banco de 13 linhas entrou, os tres continuaram
-- valendo zero — o card mostra "0 de 13" em vermelho e nada e desenhado.
--
-- POR QUE NULO E A RESPOSTA CERTA AQUI
-- Cada um dos tres modelos aponta para a PROPRIA numeracao (1000547, 1000548 e
-- 1000549), cada uma com o seu banco. Nao ha nada a repartir entre eles: cada
-- modelo deve levar o banco inteiro da numeracao dele, que e exatamente o que
-- `csv_selecao` nulo significa.
--
-- SEGURO E REVERSIVEL
-- Nao apaga linha nem banco: so devolve o campo ao estado "nunca distribuido".
-- Para repartir de novo, o 🧩 Linhas no card do modelo grava outra vez.

UPDATE pedidos_modelos
   SET csv_selecao = NULL
 WHERE id_int = 21146
   AND csv_selecao IS NOT NULL
   AND jsonb_typeof(csv_selecao->'ids') = 'array'
   AND jsonb_array_length(csv_selecao->'ids') = 0;

-- Confira o resultado:
SELECT nome_modelo, quantidade, csv_selecao
  FROM pedidos_modelos
 WHERE id_int = 21146
 ORDER BY ordem;
