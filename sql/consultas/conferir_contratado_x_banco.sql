-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_contratado_x_banco.sql
-- Documentado em docs/conferencia_pedido_21202.md, docs/conferencia_pedido_21460.md
-- e docs/conferencia_pedido_21408.md (o modo PDF Paginado).
--
-- A quantidade contratada bate com o que o modelo REALMENTE imprime?
--
-- ATENCAO 1 — a armadilha original (29/08/2026):
-- contar `jsonb_array_length(csv_data)` NAO responde a pergunta. Esse e' o banco
-- CRU. O produto aplica `linhasComDadoDaNumeracao` antes de decidir o que o
-- modelo imprime: linha sem dado em NENHUMA das colunas que ESTA numeracao le
-- nao e' celula deste modelo. A versao ingenua acusou o modelo 1000565 de ter
-- 3.000 contratadas contra 12.806 linhas; era banco-mestre, e o material ja
-- tinha saido certo.
--
-- ATENCAO 2 — a armadilha nova (01/09/2026):
-- desde 27/08/2026 o banco pode NAO estar dentro da numeracao. Ele e' um
-- registro do PEDIDO (`pedidos_bancos`), e o modelo diz a qual se liga e qual
-- coluna alimenta cada elemento (`pedidos_modelos_banco.csv_mapa`, chave
-- `el:<id>`). A versao anterior desta consulta exigia `n.csv_data is not null` e
-- por isso devolvia ZERO LINHAS no pedido 21460 — cinco modelos conferidos por
-- uma consulta que nao olhou nenhum, sem nada na tela dizendo isso. Silencio em
-- conferencia se le como "tudo certo", e e' pior que alarme falso.
--
-- ATENCAO 3 — MODO PDF PAGINADO (01/09/2026, pedido 21408): modelo com
-- `modo_pdf` nao le banco. Uma pagina do arquivo da frente por peca, e a
-- pergunta "contratada bate?" so' se responde contando as paginas, o que SQL
-- nao faz. A coluna `modo_pdf` marca esses modelos e `falta` sai nulo neles de
-- proposito; quem responde e' `ferramentas/conferir_paginas_pdf.py`.
--
-- O corte por csv_selecao NAO e' reproduzido aqui (a semantica dele mora no
-- CsvEditor.fatiaDoModelo). A coluna `tem_recorte` avisa quando ele existe: nesse
-- caso `imprime` e' um teto, e quem manda e' a tela.
with m as (
  select pm.id,
         pm.nome_modelo,
         pm.quantidade                                   as contratada,
         coalesce(pm.modo_pdf, false)                    as modo_pdf,
         pm.csv_selecao is not null                      as tem_recorte,
         n.name                                          as numeracao,
         -- De onde este modelo bebe: o banco do pedido, quando ha vinculo, ou o
         -- CSV de dentro da numeracao. E' o `BancoDoModelo.numeracaoResolvida`.
         coalesce(b.csv_data::jsonb, n.csv_data::jsonb)  as banco,
         case when b.id is null then 'na numeracao' else 'do pedido: ' || b.nome end as origem_do_banco,
         coalesce(n.elements::jsonb, '[]'::jsonb)        as elems,
         coalesce(v.csv_mapa::jsonb, '{}'::jsonb)        as mapa
  from pedidos_modelos pm
  join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  left join pedidos_modelos_banco v on v.modelo_id = pm.id::text
  left join pedidos_bancos b on b.id = v.banco_id
  where pm.id_int = 21460  /* <<< TROQUE AQUI o numero do pedido */
),
-- A coluna que cada elemento le NESTE modelo. Espelho de
-- `BancoDoModelo.colunaDoElemento`: a chave por elemento (`el:<id>`) vence
-- sempre; sem ela vale o `csv_column` da peca, ainda passado pelo mapa por
-- nome — e e' assim que toda numeracao antiga continua funcionando.
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
         end as imprime
  from m join cols c on c.id = m.id
)
select id,
       contratada,
       case when banco is null then null else jsonb_array_length(banco) end as linhas_brutas,
       imprime,
       contratada - imprime               as falta,
       modo_pdf,
       tem_recorte,
       array_to_string(colunas, ' + ')    as colunas_lidas,
       origem_do_banco,
       numeracao,
       nome_modelo
from conta
-- Modelo em PDF Paginado nao e' divergencia: vai para o fim, e nao para o topo
-- como o `coalesce(..., 999999)` faria com o `falta` nulo dele.
order by modo_pdf, abs(coalesce(contratada - imprime, 999999)) desc, id;
