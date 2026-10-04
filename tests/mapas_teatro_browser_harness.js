// HTML e editor reais em navegador, servidor e Supabase simulados, sem serviços externos.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { spawnSync } = require('node:child_process');
if (!process.env.MAPA_TESTE_HTML) {
    for (const arquivo of ['index.html', 'producao.html']) {
        const resultado = spawnSync(process.execPath, [__filename], {
            env: { ...process.env, MAPA_TESTE_HTML: arquivo }, stdio: 'inherit'
        });
        if (resultado.error) throw resultado.error;
        if (resultado.status !== 0) process.exit(resultado.status || 1);
    }
    process.exit(0);
}
const arquivoHtml = process.env.MAPA_TESTE_HTML;
assert.ok(['index.html', 'producao.html'].includes(arquivoHtml));
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'frontend', arquivoHtml), 'utf8');
const script = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(raiz, 'frontend/pedido.js'), 'utf8');
const mapas = fs.readFileSync(path.join(raiz, 'frontend/mapas.js'), 'utf8');
const iniModal = html.indexOf('<div id="modal-mapa-teatro"');
const fimModal = arquivoHtml === 'index.html' ? html.indexOf('<!-- ── View: Criador', iniModal) : html.indexOf('<script>', iniModal);
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
const pagina = `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"></head><body>
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
        page.on('request', req => req.url().startsWith(origem) || req.url().startsWith('blob:' + origem) ? req.continue() : req.abort());
        await page.goto(origem);
        await page.evaluate(() => {
            window.toast = (msg, tipo) => { (window.avisos ||= []).push({ msg, tipo }); };
            window.confirm = () => true;
            window.registros = []; window.gravacoes = []; window.falharUpdate = false;
            window.supabaseClient = { from(tabela) {
                if (tabela !== 'producao_mapas_teatro') throw Error('Tabela não autorizada no teste');
                let acao = 'select', id, payload;
                const q = { select() { return q; }, eq(campo, valor) { id = valor; return q; }, order() { return q; },
                    range(a, b) { return Promise.resolve({ data: registros.slice(a, b + 1), error: null }); },
                    update(p) { acao = 'update'; payload = p; return q; }, insert(p) { acao = 'insert'; payload = p[0]; return q; },
                    async single() {
                        if (payload && Object.keys(payload).some(k => !['name', 'config'].includes(k))) {
                            return { data: null, error: { code: 'PGRST204', message: 'Coluna inexistente' } };
                        }
                        if (payload && !(acao === 'update' && falharUpdate)) gravacoes.push({ acao, payload: JSON.parse(JSON.stringify(payload)) });
                        if (acao === 'update' && falharUpdate) return { data: null, error: { message: 'Falha simulada' } };
                        if (acao === 'insert') { id = registros.length ? 'mapa-browser-' + registros.length : 'mapa-browser'; registros.push({ id, ...payload }); }
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
            + func(script, 'updateImpSummary') + '\n' + func(pedido, 'updatePedSummary')
            + '\n' + func(script, 'confirmarPopup') + '\nwindow.confirmarPopup = confirmarPopup;' });
        const dialogo = '[role="dialog"]';
        async function verificarDialogo(titulo) {
            await page.waitForSelector(dialogo, { visible: true });
            await page.waitForFunction(t => document.querySelector('[role="dialog"] h3')?.textContent === t, {}, titulo);
            assert.equal(await page.$eval(dialogo, el => {
                const b = el.querySelector('[data-role="ok"]'), r = b.getBoundingClientRect();
                return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
            }), true, 'popup acima do editor e clicável');
        }
        async function abrirConfirmacaoSalvar() {
            await page.click('button[onclick="salvarMapaTeatro()"]');
            await verificarDialogo('Salvar mapa de teatro?');
        }
        async function salvarNoBrowser(falha = false) {
            await abrirConfirmacaoSalvar();
            await page.click(dialogo + ' [data-role="ok"]');
            await verificarDialogo(falha ? 'Mapa não salvo' : 'Mapa salvo; publicação pendente');
            assert.equal(await page.$$eval(dialogo + ' button', els => els.length), 1);
            await page.click(dialogo + ' [data-role="ok"]');
            await page.waitForSelector(dialogo, { hidden: true });
        }
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
        await abrirConfirmacaoSalvar();
        assert.equal(await page.evaluate(() => gravacoes.length), 0);
        await page.waitForFunction(() => document.activeElement?.dataset.role === 'cancel');
        await page.keyboard.press('Enter');
        await page.waitForSelector(dialogo, { hidden: true });
        assert.equal(await page.evaluate(() => gravacoes.length), 0);
        assert.equal(await page.$eval('#modal-mapa-teatro', el => el.style.display), 'flex');
        await salvarNoBrowser();
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.match(await page.$eval('#tbody-mapas', el => el.textContent), /9 Assentos/);
        await page.click('#tbody-mapas button');
        await page.waitForSelector('#mapa-setor-props', { visible: true });
        await page.$eval('#mapa-nome', el => { el.value = 'Alteração preservada'; });
        await salvarNoBrowser(true);
        await page.waitForFunction(() => window.avisos.some(a => a.msg.includes('alterações continuam')));
        assert.equal(await page.$eval('#modal-mapa-teatro', el => el.style.display), 'flex');
        assert.equal(await page.$eval('#mapa-nome', el => el.value), 'Alteração preservada');
        await page.evaluate(() => { window.falharUpdate = false; });
        await salvarNoBrowser();
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        // Executa os dois resumos reais: sem recursão, preservando o mapa como fonte do CSV.
        for (const nome of ['itemAtivoDoPedido', 'itensDaImposicao', 'vinculoDeBancoDoModelo', 'bancoTeatroDoModelo']) {
            await page.addScriptTag({ content: func(script, nome) });
        }
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
        // Digitação nos inputs reais: quatro filas numéricas, quatro lugares alfabéticos.
        await page.click('#view-mapas button.btn-primary');
        await page.waitForSelector('#modal-mapa-teatro', { visible: true });
        await page.click('button[onclick="adicionarSetorMapa()"]');
        assert.equal(await page.$eval('#mapa-fileira-inicio', el => el.type), 'text');
        assert.equal(await page.$eval('#mapa-fileira-fim', el => el.type), 'text');
        await page.select('#mapa-fileira-padrao', 'par');
        for (const [campo, valor] of [['prefix','1-4'],['inicio','A'],['fim','D']]) {
            const seletor = '#mapa-fileira-' + campo;
            await page.click(seletor);
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.type(seletor, valor);
        }
        assert.equal(await page.$eval('#mapa-fileira-padrao', el => el.disabled), true);
        assert.equal(await page.$eval('#mapa-fileira-padrao', el => el.value), 'sequencial');
        await page.click('button[onclick="gerarFileiraNoCanvas()"]');
        assert.deepEqual(await page.evaluate(() => Object.values(window.state.mapaAtual.config.setores[0].cadeiras).map(c => `${c.prefixo}:${c.num}`)),
            ['1:A','1:B','1:C','1:D','2:A','2:B','2:C','2:D','3:A','3:B','3:C','3:D','4:A','4:B','4:C','4:D']);
        const pontoAssento = async num => page.evaluate(valor => {
            const s = window.state.mapaAtual.config.setores[0];
            const [gx, gy] = Object.keys(s.cadeiras).find(k => s.cadeiras[k].prefixo === '1' && s.cadeiras[k].num === valor).split(',').map(Number);
            const r = mapCanvas.getBoundingClientRect();
            return {x:r.left+(camera.x+gx*32+12)*r.width/mapCanvas.width,y:r.top+(camera.y+gy*32+12)*r.height/mapCanvas.height};
        }, num);
        const a = await pontoAssento('A'), b = await pontoAssento('B');
        await page.click('#tool-select'); await page.mouse.click(a.x, a.y);
        assert.equal(await page.$eval('#mapa-fileira-inicio', el => el.value), 'B');
        await page.click('#tool-erase'); await page.mouse.click(b.x, b.y);
        assert.equal(await page.evaluate(() => Object.keys(window.state.mapaAtual.config.setores[0].cadeiras).length), 15);
        await page.click('#tool-restore'); await page.mouse.click(b.x, b.y);
        assert.equal(await page.evaluate(() => Object.keys(window.state.mapaAtual.config.setores[0].cadeiras).length), 16);
        assert.equal(await page.evaluate(() => Object.values(window.state.mapaAtual.config.setores[0].cadeiras).filter(c => c.prefixo === '1' && c.num === 'B').length), 1);
        const antes = await page.evaluate(() => JSON.stringify(window.state.mapaAtual.config));
        await page.$eval('#mapa-fileira-fim', el => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('button[onclick="gerarFileiraNoCanvas()"]');
        assert.equal(await page.evaluate(() => JSON.stringify(window.state.mapaAtual.config)), antes);
        assert.ok(await page.evaluate(() => window.avisos.some(a => a.msg.includes('mesmo tipo'))));
        await salvarNoBrowser();
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.equal(await page.evaluate(() => Object.keys(registros.find(m => m.id === 'mapa-browser-1').config.setores[0].cadeiras).length), 16);
        await page.evaluate(() => editarMapaTeatro('mapa-browser-1'));
        await page.waitForSelector('#mapa-setor-props', { visible: true });
        assert.equal(await page.evaluate(() => Object.values(window.state.mapaAtual.config.setores[0].cadeiras).filter(c => /^[A-D]$/.test(c.num)).length), 16);
        for (const prefixo of ['imp', 'ped']) {
            const linhas = await page.evaluate(async p => {
                populateImpMapasTeatro(p); document.getElementById(p + '-mapa-teatro').value = 'mapa-browser-1';
                await loadMapaTeatroData('mapa-browser-1', p);
                return state.csvData.map(c => `${c.Fila}:${c.Numero}`);
            }, prefixo);
            assert.equal(linhas.length, 16); assert.equal(new Set(linhas).size, 16);
        }
        // Sem alterações, sair não abre popup. Alterar só o nome já protege a edição.
        const antesGravacoes = await page.evaluate(() => gravacoes.length);
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.equal(await page.$(dialogo), null);
        await page.evaluate(() => editarMapaTeatro('mapa-browser-1'));
        await page.$eval('#mapa-nome', el => { el.value = 'Nome pendente <img src=x onerror=alert(1)>'; });
        await abrirConfirmacaoSalvar();
        assert.equal(await page.$$eval(dialogo + ' img', els => els.length), 0);
        assert.match(await page.$eval(dialogo, el => el.textContent), /<img src=x onerror=alert\(1\)>/);
        await page.evaluate(() => { void salvarMapaTeatro(); void fecharModalMapaTeatro(); });
        assert.equal(await page.$$eval(dialogo, els => els.length), 1);
        await page.click(dialogo + ' [data-role="cancel"]');
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await verificarDialogo('Sair sem salvar?');
        await page.keyboard.press('Escape');
        await page.waitForSelector(dialogo, { hidden: true });
        assert.equal(await page.$eval('#modal-mapa-teatro', el => el.style.display), 'flex');
        assert.equal(await page.evaluate(() => {
            const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented;
        }), true);
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await verificarDialogo('Sair sem salvar?');
        await page.waitForFunction(() => document.activeElement?.dataset.role === 'cancel');
        await page.keyboard.press('Enter');
        await page.waitForSelector(dialogo, { hidden: true });
        assert.equal(await page.$eval('#modal-mapa-teatro', el => el.style.display), 'flex');
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await verificarDialogo('Sair sem salvar?');
        await page.click(dialogo + ' [data-role="ok"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.equal(await page.evaluate(() => gravacoes.length), antesGravacoes);
        await page.evaluate(() => editarMapaTeatro('mapa-browser-1'));
        assert.equal(await page.$eval('#mapa-nome', el => el.value), 'Novo Teatro');
        assert.equal(await page.evaluate(() => {
            const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented;
        }), false);
        await page.click('button[onclick="adicionarSetorMapa()"]');
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await verificarDialogo('Sair sem salvar?');
        await page.click(dialogo + ' [data-role="ok"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        // O popup compartilhado mantém seu comportamento padrão para os demais usos.
        await page.evaluate(() => {
            window.respostaPopup = null;
            confirmarPopup({ titulo: 'Padrão' }).then(r => { window.respostaPopup = r; });
        });
        await verificarDialogo('Padrão');
        assert.equal(await page.$eval(dialogo, el => el.style.zIndex), '100000');
        assert.equal(await page.$$eval(dialogo + ' button', els => els.length), 2);
        await page.waitForFunction(() => document.activeElement?.dataset.role === 'ok');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.respostaPopup === true);
        // Integração real do PDF no navegador: mesmas bibliotecas e logo do produto.
        for (const arquivo of ['pdf-lib.min.js', 'mapas-teatro-logo.js', 'mapa-teatro-revisao.js', 'mapas-teatro-pdf.js']) {
            await page.addScriptTag({ path: path.join(raiz, 'frontend', arquivo) });
            assert.ok(html.includes(arquivo), arquivo + ' incluído na página real');
        }
        const saida = path.resolve(raiz, '..', 'tmp_mapas-pdf-app-20261003');
        fs.mkdirSync(saida, { recursive: true });
        const cdp = await page.createCDPSession();
        await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: saida });
        await page.evaluate(() => editarMapaTeatro('mapa-browser-1'));
        await page.$eval('#mapa-nome', el => { el.value = 'Teatro sintético PDF'; });
        assert.equal(await page.$eval('#mapa-conjunto-nome', el => el.value), 'Fila');
        await page.$eval('#mapa-conjunto-nome', el => {
            el.value = 'Mesa'; el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('blur'));
        });
        assert.equal(await page.$eval('#mapa-adicionar-conjunto', el => el.textContent), 'Adicionar Mesa no Mapa');
        assert.equal(await page.evaluate(() => {
            const y = id => document.getElementById(id).getBoundingClientRect().y;
            return y('mapa-fileira-prefix') === y('mapa-fileira-inicio') && y('mapa-fileira-inicio') === y('mapa-fileira-fim');
        }), true, 'identificador, início e fim alinhados');
        await page.screenshot({ path: path.join(saida, 'editor-conjunto-' + arquivoHtml + '.png') });
        await page.evaluate(() => {
            const s = window.state.mapaAtual.config.setores[0], cs = Object.values(s.cadeiras);
            cs[0].tipo = 'PCD'; cs[1].tipo = 'Obeso'; cs[2].tipo = 'Acompanhante';
        });
        await abrirConfirmacaoSalvar(); await page.click(dialogo + ' [data-role="ok"]');
        await verificarDialogo('Mapa salvo; publicação pendente');
        assert.match(await page.$eval(dialogo, el => el.textContent), /PDFs do mapa e de cada setor estão prontos/);
        assert.equal(await page.$eval(dialogo + ' [data-role="ok"]', el => el.textContent), 'Ver PDFs');
        await page.click(dialogo + ' [data-role="ok"]');
        await page.waitForSelector('#mapa-pdfs-dialogo', { visible: true });
        assert.match(await page.$eval('#mapa-pdfs-dialogo', el => el.textContent), /16 assentos/);
        assert.equal(await page.$$eval('#mapa-pdfs-dialogo a[download]', els => els.length), 2);
        const provaPdf = await page.evaluate(async () => {
            const link = document.querySelector('#mapa-pdfs-dialogo a[download]');
            const bytes = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
            const pdf = await PDFLib.PDFDocument.load(bytes);
            let texto = '';
            for (const p of pdf.getPages()) {
                const contents = p.node.Contents(), refs = contents.asArray ? contents.asArray() : [contents];
                texto += refs.map(r => new TextDecoder().decode(PDFLib.decodePDFRawStream(pdf.context.lookup(r)).decode())).join('\n');
            }
            return { paginas: pdf.getPageCount(), bytes: Array.from(bytes), texto, tamanho: pdf.getPage(0).getSize() };
        });
        assert.equal(provaPdf.paginas, 1); assert.match(provaPdf.texto, /<3141> Tj/); assert.match(provaPdf.texto, /<3444> Tj/);
        assert.ok(provaPdf.texto.includes('<' + Buffer.from('ASSENTOS POR MESA').toString('hex').toUpperCase() + '> Tj'));
        assert.ok(provaPdf.texto.includes('<' + Buffer.from('Mesa 1').toString('hex').toUpperCase() + '> Tj'));
        assert.ok(!provaPdf.texto.includes(Buffer.from('Fila ').toString('hex').toUpperCase()));
        assert.equal(await page.evaluate(() => registros.find(m => m.id === 'mapa-browser-1').config.setores[0].nomeConjunto), 'Mesa');
        assert.ok(provaPdf.tamanho.width > 800); assert.ok(provaPdf.texto.includes(' Do'), 'logo embutida no PDF');
        fs.writeFileSync(path.join(saida, 'mapa-sintetico-' + arquivoHtml + '.pdf'), Buffer.from(provaPdf.bytes));
        const arquivoDownload = await page.$eval('#mapa-pdfs-dialogo a[download]', el => el.download);
        await page.click('#mapa-pdfs-dialogo a[download]');
        for (let i = 0; i < 80 && !fs.existsSync(path.join(saida, arquivoDownload)); i++) await new Promise(r => setTimeout(r, 50));
        assert.ok(fs.readFileSync(path.join(saida, arquivoDownload)).subarray(0, 5).equals(Buffer.from('%PDF-')));
        await page.screenshot({ path: path.join(saida, 'lista-pdfs-' + arquivoHtml + '.png') });
        await page.click('#mapa-pdfs-dialogo button');
        // O botão da lista relê o servidor e não reutiliza uma revisão antiga.
        await page.evaluate(() => {
            const m = registros.find(m => m.id === 'mapa-browser-1');
            m.name = 'Servidor atualizado PDF';
            m.config.setores[0].cadeiras['99,0'] = { prefixo: '1', num: 'Z', tipo: 'Normal' };
            document.querySelectorAll('#tbody-mapas tr')[1].querySelectorAll('button')[3].click();
        });
        await page.waitForSelector('#mapa-pdfs-dialogo', { visible: true });
        assert.match(await page.$eval('#mapa-pdfs-dialogo', el => el.textContent), /Servidor atualizado PDF/);
        assert.match(await page.$eval('#mapa-pdfs-dialogo', el => el.textContent), /17 assentos/);
        await page.click('#mapa-pdfs-dialogo button');
        // Falha dos recursos PDF mantém o mapa salvo; o botão permite repetir sem UPDATE.
        await page.evaluate(() => { editarMapaTeatro('mapa-browser-1'); window.pdfLibOriginal = PDFLib; window.PDFLib = null; });
        assert.equal(await page.$eval('#mapa-conjunto-nome', el => el.value), 'Mesa');
        await page.$eval('#mapa-nome', el => { el.value = 'Mapa salvo PDF pendente'; });
        await salvarNoBrowser();
        assert.equal(await page.evaluate(() => registros.find(m => m.id === 'mapa-browser-1').name), 'Mapa salvo PDF pendente');
        const gravacoesPdf = await page.evaluate(() => gravacoes.length);
        await page.evaluate(() => { window.PDFLib = window.pdfLibOriginal; void abrirPdfsMapaTeatro('mapa-browser-1'); });
        await page.waitForSelector('#mapa-pdfs-dialogo', { visible: true });
        assert.equal(await page.evaluate(() => gravacoes.length), gravacoesPdf);
        await page.click('#mapa-pdfs-dialogo button');
        const grande = await page.evaluate(async () => {
            const cadeiras = {};
            for (let y = 0; y < 30; y++) for (let x = 0; x < 100; x++) {
                const fila = y < 26 ? String.fromCharCode(65 + y) : 'A' + String.fromCharCode(65 + y - 26);
                cadeiras[(x + Math.floor(x / 25) * 2) + ',' + y] = { prefixo: fila, num: x + 1, tipo: 'Normal' };
            }
            const m = { id: 'mapa-denso-sintetico', name: 'Teatro denso sintético', config: { setores: [{ id: 's-denso', nome: 'Plateia densa', nomeConjunto: 'Camarote', cadeiras }] } };
            const r = await MapasTeatroPdf.gerar(m), doc = await PDFLib.PDFDocument.load(r.bytes);
            const texto = doc.getPages().map(p => p.node.Contents().asArray().map(ref =>
                new TextDecoder().decode(PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode())).join('\n')).join('\n');
            return { total: r.total, paginas: doc.getPageCount(), bytes: Array.from(r.bytes), texto };
        });
        assert.equal(grande.total, 3000); assert.equal(grande.paginas, 1, 'setor denso fica inteiro em uma página');
        assert.ok(grande.texto.includes('<' + Buffer.from('ASSENTOS POR CAMAROTE').toString('hex').toUpperCase() + '> Tj'));
        const rotulosDensos = [...grande.texto.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => Buffer.from(m[1], 'hex').toString('latin1')).filter(t => /^[A-Z]+\d+$/.test(t));
        assert.equal(rotulosDensos.length, 3000); assert.equal(new Set(rotulosDensos).size, 3000, 'nenhum lugar omitido ou repetido');
        for (const proibido of ['Detalhe ', 'Resumo do setor', 'páginas de detalhe', 'Lista completa no resumo']) {
            assert.ok(!grande.texto.includes(Buffer.from(proibido, 'latin1').toString('hex').toUpperCase()));
        }
        fs.writeFileSync(path.join(saida, 'mapa-denso-' + arquivoHtml + '.pdf'), Buffer.from(grande.bytes));
        const varios = await page.evaluate(async () => {
            const setores = [1, 2, 3, 4].map(n => ({ id: 'setor-' + n, nome: 'Setor ' + n,
                ...(n > 1 ? { nomeConjunto: ['Fila', 'Mesa', 'Camarote', 'Sala'][n - 1] } : {}),
                cadeiras: Object.fromEntries(Array.from({ length: n }, (_, x) => [x + ',0', { prefixo: 'A', num: x + 1, tipo: 'Normal' }])) }));
            setores[0].cadeiras['-2,0'] = { prefixo: 'A', num: 99, tipo: 'Apagado' };
            const r = await MapasTeatroPdf.gerar({ id: 'mapa-quatro-setores', name: 'Teatro quatro setores', config: { setores } });
            MapasTeatroPdf.abrir(r);
            const arquivos = [];
            for (const a of r.arquivos) {
                const doc = await PDFLib.PDFDocument.load(a.bytes);
                const texto = doc.getPages().map(p => p.node.Contents().asArray().map(ref =>
                    new TextDecoder().decode(PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode())).join('\n')).join('\n');
                arquivos.push({ id: a.id, qtd: a.quantidade, paginas: a.paginas, texto });
            }
            return { total: r.total, arquivos, bytes: Array.from(r.bytes),
                nomes: r.arquivos.map(a => a.nomeConjunto),
                paginas: (await PDFLib.PDFDocument.load(r.bytes)).getPageCount() };
        });
        assert.equal(varios.total, 10); assert.equal(varios.paginas, 4);
        assert.deepEqual(varios.arquivos.map(a => a.paginas), [1, 1, 1, 1]);
        assert.deepEqual(varios.arquivos.map(a => a.qtd), [1, 2, 3, 4]);
        assert.deepEqual(varios.arquivos.map(a => a.id), ['setor-1', 'setor-2', 'setor-3', 'setor-4']);
        assert.deepEqual(varios.nomes, ['Fila', 'Mesa', 'Camarote', 'Sala']);
        varios.arquivos.forEach((a, i) => assert.ok(a.texto.includes('<' + Buffer.from('ASSENTOS POR ' + varios.nomes[i].toUpperCase()).toString('hex').toUpperCase() + '> Tj')));
        fs.writeFileSync(path.join(saida, 'mapa-conjuntos-' + arquivoHtml + '.pdf'), Buffer.from(varios.bytes));
        assert.equal(await page.$$eval('#mapa-pdfs-dialogo a[download]', els => els.length), 5);
        await page.click('#mapa-pdfs-dialogo button');
        // Legenda extensa não cria anexos nem omite assentos.
        const comLegenda = await page.evaluate(async () => {
            const tiposAssento = Array.from({ length: 24 }, (_, i) => ({ id: 'tipo-' + i, nome: 'Tipo de lugar com nome extenso ' + i, cor: '#3498db' }));
            const cadeiras = Object.fromEntries(tiposAssento.map((t, i) => [i + ',0', { prefixo: 'A', num: i + 1, tipo: t.id }]));
            const r = await MapasTeatroPdf.gerar({ id: 'mapa-legenda-sintetico', name: 'Legenda extensa', config: { tiposAssento, setores: [{ id: 's1', nome: 'Setor', cadeiras }, { id: 's2', nome: 'Vazio', cadeiras: {} }] } });
            return { total: r.total, paginas: (await PDFLib.PDFDocument.load(r.bytes)).getPageCount(), paginasSetores: r.arquivos.map(a => a.paginas) };
        });
        assert.equal(comLegenda.total, 24); assert.equal(comLegenda.paginas, 2);
        assert.deepEqual(comLegenda.paginasSetores, [1, 1]);
        // Persistência via módulo real, com serviço inteiramente simulado.
        await page.addScriptTag({ content: 'const VIBECODE_SUPABASE_URL = ' + JSON.stringify(origem) + ';' });
        await page.evaluate(() => {
            supabaseClient.auth = { async getSession() { return { data: { session: { access_token: 'token-sintetico' } }, error: null }; } };
            window.enviosErp = []; window.exportacoesErp = new Map(); window.falharEnvioErp = false;
            const fetchOriginal = window.fetch;
            window.fetch = async (alvo, opcoes = {}) => {
                const u = new URL(String(alvo));
                if (!u.pathname.startsWith('/functions/v1/mapas-teatro-pdfs/')) return fetchOriginal(alvo, opcoes);
                const id = decodeURIComponent(u.pathname.split('/').at(-2));
                const rev = u.searchParams.get('revisao'), gerador = u.searchParams.get('gerador'), chave = id + ':' + rev;
                if (opcoes.headers.Authorization !== 'Bearer token-sintetico') throw Error('Autenticação ausente');
                if (opcoes.method === 'POST') {
                    enviosErp.push(chave);
                    if (falharEnvioErp) return Response.json({ detail: 'Upload interrompido no teste' }, { status: 502 });
                    const form = opcoes.body, meta = JSON.parse(form.get('manifesto'));
                    const m = registros.find(m => m.id === id);
                    for (let i = 0; i < meta.length; i++) {
                        const a = meta[i], bytes = new Uint8Array(await form.get('pdf_' + i).arrayBuffer());
                        a.paginas = (await PDFLib.PDFDocument.load(bytes)).getPageCount();
                        a.tamanho_bytes = bytes.length;
                        a.nome_setor = i ? m.config.setores[i - 1].nome : null;
                        const query = new URLSearchParams({ revisao: rev, gerador });
                        if (a.setor_id !== null) query.set('setor', a.setor_id);
                        a.pdf_recurso = u.origin + u.pathname.replace('/exportacao', '/arquivo') + '?' + query;
                    }
                    exportacoesErp.set(chave, { mapa_id: id, revisao_exportacao: rev, gerador_versao: gerador, estado: 'pronto', arquivos: meta });
                }
                return Response.json(exportacoesErp.get(chave) || { mapa_id: id, revisao_exportacao: rev, gerador_versao: gerador, estado: 'pendente', arquivos: [] });
            };
        });
        await page.addScriptTag({ path: path.join(raiz, 'frontend/mapas-teatro-pdf-storage.js') });
        assert.ok(html.includes('mapas-teatro-pdf-storage.js'));
        await page.evaluate(() => abrirPdfsMapaTeatro('mapa-browser-1'));
        await page.waitForSelector('#mapa-pdfs-salvar-erp', { visible: true });
        assert.equal(await page.evaluate(() => enviosErp.length), 0, 'abrir mapa existente não publica automaticamente');
        await page.click('#mapa-pdfs-salvar-erp');
        await page.waitForFunction(() => document.getElementById('mapa-pdfs-status-erp').textContent === 'PDFs salvos para o ERP nesta revisão.');
        assert.equal(await page.evaluate(() => enviosErp.length), 1);
        assert.equal(await page.$$eval('#mapa-pdfs-dialogo input[readonly]', els => els.length), 2);
        assert.equal(await page.$eval('#mapa-pdfs-salvar-erp', el => getComputedStyle(el).display), 'none');
        await page.keyboard.press('Escape');
        await page.evaluate(() => abrirPdfsMapaTeatro('mapa-browser-1'));
        await page.waitForSelector('#mapa-pdfs-dialogo', { visible: true });
        assert.match(await page.$eval('#mapa-pdfs-status-erp', el => el.textContent), /PDFs salvos para o ERP/);
        assert.equal(await page.evaluate(() => enviosErp.length), 1);
        await page.keyboard.press('Escape');
        await page.evaluate(() => { editarMapaTeatro('mapa-browser-1'); falharEnvioErp = true; });
        await page.waitForFunction(() => window.state.mapaAtual?.id === 'mapa-browser-1');
        await page.$eval('#mapa-nome', el => { el.value = 'Mapa salvo upload interrompido'; });
        await page.evaluate(() => { window.state.mapaAtual.config.setores[0].nome = 'Setor alterado para testar upload'; });
        await abrirConfirmacaoSalvar(); await page.click(dialogo + ' [data-role="ok"]');
        await verificarDialogo('Mapa salvo; publicação pendente');
        assert.match(await page.$eval(dialogo, el => el.textContent), /envio dos PDFs para o ERP está pendente/);
        assert.equal(await page.evaluate(() => registros.find(m => m.id === 'mapa-browser-1').name), 'Mapa salvo upload interrompido');
        const escritasAntesRetry = await page.evaluate(() => gravacoes.length);
        await page.click(dialogo + ' [data-role="ok"]');
        await page.waitForSelector('#mapa-pdfs-dialogo', { visible: true });
        await page.evaluate(() => { falharEnvioErp = false; });
        await page.click('#mapa-pdfs-salvar-erp');
        await page.waitForFunction(() => document.getElementById('mapa-pdfs-status-erp').textContent === 'PDFs salvos para o ERP nesta revisão.');
        assert.equal(await page.evaluate(() => gravacoes.length), escritasAntesRetry);
        await page.screenshot({ path: path.join(saida, 'lista-pdfs-erp-' + arquivoHtml + '.png') });
        await page.keyboard.press('Escape');
        // Troca real de setores: nomes independentes, edição livre e saída sem salvar.
        await page.evaluate(() => editarMapaTeatro('mapa-browser-1'));
        await page.click('button[onclick="adicionarSetorMapa()"]');
        assert.equal(await page.$eval('#mapa-conjunto-nome', el => el.value), 'Fila');
        await page.$eval('#mapa-conjunto-nome', el => {
            el.value = 'Área VIP'; el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.click('#mapa-setores-list > div:first-child');
        await page.waitForFunction(() => window.setorSelecionadoIdx === 0);
        assert.equal(await page.$eval('#mapa-conjunto-nome', el => el.value), 'Mesa');
        await page.click('#mapa-setores-list > div:last-child');
        await page.waitForFunction(() => window.setorSelecionadoIdx === 1);
        assert.equal(await page.$eval('#mapa-conjunto-nome', el => el.value), 'Área VIP');
        const livre = await page.evaluate(async () => {
            const m = JSON.parse(JSON.stringify(window.state.mapaAtual));
            const r = await MapasTeatroPdf.gerar(m);
            m.config.setores[1].nomeConjunto = 'Sala';
            const outro = await MapasTeatroPdf.gerar(m);
            const doc = await PDFLib.PDFDocument.load(r.arquivos[1].bytes);
            return { mudouRevisao: r.revisao !== outro.revisao, quantidadePreservada: r.total === outro.total,
                texto: doc.getPages().map(p => p.node.Contents().asArray().map(ref =>
                    new TextDecoder().decode(PDFLib.decodePDFRawStream(doc.context.lookup(ref)).decode())).join('\n')).join('\n') };
        });
        assert.equal(livre.mudouRevisao, true); assert.equal(livre.quantidadePreservada, true);
        assert.ok(livre.texto.includes('<' + Buffer.from('ASSENTOS POR ÁREA VIP', 'latin1').toString('hex').toUpperCase() + '> Tj'));
        await page.click('button[onclick="fecharModalMapaTeatro()"]');
        await verificarDialogo('Sair sem salvar?');
        await page.click(dialogo + ' [data-role="ok"]');
        await page.waitForSelector('#modal-mapa-teatro', { hidden: true });
        assert.deepEqual(erros, []);
        console.log(`OK: browser (${arquivoHtml}): nome do conjunto editável, por setor, salvo/reaberto, acentos e revisão; PDFs reais com logo, quatro conjuntos e 3000 assentos; persistência ERP, repetição e saída sem salvar; rótulos e CSV preservados; zero erros JavaScript.`);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
