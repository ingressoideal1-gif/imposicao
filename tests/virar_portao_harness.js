// Roda o `virar-portao.js` dentro de um navegador de verdade.
//
// O que os testes exercitam e a `decidirTroca`, que e pura -- mas ela pergunta
// ao chaveiro se o evento pedido ja e portao deste aparelho, e o chaveiro vive
// no `localStorage`, que nao existe no Node. Dai o navegador.
//
// A ORDEM DE CARGA IMPORTA: `frontend/chaveiro.js` primeiro, `virar-portao.js`
// depois. Invertida, `window.chaveiro` ainda nao existe quando a decisao o
// procura, e o harness quebra num erro que nao tem nada a ver com o que se
// queria testar.
//
// Recebe o caso pelo stdin em JSON: {chamada, argumentos, localStorage}.
// Imprime {resultado, localStorage} em JSON no stdout. Sai 1 se o arquivo nao
// carregar.

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

// O aparelho de mesa destes testes JA E PORTAO de `e-1` e `e-2`, e nunca leu
// `e-9`. E essa a unica coisa que separa 'trocar' de 'criar': a decisao pergunta
// ao chaveiro se o evento pedido ja esta neste aparelho, e nada dentro do caso
// diz isso -- so o chaveiro guardado. Um caso que precise de outro aparelho
// manda o seu proprio `localStorage` e substitui este.
const CHAVEIRO_DE_MESA = {
    ideal_control_portoes: JSON.stringify([
        {
            evento_id: 'e-1', nome_evento: 'Click',
            aparelho_id: 'd-1', nome_portao: 'Portão 1', token: 't-1',
        },
        {
            evento_id: 'e-2', nome_evento: 'Festa da Uva',
            aparelho_id: 'd-2', nome_portao: 'Portão 1', token: 't-2',
        },
    ]),
};

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
                body: '<!doctype html><meta charset="utf-8"><title>virar portao</title>',
            });
        }
        req.continue();
    });
    await page.goto('http://localhost/virar-portao-test');

    // O chaveiro vive no localStorage. Semear ANTES de carregar os arquivos e o
    // que permite montar um aparelho que JA e portao de um evento -- que e o
    // caso em que a decisao devolve 'trocar' em vez de 'criar'.
    await page.evaluate((semente) => {
        localStorage.clear();
        Object.keys(semente || {}).forEach(function (k) {
            localStorage.setItem(k, semente[k]);
        });
    }, caso.localStorage || CHAVEIRO_DE_MESA);

    // O chaveiro ANTES: `decidirTroca` chama `window.chaveiro.procurar`.
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'chaveiro.js') });
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'virar-portao.js') });

    const ok = await page.evaluate(() => typeof window.virarPortao === 'object');
    if (!ok) {
        console.error('virar-portao.js nao registrou window.virarPortao');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate((c) => {
        var r = window.virarPortao[c.chamada].apply(null, c.argumentos);
        // O estado FINAL do localStorage volta junto, no mesmo formato do
        // chaveiro_harness: o dia em que um teste daqui olhar o que ficou
        // guardado, ele ja tem por onde olhar.
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
