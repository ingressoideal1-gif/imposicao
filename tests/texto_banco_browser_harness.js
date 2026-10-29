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
                'criarCanvasNumeracaoRasterizada', 'elementosNaOrdemDeComposicao',
                'elementoMesclaComArte'].map(nome => extrair(nome)).join('\n')}
            const previaPainel = (() => { ${extrair('drawNumeracaoElementsOverCanvas')}; return drawNumeracaoElementsOverCanvas; })();
            const previaCliente = (() => { ${extrair('drawNumeracaoElementsOverCanvas', false, ler('frontend/cliente.js'))}; return drawNumeracaoElementsOverCanvas; })();
            ${['addDatabaseTextElement', 'addElement', 'updateEl', 'updateElSource',
                'saveNumHistory', 'duplicateSelectedElements', 'toggleElLock', 'moverElOrdem']
                .map(nome => extrair(nome, true)).join('\n')}
        ` });
        // Ordem global das passagens, coordenadas identicas e largura preservada.
        const passagens = await page.evaluate(() => {
            const resultados = [];
            for (const overflow of ['shrink', 'wrap', 'condense']) {
                for (const fio of [0, 0.4, 10]) {
                    const ctx = document.createElement('canvas').getContext('2d');
                    const chamadas = [];
                    ctx.strokeText = (texto, x, y) => chamadas.push({ tipo: 'fio', texto, x, y, largura: ctx.lineWidth });
                    ctx.fillText = (texto, x, y) => chamadas.push({ tipo: 'texto', texto, x, y });
                    const ajuste = desenharTextoAjustado(ctx, {
                        type: 'TEXT', database_text: true, max_width_mm: 35,
                        overflow, text_stroke_mm: fio, text_stroke_color: '#ff0000'
                    }, 'MARIA DA SILVA E COSTA', 48, 2, fs => `${fs}px Arial`);
                    resultados.push({ overflow, fio, chamadas, linhas: ajuste.linhas.length });
                }
            }
            return resultados;
        });
        for (const { overflow, fio, chamadas, linhas } of passagens) {
            const contornos = chamadas.filter(c => c.tipo === 'fio');
            const textos = chamadas.filter(c => c.tipo === 'texto');
            assert.equal(textos.length, linhas);
            assert.equal(contornos.length, fio ? linhas : 0);
            if (overflow === 'wrap') assert.ok(linhas > 1);
            assert.deepEqual(chamadas.map(c => c.tipo), [
                ...contornos.map(() => 'fio'), ...textos.map(() => 'texto')
            ]);
            contornos.forEach((c, i) => {
                assert.ok(Math.abs(c.largura - fio * 2) < 1e-6);
                assert.deepEqual([c.texto, c.x, c.y], [textos[i].texto, textos[i].x, textos[i].y]);
            });
        }
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

        // Contorno editável, persistido no elemento e desenhado com o preenchimento.
        await page.evaluate(() => {
            window.contornos = [];
            const stroke = CanvasRenderingContext2D.prototype.strokeText;
            CanvasRenderingContext2D.prototype.strokeText = function (texto, x, y) {
                contornos.push({ texto, cor: this.strokeStyle, largura: this.lineWidth });
                return stroke.call(this, texto, x, y);
            };
            state.selectedElIds = ['el_1']; renderElementsList();
        });
        const fio = '[onchange*="\'text_stroke_mm\'"]';
        const corFio = '[onchange*="\'text_stroke_color\'"]';
        for (const seletor of [fio, corFio]) {
            assert.equal(await page.$eval(seletor, el => el.checkVisibility()), true);
        }
        await page.$eval(corFio, el => {
            el.value = '#ff0000'; el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.$eval(fio, el => {
            el.value = '0.4'; el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const contorno = await page.evaluate(() => {
            state.numElements = JSON.parse(JSON.stringify(state.numElements));
            renderElementsList(); contornos.length = 0; drawCanvas();
            return { el: state.numElements[0], desenhos: contornos };
        });
        assert.equal(contorno.el.text_stroke_mm, 0.4);
        assert.equal(contorno.el.text_stroke_color, '#ff0000');
        assert.ok(contorno.desenhos.length > 0);
        assert.equal(contorno.desenhos[0].cor, '#ff0000');
        assert.equal(contorno.desenhos[0].largura, 2);
        for (const [valor, esperado] of [['-1', 0], ['20', 10], ['', 0]]) {
            await page.$eval(fio, (el, valor) => {
                el.value = valor; el.dispatchEvent(new Event('change', { bubbles: true }));
            }, valor);
            assert.equal(await page.evaluate(() => state.numElements[0].text_stroke_mm), esperado);
        }
        assert.deepEqual(await page.evaluate(() => { contornos.length = 0; drawCanvas(); return contornos; }), []);

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
            el.text_stroke_mm = 0.4;
            const num = { elements: [el], csv_data: [{ NOME: '7' }, { NOME: '8' }] };
            const ctx = document.getElementById('numeracao-canvas').getContext('2d');
            const resultados = [];
            for (const pintar of [previaPainel, previaCliente]) {
                contornos.length = 0;
                drawn.length = 0; pintar(ctx, num, {}, 2, 800, 280); resultados.push([...drawn]);
                if (!contornos.length || contornos[0].cor !== '#ff0000') throw Error('Prévia sem contorno');
            }
            drawn.length = 0;
            contornos.length = 0;
            await criarCanvasNumeracaoRasterizada(num, state.numFormato, 'front'); resultados.push([...drawn]);
            if (!contornos.length) throw Error('Raster sem contorno');
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
        // Teatro e Camarote usam os mesmos controles, inclusive ao reabrir o JSON salvo.
        for (const type of ['TEATRO_FILA', 'TEATRO_LUGAR', 'TEATRO_COMBO',
            'CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL']) {
            await page.evaluate(type => {
                state.numElements = [{ id: 'espaco', type, x_mm: 20, y_mm: 20,
                    font_name: 'helv', font_size: 12, prefix: 'Exemplo longo ', pad: 6 }];
                renderElementsList();
            }, type);
            const campo = nome => `#elcard-espaco [onchange*="'${nome}'"]`;
            for (const source of [undefined, 'sequential', 'database']) {
                await page.evaluate(source => {
                    state.numElements[0].source = source;
                    state.selectedElIds = ['espaco'];
                    renderElementsList();
                }, source);
                for (const nome of ['max_width_mm', 'overflow', 'text_align']) {
                    assert.equal(await page.$eval(campo(nome), el => el.checkVisibility()), true,
                        `${type}/${source}: ${nome} precisa estar visível`);
                }
            }
            assert.equal(await page.$eval(campo('max_width_mm'), el => el.value), '', type);
            assert.equal(await page.$eval(campo('overflow'), el => el.value), 'shrink', type);
            assert.equal(await page.$eval(campo('text_align'), el => el.value), 'center', type);
            for (const modo of ['shrink', 'condense', 'wrap']) {
                for (const alinhamento of ['left', 'center', 'right']) {
                    await page.$eval(campo('max_width_mm'), el => {
                        el.value = '15.5'; el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                    await page.select(campo('overflow'), modo);
                    await page.select(campo('text_align'), alinhamento);
                    const salvo = await page.evaluate(() => {
                        state.numElements = JSON.parse(JSON.stringify(state.numElements));
                        renderElementsList(); drawCanvas();
                        return state.numElements[0];
                    });
                    assert.equal(salvo.max_width_mm, 15.5, type);
                    assert.equal(salvo.overflow, modo, type);
                    assert.equal(salvo.text_align, alinhamento, type);
                    assert.equal(salvo.pad, 6, type);
                    assert.equal(await page.$eval(campo('overflow'), el => el.value), modo, type);
                    assert.equal(await page.$eval(campo('text_align'), el => el.value), alinhamento, type);
                }
            }
            await page.$eval(campo('max_width_mm'), el => {
                el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            assert.equal(await page.evaluate(() => state.numElements[0].max_width_mm), 0, type);
        }
        assert.deepEqual(erros, []);
        console.log('OK: criação, painel completo, CSV, mapa do modelo, formatação, aviso de largura e duplicação.');
    } finally { await browser.close(); }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
