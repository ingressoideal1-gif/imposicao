// AS FILAS SE REDESENHAM UMA VEZ POR RAJADA, NAO UMA POR CAMPO SALVO (27/08/2026).
//
// O usuario relatou que no pedido 21202 nao dava para navegar entre os modelos.
// Depois de a rede sair do caminho (a releitura enxuta, v739), sobrou uma conta
// de CPU que era a maior parte do que ele sentia. Medido na tela, com o pedido
// aberto e todos os bancos ja em memoria, UM clique num modelo chamava:
//
//     renderPedOSQueue   8x   631 ms  -- 6 vindas do saveActiveOSItemField
//     renderImpOSQueue   7x   454 ms  -- 6 vindas do saveActiveOSItemField
//
// Abrir um modelo salva meia duzia de campos, e cada salvamento redesenhava as
// DUAS filas inteiras: 52 linhas, cada uma com um `<select>` de 152 numeracoes.
// O trabalho e o mesmo nas seis vezes; so a ultima fica na tela.
//
// O que este harness mede e o comportamento do agendador, que e onde a economia
// mora -- e as duas pontas que ela nao pode perder:
//
//   1. o COMECO da rajada desenha na hora (e ele que move o destaque para a
//      linha clicada; atrasa-lo tiraria o retorno do clique);
//   2. o FIM da rajada desenha uma vez so, depois que a tela assentou.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// O agendador de verdade, lido do script.js -- copia deixaria de acompanhar o
// original no dia em que a janela mudar.
function carregar() {
    const i = SCRIPT.indexOf('const _JANELA_DO_REDESENHO_MS');
    const j = SCRIPT.indexOf('\n}', SCRIPT.indexOf('function agendarRedesenhoDasFilas()')) + 2;
    if (i < 0 || j < 2) throw new Error('nao achei o agendador no script.js');
    const desenhos = [];
    const api = new Function('renderPedOSQueue', 'renderImpOSQueue',
        SCRIPT.slice(i, j) + '\nreturn { agendarRedesenhoDasFilas, _JANELA_DO_REDESENHO_MS };'
    )(() => desenhos.push('ped'), () => desenhos.push('imp'));
    return { api, desenhos };
}

const espera = ms => new Promise(r => setTimeout(r, ms));

(async function umaRajadaDaDoisRedesenhos() {
    const { api, desenhos } = carregar();
    const JANELA = api._JANELA_DO_REDESENHO_MS;
    ok(JANELA >= 800, 'a janela cobre a cascata de 400/500/600/800 ms que a tela usa para assentar', JANELA);

    // A rajada: seis campos salvos ao abrir um modelo, espalhados pela cascata.
    api.agendarRedesenhoDasFilas();
    ok(desenhos.length === 2, 'o COMECO da rajada desenha na hora -- e o destaque da linha clicada', desenhos);

    for (const atraso of [0, 100, 100, 200, 100]) {
        await espera(atraso);
        api.agendarRedesenhoDasFilas();
    }
    ok(desenhos.length === 2, 'e nenhum outro sai no meio da rajada', desenhos);

    await espera(JANELA + 120);
    ok(desenhos.length === 4,
       'o FIM da rajada desenha UMA vez -- seis salvamentos viraram dois redesenhos por fila',
       desenhos);
    ok(desenhos.filter(d => d === 'ped').length === 2
        && desenhos.filter(d => d === 'imp').length === 2,
       'as duas filas continuam sendo desenhadas', desenhos);
})().then(async () => {
    // Rajada nova, depois que a anterior fechou, volta a desenhar na hora: o
    // clique seguinte nao pode ficar sem retorno so porque o anterior foi ha
    // pouco.
    const { api, desenhos } = carregar();
    api.agendarRedesenhoDasFilas();
    await espera(api._JANELA_DO_REDESENHO_MS + 120);
    const depoisDaPrimeira = desenhos.length;
    api.agendarRedesenhoDasFilas();
    ok(desenhos.length === depoisDaPrimeira + 2,
       'a rajada seguinte volta a desenhar na hora', desenhos.length);

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do redesenho das filas passaram.');
});
