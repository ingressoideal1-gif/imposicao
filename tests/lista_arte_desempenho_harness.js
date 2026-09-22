// Funções reais; banco, PDF.js e rede simulados. DOM/canvas reais no Chromium.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    const inicio = source.search(new RegExp('\\n(?:async )?function ' + nome + '\\('));
    assert(inicio >= 0, nome);
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
const tick = () => new Promise(r => setImmediate(r));
async function consultas() {
    let ativas = 0, max = 0, chamadas = 0;
    const pendentes = [];
    const ctx = { console: { warn() {} }, supabaseClient: {},
        state: { ordens: Array.from({ length: 12 }, (_, i) => ({ numero: i + 1 })), todasArtes: [] },
        temSessaoDoSupabase: async () => true, pedidoCancelado: () => false,
        pedidoIgnoradoNosPaineis: () => false, pedidoSaiuDaArte: () => false,
        sincronizarStatusConsolidadoPedidoArte: async n => {
            chamadas++; ativas++; max = Math.max(max, ativas);
            await new Promise(r => pendentes.push(r)); ativas--;
            if (n === 3) throw new Error('Falha sintética');
        }
    };
    vm.createContext(ctx);
    vm.runInContext(extrair('reconciliarStatusPersistidosDaListaArte'), ctx);
    const resultado = ctx.reconciliarStatusPersistidosDaListaArte().then(() => null, e => e);
    await tick();
    assert.equal(chamadas, 4, 'quatro pedidos começam sem esperar os demais');
    for (let onda = 0; onda < 3; onda++) {
        pendentes.splice(0).forEach(r => r()); await tick();
    }
    assert.match((await resultado).message, /1 status/, 'a falha não vira sucesso');
    assert.equal(chamadas, 12); assert.equal(max, 4);

    let agora = 1000, tentativas = 0, avisos = 0;
    const num = { id: 'n1' };
    const bancos = { state: {}, console: { warn() {} }, Date: { now: () => agora },
        carregarBancosDoPedidoNovo: async () => 0, idIntDoPedido: () => 1,
        numeracoesSemBancoBaixado: () => num.csv_data === undefined ? [num] : [],
        garantirCsvDaNumeracao: async () => { tentativas++; return num; }
    };
    vm.createContext(bancos); vm.runInContext(extrair('carregarBancosDoPedido'), bancos);
    const carregar = () => bancos.carregarBancosDoPedido('os1', () => avisos++);
    assert.equal(await carregar(), 0, 'retorno sem csv_data não conta como carga');
    assert.equal(await carregar(), 0); assert.equal(tentativas, 1, 'redesenho imediato não repete falha');
    agora += 30001;
    bancos.garantirCsvDaNumeracao = async () => { tentativas++; throw new Error('Offline'); };
    assert.equal(await carregar(), 0, 'exceção também não conta como carga');
    assert.equal(avisos, 0);
    agora += 30001;
    bancos.garantirCsvDaNumeracao = async () => { tentativas++; num.csv_data = null; };
    assert.equal(await carregar(), 1, 'ausência confirmada é diferente de erro');
    assert.equal(avisos, 1); assert.equal(tentativas, 3);
    console.log('PASS: reconciliação limitada, falha reportada, CSV sem repetição e recuperação');
}

async function navegador() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', request => request.abort());
        await page.setContent('<main></main>');
        await page.addScriptTag({ content: ['rasterDaAmostra', 'drawAmostraFace',
            'atualizarDadosDosCardsAmostra', 'escalaDaArteDoModelo'].map(extrair).join('\n') });
        const resultado = await page.evaluate(async () => {
            let asserts = 0;
            const ok = (valor, texto) => { asserts++; if (!valor) throw new Error(texto); };
            window.ESCALA_ARTE_MIN = 1; window.ESCALA_ARTE_MAX = 400;
            window.garantirFontesCarregadas = async () => {};
            window.fontesDosElementos = () => [];
            window.garantirPdfDaCor = async () => {};
            window.fetchPdfBytes = async () => new Uint8Array([2]).buffer;
            const item = { id: 1, _dbLoaded: true, arte_url: 'https://synthetic.invalid/arte.pdf' };
            window.state = { osItens: { os1: [item] } };
            const fmt = { width_mm: 50, height_mm: 30 };
            const cor = { id: 'c1', pdf_base64: btoa('synthetic') };
            const tela = document.createElement('canvas');
            const empty = document.createElement('div');
            let aberturas = 0, desenhos = 0, destruidos = 0, falhar = false;
            const paginas = [], tamanhos = [];
            window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() {
                aberturas++;
                return { destroy: async () => { destruidos++; }, promise: Promise.resolve({
                    numPages: 2, getPage: async pagina => {
                        paginas.push(pagina);
                        return {
                            getViewport: ({ scale }) => ({ width: 100 * scale, height: 60 * scale }),
                            render: ({ canvasContext: ctx, transform }) => {
                                desenhos++;
                                if (falhar) return { promise: Promise.reject(new Error('PDF inválido')) };
                                tamanhos.push([ctx.canvas.width, ctx.canvas.height, transform]);
                                ctx.fillStyle = pagina === 2 ? '#00ff00' : '#ff0000';
                                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                                return { promise: Promise.resolve() };
                            }
                        };
                    }
                }) };
            } };
            const pintar = (face = 'front') => drawAmostraFace(item, face, tela, empty, fmt, cor, null, 0, 'os1', 2);
            const hashes = [];
            for (let i = 0; i < 3; i++) { await pintar(); hashes.push(tela.toDataURL()); }
            ok(aberturas === 2 && desenhos === 2, 'três composições devem rasterizar uma cor e uma arte');
            ok(destruidos === 2, 'documentos/worker liberados após rasterizar');
            ok(hashes.every(h => h === hashes[0]), 'pixels iguais nos repintes');
            const primeiraArte = tamanhos[1];
            item.arte_escala_h = 200; item.arte_escala_v = 50;
            await pintar();
            ok(aberturas === 3, 'alterar escala invalida somente a arte');
            ok(tamanhos[2][0] === Math.round(100 * 2 / 2.8346 * 2)
                && tamanhos[2][1] === Math.round(60 * 2 / 2.8346 * .5), 'escala real por eixo preservada');
            ok(JSON.stringify(tamanhos[2][2]) === '[2,0,0,0.5,0,0]', 'transformação aplicada antes da composição');
            item.arte_url = 'https://synthetic.invalid/outra.pdf';
            await pintar(); ok(aberturas === 4, 'troca do PDF invalida arte');
            cor.pdf_base64 = btoa('different');
            await pintar(); ok(aberturas === 5, 'conteúdo da cor invalida cor');
            await pintar('back');
            ok(paginas[paginas.length - 1] === 2, 'verso usa página 2 da cor');
            ok(destruidos === aberturas, 'nenhum documento permanece aberto');

            // Deduplicação em voo e falha recuperável, independentemente da rede.
            let chamadas = 0, resolver;
            const pendente = () => { chamadas++; return new Promise(r => { resolver = r; }); };
            const um = rasterDaAmostra(['simultaneo'], pendente);
            const dois = rasterDaAmostra(['simultaneo'], pendente);
            await Promise.resolve(); resolver(tela);
            ok((await um) === (await dois) && chamadas === 1, 'mesmo raster em voo é compartilhado');
            try { await rasterDaAmostra(['falha'], () => Promise.reject(Error('falha'))); } catch (_) {}
            ok(await rasterDaAmostra(['falha'], () => tela) === tela, 'falha não envenena cache');
            for (let i = 0; i < 15; i++) await rasterDaAmostra(['limite', i], () => tela);
            ok(rasterDaAmostra.cache.length <= 12, 'cache com limite de entradas');
            await rasterDaAmostra(['grande'], () => ({ width: 5000, height: 5000 }));
            ok(rasterDaAmostra.cache.reduce((n, e) => n + e.bytes, 0) <= 64 * 1024 * 1024, 'bitmap grande não fica retido');
            falhar = true; cor.pdf_base64 = btoa('failure');
            await pintar(); falhar = false; await pintar();
            ok(destruidos === aberturas, 'PDF que falhou também é destruído');

            // Atualização parcial: nós editáveis e canvas reais mantêm identidade.
            const container = document.querySelector('main');
            container.dataset.amostrasOsId = 'os1';
            container.innerHTML = '<textarea id="obs">texto</textarea><canvas id="previa"></canvas>'
                + '<input id="upload" type="file"><div data-amostra-avisos="0">antigo</div>'
                + '<button data-amostra-pronto="0" title="antigo">Pronto</button>';
            const obs = container.querySelector('#obs'), previa = container.querySelector('#previa');
            const upload = container.querySelector('#upload');
            obs.value = 'edição não salva'; obs.focus(); obs.setSelectionRange(2, 7);
            let repintes = 0, consultas = 0;
            window.desenharBoxDeBancos = () => {};
            window.numeracaoDoModelo = () => null;
            window.atualizarNavCsvDaAmostra = () => {};
            window.atualizarBotoesCsvDaAmostra = () => {};
            window.travarCardsDeModelosAprovados = () => {};
            window.desenharCardsAoAparecer = () => { repintes++; };
            for (const nome of ['loadBriefingBase', 'loadAnexosPedido', 'loadUltimosPedidos', 'loadDadosEntregaInterno']) window[nome] = () => { consultas++; };
            const html = '<div data-amostra-avisos="0">Banco incompleto</div>'
                + '<button data-amostra-pronto="0" disabled title="Falta banco">Pronto</button>';
            atualizarDadosDosCardsAmostra('os1', container, html, [item]);
            ok(container.querySelector('#previa') === previa && container.querySelector('#upload') === upload, 'canvas e upload preservados');
            ok(document.activeElement === obs && obs.value === 'edição não salva' && obs.selectionStart === 2, 'edição e seleção preservadas');
            ok(container.querySelector('[data-amostra-pronto]').disabled, 'PRONTO continua bloqueado quando falta banco');
            ok(container.querySelector('[data-amostra-pronto]').title === 'Falta banco', 'motivo da trava atualizado');
            atualizarDadosDosCardsAmostra('os1', container,
                '<div data-amostra-avisos="0"></div><button data-amostra-pronto="0">Pronto</button>', [item]);
            ok(!container.querySelector('[data-amostra-pronto]').disabled
                && !container.querySelector('[data-amostra-pronto]').hasAttribute('title'), 'trava antiga removida após dados válidos');
            atualizarDadosDosCardsAmostra('outro', container, html, [item]);
            ok(repintes === 2 && consultas === 0, 'resposta de outro pedido ignorada e sem repetir consultas auxiliares');
            return { asserts, repintesIniciais: 3, rasterizacoesIniciais: 2, primeiraArte };
        });
        assert.deepEqual(erros, []);
        console.log('PASS browser:', JSON.stringify(resultado));
    } finally { await browser.close(); }
}

async function modelos() {
    let ativas = 0, max = 0;
    const liberacoes = [], lotes = [];
    const ctx = { console: { log() {}, warn() {} }, setTimeout, clearTimeout, AbortController,
        renderOrdens() {},
        state: { ordens: Array.from({ length: 650 }, (_, i) => ({ numero: i + 1 })) },
        normalizarStatusImpressao: v => v, aplicarRegraProdutoPrateleira() {},
        sincronizarAprovacaoProdutosPrateleira: async () => {}, conferirColunasQrIdealDosPedidos() {},
        supabaseClient: { from: () => ({ select: () => ({ in: (coluna, numeros) => {
            ativas++; max = Math.max(max, ativas); lotes.push([...numeros]);
            return new Promise(resolve => liberacoes.push(() => {
                ativas--; resolve({ data: numeros.map(n => ({ id: n, id_int: n, quantidade: 1 })) });
            }));
        } }) }) }
    };
    vm.createContext(ctx); vm.runInContext('let _cargaOrdensEmAndamento = null;\n' + ['lerDadosLista', 'iniciarComplementoLista', 'carregarModelosGlobais'].map(extrair).join('\n'), ctx);
    const carga = ctx.carregarModelosGlobais();
    assert.equal(lotes.length, 3, 'três lotes começam em paralelo');
    liberacoes.splice(0).reverse().forEach(r => r()); await tick();
    liberacoes.splice(0).forEach(r => r()); await carga;
    assert.equal(max, 3); assert.deepEqual(lotes.map(l => l.length), [200, 200, 200, 50]);
    assert.equal(Object.keys(ctx.state.modelosGlobais).length, 650);
    assert.equal(ctx.state.modelosGlobais[650][0].id, 650);
    const anterior = ctx.state.modelosGlobais;
    ctx.supabaseClient = { from: () => ({ select: () => ({ in: async () => ({ error: Error('Offline') }) }) }) };
    await ctx.carregarModelosGlobais();
    assert.equal(ctx.state.modelosGlobais, anterior, 'lote incompleto não substitui o estado anterior');

    // A abertura começa as duas leituras independentes; erro de modelo não é escondido.
    const tabelas = [], soltar = [];
    const abertura = { state: { ordens: [{ id: 'os1', numero: 1 }], osItens: {} },
        console: { error() {} }, toast() {},
        supabaseClient: { from: tabela => {
            const consulta = { select() { return this; }, eq() { return this; }, order() { return this; },
                then(resolve) { tabelas.push(tabela); return new Promise(r => soltar.push(() => {
                    resolve({ error: tabela === 'pedidos_modelos' ? Error('Offline') : null, data: [] }); r();
                })); } };
            return consulta;
        } }
    };
    vm.createContext(abertura); vm.runInContext(extrair('loadOSItens'), abertura);
    const abriu = abertura.loadOSItens('os1'); await tick();
    assert.deepEqual(tabelas, ['pedidos_modelos', 'produtos_proposta']);
    soltar.forEach(r => r()); await abriu;
    assert.equal(abertura.state._loadingOSItens.os1, false);
    assert.equal(abertura.state.osItens.os1, undefined, 'falha não inventa modelos');
    // Prateleira mantém a confirmação individual, mesmo com quatro em voo.
    let escritas = 0, pico = 0;
    const confirmar = [];
    const prateleira = { console: { warn() {} }, state: {},
        temSessaoDoSupabase: async () => true, aplicarRegraProdutoPrateleira() {},
        supabaseClient: { from: () => {
            const filtros = {};
            let payload;
            return { update(dados) { payload = dados; return this; },
                eq(campo, valor) { filtros[campo] = valor; return this; },
                select() {
                    escritas++; pico = Math.max(pico, escritas);
                    return new Promise(resolve => confirmar.push(() => {
                        escritas--; resolve({ data: filtros.id === 2 ? [] : [{ ...filtros, ...payload }] });
                    }));
                }
            };
        } }
    };
    vm.createContext(prateleira); vm.runInContext(extrair('sincronizarAprovacaoProdutosPrateleira'), prateleira);
    const itens = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, id_int: 1,
        _produto_prateleira: true, _foto_produto_url: 'https://synthetic.invalid/foto.jpg' }));
    const gravacao = prateleira.sincronizarAprovacaoProdutosPrateleira(itens);
    await tick(); assert.equal(confirmar.length, 4);
    confirmar.splice(0).forEach(r => r()); await tick();
    confirmar.splice(0).forEach(r => r());
    const resumo = await gravacao;
    assert.equal(pico, 4); assert.equal(resumo.atualizados, 7); assert.equal(resumo.falhas, 1);
    assert.equal(itens[1]._status_arte_persistido, undefined, 'retorno vazio não confirma aprovação');
    assert.equal(itens[0]._amostra_arte_persistida, itens[0]._foto_produto_url);
    console.log('PASS: 650 modelos em quatro lotes, máximo três em voo; abertura paralela e falha preservada');
}

(async () => { await consultas(); await modelos(); await navegador(); })().catch(e => { console.error(e); process.exitCode = 1; });
