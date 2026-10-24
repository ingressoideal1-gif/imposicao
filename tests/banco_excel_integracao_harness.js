const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const start = source.indexOf('async function carregarImportadorExcel(');
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
    await context.importarExcelDoPedido('os-atual');
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
    await context.importarExcelDoPedido('invalido');
    assert.equal(salvar, null);
    assert.equal(avisos.at(-1)[1], 'error');
    for (const href of ['http://127.0.0.1:9000/', 'http://localhost:9001/', 'https://imposicao.pages.dev/']) {
        const scripts = [];
        const loader = vm.createContext({ window: {}, URL, location: new URL(href),
            document: { createElement: () => ({ remove() {} }), head: { appendChild: s => scripts.push(s) } } });
        vm.runInContext(source.slice(start, end), loader);
        const failed = loader.carregarImportadorExcel();
        assert.ok(scripts[0].src.startsWith(href.startsWith('http:') ? 'https://imposition.ai-ideal.com.br/' : href));
        scripts[0].onerror();
        await assert.rejects(() => failed, /conexão/);
        const retry = loader.carregarImportadorExcel();
        const api = { abrir() {} };
        loader.window.BancoExcel = api;
        scripts[1].onload();
        assert.equal(await retry, api);
    }
    console.log('Integracao: contrato atual, confirmacao, falha, pedido invalido, carregamento web/estacoes e retry OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
