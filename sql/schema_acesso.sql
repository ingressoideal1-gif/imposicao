-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — Controle de acesso por QR Ideal (Supabase Vibecode)
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-13
-- Spec: docs/superpowers/specs/2026-08-13-controle-acesso-parte2-design.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Cria sete tabelas NOVAS, todas vazias, todas com o prefixo producao_acesso_.
--   Não apaga nada. Não altera nenhuma tabela existente. Não toca em nada do
--   parceiro Vibecode. Pode ser rodado mais de uma vez sem estragar nada: todo
--   comando é IF NOT EXISTS ou OR REPLACE.
--
--   Como desfazer está no fim do arquivo.
--
-- COMO RODAR
--
--   Supabase → SQL Editor → cole tudo → Run. Leva segundos.
--
-- POR QUE ELE EXISTE
--
--   O ingresso já sai da impressora com o QR Ideal (parte 1, publicada na v558 /
--   agente 1.2.57). Mas esse código não existe fora da estação que o imprimiu:
--   o cliente não tem como cadastrar o evento, e o celular da portaria não tem o
--   que conferir. Estas tabelas são a ponte.
--
-- O QUE NUNCA ENTRA AQUI
--
--   O código do QR Ideal em claro. A nuvem guarda só `codigo_hash`, resultado de
--   um KDF lento com sal por pedido. O único código legível que existe nestas
--   tabelas é o que o PRÓPRIO CLIENTE fornecer para staff e cortesia — esse é
--   dele, não nosso.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 0. EXTENSÕES E FUNÇÕES UTILITÁRIAS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- producao_update_updated_at() já existe, criada no schema_catalogo.sql.
-- Está repetida aqui com OR REPLACE só para este arquivo rodar sozinho num
-- banco novo, sem depender da ordem de execução.
CREATE OR REPLACE FUNCTION producao_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── A ARMADILHA DO empresa_id ────────────────────────────────────────────────
--
-- Conferido no banco em 13/08/2026: `empresa_id` é NULO em 100% das linhas de
-- TODAS as tabelas producao_* que existem hoje — 12 formatos, 59 numerações,
-- 24 cores, 12 saídas, 4 modelos. A coluna existe por convenção, e na prática a
-- aplicação roda com um inquilino só.
--
-- Isso quebra chave única silenciosamente. Em Postgres, NULO é DISTINTO de NULO
-- dentro de um índice único. Uma restrição escrita como
--
--     UNIQUE (empresa_id, pedido_id_int)
--
-- com empresa_id nulo não garante absolutamente nada: o mesmo pedido entra duas
-- vezes sem uma reclamação sequer. E as duas coisas que estas chaves existem
-- para impedir — publicar o mesmo pedido duas vezes e gravar a mesma credencial
-- duas vezes — passariam direto.
--
-- A função abaixo troca o nulo por um UUID zerado. Os índices únicos são
-- construídos sobre ela, então valem hoje (com nulo) e continuam valendo no dia
-- em que a coluna receber valor de verdade.
--
-- IMMUTABLE é obrigatório: Postgres só aceita função em índice se ela prometer
-- devolver sempre o mesmo resultado para a mesma entrada.
CREATE OR REPLACE FUNCTION producao_acesso_empresa(e UUID)
RETURNS UUID AS $$
    SELECT COALESCE(e, '00000000-0000-0000-0000-000000000000'::uuid);
$$ LANGUAGE sql IMMUTABLE;


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. AS TABELAS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1.1 producao_acesso_eventos ──────────────────────────────────────────────
-- O evento do cliente. Pode reunir VÁRIOS pedidos: o cliente que compra a pista
-- num pedido e o camarote em outro tem um evento só.
CREATE TABLE IF NOT EXISTS producao_acesso_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    -- clientes.id_cliente do ERP. É INTEGER: conferido no banco, e o
    -- clientes.id que existe ao lado dele é outro campo, esse sim texto.
    -- Preenchido pelo backend via propostas.id_cliente, achando a proposta
    -- por propostas.id_int = pedido_id_int.
    id_cliente INTEGER,
    dono_auth_id UUID NOT NULL,             -- conta que reivindicou o evento
    nome_evento TEXT NOT NULL,
    data_evento TIMESTAMPTZ,
    -- `local` sozinho é palavra-chave do SQL. Não vale economizar seis letras e
    -- descobrir isso com o script já colado no editor do banco de produção.
    local_evento TEXT,
    -- Sal usado nos códigos que o CLIENTE fornece (staff, cortesia). Os códigos
    -- do QR Ideal usam o sal do pedido, não este.
    sal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | encerrado | excluido
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_producao_acesso_eventos_updated ON producao_acesso_eventos;
CREATE TRIGGER trg_producao_acesso_eventos_updated
    BEFORE UPDATE ON producao_acesso_eventos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.2 producao_acesso_pedidos ──────────────────────────────────────────────
-- Um pedido cuja faixa de códigos já foi publicada pelo agente.
--
-- ATENÇÃO À ORDEM DOS FATOS: esta linha nasce ANTES do evento existir. O agente
-- publica a faixa ao fechar a impressão, e o cliente só vai reivindicar o evento
-- dias depois, quando ler o QR do Pedido. Por isso `evento_id` aceita nulo.
CREATE TABLE IF NOT EXISTS producao_acesso_pedidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    pedido_id_int INTEGER NOT NULL,         -- pedidos_modelos.id_int
    evento_id UUID REFERENCES producao_acesso_eventos(id),  -- nulo até reivindicar
    -- 32 bytes em hex, sorteados pelo backend, únicos por pedido. Não é segredo:
    -- ele só impede que o mesmo código do pool gere o mesmo hash em eventos
    -- diferentes. Quem protege o código é o custo do KDF.
    sal TEXT NOT NULL,
    qr_token_hash TEXT,                     -- sha256 do token do QR do Pedido
    qr_gerado_em TIMESTAMPTZ,
    qr_revogado_em TIMESTAMPTZ,
    publicado_em TIMESTAMPTZ,               -- quando o agente terminou de enviar
    total_credenciais INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | arquivado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_producao_acesso_pedidos_updated ON producao_acesso_pedidos;
CREATE TRIGGER trg_producao_acesso_pedidos_updated
    BEFORE UPDATE ON producao_acesso_pedidos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.3 producao_acesso_setores ──────────────────────────────────────────────
-- Um modelo do pedido = um setor do evento. Nasce quando o cliente reivindica.
--
-- Cuidado com o vocabulário: o setor do EVENTO ("VIP", "Pista") sai de
-- pedidos_modelos.nome_modelo. O campo pedidos_modelos.setor já está ocupado com
-- o setor de PRODUÇÃO (FLEXO, TÊXTIL, PVC, LASER) e não serve aqui.
CREATE TABLE IF NOT EXISTS producao_acesso_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    pedido_id_int INTEGER,                  -- nulo no setor que só tem staff
    -- pedidos_modelos.id. INTEGER porque a origem é INTEGER: os valores reais
    -- estão na casa de 1.000.000, longe do teto de 2,1 bilhões.
    modelo_id INTEGER,
    nome TEXT NOT NULL,                     -- nasce de nome_modelo; o cliente edita
    quantidade INTEGER NOT NULL DEFAULT 0,
    lotacao INTEGER,                        -- nulo = sem limite
    tipo_uso TEXT NOT NULL DEFAULT 'unico', -- unico | reentrada
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_producao_acesso_setores_updated ON producao_acesso_setores;
CREATE TRIGGER trg_producao_acesso_setores_updated
    BEFORE UPDATE ON producao_acesso_setores
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.4 producao_acesso_credenciais ──────────────────────────────────────────
-- Um ingresso.
--
-- codigo_visivel SÓ é preenchido quando origem = 'cliente'. O código do QR Ideal
-- nunca aparece aqui em claro, em nenhuma hipótese.
CREATE TABLE IF NOT EXISTS producao_acesso_credenciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    pedido_id_int INTEGER,                  -- nulo quando origem='cliente'
    modelo_id INTEGER,                      -- nulo quando origem='cliente'
    evento_id UUID REFERENCES producao_acesso_eventos(id),  -- nulo até reivindicar
    setor_id UUID REFERENCES producao_acesso_setores(id),   -- nulo até reivindicar
    numero INTEGER,                         -- posição do ingresso na tiragem
    codigo_hash TEXT NOT NULL,
    codigo_visivel TEXT,                    -- SÓ quando origem='cliente'
    origem TEXT NOT NULL DEFAULT 'qr_ideal',-- qr_ideal | cliente
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | cancelado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_producao_acesso_credenciais_updated ON producao_acesso_credenciais;
CREATE TRIGGER trg_producao_acesso_credenciais_updated
    BEFORE UPDATE ON producao_acesso_credenciais
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.5 producao_acesso_dispositivos ─────────────────────────────────────────
-- O aparelho da portaria. Não tem conta: o porteiro digita um código curto e
-- recebe um token que fica no aparelho.
CREATE TABLE IF NOT EXISTS producao_acesso_dispositivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    nome TEXT NOT NULL,                     -- "Portão A", "Maria"
    codigo_hash TEXT NOT NULL,              -- hash do código curto do porteiro
    token_hash TEXT,                        -- hash do token guardado no aparelho
    ultimo_visto TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ativo',   -- ativo | revogado
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_producao_acesso_dispositivos_updated ON producao_acesso_dispositivos;
CREATE TRIGGER trg_producao_acesso_dispositivos_updated
    BEFORE UPDATE ON producao_acesso_dispositivos
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.6 producao_acesso_dispositivo_setores ──────────────────────────────────
-- Em quais setores este aparelho valida entrada. Um aparelho lê só Pista, outro
-- só Camarote, outro todos.
--
-- Mexer aqui exige a senha do dono do evento, conferida na hora — é regra de
-- aplicação, não do banco.
CREATE TABLE IF NOT EXISTS producao_acesso_dispositivo_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    dispositivo_id UUID NOT NULL REFERENCES producao_acesso_dispositivos(id),
    setor_id UUID NOT NULL REFERENCES producao_acesso_setores(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Aqui a chave normal basta: os dois campos são NOT NULL.
    CONSTRAINT uq_acesso_dispositivo_setor UNIQUE (dispositivo_id, setor_id)
);

DROP TRIGGER IF EXISTS trg_producao_acesso_disp_setores_updated ON producao_acesso_dispositivo_setores;
CREATE TRIGGER trg_producao_acesso_disp_setores_updated
    BEFORE UPDATE ON producao_acesso_dispositivo_setores
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ── 1.7 producao_acesso_leituras ─────────────────────────────────────────────
-- Toda leitura, inclusive as negadas. É a base de todo relatório.
CREATE TABLE IF NOT EXISTS producao_acesso_leituras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    -- NOT NULL de propósito: toda leitura vem de um aparelho, e este campo faz
    -- parte da chave de idempotência lá embaixo. Nulo aqui desligaria a chave e
    -- deixaria a fila reenviada duplicar a lotação — exatamente o que ela existe
    -- para impedir.
    dispositivo_id UUID NOT NULL REFERENCES producao_acesso_dispositivos(id),
    credencial_id UUID REFERENCES producao_acesso_credenciais(id),  -- nulo se não bateu
    setor_id UUID REFERENCES producao_acesso_setores(id),
    -- Id que o APARELHO gerou no momento da leitura e nunca muda. É o que
    -- transforma reenvio em nada.
    id_local TEXT NOT NULL,
    momento TIMESTAMPTZ NOT NULL,           -- hora DO APARELHO (pode estar offline)
    recebido_em TIMESTAMPTZ DEFAULT now(),  -- hora do servidor
    tipo TEXT NOT NULL DEFAULT 'entrada',   -- entrada | saida
    resultado TEXT NOT NULL,                -- permitido | negado
    -- ja_entrou | setor_nao_autorizado | desconhecido | cancelado | fora_do_evento
    motivo TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- A CHAVE DE IDEMPOTÊNCIA. Sem ela, o celular que ficou três horas offline
    -- reenvia a fila, o servidor grava tudo de novo, e a lotação do relatório
    -- sai errada — justamente o número que o cliente pagou para ter.
    CONSTRAINT uq_acesso_leitura_do_aparelho UNIQUE (dispositivo_id, id_local)
);

DROP TRIGGER IF EXISTS trg_producao_acesso_leituras_updated ON producao_acesso_leituras;
CREATE TRIGGER trg_producao_acesso_leituras_updated
    BEFORE UPDATE ON producao_acesso_leituras
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. ÍNDICES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 2.1 As chaves únicas que dependem do empresa_id nulo ─────────────────────
-- Leia o comentário longo da seção 0 antes de mexer em qualquer uma destas três.

-- Um pedido só pode ser publicado uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_pedido
    ON producao_acesso_pedidos (producao_acesso_empresa(empresa_id), pedido_id_int);

-- Um modelo só pode virar setor em um evento: seria a mesma tiragem valendo em
-- duas portas. Parcial porque setor de staff não tem modelo, e vários nulos
-- conviveriam sem problema.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_setor_por_modelo
    ON producao_acesso_setores (producao_acesso_empresa(empresa_id), modelo_id)
    WHERE modelo_id IS NOT NULL;

-- A mesma credencial não pode ser gravada duas vezes. Também é o que torna a
-- publicação da faixa idempotente: reenviar o lote não duplica nada.
--
-- COLUNA SIMPLES, e não a expressão com empresa_id que as duas acima usam.
--
-- O hash já é único sem o empresa_id, e não por sorte: o sal é sorteado POR
-- PEDIDO, e número de pedido não se repete. Duas empresas nunca partiriam do
-- mesmo sal. Nas outras duas tabelas o empresa_id de fato separa, porque lá o
-- pedido e o modelo PODEM se repetir entre empresas.
--
-- NOTA HONESTA. A primeira versão deste comentário afirmava uma segunda razão:
-- que a publicação em lote, que usa `?on_conflict=codigo_hash`, quebraria com um
-- índice de duas expressões. **Isso foi testado contra o banco em 13/08/2026 e é
-- falso** — a gravação funcionou e três envios do mesmo lote deixaram uma linha
-- só. Ficou registrado aqui para ninguém repetir o raciocínio achando que é
-- conhecido. A coluna simples continua sendo a chave certa, pelo primeiro
-- motivo; só não é obrigatória pelo segundo.
--
-- Quem já rodou a versão anterior deste arquivo pode aplicar a migração
-- `schema_acesso_02_credencial_hash_unico.sql`, que só faz limpeza do índice
-- redundante.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acesso_credencial_hash_simples
    ON producao_acesso_credenciais (codigo_hash);

-- ── 2.2 Índices de consulta ──────────────────────────────────────────────────

-- O app baixa a faixa do evento por aqui.
CREATE INDEX IF NOT EXISTS idx_acesso_credencial_evento
    ON producao_acesso_credenciais (evento_id, setor_id);

-- O agente publica e a reivindicação carimba por aqui.
CREATE INDEX IF NOT EXISTS idx_acesso_credencial_pedido
    ON producao_acesso_credenciais (pedido_id_int, modelo_id, numero);

-- O feed ao vivo e os relatórios leem por aqui.
CREATE INDEX IF NOT EXISTS idx_acesso_leitura_evento
    ON producao_acesso_leituras (evento_id, momento DESC);

-- "Este ingresso já entrou?" é a pergunta mais feita do sistema.
CREATE INDEX IF NOT EXISTS idx_acesso_leitura_credencial
    ON producao_acesso_leituras (credencial_id, tipo);

-- Achar o evento do cliente, e o pedido pelo número.
CREATE INDEX IF NOT EXISTS idx_acesso_evento_cliente
    ON producao_acesso_eventos (id_cliente);
CREATE INDEX IF NOT EXISTS idx_acesso_evento_dono
    ON producao_acesso_eventos (dono_auth_id);
CREATE INDEX IF NOT EXISTS idx_acesso_pedido_evento
    ON producao_acesso_pedidos (evento_id);
CREATE INDEX IF NOT EXISTS idx_acesso_setor_evento
    ON producao_acesso_setores (evento_id);
CREATE INDEX IF NOT EXISTS idx_acesso_dispositivo_evento
    ON producao_acesso_dispositivos (evento_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. SEGURANÇA (RLS)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- RLS LIGADO E NENHUMA POLÍTICA. Isso não é esquecimento: é o desenho.
--
-- Com RLS ligado e zero políticas, ninguém que use a chave anônima ou uma conta
-- comum lê ou escreve uma linha sequer destas tabelas. Só a service_role passa,
-- e ela vive apenas no servidor do Render, nunca no navegador nem no celular —
-- como o docs/REGRAS_BANCO.md já exige.
--
-- É por isso que dá para ser tão restritivo sem quebrar nada: nenhuma tela fala
-- com estas tabelas diretamente. O app da portaria fala com o backend, o backend
-- fala com o banco. Se um dia alguém precisar ler daqui pelo navegador, é sinal
-- de que a arquitetura escorregou.
--
-- Isto NÃO reabre a decisão de 06/08/2026 de adiar o RLS das tabelas antigas.
-- Aquelas já têm tela lendo direto e exigem coordenação com o parceiro. Estas
-- nascem fechadas porque nascem sem ninguém lendo direto — é de graça.

ALTER TABLE producao_acesso_eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_pedidos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_setores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_credenciais          ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_dispositivos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_dispositivo_setores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_acesso_leituras             ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CONFERÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════
-- Esta consulta roda junto com o resto e fecha o script mostrando o resultado:
-- 7 linhas, todas com rowsecurity = true.
--
-- Ela fica DESCOMENTADA de propósito. Na primeira versão deste arquivo ela
-- estava comentada, o script terminou com "Success. No rows returned", e não
-- havia como saber se tinha dado certo — o que é o oposto do que uma seção
-- chamada "conferência" deve fazer. Só o bloco de desfazer, mais abaixo, é que
-- continua comentado: aquele apaga tabela.

SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE tablename LIKE 'producao_acesso_%'
 ORDER BY tablename;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
-- As tabelas nascem vazias e ninguém mais as usa, então apagar não perde dado de
-- ninguém. A ordem importa por causa das chaves estrangeiras — CASCADE resolve.
--
-- DROP TABLE IF EXISTS producao_acesso_leituras CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_dispositivo_setores CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_dispositivos CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_credenciais CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_setores CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_pedidos CASCADE;
-- DROP TABLE IF EXISTS producao_acesso_eventos CASCADE;
-- DROP FUNCTION IF EXISTS producao_acesso_empresa(UUID);
--
-- NÃO apague producao_update_updated_at(): ela é compartilhada com as tabelas de
-- catálogo, que continuariam precisando dela.
