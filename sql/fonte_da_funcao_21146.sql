-- ════════════════════════════════════════════════════════════════════════════════
-- CONSERTO DE DADO: a Função da Tchéquia e da Macedônia sai da Gotham Book
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw), ou por
--   .\ferramentas\rodar_sql.ps1 sql\fonte_da_funcao_21146.sql
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECEU
-- As numerações 1000547 (Tchéquia) e 1000548 (Macedônia) do pedido 21146 tinham
-- os DOIS elementos de texto em `gotham book`, e essa fonte não desenha `ř`
-- (U+0159), `ě` (U+011B) nem `č` (U+010D): oito dos dez nomes tchecos saíam com
-- um vão no lugar do caractere — "Ondřej Pek" virava "Ond ej Pek".
--
-- O elemento Nome já foi trocado para Montserrat na tela, e conferido: os dez
-- nomes voltam do PDF exatamente como estão no banco. Falta a Função.
--
-- POR QUE TROCAR A FUNÇÃO TAMBÉM, SE HOJE ELA NÃO QUEBRA
-- Ela imprime a coluna `cargo`, que neste pedido só tem texto sem acento
-- ("dancer", "musician", "musician - band leader"). Nada sairia furado hoje.
-- Mas basta um cargo acentuado — "Organização", "Ensaiadora", um cargo tcheco —
-- para o defeito voltar, e agora ele volta TRAVANDO o card no meio do pedido,
-- porque `fonteSemGlifoDoModelo` passou a segurar o PRONTO. Deixar meia
-- numeração consertada é guardar a armadilha para o dia mais atarefado.
--
-- POR QUE A MONTSERRAT
-- É a que o Nome já usa, então as duas linhas da credencial passam a ser da
-- mesma família. Medida contra a Gotham Book: `Ondřej Pek` a 20pt dá 113,08 pt
-- na Montserrat e 111,70 pt na Gotham — 1,2% de diferença. No corpo 12 da
-- Função isso é fração de milímetro, e o elemento não tem `max_width_mm`, então
-- não há quebra nem encolhimento para mudar de resultado.
--
-- SEGURO E REVERSÍVEL
-- Muda UM campo (`font_name`) de UM elemento (`el_19`, o da coluna `cargo`) em
-- duas numerações. Não toca em posição, corpo, cor, ordem dos elementos nem no
-- banco de dados. O `jsonb_agg ... ORDER BY ord` preserva a ordem do array, que
-- é a ordem de desenho — trocá-la mudaria o que fica por cima de quê.
-- Como desfazer: o bloco comentado no fim.

UPDATE producao_numeracoes n
   SET elements = (
         SELECT jsonb_agg(
                  CASE
                    WHEN e.el->>'type' = 'TEXT'
                     AND e.el->>'source' = 'database'
                     AND e.el->>'csv_column' = 'cargo'
                     AND lower(btrim(e.el->>'font_name')) = 'gotham book'
                    THEN jsonb_set(e.el, '{font_name}', '"Montserrat"'::jsonb)
                    ELSE e.el
                  END
                  ORDER BY e.ord)
           FROM jsonb_array_elements(n.elements) WITH ORDINALITY AS e(el, ord)
       ),
       updated_at = now()
 WHERE n.id::text IN ('2844b220-2f08-4b0e-ab1c-3a0bb00097e6',
                      'df583a55-dbeb-41aa-b9d2-b06a53335e76')
   AND n.elements @> '[{"type":"TEXT","csv_column":"cargo","font_name":"gotham book"}]';

-- Confira o resultado: as quatro linhas de texto das duas numerações.
SELECT n.name AS numeracao,
       e.el->>'id'         AS elemento_id,
       e.el->>'name'       AS elemento,
       e.el->>'csv_column' AS coluna,
       e.el->>'font_name'  AS fonte
  FROM producao_numeracoes n
  CROSS JOIN LATERAL jsonb_array_elements(n.elements) AS e(el)
 WHERE n.id::text IN ('2844b220-2f08-4b0e-ab1c-3a0bb00097e6',
                      'df583a55-dbeb-41aa-b9d2-b06a53335e76')
   AND e.el->>'type' = 'TEXT'
 ORDER BY n.name, e.el->>'id';

-- ── COMO DESFAZER ───────────────────────────────────────────────────────────
-- Devolve a Função para a Gotham Book. O Nome NÃO volta: ele foi trocado na
-- tela, de propósito, e é o que faz os nomes tchecos saírem inteiros.
--
-- UPDATE producao_numeracoes n
--    SET elements = (
--          SELECT jsonb_agg(
--                   CASE WHEN e.el->>'id' = 'el_19'
--                        THEN jsonb_set(e.el, '{font_name}', '"gotham book"'::jsonb)
--                        ELSE e.el END
--                   ORDER BY e.ord)
--            FROM jsonb_array_elements(n.elements) WITH ORDINALITY AS e(el, ord)
--        ),
--        updated_at = now()
--  WHERE n.id::text IN ('2844b220-2f08-4b0e-ab1c-3a0bb00097e6',
--                       'df583a55-dbeb-41aa-b9d2-b06a53335e76');
