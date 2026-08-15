// Roda o deposito (IndexedDB) da portaria num navegador de verdade.
//
// A fila e o que impede a gráfica de perder leitura quando a rede cai no
// portao. Testa-la sem navegador seria testar outra coisa: IndexedDB nao existe
// no Node.
//
// Recebe pelo stdin {roteiro: "<corpo de funcao async>"} e imprime o que ele
// devolver, em JSON.

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
                body: '<!doctype html><meta charset="utf-8"><title>deposito</title>',
            });
        }
        req.continue();
    });
    // IndexedDB precisa de origem de verdade: `about:blank` tem origem opaca.
    await page.goto('http://localhost/portaria-deposito-test');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'portaria-deposito.js') });

    const ok = await page.evaluate(() => typeof window.portariaDeposito === 'object');
    if (!ok) {
        console.error('portaria-deposito.js nao registrou window.portariaDeposito');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate(
        corpo => new Function('d', 'return (async () => { ' + corpo + ' })()')
            (window.portariaDeposito),
        caso.roteiro);
    await browser.close();
    console.log(JSON.stringify(saida === undefined ? null : saida));
}
