-- Chave criada dentro do banco: nenhum valor é devolvido ou gravado em arquivo.
-- Não substitui uma chave preexistente. O ambiente Edge tem precedência sobre esta tabela.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $seguranca$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.imposition_segredos'::regclass)
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='imposition_segredos')
 OR has_table_privilege('anon','public.imposition_segredos','SELECT')
 OR has_table_privilege('authenticated','public.imposition_segredos','SELECT')
 OR NOT has_table_privilege('service_role','public.imposition_segredos','SELECT') THEN
  RAISE EXCEPTION 'Armazenamento de segredos nao atende as permissoes esperadas';
 END IF;
END;
$seguranca$;
INSERT INTO public.imposition_segredos(nome,valor)
VALUES ('IDEAL_CONTROL_PIN_CHAVE',encode(extensions.gen_random_bytes(32),'hex'))
ON CONFLICT (nome) DO NOTHING;
DO $validar$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.imposition_segredos
  WHERE nome='IDEAL_CONTROL_PIN_CHAVE' AND valor ~ '^[a-fA-F0-9]{64}$') THEN
  RAISE EXCEPTION 'Chave ausente ou formato invalido; nenhuma chave foi substituida';
 END IF;
END;
$validar$;
COMMIT;
SELECT nome, valor ~ '^[a-fA-F0-9]{64}$' AS formato_valido
FROM public.imposition_segredos WHERE nome='IDEAL_CONTROL_PIN_CHAVE';
