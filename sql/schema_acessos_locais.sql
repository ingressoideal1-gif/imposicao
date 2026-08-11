-- ============================================================
-- ACESSO LOCAL AO NEWPROD
--
-- Lista propria de operadores, sem vinculo com as contas do sistema: quem opera
-- a estacao nao tem conta no Supabase, e exigir uma colocaria a rede no caminho
-- de quem so quer imprimir. O administrador escolhe o codigo de 6 caracteres,
-- le na tela e entrega ao operador.
--
-- O codigo fica em texto claro de proposito — o administrador precisa le-lo para
-- entregar. Isto e uma tranca de estacao, nao uma barreira criptografica.
--
-- RODE ESTE ARQUIVO INTEIRO. Ele e idempotente: da para rodar de novo a qualquer
-- momento sem perder dado nenhum.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.imposition_acessos_locais (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          TEXT NOT NULL,
    codigo        TEXT NOT NULL UNIQUE,
    ativo         BOOLEAN DEFAULT true,
    criado_em     TIMESTAMPTZ DEFAULT now(),
    atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- O login da estacao procura pelo codigo; e a unica consulta que existe aqui.
CREATE INDEX IF NOT EXISTS idx_acessos_locais_codigo
    ON public.imposition_acessos_locais (codigo);

-- ============================================================
-- Perfil e permissoes — a mesma grade dos demais usuarios
--
-- O operador local recebe as mesmas permissoes por modulo que um usuario do
-- sistema: perfil (role) como atalho e a grade de ver/editar por modulo mais as
-- acoes. Em JSONB, e nao em ~30 colunas booleanas como a
-- imposition_user_permissions, porque a lista de modulos cresce a cada tela nova
-- e cada crescimento viraria um ALTER TABLE — o painel ja trata permissao como
-- um objeto de chaves perm_*, entao o formato aqui e o mesmo que ele ja usa.
-- ============================================================
ALTER TABLE public.imposition_acessos_locais
    ADD COLUMN IF NOT EXISTS role       TEXT   DEFAULT 'visualizador',
    ADD COLUMN IF NOT EXISTS permissoes JSONB  DEFAULT '{}'::jsonb;

-- is_admin saiu: virou perm_admin_view dentro de `permissoes`, junto com todo o
-- resto. Duas fontes para a mesma pergunta ("este operador e admin?") acabariam
-- discordando uma hora.
ALTER TABLE public.imposition_acessos_locais
    DROP COLUMN IF EXISTS is_admin;

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

-- E a politica permissiva POR CIMA do RLS desligado, que parece redundante e
-- nao e.
--
-- O painel do Supabase mostra um aviso em toda tabela sem RLS, com um botao de
-- ligar. Ligar o RLS numa tabela sem politica nenhuma nao da erro em lugar
-- nenhum: a leitura passa a devolver lista vazia e a escrita passa a responder
-- 401. Foi o que aconteceu aqui, DEPOIS de a tabela ja estar funcionando —
-- alguem clicou no aviso, e o sintoma foi "Erro ao criar acesso" sem nenhuma
-- pista do motivo.
--
-- Com a politica no lugar, ligar o RLS deixa de quebrar nada. Ela nao afrouxa
-- nada que o DISABLE ja nao afrouxasse: e a mesma chave anonima do site, do
-- motor e do agente, entao "liberar para anon" e o estado em que a tabela ja
-- esta. Quem for fechar isto de verdade, na fase 1 do RLS, troca esta politica
-- por uma que exija service_role — e e por isso que ela tem nome.
DROP POLICY IF EXISTS acessos_locais_anon ON public.imposition_acessos_locais;
CREATE POLICY acessos_locais_anon ON public.imposition_acessos_locais
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
