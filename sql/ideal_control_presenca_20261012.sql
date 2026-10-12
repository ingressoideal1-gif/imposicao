-- Entrada/saida online. Historico existente e preservado; a ultima entrada
-- registrada continua contando como dentro ate uma saida confirmada.
BEGIN;
CREATE TABLE IF NOT EXISTS public.producao_acesso_presencas (
 credencial_id uuid PRIMARY KEY REFERENCES public.producao_acesso_credenciais(id) ON DELETE CASCADE,
 evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id) ON DELETE CASCADE,
 setor_id uuid NOT NULL REFERENCES public.producao_acesso_setores(id),
 dentro boolean NOT NULL,
 versao uuid NOT NULL DEFAULT gen_random_uuid(),
 zeramento timestamptz,
 atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.producao_acesso_presencas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_presencas FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.producao_acesso_presencas TO service_role;
CREATE INDEX IF NOT EXISTS idx_acesso_presencas_evento ON public.producao_acesso_presencas(evento_id);
CREATE INDEX IF NOT EXISTS idx_acesso_leitura_presenca ON public.producao_acesso_leituras(credencial_id,momento DESC) WHERE resultado='permitido';
-- Recibo tambem para o popup: repetir uma consulta nunca vira nova entrada
-- depois que outro portao registrou uma saida.
CREATE TABLE IF NOT EXISTS public.producao_acesso_movimentos_recibos (
 dispositivo_id uuid NOT NULL REFERENCES public.producao_acesso_dispositivos(id) ON DELETE CASCADE,
 id_local text NOT NULL,
 evento_id uuid NOT NULL REFERENCES public.producao_acesso_eventos(id) ON DELETE CASCADE,
 identidade jsonb NOT NULL, momento timestamptz NOT NULL, zeramento timestamptz,
 resposta jsonb NOT NULL,
 PRIMARY KEY(dispositivo_id,id_local)
);
ALTER TABLE public.producao_acesso_movimentos_recibos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producao_acesso_movimentos_recibos FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.producao_acesso_movimentos_recibos TO service_role;

CREATE OR REPLACE FUNCTION public.producao_acesso_movimento(p_dispositivo uuid,p_item jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 a public.producao_acesso_dispositivos%ROWTYPE;
 e public.producao_acesso_eventos%ROWTYPE;
 c public.producao_acesso_credenciais%ROWTYPE;
 s public.producao_acesso_setores%ROWTYPE;
 p public.producao_acesso_presencas%ROWTYPE;
 l public.producao_acesso_leituras%ROWTYPE;
 recibo public.producao_acesso_movimentos_recibos%ROWTYPE;
 resposta_mov jsonb;
 cid uuid; sid uuid; local_id text; instante timestamptz; acao text; esperado uuid;
 identidade jsonb; tipo_mov text; motivo_neg text; resultado_mov text; inicial boolean;
BEGIN
 cid:=(p_item->>'credencial_id')::uuid; sid:=(p_item->>'setor_id')::uuid;
 local_id:=p_item->>'id_local'; instante:=(p_item->>'momento')::timestamptz;
 acao:=p_item->>'acao'; esperado:=nullif(p_item->>'versao','')::uuid;
 IF cid IS NULL OR sid IS NULL OR local_id IS NULL OR length(local_id) NOT BETWEEN 1 AND 128
    OR instante IS NULL OR NOT isfinite(instante) OR acao IS NULL OR acao NOT IN ('auto','entrada','saida')
    OR (acao<>'auto' AND esperado IS NULL) THEN
  RAISE EXCEPTION 'Movimento invalido' USING ERRCODE='22023';
 END IF;
 SELECT * INTO a FROM public.producao_acesso_dispositivos WHERE id=p_dispositivo;
 SELECT * INTO e FROM public.producao_acesso_eventos WHERE id=a.evento_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento indisponivel' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.producao_acesso_dispositivos WHERE id=p_dispositivo FOR UPDATE;
 IF a.status IS DISTINCT FROM 'ativo' OR a.evento_id IS DISTINCT FROM e.id THEN
  RAISE EXCEPTION 'Aparelho indisponivel' USING ERRCODE='42501';
 END IF;
 identidade:=jsonb_build_object('credencial_id',cid,'setor_id',sid,'acao',acao,'versao',esperado,'protocolo','presenca-v1');
 SELECT * INTO recibo FROM public.producao_acesso_movimentos_recibos WHERE dispositivo_id=a.id AND id_local=local_id;
 IF FOUND THEN
  IF recibo.evento_id IS DISTINCT FROM e.id OR recibo.momento IS DISTINCT FROM instante OR recibo.identidade IS DISTINCT FROM identidade THEN
   RAISE EXCEPTION 'Identidade reutilizada' USING ERRCODE='22023';
  END IF;
  IF recibo.zeramento IS DISTINCT FROM e.entradas_zeradas_em THEN
   RETURN jsonb_build_object('id_local',local_id,'resultado','negado','motivo','estado_alterado','zerada',true);
  END IF;
  IF recibo.resposta->>'resultado'='permitido' AND NOT EXISTS(
     SELECT 1 FROM public.producao_acesso_presencas WHERE credencial_id=cid AND versao::text=recibo.resposta->>'versao') THEN
   RETURN jsonb_build_object('id_local',local_id,'resultado','negado','motivo','estado_alterado','reenvio',true);
  END IF;
  RETURN recibo.resposta || jsonb_build_object('reenvio',true);
 END IF;
 -- O zeramento invalida inclusive respostas antigas ainda em voo.
 IF e.entradas_zeradas_em IS NOT NULL AND instante<=e.entradas_zeradas_em THEN
  RETURN jsonb_build_object('id_local',local_id,'resultado','negado','motivo','estado_alterado','zerada',true);
 END IF;
 SELECT * INTO l FROM public.producao_acesso_leituras WHERE dispositivo_id=a.id AND id_local=local_id;
 IF FOUND THEN
  IF l.evento_id IS DISTINCT FROM e.id OR l.momento IS DISTINCT FROM instante OR l.identidade_leitura IS DISTINCT FROM identidade THEN
   RAISE EXCEPTION 'Identidade reutilizada' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('id_local',local_id,'resultado',l.resultado,'motivo',l.motivo,'tipo',l.tipo,'reenvio',true);
 END IF;
 -- Serializacao por ingresso, inclusive entre portoes diferentes.
 SELECT * INTO c FROM public.producao_acesso_credenciais WHERE id=cid AND evento_id=e.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ingresso indisponivel' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.producao_acesso_setores WHERE id=sid AND id=c.setor_id AND evento_id=e.id FOR SHARE;
 IF NOT FOUND OR s.tipo_uso IS DISTINCT FROM 'reentrada' THEN
  RETURN jsonb_build_object('id_local',local_id,'resultado','negado','motivo','estado_alterado');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.producao_acesso_dispositivo_setores WHERE dispositivo_id=a.id AND setor_id=s.id) THEN
  RETURN jsonb_build_object('id_local',local_id,'resultado','negado','motivo','setor_nao_autorizado');
 END IF;
 SELECT * INTO p FROM public.producao_acesso_presencas WHERE credencial_id=cid;
 IF NOT FOUND OR p.zeramento IS DISTINCT FROM e.entradas_zeradas_em THEN
  SELECT tipo='entrada' INTO inicial FROM public.producao_acesso_leituras
   WHERE credencial_id=cid AND evento_id=e.id AND resultado='permitido'
    AND (e.entradas_zeradas_em IS NULL OR momento>e.entradas_zeradas_em)
   ORDER BY momento DESC,id DESC LIMIT 1;
  INSERT INTO public.producao_acesso_presencas(credencial_id,evento_id,setor_id,dentro,zeramento)
   VALUES(cid,e.id,s.id,coalesce(inicial,false),e.entradas_zeradas_em)
   ON CONFLICT(credencial_id) DO UPDATE SET dentro=EXCLUDED.dentro,zeramento=EXCLUDED.zeramento,
    versao=gen_random_uuid(),atualizado_em=clock_timestamp()
   RETURNING * INTO p;
 END IF;
 IF acao='auto' AND p.dentro THEN
  resposta_mov:=jsonb_build_object('id_local',local_id,'resultado','confirmar','versao',p.versao,'dentro',true);
  INSERT INTO public.producao_acesso_movimentos_recibos VALUES(a.id,local_id,e.id,identidade,instante,e.entradas_zeradas_em,resposta_mov);
  RETURN resposta_mov;
 END IF;
 tipo_mov:=CASE WHEN acao='saida' THEN 'saida' ELSE 'entrada' END;
 IF acao<>'auto' AND esperado IS DISTINCT FROM p.versao THEN motivo_neg:='estado_alterado';
 ELSIF tipo_mov='entrada' AND p.dentro THEN motivo_neg:='ja_no_local';
 ELSIF tipo_mov='saida' AND NOT p.dentro THEN motivo_neg:='ja_fora_local';
 -- Saida de quem esta dentro permanece registravel apos bloqueio/fechamento.
 ELSIF tipo_mov='entrada' THEN
  IF e.status IS DISTINCT FROM 'ativo' THEN motivo_neg:='evento_inativo';
  ELSIF c.status IS DISTINCT FROM 'ativo' THEN motivo_neg:='desconhecido';
  ELSIF s.status IS DISTINCT FROM 'ativo' OR coalesce(s.bloqueado,false) THEN motivo_neg:='setor_bloqueado';
  ELSIF (s.abre_em IS NOT NULL AND clock_timestamp()<s.abre_em) OR (s.fecha_em IS NOT NULL AND clock_timestamp()>s.fecha_em) THEN motivo_neg:='fora_da_janela';
  ELSIF EXISTS(SELECT 1 FROM public.producao_acesso_bloqueios WHERE evento_id=e.id AND setor_id=s.id AND status='ativo' AND c.numero BETWEEN de AND ate) THEN motivo_neg:='bloqueado';
  END IF;
 END IF;
 resultado_mov:=CASE WHEN motivo_neg IS NULL THEN 'permitido' ELSE 'negado' END;
 INSERT INTO public.producao_acesso_leituras(evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,tipo,resultado,motivo,resultado_aparelho,identidade_leitura)
  VALUES(e.id,a.id,cid,sid,local_id,instante,tipo_mov,resultado_mov,motivo_neg,'permitido',identidade);
 IF resultado_mov='permitido' THEN
  UPDATE public.producao_acesso_presencas SET dentro=(tipo_mov='entrada'),versao=gen_random_uuid(),atualizado_em=clock_timestamp() WHERE credencial_id=cid RETURNING * INTO p;
 END IF;
 UPDATE public.producao_acesso_dispositivos SET ultimo_visto=clock_timestamp() WHERE id=a.id;
 resposta_mov:=jsonb_build_object('id_local',local_id,'resultado',resultado_mov,'motivo',motivo_neg,'tipo',tipo_mov,'versao',p.versao);
 INSERT INTO public.producao_acesso_movimentos_recibos VALUES(a.id,local_id,e.id,identidade,instante,e.entradas_zeradas_em,resposta_mov);
 RETURN resposta_mov;
END $$;
REVOKE ALL ON FUNCTION public.producao_acesso_movimento(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.producao_acesso_movimento(uuid,jsonb) TO service_role;

-- As definicoes das RPCs de compatibilidade e metricas seguem abaixo.

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
   ELSIF s.tipo_uso='reentrada' AND resultado='permitido' THEN
    resultado:='negado'; motivo:='atualizacao_necessaria';
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
 ), ultimas AS (
  SELECT DISTINCT ON(credencial_id) credencial_id,tipo
  FROM leituras WHERE resultado='permitido' AND credencial_id IS NOT NULL
  ORDER BY credencial_id,momento DESC,id DESC
 ), saldo AS (
  SELECT count(*) FILTER(WHERE coalesce(p.dentro,u.tipo='entrada')) presentes
  FROM ultimas u LEFT JOIN producao_acesso_presencas p ON p.credencial_id=u.credencial_id
    AND p.evento_id=p_evento AND p.zeramento IS NOT DISTINCT FROM
      (SELECT entradas_zeradas_em FROM producao_acesso_eventos WHERE id=p_evento)
 ), setores AS (
  SELECT setor_id,count(*) FILTER(WHERE resultado='permitido' AND tipo='entrada') passagens,
    count(DISTINCT credencial_id) FILTER(WHERE resultado='permitido' AND tipo='entrada') utilizados
  FROM leituras GROUP BY setor_id
 ), motivos AS (
  SELECT motivo,count(*) quantas FROM leituras WHERE resultado='negado' GROUP BY motivo
 ) SELECT jsonb_build_object(
  'entraram',count(*) FILTER(WHERE resultado='permitido' AND tipo='entrada'),
  'presentes',(SELECT presentes FROM saldo),
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
