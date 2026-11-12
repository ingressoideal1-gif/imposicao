CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE propostas(id bigint PRIMARY KEY, id_int bigint UNIQUE, status_interno text);
CREATE TABLE producao_ordens_servico(id uuid PRIMARY KEY, numero integer, status text);
CREATE TABLE pedidos_artes(id bigint PRIMARY KEY, id_int integer, status text, entrega_dados text,
    created_at timestamptz DEFAULT now(), observacoes jsonb, reprovacao_acao uuid);
CREATE TABLE pedidos_modelos(id bigint PRIMARY KEY, id_int integer, status_arte text,
    status_impressao text, observacao_arte text);
CREATE TABLE pedidos_links_cliente(id bigint PRIMARY KEY, id_int text,numero_pedido text,
    ativo boolean,status_arte text,cliente_abriu_em timestamptz,arte_pronta_em timestamptz,os_id text);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Reproduz o efeito do gatilho de consolidacao existente: sem aprovados -> EM ARTE.
CREATE FUNCTION fixture_consolidar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status_arte IS DISTINCT FROM OLD.status_arte THEN
        UPDATE public.pedidos_artes SET status='EM ARTE' WHERE id_int=NEW.id_int;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER fixture_consolidar AFTER UPDATE ON pedidos_modelos FOR EACH ROW EXECUTE FUNCTION fixture_consolidar();
