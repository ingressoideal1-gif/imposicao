import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
try {
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE producao_acesso_instalacoes(id uuid PRIMARY KEY);
CREATE TABLE producao_acesso_eventos(id uuid PRIMARY KEY, empresa_id uuid, nome_evento text, status text);
CREATE TABLE producao_acesso_setores(id uuid PRIMARY KEY, evento_id uuid, status text);
CREATE TABLE producao_acesso_dispositivos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evento_id uuid, empresa_id uuid, nome text, codigo_hash text, token_hash text, navegador_id text, ultimo_visto timestamptz, instalacao_id uuid, status text DEFAULT 'ativo', UNIQUE(evento_id,instalacao_id));
CREATE TABLE producao_acesso_dispositivo_setores(empresa_id uuid, dispositivo_id uuid REFERENCES producao_acesso_dispositivos ON DELETE CASCADE, setor_id uuid);
CREATE TABLE producao_acesso_convites_evento(id uuid PRIMARY KEY, evento_id uuid, segredo_hash text, revogado_em timestamptz);
CREATE TABLE producao_acesso_ativacoes_qr(convite_id uuid, token_hash text, dispositivo_id uuid REFERENCES producao_acesso_dispositivos ON DELETE SET NULL, PRIMARY KEY(convite_id,token_hash));
GRANT SELECT,INSERT,UPDATE ON producao_acesso_dispositivos TO service_role;
GRANT SELECT,UPDATE ON producao_acesso_instalacoes,producao_acesso_convites_evento,producao_acesso_eventos TO service_role;
GRANT SELECT ON producao_acesso_setores TO service_role;
GRANT INSERT ON producao_acesso_dispositivo_setores TO service_role;
GRANT SELECT,INSERT ON producao_acesso_ativacoes_qr TO service_role;
INSERT INTO producao_acesso_instalacoes VALUES ('22222222-2222-4222-8222-222222222222'),('99999999-9999-4999-8999-999999999999');
INSERT INTO producao_acesso_eventos VALUES ('11111111-1111-4111-8111-111111111111',NULL,'SINTETICO','ativo');
INSERT INTO producao_acesso_setores VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','ativo');
INSERT INTO producao_acesso_convites_evento VALUES ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',repeat('a',64),NULL);
`);
const old=readFileSync('sql/ideal_control_ativacao_antes_publicacao.sql','utf8');
const fn=old.slice(old.indexOf('CREATE OR REPLACE FUNCTION'),old.indexOf('REVOKE ALL ON FUNCTION'));
await db.exec(fn);
const call=`SELECT producao_acesso_ativar_qr_evento(repeat('a',64),repeat('b',64),'SINTETICO','local','22222222-2222-4222-8222-222222222222') r`;
const invoke=async()=>{await db.exec('SET ROLE service_role');try{return (await db.query(call)).rows[0].r;}finally{await db.exec('RESET ROLE');}};
await db.exec('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role');
const first=await invoke(); assert.ok(first.aparelho.id);
await db.query('DELETE FROM producao_acesso_dispositivos WHERE id=$1',[first.aparelho.id]);
assert.equal(await invoke(),null,'reproduz vinculo orfao na funcao antiga');
// O hash de pg_get_functiondef varia com versao; substitui somente a assinatura do preflight local.
const signature=(await db.query("SELECT md5(pg_get_functiondef('producao_acesso_ativar_qr_evento(text,text,text,text,uuid)'::regprocedure)) h")).rows[0].h;
const migration=readFileSync('sql/ideal_control_recuperar_vinculo_qr.sql','utf8').replace('1525aa57a2883b6a45d803b0d78118ad',signature);
await db.exec(migration);
const recovered=await invoke();assert.ok(recovered.aparelho.id);assert.notEqual(recovered.aparelho.id,first.aparelho.id);
assert.equal((await invoke()).aparelho.id,recovered.aparelho.id,'reenvio idempotente');
assert.equal((await db.query('SELECT count(*)::int n FROM producao_acesso_ativacoes_qr')).rows[0].n,1);
await db.query("UPDATE producao_acesso_dispositivos SET status='pausado' WHERE id=$1",[recovered.aparelho.id]);
assert.equal(await invoke(),null,'nao retoma pausado');
await db.query("UPDATE producao_acesso_dispositivos SET status='ativo' WHERE id=$1",[recovered.aparelho.id]);
assert.equal((await db.query(call.replace('22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999'))).rows[0].r,null,'outra instalacao nao toma vinculo');
await db.exec("UPDATE producao_acesso_convites_evento SET revogado_em=now()"); assert.equal(await invoke(),null,'QR revogado recusado');
await db.exec("SET ROLE anon"); await assert.rejects(()=>db.query(call),/permission denied/);
console.log('PASS: reproduz orfao; recupera com papel service_role; idempotencia; pausado; outra instalacao; revogado; ACL anon');
} finally {await db.close();}
