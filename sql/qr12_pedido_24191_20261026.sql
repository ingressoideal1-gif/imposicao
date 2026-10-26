-- Alvo: producao e-deal, somente pedido 24191.
-- Usuario confirmou em 26/10/2026 que nada foi impresso ou entregue.
-- Previa: 1 autorizacao, 17 contratos v2 e 17 reservas (7700 posicoes).
-- Executar somente apos aprovacao. Qualquer divergencia aborta a transacao.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(23063,12);
-- Bloqueio breve contra publicacao concorrente enquanto se verifica ausencia.
LOCK TABLE public.producao_acesso_preparacoes,
 public.producao_acesso_credenciais IN SHARE MODE;
SELECT id FROM public.pedidos_modelos WHERE id_int=24191 ORDER BY id FOR UPDATE;
SELECT id FROM public.producao_numeracoes
 WHERE id::text IN (SELECT amostra_num_id::text FROM public.pedidos_modelos WHERE id_int=24191)
 FOR SHARE;
DO $$
DECLARE contratos jsonb; outros_antes text; outros_depois text;
BEGIN
 IF md5(public.producao_acesso_qr_fonte(24191)::text)<>'d16cb2db57f2e4a01b9ecab265b55e43'
 THEN RAISE EXCEPTION 'Fonte do pedido 24191 mudou; revisar'; END IF;
 IF EXISTS(SELECT 1 FROM public.producao_acesso_qr_contratos WHERE pedido=24191)
 OR EXISTS(SELECT 1 FROM public.producao_acesso_qr_reservas WHERE pedido=24191)
 OR EXISTS(SELECT 1 FROM public.producao_acesso_qr_autorizacoes WHERE pedido=24191)
 OR EXISTS(SELECT 1 FROM public.producao_acesso_preparacoes WHERE pedido_id_int=24191)
 OR EXISTS(SELECT 1 FROM public.producao_acesso_credenciais WHERE pedido_id_int=24191)
 THEN RAISE EXCEPTION 'Pedido 24191 ja tem reserva ou emissao; nao alterar'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.producao_acesso_qr_controle
  WHERE id AND ativo AND pool_revisao='ideal-qr12-1')
 THEN RAISE EXCEPTION 'Base QR12 nao esta pronta'; END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY modelo)::text,'[]')) INTO outros_antes
  FROM public.producao_acesso_qr_contratos c WHERE pedido<>24191;
 INSERT INTO public.producao_acesso_qr_autorizacoes(pedido,confirmacao_sem_impressao)
 VALUES(24191,'Usuario confirmou em 2026-10-26: nenhum ingresso impresso ou entregue, inclusive fora do sistema.');
 contratos:=public.producao_acesso_qr_contratos_obter(24191);
 IF jsonb_array_length(contratos)<>17
 OR (SELECT count(*) FROM public.producao_acesso_qr_contratos WHERE pedido=24191 AND versao=2)<>17
 OR (SELECT sum(capacidade) FROM public.producao_acesso_qr_contratos WHERE pedido=24191)<>7700
 OR (SELECT count(*) FROM public.producao_acesso_qr_reservas WHERE pedido=24191 AND versao=2)<>17
 THEN RAISE EXCEPTION 'Resultado diferente de 17 contratos QR12 / 7700 posicoes'; END IF;
 IF EXISTS(SELECT 1 FROM public.producao_acesso_qr_reservas a
  JOIN public.producao_acesso_qr_reservas b ON a.modelo<>b.modelo AND a.faixa && b.faixa
  WHERE a.pedido=24191 AND a.versao=2 AND b.versao=2)
 THEN RAISE EXCEPTION 'Sobreposicao inesperada na base QR12'; END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY modelo)::text,'[]')) INTO outros_depois
  FROM public.producao_acesso_qr_contratos c WHERE pedido<>24191;
 IF outros_antes IS DISTINCT FROM outros_depois
 OR md5(public.producao_acesso_qr_fonte(24191)::text)<>'d16cb2db57f2e4a01b9ecab265b55e43'
 THEN RAISE EXCEPTION 'Dados fora da reserva foram alterados'; END IF;
END $$;
COMMIT;
SELECT pedido,count(*) AS contratos,min(versao) AS versao_minima,
 max(versao) AS versao_maxima,sum(capacidade) AS capacidade
 FROM public.producao_acesso_qr_contratos WHERE pedido=24191 GROUP BY pedido;
