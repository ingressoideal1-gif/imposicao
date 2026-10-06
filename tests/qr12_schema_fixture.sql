-- Somente banco local descartável, sem dados/copias de produção.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE pedidos_modelos(id bigint PRIMARY KEY,id_int integer,quantidade integer,numeracao_inicio bigint,
 created_at timestamptz DEFAULT now(),amostra_num_id text);
CREATE TABLE producao_numeracoes(id text PRIMARY KEY,tipo text,ticket_qtd integer,elements jsonb);
CREATE TABLE producao_acesso_pedidos(pedido_id_int integer,eventO_id uuid);
CREATE TABLE producao_acesso_preparacoes(pedido_id_int integer);
CREATE TABLE producao_acesso_credenciais(id uuid DEFAULT gen_random_uuid(),pedido_id_int integer,modelo_id integer,
 numero integer,codigo_hash text,evento_id uuid,setor_id uuid);
INSERT INTO producao_numeracoes VALUES('qr','SEQUENCIAL',1,'[{"type":"QR_IDEAL"}]');
INSERT INTO pedidos_modelos VALUES(1001859,23063,500,1,'2026-10-01','qr'),(1001959,23063,800,1,'2026-10-01','qr');
