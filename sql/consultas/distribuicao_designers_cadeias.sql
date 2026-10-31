BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'gatilhos_pagamentos',(SELECT jsonb_agg(jsonb_build_object('tabela',c.relname,'ddl',pg_get_triggerdef(t.oid,true),
   'funcao',n.nspname||'.'||p.proname,'fonte',CASE WHEN p.prosrc ~* '(https?://|bearer[[:space:]]|password[[:space:]]*[:=]|sbp_|eyJ)'
    THEN NULL ELSE pg_get_functiondef(p.oid) END))
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
   JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal AND c.relname IN ('pagamentos','pagamentos_v2')),
 'calculador',(SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='imposition_card_arte_calcular' LIMIT 1),
 'classificador',(SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='imposition_card_arte_ler' LIMIT 1)
) AS cadeias;
COMMIT;
