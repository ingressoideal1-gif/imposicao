-- Correção local revisável, separada da distribuição. Não aplicar automaticamente.
-- Serializa os dois pontos de entrada ANTES de obter locks das linhas.
-- Preserva funções, validações e propagação atômica de verso já existentes.
BEGIN;
CREATE FUNCTION public.imposition_travar_verso_antes_linhas_20261031()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    -- Chave exclusiva deste contrato; distinta da distribuição (731031,1).
    -- Reentrante quando catálogo atualiza modelos na mesma transação.
    PERFORM pg_advisory_xact_lock(731031,2);
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.imposition_travar_verso_antes_linhas_20261031() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER aaa_imposition_verso_antes_linhas_20261031
BEFORE INSERT OR UPDATE OF amostra_num_id, verso_tipo, frente_verso
ON public.pedidos_modelos FOR EACH STATEMENT
EXECUTE FUNCTION public.imposition_travar_verso_antes_linhas_20261031();
CREATE TRIGGER aaa_imposition_verso_antes_linhas_20261031
BEFORE UPDATE OF print_mode ON public.producao_numeracoes FOR EACH STATEMENT
EXECUTE FUNCTION public.imposition_travar_verso_antes_linhas_20261031();
COMMIT;
