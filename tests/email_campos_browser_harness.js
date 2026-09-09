// Regressao com DOM/teclado reais, sem rede ou credenciais.
const fs = require('fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    const inicio = source.indexOf('function ' + nome + '(');
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless:true});
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        await page.setContent('<!doctype html><body></body>');
        await page.evaluate(css => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }, fs.readFileSync('frontend/style.css', 'utf8'));
        await page.setViewport({width:1280,height:1000});
        await page.addScriptTag({content: extrair('ensureModalEmailElement') + '\n' + extrair('mostrarSucessoEnvioEmail')});
        await page.evaluate(() => {
            ensureModalEmailElement().style.display = 'flex';
            document.getElementById('modal-email-subject').value = 'Aprovação — Pedido #11';
        });
        await page.type('#modal-email-to', 'primeiro@example.com');
        await page.click('#modal-email-to');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('#modal-email-to', 'segundo@example.com');
        assert.equal(await page.$eval('#modal-email-subject', e => e.value), 'Aprovação — Pedido #11');
        await page.click('#modal-email-subject');
        await page.keyboard.press('End');
        await page.type('#modal-email-subject', '\nRevisão final');
        assert.equal(await page.$eval('#modal-email-to', e => e.value), 'segundo@example.com');
        assert.doesNotMatch(await page.$eval('#modal-email-subject', e => e.value), /[\r\n]/);
        assert.equal(await page.$eval('#modal-email-subject', e => e.autocomplete), 'off');
        assert.equal(await page.$('#modal-email-modelos-preview'), null);
        assert.equal(await page.$('#modal-email-modelos-container'), null);
        assert.equal(await page.$eval('#modal-email-body', e => getComputedStyle(e).fontFamily.includes('monospace')), false);
        assert.ok(await page.$eval('#modal-email-body', e => parseFloat(getComputedStyle(e).fontSize) >= 15));
        const transporte = source.slice(source.indexOf('let emailOperacaoEmAndamento'), source.indexOf('window.abrirModalConfigEmail = abrirModalConfigEmail;', source.indexOf('let emailOperacaoEmAndamento')));
        await page.addScriptTag({content: `
            const API_PAINEL = 'https://synthetic.example';
            window.vendedorProposta = 'Alexandre Almeida';
            const supabaseClient = {
                auth:{getSession:async()=>({data:{session:{access_token:'sintetico'}}})},
                from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[{vendedor:window.vendedorProposta}]})})})})
            };
            function abrirModalConfigEmail() {}
            function toast() {}
            const state = {ordens:[{id:'vibe_11',numero:11,cliente:'Cliente de Exemplo'}],todasArtes:[],osItens:{}};
            window.fetch = () => new Promise(resolve => {window.resolverEnvio = resolve;});
            ${transporte}
            async ${extrair('buscarDadosEmailCliente')}
            ${extrair('montarMensagemEmailCliente')}
            async ${extrair('abrirModalEnviarEmailCliente')}
        `});
        await page.evaluate(async () => {
            await abrirModalEnviarEmailCliente('vibe_11',11,'https://example.com/cliente/11-abc123');
            document.getElementById('modal-email-to').value = 'segundo@example.com';
        });
        const corpo = await page.$eval('#modal-email-body', e => e.value);
        assert.match(corpo, /Atendimento: Alexandre Almeida/);
        assert.doesNotMatch(corpo, /RESUMO DOS MODELOS|Quantidade:|Imagem da Arte|Numeração:/);
        assert.match(corpo, /https:\/\/example.com\/cliente\/11-abc123/);
        for (const vendedor of ['Emily Boeira', null]) {
            await page.evaluate(async nome => {
                window.vendedorProposta = nome;
                await abrirModalEnviarEmailCliente('vibe_11',11,'https://example.com/cliente/11-abc123');
                document.getElementById('modal-email-to').value = 'segundo@example.com';
            }, vendedor);
            const mensagem = await page.$eval('#modal-email-body', e => e.value);
            assert.ok(mensagem.endsWith(vendedor ? 'Atendimento: ' + vendedor : 'Atendimento'));
            assert.doesNotMatch(mensagem, /Alexandre Almeida/);
        }
        const preview = process.env.EMAIL_MODAL_PREVIEW_DIR;
        if (preview) fs.mkdirSync(preview, {recursive:true});
        for (const [nome,width,height] of [['desktop',1280,1000],['mobile',390,900]]) {
            await page.setViewport({width,height});
            assert.ok(await page.$eval('.email-dialog', e => e.scrollWidth <= e.clientWidth + 1));
            if (preview) await page.screenshot({path:preview + '/modal-email-' + nome + '.png'});
        }
        await page.setViewport({width:1280,height:1000});
        await page.click('#btn-disparar-email-direto');
        await page.waitForFunction(() => typeof window.resolverEnvio === 'function');
        assert.equal(await page.$('#modal-email-sucesso'), null, 'Nao mostra sucesso enquanto envio esta pendente');
        assert.equal(await page.$eval('#btn-disparar-email-direto', e => e.disabled), true);
        await page.evaluate(() => window.resolverEnvio({ok:true,json:async()=>({ok:true,message:'Aceito'})}));
        await page.waitForSelector('#modal-email-sucesso[open]');
        assert.equal(await page.$eval('#modal-email-sucesso-titulo', e => e.textContent), 'Sucesso do Envio');
        assert.equal(await page.$eval('#modal-email-sucesso-destinatario', e => e.textContent), 'segundo@example.com');
        if (preview) await page.screenshot({path:preview + '/modal-email-sucesso.png'});
        await page.setViewport({width:390,height:900});
        assert.ok(await page.$eval('#modal-email-sucesso', e => e.getBoundingClientRect().right <= innerWidth && e.getBoundingClientRect().left >= 0));
        await page.setViewport({width:1280,height:1000});
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('modal-email-sucesso'));
        await page.evaluate(() => document.getElementById('modal-email-subject').value = 'Novo assunto');
        await page.click('#btn-disparar-email-direto');
        await page.evaluate(() => window.resolverEnvio({ok:false,json:async()=>({ok:false,error:'Recusado'})}));
        await page.waitForFunction(() => !document.getElementById('btn-disparar-email-direto').disabled);
        assert.equal(await page.$('#modal-email-sucesso'), null, 'Falha nao exibe sucesso');
        await page.evaluate(() => mostrarSucessoEnvioEmail('cliente@example.com'));
        await page.click('#modal-email-sucesso button');
        await page.waitForFunction(() => !document.getElementById('modal-email-sucesso'));
        assert.deepEqual(erros, []);
        console.log('OK: campos independentes, modal responsivo sem miniaturas, sucesso somente apos aceite, erro e fechamento');
    } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
