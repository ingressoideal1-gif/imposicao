const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const db=await PGlite.create();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE propostas(id_int bigint PRIMARY KEY,id_cliente bigint,id_contato text);
 CREATE TABLE contatos(id bigint PRIMARY KEY,id_cliente bigint,whats text);
 CREATE TABLE chatguru_contatos_importados(fonte text,chat_id text,telefone_valido boolean,cadastro timestamp,ultima_mensagem timestamp,origem_em timestamptz);
 CREATE TABLE chatguru_contatos_3478(fonte text,chat_id text,codigo_cliente text,nome_chatguru text,telefone_normalizado text,whatsapp_remetente text);
 INSERT INTO propostas VALUES(11,1,'7'),(12,1,'7'),(13,2,NULL),(14,3,NULL);
 INSERT INTO contatos VALUES(7,1,'11999990000');
 INSERT INTO chatguru_contatos_3478 VALUES
 ('guru','aaaaaaaaaaaaaaaaaaaaaaaa','1','Contato A','5511999990000','555195343478'),
 ('guru','bbbbbbbbbbbbbbbbbbbbbbbb','1','Contato B','5511888880000','555195343478'),
 ('guru','cccccccccccccccccccccccc','2','Outro cliente','5511777770000','555195343478'),
 ('guru','dddddddddddddddddddddddd','1','Outro remetente','5511666660000','5551999999999');
 INSERT INTO chatguru_contatos_importados SELECT fonte,chat_id,true,'2020-01-01',CASE WHEN nome_chatguru='Contato B' THEN '2021-01-01'::timestamp ELSE '2020-01-01'::timestamp END,'2026-01-01' FROM chatguru_contatos_3478;
 GRANT SELECT,UPDATE ON propostas,contatos,chatguru_contatos_importados,chatguru_contatos_3478 TO service_role;`);
 await db.exec(fs.readFileSync('sql/lista_arte_contatos_guru_selecao.sql','utf8'));
 await db.exec('SET ROLE service_role');
 const read=async(n=11)=>(await db.query('SELECT * FROM imposition_arte_guru_ler(ARRAY[$1]::bigint[])',[n])).rows[0];
 const select=(r,id)=>db.query('SELECT * FROM imposition_arte_guru_selecionar($1,$2,$3,$4)',[r.pedido,id,r.revisao,'00000000-0000-4000-8000-000000000001']);
 let r=await read();assert.equal(r.opcoes.length,2);assert.equal(r.nome,'Contato A');
 assert.equal((await read(14)).valido,false);
 await assert.rejects(()=>select(r,'guru#cccccccccccccccccccccccc'),/indisponivel/);
 await assert.rejects(()=>select(r,'guru#dddddddddddddddddddddddd'),/indisponivel/);
 await select(r,'guru#bbbbbbbbbbbbbbbbbbbbbbbb');
 assert.equal((await read()).nome,'Contato B');assert.equal((await read(12)).nome,'Contato A');
 await assert.rejects(()=>select(r,'guru#aaaaaaaaaaaaaaaaaaaaaaaa'),/alterada/);
 assert.equal((await db.query('SELECT count(*)::int n FROM imposition_arte_contatos_guru_historico')).rows[0].n,1);
 assert.equal((await db.query('SELECT whats FROM contatos WHERE id=7')).rows[0].whats,'11999990000');
 await db.exec("UPDATE contatos SET whats=NULL WHERE id=7");
 assert.equal((await read(12)).nome,'Contato B','mais recente na ausência de correspondência ERP');
 r=await read();await db.exec("UPDATE propostas SET id_cliente=2 WHERE id_int=11");
 assert.equal((await read()).valido,false,'troca de cliente não muda destino silenciosamente');
 await assert.rejects(()=>select(r,'guru#aaaaaaaaaaaaaaaaaaaaaaaa'),/alterada/);
 await db.exec("UPDATE propostas SET id_cliente=1 WHERE id_int=11;UPDATE chatguru_contatos_3478 SET codigo_cliente='9' WHERE chat_id='bbbbbbbbbbbbbbbbbbbbbbbb'");
 assert.equal((await read()).valido,false,'contato removido exige seleção explícita');
 for(const role of ['anon','authenticated']){
  await db.exec('RESET ROLE;SET ROLE '+role);await assert.rejects(()=>read(),/permission denied/);
 }
 console.log('OK: opções 3478, cliente, padrão ERP/recente, persistência isolada, conflitos, remoção, auditoria, RLS');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
