-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — Um mesmo código pode existir em modelos diferentes
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-15
-- Continua: sql/schema_acesso.sql
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Troca a chave única de producao_acesso_credenciais. Ela dizia "cada código
--   só existe uma vez"; passa a dizer "cada código só existe uma vez POR
--   MODELO".
--
--   Não apaga linha nenhuma. Não altera valor de nenhuma coluna existente.
--   Acrescenta UMA coluna calculada pelo próprio banco. Pode ser rodado mais de
--   uma vez sem estragar nada.
--
--   Como desfazer está no fim do arquivo.
--
-- COMO RODAR
--
--   Supabase → SQL Editor → cole TUDO → Run. Leva segundos.
--
-- POR QUE ELE EXISTE — o defeito, com nome e data
--
--   O pedido 20508 tinha sete modelos. Três deles usavam a MESMA numeração
--   ("Triband"), então o item 1 dos três saía impresso com o mesmo texto:
--
--       1000280 IMPRENSA  →  000001
--       1000281 PISTA     →  000001
--       1000284 CAMAROTE  →  000001
--
--   Texto igual, sal igual (o sal é por pedido), hash igual. A chave única
--   `uq_acesso_credencial_hash_simples`, que existia sobre `codigo_hash`
--   sozinho, aceitou o primeiro e DESCARTOU os outros dois em silêncio.
--
--   Resultado: 31 ingressos impressos, entregues, e sem nenhuma linha na nuvem.
--   Na portaria seriam recusados, e não haveria como descobrir antes.
--
--   O papel NÃO muda para consertar isso — decisão do usuário em 15/08/2026, e
--   ela está certa: o texto impresso é o que o cliente contratou. Quem muda é o
--   banco.
--
-- E NA LEITURA, COMO A PORTARIA SABE QUAL É QUAL?
--
--   Pelo setor do aparelho, que é a decisão já registrada em
--   docs/controle_acesso.md. Lendo `000001` num aparelho da PISTA, ele acha a
--   linha da PISTA. Num aparelho que valide PISTA e IMPRENSA juntos, ele mostra
--   os dois e o porteiro toca em um — um toque, e fica registrado.
--
--   O que faltava não era a leitura: era a GRAVAÇÃO, que jogava fora o segundo
--   modelo antes de o aparelho ter chance de resolver.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. A COLUNA QUE VIRA A CHAVE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- POR QUE UMA COLUNA CALCULADA, E NÃO UM ÍNDICE DE VÁRIAS COLUNAS
--
--   Duas razões, e as duas são práticas:
--
--   1. `pedido_id_int`, `modelo_id` e `numero` são NULOS nos códigos que o
--      CLIENTE importa (staff, cortesia) — eles não pertencem a tiragem
--      nenhuma. Em Postgres, NULO é DISTINTO de NULO dentro de índice único:
--      uma chave composta simplesmente PARARIA de proteger esses códigos, e
--      colar a mesma lista duas vezes passaria a gravar tudo de novo. É a mesma
--      armadilha que o `producao_acesso_empresa()` resolve no schema principal.
--
--   2. O PostgREST recebe o `?on_conflict=` como lista de COLUNAS e não sabe
--      inferir índice parcial nem índice de expressão. Uma coluna só, real e
--      nunca nula, é o que o `ON CONFLICT` consegue enxergar.
--
-- GENERATED ALWAYS: quem calcula é o banco, em toda inserção e toda alteração.
-- Não há como o backend esquecer de preencher, nem como preencher errado.
ALTER TABLE producao_acesso_credenciais
    ADD COLUMN IF NOT EXISTS chave_dedup TEXT
    GENERATED ALWAYS AS (
        COALESCE(pedido_id_int, 0) || '/' ||
        COALESCE(modelo_id, 0)     || '/' ||
        COALESCE(numero, 0)        || '/' ||
        codigo_hash
    ) STORED;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. A CHAVE NOVA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Criada ANTES de apagar a antiga: entre uma coisa e outra a tabela fica com
-- duas travas, o que é seguro. Na ordem inversa haveria um instante sem
-- nenhuma, e uma publicação em andamento gravaria duplicata de verdade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_por_modelo
    ON producao_acesso_credenciais (chave_dedup);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. A CHAVE ANTIGA SAI
-- ══════════════════════════════════════════════════════════════════════════════
--
-- É ela que descarta o segundo modelo. Enquanto existir, PISTA e CAMAROTE
-- continuam sem entrar por mais que se reimprima.
--
-- O que ela protegia continua protegido pela chave nova: reenviar o MESMO lote
-- (mesmo pedido, mesmo modelo, mesmo número, mesmo código) continua não
-- duplicando nada. Foi só a definição de "mesmo" que ficou correta.
DROP INDEX IF EXISTS uq_acesso_credencial_hash_simples;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CONFERÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════
-- Roda junto e fecha o script mostrando o resultado. Descomentada de propósito:
-- um script que termina em "Success. No rows returned" não deixa saber se deu
-- certo.
--
-- Esperado na PRIMEIRA: uma linha só, `uq_acesso_credencial_por_modelo`. Se
-- `uq_acesso_credencial_hash_simples` ainda aparecer, o DROP não pegou.

SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'producao_acesso_credenciais'
   AND indexname LIKE 'uq_acesso_credencial%'
 ORDER BY indexname;

-- Esperado na SEGUNDA: o total que já existe, intacto. Nada foi apagado.
SELECT count(*) AS credenciais_preservadas
  FROM producao_acesso_credenciais;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
-- ATENÇÃO: voltar a chave antiga só funciona se NÃO houver, neste momento, dois
-- modelos com o mesmo `codigo_hash` — que é exatamente o que este arquivo passou
-- a permitir. Confira antes:
--
--     SELECT codigo_hash, count(*) FROM producao_acesso_credenciais
--      GROUP BY codigo_hash HAVING count(*) > 1;
--
-- Se essa consulta devolver linhas, recriar o índice antigo FALHA — e isso é
-- bom: ele falharia justamente por causa dos ingressos que ele descartaria.
--
-- Fica comentado de propósito.
--
-- CREATE UNIQUE INDEX uq_acesso_credencial_hash_simples
--     ON producao_acesso_credenciais (codigo_hash);
-- DROP INDEX IF EXISTS uq_acesso_credencial_por_modelo;
-- ALTER TABLE producao_acesso_credenciais DROP COLUMN IF EXISTS chave_dedup;
