-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL IMPOSITION + VIBECODE — Schema de Ordens de Serviço
-- Banco compartilhado entre os dois sistemas via Supabase
-- Criado em: 2026-06-12
-- ══════════════════════════════════════════════════════════════════════════════

-- ── FUNÇÃO UTILITÁRIA: updated_at automático ─────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TABELA: usuarios ─────────────────────────────────────────────────────────
-- Perfis de usuários vinculados ao auth.users do Supabase
-- Criados automaticamente ao fazer signup ou manualmente pelo admin

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'operador'
        CHECK (role IN ('admin', 'gerente', 'operador', 'viewer')),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_usuarios_updated
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- ── TABELA: ordens_servico ───────────────────────────────────────────────────
-- Cada OS agrupa múltiplos itens (linhas da planilha)
-- O campo 'numero' é o identificador humano (ex: 17455)

CREATE TABLE IF NOT EXISTS ordens_servico (
    id TEXT PRIMARY KEY DEFAULT 'os_' || substr(gen_random_uuid()::text, 1, 8),
    numero INTEGER UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ARTE'
        CHECK (status IN ('ARTE', 'PRODUÇÃO', 'FINALIZADA', 'CANCELADA')),
    observacoes TEXT,
    criado_por UUID REFERENCES usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_os_updated
    BEFORE UPDATE ON ordens_servico
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ordens_servico DISABLE ROW LEVEL SECURITY;

-- ── TABELA: os_itens ─────────────────────────────────────────────────────────
-- Cada item representa uma linha de produção dentro da OS
-- Possui FKs opcionais para tabelas do Imposition (formato_id, cor_id, numeracao_id)

CREATE TABLE IF NOT EXISTS os_itens (
    id TEXT PRIMARY KEY DEFAULT 'osi_' || substr(gen_random_uuid()::text, 1, 8),
    os_id TEXT NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    setor TEXT NOT NULL,                -- TEXTIL, IMPRESS., FLEX
    produto TEXT NOT NULL,              -- TEX, CORDÃO, TRIBAND, MOBI, UP, TEX PLUS
    modelo TEXT,                        -- código do modelo (ex: 123123)
    formato TEXT NOT NULL,              -- referência textual (ex: "35X2")
    formato_id TEXT,                    -- FK opcional → formatos.id do Imposition
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    num_inicial INTEGER NOT NULL DEFAULT 1,
    num_final INTEGER NOT NULL,
    cor TEXT DEFAULT 'STD',             -- nome da cor (ex: AMARELO, PINK, ROXO)
    cor_id TEXT,                        -- FK opcional → cores.id do Imposition
    blocos TEXT DEFAULT 'N',            -- 'N' ou quantidade numérica (ex: '50', '25')
    verso BOOLEAN DEFAULT false,        -- impressão frente e verso
    numeracao TEXT DEFAULT 'SEQUENCIAL', -- tipo: PADRÃO, QR, BARRAS, SEQUENCIAL, CLIENTE, BANCO D., TICKET, TEATRO
    numeracao_id TEXT,                  -- FK opcional → numeracoes.id do Imposition
    aprovacao TEXT DEFAULT 'EM ARTE'
        CHECK (aprovacao IN ('EM ARTE', 'APROVADA', 'PRONTA', 'REPROVADA')),
    impressao TEXT DEFAULT 'AGUARD.'
        CHECK (impressao IN ('AGUARD.', 'PARCIAL', 'IMPRESSO', 'ERRO')),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_osi_updated
    BEFORE UPDATE ON os_itens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE os_itens DISABLE ROW LEVEL SECURITY;

-- ── TABELA: os_log ───────────────────────────────────────────────────────────
-- Auditoria de todas as ações sobre OS e itens
-- Essencial para rastrear quem fez o quê em sistema com centenas de usuários

CREATE TABLE IF NOT EXISTS os_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    os_id TEXT REFERENCES ordens_servico(id) ON DELETE SET NULL,
    item_id TEXT,                       -- referência ao os_itens.id (sem FK para manter logs após delete)
    usuario_id UUID REFERENCES usuarios(id),
    acao TEXT NOT NULL,                 -- ex: CRIOU_OS, APROVOU_ITEM, IMPRIMIU, CANCELOU, EDITOU
    detalhes JSONB,                    -- dados extras (ex: {"campo": "aprovacao", "de": "EM ARTE", "para": "APROVADA"})
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE os_log DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES — Performance otimizada para centenas de usuários
-- ══════════════════════════════════════════════════════════════════════════════

-- Ordens de Serviço
CREATE INDEX IF NOT EXISTS idx_os_numero ON ordens_servico(numero);
CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_created ON ordens_servico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_criado_por ON ordens_servico(criado_por);

-- Itens da OS
CREATE INDEX IF NOT EXISTS idx_osi_os_id ON os_itens(os_id);
CREATE INDEX IF NOT EXISTS idx_osi_aprovacao ON os_itens(aprovacao);
CREATE INDEX IF NOT EXISTS idx_osi_impressao ON os_itens(impressao);
CREATE INDEX IF NOT EXISTS idx_osi_modelo ON os_itens(modelo);
CREATE INDEX IF NOT EXISTS idx_osi_formato ON os_itens(formato);
CREATE INDEX IF NOT EXISTS idx_osi_setor ON os_itens(setor);

-- Log de auditoria
CREATE INDEX IF NOT EXISTS idx_log_os_id ON os_log(os_id);
CREATE INDEX IF NOT EXISTS idx_log_usuario ON os_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON os_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acao ON os_log(acao);
