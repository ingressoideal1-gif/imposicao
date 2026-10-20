const assert=require('node:assert/strict');
module.exports=async({db,query,uuid})=>{
 await db.exec('BEGIN');
 const dados={nome:'Local sintético',cep:'90000-000',numero:'10',logradouro:'Rua Teste',complemento:'Sala 2',bairro:'Centro',cidade:'Cidade Teste',uf:'RS'};
 const criar=(id,local=null,d=dados)=>query('SELECT ve_admin_criar_avulsa($1,$2,$3) dados',[id,local,d]);
 const primeira=await criar(uuid(201));
 assert.equal(primeira.confirmado,true);
 assert.equal((await criar(uuid(201))).id,primeira.id);
 // Excecoes esperadas precisam de savepoint dentro desta transacao.
 async function recusa(fn,re){await db.exec('SAVEPOINT falha');await assert.rejects(fn,re);await db.exec('ROLLBACK TO SAVEPOINT falha');}
 await recusa(()=>criar(uuid(1)),/Identificador ja utilizado/);
 await recusa(()=>criar(uuid(201),null,{...dados,numero:'20'}),/Operacao ja utilizada/);
 const locais=await query("SELECT ve_admin_buscar_locais('sintético',0) dados");
 assert.equal(locais.length,1);
 assert.equal((await query("SELECT ve_admin_buscar_locais('90000',0) dados")).length,1);
 const outra=await criar(uuid(202),locais[0].id,null);
 assert.equal(outra.local,primeira.local);
 await criar(uuid(203));
 assert.equal((await query("SELECT ve_admin_buscar_locais('',0) dados")).length,1);
 await recusa(()=>criar(uuid(204),null,{...dados,cep:'123'}),/check constraint/);
 const disponiveis=await query("SELECT ve_listar_modalidades('',0,'disponivel','todas') dados");
 assert.ok(disponiveis.some(p=>p.chave===primeira.id&&p.id.startsWith('AV-')&&p.endereco.includes('Sala 2')));
 const mapa=await query("SELECT ve_admin_mapa_modalidades(NULL,'todas') dados");
 assert.ok(mapa.some(p=>p.chave===primeira.id&&p.endereco_completo&&p.pedido.startsWith('AV-')));
 const selecao=await query("SELECT ve_admin_pedidos_rota_modalidades($1,'',0,'todas') dados",[uuid(91)]);
 assert.ok(selecao.some(p=>p.chave===primeira.id));
 await db.query('SELECT ve_admin_salvar_rota($1,$2,$3,NULL,false)',[uuid(205),uuid(91),[uuid(1),primeira.id]]);
 const previsoes={[uuid(1)]:new Date(Date.now()+600000).toISOString(),[primeira.id]:new Date(Date.now()+1200000).toISOString()};
 const contexto=await query('SELECT ve_previsao_contexto($1,true) dados',[uuid(205)]);
 assert.equal(contexto.paradas.length,2);
 await db.query('SELECT ve_admin_iniciar_deslocamento($1,$2)',[uuid(205),previsoes]);
 const op=uuid(206),foto=`${uuid(91)}/${primeira.id}/${op}.jpg`;
 await db.query(`INSERT INTO storage.objects VALUES('vibe-entregas-comprovantes',$1,'{"size":100,"mimetype":"image/jpeg"}')`,[foto]);
 const confirmar=()=>query("SELECT ve_registrar($1,$2,'entregue','Recebedor',$3,'',true) dados",[primeira.id,op,foto]);
 assert.equal((await confirmar()).confirmada,true);
 assert.equal((await confirmar()).confirmada,true);
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT status FROM vibe_entregas_avulsas WHERE id=$1',[primeira.id])).rows[0].status,'ENTREGUE');
 assert.equal((await db.query('SELECT count(*)::int n FROM propostas')).rows[0].n,7);
 assert.equal((await db.query("SELECT status_interno FROM propostas WHERE id=$1",[uuid(1)])).rows[0].status_interno,'EM TRANSITO');
 const registro=(await db.query('SELECT pedido_erp,entrega_avulsa FROM vibe_entregas_registros WHERE proposta=$1',[primeira.id])).rows[0];
 assert.equal(registro.pedido_erp,null);assert.equal(registro.entrega_avulsa,primeira.id);
 await db.exec('CREATE TABLE perfis(id uuid PRIMARY KEY,slug text,ativo boolean); CREATE TABLE usuarios(user_id uuid,id_perfil uuid)');
 await db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../sql/vibe_entregas_perfis.sql'),'utf8').replace('BEGIN;','').replace('COMMIT;',''));
 for(const [role,id] of [['financeiro',210],['expedidor',211]]){
  await db.exec(`UPDATE imposition_user_permissions SET role='${role}' WHERE user_id='${uuid(91)}'; SET ROLE authenticated`);
  assert.equal((await criar(uuid(id),primeira.local,null)).confirmado,true);
  await db.exec('RESET ROLE');
 }
 await db.exec(`UPDATE imposition_user_permissions SET role='atendimento' WHERE user_id='${uuid(91)}'; SET ROLE authenticated`);
 await recusa(()=>criar(uuid(212)),/Edicao de entregas/);
 await db.exec('RESET ROLE');
 await db.exec(`UPDATE imposition_user_permissions SET role='operador',perm_admin_view=false,perm_admin_edit=false WHERE user_id='${uuid(91)}'; SET ROLE authenticated`);
 await recusa(()=>criar(uuid(207)),/Edicao de entregas/);
 await recusa(()=>db.query('SELECT * FROM vibe_entregas_avulsas'),/permission denied/);
 await db.exec('ROLLBACK');
 console.log('PASS: avulsas/local reutilizado, idempotencia, validacao, mapa, rota mista, previsoes, foto, conclusao isolada do ERP e permissoes.');
};
