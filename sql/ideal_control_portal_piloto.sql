-- Instala desligado. Não cadastra eventos nem libera pedidos nesta migração.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
CREATE TABLE public.ideal_control_portal_config (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    habilitado boolean NOT NULL DEFAULT false
);
INSERT INTO public.ideal_control_portal_config(id) VALUES(true);
CREATE TABLE public.ideal_control_portal_pedidos (
    pedido_id_int integer PRIMARY KEY,
    habilitado boolean NOT NULL DEFAULT false
);
-- O convite precisa reaparecer no portal. O segredo recuperável fica privado,
-- nunca no payload geral do portal, Storage público, logs ou localStorage.
CREATE TABLE public.ideal_control_portal_convites (
    pedido_id_int integer PRIMARY KEY,
    evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id),
    convite_id uuid NOT NULL REFERENCES public.producao_acesso_convites_evento(id),
    segredo text NOT NULL CHECK (segredo ~ '^[a-f0-9]{64}$'),
    link_id text NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ideal_control_portal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideal_control_portal_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideal_control_portal_convites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ideal_control_portal_config, public.ideal_control_portal_pedidos,
    public.ideal_control_portal_convites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ideal_control_portal_config, public.ideal_control_portal_pedidos,
    public.ideal_control_portal_convites TO service_role;

-- Autoria do portal não é atribuída falsamente a um atendente.
ALTER TABLE public.producao_acesso_convites_evento
    ADD COLUMN origem text NOT NULL DEFAULT 'imposition',
    ADD COLUMN portal_link_id text,
    ALTER COLUMN criado_por DROP NOT NULL;
ALTER TABLE public.producao_acesso_convites_evento ADD CONSTRAINT convite_autoria_portal
    CHECK (criado_por IS NOT NULL OR (origem = 'portal' AND portal_link_id IS NOT NULL));

CREATE FUNCTION public.ideal_control_portal(p_numero text, p_token text, p_criar boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    link public.pedidos_links_cliente%ROWTYPE;
    prop public.propostas%ROWTYPE;
    pedido public.producao_acesso_pedidos%ROWTYPE;
    ev public.producao_acesso_eventos%ROWTYPE;
    acesso public.ideal_control_portal_convites%ROWTYPE;
    arte record; modelo record; setor uuid; v_pedido integer;
    modelos jsonb := '[]'::jsonb; total bigint := 0; v_quantidade bigint;
    segredo text; convite uuid; completa boolean := true;
BEGIN
    -- Mesmo bloqueio para consulta e criação. Desligar a aba não toca no PWA.
    PERFORM 1 FROM public.ideal_control_portal_config WHERE id AND habilitado FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('disponivel',false); END IF;
    IF p_numero IS NULL OR p_numero !~ '^[1-9][0-9]{0,8}$'
       OR p_token IS NULL OR length(p_token) NOT BETWEEN 1 AND 512 THEN
        RETURN jsonb_build_object('disponivel',false);
    END IF;
    v_pedido := p_numero::integer;
    PERFORM 1 FROM public.ideal_control_portal_pedidos
        WHERE pedido_id_int=v_pedido AND habilitado FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('disponivel',false); END IF;
    SELECT * INTO link FROM public.pedidos_links_cliente
        WHERE numero_pedido=p_numero AND token=p_token AND ativo IS TRUE LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('disponivel',false); END IF;

    -- Uma linha existente do ERP serializa duas criações, inclusive antes de
    -- existir producao_acesso_pedidos. Toda a operação abaixo é uma transação.
    SELECT * INTO prop FROM public.propostas WHERE id_int=v_pedido FOR UPDATE;
    IF NOT FOUND OR prop.id_cliente IS NULL OR prop.id_cliente <= 0
       OR upper(btrim(coalesce(prop.status_interno,'')))='CANCELADO' THEN
        RETURN jsonb_build_object('disponivel',true,'estado','indisponivel');
    END IF;
    PERFORM 1 FROM public.pedidos_modelos WHERE id_int=v_pedido ORDER BY id FOR SHARE;
    IF NOT EXISTS (SELECT 1 FROM public.pedidos_modelos WHERE id_int=v_pedido AND quantidade>0)
       OR EXISTS (SELECT 1 FROM public.pedidos_modelos WHERE id_int=v_pedido AND quantidade>0
                  AND upper(btrim(coalesce(status_impressao,''))) <> 'IMPRESSO') THEN
        RETURN jsonb_build_object('disponivel',true,'estado','aguardando_impressao');
    END IF;

    SELECT * INTO pedido FROM public.producao_acesso_pedidos WHERE pedido_id_int=v_pedido FOR UPDATE;
    completa := FOUND AND pedido.publicado_em IS NOT NULL;
    IF pedido.id IS NOT NULL AND (pedido.status <> 'ativo' OR pedido.qr_revogado_em IS NOT NULL) THEN
        RETURN jsonb_build_object('disponivel',true,'estado','acesso_revogado');
    END IF;
    -- A mesma elegibilidade de modelos.ts: código variável, não vindo de CSV.
    -- Contagem por modelo evita um setor completo esconder outro incompleto.
    FOR modelo IN
        SELECT m.id,m.nome_modelo,m.quantidade
        FROM public.pedidos_modelos m JOIN public.producao_numeracoes n
          ON n.id::text=m.amostra_num_id::text
        WHERE m.id_int=v_pedido AND m.quantidade>0 AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array'
            THEN n.elements::jsonb ELSE '[]'::jsonb END) e
          WHERE e->>'type' IN ('QR_IDEAL','QR','BARCODE')
            AND coalesce(e->>'source','') <> 'database'
            AND coalesce(e->'fixed','null'::jsonb) IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
        ) ORDER BY m.id
    LOOP
        SELECT count(DISTINCT numero) INTO v_quantidade FROM public.producao_acesso_credenciais
            WHERE pedido_id_int=v_pedido AND modelo_id=modelo.id
              AND numero BETWEEN 1 AND modelo.quantidade;
        IF v_quantidade <> modelo.quantidade THEN completa := false; END IF;
        total := total + modelo.quantidade;
        modelos := modelos || jsonb_build_array(to_jsonb(modelo));
    END LOOP;
    SELECT count(*) INTO v_quantidade FROM public.producao_acesso_credenciais WHERE pedido_id_int=v_pedido;
    IF total=0 THEN RETURN jsonb_build_object('disponivel',true,'estado','sem_codigos'); END IF;
    IF v_quantidade <> total OR pedido.total_credenciais IS DISTINCT FROM total THEN completa := false; END IF;
    -- Uma publicação marcada concluída mas inconsistente exige conferência.
    IF pedido.publicado_em IS NOT NULL AND NOT completa THEN
        RETURN jsonb_build_object('disponivel',true,'estado','conferir_evento');
    END IF;

    -- Pedido impresso sem contrato não pode reservar códigos novos: poderiam
    -- divergir dos ingressos já entregues. Conferência da emissão é externa.
    IF NOT completa AND EXISTS (
      SELECT 1 FROM public.pedidos_modelos m JOIN public.producao_numeracoes n
        ON n.id::text=m.amostra_num_id::text
      WHERE m.id_int=v_pedido AND m.quantidade>0 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array'
          THEN n.elements::jsonb ELSE '[]'::jsonb END) e
        WHERE e->>'type'='QR_IDEAL' AND coalesce(e->>'source','')<>'database'
          AND coalesce(e->'fixed','null'::jsonb) IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb))
      AND NOT EXISTS (SELECT 1 FROM public.producao_acesso_qr_contratos c WHERE c.pedido=v_pedido AND c.modelo=m.id)
    ) THEN RETURN jsonb_build_object('disponivel',true,'estado','conferir_emissao'); END IF;

    IF pedido.evento_id IS NOT NULL THEN
        SELECT * INTO ev FROM public.producao_acesso_eventos WHERE id=pedido.evento_id FOR UPDATE;
        IF NOT FOUND OR ev.id_cliente IS DISTINCT FROM prop.id_cliente OR ev.status <> 'ativo' THEN
            RETURN jsonb_build_object('disponivel',true,'estado','evento_indisponivel');
        END IF;
        -- Nunca reescrever setores/configurações do evento que já existe.
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(modelos) m WHERE NOT EXISTS (
          SELECT 1 FROM public.producao_acesso_setores s WHERE s.evento_id=ev.id
            AND s.pedido_id_int=v_pedido AND s.modelo_id=(m->>'id')::integer AND s.status='ativo'))
           OR EXISTS (SELECT 1 FROM public.producao_acesso_credenciais c
              WHERE c.pedido_id_int=v_pedido AND (c.evento_id IS DISTINCT FROM ev.id OR NOT EXISTS (
                SELECT 1 FROM public.producao_acesso_setores s WHERE s.id=c.setor_id
                  AND s.evento_id=ev.id AND s.modelo_id=c.modelo_id AND s.status='ativo'))) THEN
            RETURN jsonb_build_object('disponivel',true,'estado','conferir_evento');
        END IF;
    ELSE
        IF p_criar IS NOT TRUE THEN RETURN jsonb_build_object('disponivel',true,'estado','pronto'); END IF;
        IF EXISTS (SELECT 1 FROM public.producao_acesso_setores WHERE pedido_id_int=v_pedido)
           OR EXISTS (SELECT 1 FROM public.producao_acesso_credenciais
                      WHERE pedido_id_int=v_pedido AND (evento_id IS NOT NULL OR setor_id IS NOT NULL)) THEN
            RETURN jsonb_build_object('disponivel',true,'estado','conferir_evento');
        END IF;
        IF pedido.id IS NULL THEN
            INSERT INTO public.producao_acesso_pedidos(pedido_id_int,sal)
            VALUES(v_pedido,encode(gen_random_bytes(32),'hex')) RETURNING * INTO pedido;
        END IF;
        SELECT nome_evento,data_evento,local_evento INTO arte FROM public.pedidos_artes
            WHERE id_int=v_pedido ORDER BY created_at ASC LIMIT 1;
        INSERT INTO public.producao_acesso_eventos(id_cliente,dono_auth_id,nome_evento,data_evento,local_evento,sal)
        VALUES(prop.id_cliente,NULL,coalesce(nullif(btrim(arte.nome_evento),''),'Pedido '||v_pedido),
               arte.data_evento,arte.local_evento,encode(gen_random_bytes(32),'hex')) RETURNING * INTO ev;
        FOR modelo IN SELECT * FROM jsonb_to_recordset(modelos) AS m(id integer,nome_modelo text,quantidade integer)
        LOOP
            INSERT INTO public.producao_acesso_setores(evento_id,pedido_id_int,modelo_id,nome,quantidade)
            VALUES(ev.id,v_pedido,modelo.id,coalesce(nullif(btrim(modelo.nome_modelo),''),'Setor '||modelo.id),modelo.quantidade)
            RETURNING id INTO setor;
            UPDATE public.producao_acesso_credenciais SET evento_id=ev.id,setor_id=setor
                WHERE pedido_id_int=v_pedido AND modelo_id=modelo.id;
        END LOOP;
        UPDATE public.producao_acesso_pedidos SET evento_id=ev.id WHERE id=pedido.id;
    END IF;

    -- Só o servidor recebe o identificador para preparar um lote. Não emitir
    -- convite enquanto a publicação não estiver completa e validada.
    IF NOT completa THEN
        IF EXISTS (SELECT 1 FROM public.producao_acesso_convites_evento
                   WHERE evento_id=ev.id AND revogado_em IS NOT NULL) THEN
            RETURN jsonb_build_object('disponivel',true,'estado','acesso_revogado');
        END IF;
        IF (SELECT count(*) FROM public.producao_acesso_pedidos WHERE evento_id=ev.id) <> 1 THEN
            RETURN jsonb_build_object('disponivel',true,'estado','conferir_evento');
        END IF;
        RETURN jsonb_build_object('disponivel',true,'estado','preparando','evento_id',ev.id);
    END IF;

    SELECT * INTO acesso FROM public.ideal_control_portal_convites WHERE pedido_id_int=v_pedido FOR UPDATE;
    IF FOUND THEN
        IF acesso.evento_id <> ev.id OR acesso.link_id <> link.id::text OR NOT EXISTS (
            SELECT 1 FROM public.producao_acesso_convites_evento
            WHERE id=acesso.convite_id AND evento_id=ev.id AND revogado_em IS NULL
              AND segredo_hash=encode(digest(acesso.segredo,'sha256'),'hex')) THEN
            RETURN jsonb_build_object('disponivel',true,'estado','acesso_revogado');
        END IF;
        segredo := acesso.segredo;
    ELSE
        IF p_criar IS NOT TRUE THEN RETURN jsonb_build_object('disponivel',true,'estado','evento_existente'); END IF;
        -- Revogação do atendimento nunca é desfeita por um clique no portal.
        IF EXISTS (SELECT 1 FROM public.producao_acesso_convites_evento
                   WHERE evento_id=ev.id AND revogado_em IS NOT NULL) THEN
            RETURN jsonb_build_object('disponivel',true,'estado','acesso_revogado');
        END IF;
        segredo := encode(gen_random_bytes(32),'hex');
        INSERT INTO public.producao_acesso_convites_evento(evento_id,segredo_hash,criado_por,origem,portal_link_id)
        VALUES(ev.id,encode(digest(segredo,'sha256'),'hex'),NULL,'portal',link.id::text) RETURNING id INTO convite;
        INSERT INTO public.ideal_control_portal_convites(pedido_id_int,evento_id,convite_id,segredo,link_id)
        VALUES(v_pedido,ev.id,convite,segredo,link.id::text);
    END IF;
    RETURN jsonb_build_object('disponivel',true,'estado','criado','nome_evento',ev.nome_evento,
        'qr','IDEAL-CONTROL-EVENTO:1:'||segredo);
END $$;
REVOKE ALL ON FUNCTION public.ideal_control_portal(text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ideal_control_portal(text,text,boolean) TO service_role;
COMMENT ON FUNCTION public.ideal_control_portal(text,text,boolean) IS
 'Piloto opt-in por pedido. Valida link ativo; criação atômica; QR privado e revogável. Sem administração do evento.';
COMMIT;
