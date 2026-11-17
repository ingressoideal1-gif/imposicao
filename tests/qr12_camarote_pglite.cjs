// PostgreSQL em memoria; nenhum acesso a banco, credenciais ou pool reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const scalar = async q => Object.values((await db.query(q)).rows[0])[0];
let checks = 0;
async function reject(q, pattern) {
  await assert.rejects(db.exec(q),pattern);
  await db.exec('ROLLBACK');
  checks++;
}
(async () => {
  try {
    for(const p of ['tests/qr12_schema_fixture.sql','sql/ideal_control_qr12.sql',
      'sql/ideal_control_qr12_suspensao.sql','sql/ideal_control_qr12_suspensao_piloto.sql',
      'sql/ideal_control_qr12_base_independente.sql','tests/fixtures/qr12_pre_camarote.sql']) await db.exec(read(p));
    await db.exec(`UPDATE producao_acesso_qr_controle SET ativo=true;
      ALTER TABLE producao_numeracoes ADD COLUMN name text;
      INSERT INTO producao_numeracoes(id,tipo,ticket_qtd,elements,name) VALUES
      ('cam','CAMAROTE',1,'[{"type":"QR_IDEAL"}]','teatro1'),
      ('teatro','TEATRO',1,'[{"type":"QR_IDEAL"}]','CAMAROTE'),
      ('ticket','TICKET',2,'[{"type":"QR_IDEAL","ticket_pos":2}]','qualquer'),
      ('outro','OUTRO',1,'[{"type":"QR_IDEAL"}]','SEQUENCIAL');
      INSERT INTO pedidos_modelos VALUES
      (21,121,6,7,now(),'cam'),(22,121,4,20,now(),'cam'),
      (23,122,3,1,now(),'qr'),(24,123,3,1,now(),'teatro'),
      (25,124,3,1,now(),'ticket'),(26,125,3,1,now(),'outro');`);
    await reject('SELECT producao_acesso_qr_contratos_obter(121)',/QR v2 exige/);
    assert.equal(await scalar('SELECT count(*)::int FROM producao_acesso_qr_reservas WHERE pedido=121'),0);checks++;
    const previous = await scalar('SELECT producao_acesso_qr_contratos_obter(122)');
    const grants = await scalar("SELECT proacl::text FROM pg_proc WHERE oid='producao_acesso_qr_contratos_obter(integer)'::regprocedure");
    const migration=read('sql/qr12_camarote_20261117.sql');
    await db.exec(migration);
    assert.equal(await scalar("SELECT proacl::text FROM pg_proc WHERE oid='producao_acesso_qr_contratos_obter(integer)'::regprocedure"),grants);checks++;
    const cams=await scalar('SELECT producao_acesso_qr_contratos_obter(121)');
    assert.deepEqual(cams.map(c=>[c.modelo,c.versao,c.inicio,c.quantidade,c.passo,c.posicao,c.capacidade]),
      [[21,2,7,6,1,1,6],[22,2,20,4,1,1,4]]);checks++;
    assert.equal(await scalar(`SELECT count(*)::int FROM producao_acesso_qr_reservas a
      JOIN producao_acesso_qr_reservas b ON a.modelo<b.modelo AND a.faixa && b.faixa
      WHERE a.versao=2 AND b.versao=2`),0);checks++;
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(121)'),cams);checks++;
    await db.exec("UPDATE producao_numeracoes SET name='outro nome' WHERE id='cam'");
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(121)'),cams);checks++;
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(122)'),previous);checks++;
    assert.equal((await scalar('SELECT producao_acesso_qr_contratos_obter(123)'))[0].passo,1);checks++;
    assert.equal((await scalar('SELECT producao_acesso_qr_contratos_obter(124)'))[0].passo,2);checks++;
    await reject('SELECT producao_acesso_qr_contratos_obter(125)',/QR v2 exige/);
    await db.exec('UPDATE pedidos_modelos SET quantidade=7 WHERE id=21');
    await reject('SELECT producao_acesso_qr_contratos_obter(121)',/mudou/);
    await db.exec('UPDATE pedidos_modelos SET quantidade=6 WHERE id=21');
    for(const element of [{type:'QR_IDEAL',fixed:true},{type:'QR_IDEAL',source:'database'}]) {
      await db.query("UPDATE producao_numeracoes SET elements=$1 WHERE id='outro'",[JSON.stringify([element])]);
      await db.exec("UPDATE producao_numeracoes SET tipo='CAMAROTE' WHERE id='outro'");
      await reject('SELECT producao_acesso_qr_contratos_obter(125)',/QR v2 exige/);
    }
    await reject(migration,/Definicao QR mudou/);
    const before=await scalar('SELECT jsonb_agg(to_jsonb(c) ORDER BY modelo) FROM producao_acesso_qr_contratos c');
    await db.exec(read('sql/qr12_camarote_20261117_rollback.sql'));
    assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(c) ORDER BY modelo) FROM producao_acesso_qr_contratos c'),before);checks++;
    assert.deepEqual(await scalar('SELECT producao_acesso_qr_contratos_obter(121)'),cams);checks++;
    await db.exec("INSERT INTO pedidos_modelos VALUES(27,126,3,1,now(),'cam')");
    await reject('SELECT producao_acesso_qr_contratos_obter(126)',/QR v2 exige/);
    console.log(`${checks} verificacoes SQL CAMAROTE passaram.`);
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
