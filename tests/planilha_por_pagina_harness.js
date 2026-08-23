// A planilha de varias paginas: o que cada linha carrega, e a numeracao por aba.
//
// Pedido do usuario em 23/08/2026, depois de a planilha do Expointer (19 abas)
// nao conseguir salvar: o pacote do save chegava a 45,4 MB para 3,5 MB de dado
// real, e a conexao caia no meio ("TypeError: Failed to fetch").
//
// O que estes testes protegem:
//
//   1. `juntarPaginas` guarda em cada linha SO as colunas da propria pagina. O
//      cabecalho continua sendo a uniao de todas -- e dele que o editor tira a
//      grade --, mas a linha do EXPOSITOR nao carrega mais as 37 celulas vazias
//      das outras 18 abas. E a correcao que ataca a causa.
//   2. `elementosParaAPagina` reaponta os elementos de banco pela POSICAO da
//      coluna, que e o que se mantem entre abas com nomes diferentes.
//
// Roda em node, sem navegador: `node tests/planilha_por_pagina_harness.js`.

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

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['nomeLivreDaColuna', 'juntarPaginas', 'elementosParaAPagina'];

let api;
try {
    const codigo = NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n');
    api = new Function(codigo + '\nreturn { ' + NOMES.join(', ') + ' };')();
} catch (e) {
    console.error('FALHOU: ' + e.message);
    process.exit(1);
}

// --- 1. Cada linha carrega so as colunas da propria pagina -------------------

function paginasDeExemplo() {
    return [
        { nome: 'EXPOSITOR', headers: ['EXPOSITOR ok', 'EXPOSITOR'],
          rows: [{ 'EXPOSITOR ok': '3070125', 'EXPOSITOR': 'EXPOSITOR' }] },
        { nome: 'JURADOS', headers: ['JURADOS ok', 'JURADOS'],
          rows: [{ 'JURADOS ok': '3090132', 'JURADOS': 'JURADOS' }] },
        { nome: 'ESTRANGEIROS', headers: ['ESTRANGEIROS ok', 'ESTRANGEIROS'],
          rows: [{ 'ESTRANGEIROS ok': '3090133', 'ESTRANGEIROS': 'ESTRANGEIROS' }] },
    ];
}

(function oCabecalhoContinuaSendoAUniao() {
    const r = api.juntarPaginas(paginasDeExemplo());
    ok(r.headers.length === 7, 'o cabecalho traz a coluna Pagina + as 6 das tres abas', r.headers);
    ok(r.headers[0] === 'Página', 'e a Pagina abre a lista', r.headers[0]);
    ok(r.colunaPagina === 'Página', 'a coluna da pagina e devolvida a quem chamou');
})();

(function cadaLinhaSoTemAsColunasDaPropriaPagina() {
    const r = api.juntarPaginas(paginasDeExemplo());
    ok(r.rows.length === 3, 'uma linha por pagina, no exemplo');

    const chaves = r.rows.map(l => Object.keys(l).sort().join(','));
    ok(chaves[0] === 'EXPOSITOR,EXPOSITOR ok,Página',
        'a linha do EXPOSITOR carrega so as colunas dele', chaves[0]);
    ok(chaves[1] === 'JURADOS,JURADOS ok,Página',
        'a do JURADOS, so as dele', chaves[1]);

    // O que a v700 desfez: 3 campos por linha em vez de 7, sem perder dado.
    ok(r.rows.every(l => Object.keys(l).length === 3),
        'nenhuma linha carrega coluna de outra aba', chaves);
    ok(r.rows[0]['EXPOSITOR ok'] === '3070125' && r.rows[0]['Página'] === 'EXPOSITOR',
        'e o dado da propria pagina continua inteiro', r.rows[0]);
})();

(function aColunaVaziaDaPROPRIApaginaContinua() {
    // Ali o branco e um dado -- a celula que o cliente deixou em branco --, e nao
    // o preenchimento de uma coluna que nem e daquela aba.
    const r = api.juntarPaginas([
        { nome: 'A', headers: ['CODIGO', 'NOME'], rows: [{ CODIGO: '1', NOME: '' }] },
        { nome: 'B', headers: ['CPF'], rows: [{ CPF: '9' }] },
    ]);
    ok('NOME' in r.rows[0] && r.rows[0].NOME === '', 'coluna vazia da propria pagina fica', r.rows[0]);
    ok(!('CPF' in r.rows[0]), 'coluna da outra pagina nao entra', r.rows[0]);
    ok(!('NOME' in r.rows[1]), 'e vice-versa', r.rows[1]);
})();

(function oGanhoEmTamanhoENaOrdemDoQueSeMediu() {
    // 19 abas de 2 colunas, como a planilha do Expointer: com a uniao inteira
    // cada linha teria 39 campos; com a regra nova, 3.
    const paginas = [];
    for (let i = 1; i <= 19; i++) {
        const col = 'ABA' + i;
        const rows = [];
        for (let j = 0; j < 500; j++) rows.push({ [col + ' ok']: '30701258' + j, [col]: col });
        paginas.push({ nome: col, headers: [col + ' ok', col], rows });
    }
    const r = api.juntarPaginas(paginas);
    const agora = JSON.stringify(r.rows).length;

    // O que seria com o preenchimento de antes, para o teste dizer o tamanho do
    // problema e nao so a forma dele.
    const todas = r.headers.slice(1);
    const antes = JSON.stringify(r.rows.map(l => {
        const cheia = { 'Página': l['Página'] };
        for (const c of todas) cheia[c] = (l[c] !== undefined) ? l[c] : '';
        return cheia;
    })).length;

    ok(antes / agora > 5, 'a linha enxuta e varias vezes menor que a preenchida',
        { antesMB: +(antes / 1048576).toFixed(2), agoraMB: +(agora / 1048576).toFixed(2) });
    ok(r.rows.length === 19 * 500, 'e nenhuma linha se perdeu no caminho', r.rows.length);
})();

// --- 2. Os elementos reapontados pela posicao da coluna ----------------------

(function oElementoSegueAPOSICAOdaColuna() {
    // O elemento aponta "EXPOSITOR ok" (1a coluna); na aba JURADOS a 1a coluna e
    // "JURADOS ok". E a posicao que se mantem entre abas, nao o nome.
    const elementos = [
        { id: 'el_1', type: 'QR', source: 'database', csv_column: 'EXPOSITOR ok' },
        { id: 'el_2', type: 'TEXT', source: 'database', csv_column: 'EXPOSITOR' },
        { id: 'el_3', type: 'FIXED', texto: 'EXPOINTER' },
    ];
    const r = api.elementosParaAPagina(elementos, ['EXPOSITOR ok', 'EXPOSITOR'], ['JURADOS ok', 'JURADOS']);

    ok(r.elementos[0].csv_column === 'JURADOS ok', 'o QR passa a ler a 1a coluna da aba', r.elementos[0]);
    ok(r.elementos[1].csv_column === 'JURADOS', 'e o texto, a 2a', r.elementos[1]);
    ok(r.elementos[2].texto === 'EXPOINTER', 'elemento que nao le banco fica intacto');
    ok(r.semCorrespondente.length === 0, 'nada a relatar quando as duas abas tem o mesmo formato');
})();

(function colunaSemCorrespondenteEhRelatadaEnaoAdivinhada() {
    const elementos = [{ id: 'el_1', type: 'QR', source: 'database', csv_column: 'CPF' }];
    const r = api.elementosParaAPagina(elementos, ['CODIGO', 'NOME', 'CPF'], ['JURADOS ok', 'JURADOS']);

    ok(r.elementos[0].csv_column === 'CPF', 'a coluna sem correspondente fica como estava', r.elementos[0]);
    ok(r.semCorrespondente.join(',') === 'CPF', 'e e relatada para o operador conferir', r.semCorrespondente);
})();

(function osElementosSaoCOPIAeNaoOsOriginais() {
    // Sem a copia, criar 19 numeracoes reapontaria os elementos da numeracao
    // aberta 19 vezes, e a ultima aba venceria.
    const elementos = [{ id: 'el_1', type: 'QR', source: 'database', csv_column: 'A ok' }];
    api.elementosParaAPagina(elementos, ['A ok'], ['B ok']);
    ok(elementos[0].csv_column === 'A ok', 'a numeracao aberta nao e alterada', elementos[0]);
})();

// --- 3. A ligacao com a tela ------------------------------------------------

(function aEscolhaEDoOperador() {
    ok(/function abrirEscolhaDasPaginas\(/.test(SCRIPT), 'existe a janela de escolha');
    ok(/Uma numeração por página/.test(SCRIPT), 'com a opcao de separar');
    ok(/Tudo numa numeração só/.test(SCRIPT), 'e a de empilhar, que continua sendo o caminho de antes');
    const i = SCRIPT.indexOf('if (Array.isArray(res.partes) && res.partes.length > 1)');
    ok(i > 0, 'a busca so pergunta quando ha mais de uma pagina');
})();

(function cadaNumeracaoNasceLigadaASuaAba() {
    const i = SCRIPT.indexOf('async function criarUmaNumeracaoPorPagina');
    ok(i > 0, 'a criacao por pagina existe');
    const corpo = SCRIPT.slice(i, i + 4000);
    ok(corpo.indexOf('#gid=') > 0,
        'o csv_url de cada uma aponta para a aba dela, para o atualizar valer uma a uma');
    ok(corpo.indexOf("api('POST', '/numeracoes'") > 0, 'e grava pela mesma porta do resto do painel');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('planilha por pagina: ' + total + ' verificacoes, todas passaram.');
