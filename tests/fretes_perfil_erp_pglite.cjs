const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE imposition_user_permissions(user_id uuid,role text);
   CREATE TABLE perfis(id int,slug text,ativo boolean);
   CREATE TABLE usuarios(user_id uuid,id_perfil int);
   INSERT INTO imposition_user_permissions VALUES('00000000-0000-0000-0000-000000000001','visualizador');
   INSERT INTO perfis VALUES(1,'super_admin',true);
   INSERT INTO usuarios VALUES('00000000-0000-0000-0000-000000000001',1);
   SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../sql/fretes_perfil_erp.sql'),'utf8'));
  const permitido=async()=>{await db.exec('SET ROLE authenticated');const r=(await db.query('SELECT imposition_fretes_adm() ok')).rows[0].ok;await db.exec('RESET ROLE');return r;};
  assert.equal(await permitido(),true);
  await db.exec('UPDATE perfis SET ativo=false');assert.equal(await permitido(),false);
  await db.exec("UPDATE perfis SET ativo=true,slug='financeiro'");assert.equal(await permitido(),false);
  await db.exec("UPDATE imposition_user_permissions SET role='admin'");assert.equal(await permitido(),true);
  await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");assert.equal(await permitido(),false);
  await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT imposition_fretes_adm()'),/permission denied/);
  console.log('PASS: ADM ERP/local, perfil inativo, Financeiro, ausencia de sessao e anonimo.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
