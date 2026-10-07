-- Historico operacional separado dos pedidos. Aplicar uma vez, em transacao.
BEGIN;
CREATE TABLE IF NOT EXISTS public.imposition_historico_impressao (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa text NOT NULL,
    estacao text NOT NULL,
    instalacao uuid NOT NULL,
    seq bigint NOT NULL CHECK (seq > 0),
    trabalho uuid NOT NULL,
    quando timestamptz NOT NULL,
    recebido_em timestamptz NOT NULL DEFAULT now(),
    codigo text NOT NULL,
    nivel text NOT NULL,
    impressora text,
    spool_id bigint,
    contexto jsonb NOT NULL,
    dados jsonb NOT NULL,
    UNIQUE (empresa, estacao, instalacao, seq, quando),
    CHECK (octet_length(contexto::text) <= 16384),
    CHECK (octet_length(dados::text) <= 4096)
);
CREATE INDEX IF NOT EXISTS historico_impressao_empresa_id ON public.imposition_historico_impressao(empresa, id DESC);
CREATE INDEX IF NOT EXISTS historico_impressao_estacao_id ON public.imposition_historico_impressao(empresa, estacao, id DESC);
CREATE INDEX IF NOT EXISTS historico_impressao_contexto ON public.imposition_historico_impressao USING gin(contexto jsonb_path_ops);
ALTER TABLE public.imposition_historico_impressao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_historico_impressao FROM anon, authenticated;
GRANT SELECT, INSERT ON public.imposition_historico_impressao TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.imposition_historico_impressao_id_seq TO service_role;
COMMIT;
-- Recuperacao sem excluir historico: retirar a funcao historico-impressao da
-- liberacao. O agente preserva eventos locais e tenta novamente com backoff.
