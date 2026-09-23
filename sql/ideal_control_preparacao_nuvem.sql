-- Preparação privada, sem alterar publicação já concluída nem códigos impressos.
-- Aplicar em transação. Recuperação: voltar a função portaria anterior; os hashes
-- preparados permanecem compatíveis com NewProd. Não excluir credenciais em uso.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ideal-control-master', 'ideal-control-master', false, 24000000,
        ARRAY['application/octet-stream'])
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='ideal-control-master' AND NOT public)
  THEN RAISE EXCEPTION 'O bucket da base deve ser privado'; END IF;
END $$;

-- Defesa também contra políticas permissivas de outros buckets. service_role
-- mantém o acesso; usuários do painel/PWA não podem ler, listar ou alterar a base.
CREATE POLICY ideal_control_master_privado ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id <> 'ideal-control-master')
WITH CHECK (bucket_id <> 'ideal-control-master');

CREATE TABLE public.producao_acesso_preparacoes (
  pedido_id_int integer PRIMARY KEY,
  evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id),
  fonte_hash text NOT NULL,
  plano jsonb NOT NULL,
  proximo integer NOT NULL DEFAULT 0 CHECK (proximo >= 0),
  total integer NOT NULL CHECK (total > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (proximo <= total)
);
ALTER TABLE public.producao_acesso_preparacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_preparacoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.producao_acesso_preparacoes TO service_role;

CREATE FUNCTION public.producao_acesso_fonte_preparacao(p_pedido integer, p_evento uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',m.id,'quantidade',m.quantidade,'inicio',coalesce(m.numeracao_inicio,1),
   'setor',(SELECT s.id FROM public.producao_acesso_setores s
     WHERE s.pedido_id_int=p_pedido AND s.modelo_id=m.id AND s.evento_id=p_evento),
   'numeracao',CASE WHEN n.id IS NULL THEN NULL ELSE jsonb_build_object(
     'elements',n.elements,'tipo',to_jsonb(n)->'tipo','ticket_qtd',to_jsonb(n)->'ticket_qtd') END
 ) ORDER BY m.id),'[]'::jsonb)
 FROM public.pedidos_modelos m LEFT JOIN public.producao_numeracoes n
 ON n.id::text=m.amostra_num_id::text WHERE m.id_int=p_pedido;
$$;

-- Inicialização e persistência de cada lote são serializadas na linha do pedido.
-- O cursor avança na MESMA transação dos hashes. Repetição/concorrência é segura.
CREATE FUNCTION public.producao_acesso_preparar_lote(
 p_evento uuid, p_pedido integer, p_fonte_hash text DEFAULT NULL,
 p_plano jsonb DEFAULT NULL, p_offset integer DEFAULT NULL, p_itens jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 p public.producao_acesso_pedidos%ROWTYPE;
 j public.producao_acesso_preparacoes%ROWTYPE;
 fonte jsonb; assinatura text; item jsonb; modelo jsonb; esperado jsonb;
 qtd integer; total_plano integer; cursor_modelo integer; contador integer;
BEGIN
 SELECT * INTO STRICT p FROM public.producao_acesso_pedidos
 WHERE pedido_id_int=p_pedido AND evento_id=p_evento FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM public.producao_acesso_eventos WHERE id=p_evento AND status='ativo')
 THEN RAISE EXCEPTION 'Evento inativo'; END IF;
 IF p.publicado_em IS NOT NULL AND p.total_credenciais > 0 THEN
   RETURN jsonb_build_object('concluida',true,'prontos',p.total_credenciais,'total',p.total_credenciais);
 END IF;
 fonte := public.producao_acesso_fonte_preparacao(p_pedido,p_evento);
 assinatura := md5(fonte::text);
 IF p_fonte_hash IS NOT NULL AND p_fonte_hash <> assinatura THEN
   RAISE EXCEPTION 'O pedido mudou durante a preparação. Leia novamente o QR.';
 END IF;
 SELECT * INTO j FROM public.producao_acesso_preparacoes WHERE pedido_id_int=p_pedido;
 IF FOUND AND (j.fonte_hash <> assinatura OR j.evento_id <> p_evento) THEN
   RAISE EXCEPTION 'A numeração mudou após iniciar a preparação. Peça à gráfica para conferir.';
 END IF;
 IF j.pedido_id_int IS NULL AND p_plano IS NOT NULL THEN
   IF jsonb_typeof(p_plano)<>'array' OR jsonb_array_length(p_plano)=0 THEN RAISE EXCEPTION 'Plano vazio'; END IF;
   SELECT sum((v->>'quantidade')::integer) INTO total_plano FROM jsonb_array_elements(p_plano) v;
   IF total_plano IS NULL OR total_plano<1 THEN RAISE EXCEPTION 'Tiragem inválida'; END IF;
   INSERT INTO public.producao_acesso_preparacoes(pedido_id_int,evento_id,fonte_hash,plano,total)
   VALUES(p_pedido,p_evento,assinatura,p_plano,total_plano) RETURNING * INTO j;
 END IF;
 IF j.pedido_id_int IS NOT NULL AND p_itens IS NOT NULL THEN
   IF p_offset IS DISTINCT FROM j.proximo THEN
     RETURN jsonb_build_object('concluida',false,'prontos',j.proximo,'total',j.total);
   END IF;
   qtd := jsonb_array_length(p_itens);
   IF qtd<1 OR qtd>100 OR j.proximo+qtd>j.total THEN RAISE EXCEPTION 'Lote inválido'; END IF;
   contador := j.proximo;
   FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
     cursor_modelo := 0; esperado := NULL;
     FOR modelo IN SELECT value FROM jsonb_array_elements(j.plano) LOOP
       IF contador < cursor_modelo+(modelo->>'quantidade')::integer THEN
         esperado := jsonb_build_object('modelo',modelo->'modelo','setor',modelo->'setor',
                       'numero',contador-cursor_modelo+1); EXIT;
       END IF;
       cursor_modelo := cursor_modelo+(modelo->>'quantidade')::integer;
     END LOOP;
     IF esperado IS NULL OR item->>'modelo' IS DISTINCT FROM esperado->>'modelo'
       OR item->>'numero' IS DISTINCT FROM esperado->>'numero'
       OR coalesce(item->>'hash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Ingresso fora do plano'; END IF;
     IF EXISTS (SELECT 1 FROM public.producao_acesso_credenciais c
       WHERE c.pedido_id_int=p_pedido AND c.modelo_id=(esperado->>'modelo')::integer
       AND c.numero=(esperado->>'numero')::integer
       AND (c.codigo_hash<>item->>'hash' OR c.evento_id IS DISTINCT FROM p_evento
            OR c.setor_id IS DISTINCT FROM (esperado->>'setor')::uuid))
     THEN RAISE EXCEPTION 'Credencial existente incompatível; conferir numeração na gráfica'; END IF;
     INSERT INTO public.producao_acesso_credenciais(pedido_id_int,modelo_id,numero,codigo_hash,evento_id,setor_id,origem)
     VALUES(p_pedido,(esperado->>'modelo')::integer,(esperado->>'numero')::integer,
            item->>'hash',p_evento,(esperado->>'setor')::uuid,'qr_ideal')
     ON CONFLICT (chave_dedup) DO NOTHING;
     contador := contador+1;
   END LOOP;
   UPDATE public.producao_acesso_preparacoes SET proximo=contador,atualizado_em=now()
   WHERE pedido_id_int=p_pedido RETURNING * INTO j;
 END IF;
 IF j.proximo=j.total THEN
   SELECT count(*) INTO qtd FROM public.producao_acesso_credenciais WHERE pedido_id_int=p_pedido;
   IF qtd<>j.total THEN RAISE EXCEPTION 'Quantidade de credenciais incompatível'; END IF;
   UPDATE public.producao_acesso_pedidos SET publicado_em=clock_timestamp(),total_credenciais=qtd
   WHERE id=p.id;
 END IF;
 RETURN jsonb_build_object('concluida',coalesce(j.proximo=j.total,false),
   'prontos',coalesce(j.proximo,0),'total',j.total,'fonte',fonte,'fonte_hash',assinatura,
   'plano',j.plano,'sal',p.sal);
END $$;
REVOKE ALL ON FUNCTION public.producao_acesso_fonte_preparacao(integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.producao_acesso_preparar_lote(uuid,integer,text,jsonb,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_fonte_preparacao(integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.producao_acesso_preparar_lote(uuid,integer,text,jsonb,integer,jsonb) TO service_role;
COMMIT;
