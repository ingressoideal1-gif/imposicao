-- ═══════════════════════════════════════════════════════════════════════════
--  REPARO: o espelho do peso do volume voltou a bater com os registros
--  29/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que aconteceu
--
-- Entre a v775 e a v779, a consulta que a tela faz aos volumes pedia
-- `(id, modelo_id, qtd, responsavel)` dos registros — **sem** `peso_kg`. O
-- `select` do PostgREST é uma projeção: coluna que não está na lista não volta,
-- e não há erro nenhum, o campo só chega `undefined`.
--
-- A ESCRITA nunca errou: `producao_volume_itens.peso_kg` está inteiro, com os
-- 28 registros pesados. Quem saiu do lugar foi o ESPELHO
-- (`producao_volumes.peso_kg`), que o painel reescreve com a soma do que ele
-- LEU — e ele lia zero. Bastou uma exclusão ou uma movimentação para o espelho
-- de um volume ir a zero enquanto o material continuava lá dentro.
--
-- ## Por que reparar, se a tela nova já mostra certo
--
-- Porque o espelho não é só enfeite. Ele é o que a estação com o painel
-- ANTERIOR ainda lê para desenhar o chip do volume, e é o que sobra para quem
-- consultar a tabela por fora. Deixá-lo mentindo é deixar dois números
-- discordando no banco.
--
-- ## O que este arquivo faz
--
-- Uma coisa só, e idempotente: onde o espelho discorda da soma dos registros,
-- ele passa a ser a soma. Rodar de novo não muda mais nada.
--
-- Volume sem registro nenhum fica de FORA de propósito: é o volume anterior a
-- 29/08/2026, cujo peso mora no espelho porque nunca houve peso por registro.
-- Zerá-lo apagaria um peso de verdade.

update public.producao_volumes v
   set peso_kg = c.soma
  from (
        select v2.id,
               coalesce((select sum(coalesce(i.peso_kg, 0))
                           from public.producao_volume_itens i
                          where i.volume_id = v2.id), 0) as soma
          from public.producao_volumes v2
         where exists (select 1 from public.producao_volume_itens i
                        where i.volume_id = v2.id)
       ) c
 where v.id = c.id
   and abs(coalesce(v.peso_kg, 0) - c.soma) > 0.0005;

-- ─── Conferência ───────────────────────────────────────────────────────────
--
-- `espelhos_fora` tem de ser ZERO. `kg_nos_registros` é o peso de verdade do
-- material, e `kg_no_espelho` passa a incluí-lo — a diferença que sobrar entre
-- os dois é só a dos volumes antigos, que não têm registro com peso.
select
    (select count(*) from public.producao_volume_itens where peso_kg is null)
                                                                          as registros_sem_peso,
    (select round(sum(coalesce(peso_kg, 0))::numeric, 3)
       from public.producao_volume_itens)                                 as kg_nos_registros,
    (select round(sum(coalesce(peso_kg, 0))::numeric, 3)
       from public.producao_volumes)                                      as kg_no_espelho,
    (select count(*) from public.producao_volumes v
      where exists (select 1 from public.producao_volume_itens i where i.volume_id = v.id)
        and abs(coalesce(v.peso_kg, 0) - coalesce((
              select sum(coalesce(i.peso_kg, 0))
                from public.producao_volume_itens i
               where i.volume_id = v.id), 0)) > 0.0005)                   as espelhos_fora;
