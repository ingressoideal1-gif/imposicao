// Vetores do contrato, conferidos em Node independentemente do gerador Python.
// Subconjunto JCS desta versão: objetos com chaves ASCII, strings, bool e null.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vetores = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/idempotencia-portal-v1-vetores.json'), 'utf8'));
function canonico(v) {
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'string') {
        assert(v.isWellFormed() && !v.includes('\0'));
        return JSON.stringify(v);
    }
    assert(v && typeof v === 'object' && !Array.isArray(v));
    return '{' + Object.keys(v).sort().map(k => {
        assert(/^[a-z_]+$/.test(k));
        return JSON.stringify(k) + ':' + canonico(v[k]);
    }).join(',') + '}';
}
for (const v of vetores) {
    const serializado = canonico(v.envelope);
    assert.equal(serializado, v.canonico, v.nome);
    assert.equal(crypto.createHash('sha256').update(serializado, 'utf8').digest('hex'), v.sha256_hex, v.nome);
    const invertido = Object.fromEntries(Object.entries(v.envelope).reverse());
    assert.equal(canonico(invertido), serializado);
    assert(!Object.hasOwn(v.envelope, 'token') && !Object.hasOwn(v.envelope, 'requisicao_id'));
}
assert.equal(new Set(vetores.map(v => v.sha256_hex)).size, vetores.length);
console.log(`${vetores.length} vetores conferidos: bytes canonicos, SHA-256, ordem das chaves e entradas distintas.`);
