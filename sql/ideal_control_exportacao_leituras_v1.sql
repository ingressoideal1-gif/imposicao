-- Uma exportação lê um único retrato do evento. As Edge Functions verificam
-- a autorização do evento antes de chamar esta função com service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.producao_acesso_exportar_leituras_v1(
    p_evento_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    WITH amostra AS (
        SELECT l.id, l.evento_id, l.momento, l.recebido_em, l.tipo, l.resultado,
               l.motivo, l.setor_id, l.dispositivo_id, l.credencial_id,
               row_number() OVER (ORDER BY l.momento, l.id) AS posicao
        FROM public.producao_acesso_leituras AS l
        WHERE l.evento_id = p_evento_id
        ORDER BY l.momento, l.id
        LIMIT 30001
    )
    SELECT jsonb_build_object(
        'leituras', coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'momento', l.momento,
                    'recebido_em', l.recebido_em,
                    'tipo', l.tipo,
                    'resultado', l.resultado,
                    'motivo', l.motivo,
                    'setor', s.nome,
                    'aparelho', a.nome,
                    'numero', c.numero
                ) ORDER BY l.posicao
            ) FILTER (WHERE l.posicao <= 30000),
            '[]'::jsonb
        ),
        'ha_mais', count(*) > 30000
    )
    FROM amostra AS l
    LEFT JOIN public.producao_acesso_setores AS s
        ON s.id = l.setor_id AND s.evento_id = l.evento_id
    LEFT JOIN public.producao_acesso_dispositivos AS a
        ON a.id = l.dispositivo_id AND a.evento_id = l.evento_id
    LEFT JOIN public.producao_acesso_credenciais AS c
        ON c.id = l.credencial_id
       AND (c.evento_id = l.evento_id OR c.evento_id IS NULL);
$$;

REVOKE ALL ON FUNCTION public.producao_acesso_exportar_leituras_v1(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_exportar_leituras_v1(uuid)
    TO service_role;

COMMIT;
