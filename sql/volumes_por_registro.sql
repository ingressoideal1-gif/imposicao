-- ═══════════════════════════════════════════════════════════════════════════
--  O PESO PASSA A SER DO REGISTRO, E O VOLUME VIRA A SOMA
--  Pedido do usuário em 29/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## A regra nova, nas palavras dele
--
--   "pedido sem criação de volumes seguem o fluxo existente, ao criar volumes
--    cada modelo registrado como pronto precisa indicar a qual volume pertence
--    e registrar seu peso, esse registro pode ser feito em grupos, volumes já
--    criados podem receber novos modelos ou grupos de modelos, somando os pesos
--    ao volume, retirar o conceito de caixa e pacote e rolo, teremos apenas o
--    conceito de volumes."
--
-- E, sobre o gesto na estação:
--
--   "modelos são pesados antes de colocados no volume, as somas dos pesos dos
--    modelos são o peso do volume. pedidos sem volume criado é pesado ao final"
--
-- ## O que isso muda no banco
--
-- Até aqui o peso morava no VOLUME (`producao_volumes.peso_kg`): o operador
-- punha a caixa fechada na balança e digitava um número só. Agora o peso mora
-- no REGISTRO — cada modelo vai à balança antes de entrar no volume —, e o peso
-- do volume é a soma dos registros dele.
--
-- Duas colunas novas em `producao_volume_itens`, e nada mais. Nenhuma tabela é
-- criada, nenhuma é renomeada, nada é apagado.
--
-- ## Por que `producao_volumes.peso_kg` NÃO é removida
--
-- Por dois motivos, e o segundo é o que decide.
--
--  1. Ela guarda o peso dos volumes que já existem, e apagá-la jogaria fora
--     peso conferido de material que já saiu da gráfica.
--  2. Uma estação com o painel da versão ANTERIOR aberto na tela continua
--     lendo `peso_kg` para desenhar o chip do volume. O painel novo passa a
--     ESCREVER nela a soma dos registros a cada gravação — assim o número que a
--     estação atrasada mostra continua certo até ela recarregar. É a mesma
--     precaução que fez `producao_volume_itens` manter o nome em
--     `sql/pacotes_do_acabamento.sql`.
--
-- Quem manda, do painel novo em diante, é a soma dos registros. `peso_kg` passa
-- a ser espelho, não fonte.
--
-- ## E a coluna `tipo`
--
-- "Caixa", "Fardo", "Rolo" e "Palete" saem da TELA — o usuário decidiu que só
-- existe o conceito de volume. A coluna continua no banco com o que já está
-- gravado e simplesmente para de ser escrita. Apagar seria perder a etiqueta de
-- volumes antigos sem ganhar nada.

-- ── 1. O peso de cada registro ─────────────────────────────────────────────
--
-- Nulo é legítimo e quer dizer "ainda não pesado" — é o registro que entrou por
-- uma versão antiga da tela, ou o que um dia venha a ser criado sem balança à
-- mão. A soma trata nulo como zero, do mesmo jeito que já tratava o volume sem
-- peso.
alter table public.producao_volume_itens
    add column if not exists peso_kg numeric(10,3);

comment on column public.producao_volume_itens.peso_kg is
    'O peso deste registro, em kg, medido na balança ANTES de o material entrar '
    'no volume (regra do usuário, 29/08/2026). O peso do volume é a soma desta '
    'coluna; producao_volumes.peso_kg passou a ser espelho dela.';

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'producao_volume_itens_peso_check'
           and conrelid = 'public.producao_volume_itens'::regclass
    ) then
        alter table public.producao_volume_itens
            add constraint producao_volume_itens_peso_check
            check (peso_kg is null or peso_kg >= 0);
    end if;
end $$;

-- ── 2. Quando o registro aconteceu ─────────────────────────────────────────
--
-- O volume passa a ser lido como uma LISTA do que entrou nele, na ordem em que
-- entrou — é o que o operador procura quando abre um volume que engordou ao
-- longo do dia. Sem esta coluna a ordem seria a do banco, que não é ordem
-- nenhuma.
--
-- `default now()` cobre as linhas que já existem: elas ganham a data da
-- migração, que é falsa mas monotônica, e não há de onde tirar a verdadeira.
alter table public.producao_volume_itens
    add column if not exists registrado_em timestamptz not null default now();

comment on column public.producao_volume_itens.registrado_em is
    'Quando este modelo entrou no volume. Nas linhas anteriores a 29/08/2026 é a '
    'data da migração — a original não existia.';

create index if not exists producao_volume_itens_por_volume_ordem
    on public.producao_volume_itens (volume_id, registrado_em);

-- ── 3. O peso dos volumes que já existem desce para os registros ───────────
--
-- Sem isto, todo volume anterior a hoje passaria a somar zero e o peso do setor
-- despencaria na tela — material que já foi pesado, conferido e às vezes já
-- expedido.
--
-- A repartição é PROPORCIONAL À QUANTIDADE, e é uma aproximação declarada: o
-- peso por peça de cada modelo não está nesta tabela, e buscá-lo cruzaria daqui
-- até `produtos_proposta` do parceiro. O que a proporção garante é o que
-- importa — a SOMA de cada volume continua sendo exatamente o peso que estava
-- gravado nele, então nenhum peso de setor, de pedido ou de frete muda de
-- valor. Só a linha a linha é estimada, e só nos volumes velhos.
--
-- A última linha de cada volume recebe a sobra do arredondamento, para a soma
-- fechar no centavo de quilo em vez de errar por 1 g.
with alvos as (
    select v.id as volume_id, v.peso_kg
      from public.producao_volumes v
     where v.peso_kg is not null
       and v.peso_kg > 0
       and not exists (
           select 1 from public.producao_volume_itens i
            where i.volume_id = v.id and i.peso_kg is not null
       )
       and exists (
           select 1 from public.producao_volume_itens i
            where i.volume_id = v.id and i.qtd > 0
       )
),
contas as (
    select i.id,
           a.volume_id,
           a.peso_kg,
           i.qtd,
           sum(i.qtd) over (partition by a.volume_id)                         as qtd_total,
           row_number() over (partition by a.volume_id order by i.id)         as posicao,
           count(*)     over (partition by a.volume_id)                       as quantos
      from alvos a
      join public.producao_volume_itens i on i.volume_id = a.volume_id
     where i.qtd > 0
),
rateio as (
    select id,
           volume_id,
           peso_kg,
           posicao,
           quantos,
           round(peso_kg * qtd::numeric / qtd_total::numeric, 3)              as parcela,
           sum(round(peso_kg * qtd::numeric / qtd_total::numeric, 3))
               over (partition by volume_id)                                 as soma_das_parcelas
      from contas
)
update public.producao_volume_itens i
   set peso_kg = case
                     when r.posicao = r.quantos
                     then r.parcela + (r.peso_kg - r.soma_das_parcelas)
                     else r.parcela
                 end
  from rateio r
 where i.id = r.id;

-- ── 4. Conferência ─────────────────────────────────────────────────────────
--
-- `volumes_fora_da_conta` tem de ser ZERO: é o número de volumes cuja soma dos
-- registros não bate com o `peso_kg` que estava gravado. Qualquer coisa acima
-- disso quer dizer que o rateio acima não fechou, e aí o certo é não publicar a
-- tela nova antes de entender por quê.
select
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'producao_volume_itens'
        and column_name = 'peso_kg')                                as registro_tem_peso,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'producao_volume_itens'
        and column_name = 'registrado_em')                          as registro_tem_data,
    (select count(*) from public.producao_volume_itens
      where peso_kg is not null)                                    as registros_com_peso,
    (select count(*) from public.producao_volumes v
      where v.peso_kg is not null and v.peso_kg > 0
        and abs(v.peso_kg - coalesce((
              select sum(coalesce(i.peso_kg, 0))
                from public.producao_volume_itens i
               where i.volume_id = v.id), 0)) > 0.0005)             as volumes_fora_da_conta;
