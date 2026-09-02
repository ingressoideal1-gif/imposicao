// Os bancos do PEDIDO chegam antes do payload, nas DUAS telas de imposicao.
//
// ── O defeito que este harness congela (01/09/2026) ──────────────────────────
//
// O usuario relatou, sobre o pedido 21460: "na imposicao, impressao e ao gerar
// pdf, nao esta saindo o banco de dados no QR, esta saindo numeracao
// sequencial".
//
// Os bancos do pedido (`pedidos_bancos` + `pedidos_modelos_banco`) eram
// carregados por UMA tela so: a de Amostras, no `renderAmostrasOSItens`, sob a
// condicao `containerId === 'amostras-itens-container'`. Quem abrisse a tela do
// Pedido e mandasse imprimir sem passar por Amostras tinha `bancosDoPedido` e
// `vinculosDeBanco` vazios. Dai:
//
//   · `resolverNumeracaoParaModelo` nao acha vinculo e devolve a PECA CRUA --
//     `csv_data` nulo e o `csv_column` do elemento vazio;
//   · o motor recebe zero linhas, `csv_row` e' None, e o ramo final do
//     `_render_element` imprime o NUMERO SEQUENCIAL dentro do QR.
//
// E as duas travas que existiam para impedir exatamente isso estavam CEGAS:
// `modelosSemBancoDoTrabalho` e `modelosComElementoSemColuna` partem de
// `vinculoDeBancoDoModelo`, que le o mesmo `state.vinculosDeBanco` que nunca
// foi carregado. Sem vinculo elas devolvem lista vazia -- ou seja, "nunca
// olhei" e "nao tem banco" davam a mesma resposta, e a resposta era "pode
// imprimir".
//
// Medido no navegador antes do conserto, com o 21460 semeado:
//     linhas no payload: 0 · coluna do QR: "" · as duas travas: deixa passar
//
// Roda em node: `node tests/banco_do_pedido_na_impressao_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

global.window = global.window || {};
require(path.join(RAIZ, 'frontend', 'banco-do-modelo.js'));

/** Extrai uma funcao do script.js pelo nome, com ou sem `async`. */
function extrairFuncao(src, nome) {
    for (const abre of ['\nasync function ' + nome + '(', '\nfunction ' + nome + '(']) {
        const i = src.indexOf(abre);
        if (i < 0) continue;
        const fim = src.indexOf('\n}', i);
        if (fim < 0) break;
        return src.slice(i, fim + 2);
    }
    throw new Error('nao achei a funcao ' + nome + ' no script.js');
}

function sandbox(state, nomes, devolve) {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    return new Function('state', 'window', 'carregarBancosDoPedidoNovo', 'supabaseClient',
        fonte + '\nreturn { ' + devolve + ' };'
    )(state, global.window, state.__carregar,
      state.__semCliente ? null : { fingindoSerOSupabase: true });
}

// ── O cenario do 21460 ───────────────────────────────────────────────────────

const NUMERACAO = {
    id: 'num-expointer', name: 'Expointer 2026', tipo: 'SEQUENCIAL', csv_data: null,
    csv_headers: [], elements: [
        { id: 'el_1', type: 'QR', source: 'database', csv_column: '', pad: 4 },
        { id: 'el_2', type: 'TEXT', pad: 5 },
    ],
};
const BANCO = {
    id: 'banco-1', id_int: 21460, nome: 'codigos_por_setor',
    csv_headers: ['EXPOSITOR', 'PEDESTRE / DIARIA'],
    csv_data: [{ __id: 1, EXPOSITOR: '301013536972' }, { __id: 2, EXPOSITOR: '301013537246' }],
};
const VINCULO = { modelo_id: '1000781', banco_id: 'banco-1', csv_mapa: { 'el:el_1': 'EXPOSITOR' } };
const ITEM = { id: '1000781', id_int: 21460, nome_modelo: 'EXPOSITOR', amostra_num_id: 'num-expointer' };

/** O estado de quem abriu a tela do Pedido sem passar por Amostras. */
function estadoSemBancos(comoCarrega) {
    const state = {
        numeracoes: [JSON.parse(JSON.stringify(NUMERACAO))],
        osItens: { 'os-1': [JSON.parse(JSON.stringify(ITEM))] },
        // A forma REAL, como `enviarParaPedido` e `enviarParaImposicao` gravam:
        // { itemId, osId } -- e nada mais. Ate 02/09/2026 este harness punha um
        // `idx` aqui que a tela nunca poe, e por isso nao viu o defeito abaixo.
        activeOSItem: { itemId: '1000781', osId: 'os-1' },
        selectedOSItems: [],
        bancosDoPedido: [], vinculosDeBanco: {},
        _bancosPedidoDe: undefined,
        __chamadas: 0,
    };
    state.__carregar = async () => {
        state.__chamadas++;
        // O sandbox recebe esta funcao por VALOR: trocar `state.__carregar`
        // depois de montado nao troca nada. Quem quiser derrubar a rede no meio
        // do caso liga `state.__falharAgora`.
        if (comoCarrega === 'falha' || state.__falharAgora) throw new Error('sem rede');
        if (comoCarrega === 'vazio') return 0;
        state.bancosDoPedido = [JSON.parse(JSON.stringify(BANCO))];
        state.vinculosDeBanco = { '1000781': JSON.parse(JSON.stringify(VINCULO)) };
        return 1;
    };
    return state;
}

const FUNCOES = ['bancoVazioNoPayload', 'recadoDeBancoVazio',
                 'idIntDoPedido', 'vinculoDeBancoDoModelo', 'resolverNumeracaoParaModelo',
                 'osIdsDoTrabalho', 'garantirBancosDoTrabalho', 'pedidosComBancoDesconhecido',
                 'modelosComBancoNaoConferido', 'pecaDoModelo', 'numeracaoIdDoItem',
                 'modelosComBancoNaoBaixado', 'modelosSemBancoDoTrabalho'];
const DEVOLVE = FUNCOES.join(', ');

const casos = [];

// ── 1. O caso do usuario: garantir traz o banco, e o QR passa a ler a coluna ──

casos.push(async function oBancoChegaAntesDoPayload() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);

    const antes = f.resolverNumeracaoParaModelo(state.numeracoes[0], state.osItens['os-1'][0]);
    ok((antes.csv_data || []).length === 0,
       'sem os bancos carregados o payload sai vazio (e o motor cai no sequencial)');

    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());

    const depois = f.resolverNumeracaoParaModelo(state.numeracoes[0], state.osItens['os-1'][0]);
    ok((depois.csv_data || []).length === 2,
       'depois de garantir, as linhas do banco do pedido entram no payload',
       { linhas: (depois.csv_data || []).length });
    const qr = (depois.elements || []).find(e => e.id === 'el_1');
    ok(qr && qr.csv_column === 'EXPOSITOR',
       'e o QR passa a ler a coluna que o modelo aponta',
       { coluna: qr && qr.csv_column });
});

// ── 2. Duas chamadas nao viram duas consultas ────────────────────────────────

casos.push(async function garantirNaoRepeteAConsulta() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    ok(state.__chamadas === 1,
       'o pedido ja carregado nao volta a rede a cada clique em Imprimir',
       { chamadas: state.__chamadas });
});

// ── 3. Carga que falhou nao pode virar "pode imprimir" ──────────────────────

casos.push(async function cargaQueFalhouRecusaAImpressao() {
    const state = estadoSemBancos('falha');
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());

    ok(f.pedidosComBancoDesconhecido(f.osIdsDoTrabalho()).length === 1,
       'sem conseguir ler os vinculos, o trabalho fica marcado como desconhecido '
       + '-- "nunca olhei" nao pode se passar por "nao tem banco"');
    ok(f.modelosComBancoNaoConferido().length === 1,
       'e o modelo que depende do banco e recusado, em vez de sair sequencial');
});

// ── 3b. Modo offline: nao ha A QUEM perguntar, e isso nao pode virar "ok" ────

casos.push(async function offlineNaoPodeSeFazerDeConsultado() {
    const state = estadoSemBancos();
    state.__semCliente = true;                       // `?local=true`, ou offline_mode
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());

    ok(state.__chamadas === 0, 'sem cliente do Supabase nao se consulta nada');
    ok(f.pedidosComBancoDesconhecido(f.osIdsDoTrabalho()).length === 1,
       'e o pedido continua desconhecido -- o carregador devolve 0 nesse caso, '
       + 'que e indistinguivel de "nao tem banco"');
    ok(f.modelosComBancoNaoConferido().length === 1,
       'o modelo cuja peca pede banco e nao tem linha propria e recusado offline');
});

// ── 3c. Offline nao pode parar quem nunca dependeu de banco ─────────────────

casos.push(async function offlineNaoTravaOTrabalhoDeSempre() {
    const state = estadoSemBancos();
    state.__semCliente = true;
    // Uma numeracao a moda antiga: campo de banco, com o CSV dentro dela.
    state.numeracoes[0].csv_data = [{ __id: 1, NOME: 'ANA' }];
    const f1 = sandbox(state, FUNCOES, DEVOLVE);
    await f1.garantirBancosDoTrabalho(f1.osIdsDoTrabalho());
    ok(f1.modelosComBancoNaoConferido().length === 0,
       'numeracao com o CSV dentro dela imprime offline como sempre imprimiu');

    // E uma numeracao sem campo de banco nenhum.
    const state2 = estadoSemBancos();
    state2.__semCliente = true;
    state2.numeracoes[0].elements = [{ id: 'el_2', type: 'TEXT', pad: 5 }];
    const f2 = sandbox(state2, FUNCOES, DEVOLVE);
    await f2.garantirBancosDoTrabalho(f2.osIdsDoTrabalho());
    ok(f2.modelosComBancoNaoConferido().length === 0,
       'numeracao puramente sequencial nao e travada por causa do banco do pedido');
});

// ── 4. Pedido que de fato nao tem banco nenhum continua imprimindo ──────────

casos.push(async function pedidoSemBancoNenhumSegueComoSempre() {
    const state = estadoSemBancos('vazio');
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());

    ok(f.pedidosComBancoDesconhecido(f.osIdsDoTrabalho()).length === 0,
       'pedido consultado e sem bancos nao e "desconhecido": ele imprime como sempre');
    ok(f.modelosSemBancoDoTrabalho().length === 0,
       'e nenhum modelo dele e acusado de banco faltando');

    const num = state.numeracoes[0];
    ok(f.resolverNumeracaoParaModelo(num, state.osItens['os-1'][0]) === num,
       'a numeracao volta pela MESMA referencia -- o caminho antigo intacto');
});

// ── 5. Pedido sem numero de OS conhecido nao trava a tela ───────────────────

casos.push(async function pedidoSemIdIntNaoTrava() {
    const state = estadoSemBancos();
    state.osItens['os-1'][0].id_int = null;
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    ok(state.__chamadas === 0, 'sem o numero do pedido nao ha o que consultar');
    ok(f.pedidosComBancoDesconhecido(f.osIdsDoTrabalho()).length === 0,
       'e a tela nao fica travada por um pedido que ainda nao tem numero');
});

// ── 6. O vinculo cujo banco nao veio junto continua sendo recusado ──────────

casos.push(async function vinculoSemBancoContinuaBloqueando() {
    const state = estadoSemBancos();
    state.__carregar = async () => {
        state.__chamadas++;
        state.bancosDoPedido = [];                                   // o banco nao veio
        state.vinculosDeBanco = { '1000781': JSON.parse(JSON.stringify(VINCULO)) };
        return 0;
    };
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    ok(f.modelosSemBancoDoTrabalho().length === 1,
       'vinculo apontando para banco que nao chegou continua parando a impressao');
});

// ── 7. A recaida do 21460: a marca nao pode sobreviver ao que ela certifica ──
//
// Medido no navegador, contra o banco de verdade, em 02/09/2026:
//
//     passo 1 (imprime o 21460)      3.000 linhas · coluna EXPOSITOR
//     passo 2 (abre outro pedido)        0 linhas · coluna vazia
//     passo 3 (volta e imprime)          0 linhas · coluna vazia  <- o defeito
//
// O passo 2 e a tela de Amostras fazendo o que deve: ao trocar de pedido ela
// esvazia `bancosDoPedido`/`vinculosDeBanco`, porque manter os do anterior
// ofereceria, no card do novo, um banco que nao e daquele trabalho. O que
// estava errado era a marca `_bancosConsultados`, que continuava dizendo "ja
// perguntei por este pedido" depois de a resposta ter sido jogada fora.

casos.push(async function trocarDePedidoEVoltarRecarregaOBanco() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);

    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    ok((f.resolverNumeracaoParaModelo(state.numeracoes[0], state.osItens['os-1'][0]).csv_data || []).length === 2,
       'passo 1: o pedido imprime com as linhas do banco');

    // Passo 2: a tela de Amostras troca de pedido -- exatamente o que o
    // `renderAmostrasOSItens` faz no ramo `trocouDePedido`.
    state.bancosDoPedido = []; state.vinculosDeBanco = {};
    state._bancosPedidoDe = 'os-outro';

    // Passo 3: o operador volta ao pedido e manda imprimir de novo.
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    const depois = f.resolverNumeracaoParaModelo(state.numeracoes[0], state.osItens['os-1'][0]);
    ok((depois.csv_data || []).length === 2,
       'passo 3: voltar ao pedido recarrega o banco, em vez de imprimir sequencial',
       { linhas: (depois.csv_data || []).length, chamadas: state.__chamadas });
    ok(state.__chamadas === 2, 'e a recarga acontece uma vez so', { chamadas: state.__chamadas });
});

// ── 7b. E uma recarga que falha nao herda o "pode imprimir" da anterior ──────

casos.push(async function recargaQueFalhaNaoHerdaAMarcaAntiga() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());

    state.bancosDoPedido = []; state.vinculosDeBanco = {};
    state._bancosPedidoDe = 'os-outro';
    state.__falharAgora = true;

    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    ok(f.pedidosComBancoDesconhecido(f.osIdsDoTrabalho()).length === 1,
       'a marca de meia hora atras nao pode responder pela consulta que acabou de falhar');
    ok(f.modelosComBancoNaoConferido().length === 1,
       'e o modelo volta a ser recusado, em vez de sair sequencial');
});

// ── 8. A aba Imposicao: numeracao escolhida na lista, sem modelo ────────────
//
// O segundo relato do 21460 (02/09/2026), depois de as duas telas do pedido ja
// carregarem os bancos. A peca "Expointer 2026" nao guarda dado nenhum -- o
// banco e do PEDIDO, e quem diz qual coluna cada campo le e o MODELO. Escolhida
// direto na lista da aba Imposicao, nao ha modelo, nao ha o que resolver, e o
// trabalho ia ao motor com zero linhas.
//
// Adivinhar seria pior que parar: cinco modelos compartilham essa peca, cada um
// com a sua coluna, e o chute imprimiria a credencial de um setor com o codigo
// de outro. Entao a tela recusa, e diz por onde imprimir.

casos.push(async function pecaSemModeloNaAbaImposicaoNaoVaiAoMotor() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);
    const peca = state.numeracoes[0];              // a peca CRUA, como a lista a oferece

    const barrados = f.bancoVazioNoPayload(peca, []);
    ok(barrados.length === 1 && barrados[0] === 'Expointer 2026',
       'peca que le banco e chega sem linha e barrada pelo nome', { barrados });

    const recado = f.recadoDeBancoVazio(barrados);
    ok(recado.indexOf('Expointer 2026') !== -1, 'o recado nomeia a numeracao');
    ok(recado.indexOf('a partir do modelo') !== -1, 'e diz por onde imprimir');
    ok(recado.indexOf('sequencial') !== -1, 'e o que sairia errado se seguisse');
});

// ── 8b. E a mesma peca, resolvida pelo modelo, passa ────────────────────────

casos.push(async function aMesmaPecaResolvidaPeloModeloPassa() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);
    await f.garantirBancosDoTrabalho(f.osIdsDoTrabalho());
    const resolvida = f.resolverNumeracaoParaModelo(state.numeracoes[0], state.osItens['os-1'][0]);
    ok(f.bancoVazioNoPayload(resolvida, []).length === 0,
       'resolvida pelo modelo, a mesma peca passa');
    ok(f.bancoVazioNoPayload(null, [{ nome: 'EXPOSITOR', numeracao: resolvida }]).length === 0,
       'e passa tambem como arte do multi_artes');
});

// ── 8c. Quem nunca leu banco nao pode ser barrado ───────────────────────────

casos.push(async function numeracaoSequencialNaoEBarrada() {
    const state = estadoSemBancos();
    const f = sandbox(state, FUNCOES, DEVOLVE);
    const soContador = { name: 'Ingresso 2026', csv_data: null,
                         elements: [{ id: 'el_1', type: 'TEXT', pad: 5 }] };
    ok(f.bancoVazioNoPayload(soContador, []).length === 0,
       'numeracao puramente sequencial imprime como sempre imprimiu');
    ok(f.bancoVazioNoPayload(null, []).length === 0, 'e trabalho sem numeracao nenhuma tambem');
});

(async () => {
    for (const caso of casos) await caso();
    if (falhas) { console.error(`\n${falhas} de ${total} falharam.`); process.exit(1); }
    console.log(`OK: ${total} verificacoes passaram.`);
})();
