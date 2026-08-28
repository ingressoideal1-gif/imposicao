-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: o banco de dados passa a ser um registro do PEDIDO
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Ate aqui o CSV morava dentro da numeracao (producao_numeracoes.csv_data). Como
-- desenho e dado ficavam no mesmo registro, reusar uma peca em outro pedido
-- arrastaria o dado do pedido anterior — e a unica saida era duplicar a
-- numeracao. Em 27/08/2026 havia 171 numeracoes no catalogo, 138 delas nascidas
-- de dentro de um pedido e 77 que sao a mesma peca repetida.
--
-- O QUE MUDA
-- O banco vira um registro proprio, com dono no pedido (id_int). Um pedido pode
-- ter UM banco com varios modelos apontando para ele, ou VARIOS, um por modelo:
-- e a mesma mecanica, muda so quantos registros sao criados.
--
-- NADA E CONVERTIDO
-- Esta migracao e ADITIVA. Nenhuma linha de producao_numeracoes e lida ou
-- escrita aqui. Modelo sem linha em pedidos_modelos_banco continua lendo o CSV
-- de dentro da numeracao, que e o comportamento de todo pedido existente.
--
-- POR QUE NAO ALTERAR pedidos_modelos
-- Ela e do parceiro Vibe. O csv_selecao mora la por uma excecao aberta em
-- 11/08/2026, e uma excecao aberta nao autoriza a proxima. Aqui o vinculo fica
-- em tabela nossa: desfazer e apagar duas tabelas.

CREATE TABLE IF NOT EXISTS pedidos_bancos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_int       INTEGER NOT NULL,           -- o pedido dono, como em pedidos_modelos
    nome         TEXT NOT NULL DEFAULT '',
    csv_filename TEXT NOT NULL DEFAULT '',
    csv_headers  JSONB NOT NULL DEFAULT '[]',
    csv_data     JSONB,
    csv_url      TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_bancos_id_int ON pedidos_bancos (id_int);

-- Um modelo tem no maximo um banco: a chave primaria e o proprio modelo.
--
-- O `modelo_id` e TEXT, e nao UUID: `pedidos_modelos` e do parceiro Vibe e o id
-- dela e um NUMERO (1000409). A primeira versao desta tabela usou UUID por
-- analogia com as tabelas nossas, e ligar um modelo morria com "invalid input
-- syntax for type uuid". TEXT aceita o numero de hoje e o formato de amanha; o
-- painel ja compara os dois lados com String(). Ver
-- sql/pedidos_modelos_banco_modelo_id_texto.sql, a correcao do banco que ja existe.
CREATE TABLE IF NOT EXISTS pedidos_modelos_banco (
    modelo_id  TEXT PRIMARY KEY,             -- pedidos_modelos.id (numero, no Vibe)
    banco_id   UUID NOT NULL REFERENCES pedidos_bancos (id) ON DELETE CASCADE,
    csv_mapa   JSONB,                        -- { "coluna da peca": "coluna deste banco" }
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_modelos_banco_banco ON pedidos_modelos_banco (banco_id);
