-- ═══════════════════════════════════════════════════════════════════════════
--  QUADRO DE AVISOS DOS PAINÉIS
--  Pedido do usuário em 23/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que é
--
-- Uma barra flutuante na base do Painel de Produção e do Painel do Acabamento,
-- com um recado do ADM para quem trabalha naquele setor, e um dropdown onde
-- cada pessoa marca o próprio nome confirmando que leu.
--
-- São OITO quadros, e eles não se cadastram: são os quatro setores da gráfica
-- (Flexo, PVC, Têxtil, Laser) vezes os dois painéis. Um "quadro" é o par
-- (painel, setor); o que se cria e se apaga é o AVISO que está nele.
--
-- ## Por que tabela nossa
--
-- Pelo mesmo motivo dos volumes do acabamento: na estação da gráfica o operador
-- entra pelo código local, sem sessão do Supabase. Tabela do parceiro tem RLS
-- de `authenticated` e exigiria desvio pelo agente; tabela nossa, com política
-- de `public`, deixa a estação ler o aviso e gravar a leitura direto pelo
-- PostgREST — sem rota nova em lugar nenhum.
--
-- ## O que este arquivo NÃO faz
--
-- Não cria os oito quadros como linhas. Quadro sem aviso é a AUSÊNCIA de linha
-- ativa para aquele par — assim o estado normal da gráfica (a maioria dos
-- setores, na maior parte do tempo, sem recado nenhum) não custa cadastro.

-- ─── Os avisos ─────────────────────────────────────────────────────────────
--
-- `ativo` e `vale_ate` fazem coisas diferentes, e as duas precisam existir:
-- `ativo = false` é o ADM tirando o aviso do ar agora; `vale_ate` é o prazo que
-- ele mesmo põe e que vence sozinho, sem ninguém lembrar de voltar aqui. O que
-- aparece na base do painel é o que está ativo E dentro do prazo.
--
-- Aviso vencido ou retirado NÃO é apagado: ele vira histórico, e é ele que
-- responde, depois, quem tinha sido avisado. Por isso não há `delete` na tela.
create table if not exists public.imposition_avisos (
    id            uuid primary key default gen_random_uuid(),
    painel        text not null,
    setor         text not null,
    texto         text not null,
    prioridade    text not null default 'normal',
    vale_ate      date,
    ativo         boolean not null default true,
    publicado_por text,
    publicado_em  timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),

    constraint imposition_avisos_painel_check
        check (painel in ('producao', 'acabamento')),
    constraint imposition_avisos_setor_check
        check (setor in ('FLEXO', 'PVC', 'TEXTIL', 'LASER')),
    constraint imposition_avisos_prioridade_check
        check (prioridade in ('normal', 'urgente')),
    -- Texto vazio publicado é uma barra vazia ocupando a base da tela do
    -- operador. O limite de cima é o que cabe em duas linhas na barra, medido
    -- na fonte do painel: passando disso a tela cortaria, e cortar um recado
    -- de produção é pior do que recusar a publicação.
    constraint imposition_avisos_texto_check
        check (char_length(btrim(texto)) between 1 and 280)
);

-- A pergunta que a barra faz a cada desenho: "o que está no ar para este painel
-- e este setor?". O índice parcial cobre só as linhas ativas, que são poucas —
-- o histórico cresce sem pesar nesta consulta.
create index if not exists imposition_avisos_no_ar_idx
    on public.imposition_avisos (painel, setor, publicado_em desc)
    where ativo;

-- ─── Quem leu ──────────────────────────────────────────────────────────────
--
-- Uma linha por pessoa por aviso. O nome é TEXTO, e não uma chave para
-- `imposition_acessos_locais`, de propósito: a leitura é um fato datado, e ela
-- precisa continuar respondendo "quem foi avisado" mesmo depois de a pessoa
-- sair da gráfica e o acesso local dela ser apagado. É a mesma decisão do
-- `acabamento_responsavel` em `pedidos_modelos`.
--
-- A trava de unicidade é o que faz o botão ser idempotente: dois toques no
-- mesmo nome não viram duas leituras, e o segundo `insert` volta como conflito
-- em vez de sujar a contagem.
create table if not exists public.imposition_avisos_leituras (
    aviso_id uuid not null references public.imposition_avisos(id) on delete cascade,
    nome     text not null,
    lido_em  timestamptz not null default now(),

    primary key (aviso_id, nome),
    constraint imposition_avisos_leituras_nome_check
        check (char_length(btrim(nome)) > 0)
);

-- ─── O carimbo de alteração ────────────────────────────────────────────────
--
-- `set search_path` fixo é a regra da casa para toda função nova.
create or replace function public.carimba_aviso_atualizado()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

drop trigger if exists trg_carimba_aviso_atualizado on public.imposition_avisos;
create trigger trg_carimba_aviso_atualizado
    before update on public.imposition_avisos
    for each row
    execute function public.carimba_aviso_atualizado();

-- ─── Quem pode ler e escrever ──────────────────────────────────────────────
--
-- Igual a `producao_volumes`: RLS ligado, política de `public`, que cobre
-- `anon` e `authenticated`. É o que permite a ESTAÇÃO da gráfica ler o aviso e
-- gravar a leitura sem sessão do Supabase.
--
-- Quem PUBLICA é outra história, e ela não está aqui: o menu ADM só aparece
-- para o perfil administrador, e é lá que a aba Avisos vive. O aperto do RLS
-- deste projeto está adiado por decisão do usuário; quando ele for feito, estas
-- duas entram junto com as outras `imposition_*`.
alter table public.imposition_avisos          enable row level security;
alter table public.imposition_avisos_leituras enable row level security;

drop policy if exists "imposition_avisos_anon_e_autenticado" on public.imposition_avisos;
create policy "imposition_avisos_anon_e_autenticado"
    on public.imposition_avisos
    for all to public
    using (true) with check (true);

drop policy if exists "imposition_avisos_leituras_anon_e_autenticado" on public.imposition_avisos_leituras;
create policy "imposition_avisos_leituras_anon_e_autenticado"
    on public.imposition_avisos_leituras
    for all to public
    using (true) with check (true);

-- ─── Conferência ───────────────────────────────────────────────────────────
select json_build_object(
    'imposition_avisos',          (select count(*) from public.imposition_avisos),
    'imposition_avisos_leituras', (select count(*) from public.imposition_avisos_leituras),
    'politicas',                  (select count(*) from pg_policies
                                   where schemaname = 'public'
                                     and tablename in ('imposition_avisos',
                                                       'imposition_avisos_leituras')),
    'gatilho',                    (select count(*) from pg_trigger
                                   where tgname = 'trg_carimba_aviso_atualizado')
) as resultado;
