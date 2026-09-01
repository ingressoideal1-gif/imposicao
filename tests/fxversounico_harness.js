// FxVersoUnico: o terceiro Modo de Impressao (usuario, 31/08/2026).
//
//   Frente        -- so a frente.
//   FxVerso       -- frente e verso saem do MESMO arquivo, aos pares:
//                    a frente da peca i e a pagina i*2, o verso e a i*2+1.
//   FxVersoUnico  -- a frente e um PDF multipaginas, uma pagina por peca, e o
//                    verso e um arquivo de UMA pagina, repetido em todas.
//
// Roda em node, sem navegador: `node tests/fxversounico_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui -- nao copiadas. Uma
// copia continuaria passando depois de o original mudar.
//
// ## O que este arquivo protege, e por que
//
// Ate 31/08/2026 o painel perguntava `print_mode === 'duplex'` para responder a
// DUAS coisas diferentes: "este trabalho tem verso?" e "como o arquivo e
// paginado?". Com tres modos, so a segunda pergunta distingue os dois duplex.
// Um `=== 'duplex'` do PRIMEIRO tipo que ficou para tras nao quebra nada na
// tela: ele some com o verso, e quem descobre e o operador, no papel. Por isso
// a ultima secao daqui e um INVENTARIO -- ela lista as comparacoes cruas que
// ainda existem no codigo e reprova quando aparece uma nova sem classificacao.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra, null, 2) : ''));
}

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['temVerso', 'versoUnico', 'rotuloDoModoDeImpressao',
               'numeracaoEhDuplex', 'isNumeracaoDuplex',
               'numeracaoIdDoItem', 'modoDeVersoDoModelo'];

const state = { numeracoes: [] };
const api = new Function('state', 'window',
    NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
    + '\nreturn { ' + NOMES.join(', ') + ' };')(state, {});

// ─── 1. As duas perguntas ────────────────────────────────────────────────────

(function asDuasPerguntas() {
    // "Tem verso?" -- verdadeira nos DOIS modos duplex.
    ok(api.temVerso('duplex') === true, 'FxVerso tem verso');
    ok(api.temVerso('duplex_unico') === true, 'FxVersoUnico tem verso');
    ok(api.temVerso('front') === false, 'Frente nao tem verso');
    ok(api.temVerso(null) === false, 'sem modo definido, nao tem verso');
    ok(api.temVerso(undefined) === false, 'modo indefinido nao tem verso');
    ok(api.temVerso(' DUPLEX_UNICO ') === true, 'o modo e lido sem depender de caixa nem espaco');

    // "Como pagina?" -- verdadeira SO no FxVersoUnico.
    ok(api.versoUnico('duplex_unico') === true, 'so o FxVersoUnico pagina 1 a 1 com verso fixo');
    ok(api.versoUnico('duplex') === false, 'o FxVerso classico NAO e verso unico');
    ok(api.versoUnico('front') === false, 'Frente nao e verso unico');
    ok(api.versoUnico(null) === false, 'sem modo definido, nao e verso unico');
})();

// ─── 2. O rotulo que o operador le ───────────────────────────────────────────

(function osRotulos() {
    ok(api.rotuloDoModoDeImpressao({ print_mode: 'front' }) === 'Frente', 'rotulo de Frente');
    ok(api.rotuloDoModoDeImpressao({ print_mode: 'duplex' }) === 'FxVerso', 'rotulo de FxVerso');
    ok(api.rotuloDoModoDeImpressao({ print_mode: 'duplex_unico' }) === 'FxVersoUnico', 'rotulo de FxVersoUnico');
    ok(api.rotuloDoModoDeImpressao(null) === 'Frente', 'sem numeracao, o rotulo e Frente');
    // O rotulo da divergencia de celulas usa esta funcao: dizer "FxVerso" para
    // uma numeracao FxVersoUnico mandaria o operador conferir a coisa errada.
    ok(api.rotuloDoModoDeImpressao({ print_mode: 'duplex_unico' }) !== 'FxVerso',
        'o FxVersoUnico nao se disfarca de FxVerso na mensagem');
})();

// ─── 3. A numeracao com verso ────────────────────────────────────────────────

(function numeracaoComVerso() {
    // As duas funcoes que respondem "esta numeracao imprime verso?" tem de
    // enxergar o modo novo -- senao o editor nao abre a face do verso e os
    // elementos de tras nunca sao desenhados.
    ok(api.numeracaoEhDuplex({ print_mode: 'duplex_unico' }) === true,
        'numeracaoEhDuplex enxerga o FxVersoUnico');
    ok(api.isNumeracaoDuplex({ print_mode: 'duplex_unico' }) === true,
        'isNumeracaoDuplex enxerga o FxVersoUnico');
    ok(api.numeracaoEhDuplex({ print_mode: 'duplex' }) === true,
        'numeracaoEhDuplex continua enxergando o FxVerso');
    ok(api.numeracaoEhDuplex({ print_mode: 'front' }) === false,
        'numeracaoEhDuplex diz nao para a Frente');
})();

// ─── 4. O modo que vale para um modelo do pedido ─────────────────────────────

(function oModoDoModelo() {
    // O FxVersoUnico vive so na numeracao: `verso_tipo` e coluna do ERP
    // parceiro e nao conhece esse texto (decisao do usuario, 31/08/2026).
    state.numeracoes = [
        { id: 'n1', print_mode: 'front' },
        { id: 'n2', print_mode: 'duplex' },
        { id: 'n3', print_mode: 'duplex_unico' },
    ];

    ok(api.modoDeVersoDoModelo({ amostra_num_id: 'n3', verso_tipo: 'FxVerso', verso: true }) === 'duplex_unico',
        'numeracao FxVersoUnico manda, mesmo com o ERP dizendo so FxVerso');

    // E o ponto que mais importa nao regredir: quase nenhuma numeracao
    // cadastrada tem print_mode duplex, e um modelo de frente e verso NAO pode
    // perder o verso porque a numeracao dele diz 'front'.
    ok(api.modoDeVersoDoModelo({ amostra_num_id: 'n1', verso_tipo: 'FxVerso', verso: true }) === 'duplex',
        'numeracao Frente nao rebaixa um modelo que o ERP diz ter verso');
    ok(api.modoDeVersoDoModelo({ amostra_num_id: 'n1', verso_tipo: 'VERSO COMUM', verso: true }) === 'duplex',
        'o verso_tipo legado do ERP continua valendo');
    ok(api.modoDeVersoDoModelo({ amostra_num_id: 'n1', verso_tipo: 'Frente', verso: false }) === 'front',
        'modelo so de frente continua so de frente');
    ok(api.modoDeVersoDoModelo({ verso_tipo: 'Frente', verso: false }) === 'front',
        'modelo sem numeracao apontada continua so de frente');
    ok(api.modoDeVersoDoModelo({ amostra_num_id: 'n2', verso_tipo: 'Frente', verso: false }) === 'front',
        'numeracao FxVerso nao inventa verso num modelo marcado como Frente');
})();

// ─── 5. A conta de quantas pecas ─────────────────────────────────────────────

(function aContaDePecas() {
    // A regra que o painel e o motor aplicam em Pdf Paginado. So o FxVerso
    // classico divide por dois, porque so nele o verso mora no mesmo arquivo.
    const pecas = (printMode, paginas) =>
        printMode === 'duplex' ? Math.ceil(paginas / 2) : paginas;

    ok(pecas('duplex_unico', 9) === 9, 'FxVersoUnico: 9 paginas sao 9 pecas');
    ok(pecas('duplex', 18) === 9, 'FxVerso: 18 paginas sao 9 pecas');
    ok(pecas('front', 9) === 9, 'Frente: 9 paginas sao 9 pecas');

    // A conta acima e uma COPIA da regra. Ela so vale como teste se o codigo
    // continuar escrito daquele jeito -- entao conferimos que as expressoes
    // ainda estao la, e que nenhuma delas passou a usar `temVerso`, que
    // devolveria 5 pecas para um trabalho de 9.
    const contas = (SCRIPT + PEDIDO).match(
        /state\.printMode === 'duplex' \? Math\.ceil\(totalPages \/ 2\) : totalPages/g) || [];
    ok(contas.length >= 5, 'as contas de pecas em Pdf Paginado continuam pela regra do FxVerso classico',
        { encontradas: contas.length });
    ok(!/temVerso\(state\.printMode\) \? Math\.ceil/.test(SCRIPT + PEDIDO),
        'nenhuma conta de pecas passou a usar temVerso -- isso cortaria o trabalho ao meio');
})();

// ─── 6. Os tres seletores da tela ────────────────────────────────────────────

(function osSeletores() {
    // O modo se escolhe em tres lugares: a numeracao, a janela de Imposicao e a
    // do Pedido. Faltar a opcao em um deles deixa o operador sem como pedir o
    // modo justamente na tela em que ele trabalha.
    const ids = ['num-print-mode', 'imp-print-mode', 'ped-print-mode'];
    for (const id of ids) {
        const i = INDEX.indexOf('id="' + id + '"');
        ok(i > 0, 'o seletor ' + id + ' existe na index.html');
        if (i < 0) continue;
        const fim = INDEX.indexOf('</select>', i);
        const bloco = INDEX.slice(i, fim);
        ok(bloco.includes('value="front"'), id + ' oferece Frente');
        ok(bloco.includes('value="duplex"'), id + ' oferece FxVerso');
        ok(bloco.includes('value="duplex_unico"'), id + ' oferece FxVersoUnico');
        ok(bloco.includes('>FxVersoUnico<'), id + ' escreve FxVersoUnico por extenso');
    }
})();

// ─── 7. O inventario das comparacoes cruas ───────────────────────────────────

(function oInventario() {
    // Toda comparacao `printMode === 'duplex'` que sobreviveu no codigo tem de
    // ser da pergunta "como o arquivo e paginado?" -- a unica em que o
    // FxVersoUnico NAO entra junto com o FxVerso. Quem escrever uma nova precisa
    // decidir de que tipo ela e; se for "tem verso?", a resposta certa e
    // `temVerso(...)` e o nome novo nao entra nesta lista.
    //
    // A lista guarda o TEXTO da linha, sem espacos das pontas. Mudar a linha
    // reprova de proposito: e o momento de reclassificar.
    const PERMITIDAS = new Set([
        // A conta de quantas pecas o arquivo rende em Pdf Paginado.
        "raw_items = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;",
        "const finalItems = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;",
        "const finalItems = (state.printMode === 'duplex') ? Math.ceil(totalPages / 2) : totalPages;",
        "total = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;",
        // Qual pagina do arquivo cai em cada pose da folha.
        '} else if (state.printMode === "duplex") {',
        "? (state.printMode === 'duplex' ? item_index * 2 + 1 : item_index + 1)",
        "const pFrente = state.printMode === 'duplex' ? (item_index * 2 + 1) : (item_index + 1);",
        "} else if (state.printMode === 'duplex') {",
    ]);

    const achadas = [];
    for (const [nome, src] of [['script.js', SCRIPT], ['pedido.js', PEDIDO]]) {
        src.split('\n').forEach((linha, idx) => {
            const corpo = linha.trim();
            if (corpo.startsWith('//') || corpo.startsWith('*')) return;   // comentario nao e codigo
            if (!/printMode\s*(===|==|!==|!=)\s*['"]duplex['"]/.test(corpo)) return;
            if (!PERMITIDAS.has(corpo)) achadas.push(nome + ':' + (idx + 1) + '  ' + corpo);
        });
    }
    ok(achadas.length === 0,
        'nenhuma comparacao crua com "duplex" ficou sem classificacao -- se e a pergunta '
        + '"tem verso?", troque por temVerso(); se e "como pagina?", acrescente a linha as PERMITIDAS',
        achadas);
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes do FxVersoUnico passaram.');
