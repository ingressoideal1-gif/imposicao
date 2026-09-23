-- Usado somente no schema isolado substituído pelo gerador; a transação termina em ROLLBACK.
DO $teste$
DECLARE
 e uuid := gen_random_uuid(); s uuid := gen_random_uuid(); i uuid := gen_random_uuid();
 convite uuid := gen_random_uuid(); a uuid; r jsonb; tent integer; qtd integer;
BEGIN
 INSERT INTO validacao_ic.producao_acesso_eventos(id,nome_evento,sal,status)
 VALUES(e,'SINTETICO VALIDACAO QR',repeat('ab',32),'ativo');
 INSERT INTO validacao_ic.producao_acesso_setores(id,evento_id,nome,status) VALUES(s,e,'SINTETICO','ativo');
 INSERT INTO validacao_ic.producao_acesso_credenciais(evento_id,setor_id,codigo_hash,status)
 VALUES(e,s,repeat('c',64),'ativo');
 INSERT INTO validacao_ic.producao_acesso_instalacoes(id,chave_hash,pin_cifrado,pin_hash)
 VALUES(i,repeat('a',64),'CIFRADO_SINTETICO',repeat('b',64));
 INSERT INTO validacao_ic.producao_acesso_convites_evento(id,evento_id,segredo_hash,criado_por)
 VALUES(convite,e,repeat('d',64),gen_random_uuid());

 IF validacao_ic.producao_acesso_conferir_pin(repeat('a',64),repeat('b',64)) IS DISTINCT FROM i THEN RAISE EXCEPTION 'PIN correto recusado'; END IF;
 FOR tent IN 1..5 LOOP
  IF validacao_ic.producao_acesso_conferir_pin(repeat('a',64),repeat('c',64)) IS NOT NULL THEN RAISE EXCEPTION 'PIN errado aceito'; END IF;
 END LOOP;
 IF validacao_ic.producao_acesso_conferir_pin(repeat('a',64),repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'Limite de tentativas ausente'; END IF;
 UPDATE validacao_ic.producao_acesso_instalacoes SET janela_em=now()-interval '16 minutes' WHERE id=i;
 IF validacao_ic.producao_acesso_conferir_pin(repeat('a',64),repeat('b',64)) IS DISTINCT FROM i THEN RAISE EXCEPTION 'Janela nao reiniciou'; END IF;

 r := validacao_ic.producao_acesso_ativar_qr_evento(repeat('d',64));
 IF r#>>'{evento,id}' IS DISTINCT FROM e::text OR r ? 'aparelho' THEN RAISE EXCEPTION 'Consulta invalida'; END IF;
 IF validacao_ic.producao_acesso_ativar_qr_evento(repeat('f',64)) IS NOT NULL THEN RAISE EXCEPTION 'QR desconhecido aceito'; END IF;
 r := validacao_ic.producao_acesso_ativar_qr_evento(repeat('d',64),repeat('e',64),'SINTETICO CELULAR','sintetico',i);
 a := (r#>>'{aparelho,id}')::uuid;
 IF a IS NULL THEN RAISE EXCEPTION 'Ativacao sem aparelho'; END IF;
 IF (SELECT instalacao_id FROM validacao_ic.producao_acesso_dispositivos WHERE id=a) IS DISTINCT FROM i THEN RAISE EXCEPTION 'Instalacao incorreta'; END IF;
 SELECT count(*) INTO qtd FROM validacao_ic.producao_acesso_dispositivo_setores WHERE dispositivo_id=a AND setor_id=s;
 IF qtd<>1 THEN RAISE EXCEPTION 'Setor nao vinculado'; END IF;
 r := validacao_ic.producao_acesso_ativar_qr_evento(repeat('d',64),repeat('e',64),'SINTETICO CELULAR','sintetico',i);
 IF r#>>'{aparelho,id}' IS DISTINCT FROM a::text THEN RAISE EXCEPTION 'Reenvio duplicou aparelho'; END IF;
 INSERT INTO validacao_ic.producao_acesso_convites_evento(evento_id,segredo_hash,criado_por) VALUES(e,repeat('9',64),gen_random_uuid());
 r := validacao_ic.producao_acesso_ativar_qr_evento(repeat('9',64),repeat('e',64),'SINTETICO CELULAR','sintetico',i);
 IF r#>>'{aparelho,id}' IS DISTINCT FROM a::text THEN RAISE EXCEPTION 'Outro QR duplicou aparelho'; END IF;
 SELECT count(*) INTO qtd FROM validacao_ic.producao_acesso_dispositivos;
 IF qtd<>1 THEN RAISE EXCEPTION 'Quantidade de aparelhos incorreta'; END IF;
 UPDATE validacao_ic.producao_acesso_dispositivos SET status='pausado' WHERE id=a;
 IF validacao_ic.producao_acesso_ativar_qr_evento(repeat('d',64),repeat('e',64),'SINTETICO','sintetico',i) IS NOT NULL THEN RAISE EXCEPTION 'Aparelho pausado reativado'; END IF;
 UPDATE validacao_ic.producao_acesso_convites_evento SET revogado_em=now() WHERE id=convite;
 IF validacao_ic.producao_acesso_ativar_qr_evento(repeat('d',64)) IS NOT NULL THEN RAISE EXCEPTION 'Revogacao ignorada'; END IF;
 UPDATE validacao_ic.producao_acesso_eventos SET status='encerrado' WHERE id=e;
 IF validacao_ic.producao_acesso_ativar_qr_evento(repeat('9',64)) IS NOT NULL THEN RAISE EXCEPTION 'Evento inativo aceito'; END IF;

 IF has_table_privilege('anon','validacao_ic.producao_acesso_instalacoes','SELECT')
 OR has_table_privilege('authenticated','validacao_ic.producao_acesso_instalacoes','SELECT')
 OR has_function_privilege('anon','validacao_ic.producao_acesso_conferir_pin(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','validacao_ic.producao_acesso_ativar_qr_evento(text,text,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Permissao indevida'; END IF;
END;
$teste$;
