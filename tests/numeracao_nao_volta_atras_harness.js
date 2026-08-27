// A NUMERACAO ESCOLHIDA PELO OPERADOR NAO PODE VOLTAR ATRAS SOZINHA (27/08/2026).
//
// `pedidos_modelos` guarda a numeracao do modelo DUAS vezes: o texto, escrito
// pelo ERP do parceiro (`gabarito_operacional`), e o id, derivado por este
// painel (`amostra_num_id`). Quando os dois discordam, quem manda e o texto --
// e a regra do `cor-numeracao-do-modelo.js`, e ela existe porque o parceiro
// troca a numeracao de um modelo e o id em cache nunca mais deixaria a troca
// chegar a tela.
//
// As duas filas (a da tela de Pedido e a da Imposicao) gravavam so o id. O
// operador escolhia a numeracao certa, o id ia para o banco, o texto ficava o
// antigo -- e na abertura seguinte a reconciliacao devolvia o id ao que o texto
// dizia. Ele nao tinha como vencer.
//
// Foi o que aconteceu no pedido 21202 com o modelo 1000563 (05/set CAMAROTE
// PATROCINADORES, Qtd 1.920), cujo `gabarito_operacional` no ERP diz "CAMAROTE
// PRESIDENTE 05": o modelo voltava sozinho para aquela numeracao, de 3.000
// linhas. A tela pedia 300 folhas onde cabiam 192, e o dado impresso seria o de
// outro modelo -- sem erro em tela nenhuma.
//
// Este harness fecha o ciclo inteiro: manda o operador escolher pela fila,
// recolhe o que foi gravado, remonta a linha do banco com isso e passa a linha
// pela reconciliacao DE VERDADE. O que ele mede e a unica coisa que importa --
// o que a tela mostra na abertura seguinte.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const { reconciliarCorNumDoModelo } = require(path.join(RAIZ, 'frontend', 'cor-numeracao-do-modelo.js'));

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

/** Le uma funcao do arquivo pelo nome, ate o `}` na coluna zero. */
function extrairFuncao(src, nome) {
    let i = src.indexOf('\nasync function ' + nome + '(');
    if (i < 0) i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

// As numeracoes reais envolvidas no 21202, com os ids de producao.
const CORPORATIVO = 'c041a51c-c590-4646-aa47-8e6b4e984409';
const PRESIDENTE  = '50fe7fce-2625-49e6-b5f0-d07fc08632aa';
const CERTA       = 'aaaa1111-0000-0000-0000-000000000000';
const CATALOGO = [
    { id: CORPORATIVO, name: 'CAMAROTE CORPORATIVO 05', is_custom: false, tipo: 'SEQUENCIAL' },
    { id: PRESIDENTE,  name: 'CAMAROTE PRESIDENTE 05',  is_custom: false, tipo: 'SEQUENCIAL' },
    { id: CERTA,       name: 'CAMAROTE PATROCINADORES 05', is_custom: false, tipo: 'SEQUENCIAL' },
];

/**
 * Um mundo por caso. O `autoSaveOSItemField` de mentira anota o que iria para o
 * banco, que e exatamente o que decide a proxima abertura.
 */
function mundo(arquivo, nomeDaFuncao) {
    const src = fs.readFileSync(path.join(RAIZ, 'frontend', arquivo), 'utf8');
    const gravado = {};
    const item = {
        id: '1000563',
        nome_modelo: '05/set CAMAROTE PATROCINADORES (DO 01 AO 24) 80 UND CADA',
        quantidade: 1920, qtd: 1920, num_inicial: 1,
        // O que o ERP escreveu, e o que a fila deixava para tras.
        gabarito_operacional: 'CAMAROTE PRESIDENTE 05',
        amostra_num_id: PRESIDENTE,
        numeracao_id: PRESIDENTE,
    };
    const state = { numeracoes: CATALOGO, osItens: { os1: [item] }, activeOSItem: null };
    const ambiente = {
        state,
        document: { getElementById: () => null },
        autoSaveOSItemField: (itemId, osId, campo, valor) => { gravado[campo] = valor; },
        isNumeracaoDuplex: n => n.print_mode === 'duplex',
        window: { sincronizarNumeracaoDoItem: (it, id) => { it.amostra_num_id = id; it.numeracao_id = id; } },
        renderPedOSQueue: () => {},
        enviarParaPedido: () => {},
        enviarParaImposicao: () => {},
        Event: function () {},
    };
    const nomes = Object.keys(ambiente);
    const fn = new Function(...nomes,
        extrairFuncao(src, nomeDaFuncao) + '\nreturn ' + nomeDaFuncao + ';'
    )(...nomes.map(n => ambiente[n]));
    return { fn, item, gravado };
}

// ─── 1. As duas filas gravam o TEXTO junto com o id ────────────────────────

[['pedido.js', 'pedQueueUpdateNum', 'a fila da tela de Pedido'],
 ['script.js', 'impQueueUpdateNum', 'a fila da tela de Imposicao']].forEach(([arq, nome, rotulo]) => {
    const m = mundo(arq, nome);
    m.fn('1000563', 'os1', CERTA);

    ok(m.gravado.amostra_num_id === CERTA, rotulo + ' grava o id escolhido', m.gravado);
    ok(m.gravado.gabarito_operacional === 'CAMAROTE PATROCINADORES 05',
       rotulo + ' grava TAMBEM o texto -- sem ele a escolha volta atras na proxima abertura',
       m.gravado);

    // O ciclo inteiro: a linha do banco como ela fica, passada pela
    // reconciliacao de verdade.
    const linhaDoBanco = {
        padrao: null,
        gabarito_operacional: m.gravado.gabarito_operacional,
        amostra_num_id: m.gravado.amostra_num_id,
    };
    const r = reconciliarCorNumDoModelo(linhaDoBanco, [], CATALOGO);
    ok(!r.numTrocada && String(r.numId) === CERTA,
       rotulo + ': na abertura seguinte o modelo continua na numeracao que o operador escolheu',
       { numId: r.numId, trocada: r.numTrocada });
});

// ─── 2. A regra do parceiro continua valendo ───────────────────────────────
//
// Este e o outro lado, e ele nao pode ser quebrado pela correcao: quando o
// PARCEIRO troca a numeracao de um modelo no ERP, o texto novo tem de vencer o
// id que este painel guardou. E por isso que a reconciliacao existe.

(function oTextoDoParceiroContinuaMandando() {
    const linha = {
        padrao: null,
        gabarito_operacional: 'CAMAROTE PRESIDENTE 05',   // o parceiro acabou de trocar
        amostra_num_id: CERTA,                            // o id que o painel tinha
    };
    const r = reconciliarCorNumDoModelo(linha, [], CATALOGO);
    ok(r.numTrocada && String(r.numId) === PRESIDENTE,
       'troca feita pelo parceiro no ERP continua chegando a tela', r);
})();

(function numeracaoExclusivaContinuaProtegida() {
    const custom = { id: 'zzz', name: '1000563', is_custom: true };
    const linha = {
        padrao: null,
        gabarito_operacional: 'CAMAROTE PRESIDENTE 05',
        amostra_num_id: 'zzz',
    };
    const r = reconciliarCorNumDoModelo(linha, [], CATALOGO.concat([custom]));
    ok(!r.numTrocada && r.numId === 'zzz',
       'numeracao exclusiva do operador nao e desfeita pelo texto do parceiro', r);
})();

// ─── Fecho ────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes da numeracao que nao volta atras passaram.');
