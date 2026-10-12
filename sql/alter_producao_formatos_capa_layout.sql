-- Preparado localmente. Aplicar separadamente antes de publicar o editor.
-- Adição de três campos; formatos existentes conservam texto livre à esquerda.
BEGIN;
ALTER TABLE public.producao_formatos
    ADD COLUMN IF NOT EXISTS cover_max_width_mm double precision NOT NULL DEFAULT 0
        CHECK (cover_max_width_mm >= 0 AND cover_max_width_mm <= 1000),
    ADD COLUMN IF NOT EXISTS cover_overflow text NOT NULL DEFAULT 'shrink'
        CHECK (cover_overflow IN ('shrink', 'wrap', 'condense')),
    ADD COLUMN IF NOT EXISTS cover_text_align text NOT NULL DEFAULT 'left'
        CHECK (cover_text_align IN ('left', 'center', 'right'));
COMMIT;

-- Verificação: consultar information_schema.columns para os três campos acima.
-- Recuperação: reverter o frontend/agente e manter as colunas, preservando ajustes.
-- Este arquivo não altera valores de numeração, blocos ou quantidades.
