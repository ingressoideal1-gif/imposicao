// O catalogo e o editor sabem dizer que uma numeracao e exclusiva de cliente.
//
// Pedido do usuario em 27/08/2026, em quatro partes:
//
//   1. um DROP no catalogo, com o estado que faltava: ver so as exclusivas;
//   2. nessa opcao, todas elas, com preview e o NUMERO do cliente;
//   3. uma diferenciacao de COR ao editar uma exclusiva, para nao confundi-la
//      com uma padrao;
//   4. e, no editor, transformar a exclusiva em padrao — duplicando.
//
// Roda em node, sem navegador: `node tests/numeracoes_exclusivas_no_catalogo_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui — nao copiadas.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
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
    for (const abre of ['\nasync function ', '\nfunction ']) {
        const i = SCRIPT.indexOf(abre + nome + '(');
        if (i < 0) continue;
        const fim = SCRIPT.indexOf('\n}', i);
        if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
        return SCRIPT.slice(i, fim + 2);
    }
    throw new Error('nao achei a funcao ' + nome + ' no script.js');
}

// ─── 1. O drop ───────────────────────────────────────────────────────────────

(function oDropTemOsTresEstados() {
    const i = INDEX.indexOf('id="catalogo-filter-exclusivas"');
    ok(i > 0, 'o drop existe no catalogo');
    const bloco = INDEX.slice(i, INDEX.indexOf('</select>', i));

    ok(/value="padrao"/.test(bloco), 'so as padrao', bloco);
    ok(/value="todas"/.test(bloco), 'padrao + exclusivas', bloco);
    ok(/value="exclusivas"/.test(bloco), 'e so as exclusivas — o estado que faltava', bloco);
    ok(/onchange="renderNumeracoes\(\)"/.test(bloco), 'trocar redesenha a lista');

    // A ordem importa: a primeira <option> e a que abre, e o padrao continua
    // sendo esconder as exclusivas. Elas sao a maioria dos registros da tabela
    // — medido em 08/08/2026: 49 no total, 16 escondidas.
    ok(bloco.indexOf('value="padrao"') < bloco.indexOf('value="todas"'),
        'a lista abre como sempre abriu: so as padrao');

    // A caixa de marcar que isto substituiu nao pode ficar para tras: ela e
    // lida por id, e um `?.checked` num elemento que sumiu vale `undefined`.
    ok(!/catalogo-mostrar-exclusivas/.test(INDEX), 'a caixa antiga saiu do HTML');
    ok(!/catalogo-mostrar-exclusivas/.test(SCRIPT), 'e do script tambem');
})();

(function oFiltroSegueODrop() {
    const corpo = extrair('renderNumeracoes');

    ok(/catalogo-filter-exclusivas/.test(corpo), 'o filtro le o drop');
    ok(/modoExclusivas === 'exclusivas'[\s\S]{0,80}if \(!n\.Cli_Num\) return false/.test(corpo),
        'em "so exclusivas", quem nao tem cliente sai');
    ok(/modoExclusivas !== 'todas'[\s\S]{0,80}if \(n\.Cli_Num\) return false/.test(corpo),
        'fora de "todas", a exclusiva continua escondida');

    // A busca por numero e um filtro de CLIENTE, e nao de nome — armadilha 2 do
    // docs/lista_de_numeracoes.md. Ela tem de continuar vencendo o drop.
    ok(/if \(isSearchNum\) \{[\s\S]{0,220}return String\(n\.Cli_Num \|\| ''\) === searchValClean;/.test(corpo),
        'digitar o numero do cliente continua vencendo o drop');
})();

(function oEstadoVazioParaDeMentir() {
    // Armadilha 4 do documento: a tela dizia "Nenhuma numeracao cadastrada
    // ainda" mesmo com filtro ligado — ou seja, mentia justamente para quem
    // acabava de escolher "so exclusivas" num banco cheio de numeracoes.
    const corpo = extrair('renderNumeracoes');
    ok(/Nenhuma numeração exclusiva de cliente/.test(corpo),
        'sem exclusivas, o recado fala de exclusivas');
    ok(/Nenhuma numeração com esses filtros/.test(corpo),
        'e com filtro ligado, fala do filtro');
})();

// ─── 2. O numero do cliente ──────────────────────────────────────────────────

(function oSeloTrazONumeroDoCliente() {
    const corpo = extrair('renderNumeracoes');
    // Antes o numero so aparecia quando o painel NAO sabia o nome ("cliente
    // 27401") — ou seja, sumia justamente no caso bom. E o numero e o que se
    // digita na busca e o que identifica o cliente no ERP.
    ok(/const cli = nome \? \(n\.Cli_Num \+ ' · ' \+ nome\) : String\(n\.Cli_Num\)/.test(corpo),
        'o numero vem sempre, e o nome quando o painel souber', corpo.match(/const cli = .*/));
    ok(/👤 \$\{escapeHtml\(cli\)\}/.test(corpo), 'e e ele que sai no selo');
    // A coluna Preview ja existia e vale para as exclusivas tambem: e o que
    // permite reconhece-las sem abrir uma a uma.
    ok(/preview_jpg \|\| ''/.test(corpo) && /previewCell/.test(corpo),
        'a miniatura continua na lista, exclusivas inclusive');
})();

// ─── 3. A cor do editor ──────────────────────────────────────────────────────

(function oEditorSabeDeQuemEANumeracao() {
    const nomes = ['clienteDaNumeracaoDoEditor', 'atualizarMarcaDaNumeracaoExclusiva'];
    const doc = { _id: '', _custom: null, getElementById(id) {
        if (id === 'num-id') return { value: this._id };
        return null;
    } };
    const win = {};
    const api = new Function('state', 'document', 'window',
        nomes.map(extrair).join('\n') + '\nreturn { ' + nomes.join(', ') + ' };'
    )({ numeracoes: [
        { id: 'e1', name: 'CAMAROTE', Cli_Num: 27401 },
        { id: 'g1', name: 'Mobi' },
    ] }, doc, win);

    doc._id = 'e1';
    ok(api.clienteDaNumeracaoDoEditor() === 27401, 'a exclusiva diz de que cliente e');
    doc._id = 'g1';
    ok(api.clienteDaNumeracaoDoEditor() === null, 'a do catalogo nao tem dono');
    doc._id = '';
    ok(api.clienteDaNumeracaoDoEditor() === null, 'e o editor vazio, tambem');

    // A que esta NASCENDO de dentro de um modelo ainda nao existe no banco, e
    // tambem e do cliente — quem sabe disso e o vinculo do editor.
    win.customNumeracaoEditState = { cliNum: 27401, itemId: '1000562' };
    ok(api.clienteDaNumeracaoDoEditor() === 27401, 'a que nasce de um modelo tambem e do cliente');
})();

(function aMarcaAcendeEApaga() {
    const corpo = extrair('atualizarMarcaDaNumeracaoExclusiva');
    ok(/classList\.toggle\('editando-exclusiva', !!cli\)/.test(corpo),
        'a classe da cor liga e desliga pelo cliente');
    ok(/CLIENTE ' \+ cli/.test(corpo), 'o selo traz o numero do cliente, e nao so a palavra');
    // Duplicar exige um original gravado.
    ok(/btn\.style\.display = \(cli && idNoEditor\)/.test(corpo),
        'o botao de tornar padrao so aparece com a numeracao ja salva');
})();

(function osTresPontosQueAcendemEApagam() {
    // Um so nao basta: quem edita uma exclusiva e depois abre uma do catalogo
    // pela lista veria o editor continuar vestido de exclusiva.
    ok(/atualizarDicaDoNomeDaNumeracao\(\);\s*\n\s*atualizarMarcaDaNumeracaoExclusiva\(\);/.test(SCRIPT),
        'abrir uma numeracao pela lista acende ou apaga a marca');
    ok(/if \(dicaNome\) dicaNome\.style\.display = 'none';[\s\S]{0,220}atualizarMarcaDaNumeracaoExclusiva\(\)/.test(SCRIPT),
        'e o cancelNumEdit devolve o editor ao neutro');
    ok(/function mostrarVoltarDaNumeracaoDoModelo\(\) \{[\s\S]{0,260}atualizarMarcaDaNumeracaoExclusiva\(\)/.test(SCRIPT),
        'e quem chega de dentro de um modelo tambem ve a marca');
})();

(function aCorEstaNoCss() {
    ok(/#view-numeracao\.editando-exclusiva/.test(CSS), 'a regra de cor existe');
    // O mesmo ambar que marca a exclusiva no seletor do modelo: "amarelo =
    // exclusiva de cliente" vale no aplicativo inteiro, e nao por tela.
    const bloco = CSS.slice(CSS.indexOf('#view-numeracao.editando-exclusiva'));
    ok(/var\(--amber\)|245,158,11/.test(bloco.slice(0, 900)),
        'e usa o mesmo ambar do seletor do modelo');
    ok(INDEX.indexOf('id="num-selo-exclusiva"') > 0, 'o selo existe no editor');
    ok(INDEX.indexOf('id="btn-num-tornar-padrao"') > 0, 'e o botao de tornar padrao tambem');
})();

// ─── 4. Tornar padrao ────────────────────────────────────────────────────────

(function tornarPadraoDuplicaEmVezDeConverter() {
    const corpo = extrair('tornarNumeracaoPadrao');

    // Converter no lugar mudaria o material de todo mundo que usa a exclusiva
    // hoje — inclusive de pedidos ja aprovados — e faria isso calado.
    ok(!/\.update\(/.test(corpo) && !/\.delete\(/.test(corpo),
        'nao altera nem apaga a exclusiva: duplica', corpo.slice(0, 200));

    ok(/document\.getElementById\('num-id'\)\.value = '';/.test(corpo),
        'zera o id, para o save INSERIR');
    ok(/window\.customNumeracaoEditState = null;/.test(corpo),
        'e zera o vinculo, para a copia nascer sem dono');
    ok(/await window\.saveNumeracao\(\)/.test(corpo),
        'a gravacao e o save de sempre — ele ja sabe subir preview e recusar nome ocupado');

    // Sem um original gravado nao ha o que duplicar.
    ok(/if \(!id \|\| !cli\)/.test(corpo), 'recusa fora de uma exclusiva ja salva');

    // Recusa do save nao pode deixar o editor desmontado: sem devolver o id, o
    // proximo Salvar gravaria uma numeracao NOVA em vez de atualizar a exclusiva.
    ok(/if \(!novoId\) \{[\s\S]{0,700}document\.getElementById\('num-id'\)\.value = id;/.test(corpo),
        'save recusado devolve o id ao editor');
    ok(/if \(!novoId\) \{[\s\S]{0,700}window\.customNumeracaoEditState = vinculo;/.test(corpo),
        'e devolve o vinculo com o modelo');

    ok(/await editNumeracao\(novoId\)/.test(corpo),
        'e no caminho feliz a copia abre no editor, para seguir editando');
})();

(function oSaveDevolveOIdDoQueGravou() {
    // E o que permite abrir a copia depois. Sem isto, `tornarNumeracaoPadrao`
    // teria de reencontra-la PELO NOME — que e exatamente o mecanismo da
    // "numeracao fantasma" de 25/08/2026: nome nao e unico nesta tabela.
    ok(/return idDaNumeracaoGravada;/.test(SCRIPT), 'o saveNumeracao devolve o id gravado');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
