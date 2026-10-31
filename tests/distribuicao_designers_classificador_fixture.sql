-- Cópia das funções existentes, consultadas em 31/10/2026. Somente testes sintéticos.
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
