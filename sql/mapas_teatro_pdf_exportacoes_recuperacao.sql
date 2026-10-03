-- Recuperação conservadora: DESATIVA novos envios; preserva PDFs e manifestos.
-- Aplicar somente se for necessário suspender a nova integração.
-- Não remove tabelas, arquivos ou revisões usadas pelo ERP.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.mapas_teatro_publicar_pdf_exportacao(text,text,text,jsonb,jsonb,uuid) FROM service_role;
REVOKE INSERT ON public.producao_mapas_teatro_pdf_exportacoes FROM service_role;
COMMIT;
-- Além deste SQL, suspender POST na Edge Function/voltar o frontend à v1002
-- para evitar uploads órfãos. Downloads de revisões já publicadas continuam.
-- Para reativar após corrigir a causa, revisar e conceder novamente apenas
-- EXECUTE desse RPC e INSERT dessa tabela ao service_role.
