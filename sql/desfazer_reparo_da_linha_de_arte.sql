-- ════════════════════════════════════════════════════════════════════════════════
-- SQL: DESFAZER o reparo de 20/08/2026 que encheu a Lista de Arte
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECEU
-- `correcao_do_cliente_precisa_de_linha.sql` criou linha em `pedidos_artes` para
-- todo pedido que ja tinha link do cliente e nao tinha linha -- 12 pedidos, as
-- 13:23:18 de 20/08/2026. A intencao era dar ao cliente onde escrever a
-- solicitacao de alteracao de nota fiscal e entrega.
--
-- O QUE ESCAPOU
-- Na Lista de Arte, em producao, **ter linha em `pedidos_artes` E o que faz o
-- pedido aparecer**. O filtro esta no `loadOrdensFromVibecode`:
--
--     const existeArtes = (state.todasArtes || []).some(a => a.id_int === key);
--     if (!existeComercial && !existeArtes) return;   // ignora este pedido
--
-- Ou seja: criar a linha de um pedido de meses atras o traz de volta para a
-- Lista de Arte. Os 12 pedidos reapareceram na tela do dia seguinte -- 7 deles
-- do cliente de teste 14 (Edison Santos De Farias Junior), 5 de clientes reais
-- com pedidos de 17xxx/18xxx, ja resolvidos ha meses.
--
-- A LICAO, PARA NAO REPETIR
-- `pedidos_artes` nao e so "onde o cliente escreve": a existencia da linha e
-- **sinal de que o pedido esta na arte**. Criar linha em lote, para pedidos
-- antigos, e reabrir trabalho encerrado.
--
-- O que continua valendo, e e suficiente: `garantirLinhaDePedidoArte`, no
-- painel, cria a linha no momento em que o link do cliente e gerado. Ali o
-- pedido ESTA na arte -- e por isso a linha nao muda nada na lista.
--
-- ── CUIDADO COM O `IS NULL` (a primeira versao deste arquivo errou aqui) ──────
--
-- `arquivos` tem DEFAULT `'[]'` e `observacoes` tem DEFAULT `'{}'`. Linha recem
-- criada NAO tem NULL nessas duas colunas -- tem a lista e o objeto vazios. A
-- primeira versao filtrava por `arquivos IS NULL`, nao casou com nada, e o
-- DELETE apagou zero linhas **sem erro nenhum**. E a mesma armadilha do dia:
-- comando que nao pega linha nenhuma nao reclama. Por isso o DELETE abaixo tem
-- `RETURNING`: ele mostra na tela o que apagou, e lista vazia quer dizer que
-- nada foi feito.
-- ════════════════════════════════════════════════════════════════════════════════


-- ─── 1. CONFERIR: o que o reparo criou e continua sem uso ──────────────────────
--
-- A janela e o segundo exato da gravacao em lote (13:23:18). O pedido 20975,
-- criado pelo painel as 13:23:41, fica fora dela de propriedade -- e tambem
-- seria barrado pelas condicoes de conteudo, que existem para o caso de alguem
-- ja ter usado alguma dessas linhas.

SELECT id_int, created_at, status, observacoes, arquivos
FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:18Z'
  AND created_at <  '2026-08-20T13:23:19Z'
  AND COALESCE(observacoes::text, '{}') = '{}'
  AND COALESCE(arquivos::text, '[]')    = '[]'
  AND nome_evento    IS NULL
  AND data_evento    IS NULL
  AND local_evento   IS NULL
  AND designer_uid   IS NULL
  AND designer_nome  IS NULL
  AND entrega_dados  IS NULL
  AND nome_arquivo   IS NULL
  AND storage_path   IS NULL
ORDER BY id_int;


-- ─── 2. APAGAR (o RETURNING mostra exatamente o que saiu) ──────────────────────

DELETE FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:18Z'
  AND created_at <  '2026-08-20T13:23:19Z'
  AND COALESCE(observacoes::text, '{}') = '{}'
  AND COALESCE(arquivos::text, '[]')    = '[]'
  AND nome_evento    IS NULL
  AND data_evento    IS NULL
  AND local_evento   IS NULL
  AND designer_uid   IS NULL
  AND designer_nome  IS NULL
  AND entrega_dados  IS NULL
  AND nome_arquivo   IS NULL
  AND storage_path   IS NULL
RETURNING id_int;


-- ─── 3. CONFERIR DEPOIS: tem de dar zero ───────────────────────────────────────

SELECT COUNT(*) AS sobraram_do_reparo
FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:18Z'
  AND created_at <  '2026-08-20T13:23:19Z';
