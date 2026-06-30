CREATE TABLE IF NOT EXISTS producao_mapas_teatro (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    total_lugares INTEGER DEFAULT 0,
    lugares_por_setor JSONB DEFAULT '[]'::jsonb
);

-- Habilitar RLS (Row Level Security) para segurança
ALTER TABLE producao_mapas_teatro ENABLE ROW LEVEL SECURITY;

-- Políticas abertas (necessário se o sistema usa chave anônima para interagir com o banco)
CREATE POLICY "Permitir leitura para todos" ON producao_mapas_teatro FOR SELECT USING (true);
CREATE POLICY "Permitir inserção para todos" ON producao_mapas_teatro FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização para todos" ON producao_mapas_teatro FOR UPDATE USING (true);
CREATE POLICY "Permitir deleção para todos" ON producao_mapas_teatro FOR DELETE USING (true);
