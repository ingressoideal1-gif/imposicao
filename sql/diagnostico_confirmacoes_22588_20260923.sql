-- Somente leitura. Retorna apenas estados de confirmacao do pedido informado
-- pelo usuario; nao exibe nome, endereco, documento, observacoes nem token.
WITH ultima AS (
    SELECT entrega_dados, observacoes->'confirmacoes_portal' AS decisoes
    FROM public.pedidos_artes
    WHERE id_int = 22588
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1
)
SELECT EXISTS (SELECT 1 FROM ultima) AS registro_existe,
       coalesce((SELECT decisoes->'faturamento' = 'true'::jsonb FROM ultima), false)
           AS nota_confirmada,
       coalesce((SELECT decisoes->'entrega' = 'true'::jsonb FROM ultima), false)
           AS entrega_confirmada,
       coalesce((SELECT decisoes->'finalizado' = 'true'::jsonb FROM ultima), false)
           AS pedido_finalizado;
