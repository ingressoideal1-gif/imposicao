// Carrega a tela de verdade, semeia uma carga no IndexedDB e manda validar um
// texto -- ou, no modo "sincronizar", testa isoladamente a fila subindo.
// Devolve o que o caso pedir, em JSON pelo stdout.
//
// A camera nao entra aqui: `validarTexto` e a mesma porta por onde a camera e o
// "digitar o numero" passam.
//
// NENHUMA requisicao sai daqui para fora de localhost sem mock explicito. Um
// teste que fala com producao nao e teste: o 401 de volta ja apagou a fila no
// meio de uma execucao (foi o defeito que motivou este comentario, achado em
// revisao de codigo em 15/08/2026). Por isso, mesmo os testes de pintura
// desligando `navigator.onLine` -- o que hoje evita a UNICA chamada de rede
// que existe --, o interceptador tambem recusa por conta propria qualquer
// requisicao fora de localhost que nao bata com o mock do caso. Um fetch novo
// que alguem some amanha (retry de pareamento, telemetria) morre aqui, em vez
// de bater na producao com um token ficticio.

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
        if (u.hostname === 'localhost') {
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
        }

        // Fora de localhost: o unico caminho de rede que a tela tem hoje e o
        // `fetch` que `sincronizar()` manda para o Render. So respondemos ao
        // mock que o caso pediu explicitamente -- tudo o mais e abortado.
        const mock = caso.mock;
        if (mock && u.pathname === mock.pathname) {
            if (req.method() === 'OPTIONS') {
                // Preflight do CORS: e cross-origin (localhost -> onrender.com)
                // com Content-Type json e Authorization, entao o navegador
                // manda isto ANTES do POST de verdade. Sem responder, o
                // preflight falha e o POST nunca sai -- estariamos testando
                // CORS quebrado, nao a regra da fila.
                return req.respond({
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': mock.method,
                        'Access-Control-Allow-Headers': 'authorization,content-type',
                    },
                });
            }
            if (req.method() === mock.method) {
                if (mock.abort) return req.abort('connectionrefused');
                return req.respond({
                    status: mock.status,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    contentType: 'application/json',
                    body: JSON.stringify(mock.body || {}),
                });
            }
        }
        return req.abort('connectionrefused');
    });

    await page.goto('http://localhost/portaria.html', { waitUntil: 'networkidle0' });

    if (caso.modo === 'sincronizar') {
        const saida = await page.evaluate(async (c) => {
            // Explicito de proposito: e o booleano exato que `sincronizar()`
            // confere no primeiro guard. Nos testes de pintura ele fica
            // false (nenhuma rede deve sair); aqui ele tem de ficar true,
            // senao a funcao nunca chega no fetch que este teste cobre.
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

            await window.portariaDeposito.limpar();
            window.portaria.estado.carga = c.carga;
            window.portaria.estado.token = 'token-de-teste';
            await window.portariaDeposito.enfileirar({
                id_local: 'leitura-de-teste',
                momento: new Date().toISOString(),
                credencial_id: null,
                setor_id: null,
                resultado: 'negado',
                motivo: 'desconhecido',
            });
            const filaAntes = await window.portariaDeposito.contarFila();
            await window.portaria.sincronizar();
            const filaDepois = await window.portariaDeposito.contarFila();
            return { filaAntes: filaAntes, filaDepois: filaDepois };
        }, caso);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    const saida = await page.evaluate(async (c) => {
        // Sem isto, `registrar()` dispara `sincronizar()` sem aguardar a cada
        // leitura decidida, e o fetch real bateria em producao com um token
        // falso -- o interceptador acima e o segundo freio, este e o
        // primeiro: aqui a funcao nem chega a tentar.
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
