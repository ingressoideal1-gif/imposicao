-- ─────────────────────────────────────────────────────────────────────────────
-- A ESCOLHA "ENTREGAR CADA BLOCO ENQUANTO GERA" FICA SALVA NO MODELO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 27/08/2026. O usuario relatou o modelo de 14.000 celulas do pedido 21202:
-- 1.400 folhas que o motor montava inteiras antes de sair a primeira. Medido com
-- o modelo 1000567 de verdade, a entrega por bloco leva a primeira folha de
-- 534,6 s para 4,2 s, e o trabalho inteiro de 535 s para 118 s.
--
-- A caixa nasce MARCADA na tela, por decisao dele. Esta coluna guarda a escolha
-- de quem DESMARCAR num modelo especifico -- pela regra do projeto, escolha de
-- impressao do operador fica salva no modelo, e nao so na sessao.
--
-- ## Por que a coluna aceita NULO, e o que o nulo significa
--
-- NULO = "ninguem escolheu neste modelo" = vale o padrao da tela, que hoje e
-- marcado. Nao ha `DEFAULT true` de proposito: o dia em que o padrao da tela
-- mudar, os 50 mil modelos ja gravados nao podem continuar carregando um `true`
-- que ninguem digitou. O padrao mora num lugar so -- a tela --, e a coluna
-- guarda apenas a DIVERGENCIA em relacao a ele.
--
-- Rodar: .\ferramentas\rodar_sql.ps1 sql\schema_entregar_por_bloco.sql

alter table public.pedidos_modelos
    add column if not exists entregar_por_bloco boolean;

comment on column public.pedidos_modelos.entregar_por_bloco is
    'Entregar cada bloco a impressora enquanto o trabalho e gerado, em vez de '
    'montar a tiragem inteira antes. NULO = usa o padrao da tela (marcado). '
    'Gravado pelo painel Ideal Imposition quando o operador mexe na caixa.';
