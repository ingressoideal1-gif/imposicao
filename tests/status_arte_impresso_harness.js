const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function extract(file, name) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const match = new RegExp('(?:async )?function ' + name + '\\(').exec(source);
    assert.ok(match, name);
    return source.slice(match.index, source.indexOf('\n}', match.index) + 2);
}
async function main() {
    let writes = 0;
    const c = vm.createContext({
        state: { osItens: {}, amostrasContainerId: '' },
        modeloEstaAprovado: () => true, podeDestravarModeloAprovado: () => true,
        modeloEmCorrecaoDeArte: () => false, toast() {},
        supabaseClient: { from() { writes++; throw new Error('GravaÃ§Ã£o inesperada'); } }
    });
    vm.runInContext(extract('frontend/script.js', 'bloqueioDeModeloAprovado'), c);
    vm.runInContext(extract('frontend/script.js', 'devolverArteParaAlteracao'), c);
    for (const status of ['Impresso', 'IMPRESSO', ' impresso ']) {
        for (const container of ['', 'cliente-amostras-itens-container']) {
            c.state.amostrasContainerId = container;
            const item = { id: 12, status_impressao: status };
            assert.match(c.bloqueioDeModeloAprovado(item, { amostra_status: 'REPROVADA' }).motivo, /impresso/);
            assert.match(c.bloqueioDeModeloAprovado(item, { status_arte: 'PENDENTE' }).motivo, /impresso/);
            c.state.osItens.vibe_123 = [item];
            assert.equal(await c.devolverArteParaAlteracao(12, 'vibe_123'), false);
            assert.equal(item.status_impressao, status);
        }
    }
    c.state.amostrasContainerId = '';
    assert.equal(c.bloqueioDeModeloAprovado({ status_impressao: 'Aguardando' }, { amostra_status: 'REPROVADA' }), null);
    vm.runInContext(extract('frontend/cliente.js', 'saveAmostraToDB'), c);
    c.state.osItens.vibe_123 = [{ id: 12, status_impressao: 'Impresso' }];
    await assert.rejects(c.saveAmostraToDB(12, 'vibe_123', { amostra_status: 'REPROVADA' }), /impresso/);
    assert.equal(writes, 0, 'bloqueio antes de gravar ou emitir aprovaÃ§Ã£o');
    console.log('OK: painel, cliente, permissao de gerencia, normalizacao e retorno para correcao.');

}
main().catch(e => { console.error(e); process.exitCode = 1; });
