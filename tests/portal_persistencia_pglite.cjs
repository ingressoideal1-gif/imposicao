// Executa o mesmo teste SQL em PostgreSQL/WASM exclusivamente em memória.
// A biblioteca é fornecida externamente via PGLITE_MODULE; não muda dependências do projeto.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const raiz = path.resolve(__dirname, '..');
async function main() {
    const inicial = await PGlite.create();
    let snapshot;
    try {
        await inicial.exec('CREATE DATABASE portal_persistencia_teste');
        snapshot = await inicial.dumpDataDir();
    } finally { await inicial.close(); }
    const db = await PGlite.create({ loadDataDir: snapshot, database: 'portal_persistencia_teste' });
    try {
        const { rows } = await db.query('SELECT current_database() AS banco, inet_server_addr() AS host, version() AS versao');
        assert.equal(rows[0].banco, 'portal_persistencia_teste');
        assert.equal(rows[0].host, null);
        let sql = fs.readFileSync(path.join(__dirname, 'portal_persistencia_sql.sql'), 'utf8');
        sql = sql.replace(/^\\ir \.\.\/sql\/link_cliente_finalizar\.sql\r?$/m,
            () => fs.readFileSync(path.join(raiz, 'sql/link_cliente_finalizar.sql'), 'utf8'));
        sql = sql.replace(/^\\(?:set|echo)[^\r\n]*\r?$/gm, '');
        assert.ok(!/^\\/m.test(sql), 'metacomando inesperado');
        await db.exec(sql);
        console.log('OK: integração SQL completa em PostgreSQL/PGlite descartável.');
        console.log(rows[0].versao);
    } finally { await db.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
