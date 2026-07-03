-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: Adicionar colunas de verso na tabela pedidos_modelos e pedidos_artes
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ════════════════════════════════════════════════════════════════════════════════

-- 1. Colunas de verso na tabela de modelos principais (pedidos_modelos)
ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS verso_arte_url TEXT,
ADD COLUMN IF NOT EXISTS verso_amostra_arte_base64 TEXT;

-- 2. Colunas de verso no histórico de envios/chat (pedidos_artes)
ALTER TABLE pedidos_artes
ADD COLUMN IF NOT EXISTS verso_nome_arquivo TEXT,
ADD COLUMN IF NOT EXISTS verso_storage_path TEXT,
ADD COLUMN IF NOT EXISTS verso_url_arquivo TEXT,
ADD COLUMN IF NOT EXISTS verso_tipo_arquivo TEXT,
ADD COLUMN IF NOT EXISTS verso_mime_type TEXT,
ADD COLUMN IF NOT EXISTS verso_tamanho_bytes BIGINT;
