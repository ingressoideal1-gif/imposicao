-- Recupera vinculo excluido somente mediante nova leitura de convite valido.
-- Nao reativa aparelhos pausados; preserva instalacao, PIN, locks e ACL.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid)'::regprocedure)) <> '1525aa57a2883b6a45d803b0d78118ad' THEN
  RAISE EXCEPTION 'A funcao mudou desde a revisao. Nao aplicar sem conferir.';
 END IF;
END;
$preflight$;
CREATE OR REPLACE FUNCTION public.producao_acesso_ativar_qr_evento(
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
    IF FOUND AND aparelho_id IS NOT NULL THEN
        SELECT * INTO aparelho FROM public.producao_acesso_dispositivos
            WHERE id = aparelho_id AND evento_id = ev.id AND status = 'ativo' AND token_hash = p_token_hash AND instalacao_id = p_instalacao_id;
        IF NOT FOUND THEN RETURN NULL; END IF;
    ELSE
        SELECT * INTO aparelho FROM public.producao_acesso_dispositivos
            WHERE instalacao_id = p_instalacao_id AND evento_id = ev.id;
        IF FOUND THEN
            IF aparelho.status <> 'ativo' OR aparelho.token_hash IS DISTINCT FROM p_token_hash THEN RETURN NULL; END IF;
            INSERT INTO public.producao_acesso_ativacoes_qr VALUES (convite.id, p_token_hash, aparelho.id)
            ON CONFLICT (convite_id, token_hash) DO UPDATE SET dispositivo_id = EXCLUDED.dispositivo_id
            WHERE producao_acesso_ativacoes_qr.dispositivo_id IS NULL;
            RETURN jsonb_build_object('evento', jsonb_build_object('id', ev.id, 'nome', ev.nome_evento),
                'aparelho', jsonb_build_object('id', aparelho.id, 'nome', aparelho.nome));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.producao_acesso_setores WHERE evento_id = ev.id AND status = 'ativo')
            THEN RETURN NULL; END IF;
        INSERT INTO public.producao_acesso_dispositivos
            (evento_id, empresa_id, nome, codigo_hash, token_hash, navegador_id, ultimo_visto, instalacao_id)
            VALUES (ev.id, ev.empresa_id, trim(p_nome), NULL, p_token_hash, p_navegador, now(), p_instalacao_id) RETURNING * INTO aparelho;
        INSERT INTO public.producao_acesso_dispositivo_setores (empresa_id, dispositivo_id, setor_id)
            SELECT ev.empresa_id, aparelho.id, id FROM public.producao_acesso_setores
            WHERE evento_id = ev.id AND status = 'ativo';
        INSERT INTO public.producao_acesso_ativacoes_qr VALUES (convite.id, p_token_hash, aparelho.id)
            ON CONFLICT (convite_id, token_hash) DO UPDATE SET dispositivo_id = EXCLUDED.dispositivo_id
            WHERE producao_acesso_ativacoes_qr.dispositivo_id IS NULL;
    END IF;
    RETURN jsonb_build_object('evento', jsonb_build_object('id', ev.id, 'nome', ev.nome_evento),
        'aparelho', jsonb_build_object('id', aparelho.id, 'nome', aparelho.nome));
END;
$$;
REVOKE ALL ON FUNCTION public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid) TO service_role;
GRANT UPDATE (dispositivo_id) ON public.producao_acesso_ativacoes_qr TO service_role;
DO $verificar$
BEGIN
 IF has_function_privilege('anon','public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.producao_acesso_ativar_qr_evento(text,text,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'ACL inesperada'; END IF;
END;
$verificar$;
COMMIT;
