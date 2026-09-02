-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_numeracoes_do_pedido.sql
-- Documentado em docs/conferencia_pedido_21202.md, docs/conferencia_pedido_21460.md
-- e docs/conferencia_pedido_21408.md (o modo PDF Paginado).
--
-- De onde cada modelo do pedido tira o dado, e quantas linhas aquele poco tem.
--
-- POR QUE ESTA CONSULTA MUDOU (01/09/2026)
-- A versao anterior agrupava por NUMERACAO e comparava a soma das quantidades
-- contratadas com `jsonb_array_length(csv_data)` da numeracao. Isso so' fazia
-- sentido quando o banco morava DENTRO da peca. Desde 27/08/2026 o banco e' um
-- registro do pedido (`pedidos_bancos`) e varios modelos leem COLUNAS DIFERENTES
-- do mesmo banco-mestre — no 21460, cinco modelos somam 6.950 contra um banco de
-- 3.000 linhas, e esta' certo. Comparar soma com linhas ali produz alarme falso;
-- a pergunta certa e' por COLUNA, e quem a responde e'
-- conferir_contratado_x_banco.sql.
--
-- O que sobra aqui, e continua util: o mapa do pedido — quem bebe de onde, com
-- que coluna, e se dois modelos leem a MESMA coluna sem recorte (que e' o unico
-- compartilhamento que ainda merece um olhar).
with m as (
  select pm.id, pm.id_int, pm.nome_modelo, pm.quantidade,
         coalesce(pm.modo_pdf, false)                    as modo_pdf,
         pm.csv_selecao is not null                      as tem_recorte,
         n.id                                            as num_id,
         n.name                                          as numeracao,
         coalesce(b.csv_data::jsonb, n.csv_data::jsonb)  as banco,
         coalesce(b.nome, '(dentro da numeracao)')       as banco_nome,
         coalesce(n.elements::jsonb, '[]'::jsonb)        as elems,
         coalesce(v.csv_mapa::jsonb, '{}'::jsonb)        as mapa
  from pedidos_modelos pm
  join producao_numeracoes n on n.id::text = pm.amostra_num_id::text
  left join pedidos_modelos_banco v on v.modelo_id = pm.id::text
  left join pedidos_bancos b on b.id = v.banco_id
  where pm.id_int = 21460  /* <<< TROQUE AQUI o numero do pedido */
),
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
)
select
    m.numeracao,
    m.banco_nome,
    array_to_string(c.colunas, ' + ')                        as colunas_lidas,
    count(*)                                                 as modelos,
    sum(m.quantidade)                                        as soma_contratada,
    max(case when m.banco is null then null
             else jsonb_array_length(m.banco) end)           as linhas_no_banco,
    -- O que ESTAS colunas entregam. E' com este numero que a soma tem de bater,
    -- e nao com o total de linhas do banco-mestre.
    max(case when m.banco is null then null else
      (select count(*) from jsonb_array_elements(m.banco) r
         where coalesce(r->>'__ativo','true') <> 'false'
           and (coalesce(array_length(c.colunas,1),0) = 0
                or exists (select 1 from unnest(c.colunas) k
                            where btrim(coalesce(r->>k,'')) <> ''))) end)  as linhas_com_dado,
    count(*) filter (where m.tem_recorte)                    as com_recorte,
    -- PDF Paginado nao bebe de banco: uma pagina do arquivo por peca. Ver
    -- ferramentas/conferir_paginas_pdf.py.
    count(*) filter (where m.modo_pdf)                       as em_pdf_paginado,
    string_agg(m.id::text || ':' || m.quantidade, ', ' order by m.id) as modelos_e_qtds
from m join cols c on c.id = m.id
group by m.num_id, m.numeracao, m.banco_nome, c.colunas
order by (count(*) > 1 and count(*) filter (where m.tem_recorte) = 0) desc,
         m.numeracao, colunas_lidas;
