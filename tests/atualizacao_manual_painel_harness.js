const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const source = script.slice(script.indexOf('let atualizacaoManualEmAndamento = false;'),
    script.indexOf('window.verificarAtualizacaoAgente = verificarAtualizacaoAgente;') + 'window.verificarAtualizacaoAgente = verificarAtualizacaoAgente;'.length);
(async () => {
    const browser = await puppeteer.launch({headless: true});
    let checks = 0;
    try {
        for (const html of ['index.html', 'producao.html']) {
            for (const port of [9000, 9001]) {
                const page = await browser.newPage();
                const document = fs.readFileSync(path.join(root, 'frontend', html), 'utf8');
                const section = document.match(/<section aria-label="Atualização do NewProd"[\s\S]*?<\/section>/)[0];
                await page.setRequestInterception(true);
                page.on('request', request => request.respond({contentType:'text/html',body:section}));
                await page.goto(`http://127.0.0.1:${port}/app/${html}`);
                await page.evaluate(() => {
                    window.calls = [];
                    window.mode = 'available';
                    window.toast = () => {};
                    window.fetch = async (url, options) => {
                        calls.push({url, method: options.method});
                        if (url.endsWith('/api/status')) return {ok:true,json:async()=>({canal: 'piloto',produto_oficial:mode !== 'legacy'})};
                        if (url.endsWith('/api/update/check')) return {ok:true,json:async()=>({versao_atual:'1.2.371',versao_disponivel:'1.2.373',ha_atualizacao:mode !== 'current',liberado_para_estacao:mode !== 'blocked'})};
                        if (mode === 'network') throw new TypeError('Failed to fetch');
                        const status = Number(mode) || 200;
                        return {ok:status===200,status,json:async()=>({status:'checking'})};
                    };
                });
                await page.addScriptTag({content:source});

                for (const [mode,install,expected,posts] of [
                    ['available',false,'disponível',0],
                    ['available',true,'Solicitação aceita',1],
                    ['current',true,'NewProd atualizado',0],
                    ['blocked',true,'não liberada',0],
                    ['legacy',true,'precisa migrar',0],
                    ['401',true,'Entre no painel',1],
                    ['403',true,'ícone do NewProd',1],
                    ['409',true,'Há trabalho em andamento',1],
                    ['500',true,'HTTP 500',1],
                    ['network',true,'Não foi possível confirmar',1],
                ]) {
                    await page.evaluate(m=>{window.mode=m;window.calls=[];},mode);
                    await page.evaluate(install => document.querySelectorAll('[data-newprod-update]')[install?1:0].click(), install);
                    await page.waitForFunction(() => !document.querySelector('[data-newprod-update]').disabled);
                    assert.match(await page.$eval('#newprod-update-status', el => el.textContent),new RegExp(expected));
                    const calls = await page.evaluate(()=>window.calls);
                    assert.equal(calls.filter(c=>c.method==='POST').length,posts);
                    assert.ok(calls.every(c=>c.url.startsWith(`http://127.0.0.1:${port}/`)));
                    assert.equal(await page.$$eval('[data-newprod-update]:disabled', els => els.length),0);
                    checks++;
                }
                // A second click during an in-flight request cannot start another install.
                await page.evaluate(async () => {
                    window.mode='available';window.calls=[];
                    const fetchBefore=window.fetch;
                    let release;
                    window.fetch=async (url,opts)=>{
                        if(url.endsWith('/api/update')) await new Promise(resolve=>{release=resolve;});
                        return fetchBefore(url,opts);
                    };
                    const first=verificarAtualizacaoAgente(true);
                    while(!release) await new Promise(resolve=>setTimeout(resolve,0));
                    await verificarAtualizacaoAgente(true);
                    release();await first;window.fetch=fetchBefore;
                });
                assert.equal(await page.evaluate(()=>calls.filter(c=>c.method==='POST').length),1);
                checks++;
                await page.close();
            }
        }
        console.log(`${checks} cenarios aprovados nos dois paineis e nas portas 9000/9001.`);
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
