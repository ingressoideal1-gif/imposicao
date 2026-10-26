-- QR12 obrigatorio nas novas reservas. Aplicacao remota exige aprovacao.
-- Preserva contratos, hashes, numeracao e leitor de emissoes anteriores.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(23063,12);
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.producao_acesso_qr_contratos_obter(integer)'::regprocedure))
    <> 'b761376c347fcbdf16ccad83cd8761e7'
 THEN RAISE EXCEPTION 'Definicao QR mudou; revisar antes de aplicar'; END IF;
 IF md5(pg_get_functiondef('public.producao_acesso_qr_impedir_retorno_legado()'::regprocedure))
    <> '2e9a53d0483fb924ed1a1d97f63033ed'
 THEN RAISE EXCEPTION 'Protecao QR mudou; revisar antes de aplicar'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.producao_acesso_qr_controle
   WHERE id AND ativo AND pool_revisao='ideal-qr12-1')
 THEN RAISE EXCEPTION 'Base QR12 nao esta ativa e pronta'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.producao_acesso_qr_contratos_obter(p_pedido integer)
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
   -- Contratos existentes permanecem imutaveis. Toda nova reserva usa QR12.
   IF NOT ctl.ativo THEN RAISE EXCEPTION 'Novas emissoes QR12 suspensas'; END IF;
   IF NOT (coalesce((f->>'criado_em')::timestamptz>=ctl.corte,false) OR
    EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes WHERE pedido=p_pedido))
   THEN RAISE EXCEPTION 'Pedido anterior ao corte QR12 sem contrato: confirmar ausencia de impressao antes de autorizar'; END IF;
   IF EXISTS(SELECT 1 FROM public.producao_acesso_qr_contratos c0 WHERE c0.pedido=p_pedido AND c0.versao=1)
   THEN RAISE EXCEPTION 'Pedido com contrato legado existente exige revisao da emissao'; END IF;
   versao:=2;
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


-- Nenhuma rota, inclusive uma estacao antiga, pode criar novas reservas v1.
CREATE OR REPLACE FUNCTION public.producao_acesso_qr_impedir_retorno_legado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.versao=1 THEN
  RAISE EXCEPTION 'Novas emissoes exigem QR12; contrato legado novo recusado';
 END IF;
 RETURN NEW;
END $$;

-- O instante de ativacao separa modelos novos de pedidos antigos que podem
-- ter sido impressos offline. Estes exigem confirmacao individual.
UPDATE public.producao_acesso_qr_controle
 SET corte=least(corte,transaction_timestamp()) WHERE id
 RETURNING id,ativo,corte,pool_revisao;
COMMIT;
