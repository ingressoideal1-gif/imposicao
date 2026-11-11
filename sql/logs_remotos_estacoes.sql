-- Preparacao local: aplicar somente com autorizacao no projeto de producao.
-- Snapshots substituiveis, no maximo seis arquivos por empresa/estacao.
BEGIN;
CREATE TABLE public.imposition_logs_estacoes (
    empresa text NOT NULL,
    estacao text NOT NULL,
    arquivo text NOT NULL CHECK (arquivo ~ '^agent\.log(\.[1-5])?$'),
    coletado_em timestamptz NOT NULL,
    recebido_em timestamptz NOT NULL DEFAULT now(),
    estado text NOT NULL CHECK (estado IN ('ausente','disponivel')),
    tamanho bigint NOT NULL CHECK (tamanho >= 0),
    parcial boolean NOT NULL,
    linhas jsonb NOT NULL CHECK (jsonb_typeof(linhas) = 'array' AND jsonb_array_length(linhas) <= 300 AND octet_length(linhas::text) <= 131072),
    PRIMARY KEY (empresa, estacao, arquivo)
);
ALTER TABLE public.imposition_logs_estacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imposition_logs_estacoes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.imposition_logs_estacoes TO service_role;
COMMIT;
-- Recuperacao: retirar as rotas enviar-logs/consultar-logs e a aba remota.
-- Nao apagar dados nem alterar tabelas comerciais. Agentes recuam ate 15 min.
