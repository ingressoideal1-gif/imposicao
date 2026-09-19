import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

assert.ok(process.argv[2] && isAbsolute(process.argv[2]));
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const migration=readFileSync(new URL('../sql/auditoria_rls/07_bancos_fechar_anon_e_habilitar_rls.proposta.sql',import.meta.url),'utf8');
const marker="SET imposition.bancos_fechamento_anon_revisado='sim';";
const setup=`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.pedidos_bancos(id uuid PRIMARY KEY,id_int int,csv_data jsonb,nome text);
CREATE TABLE public.pedidos_modelos_banco(modelo_id text PRIMARY KEY,banco_id uuid REFERENCES public.pedidos_bancos(id),csv_mapa jsonb);
GRANT ALL ON public.pedidos_bancos,public.pedidos_modelos_banco TO anon,authenticated,service_role;
INSERT INTO public.pedidos_bancos VALUES('00000000-0000-0000-0000-000000000001',123,'[{"nome":"SINTETICO"}]','Teste');
INSERT INTO public.pedidos_modelos_banco VALUES('501','00000000-0000-0000-0000-000000000001','{}');
CREATE FUNCTION public.link_cliente_bancos_modelos(text,text) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS 'SELECT count(*)::int FROM public.pedidos_bancos';
REVOKE ALL ON FUNCTION public.link_cliente_bancos_modelos(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_cliente_bancos_modelos(text,text) TO anon,authenticated,service_role;`;

async function snapshot(db){return (await db.query(`SELECT c.relname,c.relacl::text,c.relrowsecurity,
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id::text) FROM public.pedidos_bancos t) bancos,
 (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.modelo_id) FROM public.pedidos_modelos_banco v) vinculos
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('pedidos_bancos','pedidos_modelos_banco') ORDER BY c.relname`)).rows;}
async function role(db,nome,fn){await db.exec(`BEGIN; SET LOCAL ROLE ${nome};`);try{return await fn();}finally{await db.exec('ROLLBACK;');}}

for(const scenario of ['sucesso','sem-marcador','rls-divergente','policy-divergente','rpc-divergente','acl-divergente']){
 const db=new PGlite(); try{
  await db.exec(setup); const before=await snapshot(db);
  if(scenario==='rls-divergente') await db.exec('ALTER TABLE public.pedidos_bancos ENABLE ROW LEVEL SECURITY;');
  if(scenario==='policy-divergente') {await db.exec('ALTER TABLE public.pedidos_bancos ENABLE ROW LEVEL SECURITY; CREATE POLICY inesperada ON public.pedidos_bancos USING(true); ALTER TABLE public.pedidos_bancos DISABLE ROW LEVEL SECURITY;');}
  if(scenario==='rpc-divergente') await db.exec('ALTER FUNCTION public.link_cliente_bancos_modelos(text,text) SECURITY INVOKER;');
  if(scenario==='acl-divergente') await db.exec('REVOKE UPDATE ON public.pedidos_bancos FROM anon;');
  if(scenario!=='sem-marcador') await db.exec(marker);
  if(scenario==='sucesso'){
   await db.exec(migration);
   await assert.rejects(()=>role(db,'anon',()=>db.query('SELECT id_int FROM public.pedidos_bancos')),e=>e.code==='42501');
   await role(db,'authenticated',async()=>assert.deepEqual((await db.query('SELECT id_int FROM public.pedidos_bancos')).rows,[]));
   await role(db,'anon',async()=>assert.equal((await db.query("SELECT public.link_cliente_bancos_modelos('123','token') valor")).rows[0].valor,1));
   await role(db,'service_role',async()=>assert.equal((await db.query('SELECT id_int FROM public.pedidos_bancos')).rows[0].id_int,123));
   const after=await snapshot(db);
   assert.deepEqual(after.map(x=>x.bancos),before.map(x=>x.bancos));
   assert.deepEqual(after.map(x=>x.vinculos),before.map(x=>x.vinculos));
   assert.ok(after.every(x=>x.relrowsecurity));
  } else {
   await assert.rejects(()=>db.exec(migration)); await db.exec('ROLLBACK;');
  }
  console.log('OK '+scenario);
 } finally {await db.close();}
}
console.log('6 cenarios sinteticos; proposta final nao aplicada.');
