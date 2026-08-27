// A numeracao exclusiva do cliente sai AMARELA no seletor de Numeracao do
// modelo, na lista de arte. As demais continuam brancas.
//
// Pedido do usuario em 27/08/2026. O dropdown ja misturava as duas familias —
// o filtro do `renderAmostrasOSItens` deixa passar o catalogo geral E as
// numeracoes com `Cli_Num` deste cliente — e nada as distinguia a nao ser o
// nome. Numa lista de dezenas de itens, e escolher no escuro.
//
// Roda em node, sem navegador: `node tests/numeracao_amarela_do_cliente_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui — nao copiadas. Copia
// continua passando depois de o original mudar, que e o defeito que este
// projeto ja produziu tres vezes com o clone script.js -> pedido.js.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrair(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const NOMES = ['numeracaoEhDoCliente', 'opcaoDeNumeracaoDoModelo', 'pintarSelectDeNumeracao'];
const api = new Function('window',
    NOMES.map(extrair).join('\n') + '\nreturn { ' + NOMES.join(', ') + ' };'
)({});

const { numeracaoEhDoCliente, opcaoDeNumeracaoDoModelo, pintarSelectDeNumeracao } = api;

// ─── Quem e do cliente ───────────────────────────────────────────────────────

(function aExclusivaDesteClienteEDoCliente() {
    ok(numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, 27401), 'mesmo cliente');
    // O `Cli_Num` chega numero do banco; o `id_cliente` da ordem chega ora
    // numero, ora texto. Comparar sem normalizar deixaria a cor sumir sem
    // motivo aparente, dependendo de por onde o pedido foi carregado.
    ok(numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, '27401'), 'numero contra texto');
    ok(numeracaoEhDoCliente({ id: 'a', Cli_Num: '27401' }, 27401), 'texto contra numero');
    ok(numeracaoEhDoCliente({ id: 'a', Cli_Num: ' 27401 ' }, '27401'), 'com espaco em volta');
})();

(function oRestoNaoE() {
    ok(!numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, 99999),
        'exclusiva de OUTRO cliente nao pinta — e o filtro do card ja a esconde');
    ok(!numeracaoEhDoCliente({ id: 'a' }, 27401), 'numeracao do catalogo geral fica branca');
    ok(!numeracaoEhDoCliente({ id: 'a', Cli_Num: null }, 27401), 'Cli_Num nulo fica branca');
    ok(!numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, null), 'pedido sem cliente nao pinta nada');
    ok(!numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, ''), 'nem com cliente vazio');
    ok(!numeracaoEhDoCliente({ id: 'a', Cli_Num: 27401 }, undefined), 'nem com cliente ausente');
    ok(!numeracaoEhDoCliente(null, 27401), 'e numeracao nula nao estoura');
})();

(function aExclusivaDoModeloTambemEAmarela() {
    // A pergunta aqui e mais larga que a de `numeracaoEhCompartilhadaDoCliente`:
    // interessa se a numeracao PERTENCE ao cliente, e nao se ela ja foi batizada
    // e passou a valer para varios modelos dele. As duas familias sao amarelas.
    const soDoModelo = { id: 'a', Cli_Num: 27401, os_item_id: '1000563', name: '1000563' };
    const compartilhada = { id: 'b', Cli_Num: 27401, os_item_id: '1000563', name: 'CAMAROTE' };
    ok(numeracaoEhDoCliente(soDoModelo, 27401), 'a que ainda tem o nome do modelo');
    ok(numeracaoEhDoCliente(compartilhada, 27401), 'e a que ja foi batizada');
})();

// ─── A opcao que vai para o HTML ─────────────────────────────────────────────

(function aOpcaoDaExclusivaVemMarcada() {
    const html = opcaoDeNumeracaoDoModelo({ id: 'n1', name: 'CAMAROTE' }, 27401, false);
    ok(!/num-opt-exclusiva/.test(html), 'sem Cli_Num, nada de amarelo', html);

    const amarela = opcaoDeNumeracaoDoModelo({ id: 'n1', name: 'CAMAROTE', Cli_Num: 27401 }, 27401, false);
    ok(/class="num-opt-exclusiva"/.test(amarela), 'a exclusiva leva a classe', amarela);
    // O `data-exclusiva` nao e enfeite: e por ele que a caixa FECHADA descobre,
    // depois, se o que esta escolhido e do cliente. A caixa fechada mostra o
    // texto com a cor do proprio <select>, e nao a da opcao.
    ok(/data-exclusiva="1"/.test(amarela), 'e leva a marca que a caixa fechada le', amarela);
})();

(function aOpcaoContinuaFazendoOQueFaziaAntes() {
    const html = opcaoDeNumeracaoDoModelo({ id: 'n1', name: 'CAMAROTE', Cli_Num: 27401 }, 27401, true);
    ok(/value="n1"/.test(html), 'o value continua sendo o id', html);
    ok(/>CAMAROTE</.test(html), 'o texto continua sendo o nome', html);
    ok(/ selected/.test(html), 'e a selecionada continua vindo marcada', html);
    ok(!/ selected/.test(opcaoDeNumeracaoDoModelo({ id: 'n1', name: 'X' }, null, false)),
        'e a nao selecionada, nao');
})();

// ─── A caixa fechada ─────────────────────────────────────────────────────────

(function aCaixaFechadaSegueAOpcaoEscolhida() {
    // <select> de mentira, com o pouco que a funcao usa.
    const classes = new Set();
    function fakeSelect(exclusiva) {
        return {
            selectedIndex: 0,
            options: [{ getAttribute: k => (k === 'data-exclusiva' && exclusiva ? '1' : null) }],
            classList: {
                toggle: (nome, liga) => { if (liga) classes.add(nome); else classes.delete(nome); },
            },
        };
    }

    pintarSelectDeNumeracao(fakeSelect(true));
    ok(classes.has('num-select-exclusiva'), 'escolher a exclusiva pinta a caixa fechada');

    pintarSelectDeNumeracao(fakeSelect(false));
    ok(!classes.has('num-select-exclusiva'), 'e trocar por uma comum despinta');

    // O "-- Selecione uma Numeracao --" e uma <option> sem a marca; o modelo
    // sem numeracao nao pode ficar amarelo.
    classes.add('num-select-exclusiva');
    pintarSelectDeNumeracao({ selectedIndex: -1, options: [], classList: {
        toggle: (nome, liga) => { if (liga) classes.add(nome); else classes.delete(nome); } } });
    ok(!classes.has('num-select-exclusiva'), 'sem nada escolhido, branca');

    pintarSelectDeNumeracao(null);
    pintarSelectDeNumeracao({});
    ok(true, 'e select ausente ou sem options nao estoura');
})();

// ─── Os dois lugares que montam o seletor ────────────────────────────────────

(function osDoisMontadoresUsamAMesmaRegra() {
    // Sao duas listas de <option> escritas na mao: o desenho do card, em
    // `renderAmostrasOSItens`, e o refiltro por formato, em `onItemCorSelect`.
    // Pintar so uma faria a cor SUMIR assim que o operador trocasse a Cor —
    // que e justamente quando ele esta escolhendo a numeracao.
    const usos = (SCRIPT.match(/opcaoDeNumeracaoDoModelo\(n, idCliente/g) || []).length;
    ok(usos >= 2, 'os dois montadores do seletor pintam pela mesma funcao', { usos });

    ok(/const numOpts = filteredNumeracoes\.map\(n =>\s*opcaoDeNumeracaoDoModelo/.test(SCRIPT),
        'o desenho do card usa a funcao');
    ok(/filteredNums\.map\(n => opcaoDeNumeracaoDoModelo\(n, idCliente, false\)\)/.test(SCRIPT),
        'e o refiltro por Cor tambem');
})();

(function aCaixaFechadaEPintadaNosTresMomentos() {
    ok(/pintarSelectsDeNumeracao\(container\);/.test(SCRIPT),
        'ao desenhar o pedido inteiro');
    ok(/numSelect\.value = '';\s*\}\s*pintarSelectDeNumeracao\(numSelect\);/.test(SCRIPT),
        'ao trocar a Cor, que reconstroi a lista');
    ok(/function onItemNumSelect\([^)]*\) \{[\s\S]{0,200}pintarSelectDeNumeracao\(numSelect\);/.test(SCRIPT),
        'e ao trocar a propria numeracao');
})();

// ─── A cor ───────────────────────────────────────────────────────────────────

(function asDuasRegrasDeCorExistem() {
    ok(/\.num-opt-exclusiva\s*\{[^}]*color:\s*var\(--amber\)/.test(CSS),
        'a opcao amarela tem regra no style.css');
    ok(/select\.num-select-exclusiva\s*\{[^}]*color:\s*var\(--amber\)/.test(CSS),
        'e a caixa fechada tambem');
    ok(/--amber:\s*#f59e0b/.test(CSS),
        'e o amarelo e o mesmo --amber do resto do painel, e nao um tom novo');

    // Medido no navegador em 27/08/2026: sem esta regra, a <option> comum
    // HERDA a cor do <select>, e dentro de uma caixa amarela ela saia amarela
    // tambem. A regra do usuario e que so as exclusivas do cliente sejam
    // amarelas — "as demais numeracoes permanecem em branco".
    ok(/select\.num-select-exclusiva option\s*\{[^}]*color:\s*var\(--text\)/.test(CSS),
        'a opcao comum diz o branco dela, mesmo dentro da caixa amarela');
    ok(/select\.num-select-exclusiva option\.num-opt-exclusiva\s*\{[^}]*color:\s*var\(--amber\)/.test(CSS),
        'e a exclusiva volta a ser amarela por cima dessa regra');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
