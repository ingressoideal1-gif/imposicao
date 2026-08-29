-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_pedido_por_modelo.sql
-- Documentado em docs/conferencia_pedido_21202.md
--
-- Tres perguntas sobre cada modelo do pedido:
--   1. o banco entrega a quantidade contratada?
--   2. o DIA do nome do modelo bate com o dia no nome da numeracao?
--   3. ha' banco compartilhado sem recorte?
--
-- ATENCAO — a armadilha: a pergunta 1 NAO se responde com
-- `jsonb_array_length(csv_data)`. Esse e' o banco CRU, e o produto aplica o corte
-- de `linhasComDadoDaNumeracao` antes de decidir o que o modelo imprime: linha
-- sem dado em nenhuma das colunas que ESTA numeracao le nao e' celula deste
-- modelo. Ver o cabecalho de conferir_contratado_x_banco.sql para o alarme falso
-- que a versao ingenua produziu em 29/08/2026.
--
-- O gabarito_operacional do ERP NAO entra na conferencia: ele diverge da
-- numeracao em casos onde a numeracao esta certa (o modelo 1000602 e' de 12/set,
-- com numeracao `Backstage 12` correta, e o gabarito diz `Backstage 11`).
-- Ele aparece so' como informacao, na ultima coluna.
with m as (
  select pm.id,
         pm.nome_modelo,
         pm.quantidade                                   as contratada,
         pm.gabarito_operacional                         as gabarito_do_erp,
         pm.csv_selecao is not null                      as tem_recorte,
         n.id                                            as num_id,
         n.name                                          as numeracao_ligada,
         n.csv_data::jsonb                               as banco,
         coalesce(n.elements::jsonb, '[]'::jsonb)        as elems,
         count(*) over (partition by n.id)               as modelos_na_mesma,
         substring(pm.nome_modelo from '^([0-9]{2})/')   as dia_do_modelo,
         substring(n.name from '([0-9]{2})$')            as dia_da_numeracao
  from pedidos_modelos pm
  left join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */
),
cols as (
  select m.id,
         array_remove(array_agg(distinct case
             when e->>'source' = 'database' and btrim(coalesce(e->>'csv_column','')) <> ''
             then e->>'csv_column' end), null) as colunas
  from m left join lateral jsonb_array_elements(m.elems) e on true
  group by m.id
),
conta as (
  select m.*, c.colunas,
         case when m.banco is null then null else
           (select count(*) from jsonb_array_elements(m.banco) r
              where coalesce(r->>'__ativo','true') <> 'false'
                and (coalesce(array_length(c.colunas,1),0) = 0
                     or exists (select 1 from unnest(c.colunas) k
                                 where btrim(coalesce(r->>k,'')) <> '')))
         end as imprime
  from m join cols c on c.id = m.id
)
select id,
       contratada,
       imprime,
       case
         when numeracao_ligada is null                 then '1. SEM NUMERACAO LIGADA'
         when imprime is null                          then '2. numeracao sem banco'
         when contratada <> imprime                    then '3. O QUE IMPRIME NAO BATE COM O CONTRATADO'
         when dia_do_modelo is not null
          and dia_da_numeracao is not null
          and dia_do_modelo <> dia_da_numeracao        then '4. DIA DIFERENTE'
         when modelos_na_mesma > 1 and not tem_recorte then '5. banco compartilhado sem recorte'
         else 'ok'
       end                                             as achado,
       jsonb_array_length(banco)                       as linhas_brutas,
       array_to_string(colunas, ' + ')                 as colunas_lidas,
       dia_do_modelo, dia_da_numeracao,
       modelos_na_mesma, tem_recorte,
       numeracao_ligada,
       gabarito_do_erp,
       nome_modelo
from conta
order by
    case
      when numeracao_ligada is null then 1
      when imprime is null then 2
      when contratada <> imprime then 3
      when dia_do_modelo is not null and dia_da_numeracao is not null
           and dia_do_modelo <> dia_da_numeracao then 4
      when modelos_na_mesma > 1 and not tem_recorte then 5
      else 9
    end,
    id;
