-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — bloquear um SETOR inteiro
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-16
-- Spec: docs/superpowers/specs/2026-08-16-ideal-control-fluxo-pwa-design.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Acrescenta DUAS colunas a uma tabela que ja existe. Nao cria tabela, nao
--   apaga nada, nao mexe em linha nenhuma. Pode ser rodado mais de uma vez.
--
--   Supabase -> SQL Editor -> cole tudo -> Run. Leva menos de um segundo.
--
-- POR QUE ELE EXISTE
--
--   Ja dava para bloquear uma FAIXA DE NUMEROS dentro do setor (o lote que o
--   PDV nao pagou, por exemplo). Nao havia como desligar o setor INTEIRO -- e
--   e isso que o dono precisa quando decide, no meio do evento, que aquela
--   porta para de receber gente.
--
-- POR QUE COLUNA NOVA, E NAO A COLUNA `status` QUE JA EXISTE
--
--   O painel do dono le os setores com `status=eq.ativo`. Marcar o setor como
--   bloqueado naquela coluna o faria SUMIR da tela: o dono bloquearia o setor
--   e perderia o proprio botao de desbloquear, sem uma palavra que explicasse.
--
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE producao_acesso_setores
    -- `NOT NULL DEFAULT false` de proposito: a coluna nasce em tabela que ja
    -- tem setores trabalhando em evento de verdade, e nenhum deles pode
    -- acordar desligado por causa de uma migracao.
    ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT false,
    -- O motivo e o que o porteiro le em voz alta para a pessoa na fila. Sem
    -- ele, a recusa vira "nao sei, o sistema nao deixou".
    ADD COLUMN IF NOT EXISTS bloqueado_motivo TEXT;


-- ══════════════════════════════════════════════════════════════════════════════
-- COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
--
--   ALTER TABLE producao_acesso_setores
--       DROP COLUMN IF EXISTS bloqueado,
--       DROP COLUMN IF EXISTS bloqueado_motivo;
--
-- ══════════════════════════════════════════════════════════════════════════════
