-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — Migração 02: a chave única da credencial vira coluna simples
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-13
-- Depende de: schema_acesso.sql (já rodado)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- COMO RODAR
--
--   Supabase → SQL Editor → cole tudo → Run. Leva menos de um segundo, e a
--   tabela está vazia, então não há dado para migrar. Pode rodar duas vezes.
--
-- POR QUE
--
--   O agente publica a faixa de códigos em lotes, e a publicação precisa ser
--   REPETÍVEL: se a rede cair no meio, ele reenvia o lote inteiro sem duplicar
--   nada. Quem garante isso é o `ON CONFLICT` do Postgres, que o PostgREST
--   expõe como `?on_conflict=codigo_hash`.
--
--   Só que o Postgres exige que a lista do ON CONFLICT case EXATAMENTE com a de
--   algum índice único. O índice criado no schema_acesso.sql tem dois elementos
--   — `producao_acesso_empresa(empresa_id)` e `codigo_hash` —, então
--   `ON CONFLICT (codigo_hash)`, com um elemento só, nunca casaria. E o
--   PostgREST só aceita nome de coluna no parâmetro, não expressão: não há como
--   escrever o índice inteiro na URL.
--
--   O resultado seria a publicação falhar inteira, com um erro obscuro sobre
--   "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- POR QUE PODE SER SÓ codigo_hash
--
--   O hash não precisa do empresa_id para ser único, e isso não é sorte: o sal
--   é sorteado POR PEDIDO, e número de pedido não se repete. Duas empresas
--   diferentes nunca produziriam o mesmo hash, porque nunca partiriam do mesmo
--   sal. A coluna sozinha é a chave natural — o índice de duas colunas era
--   zelo mal aplicado da minha parte, copiado das outras tabelas onde o
--   empresa_id de fato separa (lá o pedido e o modelo PODEM se repetir entre
--   empresas).
--
--   Nas tabelas `producao_acesso_pedidos` e `producao_acesso_setores` o índice
--   por expressão continua, e continua certo.

-- ── 1. O índice novo, que o ON CONFLICT consegue usar ────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_hash_simples
    ON producao_acesso_credenciais (codigo_hash);

-- ── 2. Fora o antigo, que não servia para nada que o novo não faça ───────────
DROP INDEX IF EXISTS uq_acesso_credencial_hash;

-- ── 3. Conferência ───────────────────────────────────────────────────────────
-- Tem de devolver UMA linha: uq_acesso_credencial_hash_simples, com a definição
-- terminando em (codigo_hash) — sem chamada de função nenhuma no meio.

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'producao_acesso_credenciais'
   AND indexdef LIKE '%UNIQUE%'
 ORDER BY indexname;


-- ══════════════════════════════════════════════════════════════════════════════
-- COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
-- Volta ao estado do schema_acesso.sql. Só faz sentido se a decisão acima for
-- revertida — e aí a publicação em lote para de funcionar.
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_hash
--     ON producao_acesso_credenciais (producao_acesso_empresa(empresa_id), codigo_hash);
-- DROP INDEX IF EXISTS uq_acesso_credencial_hash_simples;
