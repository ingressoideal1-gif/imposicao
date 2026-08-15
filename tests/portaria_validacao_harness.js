// Roda as seis regras da portaria dentro de um navegador de verdade.
//
// Elas decidem se uma pessoa entra ou nao. Testa-las com dados de mesa e o
// unico jeito de cobrir a ORDEM -- um ingresso pode falhar por dois motivos, e
// o porteiro precisa ouvir o mais util.
//
// Recebe o caso pelo stdin em JSON: {chamada, argumentos}. Imprime o resultado
// em JSON no stdout. Sai 1 se o arquivo nao carregar.

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
                body: '<!doctype html><meta charset="utf-8"><title>portaria</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/portaria-validacao-test');
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'portaria-validacao.js') });

    const ok = await page.evaluate(() => typeof window.portariaValidacao === 'object');
    if (!ok) {
        console.error('portaria-validacao.js nao registrou window.portariaValidacao');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate(
        (c) => window.portariaValidacao[c.chamada].apply(null, c.argumentos), caso);
    await browser.close();
    console.log(JSON.stringify(saida));
}
