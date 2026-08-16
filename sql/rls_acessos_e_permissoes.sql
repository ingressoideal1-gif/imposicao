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
-- ## Por que a primeira versão deste arquivo não bastou
--
-- Ela ligava o RLS e criava uma política de leitura, e o `DROP POLICY IF EXISTS`
-- dela só derrubava a política de mesmo nome. Rodou com sucesso, e a escrita
-- anônima CONTINUOU passando — medido logo depois, com um PATCH numa linha de
-- verdade, que voltou a linha alterada em vez de vazio.
--
-- A explicação é que a tabela já tinha política de antes, permissiva. RLS ligado
-- com uma política que permite tudo é RLS que não protege nada, e o pior é que
-- ele PARECE ligado para quem olha a lista de tabelas.
--
-- Por isso este arquivo agora começa apagando TODA política das duas tabelas.
-- Elas são nossas (`imposition_*`), não do ERP parceiro, então não há política
-- de terceiro a preservar aqui.
--
-- ## Por que fecha a ESCRITA e deixa a leitura para depois
--
-- Fechar a leitura hoje quebraria a gráfica, e de um jeito perigoso: a estação
-- sincroniza a lista de acessos locais com a chave anônima
-- (`agent_worker.sincronizar_acessos`). Sem leitura, ela receberia uma lista
-- VAZIA — e uma lista vazia faz a estação parar de pedir código, abrindo o
-- painel para quem sentar na máquina. Trocaríamos um vazamento por uma porta
-- destrancada em onze computadores.
--
-- A ordem é esta, e cada passo só acontece depois do anterior:
--
--   1. ESTE ARQUIVO: ninguém mais escreve. Nada quebra — quem escreve de
--      verdade usa a chave de serviço, que ignora RLS por definição.
--   2. A estação passa a sincronizar por caminho autenticado, e já recusa lista
--      vazia (`agent_worker.sincronizar_acessos`, desde 16/08/2026).
--   3. Só então a leitura fecha.

-- ─── 1. Apaga TODA política que exista hoje nas duas tabelas ─────────────────

DO $$
DECLARE politica RECORD;
BEGIN
    FOR politica IN
        SELECT p.polname, c.relname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname IN ('imposition_acessos_locais', 'imposition_user_permissions')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I', politica.polname, politica.relname);
        RAISE NOTICE 'politica removida: % em %', politica.polname, politica.relname;
    END LOOP;
END $$;

-- ─── 2. Liga o RLS e devolve SÓ a leitura ────────────────────────────────────

ALTER TABLE imposition_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE imposition_acessos_locais   ENABLE ROW LEVEL SECURITY;

-- Leitura mantida COMO ESTAVA, de propósito: o painel e a estação ainda leem
-- por caminhos que usam a chave pública, e derrubá-los agora tiraria a grade de
-- permissões da tela de quem trabalha e a lista de acessos das estações.
-- Somem no passo 3.
CREATE POLICY "leitura enquanto o painel nao migra"
    ON imposition_user_permissions FOR SELECT USING (true);

CREATE POLICY "leitura enquanto a estacao nao migra"
    ON imposition_acessos_locais FOR SELECT USING (true);

-- Nenhuma política de INSERT, UPDATE ou DELETE, e é a AUSÊNCIA delas que fecha
-- a escrita. Política de SELECT não autoriza UPDATE: o Postgres exige uma
-- política do comando correspondente.

COMMENT ON TABLE imposition_acessos_locais IS
    'Códigos de acesso ao painel da estação. RLS ligado em 16/08/2026: escrita só pela chave de serviço. A leitura ainda é pública porque o agente sincroniza por ela — fechar antes de o agente migrar deixaria a estação sem lista, e sem lista ela para de pedir código.';

-- ─── 3. O resultado, para conferir sem sair daqui ────────────────────────────
--
-- `rls_ligado` tem de ser `true` nas duas, e `politicas` tem de mostrar UMA
-- política de SELECT em cada. Qualquer política com comando `*` (ALL), `w`
-- (UPDATE), `a` (INSERT) ou `d` (DELETE) significa que a escrita continua
-- aberta.

SELECT c.relname                                        AS tabela,
       c.relrowsecurity                                 AS rls_ligado,
       COALESCE(string_agg(p.polname || ' [' || p.polcmd || ']', ', '),
                '(nenhuma)')                            AS politicas
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('imposition_acessos_locais', 'imposition_user_permissions')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
