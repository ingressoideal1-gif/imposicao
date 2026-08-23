-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: a HORA em que cada modelo ficou "Pronto" no acabamento
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Pedido do usuario em 23/08/2026: "Modelos prontos devem indicar a hora em que
-- ficaram prontos". Hoje `pedidos_modelos.acabamento_status` guarda o estagio e
-- nada sobre QUANDO ele foi marcado.
--
-- `updated_at` nao serve, pelo mesmo motivo da data do Impresso
-- (`sql/data_do_status_impresso.sql`): ela muda em qualquer gravacao do modelo —
-- foto do material, responsavel, cor, observacao — e nao so na conclusao.
--
-- ── O QUE ESTE ARQUIVO FAZ ──
--
--   1. cria `pedidos_modelos.acabamento_pronto_em` (timestamptz);
--   2. cria um gatilho que a carimba sozinho quando `acabamento_status` PASSA a
--      "Pronto", e a apaga quando o modelo SAI de "Pronto".
--
-- NAO preenche historico, e isso e deliberado. A hora aparece no card de cada
-- modelo, ao lado do estagio: uma hora aproximada, tirada de `updated_at`,
-- seria lida como se fosse a de verdade pelo operador que esta de pe na
-- estacao. Modelo marcado Pronto antes desta migracao simplesmente nao mostra
-- hora nenhuma — o que e verdade, porque ninguem a registrou. Daqui para a
-- frente todas sao exatas.
--
-- POR QUE UM GATILHO, E NAO O CODIGO DA TELA
-- O mesmo motivo do Impresso: o Painel do Acabamento grava daqui e da estacao,
-- e o ERP do parceiro tambem mexe na tabela. No banco o carimbo vale para todos
-- os caminhos, inclusive os que ainda nao existem.
--
-- Rodar este arquivo duas vezes nao faz mal: as duas etapas sao idempotentes.

-- ─── Antes: o retrato de agora ──────────────────────────────────────────────

SELECT
    COUNT(*)                                                              AS modelos,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(acabamento_status, ''))) = 'PRONTO') AS prontos
FROM pedidos_modelos;


-- ─── 1. A coluna ────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos_modelos
    ADD COLUMN IF NOT EXISTS acabamento_pronto_em timestamptz;

COMMENT ON COLUMN public.pedidos_modelos.acabamento_pronto_em IS
    'Instante em que acabamento_status passou a Pronto. Carimbada pelo gatilho trg_carimba_acabamento_pronto_em, nunca pela tela. Volta a NULL quando o modelo sai de Pronto. O Painel do Acabamento mostra esta hora no card do modelo.';


-- ─── 2. O gatilho que carimba ───────────────────────────────────────────────
--
-- Mesmo desenho do `carimba_status_impressao_em`: BEFORE (grava junto, sem um
-- segundo UPDATE), escutando SO a coluna do estagio, e agindo apenas quando o
-- valor MUDA — regravar o mesmo "Pronto" (o operador que reabre o card e clica
-- de novo no botao que ja estava aceso) nao pode renovar a hora.

CREATE OR REPLACE FUNCTION public.carimba_acabamento_pronto_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    agora_pronto boolean;
    antes_pronto boolean;
BEGIN
    agora_pronto := UPPER(BTRIM(COALESCE(NEW.acabamento_status, ''))) = 'PRONTO';

    IF TG_OP = 'INSERT' THEN
        IF agora_pronto AND NEW.acabamento_pronto_em IS NULL THEN
            NEW.acabamento_pronto_em := now();
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.acabamento_status IS DISTINCT FROM OLD.acabamento_status THEN
        antes_pronto := UPPER(BTRIM(COALESCE(OLD.acabamento_status, ''))) = 'PRONTO';
        IF agora_pronto AND NOT antes_pronto THEN
            NEW.acabamento_pronto_em := now();
        ELSIF NOT agora_pronto THEN
            -- Voltou para Aguardando, Impresso ou Em acabamento: a hora deixa de
            -- existir, para o card nao mostrar uma conclusao que foi desfeita.
            NEW.acabamento_pronto_em := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.carimba_acabamento_pronto_em() IS
    'Mantem pedidos_modelos.acabamento_pronto_em em dia sozinha, venha a gravacao do site, da estacao ou do ERP do parceiro.';

DROP TRIGGER IF EXISTS trg_carimba_acabamento_pronto_em ON public.pedidos_modelos;

CREATE TRIGGER trg_carimba_acabamento_pronto_em
    BEFORE INSERT OR UPDATE OF acabamento_status ON public.pedidos_modelos
    FOR EACH ROW
    EXECUTE FUNCTION public.carimba_acabamento_pronto_em();


-- ─── Depois: conferencia ────────────────────────────────────────────────────

SELECT
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(acabamento_status, ''))) = 'PRONTO') AS prontos,
    COUNT(acabamento_pronto_em)                                                      AS com_hora,
    COUNT(*) FILTER (WHERE UPPER(BTRIM(COALESCE(acabamento_status, ''))) <> 'PRONTO'
                       AND acabamento_pronto_em IS NOT NULL)                         AS hora_sobrando
FROM pedidos_modelos;
