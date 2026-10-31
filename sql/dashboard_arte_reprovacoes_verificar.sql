BEGIN READ ONLY;
SELECT iniciado_em FROM public.imposition_reprovacoes_inicio;
SELECT count(*) AS ocorrencias, count(DISTINCT (pedido,acao)) AS acoes_unicas
FROM public.imposition_reprovacoes_arte;
SELECT tgname,tgenabled FROM pg_trigger WHERE tgname IN ('imposition_reprovacao_modelo','imposition_reprovacao_pedido');
SELECT has_table_privilege('anon','public.imposition_reprovacoes_arte','SELECT') AS anon_deve_ser_false,
    has_table_privilege('authenticated','public.imposition_reprovacoes_arte','INSERT') AS escrita_deve_ser_false,
    has_table_privilege('authenticated','public.imposition_reprovacoes_arte','SELECT') AS leitura_deve_ser_true;
COMMIT;
