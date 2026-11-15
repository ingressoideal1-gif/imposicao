-- Liberação geral autorizada: pedidos atuais e futuros, sem criar eventos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.ideal_control_portal_config
 ADD COLUMN todos_pedidos boolean NOT NULL DEFAULT false;
DO $migration$
DECLARE portal text; qr text; antigo text; novo text;
BEGIN
 SELECT replace(prosrc,chr(13),'') INTO portal FROM pg_proc
 WHERE oid='public.ideal_control_portal(text,text,boolean)'::regprocedure;
 SELECT replace(prosrc,chr(13),'') INTO qr FROM pg_proc
 WHERE oid='public.ideal_control_portal_reservar_qr(integer)'::regprocedure;
 IF md5(portal)<>'c764e6a60c0a7180025b135b439c68f8'
 OR md5(qr)<>'7dc832ce85269935a7dcd7332afa7bd4' THEN
  RAISE EXCEPTION 'Definicoes mudaram: revisar liberacao geral';
 END IF;
 antigo:=replace($old$    PERFORM 1 FROM public.ideal_control_portal_pedidos
        WHERE pedido_id_int=v_pedido AND habilitado FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('disponivel',false); END IF;$old$,chr(13),'');
 novo:=replace($new$    IF NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_config WHERE id AND todos_pedidos) THEN
        PERFORM 1 FROM public.ideal_control_portal_pedidos
            WHERE pedido_id_int=v_pedido AND habilitado FOR SHARE;
        IF NOT FOUND THEN RETURN jsonb_build_object('disponivel',false); END IF;
    END IF;$new$,chr(13),'');
 IF position(antigo in portal)=0 THEN RAISE EXCEPTION 'Regra de piloto nao localizada'; END IF;
 portal:=replace(portal,antigo,novo);
 antigo:='OR NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_pedidos WHERE pedido_id_int=p_pedido AND habilitado)';
 novo:='OR (NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_config WHERE id AND todos_pedidos) AND NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_pedidos WHERE pedido_id_int=p_pedido AND habilitado))';
 IF position(antigo in qr)=0 THEN RAISE EXCEPTION 'Regra da reserva nao localizada'; END IF;
 qr:=replace(qr,antigo,novo);
 EXECUTE format('CREATE OR REPLACE FUNCTION public.ideal_control_portal(p_numero text,p_token text,p_criar boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS %L',portal);
 EXECUTE format('CREATE OR REPLACE FUNCTION public.ideal_control_portal_reservar_qr(p_pedido integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS %L',qr);
END $migration$;
UPDATE public.ideal_control_portal_config SET habilitado=true,todos_pedidos=true WHERE id=true;
COMMENT ON COLUMN public.ideal_control_portal_config.todos_pedidos IS
 'Libera pedidos atuais e futuros. false retorna a allowlist; habilitado=false desliga toda a aba sem afetar o PWA.';
COMMIT;
