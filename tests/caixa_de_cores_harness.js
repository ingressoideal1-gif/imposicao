// A CAIXA DE GERENCIAMENTO DE CORES ABRE FECHADA (28/08/2026).
//
// Pedido do usuario: "adicionar botao para esconder o gerenciamento de cores,
// so mostrar quando solicitado".
//
// O perfil ICC e do EQUIPAMENTO -- escolhido uma vez, vale para todo pedido que
// va para aquela impressora. O operador que imprime dez trabalhos por dia nao
// mexe nele nenhuma vez, e a caixa ocupava metade do painel do driver com um
// seletor de perfil, um de intento, tres deslizadores e um editor de curvas.
//
// A funcao e RECORTADA do script.js e executada contra um DOM do tamanho da
// caixa -- nada aqui e copia da regra.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

// --- Um DOM do tamanho da caixa, e nada mais --------------------------------

function montar(comNos) {
    const nos = {};

    if (comNos !== false) {
        // O corpo nasce escondido, como o index.html o entrega.
        nos['ped-print-cor-corpo'] = { style: { display: 'none' } };
        nos['ped-print-cor-btn'] = {
            atributos: {},
            title: '',
            setAttribute: (n, v) => { nos['ped-print-cor-btn'].atributos[n] = v; },
        };
        nos['ped-print-cor-btn-texto'] = { textContent: '' };
        nos['ped-print-cor-btn-seta'] = { textContent: '' };
    }

    const documento = { getElementById: id => nos[id] || null };

    let curvas = 0, previas = 0;

    const api = new Function(
        'document', 'desenharCurvaCor', 'desenharPreviaCor',
        recortar('alternarGerenciamentoDeCores')
        + '\nreturn { alternarGerenciamentoDeCores };'
    )(documento, () => { curvas++; }, () => { previas++; });

    return {
        alternar: api.alternarGerenciamentoDeCores,
        nos,
        aberto: () => nos['ped-print-cor-corpo'].style.display !== 'none',
        curvas: () => curvas,
        previas: () => previas,
    };
}

// --- 1. Abrir e fechar ------------------------------------------------------

(function oBotaoAbreEFecha() {
    const t = montar();

    ok(!t.aberto(), 'a caixa comeca fechada -- so mostra quando o operador pedir');

    t.alternar();
    ok(t.aberto(), 'o primeiro clique abre');
    ok(t.nos['ped-print-cor-corpo'].style.display === 'flex',
       'aberta, a caixa volta a ser uma coluna flex (era assim que ela se empilhava)',
       t.nos['ped-print-cor-corpo'].style.display);

    t.alternar();
    ok(!t.aberto(), 'o segundo clique fecha de novo');
})();

(function oBotaoDizOQueVaiFazer() {
    const t = montar();
    const btn = t.nos['ped-print-cor-btn'];
    const texto = t.nos['ped-print-cor-btn-texto'];
    const seta = t.nos['ped-print-cor-btn-seta'];

    t.alternar();
    ok(texto.textContent === 'Ocultar', 'aberta, o botao oferece Ocultar', texto.textContent);
    ok(seta.textContent === '▲', 'e a seta aponta para cima');
    ok(btn.atributos['aria-expanded'] === 'true', 'e o aria-expanded acompanha');
    ok(/Esconder/.test(btn.title), 'e o title tambem', btn.title);

    t.alternar();
    ok(texto.textContent === 'Mostrar', 'fechada, ele oferece Mostrar', texto.textContent);
    ok(seta.textContent === '▼', 'e a seta aponta para baixo');
    ok(btn.atributos['aria-expanded'] === 'false', 'e o aria-expanded volta');
    ok(/Mostrar/.test(btn.title), 'e o title volta junto', btn.title);
})();

// --- 2. Forcar um estado ----------------------------------------------------

(function daParaForcarOEstado() {
    const t = montar();

    t.alternar(true);
    ok(t.aberto(), 'alternar(true) abre');
    t.alternar(true);
    ok(t.aberto(), 'e chamar de novo com true nao fecha por engano');

    t.alternar(false);
    ok(!t.aberto(), 'alternar(false) fecha');
    t.alternar(false);
    ok(!t.aberto(), 'e chamar de novo com false nao abre por engano');
})();

// --- 3. O desenho so acontece quando ha o que ver ---------------------------

(function abrirRedesenhaACurvaEAPrevia() {
    const t = montar();

    ok(t.curvas() === 0 && t.previas() === 0, 'nada e desenhado so por montar a tela');

    t.alternar();
    ok(t.curvas() === 1 && t.previas() === 1,
       'abrir redesenha a curva e a previa -- quem abre pela primeira vez tem de ver algo',
       [t.curvas(), t.previas()]);

    t.alternar();
    ok(t.curvas() === 1 && t.previas() === 1,
       'e fechar nao gasta desenho nenhum', [t.curvas(), t.previas()]);
})();

// --- 4. Nas telas que nao tem a caixa, nao pode explodir --------------------

(function semACaixaNaoQuebra() {
    const t = montar(false);

    let erro = null;
    try { t.alternar(); } catch (e) { erro = String(e); }

    ok(erro === null,
       'chamar o filtro numa pagina sem a caixa (producao.html) nao pode quebrar a tela', erro);
})();

console.log(falhas === 0
    ? 'OK: ' + total + ' verificacoes da caixa de Gerenciamento de Cores'
    : 'FALHAS: ' + falhas + '/' + total);
process.exit(falhas === 0 ? 0 : 1);
