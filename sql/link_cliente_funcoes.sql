-- ══════════════════════════════════════════════════════════════════
-- A porta do CLIENTE para o link de aprovação: só pelo token.
--            Execute no SQL Editor do Supabase, ou por
--            `.\ferramentas\rodar_sql.ps1 sql\link_cliente_funcoes.sql`
-- ══════════════════════════════════════════════════════════════════
--
-- Este arquivo é ADITIVO: ele só cria funções. Nada é fechado aqui, e rodá-lo
-- não muda o comportamento de nenhuma tela. Fechar é a Tarefa 4 do plano
-- `docs/superpowers/plans/2026-08-16-link-do-cliente-so-pelo-token.md`, e só
-- pode acontecer depois que o painel também tiver porta própria.
--
-- ## O que estas funções existem para consertar
--
-- Medido em 16/08/2026 com a chave anônima, que está no código-fonte de toda
-- página do painel:
--
--     GET /rest/v1/pedidos_links_cliente?select=*  ->  200, 42 linhas, com TOKEN
--     anon -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE   (e RLS desligado)
--
-- O token é a única coisa que separa o link de aprovação do resto da internet.
-- Com a lista, abre-se a arte de qualquer cliente, marca-se qualquer pedido como
-- APROVADO — que é autorização de imprimir — e apaga-se a tabela inteira.
--
-- ## Por que função, e não política de RLS
--
-- Porque a pergunta do cliente é "esta linha, com este token", e RLS não sabe
-- exigir que alguém FILTRE por uma coluna. Uma política que deixasse o cliente
-- ler a linha dele deixaria também `select=*` sem filtro devolver todas.
--
-- `SECURITY DEFINER` inverte isso: a função roda com o privilégio de quem a
-- criou, então a chave anônima não precisa de privilégio nenhum na tabela. Quem
-- decide o que sai é o corpo da função, e o corpo exige o par número+token.
--
-- `search_path` fica fixado em `public` de propósito: sem isso, quem controlasse
-- o `search_path` da sessão poderia fazer a função enxergar uma tabela sua com o
-- mesmo nome. É o cuidado padrão de toda função `SECURITY DEFINER`.

-- ─── 1. Abrir o link ─────────────────────────────────────────────────────────
--
-- Devolve a linha SEM o token. Devolver o token de volta ao navegador entregaria
-- justamente o que se está protegendo — e a página do cliente já o tem na URL.

CREATE OR REPLACE FUNCTION public.link_cliente_abrir(
    p_numero text,
    p_token  text
)
RETURNS TABLE (
    id             uuid,
    os_id          text,
    numero_pedido  text,
    id_int         text,
    created_at     timestamptz,
    acessos        integer,
    ultimo_acesso  timestamptz,
    ativo          boolean,
    status_arte    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    -- O par inteiro, e `ativo`: um link revogado tem de parar de abrir.
    SELECT l.id INTO v_id
      FROM pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero
       AND l.token = p_token
       AND l.ativo IS TRUE
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN;   -- nenhuma linha: a tela do cliente já sabe mostrar "link inválido"
    END IF;

    -- A contagem de acessos era um UPDATE separado, feito pelo navegador do
    -- cliente. Aqui ela vira parte de abrir, e some mais um motivo de a chave
    -- anônima precisar escrever na tabela.
    UPDATE pedidos_links_cliente l
       SET acessos = COALESCE(l.acessos, 0) + 1,
           ultimo_acesso = now()
     WHERE l.id = v_id;

    RETURN QUERY
    SELECT l.id, l.os_id, l.numero_pedido, l.id_int, l.created_at,
           l.acessos, l.ultimo_acesso, l.ativo, l.status_arte
      FROM pedidos_links_cliente l
     WHERE l.id = v_id;
END;
$$;

COMMENT ON FUNCTION public.link_cliente_abrir(text, text) IS
'Abre o link de aprovacao do cliente pelo par numero+token, conta o acesso e devolve a linha SEM o token. Criada em 16/08/2026 para que a chave anonima deixe de precisar ler pedidos_links_cliente -- ela listava os 42 links com os tokens.';

-- ─── 2. Gravar o status ──────────────────────────────────────────────────────
--
-- A lista de status é fechada de propósito. Com a coluna livre, quem tivesse UM
-- token escreveria qualquer texto no status daquele pedido; com a lista, o pior
-- que se faz com um token é o que o dono daquele link já podia fazer pela tela.
--
-- Os três são os que a página do cliente escreve hoje. Se um quarto aparecer na
-- tela, ele precisa aparecer aqui junto — e é bom que precise: a lista é o
-- lugar onde se enxerga o que o cliente pode mudar.

CREATE OR REPLACE FUNCTION public.link_cliente_status(
    p_numero text,
    p_token  text,
    p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('APROVADO', 'Em Alteração', 'Enviar Arte') THEN
        RAISE EXCEPTION 'status nao permitido pela pagina do cliente: %', p_status;
    END IF;

    SELECT l.id INTO v_id
      FROM pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero
       AND l.token = p_token
       AND l.ativo IS TRUE
     LIMIT 1;

    IF v_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE pedidos_links_cliente l
       SET status_arte = p_status
     WHERE l.id = v_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_cliente_status(text, text, text) IS
'Grava o status da arte pelo par numero+token, aceitando so os tres valores que a pagina do cliente escreve. Criada em 16/08/2026: sem ela, aprovar arte exigia UPDATE da chave anonima na tabela inteira, e aprovacao de arte e autorizacao de imprimir.';

-- ─── 3. Quem pode chamar ─────────────────────────────────────────────────────
--
-- `anon` é o cliente sem login, que é o ponto. `authenticated` entra junto
-- porque a mesma página pode ser aberta por alguém que por acaso tenha sessão do
-- ERP parceiro, e a função não deve tratá-lo pior.

GRANT EXECUTE ON FUNCTION public.link_cliente_abrir(text, text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_cliente_status(text, text, text)   TO anon, authenticated;

-- ─── 4. A conferência, sem sair daqui ────────────────────────────────────────
--
-- O esperado: uma linha para um par válido, nenhuma para um token errado.

SELECT 'token errado devolve vazio' AS conferencia,
       count(*)                     AS linhas
  FROM public.link_cliente_abrir('18636', 'token-que-nao-existe');
