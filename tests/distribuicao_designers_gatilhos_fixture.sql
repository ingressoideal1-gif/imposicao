-- EXCLUSIVO PARA BANCO DESCARTAVEL. Definicoes lidas em 31/10/2026; nenhum dado real.
-- Helpers de compatibilidade abaixo sao dublês, nao uma copia do catalogo completo.

ALTER TABLE pedidos_artes ALTER COLUMN id DROP IDENTITY;
ALTER TABLE pedidos_artes ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE pedidos_artes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE pedidos_artes ALTER COLUMN id_int TYPE integer;
ALTER TABLE pedidos_modelos ALTER COLUMN id_int TYPE integer;
ALTER TABLE pedidos_modelos ADD COLUMN amostra_num_id text, ADD COLUMN verso_tipo text, ADD COLUMN frente_verso boolean;
CREATE TABLE producao_numeracoes(id text PRIMARY KEY,print_mode text);
CREATE TABLE pagamentos_v2(id_int bigint,status text);
CREATE TABLE piloto_revisoes_pedidos(pedido integer PRIMARY KEY,revisao bigint DEFAULT 1,alterado_em timestamptz);
CREATE FUNCTION imposition_verso_tipo_do_modo_20261006(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT CASE WHEN $1='front' THEN 'SÓ FRENTE' ELSE 'FRENTE E VERSO' END$$;
CREATE FUNCTION imposition_categoria_vibe_20261006(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1 <> 'SÓ FRENTE'$$;
CREATE FUNCTION imposition_modo_compativel_vibe_20261006(text,text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT true$$;

-- Fonte: public.sync_status_arte_to_briefing; md5 catalogo: 36b7057d797f11d3c3420827cf5dcdfb
CREATE OR REPLACE FUNCTION public.sync_status_arte_to_briefing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalcular_status_arte_briefing(OLD.id_int);
        RETURN OLD;
    END IF;

    -- ITEM B: "UPDATE OF status_arte, id_int" dispara quando a coluna esta no
    -- SET, mesmo com valor identico. Write de linha inteira nao refaz a cadeia.
    IF TG_OP = 'UPDATE'
       AND NEW.status_arte IS NOT DISTINCT FROM OLD.status_arte
       AND NEW.id_int      IS NOT DISTINCT FROM OLD.id_int
    THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.id_int IS DISTINCT FROM NEW.id_int
    THEN
        PERFORM public.recalcular_status_arte_briefing(OLD.id_int);
        PERFORM public.recalcular_status_arte_briefing(NEW.id_int);
        RETURN NEW;
    END IF;

    PERFORM public.recalcular_status_arte_briefing(NEW.id_int);

    RETURN NEW;
END;
$function$
;

-- Fonte: public.imposition_modelo_verso_canonico_20261006; md5 catalogo: a91f94f747e70e7260677571f3e50d50
CREATE OR REPLACE FUNCTION public.imposition_modelo_verso_canonico_20261006()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE tipo text;
BEGIN
    -- Lock transacional por numeração, compartilhado pelos dois gatilhos.
    -- Não exige UPDATE no catálogo de quem só pode ler/vincular numerações.
    -- Deadlock ou timeout aborta a transação inteira.
    IF NEW.amostra_num_id IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
            'imposition-verso-20261006:' || NEW.amostra_num_id::text, 0));
    END IF;
    SELECT public.imposition_verso_tipo_do_modo_20261006(n.print_mode)
      INTO tipo FROM public.producao_numeracoes n
     WHERE n.id::text = NEW.amostra_num_id::text;
    IF tipo IS NOT NULL THEN
        NEW.verso_tipo := tipo;
        NEW.frente_verso := tipo <> 'SÓ FRENTE';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Sem modo conhecido: preservar o resumo persistido, inclusive quando
        -- um cliente antigo tenta sobrescrevê-lo durante a desvinculação.
        NEW.verso_tipo := OLD.verso_tipo;
        NEW.frente_verso := OLD.frente_verso;
    END IF;
    RETURN NEW;
END
$function$
;

-- Fonte: public.imposition_modelo_categoria_vibe_20261006; md5 catalogo: 778ebd792b969c7f9e7424e18f977109
CREATE OR REPLACE FUNCTION public.imposition_modelo_categoria_vibe_20261006()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE categoria boolean; modo text; conferir boolean := false;
BEGIN
 categoria := public.imposition_categoria_vibe_20261006(NEW.verso_tipo);
 -- Nunca substituir o texto enviado pelo Vibe pelo modo da numeracao.
 IF categoria IS NOT NULL THEN NEW.frente_verso := categoria; END IF;
 IF NEW.amostra_num_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('imposition-verso-vibe-20261006:' || NEW.amostra_num_id::text,0));
 END IF;
 -- Vibe pode mudar a categoria antes do ajuste manual da numeracao.
 -- Criacao do pedido tambem pode chegar com vinculo incompatível: a interface
 -- mostra a pendencia e impede gerar. Trocar um vinculo existente exige compatibilidade.
 IF TG_OP='UPDATE' THEN conferir := NEW.amostra_num_id IS DISTINCT FROM OLD.amostra_num_id; END IF;
 IF conferir AND NEW.amostra_num_id IS NOT NULL THEN
   SELECT n.print_mode INTO modo FROM public.producao_numeracoes n WHERE n.id::text=NEW.amostra_num_id::text;
   IF NOT public.imposition_modo_compativel_vibe_20261006(NEW.verso_tipo,modo) THEN
     RAISE EXCEPTION 'Numeracao incompativel com o pedido. Ajuste o tipo no Vibe ou escolha uma numeracao compativel.';
   END IF;
 END IF;
 RETURN NEW;
END $function$
;

-- Fonte: public.piloto_invalidar_pedido_v2; md5 catalogo: a696edfd762b3f9c68fdea489f2d9069
CREATE OR REPLACE FUNCTION public.piloto_invalidar_pedido_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE a jsonb; b jsonb; ids integer[];
BEGIN
  a := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  b := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  IF a=b THEN RETURN NULL; END IF;
  IF TG_TABLE_SCHEMA='storage' OR TG_TABLE_NAME IN ('producao_numeracoes','produtos','producao_mapas_teatro') THEN
    IF TG_TABLE_SCHEMA='storage' AND TG_OP='UPDATE'
      AND (a-'last_accessed_at')=(b-'last_accessed_at') THEN RETURN NULL; END IF;
    UPDATE public.piloto_revisao_catalogo SET revisao=revisao+1 WHERE id;
    RETURN NULL;
  ELSIF TG_TABLE_NAME='pedidos_modelos_banco' THEN
    SELECT array_agg(DISTINCT id_int ORDER BY id_int) INTO ids FROM public.pedidos_modelos
      WHERE id::text IN (a->>'modelo_id',b->>'modelo_id');
  ELSE
    SELECT array_agg(DISTINCT v::integer ORDER BY v::integer) INTO ids
      FROM (VALUES(a->>'id_int'),(b->>'id_int')) t(v) WHERE v ~ '^[1-9][0-9]{0,9}$';
  END IF;
  PERFORM public.piloto_marcar_pedidos_v2(ids);
  RETURN NULL;
END $function$
;

-- Fonte: public.piloto_marcar_pedidos_v2; md5 catalogo: f17005544cc0d03bb3b0f49c5a4ec7e3
CREATE OR REPLACE FUNCTION public.piloto_marcar_pedidos_v2(ids integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE n integer;
BEGIN
  -- Ordem estavel evita inversao de locks numa alteracao compartilhada.
  FOR n IN SELECT DISTINCT i FROM unnest(ids) i WHERE i > 0 ORDER BY i LOOP
    INSERT INTO public.piloto_revisoes_pedidos(pedido) VALUES(n)
    ON CONFLICT(pedido) DO UPDATE SET revisao=piloto_revisoes_pedidos.revisao+1,
      alterado_em=clock_timestamp();
  END LOOP;
END $function$
;

-- Fonte: public.imposition_numeracao_verso_canonico_20261006; md5 catalogo: 4012827c3b7474aa4fee11609aaf2974
CREATE OR REPLACE FUNCTION public.imposition_numeracao_verso_canonico_20261006()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE tipo text;
BEGIN
    tipo := public.imposition_verso_tipo_do_modo_20261006(NEW.print_mode);
    IF tipo IS NOT NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
            'imposition-verso-20261006:' || NEW.id::text, 0));
        UPDATE public.pedidos_modelos m
           SET verso_tipo = tipo, frente_verso = tipo <> 'SÓ FRENTE'
         WHERE m.amostra_num_id::text = NEW.id::text
           AND (m.verso_tipo IS DISTINCT FROM tipo
                OR m.frente_verso IS DISTINCT FROM (tipo <> 'SÓ FRENTE'));
    END IF;
    RETURN NEW;
END
$function$
;

-- Fonte: public.imposition_numeracao_categoria_vibe_20261006; md5 catalogo: 549538fd615e2775ac9f238ed0924511
CREATE OR REPLACE FUNCTION public.imposition_numeracao_categoria_vibe_20261006()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('imposition-verso-vibe-20261006:' || NEW.id::text,0));
 -- Todos os vinculos, inclusive os nao visiveis ao editor. Erro generico, sem
 -- revelar IDs ou dados de outros clientes. Nenhum modelo e atualizado aqui.
 IF EXISTS (SELECT 1 FROM public.pedidos_modelos m WHERE m.amostra_num_id::text=NEW.id::text
   AND NOT public.imposition_modo_compativel_vibe_20261006(m.verso_tipo,NEW.print_mode)) THEN
   RAISE EXCEPTION 'Modo incompativel com pedido vinculado. Ajuste no Vibe ou use numeracao exclusiva.';
 END IF;
 RETURN NEW;
END $function$
;

-- Fonte: public.recalcular_status_arte_briefing; md5 catalogo: b9657ee6b05e6b01e7416e1e14fa1c37
CREATE OR REPLACE FUNCTION public.recalcular_status_arte_briefing(p_id_int integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_total_modelos integer;
    v_aprovados integer;
    v_arte_id uuid;
    v_novo_status text;
BEGIN
    IF p_id_int IS NULL THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (
            -- ITEM D: lista unica de aprovados, com APROVADO e APROVADA.
            WHERE COALESCE(UPPER(status_arte), '') IN (
                'APROVADO',
                'APROVADA',
                'APROVADA_CLIENTE',
                'LIBERADA',
                'IMPRESSA',
                'NAO_NECESSARIA'
            )
        )
    INTO
        v_total_modelos,
        v_aprovados
    FROM public.pedidos_modelos
    WHERE id_int = p_id_int;

    IF v_total_modelos = 0 THEN
        RETURN;
    END IF;

    IF v_total_modelos = v_aprovados THEN
        v_novo_status := 'APROVADO';
    ELSIF v_aprovados > 0 THEN
        v_novo_status := 'APROVADO PARCIAL';
    ELSE
        v_novo_status := 'EM ARTE';
    END IF;

    SELECT id
    INTO v_arte_id
    FROM public.pedidos_artes
    WHERE id_int = p_id_int
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_arte_id IS NOT NULL THEN
        UPDATE public.pedidos_artes
        SET status = v_novo_status
        WHERE id = v_arte_id
          AND COALESCE(status, '') <> v_novo_status;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.imposition_card_arte_calcular(p_global text, p_entrega text, p_status text, p_interno text, p_abriu boolean, p_modelos jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.imposition_card_arte_ler(p_numero bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.atualizar_status_proposta_por_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id_int BIGINT;
  v_total_pagamentos INTEGER;
  v_pendentes INTEGER;
BEGIN

  v_id_int := COALESCE(NEW.id_int, OLD.id_int);

  SELECT COUNT(*)
  INTO v_total_pagamentos
  FROM pagamentos_v2
  WHERE id_int = v_id_int;

  SELECT COUNT(*)
  INTO v_pendentes
  FROM pagamentos_v2
  WHERE id_int = v_id_int
    AND status <> 'PAGO';

  IF v_total_pagamentos = 0 THEN

    UPDATE propostas
    SET status_interno = 'NOVO'
    WHERE id_int = v_id_int;

  ELSIF v_pendentes > 0 THEN

    UPDATE propostas
    SET status_interno = 'A_RECEBER'
    WHERE id_int = v_id_int;

  ELSE

    UPDATE propostas
    SET status_interno = 'QUITADO'
    WHERE id_int = v_id_int;

  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER tg_atualiza_status_proposta_pagamento AFTER INSERT OR DELETE OR UPDATE ON pagamentos_v2 FOR EACH ROW EXECUTE FUNCTION atualizar_status_proposta_por_pagamento();
CREATE TRIGGER piloto_revisao_v2 AFTER INSERT OR DELETE OR UPDATE ON pedidos_artes FOR EACH ROW EXECUTE FUNCTION piloto_invalidar_pedido_v2();
CREATE TRIGGER imposition_modelo_categoria_vibe_20261006 BEFORE INSERT OR UPDATE OF verso_tipo, frente_verso, amostra_num_id ON pedidos_modelos FOR EACH ROW EXECUTE FUNCTION imposition_modelo_categoria_vibe_20261006();
CREATE TRIGGER imposition_modelo_verso_canonico_20261006 BEFORE INSERT OR UPDATE OF amostra_num_id, verso_tipo, frente_verso ON pedidos_modelos FOR EACH ROW EXECUTE FUNCTION imposition_modelo_verso_canonico_20261006();
CREATE TRIGGER trg_sync_modelos_to_artes AFTER INSERT OR DELETE OR UPDATE OF status_arte, id_int ON pedidos_modelos FOR EACH ROW EXECUTE FUNCTION sync_status_arte_to_briefing();
CREATE TRIGGER imposition_numeracao_categoria_vibe_20261006 BEFORE UPDATE OF print_mode ON producao_numeracoes FOR EACH ROW WHEN (old.print_mode IS DISTINCT FROM new.print_mode) EXECUTE FUNCTION imposition_numeracao_categoria_vibe_20261006();
CREATE TRIGGER imposition_numeracao_verso_canonico_20261006 AFTER UPDATE OF print_mode ON producao_numeracoes FOR EACH ROW WHEN (old.print_mode IS DISTINCT FROM new.print_mode) EXECUTE FUNCTION imposition_numeracao_verso_canonico_20261006();
