-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL IMPOSITION + VIBECODE — Schema de Ordens de Serviço (Operacional)
-- Banco compartilhado entre os dois sistemas via Supabase
-- Prefixo: producao_ (alinhado com convenções do Vibecode)
-- Criado em: 2026-06-12 | Atualizado para conformidade de chaves UUID e empresa_id
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

-- ── TABELA: producao_usuarios ────────────────────────────────────────────────
-- Perfis de usuários vinculados ao auth.users do Supabase

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

-- ── TABELA: producao_ordens_servico ──────────────────────────────────────────
-- Cada OS agrupa múltiplos itens (linhas da proposta/pedido)

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

-- ── TABELA: producao_os_itens ────────────────────────────────────────────────
-- Cada item representa uma linha de produção dentro da OS

CREATE TABLE IF NOT EXISTS producao_os_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    os_id UUID NOT NULL REFERENCES producao_ordens_servico(id) ON DELETE CASCADE,
    setor TEXT NOT NULL,                -- TEXTIL, IMPRESS., FLEX
    produto TEXT NOT NULL,              -- TEX, CORDÃO, TRIBAND, MOBI, UP, TEX PLUS
    modelo TEXT,                        -- código do modelo (ex: VIBE-12807-611)
    formato TEXT NOT NULL,              -- referência textual (ex: "35X2")
    formato_id UUID REFERENCES producao_formatos(id) ON DELETE SET NULL, -- FK → formatos do Imposition
    quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
    num_inicial INTEGER NOT NULL DEFAULT 1,
    num_final INTEGER NOT NULL,
    cor TEXT DEFAULT 'STD',             -- nome da cor (ex: AMARELO, PINK, ROXO)
    cor_id UUID REFERENCES producao_cores(id) ON DELETE SET NULL, -- FK → cores do Imposition
    blocos TEXT DEFAULT 'N',            -- 'N' ou quantidade numérica (ex: '50', '25')
    verso BOOLEAN DEFAULT false,        -- impressão frente e verso
    numeracao TEXT DEFAULT 'SEQUENCIAL', -- tipo: PADRÃO, QR, BARRAS, SEQUENCIAL
    numeracao_id UUID REFERENCES producao_numeracoes(id) ON DELETE SET NULL, -- FK → numeracoes do Imposition
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

-- ── TABELA: producao_os_log ──────────────────────────────────────────────────
-- Auditoria de todas as ações operacionais

CREATE TABLE IF NOT EXISTS producao_os_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,                     -- Tenant ID
    os_id UUID REFERENCES producao_ordens_servico(id) ON DELETE SET NULL,
    item_id UUID,                       -- ID da producao_os_itens
    usuario_id UUID REFERENCES producao_usuarios(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,                 -- ex: CRIOU_OS, APROVOU_ITEM, IMPRIMIU, CANCELOU, EDITOU
    detalhes JSONB,                    -- dados extras (ex: {"campo": "aprovacao", "de": "EM ARTE", "para": "APROVADA"})
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE producao_os_log DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

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

CREATE INDEX IF NOT EXISTS idx_producao_log_os_id ON producao_os_log(os_id);
CREATE INDEX IF NOT EXISTS idx_producao_log_usuario ON producao_os_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_producao_log_created ON producao_os_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_producao_log_acao ON producao_os_log(acao);
CREATE INDEX IF NOT EXISTS idx_producao_log_empresa ON producao_os_log(empresa_id);
