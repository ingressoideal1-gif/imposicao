-- ============================================================
-- ACESSO LOCAL AO NEWPROD
--
-- Lista propria de operadores, sem vinculo com as contas do sistema: quem opera
-- a estacao nao tem conta no Supabase, e exigir uma colocaria a rede no caminho
-- de quem so quer imprimir. O administrador gera o codigo no Menu Usuarios, le
-- na tela e entrega ao operador.
--
-- O codigo fica em texto claro de proposito — o administrador precisa le-lo para
-- entregar. Isto e uma tranca de estacao, nao uma barreira criptografica.
-- Quando a fase 1 do RLS chegar, esta deve ser a primeira tabela a fechar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.imposition_acessos_locais (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          TEXT NOT NULL,
    codigo        TEXT NOT NULL UNIQUE,
    is_admin      BOOLEAN DEFAULT false,
    ativo         BOOLEAN DEFAULT true,
    criado_em     TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- O login da estacao procura pelo codigo; e a unica consulta que existe aqui.
CREATE INDEX IF NOT EXISTS idx_acessos_locais_codigo
    ON public.imposition_acessos_locais (codigo);
