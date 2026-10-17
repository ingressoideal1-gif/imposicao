BEGIN;
CREATE TABLE public.vibe_entregas_pin_tentativas (
 chave text PRIMARY KEY CHECK(chave ~ '^[0-9a-f]{64}$'),
 janela timestamptz NOT NULL DEFAULT now(), tentativas integer NOT NULL CHECK(tentativas>0)
);
ALTER TABLE public.vibe_entregas_pin_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vibe_entregas_pin_tentativas FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.ve_pin_tentar(p_chave text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_chave IS NULL OR p_chave !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Chave invalida'; END IF;
 -- Apenas identificador HMAC; nao armazena email, PIN ou senha tecnica.
 INSERT INTO vibe_entregas_pin_tentativas(chave,tentativas) VALUES(p_chave,1)
 ON CONFLICT(chave) DO UPDATE SET
 tentativas=CASE WHEN vibe_entregas_pin_tentativas.janela<now()-interval '15 minutes' THEN 1 ELSE least(vibe_entregas_pin_tentativas.tentativas+1,6) END,
 janela=CASE WHEN vibe_entregas_pin_tentativas.janela<now()-interval '15 minutes' THEN now() ELSE vibe_entregas_pin_tentativas.janela END
 RETURNING tentativas INTO n;
 RETURN n<=5;
END $$;
CREATE FUNCTION public.ve_pin_conta_ativa(p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM vibe_entregas_entregadores d JOIN auth.users u ON u.id=d.usuario
 WHERE d.usuario=p_usuario AND d.ativo AND u.raw_app_meta_data->>'vibe_operacao'=d.operacao::text
 AND EXISTS(SELECT 1 FROM vibe_entregas_acessos a WHERE a.usuario=d.usuario AND a.ativo));
$$;
REVOKE ALL ON FUNCTION public.ve_pin_tentar(text),public.ve_pin_conta_ativa(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ve_pin_tentar(text),public.ve_pin_conta_ativa(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.ve_admin_conta_senha(p_usuario uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d vibe_entregas_entregadores%ROWTYPE;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao ADM necessaria'; END IF;
 SELECT d1.* INTO STRICT d FROM vibe_entregas_entregadores d1 JOIN auth.users u ON u.id=d1.usuario
 WHERE d1.usuario=p_usuario AND u.raw_app_meta_data->>'vibe_operacao'=d1.operacao::text;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'senha_solicitada',p_usuario);
 RETURN jsonb_build_object('usuario',d.usuario,'email',d.email);
END $$;

COMMIT;
