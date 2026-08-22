-- ════════════════════════════════════════════════════════════════════════════════
-- SQL: Painel do Acabamento para TODOS — ver e editar, no site e na estacao
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- (ou: .\ferramentas\rodar_sql.ps1 sql\acabamento_para_todos.sql)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Pedido do usuario em 22/08/2026: "o Menu Painel do Acabamento deve aparecer e
-- ser editavel a todos os usuarios, ajustar permissoes, mesmo marcando nao esta
-- visualizando".
--
-- O que estava acontecendo: ha DUAS grades de permissao, e marcar numa nao muda
-- a outra.
--
--   * `imposition_user_permissions` e a grade de quem entra pelo SITE (sessao do
--     Supabase). Uma coluna por permissao. O SQL do painel (painel_do_acabamento.sql)
--     ja tinha ligado o VER para quem via a Producao — mas o EDITAR so para quem
--     editava a Producao, e o atendimento e o designer ficaram sem poder marcar
--     o estagio do material.
--
--   * `imposition_acessos_locais.permissoes` e a grade de quem entra pela
--     ESTACAO da grafica, pelo codigo local. E um JSON, gravado no dia em que o
--     acesso foi criado ou teve o perfil trocado. Tres acessos (gravados antes
--     de o modulo Acabamento existir) NAO TINHAM a chave do acabamento — e
--     a estacao aplicava o JSON como estava: chave ausente valia "nao". Por
--     isso o menu nao aparecia na estacao por mais que o administrador marcasse
--     caixas na grade dos usuarios do site.
--
-- Este arquivo liga VER e EDITAR do Acabamento em todo mundo, nas duas grades.
--
-- O QUE ELE NAO FAZ
-- Nao encosta em NENHUMA outra caixa. O usuario edita a grade ao vivo, caixa a
-- caixa, e reescrever o resto a partir do padrao do perfil apagaria ajustes
-- feitos a mao. So as duas chaves do acabamento sao tocadas.
--
-- Rodar duas vezes nao faz mal: cada UPDATE so pega linha que ainda precisa.
--
-- QUANDO PASSA A VALER
--   * no site: no proximo F5 de cada pessoa (a grade e lida no login);
--   * na estacao: o agente baixa a lista de acessos a cada 5 minutos, e o
--     operador da um F5 depois disso (o painel reconfere o codigo ao abrir).


-- ─── 1. Grade de quem entra pelo SITE ───────────────────────────────────────

UPDATE public.imposition_user_permissions
   SET perm_acabamento_view = TRUE,
       perm_acabamento_edit = TRUE,
       updated_at = now()
 WHERE perm_acabamento_view IS DISTINCT FROM TRUE
    OR perm_acabamento_edit IS DISTINCT FROM TRUE;


-- ─── 2. Grade de quem entra pela ESTACAO (acesso local) ─────────────────────
--
-- `||` em jsonb acrescenta/sobrescreve SO as chaves informadas; o resto do JSON
-- fica como esta.
--
-- Grade VAZIA ({} ou NULL) fica de fora DE PROPOSITO: para a estacao, grade
-- vazia significa "tudo liberado menos a administracao" (ver
-- `permsDoOperadorLocal` no script.js). Escrever duas chaves nela a tornaria
-- "nao vazia" e trancaria o operador no padrao do perfil — o oposto do pedido.

UPDATE public.imposition_acessos_locais
   SET permissoes = permissoes || '{"perm_acabamento_view": true, "perm_acabamento_edit": true}'::jsonb,
       atualizado_em = now()
 WHERE permissoes IS NOT NULL
   AND permissoes <> '{}'::jsonb
   AND (   COALESCE(permissoes->>'perm_acabamento_view', '') <> 'true'
        OR COALESCE(permissoes->>'perm_acabamento_edit', '') <> 'true');


-- ─── 3. Conferencia — quem ficou vendo e editando ───────────────────────────

-- Todo mundo do site: os dois numeros de baixo tem de ser iguais ao de cima.
SELECT
    count(*)                                     AS pessoas_no_site,
    count(*) FILTER (WHERE perm_acabamento_view) AS veem_o_acabamento,
    count(*) FILTER (WHERE perm_acabamento_edit) AS editam_o_acabamento
FROM public.imposition_user_permissions;

-- Todo acesso local com grade: os dois numeros de baixo tem de ser iguais ao de cima.
SELECT
    count(*)                                                           AS acessos_com_grade,
    count(*) FILTER (WHERE permissoes->>'perm_acabamento_view' = 'true') AS veem_o_acabamento,
    count(*) FILTER (WHERE permissoes->>'perm_acabamento_edit' = 'true') AS editam_o_acabamento
FROM public.imposition_acessos_locais
WHERE permissoes IS NOT NULL AND permissoes <> '{}'::jsonb;
