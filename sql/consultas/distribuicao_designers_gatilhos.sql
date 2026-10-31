-- Revisão somente leitura de código de gatilhos, sem linhas comerciais.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
WITH gatilhos AS (
    SELECT t.oid,t.tgfoid,t.tgenabled,c.relname AS tabela,t.tgname AS nome
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
      AND c.relname IN ('pedidos_artes','pedidos_modelos','produtos_proposta',
                       'propostas','pedidos_links_cliente','usuarios')
), funcoes AS (
    SELECT DISTINCT p.oid,n.nspname,p.proname,p.prosrc,p.prosecdef
    FROM gatilhos t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
)
SELECT jsonb_build_object(
    'gatilhos',(SELECT jsonb_agg(jsonb_build_object('tabela',tabela,'nome',nome,
        'ativo',tgenabled,'ddl',pg_get_triggerdef(oid,true)) ORDER BY tabela,nome) FROM gatilhos),
    'funcoes',(SELECT jsonb_agg(jsonb_build_object('nome',nspname||'.'||proname,
        'hash',md5(pg_get_functiondef(oid)),'security_definer',prosecdef,
        'fonte',CASE WHEN prosrc ~* '(https?://|bearer[[:space:]]|password[[:space:]]*[:=]|sbp_|eyJ)'
                    THEN NULL ELSE pg_get_functiondef(oid) END)) FROM funcoes)
) AS revisao;
COMMIT;
