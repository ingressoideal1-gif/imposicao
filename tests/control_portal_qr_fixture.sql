-- Esquema e fonte QR reais, somente no cluster fictício do teste.
CREATE TABLE public.producao_acesso_qr_controle (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 ativo boolean NOT NULL DEFAULT false,
 corte timestamptz NOT NULL DEFAULT 'infinity',
 pool_revisao text NOT NULL DEFAULT 'ideal-qr12-d1'
);
INSERT INTO public.producao_acesso_qr_controle(id) VALUES(true);
CREATE TABLE public.producao_acesso_qr_autorizacoes (
 pedido integer PRIMARY KEY,
 confirmacao_sem_impressao text NOT NULL CHECK(length(confirmacao_sem_impressao)>15),
 criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producao_acesso_qr_contratos ADD PRIMARY KEY(modelo),
 ADD COLUMN versao integer, ADD COLUMN inicio bigint, ADD COLUMN passo integer,
 ADD COLUMN posicao integer, ADD COLUMN quantidade integer, ADD COLUMN deslocamento integer,
 ADD COLUMN capacidade integer, ADD COLUMN fonte_hash text, ADD COLUMN pool_revisao text,
 ADD COLUMN criado_em timestamptz DEFAULT now();
ALTER TABLE public.pedidos_modelos ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TABLE public.producao_acesso_qr_reservas (
 pedido integer NOT NULL, modelo bigint NOT NULL, versao integer NOT NULL,
 faixa int8range NOT NULL CHECK(NOT isempty(faixa) AND lower(faixa)>=0 AND upper(faixa)<=3000000),
 PRIMARY KEY(modelo,versao,faixa)
);
CREATE INDEX producao_acesso_qr_reservas_faixa ON public.producao_acesso_qr_reservas USING gist(faixa);
ALTER TABLE public.producao_acesso_qr_reservas ADD CONSTRAINT qr_v2_faixa_exclusiva
 EXCLUDE USING gist(faixa WITH &&) WHERE(versao=2);
CREATE FUNCTION public.producao_acesso_qr_fonte(p_pedido integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('modelo',m.id,'pedido',m.id_int,
 'criado_em',m.created_at,'inicio',coalesce(m.numeracao_inicio,1),'quantidade',m.quantidade,
 'passo',CASE WHEN n.tipo='TICKET' THEN coalesce(n.ticket_qtd,1) ELSE 1 END,
 'posicao',CASE WHEN n.tipo='TICKET' THEN coalesce((e.el->>'ticket_pos')::integer,1) ELSE 1 END,
 'tipo',coalesce(n.tipo,'SEQUENCIAL'),'elementos',n.elements) ORDER BY m.id),'[]'::jsonb)
 FROM public.pedidos_modelos m JOIN public.producao_numeracoes n ON n.id::text=m.amostra_num_id::text
 CROSS JOIN LATERAL (SELECT el FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.elements::jsonb)='array' THEN n.elements::jsonb ELSE '[]'::jsonb END) WITH ORDINALITY x(el,ord)
 WHERE el->>'type'='QR_IDEAL' ORDER BY ord LIMIT 1) e
 WHERE m.id_int=p_pedido;
$$;

CREATE FUNCTION public.producao_acesso_qr_reservar_legado(p_pedido integer,p_modelo bigint,p_inicio bigint,p_span bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE inicio bigint; v_faixa int8range; faixas int8range[];
BEGIN
 PERFORM pg_advisory_xact_lock(23063,12);
 inicio:=(((((p_pedido%100-p_modelo%100+100)%100+99)%100)*30000+p_inicio-1)%3000000+3000000)%3000000;
 IF p_span>=3000000 THEN faixas:=ARRAY[int8range(0,3000000,'[)')];
 ELSIF inicio+p_span<=3000000 THEN faixas:=ARRAY[int8range(inicio,inicio+p_span,'[)')];
 ELSE faixas:=ARRAY[int8range(inicio,3000000,'[)'),int8range(0,inicio+p_span-3000000,'[)')]; END IF;
 FOREACH v_faixa IN ARRAY faixas LOOP
  INSERT INTO public.producao_acesso_qr_reservas VALUES(p_pedido,p_modelo,1,v_faixa) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

UPDATE public.producao_acesso_qr_controle SET ativo=true,pool_revisao='ideal-qr12-1';
