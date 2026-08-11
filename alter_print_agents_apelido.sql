-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE: apelido da estacao em print_agents
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ══════════════════════════════════════════════════════════════════
--
-- POR QUE UMA COLUNA NOVA, E NAO REUSAR `name`:
-- o heartbeat do agente faz UPSERT de `name` a cada ciclo com o hostname
-- da maquina (agent_worker.sync_heartbeat). Renomear ali seria desfeito
-- em segundos, sem erro nenhum aparecer. O `apelido` e escrito so pelo
-- painel; o agente nunca o toca, entao sobrevive aos heartbeats.
--
-- ATE ESTA COLUNA EXISTIR o painel continua funcionando: a renomeacao
-- vale no localStorage do navegador de quem renomeou. Depois de rodar
-- este script, o apelido passa a ser visto por todas as estacoes.

ALTER TABLE print_agents
ADD COLUMN IF NOT EXISTS apelido TEXT;

COMMENT ON COLUMN print_agents.apelido IS
    'Nome escolhido pelo operador para a estacao. Diferente de name, que o heartbeat sobrescreve com o hostname.';
