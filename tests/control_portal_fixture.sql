CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE EXTENSION pgcrypto;
CREATE TABLE propostas(id_int integer PRIMARY KEY,id_cliente integer,status_interno text);
CREATE TABLE pedidos_links_cliente(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),numero_pedido text,token text,ativo boolean);
CREATE TABLE pedidos_artes(id_int integer,nome_evento text,data_evento timestamptz,local_evento text,created_at timestamptz DEFAULT now());
CREATE TABLE producao_numeracoes(id uuid PRIMARY KEY,elements jsonb);
CREATE TABLE pedidos_modelos(id integer PRIMARY KEY,id_int integer,nome_modelo text,quantidade integer,
    amostra_num_id text,status_impressao text);
CREATE TABLE producao_acesso_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_cliente integer,
    dono_auth_id uuid,nome_evento text,data_evento timestamptz,local_evento text,sal text,status text DEFAULT 'ativo');
CREATE TABLE producao_acesso_pedidos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pedido_id_int integer UNIQUE,
    evento_id uuid REFERENCES producao_acesso_eventos,sal text,publicado_em timestamptz,total_credenciais integer);
CREATE TABLE producao_acesso_setores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evento_id uuid REFERENCES producao_acesso_eventos,
    pedido_id_int integer,modelo_id integer UNIQUE,nome text,quantidade integer,status text DEFAULT 'ativo');
CREATE TABLE producao_acesso_credenciais(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pedido_id_int integer,modelo_id integer,
    numero integer,codigo_hash text,evento_id uuid REFERENCES producao_acesso_eventos,
    setor_id uuid REFERENCES producao_acesso_setores,status text DEFAULT 'ativo');
CREATE TABLE producao_acesso_convites_evento(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evento_id uuid REFERENCES producao_acesso_eventos,
    segredo_hash text UNIQUE,criado_por uuid NOT NULL,revogado_em timestamptz);

CREATE TABLE producao_acesso_qr_contratos(pedido integer,modelo integer);
ALTER TABLE producao_acesso_pedidos ADD COLUMN status text DEFAULT 'ativo', ADD COLUMN qr_revogado_em timestamptz;

ALTER TABLE pedidos_modelos ADD COLUMN numeracao_inicio integer DEFAULT 1;
ALTER TABLE producao_numeracoes ADD COLUMN tipo text DEFAULT 'SEQUENCIAL', ADD COLUMN ticket_qtd integer DEFAULT 1;
ALTER TABLE producao_acesso_credenciais ADD COLUMN origem text,
 ADD COLUMN chave_dedup text GENERATED ALWAYS AS (pedido_id_int::text||':'||modelo_id::text||':'||numero::text) STORED UNIQUE;
