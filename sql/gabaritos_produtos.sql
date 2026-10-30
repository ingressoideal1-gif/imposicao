-- Biblioteca interna por codigo ERP do produto. Projeto dedicado ao Imposition.
-- Preparacao revisavel; nao executar automaticamente durante testes.
begin;
create table if not exists public.imposition_gabaritos_revisoes (
  id uuid primary key default gen_random_uuid(),
  produto integer not null check (produto > 0),
  arquivo text not null,
  nome text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tamanho integer not null check (tamanho between 1 and 31457280),
  criado_por uuid not null,
  criado_em timestamptz not null default now()
);
create table if not exists public.imposition_gabaritos (
  produto integer primary key check (produto > 0),
  revisao uuid not null references public.imposition_gabaritos_revisoes(id)
);
alter table public.imposition_gabaritos enable row level security;
alter table public.imposition_gabaritos_revisoes enable row level security;
revoke all on public.imposition_gabaritos, public.imposition_gabaritos_revisoes from anon, authenticated;
grant all on public.imposition_gabaritos, public.imposition_gabaritos_revisoes to service_role;

create or replace function public.imposition_publicar_gabarito(
  p_produto integer, p_anterior uuid, p_arquivo text, p_nome text,
  p_sha256 text, p_tamanho integer, p_autor uuid
) returns setof public.imposition_gabaritos_revisoes
language plpgsql security invoker set search_path = public as $$
declare atual uuid; nova public.imposition_gabaritos_revisoes;
begin
  -- Serializa inclusive o primeiro cadastro, preservando revisoes concorrentes.
  perform pg_advisory_xact_lock(17920, p_produto);
  select revisao into atual from public.imposition_gabaritos where produto=p_produto;
  if atual is distinct from p_anterior then
    raise exception 'Gabarito mudou. Recarregue antes de substituir.' using errcode='40001';
  end if;
  if not exists(select 1 from public.produtos where id_produto=p_produto) then
    raise exception 'Produto inexistente';
  end if;
  if p_arquivo <> (p_produto::text || '/' || p_sha256 || '.pdf') then
    raise exception 'Caminho invalido';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='imposition-gabaritos' and name=p_arquivo) then
    raise exception 'Arquivo nao recebido';
  end if;
  insert into public.imposition_gabaritos_revisoes(produto,arquivo,nome,sha256,tamanho,criado_por)
    values(p_produto,p_arquivo,p_nome,p_sha256,p_tamanho,p_autor) returning * into nova;
  insert into public.imposition_gabaritos(produto,revisao) values(p_produto,nova.id)
    on conflict(produto) do update set revisao=excluded.revisao;
  return next nova;
end;
$$;
revoke all on function public.imposition_publicar_gabarito(integer,uuid,text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.imposition_publicar_gabarito(integer,uuid,text,text,text,integer,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('imposition-gabaritos','imposition-gabaritos',false,31457280,array['application/pdf'])
on conflict(id) do nothing;
-- Recusa se o nome ja foi usado para um bucket publico; nao altera outro bucket.
do $$ begin
  if exists(select 1 from storage.buckets where id='imposition-gabaritos' and public) then
    raise exception 'Bucket existente publico: revisar antes de aplicar';
  end if;
end $$;
-- Restritiva tambem protege contra politicas permissivas antigas de outros buckets.
create policy imposition_gabaritos_backend on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'imposition-gabaritos')
with check (bucket_id <> 'imposition-gabaritos');
commit;
