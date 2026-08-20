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
-- ════════════════════════════════════════════════════════════════════════════════


-- ─── 1. CONFERIR: o que o reparo criou e continua vazio ────────────────────────
--
-- So linhas que nasceram naquele instante E continuam sem nada escrito. Se
-- alguem ja usou a linha (briefing, designer, arquivo, correcao do cliente),
-- ela NAO entra aqui -- o dado de agora vale mais que a limpeza.

SELECT id_int, created_at, observacoes, status
FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:00Z'
  AND created_at <  '2026-08-20T13:24:00Z'
  AND observacoes = '{}'::jsonb
  AND nome_evento IS NULL
  AND data_evento IS NULL
  AND local_evento IS NULL
  AND designer_uid IS NULL
  AND designer_nome IS NULL
  AND arquivos IS NULL
  AND entrega_dados IS NULL
  AND nome_arquivo IS NULL
  AND storage_path IS NULL
ORDER BY id_int;


-- ─── 2. APAGAR ─────────────────────────────────────────────────────────────────

DELETE FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:00Z'
  AND created_at <  '2026-08-20T13:24:00Z'
  AND observacoes = '{}'::jsonb
  AND nome_evento IS NULL
  AND data_evento IS NULL
  AND local_evento IS NULL
  AND designer_uid IS NULL
  AND designer_nome IS NULL
  AND arquivos IS NULL
  AND entrega_dados IS NULL
  AND nome_arquivo IS NULL
  AND storage_path IS NULL;


-- ─── 3. CONFERIR DEPOIS: tem de dar zero ───────────────────────────────────────

SELECT COUNT(*) AS sobraram_do_reparo
FROM pedidos_artes
WHERE created_at >= '2026-08-20T13:23:00Z'
  AND created_at <  '2026-08-20T13:24:00Z'
  AND observacoes = '{}'::jsonb;
