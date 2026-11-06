// PostgreSQL em memória; não conecta a serviços ou dados reais.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(fs.readFileSync('sql/chatguru_aprovacao.sql','utf8'));
    const key='a'.repeat(64), user='00000000-0000-4000-8000-000000000001';
    const reservar = (repetir=false) => db.query('SELECT public.imposition_whatsapp_reservar($1,$2,$3,$4) AS reservado',[key,'vibe_11',user,repetir]);
    for (const role of ['anon','authenticated']) {
      await db.exec('SET ROLE '+role);
      await assert.rejects(()=>reservar(),/permission denied/);
      await assert.rejects(()=>db.query('SELECT * FROM public.imposition_whatsapp_artes'),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    assert.equal((await reservar()).rows[0].reservado,true);
    assert.equal((await reservar()).rows[0].reservado,false);
    assert.equal((await reservar(true)).rows[0].reservado,false);
    await db.exec("UPDATE public.imposition_whatsapp_artes SET estado='desconhecido'");
    assert.equal((await reservar(true)).rows[0].reservado,false);
    await db.exec("UPDATE public.imposition_whatsapp_artes SET estado='falhou'");
    assert.equal((await reservar(true)).rows[0].reservado,true);
    assert.equal((await reservar(true)).rows[0].reservado,false);
    await db.exec("UPDATE public.imposition_whatsapp_artes SET estado='aguardando',message_id='msg-sintetica'");
    assert.equal((await reservar(true)).rows[0].reservado,false);
    const rows=(await db.query('SELECT estado,tentativas,message_id FROM public.imposition_whatsapp_artes')).rows;
    assert.deepEqual(rows,[{estado:'aguardando',tentativas:2,message_id:'msg-sintetica'}]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.imposition_whatsapp_artes'::regclass")).rows[0].relrowsecurity,true);
    console.log('OK: SQL ChatGuru, RLS/grants, reserva, duplicação, repetição e estados desconhecidos');
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
