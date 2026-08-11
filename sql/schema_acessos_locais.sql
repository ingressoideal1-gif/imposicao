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

-- ============================================================
-- RLS: DESLIGADO, como no resto do projeto — e por que
--
-- Criada pelo editor SQL, a tabela nasce com RLS LIGADO e sem politica
-- nenhuma. Nesse estado o PostgREST devolve lista vazia na leitura e 401 na
-- escrita: o Menu Usuarios nao salva e a estacao nunca recebe a lista.
--
-- Nao adianta escrever politica para o papel `anon`: e a MESMA chave anonima
-- que o site, o motor no Render e o agente usam. Qualquer politica larga o
-- bastante para o motor gravar libera a internet inteira junto — o efeito e
-- identico a deixar o RLS desligado, so que disfarcado de protecao.
--
-- Fechar isto de verdade exige uma chave `service_role` no motor e o agente
-- buscando a lista atraves do motor, e nao direto do Supabase. E o trabalho da
-- fase 1 do RLS, ainda adiado por decisao do usuario. Enquanto ele nao vem,
-- esta tabela fica como as outras — com a diferenca, que precisa estar escrita
-- em algum lugar, de que aqui dentro ha SENHAS em texto claro. Quando a fase 1
-- comecar, comece por esta tabela.
-- ============================================================
ALTER TABLE public.imposition_acessos_locais DISABLE ROW LEVEL SECURITY;
