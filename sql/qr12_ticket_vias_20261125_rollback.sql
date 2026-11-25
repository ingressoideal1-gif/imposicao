-- Suspende novas reservas de múltiplas vias e conserva a leitura das já emitidas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(23063, 12);

DO $rollback$
DECLARE
    rotina regprocedure;
    definicao text;
    trecho text := $antes$OR (f->>'tipo'='TICKET' AND (e->'ticket_pos'='null'::jsonb OR coalesce((e->>'ticket_pos')::integer,1) NOT BETWEEN 1 AND (f->>'passo')::integer))))$antes$;
    anterior text := $depois$OR (f->>'tipo'='TICKET' AND coalesce((e->>'ticket_pos')::integer,1)<>(f->>'posicao')::integer)))$depois$;
BEGIN
    FOREACH rotina IN ARRAY ARRAY['public.producao_acesso_qr_contratos_obter(integer)'::regprocedure,
        'public.ideal_control_portal_reservar_qr(integer)'::regprocedure] LOOP
        definicao := replace(pg_get_functiondef(rotina), chr(13), '');
        IF length(definicao)-length(replace(definicao, trecho, '')) <> length(trecho)
           OR strpos(definicao, 'END,vias_qr) RETURNING * INTO c;')=0 THEN
            RAISE EXCEPTION 'Alocação dos contratos em % mudou. Revisar a reversão.', rotina;
        END IF;
        definicao := replace(definicao, trecho, anterior);
        definicao := replace(definicao, 'posições de TICKET entre 1 e o total de vias', 'uma posição de TICKET consistente');
        EXECUTE definicao;
    END LOOP;
END $rollback$;

COMMIT;
