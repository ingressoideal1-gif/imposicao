-- Biblioteca PRIVADA; nao modifica catalogo_fontes nem fontes usadas no portal.
-- Revisar e aplicar separadamente na entrega; testes nao executam SQL remoto.
begin;
create table public.imposition_fontes_corel (
 sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
 nome text not null, familia text not null, estilo text not null,
 versao text not null, postscript text not null,
 extensao text not null check (extensao in ('ttf','otf')),
 tamanho integer not null check(tamanho between 12 and 10485760),
 fs_type integer,
 licenca_confirmada boolean not null check(licenca_confirmada),
 licenca_nota text not null default '',
 criado_por uuid not null, criado_em timestamptz not null default now()
);
alter table public.imposition_fontes_corel enable row level security;
revoke all on public.imposition_fontes_corel from anon,authenticated;
grant select,insert on public.imposition_fontes_corel to service_role;
create function public.imposition_registrar_fonte_corel(p_dados jsonb)
returns setof public.imposition_fontes_corel language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from storage.objects where bucket_id='imposition-fontes-corel'
   and name=(p_dados->>'sha256')||'.'||(p_dados->>'extensao')) then
   raise exception 'Arquivo da fonte ausente';
 end if;
 insert into public.imposition_fontes_corel
 (sha256,nome,familia,estilo,versao,postscript,extensao,tamanho,fs_type,licenca_confirmada,licenca_nota,criado_por)
 select sha256,nome,familia,estilo,versao,postscript,extensao,tamanho,fs_type,licenca_confirmada,licenca_nota,criado_por
 from jsonb_populate_record(null::public.imposition_fontes_corel,p_dados)
 on conflict(sha256) do nothing;
 return query select * from public.imposition_fontes_corel where sha256=p_dados->>'sha256';
end $$;
revoke all on function public.imposition_registrar_fonte_corel(jsonb) from public,anon,authenticated;
grant execute on function public.imposition_registrar_fonte_corel(jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('imposition-fontes-corel','imposition-fontes-corel',false,10485760,array['application/octet-stream']);
create policy imposition_fontes_corel_backend on storage.objects as restrictive
for all to anon,authenticated using(bucket_id<>'imposition-fontes-corel')
with check(bucket_id<>'imposition-fontes-corel');
commit;
