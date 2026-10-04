// DOM real e funções do editor; sem serviços ou dados reais.
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
    const browser = await puppeteer.launch({headless:true});
    try {
        for (const file of ['index.html', 'producao.html']) {
            const page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', r => r.abort());
            await page.setContent(fs.readFileSync(path.join(root, 'frontend', file), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
            await page.addScriptTag({content:`
                const state = {numElements:[],numElCounter:0,selectedElIds:[],numHistory:[],numHistoryIndex:-1,numCsvHeaders:[]};
                const messages = []; function toast(m) {messages.push(m);}
                function drawCanvas() {} function avisarElementoTravado() {}
                function selectElId(id) {state.selectedElIds=[id];state.selectedElId=id;}
                function fontPickerHTML() {return '';}
                function mountFontPickers() {} function renderBoxArquivos() {}
                function escapeHtml(s) {return s;} function isElSelected() {return false;}
                function boxEspacoDoTextoHTML() {return '';}
                ${['familiaDoElementoDeNumeracao','familiasDaNumeracao','elementoUsaPosicaoTicket','erroDaNumeracaoTicket','atualizarCompatibilidadeDosElementos','prepararTipoParaNovoElemento','renderElementsList'].map(extract).join('\n')}
                ${['onTipoSelect','onTicketQtdChange','addElement','saveNumHistory','undoNumHistory','redoNumHistory','updateEl','duplicateSelectedElements','saveNumeracao'].map(assignment).join('\n')}
            `});
            const result = await page.evaluate(async () => {
                const tipo = document.getElementById('num-tipo');
                const qtd = document.getElementById('num-ticket-qtd');
                tipo.value='TICKET';qtd.value='3';onTipoSelect();saveNumHistory();
                const buttons=[...document.querySelectorAll('#num-teatro-elements-container button[onclick],#num-camarote-elements-container button[onclick]')];
                const disabled=buttons.every(b => b.disabled && b.title.includes('Ticket'));
                const before=JSON.stringify(state);
                for(const t of ['TEATRO_FILA','TEATRO_LUGAR','TEATRO_COMBO','CAMAROTE_LOCAL','CAMAROTE_PESSOA','CAMAROTE_PESSOA_TOTAL']) addElement(t);
                const blocked=JSON.stringify(state)===before && tipo.value==='TICKET';
                for(const t of ['TEXT','QR','QR_IDEAL','BARCODE','FIXED']) addElement(t);
                state.numElements.push({id:'bank',type:'TEXT',source:'database',database_text:true,x_mm:0,y_mm:0,pad:0},
                    {id:'qrbank',type:'QR',source:'database',x_mm:0,y_mm:0},
                    {id:'bcfixed',type:'BARCODE',fixed:true,x_mm:0,y_mm:0});
                state.numElements[0].ticket_pos=3;saveNumHistory();renderElementsList();
                const selectors=state.numElements.map(el => !!document.querySelector('#elcard-'+el.id+' select[onchange*="ticket_pos"]'));
                const note=document.getElementById('elcard-bank').textContent.includes('uma linha por célula');
                const bankData=JSON.stringify(state.numElements.slice(-3));
                const beforeReduction=JSON.stringify(state);
                qtd.value='2';onTicketQtdChange();
                const refused=[qtd.value,JSON.stringify(state)===beforeReduction];
                qtd.value='4';onTicketQtdChange();undoNumHistory();const undo=qtd.value;redoNumHistory();const redo=qtd.value;
                const invalidQuantities=[];
                for(const v of ['0','-1','2.5','']) {qtd.value=v;onTicketQtdChange();invalidQuantities.push(qtd.value);}
                const invalidPositionBefore=JSON.stringify(state);
                updateEl(state.numElements[0].id,'ticket_pos',5);
                const rejectedPosition=JSON.stringify(state)===invalidPositionBefore;
                // Registro antigo inválido permanece intacto e exibe um aviso no select.
                state.numElements[0].ticket_pos=9;renderElementsList();
                const selector=document.querySelector('#elcard-'+state.numElements[0].id+' select[onchange*="ticket_pos"]');
                const invalidDisplayed=selector.selectedOptions[0].textContent;
                document.getElementById('num-name').value='SINTETICO';
                document.getElementById('num-formato').append(new Option('Teste','synthetic'));
                document.getElementById('num-formato').value='synthetic';
                await saveNumeracao();const saveBlocked=messages.at(-1).includes('Corrija a posição');
                updateEl(state.numElements[0].id,'ticket_pos',2);
                qtd.value='2';onTicketQtdChange();
                const repaired=[qtd.value,state.numElements[0].ticket_pos,erroDaNumeracaoTicket('TICKET',qtd.value,state.numElements)];
                tipo.value='SEQUENCIAL';onTipoSelect(true);
                const unlocked=buttons.every(b => !b.disabled);
                addElement('TEATRO_FILA');tipo.value='TICKET';onTipoSelect(true);
                return {disabled,blocked,selectors,note,refused,undo,redo,invalidQuantities,rejectedPosition,invalidDisplayed,saveBlocked,repaired,unlocked,specialRefused:tipo.value,
                    bankPreserved:JSON.stringify(state.numElements.filter(e=>['bank','qrbank','bcfixed'].includes(e.id)))===bankData};
            });
            assert(result.disabled && result.blocked && result.note && result.unlocked && result.bankPreserved);
            assert.deepEqual(result.selectors,[true,true,true,true,false,false,false,false]);
            assert.deepEqual(result.refused,['3',true]);
            assert.equal(result.undo,'3');assert.equal(result.redo,'4');
            assert.deepEqual(result.invalidQuantities,['4','4','4','4']);
            assert(result.rejectedPosition && result.saveBlocked);
            assert.match(result.invalidDisplayed,/Posição inválida/);
            assert.deepEqual(result.repaired,['2',2,'']);
            assert.equal(result.specialRefused,'TEATRO');
            await page.close();
        }
        console.log('OK: condições Ticket, propriedades, redução, histórico e salvamento nas duas páginas.');
    } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
