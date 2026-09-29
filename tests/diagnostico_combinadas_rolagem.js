// Diagnostico da regressao de rolagem; navegador real, sem rede ou dados reais.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = execFileSync('git', ['show', '6778b3bd:frontend/script.js'], {cwd:root,encoding:'utf8',maxBuffer:8e6});
function extract(name) {
    const i = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name); return source.slice(i, source.indexOf('\n}', i) + 2);
}
(async () => {
    // Relogio virtual: downloads que nao respondem ocupam as vagas durante
    // direto, proxy e retry. Nenhuma espera real de um minuto nem acesso HTTP.
    let now = 0, timerId = 0, readyAt = null;
    const timers = new Map(), anchors = [{}, {}, {}];
    const container = { dataset: {amostrasOsId:'p1'}, contains: () => true,
        querySelector: q => anchors[Number(q.match(/-(\d+)$/)?.[1])] };
    const c = { console:{warn(){}}, AbortController,
        state:{osItens:{p1:[{id:0},{id:1},{id:2}]}}, document:{getElementById:()=>container},
        mostrarCargaDaPrevia(){}, urlDoProxy:u=>u+'?proxy', fetch:()=>new Promise(()=>{}),
        setTimeout(fn, ms){ const id=++timerId; timers.set(id,{fn,at:now+ms}); return id; },
        clearTimeout(id){timers.delete(id);} };
    vm.createContext(c);
    vm.runInContext(extract('fetchPdfBytes')+'\n'+extract('renderItemAmostraCombinada'),c);
    c.desenharItemAmostraCombinada = async idx => {
        if(idx === 2){readyAt=now;return;}
        await c.fetchPdfBytes('https://synthetic.invalid/arte.pdf',{prazoMs:15000});
    };
    const jobs=[0,1,2].map(idx=>c.renderItemAmostraCombinada(idx,'p1'));
    for(let step=0; step<20 && readyAt===null; step++){
        for(let j=0;j<25;j++)await Promise.resolve();
        const nearest=Math.min(...[...timers.values()].map(t=>t.at));
        if(!Number.isFinite(nearest))break;
        now=nearest;
        for(const [id,t] of [...timers]) if(t.at===nearest){timers.delete(id);t.fn();}
    }
    const outcomes=await Promise.all(jobs);
    assert.equal(readyAt,60750); assert.deepEqual(outcomes,[false,false,true]);
    console.log(JSON.stringify({test:'dois_downloads_sem_resposta',readyModelStartsAtVirtualMs:readyAt,outcomes}));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 500 });
        await page.setRequestInterception(true); page.on('request', r => r.abort());
        await page.setContent('<div id="amostras-itens-container" data-amostras-os-id="p1"></div>');
        await page.evaluate(() => {
            window.state = { osItens: { p1: Array.from({length:10},(_,id)=>({id})) } };
            window.started = []; window.releases = {};
            window.desenharItemAmostraCombinada = (idx, osId) => {
                started.push(osId + ':' + idx);
                return new Promise(resolve => { releases[osId + ':' + idx] = resolve; });
            };
            window.cardTemOqueDesenhar = () => true;
            window.travarCardsDeModelosAprovados = () => {};
            window.atualizarBarraFinalCliente = () => {};
            document.getElementById('amostras-itens-container').innerHTML = state.osItens.p1.map((_,i) =>
                `<section style="height:520px"><h3 id="amostra-item-header-${i}">Modelo ${i}</h3><canvas id="amostra-item-canvas-${i}" width="20" height="20"></canvas></section>`).join('');
        });
        await page.addScriptTag({ content: ['mostrarCargaDaPrevia','renderItemAmostraCombinada','desenharCardsAoAparecer'].map(extract).join('\n') });
        await page.evaluate(() => desenharCardsAoAparecer('p1', state.osItens.p1, document.getElementById('amostras-itens-container')));
        await page.waitForFunction(() => started.length === 2 && renderItemAmostraCombinada.fila.espera.length > 0);
        await page.evaluate(() => document.getElementById('amostra-item-header-9').scrollIntoView());
        await page.waitForFunction(() => renderItemAmostraCombinada.fila.trabalhos.has('p1:9'));
        const blocked = await page.evaluate(() => ({ started: [...started], queued: [...renderItemAmostraCombinada.fila.trabalhos.keys()],
            targetTop: document.getElementById('amostra-item-header-9').getBoundingClientRect().top }));
        assert.deepEqual(blocked.started, ['p1:0','p1:1']);
        assert(blocked.targetTop >= 0 && blocked.targetTop < 500);
        await page.evaluate(() => releases['p1:0']());
        await page.waitForFunction(() => started.length === 3);
        const next = await page.evaluate(() => ({ next: started[2], top: document.getElementById('amostra-item-header-2').getBoundingClientRect().top }));
        assert.equal(next.next, 'p1:2'); assert(next.top < 0);
        console.log(JSON.stringify({ test: 'rolagem_real', ...blocked, next }));

        // Trocar de pedido invalida as ancoras, mas nao libera as duas vagas em uso.
        await page.evaluate(() => {
            state.osItens.p2 = [{id:100}];
            const container = document.getElementById('amostras-itens-container');
            container.dataset.amostrasOsId = 'p2';
            container.innerHTML = '<h3 id="amostra-item-header-0">Outro pedido</h3><canvas id="amostra-item-canvas-0"></canvas>';
            window.newJob = renderItemAmostraCombinada(0, 'p2');
        });
        const other = await page.evaluate(() => ({ started: [...started], queued: renderItemAmostraCombinada.fila.trabalhos.has('p2:0') }));
        assert(other.queued); assert(!other.started.includes('p2:0'));
        await page.evaluate(() => { releases['p1:1'](); releases['p1:2'](); });
        await page.waitForFunction(() => started.includes('p2:0'));
        await page.evaluate(async () => { releases['p2:0'](); await newJob; });
        console.log(JSON.stringify({ test: 'outro_pedido_aguarda_vagas_antigas', ...other }));
        await page.close();

        // Comparacao de abertura do modal com bitmap pronto, antes/depois da v973.
        for (const version of ['v972', 'atual']) {
            const p = await browser.newPage();
            await p.setRequestInterception(true); p.on('request', r => r.abort());
            await p.setContent('<div id="amostras-itens-container" data-amostras-os-id="p1"><h3 id="amostra-item-header-0">Modelo</h3><canvas id="amostra-item-canvas-0" width="20" height="20"></canvas></div>');
            await p.evaluate(() => {
                window.state = { osItens: { p1: [{id:1}] }, numeracoes: [] };
                window.renders = 0;
                window.desenharItemAmostraCombinada = () => { renders++; return new Promise(() => {}); };
                const canvas = document.querySelector('canvas'); canvas.getContext('2d').fillRect(0,0,20,20);
            });
            await p.addScriptTag({ content: ['mostrarCargaDaPrevia','renderItemAmostraCombinada'].map(extract).join('\n') });
            await p.evaluate(() => mostrarCargaDaPrevia(document.getElementById('amostras-itens-container'),0,'p1','pronto'));
            const modal = version === 'atual' ? execFileSync('git',['show','6778b3bd:frontend/amostra-modal.js'],{cwd:root,encoding:'utf8'})
                : execFileSync('git',['show','v972:frontend/amostra-modal.js'],{cwd:root,encoding:'utf8'});
            await p.addScriptTag({content:modal});
            const result = await p.evaluate(() => {
                abrirAmostraModal(0,'p1');
                return { renders, images: document.querySelectorAll('#amostra-mod-ov .am-face img').length,
                    loading: document.getElementById('amostra-mod-ov').textContent.includes('Carregando arte') };
            });
            assert.equal(result.renders, version === 'atual' ? 1 : 0);
            assert.equal(result.images, version === 'atual' ? 0 : 1);
            console.log(JSON.stringify({test:'abrir_modal_pronto',version,...result}));
            await p.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
