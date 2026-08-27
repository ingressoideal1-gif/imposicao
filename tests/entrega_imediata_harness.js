// ENTREGAR CADA LOTE ENQUANTO O MOTOR AINDA GERA (27/08/2026).
//
// O usuario relatou, depois de a entrega por bloco entrar no ar:
//
//   "esta gerando em blocos e ou em folhas, mas esta enviando ao hotfolder ou
//    a impressora somente apos o termino da imposicao de todas as paginas"
//
// A causa estava aqui no frontend: a tela juntava TODOS os arquivos que o
// streaming trazia numa `printBlobQueue` e so chamava o envio depois que o
// laco de leitura terminava. O motor cortava certo; ninguem consumia o corte.
//
// O que este harness mede e o objeto de entrega que substituiu aquilo. Ele
// existe porque ha estado que atravessa os lotes -- e e justamente esse estado
// que um envio "um por vez" ingenuo perderia:
//
//   - a ORDEM do spool tem de continuar subindo de lote em lote. O watcher do
//     hot folder le a pasta em ordem alfabetica, entao reiniciar em 00001 a
//     cada lote embaralharia a tiragem no papel.
//   - o relatorio final e a conferencia do hot folder acontecem UMA vez, no
//     fim, e nao a cada lote.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// ─── O codigo de verdade, lido do script.js ────────────────────────────────
//
// Nao ha copia aqui de proposito: um harness que reimplementa a funcao passa a
// medir a si mesmo.

const iCriar = SCRIPT.indexOf('function criarEntregaDeImpressao(');
const iFimCriar = SCRIPT.indexOf('\nwindow.criarEntregaDeImpressao', iCriar);
const iEnviar = SCRIPT.indexOf('async function sendPrintJobDirect(queue) {');
const iFimEnviar = SCRIPT.indexOf('\n}', SCRIPT.indexOf('throw e;', iEnviar)) + 2;
const iSpool = SCRIPT.indexOf('function nomeParaSpool(');
const iFimSpool = SCRIPT.indexOf('\n}', iSpool) + 2;
// O leitor do painel de impressao vem inteiro do script.js tambem: e ele que
// decide impressora, hot folder, bandeja e as opcoes de reversa/folha a folha.
const iOpcoes = SCRIPT.indexOf('function getPedPrintOptions() {');
const iFimOpcoes = SCRIPT.indexOf('\n}', SCRIPT.indexOf('return { printerName, options };', iOpcoes)) + 2;
const iAtivo = SCRIPT.indexOf('function _hotFolderAtivo() {');
const iFimAtivo = SCRIPT.indexOf('\n}', SCRIPT.indexOf("return (document.getElementById('ped-hotfolder-path')", iAtivo)) + 2;

if (iCriar < 0 || iFimCriar < 0 || iEnviar < 0 || iSpool < 0) {
    throw new Error('nao achei criarEntregaDeImpressao / sendPrintJobDirect / nomeParaSpool no script.js');
}

const FONTE_ENTREGA = SCRIPT.slice(iCriar, iFimCriar)
    + '\n' + SCRIPT.slice(iEnviar, iFimEnviar)
    + '\n' + SCRIPT.slice(iSpool, iFimSpool)
    + '\n' + SCRIPT.slice(iOpcoes, iFimOpcoes)
    + '\n' + SCRIPT.slice(iAtivo, iFimAtivo);

// ─── O mundo de mentira em volta ───────────────────────────────────────────

function montarCenario(opcoes) {
    opcoes = opcoes || {};
    const campos = Object.assign({
        'ped-print-printer': { value: '' },
        'ped-hotfolder-enabled': { checked: true },
        'ped-hotfolder-path': { value: 'C:\\HOT' },
        'ped-print-reverse': { checked: false },
        'ped-print-sheet-by-sheet': { checked: false },
    }, opcoes.campos || {});

    const botoes = {
        'ped-btn-cancel-print': { style: { display: 'none' } },
        'ped-btn-impose': { style: { display: 'inline-flex' } },
        'ped-btn-impose-print': { style: { display: 'inline-flex' } },
        'ped-tray-dual': { style: { display: 'none' } },
    };

    const toasts = [];
    const enviados = [];       // o que chegou ao destino, na ordem
    const temporizadores = [];

    const doc = {
        getElementById(id) {
            if (botoes[id]) return botoes[id];
            if (campos[id]) return campos[id];
            return null;
        }
    };

    class FormDataFalsa {
        constructor() { this.campos = {}; }
        append(nome, valor, nomeArquivo) {
            this.campos[nome] = (nomeArquivo !== undefined) ? nomeArquivo : valor;
        }
    }

    async function fetchFalso(url, init) {
        if (String(url).includes('/api/hotfolder/drop')) {
            const nome = init.body.campos.file;
            enviados.push(nome);
            return { ok: true, json: async () => ({ path: 'C:\\HOT\\' + nome }) };
        }
        if (String(url).includes('/api/print/submit')) {
            enviados.push(init.body.campos.file);
            return { ok: true, text: async () => '' };
        }
        if (String(url).includes('/api/hotfolder/conferir')) {
            return { ok: true, json: async () => ({ restantes: [] }) };
        }
        return { ok: true, json: async () => ({}), text: async () => '' };
    }

    const janela = { _printCancelRequested: false, isPrinting: false, location: { hostname: 'localhost' } };

    const criar = new Function(
        'window', 'document', 'toast', 'fetch', 'FormData', 'setTimeout',
        'processPrintQueueOptions', 'nomeObjetoStorage',
        '_conferirConsumoHotFolder', 'AGENTE_LOCAL_URL', 'console',
        FONTE_ENTREGA + '\nreturn { criarEntregaDeImpressao, sendPrintJobDirect };'
    )(
        janela, doc, (msg, tipo) => toasts.push({ msg, tipo }), fetchFalso, FormDataFalsa,
        (fn, ms) => { temporizadores.push(fn); return 1; },
        async (fila) => fila, (n) => n,
        function (caminhos) { if (caminhos && caminhos.length) enviados.push('__CONFERIU__'); },
        'http://127.0.0.1:9000', console
    );

    return { criar, janela, doc, toasts, enviados, botoes, campos };
}

// ─── 1. O destino e conferido ANTES de o papel ser gerado ──────────────────

(function semDestinoNaoComeca() {
    const c = montarCenario({ campos: {
        'ped-hotfolder-enabled': { checked: false },
        'ped-print-printer': { value: '' },
    } });
    const e = c.criar.criarEntregaDeImpressao();
    ok(e === null, 'sem impressora e sem hot folder, a entrega nem nasce');
    ok(c.toasts.some(t => t.tipo === 'error'), 'e o operador ouve o porque', c.toasts);
})();

(function hotFolderMarcadoSemPasta() {
    const c = montarCenario({ campos: { 'ped-hotfolder-path': { value: '' } } });
    ok(c.criar.criarEntregaDeImpressao() === null,
       'HOT FOLDER marcado sem pasta escolhida tambem nao passa');
})();

// ─── 2. Cada lote sai na hora, e a ordem do papel se mantem ────────────────

(async function cadaLoteSaiNaHora() {
    const c = montarCenario();
    const e = c.criar.criarEntregaDeImpressao();
    ok(e !== null, 'com hot folder escolhido, a entrega nasce');

    await e.entregar([{ name: 'trabalho_lote001.pdf', blob: 'b1' }]);
    ok(c.enviados.length === 1,
       'o primeiro lote foi para a pasta ANTES de o segundo existir -- e o ponto '
       + 'inteiro do recurso: papel comecando a sair enquanto o motor ainda gera',
       c.enviados);

    await e.entregar([{ name: 'trabalho_lote002.pdf', blob: 'b2' }]);
    await e.entregar([{ name: 'trabalho_lote003.pdf', blob: 'b3' }]);
    ok(c.enviados.length === 3, 'os tres lotes sairam', c.enviados);

    // A ORDEM: o prefixo do spool nao pode reiniciar a cada lote.
    ok(c.enviados[0].startsWith('00001_'), 'o primeiro leva 00001', c.enviados);
    ok(c.enviados[1].startsWith('00002_'),
       'o segundo leva 00002, e nao 00001 de novo: o watcher do hot folder importa '
       + 'a pasta em ordem alfabetica, entao prefixo repetido embaralha a tiragem',
       c.enviados);
    ok(c.enviados[2].startsWith('00003_'), 'o terceiro leva 00003', c.enviados);
    ok(c.enviados.join('|') === c.enviados.slice().sort().join('|'),
       'e a ordem alfabetica dos nomes e a ordem do papel', c.enviados);

    // O relatorio e a conferencia acontecem UMA vez, no fim.
    ok(!c.enviados.includes('__CONFERIU__'),
       'a conferencia do hot folder nao dispara a cada lote');
    ok(e.finalizar() === true, 'fechada sem falha, a entrega termina bem');
    ok(c.enviados.includes('__CONFERIU__'), 'e ai sim confere o que caiu na pasta');
    ok(c.toasts.filter(t => /enviado\(s\) para/.test(t.msg)).length === 1,
       'o relatorio final sai uma vez so', c.toasts.map(t => t.msg));
})();

// ─── 3. A tela volta ao normal, e so uma vez ───────────────────────────────

(async function osBotoesVoltam() {
    const c = montarCenario();
    const e = c.criar.criarEntregaDeImpressao();
    ok(c.janela.isPrinting === true, 'enquanto entrega, a tela sabe que esta imprimindo');
    ok(c.botoes['ped-btn-impose'].style.display === 'none', 'o botao de impor se esconde');
    ok(c.botoes['ped-btn-cancel-print'].style.display === 'inline-flex',
       'e o de cancelar aparece -- cancelar precisa existir DURANTE a geracao');

    await e.entregar([{ name: 'a.pdf', blob: 'b' }]);
    e.finalizar();
    ok(c.janela.isPrinting === false, 'no fim, nao esta mais imprimindo');
    ok(c.botoes['ped-btn-impose'].style.display === 'inline-flex', 'o botao de impor volta');
    ok(c.botoes['ped-btn-cancel-print'].style.display === 'none', 'o de cancelar some');

    // Idempotente: o caminho em streaming fecha a entrega no fim normal E no
    // tratamento de erro. Fechar duas vezes nao pode repetir o relatorio.
    const antes = c.toasts.length;
    e.finalizar();
    ok(c.toasts.length === antes, 'fechar duas vezes nao repete o relatorio');
})();

// ─── 4. Cancelar no meio para de mandar papel ──────────────────────────────

(async function cancelarParaDeMandar() {
    const c = montarCenario();
    const e = c.criar.criarEntregaDeImpressao();
    await e.entregar([{ name: 'a.pdf', blob: 'b' }]);
    ok(c.enviados.length === 1, 'um lote ja saiu');

    c.janela._printCancelRequested = true;
    const seguiu = await e.entregar([{ name: 'b.pdf', blob: 'b' }]);
    ok(seguiu === false, 'a entrega avisa que parou');
    ok(e.cancelado === true, 'e se marca cancelada');
    ok(c.enviados.length === 1, 'o lote seguinte NAO foi para a impressora', c.enviados);
    ok(c.janela._printCancelRequested === false,
       'e o pedido de cancelamento e consumido, para nao vazar para o proximo trabalho');

    ok(e.finalizar({ interrompido: true }) === false, 'cancelada nao termina bem');
    ok(!c.toasts.some(t => /enviado\(s\) para/.test(t.msg) && t.tipo === 'success'),
       'e nao anuncia sucesso de um trabalho que parou no meio', c.toasts.map(t => t.msg));
    ok(e.enviados === 1,
       'mas a conta do que JA saiu continua de pe: papel entregue nao volta');
})();

// ─── 5. Quem tem a fila inteira na mao nao mudou ───────────────────────────

(async function sendPrintJobDirectContinuaIgual() {
    const c = montarCenario();
    const r = await c.criar.sendPrintJobDirect([
        { name: 'a.pdf', blob: 'x' }, { name: 'b.pdf', blob: 'y' }, { name: 'c.pdf', blob: 'z' },
    ]);
    ok(r === true, 'a fila inteira de uma vez continua terminando bem');
    ok(c.enviados.filter(n => n !== '__CONFERIU__').length === 3, 'os tres foram', c.enviados);
    ok(c.enviados[0].startsWith('00001_') && c.enviados[2].startsWith('00003_'),
       'com a numeracao de sempre', c.enviados);
    ok(c.janela.isPrinting === false, 'e a tela volta ao normal sozinha');
})();

// ─── 6. A ligacao na tela do pedido ────────────────────────────────────────
//
// O laco que le a resposta em streaming e grande demais para ser recortado e
// executado; o que da para garantir aqui e que a entrega acontece DENTRO dele,
// e nao depois.

(function aEntregaAconteceDentroDoLaco() {
    const i = PEDIDO.indexOf('arquivosRecebidos++;');
    ok(i > 0, 'achei o ponto em que a tela recebe um arquivo do streaming');
    const trecho = PEDIDO.slice(i, i + 3400);
    ok(/await entrega\.entregar\(\[\{ name: fileObj\.name, blob: fBlob \}\]\)/.test(trecho),
       'cada arquivo recebido e entregue AI MESMO, dentro do laco de leitura -- '
       + 'era isto que faltava: o motor cortava certo e ninguem consumia o corte',
       trecho.slice(0, 200));

    const iFim = PEDIDO.indexOf("if (mode === 'print' && entrega) {");
    ok(iFim > i, 'e o fecho da entrega vem depois do laco');
    const fecho = PEDIDO.slice(iFim, iFim + 700);
    ok(/entrega\.finalizar\(\{ interrompido: cancelouNoMeio \}\)/.test(fecho),
       'o fecho leva a informacao de que alguem cancelou no meio', fecho);
    ok(fecho.indexOf('finalizar') < fecho.indexOf('confirmarImpressaoModelos'),
       'e so depois de fechar e que a tela pergunta sobre o status de impresso');
})();

(function aRedeAntigaContinuaLaAtras() {
    // Se o `criarEntregaDeImpressao` sumir do script.js, o trabalho nao pode
    // evaporar: o comportamento antigo (juntar tudo e mandar no fim) volta.
    const i = PEDIDO.indexOf('arquivosRecebidos++;');
    const trecho = PEDIDO.slice(i, i + 3400);
    ok(/printBlobQueue\.push/.test(trecho), 'a fila antiga continua como rede', trecho.slice(0, 120));
    ok(/typeof criarEntregaDeImpressao === 'function'/.test(trecho),
       'e ela so e usada quando a entrega nova nao existe');
})();

(function aReversaDesligaOcorte() {
    // Reversa inverte as paginas DENTRO de cada arquivo. Cortado em lotes isso
    // viraria "lote 1 invertido, depois lote 2 invertido" -- a tiragem sairia
    // na ordem errada, e so o papel contaria a historia.
    const i = PEDIDO.indexOf('entregar_por_bloco: document.getElementById');
    ok(i > 0, 'achei a escolha no payload');
    const trecho = PEDIDO.slice(i, i + 320);
    ok(/ped-print-reverse/.test(trecho),
       'a impressao reversa desliga o corte em lotes: invertida por lote, a tiragem '
       + 'sai na ordem errada', trecho);
})();

// ─── Fim ───────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes falharam.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes da entrega imediata passaram.`);
}, 50);
