-- Exclusivo para banco descartável em memória. Nunca executar em banco existente.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.imposition_user_permissions(user_id uuid PRIMARY KEY, role text,
    perm_lista_arte_view boolean DEFAULT true, perm_lista_arte_edit boolean DEFAULT true);
CREATE TABLE public.usuarios(user_id uuid PRIMARY KEY,nome_usuario text,setor text,id_empresa bigint);
CREATE TABLE public.propostas(id_int bigint PRIMARY KEY,status_interno text,user_id uuid);
CREATE TABLE public.pedidos_artes(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint,status text,entrega_dados text,designer_uid uuid,designer_nome text,
    created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.pedidos_modelos(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint,status_arte text,amostra_status text,status_impressao text);
CREATE TABLE public.produtos_proposta(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_int bigint,amostra_status text);
CREATE TABLE public.pedidos_links_cliente(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_pedido text,ativo boolean DEFAULT true,cliente_abriu_em timestamptz,status_arte text,
    created_at timestamptz DEFAULT clock_timestamp());
INSERT INTO public.imposition_user_permissions(user_id,role) VALUES
 ('00000000-0000-0000-0000-000000000001','admin'),
 ('00000000-0000-0000-0000-000000000002','atendimento'),
 ('00000000-0000-0000-0000-000000000003','designer');
INSERT INTO public.usuarios VALUES
 ('10000000-0000-0000-0000-000000000001','Designer A','Designer'),
 ('10000000-0000-0000-0000-000000000002','Designer B','Designer'),
 ('10000000-0000-0000-0000-000000000003','Designer C','Designer');

CREATE SCHEMA cron;
CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO cron.job VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=$2,command=$3;
 RETURN 1;
END $$;
CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobname=$1; RETURN FOUND; END $$;
