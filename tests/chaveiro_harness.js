// Roda o chaveiro dentro de um navegador de verdade.
//
// Ele guarda os portoes deste aparelho no `localStorage`, e e por isso que o
// teste precisa de navegador: `localStorage` nao existe no Node, e as duas
// coisas que nao podem errar aqui -- a migracao da instalacao antiga e "um
// portao por aparelho" -- sao justamente sobre o que ficou GUARDADO.
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
                body: '<!doctype html><meta charset="utf-8"><title>chaveiro</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/chaveiro-test');

    // O chaveiro vive no localStorage. Semear ANTES de carregar o arquivo e o
    // que permite testar a migracao da instalacao antiga -- que so acontece
    // uma vez, no primeiro arranque.
    await page.evaluate((semente) => {
        localStorage.clear();
        Object.keys(semente || {}).forEach(function (k) {
            localStorage.setItem(k, semente[k]);
        });
    }, caso.localStorage || {});

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'chaveiro.js') });

    const ok = await page.evaluate(() => typeof window.chaveiro === 'object');
    if (!ok) {
        console.error('chaveiro.js nao registrou window.chaveiro');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate((c) => {
        var r = window.chaveiro[c.chamada].apply(null, c.argumentos);
        // O estado FINAL do localStorage volta junto: metade destes testes e
        // sobre o que ficou guardado, nao sobre o que a funcao devolveu.
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
