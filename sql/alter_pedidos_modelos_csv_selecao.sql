-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: fatia do banco de dados (CSV) que cada modelo do pedido imprime
-- Execute no SQL Editor do Supabase
-- Rodado em producao em 11/08/2026.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Um mesmo CSV costuma servir a varios modelos do mesmo pedido: o mapa do teatro
-- vira um modelo por setor. O banco continua UMA vez na numeracao
-- (producao_numeracoes.csv_data); o que muda por modelo e a fatia.
--
-- FORMATO
--   { "tipo": "linhas", "ids": ["1-400", "612", "700-712"] }
-- Os numeros sao o __id de cada linha do CSV, uma identidade estavel gravada
-- dentro da propria linha. Faixas compactas porque marcar a mao quase sempre
-- produz blocos continuos. O campo `tipo` deixa a porta aberta para uma regra por
-- coluna no futuro sem precisar de outra migracao.
--
-- NULO = O BANCO INTEIRO
-- Modelo sem csv_selecao imprime todas as linhas, que e o comportamento de todo
-- pedido anterior a esta versao. Por isso a migracao e aditiva e nao exige
-- converter nenhum dado existente.
--
-- ATENCAO: a tabela e `pedidos_modelos`, NAO `producao_os_itens`. Os arquivos de
-- schema em sql/ descrevem producao_os_itens, mas o aplicativo deixou essa tabela
-- para tras — quem le e escreve os modelos de um pedido e o loadOSItens, sobre
-- pedidos_modelos. Ver frontend/script.js:14719.

ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS csv_selecao JSONB;
