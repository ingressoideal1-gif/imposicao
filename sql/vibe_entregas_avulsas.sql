-- Preparacao local. Nao executar automaticamente em producao.
BEGIN;
CREATE TABLE public.vibe_entregas_locais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 2 AND 120),
 cep text NOT NULL CHECK(cep ~ '^[0-9]{8}$'),
 numero text NOT NULL CHECK(length(trim(numero)) BETWEEN 1 AND 20),
 logradouro text NOT NULL CHECK(length(trim(logradouro)) BETWEEN 2 AND 180),
 complemento text NOT NULL DEFAULT '' CHECK(length(complemento)<=120),
 bairro text NOT NULL DEFAULT '' CHECK(length(bairro)<=120),
 cidade text NOT NULL CHECK(length(trim(cidade)) BETWEEN 2 AND 120),
 uf text NOT NULL CHECK(uf ~ '^[A-Z]{2}$'),
 autor uuid NOT NULL REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ve_local_identidade ON public.vibe_entregas_locais
 (lower(trim(nome)),cep,lower(trim(numero)),lower(trim(complemento)));
CREATE TABLE public.vibe_entregas_avulsas (
 id uuid PRIMARY KEY,
 numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 local_id uuid NOT NULL REFERENCES public.vibe_entregas_locais(id),
 nome text NOT NULL,
 endereco text NOT NULL,
 solicitacao jsonb NOT NULL,
 status text NOT NULL DEFAULT 'EXPEDICAO' CHECK(status IN ('EXPEDICAO','EM TRANSITO','ENTREGUE','CANCELADO')),
 autor uuid NOT NULL REFERENCES auth.users(id),
 criada_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vibe_entregas_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_entregas_avulsas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vibe_entregas_locais,public.vibe_entregas_avulsas FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.ve_admin_buscar_locais(p_busca text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao de entregas necessaria'; END IF;
 IF p_busca IS NULL OR length(p_busca)>120 OR p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'Busca invalida'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM (
   SELECT id,nome,cep,numero,logradouro,complemento,bairro,cidade,uf
   FROM vibe_entregas_locais
   WHERE p_busca='' OR position(lower(trim(p_busca)) in lower(nome))>0
     OR position(regexp_replace(p_busca,'[^0-9]','','g') in cep)>0 AND p_busca ~ '^[0-9 -]+$'
   ORDER BY lower(nome),id LIMIT 21 OFFSET p_offset
 ) l);
END $$;

CREATE FUNCTION public.ve_admin_criar_avulsa(p_operacao uuid,p_local uuid DEFAULT NULL,p_dados jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l vibe_entregas_locais%ROWTYPE; a vibe_entregas_avulsas%ROWTYPE; novo uuid;
BEGIN
 IF NOT ve_admin_edita() THEN RAISE EXCEPTION 'Edicao de entregas necessaria'; END IF;
 IF p_operacao IS NULL OR (p_local IS NULL)=(p_dados IS NULL) THEN RAISE EXCEPTION 'Selecione um local ou informe o endereco'; END IF;
 IF EXISTS(SELECT 1 FROM propostas WHERE id=p_operacao) THEN RAISE EXCEPTION 'Identificador ja utilizado por pedido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operacao::text,0));
 SELECT * INTO a FROM vibe_entregas_avulsas WHERE id=p_operacao;
 IF FOUND THEN
   IF a.autor IS DISTINCT FROM auth.uid() OR a.solicitacao IS DISTINCT FROM jsonb_build_object('local',p_local,'dados',p_dados) THEN RAISE EXCEPTION 'Operacao ja utilizada'; END IF;
   RETURN jsonb_build_object('confirmado',true,'id',a.id,'numero',a.numero,'local',a.local_id);
 END IF;
 IF p_local IS NOT NULL THEN
   SELECT * INTO STRICT l FROM vibe_entregas_locais WHERE id=p_local;
 ELSE
   IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Endereco invalido'; END IF;
   INSERT INTO vibe_entregas_locais(nome,cep,numero,logradouro,complemento,bairro,cidade,uf,autor)
   VALUES(trim(p_dados->>'nome'),regexp_replace(p_dados->>'cep','[^0-9]','','g'),trim(p_dados->>'numero'),
     trim(p_dados->>'logradouro'),trim(coalesce(p_dados->>'complemento','')),trim(coalesce(p_dados->>'bairro','')),
     trim(p_dados->>'cidade'),upper(trim(p_dados->>'uf')),auth.uid())
   ON CONFLICT DO NOTHING RETURNING id INTO novo;
   SELECT * INTO STRICT l FROM vibe_entregas_locais WHERE id=novo OR
    (lower(trim(nome))=lower(trim(p_dados->>'nome')) AND cep=regexp_replace(p_dados->>'cep','[^0-9]','','g')
      AND lower(trim(numero))=lower(trim(p_dados->>'numero')) AND lower(trim(complemento))=lower(trim(coalesce(p_dados->>'complemento',''))));
 END IF;
 INSERT INTO vibe_entregas_avulsas(id,local_id,nome,endereco,solicitacao,autor)
 VALUES(p_operacao,l.id,l.nome,concat_ws(', ',l.logradouro,l.numero,nullif(l.complemento,''),nullif(l.bairro,''),l.cidade,l.uf,l.cep),jsonb_build_object('local',p_local,'dados',p_dados),auth.uid())
 RETURNING * INTO a;
 INSERT INTO vibe_entregas_auditoria(autor,acao,alvo) VALUES(auth.uid(),'entrega_avulsa_criada',a.id);
 RETURN jsonb_build_object('confirmado',true,'id',a.id,'numero',a.numero,'local',l.id);
END $$;
REVOKE ALL ON FUNCTION public.ve_admin_buscar_locais(text,integer),public.ve_admin_criar_avulsa(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ve_admin_buscar_locais(text,integer),public.ve_admin_criar_avulsa(uuid,uuid,jsonb) TO authenticated;
COMMIT;
