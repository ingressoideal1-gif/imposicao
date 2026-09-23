const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        for (const caso of ['cancelar', 'sem-rede', 'limpar', 'navegador', 'automatico']) {
            const context = await browser.createBrowserContext();
            const page = await context.newPage();
            const erros = [];
            page.on('pageerror', e => erros.push(e.message));
            await page.evaluateOnNewDocument(instalado => {
                Object.defineProperty(navigator, 'standalone', {value: instalado});
                Object.defineProperty(navigator, 'serviceWorker', {value: {getRegistrations: async () => []}});
            }, caso !== 'navegador');
            await page.setRequestInterception(true);
            page.on('request', req => {
                const u = new URL(req.url());
                if (u.pathname === '/ic/controle.html') {
                    return req.respond({status: caso === 'sem-rede' ? 503 : 200,
                        contentType: 'text/html', body: '<head><script src="reiniciar.js?v=947"></script></head><button id="btn-ler-qr-evento">QR</button>'});
                }
                if (u.pathname === '/ic/reiniciar.html' || u.pathname === '/ic/reiniciar.js') {
                    const file = path.join('frontend', path.basename(u.pathname));
                    return req.respond({status: 200, contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(file)});
                }
                return req.respond({status: 404, body: ''});
            });
            await page.goto('http://localhost/ic/reiniciar.html', {waitUntil: 'load'});
            await page.evaluate(async () => {
                for (const k of ['ideal_control_instalacao','ideal_control_pin_configurado','ideal_control_portoes','ideal_portaria_token','ideal_qr_ativacao:evento','acesso_navegador_id','sb-vwbtitjlpelrcnsytzqw-auth-token','outro-modulo']) localStorage.setItem(k,'sintetico');
                sessionStorage.setItem('ideal_control_elevacao_conta','sintetico');
                await new Promise((resolve,reject) => {
                    const r = indexedDB.open('ideal-portaria',2);
                    r.onupgradeneeded = () => ['carga','fila','entradas','totais'].forEach(n=>r.result.createObjectStore(n));
                    r.onerror = () => reject(r.error);
                    r.onsuccess = () => {
                        const db = r.result, t = db.transaction(['carga','fila','entradas','totais'],'readwrite');
                        for (const n of ['carga','fila','entradas','totais']) t.objectStore(n).put('sintetico','registro');
                        t.oncomplete=()=>{db.close();resolve();};
                    };
                });
                for (const nome of ['ideal-control-834','portaria-1','ideal-fundo-v1','outro-cache']) await caches.open(nome);
            });
            if (caso === 'automatico') {
                await page.goto('http://localhost/ic/controle.html', {waitUntil:'load'}).catch(e=>{
                    if(!e.message.includes('ERR_ABORTED'))throw e;
                });
                await page.waitForFunction(()=>location.pathname==='/ic/controle.html' && localStorage.getItem('ideal_control_fluxo_local')==='qr-nuvem-947');
            } else if (caso === 'limpar' || caso === 'sem-rede') {
                await page.click('#confirmar');
                if (caso === 'limpar') {
                    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('#reiniciar')]);
                } else {
                    await page.click('#reiniciar');
                    await page.waitForFunction(()=>document.querySelector('#resultado').textContent.includes('Nenhum dado foi apagado'));
                }
            } else {
                assert.equal(await page.$eval('#reiniciar',b=>b.disabled),true);
            }
            const estado = await page.evaluate(async()=>{
                const quantidades=await new Promise(resolve=>{
                    const r=indexedDB.open('ideal-portaria',2);
                    r.onsuccess=()=>{const db=r.result,t=db.transaction(['carga','fila','entradas','totais']),q=[];
                        for(const n of ['carga','fila','entradas','totais']) t.objectStore(n).count().onsuccess=e=>q.push(e.target.result);
                        t.oncomplete=()=>{db.close();resolve(q);};};
                });
                return {keys:Object.keys(localStorage),sessao:sessionStorage.length,quantidades,caches:await caches.keys()};
            });
            if(caso==='limpar' || caso==='automatico') {
                assert.deepEqual(estado.keys.sort(),['ideal_control_fluxo_local','outro-modulo']);
                assert.equal(estado.sessao,0);
                assert.deepEqual(estado.quantidades,[0,0,0,0]);
                assert.deepEqual(estado.caches.sort(),['outro-cache']);
                if(caso==='automatico') {
                    await page.evaluate(()=>localStorage.setItem('ideal_control_portoes','evento novo'));
                    await page.reload({waitUntil:'load'});
                    assert.equal(await page.evaluate(()=>localStorage.getItem('ideal_control_portoes')),'evento novo');
                }
            } else {
                assert.equal(estado.keys.length,8);
                assert.deepEqual(estado.quantidades,[1,1,1,1]);
            }
            assert.deepEqual(erros,[]);
            await context.close();
            console.log(caso + ': OK');
        }
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
