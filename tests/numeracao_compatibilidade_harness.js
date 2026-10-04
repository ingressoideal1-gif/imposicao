// Editor real, dados sintéticos e rede bloqueada.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function assignment(name) {
    const start = source.indexOf('window.' + name + ' =');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n};', start) + 3);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    let checks = 0;
    try {
        for (const file of ['index.html', 'producao.html']) {
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', request => request.abort());
            const html = fs.readFileSync(path.join(root, 'frontend', file), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
            await page.setContent(html);
            await page.addScriptTag({ content: `
                const state = {numElements:[], numElCounter:0, selectedElIds:[], numHistory:[], numHistoryIndex:-1};
                const messages = [];
                function toast(message) { messages.push(message); }
                function drawCanvas() {}
                function selectElId(id) {state.selectedElIds = [id]; state.selectedElId = id;}
                function avisarElementoTravado() {}
                function renderElementsList() {atualizarCompatibilidadeDosElementos();}
                ${['familiaDoElementoDeNumeracao', 'familiasDaNumeracao', 'elementoUsaPosicaoTicket', 'erroDaNumeracaoTicket', 'atualizarCompatibilidadeDosElementos', 'prepararTipoParaNovoElemento'].map(extract).join('\n')}
                ${['onTipoSelect', 'addElement', 'addDatabaseTextElement', 'deleteSelectedElements', 'duplicateSelectedElements', 'saveNumHistory', 'undoNumHistory', 'redoNumHistory'].map(assignment).join('\n')}
                window.testState = state;
            ` });
            for (const family of ['CAMAROTE', 'TEATRO']) {
                const result = await page.evaluate(family => {
                    const s = window.testState;
                    s.numElements = []; s.numElCounter = 0; s.numHistory = []; s.numHistoryIndex = -1;
                    const tipo = document.getElementById('num-tipo');
                    tipo.value = 'SEQUENCIAL'; onTipoSelect(); saveNumHistory();
                    addElement('TEXT');
                    const special = family === 'CAMAROTE' ? 'CAMAROTE_LOCAL' : 'TEATRO_FILA';
                    const other = family === 'CAMAROTE' ? 'TEATRO_LUGAR' : 'CAMAROTE_PESSOA';
                    document.querySelector(`button[onclick="addElement('${special}')"]`).click();
                    const selected = tipo.value;
                    const before = JSON.stringify(s);
                    const rejected = addElement(other);
                    const unchanged = JSON.stringify(s) === before;
                    const disabled = document.querySelector(`button[onclick="addElement('${other}')"]`).disabled;
                    const title = document.querySelector(`button[onclick="addElement('${other}')"]`).title;
                    const allVisible = ['num-teatro-elements-container','num-camarote-elements-container'].every(id => document.getElementById(id).style.display === 'block');
                    // Nenhum elemento comum muda o tipo, incluindo os de banco e gráficos.
                    for (const type of ['TEXT','FIXED','QR','QR_IDEAL','BARCODE','SVG','PDF','PICOTE','FOTO']) addElement(type);
                    addDatabaseTextElement();
                    const commonType = tipo.value;
                    const specialEl = s.numElements.find(el => el.type === special);
                    tipo.value = 'TICKET'; tipo.dispatchEvent(new Event('change'));
                    const refusedType = tipo.value;
                    s.selectedElIds = [specialEl.id]; deleteSelectedElements();
                    const afterRemoval = tipo.value;
                    const unlocked = !document.querySelector(`button[onclick="addElement('${other}')"]`).disabled;
                    tipo.value = 'SEQUENCIAL'; tipo.dispatchEvent(new Event('change'));
                    const manualType = tipo.value;
                    addElement(other);
                    const switched = tipo.value;
                    return {selected,rejected,unchanged,disabled,title,allVisible,commonType,refusedType,afterRemoval,unlocked,manualType,switched};
                }, family);
                const other = family === 'CAMAROTE' ? 'TEATRO' : 'CAMAROTE';
                assert.equal(result.selected, family);
                assert.equal(result.rejected, null);
                assert(result.unchanged && result.disabled && result.allVisible && result.unlocked);
                assert.match(result.title, /Remova os elementos/);
                assert.equal(result.commonType, family);
                assert.equal(result.refusedType, family);
                assert.equal(result.afterRemoval, family);
                assert.equal(result.manualType, 'SEQUENCIAL');
                assert.equal(result.switched, other);
                checks += 10;
            }
            const restored = await page.evaluate(() => {
                const s = window.testState;
                s.numElements = []; s.numHistory = []; s.numHistoryIndex = -1;
                const tipo = document.getElementById('num-tipo'); tipo.value = 'SEQUENCIAL'; onTipoSelect(); saveNumHistory();
                addElement('CAMAROTE_LOCAL'); undoNumHistory();
                const undo = [tipo.value, s.numElements.length];
                redoNumHistory(); const redo = [tipo.value, s.numElements[0].type];
                // Restauração programática de registros antigos mantém tipo e elementos.
                s.numElements = [{id:'old1',type:'CAMAROTE_LOCAL'}, {id:'old2',type:'TEATRO_FILA'}];
                tipo.value = 'SEQUENCIAL'; onTipoSelect();
                const legacy = [tipo.value, s.numElements.length, document.getElementById('num-compatibilidade-info').textContent];
                s.numElements = []; tipo.value = 'TICKET'; onTipoSelect(); addElement('QR');
                return {undo,redo,legacy,ticket:[tipo.value,document.getElementById('num-ticket-settings').style.display]};
            });
            assert.deepEqual(restored.undo, ['SEQUENCIAL',0]);
            assert.deepEqual(restored.redo, ['CAMAROTE','CAMAROTE_LOCAL']);
            assert.deepEqual(restored.legacy.slice(0,2), ['SEQUENCIAL',2]);
            assert.match(restored.legacy[2], /Numeração existente/);
            assert.deepEqual(restored.ticket, ['TICKET','block']);
            checks += 5;
            const duplication = await page.evaluate(() => {
                const s = window.testState;
                const tipo = document.getElementById('num-tipo');
                s.numElements = [{id:'old1',type:'CAMAROTE_PESSOA',x_mm:5,y_mm:5}];
                s.selectedElIds = ['old1']; tipo.value = 'SEQUENCIAL'; onTipoSelect();
                duplicateSelectedElements();
                const compatible = [tipo.value,s.numElements.length];
                s.numElements = [{id:'cam',type:'CAMAROTE_LOCAL'}, {id:'teatro',type:'TEATRO_COMBO'}];
                s.selectedElIds = ['cam']; tipo.value = 'CAMAROTE'; onTipoSelect();
                const before = JSON.stringify(s); duplicateSelectedElements();
                return {compatible,blocked:JSON.stringify(s) === before,tipo:tipo.value};
            });
            assert.deepEqual(duplication.compatible, ['CAMAROTE',2]);
            assert(duplication.blocked);
            assert.equal(duplication.tipo, 'CAMAROTE');
            checks += 3;
            await page.close();
        }
        console.log('OK: ' + checks + ' verificações de compatibilidade, restauração e histórico nas duas páginas.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
