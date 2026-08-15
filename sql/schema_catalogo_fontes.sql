-- ============================================================
-- CATALOGO DE FONTES — a lista passa a ser uma so, compartilhada
-- ============================================================
--
-- Ate 15/08/2026 o catalogo era um arquivo em disco (formats_db.json) na maquina
-- que respondia ao painel. Quando o operador abria o painel pelo site publicado,
-- quem respondia era o Render — cujo disco volta ao conteudo versionado a cada
-- publicacao. Fonte cadastrada por ali sumia na publicacao seguinte, e a numeracao
-- ficava exibindo o nome da fonte no seletor mas desenhando com outra.
--
-- Guardar so na estacao tambem nao resolvia: o link que o cliente abre para
-- aprovar a arte le o catalogo da NUVEM. Fonte que existisse apenas numa estacao
-- faria o cliente aprovar uma arte com a fonte errada.
--
-- COLE ESTE ARQUIVO INTEIRO no editor de SQL do Supabase. Ele pode ser rodado
-- mais de uma vez sem estragar nada.
--
-- A imposicao continua sem depender de rede: a estacao guarda uma copia em disco
-- e le sempre dela; quem atualiza a copia e o sincronismo em segundo plano.
-- ============================================================

create table if not exists public.catalogo_fontes (
  id           uuid        primary key default gen_random_uuid(),
  nome         text        not null,
  font_family  text        not null,
  categoria    text        not null default 'Geral',
  arquivo_url  text        not null,
  ativo        boolean     not null default true,
  criado_em    timestamptz not null default now()
);

-- Duas fontes com o mesmo nome sao indistinguiveis para quem escolhe no seletor,
-- e o elemento da numeracao guarda so o nome — nao ha como saber qual das duas ele
-- queria. O indice torna a duplicata impossivel, em vez de depender de o frontend
-- lembrar de conferir.
create unique index if not exists catalogo_fontes_nome_unico
  on public.catalogo_fontes (lower(btrim(nome)));

-- O catalogo e leitura publica: o link do cliente precisa dele para desenhar a
-- arte, e o visitante nao faz login.
alter table public.catalogo_fontes enable row level security;

drop policy if exists catalogo_fontes_leitura on public.catalogo_fontes;
create policy catalogo_fontes_leitura
  on public.catalogo_fontes for select
  using (true);

-- ATENCAO — por que a escrita tambem e liberada para a chave anonima:
--
-- Quem grava aqui e o app.py, e ele usa a NEXT_PUBLIC_SUPABASE_ANON_KEY (ver
-- db.py: a SUPABASE_SERVICE_KEY so e usada pelo acesso_api.py). Isso vale tanto
-- para a nuvem quanto para o agente da estacao — e o agente NAO PODE levar uma
-- chave service_role dentro do executavel, que fica na maquina de cada estacao.
--
-- Sem estas politicas o cadastro e o Excluir do Catalogo de Fontes respondem
-- 42501 (new row violates row-level security policy) e a tela quebra. Foi o que
-- aconteceu na primeira versao deste arquivo, pega antes de publicar.
--
-- Isto NAO afrouxa nada em relacao ao que o projeto ja tinha: as demais tabelas
-- (producao_numeracoes, producao_formatos, ...) tambem aceitam escrita anonima
-- hoje, porque o endurecimento de RLS esta adiado por decisao do usuario. Quando
-- esse endurecimento acontecer, esta tabela entra junto e o caminho e trocar a
-- escrita do agente por uma rota autenticada — nao apertar so aqui, o que
-- deixaria a estacao sem conseguir cadastrar fonte.
drop policy if exists catalogo_fontes_insercao on public.catalogo_fontes;
create policy catalogo_fontes_insercao
  on public.catalogo_fontes for insert
  with check (true);

drop policy if exists catalogo_fontes_atualizacao on public.catalogo_fontes;
create policy catalogo_fontes_atualizacao
  on public.catalogo_fontes for update
  using (true) with check (true);

drop policy if exists catalogo_fontes_remocao on public.catalogo_fontes;
create policy catalogo_fontes_remocao
  on public.catalogo_fontes for delete
  using (true);

-- ── As 273 fontes de hoje ──────────────────────────────────────────
-- Vieram do formats_db.json. As 47 duplicatas exatas (mesmo nome, mesma URL, so o
-- id diferente, de o carregador das Google Fonts ter rodado duas vezes) entram uma
-- vez so. Os ids sao os que ja existiam, para a carga poder ser repetida sem criar
-- linha nova.

insert into public.catalogo_fontes (id, nome, font_family, categoria, arquivo_url, ativo)
values
  ('ebe677de-a49e-4e7b-bd9d-33a4fefa428b', 'Roboto', 'Roboto', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/c29b10834c390f65.ttf', true),
  ('f444086c-2492-45f8-bf5e-3073c5668ada', 'Open Sans', 'Open Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/bd757f1ad06c84be.ttf', true),
  ('142b7d24-39e4-4ee5-9038-30688b3d2713', 'Lato', 'Lato', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/4ba165ae1d701de6.ttf', true),
  ('2000a736-0de9-4b2b-9b3d-0dfa0e75e94b', 'Montserrat', 'Montserrat', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/f3504655a78a9207.ttf', true),
  ('6a55b722-6148-46a2-9f84-71e02e99d7df', 'Poppins', 'Poppins', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/c74e082a80e7adb7.ttf', true),
  ('60c88035-0a50-4c43-917a-f7da3eb67743', 'Inter', 'Inter', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/7c761112b2acce3b.ttf', true),
  ('1a467d29-6235-4858-b0c8-fc11b5480855', 'Oswald', 'Oswald', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/3c60ac93bf8ad49c.ttf', true),
  ('1a0288d4-7d63-4358-8768-ad811b8f46e6', 'Raleway', 'Raleway', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/2908991aa99feda8.ttf', true),
  ('c2c74813-fa60-4475-a5c9-d48726ef83b3', 'Noto Sans', 'Noto Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/5b050e0ec8a809e6.ttf', true),
  ('ed78b361-cbdf-4725-94ac-c66f511f04c1', 'Ubuntu', 'Ubuntu', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/5133a6dd79c9b9d3.ttf', true),
  ('4159a37e-271f-45b2-b072-8a7f4ccac4a7', 'Playfair Display', 'Playfair Display', 'Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/839397f5a36280b0.ttf', true),
  ('fab2af96-b28a-4a6f-8a04-9387c360b616', 'Merriweather', 'Merriweather', 'Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/e033b43e95c28859.ttf', true),
  ('5b11d2d1-d9f8-4894-a406-d70bec820c44', 'Roboto Mono', 'Roboto Mono', 'Monospace', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/a0333021807e3775.ttf', true),
  ('3bbedd1c-c52a-4f65-811d-e60d91338589', 'PT Sans', 'PT Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/8e6560d4e575a68d.ttf', true),
  ('9198a622-7eb7-45be-af64-0becf0031335', 'Rubik', 'Rubik', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/243f7cd8e05196b7.ttf', true),
  ('b1880f1d-f47f-41e1-b3d7-ccdc1856c8ca', 'Lora', 'Lora', 'Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/d5da044799bae725.ttf', true),
  ('6a5c655a-1d2a-4b71-b2e8-37683e7ee4d7', 'Work Sans', 'Work Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/b31068ff59a222ec.ttf', true),
  ('e6955da5-dac3-4851-bb3d-5eb09aff466a', 'Fira Sans', 'Fira Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/0252b47fc31f1d7e.ttf', true),
  ('8044d07e-b87b-4ed8-95d1-167844f507e8', 'Mulish', 'Mulish', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/3e6f85d167854de6.ttf', true),
  ('77bc8469-6bf4-45e0-9ede-2dd73dce9e48', 'Quicksand', 'Quicksand', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/89d97d79cd9a2dd8.ttf', true),
  ('841546c3-204d-4816-a401-886ab1f65172', 'Inconsolata', 'Inconsolata', 'Monospace', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/8d84a0eabdba34fa.ttf', true),
  ('553ef931-36b7-478e-a47d-99c619255be2', 'Barlow', 'Barlow', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/f492d0b64d5ee8e4.ttf', true),
  ('66527398-e449-41a2-a734-01a091675eab', 'Nunito', 'Nunito', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/fa742548398d2e62.ttf', true),
  ('8888a316-d7c6-4015-b150-cab6e149af2f', 'Titillium Web', 'Titillium Web', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/6f7f0593e9962a2d.ttf', true),
  ('f1119a74-97d2-4e54-94c1-44a14da99d7d', 'Heebo', 'Heebo', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/13b02c1e3442f693.ttf', true),
  ('2480275a-59d6-42b7-b3bb-24a64f38aed2', 'Josefin Sans', 'Josefin Sans', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/4bb2e04eedd32c3e.ttf', true),
  ('8fb4d25c-dfce-4c82-a3a3-e6983607ad7e', 'Cabin', 'Cabin', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/c9b5f251df80f3f8.ttf', true),
  ('640eed70-6f34-4b22-acb4-515629298725', 'Libre Baskerville', 'Libre Baskerville', 'Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/22d8247508185453.ttf', true),
  ('4c8dbc1f-207c-4a69-a1a3-30cfda454de3', 'Anton', 'Anton', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/51e877d7792df173.ttf', true),
  ('d77d1a5a-45dc-4684-9d59-cf316fd79843', 'Bitter', 'Bitter', 'Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/42ebf37fbf2bdd5c.ttf', true),
  ('98d6c339-0d03-4097-aa17-a073f9bc9eca', 'Pacifico', 'Pacifico', 'Handwriting', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/a840c6524b802730.ttf', true),
  ('1bbf9da1-a371-42b6-8f4e-0bbe5b6fba44', 'Dancing Script', 'Dancing Script', 'Handwriting', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/11ac06400ddf83fb.ttf', true),
  ('0712e197-bde3-4a1e-9532-068a92064e6b', 'Dosis', 'Dosis', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/669075590af7c8db.ttf', true),
  ('bbdef9ed-28ed-4890-bf95-c1f5e7a41762', 'Varela Round', 'Varela Round', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/3284c8e2d18c3537.ttf', true),
  ('4f65f219-2490-411e-992c-e5d326e3166e', 'Arimo', 'Arimo', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/edc0d514107bf515.ttf', true),
  ('a890addb-4045-4651-bbf7-fe13e0ec53cd', 'Asap', 'Asap', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/514323edd548e1f7.ttf', true),
  ('b2665562-7d78-4fd6-91d4-38926ffc63c4', 'Oxygen', 'Oxygen', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/8140c2f451aad79e.ttf', true),
  ('4e2c1dbd-0ce1-454a-81a1-99e9b3daed12', 'Mukta', 'Mukta', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/d46aa223ba3bb805.ttf', true),
  ('f2c04993-d457-4803-bdd0-4bcf8fdc8ade', 'Fjalla One', 'Fjalla One', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/1b1a021d9ac10178.ttf', true),
  ('b8ac9b92-acde-4772-ae11-03b9c7a543db', 'Bebas Neue', 'Bebas Neue', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/fd6c9f49d65a23c5.ttf', true),
  ('afb1585e-eb30-406d-82ef-fe5109cfd401', 'Exo 2', 'Exo 2', 'Sans Serif', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/5c399c5ea12a7c9d.ttf', true),
  ('03eebe99-2f60-4d50-a7a5-1af578ea47e8', 'Righteous', 'Righteous', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/5cfd98f418fccf12.ttf', true),
  ('7612f530-1494-45d0-9023-4a6b92f7a812', 'Comfortaa', 'Comfortaa', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/438bbb72952c1815.ttf', true),
  ('c54c551f-eca7-4af1-af33-ed04bbfb199f', 'Lobster', 'Lobster', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/89434ffa32f6c994.ttf', true),
  ('ecaccbdd-c4cb-4f0c-a035-577aee43f6e0', 'Abril Fatface', 'Abril Fatface', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/93b3e6b42db2b231.ttf', true),
  ('956ea3b9-03f8-4925-abbe-450da04286cc', 'Bungee', 'Bungee', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/a3059fae81db4f55.ttf', true),
  ('d35ef855-c0ce-46d2-9cce-52a601cdb459', 'Alfa Slab One', 'Alfa Slab One', 'Display', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/google/58468a7419243c1e.ttf', true),
  ('4aa1ddf5-86b4-4d91-b19f-1e3b5346ae78', 'Embassy BT', 'Embassy BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Embassy_BT.ttf', true),
  ('54a93d7a-e6d3-48ae-8951-0af6e516106d', 'Exotc350 DmBd BT Demi-Bold', 'Exotc350 DmBd BT Demi-Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Exotc350_DmBd_BT_Demi-Bold.ttf', true),
  ('e5b4de85-fd1a-4c18-9e0a-3a71a2828643', 'ebrima', 'ebrima', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ebrima.ttf', true),
  ('fa1a285f-4a2a-4986-bbbc-e17d9303ca0b', 'phagspab', 'phagspab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/phagspab.ttf', true),
  ('d70e00cc-eb66-47de-a43c-fab791c17231', 'segmdl2', 'segmdl2', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segmdl2.ttf', true),
  ('b13f2d13-e009-41d1-a8dd-da903ec1b9e9', 'NewsGoth BT Roman', 'NewsGoth BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NewsGoth_BT_Roman.ttf', true),
  ('96dea5d1-8943-4087-b100-2c11af9d769d', 'segoeuiz', 'segoeuiz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeuiz.ttf', true),
  ('12cd1c2c-0738-4f37-9d2e-bf51eeb2230b', 'Swis721 WGL4 BT Bold', 'Swis721 WGL4 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_WGL4_BT_Bold.ttf', true),
  ('4f0a5c28-cf7f-45fc-a940-9572b7509676', 'GeoSlab703 MdCn BT Medium', 'GeoSlab703 MdCn BT Medium', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_MdCn_BT_Medium.ttf', true),
  ('d372c259-8df3-4c28-b193-582972f7367b', 'segoescb', 'segoescb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoescb.ttf', true),
  ('f5f779d7-10a0-4621-af97-ae10c30bd635', 'Square721 Cn BT Bold', 'Square721 Cn BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Square721_Cn_BT_Bold.ttf', true),
  ('689c0383-7771-460f-9bfa-ff9e6bf13e9f', 'seguisb', 'seguisb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguisb.ttf', true),
  ('bbb78683-f7fc-401d-8b18-a80a0d1e7ef6', 'corbelli', 'corbelli', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbelli.ttf', true),
  ('59b874df-fe01-4762-8f0c-905756494628', 'constani', 'constani', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/constani.ttf', true),
  ('3d875857-7b44-428a-abad-912c55b948fc', 'arialbd', 'arialbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/arialbd.ttf', true),
  ('13f7f14e-8273-423e-9339-feabc9c2778e', 'consola', 'consola', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/consola.ttf', true),
  ('0deba771-2a5c-4ad8-a9df-397cedba98ae', 'segoeuil', 'segoeuil', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeuil.ttf', true),
  ('7559c8e9-8ef3-4e49-9bd2-1f07681fb2b9', 'consolai', 'consolai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/consolai.ttf', true),
  ('3f2d47e8-0776-4255-a6aa-a98643df1cff', 'Swis721 LtEx BT Light', 'Swis721 LtEx BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_LtEx_BT_Light.ttf', true),
  ('456c981d-9545-4338-89a0-72c117e8150c', 'Kaufmann BT', 'Kaufmann BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Kaufmann_BT.ttf', true),
  ('c6ab205e-9e81-4050-9266-6f9221347bed', 'GeoSlab703 MdCn BT Bold', 'GeoSlab703 MdCn BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_MdCn_BT_Bold.ttf', true),
  ('1ebde952-ff32-4d2b-85bc-699f7fbb1c1c', 'Century751 BT Roman', 'Century751 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_BT_Roman.ttf', true),
  ('bc6ac6d3-34a3-4d4d-b1d8-b77bed0392e5', 'comicbd', 'comicbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/comicbd.ttf', true),
  ('d1f921b7-642b-4dc5-a8ad-21c4ce4faf6b', 'News701 BT Italic', 'News701 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/News701_BT_Italic.ttf', true),
  ('5e3e4ff6-96f7-4c2f-9657-faa9b5a6df13', 'verdanaz', 'verdanaz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/verdanaz.ttf', true),
  ('846e811a-75aa-46d9-97f8-b66129885f3f', 'Century751 No2 BT Roman', 'Century751 No2 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_No2_BT_Roman.ttf', true),
  ('6f8c4a6a-4f85-4e7f-bf47-ffba162852ed', 'Exotc350 Bd BT Bold', 'Exotc350 Bd BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Exotc350_Bd_BT_Bold.ttf', true),
  ('17667fa6-a47d-4628-9b1c-84b665be9b4b', 'DeVinne Txt BT', 'DeVinne Txt BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/DeVinne_Txt_BT.ttf', true),
  ('3c6d9094-8361-4ebf-8cce-46716140aa5f', 'palai', 'palai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/palai.ttf', true),
  ('1b935499-add3-41b2-a8a9-545dc6e3d7e9', 'segoeuii', 'segoeuii', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeuii.ttf', true),
  ('b9d87e0d-9c7e-4a02-81d9-3c0c8f3d321d', 'HarmonyOS_Sans_SC_Regular', 'HarmonyOS_Sans_SC_Regular', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/HarmonyOS_Sans_SC_Regular.ttf', true),
  ('f5e8af7c-ef72-4a56-a6c1-0aeae5cfe84e', 'Humanst521 BT Roman', 'Humanst521 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_BT_Roman.ttf', true),
  ('aa6dd157-b30a-45e1-a79e-5d26be22acc8', 'NanumGothic-Bold', 'NanumGothic-Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NanumGothic-Bold.ttf', true),
  ('7a9553a6-d468-4a4a-a0cb-9975501b3237', 'comic', 'comic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/comic.ttf', true),
  ('6bc66445-c5fa-4ec4-b99f-30b7ba14dad1', 'NewsGoth BT Bold Italic', 'NewsGoth BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NewsGoth_BT_Bold_Italic.ttf', true),
  ('04ea58a0-2d8a-4830-b543-f874e6a04174', 'verdanab', 'verdanab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/verdanab.ttf', true),
  ('0d32c7ee-fa6d-4369-807b-49ebd1c40317', 'arialbi', 'arialbi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/arialbi.ttf', true),
  ('57f293e5-aafd-4229-adec-7b3151c7da73', 'Swis721 WGL4 BT Roman', 'Swis721 WGL4 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_WGL4_BT_Roman.ttf', true),
  ('6dc6998e-34a5-40e8-8835-ff5f00bbcdbe', 'calibri', 'calibri', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibri.ttf', true),
  ('502e1ad7-a707-45a2-b58c-bebdb2062487', 'Square721 Cn BT Roman', 'Square721 Cn BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Square721_Cn_BT_Roman.ttf', true),
  ('f9cc381d-1ef5-4347-9f1f-e210e71afaaf', 'times', 'times', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/times.ttf', true),
  ('74607deb-dfe6-41a5-b794-10658249af6b', 'tahomabd', 'tahomabd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/tahomabd.ttf', true),
  ('eecda416-5f0b-4bd4-8dd4-d008def76d46', 'Futura Md BT Bold Italic', 'Futura Md BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Md_BT_Bold_Italic.ttf', true),
  ('d9b810f2-f08b-4c19-9a78-eb6500d04aa1', 'trebucit', 'trebucit', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/trebucit.ttf', true),
  ('daf87134-c9ac-4735-8c1d-47565a107535', 'segoeuisl', 'segoeuisl', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeuisl.ttf', true),
  ('6f21941d-c7f9-491c-82f1-bd87b80bc506', 'Schadow BT Roman', 'Schadow BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Schadow_BT_Roman.ttf', true),
  ('d00a3a37-642f-41e7-9a42-422d9577aaed', 'Candarab', 'Candarab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candarab.ttf', true),
  ('de3a0b1c-780c-4219-931f-bb25c4d453fa', 'sylfaen', 'sylfaen', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/sylfaen.ttf', true),
  ('f2f6c46c-9de3-4ec6-afdb-7f800e2223cb', 'himalaya', 'himalaya', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/himalaya.ttf', true),
  ('4e7df706-5467-4b66-819b-19329514aa73', 'Swis721 WGL4 BT Bold Italic', 'Swis721 WGL4 BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_WGL4_BT_Bold_Italic.ttf', true),
  ('ce51e135-4f40-4c06-bbd1-03a66f4f862e', 'cambriab', 'cambriab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/cambriab.ttf', true),
  ('e455b63f-ef1a-461a-928e-8c998625b3b8', 'ZWAdobeF', 'ZWAdobeF', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ZWAdobeF.TTF', true),
  ('78d7a627-3703-48c1-acf1-226eaea12e5a', 'trebuc', 'trebuc', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/trebuc.ttf', true),
  ('91ae7be6-e873-4b4d-bcf4-c18d65464c36', 'Century725 Cn BT', 'Century725 Cn BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century725_Cn_BT.ttf', true),
  ('6e2fc676-33c2-48c9-83b3-e6fab71436d4', 'segoeprb', 'segoeprb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeprb.ttf', true),
  ('13be8b4e-cbc1-4cdc-9723-e15bc56ddf77', 'ariblk', 'ariblk', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ariblk.ttf', true),
  ('2345abf8-4760-476f-bb5c-3d6ac67cfd19', 'Swis721 WGL4 BT Italic', 'Swis721 WGL4 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_WGL4_BT_Italic.ttf', true),
  ('f096cc52-489f-475d-9bf2-85a43f0aa8e7', 'Century751 No2 BT Bold Italic', 'Century751 No2 BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_No2_BT_Bold_Italic.ttf', true),
  ('cbff19f3-2f82-4632-a32e-2bdd7860bf5d', 'Nirmala', 'Nirmala', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Nirmala.ttf', true),
  ('3c533d64-dabe-4671-8428-bf7869178f81', 'arial', 'arial', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/arial.ttf', true),
  ('11dc0d4e-ef1c-406f-9557-9c15f58d44af', 'NewsGoth Lt BT Light', 'NewsGoth Lt BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NewsGoth_Lt_BT_Light.ttf', true),
  ('4cc3f21c-ced8-4818-8066-acf31d579665', 'taile', 'taile', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/taile.ttf', true),
  ('2bfdf0c1-f955-4a0f-9801-dfe2704b09c8', 'Candarali', 'Candarali', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candarali.ttf', true),
  ('d33e7776-78e6-463e-83ba-f30227bfdbb2', 'Century751 BT Italic', 'Century751 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_BT_Italic.ttf', true),
  ('a645cc2d-5f5d-419e-b9d9-65838986714d', 'Gabriola', 'Gabriola', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Gabriola.ttf', true),
  ('e59ea3f0-522c-441f-9cb7-00b61b0e307c', 'NewsGoth BT Bold', 'NewsGoth BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NewsGoth_BT_Bold.ttf', true),
  ('da906e77-a114-4f94-83a9-c1eb8a75c591', 'seguisym', 'seguisym', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguisym.ttf', true),
  ('16373a19-b8c4-48cf-91ad-a168bb962828', 'timesi', 'timesi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/timesi.ttf', true),
  ('b28cf84c-c485-47a1-b7ca-16fabbba0e5a', 'couri', 'couri', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/couri.ttf', true),
  ('bf0db886-916d-4c4f-a18a-180dad8070b6', 'Candaraz', 'Candaraz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candaraz.ttf', true),
  ('c92cf820-47af-43c5-ad32-2730d597d4e7', 'webdings', 'webdings', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/webdings.ttf', true),
  ('ae5b750a-282b-4be1-9de6-116733de42b5', 'pala', 'pala', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/pala.ttf', true),
  ('4201b1ef-811f-4fb0-85e7-a49d03107456', 'corbelb', 'corbelb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbelb.ttf', true),
  ('8d935d90-f8ac-4301-a382-221d0cdb6854', 'seguiemj', 'seguiemj', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguiemj.ttf', true),
  ('9666ae15-f23c-4ca5-88f1-1c9bd63d22da', 'cour', 'cour', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/cour.ttf', true),
  ('4cbaf937-0fec-4e3b-b251-ba0aa0382ebe', 'Geometr415 Blk BT Black', 'Geometr415 Blk BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Geometr415_Blk_BT_Black.ttf', true),
  ('ec272643-2e64-4a73-9aa6-6f6c76d2ea96', 'corbell', 'corbell', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbell.ttf', true),
  ('631dfa41-8b98-4cf6-a6c5-ff69a4e29420', 'constanz', 'constanz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/constanz.ttf', true),
  ('e66117eb-fbad-4b11-a4ce-131a0b948c6e', 'CentSchbkCyrill BT Bold', 'CentSchbkCyrill BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/CentSchbkCyrill_BT_Bold.ttf', true),
  ('fe2255a9-f5fd-43e3-95fb-089076e4e60f', 'Geometr706 BlkCn BT Black', 'Geometr706 BlkCn BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Geometr706_BlkCn_BT_Black.ttf', true),
  ('042b8428-dbbd-4191-927d-865f0c2a1c75', 'GeoSlab703 Md BT Medium Italic', 'GeoSlab703 Md BT Medium Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_Md_BT_Medium_Italic.ttf', true),
  ('50359490-88fa-467f-aa7c-4bfa52317905', 'Inkfree', 'Inkfree', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Inkfree.ttf', true),
  ('822c498f-c55a-48d0-a7b1-ad00bc9d6a79', 'Candaral', 'Candaral', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candaral.ttf', true),
  ('1b896b62-2ba3-46d6-95ac-37f3bbe5e44b', 'palab', 'palab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/palab.ttf', true),
  ('0f15d3e7-260d-4445-8f49-0c98691482aa', 'impact', 'impact', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/impact.ttf', true),
  ('73fea909-8b54-4380-bdf8-7cd88dfca099', 'NirmalaB', 'NirmalaB', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NirmalaB.ttf', true),
  ('dd00a5c6-2ae3-4817-8000-a92d2c52ea60', 'Candara', 'Candara', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candara.ttf', true),
  ('c53a6a49-8c78-4313-9579-de9b04ce455d', 'NewsGoth BT Italic', 'NewsGoth BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NewsGoth_BT_Italic.ttf', true),
  ('5f6b7372-e7c4-483f-a40f-858a8535b943', 'Swis721 Hv BT Heavy', 'Swis721 Hv BT Heavy', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Hv_BT_Heavy.ttf', true),
  ('73c64410-37f6-4682-8de6-d28aee540fc4', 'corbelz', 'corbelz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbelz.ttf', true),
  ('994968d7-805a-4ab1-917d-53dfc1aa9aa9', 'CentSchbkCyrill BT Italic', 'CentSchbkCyrill BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/CentSchbkCyrill_BT_Italic.ttf', true),
  ('00a86658-84ed-43ee-a517-0a1bcd60f0ec', 'Swis721 Cn BT Italic', 'Swis721 Cn BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Cn_BT_Italic.ttf', true),
  ('3f0613b0-3d4a-4c28-91ec-60d734b2715b', 'comicz', 'comicz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/comicz.ttf', true),
  ('fea20f0c-ba5b-4e1c-bb50-8405127331d4', 'LeelaUIb', 'LeelaUIb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/LeelaUIb.ttf', true),
  ('a3480c0a-0485-4786-8046-0c899dabac49', 'malgunbd', 'malgunbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/malgunbd.ttf', true),
  ('b2c741b7-b4fd-41bd-b70b-22e44274c77e', 'javatext', 'javatext', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/javatext.ttf', true),
  ('e6a19bef-2d26-4857-b70a-e56df84f96f0', 'News701 BT Bold', 'News701 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/News701_BT_Bold.ttf', true),
  ('b4090af0-798e-484f-9fb4-5870012065e8', 'calibril', 'calibril', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibril.ttf', true),
  ('dca16406-894d-4ed3-a08f-f3997d40ba9e', 'Century751 SeBd BT Semi Bold', 'Century751 SeBd BT Semi Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_SeBd_BT_Semi_Bold.ttf', true),
  ('e5e6c8b6-940d-4318-8f8b-a31ca785ba92', 'Swis721 BT Bold Italic', 'Swis721 BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_BT_Bold_Italic.ttf', true),
  ('415c06aa-92fd-42d9-9d8e-58609be99610', 'Swis721 BT Italic', 'Swis721 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_BT_Italic.ttf', true),
  ('bd1cdceb-ffc5-4e6e-9810-984ae8f78226', 'Swis721 Lt BT Light', 'Swis721 Lt BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Lt_BT_Light.ttf', true),
  ('9814155f-a11f-4d00-a926-737ec2838df4', 'trebucbd', 'trebucbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/trebucbd.ttf', true),
  ('12023999-83dc-46be-898a-0311e2c3f7a0', 'framdit', 'framdit', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/framdit.ttf', true),
  ('9f570211-94b3-42eb-87cf-43eb46cc7ac8', 'ebrimabd', 'ebrimabd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ebrimabd.ttf', true),
  ('79b33a77-8038-4623-8dab-30d24267a264', 'simsunb', 'simsunb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/simsunb.ttf', true),
  ('1171ea80-6463-4952-a369-9dcbf520cfa4', 'calibrib', 'calibrib', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibrib.ttf', true),
  ('5a382f06-8fdc-437a-b9ba-47492d718b72', 'Humnst777 BT Roman', 'Humnst777 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_BT_Roman.ttf', true),
  ('0e05b6c2-6963-410d-987c-d7cb9ee9f587', 'tahoma', 'tahoma', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/tahoma.ttf', true),
  ('f48a682a-b86e-46d3-a6a9-10882a402a75', 'NirmalaS', 'NirmalaS', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NirmalaS.ttf', true),
  ('017736fc-b079-489a-a342-1b58f9b78459', 'ntailu', 'ntailu', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ntailu.ttf', true),
  ('2e975601-266b-4860-9690-f01a90b64993', 'Humanst521 Lt BT Light Italic', 'Humanst521 Lt BT Light Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_Lt_BT_Light_Italic.ttf', true),
  ('f683e0f4-ac3d-4b2f-9eec-f0eb0b35e4c6', 'NanumGothic-Regular', 'NanumGothic-Regular', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/NanumGothic-Regular.ttf', true),
  ('ff60edfa-a883-4f8d-863f-96617ceb59d6', 'framd', 'framd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/framd.ttf', true),
  ('2bb39b9f-0eae-498e-bf4d-d882750c72bf', 'georgiaz', 'georgiaz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/georgiaz.ttf', true),
  ('be6a14a9-7a1f-4515-b4d9-f5243eec0004', 'micross', 'micross', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/micross.ttf', true),
  ('8f66695c-e14a-4c57-b640-a3d24fbf0a91', 'ntailub', 'ntailub', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ntailub.ttf', true),
  ('b5da018f-cd01-4c1c-a46a-98bf0200ed0a', 'cambriai', 'cambriai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/cambriai.ttf', true),
  ('267f0a6a-5721-47fa-8c27-bf795434fd37', 'Humnst777 Cn BT Bold', 'Humnst777 Cn BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_Cn_BT_Bold.ttf', true),
  ('31cb99b6-cd79-4ef3-9725-5f88cd53d5f1', 'Futura Md BT Medium Italic', 'Futura Md BT Medium Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Md_BT_Medium_Italic.ttf', true),
  ('c1bce11b-fe43-4370-8f82-319ba700aaff', 'Swis721 Lt BT Light Italic', 'Swis721 Lt BT Light Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Lt_BT_Light_Italic.ttf', true),
  ('eae1a848-4445-4c99-807d-daa180e58b51', 'Geometr212 BkCn BT Heavy', 'Geometr212 BkCn BT Heavy', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Geometr212_BkCn_BT_Heavy.ttf', true),
  ('cdaf267e-74b2-4234-a337-abeb66fea30b', 'LeelawUI', 'LeelawUI', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/LeelawUI.ttf', true),
  ('3aa2d446-dfae-4fae-a988-ce9b7c25bd3a', 'corbeli', 'corbeli', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbeli.ttf', true),
  ('ab82ef6d-3313-4110-8f90-4c99628bef2f', 'consolaz', 'consolaz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/consolaz.ttf', true),
  ('090c5130-5d91-401f-843e-feb87033c515', 'GeoSlab703 Md BT Medium', 'GeoSlab703 Md BT Medium', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_Md_BT_Medium.ttf', true),
  ('fbf4b609-34ab-46d3-8161-63024745f06c', 'Swis721 Cn BT Roman', 'Swis721 Cn BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Cn_BT_Roman.ttf', true),
  ('c0b20367-5938-4087-8cf9-a79886f232e2', 'CentSchbkCyrill BT Roman', 'CentSchbkCyrill BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/CentSchbkCyrill_BT_Roman.ttf', true),
  ('9405ddcc-381d-4a04-bef6-3f8011f7d97f', 'seguibl', 'seguibl', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguibl.ttf', true),
  ('f2d9879a-db4d-4154-8e50-d787e6355b9e', 'Futura Md BT Bold', 'Futura Md BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Md_BT_Bold.ttf', true),
  ('1f2c0b96-a01c-451d-9e64-6a5cc065fb2c', 'taileb', 'taileb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/taileb.ttf', true),
  ('0fa3b6c2-4e03-4a2b-9354-3875feaa251e', 'Swis721 Cn BT Bold', 'Swis721 Cn BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Cn_BT_Bold.ttf', true),
  ('4860ca5f-0205-4954-a2dd-35c6987c133d', 'News706 BT Bold', 'News706 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/News706_BT_Bold.ttf', true),
  ('10ee5a1a-b061-47fa-9614-c1291628dab3', 'symbol', 'symbol', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/symbol.ttf', true),
  ('14713dd3-cdb2-4866-b143-7dc760edd8e1', 'Humnst777 Lt BT Light', 'Humnst777 Lt BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_Lt_BT_Light.ttf', true),
  ('54236f1b-2b60-43ca-90b5-fcdb07d97b51', 'TypoUpright BT', 'TypoUpright BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/TypoUpright_BT.ttf', true),
  ('1bb8667e-5c81-4368-8dfa-719f7fdc77b3', 'seguisbi', 'seguisbi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguisbi.ttf', true),
  ('30a53cf3-5405-435b-970e-e639ee25c0e4', 'phagspa', 'phagspa', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/phagspa.ttf', true),
  ('80c2ef83-1001-4fad-b118-13532548a6c2', 'GeoSlab703 Md BT Bold', 'GeoSlab703 Md BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_Md_BT_Bold.ttf', true),
  ('d26dcfff-0420-4a38-8a43-0e6914d0cb85', 'seguibli', 'seguibli', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguibli.ttf', true),
  ('3c7ad3e7-b479-47ae-a631-d68f0798b4b3', 'Square721 BT Roman', 'Square721 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Square721_BT_Roman.ttf', true),
  ('ac6109e8-df09-4779-8cf7-69185a69c9da', 'constan', 'constan', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/constan.ttf', true),
  ('c96d072a-13a2-4fc3-9044-7714901f5fff', 'EngraversGothic BT', 'EngraversGothic BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/EngraversGothic_BT.ttf', true),
  ('e3280262-019f-43ce-896a-7e73112acb53', 'Futura Md BT Medium', 'Futura Md BT Medium', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Md_BT_Medium.ttf', true),
  ('eedebb68-4651-425d-b721-ea852c2f3383', 'Geometr212 BkCn BT Book', 'Geometr212 BkCn BT Book', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Geometr212_BkCn_BT_Book.ttf', true),
  ('2e54aec6-e4c1-48bd-b8d0-9d166c9d6944', 'Humanst521 BT Bold', 'Humanst521 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_BT_Bold.ttf', true),
  ('18b90965-24cc-4a6b-81cd-35dd0f3f2eb3', 'Bodoni Bd BT Bold Italic', 'Bodoni Bd BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Bodoni_Bd_BT_Bold_Italic.ttf', true),
  ('2b98d6af-15c9-4cc7-a03b-b24d87840bd2', 'mvboli', 'mvboli', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/mvboli.ttf', true),
  ('a1727f2d-8450-46df-928b-ccf6bf28e568', 'Freehand521 BT', 'Freehand521 BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Freehand521_BT.ttf', true),
  ('36d0e24d-7939-4d2d-a193-9936fab519e4', 'gadugi', 'gadugi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/gadugi.ttf', true),
  ('38d3e3bb-626f-4fe0-8b07-be142f9eafda', 'timesbi', 'timesbi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/timesbi.ttf', true),
  ('8d318230-158f-49fe-8306-619c53a9cc04', 'segoeui', 'segoeui', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeui.ttf', true),
  ('ca4705b8-15b1-493d-9138-c16a4e679260', 'Century751 No2 BT Bold', 'Century751 No2 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_No2_BT_Bold.ttf', true),
  ('48125d32-6b50-4fd0-bf17-1a62dadf73c4', 'malgun', 'malgun', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/malgun.ttf', true),
  ('2fb1894c-115f-49fd-88f9-78afa8ea040a', 'Swis721 BT Roman', 'Swis721 BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_BT_Roman.ttf', true),
  ('04e07802-37b4-4990-8f1d-0d9fb17d1c93', 'Century751 No2 BT Italic', 'Century751 No2 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_No2_BT_Italic.ttf', true),
  ('14af138c-f6e7-4ecb-b0fa-31afa036958d', 'georgia', 'georgia', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/georgia.ttf', true),
  ('bea82962-1975-4896-9684-18772cd2f632', 'GeoSlab703 Md BT Bold Italic', 'GeoSlab703 Md BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/GeoSlab703_Md_BT_Bold_Italic.ttf', true),
  ('d9cb9679-6b1a-49ff-9fd7-fe3984c30a58', 'Humnst777 Cn BT', 'Humnst777 Cn BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_Cn_BT.ttf', true),
  ('3c085962-5a47-4e25-89bd-78acde9e10c2', 'Futura Bk BT Book', 'Futura Bk BT Book', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Bk_BT_Book.ttf', true),
  ('7fc65de3-8645-4d52-8b4b-63ca7d18eaa5', 'HarmonyOS_Sans_SC_Bold', 'HarmonyOS_Sans_SC_Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/HarmonyOS_Sans_SC_Bold.ttf', true),
  ('092f8e28-3259-45a2-8bb6-2e0c71f47146', 'LeelUIsl', 'LeelUIsl', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/LeelUIsl.ttf', true),
  ('de6cb46e-a4eb-490d-a8eb-c03b771316a5', 'timesbd', 'timesbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/timesbd.ttf', true),
  ('d2b575ef-2f6a-4555-9bb2-c2034995456b', 'seguili', 'seguili', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguili.ttf', true),
  ('20798f69-c93c-4740-9020-f8864429a02d', 'calibrii', 'calibrii', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibrii.ttf', true),
  ('90e934ce-d01e-4044-aa9d-ed1730333c0d', 'Swis721 BlkCn BT Black', 'Swis721 BlkCn BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_BlkCn_BT_Black.ttf', true),
  ('d2010945-b366-4ff3-a85a-c355bdeaa4c0', 'Clarendon Blk BT Black', 'Clarendon Blk BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Clarendon_Blk_BT_Black.ttf', true),
  ('753f54cc-306e-4aa4-bb89-3d40b156dd07', 'Bodoni Bd BT Bold', 'Bodoni Bd BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Bodoni_Bd_BT_Bold.ttf', true),
  ('84da028f-56f7-4d92-809c-627d9f0edd15', 'Candarai', 'Candarai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Candarai.ttf', true),
  ('b98cc768-eb0f-42e3-afab-55dc5b81a243', 'bahnschrift', 'bahnschrift', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/bahnschrift.ttf', true),
  ('531f5e4b-1553-4722-99a2-8618578f38ab', 'constanb', 'constanb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/constanb.ttf', true),
  ('f88bb737-ac9b-47a6-9d93-012a24fa8047', 'holomdl2', 'holomdl2', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/holomdl2.ttf', true),
  ('b1a7aa19-1db8-4852-9d49-0a872d280053', 'ariali', 'ariali', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/ariali.ttf', true),
  ('56afc4a0-c3b4-48a8-bcde-6f62b647be0b', 'Humanst521 BT Bold Italic', 'Humanst521 BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_BT_Bold_Italic.ttf', true),
  ('f82ae632-3e70-4d97-b95a-190218dadaa8', 'palabi', 'palabi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/palabi.ttf', true),
  ('ef84c233-1ec5-445e-bb42-3b9ac93a8c87', 'Square721 BT Bold', 'Square721 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Square721_BT_Bold.ttf', true),
  ('e2578c2d-b0b1-4e88-8652-4a79d3a92263', 'georgiai', 'georgiai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/georgiai.ttf', true),
  ('0d2d72c2-cd96-40a8-89dd-5039b2b495fe', 'seguihis', 'seguihis', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguihis.ttf', true),
  ('b0eedcca-a03f-42ba-8318-a2e312da128f', 'Humnst777 Blk BT Black Italic', 'Humnst777 Blk BT Black Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_Blk_BT_Black_Italic.ttf', true),
  ('dd6ca231-aa99-4a9c-9dec-008d626c7700', 'corbel', 'corbel', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/corbel.ttf', true),
  ('0dd51807-fed7-44f8-bd1b-0e322aaa0942', 'Swis721 Blk BT Black', 'Swis721 Blk BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Blk_BT_Black.ttf', true),
  ('93c16355-ecc9-4819-8ead-972dd6dd1295', 'cambriaz', 'cambriaz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/cambriaz.ttf', true),
  ('46fd7693-72d4-41bd-83ab-651f1d86a21e', 'georgiab', 'georgiab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/georgiab.ttf', true),
  ('13d12a7a-567b-4a56-9363-189956ea98a5', 'courbd', 'courbd', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/courbd.ttf', true),
  ('da4f04aa-70e8-4f75-bd4b-24a514ce64b6', 'l_10646', 'l_10646', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/l_10646.ttf', true),
  ('0a32b42a-e3cb-4716-a683-ecc7303db17b', 'mmrtextb', 'mmrtextb', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/mmrtextb.ttf', true),
  ('dc6478f6-126e-4414-9cb5-cac17559ac4b', 'OCR-A BT', 'OCR-A BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/OCR-A_BT.ttf', true),
  ('9a9653df-ffe8-4e10-a945-3842b2fddf52', 'calibrili', 'calibrili', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibrili.ttf', true),
  ('af531503-0872-4bc7-94cb-6c9cb0bca899', 'Clarendon BT Bold', 'Clarendon BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Clarendon_BT_Bold.ttf', true),
  ('f6481c65-433f-4aa9-b586-97078d4ce3d5', 'marlett', 'marlett', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/marlett.ttf', true),
  ('f2e13ead-012b-4a84-bf56-248125d84a8e', 'Clarendon BT Roman', 'Clarendon BT Roman', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Clarendon_BT_Roman.ttf', true),
  ('b89dfc74-fb03-41d4-89ef-5563bc423289', 'Bodoni Bk BT Book', 'Bodoni Bk BT Book', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Bodoni_Bk_BT_Book.ttf', true),
  ('71732ed0-b8f8-41b3-9331-f401465831cd', 'trebucbi', 'trebucbi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/trebucbi.ttf', true),
  ('7a799e71-ae5a-4ce0-80f6-9324b26dc568', 'Swis721 BT Bold', 'Swis721 BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_BT_Bold.ttf', true),
  ('60dac32e-6df2-4bc3-bd98-3c661f593c06', 'Humanst521 Lt BT Light', 'Humanst521 Lt BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_Lt_BT_Light.ttf', true),
  ('ba441a75-ef23-4d09-85e8-2ebb040e45b6', 'lucon', 'lucon', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/lucon.ttf', true),
  ('42623bb5-3939-4b72-821e-ab666e9c08fc', 'monbaiti', 'monbaiti', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/monbaiti.ttf', true),
  ('a5f6bc50-7878-49fc-ae05-89b9a3468936', 'calibriz', 'calibriz', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/calibriz.ttf', true),
  ('bb24d522-6e96-4e5e-afb6-2ec8372b7138', 'Humanst521 BT Italic', 'Humanst521 BT Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humanst521_BT_Italic.ttf', true),
  ('8d0a9529-5632-4e89-9420-0022215b7af6', 'comici', 'comici', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/comici.ttf', true),
  ('bcaf7f84-361b-4bbb-a1d7-91a446655b74', 'segoepr', 'segoepr', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoepr.ttf', true),
  ('9ddefbf6-074e-4995-a037-df0d00e04227', 'OCR-B 10 BT', 'OCR-B 10 BT', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/OCR-B_10_BT.ttf', true),
  ('2ba09d24-97c8-4f09-90aa-d6c15447dfde', 'msyi', 'msyi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/msyi.ttf', true),
  ('d5512810-f35d-4123-bd3c-983b530bad2f', 'Bodoni Bk BT Book Italic', 'Bodoni Bk BT Book Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Bodoni_Bk_BT_Book_Italic.ttf', true),
  ('e3f9bb63-76e7-4072-9a6a-b11ae00a4fb4', 'Humnst777 BlkCn BT Black', 'Humnst777 BlkCn BT Black', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Humnst777_BlkCn_BT_Black.ttf', true),
  ('441f25ac-2143-4c57-b60b-056c0427b741', 'wingding', 'wingding', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/wingding.ttf', true),
  ('ba6cad5f-8e4b-44f1-a0c3-3e294ec4a240', 'courbi', 'courbi', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/courbi.ttf', true),
  ('6941433b-c87b-464e-bfd0-321eb1097e28', 'malgunsl', 'malgunsl', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/malgunsl.ttf', true),
  ('6c0d4924-9a4c-4ebd-a83d-66a3203ca7bf', 'mmrtext', 'mmrtext', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/mmrtext.ttf', true),
  ('c7ef05d9-5207-4cc9-9f1c-86ad3de46630', 'verdana', 'verdana', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/verdana.ttf', true),
  ('ce9cb0b1-1961-49a7-883b-0eb7eb60a561', 'Swis721 Cn BT Bold Italic', 'Swis721 Cn BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Swis721_Cn_BT_Bold_Italic.ttf', true),
  ('081422d8-5940-4385-aad7-049e45f0b20c', 'segoeuib', 'segoeuib', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoeuib.ttf', true),
  ('289c1f59-0d21-467d-b975-1f7aaa06cce6', 'consolab', 'consolab', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/consolab.ttf', true),
  ('54c3748e-0442-4e5c-8268-dd9896047b10', 'Century751 SeBd BT Semi Bold Italic', 'Century751 SeBd BT Semi Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Century751_SeBd_BT_Semi_Bold_Italic.ttf', true),
  ('ef70eecb-dc77-4be1-938b-33a319233cf4', 'segoesc', 'segoesc', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/segoesc.ttf', true),
  ('c3b29500-522a-4b79-a769-7d522eb7791a', 'seguisli', 'seguisli', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/seguisli.ttf', true),
  ('3ef04b2f-bbb0-4954-8b67-cda68646f217', 'verdanai', 'verdanai', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/verdanai.ttf', true),
  ('3343e7e6-b8f6-4c5e-a59e-10824f67d1b6', 'Futura Bk BT Book Italic', 'Futura Bk BT Book Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Futura_Bk_BT_Book_Italic.ttf', true),
  ('e12864a4-22ea-41b9-903f-384b08a29d21', 'Schadow BT Bold', 'Schadow BT Bold', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Schadow_BT_Bold.ttf', true),
  ('0c23aa17-cd38-4aae-8409-c890fcdc0fd6', 'Clarendon Lt BT Light', 'Clarendon Lt BT Light', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/Clarendon_Lt_BT_Light.ttf', true),
  ('aac0f310-49b0-4da1-b177-15fbaeb747f7', 'gadugib', 'gadugib', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/gadugib.ttf', true),
  ('6458c32c-a85d-4b95-8b56-876a0e096a1b', 'CentSchbkCyrill BT Bold Italic', 'CentSchbkCyrill BT Bold Italic', 'Sistema', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/CentSchbkCyrill_BT_Bold_Italic.ttf', true),
  ('9bf6db87-79e8-4e8b-84e0-7e3b43b0acc1', 'Gotham Book', 'Gotham Book', 'Geral', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/chat-ideal/fontes/1786733620026_0_gothambook.ttf', true),
  ('068403b4-a9c1-4e23-96e2-9ffe45db729a', 'Gotham Bold', 'Gotham Bold', 'Geral', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/chat-ideal/fontes/1786733640393_0_gothambold.ttf', true),
  ('8356c66c-1b1b-4884-b3a9-70356daf1191', 'Swis721 LtCn BT Light', 'Swis721 LtCn BT Light', 'Geral', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/chat-ideal/fontes/1786733648281_0_swiss_721_ltcn_bt.ttf', true),
  ('48b58123-66d6-4fe5-aedb-900cf9684218', 'Swiss 911 Extra Compressed', 'Swiss 911 Extra Compressed', 'Geral', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/chat-ideal/fontes/1786733655593_0_swiss_911_extra_compressed_regular.otf', true)
on conflict (id) do nothing;
