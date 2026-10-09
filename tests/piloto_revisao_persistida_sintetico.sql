-- psql -X -v ON_ERROR_STOP=1 -d newprod_test_revisao -f tests/piloto_revisao_persistida_sintetico.sql
-- EXCLUSIVAMENTE banco descartavel vazio. Nao executar em producao.
\set ON_ERROR_STOP on
SELECT current_database() LIKE 'newprod_test_%' AS permitido \gset
\if :permitido
\else
  \echo 'Recusado: exige banco descartavel newprod_test_*'
  \quit 3
\endif
\ir piloto_snapshot_pedido_sintetico.sql
CREATE TABLE public.pedidos_artes(id bigint PRIMARY KEY,id_int integer);
CREATE TABLE public.producao_mapas_teatro(id uuid PRIMARY KEY,config jsonb);
ALTER TABLE storage.objects ADD COLUMN last_accessed_at timestamptz;
\ir ../sql/piloto_snapshot_pedido.sql
\ir ../sql/piloto_revisao_persistida_v2.sql

CREATE TEMP TABLE prova(revisao text);
INSERT INTO prova SELECT public.piloto_snapshot_pedido_v2('99','','test.supabase.co','')->>'revisao';
DO $$ DECLARE r jsonb; anterior text; BEGIN
  SELECT revisao INTO anterior FROM prova;
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',anterior);
  IF NOT (r->>'sem_mudanca')::boolean OR r ? 'snapshot' THEN RAISE EXCEPTION 'recibo nao compacto'; END IF;
  UPDATE public.pedidos_modelos SET quantidade=200 WHERE id=10;
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',anterior);
  IF (r->>'sem_mudanca')::boolean OR r->'snapshot'->'modelos'->0->>'quantidade'<>'200' THEN RAISE EXCEPTION 'modelo nao invalidou'; END IF;
  UPDATE prova SET revisao=r->>'revisao';
  INSERT INTO public.propostas VALUES('00000000-0000-0000-0000-000000000099',100,'EM PRODUCAO');
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova));
  IF NOT (r->>'sem_mudanca')::boolean THEN RAISE EXCEPTION 'outro pedido invalidou'; END IF;
  UPDATE public.producao_numeracoes SET elements='[{"type":"TEXT","text":"Novo"}]';
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova));
  IF (r->>'sem_mudanca')::boolean THEN RAISE EXCEPTION 'numerador nao invalidou'; END IF;
  UPDATE prova SET revisao=r->>'revisao';
  UPDATE storage.objects SET last_accessed_at=now();
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova));
  IF NOT (r->>'sem_mudanca')::boolean THEN RAISE EXCEPTION 'leitura do storage invalidou'; END IF;
  UPDATE storage.objects SET version='v2',metadata='{"eTag":"novo"}';
  r:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova));
  IF (r->>'sem_mudanca')::boolean THEN RAISE EXCEPTION 'mesma URL nao invalidou'; END IF;
  UPDATE prova SET revisao=r->>'revisao';
  IF has_function_privilege('anon','public.piloto_snapshot_pedido_v2(text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.piloto_snapshot_pedido_v2(text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'permissao indevida';
  END IF;
END $$;

-- Todas as fontes do snapshot precisam sinalizar mudancas.
BEGIN;
DO $$ DECLARE comando text; anterior text; BEGIN
  FOREACH comando IN ARRAY ARRAY[
    'UPDATE public.produtos_proposta SET id_produto=41 WHERE id=30',
    'UPDATE public.propostas SET status_interno=''ALTERADO'' WHERE id_int=99',
    'INSERT INTO public.propostas_os VALUES(''00000000-0000-0000-0000-000000000010'',99,now())',
    'UPDATE public.pedidos_bancos SET csv_data=''[["Novo"]]'' WHERE id_int=99',
    'UPDATE public.pedidos_modelos_banco SET csv_mapa=''{}'' WHERE modelo_id=''10''',
    'INSERT INTO public.pedidos_artes VALUES(1,99)',
    'UPDATE public.produtos SET setor_pcp=''Outro'' WHERE id=1',
    'INSERT INTO public.producao_mapas_teatro VALUES(''00000000-0000-0000-0000-000000000010'',''{}'')',
    'DELETE FROM public.pedidos_modelos_banco WHERE modelo_id=''10''',
    'UPDATE public.pedidos_modelos SET id_int=100 WHERE id=10',
    'UPDATE public.pedidos_modelos SET id_int=99 WHERE id=10',
    'DELETE FROM public.pedidos_modelos WHERE id=10'
  ] LOOP
    anterior:=public.piloto_snapshot_pedido_v2('99','','test.supabase.co','')->>'revisao';
    EXECUTE comando;
    IF (public.piloto_snapshot_pedido_v2('99','','test.supabase.co',anterior)->>'sem_mudanca')::boolean THEN
      RAISE EXCEPTION 'fonte nao invalidou: %',comando;
    END IF;
  END LOOP;
END $$;
ROLLBACK;

-- A mesma revisao deve funcionar sem sequer resolver a tabela de modelos.
BEGIN;
ALTER TABLE public.pedidos_modelos RENAME TO modelos_indisponiveis_no_teste;
DO $$ BEGIN
  IF NOT (public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova))->>'sem_mudanca')::boolean THEN
    RAISE EXCEPTION 'consultou snapshot no caminho rapido';
  END IF;
END $$;
ROLLBACK;

BEGIN;
UPDATE public.pedidos_modelos SET quantidade=300 WHERE id=10;
ROLLBACK;
DO $$ BEGIN
  IF NOT (public.piloto_snapshot_pedido_v2('99','','test.supabase.co',(SELECT revisao FROM prova))->>'sem_mudanca')::boolean THEN
    RAISE EXCEPTION 'rollback deixou sinal incorreto';
  END IF;
END $$;
\ir ../sql/piloto_revisao_persistida_v2_reverter.sql
SELECT public.piloto_snapshot_pedido('99','','test.supabase.co','')->>'pedido' AS v1_preservada;
