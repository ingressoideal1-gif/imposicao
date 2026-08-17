-- ══════════════════════════════════════════════════════════════════
-- Tarefa 4: a chave anônima perde a tabela dos links do cliente.
--
--     NÃO RODE ANTES DE PUBLICAR o `cliente.js` que usa as funções.
--
-- ══════════════════════════════════════════════════════════════════
--
-- A página do cliente em produção ainda é a versão que lê a tabela direto. Rodar
-- este arquivo antes de publicar derruba a tela de aprovação na frente do
-- cliente. A ordem certa é:
--
--   1. `sql/link_cliente_funcoes.sql`   (já rodou em 16/08/2026)
--   2. `.\publicar.ps1` com o `cliente.js` novo
--   3. este arquivo
--
-- ## O que ele fecha
--
-- Medido em 16/08/2026, com a chave anônima que está no código-fonte de toda
-- página e qualquer um lê com Ctrl+U:
--
--     GET /rest/v1/pedidos_links_cliente?select=*  ->  200, 42 linhas, com TOKEN
--     anon -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE   (RLS desligado)
--
-- Três estragos, em ordem de gravidade: marcar qualquer pedido como APROVADO
-- (que é autorização de imprimir), apagar todos os links já enviados a clientes,
-- e abrir a arte de qualquer cliente da gráfica.
--
-- ## Por que dá para fechar sem dar porta nova à estação
--
-- Porque a estação não consome esta tabela. Confirmado com o usuário em
-- 16/08/2026: "estação da gráfica só tem acesso local e login não vê a fila de
-- arte". O operador entra pelo código local, sem sessão do Supabase — ou seja,
-- ele é `anon` —, e a Fila de Arte, que é quem usa esta tabela, não aparece lá.
--
-- Conferido no código também, e não só perguntado: nenhum arquivo Python toca a
-- tabela, e a única LEITURA do painel (`carregarLinksExistentes`) já engole o
-- erro dela num try/catch próprio, então um 401 vira uma linha no console e não
-- uma tela quebrada.
--
-- ## O que este arquivo NÃO resolve, e é para ficar registrado
--
-- `authenticated` continua com a tabela. E "qualquer sessão válida" inclui todo
-- cliente do ERP parceiro, porque a conta é a mesma. Ou seja: isto reduz a
-- exposição de "qualquer um na internet" para "quem tem conta no Vibe" — que é
-- uma redução enorme, e não é o fim do assunto.
--
-- O fim do assunto é a Tarefa 3 do plano: o painel passar pela Edge Function,
-- que sabe conferir o PAPEL de quem chama. Enquanto ela não vem, o que protege é
-- que ninguém de fora consegue mais nem listar os tokens.

-- ─── 1. A chave pública perde tudo ───────────────────────────────────────────

REVOKE ALL ON public.pedidos_links_cliente FROM anon;

-- ─── 2. O painel fica com o que ele usa, e só ────────────────────────────────
--
-- Nenhum ponto do `script.js` apaga link nem esvazia a tabela — são treze
-- escritas de `status_arte`, duas leituras e uma criação. Então DELETE e
-- TRUNCATE saem: privilégio que ninguém exerce é só superfície.

REVOKE ALL ON public.pedidos_links_cliente FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pedidos_links_cliente TO authenticated;

-- `service_role` ignora RLS, mas NÃO ignora privilégio de tabela. Explícito de
-- propósito: um REVOKE largo que o alcançasse derrubaria as Edge Functions.
GRANT ALL ON public.pedidos_links_cliente TO service_role;

-- ─── 3. RLS ligado, com a política que mantém o painel de pé ─────────────────
--
-- A tabela era uma das cinco sem RLS no banco inteiro. Ligar sem política
-- nenhuma fecharia para `authenticated` também — e o painel é `authenticated`.
--
-- As duas funções do cliente são SECURITY DEFINER e pertencem ao dono da
-- tabela, então elas passam por cima desta política, como devem.

ALTER TABLE public.pedidos_links_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "painel logado usa a tabela" ON public.pedidos_links_cliente;
CREATE POLICY "painel logado usa a tabela"
    ON public.pedidos_links_cliente
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.pedidos_links_cliente IS
'Links publicos de aprovacao do cliente. Fechada a anon em 16/08/2026: a chave publica listava os 42 links COM os tokens, e podia marcar qualquer pedido como APROVADO ou apagar a tabela. O cliente entra pelas funcoes link_cliente_abrir e link_cliente_status, que exigem o par numero+token. O painel logado continua entrando direto -- fechar tambem para authenticated depende de o painel passar pela Edge Function.';

-- ─── 4. A conferência, sem sair daqui ────────────────────────────────────────
--
-- O esperado:
--   anon           -> (nenhum privilegio)
--   authenticated  -> INSERT, SELECT, UPDATE
--   service_role   -> tudo
--   rls_ligado     -> true, com 1 politica

SELECT COALESCE(g.grantee, 'anon (nenhum privilegio)')            AS quem,
       COALESCE(string_agg(g.privilege_type, ', '
                           ORDER BY g.privilege_type), '-')       AS pode
  FROM information_schema.role_table_grants g
 WHERE g.table_name = 'pedidos_links_cliente'
   AND g.grantee IN ('anon', 'authenticated', 'service_role')
 GROUP BY g.grantee;

SELECT c.relrowsecurity                                            AS rls_ligado,
       (SELECT count(*) FROM pg_policies p
         WHERE p.tablename = 'pedidos_links_cliente')              AS politicas
  FROM pg_class c
 WHERE c.relname = 'pedidos_links_cliente';
