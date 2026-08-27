// O BANCO DE DADOS DA NUMERACAO, BAIXADO SO QUANDO PRECISA (26/08/2026).
//
// O catalogo de numeracoes vinha com `select('*')`: 105 registros, 29,17 MB e
// 1.772 ms, dos quais 30,1 MB de 30,3 MB sao uma coluna so -- `csv_data`. Sem
// ela a mesma lista da 0,19 MB em 273 ms. O que sobrava na aba eram 187.021
// linhas de CSV de bancos que a lista nao mostra.
//
// Tirar a coluna e facil; o perigo esta no que ela deixa para tras. Quase todo
// leitor do painel pergunta `if (!num.csv_data)` e conclui "esta numeracao nao
// tem banco" -- e uma numeracao COM banco que ainda nao desceu responde igual a
// uma SEM banco. O motor, sem linhas, cai na numeracao sequencial: sai numero
// impresso no lugar do nome da pessoa, sem erro em tela nenhuma.
//
// E isso que este harness protege. As funcoes sao LIDAS do `script.js`, nao
// copiadas -- copia continua passando depois de o original mudar.
//
//   1. os tres estados de `csv_data` (undefined / null / array) e qual deles vai
//      a rede;
//   2. duas telas pedindo a mesma numeracao fazem UMA consulta;
//   3. falha de rede nao lanca, e nao envenena a proxima tentativa;
//   4. `numeracaoTemBanco` responde "tem" sem as linhas em maos -- e a peca que
//      impede confundir "nao baixado" com "nao tem";
//   5. a copia guardada no `state` acompanha;
//   6. gravar por cima esquece o que foi baixado;
//   7. a trava da impressao junta selecionados, ativo e o select da tela.
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

/** Le uma funcao do script.js pelo nome, ate o `}` na coluna zero. */
function extrairFuncao(src, nome) {
    const i = src.indexOf('\nasync function ' + nome + '(') >= 0
        ? src.indexOf('\nasync function ' + nome + '(')
        : src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

function extrairLinha(src, comeco) {
    const i = src.indexOf(comeco);
    if (i < 0) throw new Error('nao achei a linha "' + comeco + '" no script.js');
    return src.slice(i, src.indexOf('\n', i));
}

const NOMES = ['garantirCsvDaNumeracao', 'esquecerCsvDaNumeracao', 'numeracaoTemBanco',
               'garantirCsvDoTrabalho', 'idsDeNumeracaoDoTrabalho',
               // A carga em segundo plano dos bancos do pedido aberto (26/08/2026).
               'numeracoesSemBancoBaixado', 'carregarBancosDoPedido',
               'numeracaoIdDoItem', 'linhasAtivasCsv', 'colunasDoBancoDaNumeracao',
               'linhasComDadoDaNumeracao', 'fatiaCsvDoItem', 'numeracaoDoModelo',
               'rotuloDoModelo', 'celulasRepetidasDoPedido',
               // A fatia salva que nao e deste banco (26/08/2026).
               'distribuicaoOrfaDoModelo', 'CsvEditorColId',
               // O PDF Prova, que fotografa a tela e nao os dados (26/08/2026).
               'modelosForaDoPdfProva', 'textoDosModelosForaDoPdf',
               'prepararTelaParaOPdfProva',
               // Quais colunas contam na conferencia de repeticoes (26/08/2026).
               'colunasConferidasDaNumeracao', 'conferenciaDasColunasDaNumeracao',
               'aplicarConferenciaNasColunas', 'celulasEsperadasDoModelo',
               // O "Separar por dia" dentro do painel (26/08/2026).
               'diaDoNomeDoModelo', 'diaDaLinhaDoBanco', 'linhasPorDiaDaNumeracao',
               'planoDeSeparacaoPorDia', 'textoDoPlanoDeSeparacao',
               // A releitura ENXUTA nao desfaz o que ja desceu (27/08/2026).
               'bancoBaixadoContinuaValendo', 'mesclarNumeracoesNoCatalogo'];

let CODIGO;
try {
    CODIGO = [extrairLinha(SCRIPT, 'const _csvDaNumeracaoEmVoo = new Map();')]
        .concat(NOMES.map(n => extrairFuncao(SCRIPT, n)))
        .join('\n');
} catch (e) {
    console.error('FALHOU: ' + e.message);
    process.exit(1);
}

/**
 * Um mundo por caso: o `supabaseClient` de mentira conta quantas consultas
 * saem e o que cada uma pediu, que e o que estes testes medem.
 */
const CSVED = fs.readFileSync(path.join(RAIZ, 'frontend', 'csv-editor.js'), 'utf8');
// O `expandirIds` de VERDADE, lido do csv-editor.js: e ele que entende a faixa
// "1-3500" que o banco guarda, e uma copia aqui deixaria de acompanhar o
// original no dia em que a notacao mudar.
const EXPANDIR = (function () {
    const abre = '    function expandirIds(faixas) {';
    const i = CSVED.indexOf(abre);
    const fecha = String.fromCharCode(10) + '    }';
    const fim = CSVED.indexOf(fecha, i);
    const corpo = CSVED.slice(i, fim + fecha.length);
    return new Function(corpo + ';return expandirIds;')();
})();

function mundo(opts) {
    opts = opts || {};
    const consultas = [];
    const supabaseClient = opts.semSupabase ? null : {
        from(tabela) {
            const pedido = { tabela };
            return {
                select(colunas) { pedido.colunas = colunas; return this; },
                eq(campo, valor) { pedido.id = valor; return this; },
                maybeSingle() {
                    consultas.push(pedido);
                    if (opts.erro) return Promise.resolve({ data: null, error: new Error('rede caiu') });
                    const linhas = (opts.bancos || {})[String(pedido.id)];
                    return Promise.resolve({
                        data: linhas === undefined ? null : { csv_data: linhas }, error: null,
                    });
                },
            };
        },
    };
    const state = opts.state || {};
    // Os canvases dos cards, como o PDF Prova os enxerga: `display` vazio e
    // desenhado, 'none' e ainda em branco, ausente e nem existe.
    const telas = opts.canvases || {};
    const document = {
        getElementById: id => (opts.selects || {})[id] || telas[id] || null,
        querySelector: sel => {
            const m = String(sel).match(/#(.+)$/);
            return m ? (telas[m[1]] || null) : null;
        },
    };
    // O `window.CsvEditor` de verdade importa aqui: e por ele que a regra da
    // fatia orfa le a coluna de identidade e expande a faixa "1-3500". Com um
    // `window` vazio ela devolveria null em silencio -- que foi exatamente o que
    // aconteceu na primeira versao deste arnes.
    const janela = { CsvEditor: { COL_ID: '__id', expandirIds: EXPANDIR } };
    const api = new Function('window', 'state', 'supabaseClient', 'document', 'console',
        CODIGO + '\nreturn { ' + NOMES.join(', ') + ' };'
    )(janela, state, supabaseClient, document, { warn() {} });
    return { api, consultas, state, janela };
}

// ─── 1. Os tres estados de `csv_data` ───────────────────────────────────────

(async function soOEstadoUndefinedVaiARede() {
    const linhas = [{ Nome: 'Ana' }, { Nome: 'Bruno' }];

    // undefined: veio da lista enxuta. Este, e so este, consulta.
    let m = mundo({ bancos: { 'n1': linhas } });
    let num = { id: 'n1', csv_filename: 'convidados.csv' };
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 1, 'undefined vai a rede', m.consultas);
    ok(m.consultas[0].colunas === 'csv_data',
       'e pede SO a coluna pesada, nao a linha inteira', m.consultas[0]);
    ok(m.consultas[0].tabela === 'producao_numeracoes', 'na tabela certa', m.consultas[0]);
    ok(num.csv_data === linhas, 'e as linhas chegam na propria numeracao');

    // Uma segunda chamada nao repete a consulta.
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 1, 'ja preenchida, nao consulta de novo', m.consultas.length);

    // null: ja foi buscado, e esta numeracao nao tem banco.
    m = mundo({ bancos: {} });
    num = { id: 'n2', csv_data: null };
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 0, 'null NAO vai a rede: ja se sabe que nao tem banco');

    // array: esta aqui.
    m = mundo({ bancos: { 'n3': linhas } });
    num = { id: 'n3', csv_data: [{ Nome: 'Carla' }] };
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 0, 'array NAO vai a rede');
    ok(num.csv_data.length === 1, 'e o que estava em memoria nao e sobrescrito');

    // Numeracao sem banco no banco: vira null, nao undefined -- senao a
    // proxima chamada consultaria de novo, para sempre.
    m = mundo({ bancos: {} });
    num = { id: 'n4', csv_filename: '' };
    await m.api.garantirCsvDaNumeracao(num);
    ok(num.csv_data === null, 'sem banco no banco, o campo vira null', num.csv_data);
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 1, 'e a resposta "nao tem" tambem se guarda');
})();

// ─── 2. Duas telas, uma consulta ────────────────────────────────────────────

(async function pedidosSimultaneosFazemUmaConsultaSo() {
    const m = mundo({ bancos: { 'n1': [{ Nome: 'Ana' }] } });
    const a = { id: 'n1' }, b = { id: 'n1' };
    await Promise.all([m.api.garantirCsvDaNumeracao(a), m.api.garantirCsvDaNumeracao(b)]);
    ok(m.consultas.length === 1, 'duas telas pedindo junto = UMA consulta', m.consultas.length);
    ok(a.csv_data && b.csv_data, 'e as duas recebem as linhas');
})();

// ─── 3. Falha de rede nao lanca, e nao envenena a proxima tentativa ─────────

(async function falharNaoLancaENaoPrendeORetry() {
    const m = mundo({ erro: true });
    const num = { id: 'n1', csv_filename: 'convidados.csv' };
    let lancou = false;
    try { await m.api.garantirCsvDaNumeracao(num); } catch (_) { lancou = true; }
    ok(!lancou, 'falha de rede NAO lanca: a tela segue com o que tem');
    ok(num.csv_data === undefined,
       'e o campo continua undefined -- nunca vira null, que diria "nao tem banco"',
       num.csv_data);

    // A promessa quebrada nao pode ficar guardada: a proxima tentativa consulta.
    const m2 = mundo({ semSupabase: true });
    const num2 = { id: 'n9' };
    await m2.api.garantirCsvDaNumeracao(num2);
    ok(num2.csv_data === undefined, 'sem Supabase (modo offline), nada e inventado');
})();

// ─── 4. "Tem banco?" respondido SEM as linhas ──────────────────────────────

(function temBancoSemBaixarAsLinhas() {
    const { api } = mundo({});
    const t = api.numeracaoTemBanco;

    // A armadilha inteira mora nesta linha: veio da lista, sem `csv_data`, mas
    // o `csv_filename` prova que ha banco.
    ok(t({ id: 'n1', csv_filename: 'convidados.csv' }) === true,
       'numeracao nao baixada com csv_filename TEM banco');
    ok(t({ id: 'n1', csv_headers: ['Nome', 'Assento'] }) === true,
       'so com os cabecalhos tambem TEM banco');
    ok(t({ id: 'n1', csv_filename: '', csv_headers: [] }) === false,
       'sem arquivo e sem cabecalhos, nao tem');
    ok(t({ id: 'n1', csv_data: [] }) === false, 'array vazio nao tem');
    ok(t({ id: 'n1', csv_data: [{ Nome: 'Ana' }] }) === true, 'array com linha tem');
    ok(t(null) === false, 'e null nao quebra');

    // O contraste que da sentido ao resto: perguntar por `csv_data` responderia
    // "nao tem" para a primeira, que e o erro que imprime numero no lugar de nome.
    const naoBaixada = { id: 'n1', csv_filename: 'convidados.csv' };
    ok(!(naoBaixada.csv_data && naoBaixada.csv_data.length) && t(naoBaixada),
       'e por isso as duas perguntas nao sao a mesma');
})();

// ─── 5. A copia guardada no state acompanha ────────────────────────────────

(async function aCopiaNoCatalogoAcompanha() {
    const noCatalogo = { id: 'n1' };
    const m = mundo({ bancos: { 'n1': [{ Nome: 'Ana' }] }, state: { numeracoes: [noCatalogo] } });
    const copia = { id: 'n1' };                       // a mesma numeracao, outra referencia
    await m.api.garantirCsvDaNumeracao(copia);
    ok(copia.csv_data && copia.csv_data.length === 1, 'a copia recebe as linhas');
    ok(noCatalogo.csv_data === copia.csv_data,
       'e a do catalogo acompanha -- senao a proxima tela consultaria de novo');
})();

// ─── 6. Gravar por cima esquece o que foi baixado ──────────────────────────

(async function gravarPorCimaEsquece() {
    const m = mundo({ bancos: { 'n1': [{ Nome: 'Ana' }] } });
    const num = { id: 'n1' };
    await m.api.garantirCsvDaNumeracao(num);
    ok(m.consultas.length === 1, 'a primeira desceu');

    m.api.esquecerCsvDaNumeracao('n1');
    const outra = { id: 'n1' };                       // uma leitura nova do catalogo
    await m.api.garantirCsvDaNumeracao(outra);
    ok(m.consultas.length === 2,
       'depois de gravar, a proxima leitura vai ao banco de novo', m.consultas.length);
})();

// ─── 7. A trava da impressao ───────────────────────────────────────────────

(async function aTravaJuntaTudoQueOTrabalhoPodeUsar() {
    const state = {
        selectedOSItems: [{ osId: 'os1', itemId: 'i1' }, { osId: 'os1', itemId: 'i2' }],
        activeOSItem: { osId: 'os1', itemId: 'i3' },
        osItens: {
            os1: [
                { id: 'i1', amostra_num_id: 'nA' },
                { id: 'i2', amostra_num_id: 'nB' },
                { id: 'i3', numeracao_id: 'nC' },     // o nome antigo, so em memoria
            ],
        },
        numeracoes: [{ id: 'nA' }, { id: 'nB' }, { id: 'nC' }, { id: 'nD' }],
    };
    const m = mundo({
        state,
        bancos: { nA: [{ x: 1 }], nB: [{ x: 2 }], nC: [{ x: 3 }], nD: [{ x: 4 }] },
        selects: { 'imp-numeracao': { value: 'nD' } },
    });

    const ids = m.api.idsDeNumeracaoDoTrabalho('imp-numeracao');
    ok(ids.includes('nA') && ids.includes('nB'), 'os modelos marcados entram', ids);
    ok(ids.includes('nC'), 'o modelo ativo entra, inclusive pelo nome antigo do campo', ids);
    ok(ids.includes('nD'), 'e a numeracao escolhida no select da tela entra', ids);

    await m.api.garantirCsvDoTrabalho(ids);
    ok(m.consultas.length === 4, 'as quatro descem antes de o payload ser montado',
       m.consultas.length);
    ok(state.numeracoes.every(n => Array.isArray(n.csv_data)),
       'e nenhuma sobra sem banco na hora de imprimir');

    // Id repetido nao vira duas consultas.
    const m2 = mundo({ state: { numeracoes: [{ id: 'nA' }] }, bancos: { nA: [{ x: 1 }] } });
    await m2.api.garantirCsvDoTrabalho(['nA', 'nA', null, undefined, 'nA']);
    ok(m2.consultas.length === 1, 'id repetido (e vazio) vira UMA consulta', m2.consultas.length);
})();

// ─── 8. O pedido aberto: os bancos chegam depois, um por um ────────────────

(async function osBancosDoPedidoChegamDepois() {
    const nums = [
        { id: 'nA', csv_filename: 'a.csv' },                    // falta baixar
        { id: 'nB', csv_data: null },                           // ja se sabe: sem banco
        { id: 'nC', csv_data: [{ Codigo: '1' }] },              // ja esta aqui
    ];
    const state = {
        numeracoes: nums,
        osItens: { os1: [
            { id: 'i1', amostra_num_id: 'nA' },
            { id: 'i2', amostra_num_id: 'nB' },
            { id: 'i3', amostra_num_id: 'nC' },
            { id: 'i4', amostra_num_id: 'nA' },                 // repete a mesma
            { id: 'i5' },                                       // sem numeracao
        ] },
    };
    const m = mundo({ state, bancos: { nA: [{ Codigo: '9' }] } });

    const faltando = m.api.numeracoesSemBancoBaixado('os1');
    ok(faltando.length === 1 && faltando[0].id === 'nA',
       'so o `undefined` conta como "falta baixar"',
       faltando.map(n => n.id));

    const chegadas = [];
    const quantas = await m.api.carregarBancosDoPedido('os1', (num, i, total) => chegadas.push([num.id, i, total]));
    ok(quantas === 1, 'baixou uma', quantas);
    ok(m.consultas.length === 1, 'e foi UMA consulta, nao uma por modelo', m.consultas.length);
    ok(chegadas.length === 1 && chegadas[0][0] === 'nA',
       'o aviso de chegada diz qual banco chegou', chegadas);
    ok(m.api.numeracoesSemBancoBaixado('os1').length === 0, 'e nao falta mais nenhum');
})();

// ─── 9. O aviso de repetidas fica calado com o pedido pela metade ──────────

(async function oAvisoNaoFalaComOPedidoPelaMetade() {
    const linhas = [{ Codigo: 'X1' }, { Codigo: 'X2' }];
    const els = [{ source: 'database', csv_column: 'Codigo' }];
    const state = {
        numeracoes: [
            { id: 'nA', elements: els, csv_data: linhas },
            { id: 'nB', elements: els, csv_data: linhas },      // o MESMO banco
            { id: 'nC', elements: els, csv_filename: 'c.csv' }, // ainda descendo
        ],
        osItens: { os1: [
            { id: 'i1', amostra_num_id: 'nA', nome_modelo: 'A' },
            { id: 'i2', amostra_num_id: 'nB', nome_modelo: 'B' },
            { id: 'i3', amostra_num_id: 'nC', nome_modelo: 'C' },
        ] },
    };
    const m = mundo({ state, bancos: { nC: [{ Codigo: 'X1' }] } });

    ok(Object.keys(m.api.celulasRepetidasDoPedido('os1')).length === 0,
       'com um banco ainda descendo, o aviso NAO sai — numero que muda sozinho nao vale nada');

    await m.api.carregarBancosDoPedido('os1');
    const r = m.api.celulasRepetidasDoPedido('os1');
    ok(Object.keys(r).length === 3,
       'com todos em maos, ele sai — e agora acusa os tres',
       Object.keys(r));
    ok(r['i1'] && r['i1'].total === 2, 'A repete os dois codigos com B', r['i1']);
})();

// ─── 10. A fatia salva que nao e deste banco ───────────────────────────────
//
// No 21202, quatro modelos dividiam a "CAMAROTE CORPORATIVO" e alguem repartiu
// as linhas: o 05/set ficou com `1-3500`, os outros tres com lista VAZIA. Depois
// cada modelo ganhou um banco proprio, e as fatias passaram a apontar para ids
// de um banco que aquele modelo nao usa mais. A tela dizia "o banco nao fecha,
// gerado 0" e mandava corrigir as linhas -- o banco estava perfeito.

(function aFatiaOrfaEReconhecida() {
    const banco = (de, ate) => {
        const r = [];
        for (let i = de; i <= ate; i++) r.push({ __id: i, Codigo: 'C' + i });
        return r;
    };
    const els = [{ source: 'database', csv_column: 'Codigo' }];

    const cenario = (selecao, linhas, irmaos) => {
        const itens = [{ id: 'i1', amostra_num_id: 'n1', csv_selecao: selecao, nome_modelo: 'A' }];
        if (irmaos) itens.push({ id: 'i2', amostra_num_id: 'n1', nome_modelo: 'B' });
        return mundo({ state: {
            numeracoes: [{ id: 'n1', elements: els, csv_data: linhas, csv_headers: ['Codigo'] }],
            osItens: { os1: itens },
        } });
    };

    // 1. Sem distribuicao nenhuma: nada a dizer.
    ok(cenario(null, banco(1, 100), false).api
        .distribuicaoOrfaDoModelo({ id: 'i1', amostra_num_id: 'n1' }, 'os1') === null,
       'modelo sem distribuicao nao e acusado');

    // 2. A fatia casa com o banco: nada a dizer.
    let m = cenario({ ids: ['1-50'], tipo: 'linhas' }, banco(1, 100), false);
    ok(m.api.distribuicaoOrfaDoModelo(m.state.osItens.os1[0], 'os1') === null,
       'fatia que existe neste banco nao e orfa');

    // 3. A fatia aponta para ids que NAO existem: e de outro banco.
    //    E o caso exato do 06/set, cujo banco novo comeca no 3501.
    m = cenario({ ids: ['1-3500'], tipo: 'linhas' }, banco(3501, 7000), false);
    const r3 = m.api.distribuicaoOrfaDoModelo(m.state.osItens.os1[0], 'os1');
    ok(r3 && r3.motivo === 'outro_banco', 'fatia de outro banco e reconhecida', r3);
    ok(r3 && /nao existem neste banco|não existem neste banco/.test(r3.texto),
       'e o texto diz isso, sem falar em quantidade', r3 && r3.texto);

    // 4. Fatia VAZIA num banco que e so deste modelo: sobra de uma divisao
    //    que deixou de existir.
    m = cenario({ ids: [], tipo: 'linhas' }, banco(1, 100), false);
    const r4 = m.api.distribuicaoOrfaDoModelo(m.state.osItens.os1[0], 'os1');
    ok(r4 && r4.motivo === 'vazia_sem_irmaos', 'fatia vazia sem irmaos e orfa', r4);

    // 5. Fatia VAZIA num banco que DOIS modelos dividem: e legitima.
    //    O `abrirDistribuicaoCsv` grava assim de proposito o modelo que ficou de
    //    fora de uma divisao de verdade -- quem avisa dele e a regra de Qtd.
    m = cenario({ ids: [], tipo: 'linhas' }, banco(1, 100), true);
    ok(m.api.distribuicaoOrfaDoModelo(m.state.osItens.os1[0], 'os1') === null,
       'fatia vazia COM irmaos nao e orfa: e o modelo que ficou de fora da divisao');

    // 6. Numeracao sem banco: nao ha o que comparar.
    m = cenario({ ids: ['1-50'], tipo: 'linhas' }, [], false);
    ok(m.api.distribuicaoOrfaDoModelo(m.state.osItens.os1[0], 'os1') === null,
       'sem banco carregado, nada e acusado');
})();

// ─── 11. O PDF Prova fotografa a tela, e nao os dados ──────────────────────
//
// No 21202 ele saiu com 36 paginas para um pedido de 52 modelos: o laco copia o
// canvas de cada card e PULA o que ainda nao desenhou -- em silencio. Os 52
// modelos estavam certos no banco; 16 cards e que ainda nao tinham desenhado.

(function quemFicariaDeForaDoPdf() {
    const itens = [
        { id: 'i1', nome_modelo: 'A' },
        { id: 'i2', nome_modelo: 'B' },
        { id: 'i3', nome_modelo: 'C' },
    ];
    const m = mundo({
        state: { osItens: { os1: itens } },
        canvases: {
            'amostra-item-canvas-0': { style: { display: '' } },      // desenhado
            'amostra-item-canvas-1': { style: { display: 'none' } },  // ainda em branco
            // o do indice 2 nem existe
        },
    });
    const fora = m.api.modelosForaDoPdfProva(itens);
    ok(fora.length === 2, 'os dois que nao entrariam sao encontrados', fora);
    ok(fora[0].idx === 1 && fora[1].idx === 2,
       'o escondido e o ausente — o desenhado fica de fora da lista', fora.map(f => f.idx));

    // Todos desenhados: ninguem fica de fora.
    const m2 = mundo({
        state: { osItens: { os1: itens } },
        canvases: {
            'amostra-item-canvas-0': { style: { display: '' } },
            'amostra-item-canvas-1': { style: { display: 'block' } },
            'amostra-item-canvas-2': { style: { display: '' } },
        },
    });
    ok(m2.api.modelosForaDoPdfProva(itens).length === 0, 'com tudo desenhado, ninguem fica de fora');
})();

(function aFraseDizQuantosEQuais() {
    const { api } = mundo({});
    const fora = n => Array.from({ length: n }, (_, i) => ({ idx: i, nome: 'M' + i }));

    const t1 = api.textoDosModelosForaDoPdf(fora(2), 52);
    ok(t1.indexOf('2 de 52') === 0, 'diz quantos de quantos', t1);
    ok(t1.includes('M0, M1'), 'e nomeia os modelos', t1);
    ok(/parece completo/.test(t1), 'e diz por que isso e perigoso', t1);

    // Muitos: nomeia seis e conta o resto, para a caixa nao virar uma lista.
    const t2 = api.textoDosModelosForaDoPdf(fora(16), 52);
    ok(t2.includes('M5') && !t2.includes('M6,'), 'nomeia seis', t2);
    ok(t2.includes('e mais 10'), 'e diz quantos sobraram', t2);
})();

(async function aTelaEEsperadaAntesDaFotografia() {
    const itens = [{ id: 'i1', nome_modelo: 'A' }, { id: 'i2', nome_modelo: 'B' }];
    const telas = {
        'amostra-item-canvas-0': { style: { display: '' } },
        'amostra-item-canvas-1': { style: { display: 'none' } },
    };
    const m = mundo({ state: { osItens: { os1: itens }, numeracoes: [] }, canvases: telas });

    // O card 1 termina de desenhar durante a espera.
    setTimeout(() => { telas['amostra-item-canvas-1'].style.display = 'block'; }, 300);
    const fora = await m.api.prepararTelaParaOPdfProva('os1', itens, 5000);
    ok(fora.length === 0, 'esperar deixa o card terminar de desenhar', fora);

    // O que nunca desenha volta na lista quando o teto estoura -- o botao nao
    // pode ficar preso esperando para sempre.
    const telas2 = { 'amostra-item-canvas-0': { style: { display: '' } } };
    const m2 = mundo({ state: { osItens: { os1: itens }, numeracoes: [] }, canvases: telas2 });
    const fora2 = await m2.api.prepararTelaParaOPdfProva('os1', itens, 600);
    ok(fora2.length === 1 && fora2[0].idx === 1,
       'passado o teto, quem nao desenhou e devolvido para quem chamou', fora2);
})();

// ─── 12. Quais colunas contam na conferencia de repeticoes ─────────────────
//
// Pedido do usuario: "ao clicar em Linhas as colunas que sao verificadas na
// conferencia de dados devem vir marcadas (checkbox); ao desmarcar devem
// ignorar a conferencia de repeticoes".
//
// O caso real: a numeracao do CAMAROTE CORPORATIVO le `Codigo` (unico por
// ingresso) e `Camarote` (1 a 140, repete por natureza, 25 ingressos cada). A
// conferencia somava as duas e acusava 3.640 repeticoes sem NENHUM codigo
// repetido -- numero inflado por construcao ensina a ignorar o aviso.

(function quaisColunasContam() {
    const { api } = mundo({});
    const num = n => ({ id: 'n1', elements: n });

    // Sem marca nenhuma: todas conferidas. E como toda numeracao anterior a
    // 26/08/2026 se comporta -- a marca de FORA e que e explicita.
    const a = num([
        { source: 'database', csv_column: 'Codigo' },
        { source: 'database', csv_column: 'Camarote' },
    ]);
    ok(api.colunasConferidasDaNumeracao(a).join(',') === 'Codigo,Camarote',
       'sem marca, todas as colunas sao conferidas', api.colunasConferidasDaNumeracao(a));

    // Camarote fora.
    const b = num([
        { source: 'database', csv_column: 'Codigo' },
        { source: 'database', csv_column: 'Camarote', sem_conferencia: true },
    ]);
    ok(api.colunasConferidasDaNumeracao(b).join(',') === 'Codigo',
       'desmarcada, a coluna sai da conferencia', api.colunasConferidasDaNumeracao(b));

    // Dois elementos na MESMA coluna: basta um pedir para conferir.
    const c = num([
        { source: 'database', csv_column: 'Codigo', sem_conferencia: true },
        { source: 'database', csv_column: 'Codigo' },
    ]);
    ok(api.colunasConferidasDaNumeracao(c).join(',') === 'Codigo',
       'um elemento pedindo conferencia basta para a coluna ser conferida');

    // O estado dos checkboxes: TODAS as colunas aparecem, marcadas ou nao.
    const cx = api.conferenciaDasColunasDaNumeracao(b);
    ok(cx.length === 2, 'a faixa mostra todas as colunas do banco', cx);
    ok(cx[0].nome === 'Codigo' && cx[0].conferida === true, 'Codigo vem marcado', cx[0]);
    ok(cx[1].nome === 'Camarote' && cx[1].conferida === false, 'Camarote vem desmarcado', cx[1]);

    // Gravar a escolha.
    const d = num([
        { source: 'database', csv_column: 'Codigo' },
        { source: 'database', csv_column: 'Camarote' },
    ]);
    const mudou = api.aplicarConferenciaNasColunas(d, { Codigo: true, Camarote: false });
    ok(mudou === 1, 'so o elemento que mudou conta', mudou);
    ok(d.elements[1].sem_conferencia === true, 'e a marca fica no elemento');
    ok(d.elements[0].sem_conferencia === undefined, 'quem continua conferido nao ganha marca');
    ok(api.aplicarConferenciaNasColunas(d, { Codigo: true, Camarote: false }) === 0,
       'gravar a mesma escolha nao mexe em nada');
    // E desmarcar volta atras, sem deixar a chave para tras.
    api.aplicarConferenciaNasColunas(d, { Codigo: true, Camarote: true });
    ok(!('sem_conferencia' in d.elements[1]), 're-marcar APAGA a chave, nao a deixa false');
})();

(function oAvisoDeixaDeContarAColunaDesmarcada() {
    // Duas linhas, dois modelos com bancos diferentes. Os codigos sao unicos;
    // o camarote e o mesmo nos dois -- exatamente o 21202.
    const els = ok => [
        { source: 'database', csv_column: 'Codigo' },
        { source: 'database', csv_column: 'Camarote', sem_conferencia: !ok },
    ];
    const cenario = confereCamarote => mundo({ state: {
        numeracoes: [
            { id: 'nA', elements: els(confereCamarote), csv_headers: ['Codigo', 'Camarote'],
              csv_data: [{ Codigo: 'A1', Camarote: '1' }, { Codigo: 'A2', Camarote: '2' }] },
            { id: 'nB', elements: els(confereCamarote), csv_headers: ['Codigo', 'Camarote'],
              csv_data: [{ Codigo: 'B1', Camarote: '1' }, { Codigo: 'B2', Camarote: '2' }] },
        ],
        osItens: { os1: [
            { id: 'i1', amostra_num_id: 'nA', nome_modelo: 'A' },
            { id: 'i2', amostra_num_id: 'nB', nome_modelo: 'B' },
        ] },
    } });

    const com = cenario(true).api.celulasRepetidasDoPedido('os1');
    ok(com['i1'] && com['i1'].total === 2,
       'com Camarote conferido, os dois numeros de camarote sao acusados', com['i1']);

    const sem = cenario(false).api.celulasRepetidasDoPedido('os1');
    ok(Object.keys(sem).length === 0,
       'desmarcado, o aviso some — e nenhum codigo repetia mesmo', sem);
})();

(function desmarcarNAOmudaOqueImprime() {
    // A garantia que separa esta escolha de todas as outras deste arquivo: ela
    // vale para a CONFERENCIA, e nunca para o papel.
    const linhas = [{ Codigo: 'A1', Camarote: '1' }, { Codigo: '', Camarote: '2' }];
    const faz = fora => {
        const m = mundo({ state: {
            numeracoes: [{ id: 'nA', csv_headers: ['Codigo', 'Camarote'], csv_data: linhas,
                elements: [
                    { source: 'database', csv_column: 'Codigo' },
                    { source: 'database', csv_column: 'Camarote', sem_conferencia: fora },
                ] }],
            osItens: { os1: [{ id: 'i1', amostra_num_id: 'nA', quantidade: 2 }] },
        } });
        const it = m.state.osItens.os1[0];
        return m.api.fatiaCsvDoItem(it, m.state.numeracoes[0]).length;
    };
    ok(faz(false) === 2 && faz(true) === 2,
       'a fatia impressa e a MESMA com e sem o Camarote conferido');
})();

// ─── 13. Separar a numeracao por dia, de dentro do painel ──────────────────
//
// Um evento de varios dias chega como UM arquivo por produto, com uma coluna
// `Data`, e um modelo do pedido por dia. Sem separar, os modelos dos quatro
// dias apontam para o mesmo banco e imprimem as MESMAS linhas.
//
// O que se mede aqui e o PLANO -- quem entra, quem fica de fora e por que --,
// que e o que a caixa de confirmacao mostra antes de qualquer gravacao.

(function oDiaSaiDoNomeEDaLinha() {
    const { api } = mundo({});
    ok(api.diaDoNomeDoModelo('05/set CAMAROTE VIP') === '05', 'o dia sai do nome do modelo');
    ok(api.diaDoNomeDoModelo('12/set FRONT STAGE') === '12', 'e de qualquer dia');
    ok(api.diaDoNomeDoModelo('EXTRAS CAMAROTE VIVA +') === 'extras', 'EXTRAS tem nome proprio');
    ok(api.diaDoNomeDoModelo('Pulseira comum') === null, 'nome sem dia nao inventa um');

    ok(api.diaDaLinhaDoBanco('05/09') === '05', 'e da linha do banco');
    ok(api.diaDaLinhaDoBanco('EXTRA') === 'extras', 'EXTRA na linha casa com EXTRAS no nome');
    ok(api.diaDaLinhaDoBanco('') === null, 'linha sem data nao entra em dia nenhum');
})();

(function oResumoNaoViraPulseira() {
    const { api } = mundo({});
    const num = {
        csv_headers: ['Página', 'Data', 'Codigo'],
        csv_data: [
            { 'Página': 'Codigos', Data: '05/09', Codigo: 'A1' },
            { 'Página': 'Codigos', Data: '05/09', Codigo: 'A2', __ativo: false },
            { 'Página': 'Codigos', Data: '06/09', Codigo: 'B1' },
            { 'Página': 'Resumo', Data: 'TOTAL', Codigo: '' },
        ],
    };
    const porDia = api.linhasPorDiaDaNumeracao(num);
    ok(porDia.size === 2, 'dois dias, e o Resumo fica de fora', [...porDia.keys()]);
    ok(porDia.get('05').length === 2, 'a linha DESMARCADA entra na copia do dia');
    ok(!('__ativo' in porDia.get('05')[1]),
       'e entra sem a marca: a numeracao passa a ser DO dia');

    // Banco sem coluna Data: nao ha o que separar, e nada e inventado.
    ok(api.linhasPorDiaDaNumeracao({ csv_headers: ['Codigo'], csv_data: [{ Codigo: 'X' }] }).size === 0,
       'banco sem coluna Data nao se separa');
})();

(function oPlanoDizQuemEntraEQuemFicaDeFora() {
    const linhas = (dia, n) => Array.from({ length: n },
        (_, i) => ({ 'Página': 'Codigos', Data: dia, Codigo: dia + '-' + i }));
    const num = {
        id: 'n1', name: 'CAMAROTE VIP', csv_filename: 'vip.csv',
        csv_headers: ['Página', 'Data', 'Codigo'],
        csv_data: [].concat(linhas('05/09', 200), linhas('06/09', 200), linhas('11/09', 150)),
    };
    const itens = [
        { id: 'i1', amostra_num_id: 'n1', nome_modelo: '05/set CAMAROTE VIP', quantidade: 200 },
        { id: 'i2', amostra_num_id: 'n1', nome_modelo: '06/set CAMAROTE VIP', quantidade: 200 },
        // A Qtd nao bate com as 150 linhas do dia 11: fica de fora, com o motivo.
        { id: 'i3', amostra_num_id: 'n1', nome_modelo: '11/set CAMAROTE VIP', quantidade: 200 },
        // O nome nao diz o dia.
        { id: 'i4', amostra_num_id: 'n1', nome_modelo: 'CAMAROTE VIP avulso', quantidade: 200 },
    ];
    const m = mundo({ state: { numeracoes: [num], osItens: { os1: itens } } });
    const plano = m.api.planoDeSeparacaoPorDia('os1', num);

    ok(plano && plano.entram.length === 2, 'entram os dois que fecham com o dia deles',
       plano && plano.entram.map(e => e.nome));
    ok(plano.entram[0].nomeNovo === 'CAMAROTE VIP 05', 'o nome novo e o do banco mais o dia',
       plano.entram[0].nomeNovo);
    ok(plano.entram[0].fatia.length === 200, 'e leva so as linhas do dia');
    ok(plano.ficamDeFora.length === 2, 'e os outros dois ficam de fora', plano.ficamDeFora);
    ok(/Qtd é 200/.test(plano.ficamDeFora[0].motivo) || /150 linhas/.test(plano.ficamDeFora[0].motivo),
       'o motivo do que nao fecha diz os dois numeros', plano.ficamDeFora[0].motivo);
    ok(/nome não diz/.test(plano.ficamDeFora[1].motivo),
       'e o do sem dia diz que o nome nao anuncia', plano.ficamDeFora[1].motivo);

    // O texto da caixa mostra o plano inteiro ANTES de gravar.
    const t = m.api.textoDoPlanoDeSeparacao(plano);
    ok(t.includes('CAMAROTE VIP 05') && t.includes('CAMAROTE VIP 06'), 'a caixa lista as copias', t.slice(0, 200));
    ok(t.includes('Ficam como estão'), 'e lista quem fica de fora');
    ok(/não é alterado nem apagado/.test(t),
       'e diz que o original continua — e por onde se desfaz a separacao');
})();

(function semOqueSepararNaoHaPlano() {
    const um = { id: 'n1', name: 'X', csv_headers: ['Página', 'Data', 'Codigo'],
        csv_data: [{ 'Página': 'Codigos', Data: '05/09', Codigo: 'A' }] };
    const m = mundo({ state: { numeracoes: [um],
        osItens: { os1: [{ id: 'i1', amostra_num_id: 'n1', nome_modelo: '05/set X', quantidade: 1 }] } } });
    ok(m.api.planoDeSeparacaoPorDia('os1', um) === null,
       'um dia so nao e separacao — e o botao nao aparece');

    const m2 = mundo({ state: { numeracoes: [], osItens: { os1: [] } } });
    ok(m2.api.planoDeSeparacaoPorDia('os1', null) === null, 'sem numeracao, sem plano');
})();

// ─── 20. A releitura ENXUTA nao joga fora o banco que ja desceu ────────────
//
// Trocar de modelo no pedido 21202 -- 52 modelos, 49 numeracoes, 96.910 linhas,
// 17 MB -- rele as numeracoes do pedido para pegar o que outra aba mudou. Ate
// 27/08/2026 essa releitura era `select('*')`: 17 MB baixados e reprocessados a
// CADA clique num modelo da fila, com a tela parada esperando. Enxuta ela custa
// 30 KB -- mas a linha enxuta vem SEM `csv_data`, e trocar a antiga por ela
// devolvia o banco ao estado `undefined`, jogando fora o que a tela de Amostras
// tinha acabado de baixar. Cada troca de modelo os pedia todos de novo.
//
// A regra que resolve: linha nova sem a coluna herda o banco da antiga, mas so
// quando o `updated_at` das duas e o mesmo. O carimbo vem do gatilho
// `trg_producao_numeracoes_updated`, que dispara em todo update da tabela.

(function aReleituraEnxutaPreservaOBancoQueJaDesceu() {
    const m = mundo({ state: { numeracoes: [] } });
    const { bancoBaixadoContinuaValendo, mesclarNumeracoesNoCatalogo } = m.api;

    const T1 = '2026-08-27T10:00:00Z';
    const T2 = '2026-08-27T11:30:00Z';

    // ── O carimbo sozinho ──
    ok(bancoBaixadoContinuaValendo({ csv_data: [{ a: 1 }], updated_at: T1 }, { updated_at: T1 }),
       'mesmo carimbo: o banco em memoria descreve a linha relida');
    ok(!bancoBaixadoContinuaValendo({ csv_data: [{ a: 1 }], updated_at: T1 }, { updated_at: T2 }),
       'carimbo diferente: a linha mudou, o banco em memoria esta velho');
    ok(!bancoBaixadoContinuaValendo({ csv_data: [{ a: 1 }] }, { updated_at: T1 }),
       'sem carimbo de um dos lados a resposta e "nao" -- baixar de novo custa uma consulta, '
       + 'imprimir o CSV velho custa papel');
    ok(!bancoBaixadoContinuaValendo({ updated_at: T1 }, { updated_at: T1 }),
       'nunca desceu (`undefined`) nao tem o que preservar');
    ok(bancoBaixadoContinuaValendo({ csv_data: null, updated_at: T1 }, { updated_at: T1 }),
       'o `null` de "ja procurei e nao tem" tambem se preserva: reperguntar seria a mesma resposta');

    // ── A mescla ──
    const catalogo = [
        { id: 'nA', name: 'A', updated_at: T1, csv_data: [{ Codigo: '1' }, { Codigo: '2' }] },
        { id: 'nB', name: 'B', updated_at: T1, csv_data: [{ Codigo: '9' }] },
        { id: 'nC', name: 'C', updated_at: T1 },   // nunca desceu
    ];
    const enxutas = [
        { id: 'nA', name: 'A', updated_at: T1 },   // nao mudou
        { id: 'nB', name: 'B', updated_at: T2 },   // outra aba mexeu nela
        { id: 'nC', name: 'C', updated_at: T1 },
        { id: 'nD', name: 'D', updated_at: T1 },   // nova no pedido
    ];
    const n = mesclarNumeracoesNoCatalogo(catalogo, enxutas);
    ok(n === 4, 'as quatro entram no catalogo', n);

    const porId = id => catalogo.find(x => x.id === id);
    ok(porId('nA').csv_data && porId('nA').csv_data.length === 2,
       'a que nao mudou fica com o banco que ja estava em memoria -- ninguem rebaixa 17 MB',
       porId('nA').csv_data);
    ok(porId('nB').csv_data === undefined,
       'a que MUDOU volta a `undefined`: o `garantirCsvDaNumeracao` desce a versao nova. '
       + '`null` aqui faria a tela concluir "nao tem banco" e imprimir numero sequencial',
       porId('nB').csv_data);
    ok(porId('nC').csv_data === undefined, 'a que nunca desceu continua como estava');
    ok(porId('nD') && porId('nD').name === 'D', 'a numeracao nova entra');

    // ── A leitura COMPLETA continua mandando ──
    const cheio = [{ id: 'nA', name: 'A', updated_at: T1, csv_data: [{ Codigo: 'novo' }] }];
    mesclarNumeracoesNoCatalogo(catalogo, cheio);
    ok(porId('nA').csv_data.length === 1 && porId('nA').csv_data[0].Codigo === 'novo',
       'quem le com `select(*)` traz a coluna, e ela vence -- a heranca so vale para a linha enxuta',
       porId('nA').csv_data);

    // Uma leitura completa que devolve `null` (numeracao sem banco) tambem manda.
    mesclarNumeracoesNoCatalogo(catalogo, [{ id: 'nA', name: 'A', updated_at: T1, csv_data: null }]);
    ok(porId('nA').csv_data === null,
       'e "esta numeracao nao tem banco" nao e revertido pela heranca');

    ok(mesclarNumeracoesNoCatalogo(catalogo, null) === 0
        && mesclarNumeracoesNoCatalogo(null, []) === 0, 'sem lista, nada a mesclar');
})();

// ─── Fecho ──────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do banco sob demanda passaram.');
}, 80);
