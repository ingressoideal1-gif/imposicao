const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const fonte = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
const inicio = fonte.indexOf("        folha_a_folha: mode === 'print'");
const fim = fonte.indexOf('        // CAMAROTE:', inicio);
const escolhas = new Function('mode', 'document', `return ({${fonte.slice(inicio, fim)}});`);
for (const folha of [false, true]) {
    for (const bloco of [false, true]) {
        for (const reversa of [false, true]) {
            for (const modo of ['print', 'pdf']) {
                const document = { getElementById(id) { return { checked: {
                    'ped-print-sheet-by-sheet': folha,
                    'ped-entregar-por-bloco': bloco,
                    'ped-print-reverse': reversa
                }[id] }; } };
                const payload = escolhas(modo, document);
                assert.equal(payload.folha_a_folha, modo === 'print' && folha && !reversa);
                assert.equal(payload.confirmar_entrega, modo === 'print' && (folha || bloco) && !reversa);
            }
        }
    }
}

const a = fonte.indexOf('await entrega.entregar([{ name: fileObj.name, blob: fBlob }]);');
const b = fonte.indexOf('\n                                    } else {', a);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const entregar = new AsyncFunction('entrega', 'fetch', 'fileObj', `
    const fBlob = {}; const baseUrl = 'http://estacao'; const headers = {};
    const impositionAbortController = new AbortController(); let cancelouNoMeio = false;
    for (let i = 0; i < 1; i++) { ${fonte.slice(a, b)} }
`);

(async () => {
    const eventos = [];
    const entrega = { falhas: 0, cancelado: false, async entregar() { eventos.push('envio'); } };
    const fetch = async (url, opts) => {
        assert.deepEqual(eventos, ['envio']);
        assert.equal(url, 'http://estacao/api/impose/confirmar-entrega');
        assert.deepEqual(JSON.parse(opts.body), { token: 'lote-atual' });
        eventos.push('confirmacao');
        return { ok: true };
    };
    await entregar(entrega, fetch, { token_entrega: 'lote-atual' });
    assert.deepEqual(eventos, ['envio', 'confirmacao']);
    const naoConfirmar = () => { throw new Error('confirmacao indevida'); };
    await assert.rejects(entregar({ ...entrega, falhas: 1 }, naoConfirmar, {}), /Envio do lote falhou/);
    await entregar({ ...entrega, cancelado: true }, naoConfirmar, {});
    await entregar(entrega, naoConfirmar, {}); // agente anterior: sem token
    await assert.rejects(entregar(entrega, async () => ({ ok: false }),
        { token_entrega: 'lote-atual' }), /Nao foi possivel confirmar/);
    console.log('OK: escolhas do painel, envio antes da confirmacao, falha e cancelamento.');
})().catch(e => { console.error(e); process.exitCode = 1; });
