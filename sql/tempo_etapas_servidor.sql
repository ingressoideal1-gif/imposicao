-- Projeto e-deal / producao. Aplicar SOMENTE apos revisar o preflight.
-- O browser deixa de ser escritor. Nenhum horario legado e inventado/convertido.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- A fotografia inicial e a instalacao dos gatilhos precisam ser atomicas em
-- relacao aos escritores. Se nao conseguir os locks em 5s, abortar e reagendar.
LOCK TABLE public.pedidos_artes, public.pedidos_links_cliente,
    public.pedidos_modelos, public.propostas IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.imposition_etapas_arte (
    id_int bigint PRIMARY KEY,
    card text CHECK (card IN ('fila','pendente','aprovacao','aprovados','concluidos')),
    desde timestamptz,
    CONSTRAINT etapa_sem_inicio_apenas_baseline CHECK (card IS NOT NULL OR desde IS NULL)
);
CREATE TABLE public.imposition_etapas_arte_historico (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint NOT NULL,
    card text NOT NULL CHECK (card IN ('fila','pendente','aprovacao','aprovados','concluidos')),
    entrou_em timestamptz NOT NULL,
    saiu_em timestamptz,
    CHECK (saiu_em IS NULL OR saiu_em >= entrou_em)
);
CREATE UNIQUE INDEX imposition_etapa_aberta_por_pedido
    ON public.imposition_etapas_arte_historico(id_int) WHERE saiu_em IS NULL;

ALTER TABLE public.imposition_etapas_arte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imposition_etapas_arte_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_etapas_arte, public.imposition_etapas_arte_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.imposition_etapas_arte TO authenticated;
CREATE POLICY etapas_leitura_painel ON public.imposition_etapas_arte
    FOR SELECT TO authenticated USING (true);
-- Mesmo alcance de leitura da tabela anterior; nenhuma permissao nova de escrita.

-- Espelho testado de classificarPedidoNaArte, sem overrides locais do navegador.
CREATE FUNCTION public.imposition_card_arte_calcular(
    p_global text, p_entrega text, p_status text, p_interno text,
    p_abriu boolean, p_modelos jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
    g text := upper(btrim(coalesce(p_global,'')));
    e text := upper(btrim(coalesce(p_entrega,'')));
    s text := upper(btrim(coalesce(p_status,'')));
    si text := upper(btrim(coalesce(p_interno,'')));
    aprovados text[] := ARRAY['APROVADO','APROVADA','APROVADA_CLIENTE','LIBERADA','ARTE_APROVADA','ARTE APROVADA','DADOS PENDENTES'];
    reprovados text[] := ARRAY['REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERAÇÃO','EM ALTERACAO','ARTE_EM_CORRECAO'];
    em_aprovacao text[] := ARRAY['ENVIAR ARTE','ARTE PRONTA','EM APROVAÇÃO','EM APROVACAO','AGUARD. APROVAÇÃO','AGUARD. APROVACAO','AGUARDANDO_APROVACAO','AGUARD. APROVAÇAO'];
    saiu text[] := ARRAY['EM PRODUCAO','EM PRODUÇÃO','PRODUCAO','PRODUÇÃO','EM IMPRESSAO','EM IMPRESSÃO','IMPRESSO','EM ACABAMENTO','REVISAO PRODUCAO','REVISÃO PRODUÇÃO','EXPEDICAO','EXPEDIÇÃO','EM TRANSITO','EM TRÂNSITO','A RETIRAR','RETIRADO','ENTREGUE','FINALIZADA','FINALIZADO'];
    total integer; aprovadas integer; reprova boolean; correcao boolean;
    alteracao boolean; status_calculado text;
BEGIN
    IF g = 'IGNORAR' THEN RETURN NULL; END IF;
    SELECT count(*), count(*) FILTER (WHERE upper(btrim(coalesce(m->>'status_arte',''))) = ANY(aprovados)),
           coalesce(bool_or(upper(btrim(coalesce(m->>'status_arte',''))) = ANY(reprovados)),false),
           coalesce(bool_or(upper(btrim(coalesce(m->>'status_impressao',''))) IN ('CORRIGIR ARTE','CORRIGIR_ARTE','CORRIGIR-ARTE')),false)
      INTO total, aprovadas, reprova, correcao FROM jsonb_array_elements(coalesce(p_modelos,'[]'::jsonb)) m;
    IF si IN ('CANCELADO','CANCELADA') THEN RETURN 'concluidos'; END IF;
    IF correcao THEN RETURN 'fila'; END IF;
    IF g = 'EM ARTE' AND NOT (s = ANY(saiu) OR si = ANY(saiu)) THEN RETURN 'fila'; END IF;
    IF s = ANY(saiu) OR si = ANY(saiu) THEN RETURN 'concluidos'; END IF;
    alteracao := (s = ANY(reprovados) OR g = ANY(reprovados) OR reprova) AND NOT (total > 0 AND aprovadas = total);
    IF s = ANY(aprovados) OR g = ANY(aprovados) OR (total > 0 AND aprovadas = total) THEN status_calculado := 'Aprovada';
    ELSIF (s IN ('ENVIAR ARTE','ARTE PRONTA') OR g IN ('ENVIAR ARTE','ARTE PRONTA')) AND NOT coalesce(p_abriu,false) THEN status_calculado := 'Enviar Arte';
    ELSIF alteracao THEN status_calculado := 'Em Alteração';
    ELSIF coalesce(p_abriu,false) OR s = ANY(em_aprovacao) OR g = ANY(em_aprovacao) THEN status_calculado := 'Em Aprovação';
    ELSE status_calculado := coalesce(p_status,'Em Arte'); END IF;
    IF e = 'CORRIGIR' OR s IN ('PENDENTE INFORMAÇÃO','PENDENTE INFORMACAO') OR g IN ('PENDENTE INFORMAÇÃO','PENDENTE INFORMACAO') THEN RETURN 'pendente'; END IF;
    IF status_calculado = 'Aprovada' THEN
        RETURN CASE WHEN e = 'APROVADO' THEN 'aprovados' ELSE 'aprovacao' END;
    END IF;
    IF NOT alteracao AND aprovadas > 0 THEN RETURN 'aprovacao'; END IF;
    IF status_calculado IN ('Enviar Arte','Em Aprovação','Arte Pronta','Dados Pendentes','Apr Parcial') THEN RETURN 'aprovacao'; END IF;
    RETURN 'fila';
END $$;

CREATE FUNCTION public.imposition_card_arte_ler(p_numero bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a jsonb; p jsonb; l jsonb; m jsonb; s text;
BEGIN
    IF EXISTS (SELECT 1 FROM public.pedidos_artes WHERE id_int=p_numero AND upper(btrim(status))='IGNORAR') THEN RETURN NULL; END IF;
    SELECT jsonb_build_object('status',t.status,'entrega_dados',t.entrega_dados) INTO a FROM public.pedidos_artes t WHERE t.id_int = p_numero ORDER BY t.created_at DESC, t.id DESC LIMIT 1;
    SELECT jsonb_build_object('status_interno',t.status_interno) INTO p FROM public.propostas t WHERE t.id_int = p_numero LIMIT 1;
    SELECT jsonb_build_object('status_arte',t.status_arte,'cliente_abriu_em',t.cliente_abriu_em) INTO l FROM public.pedidos_links_cliente t WHERE t.numero_pedido = p_numero::text AND t.ativo IS TRUE ORDER BY t.created_at DESC, t.id DESC LIMIT 1;
    SELECT jsonb_agg(jsonb_build_object('status_arte',t.status_arte,'status_impressao',t.status_impressao)) INTO m FROM public.pedidos_modelos t WHERE t.id_int = p_numero;
    IF a IS NULL AND m IS NULL AND l IS NULL THEN RETURN NULL; END IF;
    s := coalesce(nullif(l->>'status_arte',''),'Em Arte');
    RETURN public.imposition_card_arte_calcular(a->>'status',a->>'entrega_dados',s,p->>'status_interno',nullif(l->>'cliente_abriu_em','') IS NOT NULL,m);
END $$;

-- Baseline: memoriza apenas a etapa atual, SEM iniciar todos os cronometros agora.
-- O horario antigo so pode ser recuperado por evidencia historica revisada.
INSERT INTO public.imposition_etapas_arte(id_int,card,desde)
SELECT ids.id_int, public.imposition_card_arte_ler(ids.id_int), NULL
FROM (
    SELECT id_int FROM public.pedidos_artes WHERE id_int IS NOT NULL
    UNION SELECT id_int FROM public.pedidos_modelos WHERE id_int IS NOT NULL
    UNION SELECT numero_pedido::bigint FROM public.pedidos_links_cliente WHERE numero_pedido ~ '^\d+$'
) ids;

CREATE FUNCTION public.imposition_etapa_arte_registrar(p_numero bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE anterior public.imposition_etapas_arte%ROWTYPE; novo text; instante timestamptz;
BEGIN
    IF p_numero IS NULL THEN RETURN; END IF;
    -- Serializa entradas concorrentes do MESMO pedido; pedidos diferentes seguem independentes.
    PERFORM pg_advisory_xact_lock(hashtextextended('imposition-etapa-arte:' || p_numero::text,0));
    novo := public.imposition_card_arte_ler(p_numero);
    SELECT * INTO anterior FROM public.imposition_etapas_arte WHERE id_int=p_numero FOR UPDATE;
    IF FOUND AND anterior.card IS NOT DISTINCT FROM novo THEN RETURN; END IF;
    IF NOT FOUND AND novo IS NULL THEN RETURN; END IF;
    instante := clock_timestamp();
    UPDATE public.imposition_etapas_arte_historico SET saiu_em=instante WHERE id_int=p_numero AND saiu_em IS NULL;
    IF novo IS NOT NULL THEN
        INSERT INTO public.imposition_etapas_arte_historico(id_int,card,entrou_em) VALUES(p_numero,novo,instante);
    END IF;
    INSERT INTO public.imposition_etapas_arte(id_int,card,desde) VALUES(p_numero,novo,CASE WHEN novo IS NOT NULL THEN instante END)
    ON CONFLICT(id_int) DO UPDATE SET card=EXCLUDED.card, desde=EXCLUDED.desde;
END $$;

CREATE FUNCTION public.imposition_etapa_arte_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE antigo jsonb; novo jsonb; numero_antigo bigint; numero_novo bigint;
BEGIN
    IF TG_OP <> 'INSERT' THEN antigo := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN novo := to_jsonb(NEW); END IF;
    IF TG_OP = 'UPDATE' THEN
        IF TG_TABLE_NAME='pedidos_artes' AND
           (antigo->'id_int',antigo->'status',antigo->'entrega_dados') IS NOT DISTINCT FROM (novo->'id_int',novo->'status',novo->'entrega_dados') THEN RETURN NULL; END IF;
        IF TG_TABLE_NAME='pedidos_modelos' AND
           (antigo->'id_int',antigo->'status_arte',antigo->'status_impressao') IS NOT DISTINCT FROM (novo->'id_int',novo->'status_arte',novo->'status_impressao') THEN RETURN NULL; END IF;
        IF TG_TABLE_NAME='propostas' AND
           (antigo->'id_int',antigo->'status_interno') IS NOT DISTINCT FROM (novo->'id_int',novo->'status_interno') THEN RETURN NULL; END IF;
        IF TG_TABLE_NAME='pedidos_links_cliente' AND
           (antigo->'numero_pedido',antigo->'status_arte',antigo->'ativo',antigo->'cliente_abriu_em') IS NOT DISTINCT FROM (novo->'numero_pedido',novo->'status_arte',novo->'ativo',novo->'cliente_abriu_em') THEN RETURN NULL; END IF;
    END IF;
    IF TG_TABLE_NAME='pedidos_links_cliente' THEN
        IF antigo->>'numero_pedido' ~ '^\d+$' THEN numero_antigo := (antigo->>'numero_pedido')::bigint; END IF;
        IF novo->>'numero_pedido' ~ '^\d+$' THEN numero_novo := (novo->>'numero_pedido')::bigint; END IF;
    ELSE
        numero_antigo := (antigo->>'id_int')::bigint;
        numero_novo := (novo->>'id_int')::bigint;
    END IF;
    PERFORM public.imposition_etapa_arte_registrar(numero_antigo);
    IF numero_novo IS DISTINCT FROM numero_antigo THEN PERFORM public.imposition_etapa_arte_registrar(numero_novo); END IF;
    RETURN NULL;
END $$;

-- Fim da transacao: enxerga o estado final de todos os modelos e fontes, sem
-- registrar etapas intermediarias de uma aprovacao que atualiza varias linhas.
CREATE CONSTRAINT TRIGGER etapa_arte_por_status AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_artes
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.imposition_etapa_arte_evento();
CREATE CONSTRAINT TRIGGER etapa_arte_por_modelo AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_modelos
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.imposition_etapa_arte_evento();
CREATE CONSTRAINT TRIGGER etapa_arte_por_proposta AFTER INSERT OR UPDATE OR DELETE ON public.propostas
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.imposition_etapa_arte_evento();
CREATE CONSTRAINT TRIGGER etapa_arte_por_link AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_links_cliente
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.imposition_etapa_arte_evento();

REVOKE ALL ON FUNCTION public.imposition_card_arte_calcular(text,text,text,text,boolean,jsonb),
    public.imposition_card_arte_ler(bigint), public.imposition_etapa_arte_registrar(bigint),
    public.imposition_etapa_arte_evento() FROM PUBLIC, anon, authenticated;
COMMIT;
