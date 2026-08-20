-- ════════════════════════════════════════════════════════════════════════════════
-- SQL: a função do link do cliente precisa aceitar "Em Alteração"
-- Execute no SQL Editor do Supabase, ou por
--         `.\ferramentas\rodar_sql.ps1 sql\link_cliente_status_aceita_em_alteracao.sql`
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECE HOJE
-- Quando o cliente pede alteração da arte no link, a página tenta gravar o
-- status do link como `Em Alteração`, pela função `link_cliente_status`. A
-- função que está NO BANCO recusa esse valor:
--
--     P0001 -- status nao permitido pela pagina do cliente: Em Alteração
--
-- Medido em 20/08/2026, com token inválido de propósito (valor aceito devolve
-- `false` sem escrever nada; valor recusado estoura a exceção):
--
--     'APROVADO'          -> aceito
--     'Enviar Arte'       -> aceito
--     'Em Alteração'      -> RECUSADO
--     'Em Alteracao'      -> RECUSADO
--
-- O arquivo `sql/link_cliente_funcoes.sql` deste repositório já lista os três.
-- A versão que está rodando é anterior a isso: ela nasceu com dois.
--
-- O EFEITO
-- A página engole o erro de propósito -- uma recusa do banco não pode travar o
-- cliente no meio da aprovação --, então ele conclui e vai embora achando que
-- avisou. E avisou mesmo: o pedido dele fica gravado no chat da proposta e no
-- status dos modelos, e a Lista de Arte recalcula por ali. O que não muda é o
-- status do LINK, que continua dizendo "Aguard. Aprovação".
--
-- Foi o que aconteceu no pedido 20974 em 20/08/2026: o cliente pediu a
-- alteração às 11:25, a tela dele não mudou de estado, e às 11:35 ele voltou e
-- pediu de novo. Nove acessos ao link.
--
-- O QUE ESTE ARQUIVO FAZ
-- Substitui só a `link_cliente_status`, com a lista dos três valores. Nada mais
-- é tocado: as outras funções do link ficam como estão.
--
-- A lista continua fechada de propósito. Com a coluna livre, quem tivesse UM
-- token escreveria qualquer texto no status daquele pedido; com a lista, o pior
-- que se faz com um token é o que o dono daquele link já podia fazer pela tela.
-- Aprovar arte é autorizar impressão.
--
-- A NOVIDADE: o valor é normalizado antes de gravar
-- `Em Alteracao`, sem acento, passa a ser aceito -- mas o que vai para a coluna
-- é sempre a forma com acento. O painel compara o texto do status, e duas
-- grafias no banco virariam dois comportamentos. Isso também protege contra a
-- causa provável deste problema: um acento perdido no caminho até o banco.
-- ════════════════════════════════════════════════════════════════════════════════


-- ─── 1. ANTES: o que a função aceita hoje ──────────────────────────────────────
--
-- Token inválido de propósito: valor aceito devolve `false` (o par não confere)
-- e NÃO escreve nada. Se `Em Alteração` ainda estiver de fora, esta consulta
-- estoura aqui -- e é esse o sintoma que viemos consertar.

SELECT 'antes' AS quando,
       public.link_cliente_status('0', 'token-que-nao-existe', 'APROVADO') AS aprovado;


-- ─── 2. A função, com os três valores ──────────────────────────────────────────

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
    v_id     uuid;
    v_status text;
    -- "Em Alteração", montada por código de caractere de propósito.
    --
    -- Escrever o acento literalmente aqui já se perdeu uma vez no caminho até o
    -- banco, e foi essa perda que criou o problema: a função passou meses
    -- recusando o valor que a página do cliente manda. `chr(231)` é o ç e
    -- `chr(227)` é o ã -- este arquivo inteiro é ASCII nesta linha, então não há
    -- o que estropiar.
    c_alteracao constant text := 'Em Altera' || chr(231) || chr(227) || 'o';
BEGIN
    -- Aceita com e sem acento, mas GRAVA sempre a forma canônica.
    v_status := CASE
        WHEN p_status = 'APROVADO'      THEN 'APROVADO'
        WHEN p_status = 'Enviar Arte'   THEN 'Enviar Arte'
        WHEN p_status = c_alteracao
          OR p_status = 'Em Alteracao'  THEN c_alteracao
        ELSE NULL
    END;

    IF v_status IS NULL THEN
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
       SET status_arte = v_status
     WHERE l.id = v_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_cliente_status(text, text, text) IS
'Grava o status da arte pelo par numero+token, aceitando so os tres valores que a pagina do cliente escreve, e gravando sempre a forma canonica. Criada em 16/08/2026: sem ela, aprovar arte exigia UPDATE da chave anonima na tabela inteira, e aprovacao de arte e autorizacao de imprimir. Em 20/08/2026 passou a aceitar "Em Alteracao", que a versao no banco recusava -- o cliente pedia alteracao e o status do link nao mudava.';

GRANT EXECUTE ON FUNCTION public.link_cliente_status(text, text, text) TO anon, authenticated;


-- ─── 3. DEPOIS: os três têm de passar ──────────────────────────────────────────
--
-- Todos devolvem `false`, porque o token não existe -- e é isso que se quer ver:
-- passaram pela lista e pararam na conferência do token, sem escrever nada. Se
-- algum ainda estiver fora da lista, a consulta estoura com o nome dele.

SELECT 'APROVADO'      AS status, public.link_cliente_status('0', 'token-que-nao-existe', 'APROVADO')     AS escreveu
UNION ALL
SELECT 'Em Alteracao (com acento)', public.link_cliente_status('0', 'token-que-nao-existe', 'Em Altera' || chr(231) || chr(227) || 'o')
UNION ALL
SELECT 'Em Alteracao (sem acento)', public.link_cliente_status('0', 'token-que-nao-existe', 'Em Alteracao')
UNION ALL
SELECT 'Enviar Arte',           public.link_cliente_status('0', 'token-que-nao-existe', 'Enviar Arte');


-- ════════════════════════════════════════════════════════════════════════════════
-- OPCIONAL -- acertar o pedido 20974, que ficou com o status errado
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O cliente pediu alteração das artes em 20/08/2026 e o link ficou marcado como
-- "Aguard. Aprovação". A Lista de Arte já mostra o pedido certo (ela recalcula
-- pelo status dos modelos), mas se ele abrir o link de novo verá a tela de
-- aprovação em vez de "Artes em Correção".
--
-- Rode as duas linhas abaixo só se quiser acertar isso. Daqui para frente a
-- própria página grava sozinha.
--
-- UPDATE pedidos_links_cliente
--    SET status_arte = 'Em Alteração'
--  WHERE numero_pedido = '20974' AND ativo IS TRUE;
