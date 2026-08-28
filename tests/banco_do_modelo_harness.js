// As funcoes puras da resolucao do banco por modelo.
//
// Roda em node: `node tests/banco_do_modelo_harness.js`.

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
const B = global.window.BancoDoModelo;

const PECA = {
    id: 'num-1',
    csv_headers: ['NOME', 'CODIGO'],
    csv_data: [{ __id: 1, NOME: 'ANA', CODIGO: 'A01' }],
    elements: [
        { id: 'el_1', type: 'TEXT', source: 'database', csv_column: 'NOME' },
        { id: 'el_2', type: 'QR',   source: 'database', csv_column: 'CODIGO' },
        { id: 'el_3', type: 'QR',   source: 'database', csv_column: 'CODIGO' },
        { id: 'el_4', type: 'FIXED', fixed_value: 'CREDENCIAL' }
    ]
};

const BANCO = {
    id: 'b-1', id_int: 21202, nome: 'BACKSTAGE',
    csv_headers: ['NOME', '05/09', '06/09'],
    csv_data: [
        { __id: 1, NOME: 'ANA',   '05/09': 'A5C01', '06/09': 'B6C01' },
        { __id: 2, NOME: 'BRUNO', '05/09': 'A5C02', '06/09': 'B6C02' }
    ]
};

(function semBancoESemMapaDevolveOMesmoObjeto() {
    ok(B.numeracaoResolvida(PECA, null, null) === PECA,
        'sem banco e sem mapa, devolve a MESMA peca — sem copia');
    ok(B.numeracaoResolvida(PECA, null, {}) === PECA,
        'mapa vazio conta como ausente');
    ok(B.numeracaoResolvida(null, BANCO, null) === null,
        'sem peca nao inventa peca');
})();

(function oBancoSubstituiOCsvDaPeca() {
    const r = B.numeracaoResolvida(PECA, BANCO, null);
    ok(r !== PECA, 'com banco, a peca original nao e tocada');
    ok(PECA.csv_data.length === 1, 'e continua com o csv dela', PECA.csv_data.length);
    ok(r.csv_data.length === 2, 'a resolvida usa as linhas do banco', r.csv_data.length);
    ok(r.csv_headers.join(',') === 'NOME,05/09,06/09',
        'e o cabecalho do banco', r.csv_headers);
    ok(r.id === 'num-1', 'o resto da peca vem junto');
})();

(function oMapaTrocaTodosOsCamposDaMesmaColuna() {
    const r = B.numeracaoResolvida(PECA, BANCO, { 'CODIGO': '06/09' });
    const cols = r.elements.map(e => e.csv_column || null);
    ok(cols[0] === 'NOME', 'coluna sem entrada no mapa fica como esta');
    ok(cols[1] === '06/09' && cols[2] === '06/09',
        'os DOIS campos que liam CODIGO trocam juntos', cols);
    ok(r.elements[3].csv_column === undefined, 'campo fixo nao e tocado');

    ok(PECA.elements[1].csv_column === 'CODIGO',
        'a peca do catalogo nao foi alterada — a troca e so na copia');
})();

(function colunaDoModelo() {
    ok(B.colunaDoModelo(null, 'CODIGO') === 'CODIGO', 'sem mapa, a coluna e a pedida');
    ok(B.colunaDoModelo({ 'CODIGO': '11/09' }, 'CODIGO') === '11/09', 'com mapa, e a mapeada');
    ok(B.colunaDoModelo({ 'CODIGO': '' }, 'CODIGO') === 'CODIGO',
        'entrada vazia nao apaga a coluna — vale a pedida');
})();

(function bancoDoModelo() {
    const bancos = [BANCO, { id: 'b-2', nome: 'OUTRO' }];
    ok(B.bancoDoModelo({ banco_id: 'b-1' }, bancos) === BANCO, 'acha pelo id');
    ok(B.bancoDoModelo({ banco_id: 'b-9' }, bancos) === null,
        'vinculo apontando para banco que nao veio devolve null, nao o primeiro da lista');
    ok(B.bancoDoModelo(null, bancos) === null, 'sem vinculo, sem banco');
})();

(function travaDoBancoQueNaoDesceu() {
    // Vinculo apontando para banco ausente NAO pode virar "sem banco": isso
    // devolveria a peca com o csv_data do catalogo e imprimiria o dado errado.
    // Quem barra e a trava do `modelosComBancoNaoBaixado`, e ela so consegue
    // barrar porque este `null` aqui e distinguivel.
    ok(B.bancoDoModelo({ banco_id: 'b-9' }, [BANCO]) === null,
        'banco ausente devolve null, para a trava poder ver');
    ok(B.numeracaoResolvida(PECA, null, { 'CODIGO': '06/09' }).csv_data === PECA.csv_data,
        'sem banco, o csv continua sendo o da peca — quem barra e a trava, nao esta funcao');
})();

// ── A trava, e as duas telas ─────────────────────────────────────────────────

(function asDuasTelasTemATrava() {
    const fs = require('fs');
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
    ok(script.includes('modelosSemBancoDoTrabalho') && pedido.includes('modelosSemBancoDoTrabalho'),
        'a trava do banco que nao desceu esta nas DUAS telas de imposicao');

    // Trava sem saida na tela e trava que prende o operador: o recado tem de
    // dizer o que fazer, e nao so que algo falta.
    ok(/Feche e abra o pedido de novo/.test(script) && /Feche e abra o pedido de novo/.test(pedido),
        'o recado da trava diz o que fazer para sair dela');
})();

// ── Etapa 2: o que a peca pede, e o que o banco do pedido oferece ────────────

(function colunasQueAPecaPede() {
    const pede = B.colunasQueAPecaPede(PECA);
    ok(pede.length === 2 && pede[0] === 'NOME' && pede[1] === 'CODIGO',
        'a peca pede as colunas dos campos de banco, sem repetir', pede);
    ok(B.colunasQueAPecaPede({ elements: [] }).length === 0, 'peca sem campo de banco nao pede nada');
    ok(B.colunasQueAPecaPede(null).length === 0, 'sem peca, nada');

    // Campo de banco sem coluna escolhida nao entra: nao ha o que mapear, e
    // quem avisa desse caso e o `bancoDeDadosIncompletoDoModelo`.
    const meia = { elements: [{ type: 'TEXT', source: 'database', csv_column: '' },
                              { type: 'QR', source: 'database', csv_column: 'X' }] };
    ok(B.colunasQueAPecaPede(meia).join(',') === 'X', 'campo sem coluna fica de fora');
})();

(function colunasQueFaltam() {
    // Sem banco do pedido nao ha o que faltar: a peca le o CSV dela.
    ok(B.colunasQueFaltam(PECA, null, null).length === 0,
        'sem banco do pedido, nada falta — a peca le o CSV dela');

    // Com banco, cada coluna pedida tem de achar destino no cabecalho dele.
    const faltam = B.colunasQueFaltam(PECA, BANCO, null);
    ok(faltam.length === 1 && faltam[0] === 'CODIGO',
        'CODIGO nao existe no banco e nenhum mapa aponta para ela', faltam);

    ok(B.colunasQueFaltam(PECA, BANCO, { 'CODIGO': '06/09' }).length === 0,
        'com o mapa apontando, nao falta nada');

    ok(B.colunasQueFaltam(PECA, BANCO, { 'CODIGO': 'NAO_EXISTE' }).join(',') === 'CODIGO',
        'mapa apontando para coluna que o banco nao tem continua faltando');
})();

(function mapaLimpo() {
    // Entrada que aponta para a propria coluna nao vale a pena guardar, e
    // entrada de coluna que a peca nao pede mais e lixo de uma edicao antiga.
    const limpo = B.mapaLimpo({ 'NOME': 'NOME', 'CODIGO': '06/09', 'SUMIU': 'X' }, ['NOME', 'CODIGO']);
    ok(Object.keys(limpo).length === 1 && limpo['CODIGO'] === '06/09',
        'sobra so a troca de verdade, das colunas que a peca pede', limpo);
    ok(B.mapaLimpo(null, ['NOME']) === null, 'mapa ausente continua ausente');
    ok(B.mapaLimpo({ 'NOME': 'NOME' }, ['NOME']) === null,
        'mapa que nao troca nada vira ausente, e nao um objeto vazio guardado a toa');
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
