BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT jsonb_build_object(
  'extensoes', (SELECT jsonb_agg(jsonb_build_object('nome',extname,'versao',extversion)) FROM pg_extension WHERE extname='pg_cron'),
  'funcoes', (SELECT jsonb_agg(jsonb_build_object('nome',p.proname,'argumentos',pg_get_function_identity_arguments(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='cron' AND p.proname IN ('schedule','unschedule'))
) AS agendador;
COMMIT;
