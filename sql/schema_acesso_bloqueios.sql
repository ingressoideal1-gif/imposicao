-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — Janela do setor e bloqueio de faixas de ingresso
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-14
-- Continua: sql/schema_acesso.sql
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   1. Acrescenta DUAS COLUNAS a producao_acesso_setores: `abre_em` e
--      `fecha_em`, a janela em que aquele setor vale na portaria.
--   2. Cria UMA TABELA nova, producao_acesso_bloqueios, vazia: faixas de
--      ingressos bloqueadas, cada uma com o motivo que a portaria vai ler.
--
--   Não apaga nada. Não altera coluna existente. Não toca em nada do parceiro
--   Vibecode. Pode ser rodado mais de uma vez sem estragar nada: todo comando é
--   IF NOT EXISTS ou OR REPLACE.
--
--   Como desfazer está no fim do arquivo.
--
-- COMO RODAR
--
--   Supabase → SQL Editor → cole TUDO → Run. Leva segundos.
--
-- POR QUE ELE EXISTE
--
--   Acontece na gráfica de verdade: um ponto de venda recebe 500 ingressos e não
--   paga. Um lote é roubado. Um lote sai com erro e é reimpresso. Hoje não há o
--   que fazer — os 500 códigos já estão publicados e a portaria os aceita.
--
--   O bloqueio resolve isso sem tocar nas credenciais: uma linha dizendo "do
--   ingresso 1000 ao 1500, motivo X". Na leitura, a portaria recusa e mostra o
--   motivo. Liberar o lote depois é apagar UMA linha, não corrigir quinhentas.
--
-- O QUE NUNCA ENTRA AQUI
--
--   Código em claro, como no schema_acesso.sql. Uma faixa é um intervalo de
--   `numero` — a POSIÇÃO do ingresso na tiragem, que o agente já grava em
--   producao_acesso_credenciais.numero. Nenhum código é necessário para
--   bloquear, e nenhum é guardado.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 0. FUNÇÕES UTILITÁRIAS (já existem; repetidas para este arquivo rodar sozinho)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION producao_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. A JANELA DO SETOR
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Quando aquele setor passa a valer, e quando deixa de valer.
--
-- TIMESTAMPTZ e não hora do dia. Um baile que abre às 22h de sábado e fecha às
-- 5h de domingo tem fim ANTES do início se a coluna guardar só "05:00", e a
-- portaria recusaria o evento inteiro. Guardando data e hora completas, virar a
-- meia-noite não é caso especial nenhum.
--
-- As duas nascem NULAS, e nulo quer dizer SEM LIMITE daquele lado. Isso é
-- deliberado: todo setor que já existe hoje continua valendo a qualquer hora,
-- exatamente como valia antes deste arquivo. Uma janela obrigatória fecharia a
-- portaria de todo evento já cadastrado no instante em que o script rodasse.

ALTER TABLE producao_acesso_setores
    ADD COLUMN IF NOT EXISTS abre_em  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_em TIMESTAMPTZ;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. producao_acesso_bloqueios
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Uma faixa de ingressos bloqueada, com o motivo.
--
-- TABELA, e não colunas no setor: um setor precisa de VÁRIAS faixas ao mesmo
-- tempo. Dois pontos de venda que não pagaram são duas faixas, com dois motivos
-- diferentes. Em coluna caberia uma só, e a segunda apagaria a primeira.
--
-- O bloqueio NÃO altera producao_acesso_credenciais. Cancelar credencial é
-- outra coisa (parte 3c). A diferença é prática e grande: liberar um lote de 500
-- ingressos aqui é uma linha; via credencial seriam 500 UPDATEs, e cada um deles
-- uma chance de parar no meio.

CREATE TABLE IF NOT EXISTS producao_acesso_bloqueios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    evento_id UUID NOT NULL REFERENCES producao_acesso_eventos(id),
    setor_id  UUID NOT NULL REFERENCES producao_acesso_setores(id),

    -- A faixa, inclusiva nos dois extremos: `de = ate = 7` bloqueia o ingresso
    -- 7 e mais nenhum. Inclusiva porque é assim que a pessoa fala — "do mil ao
    -- mil e quinhentos" inclui os dois —, e um intervalo meio aberto deixaria
    -- um ingresso passando na ponta sem ninguém entender por quê.
    de   INTEGER NOT NULL,
    ate  INTEGER NOT NULL,

    -- OBRIGATÓRIO, e essa é a razão de a tabela existir. Um bloqueio sem motivo
    -- aparece na portaria como "recusado" e ninguém sabe o que dizer para a
    -- pessoa que está na frente. O motivo é o que a portaria lê em voz alta.
    motivo TEXT NOT NULL,

    -- 'ativo' bloqueia; 'removido' é histórico. Liberar um lote NÃO apaga a
    -- linha: "liberamos o lote das 22h40" é informação que a portaria vai
    -- querer ter depois, e um DELETE a jogaria fora.
    status TEXT NOT NULL DEFAULT 'ativo',    -- ativo | removido

    criado_por UUID,                          -- auth.users.id do dono que bloqueou
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Faixa invertida é erro de digitação, não configuração. Sem esta trava,
    -- "de 1500 a 1000" entra calada e não bloqueia ingresso NENHUM — o pior
    -- resultado possível, porque o dono acha que bloqueou.
    CONSTRAINT producao_acesso_bloqueio_faixa_valida CHECK (de >= 1 AND ate >= de)
);

DROP TRIGGER IF EXISTS trg_producao_acesso_bloqueios_updated ON producao_acesso_bloqueios;
CREATE TRIGGER trg_producao_acesso_bloqueios_updated
    BEFORE UPDATE ON producao_acesso_bloqueios
    FOR EACH ROW EXECUTE FUNCTION producao_update_updated_at();


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ÍNDICES
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Os dois caminhos que existem: a tela do dono lista os bloqueios de um setor, e
-- o celular da portaria baixa os do evento inteiro de uma vez para conferir
-- offline.

CREATE INDEX IF NOT EXISTS idx_acesso_bloqueio_setor
    ON producao_acesso_bloqueios (setor_id, status);

CREATE INDEX IF NOT EXISTS idx_acesso_bloqueio_evento
    ON producao_acesso_bloqueios (evento_id, status);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Ligado e com ZERO políticas, igual às sete tabelas do schema_acesso.sql. Com a
-- chave anônima — que é pública e qualquer um lê no código-fonte do painel — não
-- se lê nem se escreve uma linha. Só a `service_role`, que vive no Render,
-- passa.
--
-- Isso importa mais aqui do que parece: quem conseguisse ESCREVER nesta tabela
-- bloquearia a tiragem inteira de um evento na véspera, e quem conseguisse
-- APAGAR liberaria o lote roubado.

ALTER TABLE producao_acesso_bloqueios ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. CONFERÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════
-- Roda junto com o resto e fecha o script mostrando o resultado. Descomentada de
-- propósito: um script que termina em "Success. No rows returned" não deixa
-- saber se deu certo.
--
-- Esperado: a primeira devolve 1 linha com rowsecurity = true; a segunda devolve
-- 2 linhas, abre_em e fecha_em.

SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE tablename = 'producao_acesso_bloqueios';

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'producao_acesso_setores'
   AND column_name IN ('abre_em', 'fecha_em')
 ORDER BY column_name;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
-- A tabela nasce vazia. As duas colunas nascem nulas em todo setor que já
-- existe, e nulo é o mesmo comportamento de antes — sem limite de horário.
-- Apagar não perde dado de ninguém ENQUANTO ninguém tiver bloqueado nada.
--
-- Depois que houver bloqueio gravado, apagar a tabela LIBERA os lotes
-- bloqueados. Confira antes:
--
--     SELECT count(*) FROM producao_acesso_bloqueios WHERE status = 'ativo';
--
-- Fica comentado de propósito — este bloco apaga tabela e coluna.
--
-- DROP TABLE IF EXISTS producao_acesso_bloqueios CASCADE;
-- ALTER TABLE producao_acesso_setores DROP COLUMN IF EXISTS abre_em;
-- ALTER TABLE producao_acesso_setores DROP COLUMN IF EXISTS fecha_em;
