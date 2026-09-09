// Editor real recortado em página sintética; nenhuma API ou credencial.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const ler = nome => fs.readFileSync(path.join(raiz, nome), 'utf8');
const fonte = ler('frontend/script.js');
function extrair(nome, atribuida = false, codigo = fonte) {
    let inicio = codigo.indexOf(atribuida ? `window.${nome} = function` : `function ${nome}(`);
    assert.ok(inicio >= 0, nome);
    if (codigo.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    const fim = codigo.indexOf('\n}', inicio) + 2;
    return codigo.slice(inicio, fim) + (atribuida ? ';' : '');
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', erro => erros.push(erro.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        await page.setViewport({ width: 1440, height: 800 });
        const botao = ler('frontend/index.html').match(/<button[^>]+onclick="addDatabaseTextElement\(\)"[^>]*>.*?<\/button>/)[0];
        await page.setContent(`<!doctype html><meta charset="utf-8">
            <main style="padding:20px"><h2>Texto — Banco de Dados</h2>${botao}
            <select id="num-tipo" hidden><option>SEQUENCIAL</option></select>
            <div id="elements-list" style="margin-top:16px"></div>
            <canvas id="numeracao-canvas" width="800" height="280" style="background:white;margin-top:16px"></canvas></main>`);
        // O CSS importa fontes web; o teste usa apenas os estilos locais e fontes do Chrome.
        await page.addStyleTag({ content: ler('frontend/style.css').replace(/^@import[^\r\n]*\r?\n/gm, '') });
        for (const arquivo of ['fonte-canvas.js', 'texto-ajuste.js', 'banco-do-modelo.js']) {
            await page.addScriptTag({ content: ler('frontend/' + arquivo) });
        }
        const constantes = fonte.slice(fonte.indexOf('const CORPO_MINIMO_PT ='), fonte.indexOf('function conferirEstouroDoElemento('));
        await page.addScriptTag({ content: `
            const state = { numElements: [], numElCounter: 0, selectedElIds: [],
                numFormato: { width_mm: 120, height_mm: 40 }, canvasScale: 5,
                numCsvHeaders: [], numCsvData: [], numHistory: [], numHistoryIndex: -1 };
            window.state = state;
            const state_fonts = { catalogo: [] };
            window.drawn = [];
            const fill = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
                drawn.push(text); return fill.call(this, text, ...args);
            };
            function renderBoxArquivos() {}
            function toast() {}
            function selectElId(id) { state.selectedElIds = [id]; }
            function selectEl() {}
            function linhasDaAmostra(item, num) { return num.csv_data || []; }
            function drawCanvas() {
                const ctx = document.getElementById('numeracao-canvas').getContext('2d');
                ctx.clearRect(0, 0, 800, 280); drawn.length = 0;
                state.numElements.forEach(el => drawElement(ctx, el, 5));
            }
            ${constantes}
            ${['escapeHtml', 'createFontPicker', 'fontPickerHTML', 'mountFontPickers',
                'isElSelected', 'renderElementsList', 'boxEspacoDoTextoHTML', 'resumoEstouroHTML',
                'conferirEstouroDoElemento', 'textoDeExemploDoElemento', 'bancoDeAmostra',
                'drawElement', 'linhaDeAmostra', 'elementoVisivelNaFace', 'elementoSoLayout',
                'criarCanvasNumeracaoRasterizada'].map(nome => extrair(nome)).join('\n')}
            const previaPainel = (() => { ${extrair('drawNumeracaoElementsOverCanvas')}; return drawNumeracaoElementsOverCanvas; })();
            const previaCliente = (() => { ${extrair('drawNumeracaoElementsOverCanvas', false, ler('frontend/cliente.js'))}; return drawNumeracaoElementsOverCanvas; })();
            ${['addDatabaseTextElement', 'addElement', 'updateEl', 'updateElSource',
                'saveNumHistory', 'duplicateSelectedElements', 'toggleElLock', 'moverElOrdem']
                .map(nome => extrair(nome, true)).join('\n')}
        ` });
        await page.click('button[onclick="addDatabaseTextElement()"]');
        await page.waitForSelector('.font-picker-trigger');
        const novo = await page.evaluate(() => state.numElements[0]);
        assert.equal(novo.type, 'TEXT');
        assert.equal(novo.source, 'database');
        assert.equal(novo.database_text, true);
        assert.equal(novo.pad, 0);
        assert.ok(!novo.fixed);
        const campos = await page.$eval('#elements-list', el => el.textContent);
        for (const nome of ['X (mm)', 'Y (mm)', 'Rotação', 'Cor', 'Face', 'Origem', 'Exemplo:',
            'Largura máxima', 'Se não couber', 'Alinhamento', 'Fonte', 'Tamanho', 'Zeros', 'Prefixo', 'Sufixo']) {
            assert.ok(campos.includes(nome), nome);
        }
        assert.equal(await page.$$eval('select[onchange*="overflow"] option', els => els.length), 3);
        assert.equal(await page.$$eval('select[onchange*="text_align"] option', els => els.length), 3);

        // Peça nova sem coluna; o mapa do modelo resolve por el:<id> e mantém as opções.
        const resolvido = await page.evaluate(() => {
            const el = state.numElements[0], banco = { csv_headers: ['NOME'], csv_data: [{ NOME: 'MARIA' }] };
            const num = { elements: [el] };
            if (BancoDoModelo.elementosSemColunaNoBanco(num, banco, {}).length !== 1) throw Error('Sem coluna deve bloquear');
            const mapa = { ['el:' + el.id]: 'NOME' };
            if (BancoDoModelo.elementosSemColunaNoBanco(num, banco, mapa).length) throw Error('Coluna válida');
            return BancoDoModelo.numeracaoResolvida(num, banco, mapa).elements[0];
        });
        assert.equal(resolvido.csv_column, 'NOME');
        assert.equal(resolvido.database_text, true);

        await page.evaluate(() => {
            state.numCsvHeaders = ['NOME']; state.numCsvData = [{ NOME: '7' }, { NOME: 'MARIA DA SILVA' }];
            renderElementsList();
        });
        await page.select('select[onchange*="csv_column"]', 'NOME');
        await page.evaluate(() => {
            updateEl('el_1', 'pad', 4); updateEl('el_1', 'prefix', 'ID: '); updateEl('el_1', 'suffix', ' VIP');
        });
        assert.deepEqual(await page.evaluate(() => drawn), ['ID: 0007 VIP']);
        const previas = await page.evaluate(async () => {
            const el = state.numElements[0];
            const num = { elements: [el], csv_data: [{ NOME: '7' }, { NOME: '8' }] };
            const ctx = document.getElementById('numeracao-canvas').getContext('2d');
            const resultados = [];
            for (const pintar of [previaPainel, previaCliente]) {
                drawn.length = 0; pintar(ctx, num, {}, 2, 800, 280); resultados.push([...drawn]);
            }
            drawn.length = 0;
            await criarCanvasNumeracaoRasterizada(num, state.numFormato, 'front'); resultados.push([...drawn]);
            return resultados;
        });
        assert.deepEqual(previas, [['ID: 0008 VIP'], ['ID: 0008 VIP'], ['ID: 0007 VIP']]);
        assert.ok((await page.$eval('#resumo-estouro-el_1', el => el.innerText)).includes('2 linhas'));
        await page.evaluate(() => updateEl('el_1', 'max_width_mm', 1));
        assert.ok((await page.$eval('#resumo-estouro-el_1', el => el.innerText)).includes('abaixo de'));

        // Célula vazia não usa o exemplo; zero numérico não desaparece.
        for (const [valor, esperado] of [[0, 'ID: 0000 VIP'], ['', ''], [null, ''], ['AB7', 'ID: AB7 VIP'], ['00012', 'ID: 00012 VIP']]) {
            const desenhado = await page.evaluate(valor => {
                state.numElements[0].max_width_mm = 0;
                state.numCsvData = [{ NOME: valor }]; drawCanvas(); return drawn;
            }, valor);
            assert.deepEqual(desenhado, [esperado]);
        }
        await page.evaluate(() => {
            state.numCsvData = [{ NOME: 'MARIA DA SILVA' }, { NOME: 'ANA COSTA' }];
            updateEl('el_1', 'name', 'Nome do participante');
            updateEl('el_1', 'prefix', 'Nome: '); updateEl('el_1', 'suffix', '');
            updateEl('el_1', 'max_width_mm', 70); updateEl('el_1', 'text_align', 'left');
            renderElementsList(); drawCanvas();
        });
        if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true });
        const payload = await page.evaluate(() => JSON.parse(JSON.stringify(state.numElements[0])));
        if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(payload), 'utf8');
        await page.evaluate(() => {
            toggleElLock('el_1'); duplicateSelectedElements();
            const [a, b] = state.numElements;
            if (!a.locked || b.locked || !b.database_text || b.max_width_mm !== 70) throw Error('Duplicação perdeu configuração');
            moverElOrdem(b.id, 'tras');
            if (state.numElements[0].id !== b.id) throw Error('Ordem');
            const antiga = addElement('TEXT'), fixo = addElement('FIXED');
            if (antiga.database_text || antiga.pad !== 6 || !fixo.fixed) throw Error('Elementos antigos alterados');
        });
        assert.deepEqual(erros, []);
        console.log('OK: criação, painel completo, CSV, mapa do modelo, formatação, aviso de largura e duplicação.');
    } finally { await browser.close(); }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
