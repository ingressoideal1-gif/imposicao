-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_numeracoes_do_pedido.sql
-- Documentado em docs/conferencia_pedido_21202.md
-- Somente leitura: no pedido 21202, cada numeracao usada, quantos modelos a
-- usam, a soma das quantidades contratadas e quantas linhas o banco dela tem.
-- Onde a soma nao bate com o banco, a tela vai mostrar um numero diferente do
-- contratado assim que o banco descer.
select
    n.name                                   as numeracao,
    count(*)                                 as modelos,
    sum(pm.quantidade)                       as soma_contratada,
    case when n.csv_data is null then null
         else jsonb_array_length(n.csv_data::jsonb) end as linhas_no_banco,
    count(*) filter (where pm.csv_selecao is not null) as com_recorte,
    string_agg(pm.id::text || ':' || pm.quantidade, ', ' order by pm.id) as modelos_e_qtds
from pedidos_modelos pm
join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */
group by n.id, n.name, n.csv_data
having count(*) > 0
order by (sum(pm.quantidade) <> coalesce(
             case when n.csv_data is null then null
                  else jsonb_array_length(n.csv_data::jsonb) end, sum(pm.quantidade))) desc,
         n.name;

