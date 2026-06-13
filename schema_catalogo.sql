-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL IMPOSITION — Tabelas de Catálogo de Layouts (Supabase Vibecode)
-- Prefixo: producao_ (alinhado com convenções do Vibecode)
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-06-13 | Atualizado para aprovação parcial (apenas Catálogo com RLS ativo)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. EXTENSÕES E FUNÇÕES UTILITÁRIAS ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION producao_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. DEFINIÇÃO DAS TABELAS DO CATÁLOGO
-- ══════════════════════════════════════════════════════════════════════════════

-- ── producao_formatos ────────────────────────────────────────────────────────
-- Formatos de ingresso/artigo: dimensões geométricas e grid de poses na folha
CREATE TABLE IF NOT EXISTS producao_formatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID (separação de dados multi-tenant)
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

-- ── producao_numeracoes ──────────────────────────────────────────────────────
-- Templates de numeração VDP: QR Code, código de barras, textos e elementos SVG
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

-- ── producao_saidas ──────────────────────────────────────────────────────────
-- Dimensões da folha de papel física de saída da impressora (ex: A4, A3, SRA3)
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

-- ── producao_cores ───────────────────────────────────────────────────────────
-- Cores de fundo pré-definidas associadas a arquivos de calibração em PDF
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

-- ── producao_modelos_imposicao ───────────────────────────────────────────────
-- Receitas de imposição prontas que combinam formatos, saídas, VDP e cores
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

-- ── producao_produtos_formatos ────────────────────────────────────────────────
-- Relacionamento de mapeamento de produtos do ERP aos seus formatos de imposição
CREATE TABLE IF NOT EXISTS producao_produtos_formatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    id_produto INTEGER NOT NULL,         -- ID do produto no ERP (produtos.id_produto)
    formato_id UUID NOT NULL REFERENCES producao_formatos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_produto_formato UNIQUE (empresa_id, id_produto)
);

CREATE TRIGGER trg_producao_produtos_formatos_updated
    BEFORE UPDATE ON producao_produtos_formatos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CRIAÇÃO DE ÍNDICES
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
CREATE INDEX IF NOT EXISTS idx_producao_prod_fmt_produto ON producao_produtos_formatos(id_produto);
CREATE INDEX IF NOT EXISTS idx_producao_prod_fmt_empresa ON producao_produtos_formatos(empresa_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. POLÍTICAS DE SEGURANÇA RLS (Row Level Security)
-- ══════════════════════════════════════════════════════════════════════════════

-- Habilitar RLS em todas as tabelas criadas
ALTER TABLE producao_formatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_numeracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_cores ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_modelos_imposicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_produtos_formatos ENABLE ROW LEVEL SECURITY;

-- Políticas para: producao_formatos
CREATE POLICY "Permitir leitura de formatos para anon e authenticated" 
    ON producao_formatos FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de formatos para usuarios autenticados" 
    ON producao_formatos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para: producao_numeracoes
CREATE POLICY "Permitir leitura de numeracoes para anon e authenticated" 
    ON producao_numeracoes FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de numeracoes para usuarios autenticados" 
    ON producao_numeracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para: producao_saidas
CREATE POLICY "Permitir leitura de saidas para anon e authenticated" 
    ON producao_saidas FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de saidas para usuarios autenticados" 
    ON producao_saidas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para: producao_cores
CREATE POLICY "Permitir leitura de cores para anon e authenticated" 
    ON producao_cores FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de cores para usuarios autenticados" 
    ON producao_cores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para: producao_modelos_imposicao
CREATE POLICY "Permitir leitura de modelos para anon e authenticated" 
    ON producao_modelos_imposicao FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de modelos para usuarios autenticados" 
    ON producao_modelos_imposicao FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para: producao_produtos_formatos
CREATE POLICY "Permitir leitura de prod_formatos para anon e authenticated" 
    ON producao_produtos_formatos FOR SELECT USING (true);
CREATE POLICY "Permitir escrita de prod_formatos para usuarios autenticados" 
    ON producao_produtos_formatos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. DADOS INICIAIS (seed)
-- ══════════════════════════════════════════════════════════════════════════════

-- Formato padrão semente
INSERT INTO producao_formatos (id, name, width_mm, height_mm, cols, rows, gap_h_mm, gap_v_mm)
VALUES 
    ('d5f8d271-0000-0000-0000-000000000000', 'Mobi', 152, 53, 2, 4, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Saídas padrão semente
INSERT INTO producao_saidas (id, name, width_mm, height_mm, file_format)
VALUES 
    ('564c69ec-0000-0000-0000-000000000000', 'A4', 320, 220, 'pdf'),
    ('189b5bc0-0000-0000-0000-000000000000', 'A3', 297, 420, 'pdf')
ON CONFLICT (id) DO NOTHING;
