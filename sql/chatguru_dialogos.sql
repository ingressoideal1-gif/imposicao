-- Aditivo. Preserva mensagens e reservas anteriores. Aplicar antes da API.
BEGIN;
ALTER TABLE public.imposition_whatsapp_artes
  ADD COLUMN dialogo_id text,
  ADD COLUMN dialogo_executado boolean NOT NULL DEFAULT false;
CREATE TABLE public.imposition_whatsapp_conversas (
  destino_chave text PRIMARY KEY CHECK (destino_chave ~ '^[a-f0-9]{64}$'),
  chave_envio text REFERENCES public.imposition_whatsapp_artes(chave),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.imposition_whatsapp_conversas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_whatsapp_conversas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.imposition_whatsapp_conversas TO service_role;

CREATE FUNCTION public.imposition_whatsapp_dialogo_reservar(
 p_chave text, p_destino text, p_os_id text, p_autor uuid, p_dialogo text, p_repetir boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ocupado text; atual public.imposition_whatsapp_artes;
BEGIN
 INSERT INTO public.imposition_whatsapp_conversas(destino_chave) VALUES(p_destino) ON CONFLICT DO NOTHING;
 SELECT chave_envio INTO ocupado FROM public.imposition_whatsapp_conversas WHERE destino_chave=p_destino FOR UPDATE;
 IF ocupado IS NOT NULL THEN RETURN 'ocupado'; END IF;
 SELECT * INTO atual FROM public.imposition_whatsapp_artes WHERE chave=p_chave FOR UPDATE;
 IF FOUND THEN
   IF NOT p_repetir OR atual.estado<>'falhou' OR atual.message_id IS NOT NULL OR atual.dialogo_executado OR atual.os_id<>p_os_id THEN RETURN 'existente'; END IF;
   UPDATE public.imposition_whatsapp_artes SET estado='preparando', autor=p_autor,
     dialogo_id=p_dialogo, atualizado_em=now(), tentativas=tentativas+1 WHERE chave=p_chave;
 ELSE
   INSERT INTO public.imposition_whatsapp_artes(chave,os_id,autor,dialogo_id) VALUES(p_chave,p_os_id,p_autor,p_dialogo)
     ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RETURN 'existente'; END IF;
 END IF;
 UPDATE public.imposition_whatsapp_conversas SET chave_envio=p_chave, atualizado_em=now() WHERE destino_chave=p_destino;
 RETURN 'reservado';
END;
$$;

CREATE FUNCTION public.imposition_whatsapp_dialogo_finalizar(p_chave text,p_destino text,p_estado text)
RETURNS SETOF public.imposition_whatsapp_artes LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ocupado text;
BEGIN
 IF p_estado NOT IN ('aguardando','falhou','desconhecido') THEN RAISE EXCEPTION 'Estado invalido'; END IF;
 SELECT chave_envio INTO ocupado FROM public.imposition_whatsapp_conversas WHERE destino_chave=p_destino FOR UPDATE;
 IF ocupado IS DISTINCT FROM p_chave THEN RAISE EXCEPTION 'Reserva da conversa nao confirmada'; END IF;
 RETURN QUERY UPDATE public.imposition_whatsapp_artes SET estado=p_estado,
   dialogo_executado=(p_estado='aguardando'), atualizado_em=now()
   WHERE chave=p_chave AND estado='preparando' AND message_id IS NULL AND dialogo_id IS NOT NULL RETURNING *;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro do dialogo nao confirmado'; END IF;
 -- Incerteza não libera a conversa: confirmar no CRM antes de reconciliar.
 IF p_estado<>'desconhecido' THEN
   UPDATE public.imposition_whatsapp_conversas SET chave_envio=NULL, atualizado_em=now() WHERE destino_chave=p_destino;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_whatsapp_dialogo_reservar(text,text,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.imposition_whatsapp_dialogo_finalizar(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.imposition_whatsapp_dialogo_reservar(text,text,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.imposition_whatsapp_dialogo_finalizar(text,text,text) TO service_role;
COMMIT;
