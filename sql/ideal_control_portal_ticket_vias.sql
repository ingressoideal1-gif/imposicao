BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
    definicao text := replace(pg_get_functiondef(
        'public.ideal_control_portal(text,text,boolean)'::regprocedure), chr(13), '');
    anterior text := replace($antes$    FOR modelo IN
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
    END LOOP;$antes$, chr(13), '');
    novo text := replace($depois$    FOR modelo IN
        SELECT m.id,m.nome_modelo,m.quantidade AS celulas,
            m.quantidade::bigint * CASE
                WHEN n.tipo='TICKET' AND NOT codigos.tem_qr_ideal THEN codigos.vias
                ELSE 1
            END AS quantidade
        FROM public.pedidos_modelos m JOIN public.producao_numeracoes n
          ON n.id::text=m.amostra_num_id::text
        CROSS JOIN LATERAL (
            SELECT count(*) AS elementos, bool_or(e->>'type'='QR_IDEAL') AS tem_qr_ideal,
                count(DISTINCT CASE
                    WHEN coalesce(e->'ticket_pos','null'::jsonb) IN ('null','false','0','""','true')
                    THEN 1
                    WHEN btrim(e->>'ticket_pos') ~ '^[+]?[0-9]+([.]0+)?$'
                    THEN (e->>'ticket_pos')::numeric
                END) AS vias
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array'
                THEN n.elements::jsonb ELSE '[]'::jsonb END) e
            WHERE e->>'type' IN ('QR_IDEAL','QR','BARCODE')
              AND coalesce(e->>'source','') <> 'database'
              AND coalesce(e->'fixed','null'::jsonb) IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
        ) codigos
        WHERE m.id_int=v_pedido AND m.quantidade>0 AND codigos.elementos>0
        ORDER BY m.id
    LOOP
        -- O legado publicado continua acessível se o modelo inteiro ainda
        -- está no formato anterior, com um único ordinal por célula.
        IF pedido.publicado_em IS NOT NULL AND modelo.quantidade > modelo.celulas THEN
            SELECT count(*) INTO v_quantidade FROM public.producao_acesso_credenciais
                WHERE pedido_id_int=v_pedido AND modelo_id=modelo.id;
            IF v_quantidade = modelo.celulas THEN
                modelo.quantidade := modelo.celulas;
            END IF;
        END IF;
        SELECT count(DISTINCT numero) INTO v_quantidade FROM public.producao_acesso_credenciais
            WHERE pedido_id_int=v_pedido AND modelo_id=modelo.id
              AND numero BETWEEN 1 AND modelo.quantidade;
        IF v_quantidade <> modelo.quantidade THEN completa := false; END IF;
        total := total + modelo.quantidade;
        modelos := modelos || jsonb_build_array(jsonb_build_object(
            'id',modelo.id,'nome_modelo',modelo.nome_modelo,'quantidade',modelo.celulas
        ));
    END LOOP;$depois$, chr(13), '');
BEGIN
    IF strpos(definicao, anterior) = 0
       OR strpos(replace(definicao, anterior, ''), 'SELECT m.id,m.nome_modelo,m.quantidade') > 0 THEN
        RAISE EXCEPTION 'Contagem da função ideal_control_portal mudou. Revisar a definição vigente.';
    END IF;
    EXECUTE replace(definicao, anterior, novo);
END $migration$;

COMMIT;
