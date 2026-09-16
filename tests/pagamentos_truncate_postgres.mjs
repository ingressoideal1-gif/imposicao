import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
assert.ok(process.argv[2] && isAbsolute(process.argv[2]));
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const sql=readFileSync(new URL('../sql/auditoria_rls/05_pagamentos_sem_truncate_anon.sql',import.meta.url),'utf8');
const marcador="SET imposition.pagamentos_truncate_anon_revisado='sim';";
const setup=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.pagamentos_v2(id int PRIMARY KEY,status text);
INSERT INTO public.pagamentos_v2 VALUES(1,'SINTETICO');
ALTER TABLE public.pagamentos_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY ampla ON public.pagamentos_v2 FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT,TRUNCATE,REFERENCES,TRIGGER ON public.pagamentos_v2 TO anon;
GRANT INSERT(status),UPDATE(status) ON public.pagamentos_v2 TO anon;
GRANT ALL ON public.pagamentos_v2 TO authenticated,service_role;`;
async function estado(db){return (await db.query(`SELECT c.relacl::text,
 (SELECT jsonb_agg(a.attacl::text ORDER BY a.attnum) FROM pg_attribute a WHERE attrelid=c.oid AND attnum>0) colunas,
 (SELECT jsonb_agg(t) FROM public.pagamentos_v2 t) dados FROM pg_class c WHERE c.oid='public.pagamentos_v2'::regclass`)).rows;}
for(const cenario of ['sucesso','sem-revisao','heranca-public','heranca-grupo','delete-reaberto']) {
 const db=new PGlite();
 try {
  await db.exec(setup);
  if(cenario==='heranca-public') await db.exec('GRANT TRUNCATE ON public.pagamentos_v2 TO PUBLIC;');
  if(cenario==='heranca-grupo') await db.exec('CREATE ROLE grupo; GRANT TRUNCATE ON public.pagamentos_v2 TO grupo; GRANT grupo TO anon;');
  if(cenario==='delete-reaberto') await db.exec('GRANT DELETE ON public.pagamentos_v2 TO anon;');
  const antes=await estado(db);
  if(cenario!=='sem-revisao') await db.exec(marcador);
  if(cenario==='sucesso') {
   await db.exec('BEGIN; SET LOCAL ROLE anon; TRUNCATE public.pagamentos_v2; ROLLBACK;');
   await db.exec(sql);
   const depois=await estado(db);
   assert.deepEqual(depois[0].dados,antes[0].dados); assert.deepEqual(depois[0].colunas,antes[0].colunas);
   await db.exec('BEGIN; SET LOCAL ROLE anon;');
   assert.equal((await db.query('SELECT * FROM public.pagamentos_v2')).rows.length,1);
   await db.exec("UPDATE public.pagamentos_v2 SET status='OUTRO' WHERE id=1;");
   await assert.rejects(()=>db.exec('TRUNCATE public.pagamentos_v2;'),e=>e.code==='42501');
   await db.exec('ROLLBACK;');
   for(const role of ['authenticated','service_role']) await db.exec(`BEGIN; SET LOCAL ROLE ${role}; TRUNCATE public.pagamentos_v2; ROLLBACK;`);
   assert.deepEqual((await estado(db))[0].dados,antes[0].dados);
  } else {
   await assert.rejects(()=>db.exec(sql),cenario==='sem-revisao'?/Revisao/:cenario==='delete-reaberto'?/Baseline/:/herdado/);
   await db.exec('ROLLBACK;'); assert.deepEqual(await estado(db),antes);
  }
  console.log('OK '+cenario);
 } finally {await db.close();}
}
console.log('5 cenarios isolados; sem acesso remoto.');
