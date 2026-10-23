-- Atualiza somente a busca IdGen; nenhuma escrita em clientes ou pedidos.
BEGIN;
CREATE OR REPLACE FUNCTION public.idgen_editor_operar(p_usuario uuid, p_acao text, p_dados jsonb)
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
    IF coalesce(btrim(p_dados->>'busca'), '') !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'Informe o numero do cliente' USING ERRCODE = '22023';
    END IF;
    cliente := btrim(p_dados->>'busca')::bigint;
    IF cliente < 1 OR cliente > 2147483647 THEN
      RAISE EXCEPTION 'Numero do cliente invalido' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO resultado FROM (
      SELECT id_cliente, nome, fantasia FROM public.clientes WHERE id_cliente = cliente
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
