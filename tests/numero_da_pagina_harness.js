// Testes do número que cada página da visualização combinada mostra.
//
// Roda em node, sem navegador: `node tests/numero_da_pagina_harness.js`.
// Sai com código 1 se algum caso falhar.
//
// Por que isto existe: até 21/08/2026 o seletor `◀ Linha 3 / 5 ▶` do card do
// modelo trocava SÓ os campos que vinham do banco de dados. O número
// sequencial, o QR Ideal e o camarote ficavam parados na primeira peça, então
// a tela mostrava a linha 3 do banco casada com o ingresso 1 — uma peça que o
// motor nunca vai imprimir. A conta certa é a do `engine.py`: página da tela é
// o `local_idx` do motor.

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

// ─── Carregar o módulo num navegador de mentira ───────────────────────────────

global.window = global.window || {};
require(path.join(RAIZ, 'frontend', 'numero-da-pagina.js'));
const NumeroDaPagina = global.window.NumeroDaPagina;

ok(!!NumeroDaPagina, 'o numero-da-pagina.js carregou fora do navegador');

// ─── A conta do motor: item i do modelo leva val1 = n1 + i ────────────────────

(function sequencialAcompanhaAPagina() {
    const seq = (pagina) => NumeroDaPagina.sequencial({ start: 501, pagina });

    ok(seq(0) === 501, 'a primeira página mostra o número inicial do modelo', seq(0));
    ok(seq(1) === 502, 'a segunda página mostra o ingresso seguinte', seq(1));
    ok(seq(37) === 538, 'a página 38 mostra o 38º ingresso do modelo', seq(37));
})();

(function paginaZeroNaoMudaNada() {
    // A garantia que torna esta mudança segura: quem nunca folheia continua
    // vendo exatamente o mesmo número de antes.
    ok(NumeroDaPagina.sequencial({ start: 1 }) === 1,
       'sem página, o número é o inicial — como era antes do seletor');
    ok(NumeroDaPagina.sequencial({ start: 1, pagina: 0, tipo: 'TICKET', ticketPos: 3, ticketQtd: 4 }) === 3,
       'TICKET na página 0 continua valendo início + (pose - 1)');
    const c = NumeroDaPagina.camarote({ pagina: 0, lotacao: 5, cIni: 7 });
    ok(c.local === 7 && c.pessoa === 1, 'camarote na página 0 é o local inicial, pessoa 1', c);
})();

(function ticketAndaDeTiragemEmTiragem() {
    // TICKET com 4 poses por item: cada página do banco é UM item, e o item
    // consome as 4 poses. Espelha engine.py:
    // current_val = start_base + (local_idx * N) + (pos - 1)
    const t = (pagina, pos) => NumeroDaPagina.sequencial({
        start: 1, pagina, tipo: 'TICKET', ticketPos: pos, ticketQtd: 4
    });

    ok(t(0, 1) === 1 && t(0, 4) === 4, 'a primeira página do ticket leva as poses 1 a 4', [t(0, 1), t(0, 4)]);
    ok(t(1, 1) === 5 && t(1, 4) === 8, 'a segunda página do ticket começa onde a primeira parou', [t(1, 1), t(1, 4)]);
    ok(t(10, 2) === 42, 'a página 11 do ticket de 4 poses chega no 42', t(10, 2));
})();

(function camaroteSegueALotacao() {
    // engine.py, _resolve_camarote_val: local = c_ini + (i // l_cam);
    // pessoa = (i % l_cam) + 1.
    const c = (pagina) => NumeroDaPagina.camarote({ pagina, lotacao: 5, cIni: 1 });

    ok(c(4).local === 1 && c(4).pessoa === 5, 'a quinta pessoa ainda é do primeiro camarote', c(4));
    ok(c(5).local === 2 && c(5).pessoa === 1, 'a sexta pessoa abre o segundo camarote', c(5));
    ok(c(12).local === 3 && c(12).pessoa === 3, 'a página 13 é a pessoa 3 do camarote 3', c(12));
})();

(function lixoNaEntradaNaoQuebra() {
    ok(NumeroDaPagina.sequencial({ start: '25', pagina: '2' }) === 27,
       'número inicial que chega como texto ainda soma certo');
    ok(NumeroDaPagina.sequencial({ start: 10, pagina: -3 }) === 10,
       'página negativa não anda para trás do número inicial');
    ok(NumeroDaPagina.camarote({ pagina: 3, lotacao: 0 }).pessoa === 1,
       'lotação zero não divide por zero');
})();

// ─── Anti-clone: as três janelas usam a MESMA regra ───────────────────────────
//
// `frontend/cliente.js` é um clone do `frontend/script.js`, e uma regra de
// desenho mudada num só dos dois já custou defeito de produção (ver
// tests/csv_fatia_do_modelo_harness.js). Aqui a prova é de código-fonte: as
// duas cópias do `drawAmostraFace` têm de chamar o módulo, e não recalcular.

function corpoDaFuncao(arquivo, assinatura) {
    const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const inicio = texto.indexOf(assinatura);
    if (inicio < 0) return null;
    const fim = texto.indexOf('\nasync function ', inicio + assinatura.length);
    const fim2 = texto.indexOf('\nfunction ', inicio + assinatura.length);
    const corte = [fim, fim2].filter(n => n > 0).sort((a, b) => a - b)[0];
    return texto.slice(inicio, corte > 0 ? corte : texto.length);
}

['frontend/script.js', 'frontend/cliente.js'].forEach(arquivo => {
    const corpo = corpoDaFuncao(arquivo, 'async function drawAmostraFace(');
    ok(!!corpo, `${arquivo} ainda tem o drawAmostraFace`);
    if (!corpo) return;

    ok(/NumeroDaPagina\.sequencial\(/.test(corpo),
       `${arquivo}: o drawAmostraFace tira o número sequencial do NumeroDaPagina`);
    ok(/NumeroDaPagina\.camarote\(/.test(corpo),
       `${arquivo}: o drawAmostraFace tira os números do camarote do NumeroDaPagina`);
    ok(/_pagAmostra/.test(corpo),
       `${arquivo}: o drawAmostraFace resolve a página do seletor`);
});

// A rede de seguranca: entre o site subir e a estacao atualizar o agente, uma
// maquina com agente antigo baixa a pagina nova sem este modulo. Sem o guarda,
// a numeracao inteira para de desenhar naquela estacao.
['frontend/script.js', 'frontend/cliente.js'].forEach(arquivo => {
    const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    ok(/if \(!window\.NumeroDaPagina\)/.test(texto),
       `${arquivo}: tem rede de seguranca para o modulo que nao chegou`);
});

// O arquivo tem de estar nas duas páginas que o carregam, senão a estação serve
// uma tela que chama um módulo que ela não tem.
['frontend/index.html', 'frontend/cliente.html'].forEach(pagina => {
    const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
    ok(/numero-da-pagina\.js/.test(html), `${pagina} carrega o numero-da-pagina.js`);
});

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error(`\n${falhas} de ${total} caso(s) falharam.`);
    process.exit(1);
}
console.log(`OK: ${total} caso(s) do número da página passaram.`);
