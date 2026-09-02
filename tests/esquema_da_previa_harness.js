// O ESQUEMA DA JANELA E O DA MAQUINA SAO O MESMO (02/09/2026).
//
// Com varios modelos marcados, quem decide o esquema de imposicao e
// `esquemaDaSelecaoCombinada()`: o modo salvo nos modelos manda primeiro
// (Sequencial enche a folha na ordem) e, dentro de Blocado, a barra "somar
// folha" escolhe entre folha propria (`cut_stack`) e aproveitar a folha
// (`multi_artes`).
//
// O PAYLOAD ja lia dali. As duas PREVIAS liam o seletor de Regra de Paginacao
// (`ped-schema` / `imp-schema`), que ninguem atualiza quando a selecao ou a
// barra mudam -- so o padrao do formato escreve nele. Medido antes do conserto,
// com dois modelos blocados num formato de regra `sequential`:
//
//   barra "folha propria"      -> maquina: cut_stack    | janela: sequential
//   barra "aproveitar a folha" -> maquina: multi_artes  | janela: sequential
//
// A janela nunca mudava, e nunca batia: clicar na barra trocava o que a
// impressora faz e nao mexia na tela.
//
// Este harness roda a regra DE VERDADE, lida do script.js, com o mundo em volta
// trocado por dubles. Nada sai desta maquina.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function extrair(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = fonte.indexOf('\n}', i);
    return fonte.slice(i, fim + 2);
}

// A regra e as funcoes de que ela depende, todas lidas do codigo vivo.
const REAIS = ['esquemaDaSelecaoCombinada', 'modoDeImpressaoDaSelecao',
               'modoDeImpressaoDoModelo', 'modoSomaFolha', 'itensDaImposicao',
               'itemAtivoDoPedido'];

function regra(estado) {
    const codigo = REAIS.map(n => extrair(SCRIPT, n)).join('\n');
    return new Function('state', 'window', codigo
        + '\nreturn { esquemaDaSelecaoCombinada, modoDeImpressaoDaSelecao };')(estado, {});
}

function cenario(modoDosModelos, modoDaBarra) {
    return {
        modoSomaFolha: modoDaBarra,
        formatos: [{ id: 'f1', default_schema: 'sequential' }],
        osItens: {
            'os1': [
                { id: 'm1', qtd: 10, formato_id: 'f1', modo_impressao: modoDosModelos },
                { id: 'm2', qtd: 10, formato_id: 'f1', modo_impressao: modoDosModelos },
            ],
        },
        selectedOSItems: [{ osId: 'os1', itemId: 'm1' }, { osId: 'os1', itemId: 'm2' }],
        activeOSItem: { osId: 'os1', itemId: 'm1' },
    };
}

// ─── 1. A barra troca o esquema — e e' essa troca que a janela tem de seguir ──

(function aBarraDecideDentroDoBlocado() {
    const separado = regra(cenario('blocado', 'separado'));
    const aproveitar = regra(cenario('blocado', 'aproveitar'));

    ok(separado.esquemaDaSelecaoCombinada() === 'cut_stack',
        'modelos blocados com folha propria: cut_stack', separado.esquemaDaSelecaoCombinada());
    ok(aproveitar.esquemaDaSelecaoCombinada() === 'multi_artes',
        'modelos blocados aproveitando a folha: multi_artes', aproveitar.esquemaDaSelecaoCombinada());
    ok(separado.esquemaDaSelecaoCombinada() !== aproveitar.esquemaDaSelecaoCombinada(),
        'a barra MUDA o esquema -- e o que a janela tem de acompanhar');
})();

(function sequencialVenceABarra() {
    // O modo salvo nos modelos manda primeiro: em Sequencial a barra nao decide
    // nada, e a janela nao pode inventar um cut_stack.
    for (const barra of ['separado', 'aproveitar']) {
        const api = regra(cenario('sequencial', barra));
        ok(api.esquemaDaSelecaoCombinada() === 'sequential',
            'modelos sequenciais: sequential com a barra em ' + barra,
            api.esquemaDaSelecaoCombinada());
    }
})();

(function aRegraNaoOlhaOSeletorDaTela() {
    // O formato deste cenario tem `default_schema: 'sequential'`, e mesmo assim
    // modelos blocados dao cut_stack: a regra nao passa pelo seletor de Regra
    // de Paginacao. Era exatamente por ler o seletor que a janela divergia.
    const api = regra(cenario('blocado', 'separado'));
    ok(api.esquemaDaSelecaoCombinada() === 'cut_stack',
        'a regra ignora o padrao do formato, como o payload sempre fez');
    const corpo = extrair(SCRIPT, 'esquemaDaSelecaoCombinada');
    ok(corpo.indexOf('getElementById') < 0,
        'a regra passou a ler um controle da tela; ela e a fonte das DUAS pontas', corpo);
})();

// ─── 2. As duas janelas leem essa regra, e nao o seletor ─────────────────────

(function asDuasJanelasChamamARegra() {
    const corpoPed = extrair(PEDIDO, 'drawPedPreview');
    ok(corpoPed.indexOf('esquemaDaSelecaoCombinada()') > 0,
        'a janela do Pedido decide o esquema pela mesma regra do payload');

    const i = SCRIPT.indexOf('\nfunction drawPreview(');
    const corpoImp = SCRIPT.slice(i, SCRIPT.indexOf('\n}\n', i));
    ok(corpoImp.indexOf('esquemaDaSelecaoCombinada()') > 0,
        'a janela da Imposicao decide o esquema pela mesma regra do payload');
})();

(function aRegraVemDEPOISDoSeletor() {
    // O seletor continua valendo para UM modelo. Com varios, a regra tem de
    // sobrescrever o que ele disser -- entao ela vem depois na funcao.
    const corpo = extrair(PEDIDO, 'drawPedPreview');
    const posSeletor = corpo.indexOf("schema = document.getElementById('ped-schema')?.value || fmt.default_schema;");
    const posRegra = corpo.indexOf('esquemaDaSelecaoCombinada()');
    ok(posSeletor > 0, 'a leitura do seletor continua existindo (vale para um modelo so)');
    ok(posRegra > posSeletor,
        'a regra da selecao combinada tem de vir DEPOIS do seletor, para vencer',
        { posSeletor, posRegra });
})();

// ─── 3. A janela publica o que decidiu, para dar para conferir ───────────────

(function aJanelaPublicaOEsquema() {
    // Mesmo motivo do `state.contaDaTela`: sem publicar, nao ha como um teste
    // -- nem o proprio operador, no console -- saber o que a janela desenhou.
    ok(PEDIDO.indexOf('state.esquemaDaPrevia = schema;') > 0,
        'a janela do Pedido publica o esquema que desenhou');
    ok(SCRIPT.indexOf('state.esquemaDaPrevia = schema;') > 0,
        'a janela da Imposicao publica o esquema que desenhou');
})();

// ─── Resultado ────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('OK: esquema da previa -- ' + total + ' verificacoes, todas passaram.');
