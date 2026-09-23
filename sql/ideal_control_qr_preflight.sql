-- Somente metadados, contagens e presença/formato de segredos. Nunca devolve valores.
SELECT jsonb_build_object(
 'banco', current_database(), 'postgres', current_setting('server_version'),
 'tabelas_novas', (SELECT jsonb_agg(n) FROM unnest(ARRAY[
 'producao_acesso_instalacoes','producao_acesso_auditoria_pin',
 'producao_acesso_convites_evento','producao_acesso_ativacoes_qr']) n WHERE to_regclass('public.'||n) IS NOT NULL),
 'aparelhos_existentes', (SELECT count(*) FROM public.producao_acesso_dispositivos),
 'colunas', (SELECT jsonb_agg(jsonb_build_object('tabela',table_name,'coluna',column_name,'tipo',data_type,'anulavel',is_nullable))
  FROM information_schema.columns WHERE table_schema='public' AND
  ((table_name='producao_acesso_dispositivos' AND column_name IN ('codigo_hash','navegador_id','instalacao_id','empresa_id','token_hash')) OR
   (table_name='producao_acesso_eventos' AND column_name IN ('empresa_id','nome_evento','status')))),
 'funcoes_existentes', (SELECT jsonb_agg(p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('producao_acesso_ativar_qr_evento','producao_acesso_conferir_pin','producao_acesso_zerar_entradas')),
 'segredos', (SELECT jsonb_agg(jsonb_build_object('nome',nome,'presente',true,'formato_valido',
   CASE WHEN nome='IDEAL_CONTROL_PIN_CHAVE' THEN valor ~ '^[a-fA-F0-9]{64}$' ELSE length(valor)>0 END))
   FROM public.imposition_segredos WHERE nome IN ('IDEAL_CONTROL_PIN_CHAVE','ACESSO_ELEVACAO_SEGREDO')),
 'segredos_rls', (SELECT relrowsecurity FROM pg_class WHERE oid='public.imposition_segredos'::regclass),
 'segredos_policies', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='imposition_segredos'),
 'segredos_anon_select', has_table_privilege('anon','public.imposition_segredos','SELECT'),
 'segredos_authenticated_select', has_table_privilege('authenticated','public.imposition_segredos','SELECT')
) AS verificacao;
