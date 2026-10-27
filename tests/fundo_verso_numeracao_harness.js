const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extract(start, end) {
    const i = source.indexOf(start);
    assert(i >= 0, start);
    return source.slice(i, source.indexOf(end, i) + end.length);
}
const nodes = {};
const state = {
    numFormato: {}, bgLoadToken: 0, bgManualTokens: {front: 0, back: 0},
    numeracoes: [{id: 'n1', Cli_Num: 10, bg_url: '', bg_verso_url: ''}]
};
const uploads = [];
const c = vm.createContext({
    state, console, Blob, URL, pdfjsLib: {},
    document: {getElementById(id) {
        return nodes[id] ||= {style: {}, value: id === 'num-id' ? 'n1' : '', textContent: ''};
    }},
    drawCanvas() {}, initCanvas() {}, toast() {}, atualizarRestricaoModoVibe() {},
    fetchPdfBytes: async url => url,
    uploadToStorage: async (file, name, folder, options) => {
        uploads.push(options.objectPath); return options.objectPath;
    }
});
c.window = c;
c.rasterizePdfToImage = async bytes => ({bytes});
for (const name of ['atualizarControlesFundoVerso', 'bancoGuardaFundoVerso', 'bancoGuardaArteDeFundo',
    'numeracaoDoEditorGuardaFundo', 'atualizarAvisoDaArteDeFundo', 'temVerso']) {
    vm.runInContext(extract('function ' + name + '(', '\n}'), c);
}
for (const name of ['clearBgImage', 'carregarBgSalvo', 'onNumPrintModeChange']) {
    vm.runInContext(extract('window.' + name + ' = ', '\n};'), c);
}
vm.runInContext(extract('async function loadBgImage(', '\n}'), c);
vm.runInContext(extract('async function duplicarFundoNoStorage(', '\n}'), c);
const file = name => ({name, arrayBuffer: async () => name});
(async () => {
    for (const mode of ['front', 'duplex', 'duplex_unico']) {
        c.document.getElementById('num-print-mode').value = mode;
        c.onNumPrintModeChange();
        assert.equal(nodes['bg-verso-controls'].style.display, mode === 'front' ? 'none' : 'inline-flex');
    }
    await c.loadBgImage(file('frente.pdf'));
    await c.loadBgImage(file('verso.pdf'), 'back');
    await c.loadBgImage(file('frente2.pdf'));
    assert.equal(state.bgImageVerso.bytes, 'verso.pdf');
    assert.equal(state.bgImage.bytes, 'frente2.pdf');
    c.clearBgImage('front');
    assert.equal(state.bgImage, null);
    assert.equal(state.bgImageVerso.bytes, 'verso.pdf');
    c.clearBgImage('back');
    assert.equal(state.bgUrlVerso, '');
    assert.equal(nodes['btn-remove-bg-verso'].style.display, 'none');
    await c.carregarBgSalvo({bg_url: 'front.pdf', bg_filename: 'front.pdf', bg_verso_url: 'back.pdf', bg_verso_filename: 'back.pdf'});
    assert.equal(state.bgImage.bytes, 'front.pdf');
    assert.equal(state.bgImageVerso.bytes, 'back.pdf');
    c.clearBgImage();
    await c.carregarBgSalvo({bg_verso_url: 'only-back.pdf'});
    assert.equal(state.bgImage, null);
    assert.equal(state.bgImageVerso.bytes, 'only-back.pdf');
    let release;
    c.rasterizePdfToImage = bytes => bytes === 'slow.pdf'
        ? new Promise(resolve => { release = () => resolve({bytes}); }) : Promise.resolve({bytes});
    const slow = c.loadBgImage(file('slow.pdf'), 'back');
    await new Promise(resolve => setImmediate(resolve));
    await c.loadBgImage(file('new.pdf'), 'back');
    release(); await slow;
    assert.equal(state.bgFilenameVerso, 'new.pdf');
    const pending = c.loadBgImage(file('slow.pdf'), 'back');
    await new Promise(resolve => setImmediate(resolve));
    c.clearBgImage(); release(); await pending;
    assert.equal(state.bgImageVerso, null);
    assert.equal(nodes['bg-verso-file-name'].textContent, '');
    // Execute the real save payload block with simulated Storage.
    const i = source.indexOf('        if (bancoGuardaFundoVerso()) {', source.indexOf('window.saveNumeracao'));
    const block = source.slice(i, source.indexOf('// O ID DE QUEM ACABOU DE SER GRAVADO.', i));
    async function save(client, copying) {
        c.data = {}; c.cliNumFinal = client; c.copiandoPorNome = copying; c.numeracaoId = 'dest';
        await vm.runInContext('(async () => {' + block + '})()', c);
        return c.data;
    }
    await c.loadBgImage(file('manual.pdf'), 'back');
    assert.equal((await save(10, false)).bg_verso_url, 'fundos-numeracoes/dest-verso.pdf');
    assert.equal((await save(null, false)).bg_verso_url, '');
    await c.carregarBgSalvo({bg_verso_url: 'saved.pdf', bg_verso_filename: 'saved.pdf'});
    assert.equal((await save(10, false)).bg_verso_url, 'saved.pdf');
    assert.equal((await save(10, true)).bg_verso_url, 'fundos-numeracoes/dest-verso.pdf');
    c.clearBgImage('back');
    assert.equal((await save(10, false)).bg_verso_url, '');
    state.numeracoes = [{id: 'n1', Cli_Num: 10, bg_url: ''}];
    await c.loadBgImage(file('manual.pdf'), 'back');
    assert.equal(c.bancoGuardaFundoVerso(), false);
    assert.match(nodes['bg-persistencia-aviso'].textContent, /atualização do banco/);
    c.uploadToStorage = async () => {throw new Error('upload indisponivel');};
    state.numeracoes[0].bg_verso_url = '';
    await assert.rejects(save(10, false), /upload indisponivel/);
    assert.equal(state.bgFilenameVerso, 'manual.pdf');
    console.log('OK: faces, remocao independente, reabertura, concorrencia, payload, copia e falha de upload.');
})().catch(e => {console.error(e); process.exitCode = 1;});
