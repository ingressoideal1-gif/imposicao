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
    inicio: '2026-10-15', fim: '2026-10-15', normalizar: s => s
};
assert.deepEqual(calcular(base).linhas, [{ nome: 'Ingresso', setor: 'Sem setor', pedidos: 1, total: 2000, impresso: 1200 }]);
assert.equal(calcular(base).semPrazo, 1);
assert.equal(calcular({ ...base, fim: '2026-10-16' }).linhas[0].total, 2100);
for (const status of ['EM ARTE', 'EM PRODUCAO', 'EXPEDICAO', 'EXPEDIDO', 'ENTREGUE', 'CANCELADO']) {
    const dados = { ...base, ordens: base.ordens.map(os => ({ ...os, status_interno: status })) };
    assert.equal(calcular(dados).linhas[0].total, 2000, status);
    assert.equal(calcular(dados).linhas[0].impresso, 1200, status);
}
assert.equal(calcular({ ...base, inicio: '2026-11-01', fim: '2026-11-01' }).linhas.length, 0);
assert.equal(calcular({ ...base, modelos: { 1: [...base.modelos[1], base.modelos[1][0]] } }).linhas[0].total, 2000);
assert.equal(calcular({ ...base, modelos: {}, itens: {} }).semItens, 1);
assert.deepEqual(calcular({ ...base, modelos: {}, itens: {}, produtos: [
    { id: 100, id_int: 1, id_produto: 7, nome_produto: 'Ingresso', qtd: 900 }
] }).linhas, [{ nome: 'Ingresso', setor: 'Sem setor', pedidos: 1, total: 900, impresso: 0 }]);
// A fotografia do dashboard não passa pela porta de entrada da fila operacional.
const script = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const inicio = script.indexOf('        const pedidosDashboard = new Map();');
const fim = script.indexOf('        // Converter para array ordenado', inicio);
const snapshot = { state: { ordens: [{ numero: 99 }] },
    produtos: [{ id_int: 1 }, { id_int: 2 }, { id_int: 2 }],
    propostas: [{ id_int: 2 }, { id_int: 3 }],
    criarOS: numero => ({ numero }) };
vm.runInNewContext(script.slice(inicio, fim), snapshot);
assert.deepEqual(Array.from(snapshot.state.ordensDashboardProducao, os => os.numero), [1, 2, 3]);
assert.deepEqual(snapshot.state.ordens, [{ numero: 99 }]);
console.log('Dashboard: todos os status, expedidos, entregues, soma, TICKET, período e base própria sem alterar a fila OK.');

const setores = calcular({ ...base, catalogo: [{ id_produto: 7, nome_produto: 'Ingresso', setor_pcp: ' têxtil ' }] });
assert.equal(setores.linhas[0].setor, 'TEXTIL');
assert.equal(setores.linhas[0].total, 2000);
assert.equal(setores.linhas[0].impresso, 1200);
const misto = calcular({ ...base, modelos: {1: [
    {id:1,id_produto:7,quantidade:100,impressao:'Impresso'},
    {id:2,id_produto:8,quantidade:200}, {id:3,id_produto:9,quantidade:300,setor:'PVC'}
]}, catalogo: [ {id_produto:7,nome_produto:'Mesmo nome',setor_pcp:'LASER'},
{id_produto:8,nome_produto:'Mesmo nome',setor_pcp:'FLEXO'}, {id_produto:9,nome_produto:'Sem vínculo',setor_pcp:''} ] });
assert.deepEqual(misto.linhas.map(p=>p.setor), ['Sem setor','FLEXO','LASER']);
assert.equal(misto.linhas.reduce((s,p)=>s+p.total,0),600);
assert.equal(misto.linhas.reduce((s,p)=>s+p.impresso,0),100);

// Um pedido com dois modelos do produto conta uma vez; outro pedido conta mais um.
assert.equal(calcular(base).linhas[0].pedidos, 1);
assert.equal(calcular({...base, fim:'2026-10-16'}).linhas[0].pedidos, 2);
assert.equal(calcular({...base, modelos:{1:[...base.modelos[1],base.modelos[1][0]]}}).linhas[0].pedidos,1);
assert(misto.linhas.every(p => p.pedidos === 1));
