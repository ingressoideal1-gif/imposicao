-- SOMENTE LEITURA. Nenhuma linha e' escrita.
-- Rodar com: .\ferramentas\rodar_sql.ps1 sql\consultas\conferir_elementos_por_numeracao.sql
-- Documentado em docs/conferencia_pedido_21202.md
-- Somente leitura: o que cada numeracao do pedido 21202 manda DESENHAR em cada
-- item. QR e codigo de barras sao os caros: sao gerados por item, na CPU.
select
    n.name,
    jsonb_array_length(coalesce(n.elements::jsonb, '[]'::jsonb)) as elementos,
    count(*) filter (where e ->> 'type' in ('qr', 'qrcode', 'QR')) as qr,
    count(*) filter (where e ->> 'type' in ('barcode', 'codigo_barras')) as barras,
    count(*) filter (where e ->> 'type' = 'image' or e ->> 'type' = 'pdf') as imagens,
    string_agg(distinct e ->> 'type', ', ') as tipos
from producao_numeracoes n
left join lateral jsonb_array_elements(coalesce(n.elements::jsonb, '[]'::jsonb)) as e on true
where n.id::text in (
    select distinct pm.amostra_num_id::text
    from pedidos_modelos pm
    where pm.id_int = 21202  /* <<< TROQUE AQUI o numero do pedido */ and pm.amostra_num_id is not null
)
group by n.id, n.name, n.elements
order by qr desc, barras desc, n.name
limit 8;

