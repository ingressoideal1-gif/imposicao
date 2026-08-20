-- ════════════════════════════════════════════════════════════════════════════════
-- SQL: dar linha em `pedidos_artes` aos pedidos que ja foram ao cliente
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- A solicitacao de alteracao dos DADOS DE NOTA FISCAL E ENTREGA que o cliente
-- escreve no link do cliente mora em `pedidos_artes.observacoes`, na chave
-- `correcao_entrega_faturamento`. Ela ia embora calada, e o painel mostrava no
-- lugar dela a frase generica "O cliente solicitou revisao nos dados de entrega
-- e faturamento."
--
-- Duas coisas somadas causavam isso:
--
--   1. A tela do cliente gravava com UPDATE. Um UPDATE que nao acha linha
--      nenhuma NAO e erro no PostgREST: responde 200 com `[]`. O supabase-js
--      tambem nao lanca. O `try/catch` em volta era enfeite.
--
--   2. A linha do pedido quase nunca existia. Em 20/08/2026 havia 38 linhas em
--      `pedidos_artes` para 8.263 propostas -- dos 12 pedidos mais recentes, um
--      unico tinha linha. Ela so nascia quando alguem preenchia o briefing no
--      painel.
--
-- E a tela do cliente NAO pode criar a linha: ela roda como `anon` (o link nao
-- tem sessao do Supabase) e a RLS de `pedidos_artes` recusa INSERT vindo dali:
--
--      42501 -- new row violates row-level security policy for table "pedidos_artes"
--
-- LER e ATUALIZAR ela pode; CRIAR, nao. Isso esta certo e nao deve mudar: abrir
-- INSERT para `anon` daria a qualquer um com a chave publica o direito de criar
-- linhas de arte.
--
-- O QUE O CODIGO JA FAZ (v654)
-- O painel passou a criar a linha no momento em que o link do cliente e gerado
-- (`garantirLinhaDePedidoArte`, chamada por `getOrCreateLinkCliente`), que e
-- quando quem esta na tela e um usuario logado. Todo pedido que for ao cliente
-- daqui para frente ja vai com a linha pronta.
--
-- O QUE ESTE SCRIPT FAZ
-- Cobre os pedidos que JA estao com o cliente: link gerado antes da correcao,
-- linha faltando. Sem isto, esses clientes continuariam recebendo o aviso de
-- "nao conseguimos registrar sua solicitacao" ate alguem reabrir o link no
-- painel.
--
-- E seguro repetir: so insere o que falta.
-- ════════════════════════════════════════════════════════════════════════════════


-- ─── ATENCAO AO TIPO ────────────────────────────────────────────────────────────
--
-- `pedidos_artes.id_int` e INTEGER; `pedidos_links_cliente.id_int` e **TEXT**.
-- Sem o cast o Postgres recusa a comparacao:
--
--     42883 -- operator does not exist: integer = text
--
-- O frontend nao tropeca nisso porque o PostgREST converte sozinho, mas em SQL
-- puro o cast e obrigatorio. O filtro `~ '^[0-9]+$'` existe pelo mesmo motivo:
-- a coluna e texto, entao pode em tese guardar algo que nao vira numero, e o
-- cast quebraria a consulta inteira.


-- ─── 1. CONFERIR ANTES: quantos pedidos estao nessa situacao ────────────────────

SELECT COUNT(*) AS pedidos_com_link_e_sem_linha_de_arte
FROM (
    SELECT DISTINCT l.id_int
    FROM pedidos_links_cliente l
    WHERE l.id_int ~ '^[0-9]+$'
      AND NOT EXISTS (
          SELECT 1 FROM pedidos_artes a WHERE a.id_int = l.id_int::integer
      )
) AS faltando;


-- ─── 2. VER QUAIS SAO (opcional, para conferir antes de gravar) ────────────────

SELECT DISTINCT l.id_int AS pedido, l.status_arte, l.ativo, l.created_at
FROM pedidos_links_cliente l
WHERE l.id_int ~ '^[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM pedidos_artes a WHERE a.id_int = l.id_int::integer)
ORDER BY l.id_int DESC;


-- ─── 3. CRIAR AS LINHAS QUE FALTAM ─────────────────────────────────────────────
--
-- Nasce vazia de proposito: `observacoes` em `{}` e nenhum status de entrega. A
-- linha existe so para o cliente ter onde escrever. Quem preenche o resto
-- continua sendo o painel (briefing, designer, arquivos).

INSERT INTO pedidos_artes (id_int, observacoes)
SELECT DISTINCT l.id_int::integer, '{}'::jsonb
FROM pedidos_links_cliente l
WHERE l.id_int ~ '^[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM pedidos_artes a WHERE a.id_int = l.id_int::integer);


-- ─── 4. CONFERIR DEPOIS: tem de dar zero ───────────────────────────────────────

SELECT COUNT(*) AS ainda_faltando
FROM (
    SELECT DISTINCT l.id_int
    FROM pedidos_links_cliente l
    WHERE l.id_int ~ '^[0-9]+$'
      AND NOT EXISTS (SELECT 1 FROM pedidos_artes a WHERE a.id_int = l.id_int::integer)
) AS faltando;
