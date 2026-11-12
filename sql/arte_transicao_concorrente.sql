-- Preparado localmente. Aplicar antes do frontend; nao altera pedidos existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Toda escrita participa da mesma exclusao por pedido, inclusive abas antigas.
-- Um deadlock com uma integracao que ja travou uma linha aborta a transacao;
-- nunca se repete automaticamente uma decisao do operador.
CREATE FUNCTION public.arte_transicao_travar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE anterior integer; seguinte integer; n integer; texto text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        IF TG_TABLE_NAME='pedidos_links_cliente' THEN texto := OLD.numero_pedido;
        ELSIF TG_TABLE_NAME='producao_ordens_servico' THEN texto := OLD.numero::text;
        ELSE texto := OLD.id_int::text; END IF;
        IF texto ~ '^[0-9]+$' AND length(texto)<=10 THEN
            IF texto::bigint BETWEEN 1 AND 2147483647 THEN anterior := texto::integer; END IF;
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF TG_TABLE_NAME='pedidos_links_cliente' THEN texto := NEW.numero_pedido;
        ELSIF TG_TABLE_NAME='producao_ordens_servico' THEN texto := NEW.numero::text;
        ELSE texto := NEW.id_int::text; END IF;
        IF texto ~ '^[0-9]+$' AND length(texto)<=10 THEN
            IF texto::bigint BETWEEN 1 AND 2147483647 THEN seguinte := texto::integer; END IF;
        END IF;
    END IF;
    FOR n IN SELECT DISTINCT x FROM unnest(ARRAY[anterior,seguinte]) x WHERE x IS NOT NULL ORDER BY x LOOP
        PERFORM pg_advisory_xact_lock(251112, n);
    END LOOP;
    IF TG_TABLE_NAME = 'pedidos_artes' AND TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status
       AND upper(btrim(coalesce(NEW.status,''))) IN ('EM ALTERAÇÃO','EM ALTERACAO')
       AND NEW.reprovacao_acao IS NOT DISTINCT FROM OLD.reprovacao_acao
       AND NOT EXISTS (SELECT 1 FROM public.pedidos_modelos m WHERE m.id_int=NEW.id_int
           AND upper(btrim(coalesce(m.status_arte,''))) IN
               ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERAÇÃO','EM ALTERACAO','ARTE_EM_CORRECAO')) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Alteracao antiga recusada. Reabra o pedido; uma nova alteracao exige uma acao explicita.';
    END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.arte_transicao_travar() FROM PUBLIC;

CREATE TRIGGER aaaa_arte_transicao BEFORE INSERT OR UPDATE OR DELETE ON public.pedidos_modelos
FOR EACH ROW EXECUTE FUNCTION public.arte_transicao_travar();
CREATE TRIGGER aaaa_arte_transicao BEFORE INSERT OR UPDATE OR DELETE ON public.pedidos_artes
FOR EACH ROW EXECUTE FUNCTION public.arte_transicao_travar();
CREATE TRIGGER aaaa_arte_transicao BEFORE INSERT OR UPDATE OR DELETE ON public.pedidos_links_cliente
FOR EACH ROW EXECUTE FUNCTION public.arte_transicao_travar();
CREATE TRIGGER aaaa_arte_transicao BEFORE INSERT OR UPDATE OR DELETE ON public.propostas
FOR EACH ROW EXECUTE FUNCTION public.arte_transicao_travar();
CREATE TRIGGER aaaa_arte_transicao BEFORE INSERT OR UPDATE OR DELETE ON public.producao_ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.arte_transicao_travar();

-- INVOKER: conserva as permissoes/RLS das tabelas, sem conceder acesso a pedidos.
-- xmin detecta inclusive ABA (alterou e voltou ao mesmo valor) e insercoes/remocoes.
CREATE FUNCTION public.arte_transicao_ler(p_numero integer) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('revisao',md5(coalesce(string_agg(selo,',' ORDER BY selo),'')))
    FROM (
      SELECT 'm:'||id::text||':'||xmin::text selo FROM public.pedidos_modelos WHERE id_int=p_numero
      UNION ALL SELECT 'a:'||id::text||':'||xmin::text FROM public.pedidos_artes WHERE id_int=p_numero
      UNION ALL SELECT 'l:'||id::text||':'||xmin::text FROM public.pedidos_links_cliente WHERE numero_pedido=p_numero::text
      UNION ALL SELECT 'p:'||id::text||':'||xmin::text FROM public.propostas WHERE id_int=p_numero
      UNION ALL SELECT 'o:'||id::text||':'||xmin::text FROM public.producao_ordens_servico WHERE numero=p_numero
    ) linhas;
$$;

CREATE FUNCTION public.arte_transicao_confirmar(
    p_numero integer, p_revisao text, p_acao text,
    p_modelo bigint DEFAULT NULL, p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
    m record; a record;
    total integer; aprovados integer; prontos integer; reprovados integer;
    afetados integer; esperado integer; destino text; entrega text; anterior text;
    correcao boolean := false; enviar boolean := false;
    aprovadas text[] := ARRAY['APROVADO','APROVADA','APROVADA_CLIENTE','LIBERADA','ARTE_APROVADA','ARTE APROVADA','DADOS PENDENTES'];
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='A transicao exige uma nova transacao READ COMMITTED.';
    END IF;
    IF p_numero IS NULL OR p_numero<=0 OR p_revisao IS NULL OR p_acao IS NULL
       OR p_acao NOT IN ('pronto','reconciliar','enviar') THEN RAISE EXCEPTION 'Transicao de arte invalida'; END IF;
    PERFORM pg_advisory_xact_lock(251112,p_numero);
    IF p_revisao IS DISTINCT FROM public.arte_transicao_ler(p_numero)->>'revisao' THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='O pedido mudou em outra tela. Reabra e confira antes de confirmar.';
    END IF;
    SELECT status,observacoes INTO a FROM public.pedidos_artes WHERE id_int=p_numero ORDER BY created_at DESC,id DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro de arte nao confirmado'; END IF;
    IF upper(coalesce(a.status,''))='IGNORAR' OR EXISTS(SELECT 1 FROM public.propostas
       WHERE id_int=p_numero AND upper(coalesce(status_interno,'')) IN ('CANCELADO','CANCELADA')) THEN
        RAISE EXCEPTION 'Pedido cancelado ou ignorado';
    END IF;
    IF EXISTS(SELECT 1 FROM public.producao_ordens_servico o JOIN public.pedidos_links_cliente l ON l.os_id=o.id::text
        WHERE o.numero=p_numero AND l.numero_pedido=p_numero::text AND l.ativo IS TRUE
        AND upper(coalesce(o.status,'')) IN ('CANCELADO','CANCELADA')) THEN RAISE EXCEPTION 'Pedido cancelado'; END IF;
    IF p_acao='pronto' THEN
        SELECT status_arte,status_impressao INTO m FROM public.pedidos_modelos WHERE id=p_modelo AND id_int=p_numero FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Modelo nao confirmado no pedido'; END IF;
        correcao := upper(btrim(coalesce(m.status_impressao,''))) IN ('CORRIGIR ARTE','CORRIGIR_ARTE','CORRIGIR-ARTE');
        IF upper(btrim(coalesce(m.status_impressao,'')))='IMPRESSO'
           OR (upper(btrim(coalesce(m.status_arte,'')))=ANY(aprovadas) AND NOT correcao) THEN
            RAISE EXCEPTION 'Modelo aprovado ou impresso: solicite alteracao antes de concluir';
        END IF;
        UPDATE public.pedidos_modelos SET status_arte=CASE WHEN correcao THEN 'APROVADA' ELSE 'AGUARDANDO_CLIENTE' END,
            status_impressao=CASE WHEN correcao THEN 'Aguardando' ELSE status_impressao END,
            observacao_arte=p_observacao WHERE id=p_modelo AND id_int=p_numero;
        GET DIAGNOSTICS afetados=ROW_COUNT;
        IF afetados<>1 THEN RAISE EXCEPTION 'Modelo nao gravado'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.pedidos_modelos WHERE id=p_modelo AND id_int=p_numero
            AND status_arte=CASE WHEN correcao THEN 'APROVADA' ELSE 'AGUARDANDO_CLIENTE' END
            AND (NOT correcao OR status_impressao='Aguardando')) THEN
            RAISE EXCEPTION 'Modelo devolveu estado diferente do solicitado';
        END IF;
    END IF;
    SELECT count(*),count(*) FILTER(WHERE upper(btrim(coalesce(status_arte,'')))=ANY(aprovadas)),
        count(*) FILTER(WHERE upper(btrim(coalesce(status_arte,''))) IN ('PRONTO','AGUARDANDO_CLIENTE')),
        count(*) FILTER(WHERE upper(btrim(coalesce(status_arte,''))) IN
            ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERAÇÃO','EM ALTERACAO','ARTE_EM_CORRECAO'))
      INTO total,aprovados,prontos,reprovados FROM public.pedidos_modelos WHERE id_int=p_numero;
    SELECT CASE WHEN bool_or(upper(coalesce(entrega_dados,''))='CORRIGIR') THEN 'CORRIGIR'
        WHEN bool_or(upper(coalesce(entrega_dados,''))='APROVADO') THEN 'APROVADO' ELSE '' END,
        count(*) INTO entrega,esperado FROM public.pedidos_artes WHERE id_int=p_numero;
    anterior := CASE WHEN upper(a.status)='CORRIGIR DADOS' THEN coalesce(a.observacoes->>'status_antes_correcao_dados',a.status) ELSE a.status END;
    enviar := p_acao IN ('pronto','enviar') AND NOT correcao AND total>0 AND prontos>0 AND prontos+aprovados=total;
    IF p_acao='enviar' AND NOT enviar THEN RAISE EXCEPTION 'Existem modelos sem conclusao confirmada'; END IF;
    IF p_acao IN ('pronto','enviar') AND NOT correcao AND EXISTS (
        SELECT 1 FROM (
            SELECT status_interno s FROM public.propostas WHERE id_int=p_numero
            UNION ALL SELECT o.status FROM public.producao_ordens_servico o
            JOIN public.pedidos_links_cliente l ON l.os_id=o.id::text
            WHERE o.numero=p_numero AND l.numero_pedido=p_numero::text AND l.ativo IS TRUE
        ) estados WHERE upper(btrim(coalesce(s,''))) IN
        ('EM PRODUCAO','EM PRODUÇÃO','PRODUCAO','PRODUÇÃO','EM IMPRESSAO','EM IMPRESSÃO','IMPRESSO',
         'EM ACABAMENTO','REVISAO PRODUCAO','REVISÃO PRODUÇÃO','EXPEDICAO','EXPEDIÇÃO','EM TRANSITO',
         'EM TRÂNSITO','A RETIRAR','RETIRADO','ENTREGUE','FINALIZADA','FINALIZADO')
    ) THEN RAISE EXCEPTION 'Pedido ja saiu da Arte; somente a correcao da producao pode ser concluida'; END IF;
    destino := CASE
        WHEN entrega='CORRIGIR' THEN 'Corrigir Dados'
        WHEN upper(coalesce(anterior,'')) IN ('PENDENTE INFORMAÇÃO','PENDENTE INFORMACAO') AND NOT enviar THEN 'Pendente Informação'
        WHEN reprovados>0 THEN 'Em Alteração'
        WHEN total>0 AND aprovados=total THEN CASE WHEN entrega='APROVADO' THEN 'APROVADO' ELSE 'Dados Pendentes' END
        WHEN enviar THEN 'Enviar Arte'
        WHEN aprovados>0 THEN 'Apr Parcial'
        WHEN p_acao='pronto' AND upper(btrim(coalesce(anterior,''))) IN
            ('REPROVADO','REPROVADA','REPROVADA_CLIENTE','EM ALTERAÇÃO','EM ALTERACAO','ARTE_EM_CORRECAO')
            THEN 'Em Arte'
        WHEN upper(anterior)='AGUARDANDO_APROVACAO' THEN 'Em Aprovação'
        WHEN upper(anterior)='APROVADO PARCIAL' THEN 'Apr Parcial'
        ELSE anterior END;
    IF destino IS NULL THEN RAISE EXCEPTION 'Status da arte nao definido'; END IF;
    IF enviar THEN
        UPDATE public.pedidos_links_cliente SET status_arte='Enviar Arte', cliente_abriu_em=NULL,arte_pronta_em=clock_timestamp()
        WHERE numero_pedido=p_numero::text AND (id_int IS NULL OR id_int=p_numero::text) AND ativo IS TRUE;
        GET DIAGNOSTICS afetados=ROW_COUNT;
        IF afetados<>1 THEN RAISE EXCEPTION 'Link ativo unico nao confirmado; conclusao desfeita'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.pedidos_links_cliente WHERE numero_pedido=p_numero::text
            AND ativo IS TRUE AND status_arte='Enviar Arte' AND cliente_abriu_em IS NULL AND arte_pronta_em IS NOT NULL) THEN
            RAISE EXCEPTION 'Link devolveu etapa diferente da solicitada';
        END IF;
        -- OS propria usa o vinculo exato do link; nunca atualiza pelo numero sozinho.
        IF EXISTS(SELECT 1 FROM public.pedidos_links_cliente WHERE numero_pedido=p_numero::text
            AND ativo IS TRUE AND os_id IS NOT NULL AND os_id NOT LIKE 'vibe_%') THEN
            UPDATE public.producao_ordens_servico o SET status='Enviar Arte'
            FROM public.pedidos_links_cliente l WHERE l.numero_pedido=p_numero::text AND l.ativo IS TRUE
                AND l.os_id=o.id::text AND o.numero=p_numero;
            GET DIAGNOSTICS afetados=ROW_COUNT;
            IF afetados<>1 THEN RAISE EXCEPTION 'Ordem de servico nao confirmada'; END IF;
        END IF;
    END IF;
    UPDATE public.pedidos_artes SET status=destino,
        observacoes=CASE WHEN entrega='CORRIGIR' AND upper(coalesce(status,''))<>'CORRIGIR DADOS'
             AND observacoes->>'status_antes_correcao_dados' IS NULL
             THEN coalesce(observacoes,'{}'::jsonb)||jsonb_build_object('status_antes_correcao_dados',status) ELSE observacoes END
        WHERE id_int=p_numero;
    GET DIAGNOSTICS afetados=ROW_COUNT;
    IF afetados<>esperado OR afetados=0 THEN RAISE EXCEPTION 'Status geral nao confirmado'; END IF;
    IF EXISTS(SELECT 1 FROM public.pedidos_artes WHERE id_int=p_numero AND status IS DISTINCT FROM destino) THEN
        RAISE EXCEPTION 'Status geral devolveu estado diferente do solicitado';
    END IF;
    RETURN jsonb_build_object('confirmado',true,'status',destino,'enviar',enviar,'correcao',correcao,
        'arte_pronta_em',(SELECT arte_pronta_em FROM public.pedidos_links_cliente
            WHERE numero_pedido=p_numero::text AND ativo IS TRUE ORDER BY id LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.arte_transicao_ler(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.arte_transicao_confirmar(integer,text,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arte_transicao_ler(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arte_transicao_confirmar(integer,text,text,bigint,text) TO authenticated;
COMMIT;
