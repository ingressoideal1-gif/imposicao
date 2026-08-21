// Os cards de setor SOMAM (21/08/2026).
//
// Pedido do usuario: "tanto no painel de Acabamento quanto no Painel de
// Producao, os cards dos Setores, permitir selecionar mais de 1 card por vez,
// listando os pedidos dos cards somados".
//
// Este arquivo cobre o lado do PAINEL DE PRODUCAO -- as funcoes sao recortadas
// do script.js e executadas, nada aqui e copia da regra. O lado do Acabamento
// esta no `acabamento_harness.js`, que ja monta a tela inteira.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

// ─── Um DOM do tamanho dos cards, e nada mais ────────────────────────────────

function botao(setor) {
    const classes = new Set();
    return {
        _setor: setor,
        getAttribute: nome => (nome === 'data-setor' ? setor : null),
        classList: {
            add: c => classes.add(c),
            remove: c => classes.delete(c),
            contains: c => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        get aceso() { return classes.has('active'); },
    };
}

function montar() {
    const cards = ['FLEXO', 'PVC', 'TEXTIL', 'LASER'].map(botao);
    const todos = botao('');
    todos.classList.add('active');

    const documento = {
        getElementById: id => (id === 'btn-filtro-todos-setores' ? todos : null),
        querySelectorAll: () => [],
    };
    const container = {
        querySelectorAll: () => cards,
    };
    documento.getElementById = id => {
        if (id === 'btn-filtro-todos-setores') return todos;
        if (id === 'filter-container-setor') return container;
        return null;
    };

    const state = { filtroSetores: [] };
    let renderizou = 0;

    const fonte = [
        recortar('pedidoBateNosSetores'),
        recortar('setFiltroSetor'),
        recortar('pintarCardsDeSetor'),
        'return { pedidoBateNosSetores, setFiltroSetor, pintarCardsDeSetor };',
    ].join('\n');

    const api = new Function('state', 'document', 'renderOrdens', fonte)(
        state, documento, () => { renderizou++; });

    return {
        api, state, cards, todos,
        aceso: () => cards.filter(c => c.aceso).map(c => c._setor),
        renderizou: () => renderizou,
    };
}

// ─── 1. A regra da soma ──────────────────────────────────────────────────────

(function somaEnaoIntersecao() {
    const { api } = montar();
    const bate = api.pedidoBateNosSetores;

    const flexo = [{ setor: 'FLEXO' }];
    const pvc = [{ setor: 'PVC' }];
    const misto = [{ setor: 'FLEXO' }, { setor: 'LASER' }];

    ok(bate(flexo, []) === true, 'sem setor escolhido, todo pedido entra');
    ok(bate(flexo, null) === true, 'nulo tambem vale como "todos"');
    ok(bate([], ['FLEXO']) === false, 'pedido sem item nenhum nao entra num recorte');

    ok(bate(flexo, ['FLEXO']) === true, 'um setor escolhido, o pedido daquele setor entra');
    ok(bate(pvc, ['FLEXO']) === false, 'e o de outro setor fica fora');

    // O que o usuario pediu: dois cards acesos listam os dois conjuntos SOMADOS.
    ok(bate(flexo, ['FLEXO', 'PVC']) === true, 'com Flexo e PVC acesos, o pedido de Flexo entra');
    ok(bate(pvc, ['FLEXO', 'PVC']) === true, 'e o de PVC tambem');
    ok(bate([{ setor: 'TEXTIL' }], ['FLEXO', 'PVC']) === false, 'e o de Textil continua fora');

    // SOMA, e nao intersecao: nao se exige o pedido ter item nos dois.
    ok(bate(misto, ['FLEXO', 'PVC']) === true,
       'pedido com Flexo e Laser entra pelo Flexo, mesmo sem ter PVC');

    // O acento e a caixa nao decidem nada.
    ok(bate([{ setor: 'Têxtil' }], ['TEXTIL']) === true, 'o acento nao atrapalha');
    ok(bate([{ setor: 'flexo' }], ['FLEXO']) === true, 'a caixa das letras tambem nao');
    ok(bate([{ setor: '' }], ['FLEXO']) === false, 'item sem setor nao entra em recorte nenhum');
    ok(bate([{}], ['FLEXO']) === false, 'item sem a chave setor tambem nao');
})();

// ─── 2. O clique liga, e o segundo clique desliga ────────────────────────────

(function oCliqueEmDoisCardsAcendeOsDois() {
    const amb = montar();

    amb.api.setFiltroSetor('FLEXO');
    ok(amb.state.filtroSetores.join(',') === 'FLEXO', 'o primeiro clique escolhe o setor');
    ok(amb.aceso().join(',') === 'FLEXO', 'e acende o card');
    ok(amb.todos.aceso === false, 'o "Todos os Setores" apaga');

    amb.api.setFiltroSetor('PVC');
    ok(amb.state.filtroSetores.join(',') === 'FLEXO,PVC',
       'o segundo clique SOMA, e nao troca', amb.state.filtroSetores.join(','));
    ok(amb.aceso().join(',') === 'FLEXO,PVC', 'os dois cards ficam acesos');

    // Clicar de novo num card aceso e o jeito de tirar aquele setor.
    amb.api.setFiltroSetor('FLEXO');
    ok(amb.state.filtroSetores.join(',') === 'PVC', 'clicar de novo tira aquele setor');
    ok(amb.aceso().join(',') === 'PVC', 'e apaga so o card dele');
    ok(amb.todos.aceso === false, 'com um setor de pe, o "Todos" continua apagado');

    // Tirar o ultimo devolve o estado de "todos".
    amb.api.setFiltroSetor('PVC');
    ok(amb.state.filtroSetores.length === 0, 'tirar o ultimo esvazia a escolha');
    ok(amb.todos.aceso === true, 'e o "Todos os Setores" acende sozinho');

    ok(amb.renderizou() === 4, 'cada um dos quatro cliques redesenhou a lista uma vez',
       String(amb.renderizou()));
})();

(function oTodosOsSetoresLimpaTudo() {
    const amb = montar();
    amb.api.setFiltroSetor('FLEXO');
    amb.api.setFiltroSetor('PVC');
    amb.api.setFiltroSetor('LASER');
    ok(amb.aceso().length === 3, 'tres cards acesos');

    amb.api.setFiltroSetor('');
    ok(amb.state.filtroSetores.length === 0, 'o "Todos os Setores" limpa a escolha inteira');
    ok(amb.aceso().length === 0, 'e apaga todos os cards de uma vez');
    ok(amb.todos.aceso === true, 'acendendo o proprio "Todos"');
})();

(function estadoTortoNaoDerruba() {
    // `state.filtroSetores` virou lista em 21/08/2026. Uma sessao aberta com a
    // versao anterior em cache pode ter o valor antigo -- texto -- na memoria.
    const amb = montar();
    amb.state.filtroSetores = 'FLEXO';        // o formato velho
    amb.api.setFiltroSetor('PVC');
    ok(Array.isArray(amb.state.filtroSetores), 'o formato antigo e trocado por lista');
    ok(amb.state.filtroSetores.join(',') === 'PVC', 'e o clique vale');
})();

// ─── 3. O HTML dos cards ─────────────────────────────────────────────────────

(function cadaCardDizDeQuemEle() {
    // O `pintarCardsDeSetor` le o `data-setor`. Sem o atributo no HTML, nenhum
    // card acenderia -- e o filtro funcionaria sem nada aceso na tela, que e o
    // pior dos dois mundos.
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

    [
        ['filter-container-setor', "setFiltroSetor('"],
        ['filter-container-setor-acab', "AcabamentoPainel.setFiltroSetor('"],
    ].forEach(([id, chamada]) => {
        const i = html.indexOf('<div class="prod-sectors-grid" id="' + id + '">');
        ok(i > 0, 'a grade ' + id + ' existe');
        const grade = html.slice(i, html.indexOf('</div>', i));
        ['FLEXO', 'PVC', 'TEXTIL', 'LASER'].forEach(s => {
            ok(grade.indexOf('data-setor="' + s + '"') !== -1,
               'o card ' + s + ' de ' + id + ' diz de quem ele e');
            ok(grade.indexOf(chamada + s + "')") !== -1,
               'e continua chamando a funcao certa');
        });
    });

    // A dica na tela: a soma nao se descobre olhando.
    ok((html.match(/prod-sectors-hint/g) || []).length === 2,
       'os dois paineis dizem na tela que os cards somam');

    const css = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
    ok(css.indexOf('.prod-sectors-hint') !== -1, 'a dica tem estilo');

    // O producao.html usa a MESMA funcao do script.js.
    const prod = fs.readFileSync(path.join(RAIZ, 'frontend', 'producao.html'), 'utf8');
    ['FLEXO', 'PVC', 'TEXTIL', 'LASER'].forEach(s => {
        ok(prod.indexOf('data-setor="' + s + '"') !== -1,
           'o card ' + s + ' do producao.html tambem diz de quem ele e');
    });
})();

(function ninguemMaisLeOFiltroAntigo() {
    // `state.filtroSetor` (singular) deixou de existir. Se alguem voltar a le-lo,
    // vai encontrar `undefined` e o recorte some sem avisar.
    const sobrou = SCRIPT.split('\n')
        .map((l, n) => [n + 1, l])
        .filter(([, l]) => /state\.filtroSetor\b/.test(l));
    ok(sobrou.length === 0, 'ninguem le mais o state.filtroSetor no singular',
       sobrou.map(([n, l]) => n + ': ' + l.trim()).join(' | '));
})();

// ─── Resultado ───────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes dos setores somados passaram.');
