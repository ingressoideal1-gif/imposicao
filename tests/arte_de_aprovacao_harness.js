// A arte de aprovacao -- a imagem que o cliente ve no link -- e regerada e
// salva toda vez que o designer marca o modelo como PRONTO.
//
// Regra do usuario, 19/08/2026: "deve ser gerada e salva novamente a arte de
// amostra sempre que clicar em Arte Pronta". O motivo dela: a arte nao estava
// atualizando depois de uma correcao.
//
// Antes, a geracao dependia de dois gatilhos frouxos:
//
//   1. `_needsSnapshot`, ligado so por certas edicoes, que dispara a gravacao
//      2 s DEPOIS do desenho -- fechar o card antes disso perdia a imagem;
//   2. a regeneracao em segundo plano do "Gerar Link", disparada sem espera
//      logo DEPOIS de o link ja ter sido copiado para a area de transferencia.
//
// Nos dois casos o atendente podia mandar o link antes de a imagem nova subir, e
// o cliente aprovava a arte ANTERIOR a correcao -- sem nada na tela dizendo
// isso. Foi o que apareceu no pedido 20927.
//
// Roda em node: `node tests/arte_de_aprovacao_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome, prefixo) {
    const alvo = '\n' + (prefixo || '') + 'function ' + nome + '(';
    const i = SCRIPT.indexOf(alvo);
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

/**
 * A funcao LIDA do script.js, com o mundo em volta trocado por dubles: canvas,
 * desenho e gravacao. O que se prova aqui e a LOGISTICA -- o que ela salva,
 * quando desiste e quando reclama --, e nao o desenho em si, que so um
 * navegador com canvas de verdade sabe fazer.
 */
function montar(mundo) {
    const fonte = extrairFuncao('regenerarAmostraDoModelo', 'async ');
    return new Function(
        'state', 'document', 'console', 'ESCALA_DA_AMOSTRA',
        'resolveItemCorNumIds', 'saveAmostraToDB', 'drawAmostraFace',
        'snapshotAmostraSync', 'preloadAmostraItemPdfElements',
        // 26/08/2026: o catalogo passou a vir sem `csv_data`, e quem desenha a
        // amostra garante o banco da numeracao do modelo antes de desenhar --
        // amostra sem as linhas sai com numero sequencial no lugar do nome. Aqui
        // ele e um duble: o que este arnes prova continua sendo a logistica da
        // gravacao, e nao a descida do banco.
        'garantirCsvDaNumeracao',
        fonte + '\nreturn regenerarAmostraDoModelo;')(
        mundo.state || {},
        { createElement: () => ({ width: 100, height: 40, getContext: () => ({}) }) },
        { log: () => {}, warn: () => {} },
        150 / 25.4,
        mundo.resolveItemCorNumIds || (() => ({})),
        mundo.saveAmostraToDB || (async () => {}),
        mundo.drawAmostraFace || (async () => {}),
        mundo.snapshotAmostraSync || (async () => {}),
        undefined,
        mundo.garantirCsvDaNumeracao || (async n => n));
}

const ESTADO = {
    cores: [{ id: 'c1', formato_id: 'f1' }],
    numeracoes: [{ id: 'n1', formato_id: 'f1', elements: [] }],
    formatos: [{ id: 'f1', width_mm: 180, height_mm: 50 }],
};

// ─── 1. Quando nao ha o que gerar ────────────────────────────────────────────

(function modeloSemCamadaNenhumaNaoGeraNada() {
    // Nem erro, nem imagem: nao havia o que compor. Reclamar aqui pararia o
    // designer por um modelo que ainda nao comecou.
    let salvou = false;
    const f = montar({ state: ESTADO, saveAmostraToDB: async () => { salvou = true; } });
    return f('os1', { id: 'm1' }, 0).then(r => {
        ok(r === false, 'modelo vazio devolve false');
        ok(!salvou, 'e nao grava nada');
    });
})();

(function oModoPdfMultiPaginaFicaDeFora() {
    const f = montar({ state: ESTADO });
    return f('os1', { id: 'm1', modo_pdf: true, arte_url: 'x.pdf' }, 0).then(r => {
        ok(r === false, 'modo PDF nao gera amostra composta');
    });
})();

// ─── 2. O caminho rapido: so a arte, sem cor nem numeracao ───────────────────

(function soAArteCopiaAUrlSemCanvas() {
    const gravado = [];
    const f = montar({ state: ESTADO, saveAmostraToDB: async (id, os, d) => gravado.push(d) });
    const item = { id: 'm1', arte_url: 'https://x/arte.png' };
    return f('os1', item, 0).then(r => {
        ok(r === true, 'devolve true porque salvou');
        ok(gravado.length === 1, 'gravou uma vez', gravado);
        ok(gravado[0] && gravado[0].amostra_arte_base64 === 'https://x/arte.png',
            'e o que gravou foi a arte', gravado[0]);
        ok(item.amostra_arte_base64 === 'https://x/arte.png',
            'o item em memoria acompanha, senao a tela so mudaria depois de um F5');
    });
})();

(function oVersoTambemVaiNoCaminhoRapido() {
    const gravado = [];
    const f = montar({ state: ESTADO, saveAmostraToDB: async (id, os, d) => gravado.push(d) });
    return f('os1', { id: 'm1', arte_url: 'https://x/f.png', verso_arte_url: 'https://x/v.png' }, 0).then(() => {
        ok(gravado[0] && gravado[0].verso_amostra_arte_base64 === 'https://x/v.png',
            'a arte do verso tambem e copiada', gravado[0]);
    });
})();

// ─── 3. O caminho composto: cor e/ou numeracao ───────────────────────────────

(function comCorENumeracaoCompoeESalvaAsDuasFaces() {
    const faces = [];
    const f = montar({
        state: ESTADO,
        resolveItemCorNumIds: () => ({}),
        snapshotAmostraSync: async (idx, os, item, canvas, face) => faces.push(face),
    });
    const item = { id: 'm1', amostra_cor_id: 'c1', amostra_num_id: 'n1', verso: true,
                   arte_url: 'https://x/f.png', verso_arte_url: 'https://x/v.png' };
    return f('os1', item, 0).then(r => {
        ok(r === true, 'o caminho composto devolve true');
        ok(faces.join(',') === 'frente,verso', 'salvou frente e verso', faces);
    });
})();

(function semVersoSalvaSoAFrente() {
    const faces = [];
    const f = montar({ state: ESTADO, snapshotAmostraSync: async (i, o, it, c, face) => faces.push(face) });
    return f('os1', { id: 'm1', amostra_cor_id: 'c1', verso: false }, 0).then(() => {
        ok(faces.join(',') === 'frente', 'so a frente', faces);
    });
})();

// ─── 4. Falha nao passa calada ───────────────────────────────────────────────
//
// E o coracao da correcao. Antes, a geracao engolia o proprio erro e a vida
// seguia: o modelo virava PRONTO, o link ia para o cliente, e o cliente
// aprovava a arte velha. Agora quem chama fica sabendo.

(function falhaAoComporLanca() {
    const f = montar({
        state: ESTADO,
        drawAmostraFace: async () => { throw new Error('canvas morreu'); },
    });
    return f('os1', { id: 'm1', amostra_cor_id: 'c1' }, 0).then(
        () => ok(false, 'deveria ter lancado ao falhar a composicao'),
        e => {
            ok(true, 'falha na composicao lanca');
            ok(/arte de amostra/.test(String(e.message)), 'e a mensagem fala da arte de amostra', String(e.message));
        });
})();

(function falhaAoSalvarNoCaminhoRapidoTambemLanca() {
    const f = montar({
        state: ESTADO,
        saveAmostraToDB: async () => { throw new Error('banco fora'); },
    });
    return f('os1', { id: 'm1', arte_url: 'https://x/arte.png' }, 0).then(
        () => ok(false, 'deveria ter lancado ao falhar a gravacao'),
        e => ok(/arte de amostra/.test(String(e.message)), 'falha ao salvar tambem lanca', String(e.message)));
})();

// ─── 5. Onde a regeneracao esta ligada ───────────────────────────────────────

(function marcarProntoGeraAArteEEspera() {
    const i = SCRIPT.indexOf('async function decisionAmostraItem');
    ok(i > 0, 'o decisionAmostraItem continua existindo');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));

    ok(/await regenerarAmostraDoModelo\(osId, itemAlvo, idxAlvo/.test(trecho),
        'o PRONTO regera a arte de aprovacao');
    // `await`, e nao disparo em segundo plano: e a espera que garante que a
    // imagem nova subiu ANTES de o modelo virar pronto.
    const pos = trecho.indexOf('await regenerarAmostraDoModelo');
    const posSalvar = trecho.indexOf('saveAmostraToDB(itemId, osId, { amostra_status: status');
    ok(pos > 0 && posSalvar > pos, 'e regera ANTES de gravar o status', { pos, posSalvar });
})();

(function seAGeracaoFalharOModeloNaoViraPronto() {
    // Marcar pronto assim mesmo seria mandar o cliente aprovar a arte velha --
    // exatamente o defeito que esta mudanca veio corrigir.
    const i = SCRIPT.indexOf('async function decisionAmostraItem');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    const catchIdx = trecho.indexOf("catch (e) {", trecho.indexOf('await regenerarAmostraDoModelo'));
    const bloco = trecho.slice(catchIdx, catchIdx + 600);
    // `return false;` desde as acoes em lote (22/08/2026): a funcao passou a
    // devolver se gravou; a falha continua interrompendo o PRONTO.
    ok(/return( false)?;/.test(bloco), 'a falha interrompe o PRONTO', bloco.slice(0, 200));
    ok(/N[ÃA]O foi marcado/.test(bloco), 'e o aviso diz que o modelo nao foi marcado');
})();

// ─── 6. O lote conta o que falhou ────────────────────────────────────────────

/** O `forceRegenerateSnapshots` LIDO do script.js, com o mundo em dubles. */
function montarLote(mundo) {
    const fonte = extrairFuncao('forceRegenerateSnapshots', 'async ');
    return new Function('state', 'console', 'ESCALA_DA_AMOSTRA', 'loadOSItens',
        'garantirTabelasDaAmostra', 'regenerarAmostraDoModelo',
        fonte + '\nreturn forceRegenerateSnapshots;')(
        mundo.state, { log: () => {}, warn: () => {} }, 150 / 25.4,
        async () => {}, async () => {}, mundo.regenerar);
}

(function oLoteDevolveOQueGerouEOQueFalhou() {
    // Engolir o erro para nao parar os outros itens continua certo. O que estava
    // errado era engolir e NAO CONTAR: quem chamou nao tinha como saber que a
    // arte de um modelo ficou velha.
    const itens = [{ id: 'a', nome_modelo: 'Pulseira' }, { id: 'b', nome_modelo: 'Credencial' }, { id: 'c' }];
    const lote = montarLote({
        state: { osItens: { os1: itens } },
        regenerar: async (osId, item) => {
            if (item.id === 'b') throw new Error('canvas morreu');
            return item.id === 'a';
        },
    });
    return lote('os1').then(r => {
        ok(r && r.gerados === 1, 'conta quantos foram gerados', r);
        ok(r && r.falhas.length === 1, 'e quantos falharam', r);
        ok(r && r.falhas[0].nome === 'Credencial', 'nomeando o modelo que falhou', r.falhas);
        ok(r && /canvas morreu/.test(r.falhas[0].motivo), 'e o motivo', r.falhas);
    });
})();

(function pedidoSemItemNaoQuebraQuemEsperaOResumo() {
    const lote = montarLote({ state: { osItens: {} }, regenerar: async () => true });
    return lote('os1').then(r => {
        ok(r && r.falhas.length === 0 && r.gerados === 0, 'devolve resumo vazio, e nao undefined', r);
    });
})();

// ─── 7. O Gerar Link espera a arte ANTES de existir link para copiar ─────────

(function oGerarLinkEsperaAArteAntesDeQualquerCoisa() {
    const i = SCRIPT.indexOf('async function gerarLinkCliente');
    ok(i > 0, 'o gerarLinkCliente continua existindo');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));

    const posRegenera = trecho.indexOf('await forceRegenerateSnapshots(osId)');
    const posLink = trecho.indexOf('await getOrCreateLinkCliente');
    const posCopia = trecho.indexOf('navigator.clipboard.writeText');
    const posStatus = trecho.indexOf('gravarStatusOverride(osId, novoStatus)');

    ok(posRegenera > 0, 'ele espera a regeneracao');
    ok(posLink > posRegenera, 'e so DEPOIS cria o link', { posRegenera, posLink });
    ok(posCopia > posRegenera, 'e so depois copia', { posRegenera, posCopia });
    // Antes do passo 1 de proposito: dali em diante o status ja foi mexido, e
    // desistir no meio deixaria a tela contando uma coisa e o banco outra.
    ok(posStatus > posRegenera, 'e antes de mexer no status do pedido', { posRegenera, posStatus });
})();

(function seAArteNaoAtualizarOLinkNaoSai() {
    const i = SCRIPT.indexOf('async function gerarLinkCliente');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    const bloco = trecho.slice(trecho.indexOf('regeneracao.falhas'), trecho.indexOf('regeneracao.falhas') + 700);
    ok(/return;/.test(bloco), 'falha na arte interrompe o Gerar Link', bloco.slice(0, 160));
    ok(/N[ÃA]O foi gerado/.test(bloco), 'e o aviso diz que o link nao saiu');
    ok(/arte anterior/.test(bloco), 'e diz por que isso importa');
})();

(function oDisparoEmSegundoPlanoDoFimSumiu() {
    // Era ele que deixava o atendente colar o link enquanto a imagem subia.
    ok(!/forceRegenerateSnapshots\(osId\)\.catch\(snapErr/.test(SCRIPT),
        'o Gerar Link nao dispara mais a regeneracao depois de copiar');
})();

(function aRegeneracaoEmLoteUsaAMesmaFuncao() {
    // Duas composicoes separadas fariam a arte que o cliente aprova divergir da
    // que o painel mostra, no dia em que so uma das duas fosse corrigida.
    const i = SCRIPT.indexOf('async function forceRegenerateSnapshots');
    ok(i > 0, 'o forceRegenerateSnapshots continua existindo');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(/await regenerarAmostraDoModelo\(osId, itens\[idx\], idx/.test(trecho),
        'o lote delega para a mesma funcao');
    // No lote, sim, o erro e engolido: um item nao pode parar os outros.
    ok(/catch \(e\) \{[\s\S]{0,120}console\.warn/.test(trecho),
        'e no lote um item que falha nao para os outros');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

process.on('exit', () => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exitCode = 1;
    } else {
        console.log('OK: ' + total + ' verificacoes passaram.');
    }
});
