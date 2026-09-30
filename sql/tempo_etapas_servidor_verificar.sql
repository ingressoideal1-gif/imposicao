BEGIN READ ONLY;
-- Copiar a celula verificacao_tempo inteira. Esperado: quatro gatilhos O/true/true,
-- painel_le=true e todas as permissoes de escrita/execucao abaixo=false.
SELECT jsonb_build_object(
    'gatilhos', (SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (
        SELECT t.tgname,t.tgenabled,t.tgdeferrable,t.tginitdeferred
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND t.tgname IN
            ('etapa_arte_por_status','etapa_arte_por_modelo','etapa_arte_por_proposta','etapa_arte_por_link')
        ORDER BY t.tgname
    ) g),
    'permissoes', jsonb_build_object(
        'painel_le', has_table_privilege('authenticated','public.imposition_etapas_arte','SELECT'),
        'painel_pode_inserir', has_table_privilege('authenticated','public.imposition_etapas_arte','INSERT'),
        'painel_pode_atualizar', has_table_privilege('authenticated','public.imposition_etapas_arte','UPDATE'),
        'painel_pode_excluir', has_table_privilege('authenticated','public.imposition_etapas_arte','DELETE'),
        'painel_pode_reiniciar', has_function_privilege('authenticated','public.imposition_etapa_arte_registrar(bigint)','EXECUTE')
    ),
    'resumo', (SELECT jsonb_build_object('pedidos',count(*),
        'com_inicio',count(*) FILTER (WHERE desde IS NOT NULL),
        'sem_inicio',count(*) FILTER (WHERE desde IS NULL)) FROM public.imposition_etapas_arte),
    'pedidos', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM (
        SELECT id_int,card,desde AT TIME ZONE 'America/Sao_Paulo' AS inicio_brasilia
        FROM public.imposition_etapas_arte
        WHERE id_int IN (22899,22843,22830,22816,22815,22806,22800,22602) ORDER BY id_int DESC
    ) p),
    'historico', (SELECT coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) FROM (
        SELECT id_int,card,entrou_em,saiu_em FROM public.imposition_etapas_arte_historico
        WHERE id_int IN (22899,22843,22830,22816,22815,22806,22800,22602) ORDER BY id DESC LIMIT 80
    ) h)
) AS verificacao_tempo;
COMMIT;
