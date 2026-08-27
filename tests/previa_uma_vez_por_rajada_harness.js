// A JANELA DE VISUALIZACAO SE REDESENHA UMA VEZ POR RAJADA (27/08/2026).
//
// Medido na tela, no pedido 21202, um clique num modelo chamava o
// `drawPedPreview` 8 a 9 vezes -- sete delas saindo do `updatePedSummary`, que
// por sua vez e disparado por cada `change` dos selects que a abertura do
// modelo preenche. Cada desenho custa ~33 ms (a janela mostra UMA folha, a
// atual, e nao as N do modelo), entao a economia e modesta: ~56 ms. O que ela
// evita, alem disso, e a folha piscando sete vezes ate a configuracao final.
//
// A ponta que este harness protege e a outra: o COMECO da rajada TEM de
// desenhar na hora. O proprio `drawPedPreview` traz a nota de que sair sem
// desenhar deixa na tela a folha do desenho ANTERIOR -- e o operador conferiria
// uma folha que nao corresponde mais ao que esta configurado.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// O agendador de verdade, lido do pedido.js.
function carregar() {
    const i = PEDIDO.indexOf('const _JANELA_DA_PREVIA_MS');
    const j = PEDIDO.indexOf('\n}', PEDIDO.indexOf('function agendarRedesenhoDaPrevia()')) + 2;
    if (i < 0 || j < 2) throw new Error('nao achei o agendador da previa no pedido.js');
    const desenhos = [];
    const api = new Function('drawPedPreview', 'window',
        PEDIDO.slice(i, j) + '\nreturn { agendarRedesenhoDaPrevia, _JANELA_DA_PREVIA_MS };'
    )(() => desenhos.push(1), {});
    return { api, desenhos };
}

const espera = ms => new Promise(r => setTimeout(r, ms));

(async function () {
    const { api, desenhos } = carregar();
    const JANELA = api._JANELA_DA_PREVIA_MS;
    ok(JANELA >= 800, 'a janela cobre a cascata de 400/500/600/800 ms da abertura do modelo', JANELA);

    api.agendarRedesenhoDaPrevia();
    ok(desenhos.length === 1,
       'o COMECO da rajada desenha na hora -- sem isto a folha ANTERIOR fica na tela', desenhos.length);

    for (const atraso of [0, 100, 100, 200, 100, 100]) {
        await espera(atraso);
        api.agendarRedesenhoDaPrevia();
    }
    ok(desenhos.length === 1, 'e nenhum outro sai no meio da rajada', desenhos.length);

    await espera(JANELA + 150);
    ok(desenhos.length === 2,
       'o FIM da rajada desenha UMA vez -- sete pedidos viraram dois desenhos', desenhos.length);

    api.agendarRedesenhoDaPrevia();
    ok(desenhos.length === 3, 'a rajada seguinte volta a desenhar na hora', desenhos.length);

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da previa passaram.');
})();
