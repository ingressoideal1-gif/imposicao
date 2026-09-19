const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

function extrair(fonte, nome) {
    let inicio = fonte.indexOf('\nfunction ' + nome + '(');
    if (inicio < 0) throw new Error('Função ausente: ' + nome);
    let pos = fonte.indexOf('{', inicio), nivel = 0;
    for (; pos < fonte.length; pos++) {
        if (fonte[pos] === '{') nivel++;
        if (fonte[pos] === '}' && --nivel === 0) return fonte.slice(inicio, pos + 1);
    }
    throw new Error('Fim ausente: ' + nome);
}

function testar(arquivo) {
    const fonte = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');
    const state = { formatos: [{ id: 'f1', width_mm: 100, height_mm: 50 }] };
    const desenhados = [];
    const window = {
        desenharTextoAjustado(_ctx, _el, label) { desenhados.push(label); },
    };
    const ctx = {
        save() {}, translate() {}, rotate() {}, restore() {},
    };
    const desenhar = new Function('state', 'window', 'buildCanvasFont',
        extrair(fonte, 'drawNumeracaoElementsOverCanvas')
        + '\nreturn drawNumeracaoElementsOverCanvas;')(state, window, () => '12px sans-serif');
    const elemento = face => ({
        type: 'FIXED', fixed_value: face || 'sem-face', face,
        x_mm: 1, y_mm: 1, font_size: 12,
    });
    const num = { formato_id: 'f1', elements: [
        elemento(undefined), elemento('both'), elemento('front'), elemento('back'),
    ] };

    desenhar(ctx, num, { numeracao_inicio: 1 }, 1, 1000, 500, 'front');
    assert.deepEqual(desenhados.splice(0), ['sem-face', 'both', 'front'], arquivo + ': frente');

    desenhar(ctx, num, { numeracao_inicio: 1 }, 1, 1000, 500, 'back');
    assert.deepEqual(desenhados.splice(0), ['sem-face', 'both', 'back'], arquivo + ': verso');
}

testar('frontend/script.js');
testar('frontend/cliente.js');
console.log('OK: numeração both e sem face aparece na frente e no verso dos PDFs paginados');
