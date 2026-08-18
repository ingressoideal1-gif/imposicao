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
               'quantidadeDoModelo', 'contaDaSoma', 'porQueNaoCombina',
               'itemAtivoDoPedido', 'itensDaImposicao', 'modoSomaFolha',
               'imprimeNumeroDoModelo', 'modoDeImpressaoDoModelo', 'blocagemDoModelo',
               'modoDeImpressaoDaSelecao', 'blocagemDaSelecao',
               'esquemaDaSelecaoCombinada', 'modoCutStackDaSelecao',
               'nomeDosModelosCombinados', 'alvosDaImpressao'];
const state = { numeracoes: [], formatos: [], osItens: {}, selectedOSItems: [] };
const api = new Function('state', 'window',
    NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
    + '\nreturn { ' + NOMES.join(', ') + ' };')(state, global.window);

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
    // As duas telas chamam a MESMA funcao em vez de repetirem a conta. Repetir
    // foi o que fez os dois clones divergirem tres vezes neste projeto.
    ok(/schema = esquemaDaSelecaoCombinada\(\)/.test(SCRIPT),
        'a tela Imposicao pergunta o esquema a esquemaDaSelecaoCombinada()');
    ok(/esquemaDaSelecaoCombinada\(\)/.test(PEDIDO),
        'a tela Pedido pergunta o esquema a esquemaDaSelecaoCombinada()');
    ok(/modoCutStackDaSelecao\(\)/.test(SCRIPT) && /modoCutStackDaSelecao\(\)/.test(PEDIDO),
        'as duas telas tiram o cut_stack_mode da mesma funcao');
    ok(/blocagemDaSelecao\(\)\.folhas/.test(SCRIPT) && /blocagemDaSelecao\(\)\.folhas/.test(PEDIDO),
        'as duas telas tiram as folhas por bloco da mesma funcao');

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

// ─── A seleção pertence a UM pedido só ───────────────────────────────────────
//
// Relatado em 18/08/2026: marcar 1000277 e 1000278 imprimia só o 1000277. Os
// dois são de pedidos DIFERENTES — Tchéquia é do 20495 e VIP é do 20508.
//
// A fila só desenha o pedido aberto, então uma seleção de outro pedido é
// invisível: o operador não vê e não consegue desmarcar. E o
// `state.selectedOSItems` só era limpo em `abrirImposicaoDoPedido`, do
// script.js; abrir um pedido pela aba Pedido não limpava nada.

const apiSel = new Function('state', 'window',
    extrairFuncao(SCRIPT, 'problemaNaSelecao') + '\nreturn { problemaNaSelecao };');

(function selecaoQueCruzaPedidos() {
    const st = {
        osItens: {
            'os-20495': [{ id: '1000277', nome_modelo: 'Tchequia' }],
            'os-20508': [{ id: '1000278', nome_modelo: 'VIP' }],
        },
        selectedOSItems: [],
    };
    const api = apiSel(st, global.window);

    st.selectedOSItems = [{ itemId: '1000277', osId: 'os-20495' }];
    ok(api.problemaNaSelecao() === null, 'um modelo so nunca e problema');

    st.selectedOSItems = [
        { itemId: '1000277', osId: 'os-20495' },
        { itemId: '1000278', osId: 'os-20508' },
    ];
    const recado = api.problemaNaSelecao();
    ok(typeof recado === 'string' && /pedido/i.test(recado),
        'modelos de pedidos diferentes sao recusados', recado);
    ok(recado && /desmarqu|desmarc|reabra/i.test(recado),
        'o recado diz como sair da trava', recado);
})();

(function selecaoComItemQueSumiu() {
    // O caso que produzia o sintoma exato: o item continua na selecao, mas o
    // pedido dele nao esta mais carregado. O `sItem` vira undefined, a arte sai
    // com `qtd: 0` e o modelo simplesmente nao imprime -- em silencio.
    const st = {
        osItens: { 'os-20495': [{ id: '1000277' }, { id: '1000272' }] },
        selectedOSItems: [
            { itemId: '1000277', osId: 'os-20495' },
            { itemId: '1000278', osId: 'os-20508' },   // pedido nao carregado
        ],
    };
    const api = apiSel(st, global.window);
    const recado = api.problemaNaSelecao();
    ok(typeof recado === 'string', 'item de pedido nao carregado e recusado', recado);
})();

(function selecaoBoaPassa() {
    const st = {
        osItens: { 'os-20495': [{ id: '1000277' }, { id: '1000272' }] },
        selectedOSItems: [
            { itemId: '1000277', osId: 'os-20495' },
            { itemId: '1000272', osId: 'os-20495' },
        ],
    };
    ok(apiSel(st, global.window).problemaNaSelecao() === null,
        'dois modelos do mesmo pedido, ambos carregados, passam');
})();

(function asDuasTelasConferemASelecao() {
    ok(/problemaNaSelecao\(\)/.test(SCRIPT), 'a tela Imposicao confere a selecao antes de impor');
    ok(/problemaNaSelecao\(\)/.test(PEDIDO), 'a tela Pedido confere a selecao antes de impor');
    // E abrir um pedido tem de zerar a selecao do anterior, nas duas telas.
    ok(/selectedOSItems = \[\]/.test(PEDIDO),
        'abrir um pedido pela aba Pedido limpa a selecao do pedido anterior');
})();

// ─── As opções que o modelo guarda para quando combina ───────────────────────
//
// Pedidas em 18/08/2026, com uma condição que vale mais que as opções em si:
// nada disto pode encostar no caminho de UM modelo só, que já está validado e
// rodando na gráfica. Os casos abaixo cobrem as duas metades — o que as opções
// fazem, e o que elas continuam NÃO fazendo.

(function oNumeroDoModeloNasceDesligado() {
    ok(api.imprimeNumeroDoModelo(modelo('A', 10)) === false,
        'modelo novo nao imprime o numero: a opcao nasce desmarcada');
    ok(api.imprimeNumeroDoModelo(modelo('A', 10, { imprimir_numero_modelo: true })) === true,
        'marcada, o modelo passa a imprimir o numero');
    ok(api.imprimeNumeroDoModelo(null) === false, 'sem modelo nao imprime nada');

    // O `nome` e o unico campo que decide se o numero sai no papel, e as duas
    // telas o zeram do mesmo jeito quando a opcao esta desmarcada.
    const zera = /nome: \(isMultiSelected && !arte\._imprimirNumero\) \? '' : \(arte\.nome \|\| ''\)/;
    ok(zera.test(SCRIPT), 'a tela Imposicao so manda o nome quando a opcao esta marcada');
    ok(zera.test(PEDIDO), 'a tela Pedido so manda o nome quando a opcao esta marcada');
})();

(function oModoSalvoVenceMasSoAoCombinar() {
    const fmtBlocado = { id: 'f9', name: 'Blocado por padrao', cols: 2, rows: 2,
                         default_schema: 'cut_stack' };
    state.formatos.push(fmtBlocado);

    ok(api.modoDeImpressaoDoModelo(modelo('A', 10)) === 'sequencial',
        'sem nada salvo e sem blocos no ERP, o modo e sequencial');
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { blocos: 'S' })) === 'blocado',
        'o blocos = S do ERP decide quando nao ha escolha salva');
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { formato_id: 'f9' })) === 'blocado',
        'na falta do ERP vale o padrao do Formato');

    // E o que o operador salvou vence os dois.
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { blocos: 'S', modo_impressao: 'sequencial' })) === 'sequencial',
        'a escolha salva vence o blocos do ERP');
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { formato_id: 'f9', modo_impressao: 'sequencial' })) === 'sequencial',
        'a escolha salva vence o padrao do Formato');
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { modo_impressao: 'BLOCADO' })) === 'blocado',
        'a escolha salva nao depende de maiuscula');
    ok(api.modoDeImpressaoDoModelo(modelo('A', 10, { modo_impressao: 'xyz' })) === 'sequencial',
        'valor estranho no banco cai no caminho de sempre, nao quebra');
})();

(function modoDiferenteNaoDivideAFolha() {
    const seq = modelo('A', 10, { modo_impressao: 'sequencial' });
    const bloc = modelo('B', 10, { modo_impressao: 'blocado' });

    ok(api.porQueNaoCombina(seq, bloc) !== null,
        'sequencial com blocado nao combina: a ordem das celulas da folha e uma so');
    ok(/Op..es do modelo/.test(api.porQueNaoCombina(seq, bloc) || ''),
        'o recado diz onde mudar o modo', api.porQueNaoCombina(seq, bloc));
    ok(api.porQueNaoCombina(seq, modelo('C', 10, { modo_impressao: 'sequencial' })) === null,
        'dois sequenciais combinam');

    // A comparacao e pelo modo EFETIVO: um salvo e um sem nada salvo, com o
    // mesmo resultado, continuam combinando.
    ok(api.porQueNaoCombina(seq, modelo('C', 10)) === null,
        'modelo sem escolha salva combina com quem salvou o mesmo modo');
    ok(api.porQueNaoCombina(modelo('A', 10, { blocos: 'S' }), modelo('B', 10)) !== null,
        'blocos = S no ERP de um so ja impede, porque o modo efetivo difere');
})();

(function aBlocagemSemNadaSalvoEAquiloQueJaEra() {
    // Ligar o recurso nao pode mudar tiragem nenhuma que ja saia certa: sem nada
    // gravado, a blocagem tem de ser exatamente o que a v634 mandava.
    const nu = api.blocagemDoModelo(modelo('A', 10));
    ok(nu.modo === 'strict_assembly', 'sem nada salvo, o modo de blocos e o de sempre', nu);
    ok(nu.folhas === 50, 'sem nada salvo e sem bloco no ERP, 50 folhas', nu);

    const comBlocoErp = api.blocagemDoModelo(modelo('A', 10, { bloco: 25 }));
    ok(comBlocoErp.folhas === 25, 'o bloco do ERP continua mandando nas folhas', comBlocoErp);

    const salvo = api.blocagemDoModelo(modelo('A', 10, { bloco: 25, cutstack_modo: 'independent', cutstack_folhas: 8 }));
    ok(salvo.modo === 'independent' && salvo.folhas === 8,
        'o que o operador salvou vence o ERP', salvo);
})();

(function oEsquemaDaFolhaCombinada() {
    const st = {
        formatos: state.formatos, numeracoes: [],
        osItens: { os1: [
            { id: 'a', modelo: '1000277', formato_id: 'f1' },
            { id: 'b', modelo: '1000278', formato_id: 'f1' },
        ] },
        selectedOSItems: [{ itemId: 'a', osId: 'os1' }, { itemId: 'b', osId: 'os1' }],
        modoSomaFolha: 'separado',
    };
    const a = new Function('state', 'window',
        NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
        + '\nreturn { ' + NOMES.join(', ') + ' };')(st, global.window);

    ok(a.esquemaDaSelecaoCombinada() === 'sequential',
        'dois modelos sequenciais pedem o esquema sequential ao motor');
    ok(a.modoCutStackDaSelecao() === 'independent',
        'fora do cut_stack o payload diz independent, que o motor ignora');

    st.osItens.os1.forEach(i => { i.modo_impressao = 'blocado'; });
    ok(a.esquemaDaSelecaoCombinada() === 'cut_stack',
        'blocado com folha propria e cut_stack, como sempre foi');
    ok(a.modoCutStackDaSelecao() === 'strict_assembly',
        'e o modo de blocos continua o strict_assembly de sempre');

    st.modoSomaFolha = 'aproveitar';
    ok(a.esquemaDaSelecaoCombinada() === 'multi_artes',
        'blocado aproveitando a folha e multi_artes, como sempre foi');
    ok(a.modoCutStackDaSelecao() === 'independent',
        'no multi_artes o payload volta a dizer independent');

    // Sequencial ignora a barra: nao ha pilha para cortar, entao nao existe
    // folha propria por modelo.
    st.osItens.os1.forEach(i => { i.modo_impressao = 'sequencial'; });
    ok(a.esquemaDaSelecaoCombinada() === 'sequential',
        'sequencial nao muda com a barra em aproveitar');
    st.modoSomaFolha = 'separado';
    ok(a.esquemaDaSelecaoCombinada() === 'sequential',
        'nem com a barra em folha propria');
})();

(function oNomeDoArquivoTrazTodosOsModelos() {
    const mods = n => Array.from({ length: n }, (_, i) => ({ modelo: String(1000270 + i) }));

    ok(api.nomeDosModelosCombinados(mods(2)) === '1000270_1000271',
        'dois modelos entram os dois', api.nomeDosModelosCombinados(mods(2)));
    ok(api.nomeDosModelosCombinados(mods(8)).split('_').length === 8,
        'ate oito, todos por extenso');
    ok(api.nomeDosModelosCombinados(mods(9)) === '1000270_a_1000278_9modelos',
        'acima de oito encurta para primeiro, ultimo e contagem',
        api.nomeDosModelosCombinados(mods(9)));

    // O nome vai para dentro de um caminho do Windows, que para em 260.
    ok(api.nomeDosModelosCombinados(mods(40)).length < 60,
        'nem quarenta modelos estouram o limite do caminho');
    ok(api.nomeDosModelosCombinados([]) === '',
        'sem modelo nenhum, o nome cai no padrao do formato');
    ok(api.nomeDosModelosCombinados([{ modelo: '1000277' }, {}]) === '1000277',
        'modelo sem numero nao vira "undefined" no nome do arquivo');
})();

(function marcarImpressoPegaTodosOsSelecionados() {
    const st = {
        formatos: [], numeracoes: [], osItens: {},
        selectedOSItems: [{ itemId: 'a', osId: 'os1' }, { itemId: 'b', osId: 'os1' }],
        activeOSItem: { itemId: 'a', osId: 'os1' },
    };
    const a = new Function('state', 'window',
        NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
        + '\nreturn { ' + NOMES.join(', ') + ' };')(st, global.window);

    ok(a.alvosDaImpressao(true).length === 2,
        'com dois modelos na folha, os dois sao marcados como impressos');
    // E o caminho de um modelo so nao mudou: continua o item aberto, e so ele.
    ok(a.alvosDaImpressao(false).length === 1 && a.alvosDaImpressao(false)[0].itemId === 'a',
        'com um modelo so, continua sendo o modelo aberto');

    st.activeOSItem = null;
    ok(a.alvosDaImpressao(false).length === 0,
        'sem modelo aberto nao ha o que marcar');
})();

// ─── A fronteira: o caminho de UM modelo só não pode ter mudado ──────────────

(function umModeloSoContinuaComoEstava() {
    // Toda leitura nova mora atrás de `isMultiSelected`. Um `blocagemDaSelecao`
    // solto, fora dessa condição, mudaria a impressão de um modelo sozinho — que
    // é justamente o que não pode acontecer. O bloco onde as funções são
    // DEFINIDAS fica de fora: lá elas chamam umas às outras, e é o lugar certo.
    const INICIO_DEFS = SCRIPT.indexOf('// AS OPÇÕES QUE O MODELO GUARDA');
    const FIM_DEFS = SCRIPT.indexOf('function porQueNaoCombina');
    ok(INICIO_DEFS > 0 && FIM_DEFS > INICIO_DEFS, 'o bloco de definicoes continua identificavel');
    const linhaInicioDefs = SCRIPT.slice(0, INICIO_DEFS).split('\n').length;
    const linhaFimDefs = SCRIPT.slice(0, FIM_DEFS).split('\n').length;

    [['script.js', SCRIPT], ['pedido.js', PEDIDO]].forEach(par => {
        const nome = par[0];
        const linhas = par[1].split('\n');
        linhas.forEach((linha, i) => {
            if (nome === 'script.js' && i >= linhaInicioDefs - 1 && i <= linhaFimDefs) return;
            if (/^\s*(\/\/|\*)/.test(linha)) return;                 // comentário
            if (!/(esquemaDaSelecaoCombinada|modoCutStackDaSelecao|blocagemDaSelecao|nomeDosModelosCombinados)\(/.test(linha)) return;
            // A condição costuma estar algumas linhas acima — no `? :`, no `if`
            // que abre o ramo, ou no `length > 1` que o abre. A janela é uma
            // aproximação, e de propósito: ela não prova que a chamada está no
            // ramo certo, mas denuncia uma chamada solta longe de qualquer
            // marca de multi-seleção, que é o engano que se quer evitar.
            const janela = linhas.slice(Math.max(0, i - 20), i + 1).join('\n');
            ok(/isMultiSelected|selectedOSItems\.length > 1/.test(janela),
                nome + ':' + (i + 1) + ' usa a regra combinada dentro da condicao de multi-selecao',
                linha.trim());
        });
    });

    // E o par de botões não escreve na Regra de Paginação: se escrevesse,
    // mudaria por tabela a impressão de um modelo só.
    const setter = SCRIPT.slice(SCRIPT.indexOf('window.setModoImpressaoDoModelo'),
                                SCRIPT.indexOf('window.setModoImpressaoDoModelo') + 2000);
    ok(!/getElementById\('(ped|imp)-schema'\)/.test(setter),
        'escolher Sequencial/Blocado nao mexe no campo Regra de Paginacao');
})();

// ─── Fim ──────────────────────────────────────────────────────────────────────


if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
