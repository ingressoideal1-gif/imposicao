-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL IMPOSITION — Tabelas no Supabase do Vibecode (Catálogo de Layouts)
-- Prefixo: producao_ (alinhado com convenções do Vibecode)
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-06-13 | Atualizado para conformidade de chaves UUID e empresa_id
-- ══════════════════════════════════════════════════════════════════════════════

-- ── HABILITAR EXTENSÃO DE UUID (se não estiver habilitada) ───────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── FUNÇÃO UTILITÁRIA: updated_at automático ─────────────────────────────────
CREATE OR REPLACE FUNCTION producao_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════════════
-- TABELAS DE CATÁLOGO (configuração geométrica de imposição gráfica)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── producao_formatos ────────────────────────────────────────────────────────
-- Formatos de ingresso: dimensões e grid de imposição na folha de papel

CREATE TABLE IF NOT EXISTS producao_formatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID no ecossistema do ERP
    name TEXT NOT NULL,
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    cols INTEGER DEFAULT 1,
    rows INTEGER DEFAULT 1,
    gap_h_mm REAL DEFAULT 0,
    gap_v_mm REAL DEFAULT 0,
    offset_h_mm REAL DEFAULT 0,
    offset_v_mm REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_formatos_updated
    BEFORE UPDATE ON producao_formatos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_formatos DISABLE ROW LEVEL SECURITY;

-- ── producao_numeracoes ──────────────────────────────────────────────────────
-- Templates de numeração: QR, barcode, texto sequencial, SVG e logos

CREATE TABLE IF NOT EXISTS producao_numeracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    name TEXT NOT NULL,
    formato_id UUID REFERENCES producao_formatos(id) ON DELETE SET NULL,
    csv_filename TEXT DEFAULT '',
    csv_headers JSONB DEFAULT '[]',
    csv_data JSONB,
    svg_content TEXT DEFAULT '',
    svg_filename TEXT DEFAULT '',
    elements JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_numeracoes_updated
    BEFORE UPDATE ON producao_numeracoes
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_numeracoes DISABLE ROW LEVEL SECURITY;

-- ── producao_saidas ──────────────────────────────────────────────────────────
-- Formatos de folha de saída para impressão: A4, A3, SRA3, etc.

CREATE TABLE IF NOT EXISTS producao_saidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    name TEXT NOT NULL,
    width_mm REAL NOT NULL,
    height_mm REAL NOT NULL,
    file_format TEXT DEFAULT 'pdf',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_saidas_updated
    BEFORE UPDATE ON producao_saidas
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_saidas DISABLE ROW LEVEL SECURITY;

-- ── producao_cores ───────────────────────────────────────────────────────────
-- Cores de fundo com referência a arquivo PDF vetorizado para calibração digital

CREATE TABLE IF NOT EXISTS producao_cores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    name TEXT NOT NULL,
    hex TEXT,
    pdf_url TEXT,
    pdf_filename TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_cores_updated
    BEFORE UPDATE ON producao_cores
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_cores DISABLE ROW LEVEL SECURITY;

-- ── producao_modelos_imposicao ───────────────────────────────────────────────
-- Modelos salvos de imposição (combinação rápida de parâmetros e receitas)

CREATE TABLE IF NOT EXISTS producao_modelos_imposicao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    formato_id UUID REFERENCES producao_formatos(id) ON DELETE SET NULL,
    saida_id UUID REFERENCES producao_saidas(id) ON DELETE SET NULL,
    numeracao_id UUID REFERENCES producao_numeracoes(id) ON DELETE SET NULL,
    cor_id UUID REFERENCES producao_cores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_modelos_imposicao_updated
    BEFORE UPDATE ON producao_modelos_imposicao
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_modelos_imposicao DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_producao_formatos_name ON producao_formatos(name);
CREATE INDEX IF NOT EXISTS idx_producao_formatos_empresa ON producao_formatos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_numeracoes_name ON producao_numeracoes(name);
CREATE INDEX IF NOT EXISTS idx_producao_numeracoes_formato ON producao_numeracoes(formato_id);
CREATE INDEX IF NOT EXISTS idx_producao_numeracoes_empresa ON producao_numeracoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_saidas_name ON producao_saidas(name);
CREATE INDEX IF NOT EXISTS idx_producao_saidas_empresa ON producao_saidas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_cores_name ON producao_cores(name);
CREATE INDEX IF NOT EXISTS idx_producao_cores_empresa ON producao_cores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_modelos_name ON producao_modelos_imposicao(name);
CREATE INDEX IF NOT EXISTS idx_producao_modelos_empresa ON producao_modelos_imposicao(empresa_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- DADOS INICIAIS (seed)
-- ══════════════════════════════════════════════════════════════════════════════

-- Formatos padrão
INSERT INTO producao_formatos (id, name, width_mm, height_mm, cols, rows, gap_h_mm, gap_v_mm)
VALUES 
    ('d5f8d271-0000-0000-0000-000000000000', 'Mobi', 152, 53, 2, 4, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Saídas padrão
INSERT INTO producao_saidas (id, name, width_mm, height_mm, file_format)
VALUES 
    ('564c69ec-0000-0000-0000-000000000000', 'A4', 320, 220, 'pdf'),
    ('189b5bc0-0000-0000-0000-000000000000', 'A3', 297, 420, 'pdf')
ON CONFLICT (id) DO NOTHING;
