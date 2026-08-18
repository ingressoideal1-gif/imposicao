// Carrega a tela de verdade, semeia uma carga no IndexedDB e manda validar um
// texto -- ou, nos outros modos, exercita isoladamente a fila subindo, o
// sincronismo, o retorno para a lista e o toque que destrava o som.
// Devolve o que o caso pedir, em JSON pelo stdout.
//
// A camera nao entra aqui: `validarTexto` e a mesma porta por onde a camera e o
// "digitar o numero" passam.
//
// NENHUMA requisicao sai daqui para fora de localhost sem mock explicito. Um
// teste que fala com producao nao e teste: o 401 de volta ja apagou a fila no
// meio de uma execucao (foi o defeito que motivou este comentario, achado em
// revisao de codigo em 15/08/2026). Por isso, mesmo os testes de pintura
// desligando `navigator.onLine` -- o que hoje evita as chamadas de rede que
// existem --, o interceptador tambem recusa por conta propria qualquer
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
                  'portaria-deposito.js', 'portaria-camera.js', 'aviso-sonoro.js',
                  'portaria-sincronismo.js', 'portaria.js'];

// Espia o que a tela FAZ, e nao so o que ela mostra: se a camera parou, e que
// aviso sonoro tocou. Os dois sao invisiveis num `textContent` e sao o coracao
// da tela nova -- o ingresso bom nao pode parar a camera, e a recusa tem de
// apitar diferente.
const ESPIAO = `
    window.__espiao = { desligar: 0, avisos: [], destravou: 0 };
    (function () {
        var original = window.portariaCamera.desligar;
        window.portariaCamera.desligar = function () {
            window.__espiao.desligar += 1;
            return original.apply(this, arguments);
        };
        ['liberado', 'barrado', 'liberar'].forEach(function (nome) {
            var antes = window.avisoSonoro[nome];
            window.avisoSonoro[nome] = function () {
                if (nome === 'liberar') { window.__espiao.destravou += 1; }
                else { window.__espiao.avisos.push(nome); }
                return antes.apply(this, arguments);
            };
        });
    })();
`;

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

        // Fora de localhost: os caminhos de rede que a tela tem sao o `fetch` da
        // fila (`/leituras`), a conferencia on-line de cada leitura
        // (`/entrada`), a carga (`/faixa`) e a rota leve (`/sincronizar`), todos
        // na Edge Function da portaria (era o Render ate 16/08/2026). So
        // respondemos ao mock que o caso pediu explicitamente -- tudo o mais e
        // abortado.
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
                if (mock.demora) {
                    // O servidor que nao responde a tempo. Ele nao pode travar a
                    // leitura: o teto de 800 ms decide sem ele. A resposta chega
                    // DEPOIS, e o teste ja mediu a tela.
                    return setTimeout(() => req.respond({
                        status: mock.status,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        contentType: 'application/json',
                        body: JSON.stringify(mock.body || {}),
                    }).catch(() => { }), mock.demora);
                }
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
        // "Digitar o numero" tem de parar a camera ANTES de validar, senao ela
        // pega outro QR no meio da digitacao e responde a tela com o ingresso
        // ERRADO por cima do certo. Isso passou a valer o dobro em 16/08/2026:
        // a camera nao para mais sozinha ao achar um codigo, entao ela estaria
        // lendo de verdade enquanto o porteiro digita.
        //
        // Nao ha camera em headless (getUserMedia falha, `portariaCamera.ligar`
        // cai no proprio catch dela), entao o que este teste prova e que os
        // botoes chamam `desligar()` -- que e o que existe para fazer, camera
        // ligada ou nao.
        const saida = await page.evaluate(async (c, espiao) => {
            eval(espiao);
            Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
            await window.portariaDeposito.limpar();
            window.portaria.estado.carga = c.carga;
            window.portaria.estado.token = 'token-de-teste';
            // O caminho inteiro do porteiro: abrir a caixa e conferir.
            document.getElementById('btn-digitar').click();
            const aoAbrir = window.__espiao.desligar;
            document.getElementById('campo-numero').value = c.texto;
            document.getElementById('btn-conferir').click();
            await new Promise(function (r) { setTimeout(r, 200); });
            return {
                desligarAoAbrir: aoAbrir > 0,
                desligarChamado: window.__espiao.desligar > 0,
                fila: await window.portariaDeposito.contarFila(),
            };
        }, caso, ESPIAO);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    // ── A trava ─────────────────────────────────────────────────────────────
    //
    // Os modos abaixo semeiam o celular e RECARREGAM a pagina, em vez de
    // chamar funcoes soltas: o que se quer provar mora no arranque -- qual tela
    // abre, com qual carga e com que contador. Semear e chamar
    // `entrarEmLeitura()` na mao pularia justamente a decisao que esta sendo
    // testada.

    async function semear(c) {
        await page.evaluate(async (c) => {
            await window.portariaDeposito.limpar();
            if (c.carga) await window.portariaDeposito.gravarCarga(c.carga);
            if (c.totais) await window.portariaDeposito.gravarTotais(c.totais);
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

    const LENDO = `!document.getElementById('tela-lendo').classList.contains('sumindo')`;

    // Le a fila direto do IndexedDB, sem passar pelo `portariaDeposito`: depois
    // que a portaria sai para a lista de eventos, aquele objeto nao existe
    // mais na pagina -- e e justamente ali que se quer saber se a fila
    // sobreviveu.
    function contarFilaCrua() {
        return page.evaluate(() => new Promise((ok) => {
            // SEM numero de versao, de proposito. Fixado em `1`, este `open`
            // passou a dar `VersionError` no dia em que o deposito subiu para a
            // versao 2 (a loja `totais`, de 16/08/2026) -- e o `onerror`
            // devolvia -1, que o teste lia como "a fila sumiu". A fila estava
            // la; quem estava errado era o arnes. Sem o numero, ele abre a
            // versao que existir e fica imune ao proximo aumento tambem.
            const r = indexedDB.open('ideal-portaria');
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
        // O BOTAO "Configurar este aparelho" saiu da tela em 16/08/2026 (ver o
        // `test_o_botao_de_configurar_saiu_da_tela_de_trabalho`). A trava que
        // ele guardava NAO saiu: quem troca a identidade deste celular continua
        // tendo de esperar a fila subir, e e isso que este modo exercita, agora
        // pela porta exportada.
        await semear(caso);
        // O aparelho SEM token sai sozinho para a casa do aplicativo no
        // arranque, e a partir dai a pagina em que estas linhas rodam ja e outra
        // -- sem `window.portaria` nenhum para chamar.
        await esperar(`window.location.pathname.indexOf('controle.html') !== -1`
            + ` || !!window.portaria`);
        const naPortaria = await page.evaluate(() => !!window.portaria);
        if (naPortaria) {
            await page.evaluate(() => window.portaria.desparear());
        }
        // Ou a pagina navega, ou a recusa aparece. Espera as duas.
        await esperar(`window.location.pathname.indexOf('controle.html') !== -1`
            + ` || !document.getElementById('erro-configurar').classList.contains('sumindo')`);
        const url = page.url();
        const saiu = url.indexOf('controle.html') !== -1;
        const saida = {
            url: url.replace('http://localhost', ''),
            saiu: saiu,
            mensagem: saiu ? '' : await page.evaluate(() =>
                document.getElementById('erro-configurar').textContent),
            // O recado que a portaria deixa ao voltar por falta de token. Sem
            // ele, o desvio e mudo -- e um desvio mudo ja escondeu um defeito
            // por um dia inteiro.
            marcaSemToken: await page.evaluate(
                () => localStorage.getItem('ideal_portaria_sem_token')),
            filaDepois: await contarFilaCrua(),
        };
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'voltar') {
        // O `←` do topo. Ele leva a lista de eventos SEM exigir fila zerada:
        // ir e voltar da lista nao troca o token deste aparelho, e a fila sobe
        // igual depois.
        await semear(caso);
        await esperar(LENDO);
        const visivel = await page.evaluate(() =>
            !document.getElementById('btn-voltar').classList.contains('sumindo'));
        if (visivel) await page.click('#btn-voltar');
        await esperar(`window.location.pathname.indexOf('controle.html') !== -1`);
        const url = page.url();
        const saida = {
            botaoVisivel: visivel,
            url: url.replace('http://localhost', ''),
            saiu: url.indexOf('controle.html') !== -1,
            filaDepois: await contarFilaCrua(),
        };
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'toque') {
        // A capa "Toque para comecar a ler". Navegador nenhum toca audio antes
        // de a pessoa encostar na tela, e ler QR nao conta como encostar.
        await semear(caso);
        await esperar(LENDO);
        const saida = await page.evaluate(async (espiao) => {
            eval(espiao);
            const capa = document.getElementById('btn-toque');
            const antes = !capa.classList.contains('sumindo');
            capa.click();
            await new Promise(function (r) { setTimeout(r, 100); });
            return {
                capaAntes: antes,
                capaDepois: !capa.classList.contains('sumindo'),
                destravou: window.__espiao.destravou,
            };
        }, ESPIAO);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'contador') {
        // O contador ao ABRIR o aplicativo, que e o caso que importa: ele nao
        // pode nascer zerado no meio do evento -- o porteiro nao tem como
        // desconfiar de um numero errado na tela.
        await semear(caso);
        await esperar(LENDO);
        await esperar(`document.getElementById('contador-numeros').textContent !== '…'`);
        const saida = await page.evaluate(() => ({
            numeros: document.getElementById('contador-numeros').textContent,
            pendentes: document.getElementById('contador-pendentes').textContent,
        }));
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'layout') {
        // ONDE cada coisa esta na tela de leitura. Mede no navegador de
        // verdade: "esta na base" e "esta em destaque" sao afirmacoes sobre
        // pixels, e ler o CSS no texto do arquivo provaria so que a regra foi
        // escrita -- nao que ela venceu a cascata.
        await semear(caso);
        await esperar(LENDO);
        const saida = await page.evaluate(() => {
            const cx = (id) => document.getElementById(id).getBoundingClientRect();
            const tamanho = (id) =>
                parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
            const base = document.querySelector('.base').getBoundingClientRect();
            const visor = document.querySelector('.visor').getBoundingClientRect();
            return {
                alturaDaTela: window.innerHeight,
                baseComeca: Math.round(base.top),
                baseTermina: Math.round(base.bottom),
                visorTermina: Math.round(visor.bottom),
                contadorNaBase: !!document.querySelector('.base .contador'),
                lanternaNaBase: !!document.querySelector('.base #btn-lanterna'),
                digitarNaBase: !!document.querySelector('.base #btn-digitar'),
                setorTopo: Math.round(cx('topo-setores').top),
                aparelhoTopo: Math.round(cx('topo-aparelho').top),
                setorCorpo: tamanho('topo-setores'),
                aparelhoCorpo: tamanho('topo-aparelho'),
            };
        });
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    if (caso.modo === 'reconfigurado') {
        await semear(caso);
        await esperar(LENDO
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

    if (caso.modo === 'novidades') {
        // O sincronismo de cinco minutos, disparado a mao. Ele substituiu o
        // botao "Atualizar o evento", que so existia porque nao havia isto --
        // e continua valendo a regra que aquele botao tinha de respeitar: a
        // carga muda, fila e entradas NAO.
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

            await window.portaria.puxarNovidades();

            const cargaDepois = await window.portariaDeposito.lerCarga();
            const setorDepois = (cargaDepois.setores || []).filter(
                (s) => s.id === c.setor)[0] || {};
            return {
                filaAntes: filaAntes,
                filaDepois: await window.portariaDeposito.contarFila(),
                entradasAntes: entradasAntes,
                entradasDepois: await window.portariaDeposito.entradasPermitidas(),
                credenciaisDepois: (cargaDepois.credenciais || []).length,
                eventoAtivoDepois: cargaDepois.evento.ativo,
                setorBloqueadoDepois: !!setorDepois.bloqueado,
                quantidadeDepois: setorDepois.quantidade,
                totaisDepois: await window.portariaDeposito.lerTotais(),
            };
        }, caso);
        await browser.close();
        console.log(JSON.stringify(saida));
        return;
    }

    // ── A leitura ───────────────────────────────────────────────────────────
    //
    // O modo padrao. Aceita um texto ou uma lista deles, com uma pausa
    // opcional entre um e outro -- e assim que o silencio de 2 segundos por
    // codigo se mede sem esperar a camera existir.
    //
    // Semeia e RECARREGA, como os modos acima: desde 16/08/2026 o que se mede
    // aqui inclui a tela em que o aparelho FICA depois da leitura, e chamar
    // `validarTexto` numa pagina parada na tela de recado responderia sempre
    // "nao esta lendo", por motivo nenhum.
    await semear({
        carga: caso.carga, totais: caso.totais,
        token: 'token-de-teste', online: !!caso.online,
    });
    await esperar(LENDO);

    const saida = await page.evaluate(async (c, espiao) => {
        eval(espiao);

        const textos = c.textos || [c.texto];
        // O relogio conta so o que a LEITURA custou, e nao a pausa entre uma e
        // outra: e ele que prova o teto de 800 ms da conferencia on-line.
        let gasto = 0;
        for (let i = 0; i < textos.length; i++) {
            if (i > 0 && c.pausa) {
                await new Promise((r) => setTimeout(r, c.pausa));
            }
            const comecou = Date.now();
            await window.portaria.validarTexto(textos[i], c.setorEscolhido || null);
            gasto += Date.now() - comecou;
        }

        const caixa = document.getElementById('resposta-caixa');
        const visivel = id => !document.getElementById(id).classList.contains('sumindo');
        return {
            classe: caixa.className,
            titulo: document.getElementById('resposta-titulo').textContent,
            detalhe: document.getElementById('resposta-detalhe').textContent,
            motivo: document.getElementById('resposta-motivo').textContent,
            faixa: document.getElementById('faixa-ultima').textContent,
            faixaVazia: document.getElementById('faixa-ultima')
                .classList.contains('vazia'),
            contador: document.getElementById('contador-numeros').textContent,
            pendentes: document.getElementById('contador-pendentes').textContent,
            telaResposta: visivel('tela-resposta'),
            telaAmbiguo: visivel('tela-ambiguo'),
            telaLendo: visivel('tela-lendo'),
            desligouACamera: window.__espiao.desligar > 0,
            avisos: window.__espiao.avisos,
            ms: gasto,
            fila: await window.portariaDeposito.contarFila(),
            // O veredito que foi PARA A FILA. Quando o servidor decide a corrida
            // entre dois portoes, e o dele que tem de subir -- nao o local.
            filaResultados: (await window.portariaDeposito.lerFila(50))
                .map((l) => l.resultado),
        };
    }, caso, ESPIAO);

    await browser.close();
    console.log(JSON.stringify(saida));
}
