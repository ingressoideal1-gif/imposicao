-- Preparação local. Aplicar separadamente, em transação, após revisão.
-- Não modifica propostas, pedidos_modelos, catálogos ou permissões existentes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS idgen_app;
CREATE TABLE idgen_app.pedidos_editor (
  id uuid PRIMARY KEY,
  cliente_id bigint NOT NULL,
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  documento jsonb NOT NULL CHECK (jsonb_typeof(documento) = 'object'),
  revisao integer NOT NULL DEFAULT 1,
  criado_por uuid NOT NULL,
  atualizado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE idgen_app.pedidos_editor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON idgen_app.pedidos_editor FROM PUBLIC, anon, authenticated, service_role;

-- Somente o backend invoca; a identidade vem da sessão validada, nunca do corpo.
CREATE FUNCTION public.idgen_editor_operar(p_usuario uuid, p_acao text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  papel text;
  linha idgen_app.pedidos_editor;
  alvo uuid;
  cliente bigint;
  resultado jsonb;
BEGIN
  SELECT lower(p.role) INTO papel FROM public.imposition_user_permissions p WHERE p.user_id = p_usuario;
  IF papel IS NULL OR papel NOT IN ('admin', 'atendimento', 'designer') THEN
    RAISE EXCEPTION 'Acesso IdGen não autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_acao = 'clientes' THEN
    IF length(btrim(p_dados->>'busca')) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'Informe ao menos dois caracteres' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO resultado FROM (
      SELECT id_cliente, nome, fantasia FROM public.clientes
      WHERE strpos(lower(coalesce(nome, '')), lower(p_dados->>'busca')) > 0
         OR strpos(lower(coalesce(fantasia, '')), lower(p_dados->>'busca')) > 0
         OR id_cliente::text = p_dados->>'busca'
      ORDER BY coalesce(nullif(fantasia, ''), nome), id_cliente LIMIT 30
    ) c;
    RETURN resultado;
  END IF;
  IF p_acao = 'listar' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO resultado FROM (
      SELECT id, cliente_id, nome, revisao, atualizado_em
      FROM idgen_app.pedidos_editor ORDER BY atualizado_em DESC, id LIMIT 200
    ) p;
    RETURN resultado;
  END IF;
  alvo := (p_dados->>'id')::uuid;
  IF alvo IS NULL THEN RAISE EXCEPTION 'Pedido inválido' USING ERRCODE = '22023'; END IF;
  IF p_acao = 'criar' THEN
    cliente := (p_dados->>'cliente_id')::bigint;
    IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id_cliente = cliente) THEN
      RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = '22023';
    END IF;
    INSERT INTO idgen_app.pedidos_editor(id, cliente_id, nome, documento, criado_por, atualizado_por)
    VALUES (alvo, cliente, btrim(p_dados->>'nome'), '{"modelos":[],"cores":[],"numeracoes":[],"formatos":[]}', p_usuario, p_usuario)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO linha FROM idgen_app.pedidos_editor WHERE id = alvo;
    IF linha.cliente_id IS DISTINCT FROM cliente OR linha.nome IS DISTINCT FROM btrim(p_dados->>'nome')
       OR linha.criado_por IS DISTINCT FROM p_usuario THEN
      RAISE EXCEPTION 'Identificador já utilizado' USING ERRCODE = '23505';
    END IF;
  ELSIF p_acao = 'salvar' THEN
    IF jsonb_typeof(p_dados->'documento') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_dados->'documento'->'modelos') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_dados->'documento'->'modelos') > 500
       OR octet_length((p_dados->'documento')::text) > 16777216 THEN
      RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023';
    END IF;
    UPDATE idgen_app.pedidos_editor SET documento = p_dados->'documento', revisao = revisao + 1,
      atualizado_por = p_usuario, atualizado_em = now()
    WHERE id = alvo AND revisao = (p_dados->>'revisao')::integer RETURNING * INTO linha;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido mudou; reabra antes de salvar' USING ERRCODE = '40001'; END IF;
  ELSIF p_acao = 'abrir' THEN
    SELECT * INTO linha FROM idgen_app.pedidos_editor WHERE id = alvo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado' USING ERRCODE = 'P0002'; END IF;
  ELSE
    RAISE EXCEPTION 'Operação inválida' USING ERRCODE = '22023';
  END IF;
  RETURN to_jsonb(linha) || jsonb_build_object('cliente_nome', (
    SELECT coalesce(nullif(c.fantasia, ''), c.nome) FROM public.clientes c WHERE c.id_cliente = linha.cliente_id
  ));
END $$;
REVOKE ALL ON FUNCTION public.idgen_editor_operar(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.idgen_editor_operar(uuid,text,jsonb) TO service_role;
COMMIT;
