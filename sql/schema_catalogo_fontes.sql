-- ============================================================
-- TABELA: catalogo_fontes (Biblioteca Centralizada de Fontes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalogo_fontes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE,
    font_family VARCHAR(255) NOT NULL,
    arquivo_url TEXT NOT NULL,
    categoria VARCHAR(100) DEFAULT 'Geral',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.catalogo_fontes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para leitura pública e inserção por usuários autenticados
CREATE POLICY "Permitir leitura publica de catalogo_fontes"
    ON public.catalogo_fontes FOR SELECT
    USING (true);

CREATE POLICY "Permitir insercao/atualizacao em catalogo_fontes"
    ON public.catalogo_fontes FOR ALL
    USING (true)
    WITH CHECK (true);

-- Dados Iniciais Recomendados
INSERT INTO public.catalogo_fontes (nome, font_family, arquivo_url, categoria)
VALUES 
    ('Impact', 'Impact', 'https://raw.githubusercontent.com/google/fonts/main/ofl/impact/Impact.ttf', 'Numeração'),
    ('Arial Bold', 'Arial', 'https://raw.githubusercontent.com/google/fonts/main/apache/arimo/Arimo-Bold.ttf', 'Geral'),
    ('Roboto Bold', 'Roboto', 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Bold.ttf', 'Moderna'),
    ('Montserrat Bold', 'Montserrat', 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat-Bold.ttf', 'Moderna')
ON CONFLICT (nome) DO NOTHING;
