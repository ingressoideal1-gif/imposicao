-- Prévia somente leitura, agregada: não retorna nomes, usuários ou pedidos.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT jsonb_build_object(
 'designers_por_empresa', (SELECT jsonb_agg(to_jsonb(d)) FROM (
    SELECT id_empresa,count(*) AS quantidade FROM public.usuarios
    WHERE lower(setor) LIKE '%designer%' GROUP BY id_empresa
 ) d),
 'pedidos_com_arte_por_empresa_do_criador', (SELECT jsonb_agg(to_jsonb(p)) FROM (
    SELECT u.id_empresa,count(DISTINCT p.id_int) AS pedidos
    FROM public.propostas p LEFT JOIN public.usuarios u ON u.user_id=p.user_id
    WHERE EXISTS(SELECT 1 FROM public.pedidos_artes a WHERE a.id_int=p.id_int)
    GROUP BY u.id_empresa
 ) p),
 'desencontro_empresa', (SELECT count(DISTINCT p.id_int) FROM public.propostas p
    JOIN public.usuarios autor ON autor.user_id=p.user_id
    JOIN public.pedidos_artes a ON a.id_int=p.id_int
    JOIN public.usuarios designer ON designer.user_id=a.designer_uid
    WHERE autor.id_empresa IS DISTINCT FROM designer.id_empresa),
 'politicas', (SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT tablename,cmd,roles::text,
      coalesce(qual,'') ~ 'auth.uid|user_id' AS filtra_usuario,
      coalesce(qual,'') ~ 'empresa|tenant' AS filtra_empresa
    FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('usuarios','propostas','pedidos_artes','pedidos_modelos')
 ) r)
) AS escopo;
COMMIT;
