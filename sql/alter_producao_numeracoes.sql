-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE: Adicionar coluna de preview em producao_numeracoes
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ══════════════════════════════════════════════════════════════════

-- Coluna preview_jpg: armazena a prévia visual em base64 da numeração em 100 DPI
ALTER TABLE producao_numeracoes
ADD COLUMN IF NOT EXISTS preview_jpg TEXT;
