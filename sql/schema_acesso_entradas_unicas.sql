-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — a tabela que decide a corrida entre dois portoes
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-16
-- Spec: docs/superpowers/specs/2026-08-16-tela-de-leitura-design.md (secao 6)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Cria UMA tabela nova, vazia, e um indice. Nao apaga nada, nao altera
--   coluna nenhuma, nao toca em tabela que ja existe. Pode ser rodado mais de
--   uma vez: todo comando e IF NOT EXISTS.
--
-- COMO RODAR
--
--   Supabase -> SQL Editor -> cole TUDO -> Run. Leva menos de um segundo.
--
-- POR QUE ELE EXISTE
--
--   O celular do portao sincroniza a cada cinco minutos. Cinco minutos e tempo
--   de sobra para a mesma pessoa dar a volta e tentar entrar pela outra porta
--   com o mesmo ingresso. Enquanto ha sinal, quem fecha essa porta dupla e o
--   servidor -- e o jeito honesto de fechar e DECIDIR quem chegou primeiro, e
--   nao apenas responder uma pergunta.
--
-- POR QUE A DECISAO E DO BANCO, E NAO DE DUAS CONSULTAS
--
--   Perguntar "ja existe entrada para este ingresso?" e, se nao existe, gravar,
--   sao DUAS operacoes. Dois portoes lendo o mesmo QR no mesmo segundo fazem as
--   duas perguntas antes de qualquer uma das duas gravacoes: os dois ouvem
--   "nao existe", os dois gravam, e os dois deixam entrar. E o pior resultado
--   possivel, porque ninguem percebe.
--
--   Com `credencial_id` como CHAVE PRIMARIA, gravar e perguntar viram uma
--   operacao so: o `INSERT ... ON CONFLICT DO NOTHING` grava para o primeiro e
--   nao faz nada para o segundo. Quem perde a corrida le a linha que ficou e
--   descobre a hora e o portao que ganharam.
--
-- POR QUE UMA TABELA PROPRIA, E NAO UM INDICE UNICO NAS LEITURAS
--
--   producao_acesso_leituras guarda TODA leitura -- a que entrou, a recusada, e
--   a de setor que permite sair e voltar. Um indice unico por credencial ali
--   impediria a reentrada de acontecer, que e justamente o que aquele tipo de
--   setor vende.
--
--   Aqui so entra o setor de ENTRADA UNICA (`tipo_uso` diferente de
--   'reentrada'). Para setor de reentrada nao existe "primeira entrada", entao
--   nao existe corrida, e nada e escrito nesta tabela.
--
-- O QUE NUNCA ENTRA AQUI
--
--   Codigo em claro, pela mesma razao do schema_acesso.sql. `credencial_id` e o
--   id da linha em producao_acesso_credenciais; o codigo do ingresso nao e
--   guardado em lugar nenhum do banco.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. producao_acesso_entradas_unicas
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS producao_acesso_entradas_unicas (
    -- A chave primaria E o mecanismo, nao um detalhe de modelagem. Ver o
    -- cabecalho: e ela que transforma "confere e grava" em uma operacao so.
    -- Uma linha por credencial, e a primeira que chegar e a que fica.
    credencial_id  UUID PRIMARY KEY,

    -- De qual evento foi a entrada. Serve ao indice do sincronismo, que baixa
    -- as entradas do evento inteiro para os outros aparelhos.
    evento_id      UUID NOT NULL,

    -- As tres colunas abaixo existem para quem PERDE a corrida. Sem elas, a
    -- recusa que o porteiro tem para dizer e "nao sei, o sistema nao deixou".
    -- Com elas, ele diz em qual portao e a que horas a pessoa ja entrou.
    --
    -- Nulo e possivel de proposito: o aparelho pode ter sido apagado depois, e
    -- perder a linha inteira por causa de uma chave estrangeira seria perder a
    -- prova de que a pessoa entrou.
    setor_id       UUID,
    dispositivo_id UUID,
    momento        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. INDICE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O unico caminho de leitura que existe: a rota leve de sincronismo pede "as
-- entradas deste evento desde tal hora", a cada cinco minutos, de cada aparelho
-- de portao. Sem o indice, isso e uma varredura da tabela inteira do evento
-- justamente na hora em que a fila esta andando.

CREATE INDEX IF NOT EXISTS idx_entradas_unicas_evento
    ON producao_acesso_entradas_unicas (evento_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Ligado e com ZERO politicas, igual as sete tabelas do schema_acesso.sql. Com
-- a chave anonima -- que e publica e qualquer um le no codigo-fonte do painel
-- -- nao se le nem se escreve uma linha aqui. So a `service_role`, que vive nas
-- Edge Functions, passa.
--
-- Isso importa: quem conseguisse ESCREVER nesta tabela barraria na porta quem
-- pagou, e quem conseguisse APAGAR liberaria o ingresso ja usado para entrar de
-- novo.

ALTER TABLE producao_acesso_entradas_unicas ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CONFERENCIA
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Esperado: rowsecurity = true, e as cinco colunas do item 1.

SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE tablename = 'producao_acesso_entradas_unicas';

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'producao_acesso_entradas_unicas'
 ORDER BY ordinal_position;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A tabela nasce vazia; apagar agora nao perde dado de ninguem. DEPOIS do
-- evento comecar, cada linha e uma pessoa que ja entrou -- apagar libera todos
-- esses ingressos para entrar de novo. Confira antes:
--
--     SELECT count(*) FROM producao_acesso_entradas_unicas;
--
-- Fica comentado de proposito: este arquivo se cola inteiro no editor, e um
-- comando solto aqui apagaria a tabela no mesmo Run que a criou.
--
--     DROP TABLE IF EXISTS producao_acesso_entradas_unicas CASCADE;
--
-- ══════════════════════════════════════════════════════════════════════════════
