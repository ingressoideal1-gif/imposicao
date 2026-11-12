-- Somente apos retirar o frontend dependente e obter autorizacao para recuperacao.
-- Remove apenas objetos desta entrega. Nao restaura status antigos de pedidos.
BEGIN;
DROP TRIGGER aaaa_arte_transicao ON public.pedidos_modelos;
DROP TRIGGER aaaa_arte_transicao ON public.pedidos_artes;
DROP TRIGGER aaaa_arte_transicao ON public.pedidos_links_cliente;
DROP TRIGGER aaaa_arte_transicao ON public.propostas;
DROP TRIGGER aaaa_arte_transicao ON public.producao_ordens_servico;
DROP FUNCTION public.arte_transicao_confirmar(integer,text,text,bigint,text);
DROP FUNCTION public.arte_transicao_ler(integer);
DROP FUNCTION public.arte_transicao_travar();
COMMIT;
