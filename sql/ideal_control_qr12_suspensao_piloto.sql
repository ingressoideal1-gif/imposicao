-- Complementa a suspensao para o piloto restrito por autorizacao.
-- Com corte=infinity, somente pedidos confirmados entram em v2. Desligar
-- ativo tambem deve bloquear novos contratos desses pedidos autorizados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.producao_acesso_qr_impedir_retorno_legado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE ctl public.producao_acesso_qr_controle%ROWTYPE;
BEGIN
 SELECT * INTO STRICT ctl FROM public.producao_acesso_qr_controle WHERE id=true;
 IF NEW.versao=1 AND (
  EXISTS(SELECT 1 FROM public.pedidos_modelos m WHERE m.id=NEW.modelo AND m.created_at>=ctl.corte)
  OR EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes a WHERE a.pedido=NEW.pedido)
 ) THEN
  RAISE EXCEPTION 'Novas emissoes QR12 suspensas; nao substituir o contrato pelo legado';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
