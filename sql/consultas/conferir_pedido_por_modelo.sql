-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_pedido_por_modelo.sql
-- Documentado em docs/conferencia_pedido_21202.md, docs/conferencia_pedido_21460.md
-- e docs/conferencia_pedido_21408.md (o modo PDF Paginado).
--
-- Tres perguntas sobre cada modelo do pedido:
--   1. o banco entrega a quantidade contratada?
--   2. o DIA do nome do modelo bate com o dia no nome da numeracao?
--   3. ha' banco compartilhado sem recorte?
--
-- ATENCAO 1 — a armadilha original: a pergunta 1 NAO se responde com
-- `jsonb_array_length(csv_data)`. Esse e' o banco CRU, e o produto aplica o corte
-- de `linhasComDadoDaNumeracao` antes de decidir o que o modelo imprime: linha
-- sem dado em nenhuma das colunas que ESTA numeracao le nao e' celula deste
-- modelo. Ver o cabecalho de conferir_contratado_x_banco.sql para o alarme falso
-- que a versao ingenua produziu em 29/08/2026.
--
-- ATENCAO 2 — o banco pode nao estar dentro da numeracao. Desde 27/08/2026 ele
-- e' um registro do PEDIDO (`pedidos_bancos`), e a coluna de cada elemento vem
-- do modelo (`pedidos_modelos_banco.csv_mapa`, chave `el:<id>`). Sem isso a
-- conferencia dava "numeracao sem banco" em modelo que tem banco — foi o que
-- teria acontecido com os cinco modelos do 21460.
--
-- ATENCAO 3 — MODO PDF PAGINADO (01/09/2026, pedido 21408). Modelo com
-- `modo_pdf` nao tira a quantidade de banco nenhum: o frontend forca o schema
-- `pdf_multiple` e o motor gasta UMA PAGINA do arquivo da frente por peca (ver
-- `page_idx_front` no engine.py). Banco vazio ali e' o normal, e a versao
-- anterior desta consulta acusava "2. numeracao sem banco" nos dois modelos do
-- 21408 — alarme falso, e pior, escondia que a pergunta certa (o arquivo tem
-- tantas paginas quanto a quantidade contratada?) nao estava sendo feita por
-- ninguem. SQL nao conta pagina de PDF; quem conta e'
-- `ferramentas/conferir_paginas_pdf.py`, e e' para la que o achado aponta.
--
-- ATENCAO 4 — "banco compartilhado sem recorte" (achado 5) so' vale para o
-- caminho legado. Com banco do pedido, compartilhar e' o normal: cada modelo le
-- a SUA coluna do mesmo banco-mestre, e nao ha o que recortar. Por isso o achado
-- 5 nao dispara quando os modelos leem colunas diferentes.
--
-- O gabarito_operacional do ERP NAO entra na conferencia: ele diverge da
-- numeracao em casos onde a numeracao esta certa (o modelo 1000602 e' de 12/set,
-- com numeracao `Backstage 12` correta, e o gabarito diz `Backstage 11`).
-- Ele aparece so' como informacao, na ultima coluna.
with m as (
  select pm.id,
         pm.nome_modelo,
         pm.quantidade                                   as contratada,
         coalesce(pm.modo_pdf, false)                    as modo_pdf,
         pm.gabarito_operacional                         as gabarito_do_erp,
         pm.csv_selecao is not null                      as tem_recorte,
         n.id                                            as num_id,
         n.name                                          as numeracao_ligada,
         coalesce(b.csv_data::jsonb, n.csv_data::jsonb)  as banco,
         case when b.id is null then 'na numeracao' else 'do pedido: ' || b.nome end as origem_do_banco,
         coalesce(n.elements::jsonb, '[]'::jsonb)        as elems,
         coalesce(v.csv_mapa::jsonb, '{}'::jsonb)        as mapa,
         count(*) over (partition by n.id)               as modelos_na_mesma,
         substring(pm.nome_modelo from '^([0-9]{2})/')   as dia_do_modelo,
         substring(n.name from '([0-9]{2})$')            as dia_da_numeracao
  from pedidos_modelos pm
  left join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  left join pedidos_modelos_banco v on v.modelo_id = pm.id::text
  left join pedidos_bancos b on b.id = v.banco_id
  where pm.id_int = 21460  /* <<< TROQUE AQUI o numero do pedido */
),
-- Espelho de `BancoDoModelo.colunaDoElemento`: a chave por elemento (`el:<id>`)
-- vence sempre; sem ela vale o `csv_column` da peca, passado pelo mapa por nome.
cols as (
  select m.id,
         array_remove(array_agg(distinct case
             when e->>'source' = 'database' then
               coalesce(
                 nullif(btrim(coalesce(m.mapa->>('el:' || coalesce(e->>'id','')), '')), ''),
                 nullif(btrim(coalesce(m.mapa->>(e->>'csv_column'), '')), ''),
                 nullif(btrim(coalesce(e->>'csv_column','')), '')
               )
             end), null) as colunas
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
         end as imprime,
         -- Quantos modelos deste pedido leem EXATAMENTE as mesmas colunas desta
         -- numeracao. E' isso que caracteriza banco compartilhado de verdade;
         -- ler colunas diferentes do mesmo banco-mestre e' o desenho normal.
         count(*) over (partition by m.num_id, c.colunas)  as modelos_nas_mesmas_colunas
  from m join cols c on c.id = m.id
)
select id,
       contratada,
       imprime,
       case
         when numeracao_ligada is null                        then '1. SEM NUMERACAO LIGADA'
         when modo_pdf                                        then '6. PDF Paginado: conferir as paginas do arquivo'
         when imprime is null                                 then '2. numeracao sem banco'
         when contratada <> imprime                           then '3. O QUE IMPRIME NAO BATE COM O CONTRATADO'
         when dia_do_modelo is not null
          and dia_da_numeracao is not null
          and dia_do_modelo <> dia_da_numeracao               then '4. DIA DIFERENTE'
         when modelos_nas_mesmas_colunas > 1 and not tem_recorte
                                                              then '5. banco compartilhado sem recorte'
         else 'ok'
       end                                                    as achado,
       case when banco is null then null else jsonb_array_length(banco) end as linhas_brutas,
       array_to_string(colunas, ' + ')                 as colunas_lidas,
       modo_pdf,
       origem_do_banco,
       dia_do_modelo, dia_da_numeracao,
       modelos_na_mesma, modelos_nas_mesmas_colunas, tem_recorte,
       numeracao_ligada,
       gabarito_do_erp,
       nome_modelo
from conta
order by
    case
      when numeracao_ligada is null then 1
      when modo_pdf then 6
      when imprime is null then 2
      when contratada <> imprime then 3
      when dia_do_modelo is not null and dia_da_numeracao is not null
           and dia_do_modelo <> dia_da_numeracao then 4
      when modelos_nas_mesmas_colunas > 1 and not tem_recorte then 5
      else 9
    end,
    id;
