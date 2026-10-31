BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'gatilhos_catalogo',(SELECT jsonb_agg(jsonb_build_object('tabela',c.relname,'nome',t.tgname,
    'ddl',pg_get_triggerdef(t.oid,true),'funcao',p.proname))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal
    AND c.relname='producao_numeracoes'),
 'funcoes',(SELECT jsonb_agg(jsonb_build_object('nome',n.nspname||'.'||p.proname,
    'hash',md5(pg_get_functiondef(p.oid)),
    'fonte',CASE WHEN p.prosrc ~* '(https?://|bearer[[:space:]]|password[[:space:]]*[:=]|sbp_|eyJ)'
      THEN NULL ELSE pg_get_functiondef(p.oid) END))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND (p.proname IN ('recalcular_status_arte_briefing','check_and_promote_proposta',
       'recalcular_proposta_v4','atualizar_status_financeiro_proposta','imposition_etapa_arte_registrar',
       'piloto_marcar_pedidos_v2') OR p.proname LIKE 'imposition_etapa_arte_%'
       OR p.proname LIKE 'imposition_numeracao_%20261006'))
) AS dependencias;
COMMIT;
