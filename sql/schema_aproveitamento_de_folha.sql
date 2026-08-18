-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: aproveitamento de folha — o que pode combinar, o limiar e o registro
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Toda tiragem que nao e multiplo das celulas do formato joga papel fora:
-- 29 credenciais num formato de 4 celulas gastam 8 folhas e deixam 3 celulas
-- vazias — tres quartos de uma folha de PVC. O painel passou a medir isso e a
-- oferecer uma composicao que fecha a folha, primeiro dentro do pedido e depois
-- entre os pedidos da fila.
--
-- Sao TRES tabelas nossas (`producao_*`). Nenhuma toca o catalogo `produtos` do
-- parceiro: o que dizemos aqui e uma permissao NOSSA sobre o produto dele.
--
-- Desenho em
-- docs/superpowers/specs/2026-08-18-aproveitamento-de-folha-entre-pedidos-design.md

-- ── 1. Quais produtos podem dividir folha com OUTRO pedido ──────────────────────
--
-- Duas perguntas diferentes, e as duas valem: esta tabela diz se o produto PODE
-- combinar entre pedidos; o `porQueNaoCombina` do painel diz se DA — cor,
-- formato, saida, face, modo PDF e modo de impressao.
--
-- Ausencia significa NAO liberado. E deliberado: juntar pedidos muda o status de
-- um pedido que ninguem abriu, e isso nao pode comecar ligado.
create table if not exists producao_produtos_combinaveis (
    id_produto      text primary key,
    nome            text,
    liberado        boolean     not null default true,
    atualizado_em   timestamptz not null default now()
);

comment on table producao_produtos_combinaveis is
    'Produtos liberados a dividir folha com modelos de OUTRO pedido. Linha ausente = nao liberado.';

-- ── 2. Configuracao do painel ───────────────────────────────────────────────────
--
-- Chave/valor porque o proximo ajuste vira uma linha, e nao outra migracao.
create table if not exists producao_config (
    chave           text primary key,
    valor           jsonb       not null,
    atualizado_em   timestamptz not null default now()
);

comment on column producao_config.valor is
    'JSON cru. limiar_sobra e uma fracao de folha entre 0 e 1 — 0.5 avisa quando sobra meia folha.';

-- O limiar padrao: avisa quando a sobra passa de meia folha. Fracao, e nao
-- numero de celulas, porque num formato de 4 sobrar 3 e grave e num de 20 e ruido.
insert into producao_config (chave, valor)
values ('limiar_sobra', '0.5'::jsonb)
on conflict (chave) do nothing;

-- ── 3. Que trabalho juntou quais pedidos ────────────────────────────────────────
--
-- E o que responde, semanas depois, "por que o 20508 foi impresso antes da hora".
-- Gravado quando a impressao e CONFIRMADA, nao quando o PDF e gerado: PDF gerado
-- e conferencia, e conferencia nao muda status de pedido nenhum.
create table if not exists producao_combinacoes (
    id              uuid        primary key default gen_random_uuid(),
    criado_em       timestamptz not null default now(),
    criado_por      text,
    formato         text,
    poses           integer,
    itens           integer,
    folhas          integer,
    celulas_vazias  integer,
    -- [{ "pedido": "20495", "os_id": "...", "modelo": "1000277",
    --    "nome": "Tchequia", "qtd": 29 }, ...]
    modelos         jsonb       not null
);

create index if not exists idx_producao_combinacoes_criado_em
    on producao_combinacoes (criado_em desc);

comment on table producao_combinacoes is
    'Registro de folhas que juntaram modelos de pedidos diferentes. So grava quando a impressao e confirmada.';
