// Carrega a tela de verdade, semeia uma carga no IndexedDB e manda validar um
// texto. Devolve a classe da caixa de resposta e o que ela escreveu.
//
// A camera nao entra aqui: `validarTexto` e a mesma porta por onde a camera e o
// "digitar o numero" passam.

const path = require('path');
const fs = require('fs');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

const ARQUIVOS = ['qr-ideal-hash.js', 'portaria-validacao.js',
                  'portaria-deposito.js', 'portaria.js'];

async function rodar(caso) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        const u = new URL(req.url());
        if (u.hostname !== 'localhost') return req.continue();
        const nome = u.pathname.replace(/^\//, '');
        if (nome === 'portaria.html' || nome === '') {
            let html = fs.readFileSync(path.join(REPO, 'frontend', 'portaria.html'), 'utf8');
            // Sem versao nos scripts: o interceptador serve pelo nome.
            html = html.replace(/\?v=\d+/g, '');
            return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        }
        if (ARQUIVOS.indexOf(nome) !== -1) {
            return req.respond({
                status: 200, contentType: 'application/javascript; charset=utf-8',
                body: fs.readFileSync(path.join(REPO, 'frontend', nome), 'utf8'),
            });
        }
        return req.respond({ status: 404, body: '' });
    });

    await page.goto('http://localhost/portaria.html', { waitUntil: 'networkidle0' });

    const saida = await page.evaluate(async (c) => {
        // `registrar()` chama `sincronizar()` sem aguardar (fire-and-forget), e
        // o teste passa um token falso. Sem isto, cada leitura decidida dispara
        // um fetch DE VERDADE para o Render de producao (o `sincronizar` real
        // nunca fala com localhost) -- barulho no servidor de producao, e uma
        // corrida: o 401 dispararia `desparear()`, que zera a fila no
        // IndexedDB antes de o teste conseguir ler `contarFila()`. Desligar
        // `navigator.onLine` faz `sincronizar()` retornar no primeiro guard,
        // sem nenhuma rede, sem tocar o comportamento real da tela.
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        await window.portariaDeposito.limpar();
        window.portaria.estado.carga = c.carga;
        window.portaria.estado.token = 'token-de-teste';
        await window.portaria.validarTexto(c.texto, c.setorEscolhido || null);
        const caixa = document.getElementById('resposta-caixa');
        const visivel = id => !document.getElementById(id).classList.contains('sumindo');
        return {
            classe: caixa.className,
            titulo: document.getElementById('resposta-titulo').textContent,
            detalhe: document.getElementById('resposta-detalhe').textContent,
            motivo: document.getElementById('resposta-motivo').textContent,
            telaResposta: visivel('tela-resposta'),
            telaAmbiguo: visivel('tela-ambiguo'),
            fila: await window.portariaDeposito.contarFila(),
        };
    }, caso);

    await browser.close();
    console.log(JSON.stringify(saida));
}
