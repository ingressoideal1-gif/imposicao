-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_contratado_x_banco.sql
-- Documentado em docs/conferencia_pedido_21202.md
-- Somente leitura. Onde a quantidade CONTRATADA nao bate com o que o banco da
-- numeracao entrega. E' essa diferenca que faz a tela mostrar um numero antes
-- de o banco descer e outro depois.
with base as (
  select
      pm.id,
      pm.nome_modelo,
      pm.quantidade                                as contratada,
      n.name                                       as numeracao,
      jsonb_array_length(n.csv_data::jsonb)        as linhas_no_banco,
      pm.csv_selecao is not null                   as tem_recorte,
      count(*) over (partition by n.id)            as modelos_na_mesma_numeracao,
      f.cols * f.rows                              as por_folha
  from pedidos_modelos pm
  join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  left join producao_formatos f on f.id::text = n.formato_id::text
  where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */ and n.csv_data is not null
)
select
    id, numeracao, contratada, linhas_no_banco,
    modelos_na_mesma_numeracao as modelos_juntos, tem_recorte,
    por_folha,
    ceil(contratada::numeric / nullif(por_folha, 0))      as folhas_pela_contratada,
    ceil(linhas_no_banco::numeric / nullif(por_folha, 0)) as folhas_pelo_banco,
    nome_modelo
from base
where contratada <> linhas_no_banco
   or modelos_na_mesma_numeracao > 1
order by abs(contratada - linhas_no_banco) desc, id;

