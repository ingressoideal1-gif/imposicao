-- Criar evento prepara a primeira emissão QR12, inclusive com status Impresso.
-- Escopo: somente portal validado e pedidos explicitamente habilitados.
-- Não altera a rotina usada pelas estações nem contratos já reservados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE qr text; portal text;
BEGIN
 SELECT replace(prosrc,chr(13),'') INTO qr FROM pg_proc
 WHERE oid='public.producao_acesso_qr_contratos_obter(integer)'::regprocedure;
 SELECT replace(prosrc,chr(13),'') INTO portal FROM pg_proc
 WHERE oid='public.ideal_control_portal(text,text,boolean)'::regprocedure;
 IF md5(qr)<>'0c046feddbdf4aa57bd71643da8b9fbc'
 OR md5(portal)<>'1006b9a68671d6fb7b51a2a66ae6b49a' THEN
  RAISE EXCEPTION 'Definicoes mudaram: revisar migracao antes de aplicar';
 END IF;
 -- A mesma alocação QR12 em uso, sem alterar o contrato da API das estações.
 -- A única diferença é aceitar a primeira reserva após marcar Impresso.
 qr:=replace(qr,replace($printed$   IF EXISTS(SELECT 1 FROM public.pedidos_modelos m WHERE m.id=(f->>'modelo')::bigint
    AND (upper(trim(coalesce(to_jsonb(m)->>'status_impressao','')))='IMPRESSO'
     OR upper(trim(coalesce(to_jsonb(m)->>'status_producao','')))='IMPRESSO'))
   THEN RAISE EXCEPTION 'Modelo ja impresso sem contrato: preservar a emissao original antes de reimprimir'; END IF;
$printed$,chr(13),''),'');
 qr:=replace(qr,replace($entry$BEGIN
 PERFORM pg_advisory_xact_lock(23063,12);$entry$,chr(13),''),replace($guard$BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_config WHERE id AND habilitado)
 OR NOT EXISTS (SELECT 1 FROM public.ideal_control_portal_pedidos WHERE pedido_id_int=p_pedido AND habilitado)
 THEN RAISE EXCEPTION 'Pedido fora do piloto'; END IF;
 PERFORM pg_advisory_xact_lock(23063,12);$guard$,chr(13),''));
 IF position('Modelo ja impresso sem contrato' in qr)>0 OR position('Pedido fora do piloto' in qr)=0 THEN RAISE EXCEPTION 'Transformacao QR nao confirmada'; END IF;
 EXECUTE format('CREATE FUNCTION public.ideal_control_portal_reservar_qr(p_pedido integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS %L',qr);
 portal:=replace(portal,replace($old$    -- Pedido impresso sem contrato não pode reservar códigos novos: poderiam
    -- divergir dos ingressos já entregues. Conferência da emissão é externa.
    IF NOT completa AND EXISTS (
      SELECT 1 FROM public.pedidos_modelos m JOIN public.producao_numeracoes n
        ON n.id::text=m.amostra_num_id::text
      WHERE m.id_int=v_pedido AND m.quantidade>0 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array'
          THEN n.elements::jsonb ELSE '[]'::jsonb END) e
        WHERE e->>'type'='QR_IDEAL' AND coalesce(e->>'source','')<>'database'
          AND coalesce(e->'fixed','null'::jsonb) IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb))
      AND NOT EXISTS (SELECT 1 FROM public.producao_acesso_qr_contratos c WHERE c.pedido=v_pedido AND c.modelo=m.id)
    ) THEN RETURN jsonb_build_object('disponivel',true,'estado','conferir_emissao'); END IF;

$old$,chr(13),''),'');
 portal:=replace(portal,
 $before$        RETURN jsonb_build_object('disponivel',true,'estado','preparando','evento_id',ev.id);$before$,
 replace($after$        IF p_criar IS TRUE THEN
            PERFORM public.ideal_control_portal_reservar_qr(v_pedido);
        END IF;
        RETURN jsonb_build_object('disponivel',true,'estado','preparando','evento_id',ev.id);$after$,chr(13),''));
 IF position('conferir_emissao' in portal)>0 OR position('PERFORM public.ideal_control_portal_reservar_qr(v_pedido)' in portal)=0 THEN RAISE EXCEPTION 'Transformacao portal nao confirmada'; END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.ideal_control_portal(p_numero text,p_token text,p_criar boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS %L',portal);
END $migration$;
-- Sem acesso direto, inclusive service_role: somente a RPC SECURITY DEFINER
-- chama o auxiliar após validar link, impressão, evento, flags e revogação.
REVOKE ALL ON FUNCTION public.ideal_control_portal_reservar_qr(integer) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.ideal_control_portal_reservar_qr(integer) IS
 'Alocacao QR12 do portal baseada na rotina 0c046fed. Revisar juntas quando a regra QR mudar. Invocacao exclusiva pela RPC do portal.';
COMMIT;
