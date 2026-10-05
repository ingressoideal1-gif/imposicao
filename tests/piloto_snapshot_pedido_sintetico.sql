-- Exclusivamente em PostgreSQL descartavel com dados sinteticos.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA storage;
CREATE TABLE public.pedidos_modelos(id bigint PRIMARY KEY,id_int integer,amostra_num_id text,id_produto_proposta_origem bigint,
  arte_url text,status_arte text,status_impressao text,quantidade integer);
CREATE TABLE public.producao_numeracoes(id uuid PRIMARY KEY,empresa_id uuid,elements jsonb,csv_data jsonb);
CREATE TABLE public.produtos_proposta(id bigint PRIMARY KEY,id_int integer,id_produto integer);
CREATE TABLE public.produtos(id bigint PRIMARY KEY,id_produto smallint,is_estoque boolean,setor_pcp text);
CREATE TABLE public.propostas(id uuid PRIMARY KEY,id_int bigint,status_interno text);
CREATE TABLE public.propostas_os(id uuid PRIMARY KEY,id_int integer,data_termino timestamptz);
CREATE TABLE public.pedidos_bancos(id uuid PRIMARY KEY,id_int integer,csv_data jsonb);
CREATE TABLE public.pedidos_modelos_banco(modelo_id text PRIMARY KEY,banco_id uuid,csv_mapa jsonb);
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,version text,updated_at timestamptz,created_at timestamptz,
 metadata jsonb,user_metadata jsonb,archived_at timestamptz,is_delete_marker boolean);
INSERT INTO public.pedidos_modelos VALUES(10,99,'00000000-0000-0000-0000-000000000005',30,
 'https://test.supabase.co/storage/v1/object/public/artes/arte%20a%C3%A7%C3%A3o.pdf','APROVADO','Aguardando',100);
INSERT INTO public.producao_numeracoes VALUES('00000000-0000-0000-0000-000000000005',NULL,'[{"type":"TEXT","text":"Teste"}]','[]');
INSERT INTO public.produtos_proposta VALUES(30,99,40);
INSERT INTO public.produtos VALUES(1,40,false,'Laser');
INSERT INTO public.propostas VALUES('00000000-0000-0000-0000-000000000001',99,'EM PRODUCAO');
INSERT INTO public.pedidos_bancos VALUES('00000000-0000-0000-0000-000000000006',99,'[["Teste"]]');
INSERT INTO public.pedidos_modelos_banco VALUES('10','00000000-0000-0000-0000-000000000006','{"a":"b"}');
INSERT INTO storage.objects VALUES('00000000-0000-0000-0000-000000000002','artes','arte ação.pdf','v1',now(),now(),'{"eTag":"abc"}',NULL,NULL,false);
