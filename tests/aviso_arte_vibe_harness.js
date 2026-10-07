// Cartao real de arte; dados sinteticos e nenhuma API externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.indexOf('\nfunction ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', r => /^(about:|data:)/.test(r.url()) ? r.continue() : r.abort());
        await page.setViewport({ width: 1006, height: 900 });
        await page.setContent('<div id="amostras-itens-container"></div>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'frontend/style.css'), 'utf8').replace(/^@import[^\r\n]*/gm, '') });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend/cor-numeracao-do-modelo.js'), 'utf8') });
        await page.evaluate(() => {
            const noop = () => {};
            for (const name of ['travarCardsDeModelosAprovados', 'pintarSelectsDeNumeracao', 'loadBriefingBase', 'loadAnexosPedido', 'loadUltimosPedidos', 'loadDadosEntregaInterno', 'desenharBoxDeBancos', 'desenharCardsAoAparecer', 'atualizarNavCsvDaAmostra', 'atualizarBotoesCsvDaAmostra', 'pintarSelectDeNumeracao', 'renderItemAmostraCombinada']) window[name] = noop;
            for (const name of ['modeloEstaAprovado', 'podeDestravarModeloAprovado', 'podeCopiarDeModeloAprovado', 'distribuicaoOrfaDoModelo', 'divergenciaDeCelulasDoModelo', 'bancoDeDadosIncompletoDoModelo', 'fonteSemGlifoDoModelo', 'modeloEmCorrecaoDeArte', 'origemDaArteDoModelo']) window[name] = () => null;
            window.celulasRepetidasDoPedido = () => ({});
            window.escalaDaArteDoModelo = () => ({ h:100, v:100 });
            window.ESCALA_ARTE_MIN = 1; window.ESCALA_ARTE_MAX = 1000;
            window.papelAtual = () => 'admin';
            window.tituloDoModeloAprovado = () => '';
            window.seloDeArte = () => '';
            window.renderAcoesEmLoteDoPedido = () => '';
            window.renderDesignersBoxHTML = () => '';
            window.itemTemArte = () => false;
            window.painelPendenciasBriefingEstaAberto = () => false;
            window.pdfImparFrenteVersoParDoModelo = () => false;
            window.pdfDuplicarParaVersoDoModelo = () => false;
            window.rotuloDoCliente = () => 'Cliente sintetico';
            window.linkDoPedidoNoVibe = () => '#'; window.ABA_DO_VIBE = 'vibe';
            window.globalFuzzyMatch = (a,b) => a === b;
            window.compararNumeracoesDoModelo = (a,b) => a.name.localeCompare(b.name);
            window.opcaoDeNumeracaoDoModelo = (n,c,sel) => `<option value="${n.id}" ${sel ? 'selected' : ''}>${n.name}</option>`;
            window.state = { ordens:[{id:'23291', numero:'23291'}], osItens:{}, cores:[], formatos:[], numeracoes:[
                {id:'front-num', name:'90x140 - Só Frente', print_mode:'front'},
                {id:'back-num', name:'90x140 - Frente e Verso', print_mode:'duplex'}
            ] };
            window.item = {id:1002265, nome_produto_real:'Credencial PVC 9x14cm', nome_modelo:'PADRÃO', verso_tipo:'FRENTE E VERSO', frente_verso:true, amostra_num_id:null, gabarito_operacional:'90x140 - Só Frente', quantidade:6, num_inicial:1, num_final:6, variacoes_texto:'Impressão: Frente e Verso'};
            state.osItens['23291'] = [item];
            window.numeracaoDoModelo = i => state.numeracoes.find(n => n.id === i.amostra_num_id || n.name === i.gabarito_operacional);
        });
        await page.addScriptTag({ content: ['escapeHtml', 'escapeJsAttr', 'rotuloDoModoDeImpressao', 'formatarVariacoesDoModelo', 'blocoDeArteDoModelo', 'avisoModoVibeDaAmostra', 'renderAmostrasOSItens', 'atualizarDadosDosCardsAmostra'].map(extract).join('\n') });
        await page.evaluate(() => renderAmostrasOSItens('23291'));
        const warning = '#amostra-modo-vibe-0 [role="alert"]';
        assert(await page.$(warning), 'aviso no cartao de arte do modelo 1002265');
        const visual = await page.$eval(warning, el => ({ text:el.textContent, height:el.getBoundingClientRect().height, before:el.getBoundingClientRect().bottom <= document.querySelector('#amostra-item-num-0').getBoundingClientRect().top }));
        assert(visual.height > 30 && visual.before, 'faixa visivel antes do seletor');
        assert.match(visual.text, /FRENTE E VERSO/);
        assert.match(visual.text, /Numeração: Frente/);
        if (process.env.ARTE_VIBE_SCREENSHOT) await page.screenshot({ path:process.env.ARTE_VIBE_SCREENSHOT, fullPage:true });
        assert.equal(await page.evaluate(() => item.amostra_num_id), null, 'render nao grava vinculo inferido');
        await page.addScriptTag({ content: extract('onItemNumSelect') });
        await page.evaluate(() => {
            window.numeracaoIdDoItem = i => i.amostra_num_id;
            window.sincronizarNumeracaoDoItem = (i,id) => { i.amostra_num_id = id; };
            window.isNumeracaoDuplex = n => n && n.print_mode !== 'front';
            window.pdfViewerState = {};
            window.toast = () => {};
            window.saves = [];
            window.saveAmostraToDB = (id,os,data) => { saves.push(data); return Promise.resolve(); };
            document.querySelector('#amostra-item-num-0').value = 'back-num';
            onItemNumSelect(0, '23291', 1002265);
        });
        assert.equal(await page.$(warning), null, 'troca compativel limpa o aviso');
        await page.evaluate(() => {
            document.querySelector('#amostra-item-num-0').value = 'front-num';
            onItemNumSelect(0, '23291', 1002265);
        });
        assert.equal(await page.evaluate(() => saves.length), 1, 'troca recusada nao grava');
        assert.equal(await page.$eval('#amostra-item-num-0', el => el.value), 'back-num');
        assert.equal(await page.evaluate(() => item.verso_tipo), 'FRENTE E VERSO');
        await page.evaluate(() => { item.amostra_num_id = 'back-num'; renderAmostrasOSItens('23291', { atualizarDados:true }); });
        assert.equal(await page.$(warning), null, 'atualizacao parcial remove conflito resolvido');
        await page.evaluate(() => { item.amostra_num_id = 'front-num'; renderAmostrasOSItens('23291', { atualizarDados:true }); });
        assert(await page.$(warning), 'atualizacao parcial repoe conflito');
        for (const tipo of ['FRENTE E VERSO','VERSO FIXO','VERSO VARIÁVEL']) {
            for (const modo of ['duplex','duplex_unico','pdf_odd_even','pdf_duplicate_back']) {
                assert.equal(await page.evaluate((t,m) => avisoModoVibeDaAmostra({verso_tipo:t},{print_mode:m}), tipo, modo), '');
            }
        }
        await page.evaluate(() => { item.verso_tipo = 'SÓ FRENTE'; renderAmostrasOSItens('23291'); });
        assert.equal(await page.$(warning), null);
        for (const tipo of [null, '', 'INDEFINIDO']) {
            await page.evaluate(tipo => { item.verso_tipo = tipo; renderAmostrasOSItens('23291'); }, tipo);
            assert.equal(await page.$(warning), null, 'tipo não reconhecido com numeração front não avisa incompatibilidade');
            assert.equal(await page.evaluate(() => item.verso_tipo), tipo, 'renderização não regrava o valor do Vibe');
            const conflito = await page.evaluate(tipo => avisoModoVibeDaAmostra({verso_tipo:tipo},{print_mode:'duplex'}), tipo);
            assert(conflito.includes('SÓ FRENTE'), 'conflito usa a categoria assumida, não null/texto desconhecido');
        }
        console.log('OK: cartao real de arte, vinculo por nome, faixa visivel, atualizacao parcial e matriz de compatibilidade.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

