-- Preparar antes de atualizar os consumidores. A coluna nula preserva os contratos existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(23063, 12);

ALTER TABLE public.producao_acesso_qr_contratos
    ADD COLUMN posicoes integer[],
    ADD CONSTRAINT qr12_posicoes_ticket CHECK (
        posicoes IS NULL OR (versao=2 AND array_ndims(posicoes)=1 AND array_lower(posicoes,1)=1
          AND cardinality(posicoes) BETWEEN 2 AND passo AND posicoes[1]=posicao
          AND array_position(posicoes,NULL) IS NULL AND 1<=ALL(posicoes) AND passo>=ALL(posicoes))
    );

COMMIT;
