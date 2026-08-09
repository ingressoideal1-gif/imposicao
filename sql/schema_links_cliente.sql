-- =============================================
-- TABELA: pedidos_links_cliente
-- Mapeia cada pedido a um token único para
-- gerar a URL pública de aprovação do cliente
-- =============================================

CREATE TABLE IF NOT EXISTS public.pedidos_links_cliente (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    os_id TEXT NOT NULL,
    numero_pedido TEXT NOT NULL,
    token VARCHAR(12) NOT NULL,
    id_int TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    acessos INTEGER DEFAULT 0,
    ultimo_acesso TIMESTAMPTZ,
    ativo BOOLEAN DEFAULT true,
    UNIQUE(os_id)
);

-- Índice para busca rápida por número + token
CREATE INDEX IF NOT EXISTS idx_link_cliente_token 
ON public.pedidos_links_cliente(numero_pedido, token);

-- Comentário na tabela
COMMENT ON TABLE public.pedidos_links_cliente IS 
'Links públicos de aprovação para clientes. Cada pedido gera um token único que forma a URL segura.';
