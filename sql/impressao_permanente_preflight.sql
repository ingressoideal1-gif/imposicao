-- SOMENTE LEITURA. Capturar resultado antes de autorizar a migracao.
SELECT current_database() AS banco, current_user AS executor;
SELECT count(*) AS modelos,
       count(*) FILTER (WHERE upper(btrim(coalesce(status_impressao,'')))='IMPRESSO') AS impressos,
       count(*) FILTER (WHERE upper(btrim(coalesce(status_impressao,'')))='IMPRESSO'
                         AND status_impressao_em IS NULL) AS impressos_sem_hora,
       count(*) FILTER (WHERE upper(btrim(coalesce(status_impressao,'')))<>'IMPRESSO'
                         AND status_impressao_em IS NOT NULL) AS evidencia_legada
FROM public.pedidos_modelos;

-- Guardar definicoes para comparacao, ordem dos gatilhos e eventual recuperacao.
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS gatilho,
       pg_get_functiondef(t.tgfoid) AS funcao,
       md5(pg_get_functiondef(t.tgfoid)) AS hash_funcao
FROM pg_trigger t
WHERE t.tgrelid='public.pedidos_modelos'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Chaves estrangeiras com cascata: exclusoes que alcancem impressos serao recusadas.
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype='f' AND (conrelid='public.pedidos_modelos'::regclass
                   OR confrelid='public.pedidos_modelos'::regclass);

SELECT id,id_int,status_impressao,status_impressao_em,status_impressao_registrado_em,
       acabamento_status,acabamento_pronto_em
FROM public.pedidos_modelos WHERE id_int=23997 ORDER BY id;
