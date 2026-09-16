import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
assert.ok(process.argv[2] && isAbsolute(process.argv[2]));
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const migration=readFileSync(new URL('../sql/auditoria_rls/06_bancos_conter_escrita_anon.proposta.sql',import.meta.url),'utf8');
const marker="SET imposition.bancos_escrita_anon_revisada='sim';";
const setup=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.pedidos_bancos(id uuid PRIMARY KEY,id_int int,csv_data jsonb,nome text);
CREATE TABLE public.pedidos_modelos_banco(modelo_id text PRIMARY KEY,banco_id uuid REFERENCES public.pedidos_bancos(id),csv_mapa jsonb);
GRANT ALL ON public.pedidos_bancos,public.pedidos_modelos_banco TO anon,authenticated,service_role;
INSERT INTO public.pedidos_bancos VALUES('00000000-0000-0000-0000-000000000001',123,'[{"nome":"SINTETICO"}]','Teste');
INSERT INTO public.pedidos_modelos_banco VALUES('501','00000000-0000-0000-0000-000000000001','{}');`;
async function snapshot(db){return (await db.query(`SELECT c.relname,c.relacl::text,
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id::text) FROM public.pedidos_bancos t) AS bancos,
 (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.modelo_id) FROM public.pedidos_modelos_banco v) AS vinculos
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('pedidos_bancos','pedidos_modelos_banco') ORDER BY c.relname`)).rows;}
async function role(db,nome,fn){await db.exec(`BEGIN; SET LOCAL ROLE ${nome};`);try{await fn();}finally{await db.exec('ROLLBACK;');}}
for(const scenario of ['sucesso','sem-marcador','rls-divergente','acl-divergente']){
 const db=new PGlite(); try{
  await db.exec(setup); const before=await snapshot(db);
  if(scenario==='rls-divergente') await db.exec('ALTER TABLE public.pedidos_bancos ENABLE ROW LEVEL SECURITY;');
  if(scenario==='acl-divergente') await db.exec('REVOKE UPDATE ON public.pedidos_bancos FROM anon;');
  if(scenario!=='sem-marcador') await db.exec(marker);
  if(scenario==='sucesso'){
   await db.exec(migration);
   await role(db,'anon',async()=>{assert.equal((await db.query('SELECT id_int FROM public.pedidos_bancos')).rows[0].id_int,123);});
   await assert.rejects(()=>role(db,'anon',()=>db.query("UPDATE public.pedidos_bancos SET nome='X'")),e=>e.code==='42501');
   await assert.rejects(()=>role(db,'anon',()=>db.query("INSERT INTO public.pedidos_modelos_banco VALUES('502','00000000-0000-0000-0000-000000000001','{}')")),e=>e.code==='42501');
   await role(db,'authenticated',async()=>{assert.equal((await db.query("UPDATE public.pedidos_bancos SET nome='X' RETURNING id")).rows.length,1);});
   const after=await snapshot(db); assert.deepEqual(after.map(x=>x.bancos),before.map(x=>x.bancos)); assert.deepEqual(after.map(x=>x.vinculos),before.map(x=>x.vinculos));
  } else {
   await assert.rejects(()=>db.exec(migration)); await db.exec('ROLLBACK;');
  }
  console.log('OK '+scenario);
 } finally {await db.close();}
}
console.log('4 cenarios sinteticos; proposta nao aplicada.');
