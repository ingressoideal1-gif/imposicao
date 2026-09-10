// Controles e desenho reais em página sintética; nenhuma API ou credencial.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');
function extrair(nome, atribuida = false) {
    const inicio = script.indexOf(atribuida ? `window.${nome} = function` : `function ${nome}(`);
    assert.ok(inicio >= 0, nome);
    return script.slice(inicio, script.indexOf('\n}', inicio) + 2) + ';';
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        const controles = html.match(/<div id="bg-editor-controls"[\s\S]*?<\/div>/)[0];
        const slider = script.match(/<input class="form-control" type="range" min="0" max="1" step="0.05" value="\$\{opAtual\}"\s+oninput="updateElOpacidade[^>]+>/)[0]
            .replaceAll('${opAtual}', '1').replaceAll('${el.id}', 'pdf-teste');
        await page.setContent(`<meta charset="utf-8">${controles}
            <span id="op-val-pdf-teste"></span><div id="op-aviso-pdf-teste"></div>${slider}
            <select id="num-print-mode"><option value="duplex">Frente e verso</option></select>
            <canvas id="numeracao-canvas" width="400" height="200"></canvas>
            <canvas id="numeracao-canvas-verso" width="400" height="200"></canvas>`);
        await page.addScriptTag({ content: `
            const state = { numElements: [], numHistory: [], numHistoryIndex: -1,
                numElCounter: 1, selectedElIds: [], bgLoadToken: 0,
                canvasScale: 4, numFormato: { width_mm: 100, height_mm: 50 } };
            window.testState = state;
            function isElSelected() { return false; }
            function temVerso() { return true; }
            ${['drawCanvasFace', 'drawCanvas', 'drawElement', 'elementoSoLayout',
                'drawImageContain', 'opacidadeDoElemento', 'drawArteDoElemento',
                'avisoOpacidade', 'opacidadeDoFundoNoEditor', 'atualizarControlesDoFundo']
                .map(n => extrair(n)).join('\n')}
            ${['clearBgImage', 'saveNumHistory', 'updateElOpacidade',
                'updateBgEditorOpacity', 'toggleBgEditorVisibility']
                .map(n => extrair(n, true)).join('\n')}
        ` });
        const resultado = await page.evaluate(() => {
            const s = window.testState;
            const fundo = document.createElement('canvas');
            fundo.width = 400; fundo.height = 200;
            fundo.getContext('2d').fillRect(0, 0, 400, 200);
            const el = { id: 'pdf-teste', type: 'PDF', face: 'both', _centerAnchor: true,
                _pdfCanvas: fundo, x_mm: 50, y_mm: 25, width_mm: 100, height_mm: 50, opacity: 0 };
            s.numElements = [el];
            const controle = document.getElementById('bg-editor-opacity');
            const botao = document.getElementById('btn-toggle-bg');
            const controleEl = document.querySelector('input[oninput^="updateElOpacidade"]');
            const pixel = verso => document.getElementById('numeracao-canvas' + (verso ? '-verso' : ''))
                .getContext('2d').getImageData(123, 63, 1, 1).data[0];
            const alterar = (input, valor) => {
                input.value = valor;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            drawCanvas();
            const semFundo = controle.disabled && botao.disabled;
            s.bgImage = s.bgImageVerso = fundo;
            s.bgUrl = 'referencia-sintetica.pdf';
            s.bgFile = new File(['teste'], 'referencia-sintetica.pdf');
            s.bgFilename = s.bgFile.name;
            const arquivo = s.bgFile;
            drawCanvas();
            const padrao = [controle.value, pixel(), controle.disabled, botao.disabled];
            const niveisFundo = [];
            for (let p = 0; p <= 100; p += 5) {
                alterar(controle, p / 100);
                niveisFundo.push([p, pixel(), pixel(true), el.opacity,
                    document.getElementById('bg-editor-opacity-val').textContent]);
            }
            alterar(controle, 0.35);
            const antes = JSON.stringify(el);
            botao.click();
            const oculto = [pixel(), pixel(true), botao.textContent, controle.value];
            // O elemento deve continuar visível mesmo com o fundo oculto.
            const niveisElemento = [];
            for (let p = 0; p <= 100; p += 5) {
                alterar(controleEl, p / 100);
                niveisElemento.push([p, pixel(), pixel(true),
                    document.getElementById('op-val-pdf-teste').textContent]);
            }
            alterar(controleEl, 0);
            botao.click();
            const restaurado = [pixel(), pixel(true), controle.value, botao.textContent];
            const preservado = antes === JSON.stringify(el) && s.bgImage === fundo
                && s.bgImageVerso === fundo && s.bgFile === arquivo
                && s.bgUrl === 'referencia-sintetica.pdf' && s.bgFilename === arquivo.name;
            clearBgImage();
            const limpo = [controle.disabled, botao.disabled, controle.value,
                s.bgEditorVisible, s.bgFile, s.bgUrl];
            s.bgImage = fundo;
            drawCanvas();
            const reaberto = [pixel(), controle.value, botao.textContent];
            return { semFundo, padrao, niveisFundo, oculto, niveisElemento,
                restaurado, preservado, limpo, reaberto };
        });
        assert.deepEqual(erros, []);
        assert.equal(resultado.semFundo, true);
        assert.deepEqual(resultado.padrao, ['0.55', 115, false, false]);
        for (const [p, frente, verso, opElemento, rotulo] of resultado.niveisFundo) {
            assert.ok(Math.abs(frente - 255 * (1 - p / 100)) <= 2, `fundo ${p}%`);
            assert.equal(verso, frente);
            assert.equal(opElemento, 0);
            assert.equal(rotulo, p + '%');
        }
        assert.deepEqual(resultado.oculto, [255, 255, 'Mostrar fundo', '0.35']);
        for (const [p, frente, verso, rotulo] of resultado.niveisElemento) {
            assert.ok(Math.abs(frente - 255 * (1 - p / 100)) <= 2, `elemento ${p}%`);
            assert.equal(verso, frente);
            assert.equal(rotulo, p + '%');
        }
        assert.equal(new Set(resultado.niveisFundo.map(v => v[1])).size, 21);
        assert.equal(new Set(resultado.niveisElemento.map(v => v[1])).size, 21);
        assert.deepEqual(resultado.restaurado, [166, 166, '0.35', 'Ocultar fundo']);
        assert.equal(resultado.preservado, true, 'ocultar preserva arquivo, referência e elementos');
        assert.deepEqual(resultado.limpo, [true, true, '0.55', true, null, '']);
        assert.deepEqual(resultado.reaberto, [115, '0.55', 'Ocultar fundo']);
        console.log('OK: 21 níveis independentes no fundo e no elemento, frente/verso, ocultar/restaurar, arquivo preservado e reinício em 55%.');
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
