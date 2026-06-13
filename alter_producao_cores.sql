-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE: Adicionar colunas faltantes em producao_cores
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ══════════════════════════════════════════════════════════════════

-- Coluna formato_id: associa a cor a um formato base
ALTER TABLE producao_cores
ADD COLUMN IF NOT EXISTS formato_id UUID REFERENCES producao_formatos(id) ON DELETE SET NULL;

-- Coluna width_mm: largura em milímetros da cor
ALTER TABLE producao_cores
ADD COLUMN IF NOT EXISTS width_mm REAL;

-- Coluna height_mm: altura em milímetros da cor
ALTER TABLE producao_cores
ADD COLUMN IF NOT EXISTS height_mm REAL;

-- Coluna pdf_base64: conteúdo do PDF de referência da cor em base64
ALTER TABLE producao_cores
ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;

-- Índice para formato_id
CREATE INDEX IF NOT EXISTS idx_producao_cores_formato ON producao_cores(formato_id);
