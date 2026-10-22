const fs = require('node:fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/pedido.js', 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless:true});
    try {
        for (const html of ['index.html', 'producao.html']) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.setRequestInterception(true);
            page.on('request', req => req.abort());
            const full = fs.readFileSync('frontend/' + html, 'utf8');
            const start = full.indexOf('<div id="ped-refazer-inputs"');
            const fragment = full.slice(start, full.indexOf('</div>', start) + 6);
            await page.setViewport({width:390,height:700});
            await page.setContent('<body><input type="checkbox" id="ped-refazer-checkbox" checked>' + fragment + '</body>');
            await page.addScriptTag({content: [
                'refazerFolhasAtivo','refazerCelulasAtivo','intervaloRefazerFolhas',
                'sincronizarSetFinalRefazer','sincronizarLimitesRefazer','montarRefazerPayload','resetRefazerControls'
            ].map(extract).join('\n')});
            await page.addScriptTag({content: fs.readFileSync('frontend/arte-de-impressao.js','utf8')});
            const result = await page.evaluate(() => {
                const el = id => document.getElementById('ped-refazer-' + id);
                el('inputs').style.display='flex';el('set').style.display='inline-block';
                el('set').innerHTML='';
                for(let i=1;i<=20;i++) el('set').add(new Option('Set '+i,i));
                window.pedRefazerFolhasPorSet=Array(20).fill(50);
                window.pedRefazerTotalFolhas=50;
                sincronizarSetFinalRefazer();
                el('set').value='3';el('set-ate').value='20';el('de').value='10';el('ate').value='30';
                sincronizarLimitesRefazer();
                const exemplo=intervaloRefazerFolhas(), payload=montarRefazerPayload(true), texto=el('total').textContent;
                let antigoBloqueado=false;
                try { conferirRecursosDoMotor(payload,{capabilities:[]}); } catch(e) { antigoBloqueado=e.message.includes('Atualize o NewProd'); }
                conferirRecursosDoMotor(payload,{capabilities:['refazer_intervalo_sets_v1']});
                el('set-ate').value='';
                const mesmo=montarRefazerPayload(true);
                conferirRecursosDoMotor(mesmo,{capabilities:[]});
                el('set-ate').value='20';el('ate').value='2';
                const finalMenor=intervaloRefazerFolhas();
                el('set-ate').value='2';const invertido=montarRefazerPayload(true);
                el('set-ate').value='20';window.pedRefazerFolhasPorSet[19]=20;el('ate').value='30';
                sincronizarLimitesRefazer();const fora=montarRefazerPayload(true), maxFinal=el('ate').max;
                el('ate').value='';const vazio=montarRefazerPayload(true);
                el('ate').value='1';el('de').value='1.5';const fracao=montarRefazerPayload(true);
                resetRefazerControls();
                return {exemplo,payload,texto,antigoBloqueado,mesmo,finalMenor,invertido,fora,maxFinal,vazio,fracao,
                    reset:el('set-ate').value==='' && !el('checkbox').checked,
                    largura:document.documentElement.scrollWidth};
            });
            assert.equal(result.exemplo.total,871);
            assert.equal(result.payload.refazer_set,3);
            assert.equal(result.payload.refazer_set_ate,20);
            assert.equal(result.payload.refazer_de,10);
            assert.equal(result.payload.refazer_ate,30);
            assert(result.payload.sufixo.includes('set3_folha10-set20_folha30'));
            assert(result.texto.includes('871 folha(s) físicas'));
            assert(result.antigoBloqueado);
            assert.equal(result.mesmo.refazer_set_ate,undefined);
            assert.equal(result.finalMenor.total,843);
            for(const name of ['invertido','fora','vazio','fracao']) assert(result[name].erro,name);
            assert.equal(result.maxFinal,'20');
            assert(result.reset);
            assert(result.largura<=390);
            assert.deepEqual(errors,[]);
            await page.close();
            console.log(html+': intervalo 3/10 a 20/30, limites, legado, capacidade e 390px OK');
        }
    } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
