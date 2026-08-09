-- ══════════════════════════════════════════════════════════════════
-- ALTER TABLE: Adicionar coluna print_mode em producao_numeracoes
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ══════════════════════════════════════════════════════════════════

-- Coluna print_mode: armazena se a numeração é simplex ('front') ou duplex ('duplex')
ALTER TABLE producao_numeracoes
ADD COLUMN IF NOT EXISTS print_mode TEXT DEFAULT 'front';
