-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: o limiar da sobra passa a ser POR PRODUTO
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- O limiar nasceu unico, em `producao_config.limiar_sobra`. Mas o desperdicio nao
-- custa o mesmo em toda parte: meia folha de PVC de credencial e um prejuizo que
-- meia folha de papel de pulseira nao e. O usuario pediu, em 18/08/2026, que o
-- percentual fosse independente para cada produto.
--
-- NULO = USA O PADRAO
-- Produto sem valor proprio segue o `limiar_sobra` de `producao_config`, que
-- continua existindo como padrao geral da grafica. Assim se define um numero uma
-- vez e so as excecoes precisam de atencao.
--
-- A COLUNA VIVE NA TABELA DA PERMISSAO de proposito: as duas coisas sao
-- configuracao do mesmo produto na mesma tela, e separa-las obrigaria a ler duas
-- tabelas para desenhar uma linha da lista. Uma linha aqui pode existir so pelo
-- limiar, com `liberado = false` — e por isso quem grava o limiar preserva o
-- `liberado` que ja estava, e vice-versa.

ALTER TABLE producao_produtos_combinaveis
ADD COLUMN IF NOT EXISTS limiar_sobra NUMERIC;

COMMENT ON COLUMN producao_produtos_combinaveis.limiar_sobra IS
    'Fracao de uma folha (0 a 1) a partir da qual a sobra deste produto vira aviso. NULL = usar o padrao geral em producao_config.limiar_sobra.';
