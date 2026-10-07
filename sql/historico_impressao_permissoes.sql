-- Complemento: remove privilegios herdados dos defaults do projeto.
-- Alvo exclusivo: a nova tabela de historico; nenhum pedido e alterado.
BEGIN;
REVOKE ALL ON public.imposition_historico_impressao FROM service_role;
GRANT SELECT, INSERT ON public.imposition_historico_impressao TO service_role;
COMMIT;
-- Recuperacao de ingestao: SELECT/INSERT ja permanecem liberados.
-- Manutencao excepcional requer o administrador do banco, nao a API do agente.
