// HTML e editor reais em navegador, servidor e Supabase simulados, sem serviços externos.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');
const script = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(raiz, 'frontend/pedido.js'), 'utf8');
const mapas = fs.readFileSync(path.join(raiz, 'frontend/mapas.js'), 'utf8');
const iniModal = html.indexOf('<div id="modal-mapa-teatro"');
const fimModal = html.indexOf('<!-- ── View: Criador', iniModal);
const iniView = html.indexOf('<section id="view-mapas"');
const view = html.slice(iniView, html.indexOf('</section>', iniView) + 10);
assert.ok(iniModal > 0 && fimModal > iniModal);
function func(source, nome) {
    const start = source.indexOf('function ' + nome + '(');
    assert.ok(start >= 0, nome);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const pedMapa = html.match(/<div class="form-group" id="ped-mapa-teatro-group"[\s\S]*?<\/div>/)[0];
const seletores = ['imp', 'ped'].map(p => `<select id="${p}-numeracao"><option value="n1">Teatro</option></select>
    <select id="${p}-numeracao-2"><option value="">Sem verso</option></select>
    <select id="${p}-formato"></select><select id="${p}-saida"></select>
    <select id="${p}-schema"><option value="sequential">Sequencial</option></select>
    <input id="${p}-start" value="1"><input id="${p}-end" value="100"><div id="${p}-summary"></div>`).join('');
const pagina = `<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body>
    ${view}${html.slice(iniModal, fimModal)}${seletores}${pedMapa}
    <div id="imp-mapa-teatro-group"><select id="imp-mapa-teatro"><option value="">Selecione</option></select></div>
    <input id="mapa-salvar-label" hidden></body></html>`;

(async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(path.join(raiz, 'frontend/style.css'))); }
        else { res.setHeader('Content-Type', 'text/html'); res.end(pagina); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        const erros = []; page.on('pageerror', e => erros.push(e.message));
        const origem = `http://127.0.0.1:${server.address().port}`;
        await page.setRequestInterception(true);
        page.on('request', req => req.url().startsWith(origem) ? req.continue() : req.abort());
        await page.goto(origem);
        await page.evaluate(() => {
            window.toast = (msg, tipo) => { (window.avisos ||= []).push({ msg, tipo }); };
            window.confirm = () => true;
            window.registros = []; window.falharUpdate = false;
            window.supabaseClient = { from(tabela) {
                if (tabela !== 'producao_mapas_teatro') throw Error('Tabela não autorizada no teste');
                let acao = 'select', id, payload;
                const q = { select() { return q; }, eq(campo, valor) { id = valor; return q; }, order() { return q; },
                    range(a, b) { return Promise.resolve({ data: registros.slice(a, b + 1), error: null }); },
                    update(p) { acao = 'update'; payload = p; return q; }, insert(p) { acao = 'insert'; payload = p[0]; return q; },
                    async single() {
                        if (acao === 'update' && falharUpdate) return { data: null, error: { message: 'Falha simulada' } };
                        if (acao === 'insert') { id = 'mapa-browser'; registros.push({ id, ...payload }); }
                        if (acao === 'update') registros[registros.findIndex(m => m.id === id)] = { id, ...payload };
                        return { data: JSON.parse(JSON.stringify(registros.find(m => m.id === id) || null)), error: null };
                    }
                };
                return q;
            } };
            document.getElementById('view-mapas').style.display = 'block';
        });
        await page.addScriptTag({ content: mapas });
        await page.addScriptTag({ content: `const state = {csvData:null,numeracoes:[{id:'n1',name:'Teatro',tipo:'TEATRO'}],formatos:[],saidas:[]};
            function drawPreview(){} function drawPedPreview(){} function temVerso(){return false;}
            function registrarContaDaTela(){} function itemAtivoDoPedido(){return null;}
            function atualizarFacesDeImpressaoDoPedido(){} function agendarRedesenhoDaPrevia(){drawPedPreview();}`
            + script.slice(script.indexOf('function populateImpMapasTeatro('), script.indexOf('function onImpNumeracaoSelect()'))
            + func(script, 'updateImpSummary') + '\n' + func(pedido, 'updatePedSummary') });
        await page.click('#view-mapas button.btn-primary');
        await page.waitForSelector('#modal-mapa-teatro', { visible: true });
        await page.click('button[onclick="adicionarSetorMapa()"]');
        await page.evaluate(() => {
            document.getElementById('mapa-fileira-prefix').value = 'A-C';
            document.getElementById('mapa-fileira-inicio').value = '1';
            document.getElementById('mapa-fileira-fim').value = '6';
            document.getElementById('mapa-fileira-padrao').value = 'impar';
        });
        await page.click('button[onclick="gerarFileiraNoCanvas()"]');
        await page.waitForFunction(() => window.state.mapaAtual.config.setores[0].fileiras.length === 3);
        assert.equal(await page.evaluate(() => Object.keys(window.state.mapaAtual.config.setores[0].cadeiras).length), 9);
        assert.match(await page.$eval('#mapa-setores-list', el => el.textContent), /9 assentos/);
        await page.waitForFunction(() => document.getElementById('mapa-canvas').width > 300);
        const pos = await page.evaluate(() => {
            const r = mapCanvas.getBoundingClientRect();
            return { x: r.left + (camera.x - 15 * 32 + 12) * r.width / mapCanvas.width,
                y: r.top + (camera.y + 12) * r.height / mapCanvas.height };
        });
        await page.mouse.click(pos.x, pos.y);
        assert.equal(await page.evaluate(() => window.cadeirasSelecionadas.size), 1);
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => Object.keys(window.state.mapaAtual.config.setores[0].cadeiras).length), 9);
        await page.evaluate(() => { window.falharUpdate = true; });
        // Primeiro salvamento é INSERT; o segundo provoca falha de UPDATE.
        await page.click('button[onclick="salvarMapaTeatro()"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.match(await page.$eval('#tbody-mapas', el => el.textContent), /9 Assentos/);
        await page.click('#tbody-mapas button');
        await page.waitForSelector('#mapa-setor-props', { visible: true });
        await page.$eval('#mapa-nome', el => { el.value = 'Alteração preservada'; });
        await page.click('button[onclick="salvarMapaTeatro()"]');
        await page.waitForFunction(() => window.avisos.some(a => a.msg.includes('alterações continuam')));
        assert.equal(await page.$eval('#modal-mapa-teatro', el => el.style.display), 'flex');
        assert.equal(await page.$eval('#mapa-nome', el => el.value), 'Alteração preservada');
        await page.evaluate(() => { window.falharUpdate = false; });
        await page.click('button[onclick="salvarMapaTeatro()"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        // Executa os dois resumos reais: sem recursão, preservando o mapa como fonte do CSV.
        for (const prefixo of ['imp', 'ped']) {
            const quantidade = await page.evaluate(async p => {
                populateImpMapasTeatro(p);
                document.getElementById(p + '-mapa-teatro').value = 'mapa-browser';
                if (p === 'ped') updatePedSummary(); else updateImpSummary();
                await loadMapaTeatroData('mapa-browser', p);
                return state.csvData.length;
            }, prefixo);
            assert.equal(quantidade, 9);
        }
        // Visibilidade no documento integral: o seletor Pedido deve ficar fora do bloco oculto.
        await page.evaluate(conteudo => {
            const integral = new DOMParser().parseFromString(conteudo, 'text/html');
            const seletor = integral.getElementById('ped-mapa-teatro');
            for (let el = seletor; el; el = el.parentElement) {
                if (/display:\s*none\s*!important/.test(el.getAttribute('style') || '')) throw Error('Seletor oculto por ancestral');
            }
        }, html);
        assert.deepEqual(erros, []);
        console.log('OK browser: editor real, 9 assentos, clique no canvas, colisão, falha/repetição de salvamento, seletores e resumos Imp/Pedido; zero erros JavaScript.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
