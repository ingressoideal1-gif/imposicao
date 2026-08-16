-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE: a versao que cada estacao esta rodando, em coluna
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ══════════════════════════════════════════════════════════════════
--
-- POR QUE ISTO EXISTE
--
-- Onze estacoes, cada uma se atualizando no seu ritmo. Para cortar o Render
-- (Fase 3) e preciso saber QUANDO todas migraram — e desligar a rota antes que
-- a ultima migre significa uma grafica imprimindo ingressos que nunca sao
-- publicados. O papel sai, a portaria nao tem o que conferir, e ninguem
-- descobre ate alguem tentar entrar.
--
-- O QUE JA EXISTIA, E POR QUE NAO BASTAVA
--
-- O heartbeat ja mandava a versao DENTRO de `printers_json`, o campo JSONB
-- (`agent_worker.sync_heartbeat`). A escolha de nao criar coluna foi
-- deliberada na epoca: evitava exatamente esta migracao. O custo apareceu
-- agora — todo mundo que precisa da informacao tem de saber cavar o JSON, e a
-- conferencia diaria (`ferramentas/conferir.ps1`) simplesmente nao a mostrava.
--
-- Medido em 16/08/2026, com as onze linhas na mao: duas estacoes vistas HOJE
-- reportam versao nenhuma (rodam um agente anterior ao que passou a mandar o
-- campo), e ha versoes de 1.2.7 a 1.2.92 convivendo. Nada disso aparecia em
-- lugar nenhum.
--
-- AS DUAS VERSOES, E POR QUE SAO DUAS
--
-- `versao` e o executavel (`NewProd.exe`); `painel_versao` e a tela que o
-- operador ve. Eles se atualizam por caminhos diferentes — o executavel pelo
-- manifesto, o painel pela sincronizacao com a nuvem — e JA DIVERGIRAM em
-- producao. Um numero so nao diz se a estacao esta em dia.
--
-- O CAMPO NO JSON CONTINUA
--
-- De proposito: o modal "Qual e esta estacao?" do painel le
-- `printers_json.version`, e ele roda na tela do operador, que pode estar
-- desatualizada. Quebrar aquela tela para arrumar esta coluna seria trocar um
-- incomodo de quem publica por um incomodo de quem imprime.
--
-- ATE ESTA COLUNA EXISTIR nada quebra: o heartbeat tenta gravar com as colunas
-- novas e, se o banco recusar, repete sem elas e segue reportando pelo JSON.
-- Uma estacao com agente velho tambem nunca preenche — e ai a coluna fica NULA,
-- que e a resposta certa: "esta maquina roda algo anterior a isto".

ALTER TABLE print_agents
ADD COLUMN IF NOT EXISTS versao TEXT;

ALTER TABLE print_agents
ADD COLUMN IF NOT EXISTS painel_versao TEXT;

COMMENT ON COLUMN print_agents.versao IS
    'Versao do NewProd.exe que esta estacao rodava no ultimo heartbeat. NULA quando o agente e anterior a agosto/2026. Espelha printers_json->>version, que o painel le.';

COMMENT ON COLUMN print_agents.painel_versao IS
    'Versao do painel (frontend) que esta estacao serve na porta 9000. Atualiza por caminho diferente do executavel, e ja divergiu dele em producao.';
