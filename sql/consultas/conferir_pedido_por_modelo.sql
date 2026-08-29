-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_pedido_por_modelo.sql
-- Documentado em docs/conferencia_pedido_21202.md
-- ANALISE DO PEDIDO 21202 â€” SOMENTE LEITURA.
-- Nenhuma linha e escrita. Sao tres perguntas sobre cada modelo:
--   1. o banco da numeracao entrega a quantidade contratada?
--   2. o DIA do nome do modelo bate com o dia no nome da numeracao?
--   3. o gabarito que o ERP pediu bate com a numeracao que foi ligada?
with m as (
  select
      pm.id,
      pm.nome_modelo,
      pm.quantidade                                   as contratada,
      pm.gabarito_operacional                         as gabarito_do_erp,
      n.name                                          as numeracao_ligada,
      case when n.csv_data is null then null
           else jsonb_array_length(n.csv_data::jsonb) end as linhas_no_banco,
      pm.csv_selecao is not null                      as tem_recorte,
      count(*) over (partition by n.id)               as modelos_na_mesma,
      -- o dia que abre o nome do modelo: "05/set ..." -> "05"
      substring(pm.nome_modelo from '^([0-9]{2})/')   as dia_do_modelo,
      -- o dia que fecha o nome da numeracao: "... 05" -> "05"
      substring(n.name from '([0-9]{2})$')            as dia_da_numeracao
  from pedidos_modelos pm
  left join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */
)
select
    id,
    contratada,
    linhas_no_banco,
    case
      when numeracao_ligada is null                      then '1. SEM NUMERACAO LIGADA'
      when linhas_no_banco is null                       then '2. numeracao sem banco'
      when contratada <> linhas_no_banco                 then '3. BANCO NAO BATE COM O CONTRATADO'
      when dia_do_modelo is not null
       and dia_da_numeracao is not null
       and dia_do_modelo <> dia_da_numeracao             then '4. DIA DIFERENTE'
      when dia_do_modelo is not null
       and dia_da_numeracao is null                      then '5. numeracao sem o dia no nome'
      when modelos_na_mesma > 1 and not tem_recorte      then '6. banco dividido sem recorte'
      else 'ok'
    end                                                  as achado,
    dia_do_modelo, dia_da_numeracao,
    modelos_na_mesma, tem_recorte,
    numeracao_ligada,
    gabarito_do_erp,
    nome_modelo
from m
order by
    case
      when numeracao_ligada is null then 1
      when linhas_no_banco is null then 2
      when contratada <> linhas_no_banco then 3
      when dia_do_modelo is not null and dia_da_numeracao is not null
           and dia_do_modelo <> dia_da_numeracao then 4
      when dia_do_modelo is not null and dia_da_numeracao is null then 5
      when modelos_na_mesma > 1 and not tem_recorte then 6
      else 9
    end,
    id;

