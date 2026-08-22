-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: a DATA em que cada modelo virou "Impresso"
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Pedido do usuario em 22/08/2026: no Painel de Producao, o botao "IMPRESSO"
-- deve listar os pedidos do mais RECENTE ao mais ANTIGO, pela data do status
-- Impresso. Hoje o banco guarda o status ("Impresso") e nao guarda QUANDO ele
-- foi marcado — nao havia como ordenar por isso.
--
-- `updated_at` NAO serve para esse fim, e a conferencia de 22/08/2026 mostrou
-- por que: de 129 modelos impressos, 57 estavam com `updated_at` nulo, e a
-- coluna muda em qualquer gravacao do modelo (troca de cor, de gabarito, de
-- observacao), nao so na impressao. Ordenar por ela poria no topo o pedido que
-- alguem abriu por ultimo, e nao o que saiu por ultimo da impressora.
--
-- ── O QUE ESTE ARQUIVO FAZ ──
--
--   1. cria `pedidos_modelos.status_impressao_em` (timestamptz);
--   2. cria um gatilho que a carimba sozinho quando `status_impressao` PASSA a
--      "Impresso", e a apaga quando o modelo SAI de "Impresso";
--   3. preenche o historico do que ja estava impresso antes de hoje.
--
-- `pedidos_modelos` e tabela DO Imposition (ver docs/REGRAS_BANCO.md) — foi
-- nela que entraram `status_impressao` e as tres colunas `acabamento_*`. A
-- regra de ouro que proibe ALTER TABLE vale para as tabelas do parceiro, e esta
-- nao e uma delas.
--
-- POR QUE UM GATILHO, E NAO O CODIGO DA TELA
-- Quem marca "Impresso" nao e so o painel: e o `updateItemImpressao` do site, e
-- o caminho `/api/os_itens` do agente local, e o ERP do parceiro pela tela dele.
-- Carimbar no frontend deixaria de fora dois desses tres, e a lista sairia com
-- buracos exatamente nos pedidos que a grafica tocou pela estacao. No banco, o
-- carimbo vale para todos os caminhos, inclusive os que ainda nao existem.
--
-- Rodar este arquivo duas vezes nao faz mal: as tres etapas sao idempotentes.

-- ─── Antes: o retrato de agora ──────────────────────────────────────────────

SELECT
    COUNT(*)                                                                    AS modelos,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(status_impressao, ''))) = 'IMPRESSO') AS impressos
FROM pedidos_modelos;


-- ─── 1. A coluna ────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos_modelos
    ADD COLUMN IF NOT EXISTS status_impressao_em timestamptz;

COMMENT ON COLUMN public.pedidos_modelos.status_impressao_em IS
    'Instante em que status_impressao passou a Impresso. Carimbada pelo gatilho trg_carimba_status_impressao_em, nunca pela tela. Volta a NULL quando o modelo sai de Impresso. O Painel de Producao ordena por ela a lista do botao IMPRESSO.';


-- ─── 2. O gatilho que carimba ───────────────────────────────────────────────
--
-- `BEFORE`, e nao `AFTER`: assim o valor entra na MESMA gravacao, sem um segundo
-- UPDATE e sem risco de recursao.
--
-- So age quando o status MUDA (`IS DISTINCT FROM`). Isso importa por dois
-- motivos: uma regravacao do mesmo "Impresso" — que acontece toda vez que
-- alguem reabre o seletor e escolhe o que ja estava la — nao pode empurrar o
-- pedido de volta ao topo da lista; e o preenchimento do historico, la embaixo,
-- passa sem o gatilho desfazer o que ele acabou de escrever.
--
-- `search_path` fixo e `SECURITY INVOKER` (o padrao): a funcao roda com o
-- privilegio de quem gravou, e nao ha como um esquema plantado no caminho
-- trocar o `now()` por outra coisa.

CREATE OR REPLACE FUNCTION public.carimba_status_impressao_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    agora_impresso boolean;
    antes_impresso boolean;
BEGIN
    agora_impresso := UPPER(BTRIM(COALESCE(NEW.status_impressao, ''))) = 'IMPRESSO';

    IF TG_OP = 'INSERT' THEN
        IF agora_impresso AND NEW.status_impressao_em IS NULL THEN
            NEW.status_impressao_em := now();
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status_impressao IS DISTINCT FROM OLD.status_impressao THEN
        antes_impresso := UPPER(BTRIM(COALESCE(OLD.status_impressao, ''))) = 'IMPRESSO';
        IF agora_impresso AND NOT antes_impresso THEN
            NEW.status_impressao_em := now();
        ELSIF NOT agora_impresso THEN
            -- Saiu de Impresso (voltou para Aguardando, Parcial ou Revisao):
            -- a data deixa de existir, para o pedido nao reaparecer na lista
            -- dos impressos com uma data velha.
            NEW.status_impressao_em := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.carimba_status_impressao_em() IS
    'Mantem pedidos_modelos.status_impressao_em em dia sozinha, venha a gravacao do site, do agente local ou do ERP do parceiro.';

DROP TRIGGER IF EXISTS trg_carimba_status_impressao_em ON public.pedidos_modelos;

CREATE TRIGGER trg_carimba_status_impressao_em
    BEFORE INSERT OR UPDATE OF status_impressao ON public.pedidos_modelos
    FOR EACH ROW
    EXECUTE FUNCTION public.carimba_status_impressao_em();


-- ─── 3. O historico ─────────────────────────────────────────────────────────
--
-- Quem ja estava impresso antes de hoje nao tem data de verdade — ela nao
-- existia. O melhor palpite disponivel e `updated_at`, e onde ele e nulo (57 dos
-- 129 impressos, em 22/08/2026) sobra `created_at`. E aproximado, e assumido:
-- serve para o historico nao sair todo empilhado no fim da lista. Daqui para a
-- frente a data e exata, porque quem a escreve e o gatilho.
--
-- Este UPDATE nao mexe em `status_impressao`, entao o gatilho (que so escuta
-- essa coluna) nao dispara e nao desfaz o preenchimento.

UPDATE pedidos_modelos
SET status_impressao_em = COALESCE(updated_at, created_at)
WHERE UPPER(BTRIM(COALESCE(status_impressao, ''))) = 'IMPRESSO'
  AND status_impressao_em IS NULL;


-- ─── Depois: conferencia ────────────────────────────────────────────────────

SELECT
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(status_impressao, ''))) = 'IMPRESSO') AS impressos,
    COUNT(status_impressao_em)                                                        AS com_data,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(status_impressao, ''))) <> 'IMPRESSO'
                       AND status_impressao_em IS NOT NULL)                           AS data_sobrando,
    MIN(status_impressao_em)                                                          AS mais_antiga,
    MAX(status_impressao_em)                                                          AS mais_recente
FROM pedidos_modelos;
