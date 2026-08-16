-- ══════════════════════════════════════════════════════════════════
-- Passo 3: a chave anônima perde também a LEITURA das duas tabelas.
--          Execute no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════
--
-- Fecha o que sobrou do vazamento medido em 16/08/2026: com a chave que está no
-- código-fonte de toda página do painel, qualquer pessoa lia os códigos de
-- acesso da gráfica EM TEXTO CLARO e a grade inteira de permissões. O passo 1
-- (`rls_acessos_e_permissoes.sql`) fechou a escrita e deixou a leitura de pé de
-- propósito, com um motivo escrito lá: a estação sincronizava a lista com essa
-- mesma chave, e tirá-la deixaria a estação sem lista — e estação sem lista
-- PARA DE PEDIR CÓDIGO. Seria trocar um vazamento por onze painéis destrancados.
--
-- ## Por que REVOKE, e não apenas apagar a política de SELECT
--
-- Esta é a peça que faz o passo 3 ser seguro hoje, e não depois que a última
-- estação atualizar. As duas formas de fechar a leitura NÃO são equivalentes:
--
--     RLS sem política de SELECT  ->  HTTP 200 com corpo `[]`
--     REVOKE SELECT               ->  HTTP 401, `permission denied for table`
--
-- E o agente distingue as duas desde sempre. O `_supabase_request` devolve
-- `None` em erro de HTTP, e `sincronizar_acessos` trata `None` como "não
-- consegui perguntar; segue a cópia atual" — inclusive na versão original de
-- 11/08/2026, que é a que roda nas estações atrasadas. Lista vazia era o único
-- formato de recusa que ele não sabia recusar, e é justamente o que a política
-- ausente produziria.
--
-- Ou seja: o REVOKE fala com o agente velho na única língua que ele já entendia.
-- Uma estação em 1.2.63 que ligar amanhã vai receber 401, registrar "Acessos
-- locais nao sincronizados. Segue a copia atual." e continuar pedindo código.
--
-- O freio da lista vazia (1.2.96) continua valendo e continua sendo necessário:
-- ele cobre o dia em que alguém, sem ler isto, "consertar" a permissão criando
-- uma política de SELECT restritiva no lugar do REVOKE.
--
-- ## O que precisou mudar antes deste arquivo
--
--   - `agent_worker._acessos_da_nuvem` busca pela Edge Function `acesso-estacao`
--     com o segredo do agente (1.2.97). O caminho anônimo virou só reserva, e
--     esta é a hora em que ele deixa de responder.
--   - `db.listar_acessos_locais`, `db.get_user_permissions` e
--     `db.list_all_user_permissions` passaram a ler pela chave de SERVIÇO. Sem
--     isso o Menu Usuários ficaria vazio e ninguém entraria no painel da nuvem.
--   - `db.listar_acessos_locais` levanta `BancoIndisponivel` em vez de devolver
--     `[]`, e o `/api/acessos-locais` responde 503. Mesma lição, outra camada.
--
-- ## Quem continua lendo, e por onde
--
--   estação        -> Edge Function `acesso-estacao` (service_role), com segredo
--   painel/nuvem   -> `db.py` no Render (service_role), com sessão exigida
--   Ideal Control  -> Edge Functions `acesso-interno`/`_compartilhado/sessao.ts`
--
-- Nenhuma página lê estas duas tabelas direto do PostgREST. Foi conferido por
-- busca em todo `frontend/` antes de executar isto.

-- ─── 1. Some a política que mantinha a leitura pública ───────────────────────

DROP POLICY IF EXISTS "leitura enquanto o painel nao migra"  ON imposition_user_permissions;
DROP POLICY IF EXISTS "leitura enquanto a estacao nao migra" ON imposition_acessos_locais;

-- ─── 2. Tira o privilégio de tabela das duas chaves públicas ─────────────────
--
-- `anon` é a chave do código-fonte. `authenticated` é qualquer pessoa que tenha
-- conseguido uma conta: nada nosso lê estas tabelas com o JWT do usuário — quem
-- lê são as Edge Functions e o motor, e os dois usam `service_role`.

REVOKE ALL ON imposition_acessos_locais   FROM anon, authenticated;
REVOKE ALL ON imposition_user_permissions FROM anon, authenticated;

-- Explícito de propósito: `service_role` ignora RLS, mas NÃO ignora privilégio
-- de tabela. Se um REVOKE largo o tivesse alcançado, o painel inteiro cairia.
GRANT ALL ON imposition_acessos_locais   TO service_role;
GRANT ALL ON imposition_user_permissions TO service_role;

COMMENT ON TABLE imposition_acessos_locais IS
    'Codigos de acesso ao painel da estacao. Fechada a anon e authenticated em 16/08/2026: leitura e escrita so pela chave de servico. A estacao le pela Edge Function acesso-estacao, apresentando ACESSO_AGENTE_SEGREDO. Recusar com 401 (REVOKE) e nao com lista vazia (politica ausente) e deliberado: lista vazia faria a estacao parar de pedir codigo.';

COMMENT ON TABLE imposition_user_permissions IS
    'Grade de permissoes do painel. Fechada a anon e authenticated em 16/08/2026: so a chave de servico le e escreve. Quem consulta e o motor (db.py) e as Edge Functions de controle de acesso.';

-- ─── 3. A conferência, sem sair daqui ────────────────────────────────────────
--
-- O esperado, para as duas tabelas:
--   rls_ligado = true
--   politicas  = (nenhuma)
--   anon / authenticated = (nenhum privilegio)
--   service_role = ARRAY com SELECT, INSERT, UPDATE, DELETE

SELECT c.relname                                   AS tabela,
       c.relrowsecurity                            AS rls_ligado,
       COALESCE(string_agg(DISTINCT p.polname || ' [' || p.polcmd::text || ']', ', '),
                '(nenhuma)')                       AS politicas
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('imposition_acessos_locais', 'imposition_user_permissions')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

SELECT table_name                                  AS tabela,
       grantee                                     AS quem,
       COALESCE(string_agg(privilege_type, ', ' ORDER BY privilege_type),
                '(nenhum privilegio)')             AS pode
FROM information_schema.role_table_grants
WHERE table_name IN ('imposition_acessos_locais', 'imposition_user_permissions')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- ─── 4. Nenhuma VIEW servindo de porta dos fundos ────────────────────────────
--
-- Uma view roda com o privilégio de QUEM A CRIOU, e não de quem a consulta, a
-- menos que tenha sido feita com `security_invoker = on`. Quer dizer que uma
-- view sobre estas tabelas, criada pelo `postgres`, continuaria devolvendo os
-- códigos à chave anônima depois de todo o REVOKE acima — e o PostgREST publica
-- automaticamente toda view do schema `public`.
--
-- O esperado é NENHUMA linha. Se aparecer alguma, o REVOKE não terminou o
-- serviço: aquela view precisa do mesmo tratamento.

SELECT dependente.relname                          AS view_que_le,
       origem.relname                              AS tabela,
       COALESCE(
           (SELECT string_agg(g.grantee, ', ')
            FROM information_schema.role_table_grants g
            WHERE g.table_name = dependente.relname
              AND g.grantee IN ('anon', 'authenticated')),
           '(fechada)')                            AS aberta_para
FROM pg_depend d
JOIN pg_rewrite r    ON r.oid = d.objid
JOIN pg_class dependente ON dependente.oid = r.ev_class
JOIN pg_class origem     ON origem.oid = d.refobjid
WHERE origem.relname IN ('imposition_acessos_locais', 'imposition_user_permissions')
  AND dependente.relkind IN ('v', 'm')
  AND dependente.relname <> origem.relname
GROUP BY dependente.relname, origem.relname;
