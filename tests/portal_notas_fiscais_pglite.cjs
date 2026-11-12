// Banco descartável em memória, sem rede nem documentos reais.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
    const db = await PGlite.create();
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated;
            CREATE TABLE propostas (id_int bigint UNIQUE);
            CREATE TABLE pedidos_links_cliente (numero_pedido text, token text, ativo boolean);
            CREATE TABLE notas_fiscais (id_int bigint, tipo_nota text, numero_nf text, url_danfe text,
                created_at timestamptz, status text, ambiente text, data_cancelamento timestamptz);
            CREATE TABLE notas_servico (id_int bigint, numero_nfse text, url_pdf text,
                created_at timestamptz, status text, ambiente text, data_cancelamento timestamptz);
            INSERT INTO propostas VALUES (123),(456),(789);
            INSERT INTO pedidos_links_cliente VALUES ('123','segredo',true),('456','outro',true),
                ('789','revogado',false),('abc','malformado',true),('999999999999999999999','grande',true);
            INSERT INTO notas_fiscais VALUES
                (123,NULL,'1','https://example.test/1.pdf',now(),'AUTORIZADA','producao',NULL),
                (123,'REMESSA','2','https://example.test/2.pdf',now(),'AUTORIZADA','producao',NULL),
                (123,NULL,'3','https://example.test/3.pdf',now(),'CANCELADA','producao',NULL),
                (123,NULL,'4','https://example.test/4.pdf',now(),'AUTORIZADA','homologacao',NULL),
                (123,NULL,'5','https://example.test/5.pdf',now(),'AUTORIZADA','producao',now()),
                (123,NULL,'6','https://example.test/6.pdf',now(),'PENDENTE','producao',NULL),
                (123,NULL,'7',NULL,now(),'AUTORIZADA','producao',NULL),
                (123,NULL,'8','javascript:alert(1)',now(),'AUTORIZADA','producao',NULL),
                (456,NULL,'9','https://example.test/other.pdf',now(),'AUTORIZADA','producao',NULL);
            INSERT INTO notas_servico VALUES
                (123,'10','https://example.test/10.pdf',now(),'AUTORIZADA','producao',NULL),
                (123,'11','https://example.test/11.pdf',now(),'CANCELADA','producao',NULL),
                (123,'12','https://example.test/12.pdf',now(),'AUTORIZADA','homologacao',NULL),
                (123,'13','https://example.test/13.pdf',now(),'AUTORIZADA','producao',now());
        `);
        await db.exec(fs.readFileSync(path.join(__dirname,'../sql/link_cliente_notas_fiscais.sql'),'utf8'));
        await db.exec('SET ROLE anon');
        const ler = async (n,t) => (await db.query('SELECT public.link_cliente_notas_fiscais($1,$2) AS notas',[n,t])).rows[0].notas;
        const notas = await ler('123','segredo');
        assert.deepEqual(notas.map(n=>n.numero).sort(), ['1','10','2']);
        assert.deepEqual(notas.map(n=>n.tipo).sort(), ['NF-e','NF-e de remessa','NFS-e']);
        assert.deepEqual(Object.keys(notas[0]).sort(), ['numero','tipo','url']);
        for (const [n,t] of [['123','outro'],['456','segredo'],['789','revogado'],['abc','malformado'],['999999999999999999999','grande'],['123',null]])
            assert.deepEqual(await ler(n,t), []);
        await assert.rejects(db.query('SELECT * FROM notas_fiscais'), /permission denied/);
        await db.exec('RESET ROLE; UPDATE pedidos_links_cliente SET ativo=false WHERE numero_pedido=\'123\'; SET ROLE authenticated');
        assert.deepEqual(await ler('123','segredo'), []);
        console.log('OK: documentos, ambientes, cancelamento, isolamento, token e privilégios');
    } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
