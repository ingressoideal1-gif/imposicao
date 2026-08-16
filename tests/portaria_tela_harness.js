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

const ARQUIVOS = ['jsqr.min.js', 'qr-ideal-hash.js', 'portaria-validacao.js',
                  'portaria-deposito.js', 'portaria-camera.js', 'portaria.js'];

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
            // A casa do aplicativo e so um destino aqui: o que estes testes
            // provam e que a portaria SAI para ela. Servir a `controle.html` de
            // verdade traria supabase-js, login e rede para dentro de um teste
            // que nao e sobre nada disso.
            if (nome === 'controle.html') {
                return req.respond({
                    status: 200, contentType: 'text/html; charset=utf-8',
                    body: '<!doctype html><title>configuracao</title>',
                });
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
        // `fetch` que `sincronizar()` manda para a Edge Function da portaria
        // (era o Render ate 16/08/2026). So respondemos ao mock que o caso
        // pediu explicitamente -- tudo o mais e abortado.
        //
        // A comparacao e de igualdade EXATA, e e isso que faz estes testes
        // valerem como prova do endereco: se `base()` mudar sem que o caso
        // mude junto, o `fetch` e abortado e o teste falha em vez de passar
        // batendo num lugar errado.
        const mock = caso.mock;
        if (mock && u.pathname === mock.pathname) {
            if (req.method() === 'OPTIONS') {
                // Preflight do CORS: e cross-origin (localhost -> supabase.co)
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

    // O token e semeado ANTES de a portaria abrir pela primeira vez. Desde
    // 16/08/2026 o arranque manda para a casa do aplicativo o celular que nao
    // tem token -- nao ha mais tela de codigo onde ele possa esperar --, e sem
    // esta semente a pagina que estes testes querem medir sai da frente antes
    // de qualquer medicao. A escala e a mesma que o `semear()` usa; os modos que
    // precisam de um aparelho SEM token apagam a chave e recarregam.
    await page.goto('http://localhost/controle.html');
    await page.evaluate(() => localStorage.setItem('ideal_portaria_token', 'token-de-teste'));
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
            // Uma leitura PERMITIDA tambem, para provar que um 401 no meio do
            // caminho nao come nem a fila nem a marca de entrada -- as duas
            // guardam o que o cliente pagou para ter.
            await window.portariaDeposito.enfileirar({
                id_local: 'entrada-de-teste',
                momento: new Date().toISOString(),
                credencial_id: 'credencial-de-teste',
                setor_id: null,
                resultado: 'permitido',
                motivo: null,
            });
            const filaAntes = await window.portariaDeposito.contarFila();
            const entradasAntes = await window.portariaDeposito.entradasPermitidas();
            // A tela de recado volta ao repouso antes da sincronizacao: o
            // arranque desta pagina de teste ja passou por ela (nao ha carga
            // semeada, e a rede esta bloqueada), e medir o que estava ali antes
            // faria o teste do 401 passar sem que o 401 tivesse feito nada.
            document.getElementById('tela-aviso').classList.add('sumindo');
            document.getElementById('erro-aviso').textContent = '';
            await window.portaria.sincronizar();
            const filaDepois = await window.portariaDeposito.contarFila();
            const entradasDepois = await window.portariaDeposito.entradasPermitidas();
            // `tela-aviso` substituiu a antiga `tela-pareando` em 16/08/2026:
            // nao ha mais codigo para digitar, e o que sobrou daquela tela e a
            // frase que diz ao porteiro por que este celular parou de ler.
            const telaAvisoVisivel =
                !document.getElementById('tela-aviso').classList.contains('sumindo');
            const mensagem = document.getElementById('erro-aviso').textContent;
            return {
                filaAntes: filaAntes, filaDepois: filaDepois,
                entradasAntes: entradasAntes, entradasDepois: entradasDepois,
                tokenDepois: window.portaria.estado.token,
                telaAvisoVisivel: telaAvisoVisivel, mensagem: mensagem,
            };
        }, caso);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'conferir') {
        // "Digitar o numero" tem de desligar a camera ANTES de validar --
        // igual ao achou() da camera ja faz -- senao a camera pode pegar
        // outro QR no meio da digitacao e pintar a tela com a resposta
        // ERRADA por cima da certa. Nao ha camera de verdade em headless
        // (getUserMedia falha, portariaCamera.ligar() cai no proprio catch
        // dela), entao o que este teste prova e que o BOTAO chama
        // `desligar()` -- que e o que existe para fazer, camera ligada ou
        // nao.
        const saida = await page.evaluate(async (c) => {
            var chamado = false;
            var original = window.portariaCamera.desligar;
            window.portariaCamera.desligar = function () {
                chamado = true;
                return original.apply(this, arguments);
            };
            Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
            await window.portariaDeposito.limpar();
            window.portaria.estado.carga = c.carga;
            window.portaria.estado.token = 'token-de-teste';
            document.getElementById('campo-numero').value = c.texto;
            document.getElementById('btn-conferir').click();
            await new Promise(function (r) { setTimeout(r, 100); });
            return { desligarChamado: chamado };
        }, caso);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    // ── A trava ─────────────────────────────────────────────────────────────
    //
    // Os dois modos abaixo semeiam o celular e RECARREGAM a pagina, em vez de
    // chamar funcoes soltas: o que se quer provar mora no arranque -- qual tela
    // abre, e com qual carga. Semear e chamar `entrarEmLeitura()` na mao
    // pularia justamente a decisao que esta sendo testada.

    async function semear(c) {
        await page.evaluate(async (c) => {
            await window.portariaDeposito.limpar();
            if (c.carga) await window.portariaDeposito.gravarCarga(c.carga);
            for (const l of (c.fila || [])) await window.portariaDeposito.enfileirar(l);
            if (c.token) localStorage.setItem('ideal_portaria_token', c.token);
            else localStorage.removeItem('ideal_portaria_token');
            if (c.reconfigurado) localStorage.setItem('ideal_portaria_reconfigurado', '1');
            else localStorage.removeItem('ideal_portaria_reconfigurado');
        }, c);
        // `Object.defineProperty` nao sobrevive ao reload; isto roda antes de
        // qualquer script da pagina nova.
        await page.evaluateOnNewDocument((online) => {
            Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
        }, !!c.online);
        await page.reload({ waitUntil: 'networkidle0' });
    }

    function esperar(condicao, ms) {
        return page.waitForFunction(condicao, { timeout: ms || 5000 }).catch(() => { });
    }

    // Le a fila direto do IndexedDB, sem passar pelo `portariaDeposito`: depois
    // que a portaria sai para a tela de configuracao, aquele objeto nao existe
    // mais na pagina -- e e justamente ali que se quer saber se a fila
    // sobreviveu.
    function contarFilaCrua() {
        return page.evaluate(() => new Promise((ok) => {
            const r = indexedDB.open('ideal-portaria', 1);
            r.onsuccess = () => {
                const c = r.result.transaction('fila', 'readonly')
                    .objectStore('fila').count();
                c.onsuccess = () => ok(c.result);
                c.onerror = () => ok(-1);
            };
            r.onerror = () => ok(-1);
        }));
    }

    if (caso.modo === 'configurar') {
        await semear(caso);
        // O `document.getElementById` pode devolver null aqui, e isso NAO e
        // defesa decorativa: o aparelho sem token sai sozinho para a casa do
        // aplicativo no arranque, e a partir dai a pagina em que estas linhas
        // rodam ja e outra -- sem botao nenhum para procurar.
        const temBotao = `(function () {`
            + ` var b = document.getElementById('btn-configurar-aparelho');`
            + ` return !!b && !b.classList.contains('sumindo'); })()`;
        await esperar(temBotao
            + ` || window.location.pathname.indexOf('controle.html') !== -1`);
        const visivel = await page.evaluate(temBotao);
        if (visivel) await page.click('#btn-configurar-aparelho');
        // Ou a pagina navega, ou a recusa aparece. Espera as duas.
        await esperar(`window.location.pathname.indexOf('controle.html') !== -1`
            + ` || !document.getElementById('erro-configurar').classList.contains('sumindo')`);
        const url = page.url();
        const saiu = url.indexOf('controle.html') !== -1;
        const saida = {
            botaoVisivel: visivel,
            url: url.replace('http://localhost', ''),
            saiu: saiu,
            mensagem: saiu ? '' : await page.evaluate(() =>
                document.getElementById('erro-configurar').textContent),
            filaDepois: await contarFilaCrua(),
        };
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'reconfigurado') {
        await semear(caso);
        await esperar(`!document.getElementById('tela-lendo').classList.contains('sumindo')`
            + ` || !document.getElementById('tela-aviso').classList.contains('sumindo')`);
        const saida = await page.evaluate(async () => {
            const guardada = await window.portariaDeposito.lerCarga();
            return {
                topo: document.getElementById('topo-aparelho').textContent,
                setoresNoTopo: document.getElementById('topo-setores').textContent,
                eventoDepois: guardada ? guardada.evento.id : null,
                aparelhoDepois: guardada ? guardada.aparelho.nome : null,
                filaDepois: await window.portariaDeposito.contarFila(),
                entradasDepois: Object.keys(
                    await window.portariaDeposito.entradasPermitidas()).length,
                marcaDepois: localStorage.getItem('ideal_portaria_reconfigurado'),
                lendo: !document.getElementById('tela-lendo').classList.contains('sumindo'),
            };
        });
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'atualizar') {
        // O botao "Atualizar o evento" e o unico jeito de um bloqueio criado
        // DEPOIS do pareamento chegar ao aparelho (I5). Ele troca a carga
        // inteira -- mas fila e entradas sao do PORTEIRO, nao do evento, e
        // nao podem ser tocadas por uma atualizacao.
        const saida = await page.evaluate(async (c) => {
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
            await window.portariaDeposito.limpar();
            window.portaria.estado.carga = c.carga;
            window.portaria.estado.token = 'token-de-teste';
            await window.portariaDeposito.enfileirar({
                id_local: 'fila-antiga', momento: '2026-08-20T21:00:00Z',
                credencial_id: null, setor_id: null, resultado: 'negado', motivo: 'desconhecido',
            });
            await window.portariaDeposito.enfileirar({
                id_local: 'entrada-antiga', momento: '2026-08-20T21:01:00Z',
                credencial_id: 'c-antiga', setor_id: null, resultado: 'permitido', motivo: null,
            });
            const filaAntes = await window.portariaDeposito.contarFila();
            const entradasAntes = await window.portariaDeposito.entradasPermitidas();

            const botao = document.getElementById('btn-atualizar-evento');
            botao.click();
            // baixarCarga() e assincrono; espera a tela de leitura reaparecer
            // (sucesso) ou o botao voltar a ficar clicavel (falha).
            await new Promise(function (resolver) {
                (function tenta() {
                    var voltouParaLeitura =
                        !document.getElementById('tela-lendo').classList.contains('sumindo');
                    if (voltouParaLeitura) return resolver();
                    setTimeout(tenta, 20);
                })();
            });

            const filaDepois = await window.portariaDeposito.contarFila();
            const entradasDepois = await window.portariaDeposito.entradasPermitidas();
            const cargaDepois = await window.portariaDeposito.lerCarga();
            return {
                filaAntes: filaAntes, filaDepois: filaDepois,
                entradasAntes: entradasAntes, entradasDepois: entradasDepois,
                nomeEventoDepois: cargaDepois ? cargaDepois.evento.nome : null,
            };
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
