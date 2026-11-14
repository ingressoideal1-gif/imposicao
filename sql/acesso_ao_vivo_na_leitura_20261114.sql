-- Supabase produção: opção por evento, desativada inicialmente.
-- Aplicar antes das funções portaria/acesso-conta e do frontend.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.producao_acesso_eventos
  ADD COLUMN IF NOT EXISTS ao_vivo_na_leitura boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.producao_acesso_eventos.ao_vivo_na_leitura IS
  'Permite consultar AO VIVO em todos os aparelhos ativos pareados ao evento, sem autorização de edição.';
COMMIT;
-- Recuperação: voltar o frontend/funções e manter a coluna inerte.
-- Não remove dados nem ativa eventos existentes.
