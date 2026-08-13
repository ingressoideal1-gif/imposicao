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
-- POR QUE — E O QUE ESTA MIGRAÇÃO **NÃO** CONSERTA
--
--   Ela é limpeza, não conserto. A primeira versão deste arquivo dizia que a
--   publicação em lote quebraria com o índice de duas expressões, porque o
--   `?on_conflict=codigo_hash` não casaria com ele. **Testei contra o banco em
--   13/08/2026 e isso é falso**: a gravação funciona, e três envios do mesmo
--   lote deixam uma linha só. O texto ficou aqui para ninguém refazer o
--   raciocínio achando que já está conferido.
--
--   O que sobra, e que ainda vale a pena: a chave certa da credencial é o
--   `codigo_hash` sozinho, e ter os dois índices é peso morto — o de duas
--   expressões nunca vai barrar nada que o simples já não barre.
--
--   Se você não rodar esta migração, nada quebra.
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
