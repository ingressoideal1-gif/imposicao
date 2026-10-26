-- Aplicar isoladamente, depois de guardar pg_get_functiondef e ACL atuais.
-- Nenhum registro de pedido é alterado; preserva o corpo atual e suas permissões.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $migration$
DECLARE
  assinatura text;
  alvo regprocedure;
  definicao text;
  corrigida text;
  padrao text := '(ERRCODE[[:space:]]*=[[:space:]]*)''40001''';
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.idgen_editor_operar(uuid,text,jsonb)',
    'public.idgen_cliente_operar(uuid,text,jsonb)',
    'public.idgen_liberar_projeto(uuid,bigint,text,bigint[],uuid)',
    'public.idgen_pedido_salvo(uuid,text,jsonb)',
    'public.idgen_rascunho_dados(uuid,uuid,integer,jsonb,integer)',
    'public.idgen_templates_admin(uuid,text,uuid,uuid,bigint,integer)'
  ] LOOP
    alvo := to_regprocedure(assinatura);
    -- Instalações parciais podem não ter todos os módulos do portal.
    IF alvo IS NULL THEN CONTINUE; END IF;
    SELECT pg_get_functiondef(alvo) INTO definicao;
    corrigida := regexp_replace(definicao, padrao, E'\\1''PT409''', 'g');
    IF strpos(corrigida, '40001') > 0 THEN
      RAISE EXCEPTION 'Uso inesperado de 40001 em %; revisar antes de aplicar', assinatura;
    END IF;
    IF corrigida <> definicao THEN EXECUTE corrigida; END IF;
    IF pg_get_functiondef(alvo) IS DISTINCT FROM corrigida THEN
      RAISE EXCEPTION 'Não foi possível confirmar a correção de %', assinatura;
    END IF;
  END LOOP;
END $migration$;
COMMIT;
