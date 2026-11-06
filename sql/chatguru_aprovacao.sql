-- Preparado para revisão. NÃO aplicado automaticamente.
-- Alvo: Supabase do Imposition. Aditivo; nenhuma alteração de dados comerciais.
BEGIN;
CREATE TABLE public.imposition_whatsapp_artes (
  chave text PRIMARY KEY CHECK (chave ~ '^[a-f0-9]{64}$'),
  os_id text NOT NULL,
  autor uuid NOT NULL,
  estado text NOT NULL DEFAULT 'preparando'
    CHECK (estado IN ('preparando','desconhecido','aguardando','enviado','falhou')),
  message_id text,
  concluido boolean NOT NULL DEFAULT false,
  tentativas integer NOT NULL DEFAULT 1 CHECK (tentativas > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.imposition_whatsapp_artes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_whatsapp_artes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.imposition_whatsapp_artes TO service_role;

CREATE FUNCTION public.imposition_whatsapp_reservar(p_chave text, p_os_id text, p_autor uuid, p_repetir boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE inseridos integer;
BEGIN
  IF p_repetir THEN
    UPDATE public.imposition_whatsapp_artes
    SET estado='preparando', autor=p_autor, atualizado_em=now(), tentativas=tentativas+1
    WHERE chave=p_chave AND os_id=p_os_id AND estado='falhou' AND message_id IS NULL;
    GET DIAGNOSTICS inseridos = ROW_COUNT;
    RETURN inseridos = 1;
  END IF;
  INSERT INTO public.imposition_whatsapp_artes(chave,os_id,autor)
  VALUES(p_chave,p_os_id,p_autor) ON CONFLICT (chave) DO NOTHING;
  GET DIAGNOSTICS inseridos = ROW_COUNT;
  RETURN inseridos = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.imposition_whatsapp_reservar(text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.imposition_whatsapp_reservar(text,text,uuid,boolean) TO service_role;
COMMIT;

-- Verificação posterior, somente leitura:
-- SELECT relrowsecurity FROM pg_class WHERE oid='public.imposition_whatsapp_artes'::regclass;
-- SELECT count(*) FROM public.imposition_whatsapp_artes;
-- Recuperação: retirar o frontend/rota ChatGuru, preservando a tabela para auditoria.
-- Não apagar reservas desconhecidas: podem representar mensagens já aceitas.
