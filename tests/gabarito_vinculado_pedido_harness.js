// Dados sinteticos; select real do navegador, sem acesso a rede.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
function extract(file, name) {
    const source = fs.readFileSync(path.join(__dirname, '../frontend', file), 'utf8');
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', r => r.abort());
        await page.setContent('<select id="ped-formato"><option value="f">Formato</option><option value="outro">Outro</option></select><select id="ped-numeracao"></select><select id="ped-numeracao-2"></select>');
        await page.addScriptTag({content: `
            const state = {ordens:[{id:1, id_cliente:20}], formatos:[{id:'f',name:'Formato'}],
                osItens:{1:[{id:1,amostra_num_id:'nomes'}, {id:2,amostra_num_id:'sem'},
                    {id:3,amostra_num_id:'nomes'}, {id:4,amostra_num_id:'sem'}, {id:5,amostra_num_id:'vip'}]},
                numeracoes:['nomes','sem','vip','alheio'].map(id => ({id,name:id,is_custom:true,Cli_Num:10,formato_id:'f'}))};
            state.numeracoes.push({id:'comum',name:'Comum',formato_id:'f'},
                {id:'do-cliente',name:'Cliente atual',Cli_Num:20,formato_ids:['f']},
                {id:'por-item',name:'Item',is_custom:true,os_item_id:1,formato_id:'f'});
            ${extract('script.js', 'itemAtivoDoPedido')}
            ${extract('script.js', 'numeracaoIdDoItem')}
            ${extract('pedido.js', 'populatePedNumeracoes')}
            window.s = state;
        `});
        for (const itemId of [1,2,3,4,5]) {
            const result = await page.evaluate(itemId => {
                s.activeOSItem = {osId:1,itemId};
                populatePedNumeracoes();
                const id = numeracaoIdDoItem(itemAtivoDoPedido());
                const sel = document.getElementById('ped-numeracao');
                sel.value = id;
                populatePedNumeracoes();
                return {id, selected:sel.value, options:[...sel.options].map(o=>o.value),
                    second:[...document.getElementById('ped-numeracao-2').options].map(o=>o.value)};
            }, itemId);
            assert.equal(result.selected, result.id, 'gabarito vinculado permanece selecionavel');
            assert(!result.options.includes('alheio'));
            assert(result.options.includes('comum') && result.options.includes('do-cliente'));
            assert.equal(result.options.includes('por-item'), itemId === 1);
            assert.deepEqual(result.second, result.options);
            assert.equal(result.options.filter(id => ['nomes','sem','vip'].includes(id)).length, 1);
        }
        const incompatible = await page.evaluate(() => {
            document.getElementById('ped-formato').value = 'outro';
            populatePedNumeracoes();
            return document.getElementById('ped-numeracao').value;
        });
        assert.equal(incompatible, '', 'vinculo nao dispensa formato compativel');
        const unlinked = await page.evaluate(() => {
            s.activeOSItem = null;
            document.getElementById('ped-formato').value = 'f';
            populatePedNumeracoes();
            return [...document.getElementById('ped-numeracao').options].map(o=>o.value);
        });
        assert.deepEqual(unlinked, ['', 'comum'], 'sem modelo, filtros originais permanecem');
        console.log('OK: cinco modelos individuais, selecao preservada, filtros de cliente/item e formato.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
