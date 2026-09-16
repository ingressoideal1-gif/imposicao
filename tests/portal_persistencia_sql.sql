-- Integração exclusivamente em PostgreSQL LOCAL DESCARTÁVEL, nunca no Supabase.
-- Requer banco vazio portal_persistencia_teste e usuário capaz de criar roles.
-- psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -d portal_persistencia_teste -f tests/portal_persistencia_sql.sql
\set ON_ERROR_STOP on
DO $$ BEGIN
    IF current_database() <> 'portal_persistencia_teste'
       OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet))
       OR to_regclass('public.pedidos_links_cliente') IS NOT NULL THEN
        RAISE EXCEPTION 'Exige banco local descartável vazio portal_persistencia_teste';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;

CREATE TABLE public.pedidos_links_cliente (
    id uuid PRIMARY KEY, numero_pedido text, token text, ativo boolean,
    os_id text UNIQUE, id_int text, status_arte text
);
CREATE TABLE public.pedidos_modelos (id bigint PRIMARY KEY, id_int integer, status_arte text);
CREATE TABLE public.pedidos_artes (
    id uuid PRIMARY KEY, id_int integer, status text, entrega_dados text,
    observacoes jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.producao_ordens_servico (id uuid PRIMARY KEY, numero integer, status text);
CREATE TABLE public.propostas_chat (
    id bigint GENERATED ALWAYS AS IDENTITY, id_int bigint, tipo text, setor text,
    visivel_externo boolean, mensagem text, autor_nome text
);
-- Substitui somente a leitura comercial neste banco sintético.
CREATE FUNCTION public.link_cliente_pedido(text, text) RETURNS jsonb LANGUAGE sql AS $$
    SELECT '{"pedido":{"frete_escolhido":"RETIRADA"},"cliente":null,"endereco":null}'::jsonb
$$;
\ir ../sql/link_cliente_finalizar.sql

BEGIN;
CREATE FUNCTION pg_temp.conferir(condicao boolean, descricao text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condicao IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', descricao; END IF;
END $$;
CREATE FUNCTION pg_temp.deve_falhar(comando text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE comando;
    EXCEPTION WHEN OTHERS THEN RETURN;
    END;
    RAISE EXCEPTION 'FALHOU: operação indevida foi aceita';
END $$;

INSERT INTO public.pedidos_links_cliente VALUES
('00000000-0000-0000-0000-000000000001', '123', 'teste1', true, 'vibe_123', '123', 'Dados Pendentes'),
('00000000-0000-0000-0000-000000000002', '456', 'teste2', true, '00000000-0000-0000-0000-000000000456', '456', 'Dados Pendentes');
INSERT INTO public.pedidos_modelos VALUES (1,123,'APROVADA_CLIENTE'), (2,123,'APROVADA'), (3,456,'APROVADA_CLIENTE');
INSERT INTO public.pedidos_artes VALUES
('00000000-0000-0000-0000-000000000001',123,'Dados Pendentes','APROVADO','{"preservar":"arte1","confirmacoes_portal":{"entrega":true,"faturamento":true,"selo":"APROVADO","finalizado":false}}',now()),
('00000000-0000-0000-0000-000000000002',123,'Dados Pendentes','APROVADO','{"preservar":"arte2","confirmacoes_portal":{"entrega":true,"faturamento":true,"selo":"APROVADO","finalizado":false}}',now()),
('00000000-0000-0000-0000-000000000003',456,'Dados Pendentes','CORRIGIR','{"correcao_entrega":"Rua corrigida","confirmacoes_portal":{"entrega":false,"faturamento":true,"selo":"CORRIGIR","finalizado":false}}',now());
INSERT INTO public.producao_ordens_servico VALUES ('00000000-0000-0000-0000-000000000456',456,'Dados Pendentes');

DO $$
DECLARE
    c jsonb := '{"entrega":true,"faturamento":true,"textoEntrega":"","textoFaturamento":""}';
    r jsonb;
BEGIN
    PERFORM pg_temp.deve_falhar(format('SELECT public.link_cliente_finalizar(''123'',''errado'',%L)',c));
    UPDATE public.pedidos_links_cliente SET ativo=false WHERE numero_pedido='123';
    PERFORM pg_temp.deve_falhar(format('SELECT public.link_cliente_finalizar(''123'',''teste1'',%L)',c));
    UPDATE public.pedidos_links_cliente SET ativo=true WHERE numero_pedido='123';
    PERFORM pg_temp.deve_falhar('SELECT public.link_cliente_finalizar(''123'',''teste1'',''{}'')');

    UPDATE public.pedidos_modelos SET status_arte='REPROVADA_CLIENTE' WHERE id=2;
    PERFORM pg_temp.deve_falhar(format('SELECT public.link_cliente_finalizar(''123'',''teste1'',%L)',c));
    PERFORM pg_temp.conferir((SELECT status_arte='Dados Pendentes' FROM public.pedidos_links_cliente WHERE numero_pedido='123'), 'modelo reprovado não aprova o link');
    UPDATE public.pedidos_modelos SET status_arte='APROVADA_CLIENTE' WHERE id=2;
    UPDATE public.pedidos_artes SET entrega_dados='ALTERADO' WHERE id_int=123;
    PERFORM pg_temp.deve_falhar(format('SELECT public.link_cliente_finalizar(''123'',''teste1'',%L)',c));
    UPDATE public.pedidos_artes SET entrega_dados='APROVADO' WHERE id_int=123;
    PERFORM pg_temp.conferir((SELECT count(*)=0 FROM public.propostas_chat), 'falhas não enviam chat');

    r := public.link_cliente_finalizar('123','teste1',c);
    PERFORM pg_temp.conferir(r->>'status'='APROVADO' AND r->'finalizado'='true'::jsonb, 'recibo aprovado');
    PERFORM pg_temp.conferir((SELECT bool_and(status='APROVADO' AND observacoes->'confirmacoes_portal'->'finalizado'='true'::jsonb) FROM public.pedidos_artes WHERE id_int=123), 'todas as linhas confirmadas');
    PERFORM pg_temp.conferir((SELECT observacoes->>'preservar'='arte1' FROM public.pedidos_artes WHERE id='00000000-0000-0000-0000-000000000001'), 'preserva observação individual');
    PERFORM pg_temp.conferir((SELECT status='Dados Pendentes' FROM public.pedidos_artes WHERE id_int=456), 'isola outro pedido');
    PERFORM public.link_cliente_finalizar('123','teste1',c);
    PERFORM pg_temp.conferir((SELECT count(*)=1 FROM public.propostas_chat WHERE id_int=123), 'repetição não duplica mensagem');

    c := '{"entrega":false,"faturamento":true,"textoEntrega":"não salvo","textoFaturamento":""}';
    PERFORM pg_temp.deve_falhar(format('SELECT public.link_cliente_finalizar(''456'',''teste2'',%L)',c));
    c := jsonb_set(c,'{textoEntrega}','"Rua corrigida"');
    r := public.link_cliente_finalizar('456','teste2',c);
    PERFORM pg_temp.conferir(r->>'status'='Corrigir Dados', 'correção não aprova o pedido');
    PERFORM pg_temp.conferir((SELECT status_arte='Corrigir Dados' FROM public.pedidos_links_cliente WHERE numero_pedido='456'), 'link com correção');
    PERFORM pg_temp.conferir((SELECT status='Corrigir Dados' FROM public.producao_ordens_servico WHERE numero=456), 'OS local com correção');
END $$;

-- Falha tardia no chat deve desfazer as alterações anteriores na função.
UPDATE public.pedidos_links_cliente SET status_arte='Dados Pendentes' WHERE numero_pedido='123';
UPDATE public.pedidos_artes SET status='Dados Pendentes',
    observacoes=jsonb_set(observacoes,'{confirmacoes_portal,finalizado}','false') WHERE id_int=123;
CREATE FUNCTION pg_temp.recusar_chat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'falha simulada no chat'; END $$;
CREATE TRIGGER recusar_chat BEFORE INSERT ON public.propostas_chat
FOR EACH ROW EXECUTE FUNCTION pg_temp.recusar_chat();
SELECT pg_temp.deve_falhar($q$SELECT public.link_cliente_finalizar('123','teste1',
'{"entrega":true,"faturamento":true,"textoEntrega":"","textoFaturamento":""}')$q$);
SELECT pg_temp.conferir((SELECT bool_and(status='Dados Pendentes' AND observacoes->'confirmacoes_portal'->'finalizado'='false'::jsonb)
FROM public.pedidos_artes WHERE id_int=123), 'rollback do pedido e marcador após falha no chat');
SELECT pg_temp.conferir((SELECT status_arte='Dados Pendentes' FROM public.pedidos_links_cliente WHERE numero_pedido='123'), 'rollback do link');
DROP TRIGGER recusar_chat ON public.propostas_chat;

-- O cliente só recebe a permissão de executar a RPC; não de ler as tabelas.
SELECT pg_temp.conferir(NOT has_table_privilege('anon','public.pedidos_links_cliente','SELECT'), 'anon não lista tokens');
SET LOCAL ROLE anon;
SELECT public.link_cliente_finalizar('123','teste1',
'{"entrega":true,"faturamento":true,"textoEntrega":"","textoFaturamento":""}');
RESET ROLE;
ROLLBACK;
\echo OK: regressões SQL do portal concluídas no banco descartável.
