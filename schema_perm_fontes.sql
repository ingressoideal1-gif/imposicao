-- ============================================================
-- ATUALIZAÇÃO DA TABELA DE PERMISSÕES
-- ============================================================

-- Adiciona as colunas de permissão para o Catálogo de Fontes
ALTER TABLE public.imposition_user_permissions
ADD COLUMN IF NOT EXISTS perm_fontes_view BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS perm_fontes_edit BOOLEAN DEFAULT false;
