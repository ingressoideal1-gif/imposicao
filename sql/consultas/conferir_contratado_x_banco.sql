-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_contratado_x_banco.sql
-- Documentado em docs/conferencia_pedido_21202.md
--
-- A quantidade contratada bate com o que o modelo REALMENTE imprime?
--
-- ATENCAO — a armadilha que esta consulta existe para evitar:
-- contar `jsonb_array_length(csv_data)` NAO responde a pergunta. Esse e' o banco
-- CRU. O `fatiaCsvDoItem` do frontend aplica dois cortes antes de decidir o que
-- o modelo imprime:
--   1. o recorte do modelo (csv_selecao), quando existe;
--   2. `linhasComDadoDaNumeracao` — linha sem dado em NENHUMA das colunas que
--      ESTA numeracao le nao e' celula deste modelo.
-- Em 29/08/2026 a versao ingenua desta consulta acusou o modelo 1000565 de ter
-- 3.000 contratadas contra 12.806 linhas. Era banco-mestre: so 3.000 linhas
-- tinham a coluna `Codigo` preenchida, e o material ja tinha saido certo.
-- Alarme falso em conferencia e' pior do que conferencia nenhuma.
--
-- O corte por csv_selecao NAO e' reproduzido aqui (a semantica dele mora no
-- CsvEditor.fatiaDoModelo). A coluna `tem_recorte` avisa quando ele existe: nesse
-- caso `imprime` e' um teto, e quem manda e' a tela.
with m as (
  select pm.id,
         pm.nome_modelo,
         pm.quantidade                             as contratada,
         pm.csv_selecao is not null                as tem_recorte,
         n.name                                    as numeracao,
         n.csv_data::jsonb                         as banco,
         coalesce(n.elements::jsonb, '[]'::jsonb)  as elems
  from pedidos_modelos pm
  join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */
    and n.csv_data is not null
),
-- As colunas que a numeracao le do banco: elemento com source='database'.
-- E' a mesma lista de `colunasDoBancoDaNumeracao` no frontend.
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
         (select count(*) from jsonb_array_elements(m.banco) r
            where coalesce(r->>'__ativo','true') <> 'false'
              and (coalesce(array_length(c.colunas,1),0) = 0
                   or exists (select 1 from unnest(c.colunas) k
                               where btrim(coalesce(r->>k,'')) <> ''))
         ) as imprime
  from m join cols c on c.id = m.id
)
select id,
       contratada,
       jsonb_array_length(banco)          as linhas_brutas,
       imprime,
       contratada - imprime               as falta,
       tem_recorte,
       array_to_string(colunas, ' + ')    as colunas_lidas,
       numeracao,
       nome_modelo
from conta
order by abs(contratada - imprime) desc, id;
