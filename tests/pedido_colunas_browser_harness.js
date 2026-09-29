// Chromium com cliques reais e API inteiramente sintética; nenhuma chamada externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage(), errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => { if (/^(about:|data:)/.test(r.url())) r.continue(); else { requests.push(r.url()); r.abort(); } });
        await page.setViewport({ width: 1360, height: 900 });
        await page.setContent('<html><body style="background:#101827;color:#eee;font-family:Arial"><button id="abrir" onclick="criarColunasDoPedido(\'os123\')">➕ Criar colunas</button><div id="bancos-pedido-lista-os123"></div></body></html>');
        for (const file of ['style.css', 'pedido-colunas.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'frontend', file), 'utf8').replace(/^@import[^\r\n]*$/gm, '') });
        for (const file of ['csv-editor.js', 'banco-do-modelo.js', 'pedido-colunas.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend', file), 'utf8') });
        const script = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
        const inicio = script.indexOf('window.criarColunasDoPedido = async function');
        const fim = script.indexOf('\n};', inicio) + 3;
        assert.ok(inicio > 0 && fim > inicio);
        await page.addScriptTag({ content: script.slice(inicio, fim) });
        const colInicio = script.indexOf('function abrirColunasDoModelo(idx, osId)');
        await page.addScriptTag({ content: script.slice(colInicio, script.indexOf('\nwindow.abrirColunasDoModelo', colInicio)) });
        await page.evaluate(() => {
            window.__bancos = [{ id: 'b1', id_int:123, nome:'CSV existente', csv_filename:'dados.csv', csv_url:'', csv_headers:['Nome','Código'], csv_data:[
                { __id:7, Nome:'Ana', Código:'0001' }, { __id:9, Nome:'Bruno', Código:'0002' }, { __id:11, Nome:'Carla', Código:'0003' }
            ] }];
            window.__vinculos = [{ modelo_id:'m1', banco_id:'b1', csv_mapa:{ 'el:1':'Nome' } }];
            window.__calls = []; window.__falhar = false; window.__aguardar = false; window.__recarregou = 0;
            window.idIntDoPedido = () => 123;
            window.state = { bancosDoPedido:__bancos, osItens:{ os123:[{ id:'m1' }] }, vinculosDeBanco:{ m1:__vinculos[0] } };
            window.pecaDoModelo = () => ({ name:'Peça sintética', elements:[{ id:1, name:'Nome', type:'TEXT', source:'database' }, { id:2, name:'Setor', type:'TEXT', source:'database' }] });
            window.vinculoDeBancoDoModelo = item => state.vinculosDeBanco[item.id];
            window.escDoBanco = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
            window.rotuloDoModelo = () => 'Modelo 1';
            window.toast = () => {};
            window.carregarBancosDoPedidoNovo = async () => { __recarregou++; };
            window.renderAmostrasOSItens = () => { __recarregou++; };
            window.confirm = () => true;
            window.chamarBancosPedido = async (acao, corpo) => {
                __calls.push(acao);
                if (acao === 'consultar') return structuredClone({ bancos:__bancos, vinculos:__vinculos });
                if (__aguardar) await new Promise(resolve => { window.__soltar = resolve; });
                if (__falhar) throw Error('Falha de rede simulada');
                if (acao === 'atualizar') {
                    const b = __bancos.find(b => b.id === corpo.banco_id); Object.assign(b, corpo); return structuredClone({ banco:b });
                }
                if (acao === 'vincular') {
                    const v = __vinculos.find(v => v.modelo_id === corpo.modelo_id); Object.assign(v, corpo); return structuredClone({ vinculo:v });
                }
                if (acao === 'criar') {
                    const b = { ...corpo, id:'b' + (__bancos.length + 1) }; __bancos.push(b); return structuredClone({ banco:b });
                }
                throw Error('Ação inesperada');
            };
        });
        async function paste(selector, texto) {
            await page.$eval(selector, (el, text) => { const data = new DataTransfer(); data.setData('text/plain', text); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData:data, bubbles:true, cancelable:true })); }, texto);
        }
        async function rename(indice, nome) {
            const s = `[data-coluna="${indice}"]`; await page.click(s); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type(s, nome); await page.keyboard.press('Tab');
        }
        await page.click('#abrir'); await page.waitForSelector('#pc-banco');
        assert.equal(await page.$$eval('[data-celula]', es => es.length), 1, 'banco novo inicia com uma célula');
        await page.select('#pc-banco', 'b1');
        await page.click('#pc-adicionar'); await rename(2, 'Setor');
        await paste('[data-celula="2"][data-linha="0"]', 'VIP\nPista\nCamarote');
        await page.click('[data-limpar="2"][data-linha="1"]');
        assert.equal(await page.$eval('[data-celula="2"][data-linha="2"]', n => n.value), 'Camarote');
        assert.equal(await page.$eval('[data-celula="1"][data-linha="1"]', n => n.value), '0002');
        await rename(0, 'Pessoa');
        await page.evaluate(() => { __falhar = true; __aguardar = true; });
        await page.click('#pc-salvar'); await page.waitForFunction(() => !!window.__soltar);
        assert.equal(await page.$eval('#pc-salvar', n => n.disabled), true);
        assert.ok(await page.$('#pc-grade'), 'editor continua aberto durante gravação');
        await page.evaluate(() => { __aguardar = false; __soltar(); });
        await page.waitForFunction(() => document.getElementById('pc-erro').textContent.includes('Falha de rede'));
        assert.equal(await page.$eval('[data-celula="2"][data-linha="0"]', n => n.value), 'VIP', 'conteúdo preservado no erro');
        await page.evaluate(() => { __falhar = false; });
        await page.click('#pc-salvar'); await page.waitForFunction(() => !document.getElementById('pc-grade'));
        const salvo = await page.evaluate(() => ({ banco:__bancos[0], vinculo:__vinculos[0], recargas:__recarregou }));
        assert.deepEqual(salvo.banco.csv_headers, ['Pessoa','Código','Setor']);
        assert.deepEqual(salvo.banco.csv_data.map(r => r.Setor), ['VIP','','Camarote']);
        assert.deepEqual(salvo.banco.csv_data.map(r => r.__id), [7,9,11]);
        assert.equal(salvo.vinculo.csv_mapa['el:1'], 'Pessoa'); assert.equal(salvo.recargas, 1);
        await page.evaluate(() => abrirColunasDoModelo(0, 'os123'));
        assert.deepEqual(await page.$$eval('.mapa-el[data-el="2"] option', es => es.map(e => e.value)), ['', 'Pessoa', 'Código', 'Setor'], 'opção Colunas oferece dados antigos e novos juntos');
        await page.select('.mapa-el[data-el="2"]', 'Setor');
        assert.equal(await page.$eval('.mapa-el[data-el="1"]', n => n.value), 'Pessoa', 'vínculo existente acompanha renomeação');
        await page.evaluate(() => document.getElementById('colunas-do-modelo-overlay').remove());
        await page.click('#abrir'); await page.waitForSelector('#pc-banco'); await page.select('#pc-banco', 'b1');
        assert.equal(await page.$eval('[data-celula="2"][data-linha="2"]', n => n.value), 'Camarote', 'reabertura lê o que foi salvo');
        await page.click('#pc-cancelar');
        const quantidade = await page.evaluate(() => __bancos.length);
        await page.click('#abrir'); await page.waitForSelector('#pc-banco');
        await paste('[data-celula="0"][data-linha="0"]', 'Ana\t000001\nBruno\t000002');
        await page.click('#pc-cancelar'); assert.equal(await page.evaluate(() => __bancos.length), quantidade, 'cancelar não cria banco');
        await page.click('#abrir'); await page.waitForSelector('#pc-banco');
        await paste('[data-celula="0"][data-linha="0"]', Array.from({length:120}, (_,i) => 'Pessoa ' + (i+1)).join('\n'));
        assert.equal(await page.$$eval('[data-celula]', es => es.length), 50, 'grade paginada');
        await page.click('#pc-proxima'); assert.equal(await page.$eval('[data-linha="50"][data-celula="0"]', n => n.value), 'Pessoa 51');
        await page.setViewport({ width:600, height:800 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'modal cabe em tela estreita');
        await page.setViewport({ width:1360, height:900 });
        await page.click('#pc-cancelar');
        await page.click('#abrir'); await page.waitForSelector('#pc-banco'); await page.select('#pc-banco', 'b1');
        if (process.env.COLUNAS_SCREENSHOT) await page.screenshot({ path:process.env.COLUNAS_SCREENSHOT });
        assert.deepEqual(errors, []); assert.deepEqual(requests, []);
        console.log('Chromium: criar, selecionar CSV, colar, limpar célula, renomear, falhar/repetir salvamento, reabrir, cancelar, paginar e tela estreita aprovados.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
