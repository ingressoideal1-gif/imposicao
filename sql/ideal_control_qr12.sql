-- QR Ideal v2. Aplicar uma vez, em produção e-deal, após backup conferido.
-- Não reescreve hashes, sais, IDs ou entradas existentes. Novas emissões ficam
-- desabilitadas até a entrega do leitor e do NewProd. Contratos são imutáveis.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE public.producao_acesso_qr_controle (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 ativo boolean NOT NULL DEFAULT false,
 corte timestamptz NOT NULL DEFAULT 'infinity',
 pool_revisao text NOT NULL DEFAULT 'ideal-qr12-d1'
);
INSERT INTO public.producao_acesso_qr_controle(id) VALUES(true);
CREATE TABLE public.producao_acesso_qr_autorizacoes (
 pedido integer PRIMARY KEY,
 confirmacao_sem_impressao text NOT NULL CHECK(length(confirmacao_sem_impressao)>15),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.producao_acesso_qr_contratos (
 pedido integer NOT NULL, modelo bigint PRIMARY KEY REFERENCES public.pedidos_modelos(id),
 versao integer NOT NULL CHECK(versao IN (1,2)),
 inicio bigint NOT NULL CHECK(inicio>=0), passo integer NOT NULL CHECK(passo>0),
 posicao integer NOT NULL CHECK(posicao>0 AND posicao<=passo),
 quantidade integer NOT NULL CHECK(quantidade>0),
 deslocamento integer, capacidade integer NOT NULL CHECK(capacidade BETWEEN 1 AND 3000000),
 fonte_hash text NOT NULL, pool_revisao text NOT NULL DEFAULT 'ideal-master-1',
 criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK((versao=1 AND deslocamento IS NULL) OR
       (versao=2 AND deslocamento>=0 AND deslocamento+capacidade<=3000000))
);
-- Reservas legadas podem se sobrepor. Nenhuma reserva v2 reutiliza qualquer
-- posição conhecida, nem em outro pedido/evento ou prefixo de modelo.
CREATE TABLE public.producao_acesso_qr_reservas (
 pedido integer NOT NULL, modelo bigint NOT NULL, versao integer NOT NULL,
 faixa int8range NOT NULL CHECK(NOT isempty(faixa) AND lower(faixa)>=0 AND upper(faixa)<=3000000),
 PRIMARY KEY(modelo,versao,faixa)
);
CREATE INDEX producao_acesso_qr_reservas_faixa ON public.producao_acesso_qr_reservas USING gist(faixa);
ALTER TABLE public.producao_acesso_qr_reservas ADD CONSTRAINT qr_v2_faixa_exclusiva
 EXCLUDE USING gist(faixa WITH &&) WHERE(versao=2);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['producao_acesso_qr_controle','producao_acesso_qr_autorizacoes',
 'producao_acesso_qr_contratos','producao_acesso_qr_reservas'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE FUNCTION public.producao_acesso_qr_fonte(p_pedido integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('modelo',m.id,'pedido',m.id_int,
 'criado_em',m.created_at,'inicio',coalesce(m.numeracao_inicio,1),'quantidade',m.quantidade,
 'passo',CASE WHEN n.tipo='TICKET' THEN coalesce(n.ticket_qtd,1) ELSE 1 END,
 'posicao',CASE WHEN n.tipo='TICKET' THEN coalesce((e.el->>'ticket_pos')::integer,1) ELSE 1 END,
 'tipo',coalesce(n.tipo,'SEQUENCIAL'),'elementos',n.elements) ORDER BY m.id),'[]'::jsonb)
 FROM public.pedidos_modelos m JOIN public.producao_numeracoes n ON n.id::text=m.amostra_num_id::text
 CROSS JOIN LATERAL (SELECT el FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array' THEN n.elements::jsonb ELSE '[]'::jsonb END) WITH ORDINALITY x(el,ord)
 WHERE el->>'type'='QR_IDEAL' ORDER BY ord LIMIT 1) e
 WHERE m.id_int=p_pedido;
$$;

CREATE FUNCTION public.producao_acesso_qr_reservar_legado(p_pedido integer,p_modelo bigint,p_inicio bigint,p_span bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE inicio bigint; v_faixa int8range; faixas int8range[];
BEGIN
 PERFORM pg_advisory_xact_lock(23063,12);
 inicio:=(((((p_pedido%100-p_modelo%100+100)%100+99)%100)*30000+p_inicio-1)%3000000+3000000)%3000000;
 IF p_span>=3000000 THEN faixas:=ARRAY[int8range(0,3000000,'[)')];
 ELSIF inicio+p_span<=3000000 THEN faixas:=ARRAY[int8range(inicio,inicio+p_span,'[)')];
 ELSE faixas:=ARRAY[int8range(inicio,3000000,'[)'),int8range(0,inicio+p_span-3000000,'[)')]; END IF;
 FOREACH v_faixa IN ARRAY faixas LOOP
  INSERT INTO public.producao_acesso_qr_reservas VALUES(p_pedido,p_modelo,1,v_faixa) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

CREATE FUNCTION public.producao_acesso_qr_contratos_obter(p_pedido integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE f jsonb; c public.producao_acesso_qr_contratos%ROWTYPE;
 ctl public.producao_acesso_qr_controle%ROWTYPE; versao integer; span bigint;
 cursor_pool bigint; ocupado record; assinatura text; resultado jsonb:='[]'::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(23063,12);
 SELECT * INTO STRICT ctl FROM public.producao_acesso_qr_controle WHERE id;
 FOR f IN SELECT value FROM jsonb_array_elements(public.producao_acesso_qr_fonte(p_pedido)) LOOP
  span:=(f->>'quantidade')::bigint*(f->>'passo')::bigint;
  IF span IS NULL OR span<1 OR span>3000000 OR (f->>'inicio')::bigint<0
    OR (f->>'posicao')::integer<1 OR (f->>'posicao')::integer>(f->>'passo')::integer
  THEN RAISE EXCEPTION 'QR Ideal: faixa inválida ou maior que a capacidade da base'; END IF;
  assinatura:=md5(((f-'criado_em'-'elementos')||jsonb_build_object('qr',
   (SELECT jsonb_agg(jsonb_build_object('posicao',e->'ticket_pos','source',e->'source','fixed',e->'fixed'))
    FROM jsonb_array_elements(f->'elementos') e WHERE e->>'type'='QR_IDEAL')))::text);
  SELECT * INTO c FROM public.producao_acesso_qr_contratos WHERE modelo=(f->>'modelo')::bigint;
  IF FOUND THEN
   IF c.fonte_hash<>assinatura THEN RAISE EXCEPTION 'QR Ideal: numeração ou quantidade mudou após reservar a emissão'; END IF;
  ELSE
   versao:=CASE WHEN ctl.ativo AND ((f->>'criado_em')::timestamptz>=ctl.corte OR
    EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes WHERE pedido=p_pedido)) THEN 2 ELSE 1 END;
   IF versao=2 AND (EXISTS(SELECT 1 FROM public.producao_acesso_credenciais WHERE pedido_id_int=p_pedido)
    OR EXISTS(SELECT 1 FROM public.producao_acesso_preparacoes WHERE pedido_id_int=p_pedido))
   THEN RAISE EXCEPTION 'Pedido com preparação/emissão existente deve manter a regra anterior'; END IF;
   IF versao=2 THEN
    IF f->>'tipo' NOT IN ('SEQUENCIAL','TICKET') OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(f->'elementos') e WHERE e->>'type'='QR_IDEAL'
      AND (e->>'source'='database' OR coalesce((e->>'fixed')::boolean,false)
       OR (f->>'tipo'='TICKET' AND coalesce((e->>'ticket_pos')::integer,1)<>(f->>'posicao')::integer)))
    THEN RAISE EXCEPTION 'QR v2 exige numeração sequencial ou uma posição de TICKET consistente'; END IF;
    cursor_pool:=0;
    FOR ocupado IN SELECT faixa FROM public.producao_acesso_qr_reservas r WHERE r.versao=2 ORDER BY lower(faixa),upper(faixa) LOOP
     EXIT WHEN cursor_pool+span<=lower(ocupado.faixa);
     cursor_pool:=greatest(cursor_pool,upper(ocupado.faixa));
    END LOOP;
    IF cursor_pool+span>3000000 THEN RAISE EXCEPTION 'Base QR sem faixa livre; ampliar a base antes de emitir, nunca reutilizar códigos'; END IF;
    INSERT INTO public.producao_acesso_qr_reservas VALUES(p_pedido,(f->>'modelo')::bigint,2,int8range(cursor_pool,cursor_pool+span,'[)'));
   ELSE
    cursor_pool:=NULL;
    PERFORM public.producao_acesso_qr_reservar_legado(p_pedido,(f->>'modelo')::bigint,(f->>'inicio')::bigint,span);
   END IF;
   INSERT INTO public.producao_acesso_qr_contratos(pedido,modelo,versao,inicio,passo,posicao,quantidade,deslocamento,capacidade,fonte_hash,pool_revisao)
    VALUES(p_pedido,(f->>'modelo')::bigint,versao,(f->>'inicio')::bigint,(f->>'passo')::integer,
     (f->>'posicao')::integer,(f->>'quantidade')::integer,cursor_pool,span,assinatura,
     CASE WHEN versao=2 THEN ctl.pool_revisao ELSE 'ideal-master-1' END) RETURNING * INTO c;
  END IF;
  resultado:=resultado||jsonb_build_array(to_jsonb(c));
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.producao_acesso_qr_reservas a
  JOIN public.producao_acesso_qr_reservas b ON a.pedido=b.pedido AND a.modelo<b.modelo AND a.faixa && b.faixa
  WHERE a.pedido=p_pedido AND a.versao=1 AND b.versao=1
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(resultado) j WHERE (j->>'modelo')::bigint=a.modelo AND j->>'versao'='1')
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(resultado) j WHERE (j->>'modelo')::bigint=b.modelo AND j->>'versao'='1'))
 THEN RAISE EXCEPTION 'QR Ideal legado com códigos sobrepostos; não imprimir antes de resolver a emissão'; END IF;
 RETURN resultado;
END $$;

-- Inventário conservador: protege inclusive modelos sem hashes publicados,
-- pois podem existir ingressos impressos offline. Nenhum código é lido.
DO $$ DECLARE pedido integer; f jsonb; BEGIN
 FOR pedido IN SELECT DISTINCT id_int FROM public.pedidos_modelos WHERE id_int IS NOT NULL LOOP
  FOR f IN SELECT value FROM jsonb_array_elements(public.producao_acesso_qr_fonte(pedido)) LOOP
   IF coalesce((f->>'quantidade')::bigint,0)>0 AND coalesce((f->>'passo')::bigint,0)>0 THEN
    PERFORM public.producao_acesso_qr_reservar_legado(pedido,(f->>'modelo')::bigint,
     (f->>'inicio')::bigint,(f->>'quantidade')::bigint*(f->>'passo')::bigint);
   END IF;
  END LOOP;
 END LOOP;
END $$;

-- Mesmo ingresso lógico jamais ganha outro ID por simples mudança de hash.
-- A trava cobre estação e nuvem e mantém códigos iguais em modelos distintos.
CREATE FUNCTION public.producao_acesso_credencial_identidade()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.pedido_id_int IS NOT NULL AND NEW.modelo_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(NEW.pedido_id_int,NEW.modelo_id);
  IF EXISTS(SELECT 1 FROM public.producao_acesso_credenciais c
   WHERE c.pedido_id_int=NEW.pedido_id_int AND c.modelo_id=NEW.modelo_id AND c.numero=NEW.numero
   AND c.id IS DISTINCT FROM NEW.id AND (c.codigo_hash IS DISTINCT FROM NEW.codigo_hash
    OR c.evento_id IS DISTINCT FROM NEW.evento_id OR c.setor_id IS DISTINCT FROM NEW.setor_id))
  THEN RAISE EXCEPTION 'Credencial lógica já emitida com outro conteúdo; emissão recusada'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER producao_acesso_credencial_identidade BEFORE INSERT OR UPDATE ON public.producao_acesso_credenciais
 FOR EACH ROW EXECUTE FUNCTION public.producao_acesso_credencial_identidade();
CREATE UNIQUE INDEX producao_acesso_credencial_logica ON public.producao_acesso_credenciais(pedido_id_int,modelo_id,numero)
 WHERE pedido_id_int IS NOT NULL AND modelo_id IS NOT NULL;

CREATE FUNCTION public.producao_acesso_qr_leitor_evento(p_evento uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.producao_acesso_qr_contratos c
 JOIN public.producao_acesso_pedidos p ON p.pedido_id_int=c.pedido
 WHERE p.evento_id=p_evento AND c.versao=2) THEN 2 ELSE 1 END;
$$;
REVOKE ALL ON FUNCTION public.producao_acesso_qr_leitor_evento(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_qr_leitor_evento(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.producao_acesso_qr_fonte(integer),
 public.producao_acesso_qr_reservar_legado(integer,bigint,bigint,bigint),
 public.producao_acesso_qr_contratos_obter(integer),public.producao_acesso_credencial_identidade()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_qr_fonte(integer),
 public.producao_acesso_qr_reservar_legado(integer,bigint,bigint,bigint),
 public.producao_acesso_qr_contratos_obter(integer),public.producao_acesso_credencial_identidade() TO service_role;
COMMIT;
