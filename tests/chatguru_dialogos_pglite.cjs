// PostgreSQL sintético, sem rede ou dados reais.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
 const db=await PGlite.create();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('sql/chatguru_aprovacao.sql','utf8'));
  const chave='a'.repeat(64), outra='b'.repeat(64), destino='c'.repeat(64), autor='00000000-0000-4000-8000-000000000001';
  // Registro antigo permanece aceito após a migração.
  await db.query("INSERT INTO imposition_whatsapp_artes(chave,os_id,autor,estado,message_id) VALUES($1,'vibe_1',$2,'enviado','legado')",[chave,autor]);
  await db.exec(fs.readFileSync('sql/chatguru_dialogos.sql','utf8'));
  const reservar=(c=outra,d=destino,repetir=false)=>db.query('SELECT imposition_whatsapp_dialogo_reservar($1,$2,$3,$4,$5,$6) as r',[c,d,'vibe_2',autor,'dialogo-sintetico',repetir]);
  const finalizar=(e,c=outra,d=destino)=>db.query('SELECT * FROM imposition_whatsapp_dialogo_finalizar($1,$2,$3)',[c,d,e]);
  for(const role of ['anon','authenticated']) {
   await db.exec('SET ROLE '+role);
   await assert.rejects(()=>reservar(),/permission denied/);
   await assert.rejects(()=>finalizar('aguardando'),/permission denied/);
   await assert.rejects(()=>db.query('SELECT * FROM imposition_whatsapp_conversas'),/permission denied/);
   await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  assert.equal((await reservar(chave)).rows[0].r,'existente');
  assert.equal((await db.query('SELECT message_id,dialogo_executado FROM imposition_whatsapp_artes WHERE chave=$1',[chave])).rows[0].message_id,'legado');
  assert.equal((await reservar()).rows[0].r,'reservado');
  assert.equal((await reservar('d'.repeat(64))).rows[0].r,'ocupado');
  await assert.rejects(()=>finalizar('aguardando',outra,'f'.repeat(64)),/Reserva/);
  await assert.rejects(()=>finalizar('enviado'),/Estado invalido/);
  const salvo=(await finalizar('aguardando')).rows[0];
  assert.equal(salvo.dialogo_executado,true); assert.equal(salvo.message_id,null);
  assert.equal((await reservar()).rows[0].r,'existente');
  assert.equal((await reservar(outra,destino,true)).rows[0].r,'existente');
  const nova='d'.repeat(64);
  assert.equal((await reservar(nova)).rows[0].r,'reservado');
  await finalizar('falhou',nova);
  assert.equal((await reservar(nova,destino,true)).rows[0].r,'reservado');
  await finalizar('desconhecido',nova);
  assert.equal((await reservar('e'.repeat(64))).rows[0].r,'ocupado');
  assert.equal((await db.query('SELECT tentativas FROM imposition_whatsapp_artes WHERE chave=$1',[nova])).rows[0].tentativas,2);
  console.log('OK: legado, permissões, reserva por conversa, rejeição, repetição explícita e bloqueio de incerteza');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
