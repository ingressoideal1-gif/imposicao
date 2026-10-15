const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const contexto = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/dashboard-arte.js'), 'utf8').split('// DASHBOARD_PRODUCAO_INICIO')[1], contexto);
const calcular = dados => JSON.parse(JSON.stringify(contexto.module.exports.calcular(dados)));
const base = {
    ordens: [{ id: 'a', numero: 1, prazo_entrega: '2026-10-15T09:00:00' }, { id: 'b', numero: 2, prazo_entrega: '2026-10-16' }, { id: 'c', numero: 3 }],
    modelos: { 1: [
        { id: 10, id_produto_proposta_origem: 100, quantidade: 1200, impressao: 'Impresso', ticket_qtd: 3 },
        { id: 11, id_produto_proposta_origem: 100, quantidade: 800, impressao: 'Aguardando' }
    ] },
    itens: { a: [{ quantidade: 9999 }], b: [{ id_produto: 7, quantidade: 100, impressao: 'Impresso' }] },
    produtos: [{ id: 100, id_produto: 7, nome_produto: 'Ingresso' }], catalogo: [],
    inicio: '2026-10-15', fim: '2026-10-15', elegivel: () => true, normalizar: s => s
};
assert.deepEqual(calcular(base).linhas, [{ nome: 'Ingresso', total: 2000, impresso: 1200 }]);
assert.equal(calcular(base).semPrazo, 1);
assert.equal(calcular({ ...base, fim: '2026-10-16' }).linhas[0].total, 2100);
assert.equal(calcular({ ...base, elegivel: () => false }).linhas.length, 0);
assert.equal(calcular({ ...base, inicio: '2026-11-01', fim: '2026-11-01' }).linhas.length, 0);
assert.equal(calcular({ ...base, modelos: { 1: [...base.modelos[1], base.modelos[1][0]] } }).linhas[0].total, 2000);
assert.equal(calcular({ ...base, modelos: {}, itens: {} }).semItens, 1);
console.log('Dashboard: período inclusivo, soma por produto, impressão parcial, TICKET, exclusões e ausência de dados OK.');
