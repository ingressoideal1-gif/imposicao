// Banco sintético, sem rede ou dados reais.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
 const db=await PGlite.create();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  for (const nome of ['chatguru_aprovacao','chatguru_dialogos','chatguru_reenvio_120s']) await db.exec(fs.readFileSync('sql/'+nome+'.sql','utf8'));
  const chave='a'.repeat(64), destino='b'.repeat(64), autor='00000000-0000-4000-8000-000000000001';
  await db.query("INSERT INTO imposition_whatsapp_artes(chave,os_id,autor,estado,message_id,concluido) VALUES($1,'vibe_1',$2,'enviado','legado',true)",[chave,autor]);
  const data=async()=> (await db.query('SELECT atualizado_em::text as t FROM imposition_whatsapp_artes WHERE chave=$1',[chave])).rows[0].t;
  const reenviar=t=>db.query('SELECT imposition_whatsapp_dialogo_reenviar($1,$2,$3,$4,$5,$6) as r',[chave,destino,'vibe_1',autor,'dialogo',t]);
  let t=await data();
  for (const role of ['anon','authenticated']) {
   await db.exec('SET ROLE '+role);await assert.rejects(()=>reenviar(t),/permission denied/);
   await assert.rejects(()=>db.query('SELECT * FROM imposition_whatsapp_reenvios'),/permission denied/);await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.equal((await reenviar(t)).rows[0].r,'existente');
  await db.query("UPDATE imposition_whatsapp_artes SET atualizado_em=clock_timestamp()-interval '119 seconds' WHERE chave=$1",[chave]);
  assert.equal((await reenviar(await data())).rows[0].r,'existente');
  await db.query("UPDATE imposition_whatsapp_artes SET atualizado_em=clock_timestamp()-interval '120 seconds' WHERE chave=$1",[chave]);
  t=await data();assert.equal((await reenviar(t)).rows[0].r,'reservado');
  assert.equal((await reenviar(t)).rows[0].r,'ocupado');
  const arquivo=(await db.query('SELECT registro_anterior FROM imposition_whatsapp_reenvios')).rows;
  assert.equal(arquivo.length,1);assert.equal(arquivo[0].registro_anterior.message_id,'legado');assert.equal(arquivo[0].registro_anterior.concluido,true);
  const novo=(await db.query('SELECT * FROM imposition_whatsapp_artes WHERE chave=$1',[chave])).rows[0];
  assert.equal(novo.concluido,false);assert.equal(novo.message_id,null);assert.equal(novo.tentativas,2);
  await db.query("SELECT * FROM imposition_whatsapp_dialogo_finalizar($1,$2,'aguardando')",[chave,destino]);
  assert.equal((await reenviar(t)).rows[0].r,'existente');
  await db.query("UPDATE imposition_whatsapp_artes SET atualizado_em=clock_timestamp()-interval '121 seconds' WHERE chave=$1",[chave]);
  assert.equal((await reenviar(t)).rows[0].r,'existente'); // Confirmação antiga não autoriza outro envio.
  assert.equal((await reenviar(await data())).rows[0].r,'reservado');
  await db.query("SELECT * FROM imposition_whatsapp_dialogo_finalizar($1,$2,'desconhecido')",[chave,destino]);
  await db.query("UPDATE imposition_whatsapp_artes SET atualizado_em=clock_timestamp()-interval '1 day' WHERE chave=$1",[chave]);
  assert.equal((await reenviar(await data())).rows[0].r,'ocupado');
  console.log('OK: 119/120s, autorização, legado, histórico, duplicidade, confirmação antiga e incerteza');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
