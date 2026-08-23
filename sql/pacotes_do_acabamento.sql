-- ═══════════════════════════════════════════════════════════════════════════
--  OS PACOTES DENTRO DO VOLUME  —  Painel do Acabamento
--  Rode este arquivo INTEIRO no SQL Editor do Supabase (ou pelo
--  `.\ferramentas\rodar_sql.ps1 sql\pacotes_do_acabamento.sql`).
--  Rodar duas vezes não faz mal.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUE ELE EXISTE
--
--  Os volumes nasceram em 23/08/2026 (`sql/volumes_do_acabamento.sql`) com uma
--  linha por modelo dentro da caixa: `(volume_id, modelo_id, qtd)`. No mesmo
--  dia o usuário pediu o que faltava:
--
--    "Ao criar o volume, opção de nomear volume, dentro do mesmo volume,
--     podemos adicionar vários pacotes, ao adicionar os volumes, volumes
--     criados a soma de seus pesos vai atualizando o peso real do setor, ao
--     editar os volumes, mostra os pacotes, quantidades e responsáveis de cada
--     pacote"
--
--  O PACOTE é a menor unidade de trabalho do setor: um maço de material, com a
--  quantidade que ele leva e o nome de quem o fez. Vários pacotes vão para
--  dentro da mesma caixa, e a caixa é o que vai à balança. É isso que resolve
--  a primeira situação do pedido de ontem — "1 modelo grande é realizado por
--  vários responsáveis": cada pessoa fecha o seu pacote, e a caixa que os
--  reúne é pesada uma vez só.
--
--  MUDANÇA DE VOCABULÁRIO, MESMA TABELA
--
--  A tabela continua se chamando `producao_volume_itens`, e não passa a
--  `producao_volume_pacotes`. Renomear quebraria a estação que ainda está com
--  o painel da versão anterior aberto na tela — ela grava e lê por este nome —,
--  e o ganho seria só de leitura. A linha desta tabela É o pacote; o nome do
--  arquivo e os comentários dizem isso.
--
--  O QUE MUDA
--
--   1. `producao_volumes.nome`      — o nome que o operador dá à caixa.
--   2. `producao_volume_itens.id`   — chave própria, porque agora podem existir
--                                      DOIS pacotes do mesmo modelo na mesma
--                                      caixa (dois responsáveis, um modelo só).
--   3. `producao_volume_itens.responsavel` — quem fez aquele pacote.
--
--  Tudo é aditivo: as três linhas que já existem continuam valendo, com `nome`
--  e `responsavel` nulos, e o painel da versão anterior continua gravando
--  `(volume_id, modelo_id, qtd)` sem saber das colunas novas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. O nome do volume ────────────────────────────────────────────────────
alter table public.producao_volumes
    add column if not exists nome text;

comment on column public.producao_volumes.nome is
    'Nome que o operador dá à caixa ("Camarote", "Staff dia 2"). Opcional: '
    'o volume já tem número, e o nome é o que o pessoal da expedição procura.';

-- ── 2. O pacote ganha chave própria ────────────────────────────────────────
--
-- A chave era `(volume_id, modelo_id)`, o que proibia o caso que o usuário
-- pediu: dois pacotes do mesmo modelo na mesma caixa, um de cada responsável.
-- A troca é feita em três passos, cada um condicionado ao estado atual, para o
-- arquivo poder ser rodado de novo sem erro.
alter table public.producao_volume_itens
    add column if not exists id uuid not null default gen_random_uuid();

alter table public.producao_volume_itens
    add column if not exists responsavel text;

comment on column public.producao_volume_itens.responsavel is
    'Quem fez este pacote. Sai da mesma lista do responsável do modelo (perfil '
    'acabamento do acesso local). Nulo = pacote sem dono declarado.';

do $$
begin
    -- Sai a chave composta antiga…
    if exists (
        select 1 from pg_constraint
         where conname = 'producao_volume_itens_pkey'
           and conrelid = 'public.producao_volume_itens'::regclass
           and array_length(conkey, 1) = 2
    ) then
        alter table public.producao_volume_itens
            drop constraint producao_volume_itens_pkey;
    end if;

    -- …e entra a chave própria do pacote.
    if not exists (
        select 1 from pg_constraint
         where conname = 'producao_volume_itens_pkey'
           and conrelid = 'public.producao_volume_itens'::regclass
    ) then
        alter table public.producao_volume_itens
            add constraint producao_volume_itens_pkey primary key (id);
    end if;
end $$;

-- O `volume_id` era a primeira coluna da chave antiga, e por isso tinha índice
-- de graça. Sem ela, a leitura dos pacotes de um volume varreria a tabela.
create index if not exists producao_volume_itens_por_volume
    on public.producao_volume_itens (volume_id);

-- ── 3. Conferência ─────────────────────────────────────────────────────────
select
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'producao_volumes'
        and column_name = 'nome')                                as volume_tem_nome,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'producao_volume_itens'
        and column_name in ('id', 'responsavel'))                as pacote_tem_id_e_responsavel,
    (select array_length(conkey, 1) from pg_constraint
      where conname = 'producao_volume_itens_pkey'
        and conrelid = 'public.producao_volume_itens'::regclass) as colunas_na_chave,
    (select count(*) from public.producao_volumes)               as volumes_gravados,
    (select count(*) from public.producao_volume_itens)          as pacotes_gravados;
