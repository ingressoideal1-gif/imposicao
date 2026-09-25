-- Somente metadados. Nao le pedidos, clientes ou tokens e nao altera o banco.
-- Alvo: producao, projeto vwbtitjlpelrcnsytzqw.
-- Usar pela API de gerenciamento com uma credencial administrativa autorizada.
WITH gatilhos AS (
    SELECT c.relname AS tabela,
           t.tgname AS gatilho,
           pg_get_triggerdef(t.oid) AS definicao,
           n.nspname || '.' || p.proname AS funcao,
           p.prosecdef AS security_definer,
           p.proowner::regrole::text AS proprietario,
           p.prosrc ILIKE '%propostas%' AS menciona_propostas
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace cn ON cn.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE cn.nspname = 'public'
       AND c.relname IN ('pedidos_modelos', 'pedidos_artes',
                         'propostas_chat', 'pedidos_links_cliente')
       AND NOT t.tgisinternal
), permissoes AS (
    SELECT nome,
           has_table_privilege('anon', format('public.%I', nome), 'SELECT') AS anon_select,
           has_table_privilege('anon', format('public.%I', nome), 'UPDATE') AS anon_update,
           has_table_privilege('authenticated', format('public.%I', nome), 'UPDATE') AS autenticado_update
      FROM (VALUES ('propostas'), ('pedidos_modelos'), ('pedidos_artes'),
                   ('propostas_chat')) AS tabelas(nome)
)
SELECT jsonb_pretty(jsonb_build_object(
    'gatilhos', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.tabela, g.gatilho) FROM gatilhos g),
    'permissoes', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.nome) FROM permissoes a)
)) AS diagnostico;
