-- Revisao derivada nunca foi ativada/emitida. Troca somente o controle privado;
-- a base nova e aleatoria e independente dos instaladores historicos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(23063,12);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.producao_acesso_qr_contratos WHERE versao=2)
  OR NOT EXISTS(SELECT 1 FROM public.producao_acesso_qr_controle
    WHERE id=true AND ativo=false AND pool_revisao='ideal-qr12-d1')
 THEN RAISE EXCEPTION 'Estado da emissao mudou; revisar antes de trocar a base'; END IF;
END $$;
UPDATE public.producao_acesso_qr_controle SET pool_revisao='ideal-qr12-1'
 WHERE id=true AND ativo=false AND pool_revisao='ideal-qr12-d1'
 RETURNING id,ativo,pool_revisao;
ALTER TABLE public.producao_acesso_qr_controle ALTER COLUMN pool_revisao SET DEFAULT 'ideal-qr12-1';
COMMIT;
