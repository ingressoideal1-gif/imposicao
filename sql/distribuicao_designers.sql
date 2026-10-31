-- Instalação local revisável. NÃO executa a ativação nem altera atribuições existentes.
-- Requer as tabelas comerciais e imposition_user_permissions. Ver documento de operação.
BEGIN;
-- Decisão explícita de 31/10/2026: rodízio único entre empresas, incluindo
-- designers sem id_empresa. Essa coluna cadastral não particiona a carga.
-- Outros campos de isolamento ainda exigem revisão: não ampliar a exceção.
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('pedidos_artes','pedidos_modelos','propostas','usuarios')
        AND column_name IN ('empresa_id','id_empresa','tenant_id')
        AND NOT (table_name='usuarios' AND column_name='id_empresa')) THEN
        RAISE EXCEPTION 'Escopo por empresa detectado: adaptar e validar o isolamento antes de instalar a distribuição';
    END IF;
END $$;
-- A prévia confirmou ausência desse índice; necessário ao fallback de modelos.
-- Criação local preparada, a executar somente na instalação autorizada.
CREATE INDEX IF NOT EXISTS arte_fila_produtos_id_int_idx ON public.produtos_proposta(id_int);
CREATE SCHEMA IF NOT EXISTS arte_fila;
REVOKE ALL ON SCHEMA arte_fila FROM PUBLIC, anon, authenticated;

CREATE TABLE arte_fila.config (
    id boolean PRIMARY KEY DEFAULT true CHECK (id), ativo boolean NOT NULL DEFAULT false
);
INSERT INTO arte_fila.config VALUES (true, false);
CREATE TABLE arte_fila.designers (
    uid text PRIMARY KEY, nome text NOT NULL,
    modo text NOT NULL DEFAULT 'ativo' CHECK (modo IN ('ativo', 'segurado', 'ausente')),
    ultima_atribuicao timestamptz,
    motivo text NOT NULL DEFAULT '', atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE arte_fila.pedidos (
    id_int bigint PRIMARY KEY,
    original_uid text REFERENCES arte_fila.designers(uid),
    responsavel_uid text REFERENCES arte_fila.designers(uid),
    fixado boolean NOT NULL DEFAULT false,
    ja_distribuido boolean NOT NULL DEFAULT false,
    em_arte boolean NOT NULL DEFAULT false,
    aguardando boolean NOT NULL DEFAULT false,
    redistribuir boolean NOT NULL DEFAULT false,
    motivo_espera text,
    entrada_em timestamptz NOT NULL DEFAULT now(),
    desde timestamptz,
    credito_segundos bigint NOT NULL DEFAULT 0,
    saiu_em timestamptz,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE arte_fila.historico (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint, designer_uid text,
    anterior_uid text, novo_uid text, evento text NOT NULL, motivo text NOT NULL,
    autor uuid DEFAULT auth.uid(), criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Nenhuma escrita direta pela API: somente as RPCs validadas abaixo.
ALTER TABLE arte_fila.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE arte_fila.designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE arte_fila.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE arte_fila.historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA arte_fila FROM PUBLIC, anon, authenticated;

CREATE FUNCTION arte_fila.papel() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT lower(btrim(p.role)) FROM public.imposition_user_permissions p
    WHERE p.user_id = auth.uid() AND (p.role='admin' OR coalesce((to_jsonb(p)->>'perm_lista_arte_view')::boolean,true)) LIMIT 1
$$;

CREATE FUNCTION arte_fila.exigir(p_papeis text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(arte_fila.papel() = ANY(p_papeis), false) THEN
        RAISE EXCEPTION 'Sem autorização para gerenciar a distribuição' USING ERRCODE = '42501';
    END IF;
END $$;

CREATE FUNCTION arte_fila.segundos_uteis(p_inicio timestamptz, p_fim timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT coalesce(sum(greatest(0, extract(epoch FROM
        least(p_fim, (dia::date + time '18:00') AT TIME ZONE 'America/Sao_Paulo') -
        greatest(p_inicio, (dia::date + time '08:00') AT TIME ZONE 'America/Sao_Paulo')))), 0)::bigint
    FROM generate_series(date_trunc('day', p_inicio AT TIME ZONE 'America/Sao_Paulo'),
                         date_trunc('day', p_fim AT TIME ZONE 'America/Sao_Paulo'), interval '1 day') dia
    WHERE extract(isodow FROM dia) BETWEEN 1 AND 5 AND p_fim > p_inicio
$$;

CREATE FUNCTION arte_fila.normalizar(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT translate(upper(btrim(coalesce(p, ''))), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'AAAAEEIOOOUUC')
$$;

-- Fonte única de classificação, já usada pelo banco existente.
CREATE FUNCTION arte_fila.em_arte(p_num bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT coalesce(public.imposition_card_arte_ler(p_num) = 'fila', false)
$$;

CREATE FUNCTION arte_fila.catalogar() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO arte_fila.designers(uid, nome)
    SELECT DISTINCT ON (u.user_id::text) u.user_id::text, btrim(u.nome_usuario)
      FROM public.usuarios u
      WHERE lower(u.setor) LIKE '%designer%' AND u.user_id IS NOT NULL AND btrim(u.nome_usuario) <> ''
      ORDER BY u.user_id::text, u.nome_usuario
    ON CONFLICT(uid) DO UPDATE SET nome = excluded.nome;
END $$;

CREATE FUNCTION arte_fila.em_correcao(p_num bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT EXISTS(SELECT 1 FROM public.pedidos_modelos m WHERE m.id_int=p_num AND
        (arte_fila.normalizar(to_jsonb(m)->>'status_arte') IN ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERACAO','ARTE_EM_CORRECAO')
         OR arte_fila.normalizar(coalesce(to_jsonb(m)->>'status_impressao',to_jsonb(m)->>'impressao')) IN ('CORRIGIR ARTE','CORRIGIR_ARTE','CORRIGIR-ARTE')))
      OR EXISTS(SELECT 1 FROM public.pedidos_artes a WHERE a.id_int=p_num AND
        arte_fila.normalizar(a.status) IN ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERACAO','ARTE_EM_CORRECAO'))
$$;

CREATE FUNCTION arte_fila.registrar(p_num bigint, p_anterior text, p_novo text, p_evento text, p_motivo text)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public AS $$
    INSERT INTO arte_fila.historico(id_int, anterior_uid, novo_uid, evento, motivo)
    VALUES(p_num, p_anterior, p_novo, p_evento, p_motivo)
$$;

CREATE FUNCTION arte_fila.atualizar_pedido(p_num bigint, p_base boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE q arte_fila.pedidos%ROWTYPE; dono text; emarte boolean; agora timestamptz := clock_timestamp();
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.pedidos_artes WHERE id_int = p_num) THEN
        UPDATE arte_fila.pedidos SET em_arte=false, aguardando=false, desde=NULL WHERE id_int=p_num;
        RETURN;
    END IF;
    emarte := arte_fila.em_arte(p_num);
    SELECT * INTO q FROM arte_fila.pedidos WHERE id_int = p_num;
    SELECT d.uid INTO dono FROM public.pedidos_artes a JOIN arte_fila.designers d
      ON d.uid = a.designer_uid::text OR (nullif(a.designer_uid::text,'') IS NULL AND lower(d.nome) = lower(btrim(a.designer_nome))
          AND (SELECT count(*) FROM arte_fila.designers x WHERE lower(x.nome)=lower(btrim(a.designer_nome)))=1)
      WHERE a.id_int = p_num ORDER BY a.created_at DESC, a.id DESC, d.uid LIMIT 1;
    IF q.id_int IS NULL THEN
        INSERT INTO arte_fila.pedidos(id_int, original_uid, responsavel_uid, em_arte, aguardando, motivo_espera, desde, ja_distribuido)
        VALUES(p_num, dono, CASE WHEN p_base OR NOT emarte THEN dono END, emarte,
               emarte AND dono IS NOT NULL AND NOT p_base,
               CASE WHEN dono IS NULL THEN 'Sem designer original' END,
               CASE WHEN p_base AND emarte AND dono IS NOT NULL THEN agora END,
               p_base AND emarte AND dono IS NOT NULL);
        PERFORM arte_fila.registrar(p_num, NULL, dono, 'entrada', CASE WHEN p_base THEN 'Base inicial preservada' ELSE 'Entrada na fila' END);
        RETURN;
    END IF;
    IF p_base THEN
        -- Ao reativar, a fonte atual prevalece sobre a antiga fotografia da fila.
        -- Uma troca feita com o rodízio desligado também invalida a fixação antiga.
        UPDATE arte_fila.pedidos SET original_uid=dono, responsavel_uid=dono,
            em_arte=emarte, aguardando=false, redistribuir=false,
            fixado=q.fixado AND q.responsavel_uid IS NOT DISTINCT FROM dono AND dono IS NOT NULL,
            ja_distribuido=dono IS NOT NULL AND (emarte OR (q.ja_distribuido AND q.responsavel_uid IS NOT DISTINCT FROM dono)),
            motivo_espera=CASE WHEN dono IS NULL THEN 'Sem designer original' END,
            desde=CASE WHEN emarte AND dono IS NOT NULL THEN
                CASE WHEN q.em_arte AND q.responsavel_uid IS NOT DISTINCT FROM dono THEN coalesce(q.desde,agora) ELSE agora END END,
            credito_segundos=CASE WHEN q.responsavel_uid IS NOT DISTINCT FROM dono THEN q.credito_segundos ELSE 0 END,
            atualizado_em=agora WHERE id_int=p_num;
        IF q.responsavel_uid IS DISTINCT FROM dono OR q.em_arte IS DISTINCT FROM emarte THEN
            PERFORM arte_fila.registrar(p_num,q.responsavel_uid,dono,'base_reconciliada','Responsável e etapa atuais preservados na reativação');
        END IF;
        RETURN;
    END IF;
    IF q.original_uid IS NULL AND dono IS NOT NULL THEN
        UPDATE arte_fila.pedidos SET original_uid = dono, aguardando = emarte,
            motivo_espera = NULL WHERE id_int = p_num;
    END IF;
    IF q.em_arte IS DISTINCT FROM emarte THEN
        UPDATE arte_fila.pedidos SET em_arte = emarte, atualizado_em = agora,
            credito_segundos = CASE WHEN q.em_arte THEN q.credito_segundos + arte_fila.segundos_uteis(q.desde,agora)
              WHEN q.saiu_em >= agora - interval '60 minutes' THEN q.credito_segundos ELSE 0 END,
            saiu_em = CASE WHEN q.em_arte THEN agora ELSE q.saiu_em END,
            responsavel_uid = CASE WHEN emarte AND NOT q.ja_distribuido AND NOT q.fixado AND NOT arte_fila.em_correcao(p_num) THEN NULL ELSE q.responsavel_uid END,
            desde = CASE WHEN emarte AND q.responsavel_uid IS NOT NULL AND (q.ja_distribuido OR q.fixado OR arte_fila.em_correcao(p_num)) THEN agora END,
            aguardando = emarte AND (q.original_uid IS NOT NULL OR dono IS NOT NULL)
                AND (q.responsavel_uid IS NULL OR (NOT q.ja_distribuido AND NOT q.fixado AND NOT arte_fila.em_correcao(p_num))),
            ja_distribuido = q.ja_distribuido OR (emarte AND q.responsavel_uid IS NOT NULL AND (q.fixado OR arte_fila.em_correcao(p_num)))
        WHERE id_int = p_num;
    END IF;
END $$;

CREATE FUNCTION arte_fila.processar() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE q arte_fila.pedidos%ROWTYPE; destino text; original_modo text; carga integer; agora timestamptz;
BEGIN
    -- Somente o consumidor e as RPCs administrativas detêm a trava de distribuição.
    -- A ausência vence fixação, correção e trabalho iniciado.
    FOR q IN SELECT p.* FROM arte_fila.pedidos p JOIN arte_fila.designers d ON d.uid = p.responsavel_uid
             WHERE p.em_arte AND d.modo = 'ausente' ORDER BY p.id_int LOOP
        agora := clock_timestamp();
        UPDATE arte_fila.pedidos SET responsavel_uid = NULL, fixado = false, aguardando = true, redistribuir = true,
            credito_segundos = q.credito_segundos + arte_fila.segundos_uteis(q.desde,agora), desde = NULL,
            motivo_espera = 'Responsável ausente', atualizado_em = agora WHERE id_int = q.id_int;
        PERFORM arte_fila.registrar(q.id_int,q.responsavel_uid,NULL,'retirada_por_ausencia',
            'Ausência: ' || (SELECT motivo FROM arte_fila.designers WHERE uid=q.responsavel_uid));
    END LOOP;
    FOR q IN SELECT * FROM arte_fila.pedidos WHERE em_arte AND aguardando AND original_uid IS NOT NULL ORDER BY entrada_em, id_int LOOP
        destino := NULL;
        SELECT modo INTO original_modo FROM arte_fila.designers d WHERE uid = q.original_uid
            AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.user_id::text=d.uid AND lower(u.setor) LIKE '%designer%');
        SELECT count(*) INTO carga FROM arte_fila.pedidos WHERE em_arte AND responsavel_uid = q.original_uid;
        -- Correções já têm responsável e não passam por este laço; ausencia remove-o acima.
        IF NOT q.redistribuir AND ((original_modo='ativo' AND carga < 3)
            OR (original_modo IN ('ativo','segurado') AND (q.fixado OR arte_fila.em_correcao(q.id_int)))) THEN
            destino := q.original_uid;
        ELSE
            SELECT d.uid INTO destino FROM arte_fila.designers d
            WHERE d.modo = 'ativo' AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.user_id::text=d.uid AND lower(u.setor) LIKE '%designer%')
            ORDER BY (SELECT count(*) FROM arte_fila.pedidos p WHERE p.em_arte AND p.responsavel_uid = d.uid),
                     d.ultima_atribuicao ASC NULLS FIRST, d.uid LIMIT 1;
        END IF;
        IF destino IS NULL THEN
            UPDATE arte_fila.pedidos SET motivo_espera = 'Nenhum designer disponível' WHERE id_int = q.id_int;
            CONTINUE;
        END IF;
        agora := clock_timestamp();
        UPDATE arte_fila.pedidos SET responsavel_uid = destino, original_uid = destino, aguardando = false, redistribuir = false,
            ja_distribuido=true, motivo_espera = NULL, desde = agora, atualizado_em = agora WHERE id_int = q.id_int;
        UPDATE arte_fila.designers SET ultima_atribuicao = agora WHERE uid = destino;
        PERFORM arte_fila.registrar(q.id_int,q.responsavel_uid,destino,'atribuicao',
            CASE WHEN destino = q.original_uid THEN 'Original preservado até três pedidos' ELSE 'Menor carga; desempate por última atribuição e UID' END);
    END LOOP;
    -- Todas as linhas de arte do pedido recebem o mesmo responsável, sem duplicar carga.
    UPDATE public.pedidos_artes a SET designer_uid = (jsonb_populate_record(NULL::public.pedidos_artes,
        jsonb_build_object('designer_uid',d.uid))).designer_uid, designer_nome = d.nome
    FROM arte_fila.pedidos persistido LEFT JOIN arte_fila.designers d ON d.uid = persistido.responsavel_uid
    WHERE a.id_int = persistido.id_int AND persistido.original_uid IS NOT NULL
        AND (a.designer_uid::text IS DISTINCT FROM d.uid OR a.designer_nome IS DISTINCT FROM d.nome);
END $$;

-- Eventos independentes, sem chave única por pedido: o produtor não espera
-- linhas/travas do consumidor. Rollback da origem também remove seus eventos.
CREATE TABLE arte_fila.eventos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint, autor uuid DEFAULT auth.uid(),
    criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE arte_fila.eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arte_fila.eventos FROM PUBLIC, anon, authenticated;

CREATE FUNCTION arte_fila.reconciliar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE consulta text; coluna text;
BEGIN
    -- Capturar também quando inativo evita perder commits concorrentes à ativação.
    -- Não ignorar pg_trigger_depth: pagamentos -> propostas é um caminho legítimo.
    IF TG_TABLE_NAME = 'usuarios' THEN
        INSERT INTO arte_fila.eventos(id_int) VALUES(NULL);
    ELSE
        coluna := CASE WHEN TG_TABLE_NAME='pedidos_links_cliente' THEN 'numero_pedido' ELSE 'id_int' END;
        consulta := CASE TG_OP
            WHEN 'INSERT' THEN format('SELECT %I::text AS numero FROM novas',coluna)
            WHEN 'DELETE' THEN format('SELECT %I::text AS numero FROM antigas',coluna)
            ELSE format('SELECT %I::text AS numero FROM novas UNION SELECT %I::text FROM antigas',coluna,coluna) END;
        EXECUTE 'INSERT INTO arte_fila.eventos(id_int) SELECT DISTINCT numero::bigint FROM (' || consulta || ') s WHERE numero ~ ''^[0-9]+$'' ORDER BY 1';
    END IF;
    RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['pedidos_artes','pedidos_modelos','produtos_proposta','propostas','pedidos_links_cliente','usuarios'] LOOP
        EXECUTE format('CREATE TRIGGER arte_fila_inserir AFTER INSERT ON public.%I REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION arte_fila.reconciliar()',t);
        EXECUTE format('CREATE TRIGGER arte_fila_alterar AFTER UPDATE ON public.%I REFERENCING NEW TABLE AS novas OLD TABLE AS antigas FOR EACH STATEMENT EXECUTE FUNCTION arte_fila.reconciliar()',t);
        EXECUTE format('CREATE TRIGGER arte_fila_excluir AFTER DELETE ON public.%I REFERENCING OLD TABLE AS antigas FOR EACH STATEMENT EXECUTE FUNCTION arte_fila.reconciliar()',t);
    END LOOP;
END $$;

CREATE FUNCTION arte_fila.consumir() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ids bigint[]; num bigint;
BEGIN
    IF NOT pg_try_advisory_xact_lock(731031,1) THEN RETURN 0; END IF;
    IF NOT (SELECT ativo FROM arte_fila.config WHERE id) THEN RETURN 0; END IF;
    SELECT array_agg(id ORDER BY id) INTO ids FROM arte_fila.eventos;
    IF ids IS NULL THEN RETURN 0; END IF;
    PERFORM arte_fila.catalogar();
    FOR num IN SELECT DISTINCT id_int FROM arte_fila.eventos WHERE id=ANY(ids) AND id_int IS NOT NULL ORDER BY id_int LOOP
        PERFORM arte_fila.atualizar_pedido(num);
    END LOOP;
    PERFORM arte_fila.processar();
    -- Não usar id <= max: uma transação antiga pode confirmar depois deste lote.
    DELETE FROM arte_fila.eventos WHERE id=ANY(ids);
    RETURN cardinality(ids);
END $$;

CREATE FUNCTION public.arte_distribuicao_estado() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM arte_fila.exigir(ARRAY['admin','atendimento','designer','gerente']);
    RETURN jsonb_build_object('ativo',(SELECT ativo FROM arte_fila.config WHERE id),
        'pendentes',(SELECT count(DISTINCT id_int) FROM arte_fila.eventos),
        'designers',coalesce((SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object('carga',
            (SELECT count(*) FROM arte_fila.pedidos p WHERE p.em_arte AND p.responsavel_uid=d.uid))) FROM arte_fila.designers d),'[]'::jsonb),
        'pedidos',coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('nome',d.nome))
            FROM arte_fila.pedidos p LEFT JOIN arte_fila.designers d ON d.uid=p.responsavel_uid),'[]'::jsonb));
END $$;

CREATE FUNCTION public.arte_distribuicao_ativar(p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE num bigint; ids bigint[];
BEGIN
    PERFORM arte_fila.exigir(ARRAY['admin']);
    IF p_ativo IS NULL THEN RAISE EXCEPTION 'Informe ativo ou inativo'; END IF;
    PERFORM pg_advisory_xact_lock(731031, 1);
    IF p_ativo AND NOT (SELECT ativo FROM arte_fila.config WHERE id) THEN
        SELECT array_agg(id) INTO ids FROM arte_fila.eventos;
        PERFORM arte_fila.catalogar();
        FOR num IN SELECT id_int FROM public.pedidos_artes WHERE id_int IS NOT NULL
            UNION SELECT id_int FROM arte_fila.pedidos ORDER BY id_int LOOP
            PERFORM arte_fila.atualizar_pedido(num,true);
        END LOOP;
    END IF;
    IF p_ativo THEN
        -- Falha de agendamento reverte também a ativação e a base inicial.
        PERFORM cron.schedule('ideal-arte-distribuicao','5 seconds','SET statement_timeout = ''15s''; SELECT arte_fila.consumir();');
        DELETE FROM arte_fila.eventos WHERE id=ANY(ids);
    ELSIF (SELECT ativo FROM arte_fila.config WHERE id) THEN
        PERFORM cron.unschedule('ideal-arte-distribuicao');
    END IF;
    UPDATE arte_fila.config SET ativo=p_ativo WHERE id;
    INSERT INTO arte_fila.historico(evento,motivo) VALUES('ativacao', CASE WHEN p_ativo THEN 'Ativado pelo ADM' ELSE 'Desativado pelo ADM' END);
    RETURN public.arte_distribuicao_estado();
END $$;

CREATE FUNCTION public.arte_distribuicao_disponibilidade(p_uid text, p_modo text, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM arte_fila.exigir(ARRAY['admin']);
    IF p_modo IS NULL OR p_modo NOT IN ('ativo','segurado','ausente') OR length(btrim(coalesce(p_motivo,''))) < 3 THEN
        RAISE EXCEPTION 'Informe situação e motivo';
    END IF;
    PERFORM pg_advisory_xact_lock(731031, 1);
    IF NOT (SELECT ativo FROM arte_fila.config WHERE id) THEN RAISE EXCEPTION 'Distribuição desativada'; END IF;
    PERFORM arte_fila.consumir();
    UPDATE arte_fila.designers SET modo=p_modo, motivo=btrim(p_motivo), atualizado_em=clock_timestamp() WHERE uid=p_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Designer não encontrado'; END IF;
    INSERT INTO arte_fila.historico(designer_uid,evento,motivo) VALUES(p_uid,p_modo,btrim(p_motivo));
    PERFORM arte_fila.processar();
    RETURN public.arte_distribuicao_estado();
END $$;

CREATE FUNCTION public.arte_distribuicao_fixar(p_num bigint, p_uid text, p_fixado boolean, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE q arte_fila.pedidos%ROWTYPE; agora timestamptz := clock_timestamp(); anterior text;
BEGIN
    PERFORM arte_fila.exigir(ARRAY['admin','atendimento']);
    IF arte_fila.papel() <> 'admin' AND EXISTS(SELECT 1 FROM public.imposition_user_permissions p
        WHERE p.user_id=auth.uid() AND (to_jsonb(p)->>'perm_lista_arte_edit')::boolean IS FALSE) THEN
        RAISE EXCEPTION 'Edição da Lista de Arte não permitida' USING ERRCODE='42501';
    END IF;
    IF p_fixado IS NULL OR length(btrim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe fixação e motivo'; END IF;
    PERFORM pg_advisory_xact_lock(731031, 1);
    IF NOT (SELECT ativo FROM arte_fila.config WHERE id) THEN RAISE EXCEPTION 'Distribuição desativada'; END IF;
    PERFORM arte_fila.consumir();
    IF NOT EXISTS(SELECT 1 FROM arte_fila.designers WHERE uid=p_uid AND modo <> 'ausente') THEN
        RAISE EXCEPTION 'Designer ausente ou inválido';
    END IF;
    SELECT responsavel_uid INTO anterior FROM arte_fila.pedidos WHERE id_int=p_num;
    IF NOT EXISTS(SELECT 1 FROM public.pedidos_artes WHERE id_int=p_num) THEN
        IF NOT EXISTS(SELECT 1 FROM public.propostas WHERE id_int=p_num) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
        -- Reserva a atribuição manual na mesma transação antes da criação da arte,
        -- para que seu trigger não a trate como uma entrada automática concorrente.
        INSERT INTO arte_fila.pedidos(id_int,original_uid,responsavel_uid,fixado)
        VALUES(p_num,p_uid,p_uid,p_fixado) ON CONFLICT(id_int) DO NOTHING;
        INSERT INTO public.pedidos_artes(id_int,designer_uid,designer_nome)
        SELECT p_num,(jsonb_populate_record(NULL::public.pedidos_artes,
            jsonb_build_object('designer_uid',p_uid))).designer_uid,nome FROM arte_fila.designers WHERE uid=p_uid;
    END IF;
    PERFORM arte_fila.atualizar_pedido(p_num);
    SELECT * INTO q FROM arte_fila.pedidos WHERE id_int=p_num;
    IF q.id_int IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
    UPDATE arte_fila.pedidos SET original_uid=p_uid,responsavel_uid=p_uid,fixado=p_fixado,
        ja_distribuido=true,
        aguardando=false,redistribuir=false,motivo_espera=NULL,desde=CASE WHEN em_arte THEN coalesce(desde,agora) ELSE desde END,
        atualizado_em=agora WHERE id_int=p_num;
    IF anterior IS DISTINCT FROM p_uid THEN
        UPDATE arte_fila.designers SET ultima_atribuicao=agora WHERE uid=p_uid;
    END IF;
    PERFORM arte_fila.registrar(p_num,anterior,p_uid,CASE WHEN p_fixado THEN 'fixacao' ELSE 'desfixacao' END,btrim(p_motivo));
    PERFORM arte_fila.processar();
    RETURN public.arte_distribuicao_estado();
END $$;

CREATE FUNCTION public.arte_distribuicao_historico(p_num bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM arte_fila.exigir(ARRAY['admin','atendimento']);
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (
        SELECT * FROM arte_fila.historico WHERE id_int=p_num ORDER BY id DESC LIMIT 100
    ) h),'[]'::jsonb);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA arte_fila FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arte_distribuicao_estado(), public.arte_distribuicao_ativar(boolean),
    public.arte_distribuicao_disponibilidade(text,text,text), public.arte_distribuicao_fixar(bigint,text,boolean,text),
    public.arte_distribuicao_historico(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arte_distribuicao_estado(), public.arte_distribuicao_ativar(boolean),
    public.arte_distribuicao_disponibilidade(text,text,text), public.arte_distribuicao_fixar(bigint,text,boolean,text),
    public.arte_distribuicao_historico(bigint) TO authenticated;
COMMIT;
