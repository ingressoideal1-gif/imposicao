-- ═══════════════════════════════════════════════════════════════════════════
--  VOLUMES DO ACABAMENTO
--  Pedido do usuário em 23/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que é um volume
--
-- O pacote físico que sai do setor: uma caixa, um pacote, um fardo. Ele tem
-- número, tipo, o peso da balança, quem pesou, e uma lista de modelos com
-- QUANTIDADE. É a quantidade que resolve as três situações que o usuário
-- descreveu e que o campo de peso por setor não cobria sozinho:
--
--   1. um modelo grande feito por várias pessoas  → vários volumes, um por dono
--   2. vários modelos pesados juntos              → um volume com vários itens
--   3. o mesmo modelo repartido em caixas         → o mesmo modelo em vários
--                                                    volumes, somando a tiragem
--
-- Setor SEM volume nenhum continua valendo como 1 volume único. Isso é de
-- propósito: o pedido simples — a maioria — não pode ganhar cadastro novo por
-- causa de um recurso que ele não usa.
--
-- ## Por que tabela nossa, e não a ficha do ERP
--
-- `propostas_os_setores` tem `qtd_volumes` e `tipo_volume`, e daria para pensar
-- em gravar ali. Em 23/08/2026 o usuário decidiu que NÃO: os volumes ficam só
-- do nosso lado, e aquelas duas colunas continuam sendo preenchidas pela tela do
-- Vibe. A única escrita nossa em tabela do parceiro continua sendo a do peso
-- (`docs/REGRAS_BANCO.md`).
--
-- A decisão tem um efeito prático grande. A ficha do parceiro tem RLS de
-- `authenticated`, e na estação da gráfica o operador entra pelo código local,
-- sem sessão do Supabase — é por isso que o peso precisa do desvio pelo agente e
-- da Edge Function `acesso-estacao`. Em tabela NOSSA, com política de `public`
-- como a de `producao_numeracoes`, a estação grava direto pelo PostgREST. Os
-- volumes não precisam de rota nova em lugar nenhum.
--
-- ## O que este arquivo NÃO faz
--
-- Não toca em `propostas_os_setores`, não toca em `propostas`, e não mexe em
-- nenhuma coluna de `pedidos_modelos`. Só cria duas tabelas e as liga.

-- ─── A tabela dos volumes ──────────────────────────────────────────────────
--
-- `id_int` é o número do pedido, a mesma chave que `pedidos_modelos` e
-- `propostas_os_setores` usam. `setor` repete os quatro nomes que o banco do
-- parceiro aceita — um volume pertence a UM setor, porque o peso é conferido
-- por setor e uma caixa com dois setores dentro não somaria em nenhum dos dois.
create table if not exists public.producao_volumes (
    id            uuid primary key default gen_random_uuid(),
    id_int        integer not null,
    setor         text    not null,
    numero        integer not null,
    tipo          text,
    peso_kg       numeric(10,3),
    responsavel   text,
    observacao    text,
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),

    constraint producao_volumes_setor_check
        check (setor in ('FLEXO', 'PVC', 'TEXTIL', 'LASER')),
    constraint producao_volumes_numero_check
        check (numero >= 1),
    constraint producao_volumes_peso_check
        check (peso_kg is null or peso_kg >= 0),

    -- V1, V2, V3 são por (pedido, setor). Dois operadores criando o volume 3 ao
    -- mesmo tempo é o que esta trava impede — o segundo recebe erro e a tela
    -- recalcula o número, em vez de nascerem dois "V3" que ninguém distingue na
    -- hora de conferir a carga.
    constraint producao_volumes_unico unique (id_int, setor, numero)
);

create index if not exists producao_volumes_pedido_idx
    on public.producao_volumes (id_int, setor, numero);

-- ─── O que vai dentro de cada volume ───────────────────────────────────────
--
-- `qtd` é o coração do recurso: sem ela, "dividir o modelo em três caixas" não
-- teria como ser dito, e a tela não saberia dizer quanto do modelo ainda está
-- fora de volume.
--
-- A chave primária composta impede o mesmo modelo de aparecer duas vezes no
-- MESMO volume — duas linhas ali seriam duas contagens do mesmo material, e a
-- soma passaria a mentir. O mesmo modelo em volumes DIFERENTES é justamente o
-- caso 3, e continua livre.
create table if not exists public.producao_volume_itens (
    volume_id uuid    not null references public.producao_volumes(id) on delete cascade,
    modelo_id bigint  not null references public.pedidos_modelos(id)  on delete cascade,
    qtd       integer not null,

    primary key (volume_id, modelo_id),
    constraint producao_volume_itens_qtd_check check (qtd > 0)
);

-- Para a pergunta que o card do modelo faz: "em quais volumes eu estou?"
create index if not exists producao_volume_itens_modelo_idx
    on public.producao_volume_itens (modelo_id);

-- ─── O carimbo de alteração ────────────────────────────────────────────────
--
-- `set search_path` fixo é a regra da casa para toda função nova: sem ele, um
-- `search_path` de sessão diferente faria a função procurar `now()` noutro
-- schema.
create or replace function public.carimba_volume_atualizado()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

drop trigger if exists trg_carimba_volume_atualizado on public.producao_volumes;
create trigger trg_carimba_volume_atualizado
    before update on public.producao_volumes
    for each row
    execute function public.carimba_volume_atualizado();

-- ─── Quem pode ler e escrever ──────────────────────────────────────────────
--
-- Igual a `producao_numeracoes`: RLS ligado, e uma política de `public`, que
-- cobre `anon` e `authenticated`. É o que permite a ESTAÇÃO da gráfica gravar,
-- e é o motivo de estas tabelas serem nossas (ver o cabeçalho).
--
-- O aperto do RLS deste projeto está adiado por decisão do usuário, enquanto o
-- app roda com usuários restritos. Quando ele for feito, estas duas entram
-- junto com as outras `producao_*` — não são um caso à parte.
alter table public.producao_volumes       enable row level security;
alter table public.producao_volume_itens  enable row level security;

drop policy if exists "producao_volumes_anon_e_autenticado" on public.producao_volumes;
create policy "producao_volumes_anon_e_autenticado"
    on public.producao_volumes
    for all to public
    using (true) with check (true);

drop policy if exists "producao_volume_itens_anon_e_autenticado" on public.producao_volume_itens;
create policy "producao_volume_itens_anon_e_autenticado"
    on public.producao_volume_itens
    for all to public
    using (true) with check (true);

-- ─── Conferência ───────────────────────────────────────────────────────────
select json_build_object(
    'producao_volumes',      (select count(*) from public.producao_volumes),
    'producao_volume_itens', (select count(*) from public.producao_volume_itens),
    'politicas',             (select count(*) from pg_policies
                              where schemaname = 'public'
                                and tablename in ('producao_volumes', 'producao_volume_itens')),
    'gatilho',               (select count(*) from pg_trigger
                              where tgname = 'trg_carimba_volume_atualizado')
) as resultado;
