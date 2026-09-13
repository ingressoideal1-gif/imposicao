-- Prévia somente leitura da migração status_consolidado_pedidos_artes.sql.
WITH entrega AS (
    SELECT id_int,
           bool_or(upper(btrim(coalesce(entrega_dados, ''))) = 'CORRIGIR') AS corrigir,
           bool_or(upper(btrim(coalesce(entrega_dados, ''))) = 'APROVADO') AS aprovada
      FROM public.pedidos_artes GROUP BY id_int
), modelos AS (
    SELECT id_int, count(*) AS total,
           count(*) FILTER (WHERE upper(btrim(coalesce(status_arte, ''))) IN (
               'APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'
           )) AS aprovadas,
           bool_or(upper(btrim(coalesce(status_arte, ''))) IN (
               'REPROVADO', 'REPROVADA', 'REPROVADA_CLIENTE', 'EM ALTERAÇÃO', 'EM ALTERACAO', 'ARTE_EM_CORRECAO'
           )) AS em_alteracao
      FROM public.pedidos_modelos GROUP BY id_int
), destino AS (
    SELECT a.id,
           CASE
             WHEN coalesce(e.corrigir, false) THEN 'Corrigir Dados'
             WHEN upper(btrim(coalesce(a.status, ''))) IN ('APROVADO PARCIAL', 'APR PARCIAL') THEN 'Apr Parcial'
             WHEN coalesce(m.em_alteracao, false) THEN 'Em Alteração'
             WHEN coalesce(m.total, 0) > 0 AND m.aprovadas = m.total
               THEN CASE WHEN coalesce(e.aprovada, false) THEN 'APROVADO' ELSE 'Dados Pendentes' END
             WHEN coalesce(m.aprovadas, 0) > 0 THEN 'Apr Parcial'
             WHEN upper(btrim(coalesce(a.status, ''))) = 'AGUARDANDO_APROVACAO' THEN 'Em Aprovação'
             WHEN upper(btrim(coalesce(a.status, ''))) IN (
                 'APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'
             ) THEN CASE WHEN coalesce(e.aprovada, false) THEN 'APROVADO' ELSE 'Dados Pendentes' END
             ELSE a.status
           END AS status_novo
      FROM public.pedidos_artes a
      LEFT JOIN entrega e ON e.id_int = a.id_int
      LEFT JOIN modelos m ON m.id_int = a.id_int
)
SELECT a.status AS status_anterior, d.status_novo, count(*) AS registros
  FROM public.pedidos_artes a
  JOIN destino d ON d.id = a.id
 WHERE a.status IS DISTINCT FROM d.status_novo
 GROUP BY a.status, d.status_novo
 ORDER BY registros DESC, status_anterior, status_novo;
