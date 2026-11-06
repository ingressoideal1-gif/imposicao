// Banco sintético em memória, sem rede ou dados reais.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.propostas(id_int bigint PRIMARY KEY,id_contato text,id_cliente bigint,id_faturado bigint);
      CREATE TABLE public.contatos(id bigint PRIMARY KEY,id_cliente bigint,nome_contato text,whats text,telefone text);
      INSERT INTO propostas VALUES(11,'7',1,NULL),(12,'8',2,NULL),(13,'7',1,NULL);
      INSERT INTO contatos VALUES(7,1,'Anterior','11999990000','fixo'),(8,2,'Outro','1188880001','outro');
      GRANT SELECT, UPDATE ON propostas, contatos TO service_role;`);
    await db.exec(fs.readFileSync('sql/contatos_lista_arte.sql','utf8'));
    const salvar = (id='7', nome='Anterior', whats='11999990000') => db.query('SELECT * FROM public.imposition_contato_arte_salvar($1,$2,$3,$4,$5,$6)',[11,id,nome,whats,'Novo','1188880000']);
    for(const role of ['anon','authenticated']) {
      await db.exec('SET ROLE '+role);
      await assert.rejects(()=>salvar(),/permission denied/);
      await assert.rejects(()=>db.query('SELECT * FROM public.imposition_contatos_arte_ler(ARRAY[11]::bigint[])'),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await assert.rejects(()=>salvar('8'),/selecionado mudou/);
    await assert.rejects(()=>salvar('7','Desatualizado'),/outro usuario/);
    assert.deepEqual((await salvar()).rows,[{pedido:11,contato_id:'7',nome:'Novo',whatsapp:'1188880000',valido:true}]);
    await assert.rejects(()=>salvar(),/outro usuario/);
    const ambos=(await db.query('SELECT * FROM public.imposition_contatos_arte_ler(ARRAY[11,13]::bigint[])')).rows;
    assert.equal(ambos.length,2); assert.ok(ambos.every(r=>r.nome==='Novo'));
    assert.deepEqual((await db.query('SELECT nome_contato,whats,telefone FROM contatos ORDER BY id')).rows,[
      {nome_contato:'Novo',whats:'1188880000',telefone:'fixo'}, {nome_contato:'Outro',whats:'1188880001',telefone:'outro'}]);
    await db.exec("UPDATE propostas SET id_contato='8' WHERE id_int=11");
    await assert.rejects(()=>salvar('8','Outro','1188880001'),/nao pertence/);
    console.log('OK: leitura, permissões, vínculo, contato trocado, edição concorrente, gravação e campos preservados');
  } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
