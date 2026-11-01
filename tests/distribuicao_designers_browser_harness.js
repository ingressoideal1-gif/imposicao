// Navegador local com RPC simulada; não carrega a aplicação nem acessa a nuvem.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless:true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', r => r.abort());
        const erros=[]; page.on('pageerror',e=>erros.push(e.message));
        const index = fs.readFileSync(path.join(__dirname,'../frontend/index.html'),'utf8');
        const botao = index.match(/<button[^>]*data-adm-tab="designers"[\s\S]*?<\/button>/)[0];
        const painel = index.slice(index.indexOf('<div id="adm-tab-designers"'), index.indexOf('<!-- ── ABA: APROVEITAMENTO DE FOLHA'));
        await page.setContent(`<html><body><div><table id="table-arte"></table></div>${botao}${painel}<div id="pedido"></div></body></html>`);
        await page.evaluate(() => {
            window.papelAtual=()=>window.papelTeste || 'admin';
            window.toast=(texto,tipo)=>{window.ultimoToast={texto,tipo};};
            window.prompt=()=> 'Ausência de teste'; window.confirm=()=>true;
            window.renderOrdens=()=>{}; window.chamadas=[];
            window.resposta={ ativo:true, designers:[{uid:'d1',nome:'Designer <Um>',modo:'ativo',carga:2}],
                pedidos:[{id_int:123,original_uid:'d1',responsavel_uid:'d1',nome:'Designer <Um>',em_arte:true,fixado:true}] };
            window.supabaseClient={rpc:async (nome,args)=>{
                window.chamadas.push({nome,args});
                if (nome==='arte_distribuicao_disponibilidade') window.resposta.designers[0].modo=args.p_modo;
                if (nome==='arte_distribuicao_fixar') window.resposta.pedidos[0].fixado=args.p_fixado;
                if (nome==='arte_distribuicao_historico') return {data:[{criado_em:'2026-10-31T12:00:00Z',evento:'fixacao',motivo:'<script>não executar</script>',novo_uid:'d1'}]};
                return {data:window.resposta};
            }};
        });
        const script = fs.readFileSync(path.join(__dirname,'../frontend/script.js'),'utf8');
        await page.addScriptTag({content:script.split('// BEGIN ARTE_DISTRIBUICAO')[1].split('// END ARTE_DISTRIBUICAO')[0]});
        await page.addScriptTag({content:script.slice(script.indexOf('window.switchAdmTab = function(tabId)'),script.indexOf('// Inicializa a view ADM ao entrar nela'))});
        await page.click('[data-adm-tab="designers"]');
        await page.waitForSelector('#distribuicao-designers strong');
        await page.evaluate(async()=>{
            document.getElementById('pedido').innerHTML=ArteDistribuicao.controlesPedido(123);
        });
        assert.equal(await page.$eval('#adm-tab-designers',el=>el.style.display),'');
        assert.equal(await page.$eval('#distribuicao-designers',el=>!!el.closest('#adm-tab-designers')),true);
        assert.equal(await page.$eval('#table-arte',el=>el.parentElement.querySelector('[data-fila-acao]')),null);
        assert.equal(await page.$eval('#distribuicao-designers strong',el=>el.textContent),'Designer <Um>');
        await page.click('[data-modo="segurado"]');
        await page.waitForFunction(()=>window.chamadas.some(c=>c.nome==='arte_distribuicao_disponibilidade'));
        assert.equal(await page.evaluate(()=>window.chamadas.find(c=>c.nome==='arte_distribuicao_disponibilidade').args.p_modo),'segurado');
        await page.click('[data-fila-acao="fixar"]');
        await page.waitForFunction(()=>window.chamadas.some(c=>c.nome==='arte_distribuicao_fixar'));
        assert.equal(await page.evaluate(()=>window.chamadas.find(c=>c.nome==='arte_distribuicao_fixar').args.p_fixado),false);
        await page.click('[data-fila-acao="historico"]');
        await page.waitForSelector('dialog[open]');
        assert.equal(await page.$eval('dialog',el=>el.querySelectorAll('script').length),0);
        await page.click('dialog button');
        await page.evaluate(()=>{window.papelTeste='designer';ArteDistribuicao.desenhar();document.getElementById('pedido').innerHTML=ArteDistribuicao.controlesPedido(123);});
        assert.equal(await page.$$eval('[data-fila-acao]',els=>els.length),0);
        assert.equal(await page.$eval('#distribuicao-designers',el=>el.textContent),'');
        await page.evaluate(async()=>{window.papelTeste='admin';window.resposta.ativo=false;await ArteDistribuicao.carregar();});
        assert.equal(await page.$eval('#adm-tab-designers [data-fila-acao="ativar"]',el=>el.textContent),'Ativar distribuição');
        const escritas = await page.evaluate(()=>chamadas.filter(c=>c.nome!=='arte_distribuicao_estado').length);
        await page.click('[data-adm-tab="designers"]');
        assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.nome!=='arte_distribuicao_estado').length),escritas);
        assert.deepEqual(erros,[]);
        console.log('OK: controles ADM, fixação, histórico, escape e restrições no navegador.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
