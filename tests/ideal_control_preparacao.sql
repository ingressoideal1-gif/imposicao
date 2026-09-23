-- Executado em schema isolado validacao_ic, com ROLLBACK pelo gerador.
DO $$
DECLARE e uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); n uuid:=gen_random_uuid();
 r jsonb; assinatura text; plano jsonb; lote jsonb; recusou boolean;
BEGIN
 INSERT INTO validacao_ic.producao_acesso_eventos(id,nome_evento,sal) VALUES(e,'SINTETICO',repeat('ab',32));
 INSERT INTO validacao_ic.producao_acesso_pedidos(pedido_id_int,evento_id,sal) VALUES(123,e,repeat('ab',32));
 INSERT INTO validacao_ic.producao_acesso_setores(id,pedido_id_int,evento_id,modelo_id,nome,quantidade) VALUES(s,123,e,456,'SINTETICO',2);
 INSERT INTO validacao_ic.producao_numeracoes VALUES(n,'[{"type":"QR_IDEAL"}]','NORMAL',1);
 INSERT INTO validacao_ic.pedidos_modelos VALUES(456,123,2,1,n::text);
 r:=validacao_ic.producao_acesso_preparar_lote(e,123); assinatura:=r->>'fonte_hash';
 plano:=jsonb_build_array(jsonb_build_object('modelo',456,'setor',s,'quantidade',2));
 r:=validacao_ic.producao_acesso_preparar_lote(e,123,assinatura,plano);
 IF r->>'prontos'<>'0' THEN RAISE EXCEPTION 'Cursor inicial'; END IF;
 lote:=jsonb_build_array(jsonb_build_object('modelo',456,'numero',1,'hash',repeat('a',64)));
 r:=validacao_ic.producao_acesso_preparar_lote(e,123,assinatura,NULL,0,lote);
 IF r->>'prontos'<>'1' OR (r->>'concluida')::boolean THEN RAISE EXCEPTION 'Fechou parcial'; END IF;
 r:=validacao_ic.producao_acesso_preparar_lote(e,123,assinatura,NULL,0,lote);
 IF r->>'prontos'<>'1' OR (SELECT count(*) FROM validacao_ic.producao_acesso_credenciais)<>1 THEN RAISE EXCEPTION 'Repeticao duplicou'; END IF;
 recusou:=false;
 BEGIN
  PERFORM validacao_ic.producao_acesso_preparar_lote(e,123,assinatura,NULL,1,lote);
 EXCEPTION WHEN OTHERS THEN recusou:=true; END;
 IF NOT recusou THEN RAISE EXCEPTION 'Numero fora do cursor aceito'; END IF;
 UPDATE validacao_ic.pedidos_modelos SET numeracao_inicio=8 WHERE id=456;
 recusou:=false;
 BEGIN PERFORM validacao_ic.producao_acesso_preparar_lote(e,123);
 EXCEPTION WHEN OTHERS THEN recusou:=true; END;
 IF NOT recusou THEN RAISE EXCEPTION 'Mudanca de numeracao ignorada'; END IF;
 UPDATE validacao_ic.pedidos_modelos SET numeracao_inicio=1 WHERE id=456;
 lote:=jsonb_build_array(jsonb_build_object('modelo',456,'numero',2,'hash',repeat('b',64)));
 r:=validacao_ic.producao_acesso_preparar_lote(e,123,assinatura,NULL,1,lote);
 IF NOT (r->>'concluida')::boolean OR (SELECT total_credenciais FROM validacao_ic.producao_acesso_pedidos WHERE pedido_id_int=123)<>2
 THEN RAISE EXCEPTION 'Conclusao incorreta'; END IF;
 IF EXISTS (SELECT 1 FROM validacao_ic.producao_acesso_credenciais WHERE evento_id<>e OR setor_id<>s OR codigo_visivel IS NOT NULL) THEN RAISE EXCEPTION 'Escopo ou dados invalidos'; END IF;
 r:=validacao_ic.producao_acesso_preparar_lote(e,123);
 IF NOT (r->>'concluida')::boolean THEN RAISE EXCEPTION 'Reabriu publicacao'; END IF;
 IF has_function_privilege('anon','validacao_ic.producao_acesso_preparar_lote(uuid,integer,text,jsonb,integer,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','validacao_ic.producao_acesso_preparar_lote(uuid,integer,text,jsonb,integer,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'RPC acessivel ao navegador'; END IF;
END $$;
SELECT 'lotes, repeticao, conflito, mudanca de fonte, conclusao e ACL confirmados' AS validacao;
