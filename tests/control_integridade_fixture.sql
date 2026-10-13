-- Banco sintético exclusivo dos testes. Nenhum registro de produção.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE producao_acesso_eventos(id uuid PRIMARY KEY,status text DEFAULT 'ativo',entradas_zeradas_em timestamptz);
CREATE TABLE producao_acesso_dispositivos(id uuid PRIMARY KEY,evento_id uuid REFERENCES producao_acesso_eventos,
 nome text DEFAULT 'Sintético',status text DEFAULT 'ativo',ultimo_visto timestamptz);
CREATE TABLE producao_acesso_setores(id uuid PRIMARY KEY,evento_id uuid REFERENCES producao_acesso_eventos,
 status text DEFAULT 'ativo',tipo_uso text DEFAULT 'unico',bloqueado boolean DEFAULT false,abre_em timestamptz,fecha_em timestamptz);
CREATE TABLE producao_acesso_credenciais(id uuid PRIMARY KEY,evento_id uuid REFERENCES producao_acesso_eventos,
 setor_id uuid REFERENCES producao_acesso_setores,status text DEFAULT 'ativo',numero integer,origem text DEFAULT 'qr_ideal');
CREATE TABLE producao_acesso_dispositivo_setores(dispositivo_id uuid REFERENCES producao_acesso_dispositivos,
 setor_id uuid REFERENCES producao_acesso_setores);
CREATE TABLE producao_acesso_bloqueios(evento_id uuid,setor_id uuid,status text DEFAULT 'ativo',de integer,ate integer,motivo text);
CREATE TABLE producao_acesso_entradas_unicas(credencial_id uuid PRIMARY KEY,evento_id uuid NOT NULL,setor_id uuid,dispositivo_id uuid,momento timestamptz NOT NULL);
CREATE TABLE producao_acesso_leituras(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evento_id uuid REFERENCES producao_acesso_eventos,
 dispositivo_id uuid REFERENCES producao_acesso_dispositivos,credencial_id uuid REFERENCES producao_acesso_credenciais,
 setor_id uuid REFERENCES producao_acesso_setores,id_local text NOT NULL,momento timestamptz NOT NULL,tipo text,
 resultado text,motivo text,UNIQUE(dispositivo_id,id_local));
INSERT INTO producao_acesso_eventos(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO producao_acesso_dispositivos(id,evento_id) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');
INSERT INTO producao_acesso_setores(id,evento_id) VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002');
INSERT INTO producao_acesso_credenciais(id,evento_id,setor_id,numero) VALUES
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021',1),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022',1);
INSERT INTO producao_acesso_dispositivo_setores SELECT id,'00000000-0000-4000-8000-000000000021'::uuid FROM producao_acesso_dispositivos;
