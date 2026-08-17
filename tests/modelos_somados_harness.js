// A parte de tela de somar modelos numa imposição só: a conta das folhas que a
// barra mostra, e quem pode entrar na mesma folha.
//
// Roda em node, sem navegador: `node tests/modelos_somados_harness.js`.
// Sai com código 1 se algum caso falhar.
//
// As funções são LIDAS do `script.js` e avaliadas aqui, com um `state` de
// mentira — não copiadas. Uma cópia continuaria passando depois de o original
// mudar, que é justamente o defeito que a clonagem `script.js` → `pedido.js` já
// produziu duas vezes neste projeto.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

// ─── Carregar as funções de verdade ───────────────────────────────────────────

global.window = global.window || {};
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
    head: { appendChild() {} },
    body: { appendChild() {} }
};
require(path.join(RAIZ, 'frontend', 'csv-editor.js'));

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'fatiaCsvDoItem',
               'quantidadeDoModelo', 'contaDaSoma', 'porQueNaoCombina'];
const state = { numeracoes: [], formatos: [] };
const api = new Function('state', 'window',
    NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
    + '\nreturn { quantidadeDoModelo, contaDaSoma, porQueNaoCombina };')(state, global.window);

// ─── O cenário do pedido 20495 ────────────────────────────────────────────────

const CREDENCIAL = { id: 'f1', name: 'Credencial 90x140', cols: 2, rows: 2 };  // 4 por folha
state.formatos.push(CREDENCIAL);

function modelo(nome, qtd, extra) {
    return Object.assign({
        id: 'm-' + nome, nome_modelo: nome, quantidade: qtd,
        formato_id: 'f1', saida_id: 's1', padrao: 'Credencial PVC',
        verso_tipo: 'Frente', modo_pdf: false
    }, extra || {});
}

const PAISES = [
    ['Bulgaria', 37], ['Chile', 29], ['Colombia', 24], ['Eslovaquia', 30],
    ['Espanha', 29], ['Macedonia', 28], ['Paraguay', 36], ['Tchequia', 25],
    ['Credencial', 12]
];

(function aContaDoPedidoReal() {
    const itens = PAISES.map(p => modelo(p[0], p[1]));
    const c = api.contaDaSoma(itens);

    ok(!!c, 'a conta sai com formato conhecido');
    ok(c.poses === 4, 'sao 4 celulas por folha', c && c.poses);
    ok(c.itens === 250, 'os nove modelos somam 250 itens', c && c.itens);
    ok(c.separado === 66, 'separados gastam 66 folhas', c && c.separado);
    ok(c.somado === 63, 'somados gastam 63 folhas (250 / 4, arredondado)', c && c.somado);
    ok(c.economia === 3, 'a economia e de 3 folhas', c && c.economia);
})();

(function soOsOitoPaises() {
    // O numero que o usuario citou: 238 / 4.
    const itens = PAISES.slice(0, 8).map(p => modelo(p[0], p[1]));
    const c = api.contaDaSoma(itens);
    ok(c.itens === 238, 'os oito paises somam 238 itens', c.itens);
    ok(c.somado === 60, '238 / 4 = 60 folhas', c.somado);
    ok(c.separado === 63, 'separados seriam 63', c.separado);
})();

(function divisaoExataNaoEconomizaNada() {
    const itens = [modelo('A', 8), modelo('B', 12), modelo('C', 4)];
    const c = api.contaDaSoma(itens);
    ok(c.separado === c.somado && c.economia === 0,
        'quando todo modelo enche a folha, somar nao muda nada', c);
})();

(function umModeloSoNaoTemOQueSomar() {
    ok(api.contaDaSoma([modelo('A', 37)]) === null, 'com um modelo so nao ha conta');
    ok(api.contaDaSoma([]) === null, 'sem modelo nenhum nao ha conta');
})();

(function semFormatoNaoInventaNumero() {
    const itens = [modelo('A', 10, { formato_id: 'nao-existe' }), modelo('B', 10, { formato_id: 'nao-existe' })];
    ok(api.contaDaSoma(itens) === null,
        'sem formato a conta e nula — melhor nao mostrar numero do que mostrar um errado');
})();

(function aQuantidadeSaiDaFatiaQuandoHaBanco() {
    const linhas = [];
    for (let i = 1; i <= 238; i++) linhas.push({ __id: i, Nome: 'P' + i });
    state.numeracoes.push({ id: 'n1', csv_data: linhas });

    const bulgaria = modelo('Bulgaria', 999);          // quantidade digitada mente
    bulgaria.amostra_num_id = 'n1';
    bulgaria.csv_selecao = { tipo: 'linhas', ids: ['1-37'] };

    ok(api.quantidadeDoModelo(bulgaria) === 37,
        'com banco de dados, vale o tamanho da fatia e nao a quantidade digitada',
        api.quantidadeDoModelo(bulgaria));

    const semBanco = modelo('Solto', 20);
    ok(api.quantidadeDoModelo(semBanco) === 20, 'sem banco vale a quantidade');
})();

// ─── Quem pode dividir a folha ────────────────────────────────────────────────

(function oQueImpedeCombinar() {
    const base = modelo('A', 10);

    ok(api.porQueNaoCombina(base, modelo('B', 10)) === null,
        'dois modelos iguais em tudo combinam');

    ok(/cor/.test(api.porQueNaoCombina(base, modelo('B', 10, { padrao: 'Outra Cor' })) || ''),
        'cor diferente impede');
    ok(/formato/.test(api.porQueNaoCombina(base, modelo('B', 10, { formato_id: 'f2' })) || ''),
        'formato diferente impede');
    ok(/sa/.test(api.porQueNaoCombina(base, modelo('B', 10, { saida_id: 's2' })) || ''),
        'saida diferente impede');
    ok(/frente/.test(api.porQueNaoCombina(base, modelo('B', 10, { verso_tipo: 'FxVerso' })) || ''),
        'frente-e-verso com so-frente impede');
    ok(/Pdf/.test(api.porQueNaoCombina(base, modelo('B', 10, { modo_pdf: true })) || ''),
        'modo Pdf Paginado impede');

    // "SÓ FRENTE" e "Frente" sao a mesma coisa: os dois modelos do 20495 usam
    // as duas grafias e precisam continuar combinando.
    ok(api.porQueNaoCombina(base, modelo('B', 10, { verso_tipo: 'SÓ FRENTE' })) === null,
        '"SÓ FRENTE" e "Frente" combinam entre si');
})();

// ─── As duas telas decidem o esquema do mesmo jeito ───────────────────────────

(function asDuasTelasLeemOMesmoModo() {
    ok(/schema = \(modoSomaFolha\(\) === 'aproveitar'\) \? 'multi_artes' : 'cut_stack'/.test(SCRIPT),
        'a tela Imposicao escolhe o esquema pelo modo');
    ok(/modoSomaFolha\(\) === 'aproveitar'\)?\s*\n?\s*\? 'multi_artes'/.test(PEDIDO)
        || /modoSomaFolha\(\) === 'aproveitar'/.test(PEDIDO),
        'a tela Pedido escolhe o esquema pelo modo');

    // O padrao nao pode ter mudado: sem tocar no seletor, tudo se comporta como
    // na v630.
    ok(/state\.modoSomaFolha = 'separado'/.test(SCRIPT),
        'o padrao continua sendo cada modelo em folha propria');
    ok(/return state\.modoSomaFolha === 'aproveitar' \? 'aproveitar' : 'separado'/.test(SCRIPT),
        'qualquer valor estranho cai no padrao');
})();

(function aTelaPedidoMandaAArteJunto() {
    // O `payloadMultiArtes` le `arte.pdf_url`; o objeto do runPedImposition nao
    // tinha nenhum dos tres, e a folha saia com numeracao e sem arte.
    ok(/pdf_url: itemArteUrl/.test(PEDIDO), 'a arte de cada modelo leva o pdf_url');
    ok(/pdf_verso_url: itemArteVersoUrl/.test(PEDIDO), 'e o verso');
    ok(/pdf_name: itemPdfName/.test(PEDIDO), 'e o nome do arquivo');
})();

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
