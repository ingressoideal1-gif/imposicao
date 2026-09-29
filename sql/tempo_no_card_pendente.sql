-- Produção: public.imposition_tempo_no_card.
-- Ajuste de contrato: aceitar a etapa pendente já emitida pelo frontend.
-- Não altera linhas, permissões, índices nem as regras dos relógios.
-- Prévia: guardar esta definição antes da aplicação.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.imposition_tempo_no_card'::regclass
  AND conname = 'imposition_tempo_no_card_card_check';

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.imposition_tempo_no_card
  DROP CONSTRAINT imposition_tempo_no_card_card_check;
ALTER TABLE public.imposition_tempo_no_card
  ADD CONSTRAINT imposition_tempo_no_card_card_check
  CHECK (card IN ('fila', 'pendente', 'aprovacao', 'aprovados', 'concluidos'));
COMMIT;

-- Validação posterior: conferir as cinco etapas na definição.
SELECT conname, pg_get_constraintdef(oid), convalidated
FROM pg_constraint
WHERE conrelid = 'public.imposition_tempo_no_card'::regclass
  AND conname = 'imposition_tempo_no_card_card_check';
-- Depois de abrir o painel autenticado e atualizar, conferir os relógios novos:
SELECT card, count(*) FROM public.imposition_tempo_no_card GROUP BY card;
-- Recuperação sem perda de dados: antes do COMMIT usar ROLLBACK.
-- Após COMMIT, manter a restrição ampliada é compatível com o frontend anterior.
-- Não remover 'pendente' se houver linhas nessa etapa: não apagar nem converter
-- relógios para fazer rollback. Restaurar a definição anterior apenas após
-- verificar SELECT count(*) FROM public.imposition_tempo_no_card WHERE card = 'pendente';
-- e obter zero (ou revisar uma migração específica para os dados existentes).
