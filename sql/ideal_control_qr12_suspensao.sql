-- Aplicar apos ideal_control_qr12.sql. Nao modifica contratos existentes.
-- Depois do corte, suspender v2 deve bloquear novas reservas elegiveis,
-- sem voltar silenciosamente ao legado de 13 caracteres.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.producao_acesso_qr_impedir_retorno_legado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE ctl public.producao_acesso_qr_controle%ROWTYPE;
BEGIN
 SELECT * INTO STRICT ctl FROM public.producao_acesso_qr_controle WHERE id=true;
 IF NEW.versao=1 AND ctl.corte<>'infinity'::timestamptz AND (
  EXISTS(SELECT 1 FROM public.pedidos_modelos m WHERE m.id=NEW.modelo AND m.created_at>=ctl.corte)
  OR EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes a WHERE a.pedido=NEW.pedido)
 ) THEN
  RAISE EXCEPTION 'Novas emissoes QR12 suspensas; nao substituir o contrato pelo legado';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.producao_acesso_qr_impedir_retorno_legado() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_qr_impedir_retorno_legado() TO service_role;
CREATE TRIGGER producao_acesso_qr_impedir_retorno_legado
 BEFORE INSERT ON public.producao_acesso_qr_contratos
 FOR EACH ROW EXECUTE FUNCTION public.producao_acesso_qr_impedir_retorno_legado();
COMMIT;
