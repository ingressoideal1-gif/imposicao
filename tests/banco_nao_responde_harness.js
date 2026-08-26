// A BARRA DE "O BANCO NAO ESTA RESPONDENDO" (26/08/2026).
//
// Nada aqui e copia da regra: o `frontend/banco-nao-responde.js` inteiro e
// executado dentro de um DOM de mentira, e o que se mede e o que ele desenha e
// o que ele deixa passar pelo `fetch`.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. so chamada ao BANCO entra na conta — agente local, Storage e Edge
//      Function ficam de fora, e cada um por um motivo diferente;
//   2. chamada rapida nao pisca nada na tela;
//   3. passado o limite, a barra aparece e diz o que fazer;
//   4. resposta boa depois da barra vira o aviso de que o banco voltou, e ele
//      sai sozinho;
//   5. chamada presa que FALHA nao apaga a barra — falhar nao e voltar;
//   6. erro 5xx do banco nao conta como "voltou";
//   7. o `fetch` embrulhado devolve a mesma resposta e propaga o mesmo erro;
//   8. NENHUMA chamada e cancelada — a promessa original chega inteira a quem
//      pediu, que e o que impede uma gravacao de ser refeita em duplicata.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const FONTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'banco-nao-responde.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── Um DOM de mentira, do tamanho exato do que a barra pede ────────────────

function criarElemento(tag) {
    const classes = new Set();
    const el = {
        tag,
        id: '',
        className: '',
        type: '',
        textContent: '',
        filhos: [],
        atributos: {},
        parentNode: null,
        cliques: [],
        style: {},
        classList: {
            add: c => classes.add(c),
            remove: c => classes.delete(c),
            contains: c => classes.has(c),
        },
        setAttribute: (n, v) => { el.atributos[n] = v; },
        getAttribute: n => (el.atributos[n] !== undefined ? el.atributos[n] : null),
        addEventListener: (evento, fn) => { if (evento === 'click') el.cliques.push(fn); },
        appendChild: f => { f.parentNode = el; el.filhos.push(f); return f; },
        removeChild: f => {
            const i = el.filhos.indexOf(f);
            if (i >= 0) el.filhos.splice(i, 1);
            f.parentNode = null;
            return f;
        },
        get innerHTML() { return el.filhos.map(f => f.tag).join(''); },
        set innerHTML(v) { if (v === '') el.filhos = []; },
    };
    return el;
}

function textoDe(el) {
    if (!el) return '';
    return (el.textContent || '') + el.filhos.map(textoDe).join(' ');
}

function acharPorId(el, id) {
    if (!el) return null;
    if (el.id === id) return el;
    for (const f of el.filhos) {
        const achado = acharPorId(f, id);
        if (achado) return achado;
    }
    return null;
}

// ─── O ambiente: relogios sob controle e um `fetch` que eu decido quando ─────
//    responde. Sem isso o teste esperaria 15 segundos de verdade por caso.

function montar() {
    const head = criarElemento('head');
    const body = criarElemento('body');
    const document = {
        head, body,
        createElement: criarElemento,
        getElementById: id => acharPorId(head, id) || acharPorId(body, id),
    };

    // O `fetch` de baixo: devolve uma promessa que EU resolvo na hora que
    // quiser, para simular a chamada que fica pendurada.
    const emAberto = [];
    const window = {
        location: { reload: () => { window.recarregou = true; } },
        recarregou: false,
        fetch: function (url) {
            let resolver, rejeitar;
            const p = new Promise((s, n) => { resolver = s; rejeitar = n; });
            emAberto.push({ url, resolver, rejeitar });
            return p;
        },
    };

    // Os relogios: nada dispara sozinho. O teste bate o ponteiro na mao.
    const intervalos = [];
    const atrasos = [];
    const setInterval = fn => { intervalos.push(fn); return intervalos.length; };
    const clearInterval = () => {};
    const setTimeout = fn => { atrasos.push(fn); return atrasos.length; };
    const clearTimeout = () => {};

    new Function('window', 'document', 'setInterval', 'clearInterval',
                 'setTimeout', 'clearTimeout', FONTE)(
        window, document, setInterval, clearInterval, setTimeout, clearTimeout);

    let relogio = 1000000;
    window.bancoNaoResponde._usarRelogio(() => relogio);

    return {
        window, document, emAberto, atrasos,
        api: window.bancoNaoResponde,
        avancar: ms => { relogio += ms; },
        barra: () => document.getElementById('banco-fora'),
        texto: () => textoDe(document.getElementById('banco-fora')).replace(/\s+/g, ' '),
        // Responde a chamada mais antiga ainda pendurada.
        responder: (resposta) => {
            const c = emAberto.shift();
            c.resolver(resposta === undefined ? { status: 200 } : resposta);
            return new Promise(s => process.nextTick(s));
        },
        falhar: (erro) => {
            const c = emAberto.shift();
            c.rejeitar(erro || new Error('rede caiu'));
            return new Promise(s => process.nextTick(s));
        },
    };
}

const BANCO = 'https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/print_agents?select=id';

// ─── 1. Quem entra na conta, e quem fica de fora ────────────────────────────

(function quemContaComoChamadaAoBanco() {
    const amb = montar();
    const e = amb.api.eOBanco;

    ok(e(BANCO), 'consulta ao banco (rest/v1) entra na conta');
    ok(e('https://vwbtitjlpelrcnsytzqw.supabase.co/auth/v1/token?grant_type=password'),
       'login (auth/v1) entra na conta — ele tambem fala com o banco');

    // Os tres que ficam de fora, e o motivo de cada um.
    ok(!e('/api/impose'),
       'o agente local fica de fora: impor leva minutos por natureza');
    ok(!e('http://127.0.0.1:9000/api/fontes'),
       'o agente local por endereco absoluto tambem fica de fora');
    ok(!e('https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/fontes/a.ttf'),
       'o Storage fica de fora: subir arquivo grande passa dos 15s sem problema');
    ok(!e('https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/painel/api/fontes'),
       'a Edge Function fica de fora: no dia da queda ela respondia em 110ms');
    ok(!e(''), 'url vazia nao quebra nem entra na conta');
})();

// ─── 2. Chamada rapida nao pisca nada ───────────────────────────────────────

(async function chamadaRapidaNaoDesenhaNada() {
    const amb = montar();
    amb.window.fetch(BANCO);
    ok(amb.api.pendentes() === 1, 'a chamada ao banco entrou na conta');

    amb.avancar(200);          // 200 ms: o tempo normal medido
    amb.api.olhar();
    ok(amb.barra() === null, 'chamada de 200ms nao desenha barra nenhuma');

    await amb.responder({ status: 200 });
    ok(amb.api.pendentes() === 0, 'respondida, a chamada sai da conta');
    ok(amb.api.estado() === 'oculto', 'e a tela continua limpa');
    ok(amb.barra() === null, 'sem barra: nada piscou na cara do operador');
})();

// ─── 3. Passado o limite, a barra aparece e diz o que fazer ─────────────────

(async function passadoOLimiteAbarraAparece() {
    const amb = montar();
    amb.window.fetch(BANCO);

    amb.avancar(amb.api.LIMITE_MS - 1000);
    amb.api.olhar();
    ok(amb.barra() === null, 'a 14 segundos ainda nao ha barra: o limite e 15');

    amb.avancar(2000);
    amb.api.olhar();
    const barra = amb.barra();
    ok(barra !== null, 'passado o limite, a barra aparece');
    ok(amb.api.estado() === 'travado', 'e o estado diz que a tela esta travada');

    const t = amb.texto();
    ok(t.indexOf('banco de dados nao esta respondendo') !== -1
       || t.indexOf('banco de dados não está respondendo') !== -1,
       'a barra diz, em portugues, o que aconteceu', t);
    ok(t.indexOf('internet') !== -1,
       'e separa o que NAO e o problema: a internet daqui', t);

    // A saida, que e a razao de a barra existir.
    const botao = amb.document.getElementById('bf-recarregar');
    ok(botao !== null, 'a barra oferece um botao — trava sem saida nao pode');
    ok(botao.textContent.indexOf('Tentar de novo') !== -1,
       'e o botao diz o que ele faz', botao.textContent);
    botao.cliques.forEach(fn => fn());
    ok(amb.window.recarregou === true, 'tocar no botao recarrega a pagina');

    // Bater o relogio de novo nao pode empilhar barra.
    amb.api.olhar();
    amb.api.olhar();
    ok(amb.document.body.filhos.filter(f => f.id === 'banco-fora').length === 1,
       'o relogio batendo de novo nao empilha uma segunda barra');
})();

// ─── 4. O banco volta: a tela avisa sozinha e depois se recolhe ─────────────

(async function quandoOBancoVoltaAtelaAvisaSozinha() {
    const amb = montar();
    amb.window.fetch(BANCO);
    amb.avancar(amb.api.LIMITE_MS + 1);
    amb.api.olhar();
    ok(amb.api.estado() === 'travado', 'partimos da tela travada');

    await amb.responder({ status: 200 });
    ok(amb.api.estado() === 'voltou', 'resposta boa vira o aviso de que voltou');
    const t = amb.texto();
    ok(t.indexOf('voltou a responder') !== -1,
       'e ele diz isso com todas as letras, sem ninguem perguntar', t);
    ok(amb.barra().classList.contains('voltou'),
       'a barra troca de cor: o verde de trabalho feito');

    // O alivio sai sozinho — foi para o `setTimeout` que o arnes segura.
    ok(amb.atrasos.length === 1, 'o alivio agendou a propria saida');
    amb.atrasos[0]();
    ok(amb.api.estado() === 'oculto', 'e some');
    ok(amb.barra() === null, 'sem sobrar nada na tela');
})();

// ─── 5. Falhar nao e voltar ─────────────────────────────────────────────────

(async function chamadaPresaQueFalhaNaoApagaAbarra() {
    const amb = montar();
    const p = amb.window.fetch(BANCO);
    p.catch(() => {});
    amb.avancar(amb.api.LIMITE_MS + 1);
    amb.api.olhar();
    ok(amb.api.estado() === 'travado', 'partimos da tela travada');

    await amb.falhar(new Error('timeout'));
    ok(amb.api.pendentes() === 0, 'a chamada saiu da conta');
    ok(amb.api.estado() === 'travado',
       'mas a barra FICA: o navegador desistir nao e o banco voltar');
    ok(amb.barra() !== null, 'e ela continua na tela, com o botao de saida');

    amb.api.olhar();
    ok(amb.barra() !== null, 'nem a proxima batida do relogio a apaga');
})();

// ─── 6. Erro 5xx do banco nao conta como "voltou" ───────────────────────────

(async function erro5xxNaoContaComoBancoDePe() {
    const amb = montar();
    amb.window.fetch(BANCO);
    amb.avancar(amb.api.LIMITE_MS + 1);
    amb.api.olhar();

    await amb.responder({ status: 522 });   // o codigo exato do dia da queda
    ok(amb.api.estado() === 'travado',
       '522 e o gateway dizendo que a origem nao atendeu — nao e o banco voltando');

    const amb2 = montar();
    amb2.window.fetch(BANCO);
    amb2.avancar(amb2.api.LIMITE_MS + 1);
    amb2.api.olhar();
    await amb2.responder({ status: 401 });
    ok(amb2.api.estado() === 'voltou',
       '401 conta: quem respondeu foi o PostgREST, entao o banco esta de pe');
})();

// ─── 7 e 8. O `fetch` embrulhado e transparente ─────────────────────────────

(async function oFetchEmbrulhadoNaoMudaNadaParaQuemChamou() {
    const amb = montar();

    const respostaOriginal = { status: 200, corpo: 'os dados' };
    const p = amb.window.fetch(BANCO);
    await amb.responder(respostaOriginal);
    const recebida = await p;
    ok(recebida === respostaOriginal,
       'quem chamou recebe EXATAMENTE a resposta de baixo, sem copia no meio');

    const erroOriginal = new Error('rede caiu');
    const p2 = amb.window.fetch(BANCO);
    const capturado = p2.then(() => null, e => e);
    await amb.falhar(erroOriginal);
    ok((await capturado) === erroOriginal,
       'e o mesmo erro, propagado inteiro para o `catch` de quem chamou');

    // A garantia que impede gravacao duplicada: NADA e cancelado. Uma chamada
    // presa ha muito mais que o limite continua viva e ainda pode responder.
    const amb3 = montar();
    const p3 = amb3.window.fetch(BANCO);
    amb3.avancar(amb3.api.LIMITE_MS * 10);
    amb3.api.olhar();
    ok(amb3.emAberto.length === 1, 'a chamada presa continua aberta, nao foi abortada');
    await amb3.responder({ status: 200 });
    ok((await p3).status === 200,
       'e quando o banco enfim responde, a resposta chega a quem pediu');

    // Chamada que nao e do banco passa direto, sem entrar na conta.
    const amb4 = montar();
    amb4.window.fetch('/api/impose');
    ok(amb4.api.pendentes() === 0, 'a imposicao no agente local nao entra na conta');
    amb4.avancar(amb4.api.LIMITE_MS * 100);
    amb4.api.olhar();
    ok(amb4.barra() === null,
       'e imposicao demorada NUNCA desenha a barra — ela leva minutos por natureza');
})();

// ─── Fecho ──────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da barra do banco fora do ar passaram.');
}, 50);
