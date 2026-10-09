-- Recuperacao SOMENTE dos objetos novos desta migracao.
-- Primeiro reverter agente/Edge para o protocolo anterior. Nao executar sem revisao.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos_modelos','produtos_proposta','propostas','propostas_os',
    'pedidos_bancos','pedidos_modelos_banco','pedidos_artes','producao_numeracoes',
    'produtos','producao_mapas_teatro'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS piloto_revisao_v2 ON public.%I',t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS piloto_revisao_v2 ON storage.objects;
DROP FUNCTION public.piloto_snapshot_pedido_v2(text,text,text,text);
DROP FUNCTION public.piloto_invalidar_pedido_v2();
DROP FUNCTION public.piloto_marcar_pedidos_v2(integer[]);
DROP TABLE public.piloto_revisoes_pedidos;
DROP TABLE public.piloto_revisao_catalogo;
COMMIT;
