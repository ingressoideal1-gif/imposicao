-- Uma reserva por modelo. Cada via QR Ideal ocupa a sua posição na faixa da célula.
-- Aplicar após o preparo do esquema e a atualização dos consumidores da reserva.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(23063, 12);

DO $migration$
DECLARE
    rotina regprocedure;
    definicao text;
    trecho text;
    reativar boolean;
    ja_transformada boolean;
    antes_recusa text := $antes$OR (f->>'tipo'='TICKET' AND coalesce((e->>'ticket_pos')::integer,1)<>(f->>'posicao')::integer)))$antes$;
    depois_recusa text := $depois$OR (f->>'tipo'='TICKET' AND (e->'ticket_pos'='null'::jsonb OR coalesce((e->>'ticket_pos')::integer,1) NOT BETWEEN 1 AND (f->>'passo')::integer))))$depois$;
    antes_declaracao text := $antes$cursor_pool bigint; ocupado record; assinatura text; resultado jsonb:='[]'::jsonb;$antes$;
    antes_inicio text := $antes$  span:=(f->>'quantidade')::bigint*(f->>'passo')::bigint;$antes$;
    antes_alocacao text := $antes$    cursor_pool:=0;$antes$;
    depois_alocacao text := replace($depois$    IF f->>'tipo'='TICKET' THEN
     SELECT ARRAY(SELECT DISTINCT coalesce((e->>'ticket_pos')::integer,1) AS via
      FROM jsonb_array_elements(f->'elementos') e WHERE e->>'type'='QR_IDEAL' ORDER BY via)
     INTO vias_qr;
     IF cardinality(vias_qr)<2 THEN vias_qr:=NULL; END IF;
    END IF;
    cursor_pool:=0;$depois$, chr(13), '');
    antes_colunas text := $antes$capacidade,fonte_hash,pool_revisao)$antes$;
    antes_primeira text := $antes$(f->>'posicao')::integer,(f->>'quantidade')::integer,cursor_pool,span,assinatura,$antes$;
    antes_retorno text := $antes$CASE WHEN versao=2 THEN ctl.pool_revisao ELSE 'ideal-master-1' END) RETURNING * INTO c;$antes$;
    depois_retorno text := $depois$CASE WHEN versao=2 THEN ctl.pool_revisao ELSE 'ideal-master-1' END,vias_qr) RETURNING * INTO c;$depois$;
    portal_quantidade text := replace($antes$            m.quantidade::bigint * CASE
                WHEN n.tipo='TICKET' AND NOT codigos.tem_qr_ideal THEN codigos.vias
                ELSE 1
            END AS quantidade$antes$, chr(13), '');
    nova_quantidade text := replace($depois$            m.quantidade::bigint * CASE
                WHEN n.tipo IS DISTINCT FROM 'TICKET' THEN 1
                WHEN codigos.tem_qr_ideal AND contrato.modelo IS NOT NULL THEN coalesce(cardinality(contrato.posicoes),1)
                WHEN codigos.tem_qr_ideal THEN codigos.vias_qr_ideal
                ELSE codigos.vias
            END AS quantidade,
            contrato.posicoes IS NOT NULL AS contrato_multivia$depois$, chr(13), '');
    antes_vias text := replace($antes$                count(DISTINCT CASE
                    WHEN coalesce(e->'ticket_pos','null'::jsonb) IN ('null','false','0','""','true')
                    THEN 1
                    WHEN btrim(e->>'ticket_pos') ~ '^[+]?[0-9]+([.]0+)?$'
                    THEN (e->>'ticket_pos')::numeric
                END) AS vias$antes$, chr(13), '');
    depois_vias text := replace($depois$                count(DISTINCT vias.posicao) AS vias,
                count(DISTINCT vias.posicao) FILTER (WHERE e->>'type'='QR_IDEAL') AS vias_qr_ideal$depois$, chr(13), '');
    antes_lateral text := replace($antes$        CROSS JOIN LATERAL (
            SELECT count(*) AS elementos, bool_or(e->>'type'='QR_IDEAL') AS tem_qr_ideal,$antes$, chr(13), '');
    depois_lateral text := replace($depois$        LEFT JOIN public.producao_acesso_qr_contratos contrato
          ON contrato.pedido=v_pedido AND contrato.modelo=m.id
        CROSS JOIN LATERAL (
            SELECT count(*) AS elementos, bool_or(e->>'type'='QR_IDEAL') AS tem_qr_ideal,$depois$, chr(13), '');
    antes_elementos text := replace($antes$                THEN n.elements::jsonb ELSE '[]'::jsonb END) e
            WHERE e->>'type' IN ('QR_IDEAL','QR','BARCODE')$antes$, chr(13), '');
    depois_elementos text := replace($depois$                THEN n.elements::jsonb ELSE '[]'::jsonb END) e
            CROSS JOIN LATERAL (SELECT CASE
                WHEN coalesce(e->'ticket_pos','null'::jsonb) IN ('null','false','0','""','true') THEN 1
                WHEN btrim(e->>'ticket_pos') ~ '^[+]?[0-9]+([.]0+)?$' THEN (e->>'ticket_pos')::numeric
            END AS posicao) vias
            WHERE e->>'type' IN ('QR_IDEAL','QR','BARCODE')$depois$, chr(13), '');
    antes_legado text := $antes$IF pedido.publicado_em IS NOT NULL AND modelo.quantidade > modelo.celulas THEN$antes$;
    depois_legado text := replace($depois$IF pedido.publicado_em IS NOT NULL AND modelo.quantidade > modelo.celulas
          AND NOT modelo.contrato_multivia THEN$depois$, chr(13), '');
BEGIN
    IF (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
        WHERE oid='public.producao_acesso_qr_fonte(integer)'::regprocedure) <> 'b7dc88327f7ea008cfe56036c11e2a08' THEN
        RAISE EXCEPTION 'Fonte dos contratos QR Ideal mudou. Revisar a migração.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid='public.producao_acesso_qr_contratos'::regclass AND conname='qr12_posicoes_ticket') THEN
        RAISE EXCEPTION 'Preparar o esquema de posições de TICKET antes da ativação.';
    END IF;

    FOREACH rotina IN ARRAY ARRAY['public.producao_acesso_qr_contratos_obter(integer)'::regprocedure,
        'public.ideal_control_portal_reservar_qr(integer)'::regprocedure] LOOP
        definicao := replace(pg_get_functiondef(rotina), chr(13), '');
        ja_transformada := strpos(definicao, depois_retorno)>0;
        IF reativar IS NOT NULL AND reativar<>ja_transformada THEN
            RAISE EXCEPTION 'Alocadores de QR Ideal em estados diferentes. Revisar a migração.';
        END IF;
        reativar := ja_transformada;
        FOREACH trecho IN ARRAY CASE WHEN reativar THEN ARRAY[antes_recusa, depois_alocacao, depois_retorno,
            'capacidade,fonte_hash,pool_revisao,posicoes)']
            ELSE ARRAY[antes_recusa, antes_declaracao, antes_inicio, antes_alocacao,
            antes_colunas, antes_primeira, antes_retorno] END LOOP
            IF length(definicao)-length(replace(definicao, trecho, '')) <> length(trecho) THEN
                RAISE EXCEPTION 'Alocação dos contratos em % mudou. Revisar a migração.', rotina;
            END IF;
        END LOOP;
        definicao := replace(definicao, antes_recusa, depois_recusa);
        definicao := replace(definicao, 'uma posição de TICKET consistente', 'posições de TICKET entre 1 e o total de vias');
        IF reativar THEN
            EXECUTE definicao;
            CONTINUE;
        END IF;
        definicao := replace(definicao, antes_declaracao, antes_declaracao || ' vias_qr integer[];');
        definicao := replace(definicao, antes_inicio, '  vias_qr:=NULL;' || chr(10) || antes_inicio);
        definicao := replace(definicao, antes_alocacao, depois_alocacao);
        definicao := replace(definicao, antes_colunas, 'capacidade,fonte_hash,pool_revisao,posicoes)');
        definicao := replace(definicao, antes_primeira,
            $depois$coalesce(vias_qr[1],(f->>'posicao')::integer),(f->>'quantidade')::integer,cursor_pool,span,assinatura,$depois$);
        definicao := replace(definicao, antes_retorno, depois_retorno);
        EXECUTE definicao;
    END LOOP;

    definicao := replace(pg_get_functiondef('public.ideal_control_portal(text,text,boolean)'::regprocedure), chr(13), '');
    FOREACH trecho IN ARRAY CASE WHEN reativar THEN ARRAY[nova_quantidade, depois_lateral, depois_vias, depois_elementos, depois_legado]
        ELSE ARRAY[portal_quantidade, antes_lateral, antes_vias, antes_elementos, antes_legado] END LOOP
        IF length(definicao)-length(replace(definicao, trecho, '')) <> length(trecho) THEN
            RAISE EXCEPTION 'Contagem de credenciais do portal mudou. Revisar a migração.';
        END IF;
    END LOOP;
    IF reativar THEN RETURN; END IF;
    definicao := replace(definicao, portal_quantidade, nova_quantidade);
    definicao := replace(definicao, antes_lateral, depois_lateral);
    definicao := replace(definicao, antes_vias, depois_vias);
    definicao := replace(definicao, antes_elementos, depois_elementos);
    definicao := replace(definicao, antes_legado, depois_legado);
    EXECUTE definicao;
END $migration$;

COMMIT;
