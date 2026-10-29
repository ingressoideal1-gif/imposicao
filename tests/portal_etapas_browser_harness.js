const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'frontend', f), 'utf8');
function extract(file, name) {
    const s = read(file), i = s.indexOf('function ' + name + '(');
    assert.ok(i >= 0);
    return s.slice(i, s.indexOf('\n}', i) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => r.abort());
        const html = read('cliente.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
        await page.setContent(html);
        await page.addStyleTag({content: read('style.css').replace(/^@import[^\r\n]*$/gm, '')});
        await page.evaluate(() => {
            window.state = {osItens: {teste: [{amostra_status: 'APROVADA'}]}};
            window.clienteState = {statusArte: 'APROVADO', numero: '123', osId: 'teste', pedidoFinalizado: false};
            window.portalDados = {pedido: {}, endereco: {}, cliente: {}, frete: {}};
            window.escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
            window.entregaExigeRecebedor = () => false;
            window.ehRetirada = () => true;
            window.dadosDoFormularioEntrega = () => ({});
            window.modalEnderecosEntrega = () => '<dialog id="enderecos-teste"><p>Endereços</p><button onclick="this.closest(\'dialog\').close()">Fechar</button></dialog>';
            window.modalMeusDados = () => '<dialog id="nota-teste"><p>Dados da nota</p><button onclick="this.closest(\'dialog\').close()">Fechar</button></dialog>';
            window.abrirEnderecosEntrega = () => document.getElementById('enderecos-teste').showModal();
            window.abrirMeusDados = () => document.getElementById('nota-teste').showModal();
            window.salvamentos = 0;
            window.gravarCorrecaoDoCliente = async () => {
                window.salvamentos++;
                await new Promise(r => setTimeout(r, 100));
                return {ok: !window.falhar};
            };
            document.getElementById('cliente-content').style.display = 'block';
            document.getElementById('cliente-loading').style.display = 'none';
            document.getElementById('portal-abas').hidden = false;
        });
        for (const f of ['cliente-shell.js','cliente-confirmacoes.js']) await page.addScriptTag({content: read(f)});
        await page.addScriptTag({content: extract('cliente-entrega-form.js','cartaoDeDecisaoEntrega') + '\n' + extract('cliente-faturamento-form.js','cartaoDeDecisaoFaturamento')});
        await page.addScriptTag({content: extract('cliente.js','mostrarProximaEtapaAposArte')});
        await page.evaluate(() => {
            for (const qual of ['entrega','faturamento']) registrarSecao(qual, () => {
                document.getElementById('secao-' + qual).innerHTML = '<div class="portal-cartao"><h2>Confira os dados</h2><input aria-label="Complemento" value="Teste"><div style="height:850px"></div><p id="fim-' + qual + '">Último dado para conferir</p></div>'
                    + (qual === 'entrega' ? cartaoDeDecisaoEntrega() : cartaoDeDecisaoFaturamento()) + cartaoDeFinalizacao();
            });
            abrirSecao('entrega');
        });
        const selector = '#secao-entrega .portal-par-de-botoes';
        for (const width of [320,390,1100]) {
            await page.setViewport({width, height: 844});
            await page.evaluate(() => { document.activeElement.blur(); document.getElementById('cliente-page').scrollTo(0,0); });
            const box = await page.$eval(selector, e => {
                const b=e.getBoundingClientRect(), nav=document.getElementById('portal-abas').getBoundingClientRect();
                return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,nav:nav.top,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...e.children].every(b=>b.getBoundingClientRect().height>=44)};
            });
            assert.ok(box.top>=0 && box.bottom<=844 && box.left>=0 && box.right<=width && !box.overflow && box.buttons, JSON.stringify(box));
            if(width<900) assert.ok(box.bottom<=box.nav, 'não cobre abas');
            await page.evaluate(() => document.getElementById('cliente-page').scrollTo(0,document.getElementById('cliente-page').scrollHeight));
            assert.ok(await page.$eval('#fim-entrega', e => e.getBoundingClientRect().bottom < document.querySelector('#secao-entrega .portal-par-de-botoes').getBoundingClientRect().top), 'último dado pode ser rolado acima da barra');
        }
        await page.setViewport({width:390,height:844});
        await page.evaluate(() => document.getElementById('cliente-page').scrollTo(0,0));
        await page.focus('#secao-entrega input');
        assert.equal(await page.$eval(selector,e=>getComputedStyle(e).position),'static','libera espaço ao digitar');
        await page.evaluate(() => document.activeElement.blur());
        if (process.env.PORTAL_PREVIEW) await page.screenshot({path:process.env.PORTAL_PREVIEW});
        await page.click(selector+' button:last-child');
        assert.equal(await page.$eval('#enderecos-teste', e=>e.open),true);
        await page.click('#enderecos-teste button');
        await page.evaluate(() => { window.falhar=true; });
        await page.click(selector+' button:first-child');
        await page.waitForFunction(() => !window.portalGravandoConfirmacao);
        assert.equal(await page.evaluate(() => window.portalConfirmacoes.entrega),null);
        assert.ok(await page.$eval('#secao-entrega [role=alert]',e=>{const b=e.getBoundingClientRect();return b.top>=0 && b.bottom<innerHeight;}),'erro visível junto ao botão');
        assert.equal(await page.$eval('#secao-entrega',e=>e.hidden),false);
        assert.match(await page.$eval('#secao-entrega',e=>e.textContent),/Não conseguimos salvar/);
        await page.evaluate(() => { window.falhar=false; window.salvamentos=0; });
        await page.click(selector+' button:first-child',{clickCount:2});
        await page.waitForFunction(() => window.portalConfirmacoes.entrega===true);
        assert.equal(await page.evaluate(() => window.salvamentos),1,'clique repetido não duplica gravação');
        assert.equal(await page.$eval('#secao-faturamento',e=>e.hidden),false);
        assert.match(await page.$eval('#secao-faturamento .portal-par-de-botoes button',e=>e.textContent),/Confirmar dados da nota/);
        await page.click('#secao-faturamento .portal-par-de-botoes button');
        await page.waitForFunction(() => window.portalConfirmacoes.faturamento===true);
        assert.match(await page.$eval('#portal-trilha',e=>e.textContent),/Falta finalizar/);
        await page.click('.portal-proxima-acao');
        assert.equal(await page.$eval('#secao-faturamento',e=>e.hidden),false);
        assert.ok(await page.$('#portal-btn-finalizar'));
        await page.evaluate(() => { clienteState.pedidoFinalizado=true; atualizarPainelDoPedido(); });
        assert.match(await page.$eval('#portal-trilha',e=>e.textContent),/Todas as confirmações foram concluídas/);
        await page.evaluate(() => { portalConfirmacoes.entrega=false; atualizarPainelDoPedido(); });
        assert.match(await page.$eval('#portal-trilha',e=>e.textContent),/Solicitação de correção recebida/);
        assert.doesNotMatch(await page.$eval('#portal-trilha',e=>e.textContent),/Todas as confirmações/);
        await page.evaluate(() => {
            clienteState.pedidoFinalizado=false; portalConfirmacoes.entrega=null; portalConfirmacoes.faturamento=null;
            registrarSecao('entrega', () => document.getElementById('secao-entrega').innerHTML=cartaoDeDecisao('entrega','Informe quem recebe.'));
            redesenharSecao('entrega'); abrirSecao('entrega');
        });
        assert.equal(await page.$eval(selector+' button', e=>e.disabled),true,'bloqueio original preservado');
        assert.match(await page.$eval('#secao-entrega',e=>e.textContent),/Informe quem recebe/);
        assert.equal(await page.evaluate(() => secaoDeAbertura('APROVADO','arte')),'entrega','retorno aponta etapa pendente');
        await page.evaluate(() => { abrirSecao('arte'); mostrarProximaEtapaAposArte(); });
        assert.match(await page.$eval('#portal-artes-aprovadas',e=>e.textContent),/Depois, confirme os dados da nota/);
        const antes = await page.evaluate(() => salvamentos);
        await page.click('#portal-artes-aprovadas button');
        assert.equal(await page.$eval('#secao-entrega',e=>e.hidden),false);
        assert.equal(await page.evaluate(() => salvamentos),antes,'aviso apenas navega, sem aprovar dados');
        await page.evaluate(() => { clienteState.statusArte='Enviar Arte'; state.osItens.teste[0].amostra_status='AGUARDANDO'; abrirSecao('arte'); });
        assert.match(await page.$eval('#portal-trilha',e=>e.textContent),/Etapa 1 de 3/);
        assert.match(await page.$eval('#portal-trilha',e=>e.textContent),/Primeiro aprove as amostras/);
        assert.deepEqual(errors, []);
        console.log('OK: barra 320/390/1100, rolagem, teclado, modal, falha, clique repetido, sequência, finalização e bloqueio.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
