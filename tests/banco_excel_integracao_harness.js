const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const start = source.indexOf('function importarExcelDoPedido(');
const end = source.indexOf('\nwindow.importarExcelDoPedido', start);
assert.ok(start >= 0 && end > start);

(async () => {
    let salvar, id = 123, falhar = false;
    const chamadas = [], renderizados = [], avisos = [];
    const context = vm.createContext({
        window: { BancoExcel: { abrir(callback) { salvar = callback; } } },
        idIntDoPedido: () => id,
        criarBancoDoPedido: async (...args) => {
            chamadas.push(args);
            if (falhar) throw new Error('Falha simulada');
            return { nome: args[1] };
        },
        toast: (...args) => avisos.push(args),
        renderAmostrasOSItens: osId => renderizados.push(osId)
    });
    vm.runInContext(source.slice(start, end), context);
    context.importarExcelDoPedido('os-atual');
    assert.equal(chamadas.length, 0, 'Escolher arquivo nao grava o banco');
    const dados = { nome: 'Clientes', headers: ['Codigo'], rows: [{ Codigo: '0007' }], filename: 'clientes.xlsx' };
    await salvar(dados);
    assert.deepEqual(chamadas[0], [123, dados.nome, dados.headers, dados.rows, dados.filename]);
    assert.deepEqual(renderizados, ['os-atual']);
    falhar = true;
    await assert.rejects(() => salvar(dados), /Falha simulada/);
    assert.equal(renderizados.length, 1, 'Falha nao atualiza a tela como sucesso');
    id = null;
    salvar = null;
    context.importarExcelDoPedido('invalido');
    assert.equal(salvar, null);
    assert.equal(avisos.at(-1)[1], 'error');
    for (const file of ['index.html', 'producao.html']) {
        const html = fs.readFileSync(path.join(root, 'frontend', file), 'utf8');
        const excel = html.indexOf('banco-excel.js?v=');
        assert.ok(excel >= 0 && excel < html.indexOf('script.js?v='), file);
    }
    console.log('Integracao: contrato atual, confirmacao, falha, pedido invalido e duas entradas OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
