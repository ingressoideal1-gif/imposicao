-- Preparacao local: reconhecimento de ADM para a interface Fretes.
-- Nao altera cadastros nem politicas da tabela transportadoras.
BEGIN;
CREATE FUNCTION public.imposition_fretes_adm() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND (
   EXISTS(SELECT 1 FROM imposition_user_permissions WHERE user_id=auth.uid() AND role='admin')
   OR EXISTS(SELECT 1 FROM usuarios u JOIN perfis p ON p.id=u.id_perfil
     WHERE u.user_id=auth.uid() AND p.ativo AND lower(p.slug) IN ('admin','super_admin'))
 );
$$;
REVOKE ALL ON FUNCTION public.imposition_fretes_adm() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.imposition_fretes_adm() TO authenticated;
COMMIT;
