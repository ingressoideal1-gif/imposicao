// A estacao da grafica nao pede ao banco o que ela nao tem direito de ler.
//
// O painel da estacao e servido pelo agente local na porta 9000 e roda o MESMO
// `frontend/script.js` do site. La o operador entra pelo codigo local
// (`iniciarAcessoLocal`), sem sessao do Supabase -- por projeto. Ou seja: toda
// chamada dela sai como `anon`.
//
// Das 29 tabelas que o painel usa, quatro nao liberam nada para o `anon`, e o
// `loadOrdens()` pedia duas delas toda vez que carregava a lista:
// `pedidos_links_cliente` (que guarda o TOKEN do link de cada cliente, fechado
// de proposito em 16/08/2026) e `imposition_tempo_no_card`.
//
// Medido no log do Postgres em 01/09/2026, numa janela de 26h: 143 recusas em
// `pedidos_links_cliente` e 44 em `imposition_tempo_no_card`. Nos `edge_logs`,
// todas com `referer: http://127.0.0.1:9000/` -- nenhuma vinda do site.
//
// Dois estragos. O primeiro e ruido: ~190 erros por dia no painel do Supabase,
// que escondem problema de verdade. O segundo e pior e vem do `[AUTO-SYNC-DB]`:
// ele marcava o pedido como "Enviar Arte" no `localStorage` da estacao ANTES de
// tentar gravar, e a gravacao era recusada -- entao aquela maquina mostrava um
// status que o banco nao tinha.
//
// O conserto: sem sessao, nao pede. Este harness recorta as funcoes do
// `script.js` e as roda contra um banco de mentira, com e sem sessao.
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

function recortarAsync(nome) {
    const i = SCRIPT.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

// ─── O banco de mentira ──────────────────────────────────────────────────────
//
// Imita o pouco do supabase-js que estas funcoes usam, e ANOTA cada tabela
// tocada -- que e justamente o que este harness precisa medir.

function bancoFalso(opcoes) {
    opcoes = opcoes || {};
    const dados = opcoes.dados || {};
    const log = { leituras: [], escritas: [] };
    return {
        log,
        auth: {
            getSession() {
                return Promise.resolve({
                    data: { session: opcoes.comSessao ? { user: { email: 'designer@ideal' } } : null },
                    error: null,
                });
            },
        },
        from(tabela) {
            return {
                _tabela: tabela,
                _op: 'select',
                _payload: null,
                select() { return this; },
                eq() { return this; },
                in() { return this; },
                update(payload) { this._op = 'update'; this._payload = payload; return this; },
                // Thenable: o `await` do script.js cai aqui.
                then(resolve, reject) {
                    let r;
                    if (this._op === 'update') {
                        log.escritas.push({ tabela: this._tabela, payload: this._payload });
                        r = { data: null, error: null };
                    } else {
                        log.leituras.push(this._tabela);
                        r = { data: dados[this._tabela] || [], error: null };
                    }
                    return Promise.resolve(r).then(resolve, reject);
                },
            };
        },
    };
}

// A sessao e conferida pela funcao de verdade do script.js, nao por uma copia:
// se ela mudar de nome ou de regra, este harness quebra junto, como deve.
const FONTE_COMPARTILHADA = recortarAsync('temSessaoDoSupabase');

function montar(nome, banco, state, overrides) {
    const window = { location: { origin: 'https://ideal-imposition.vercel.app' } };
    const gravarStatusOverride = (osId, status) => overrides.push({ osId, status });
    return new Function(
        'supabaseClient', 'console', 'state', 'window', 'gravarStatusOverride',
        FONTE_COMPARTILHADA + '\n' + recortarAsync(nome) + '\nreturn ' + nome + ';'
    )(banco, { log() {}, warn() {}, error() {} }, state, window, gravarStatusOverride);
}

const DADOS = {
    pedidos_links_cliente: [
        { os_id: 'vibe_21346', numero_pedido: '21346', token: 'abc123', status_arte: 'Em Arte' },
    ],
    imposition_tempo_no_card: [
        { id_int: 21346, card: 'arte', desde: '2026-09-01T12:00:00Z' },
    ],
    pedidos_modelos: [
        { id_int: 21346, status_arte: 'PRONTO' },
        { id_int: 21347, status_arte: 'PRONTO' },
    ],
};

function ordensDeTeste() {
    return [
        { id: 'vibe_21346', numero: '21346', status: 'Em Arte' },   // vai para pedidos_links_cliente
        { id: 'os_21347', numero: '21347', status: 'Em Arte' },     // vai para producao_ordens_servico
    ];
}

// ─── 1. SEM sessao: a estacao nao toca nas tabelas fechadas ──────────────────

(async function semSessaoNaoLeOsLinks() {
    const banco = bancoFalso({ comSessao: false, dados: DADOS });
    const state = {};
    await montar('carregarLinksExistentes', banco, state, [])();

    ok(banco.log.leituras.indexOf('pedidos_links_cliente') < 0,
        'sem sessao, nao le pedidos_links_cliente',
        'leu: ' + JSON.stringify(banco.log.leituras));
})();

(async function semSessaoNaoLeOsTempos() {
    const banco = bancoFalso({ comSessao: false, dados: DADOS });
    const state = {};
    await montar('carregarTemposNoCard', banco, state, [])();

    ok(banco.log.leituras.indexOf('imposition_tempo_no_card') < 0,
        'sem sessao, nao le imposition_tempo_no_card',
        'leu: ' + JSON.stringify(banco.log.leituras));
    // A coluna "Tempo" precisa degradar para "--" em vez de mentir um relogio:
    // e `temposNoCardAtivo` que segura tambem as ESCRITAS de troca de card.
    ok(state.temposNoCardAtivo === false,
        'sem sessao, a coluna Tempo fica desligada (nao escreve troca de card)',
        'temposNoCardAtivo=' + state.temposNoCardAtivo);
})();

(async function semSessaoNaoGravaStatusDoPedidoVibe() {
    const banco = bancoFalso({ comSessao: false, dados: DADOS });
    const state = { ordens: ordensDeTeste() };
    const overrides = [];
    await montar('sincronizarPedidosProntosParaEnvio', banco, state, overrides)();

    const escritas = banco.log.escritas.map(e => e.tabela);
    ok(escritas.indexOf('pedidos_links_cliente') < 0,
        'sem sessao, nao grava status_arte em pedidos_links_cliente',
        'escreveu: ' + JSON.stringify(escritas));

    // O ponto principal: sem gravacao no banco, o override local nao pode
    // existir -- senao a estacao mostra "Enviar Arte" e o banco nao tem.
    const overrideDoVibe = overrides.find(o => o.osId === 'vibe_21346');
    ok(!overrideDoVibe,
        'sem sessao, nao marca o pedido do Vibe no localStorage da estacao',
        JSON.stringify(overrides));
    ok(state.ordens[0].status === 'Em Arte',
        'sem sessao, o status em memoria do pedido do Vibe fica como estava',
        state.ordens[0].status);
})();

// ─── 2. SEM sessao, o que a estacao PODE fazer continua funcionando ──────────
//
// `producao_ordens_servico` e liberada para o `anon` de proposito -- e por ela
// que a estacao trabalha. Cortar essa sincronizacao junto seria tirar da
// estacao algo que hoje funciona.

(async function semSessaoAindaSincronizaAOrdemPropria() {
    const banco = bancoFalso({ comSessao: false, dados: DADOS });
    const state = { ordens: ordensDeTeste() };
    const overrides = [];
    await montar('sincronizarPedidosProntosParaEnvio', banco, state, overrides)();

    const escritas = banco.log.escritas.map(e => e.tabela);
    ok(escritas.indexOf('producao_ordens_servico') >= 0,
        'sem sessao, AINDA sincroniza producao_ordens_servico (liberada ao anon)',
        'escreveu: ' + JSON.stringify(escritas));
    ok(!!overrides.find(o => o.osId === 'os_21347'),
        'sem sessao, o override local da ordem propria continua',
        JSON.stringify(overrides));
})();

// ─── 3. COM sessao: o site nao muda em nada ──────────────────────────────────

(async function comSessaoLeOsLinks() {
    const banco = bancoFalso({ comSessao: true, dados: DADOS });
    const state = {};
    await montar('carregarLinksExistentes', banco, state, [])();

    ok(banco.log.leituras.indexOf('pedidos_links_cliente') >= 0,
        'com sessao, le pedidos_links_cliente como sempre',
        'leu: ' + JSON.stringify(banco.log.leituras));
    ok(state.linksCliente && state.linksCliente['vibe_21346']
        && state.linksCliente['vibe_21346'].indexOf('21346-abc123') > 0,
        'com sessao, monta a URL do link do cliente',
        JSON.stringify(state.linksCliente));
})();

(async function comSessaoLeOsTempos() {
    const banco = bancoFalso({ comSessao: true, dados: DADOS });
    const state = {};
    await montar('carregarTemposNoCard', banco, state, [])();

    ok(banco.log.leituras.indexOf('imposition_tempo_no_card') >= 0,
        'com sessao, le imposition_tempo_no_card como sempre',
        'leu: ' + JSON.stringify(banco.log.leituras));
    ok(state.temposNoCardAtivo === true,
        'com sessao, a coluna Tempo fica ligada',
        'temposNoCardAtivo=' + state.temposNoCardAtivo);
})();

(async function comSessaoGravaOsDois() {
    const banco = bancoFalso({ comSessao: true, dados: DADOS });
    const state = { ordens: ordensDeTeste() };
    const overrides = [];
    await montar('sincronizarPedidosProntosParaEnvio', banco, state, overrides)();

    const escritas = banco.log.escritas.map(e => e.tabela);
    ok(escritas.indexOf('pedidos_links_cliente') >= 0,
        'com sessao, grava status_arte em pedidos_links_cliente',
        'escreveu: ' + JSON.stringify(escritas));
    ok(escritas.indexOf('producao_ordens_servico') >= 0,
        'com sessao, grava tambem a ordem propria',
        'escreveu: ' + JSON.stringify(escritas));
    ok(overrides.length === 2,
        'com sessao, os dois pedidos ganham override local',
        JSON.stringify(overrides));
})();

// ─── 4. A conferencia de sessao pergunta ao supabase-js, nao a nos ───────────
//
// Contabilidade propria (`window._currentUser`) desencontra: ela e escrita pelo
// nosso codigo em dois lugares e nao sabe de sessao expirada. Quem responde tem
// de ser o proprio supabase-js, lendo o que esta guardado no navegador.

(function aConferenciaEDoSupabaseJs() {
    const fonte = FONTE_COMPARTILHADA;
    ok(fonte.indexOf('auth.getSession') > 0,
        'temSessaoDoSupabase pergunta ao supabase-js (auth.getSession)');
    ok(fonte.indexOf('_currentUser') < 0,
        'temSessaoDoSupabase nao depende da nossa contabilidade (_currentUser)');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' conferencias falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' conferencias da estacao sem sessao.');
}, 50);
