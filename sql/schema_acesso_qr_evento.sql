-- Preparação local. Aplicar antes das Edge Functions e do frontend.
-- QR vincula o celular ao evento; a edição exige também o PIN da instalação.
-- Revogar o QR impede novas ativações; aparelhos existentes têm revogação própria.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '45s';
CREATE TABLE public.producao_acesso_instalacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chave_hash text NOT NULL UNIQUE CHECK (chave_hash ~ '^[a-f0-9]{64}$'),
    pin_cifrado text NOT NULL,
    pin_hash text NOT NULL CHECK (pin_hash ~ '^[a-f0-9]{64}$'),
    tentativas integer NOT NULL DEFAULT 0,
    janela_em timestamptz NOT NULL DEFAULT now(),
    criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producao_acesso_instalacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_instalacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.producao_acesso_instalacoes TO service_role;
ALTER TABLE public.producao_acesso_dispositivos ADD COLUMN instalacao_id uuid REFERENCES public.producao_acesso_instalacoes(id);
CREATE UNIQUE INDEX producao_acesso_um_aparelho_por_instalacao_evento
    ON public.producao_acesso_dispositivos(instalacao_id, evento_id) WHERE instalacao_id IS NOT NULL;
CREATE TABLE public.producao_acesso_auditoria_pin (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instalacao_id uuid NOT NULL REFERENCES public.producao_acesso_instalacoes(id),
    dispositivo_id uuid REFERENCES public.producao_acesso_dispositivos(id) ON DELETE SET NULL,
    evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id),
    consultado_por uuid,
    rota text NOT NULL, metodo text NOT NULL,
    resultado text NOT NULL DEFAULT 'iniciado', criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producao_acesso_auditoria_pin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_auditoria_pin FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.producao_acesso_auditoria_pin TO service_role;

-- Cinco tentativas por janela de 15 minutos, também sob concorrência.
CREATE FUNCTION public.producao_acesso_conferir_pin(p_chave_hash text, p_pin_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE i public.producao_acesso_instalacoes%ROWTYPE;
BEGIN
    SELECT * INTO i FROM public.producao_acesso_instalacoes WHERE chave_hash = p_chave_hash FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF i.janela_em <= now() - interval '15 minutes' THEN
        i.tentativas := 0;
        UPDATE public.producao_acesso_instalacoes SET tentativas = 0, janela_em = now() WHERE id = i.id;
    END IF;
    IF i.tentativas >= 5 THEN RETURN NULL; END IF;
    IF i.pin_hash = p_pin_hash THEN RETURN i.id; END IF;
    UPDATE public.producao_acesso_instalacoes SET tentativas = tentativas + 1 WHERE id = i.id;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.producao_acesso_conferir_pin(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_conferir_pin(text,text) TO service_role;
CREATE TABLE public.producao_acesso_convites_evento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id),
    segredo_hash text NOT NULL UNIQUE CHECK (segredo_hash ~ '^[a-f0-9]{64}$'),
    criado_por uuid NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    revogado_em timestamptz
);
CREATE TABLE public.producao_acesso_ativacoes_qr (
    convite_id uuid NOT NULL REFERENCES public.producao_acesso_convites_evento(id),
    token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    dispositivo_id uuid REFERENCES public.producao_acesso_dispositivos(id) ON DELETE SET NULL,
    PRIMARY KEY (convite_id, token_hash)
);
ALTER TABLE public.producao_acesso_convites_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_acesso_ativacoes_qr ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_convites_evento, public.producao_acesso_ativacoes_qr FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.producao_acesso_convites_evento TO service_role;
GRANT SELECT, INSERT ON public.producao_acesso_ativacoes_qr TO service_role;

-- A consulta e a ativação usam a mesma validação. O segredo nunca fica no banco.
-- O bloqueio do convite serializa repetição/ativação/revogação; tudo é atômico.
CREATE FUNCTION public.producao_acesso_ativar_qr_evento(
    p_segredo_hash text, p_token_hash text DEFAULT NULL,
    p_nome text DEFAULT NULL, p_navegador text DEFAULT NULL, p_instalacao_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    convite public.producao_acesso_convites_evento%ROWTYPE;
    ev public.producao_acesso_eventos%ROWTYPE;
    aparelho public.producao_acesso_dispositivos%ROWTYPE;
    aparelho_id uuid;
BEGIN
    SELECT * INTO convite FROM public.producao_acesso_convites_evento
        WHERE segredo_hash = p_segredo_hash AND revogado_em IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO ev FROM public.producao_acesso_eventos
        WHERE id = convite.evento_id AND status = 'ativo' FOR SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_token_hash IS NULL THEN
        RETURN jsonb_build_object('evento', jsonb_build_object('id', ev.id, 'nome', ev.nome_evento));
    END IF;
    IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 60
       OR p_navegador IS NULL OR p_navegador !~ '^[A-Za-z0-9_-]{1,64}$'
       OR p_instalacao_id IS NULL THEN RETURN NULL; END IF;
    PERFORM 1 FROM public.producao_acesso_instalacoes WHERE id = p_instalacao_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT dispositivo_id INTO aparelho_id FROM public.producao_acesso_ativacoes_qr
        WHERE convite_id = convite.id AND token_hash = p_token_hash;
    IF FOUND THEN
        SELECT * INTO aparelho FROM public.producao_acesso_dispositivos
            WHERE id = aparelho_id AND evento_id = ev.id AND status = 'ativo' AND token_hash = p_token_hash AND instalacao_id = p_instalacao_id;
        IF NOT FOUND THEN RETURN NULL; END IF;
    ELSE
        SELECT * INTO aparelho FROM public.producao_acesso_dispositivos
            WHERE instalacao_id = p_instalacao_id AND evento_id = ev.id;
        IF FOUND THEN
            IF aparelho.status <> 'ativo' OR aparelho.token_hash IS DISTINCT FROM p_token_hash THEN RETURN NULL; END IF;
            INSERT INTO public.producao_acesso_ativacoes_qr VALUES (convite.id, p_token_hash, aparelho.id);
            RETURN jsonb_build_object('evento', jsonb_build_object('id', ev.id, 'nome', ev.nome_evento),
                'aparelho', jsonb_build_object('id', aparelho.id, 'nome', aparelho.nome));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.producao_acesso_setores WHERE evento_id = ev.id AND status = 'ativo')
            THEN RETURN NULL; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.producao_acesso_credenciais WHERE evento_id = ev.id AND status = 'ativo')
            THEN RETURN NULL; END IF;
        INSERT INTO public.producao_acesso_dispositivos
            (evento_id, empresa_id, nome, codigo_hash, token_hash, navegador_id, ultimo_visto, instalacao_id)
            VALUES (ev.id, ev.empresa_id, trim(p_nome), NULL, p_token_hash, p_navegador, now(), p_instalacao_id) RETURNING * INTO aparelho;
        INSERT INTO public.producao_acesso_dispositivo_setores (empresa_id, dispositivo_id, setor_id)
            SELECT ev.empresa_id, aparelho.id, id FROM public.producao_acesso_setores
            WHERE evento_id = ev.id AND status = 'ativo';
        INSERT INTO public.producao_acesso_ativacoes_qr VALUES (convite.id, p_token_hash, aparelho.id);
    END IF;
    RETURN jsonb_build_object('evento', jsonb_build_object('id', ev.id, 'nome', ev.nome_evento),
        'aparelho', jsonb_build_object('id', aparelho.id, 'nome', aparelho.nome));
END;
$$;
REVOKE ALL ON FUNCTION public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid) TO service_role;
COMMIT;
