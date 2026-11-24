const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '../frontend/navegacao-painel.js'), 'utf8');
const aposPromessas = () => new Promise(resolve => setImmediate(resolve));
const telaArte = 'view-amostras';
const telaInicial = 'view-lista-arte';

function ambiente({ osId = 'vibe_101', dono = 'usuario-a', permitido = true, url = '/?piloto=1#arte' } = {}) {
    const location = new URL(url, 'https://painel.sintetico.invalid');
    const ordem = { id: osId, numero: 101 };
    const chamadas = { tela: [], focal: [], lista: [], modelos: [], cards: [], avisos: [] };
    const state = { ordens: [] };
    const storage = new Map();
    const eventos = {};
    const conteudo = { style: { display: '' } };
    const secao = {
        children: [conteudo],
        classList: { contains: classe => classe === 'view-section' },
        prepend(el) { this.children.unshift(el); },
    };
    const document = {
        getElementById: () => secao,
        createElement() {
            return {
                atributos: {},
                setAttribute(nome, valor) { this.atributos[nome] = valor; },
                remove() { secao.children = secao.children.filter(el => el !== this); },
            };
        },
    };
    const history = {
        state: osId ? {
            idealNavegacaoV1: { caminho: location.pathname, dono: 'usuario-a', rota: { view: telaArte, osId } },
        } : null,
        replaceState(dados, _titulo, endereco) {
            assert.equal(endereco, undefined, 'preserva endereço, busca e âncora');
            this.state = dados;
        },
        pushState(dados, titulo, endereco) { this.replaceState(dados, titulo, endereco); },
    };
    const window = {
        location, history, _currentUser: { id: dono },
        addEventListener(nome, ouvir) { eventos[nome] = ouvir; },
        podeAbrirView: view => permitido || view === telaInicial,
        showView: view => chamadas.tela.push(view),
        toast: texto => chamadas.avisos.push(texto),
        pedidoDoLinkDireto: () => location.pathname.match(/^\/pedido\/(\d+)$/)?.[1],
        prepararRestauracaoDeArte(id, aindaAtual, dadosCarregados) {
            return new Promise((resolver, rejeitar) => {
                chamadas.focal.push({ id, aindaAtual, dadosCarregados, resolver, rejeitar });
            });
        },
        findOSInState: id => state.ordens.find(os => os.id === id),
        async loadOrdens(opcoes) {
            chamadas.lista.push(opcoes.completa);
            state.ordens.push(ordem);
        },
        async loadOSItens(id) { chamadas.modelos.push(id); },
        renderAmostrasOSItens(id) { chamadas.cards.push(id); },
    };
    vm.runInNewContext(fonte, {
        window, state, console, document,
        sessionStorage: {
            getItem: chave => storage.get(chave),
            setItem: (chave, valor) => storage.set(chave, valor),
            removeItem: chave => storage.delete(chave),
        },
    });
    return { window, state, ordem, chamadas, secao, conteudo, eventos, nav: window.NavegacaoPainel };
}

for (const { nome, opcoes, id } of [
    { nome: 'pedido restaurado pelo histórico', opcoes: {}, id: 'vibe_101' },
    { nome: 'pedido restaurado pelo link direto', opcoes: { osId: null, url: '/pedido/101?piloto=1#arte' }, id: '101' },
]) {
    test(nome, async () => {
        const { window, state, chamadas, secao, conteudo, nav } = ambiente(opcoes);
        const url = window.location.href;
        assert.deepEqual(chamadas.focal, [], 'não consulta o pedido antes de iniciar a navegação autenticada');
        nav.iniciar(telaInicial);
        await aposPromessas();
        assert.equal(chamadas.tela[0], telaArte);
        assert.equal(chamadas.focal.length, 1);
        assert.equal(chamadas.focal[0].id, id);
        assert.equal(chamadas.focal[0].aindaAtual(), true);
        assert.equal(chamadas.focal[0].dadosCarregados, false);
        assert.equal(secao.children[0].atributos.role, 'status');
        assert.match(secao.children[0].textContent, /Carregando artes do pedido #101/);
        assert.equal(conteudo.style.display, 'none');

        chamadas.focal[0].resolver({ id: 'vibe_101', numero: 101 });
        await aposPromessas();
        assert.equal(state.amostrasOSAtivo, 'vibe_101');
        assert.deepEqual(chamadas.cards, ['vibe_101'], 'mostra a edição antes de dadosProntos');
        nav.dadosProntos();
        await aposPromessas();
        assert.equal(chamadas.focal.length, 1, 'fim da carga global não reabre o pedido');
        assert.deepEqual(chamadas.lista, []);
        assert.deepEqual(chamadas.modelos, [], 'a preparação já trouxe os modelos');
        assert.deepEqual(chamadas.cards, ['vibe_101']);
        assert.equal(window.location.href, url);
        assert.deepEqual(secao.children, [conteudo]);
        assert.equal(conteudo.style.display, '');
    });
}

test('troca de conta ou permissão negada descartam o pedido do histórico', async () => {
    for (const opcoes of [{ dono: 'usuario-b' }, { permitido: false }]) {
        const { chamadas, nav } = ambiente(opcoes);
        nav.iniciar(telaInicial);
        nav.dadosProntos();
        await aposPromessas();
        assert.deepEqual(chamadas.focal, []);
        assert.deepEqual(chamadas.lista, []);
        assert(chamadas.tela.length > 0);
        assert(chamadas.tela.every(view => view === telaInicial));
    }
});

test('resposta da abertura abandonada não volta ao pedido', async () => {
    const { state, ordem, chamadas, secao, conteudo, nav } = ambiente();
    nav.iniciar(telaInicial);
    await aposPromessas();
    assert.equal(chamadas.focal.length, 1);
    const consulta = chamadas.focal[0];
    nav.registrar(telaInicial);
    assert.equal(consulta.aindaAtual(), false);
    assert.deepEqual(secao.children, [conteudo]);
    assert.equal(conteudo.style.display, '');
    consulta.resolver(ordem);
    await aposPromessas();
    assert.deepEqual(chamadas.cards, []);
    assert.deepEqual(chamadas.avisos, []);
    assert.equal(state.amostrasOSAtivo, undefined);
});

test('alternar pedidos pelo histórico mantém apenas a abertura mais recente', async () => {
    const { state, window, ordem, chamadas, secao, conteudo, eventos, nav } = ambiente();
    nav.iniciar(telaInicial);
    await aposPromessas();
    assert.equal(chamadas.focal.length, 1);
    const anterior = chamadas.focal[0];
    window.history.state.idealNavegacaoV1.rota = { view: telaArte, osId: 'vibe_102' };
    eventos.popstate();
    await aposPromessas();
    assert.equal(anterior.aindaAtual(), false);
    assert.equal(chamadas.focal[1].id, 'vibe_102');

    anterior.resolver(ordem);
    await aposPromessas();
    assert.deepEqual(chamadas.cards, []);
    assert.equal(secao.children[0].atributos.role, 'status');
    assert.equal(conteudo.style.display, 'none');

    chamadas.focal[1].resolver({ id: 'vibe_102', numero: 102 });
    await aposPromessas();
    assert.deepEqual(chamadas.cards, ['vibe_102']);
    assert.equal(state.amostrasOSAtivo, 'vibe_102');
    assert.deepEqual(secao.children, [conteudo]);
    assert.deepEqual(chamadas.lista, []);
});

test('falha de leitura exibe aviso e volta à tela inicial', async () => {
    const { chamadas, secao, conteudo, nav } = ambiente();
    nav.iniciar(telaInicial);
    await aposPromessas();
    assert.equal(chamadas.focal.length, 1);
    chamadas.focal[0].rejeitar(new Error('Erro sintético na leitura'));
    await aposPromessas();
    assert.match(chamadas.avisos[0], /Erro sintético na leitura/);
    assert.equal(chamadas.tela.at(-1), telaInicial);
    assert.deepEqual(chamadas.lista, [], 'falha focal não aciona uma carga global pela restauração');
    assert.deepEqual(chamadas.cards, []);
    assert.deepEqual(secao.children, [conteudo]);
    assert.equal(conteudo.style.display, '');
});

test('identificador legado continua com o fluxo existente', async () => {
    const { state, ordem, chamadas, nav } = ambiente({ osId: 'local-antigo' });
    nav.iniciar(telaInicial);
    await aposPromessas();
    assert.deepEqual(chamadas.focal, []);
    assert.deepEqual(chamadas.lista, []);
    nav.dadosProntos();
    await aposPromessas();
    assert.deepEqual(chamadas.lista, [true]);
    assert.deepEqual(chamadas.modelos, [ordem.id]);
    assert.deepEqual(chamadas.cards, [ordem.id]);
    assert.equal(state.amostrasOSAtivo, ordem.id);
});
