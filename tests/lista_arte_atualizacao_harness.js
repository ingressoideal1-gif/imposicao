// Relógio simulado e carregador real, com todas as integrações substituídas.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const fonte = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    let inicio = fonte.indexOf(`function ${nome}(`);
    assert.ok(inicio >= 0, nome);
    if (fonte.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
function pendente() {
    let resolver;
    const promessa = new Promise(r => { resolver = r; });
    return { promessa, resolver };
}
function ambiente() {
    const intervalos = [];
    const lista = { classList: { contains: () => true }, offsetParent: {} };
    const chamadas = { fetch: 0, render: 0, erros: 0, produtos: 0, avisos: 0 };
    const ctx = {
        state: { ordens: [], osItens: {} }, supabaseClient: null, vibeClient: null,
        API_BASE_URL: 'http://teste.invalid',
        window: { location: { hostname: 'localhost' } },
        document: { hidden: false, getElementById: id => id === 'view-lista-arte' ? lista : null },
        console: { log() {}, warn() {}, error() {} },
        setInterval: (fn, ms) => { intervalos.push({ fn, ms }); },
        atualizarRelogiosDaLista() {}, ressincronizarStatusInterno() {},
        conferirNovosPedidosDoUsuario() { chamadas.avisos++; },
        carregarArtesGlobais: async () => {}, carregarLinksExistentes: async () => {},
        carregarTemposNoCard: async () => {}, loadUsuarios: async () => {},
        carregarModelosGlobais: async () => {}, carregarPagamentosGlobais: async () => {},
        sincronizarStatusOrdensDinamico: async () => {},
        renderOrdens() { chamadas.render++; }, toast() { chamadas.erros++; },
        fetch: async () => {
            chamadas.fetch++;
            return { ok: true, json: async () => [{ id: 'local', numero: chamadas.fetch, cliente: 'Sintético' }] };
        },
    };
    vm.createContext(ctx);
    vm.runInContext([
        fonte.match(/let _cargaOrdensEmAndamento = null;/)[0],
        fonte.match(/let _relogioDaListaLigado = false;/)[0],
        ...['loadOrdens', 'carregarOrdensDados', 'atualizarListaArteAutomaticamente',
            'ligarRelogioDaLista'].map(extrair),
    ].join('\n'), ctx);
    ctx.ligarRelogioDaLista();
    ctx.ligarRelogioDaLista();
    assert.equal(intervalos.length, 3, 'não duplica os relógios ao redesenhar a lista');
    const timer = intervalos.find(i => i.fn.name === 'atualizarListaArteAutomaticamente');
    assert.equal(timer.ms, 60000);
    return { ctx, lista, chamadas, tick: timer.fn };
}

(async () => {
    const { ctx, lista, chamadas, tick } = ambiente();
    await tick();
    assert.equal(chamadas.fetch, 1);
    assert.equal(ctx.state.ordens[0].numero, 1);
    await tick();
    assert.equal(ctx.state.ordens[0].numero, 2, 'o segundo ciclo traz dados novos');
    assert.equal(chamadas.avisos, 2, 'cada carga concluída verifica os novos pedidos');
    ctx.document.hidden = true;
    await tick();
    ctx.document.hidden = false;
    lista.classList.contains = () => false;
    await tick();
    lista.classList.contains = () => true;
    lista.offsetParent = null;
    await tick();
    assert.equal(chamadas.fetch, 2, 'pausa com aba ou Lista de Arte oculta');
    lista.offsetParent = {};

    const fim = pendente();
    const entrou = pendente();
    ctx.carregarModelosGlobais = () => { entrou.resolver(); return fim.promessa; };
    const manual = ctx.loadOrdens();
    assert.equal(ctx.loadOrdens(), manual, 'cliques simultâneos compartilham a consulta');
    await entrou.promessa;
    await tick();
    assert.equal(chamadas.fetch, 3, 'o relógio aguarda também os modelos complementares');
    fim.resolver();
    await manual;
    await tick();
    assert.equal(chamadas.fetch, 4, 'retoma após terminar a consulta');

    const fetchOk = ctx.fetch;
    ctx.fetch = async () => { throw new Error('falha simulada'); };
    const anteriores = ctx.state.ordens;
    await tick();
    assert.equal(chamadas.erros, 1);
    assert.equal(ctx.state.ordens, anteriores, 'falha de rede conserva a lista anterior');
    assert.equal(chamadas.avisos, 4, 'falha não gera aviso de pedido novo');
    ctx.fetch = fetchOk;
    await tick();
    assert.equal(chamadas.fetch, 5, 'falha não deixa a trava presa');
    assert.equal(chamadas.avisos, 5);

    // Caminho principal: a trava cobre pagamentos e sincronização após o primeiro desenho.
    const vibe = ambiente();
    vibe.ctx.vibeClient = { from: () => ({ select: () => ({ order: async () => {
        vibe.chamadas.produtos++;
        return { data: [{ id: 1, id_int: 123 }] };
    } }) }) };
    vibe.ctx.loadOrdensFromVibecode = async () => {
        vibe.ctx.state.ordens = [{ id: 'vibe_123', numero: 123 }];
        return true;
    };
    const pagamento = pendente();
    const iniciouPagamento = pendente();
    vibe.ctx.carregarPagamentosGlobais = () => { iniciouPagamento.resolver(); return pagamento.promessa; };
    const primeira = vibe.tick();
    await iniciouPagamento.promessa;
    await vibe.tick();
    assert.equal(vibe.chamadas.produtos, 1);
    pagamento.resolver();
    await primeira;
    await vibe.tick();
    assert.equal(vibe.chamadas.produtos, 2);
    assert.equal(vibe.chamadas.fetch, 0, 'não cai no fallback quando o Vibecode responde');
    console.log('OK: atualização em 60 s, pausa fora da tela, dados novos, concorrência com botão, cargas complementares e recuperação de falha.');
})().catch(e => { console.error(e); process.exit(1); });
