const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contexto = { console, FormData, AbortController, setTimeout, clearTimeout,
    crypto: require('node:crypto').webcrypto };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/arte-de-impressao.js'), 'utf8'), contexto);
const conferir = contexto.conferirRecursosDoMotor;
const atualizado = { capabilities: ['texto_banco_contorno_v1', 'escala_modelo_blocos_v1'] };
const num = { elements: [{ type: 'TEXT', database_text: true, text_stroke_mm: 0.4 }] };
const bloco = { schema: 'cut_stack', cut_stack_mode: 'strict_assembly', arte_escala_h: 104 };

for (const print_mode of ['front', 'duplex', 'duplex_unico', 'pdf_odd_even']) {
    for (const chave of ['numeracao', 'numeracao_2']) {
        for (const combinado of [false, true]) {
            const modelo = { [chave]: num, print_mode };
            const payload = combinado ? { multi_artes: [modelo] } : modelo;
            assert.throws(() => conferir(payload, { version: 'NewProd 1.2.399-teste.1' }), /contorno/);
            assert.doesNotThrow(() => conferir(payload, atualizado));
            assert.doesNotThrow(() => conferir(payload, { version: 'NewProd 1.2.400' }));
            assert.throws(() => conferir(payload, { version: 'NewProd 1.2.400-teste.1' }), /contorno/);
        }
    }
}
for (const schema of ['cut_stack', 'multi_artes']) {
    assert.throws(() => conferir({ ...bloco, schema }, { version: 'NewProd 1.2.400' }), /escala/);
    assert.doesNotThrow(() => conferir({ ...bloco, schema }, atualizado));
    assert.doesNotThrow(() => conferir({ ...bloco, schema }, { version: 'NewProd 1.2.399-teste.1' }));
}
for (const payload of [
    {}, { ...bloco, arte_escala_h: 100 }, { ...bloco, schema: 'sequential' },
    { ...bloco, schema: 'pdf_multiple' }, { ...bloco, cut_stack_mode: 'independent' },
    { ...bloco, multi_artes: [{ escala_h: 104 }] },
    { numeracao: { elements: [{ ...num.elements[0], text_stroke_mm: 0 }] } },
    { numeracao: { elements: [{ ...num.elements[0], database_text: false }] } },
    { numeracao: { elements: [{ ...num.elements[0], type: 'FIXED' }] } },
]) assert.doesNotThrow(() => conferir(payload, {}));

(async () => {
    // A recusa ocorre na barreira real, antes de consultar pedidos, baixar
    // artes ou enviar ao motor. Nenhuma conexao real e feita neste teste.
    for (const payload of [bloco, { numeracao: num }, { numeracao_2: num }]) {
        const chamadas = [];
        contexto.fetch = async url => {
            chamadas.push(url);
            assert.equal(url, 'http://estacao.test/api/version');
            return { ok: true, json: async () => ({ capabilities: ['integridade_impressao_v1'] }) };
        };
        const fd = new FormData();
        fd.set('payload', JSON.stringify(payload));
        const original = fd.get('payload');
        await assert.rejects(contexto.confirmarIntegridadeDoTrabalho(fd, 'http://estacao.test', {}, {
            from() { assert.fail('Nao consultar pedidos com motor incompativel'); }
        }), /Atualize o NewProd/);
        assert.equal(fd.get('payload'), original);
        assert.equal(chamadas.length, 1);
    }
    console.log('OK: compatibilidade de contorno, escala, faces e recusa antes do envio');
})().catch(error => { console.error(error); process.exitCode = 1; });
