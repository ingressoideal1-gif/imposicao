-- Escopo autorizado: entregadores acessam todas as empresas do ERP.
BEGIN;
CREATE FUNCTION public.ve_admin_preparar_cadastro_geral(p_operacao uuid,p_email text,p_nome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE empresas text[];
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 SELECT c.empresas INTO empresas FROM vibe_entregas_cadastros c WHERE c.operacao=p_operacao AND c.autor=auth.uid();
 IF empresas IS NULL THEN SELECT array_agg(e ORDER BY e) INTO empresas FROM (SELECT DISTINCT empresa e FROM propostas WHERE nullif(trim(empresa),'') IS NOT NULL) x; END IF;
 RETURN ve_admin_preparar_cadastro(p_operacao,p_email,p_nome,empresas);
END $$;
CREATE FUNCTION public.ve_admin_editar_entregador_geral(p_usuario uuid,p_nome text,p_ativo boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE empresas text[];
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 SELECT array_agg(e ORDER BY e) INTO empresas FROM (SELECT DISTINCT empresa e FROM propostas WHERE nullif(trim(empresa),'') IS NOT NULL) x;
 RETURN ve_admin_editar_entregador(p_usuario,p_nome,empresas,p_ativo);
END $$;
REVOKE ALL ON FUNCTION public.ve_admin_preparar_cadastro_geral(uuid,text,text),public.ve_admin_editar_entregador_geral(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_preparar_cadastro_geral(uuid,text,text),public.ve_admin_editar_entregador_geral(uuid,text,boolean) TO authenticated;
-- Novas empresas entram automaticamente no proximo login do entregador ativo.
CREATE OR REPLACE FUNCTION public.ve_pin_conta_ativa(p_usuario uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE nome text;
BEGIN
 SELECT d.nome INTO nome FROM vibe_entregas_entregadores d JOIN auth.users u ON u.id=d.usuario
 WHERE d.usuario=p_usuario AND d.ativo AND u.raw_app_meta_data->>'vibe_operacao'=d.operacao::text;
 IF nome IS NULL THEN RETURN false; END IF;
 INSERT INTO vibe_entregas_acessos(usuario,empresa,nome,ativo,gestor)
 SELECT p_usuario,e,nome,true,false FROM (SELECT DISTINCT empresa e FROM propostas WHERE nullif(trim(empresa),'') IS NOT NULL) x
 ON CONFLICT(usuario,empresa) DO UPDATE SET nome=excluded.nome,ativo=true,gestor=false;
 RETURN EXISTS(SELECT 1 FROM vibe_entregas_acessos WHERE usuario=p_usuario AND ativo);
END $$;
COMMIT;
