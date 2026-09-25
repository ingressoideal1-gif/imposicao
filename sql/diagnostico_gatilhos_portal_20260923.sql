-- Somente metadados; nenhuma linha de pedido e consultada.
SELECT c.relname AS tabela, t.tgname AS gatilho,
       p.proname AS funcao, p.proowner::regrole::text AS proprietario,
       p.prosecdef AS security_definer,
       p.prosrc ILIKE '%propostas%' AS menciona_propostas
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE n.nspname = 'public'
   AND c.relname IN ('pedidos_modelos', 'pedidos_artes',
                     'propostas_chat', 'propostas')
   AND NOT t.tgisinternal
 ORDER BY c.relname, t.tgname;
