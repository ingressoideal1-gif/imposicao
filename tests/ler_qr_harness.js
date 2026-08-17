// Roda o `despachar()` do `ler-qr.js` num navegador de verdade, servindo a
// pagina de uma ORIGEM escolhida pelo caso.
//
// A origem e o ponto: o QR que a grafica manda por WhatsApp e cunhado com
// `https://imposicao.vercel.app`, e o aplicativo instalado do dono roda em
// `https://ideal-imposition.vercel.app`. Sao dois enderecos do MESMO sistema, e
// ate 17/08/2026 o leitor exigia origem identica e recusava o QR bom.
//
// Recebe {origem, qr} pelo stdin. Devolve {destino, recusou, aviso}.

const path = require('path');
const fs = require('fs');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

const PAGINA = `<!doctype html><meta charset="utf-8"><title>ler qr</title>
<div id="caixa-qr" class="sumindo"></div>
<div id="erro-qr" class="sumindo"></div>
<button id="btn-ler-qr"></button><button id="btn-fechar-qr"></button>
<button id="btn-lanterna-qr"></button>`;

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        const u = new URL(req.url());
        if (u.origin === caso.origem) {
            return req.respond({ status: 200,
                contentType: 'text/html; charset=utf-8', body: PAGINA });
        }
        req.abort();          // nada deste teste sai para a rede
    });

    // A navegacao PODE sair da pagina (o despachar troca o `location.href`).
    // Interceptar o pedido seguinte e o que permite ler para onde ele foi.
    let destino = null;
    page.on('framenavigated', f => {
        if (f === page.mainFrame()) { destino = f.url(); }
    });

    await page.goto(caso.origem + '/ic/controle.html');
    await page.addScriptTag({
        content: fs.readFileSync(path.join(REPO, 'frontend', 'ler-qr.js'), 'utf8')
    });

    await page.evaluate((qr) => { window.lerQR.despachar(qr); }, caso.qr);
    await new Promise(r => setTimeout(r, 600));

    const saida = await page.evaluate(() => {
        const e = document.getElementById('erro-qr');
        return {
            recusou: e ? !e.classList.contains('sumindo') : null,
            aviso: e ? e.textContent : '',
        };
    }).catch(() => ({ recusou: false, aviso: '' }));   // a pagina navegou

    saida.destino = destino;
    await browser.close();
    console.log(JSON.stringify(saida));
}
