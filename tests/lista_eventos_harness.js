// Roda a lista de eventos dentro de um navegador de verdade.
//
// Copia do `tests/chaveiro_harness.js`, com duas trocas: o arquivo carregado e
// `frontend/lista-eventos.js` e o objeto conferido e `window.listaEventos`.
//
// Por que navegador, e nao Node: a `unir()` e pura, mas o arquivo inteiro toca
// DOM e `localStorage` no arranque. Carrega-lo no Node exigiria um dubles de
// `document` que nao se parece com o navegador da estacao -- e o que este teste
// precisa provar e o que o celular do porteiro faz.
//
// Recebe o caso pelo stdin em JSON: {chamada, argumentos, localStorage}.
// Imprime {resultado, localStorage} em JSON no stdout. Sai 1 se o arquivo nao
// carregar.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>lista</title>'
                    + '<div id="eventos"></div><p id="sem-eventos"></p>'
                    + '<div id="erro-arranque"></div>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/lista-eventos-test');

    // Semear ANTES de carregar o arquivo: o chaveiro vive no `localStorage` e
    // a lista o le no arranque. Semear depois testaria outra coisa.
    await page.evaluate((semente) => {
        localStorage.clear();
        Object.keys(semente || {}).forEach(function (k) {
            localStorage.setItem(k, semente[k]);
        });
    }, caso.localStorage || {});

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'chaveiro.js') });
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'lista-eventos.js') });

    const ok = await page.evaluate(() => typeof window.listaEventos === 'object');
    if (!ok) {
        console.error('lista-eventos.js nao registrou window.listaEventos');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate((c) => {
        var r = window.listaEventos[c.chamada].apply(null, c.argumentos);
        var guardado = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            guardado[k] = localStorage.getItem(k);
        }
        return { resultado: r, localStorage: guardado };
    }, caso);

    await browser.close();
    console.log(JSON.stringify(saida));
}
