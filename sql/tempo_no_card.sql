-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: ha quanto tempo o pedido esta no card em que esta
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- A coluna "Data Liberacao" da Lista de Arte virou "Tempo", a pedido do usuario em
-- 19/08/2026. Ela mostra ha quanto tempo o pedido esta no card atual, em horas e
-- minutos ("01:05"), e pinta o numero: verde ate 1h, azul ate 2h, laranja ate 3h,
-- vermelho depois. O pedido de maior tempo assume o topo da lista.
--
-- O card em que um pedido esta e CALCULADO no painel, pela funcao
-- `classificarPedidoNaArte`, a partir de quatro fontes: `propostas`,
-- `pedidos_modelos`, `pedidos_artes` e os links do cliente. Nao existia em lugar
-- nenhum o registro de QUANDO ele entrou nesse card -- e sem isso nao ha relogio.
-- Esta tabela e esse registro, e nada mais: uma linha por pedido, sobrescrita a
-- cada troca de card.
--
-- QUEM ESCREVE
-- O proprio painel, quando desenha a lista e percebe que o card mudou. Foi a opcao
-- escolhida pelo usuario, contra a alternativa de um robo no servidor: o robo seria
-- fiel ao relogio real mesmo com todos os paineis fechados, mas exigiria reescrever
-- a regra de classificacao em SQL, criando uma segunda copia que divergiria da do
-- painel no primeiro ajuste.
--
-- A consequencia, que e conhecida e aceita: troca de card que acontece de madrugada
-- so e registrada quando alguem abre o painel de manha, e o tempo passa a contar
-- dali. Na pratica isso aproxima o numero do tempo de trabalho observado.
--
-- A REGRA DOS 60 MINUTOS
-- No card "Em Arte" o tempo nao se perde numa ida rapida a outro card: se o pedido
-- sair e voltar em ate 60 minutos, a contagem segue de onde parou. Passou de 60
-- minutos fora, volta do zero, em verde. Nos demais cards a contagem zera a cada
-- troca.
--
-- E por isso que existem as duas colunas de credito: `credito_segundos` guarda o
-- tempo que a arte ja tinha acumulado, e `saiu_da_fila_em` diz quando o cronometro
-- foi pausado -- e so essas duas informacoes decidem, na volta, se o credito e
-- devolvido ou descartado.

-- ─── 1. A tabela ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.imposition_tempo_no_card (
    -- O numero do pedido, a mesma chave que `pedidos_artes` usa.
    id_int            integer PRIMARY KEY,

    -- Em que card ele esta: os mesmos quatro nomes que `classificarPedidoNaArte`
    -- devolve. O CHECK existe para um card novo no painel nao entrar aqui calado.
    card              text NOT NULL
                      CHECK (card IN ('fila', 'aprovacao', 'aprovados', 'concluidos')),

    -- Quando ele entrou NESTE card.
    desde             timestamptz NOT NULL DEFAULT now(),

    -- Tempo que ele ja tinha acumulado em "Em Arte" antes de sair. So conta quando
    -- `card = 'fila'`; nos outros cards fica em zero.
    credito_segundos  integer NOT NULL DEFAULT 0 CHECK (credito_segundos >= 0),

    -- Quando saiu de "Em Arte" pela ultima vez. E a partir daqui que se mede se a
    -- volta aconteceu dentro dos 60 minutos.
    saiu_da_fila_em   timestamptz,

    atualizado_em     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.imposition_tempo_no_card IS
'Ha quanto tempo cada pedido esta no card atual da Lista de Arte. Uma linha por pedido, escrita pelo painel quando ele percebe a troca de card. O card em si nao mora aqui: ele e calculado por classificarPedidoNaArte a partir de propostas, pedidos_modelos, pedidos_artes e os links do cliente -- esta tabela guarda so o CARIMBO DE HORA da ultima troca.';

COMMENT ON COLUMN public.imposition_tempo_no_card.credito_segundos IS
'Segundos ja acumulados em "Em Arte" antes de o pedido sair para outro card. Devolvidos na volta se ela acontecer em ate 60 minutos; descartados depois disso. Zero nos demais cards.';

COMMENT ON COLUMN public.imposition_tempo_no_card.saiu_da_fila_em IS
'Quando o pedido saiu de "Em Arte" pela ultima vez. Junto com credito_segundos, decide se a contagem retoma de onde parou ou volta ao zero.';

-- ─── 2. Quem pode ler e escrever ────────────────────────────────────────────
--
-- Mesma politica de `pedidos_links_cliente`: so quem tem sessao do Supabase. A
-- estacao da grafica entra pelo codigo local, sem sessao, e nem ve a Lista de
-- Arte -- entao nao precisa de acesso nenhum aqui.

ALTER TABLE public.imposition_tempo_no_card ENABLE ROW LEVEL SECURITY;

-- O REVOKE do `authenticated` nao e formalidade: o Supabase da GRANT ALL a ele
-- em toda tabela nova, por privilegio padrao do esquema. Sem tirar primeiro, o
-- GRANT abaixo nao restringe nada, e o painel logado ficaria podendo TRUNCATE na
-- tabela inteira -- foi o que a conferencia do final acusou na primeira execucao.
REVOKE ALL ON public.imposition_tempo_no_card FROM anon;
REVOKE ALL ON public.imposition_tempo_no_card FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.imposition_tempo_no_card TO authenticated;
GRANT ALL ON public.imposition_tempo_no_card TO service_role;

DROP POLICY IF EXISTS "painel logado usa a tabela" ON public.imposition_tempo_no_card;
CREATE POLICY "painel logado usa a tabela"
    ON public.imposition_tempo_no_card
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ─── 3. A conferencia, sem sair daqui ───────────────────────────────────────
--
-- O esperado:
--   anon           -> (nenhum privilegio)
--   authenticated  -> INSERT, SELECT, UPDATE
--   service_role   -> ALL

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'imposition_tempo_no_card'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY grantee
ORDER BY grantee;
