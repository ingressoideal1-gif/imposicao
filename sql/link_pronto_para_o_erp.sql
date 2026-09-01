-- ══════════════════════════════════════════════════════════════════
--  A coluna `link`: a URL do cliente pronta para usar.
--            Execute no SQL Editor do Supabase, ou por
--       `.\ferramentas\rodar_sql.ps1 sql\link_pronto_para_o_erp.sql`
-- ══════════════════════════════════════════════════════════════════
--
-- Pedido do usuário em 31/08/2026: *"vamos criar a coluna na tabela e salvar o
-- link já pronto para uso"*, para o ERP parceiro ler direto, sem ter de montar
-- a URL.
--
-- ## Por que coluna GERADA, e não uma coluna comum preenchida pelo painel
--
-- A URL é uma função pura de duas colunas que já estão na linha:
--
--     https://ideal-imposition.vercel.app/cliente/{numero_pedido}-{token}
--
-- Coluna comum precisaria de alguém para preenchê-la — e "alguém" é o código do
-- painel, em todos os caminhos que criam ou mexem num link. Basta um caminho
-- esquecido para existir linha com `link` vazio, ou pior, com o link de outro
-- pedido depois de uma troca de token. Ninguém perceberia: link errado só falha
-- na mão do cliente.
--
-- `GENERATED ALWAYS ... STORED` tira essa possibilidade do mapa. O Postgres
-- calcula na hora do INSERT e a cada UPDATE das colunas de origem, preenche as
-- linhas que já existem no momento em que este arquivo roda, e RECUSA escrita
-- direta. Não há caminho para divergir.
--
-- ## O domínio é literal aqui, e isso é de propósito
--
-- Expressão de coluna gerada só aceita função imutável — nada de ler
-- configuração. O gêmeo dele mora em `security_config.py`, na constante
-- `PAINEL_BASE_URL`. Se o domínio mudar um dia, muda nos dois lugares, e um
-- `ALTER TABLE` recalcula as linhas todas de uma vez — que é justamente o que se
-- quer, e o que uma coluna preenchida à mão não daria.
--
-- ## O formato tem de casar com a rota da página
--
-- `frontend/cliente.js`, no `checkClienteRoute`, aceita exatamente
-- `/cliente/<dígitos>-<letras e números>`. Hífen simples, sem barra no fim.
-- Há um teste que compara este formato com o do frontend:
-- `tests/lista_arte_harness.js`.

ALTER TABLE public.pedidos_links_cliente
    ADD COLUMN IF NOT EXISTS link text
    GENERATED ALWAYS AS (
        'https://ideal-imposition.vercel.app/cliente/' || numero_pedido || '-' || token
    ) STORED;

COMMENT ON COLUMN public.pedidos_links_cliente.link IS
'A URL de aprovacao pronta para usar. Coluna GERADA a partir de numero_pedido e token -- nao aceita escrita direta, e nunca fica desatualizada. Filtre por ativo IS TRUE: link revogado nao abre. O token dentro dela e uma SENHA: quem tem a URL aprova a arte, e aprovar arte e autorizar a impressao.';

-- ─── A conferência, sem sair daqui ───────────────────────────────────────────
--
-- O esperado: toda linha com `link` preenchido, e o formato batendo com a rota
-- que `frontend/cliente.js` aceita.

SELECT count(*)                                                        AS links,
       count(*) FILTER (WHERE link IS NULL)                            AS sem_link,
       count(*) FILTER (WHERE link !~ '^https://[^/]+/cliente/\d+-[a-z0-9]+$') AS fora_do_formato
  FROM public.pedidos_links_cliente;

SELECT id_int, numero_pedido, ativo, link
  FROM public.pedidos_links_cliente
 ORDER BY created_at DESC
 LIMIT 3;

-- ─── Como desfazer ───────────────────────────────────────────────────────────
--
-- ALTER TABLE public.pedidos_links_cliente DROP COLUMN IF EXISTS link;
