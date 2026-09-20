-- Recuperacao pontual autorizada em 09/09/2026: "corrigir o possivel no pedido 21824".
-- Alvo: producao vwbtitjlpelrcnsytzqw, public.propostas, id_int = 21824, uma linha.
-- Fonte: audit.logs_v2.id = 335656, old_data anterior a conversao para Avulso.
-- Recupera quatro campos comprovados. Nao recria produtos/modelos nem instala
-- a migracao de Avulso. Preserva status operacional, total e demais campos.
-- Uso unico: os hashes recusam repeticao e qualquer edicao concorrente.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SET LOCAL application_name = 'recuperacao-parcial-pedido-21824';

DO $recuperacao$
DECLARE
    v_antes public.propostas%ROWTYPE;
    v_depois public.propostas%ROWTYPE;
    v_fonte public.propostas%ROWTYPE;
    v_fonte_json jsonb;
    v_hash_triggers text;
    v_linhas integer;
    v_auditorias integer;
BEGIN
    -- Compativel com escritas usuais, impede trocar triggers/schema no meio
    -- desta recuperacao. A linha do pedido tambem fica bloqueada para edicao.
    LOCK TABLE public.propostas IN ROW EXCLUSIVE MODE;
    SELECT * INTO STRICT v_antes FROM public.propostas WHERE id_int = 21824 FOR UPDATE;
    IF md5(to_jsonb(v_antes)::text) <> '7723623d444e2937be106d16965f566f' THEN
        RAISE EXCEPTION 'Pedido 21824 mudou desde a previa; nenhuma recuperacao aplicada';
    END IF;

    SELECT md5(coalesce(string_agg(
        t.tgname::text || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid)
        || ':' || p.prosrc, '|' ORDER BY t.tgname), ''))
      INTO v_hash_triggers FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'public.propostas'::regclass AND NOT t.tgisinternal;
    IF v_hash_triggers <> '091aaee1f6ea2633df3229ce609cd663' THEN
        RAISE EXCEPTION 'Triggers da proposta mudaram; revisar efeitos antes de recuperar';
    END IF;

    SELECT old_data INTO STRICT v_fonte_json FROM audit.logs_v2
     WHERE id = 335656 AND table_name = 'propostas' AND action = 'UPDATE'
       AND old_data->>'id_int' = '21824' AND new_data->>'id_int' = '21824'
       AND old_data->'is_avulso' = 'false'::jsonb
       AND new_data->'is_avulso' = 'true'::jsonb;
    IF md5(v_fonte_json::text) <> '3f2f88234844712ac8dba6a58ad9e1e8' THEN
        RAISE EXCEPTION 'Fonte historica diferente da revisada';
    END IF;
    SELECT * INTO v_fonte FROM jsonb_populate_record(NULL::public.propostas, v_fonte_json);

    UPDATE public.propostas
       SET is_avulso = v_fonte.is_avulso,
           valor = v_fonte.valor,
           texto_whatsapp = v_fonte.texto_whatsapp,
           frete_escolhido = v_fonte.frete_escolhido
     WHERE id_int = 21824 AND id = v_antes.id;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
        RAISE EXCEPTION 'Esperada exatamente uma proposta na recuperacao';
    END IF;

    SELECT * INTO STRICT v_depois FROM public.propostas WHERE id_int = 21824;
    IF v_depois.is_avulso IS DISTINCT FROM v_fonte.is_avulso
       OR v_depois.valor IS DISTINCT FROM v_fonte.valor
       OR v_depois.texto_whatsapp IS DISTINCT FROM v_fonte.texto_whatsapp
       OR v_depois.frete_escolhido IS DISTINCT FROM v_fonte.frete_escolhido THEN
        RAISE EXCEPTION 'Campos recuperados nao coincidem com a fonte';
    END IF;
    IF (to_jsonb(v_depois) - ARRAY['is_avulso','valor','texto_whatsapp','frete_escolhido','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(v_antes) - ARRAY['is_avulso','valor','texto_whatsapp','frete_escolhido','updated_at']) THEN
        RAISE EXCEPTION 'Alteracao fora dos quatro campos autorizados; revertendo';
    END IF;

    -- O registro nativo guarda o estado completo anterior para uma eventual
    -- reversao. Sem auditoria comprovada, a transacao nao e confirmada.
    SELECT count(*) INTO v_auditorias FROM audit.logs_v2
     WHERE table_name = 'propostas' AND action = 'UPDATE' AND txid = txid_current()
       AND old_data = to_jsonb(v_antes) - 'updated_at'
       AND new_data = to_jsonb(v_depois) - 'updated_at';
    IF v_auditorias <> 1 THEN
        RAISE EXCEPTION 'Auditoria da recuperacao ausente ou ambigua; revertendo';
    END IF;
END;
$recuperacao$;

COMMIT;

-- Validacao posterior em consulta separada: conferir os quatro campos com
-- old_data da auditoria 335656; conferir os demais com old_data da NOVA
-- auditoria desta recuperacao. Registrar o ID dessa auditoria no documento.
-- Reversao, se necessaria, deve recuperar somente os mesmos quatro campos
-- de old_data da NOVA auditoria, apos conferir que nao houve edicoes posteriores.
