-- Preparado localmente. Aplicar antes da API; nenhuma alteração comercial.
BEGIN;
CREATE TABLE public.imposition_whatsapp_reenvios (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chave text NOT NULL REFERENCES public.imposition_whatsapp_artes(chave),
 registro_anterior jsonb NOT NULL,
 arquivado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.imposition_whatsapp_reenvios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_whatsapp_reenvios FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.imposition_whatsapp_reenvios TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.imposition_whatsapp_reenvios_id_seq TO service_role;

CREATE FUNCTION public.imposition_whatsapp_dialogo_reenviar(
 p_chave text,p_destino text,p_os_id text,p_autor uuid,p_dialogo text,p_atualizado_em timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ocupado text; atual public.imposition_whatsapp_artes;
BEGIN
 INSERT INTO public.imposition_whatsapp_conversas(destino_chave) VALUES(p_destino) ON CONFLICT DO NOTHING;
 SELECT chave_envio INTO ocupado FROM public.imposition_whatsapp_conversas WHERE destino_chave=p_destino FOR UPDATE;
 IF ocupado IS NOT NULL THEN RETURN 'ocupado'; END IF;
 SELECT * INTO atual FROM public.imposition_whatsapp_artes WHERE chave=p_chave FOR UPDATE;
 IF NOT FOUND THEN RETURN 'existente'; END IF;
 IF atual.os_id<>p_os_id OR atual.estado NOT IN ('aguardando','enviado')
    OR (atual.message_id IS NULL AND NOT atual.dialogo_executado)
    OR atual.atualizado_em IS DISTINCT FROM p_atualizado_em
    OR clock_timestamp()<atual.atualizado_em+interval '120 seconds' THEN RETURN 'existente'; END IF;
 INSERT INTO public.imposition_whatsapp_reenvios(chave,registro_anterior) VALUES(p_chave,to_jsonb(atual));
 UPDATE public.imposition_whatsapp_artes SET estado='preparando',autor=p_autor,
   dialogo_id=p_dialogo,dialogo_executado=false,message_id=NULL,concluido=false,
   atualizado_em=clock_timestamp(),tentativas=tentativas+1 WHERE chave=p_chave;
 UPDATE public.imposition_whatsapp_conversas SET chave_envio=p_chave,atualizado_em=clock_timestamp() WHERE destino_chave=p_destino;
 RETURN 'reservado';
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_whatsapp_dialogo_reenviar(text,text,text,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.imposition_whatsapp_dialogo_reenviar(text,text,text,uuid,text,timestamptz) TO service_role;
COMMIT;
