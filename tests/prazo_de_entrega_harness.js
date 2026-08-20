// O PRAZO ENTREGA do Painel de Producao vem de `propostas_os.data_termino`.
//
// Ate 20/08/2026 a coluna mostrava um prazo INVENTADO: `getFallbackPrazo`
// devolvia a data de criacao mais 3 a 7 dias, escolhidos pelo resto da divisao
// do numero do pedido. Ele existia so para o filtro "Para Hoje / Atrasados" ter
// em que se apoiar enquanto o campo real nao fosse definido. O usuario apontou
// o campo, e o prazo de mentira saiu.
//
// `data_termino` e DATA PURA -- chega sempre a meia-noite. Por isso "atrasado"
// deixou de ser "data e hora anteriores ao momento atual" e passou a ser "o DIA
// do prazo ja passou": comparar por instante pintaria de vermelho, o dia
// inteiro, todo pedido que vence HOJE.
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
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

const api = new Function(
    recortar('_prazoDoPedido') + '\n' + recortar('pedidoEstaAtrasado') + '\n' + recortar('pedidoEhParaHoje')
    + '\nreturn { _prazoDoPedido, pedidoEstaAtrasado, pedidoEhParaHoje };')();

/** Uma data como o Vibe grava: meia-noite local, sem fuso. */
function comoOVibeGrava(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00`;
}
function diasDeHoje(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

const HOJE = comoOVibeGrava(new Date());
const ONTEM = comoOVibeGrava(diasDeHoje(-1));
const AMANHA = comoOVibeGrava(diasDeHoje(1));

// ─── 1. Pedido que vence HOJE nao esta atrasado ──────────────────────────────

(function venceHojeNaoEAtrasado() {
    const os = { prazo_entrega: HOJE };
    ok(api.pedidoEhParaHoje(os) === true, 'pedido de hoje conta como "Para Hoje"');
    ok(api.pedidoEstaAtrasado(os) === false,
        'e NAO aparece como atrasado -- data_termino chega a meia-noite', HOJE);
})();

// ─── 2. Ontem esta atrasado, amanha nao ──────────────────────────────────────

(function ontemEAmanha() {
    ok(api.pedidoEstaAtrasado({ prazo_entrega: ONTEM }) === true, 'prazo de ontem esta atrasado');
    ok(api.pedidoEhParaHoje({ prazo_entrega: ONTEM }) === false, 'e nao e de hoje');

    ok(api.pedidoEstaAtrasado({ prazo_entrega: AMANHA }) === false, 'prazo de amanha nao esta atrasado');
    ok(api.pedidoEhParaHoje({ prazo_entrega: AMANHA }) === false, 'nem e de hoje');
})();

// ─── 3. Data pura, sem hora, nao pode escorregar um dia ──────────────────────
//
// `new Date('2026-08-21')` e meia-noite UTC: no Brasil, 21h do dia 20. Sem o
// cuidado no `_prazoDoPedido`, o pedido apareceria vencendo um dia antes.

(function dataPuraNaoEscorrega() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const soData = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const prazo = api._prazoDoPedido({ prazo_entrega: soData });
    ok(!!prazo, 'data pura e aceita', soData);
    ok(prazo && prazo.getDate() === d.getDate(), 'e cai no dia certo, nao no anterior',
        prazo && prazo.toString());
    ok(api.pedidoEhParaHoje({ prazo_entrega: soData }) === true, 'e conta como "Para Hoje"');
})();

// ─── 4. Sem prazo, sem cor e sem filtro ──────────────────────────────────────

(function semPrazoNaoInventa() {
    ok(api._prazoDoPedido({ prazo_entrega: null }) === null, 'pedido sem prazo devolve null');
    ok(api._prazoDoPedido({}) === null, 'pedido sem o campo devolve null');
    ok(api._prazoDoPedido(null) === null, 'pedido nulo nao quebra a tela');
    ok(api._prazoDoPedido({ prazo_entrega: 'banana' }) === null, 'texto invalido devolve null');

    ok(api.pedidoEstaAtrasado({}) === false, 'sem prazo nao entra em Atrasados');
    ok(api.pedidoEhParaHoje({}) === false, 'nem em Para Hoje');
})();

// ─── 5. Na fonte: o prazo inventado saiu, e o real entrou ────────────────────

(function naFonte() {
    ok(!/^function getFallbackPrazo\(/m.test(SCRIPT),
        'a funcao getFallbackPrazo nao existe mais');
    ok(!/getFallbackPrazo\(/.test(SCRIPT.replace(/^\s*(\*|\/\/).*$/gm, '')),
        'e ninguem mais a chama (fora de comentario)');

    ok(/\.from\('propostas_os'\)/.test(SCRIPT), 'o painel le a tabela propostas_os');
    ok(/\.select\('id_int, data_termino'\)/.test(SCRIPT),
        'pedindo so id_int e data_termino');
    ok(/const prazoEntrega = prazosPorPedido\[String\(key\)\] \|\| null;/.test(SCRIPT),
        'e o prazo do pedido sai dali, ou fica nulo');

    // Falhar ao ler propostas_os nao pode derrubar a lista inteira.
    const bloco = SCRIPT.slice(SCRIPT.indexOf("from('propostas_os')") - 900,
                               SCRIPT.indexOf("from('propostas_os')") + 900);
    ok(/catch \(oe\)/.test(bloco), 'a leitura do prazo tem rede de seguranca');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias do prazo de entrega.');
