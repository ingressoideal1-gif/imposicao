-- Verificação sem dados pessoais e sem revelar valores de segredos.
SELECT jsonb_build_object(
 'tabelas', (SELECT jsonb_agg(jsonb_build_object(
   'nome',c.relname,'rls',c.relrowsecurity,
   'anon_sem_acesso',NOT (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE')),
   'authenticated_sem_acesso',NOT (has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')),
   'service_role_select',has_table_privilege('service_role',c.oid,'SELECT')))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
   ('producao_acesso_instalacoes','producao_acesso_convites_evento','producao_acesso_ativacoes_qr','producao_acesso_auditoria_pin')),
 'funcoes', (SELECT jsonb_agg(jsonb_build_object('nome',p.oid::regprocedure::text,
   'security_invoker',NOT p.prosecdef,
   'anon_sem_execucao',NOT has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_sem_execucao',NOT has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_role_executa',has_function_privilege('service_role',p.oid,'EXECUTE')))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
   ('producao_acesso_conferir_pin','producao_acesso_ativar_qr_evento')),
 'aparelhos', (SELECT jsonb_build_object('total',count(*),'sem_vinculo_novo',count(*) FILTER(WHERE instalacao_id IS NULL)) FROM public.producao_acesso_dispositivos),
 'indice_valido', (SELECT indisvalid AND indisunique FROM pg_index WHERE indexrelid='public.producao_acesso_um_aparelho_por_instalacao_evento'::regclass),
 'instalacoes', (SELECT count(*) FROM public.producao_acesso_instalacoes),
 'convites', (SELECT count(*) FROM public.producao_acesso_convites_evento),
 'ativacoes', (SELECT count(*) FROM public.producao_acesso_ativacoes_qr),
 'auditoria', (SELECT count(*) FROM public.producao_acesso_auditoria_pin),
 'chave_pin_configurada', (SELECT count(*)=1 AND bool_and(valor ~ '^[a-fA-F0-9]{64}$') FROM public.imposition_segredos WHERE nome='IDEAL_CONTROL_PIN_CHAVE'),
 'elevacao_configurada', EXISTS(SELECT 1 FROM public.imposition_segredos WHERE nome='ACESSO_ELEVACAO_SEGREDO' AND length(valor)>0),
 'segredos_protegidos', (SELECT relrowsecurity FROM pg_class WHERE oid='public.imposition_segredos'::regclass)
   AND NOT has_table_privilege('anon','public.imposition_segredos','SELECT')
   AND NOT has_table_privilege('authenticated','public.imposition_segredos','SELECT'),
 'schema_de_teste_ausente', to_regnamespace('validacao_ic_20260922_qr') IS NULL
) AS verificacao;
