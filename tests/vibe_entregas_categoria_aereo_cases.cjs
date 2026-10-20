const assert=require('node:assert/strict');
module.exports=async({db,query,uuid})=>{
 await db.exec(`BEGIN; RESET ROLE;
 INSERT INTO propostas(id,id_int,cliente,empresa,frete_escolhido,status_interno,categoria_frete) VALUES
 ('${uuid(31)}',2001,'Aereo pronto','A','SVT TRANSPORTES','EXPEDICAO','AEREO'),
 ('${uuid(32)}',2002,'Aereo hoje','A','MELHOR ENVIO','EM PRODUCAO','AEREO'),
 ('${uuid(33)}',2003,'Rodoviario','A','SVT TRANSPORTES','EXPEDICAO','RODOVIARIO'),
 ('${uuid(34)}',2004,'Aereo amanha','A','SVT TRANSPORTES','EM PRODUCAO','AEREO'),
 ('${uuid(35)}',2005,'Aereo entregue','A','SVT TRANSPORTES','ENTREGUE','AEREO');
 INSERT INTO propostas_os VALUES(2002,(now() AT TIME ZONE 'America/Sao_Paulo')::date),(2004,(now() AT TIME ZONE 'America/Sao_Paulo')::date+1);
 SET ROLE authenticated;`);
 const mapa=await query("SELECT ve_admin_mapa_modalidades(NULL,'aereo') dados");
 assert.deepEqual(mapa.map(p=>p.pedido),[1003,2001,2002]);
 assert.match(mapa.find(p=>p.pedido===2001).endereco,/92020-400/);
 const pwa=await query("SELECT ve_listar_modalidades('',0,'disponivel','aereo') dados");
 assert.deepEqual(pwa.map(p=>p.id),['1003','2001','2002']);
 const lista=await query("SELECT ve_acompanhar_modalidades('','disponivel',current_date,current_date,0,'aereo') dados");
 assert.deepEqual(lista.map(p=>p.pedido),[1003,2001,2002]);
 const selecao=await query("SELECT ve_admin_pedidos_rota_modalidades($1,'',0,'aereo') dados",[uuid(91)]);
 assert.deepEqual(selecao.map(p=>p.pedido),[1003,2001]);
 await db.exec('SAVEPOINT producao');
 await assert.rejects(()=>db.query('SELECT ve_assumir($1)',[uuid(32)]),/indisponivel/);
 await db.exec('ROLLBACK TO SAVEPOINT producao');
 await db.query('SELECT ve_admin_atribuir_rota($1,$2,NULL)',[uuid(31),uuid(91)]);
 const rota=(await query('SELECT ve_rotas_status() dados'))[0];
 assert.equal(rota.paradas[0].modalidade,'aereo');
 const contexto=await query('SELECT ve_previsao_contexto($1,true) dados',[rota.id]);
 assert.match(contexto.paradas[0].endereco,/92020-400/);
 await db.query('SELECT ve_admin_iniciar_deslocamento($1,$2)',[rota.id,{[uuid(31)]:new Date(Date.now()+3600000).toISOString()}]);
 const op=uuid(81),foto=`${uuid(91)}/${uuid(31)}/${op}.jpg`;
 await db.query(`INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{"size":100,"mimetype":"image/jpeg"}')`,[foto]);
 const repasse=await query('SELECT ve_registrar_repasse($1,$2,$3,$4,$5,$6,true) dados',[rota.id,[uuid(31)],op,'Transportadora',foto,'']);
 assert.equal(repasse.tipo,'repasse');
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT status_interno FROM propostas WHERE id=$1',[uuid(31)])).rows[0].status_interno,'EM TRANSITO');
 assert.equal((await db.query('SELECT count(*)::int n FROM expedicoes WHERE id_int=2001')).rows[0].n,0);
 await db.exec('ROLLBACK');
 console.log('PASS: categoria AEREO com nomes distintos, pronto/hoje, exclusoes, mapa/lista/PWA, atribuicao, destino fixo e repasse.');
};
