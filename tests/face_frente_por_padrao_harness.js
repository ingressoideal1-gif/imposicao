// O elemento nasce "Apenas Frente", e o editor abre em "Frente" (01/09/2026).
//
// Regra do usuario: *"na edicao das numeracoes, sempre que adicionar um elemento
// de numeracao, de qualquer formato, deve sempre ser adicionado o elemento de
// numeracao com a opcao 'FACE' ... na opcao 'Apenas Frente', assim como ao criar
// qualquer numeracao deve trazer a edicao da numeracao sempre no modo de
// Impressao 'Frente'"*.
//
// Sao duas regras que se sustentam uma na outra: o editor abre em Frente, entao
// o elemento nascer "Apenas Frente" e nascer onde a pessoa esta olhando.
//
// ## O que havia antes, e por que enganava
//
// O elemento tinha DOIS padroes de face, escolhidos pelo Modo de Impressao:
//
//   - No modo Frente ele nascia `'both'`. Nada denunciava isso na tela, porque
//     nao ha verso para olhar. A conta chegava depois: no dia em que a numeracao
//     virasse FxVerso, TODO elemento desenhado na frente aparecia tambem no
//     verso de uma vez so.
//   - No FxVerso ele seguia `state.lastActiveFace`, a ultima face clicada — que
//     nunca era zerada entre numeracoes. Um clique no verso da numeracao A fazia
//     o primeiro elemento da numeracao B nascer no verso.
//
// E o Modo de Impressao era o unico campo do formulario que sobrevivia ao
// `cancelNumEdit()`. Editar uma FxVerso e clicar em "+ Nova Numeracao" comecava
// a numeracao nova em FxVerso, com a segunda tela de canvas aberta.
//
// As funcoes sao RECORTADAS do script.js e executadas contra um DOM de mentira —
// nao ha copia da regra aqui para envelhecer sozinha.
//
// Roda em node: `node tests/face_frente_por_padrao_harness.js`.

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

// `'\n}'`, e nao `'\n}\n'`: o arquivo tem fim de linha CRLF, entao depois da
// chave vem `\r` e o segundo `\n` nunca casaria — o recorte iria ate o fim do
// arquivo. Mesma armadilha ja documentada nos outros harnesses.
function recortarFuncao(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

function recortarAtribuicao(prefixo) {
    const i = SCRIPT.indexOf(prefixo);
    if (i < 0) throw new Error('nao achei ' + prefixo + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n};', i) + 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM de mentira: so o que estas duas funcoes tocam.
// ─────────────────────────────────────────────────────────────────────────────
function montarDom(valores) {
    const nos = {};
    const pegar = (id) => {
        if (!nos[id]) nos[id] = { id, value: '', style: {}, checked: false };
        return nos[id];
    };
    Object.keys(valores || {}).forEach(id => { pegar(id).value = valores[id]; });
    return {
        nos,
        document: { getElementById: (id) => pegar(id) },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. addElement: a face nasce 'front' em TODO tipo e em TODO modo de impressao
// ─────────────────────────────────────────────────────────────────────────────
const FONTE_ADD = recortarAtribuicao('window.addElement = function (type, extras)');

function rodarAddElement(cenario) {
    const dom = montarDom({ 'num-print-mode': cenario.printMode || 'front' });
    const state = {
        numElCounter: 0,
        numElements: [],
        numFormato: { width_mm: 90, height_mm: 140 },
        // O valor que o codigo antigo consultava. Deixado armado de proposito:
        // se alguem devolver a leitura, o teste do FxVerso quebra na hora.
        lastActiveFace: cenario.lastActiveFace || null,
    };
    const janela = {};
    const escopo = {
        window: janela,
        document: dom.document,
        state,
        temVerso: (m) => m === 'duplex' || m === 'duplex_unico',
        saveNumHistory: () => {},
        renderElementsList: () => {},
        drawCanvas: () => {},
        selectElId: () => {},
    };
    const nomes = Object.keys(escopo);
    new Function(...nomes, FONTE_ADD)(...nomes.map(n => escopo[n]));
    return janela.addElement(cenario.type, cenario.extras);
}

// Todos os botoes da box "Adicionar Elementos" do #view-numeracao, mais os dois
// que entram pela box "Adicionar Pdf e Svg". "De qualquer formato" e isto.
const TIPOS = [
    'TEXT', 'QR', 'QR_IDEAL', 'BARCODE', 'FIXED', 'FOTO', 'PICOTE',
    'SVG', 'PDF',
    'TEATRO_FILA', 'TEATRO_LUGAR', 'TEATRO_COMBO',
    'CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL',
];

for (const tipo of TIPOS) {
    for (const modo of ['front', 'duplex', 'duplex_unico']) {
        const el = rodarAddElement({ type: tipo, printMode: modo });
        ok(el.face === 'front',
            `${tipo} em modo ${modo} nasce "Apenas Frente"`, el.face);
    }
}

// A armadilha antiga: a ultima face clicada era lembrada ENTRE numeracoes, entao
// um clique no verso de uma numeracao contaminava a proxima.
for (const modo of ['duplex', 'duplex_unico']) {
    const el = rodarAddElement({ type: 'TEXT', printMode: modo, lastActiveFace: 'back' });
    ok(el.face === 'front',
        `um clique anterior no verso NAO decide a face do elemento novo (${modo})`, el.face);
}

// Quem cria o elemento por `extras` (a box "Adicionar Pdf e Svg") continua
// mandando no resto — o padrao e padrao, nao imposicao.
const comExtras = rodarAddElement({
    type: 'PDF', printMode: 'duplex', extras: { face: 'back', width_mm: 55 },
});
ok(comExtras.face === 'back', 'quem passa `extras` continua podendo escolher a face', comExtras.face);
ok(comExtras.width_mm === 55, '`extras` continua sobrepondo o resto', comExtras.width_mm);

// E nada mais no arquivo mexe na face da ultima face clicada. O comentario que
// conta a historia dela pode (e deve) ficar; codigo vivo, nao — deixar so a
// escrita de um valor que ninguem le mais e uma mentira no arquivo.
const SEM_COMENTARIO = SCRIPT.split(/\r?\n/)
    .filter(l => !l.trim().startsWith('//'))
    .join(' ');
ok(!/lastActiveFace/.test(SEM_COMENTARIO),
    'o `state.lastActiveFace` saiu do codigo vivo');

// ─────────────────────────────────────────────────────────────────────────────
// 2. cancelNumEdit: o formulario vazio volta para "Frente"
// ─────────────────────────────────────────────────────────────────────────────
const FONTE_CANCEL = recortarFuncao('cancelNumEdit');

function rodarCancelNumEdit(modoAnterior) {
    const dom = montarDom({
        'num-print-mode': modoAnterior,
        'num-id': '77',
        'num-name': 'Ingresso VIP',
        'num-formato': '9',
    });
    let avisou = 0;
    const janela = {
        customNumeracaoEditState: { active: true },
        clearBgImage: () => {},
        onTipoSelect: () => {},
        onNumPrintModeChange: () => { avisou++; },
    };
    const state = { numElements: [{ id: 'el_1' }], numFormato: { width_mm: 90 } };
    const escopo = {
        window: janela,
        document: dom.document,
        state,
        atualizarMarcaDaNumeracaoExclusiva: () => {},
        clearNumCsvFile: () => {},
        renderBoxArquivos: () => {},
    };
    const nomes = Object.keys(escopo);
    const fn = new Function(...nomes, FONTE_CANCEL + '\nreturn cancelNumEdit;')(...nomes.map(n => escopo[n]));
    fn();
    return { dom, avisou, janela, state };
}

for (const anterior of ['duplex', 'duplex_unico', 'front']) {
    const r = rodarCancelNumEdit(anterior);
    ok(r.dom.nos['num-print-mode'].value === 'front',
        `sair de uma numeracao ${anterior} devolve o formulario para "Frente"`,
        r.dom.nos['num-print-mode'].value);
    ok(r.avisou === 1,
        `e avisa a tela (${anterior}), senao o canvas do verso fica aberto num modo que nao tem verso`,
        r.avisou);
}

// A limpeza que ja existia nao pode ter sido atropelada.
const limpo = rodarCancelNumEdit('duplex');
ok(limpo.dom.nos['num-id'].value === '', 'o id continua sendo apagado');
ok(limpo.dom.nos['num-name'].value === '', 'o nome continua sendo apagado');
ok(limpo.janela.customNumeracaoEditState === null,
    'o vinculo com o modelo continua morrendo junto com o formulario');
ok(limpo.state.numElements.length === 0, 'os elementos continuam sendo zerados');
ok(limpo.state.numFormato === null, 'e o formato tambem');

// A ordem importa: o aviso vai DEPOIS de zerar o formato, senao ele redesenha a
// numeracao anterior no instante em que ela deveria sumir.
const corpoCancel = FONTE_CANCEL;
ok(corpoCancel.indexOf('state.numFormato = null') < corpoCancel.indexOf("num-print-mode"),
    'o reset do modo fica no fim, depois de `state.numFormato = null`');

// ─────────────────────────────────────────────────────────────────────────────
// 3. O cartao do elemento mostra "Apenas Frente" selecionado
// ─────────────────────────────────────────────────────────────────────────────
// Nascer 'front' nao adianta se o `select` da Face continuar exibindo outra
// coisa: quem confere e o operador, olhando o cartao.
const opcoes = SCRIPT.match(/<option value="front" \$\{el\.face === 'front' \? 'selected' : ''\}>Apenas Frente<\/option>/g) || [];
ok(opcoes.length === 2,
    'as duas caixas de Face (a do PICOTE e a dos demais) marcam "Apenas Frente" quando a face e front',
    opcoes.length);

console.log(`\n${total - falhas}/${total} verificacoes passaram.`);
process.exit(falhas ? 1 : 0);
