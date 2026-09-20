-- RASCUNHO: NAO APLICAR. Fluxo Avulso do Vibe ainda nao confirmado.
-- Em 09/09/2026 o usuario informou nao ter acesso ao codigo do ERP e orientou
-- "nao corra riscos". Aplicacao suspensa; regressao PostgreSQL nao executada.
-- Preserva os modelos e arquiva produtos removidos enquanto a proposta e avulsa.
-- Ao desmarcar is_avulso, restaura os produtos com os mesmos IDs e religa modelos.
-- Fonte: diagnostico de producao de 09/09/2026; ver registro na pasta docs.
-- Nao recupera exclusoes anteriores a instalacao. Nao executar como teste.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- O arquivo nao fica acessivel pela API publica. So as funcoes de trigger,
-- executadas pelo proprietario, podem guardar ou restaurar seu conteudo.
CREATE TABLE public.pedidos_produtos_avulsos_arquivo (
    produto_id bigint PRIMARY KEY,
    id_int integer NOT NULL,
    produto jsonb NOT NULL,
    variacoes jsonb NOT NULL DEFAULT '[]',
    modelos_ids bigint[] NOT NULL DEFAULT '{}',
    arquivado_em timestamptz NOT NULL DEFAULT now(),
    restaurado_em timestamptz,
    CHECK (produto->>'id' = produto_id::text),
    CHECK (produto->>'id_int' = id_int::text)
);
CREATE INDEX pedidos_produtos_avulsos_arquivo_pedido_idx
    ON public.pedidos_produtos_avulsos_arquivo (id_int)
    WHERE restaurado_em IS NULL;
ALTER TABLE public.pedidos_produtos_avulsos_arquivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_produtos_avulsos_arquivo FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.arquivar_produto_de_pedido_avulso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_avulso boolean;
    v_modelos bigint[];
    v_variacoes jsonb;
BEGIN
    -- Serializa com a transicao de is_avulso. Se a proposta foi excluida,
    -- nao impede a cascata da exclusao explicita do pedido inteiro.
    SELECT p.is_avulso INTO v_avulso
      FROM public.propostas p WHERE p.id_int = OLD.id_int FOR UPDATE;
    IF v_avulso IS NOT TRUE THEN
        RETURN OLD;
    END IF;

    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}'::bigint[])
      INTO v_modelos FROM public.pedidos_modelos m
     WHERE m.id_int = OLD.id_int AND m.id_produto_proposta_origem = OLD.id;

    SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id), '[]'::jsonb)
      INTO v_variacoes FROM public.produtos_proposta_variacao v
     WHERE v.id_produto_proposta = OLD.id;

    INSERT INTO public.pedidos_produtos_avulsos_arquivo
        (produto_id, id_int, produto, variacoes, modelos_ids, arquivado_em, restaurado_em)
    VALUES (OLD.id, OLD.id_int, to_jsonb(OLD), v_variacoes, v_modelos, now(), NULL)
    ON CONFLICT (produto_id) DO UPDATE
       SET id_int = EXCLUDED.id_int, produto = EXCLUDED.produto,
           variacoes = EXCLUDED.variacoes, modelos_ids = EXCLUDED.modelos_ids,
           arquivado_em = EXCLUDED.arquivado_em,
           restaurado_em = NULL;
    RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.arquivar_produto_de_pedido_avulso() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.restaurar_produtos_ao_desmarcar_avulso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_arquivo record;
    v_existente jsonb;
    v_colunas text;
    v_selecao text;
    v_variacao jsonb;
    v_variacao_colunas text;
    v_variacao_selecao text;
BEGIN
    IF OLD.is_avulso IS NOT TRUE OR NEW.is_avulso IS TRUE THEN
        RETURN NEW;
    END IF;

    -- Omite colunas geradas (peso_total). Nao perde campos do produto e nao
    -- avanca a sequencia: restaura IDs que ja foram alocados anteriormente.
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
           string_agg(format('r.%I', a.attname), ', ' ORDER BY a.attnum)
      INTO v_colunas, v_selecao
      FROM pg_attribute a
     WHERE a.attrelid = 'public.produtos_proposta'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
           string_agg(format('r.%I', a.attname), ', ' ORDER BY a.attnum)
      INTO v_variacao_colunas, v_variacao_selecao
      FROM pg_attribute a
     WHERE a.attrelid = 'public.produtos_proposta_variacao'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

    FOR v_arquivo IN
        SELECT a.* FROM public.pedidos_produtos_avulsos_arquivo a
         WHERE a.id_int = NEW.id_int AND a.restaurado_em IS NULL
         ORDER BY a.produto_id FOR UPDATE
    LOOP
        SELECT to_jsonb(p) INTO v_existente FROM public.produtos_proposta p
         WHERE p.id = v_arquivo.produto_id FOR UPDATE;
        IF FOUND THEN
            -- Nao sobrescreve uma reutilizacao/alteracao conflitante do ID.
            IF (v_existente - 'updated_at' - 'peso_total') IS DISTINCT FROM
               (v_arquivo.produto - 'updated_at' - 'peso_total') THEN
                RAISE EXCEPTION 'Produto % conflita com o arquivo do pedido %',
                    v_arquivo.produto_id, NEW.id_int USING ERRCODE = '23505';
            END IF;
        ELSE
            EXECUTE format(
                'INSERT INTO public.produtos_proposta (%s) OVERRIDING SYSTEM VALUE '
                'SELECT %s FROM jsonb_populate_record(NULL::public.produtos_proposta, $1) r',
                v_colunas, v_selecao)
            USING v_arquivo.produto;
        END IF;

        FOR v_variacao IN SELECT value FROM jsonb_array_elements(v_arquivo.variacoes)
        LOOP
            SELECT to_jsonb(v) INTO v_existente FROM public.produtos_proposta_variacao v
             WHERE v.id = (v_variacao->>'id')::bigint FOR UPDATE;
            IF FOUND THEN
                IF (v_existente - 'updated_at') IS DISTINCT FROM
                   (v_variacao - 'updated_at') THEN
                    RAISE EXCEPTION 'Variacao % conflita com o arquivo do pedido %',
                        v_variacao->>'id', NEW.id_int USING ERRCODE = '23505';
                END IF;
            ELSE
                EXECUTE format(
                    'INSERT INTO public.produtos_proposta_variacao (%s) '
                    'OVERRIDING SYSTEM VALUE SELECT %s FROM '
                    'jsonb_populate_record(NULL::public.produtos_proposta_variacao, $1) r',
                    v_variacao_colunas, v_variacao_selecao)
                USING v_variacao;
            END IF;
        END LOOP;

        -- Religa somente os modelos originais deste pedido, sem trocar o
        -- produto de um modelo que tenha sido associado a outro manualmente.
        UPDATE public.pedidos_modelos m
           SET id_produto_proposta_origem = v_arquivo.produto_id
         WHERE m.id_int = NEW.id_int AND m.id = ANY(v_arquivo.modelos_ids)
           AND m.id_produto_proposta_origem IS NULL;
        UPDATE public.pedidos_produtos_avulsos_arquivo
           SET restaurado_em = now() WHERE produto_id = v_arquivo.produto_id;
    END LOOP;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurar_produtos_ao_desmarcar_avulso() FROM PUBLIC, anon, authenticated;

-- Exige exatamente a FK conhecida. Uma estrutura diferente interrompe a
-- transacao, em vez de remover uma constraint desconhecida.
DO $check$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.pedidos_modelos'::regclass
           AND conname = 'fk_pedidos_modelos_produtos_proposta'
           AND contype = 'f' AND confrelid = 'public.produtos_proposta'::regclass
           AND confdeltype IN ('c', 'n')
    ) THEN
        RAISE EXCEPTION 'FK de origem do modelo diferente da estrutura revisada';
    END IF;
END;
$check$;
ALTER TABLE public.pedidos_modelos
    DROP CONSTRAINT fk_pedidos_modelos_produtos_proposta;
ALTER TABLE public.pedidos_modelos
    ADD CONSTRAINT fk_pedidos_modelos_produtos_proposta
    FOREIGN KEY (id_produto_proposta_origem)
    REFERENCES public.produtos_proposta(id) ON DELETE SET NULL;

CREATE TRIGGER trg_arquivar_produto_de_pedido_avulso
    BEFORE DELETE ON public.produtos_proposta
    FOR EACH ROW EXECUTE FUNCTION public.arquivar_produto_de_pedido_avulso();
CREATE TRIGGER trg_restaurar_produtos_ao_desmarcar_avulso
    AFTER UPDATE OF is_avulso ON public.propostas
    FOR EACH ROW
    WHEN (OLD.is_avulso IS TRUE AND NEW.is_avulso IS NOT TRUE)
    EXECUTE FUNCTION public.restaurar_produtos_ao_desmarcar_avulso();

COMMIT;
