'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'producao-por-cor.js'), 'utf8');
const sandbox = {
    window: { addEventListener() {} },
    document: { getElementById() { return null; }, querySelector() { return null; } },
    console,
    setTimeout,
    CSS: { escape: value => String(value) },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'producao-por-cor.js' });

const filter = sandbox.window.ProducaoPorCorUtils.modelosDoFiltro;
const records = [
    { id: 1, productKey: 'produto-a', colorKey: 'amarela', status: 'Aguardando' },
    { id: 2, productKey: 'produto-a', colorKey: 'azul', status: 'Aguardando' },
    { id: 3, productKey: 'produto-b', colorKey: 'amarela', status: 'Aguardando' },
    { id: 4, productKey: 'produto-a', colorKey: 'amarela', status: 'Impresso' },
];
const result = filter(records, 'produto-a', 'amarela');
if (result.length !== 1 || result[0].id !== 1) {
    throw new Error('o filtro não exigiu produto E cor ao mesmo tempo');
}
console.log('OK: produto A + amarela devolve somente modelos do produto A na cor amarela');
