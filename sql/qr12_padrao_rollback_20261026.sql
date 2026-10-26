-- Recuperacao manual; preserva todos os contratos e reservas. Exige aprovacao.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(23063,12);
DO $$ BEGIN
IF (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='public.producao_acesso_qr_contratos_obter(integer)'::regprocedure)<>'ed3a607bf97b0df0e442fee4ccd5204f' THEN RAISE EXCEPTION 'Funcao mudou apos ativacao; revisar rollback'; END IF;
IF (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='public.producao_acesso_qr_impedir_retorno_legado()'::regprocedure)<>'bef8663cbc96b4338ccaa0f2e4b3b8f3' THEN RAISE EXCEPTION 'Funcao mudou apos ativacao; revisar rollback'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.producao_acesso_qr_contratos_obter(p_pedido integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.producao_acesso_qr_impedir_retorno_legado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ctl public.producao_acesso_qr_controle%ROWTYPE;
BEGIN
 SELECT * INTO STRICT ctl FROM public.producao_acesso_qr_controle WHERE id=true;
 IF NEW.versao=1 AND (
  EXISTS(SELECT 1 FROM public.pedidos_modelos m WHERE m.id=NEW.modelo AND m.created_at>=ctl.corte)
  OR EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes a WHERE a.pedido=NEW.pedido)
 ) THEN
  RAISE EXCEPTION 'Novas emissoes QR12 suspensas; nao substituir o contrato pelo legado';
 END IF;
 RETURN NEW;
END $function$
;
UPDATE public.producao_acesso_qr_controle SET ativo=true,corte='infinity'::timestamptz WHERE id AND pool_revisao='ideal-qr12-1';
COMMIT;
