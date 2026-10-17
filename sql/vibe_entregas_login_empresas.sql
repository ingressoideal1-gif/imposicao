-- Login tradicional preservado. Sincroniza o escopo geral autorizado para o proprio entregador.
BEGIN;
CREATE FUNCTION public.ve_entregador_autorizar() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.ve_pin_conta_ativa(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.ve_entregador_autorizar() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_entregador_autorizar() TO authenticated;
COMMIT;
