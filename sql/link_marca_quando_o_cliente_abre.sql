-- ══════════════════════════════════════════════════════════════════
--  O link passa a saber QUANDO o cliente olhou a arte.
--            Execute no SQL Editor do Supabase, ou por
--   `.\ferramentas\rodar_sql.ps1 sql\link_marca_quando_o_cliente_abre.sql`
-- ══════════════════════════════════════════════════════════════════
--
-- Este arquivo é ADITIVO: cria duas colunas e uma função. Nada é apagado, e
-- nenhuma tela muda de comportamento só por ele ter rodado — quem passa a usar
-- as colunas é o `frontend/script.js` e o `frontend/cliente.js` da mesma versão.
--
-- ## A mudança de fluxo que ele serve (31/08/2026)
--
-- Pedido do usuário: *"quando o designer marcar a arte pronta e voltar o pedido
-- para o atendente, o status deve permanecer como Enviar arte, mas o link já
-- deverá ser gerado neste momento, sem precisar ser gerado pelo atendimento; o
-- status deverá mudar para Aguard. Aprovação quando for verificado que o
-- cliente abriu o link"*.
--
-- Até aqui, quem decidia que o pedido estava "com o cliente" era a EXISTÊNCIA do
-- link (`temLinkGerado`, no `classificarPedidoNaArte`). Com o link nascendo
-- junto com a arte pronta, essa regra passaria a marcar como "Aguard. Aprovação"
-- todo pedido que o designer terminasse — o mesmo defeito que tínhamos de manhã
-- com a palavra `AGUARDANDO`, entrando por outra porta.
--
-- Então a pergunta muda de "existe link?" para "o cliente já olhou?", e é por
-- isso que estas duas colunas existem.
--
-- ## Por que não serve o contador `acessos` que já existe
--
-- Ele conta CARREGAMENTO de página, de quem for. Três coisas somam nele sem o
-- cliente ter visto nada:
--
--   1. o atendente ou o designer abrindo o link para conferir;
--   2. a PRÉVIA DO WHATSAPP, que busca a URL sozinha para montar o cartão da
--      mensagem — isso conta um acesso no instante do envio;
--   3. qualquer robô que siga o link.
--
-- Decisão do usuário: vale o **primeiro gesto do cliente na tela** (rolar,
-- tocar, clicar). Robô de prévia não rola a página nem executa JavaScript, então
-- o gesto é a única evidência que significa "uma pessoa olhou".

-- ─── 1. As duas colunas ──────────────────────────────────────────────────────
--
-- `arte_pronta_em`  — quando esta versão da arte ficou pronta e o link passou a
--                     valer. Carimbado pelo painel.
-- `cliente_abriu_em`— o primeiro gesto do cliente DEPOIS daquela versão.
--
-- As duas andam juntas: refazer a arte carimba `arte_pronta_em` de novo e
-- **zera** `cliente_abriu_em`. Sem isso, o pedido que voltou de uma alteração
-- saltaria direto para "Aguard. Aprovação" com a abertura da versão anterior —
-- o cliente nunca teria visto a arte corrigida, e a tela diria que sim.

ALTER TABLE public.pedidos_links_cliente
    ADD COLUMN IF NOT EXISTS arte_pronta_em   timestamptz,
    ADD COLUMN IF NOT EXISTS cliente_abriu_em timestamptz;

COMMENT ON COLUMN public.pedidos_links_cliente.arte_pronta_em IS
'Quando esta versao da arte ficou pronta e o link passou a valer. Refazer a arte carimba de novo.';

COMMENT ON COLUMN public.pedidos_links_cliente.cliente_abriu_em IS
'O primeiro gesto do cliente na tela DEPOIS de arte_pronta_em. E ele que muda o pedido para Aguard. Aprovacao. Zerado quando a arte e refeita.';

-- ─── 2. O carimbo, feito pelo banco ──────────────────────────────────────────
--
-- Mesmo desenho das outras duas funções deste link: `SECURITY DEFINER`, o par
-- número+token exigido no corpo, `search_path` fixo. A chave anônima continua
-- sem privilégio nenhum na tabela.
--
-- A função faz DUAS coisas de propósito, e a segunda é a que interessa ao ERP:
-- ela também grava `AGUARDANDO_APROVACAO` em `pedidos_artes.status`. Assim o
-- parceiro enxerga o estágio mesmo que ninguém tenha o painel aberto naquele
-- momento — que é o caso normal, porque quem está na tela é o cliente.
--
-- Ela é IDEMPOTENTE: só carimba se `cliente_abriu_em` estiver vazio. O cliente
-- rola a página dez vezes e o banco é escrito uma.

CREATE OR REPLACE FUNCTION public.link_cliente_visto(
    p_numero text,
    p_token  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id     uuid;
    v_id_int text;
BEGIN
    SELECT l.id, l.id_int INTO v_id, v_id_int
      FROM pedidos_links_cliente l
     WHERE l.numero_pedido = p_numero
       AND l.token = p_token
       AND l.ativo IS TRUE
       AND l.cliente_abriu_em IS NULL
     LIMIT 1;

    -- Token errado, link revogado, ou já carimbado: nada a fazer, e nada a
    -- contar de volta. Devolver `false` aqui não distingue os três casos de
    -- propósito — quem tem um token não precisa saber se ele é o primeiro.
    IF v_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE pedidos_links_cliente l
       SET cliente_abriu_em = now(),
           status_arte      = 'Aguard. Aprovação'
     WHERE l.id = v_id;

    -- O campo que o ERP parceiro lê.
    --
    -- O `WHERE` do estágio existe para a marca NÃO ANDAR PARA TRÁS: se a arte já
    -- foi aprovada ou reprovada, uma reabertura do link não pode devolver o
    -- pedido para "aguardando aprovação". A lista é a dos estágios anteriores a
    -- este — os mesmos nomes documentados em `docs/status_da_arte_para_o_erp.md`.
    UPDATE pedidos_artes a
       SET status = 'AGUARDANDO_APROVACAO',
           updated_at = now()
     WHERE a.id_int::text = v_id_int
       AND (a.status IS NULL
            OR upper(btrim(a.status)) IN (
                'AGUARDANDO', 'EM ARTE', 'ARTE_EM_ANDAMENTO',
                'ENVIAR ARTE', 'ARTE PRONTA'
            ));

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_cliente_visto(text, text) IS
'Carimba o primeiro gesto do cliente na tela do link (cliente_abriu_em) e move pedidos_artes.status para AGUARDANDO_APROVACAO. Idempotente: so escreve na primeira vez. Criada em 31/08/2026, quando o link passou a nascer junto com a arte pronta e a existencia dele deixou de significar que o cliente ja tinha olhado.';

-- ─── 3. Quem pode chamar ─────────────────────────────────────────────────────
--
-- `anon` é o cliente sem login, que é o ponto. `authenticated` entra junto pelo
-- mesmo motivo das outras duas: a página pode ser aberta por alguém que por
-- acaso tenha sessão do ERP parceiro.

GRANT EXECUTE ON FUNCTION public.link_cliente_visto(text, text) TO anon, authenticated;

-- ─── 4. A conferência, sem sair daqui ────────────────────────────────────────
--
-- O esperado: `false` para um token que não existe, e as duas colunas presentes.

SELECT public.link_cliente_visto('18636', 'token-que-nao-existe') AS token_errado_devolve_false;

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'pedidos_links_cliente'
   AND column_name IN ('arte_pronta_em', 'cliente_abriu_em')
 ORDER BY column_name;

-- ─── Como desfazer ───────────────────────────────────────────────────────────
--
-- DROP FUNCTION IF EXISTS public.link_cliente_visto(text, text);
-- ALTER TABLE public.pedidos_links_cliente DROP COLUMN IF EXISTS arte_pronta_em;
-- ALTER TABLE public.pedidos_links_cliente DROP COLUMN IF EXISTS cliente_abriu_em;
