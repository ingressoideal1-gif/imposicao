-- Executar depois de link_cliente_pagamento_vibe.sql, no mesmo projeto Supabase.
-- Somente metadados: não mostra chaves, tokens, URLs nem dados de pedidos.
-- Resultado esperado: todas as linhas com resultado = OK.
WITH objetos AS (
    SELECT to_regclass('public.pedidos_links_pagamento_vibe') AS tabela,
           to_regprocedure('public.reservar_link_pagamento_vibe(text,text)') AS reservar,
           to_regprocedure('public.concluir_link_pagamento_vibe(text,uuid,text,text)') AS concluir
), verificacoes AS (
    SELECT v.verificacao, coalesce(v.ok, false) AS ok
    FROM objetos o
    CROSS JOIN LATERAL (VALUES
        ('Tabela criada', o.tabela IS NOT NULL),
        ('RLS habilitada', (SELECT relrowsecurity FROM pg_class WHERE oid = o.tabela)),
        ('Chave primária por número do pedido', EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_attribute a
              ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.conrelid = o.tabela AND c.contype = 'p'
               AND array_length(c.conkey, 1) = 1 AND a.attname = 'numero_pedido'
        )),
        ('Tabela inacessível a anon', o.tabela IS NOT NULL AND
            NOT has_table_privilege('anon', o.tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND
            NOT has_any_column_privilege('anon', o.tabela, 'SELECT,INSERT,UPDATE,REFERENCES')),
        ('Tabela inacessível a authenticated', o.tabela IS NOT NULL AND
            NOT has_table_privilege('authenticated', o.tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND
            NOT has_any_column_privilege('authenticated', o.tabela, 'SELECT,INSERT,UPDATE,REFERENCES')),
        ('Servidor pode reler cache', has_table_privilege('service_role', o.tabela, 'SELECT')),
        ('RPC reservar criada', o.reservar IS NOT NULL),
        ('RPC concluir criada', o.concluir IS NOT NULL),
        ('RPCs usam SECURITY DEFINER',
            (SELECT prosecdef FROM pg_proc WHERE oid = o.reservar) AND
            (SELECT prosecdef FROM pg_proc WHERE oid = o.concluir)),
        ('RPCs com search_path fixo',
            (SELECT 'search_path=pg_catalog, public' = ANY(proconfig) FROM pg_proc WHERE oid = o.reservar) AND
            (SELECT 'search_path=pg_catalog, public' = ANY(proconfig) FROM pg_proc WHERE oid = o.concluir)),
        ('RPCs inacessíveis a anon',
            NOT has_function_privilege('anon', o.reservar, 'EXECUTE') AND
            NOT has_function_privilege('anon', o.concluir, 'EXECUTE')),
        ('RPCs inacessíveis a authenticated',
            NOT has_function_privilege('authenticated', o.reservar, 'EXECUTE') AND
            NOT has_function_privilege('authenticated', o.concluir, 'EXECUTE')),
        ('Servidor pode executar as RPCs',
            has_function_privilege('service_role', o.reservar, 'EXECUTE') AND
            has_function_privilege('service_role', o.concluir, 'EXECUTE'))
    ) AS v(verificacao, ok)
)
SELECT verificacao, CASE WHEN ok THEN 'OK' ELSE 'CONFERIR' END AS resultado
FROM verificacoes;
