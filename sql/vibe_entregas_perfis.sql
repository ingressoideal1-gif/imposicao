-- Reutiliza perfis ERP e permissoes Imposition; nao altera cadastros.
BEGIN;
CREATE FUNCTION public.ve_entregas_permissoes() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH direitos AS (
  SELECT coalesce(bool_or((role='admin' AND perm_admin_view IS TRUE) OR role IN ('financeiro','expedicao','expedidor','atendimento')),false) AS consultar,
    coalesce(bool_or((role='admin' AND perm_admin_view IS TRUE AND perm_admin_edit IS TRUE) OR role IN ('financeiro','expedicao','expedidor')),false) AS editar
  FROM imposition_user_permissions WHERE user_id=auth.uid()
 ), erp AS (
  SELECT coalesce(bool_or(p.ativo AND lower(p.slug) IN ('admin','super_admin','financeiro','expedidor')),false) AS editar
  FROM usuarios u JOIN perfis p ON p.id=u.id_perfil WHERE u.user_id=auth.uid()
 )
 SELECT jsonb_build_object('consultar',auth.uid() IS NOT NULL AND (d.consultar OR e.editar),'editar',auth.uid() IS NOT NULL AND (d.editar OR e.editar) AND NOT EXISTS(SELECT 1 FROM imposition_user_permissions WHERE user_id=auth.uid() AND role='atendimento')) FROM direitos d CROSS JOIN erp e;
$$;
REVOKE ALL ON FUNCTION public.ve_entregas_permissoes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_entregas_permissoes() TO authenticated;
CREATE OR REPLACE FUNCTION public.ve_e_gestor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (ve_entregas_permissoes()->>'consultar')::boolean;
$$;
CREATE OR REPLACE FUNCTION public.ve_admin_edita() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (ve_entregas_permissoes()->>'editar')::boolean;
$$;
COMMIT;
