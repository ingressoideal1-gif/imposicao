const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const ler = nome => fs.readFileSync(path.join(__dirname, '../frontend', nome), 'utf8').replace(/\r\n/g, '\n');
const script = ler('script.js');
const pedido = ler('pedido.js');
function extrair(fonte, nome) {
    const inicio = fonte.indexOf(`function ${nome}(`);
    assert(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
global.window = {};
const state = {
    produtosGlobais: [{ id_produto: 101, tipo_blocagem: '10' },
        { id_produto: 9000, tipo_blocagem: null }, { id_produto: 22, tipo_blocagem: '25' }],
    formatos: [{ id: 'f', default_sheets_per_block: 50 }],
    osItens: { teste: [] }, selectedOSItems: []
};
const elementos = {
    'ped-formato': { value: 'f' }, 'ped-sheets-per-block': { value: 50 }
};
const document = { getElementById: id => elementos[id] || null };
const nomes = ['blocagemDoModelo', 'blocagemDaSelecao', 'itemAtivoDoPedido', 'itensDaImposicao'];
const api = new Function('state', 'document', 'rotacaoDaFolhaDoFormato', 'atualizarBandejaCapaMiolo',
    nomes.map(n => extrair(script, n)).join('\n') + '\n' + extrair(pedido, 'applyPedFormatoDefaults') +
    '\nreturn {' + nomes.join(',') + ', applyPedFormatoDefaults};')(state, document, () => 0, () => {});

for (const vazio of [undefined, null, '', '  ']) {
    assert.equal(api.blocagemDoModelo({ bloco: vazio }).folhas, 10);
    assert.equal(api.blocagemDoModelo({ bloco: vazio, _vibe_id_produto: 9000 }).folhas, 10);
    assert.equal(api.blocagemDoModelo({ bloco: vazio, id_produto: 22 }).folhas, 25);
}
const modelo = { id: 'm', _vibe_id_produto: 101, bloco: null };
const antes = JSON.stringify(modelo);
assert.equal(api.blocagemDoModelo(modelo).folhas, 10);
assert.equal(JSON.stringify(modelo), antes, 'fallback nao grava no modelo');
assert.equal(api.blocagemDoModelo({ ...modelo, bloco: '50' }).folhas, 50);
assert.equal(api.blocagemDoModelo({ ...modelo, bloco: '200' }).folhas, 200);
assert.equal(api.blocagemDoModelo({ ...modelo, bloco: '50', cutstack_folhas: 20 }).folhas, 20);

state.osItens.teste = [modelo];
state.activeOSItem = { osId: 'teste', itemId: 'm' };
api.applyPedFormatoDefaults();
assert.equal(elementos['ped-sheets-per-block'].value, 10, 'produto vence o formato 50');
modelo.bloco = '50';
api.applyPedFormatoDefaults();
assert.equal(elementos['ped-sheets-per-block'].value, 50, 'modelo salvo continua 50');
modelo.bloco = null;
api.applyPedFormatoDefaults();
assert.equal(elementos['ped-sheets-per-block'].value, 10, 'nao herda o 50 anterior');

state.osItens.teste.push({ id: 'n', bloco: 50 });
state.selectedOSItems = ['m', 'n'].map(itemId => ({ osId: 'teste', itemId }));
assert.throws(() => api.blocagemDaSelecao(), /blocagens diferentes/);
state.osItens.teste[1].bloco = 10;
assert.equal(api.blocagemDaSelecao().folhas, 10);

// Executar as expressoes reais dos dois payloads, com DOM obsoleto em 50.
elementos['ped-sheets-per-block'].value = 50;
for (const fonte of [script, pedido]) {
    const inicio = fonte.indexOf('        sheets_per_block: isMultiSelected');
    const fim = fonte.indexOf('\n', fonte.indexOf(')),', inicio));
    const trecho = fonte.slice(inicio, fim).trim().replace(/,$/, '');
    const payload = new Function('isMultiSelected', 'blocagemDaSelecao', 'itemAtivoDoPedido',
        'blocagemDoModelo', 'document', `return ({${trecho}});`)(false, api.blocagemDaSelecao,
            api.itemAtivoDoPedido, api.blocagemDoModelo, document);
    assert.equal(payload.sheets_per_block, 10, 'payload do modelo ignora valor residual');
}
console.log('OK: padrao 10, cadastro do produto, valores salvos, previa, payloads e combinacao.');
