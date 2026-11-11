const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const fields = {};
const alerts = [];
let answer = null;
const ctx = {
    console, Set,
    document: { getElementById: id => fields[id] || null, addEventListener() {} },
    alert: text => alerts.push(text), prompt: () => answer,
    requestAnimationFrame() {},
};
ctx.window = ctx;
ctx.addEventListener = () => {};
ctx.atualizarEstatisticasMapa = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/mapas.js'), 'utf8'), ctx);
ctx.atualizarEstatisticasMapa = () => {};
function setup(inicio = '001', fim = '004', digitos = '', padrao = 'sequencial') {
    for (const [id, value] of Object.entries({ prefix: 'A', inicio, fim, digitos, padrao })) {
        fields[`mapa-fileira-${id}`] = { value };
    }
    ctx.state.mapaAtual = { config: { setores: [{ nome: 'Plateia', fileiras: [], cadeiras: {} }] } };
    ctx.state.mapaHistory = [];
    ctx.setorSelecionadoIdx = 0;
    ctx.cadeirasSelecionadas = new Set();
    alerts.length = 0;
}
const setor = () => ctx.state.mapaAtual.config.setores[0];
const nums = () => Array.from(Object.values(setor().cadeiras), c => c.num);
setup();
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), ['001', '002', '003', '004']);
setup('1', '4', '4');
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), ['0001', '0002', '0003', '0004']);
const key = '-12,0';
setor().cadeiras[key].tipo = 'PCD';
const before = JSON.stringify(setor());
answer = 'K-009';
// Exercita o clique no canvas com a ferramenta de edição.
for (const id of ['tool-select', 'tool-erase', 'tool-edit']) fields[id] = { style: {} };
ctx.setMapTool('edit');
vm.runInContext('mapCanvas = { getBoundingClientRect: () => ({left: 0, top: 0}) };', ctx);
ctx.onMapMouseDown({ button: 0, clientX: -12 * 32 + 1, clientY: 1 });
assert.equal(setor().cadeiras[key].prefixo, 'K');
assert.equal(setor().cadeiras[key].num, '009');
assert.equal(setor().cadeiras[key].tipo, 'PCD');
assert.equal(setor().cadeiras[key].bloco, 'A');
answer = 'L-010';
ctx.editarLugarMapa(key);
assert.equal(setor().cadeiras[key].bloco, 'A');
ctx.state.mapaAtual.config = ctx.state.mapaHistory.pop();
assert.equal(Object.keys(setor().cadeiras).length, 4);
assert.equal(setor().fileiras[0].prefixo, 'A');
assert.equal(setor().nome, 'Plateia');
// Persistência JSON conserva os zeros e a posição.
ctx.state.mapaAtual = JSON.parse(JSON.stringify(ctx.state.mapaAtual));
assert.equal(setor().cadeiras[key].num, '009');
for (const value of [null, '', 'inválido', 'A-0001']) {
    const snapshot = JSON.stringify(setor());
    answer = value;
    ctx.editarLugarMapa(key);
    assert.equal(JSON.stringify(setor()), snapshot);
}
// Simula apenas a atualização visual do sidebar; usa o desfazer real.
ctx.renderSetoresList = () => {};
ctx.carregarSetorNoSidebar = () => {};
ctx.atualizarHeaderSetor = () => {};
ctx.atualizarEstatisticasMapa = () => {};
ctx.undoMapHistory();
assert.equal(JSON.stringify(setor()), before);
setup('001', '006', '', 'par');
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), ['002', '004', '006']);
setup('1', '3');
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), [1, 2, 3]);
setup('001', '001');
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), ['001']);
setup('98', '101', '2');
ctx.gerarFileiraNoCanvas();
assert.deepEqual(nums(), ['98', '99', '100', '101']);
for (const args of [['4', '1'], ['', '4'], ['1x', '4'], ['1', '4', '0'], ['1', '4', '17']]) {
    setup(...args);
    ctx.gerarFileiraNoCanvas();
    assert.equal(Object.keys(setor().cadeiras).length, 0);
    assert.equal(ctx.state.mapaHistory.length, 0);
    assert.equal(alerts.length, 1);
}
console.log('OK: zeros, dígitos, limites, clique para editar, posição, duplicidade, cancelamento e desfazer.');
