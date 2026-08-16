-- ══════════════════════════════════════════════════════════════════
-- RLS: ninguém escreve nas permissões nem nos acessos locais pela
--      chave anônima. Execute no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════
--
-- ## O que foi medido em 16/08/2026
--
-- A chave anônima está no código-fonte de toda página do painel — ela é pública
-- por natureza, e isso é normal. O que não é normal é o que ela alcançava:
--
--     SELECT em imposition_acessos_locais    -> 200, códigos EM TEXTO CLARO
--     SELECT em imposition_user_permissions  -> 200, a grade inteira
--     PATCH  em imposition_acessos_locais    -> 200, ESCRITA PERMITIDA
--     PATCH  em imposition_user_permissions  -> 200, ESCRITA PERMITIDA
--
-- Quer dizer: qualquer pessoa que abrisse o código-fonte da página podia se dar
-- `admin`, trocar o código de acesso de um operador, ou desativar todos.
--
-- As tabelas do controle de acesso (`producao_acesso_*`) já nasceram com RLS
-- ligado e zero políticas, e a `imposition_segredos` também. Estas duas ficaram
-- de fora porque são anteriores àquela decisão.
--
-- ## Por que este arquivo fecha a ESCRITA e deixa a leitura para depois
--
-- Fechar a leitura hoje quebraria a gráfica, e de um jeito perigoso: a estação
-- sincroniza a lista de acessos locais com a chave anônima
-- (`agent_worker.sincronizar_acessos`). Sem leitura, ela receberia uma lista
-- VAZIA — e uma lista vazia faz a estação parar de pedir código, abrindo o
-- painel para qualquer um que sente na máquina. Trocaríamos um vazamento por
-- uma porta destrancada em onze computadores.
--
-- Então a ordem é esta, e cada passo só acontece depois do anterior:
--
--   1. ESTE ARQUIVO: ninguém mais escreve. A escalada de privilégio e a troca
--      de código por fora morrem hoje, e nada quebra — todo mundo que escreve
--      de verdade usa a chave de serviço, que ignora RLS por definição.
--   2. A estação passa a sincronizar por caminho autenticado, e a recusar lista
--      vazia (`sql/rls_acessos_leitura.sql` acompanha esse passo).
--   3. Só então a leitura fecha.
--
-- ## Por que a chave de serviço continua funcionando
--
-- `service_role` ignora RLS. O `app.py` no Render, as Edge Functions e o
-- `db.py` com a chave de serviço seguem lendo e escrevendo como hoje. O que
-- muda é só o que a chave PÚBLICA pode fazer.

-- ─── Permissões dos usuários do painel ───────────────────────────────────────

ALTER TABLE imposition_user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura enquanto o painel nao migra" ON imposition_user_permissions;

-- Leitura mantida COMO ESTAVA, de propósito: o painel ainda a lê por caminhos
-- que usam a chave pública, e derrubá-los agora tiraria a grade de permissões
-- da tela de quem trabalha. Some no passo 3.
CREATE POLICY "leitura enquanto o painel nao migra"
    ON imposition_user_permissions
    FOR SELECT
    USING (true);

-- Nenhuma política de INSERT, UPDATE ou DELETE. Sem política, o PostgREST
-- recusa — e é isso que fecha a escalada de privilégio.

-- ─── Acessos locais ao NewProd ───────────────────────────────────────────────

ALTER TABLE imposition_acessos_locais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura enquanto a estacao nao migra" ON imposition_acessos_locais;

-- Mesma coisa, e aqui a razão é mais forte: é esta leitura que alimenta o login
-- offline das onze estações. Ver o passo 2 acima.
CREATE POLICY "leitura enquanto a estacao nao migra"
    ON imposition_acessos_locais
    FOR SELECT
    USING (true);

COMMENT ON TABLE imposition_acessos_locais IS
    'Códigos de acesso ao painel da estação. RLS ligado em 16/08/2026: escrita só pela chave de serviço. A leitura ainda é pública porque o agente sincroniza por ela — fechar antes de o agente migrar deixaria a estação sem lista, e sem lista ela para de pedir código.';
