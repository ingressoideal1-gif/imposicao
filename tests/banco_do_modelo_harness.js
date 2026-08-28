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

(function mapaAposRenomearColunaDoBanco() {
    const pedidas = ['NOME', 'CODIGO'];

    // A armadilha: NOME era implicita — a peca pede NOME, o banco tinha NOME, e
    // por isso nao havia entrada no mapa. Renomeada no banco, o apontamento se
    // perderia em silencio.
    const r1 = B.mapaAposRenomear({ CODIGO: '05/09' }, pedidas, { NOME: 'PARTICIPANTE' });
    ok(r1 && r1.NOME === 'PARTICIPANTE',
        'coluna implicita renomeada ganha entrada no mapa', r1);
    ok(r1 && r1.CODIGO === '05/09', 'e a que ja tinha entrada nao se mexe', r1);

    // A explicita renomeada e atualizada.
    const r2 = B.mapaAposRenomear({ CODIGO: '05/09' }, pedidas, { '05/09': '05-09' });
    ok(r2 && r2.CODIGO === '05-09', 'coluna explicita renomeada acompanha', r2);

    // Renomeacao de coluna que ninguem le nao inventa entrada.
    ok(B.mapaAposRenomear(null, pedidas, { SOBRA: 'OUTRA' }) === null,
        'renomear coluna que a peca nao le nao cria mapa do nada');

    // Renomear a coluna do banco para o mesmo nome que a peca pede volta a ser
    // implicita, e a entrada some em vez de ficar guardada a toa.
    const r3 = B.mapaAposRenomear({ CODIGO: '05/09' }, pedidas, { '05/09': 'CODIGO' });
    ok(r3 === null, 'apontamento que virou identico ao pedido deixa de ser mapa', r3);
})();

// ── A coluna e do MODELO: apontamento por elemento (28/08/2026) ─────────────

(function colunaDoElemento() {
    const el = { id: 'e9', source: 'database', csv_column: '' };

    ok(B.colunaDoElemento({ 'el:e9': '05/09' }, el) === '05/09',
        'a chave por elemento aponta a coluna, mesmo com csv_column vazio');
    ok(B.colunaDoElemento(null, el) === '',
        'sem mapa e sem csv_column, o elemento esta SEM coluna — nao inventa');

    const legado = { id: 'e1', source: 'database', csv_column: 'CODIGO' };
    ok(B.colunaDoElemento({ CODIGO: '06/09' }, legado) === '06/09',
        'sem chave por elemento, vale o caminho legado pelo nome da coluna');
    ok(B.colunaDoElemento({ 'el:e1': '11/09', CODIGO: '06/09' }, legado) === '11/09',
        'a chave por elemento VENCE o mapa legado quando as duas existem');
    ok(B.colunaDoElemento(null, legado) === 'CODIGO',
        'sem mapa nenhum, o legado le a propria coluna — nada muda para as pecas antigas');
})();

(function pecaNovaResolvePorElemento() {
    const nova = {
        id: 'num-nova', csv_data: null,
        elements: [
            { id: 'e1', type: 'TEXT', source: 'database', csv_column: '', exemplo: 'MARIA' },
            { id: 'e2', type: 'QR', source: 'database', csv_column: '', exemplo: 'ABC123' }
        ]
    };
    const r = B.numeracaoResolvida(nova, BANCO, { 'el:e1': 'NOME', 'el:e2': '05/09' });
    ok(r.elements[0].csv_column === 'NOME' && r.elements[1].csv_column === '05/09',
        'a peca nova resolve cada elemento pela sua chave', r.elements.map(e => e.csv_column));
    ok(nova.elements[0].csv_column === '' && nova.elements[0].exemplo === 'MARIA',
        'a peca do catalogo nao e tocada — o exemplo fica nela');
    ok(r.elements[0].exemplo === 'MARIA',
        'o exemplo viaja na copia resolvida, para a previa usar quando faltar dado');
})();

(function elementosSemColunaNoBanco() {
    const nova = { elements: [
        { id: 'e1', type: 'TEXT', source: 'database', csv_column: '' },
        { id: 'e2', type: 'QR', source: 'database', csv_column: '' },
        { id: 'e3', type: 'FIXED', fixed_value: 'X' }
    ] };
    ok(B.elementosSemColunaNoBanco(nova, BANCO, null).length === 2,
        'sem apontamento, os dois elementos de banco estao soltos — o fixo nao conta');
    ok(B.elementosSemColunaNoBanco(nova, BANCO, { 'el:e1': 'NOME' }).length === 1,
        'apontado um, sobra um');
    ok(B.elementosSemColunaNoBanco(nova, BANCO, { 'el:e1': 'NOME', 'el:e2': 'NAO_EXISTE' }).length === 1,
        'apontar para coluna que o banco nao tem continua solto');
    ok(B.elementosSemColunaNoBanco(nova, null, null).length === 0,
        'sem banco nao ha o que cobrar — o caminho legado tem os avisos dele');
    ok(B.elementosSemColunaNoBanco(PECA, BANCO, { CODIGO: '05/09' }).length === 0,
        'peca legada mapeada por nome nao esta solta');
})();

(function mapaLimpoComChavesDeElemento() {
    const els = [{ id: 'e1', source: 'database', csv_column: 'CODIGO' },
                 { id: 'e2', source: 'database', csv_column: '' }];
    const limpo = B.mapaLimpo({ 'el:e1': 'CODIGO', 'el:e2': '05/09', 'el:sumiu': 'X' }, [], els);
    ok(limpo && limpo['el:e2'] === '05/09' && Object.keys(limpo).length === 1,
        'guarda so o apontamento de verdade: igual ao legado dispensa, elemento que sumiu descarta', limpo);
    ok(B.mapaLimpo({ 'el:e2': '' }, [], els) === null,
        'apontamento vazio nao vira mapa');
})();

(function mapaAposRenomearComChavesDeElemento() {
    const els = [{ id: 'e2', source: 'database', csv_column: '' }];
    const r = B.mapaAposRenomear({ 'el:e2': '05/09' }, [], { '05/09': '05-09' }, els);
    ok(r && r['el:e2'] === '05-09',
        'renomear a coluna do banco arrasta o apontamento por elemento junto', r);
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
