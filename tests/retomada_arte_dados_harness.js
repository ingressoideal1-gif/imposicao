// Carregadores reais com transporte e periféricos simulados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const fonte = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8').replace(/\r\n/g, '\n');
function extrair(nome) {
    const inicio = fonte.search(new RegExp('^(?:async )?function ' + nome + '\\(', 'm'));
    assert.notEqual(inicio, -1, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}

function ambiente({ semModelos = false, sessao = true } = {}) {
    const chamadas = [];
    const escritas = [];
    const registro = {
        produtos_proposta: [{ id: 6, id_int: 71, id_produto: 8, nome_produto: 'Sintético' }],
        pedidos_modelos: semModelos ? [] : [{
            id: 792, id_int: 71, id_produto_proposta_origem: 6, nome_modelo: 'Modelo salvo',
            amostra_cor_id: 'c1', amostra_num_id: 'n1', status_arte: 'PRONTO'
        }],
        pedidos_artes: [
            { id_int: 71, id_modelo: 792, versao: 1, url_arquivo: '/arte-anterior.pdf' },
            { id_int: 71, id_modelo: 792, versao: 2, url_arquivo: '/arte-atual.pdf' }
        ],
        produtos: [{ id_produto: 8 }],
        pedidos_links_cliente: [{ os_id: 'vibe_71', numero_pedido: 71, token: 'sintetico' }],
        producao_numeracoes: [{ id: 'n1', name: 'Numeração atual' }]
    };
    let liberarNumeracao;
    const banco = {
        from(tabela) {
            const leitura = { tabela, filtros: {} };
            return {
                select(campos) { leitura.campos = campos; return this; },
                order() { return this; },
                eq(campo, valor) { leitura.filtros[campo] = valor; return this; },
                in(campo, valores) { leitura.filtros[campo] = Array.from(valores); return this; },
                insert() { escritas.push(tabela); throw Error('Escrita inesperada'); },
                then(resolve, reject) {
                    chamadas.push(leitura);
                    return Promise.resolve(tabela === 'producao_numeracoes' && liberarNumeracao
                        ? liberarNumeracao : { data: registro[tabela] }).then(resolve, reject);
                }
            };
        }
    };
    let liberarSaidas;
    const saidas = new Promise(resolve => { liberarSaidas = resolve; });
    const rotasDeCadastro = [];
    const state = { ordens: [], osItens: {}, todasArtes: [], numeracoes: [], modelosGlobais: { 71: ['antigo'] } };
    const ctx = vm.createContext({
        console: { log() {}, warn() {}, error() {} }, window: {
            _currentUser: { id: 'operador-sintetico' }, location: { hostname: 'exemplo.test', protocol: 'https:' }
        },
        state, supabaseClient: banco, vibeClient: banco,
        CLIENTE_BASE_URL: 'https://exemplo.test', COLUNAS_DA_NUMERACAO_NA_LISTA: 'id,name',
        api: async (_metodo, rota) => {
            rotasDeCadastro.push(rota);
            return rota === '/saidas' ? saidas : rota === '/numeracoes' ? [{ id: 'n1', name: 'Catálogo inicial' }] : [];
        },
        consultarFotosProdutosComSessao: async () => ({ data: [] }),
        lerDadosLista: async leitura => typeof leitura === 'function' ? leitura(undefined) : leitura,
        lerLotesDaLista: async (ids, consulta) => consulta(ids),
        consultarPropostas: async consulta => {
            assert.equal(consulta.tipo, 'numeros');
            assert.deepEqual(Array.from(consulta.numeros), [71]);
            return { data: [{ id_int: 71, nome: 'Cliente sintético' }] };
        },
        temSessaoDoSupabase: async () => sessao,
        aplicarNomesPreferenciaisDasPropostas: async () => {},
        carregarHorasDosPrazos: async () => ({}),
        modeloEmCorrecaoDeArte: () => false, arteFoiLancada: () => true,
        pedidosJaNaGrafica: () => new Set(), pedidoEntraNoPainel: () => true,
        nomePreferencialDaProposta: proposta => proposta.nome, lerStatusOverride: () => null,
        VersoDoModelo: { resolver: () => '', temVerso: () => false }, isNumeracaoDuplex: () => false,
        normalizarStatusImpressao: status => status, aplicarRegraProdutoPrateleira() {},
        resolveItemCorNumIds() {}, numeracaoIdDoItem: item => item.amostra_num_id,
        normalizarNumeracaoLida: linha => linha, mesclarNumeracoesNoCatalogo: (lista, atuais) => lista.splice(0, lista.length, ...atuais),
        repararSetoresDosItens() {}, repararProdutosPrateleiraDosItens() {}, renderAll() {},
        sincronizarAprovacaoProdutosPrateleira() {}, toast() {},
        renderOSItens() { throw Error('A leitura pontual não desenha a fila'); }
    });
    vm.runInContext('let _catalogosDaRetomadaArte = null;\n' + [
        'identidadeDaCargaDoPainel', 'carregarCatalogosDeArte', 'loadAll', 'prepararRestauracaoDeArte',
        'loadOrdensFromVibecode', 'loadOSItens', 'recarregarNumeracoesDoPedido'
    ].map(extrair).join('\n'), ctx);
    return {
        ctx, state, chamadas, escritas, liberarSaidas, rotasDeCadastro,
        pausarNumeracao(promessa) { liberarNumeracao = promessa; }
    };
}

test('F5 recarrega o modelo persistido sem esperar saídas e compartilha os catálogos', async () => {
    const a = ambiente();
    const abertura = a.ctx.prepararRestauracaoDeArte('vibe_71', () => true, false);
    const cargaGeral = a.ctx.loadAll();
    try {
        const os = await abertura;
        assert.equal(os.id, 'vibe_71');
        assert.equal(a.state.saidas, undefined);
        assert.equal(a.rotasDeCadastro.filter(rota => rota === '/numeracoes').length, 1);
        const [item] = a.state.osItens[os.id];
        assert.equal(item._pedidoModeloId, 792);
        assert.equal(item.arte_url, '/arte-atual.pdf');
        assert.equal(item.amostra_status, 'PRONTO');
        assert.equal(a.state.numeracoes[0].name, 'Numeração atual');
        for (const tabela of ['produtos_proposta', 'pedidos_modelos', 'pedidos_artes']) {
            const leituras = a.chamadas.filter(chamada => chamada.tabela === tabela);
            assert.deepEqual(leituras.map(leitura => leitura.filtros.id_int), [71], tabela);
        }
        assert.equal(a.chamadas.find(chamada => chamada.tabela === 'producao_numeracoes').campos, 'id,name');
        assert.equal(a.chamadas.some(chamada => chamada.tabela === 'propostas_os'), false, 'prazo não bloqueia o editor');
        assert.equal(a.escritas.length, 0);
    } finally {
        a.liberarSaidas([]);
        await cargaGeral;
    }
});

test('pedido sem modelo persistido orienta voltar à lista sem criar registro', async () => {
    const a = ambiente({ semModelos: true, sessao: false });
    await assert.rejects(a.ctx.prepararRestauracaoDeArte('71', () => true, true), /pela Lista de Arte/);
    assert.equal(a.state.osItens.vibe_71, undefined);
    assert.deepEqual(a.escritas, []);
    assert.equal(a.chamadas.some(chamada => chamada.tabela === 'pedidos_links_cliente'), false);
});

test('resultado de numeração atrasado não altera o pedido nem o catálogo', async () => {
    const a = ambiente();
    let atual = true;
    let liberar;
    a.pausarNumeracao(new Promise(resolve => { liberar = resolve; }));
    const abertura = a.ctx.prepararRestauracaoDeArte('71', () => atual, true);
    await new Promise(resolve => setImmediate(resolve));
    assert(a.chamadas.some(chamada => chamada.tabela === 'producao_numeracoes'));
    atual = false;
    liberar({ data: [{ id: 'n1' }] });
    assert.equal(await abertura, null);
    assert.equal(a.state.osItens.vibe_71, undefined);
    assert.deepEqual(a.state.numeracoes, []);
});
