-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL IMPOSITION + VIBECODE — Schema Unificado de Produção
-- Banco compartilhado entre os dois sistemas via Supabase
-- Prefixo: producao_ (alinhado com convenções do Vibecode)
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-06-13 | Atualizado para UUID como PK e empresa_id
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. CONFIGURAÇÕES INICIAIS ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION producao_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABELAS DE CATÁLOGO (Configurações e Gabaritos Geométricos)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── producao_formatos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_formatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID (separação de dados por empresa)
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
    preview_jpg TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_numeracoes_updated
    BEFORE UPDATE ON producao_numeracoes
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_numeracoes DISABLE ROW LEVEL SECURITY;

-- ── producao_saidas ──────────────────────────────────────────────────────────
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
-- 2. TABELAS OPERACIONAIS (Fila de Execução de Produção - Runtime)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── producao_usuarios ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'operador'
        CHECK (role IN ('admin', 'gerente', 'operador', 'viewer')),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_usuarios_updated
    BEFORE UPDATE ON producao_usuarios
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_usuarios DISABLE ROW LEVEL SECURITY;

-- ── producao_ordens_servico ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_ordens_servico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    numero INTEGER UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PRODUÇÃO',
    observacoes TEXT,
    criado_por UUID REFERENCES producao_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_os_updated
    BEFORE UPDATE ON producao_ordens_servico
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_ordens_servico DISABLE ROW LEVEL SECURITY;

-- ── producao_os_itens ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_os_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    os_id UUID NOT NULL REFERENCES producao_ordens_servico(id) ON DELETE CASCADE,
    setor TEXT NOT NULL,                -- TEXTIL, IMPRESS., FLEX
    produto TEXT NOT NULL,              -- TEX, CORDÃO, TRIBAND, MOBI, UP, TEX PLUS
    modelo TEXT,                        -- código do modelo (ex: VIBE-12807-611)
    formato TEXT NOT NULL,              -- referência textual (ex: "35X2")
    formato_id UUID REFERENCES producao_formatos(id) ON DELETE SET NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
    num_inicial INTEGER NOT NULL DEFAULT 1,
    num_final INTEGER NOT NULL,
    cor TEXT DEFAULT 'STD',
    cor_id UUID REFERENCES producao_cores(id) ON DELETE SET NULL,
    blocos TEXT DEFAULT 'N',
    verso BOOLEAN DEFAULT false,
    numeracao TEXT DEFAULT 'SEQUENCIAL',
    numeracao_id UUID REFERENCES producao_numeracoes(id) ON DELETE SET NULL,
    aprovacao TEXT DEFAULT 'APROVADA',
    impressao TEXT DEFAULT 'AGUARD.'
        CHECK (impressao IN ('AGUARD.', 'PARCIAL', 'IMPRESSO', 'ERRO')),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_osi_updated
    BEFORE UPDATE ON producao_os_itens
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_os_itens DISABLE ROW LEVEL SECURITY;

-- ── producao_lotes_impressao ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_lotes_impressao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    modelo_imposicao_id UUID REFERENCES producao_modelos_imposicao(id) ON DELETE SET NULL,
    pdf_saida_url TEXT,                  -- URL do PDF gerado no Storage
    total_folhas INTEGER NOT NULL DEFAULT 1,
    quantidade_total_itens INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PDF_GERADO'
        CHECK (status IN ('AGUARDANDO_IMPOSICAO', 'EM_IMPOSICAO', 'PDF_GERADO', 'ENVIADO_IMPRESSAO', 'IMPRESSO', 'CONCLUIDO')),
    operador_id UUID REFERENCES producao_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_lotes_impressao_updated
    BEFORE UPDATE ON producao_lotes_impressao
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_lotes_impressao DISABLE ROW LEVEL SECURITY;

-- ── producao_lote_itens ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_lote_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    lote_id UUID NOT NULL REFERENCES producao_lotes_impressao(id) ON DELETE CASCADE,
    vibe_produto_proposta_id INTEGER NOT NULL, -- Referência ao produtos_proposta (ERP)
    status_item TEXT NOT NULL DEFAULT 'AGUARDANDO_IMPOSICAO',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_producao_lote_itens_updated
    BEFORE UPDATE ON producao_lote_itens
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();

ALTER TABLE producao_lote_itens DISABLE ROW LEVEL SECURITY;

-- ── producao_os_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producao_os_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    os_id UUID REFERENCES producao_ordens_servico(id) ON DELETE SET NULL,
    item_id UUID,                        -- ID do producao_os_itens
    usuario_id UUID REFERENCES producao_usuarios(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    detalhes JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_os_log DISABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. INDEXES
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

CREATE INDEX IF NOT EXISTS idx_producao_os_numero ON producao_ordens_servico(numero);
CREATE INDEX IF NOT EXISTS idx_producao_os_status ON producao_ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_producao_os_created ON producao_ordens_servico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_producao_os_criado_por ON producao_ordens_servico(criado_por);
CREATE INDEX IF NOT EXISTS idx_producao_os_empresa ON producao_ordens_servico(empresa_id);

CREATE INDEX IF NOT EXISTS idx_producao_osi_os_id ON producao_os_itens(os_id);
CREATE INDEX IF NOT EXISTS idx_producao_osi_aprovacao ON producao_os_itens(aprovacao);
CREATE INDEX IF NOT EXISTS idx_producao_osi_impressao ON producao_os_itens(impressao);
CREATE INDEX IF NOT EXISTS idx_producao_osi_modelo ON producao_os_itens(modelo);
CREATE INDEX IF NOT EXISTS idx_producao_osi_formato ON producao_os_itens(formato);
CREATE INDEX IF NOT EXISTS idx_producao_osi_setor ON producao_os_itens(setor);
CREATE INDEX IF NOT EXISTS idx_producao_osi_empresa ON producao_os_itens(empresa_id);

CREATE INDEX IF NOT EXISTS idx_producao_lotes_status ON producao_lotes_impressao(status);
CREATE INDEX IF NOT EXISTS idx_producao_lotes_empresa ON producao_lotes_impressao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_lote_itens_lote ON producao_lote_itens(lote_id);
CREATE INDEX IF NOT EXISTS idx_producao_lote_itens_vibe ON producao_lote_itens(vibe_produto_proposta_id);

CREATE INDEX IF NOT EXISTS idx_producao_log_os_id ON producao_os_log(os_id);
CREATE INDEX IF NOT EXISTS idx_producao_log_usuario ON producao_os_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_producao_log_created ON producao_os_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_producao_log_acao ON producao_os_log(acao);
CREATE INDEX IF NOT EXISTS idx_producao_log_empresa ON producao_os_log(empresa_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. DADOS INICIAIS (seed)
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
