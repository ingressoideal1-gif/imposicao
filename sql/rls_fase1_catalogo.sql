-- ═══════════════════════════════════════════════════════════════════════════
--  RLS — FASE 1: tabelas de catálogo do Imposition
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Modelo: leitura pública, escrita apenas para usuários autenticados.
--
--  Por que leitura pública: o agente local (app.py -> db.py) e o backend no
--  Render leem essas tabelas com a chave anon para montar as imposições. São
--  configurações geométricas — largura, altura, grade, elementos de numeração —
--  sem dado pessoal. Fechar a leitura pararia a produção sem ganho relevante.
--
--  Por que fechar a escrita: hoje qualquer pessoa com a chave publicada no
--  frontend pode apagar ou corromper o catálogo inteiro, parando a produção.
--
--  ⚠️ ANTES DE APLICAR: o painel aberto em 127.0.0.1:9000 (estação) opera com
--  bypass de autenticação e escreve como anon. Depois deste script, cadastrar
--  ou editar formato/numeração/cor POR ELE deixa de funcionar; pela nuvem
--  continua normal. Decida entre exigir login na estação ou aceitar catálogo
--  somente-leitura lá.
--
--  Reversível: ver o bloco de rollback no fim.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── producao_formatos ──────────────────────────────────────────────────────
alter table producao_formatos enable row level security;

drop policy if exists "cat_formatos_leitura_publica"   on producao_formatos;
drop policy if exists "cat_formatos_escrita_auth"      on producao_formatos;

create policy "cat_formatos_leitura_publica"
    on producao_formatos for select
    using (true);

create policy "cat_formatos_escrita_auth"
    on producao_formatos for all
    to authenticated
    using (true) with check (true);

-- ─── producao_numeracoes ────────────────────────────────────────────────────
alter table producao_numeracoes enable row level security;

drop policy if exists "cat_numeracoes_leitura_publica" on producao_numeracoes;
drop policy if exists "cat_numeracoes_escrita_auth"    on producao_numeracoes;

create policy "cat_numeracoes_leitura_publica"
    on producao_numeracoes for select
    using (true);

create policy "cat_numeracoes_escrita_auth"
    on producao_numeracoes for all
    to authenticated
    using (true) with check (true);

-- ─── producao_cores ─────────────────────────────────────────────────────────
alter table producao_cores enable row level security;

drop policy if exists "cat_cores_leitura_publica"      on producao_cores;
drop policy if exists "cat_cores_escrita_auth"         on producao_cores;

create policy "cat_cores_leitura_publica"
    on producao_cores for select
    using (true);

create policy "cat_cores_escrita_auth"
    on producao_cores for all
    to authenticated
    using (true) with check (true);

-- ─── producao_saidas ────────────────────────────────────────────────────────
alter table producao_saidas enable row level security;

drop policy if exists "cat_saidas_leitura_publica"     on producao_saidas;
drop policy if exists "cat_saidas_escrita_auth"        on producao_saidas;

create policy "cat_saidas_leitura_publica"
    on producao_saidas for select
    using (true);

create policy "cat_saidas_escrita_auth"
    on producao_saidas for all
    to authenticated
    using (true) with check (true);

-- ─── producao_modelos_imposicao ─────────────────────────────────────────────
alter table producao_modelos_imposicao enable row level security;

drop policy if exists "cat_modelos_leitura_publica"    on producao_modelos_imposicao;
drop policy if exists "cat_modelos_escrita_auth"       on producao_modelos_imposicao;

create policy "cat_modelos_leitura_publica"
    on producao_modelos_imposicao for select
    using (true);

create policy "cat_modelos_escrita_auth"
    on producao_modelos_imposicao for all
    to authenticated
    using (true) with check (true);

commit;

-- ─── Conferência ────────────────────────────────────────────────────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('producao_formatos','producao_numeracoes','producao_cores',
                    'producao_saidas','producao_modelos_imposicao')
order by tablename;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('producao_formatos','producao_numeracoes','producao_cores',
                    'producao_saidas','producao_modelos_imposicao')
order by tablename, policyname;


-- ═══════════════════════════════════════════════════════════════════════════
--  ROLLBACK — volta ao estado anterior (tudo aberto)
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
-- alter table producao_formatos            disable row level security;
-- alter table producao_numeracoes          disable row level security;
-- alter table producao_cores               disable row level security;
-- alter table producao_saidas              disable row level security;
-- alter table producao_modelos_imposicao   disable row level security;
-- commit;
