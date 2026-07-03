-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: Adicionar colunas de frente/verso na tabela producao_cores
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE producao_cores
ADD COLUMN IF NOT EXISTS frente_verso BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS name_verso TEXT,
ADD COLUMN IF NOT EXISTS pdf_verso_base64 TEXT;
