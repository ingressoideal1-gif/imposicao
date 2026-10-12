-- Ideal Control: preparar localmente; não aplicar automaticamente em produção.
-- Requer schema_acesso_zeramento_atomico.sql. Não apaga nem reclassifica histórico.
-- Ordem de entrega: SQL, Edge Functions (portaria, acesso-conta e acesso-interno),
-- frontend e atualização dos leitores/PWA. Conferir as versões antes de operar.
-- Recuperação: manter adições
-- e restaurar a versão anterior da aplicação; não remover identidade durante evento.
-- Filas offline são reconciliadas com permissões/bloqueios vigentes no envio;
-- a janela de horário usa o instante informado pela leitura offline. O resultado
-- observado no aparelho permanece em resultado_aparelho/motivo_aparelho; o resultado
-- canônico do servidor alimenta as métricas. Nenhum deles comprova presença física.
BEGIN;

ALTER TABLE public.producao_acesso_entradas_unicas ADD COLUMN IF NOT EXISTS id_local text;
ALTER TABLE public.producao_acesso_leituras ADD COLUMN IF NOT EXISTS resultado_aparelho text;
ALTER TABLE public.producao_acesso_leituras ADD COLUMN IF NOT EXISTS motivo_aparelho text;
ALTER TABLE public.producao_acesso_leituras ADD COLUMN IF NOT EXISTS identidade_leitura jsonb;
CREATE INDEX IF NOT EXISTS idx_acesso_entradas_cursor
 ON public.producao_acesso_entradas_unicas(evento_id, credencial_id);

CREATE OR REPLACE FUNCTION public.producao_acesso_registrar_leituras(
 p_dispositivo uuid, p_itens jsonb, p_online boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
 a public.producao_acesso_dispositivos%ROWTYPE;
 e public.producao_acesso_eventos%ROWTYPE;
 c public.producao_acesso_credenciais%ROWTYPE;
 s public.producao_acesso_setores%ROWTYPE;
 antiga public.producao_acesso_leituras%ROWTYPE;
 reserva public.producao_acesso_entradas_unicas%ROWTYPE;
 item jsonb; respostas jsonb := '[]'; anterior jsonb;
 cid uuid; sid uuid; local_id text; instante timestamptz; hora_regra timestamptz;
 resultado text; motivo text; portao text; motivo_bloqueio text;
BEGIN
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens)>500 THEN
  RAISE EXCEPTION 'Lote inválido' USING ERRCODE='22023';
 END IF;
 SELECT * INTO a FROM public.producao_acesso_dispositivos WHERE id=p_dispositivo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aparelho indisponível' USING ERRCODE='42501'; END IF;
 -- Mesma ordem de lock do zeramento. Leituras de aparelhos distintos podem
 -- concorrer; a PK da reserva decide quem ganhou. Um aparelho serializa seus reenvios.
 SELECT * INTO e FROM public.producao_acesso_eventos WHERE id=a.evento_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento indisponível' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.producao_acesso_dispositivos WHERE id=p_dispositivo FOR UPDATE;
 IF a.status IS DISTINCT FROM 'ativo' OR a.evento_id IS DISTINCT FROM e.id THEN
  RAISE EXCEPTION 'Aparelho indisponível' USING ERRCODE='42501';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  local_id := item->>'id_local'; instante := (item->>'momento')::timestamptz;
  cid := nullif(item->>'credencial_id','')::uuid; sid := nullif(item->>'setor_id','')::uuid;
  resultado := item->>'resultado'; motivo := item->>'motivo'; anterior := NULL;
  IF local_id IS NULL OR length(local_id) NOT BETWEEN 1 AND 128 OR instante IS NULL
     OR NOT isfinite(instante) OR resultado IS NULL OR resultado NOT IN ('permitido','negado') THEN
   RAISE EXCEPTION 'Leitura inválida' USING ERRCODE='22023';
  END IF;
  -- O corte é verificado antes da identidade: uma fila anterior ao zeramento
  -- deve ser confirmada sem recriar reservas ou contadores.
  IF e.entradas_zeradas_em IS NOT NULL AND instante<=e.entradas_zeradas_em THEN
   respostas := respostas || jsonb_build_array(jsonb_build_object('id_local',local_id,
     'zerada',true,'resultado','negado','motivo','erro_de_leitura','primeira',false));
   CONTINUE;
  END IF;
  SELECT * INTO antiga FROM public.producao_acesso_leituras
   WHERE dispositivo_id=a.id AND id_local=local_id;
  IF FOUND THEN
   -- Resultado pode ter sido reconciliado pelo servidor. A identidade é o
   -- instante e o ingresso/setor; reenviar uma decisão local não a substitui.
   IF antiga.evento_id IS DISTINCT FROM e.id OR antiga.momento IS DISTINCT FROM instante THEN
    RAISE EXCEPTION 'Identidade da leitura reutilizada' USING ERRCODE='22023';
   END IF;
   -- Referências inválidas são armazenadas como nulas; a decisão original
   -- continua em resultado_aparelho/motivo_aparelho para auditoria.
   IF (antiga.identidade_leitura IS NOT NULL AND antiga.identidade_leitura IS DISTINCT FROM
        jsonb_build_object('credencial_id',cid,'setor_id',sid))
      OR (antiga.credencial_id IS NOT NULL AND antiga.credencial_id IS DISTINCT FROM cid)
      OR (antiga.setor_id IS NOT NULL AND antiga.setor_id IS DISTINCT FROM sid) THEN
    RAISE EXCEPTION 'Identidade da leitura reutilizada' USING ERRCODE='22023';
   END IF;
   respostas := respostas || jsonb_build_array(jsonb_build_object('id_local',local_id,
     'resultado',antiga.resultado,'motivo',antiga.motivo,'primeira',antiga.resultado='permitido','reenvio',true));
   CONTINUE;
  END IF;
  SELECT * INTO c FROM public.producao_acesso_credenciais
   WHERE id=cid AND evento_id=e.id FOR SHARE;
  IF NOT FOUND THEN
   cid := NULL; sid := NULL; resultado := 'negado'; motivo := 'desconhecido';
  ELSE
   SELECT * INTO s FROM public.producao_acesso_setores
    WHERE id=sid AND id=c.setor_id AND evento_id=e.id FOR SHARE;
   IF NOT FOUND THEN
    sid := NULL; resultado := 'negado'; motivo := 'erro_de_leitura';
   ELSIF resultado='permitido' THEN
    hora_regra := CASE WHEN p_online THEN clock_timestamp() ELSE instante END;
    IF e.status IS DISTINCT FROM 'ativo' THEN resultado:='negado'; motivo:='evento_inativo';
    ELSIF c.status IS DISTINCT FROM 'ativo' THEN resultado:='negado'; motivo:='desconhecido';
    ELSIF NOT EXISTS(SELECT 1 FROM public.producao_acesso_dispositivo_setores
                     WHERE dispositivo_id=a.id AND setor_id=s.id) THEN
     resultado:='negado'; motivo:='setor_nao_autorizado';
    ELSIF s.status IS DISTINCT FROM 'ativo' OR coalesce(s.bloqueado,false) THEN
     resultado:='negado'; motivo:='setor_bloqueado';
    ELSIF (s.abre_em IS NOT NULL AND hora_regra<s.abre_em)
       OR (s.fecha_em IS NOT NULL AND hora_regra>s.fecha_em) THEN
     resultado:='negado'; motivo:='fora_da_janela';
    ELSE
     SELECT b.motivo INTO motivo_bloqueio FROM public.producao_acesso_bloqueios b
      WHERE b.evento_id=e.id AND b.setor_id=s.id AND b.status='ativo'
        AND c.numero BETWEEN b.de AND b.ate LIMIT 1;
     IF FOUND THEN resultado:='negado'; motivo:='bloqueado'; END IF;
    END IF;
   END IF;
  END IF;
  IF resultado='permitido' THEN
   motivo := NULL;
   IF s.tipo_uso IS DISTINCT FROM 'reentrada' THEN
    INSERT INTO public.producao_acesso_entradas_unicas
     (credencial_id,evento_id,setor_id,dispositivo_id,momento,id_local)
     VALUES(cid,e.id,s.id,a.id,instante,local_id) ON CONFLICT(credencial_id) DO NOTHING;
    SELECT * INTO reserva FROM public.producao_acesso_entradas_unicas WHERE credencial_id=cid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reserva não confirmada'; END IF;
    IF reserva.evento_id IS DISTINCT FROM e.id OR reserva.setor_id IS DISTINCT FROM s.id
       OR reserva.dispositivo_id IS DISTINCT FROM a.id OR reserva.id_local IS DISTINCT FROM local_id THEN
     resultado:='negado'; motivo:='ja_entrou';
     SELECT nome INTO portao FROM public.producao_acesso_dispositivos WHERE id=reserva.dispositivo_id;
     anterior:=jsonb_build_object('momento',reserva.momento,'portao',coalesce(portao,'outro aparelho'));
    END IF;
   END IF;
  END IF;
  INSERT INTO public.producao_acesso_leituras
   (evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,tipo,resultado,motivo,resultado_aparelho,motivo_aparelho,identidade_leitura)
   VALUES(e.id,a.id,cid,sid,local_id,instante,'entrada',resultado,motivo,item->>'resultado',item->>'motivo',
     jsonb_build_object('credencial_id',nullif(item->>'credencial_id','')::uuid,'setor_id',nullif(item->>'setor_id','')::uuid));
  respostas:=respostas || jsonb_build_array(jsonb_build_object('id_local',local_id,
   'resultado',resultado,'motivo',motivo,'primeira',resultado='permitido','anterior',anterior));
 END LOOP;
 UPDATE public.producao_acesso_dispositivos SET ultimo_visto=clock_timestamp() WHERE id=a.id;
 RETURN respostas;
END $$;

-- Totais exatos; o limite do histograma nunca limita setores nem recusas.
CREATE OR REPLACE FUNCTION public.producao_acesso_metricas(p_evento uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH leituras AS (
  SELECT l.*, c.origem FROM public.producao_acesso_leituras l
  LEFT JOIN public.producao_acesso_credenciais c ON c.id=l.credencial_id AND c.evento_id=l.evento_id
  WHERE l.evento_id=p_evento
 ), setores AS (
  SELECT setor_id,count(*) FILTER(WHERE resultado='permitido' AND tipo='entrada') passagens,
    count(DISTINCT credencial_id) FILTER(WHERE resultado='permitido' AND tipo='entrada') utilizados
  FROM leituras GROUP BY setor_id
 ), motivos AS (
  SELECT motivo,count(*) quantas FROM leituras WHERE resultado='negado' GROUP BY motivo
 ) SELECT jsonb_build_object(
  'entraram',count(*) FILTER(WHERE resultado='permitido' AND tipo='entrada'),
  'sairam',count(*) FILTER(WHERE resultado='permitido' AND tipo='saida'),
  'recusadas',count(*) FILTER(WHERE resultado='negado'),
  'ingressos_utilizados',count(DISTINCT credencial_id) FILTER(WHERE resultado='permitido' AND tipo='entrada'),
  'publicados_utilizados',count(DISTINCT credencial_id) FILTER(WHERE resultado='permitido' AND tipo='entrada' AND origem='qr_ideal'),
  'por_setor',coalesce((SELECT jsonb_agg(to_jsonb(setores)) FROM setores),'[]'::jsonb),
  'recusas',coalesce((SELECT jsonb_agg(to_jsonb(motivos)) FROM motivos),'[]'::jsonb)
 ) FROM leituras;
$$;

REVOKE ALL ON FUNCTION public.producao_acesso_registrar_leituras(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.producao_acesso_metricas(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_registrar_leituras(uuid,jsonb,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.producao_acesso_metricas(uuid) TO service_role;
COMMIT;
