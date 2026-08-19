// Lista de Arte: pedido liberado para producao so aparece no card "Pedidos
// Concluidos".
//
// Roda em node, sem navegador: `node tests/lista_arte_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// A funcao e LIDA do `script.js` e avaliada aqui — nao copiada. Uma copia
// continuaria passando depois de o original mudar, que e exatamente o defeito
// que este projeto ja produziu tres vezes com o clone script.js -> pedido.js.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

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

function extrairConst(nome) {
    const i = SCRIPT.indexOf('\nconst ' + nome + ' = [');
    if (i < 0) throw new Error('nao achei a lista ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('];', i);
    if (fim < 0) throw new Error('nao achei o fim da lista ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const { pedidoSaiuDaArte } = new Function(
    extrairConst('SINAIS_SAIU_DA_ARTE') + '\n' + extrair('pedidoSaiuDaArte')
    + '\nreturn { pedidoSaiuDaArte };')();

// ─── Quem saiu da arte ───────────────────────────────────────────────────────

(function oStatusInternoDeProducaoTiraDaArte() {
    // E o valor que liberarParaProducao() grava. E o caso do pedido do dia a dia.
    ok(pedidoSaiuDaArte({ status_interno: 'EM PRODUCAO' }), 'EM PRODUCAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EM PRODUÇÃO' }), 'com cedilha tambem');
    ok(pedidoSaiuDaArte({ status_interno: 'em producao' }), 'em caixa baixa tambem');
    ok(pedidoSaiuDaArte({ status_interno: '  EM PRODUCAO  ' }), 'com espaco em volta tambem');
})();

(function osOutrosSinaisDeQueSaiuDaArte() {
    ok(pedidoSaiuDaArte({ status_interno: 'EM IMPRESSAO' }), 'EM IMPRESSAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'FINALIZADA' }), 'FINALIZADA sai da arte');
    // liberarParaProducao() grava nos dois campos; ler so um deixaria passar o
    // pedido que veio do Vibecode com o sinal no `status`.
    ok(pedidoSaiuDaArte({ status: 'EM PRODUCAO' }), 'o sinal tambem vale no campo status');
})();

(function quemContinuaNaArte() {
    ok(!pedidoSaiuDaArte({ status: 'EM ARTE' }), 'pedido em arte fica');
    ok(!pedidoSaiuDaArte({ status: 'APROVADA', status_interno: '' }), 'pedido aprovado fica');
    ok(!pedidoSaiuDaArte({ status: 'AGUARD. APROVAÇÃO' }), 'pedido em aprovacao fica');
    ok(!pedidoSaiuDaArte({}), 'pedido sem status nenhum fica');
    ok(!pedidoSaiuDaArte(null), 'e pedido nulo nao quebra a lista');
})();

// ─── Onde a regra e aplicada dentro do renderOrdens ──────────────────────────

(function saiuDaArteEAPrimeiraPergunta() {
    // Se esta pergunta nao vier antes das outras tres, o pedido liberado volta a
    // ser contado em "Em Arte"/"Em Aprovacao"/"Aprovados" e reaparece na tabela.
    ok(/if \(pedidoSaiuDaArte\(os\)\) \{[\s\S]{0,400}?ordensConcluidosArte\.push\(os\);[\s\S]{0,200}?\} else if \(isTotalmenteAprovado\) \{/.test(SCRIPT),
        'o pedido que saiu da arte e separado antes de entrar em qualquer fila');
})();

(function oCardContaOMesmoBalde() {
    // Card e filas tem de sair do mesmo lugar: dois criterios parecidos que
    // divergem deixariam pedido fora de todos os cards ao mesmo tempo.
    ok(/const totalConcluidosArte = ordensConcluidosArte\.length;/.test(SCRIPT),
        'o card "Pedidos Concluidos" conta o balde que a classificacao encheu');
    ok(/statPedidosConcluidosArteEl\.textContent = totalConcluidosArte/.test(SCRIPT),
        'e esse total e o que vai para a tela');
})();

(function oFiltroDeStatusNaoRessuscita() {
    // Filtrar por status varria state.ordens inteiro e trazia de volta, na
    // tabela, justamente os pedidos que ja tinham saido da arte.
    ok(!/baseOrdensArte = state\.ordens;/.test(SCRIPT),
        'o filtro de status nao varre state.ordens');
    ok(/baseOrdensArte = \[\.\.\.ordensFilaArte, \.\.\.ordensAprovacao, \.\.\.ordensAprovados\];/.test(SCRIPT),
        'ele varre so quem continua na arte');
})();

// ─── Os cinco cards abrem a lista deles ──────────────────────────────────────
//
// Usuario, 19/08/2026: "ao clicar em qualquer um dos cards, deve atualizar a
// pagina conforme os status de cada card". O de Concluidos era o unico mudo --
// e, desde que os pedidos em producao passaram a contar SO nele, era tambem o
// unico caminho para ve-los nesta pagina. Card que conta e nao abre vira beco.

(function todosOsCincoCardsAbremAFilaDeles() {
    const CARDS = [
        ['card-stat-pedidos-todos', 'todos'],
        ['card-stat-pedidos-fila', 'fila'],
        ['card-stat-pedidos-aprovacao', 'aprovacao'],
        ['card-stat-pedidos-aprovados', 'aprovados'],
        ['card-stat-pedidos-concluidos', 'concluidos'],
    ];
    CARDS.forEach(([id, tipo]) => {
        const i = INDEX.indexOf('id="' + id + '"');
        ok(i > 0, 'o card ' + id + ' existe');
        // A tag inteira: `class` vem ANTES do `id` no markup, e uma fatia que
        // comecasse no id perderia justamente o `clickable-card`.
        const linha = INDEX.slice(INDEX.lastIndexOf('<div', i), INDEX.indexOf('>', i));
        ok(linha.includes(`setFiltroFilaArte('${tipo}')`), id + ' filtra por ' + tipo, linha);
        ok(linha.includes('clickable-card'), id + ' se apresenta como clicavel');
        ok(linha.includes('title="'), id + ' diz em texto o que o clique faz');
    });
})();

(function oCardDeConcluidosAbreOBaldeDeConcluidos() {
    ok(/activeFilaTipo === 'concluidos'\)\s*\{\s*baseOrdensArte = ordensConcluidosArte;/.test(SCRIPT),
        'a fila de Concluidos e o balde que o card conta');
    ok(/Pedidos Conclu[ií]dos`/.test(SCRIPT), 'e a tabela muda de titulo');
    ok(/cardConcluidosEl\.style\.border/.test(SCRIPT), 'e o card escolhido se destaca');
    ok(/\[cardTodosEl, cardFilaEl, cardAprovacaoEl, cardAprovadosEl, cardConcluidosEl\]/.test(SCRIPT),
        'e ele volta ao normal quando outro card e escolhido');
})();

(function aCasaVaziaDeConcluidosNaoFalaDeArte() {
    // "Nenhum pedido em fase de arte" debaixo do card de Concluidos diria a
    // coisa errada sobre a coisa certa: eles justamente nao estao mais em arte.
    ok(/Nenhum pedido saiu da arte para a produ/.test(SCRIPT),
        'a casa vazia de Concluidos tem frase propria');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
