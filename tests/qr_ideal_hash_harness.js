// Roda o hash do NAVEGADOR e compara com o que o Python produziu.
//
// E o unico teste do projeto que cobre a falha mais cara possivel: o agente e o
// celular calculando hashes diferentes em silencio, e todo ingresso do evento
// sendo recusado na portaria com o lote ja entregue.
//
// Chamado pelo tests/test_qr_ideal_hash.py, que passa conteudo, sal e o valor
// esperado. Sai com 0 se conferir, 1 se divergir.

const path = require('path');

const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

const [CONTEUDO, SAL, ESPERADO] = process.argv.slice(2);

if (!CONTEUDO || !SAL || !ESPERADO) {
    console.error('uso: node qr_ideal_hash_harness.js <conteudo> <sal> <hash esperado>');
    process.exit(1);
}

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // `crypto.subtle` so existe em contexto seguro, e `about:blank` NAO e um:
    // a origem dele e opaca, e o objeto vem indefinido. `http://localhost` e
    // tratado como confiavel pelo Chrome, entao serve — e nao precisa de
    // servidor de verdade, porque a propria requisicao e interceptada aqui.
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().startsWith('http://localhost/')) {
            return req.respond({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: '<!doctype html><meta charset="utf-8"><title>hash</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/qr-ideal-hash-test');

    const temSubtle = await page.evaluate(
        () => typeof crypto !== 'undefined' && !!crypto.subtle
    );
    if (!temSubtle) {
        console.error('crypto.subtle indisponivel: a pagina nao e contexto seguro');
        await browser.close();
        process.exit(1);
    }

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'qr-ideal-hash.js') });

    const temAFuncao = await page.evaluate(() => typeof window.qrIdealHash === 'function');
    if (!temAFuncao) {
        console.error('qr-ideal-hash.js carregou mas nao registrou window.qrIdealHash');
        await browser.close();
        process.exit(1);
    }

    const obtido = await page.evaluate(
        (c, s) => window.qrIdealHash(c, s), CONTEUDO, SAL
    );

    await browser.close();

    if (obtido !== ESPERADO) {
        console.error('DIVERGIU — o celular recusaria todo ingresso deste evento');
        console.error(`  conteudo:  ${CONTEUDO}`);
        console.error(`  sal:       ${SAL}`);
        console.error(`  navegador: ${obtido}`);
        console.error(`  python:    ${ESPERADO}`);
        process.exit(1);
    }

    console.log(`CONFERE: ${obtido}`);
})().catch(e => {
    console.error('FALHOU:', e && e.message ? e.message : e);
    process.exit(1);
});
