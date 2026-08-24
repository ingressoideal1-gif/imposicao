-- ═══════════════════════════════════════════════════════════════════════════
--  FUNDO DO PWA — a foto de evento atrás das telas do Ideal Control
--  Pedido do usuário em 24/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que é
--
-- Uma aba nova no menu ADM ("Fundo do PWA") onde a gráfica sobe uma foto de
-- evento — de autoria da empresa — que passa a valer como fundo da CASA do
-- Ideal Control no celular do cliente. Esta tabela guarda QUAL foto está
-- valendo e COMO ela é apresentada.
--
-- ## Por que uma tabela, e não só o arquivo no bucket
--
-- Porque a foto sozinha não basta. Duas coisas viajam com ela:
--
--   `veu`     — a força do escurecimento por cima da imagem. É o que garante
--               que o texto continue legível; sem ele, uma foto clara come a
--               tela. Ele é ajustado na prévia do ADM, e é decisão de quem
--               publica, não constante de código.
--
--   `versao`  — muda a cada publicação. É por ela que o aparelho descobre que
--               há foto nova. O caminho do arquivo é FIXO (o upload substitui
--               o mesmo objeto), então sem a versão o celular nunca saberia
--               que o conteúdo mudou — ele veria a mesma URL de sempre.
--
-- ## Por que tabela NOSSA, com política de `public`
--
-- Mesmo motivo dos avisos e dos volumes do acabamento: na estação da gráfica o
-- operador entra pelo código local, sem sessão do Supabase, e o celular do
-- PORTEIRO também não tem sessão — ele é um terminal com token de portão. Uma
-- tabela do parceiro, com RLS de `authenticated`, exigiria desvio pelo agente
-- para uma informação que é pública por natureza: qual imagem está no fundo.
--
-- ## O que este arquivo NÃO faz
--
-- Não cria linha nenhuma. Sem fundo publicado, o aplicativo abre como abre
-- hoje — a ausência de linha ativa É o estado normal, e não custa cadastro.
-- Também não cria o bucket: a foto vai para o `app-imagens`, que a aba
-- "Imagens" do ADM já usa desde antes.

-- ─── O fundo publicado ─────────────────────────────────────────────────────
--
-- Uma linha por publicação, e não uma linha só editada: a foto anterior fica
-- como histórico, e é ela que responde "o que estava no ar em tal dia" — e o
-- que permite voltar atrás sem depender de alguém ter guardado o arquivo.
--
-- O que vale é a linha ATIVA mais recente. Publicar uma nova desativa a
-- anterior; ver `publicar_fundo_do_pwa` mais abaixo, que faz as duas coisas
-- numa transação só.
create table if not exists public.imposition_fundo_pwa (
    id            uuid primary key default gen_random_uuid(),
    -- Caminho dentro do bucket `app-imagens`. Fixo por publicação, com a
    -- versão no nome: assim o cache do navegador nunca serve a foto velha.
    arquivo       text not null,
    -- A força do véu escuro por cima da foto, de 0 a 1. O padrão sai da prévia
    -- do ADM; o limite de baixo não é zero por acidente — ver o check.
    veu           numeric(3, 2) not null default 0.45,
    -- Onde o recorte 9:16 foi ancorado, para a próxima publicação abrir com a
    -- mesma escolha em vez de recomeçar do meio.
    enquadramento text not null default 'centro',
    versao        text not null,
    ativo         boolean not null default true,
    publicado_por text,
    publicado_em  timestamptz not null default now(),

    -- Abaixo de 0,20 o texto claro da casa começa a sumir sobre foto de palco,
    -- que é iluminada; acima de 0,85 a foto vira um retângulo preto e não vale
    -- o peso que custa. Os dois extremos são erro de operação, não escolha.
    constraint imposition_fundo_pwa_veu_check
        check (veu >= 0.20 and veu <= 0.85),
    constraint imposition_fundo_pwa_enquadramento_check
        check (enquadramento in ('topo', 'centro', 'base')),
    constraint imposition_fundo_pwa_arquivo_check
        check (length(btrim(arquivo)) > 0)
);

-- A leitura do aplicativo é sempre a mesma: "qual está ativo?". Sem este
-- índice ela varre o histórico inteiro a cada abertura de celular.
create index if not exists imposition_fundo_pwa_ativo_idx
    on public.imposition_fundo_pwa (publicado_em desc)
    where ativo;

-- ─── Publicar, que é desativar o anterior e ativar o novo ──────────────────
--
-- Numa função, e não em dois `update`/`insert` soltos no frontend, porque entre
-- os dois existe um instante em que NENHUM fundo está ativo — e é exatamente
-- nesse instante que um celular pode perguntar. A função fecha os dois numa
-- transação: ou o aplicativo vê o fundo velho, ou vê o novo, nunca o vazio.
create or replace function public.publicar_fundo_do_pwa(
    p_arquivo       text,
    p_veu           numeric,
    p_enquadramento text,
    p_versao        text,
    p_por           text
) returns public.imposition_fundo_pwa
language plpgsql
security definer
set search_path = public
as $$
declare
    nova public.imposition_fundo_pwa;
begin
    update public.imposition_fundo_pwa set ativo = false where ativo;

    insert into public.imposition_fundo_pwa
        (arquivo, veu, enquadramento, versao, publicado_por)
    values
        (p_arquivo, coalesce(p_veu, 0.45), coalesce(p_enquadramento, 'centro'),
         p_versao, p_por)
    returning * into nova;

    return nova;
end;
$$;

-- ─── Tirar o fundo do ar ───────────────────────────────────────────────────
--
-- Não apaga nada: desativa. O aplicativo volta ao fundo que ele já tinha, e o
-- histórico continua respondendo o que esteve no ar.
create or replace function public.remover_fundo_do_pwa()
returns void
language sql
security definer
set search_path = public
as $$
    update public.imposition_fundo_pwa set ativo = false where ativo;
$$;

-- ─── Quem pode ler e escrever ──────────────────────────────────────────────
--
-- RLS ligado com política de `public`, como as outras `imposition_*`. É o que
-- deixa o celular do cliente e a estação lerem o fundo sem sessão.
--
-- Quem PUBLICA é outra história, e ela não está aqui: a aba vive no menu ADM,
-- que só aparece para o perfil administrador. O aperto do RLS deste projeto
-- está adiado por decisão do usuário; quando for feito, esta entra junto.
alter table public.imposition_fundo_pwa enable row level security;

drop policy if exists "imposition_fundo_pwa_anon_e_autenticado" on public.imposition_fundo_pwa;
create policy "imposition_fundo_pwa_anon_e_autenticado"
    on public.imposition_fundo_pwa
    for all to public
    using (true) with check (true);

grant execute on function public.publicar_fundo_do_pwa(text, numeric, text, text, text) to public;
grant execute on function public.remover_fundo_do_pwa() to public;

-- ─── Conferência ───────────────────────────────────────────────────────────
select json_build_object(
    'imposition_fundo_pwa', (select count(*) from public.imposition_fundo_pwa),
    'ativo',                (select count(*) from public.imposition_fundo_pwa where ativo),
    'politicas',            (select count(*) from pg_policies
                             where schemaname = 'public'
                               and tablename = 'imposition_fundo_pwa'),
    'funcoes',              (select count(*) from pg_proc
                             where proname in ('publicar_fundo_do_pwa',
                                               'remover_fundo_do_pwa'))
) as resultado;
