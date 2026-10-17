-- Nova etapa; nao modifica os scripts de implantacao anteriores.
BEGIN;
CREATE TABLE public.vibe_entregas_cadastros (
  operacao uuid PRIMARY KEY, email text UNIQUE NOT NULL, nome text NOT NULL,
  empresas text[] NOT NULL, autor uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vibe_entregas_entregadores (
  usuario uuid PRIMARY KEY REFERENCES auth.users(id), email text UNIQUE NOT NULL,
  nome text NOT NULL, ativo boolean NOT NULL DEFAULT true,
  operacao uuid UNIQUE NOT NULL REFERENCES public.vibe_entregas_cadastros(operacao)
);
CREATE TABLE public.vibe_entregas_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  autor uuid NOT NULL, acao text NOT NULL, alvo uuid NOT NULL,
  registrada_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vibe_entregas_cadastros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_entregas_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_entregas_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vibe_entregas_cadastros,public.vibe_entregas_entregadores,public.vibe_entregas_auditoria FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ve_admin_edita() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT ve_e_gestor() AND EXISTS(SELECT 1 FROM imposition_user_permissions WHERE user_id=auth.uid() AND perm_admin_edit IS TRUE);
$$;
CREATE FUNCTION public.ve_admin_validar_empresas(p_empresas text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(cardinality(p_empresas) BETWEEN 1 AND 30,false)
 AND NOT EXISTS(SELECT 1 FROM unnest(p_empresas) e WHERE e IS NULL OR NOT EXISTS(SELECT 1 FROM propostas p WHERE p.empresa=e));
$$;
CREATE FUNCTION public.ve_admin_contexto() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN jsonb_build_object('editar',ve_admin_edita(),
  'empresas',(SELECT coalesce(jsonb_agg(e ORDER BY e),'[]') FROM (SELECT DISTINCT empresa e FROM propostas WHERE nullif(trim(empresa),'') IS NOT NULL) q),
  'entregadores',(SELECT coalesce(jsonb_agg(jsonb_build_object('usuario',d.usuario,'email',d.email,'nome',d.nome,'ativo',d.ativo,
    'empresas',(SELECT coalesce(jsonb_agg(a.empresa ORDER BY a.empresa),'[]') FROM vibe_entregas_acessos a WHERE a.usuario=d.usuario AND a.ativo)) ORDER BY d.nome),'[]') FROM vibe_entregas_entregadores d));
END $$;

-- Reservar primeiro permite retomar falhas entre Auth e banco sem duplicar conta.
-- Nenhuma senha e gravada nestas tabelas ou retornada por RPC.
CREATE FUNCTION public.ve_admin_preparar_cadastro(p_operacao uuid,p_email text,p_nome text,p_empresas text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_cadastros%ROWTYPE; u uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_operacao IS NULL OR length(trim(p_nome)) NOT BETWEEN 2 AND 120 OR p_nome IS NULL
 OR p_email IS NULL OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR NOT ve_admin_validar_empresas(p_empresas) THEN RAISE EXCEPTION 'Cadastro invalido'; END IF;
 p_email:=lower(trim(p_email));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_email,1));
 SELECT * INTO r FROM vibe_entregas_cadastros WHERE operacao=p_operacao;
 IF FOUND AND (r.autor<>auth.uid() OR r.email<>p_email OR r.nome<>trim(p_nome) OR r.empresas<>p_empresas) THEN RAISE EXCEPTION 'Solicitacao alterada; reinicie o cadastro'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_email AND (raw_app_meta_data->>'vibe_operacao') IS DISTINCT FROM p_operacao::text)
 THEN RAISE EXCEPTION 'Email ja utilizado por outra conta'; END IF;
 INSERT INTO vibe_entregas_cadastros VALUES(p_operacao,p_email,trim(p_nome),p_empresas,auth.uid(),now()) ON CONFLICT(operacao) DO NOTHING;
 SELECT id INTO u FROM auth.users WHERE lower(email)=p_email AND raw_app_meta_data->>'vibe_operacao'=p_operacao::text;
 RETURN jsonb_build_object('usuario',u,'operacao',p_operacao);
END $$;
CREATE FUNCTION public.ve_admin_concluir_cadastro(p_operacao uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r vibe_entregas_cadastros%ROWTYPE; u uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 SELECT * INTO STRICT r FROM vibe_entregas_cadastros WHERE operacao=p_operacao AND autor=auth.uid() FOR UPDATE;
 SELECT id INTO STRICT u FROM auth.users WHERE lower(email)=r.email AND raw_app_meta_data->>'vibe_operacao'=r.operacao::text;
 IF EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=u) THEN RETURN jsonb_build_object('usuario',u,'confirmado',true); END IF;
 INSERT INTO vibe_entregas_entregadores(usuario,email,nome,operacao) VALUES(u,r.email,r.nome,r.operacao);
 INSERT INTO vibe_entregas_acessos(usuario,empresa,nome,ativo,gestor) SELECT u,e,r.nome,true,false FROM (SELECT DISTINCT unnest(r.empresas) e) q;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'entregador_criado',u);
 RETURN jsonb_build_object('usuario',u,'confirmado',true);
END $$;
CREATE FUNCTION public.ve_admin_editar_entregador(p_usuario uuid,p_nome text,p_empresas text[],p_ativo boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d vibe_entregas_entregadores%ROWTYPE; gravado uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 2 AND 120 OR p_ativo IS NULL OR NOT ve_admin_validar_empresas(p_empresas) THEN RAISE EXCEPTION 'Cadastro invalido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_usuario::text,0));
 SELECT * INTO STRICT d FROM vibe_entregas_entregadores WHERE usuario=p_usuario FOR UPDATE;
 IF EXISTS(SELECT 1 FROM vibe_entregas_registros r JOIN propostas p ON p.id=r.proposta WHERE r.entregador=p_usuario AND r.concluida_em IS NULL AND (NOT p_ativo OR NOT p.empresa=ANY(p_empresas)))
 THEN RAISE EXCEPTION 'Entregador possui pedidos pendentes nas empresas removidas'; END IF;
 UPDATE vibe_entregas_entregadores SET nome=trim(p_nome),ativo=p_ativo WHERE usuario=p_usuario RETURNING usuario INTO gravado;
 IF gravado IS NULL THEN RAISE EXCEPTION 'Cadastro nao persistido'; END IF;
 UPDATE vibe_entregas_acessos SET ativo=false WHERE usuario=p_usuario;
 INSERT INTO vibe_entregas_acessos(usuario,empresa,nome,ativo,gestor) SELECT p_usuario,e,trim(p_nome),p_ativo,false FROM (SELECT DISTINCT unnest(p_empresas) e) q
 ON CONFLICT(usuario,empresa) DO UPDATE SET nome=excluded.nome,ativo=excluded.ativo,gestor=false;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'entregador_editado',p_usuario);
 RETURN true;
END $$;
-- Somente contas criadas por este modulo podem receber nova senha.
CREATE FUNCTION public.ve_admin_conta_senha(p_usuario uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d vibe_entregas_entregadores%ROWTYPE;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 SELECT d1.* INTO STRICT d FROM vibe_entregas_entregadores d1 JOIN auth.users u ON u.id=d1.usuario
 WHERE d1.usuario=p_usuario AND u.raw_app_meta_data->>'vibe_operacao'=d1.operacao::text;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'senha_solicitada',p_usuario);
 RETURN jsonb_build_object('usuario',d.usuario);
END $$;

CREATE FUNCTION public.ve_admin_pedidos_rota(p_usuario uuid,p_busca text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 IF p_busca IS NULL OR length(p_busca)>30 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.item ORDER BY x.numero),'[]') FROM (
 SELECT p.id_int numero,jsonb_build_object('chave',p.id,'pedido',p.id_int,'cliente',p.cliente,'empresa',p.empresa) item
 FROM propostas p LEFT JOIN vibe_entregas_registros r ON r.proposta=p.id
 WHERE p.status_interno='EXPEDICAO' AND upper(trim(p.frete_escolhido))='MOTOBOY'
 AND (r.proposta IS NULL OR (r.entregador=p_usuario AND r.concluida_em IS NULL))
 AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo)
 AND (p_busca='' OR p.id_int::text=p_busca)
 AND (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)<=1
 AND NOT EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL)
 ORDER BY p.id_int LIMIT 51 OFFSET p_offset) x);
END $$;
CREATE FUNCTION public.ve_admin_rotas() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_e_gestor() THEN RAISE EXCEPTION 'Acesso ADM necessario'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(j.item||jsonb_build_object('usuario',r.usuario)),'[]') FROM jsonb_array_elements(ve_rotas_status()) j(item) JOIN vibe_entregas_rotas r ON r.id=(j.item->>'id')::uuid);
END $$;
CREATE FUNCTION public.ve_admin_salvar_rota(p_id uuid,p_usuario uuid,p_ordem uuid[],p_anterior uuid DEFAULT NULL,p_retorno boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE atual vibe_entregas_rotas%ROWTYPE; p propostas%ROWTYPE; registro vibe_entregas_registros%ROWTYPE; nome text; gravado uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 IF p_id IS NULL OR p_usuario IS NULL OR p_retorno IS NULL OR coalesce(cardinality(p_ordem),0) NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT x) FROM unnest(p_ordem) x)<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Selecione de 1 a 20 pedidos distintos'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_usuario::text,0));
 IF NOT EXISTS(SELECT 1 FROM vibe_entregas_entregadores WHERE usuario=p_usuario AND ativo) THEN RAISE EXCEPTION 'Entregador inativo'; END IF;
 IF EXISTS(SELECT 1 FROM vibe_entregas_rotas WHERE id=p_id AND usuario=p_usuario AND ativa AND ordem=p_ordem AND retorno=p_retorno) THEN RETURN jsonb_build_object('id',p_id,'confirmado',true); END IF;
 SELECT * INTO atual FROM vibe_entregas_rotas WHERE usuario=p_usuario AND ativa FOR UPDATE;
 IF atual.id IS DISTINCT FROM p_anterior THEN RAISE EXCEPTION 'Rota alterada por outra sessao; atualize'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(atual.pedidos) x JOIN vibe_entregas_registros r ON r.proposta=x WHERE r.concluida_em IS NOT NULL AND NOT x=ANY(p_ordem)) THEN RAISE EXCEPTION 'Preserve as entregas concluidas'; END IF;
 -- Mesma ordem de locks das confirmacoes de entrega: proposta antes do registro.
 FOR p IN SELECT * FROM propostas WHERE id=ANY(p_ordem) ORDER BY id FOR UPDATE LOOP
  SELECT * INTO registro FROM vibe_entregas_registros WHERE proposta=p.id FOR UPDATE;
  SELECT a.nome INTO nome FROM vibe_entregas_acessos a WHERE a.usuario=p_usuario AND a.empresa=p.empresa AND a.ativo;
  IF nome IS NULL OR (registro.entregador IS NOT NULL AND registro.entregador<>p_usuario) THEN RAISE EXCEPTION 'Pedido sem acesso ou com outro entregador'; END IF;
  IF registro.concluida_em IS NOT NULL THEN
   IF atual.id IS NULL OR NOT p.id=ANY(atual.pedidos) THEN RAISE EXCEPTION 'Entrega concluida fora da rota'; END IF;
  ELSE
   IF p.status_interno IS DISTINCT FROM 'EXPEDICAO' OR upper(trim(p.frete_escolhido)) IS DISTINCT FROM 'MOTOBOY'
    OR (SELECT count(*) FROM expedicoes e WHERE e.id_int=p.id_int)>1 OR EXISTS(SELECT 1 FROM expedicoes e WHERE e.id_int=p.id_int AND e.data_entrega IS NOT NULL) THEN RAISE EXCEPTION 'Pedido indisponivel'; END IF;
   IF registro.proposta IS NULL THEN INSERT INTO vibe_entregas_registros(proposta,expedicao,entregador,entregador_nome) VALUES(p.id,(SELECT e.id FROM expedicoes e WHERE e.id_int=p.id_int),p_usuario,nome); END IF;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM propostas WHERE id=ANY(p_ordem))<>cardinality(p_ordem) THEN RAISE EXCEPTION 'Pedido inexistente'; END IF;
 UPDATE vibe_entregas_rotas SET ativa=false WHERE id=atual.id;
 INSERT INTO vibe_entregas_rotas(id,usuario,pedidos,ordem,retorno,confirmada_em,ativa) VALUES(p_id,p_usuario,p_ordem,p_ordem,p_retorno,now(),true) RETURNING id INTO gravado;
 IF gravado IS NULL THEN RAISE EXCEPTION 'Rota nao persistida'; END IF;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'rota_salva',p_id);
 RETURN jsonb_build_object('id',gravado,'confirmado',true);
END $$;

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('ve_admin_edita','ve_admin_validar_empresas','ve_admin_contexto','ve_admin_preparar_cadastro','ve_admin_concluir_cadastro','ve_admin_editar_entregador','ve_admin_conta_senha','ve_admin_pedidos_rota','ve_admin_rotas','ve_admin_salvar_rota') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
 END LOOP;
END $$;
COMMIT;
