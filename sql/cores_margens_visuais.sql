-- Preparado para revisão; não executar automaticamente em produção.
-- Somente metadados visuais de producao_cores. Não altera formatos ou pedidos.
-- Os NULLs preservam os cadastros anteriores, sem inferir ou migrar medidas.
BEGIN;
ALTER TABLE public.producao_cores
    ADD COLUMN IF NOT EXISTS margem_esquerda_mm double precision,
    ADD COLUMN IF NOT EXISTS margem_direita_mm double precision,
    ADD COLUMN IF NOT EXISTS margem_superior_mm double precision,
    ADD COLUMN IF NOT EXISTS margem_inferior_mm double precision;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.producao_cores'::regclass
          AND conname = 'producao_cores_margens_visuais_validas') THEN
        ALTER TABLE public.producao_cores ADD CONSTRAINT producao_cores_margens_visuais_validas CHECK (
            (margem_esquerda_mm IS NULL AND margem_direita_mm IS NULL
             AND margem_superior_mm IS NULL AND margem_inferior_mm IS NULL)
            OR
            (margem_esquerda_mm IS NOT NULL AND margem_direita_mm IS NOT NULL
             AND margem_superior_mm IS NOT NULL AND margem_inferior_mm IS NOT NULL
             AND margem_esquerda_mm >= 0 AND margem_esquerda_mm < 'Infinity'::double precision
             AND margem_direita_mm >= 0 AND margem_direita_mm < 'Infinity'::double precision
             AND margem_superior_mm >= 0 AND margem_superior_mm < 'Infinity'::double precision
             AND margem_inferior_mm >= 0 AND margem_inferior_mm < 'Infinity'::double precision)
        );
    END IF;
END $$;
COMMIT;

-- Validação posterior autorizada: conferir quatro colunas e a constraint;
-- criar/editar uma Cor de teste aprovada, reler margens e dimensões, e verificar
-- que producao_formatos e os dados da imposição não foram alterados.
-- Recuperação: reverter a aplicação mantendo as colunas; não apagar margens.
