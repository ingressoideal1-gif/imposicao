// O Painel do Acabamento (20/08/2026).
//
// Nada aqui e copia da regra: o `frontend/acabamento.js` inteiro e executado
// dentro de um DOM de mentira, e o que se mede e o HTML que ele produz.
//
// O que estes testes protegem, em uma frase cada:
//
//  1. a tela lista os MESMOS pedidos da Fila de Producao;
//  2. o estagio do acabamento e um campo separado do status de impressao;
//  3. o pedido so sai da fila quando TODOS os modelos estao prontos;
//  4. a amostra mostrada e a que o cliente aprovou pelo link;
//  5. amostra em PDF nao vira imagem -- vira atalho para o arquivo;
//  6. o pedido aberto e SOMENTE LEITURA: dois seletores, e nada mais;
//  7. nao ha imposicao, impressora, PDF nem agente local em lugar nenhum.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const FONTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'acabamento.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── Um DOM de mentira, do tamanho exato do que a tela pede ──────────────────

function criarElemento(id) {
    const classes = new Set();
    return {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        style: {},
        dataset: {},
        classList: {
            add: c => classes.add(c),
            remove: c => classes.delete(c),
            contains: c => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        appendChild: () => {},
        addEventListener: () => {},
        getAttribute: () => null,
        setAttribute: () => {},
    };
}

function montarAmbiente() {
    const elementos = {};
    const documento = {
        getElementById(id) {
            if (!elementos[id]) elementos[id] = criarElemento(id);
            return elementos[id];
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        createElement: id => criarElemento(id),
        addEventListener: () => {},
        body: { appendChild: () => {} },
    };

    const janela = {
        escapeHtml: v => String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        rotuloDoCliente: os => os.cliente || '',
        logoDoFreteHtml: f => '<span class="frete">' + f + '</span>',
        formatPrazoBadge: () => '<span class="prazo"></span>',
        previewDaArteDoPedidoHtml: () => '<img class="preview" />',
        pedidoEstaAtrasado: os => !!os._atrasado,
        pedidoEhParaHoje: os => !!os._hoje,
        normalizarStatusImpressao: s => s || 'Aguardando',
        findOSInState: id => (janela.state.ordens || []).find(o => String(o.id) === String(id)) || null,
        loadOrdens: () => Promise.resolve(),
        loadOSItens: () => Promise.resolve(),
        toast: () => {},
        state: { ordens: [], osItens: {}, modelosGlobais: {}, cores: [], numeracoes: [], produtosGlobais: [], todasArtes: [] },
        _currentPerms: null,
    };

    // Um `supabaseClient` de mentira: o construtor do Supabase e "thenable" no
    // fim da cadeia, entao basta o `.order()` devolver a promessa.
    const banco = {
        // O perfil importa: desde 22/08/2026 so o 'acabamento' entra no seletor
        // de responsavel. Gustavo esta aqui para provar que os outros ficam de
        // fora.
        _operadores: [
            { id: 1, nome: 'Bernardo Farias', role: 'acabamento', ativo: true },
            { id: 2, nome: 'Cesar Almeida', role: 'acabamento', ativo: true },
            { id: 3, nome: 'Quem Saiu', role: 'acabamento', ativo: false },
            { id: 4, nome: 'Gustavo Impressor', role: 'impressor', ativo: true },
        ],
        _gravacoes: [],
        _modelosDoBanco: [],
        _encerradosTeste: [],
        _erroDoBanco: null,

        // A ficha de expedicao do parceiro: `propostas_os_setores`.
        _setoresDoBanco: [],       // [{ id, id_int, setor, peso_real_kg }]
        _osDoBanco: [],            // [{ id, id_int }] -- `propostas_os`
        _pesosGravados: [],        // o que a tela mandou, na ordem
        _erroAoGravarPeso: null,
        _propostasGravadas: [],    // as escritas em `propostas` (a expedicao)
        _erroAoExpedir: null,
        // As linhas da proposta, de onde sai o peso ESTIMADO por setor
        // (21/08/2026): `produtos_proposta`, so leitura, `peso_total` em GRAMAS.
        _produtosDaProposta: [],   // [{ id, id_int, id_produto, qtd, peso_total }]

        // Os VOLUMES (23/08/2026). Tabelas NOSSAS: um caminho so, sem sessao e
        // sem agente -- e e isso que os testes daqui provam.
        _volumesDoBanco: [],       // producao_volumes
        _itensDeVolume: [],        // producao_volume_itens
        _volumesGravados: [],      // o que a tela mandou, na ordem
        _erroAoGravarVolume: null,
        _proximoIdDeVolume: 1,

        _sessao: { user: { id: 'u1' } },   // null = estacao, sem sessao

        auth: {
            getSession() {
                return Promise.resolve({ data: { session: banco._sessao }, error: null });
            },
        },

        from(tabela) {
            const self = this;

            if (tabela === 'produtos_proposta') {
                // Leitura publica, e so leitura: `select(...).eq('id_int', n)`
                // e thenable no fim, como o construtor do Supabase.
                const filtros = {};
                const leitura = {
                    eq: (c, v) => { filtros[c] = v; return leitura; },
                    then: (res, rej) => Promise.resolve({
                        data: self._produtosDaProposta.filter(l =>
                            filtros.id_int === undefined || String(l.id_int) === String(filtros.id_int)),
                        error: null,
                    }).then(res, rej),
                };
                return { select: () => leitura };
            }

            if (tabela === 'propostas_os') {
                const filtros = {};
                const cadeia = {
                    select: () => cadeia,
                    eq: (c, v) => { filtros[c] = v; return cadeia; },
                    limit: () => Promise.resolve({
                        data: self._osDoBanco.filter(o => String(o.id_int) === String(filtros.id_int)),
                        error: null,
                    }),
                };
                return cadeia;
            }

            if (tabela === 'propostas_os_setores') {
                const filtros = {};
                const achar = () => self._setoresDoBanco.filter(l =>
                    (filtros.id_int === undefined || String(l.id_int) === String(filtros.id_int)) &&
                    (filtros.setor === undefined || String(l.setor) === String(filtros.setor)));

                const leitura = {
                    eq: (c, v) => { filtros[c] = v; return leitura; },
                    then: (res, rej) => Promise.resolve({ data: achar(), error: null }).then(res, rej),
                };

                let payload = null;
                const escrita = {
                    eq: (c, v) => { filtros[c] = v; return escrita; },
                    select: () => {
                        const alvo = achar();
                        alvo.forEach(l => Object.assign(l, payload));
                        self._pesosGravados.push({ tipo: 'update', filtros: { ...filtros }, payload });
                        return Promise.resolve({
                            data: alvo.map(l => ({ id: l.id })),
                            error: self._erroAoGravarPeso,
                        });
                    },
                    then: (res, rej) => {
                        const alvo = achar();
                        alvo.forEach(l => Object.assign(l, payload));
                        self._pesosGravados.push({ tipo: 'update', filtros: { ...filtros }, payload });
                        return Promise.resolve({ error: self._erroAoGravarPeso }).then(res, rej);
                    },
                };

                return {
                    select: () => leitura,
                    update: (p) => { payload = p; return escrita; },
                    insert: (linha) => {
                        self._pesosGravados.push({ tipo: 'insert', linha });
                        const jaTem = self._setoresDoBanco.some(l =>
                            String(l.id_int) === String(linha.id_int) && l.setor === linha.setor);
                        if (jaTem) return Promise.resolve({ error: { code: '23505' } });
                        self._setoresDoBanco.push({ id: 'novo-' + linha.setor, ...linha });
                        return Promise.resolve({ error: self._erroAoGravarPeso });
                    },
                };
            }

            if (tabela === 'producao_volumes') {
                const filtros = {};
                const achar = () => self._volumesDoBanco.filter(l =>
                    (filtros.id_int === undefined || String(l.id_int) === String(filtros.id_int)) &&
                    (filtros.id === undefined || String(l.id) === String(filtros.id)));

                const leitura = {
                    eq: (c, v) => { filtros[c] = v; return leitura; },
                    then: (res, rej) => Promise.resolve({
                        // O recurso embutido do PostgREST: cada volume ja vem
                        // com os itens dele, que e como a tela pede.
                        data: achar().map(v => Object.assign({}, v, {
                            producao_volume_itens: self._itensDeVolume
                                .filter(i => String(i.volume_id) === String(v.id))
                                .map((i, n) => ({
                                    id: i.id || ('pac-' + v.id + '-' + n),
                                    modelo_id: i.modelo_id,
                                    qtd: i.qtd,
                                    responsavel: i.responsavel || null,
                                })),
                        })),
                        error: null,
                    }).then(res, rej),
                };

                let payload = null;
                const escrita = {
                    eq: (c, v) => { filtros[c] = v; return escrita; },
                    then: (res, rej) => {
                        achar().forEach(l => Object.assign(l, payload));
                        self._volumesGravados.push({ tipo: 'update', filtros: { ...filtros }, payload });
                        return Promise.resolve({ error: self._erroAoGravarVolume }).then(res, rej);
                    },
                };

                const remocao = {
                    eq: (c, v) => { filtros[c] = v; return remocao; },
                    then: (res, rej) => {
                        const fora = achar().map(l => String(l.id));
                        self._volumesDoBanco = self._volumesDoBanco.filter(l => fora.indexOf(String(l.id)) === -1);
                        // `on delete cascade` da tabela
                        self._itensDeVolume = self._itensDeVolume.filter(i => fora.indexOf(String(i.volume_id)) === -1);
                        self._volumesGravados.push({ tipo: 'delete', filtros: { ...filtros } });
                        return Promise.resolve({ error: self._erroAoGravarVolume }).then(res, rej);
                    },
                };

                return {
                    select: () => leitura,
                    update: (p) => { payload = p; return escrita; },
                    delete: () => remocao,
                    insert: (linha) => {
                        self._volumesGravados.push({ tipo: 'insert', linha });
                        // A trava `producao_volumes_unico (id_int, setor, numero)`.
                        const repetido = self._volumesDoBanco.some(l =>
                            String(l.id_int) === String(linha.id_int) &&
                            l.setor === linha.setor &&
                            Number(l.numero) === Number(linha.numero));
                        return {
                            select: () => ({
                                single: () => {
                                    if (repetido) {
                                        return Promise.resolve({
                                            data: null,
                                            error: { message: 'producao_volumes_unico' },
                                        });
                                    }
                                    if (self._erroAoGravarVolume) {
                                        return Promise.resolve({ data: null, error: self._erroAoGravarVolume });
                                    }
                                    const id = 'vol-' + (self._proximoIdDeVolume++);
                                    self._volumesDoBanco.push(Object.assign({ id }, linha));
                                    return Promise.resolve({ data: { id }, error: null });
                                },
                            }),
                        };
                    },
                };
            }

            if (tabela === 'producao_volume_itens') {
                const filtros = {};
                const remocao = {
                    eq: (c, v) => { filtros[c] = v; return remocao; },
                    then: (res, rej) => {
                        self._itensDeVolume = self._itensDeVolume.filter(i =>
                            String(i.volume_id) !== String(filtros.volume_id));
                        return Promise.resolve({ error: null }).then(res, rej);
                    },
                };
                return {
                    delete: () => remocao,
                    insert: (linhas) => {
                        (linhas || []).forEach(l => self._itensDeVolume.push(Object.assign({}, l)));
                        self._volumesGravados.push({ tipo: 'itens', linhas });
                        return Promise.resolve({ error: null });
                    },
                };
            }

            if (tabela === 'imposition_operadores') {
                return { select: () => ({ order: () => Promise.resolve({ data: self._operadores, error: null }) }) };
            }
            if (tabela === 'propostas') {
                return {
                    select: () => ({
                        // `.not('encerrado_teste_em', 'is', null)` -- o filtro e
                        // do lado do banco, entao aqui basta devolver a lista.
                        not: () => Promise.resolve({ data: self._encerradosTeste, error: null }),
                    }),
                    // O envio para a expedicao (21/08/2026): a UNICA escrita
                    // desta tela na tabela principal do parceiro.
                    update(payload) {
                        const filtros = {};
                        const cadeia = {
                            eq: (c, v) => { filtros[c] = v; return cadeia; },
                            then: (res, rej) => {
                                self._propostasGravadas.push({ payload, filtros: { ...filtros } });
                                return Promise.resolve({ error: self._erroAoExpedir }).then(res, rej);
                            },
                        };
                        return cadeia;
                    },
                };
            }
            return {
                select: () => ({
                    in: () => Promise.resolve(self._erroDoBanco
                        ? { data: null, error: self._erroDoBanco }
                        : { data: self._modelosDoBanco, error: null }),
                }),
                update(payload) {
                    return {
                        eq(coluna, valor) {
                            self._gravacoes.push({ tabela, payload, coluna, valor });
                            return Promise.resolve({ error: null });
                        },
                    };
                },
            };
        },
    };

    // `supabaseClient` chega como parametro: o arquivo pergunta por ele com
    // `typeof`, e sem o parametro isso seria um ReferenceError aqui.
    new Function('window', 'document', 'supabaseClient', FONTE)(janela, documento, banco);

    return { janela, documento, elementos, banco, painel: janela.AcabamentoPainel };
}

// ─── 1. A populacao da lista ────────────────────────────────────────────────

(function aListaEaMesmaDaProducao() {
    const { painel } = montarAmbiente();
    const ehDeProducao = painel._regras.ehDeProducao;

    ok(ehDeProducao({ status_interno: 'EM PRODUCAO' }), 'pedido EM PRODUCAO entra');
    ok(ehDeProducao({ status_interno: 'EM PRODUÇÃO' }), 'com cedilha e til tambem');
    ok(ehDeProducao({ status_interno: 'em producao' }), 'em caixa baixa tambem');
    ok(ehDeProducao({ status_interno: 'EM IMPRESSAO' }), 'EM IMPRESSAO entra -- e o mesmo recorte da Producao');
    ok(!ehDeProducao({ status_interno: 'LIBERADO' }), 'LIBERADO nao entra: e estado comercial');
    ok(!ehDeProducao({ status_interno: 'EM ARTE' }), 'pedido em arte nao entra');
    ok(!ehDeProducao({}), 'pedido sem status_interno nao entra');
})();

// ─── 2. O estagio do acabamento ─────────────────────────────────────────────

(function oEstagioNasceDoQueOBancoJaSabe() {
    // Regra de 20/08/2026, depois de o usuario ver a tela: o seletor nunca nasce
    // vazio. Modelo ja impresso entra como "Impresso"; o resto, como
    // "Aguardando". E DERIVACAO, nao gravacao -- desenhar a tela nao escreve.
    const { painel } = montarAmbiente();
    const { estagioDoModelo, estagioDoPedido, estagioDerivadoDaImpressao } = painel._regras;

    ok(estagioDoModelo({}) === 'Aguardando', 'modelo sem nada entra como Aguardando');
    ok(estagioDoModelo({ acabamento_status: null }) === 'Aguardando', 'nulo tambem');
    ok(estagioDoModelo({ status_impressao: 'Impresso' }) === 'Impresso',
       'modelo ja impresso entra como Impresso');
    ok(estagioDoModelo({ status_impressao: 'Aguardando' }) === 'Aguardando',
       'modelo que ainda nao saiu da impressora entra como Aguardando');
    ok(estagioDerivadoDaImpressao({ status_impressao: 'Parcial' }) === 'Aguardando',
       'meia impressao nao chegou ao acabamento');
    ok(estagioDerivadoDaImpressao({ status_impressao: 'Revisão' }) === 'Aguardando',
       'problema na impressao tambem nao chegou');

    // O que alguem escolheu VENCE o derivado, sempre.
    ok(estagioDoModelo({ status_impressao: 'Impresso', acabamento_status: 'Pronto' }) === 'Pronto',
       'a escolha do operador vence o derivado');
    // ...mas "Aguardando" NAO e uma escolha: e a ausencia de trabalho nesta
    // mesa. Corrigido em 21/08/2026 com o pedido 19775 na mao, onde AVRA e
    // WHISPER estavam IMPRESSO na Producao e Aguardando aqui -- e a tela
    // mostrava Aguardando para sempre, mentindo sobre o mundo fisico.
    ok(estagioDoModelo({ status_impressao: 'Impresso', acabamento_status: 'Aguardando' }) === 'Impresso',
       'Aguardando gravado nao trava o que a impressora ja terminou');
    ok(estagioDoModelo({ status_impressao: 'Aguardando', acabamento_status: 'Aguardando' }) === 'Aguardando',
       'e o que ainda nao saiu da impressora continua Aguardando');
    ok(estagioDoModelo({ status_impressao: 'Impresso', acabamento_status: 'Em acabamento' }) === 'Em acabamento',
       'as OUTRAS tres escolhas continuam vencendo o derivado');
    ok(estagioDoModelo({ acabamento_status: 'em acabamento' }) === 'Em acabamento',
       'a caixa das letras nao muda o estagio');

    ok(estagioDoPedido([]) === 'Aguardando', 'pedido sem modelo fica Aguardando');
    ok(estagioDoPedido([{}, {}]) === 'Aguardando', 'nenhum modelo impresso: Aguardando');
    ok(estagioDoPedido([{ status_impressao: 'Impresso' }, {}]) === 'Impresso',
       'um impresso ja tira o pedido do Aguardando');
    ok(estagioDoPedido([{ acabamento_status: 'Pronto' }, { acabamento_status: 'Impresso' }]) === 'Em acabamento',
       'um pronto no meio de outros ainda e trabalho em curso');
    ok(estagioDoPedido([{ acabamento_status: 'Pronto' }, { acabamento_status: 'Pronto' }]) === 'Pronto',
       'so e Pronto quando TODOS estao prontos');

    // O nome ANTIGO, que ficou no banco ate a migracao rodar. Em 21/08/2026 o
    // ultimo estagio deixou de se chamar "Revisado"; a tela le o nome velho como
    // "Pronto" para nao tirar da conta de concluidos o que ja estava concluido.
    ok(estagioDoModelo({ acabamento_status: 'Revisado' }) === 'Pronto',
       'o "Revisado" gravado antes de 21/08/2026 e lido como Pronto');
    ok(estagioDoPedido([{ acabamento_status: 'Revisado' }, { acabamento_status: 'Pronto' }]) === 'Pronto',
       'o nome antigo e o novo contam como o mesmo estagio');

    // E o acabamento continua sem NUNCA escrever no campo do outro setor.
    ok(FONTE.indexOf('status_impressao:') === -1, 'nunca grava status_impressao');
})();

// ─── 3. O pedido pronto sai da fila de trabalho ─────────────────────────────

function pedido(n, modelos, extra) {
    return Object.assign({ id: 'os-' + n, numero: n, cliente: 'Cliente ' + n, status_interno: 'EM PRODUCAO' },
                         extra || {});
}

function ambienteComPedidos(pedidos, modelosPorPedido) {
    const amb = montarAmbiente();
    amb.janela.state.ordens = pedidos;
    pedidos.forEach(p => {
        amb.janela.state.modelosGlobais[parseInt(p.numero)] = modelosPorPedido[p.numero] || [];
    });
    return amb;
}

(function oProntoSaiDaFila() {
    const pedidos = [pedido(101), pedido(102)];
    const modelos = {
        101: [{ id: 1, acabamento_status: 'Pronto', quantidade: 10 }],
        102: [{ id: 2, acabamento_status: 'Em acabamento', quantidade: 20 }],
    };
    const amb = ambienteComPedidos(pedidos, modelos);

    amb.painel.render();
    let html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>102<') !== -1, 'o pedido em acabamento aparece na fila');
    ok(html.indexOf('>101<') === -1, 'o pedido todo pronto NAO aparece na fila geral');

    amb.painel.setFiltroPrazo('prontos');
    html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>101<') !== -1, 'com o recorte "Pronto" ligado ele reaparece');
    ok(html.indexOf('>102<') === -1, 'e o que ainda esta em acabamento sai');

    // As metricas contam a fila inteira, e nao o recorte visivel.
    ok(amb.elementos['stat-acab-pedidos-fila'].textContent === 2,
       'a metrica de pedidos conta a fila inteira', amb.elementos['stat-acab-pedidos-fila'].textContent);
    ok(amb.elementos['stat-acab-modelos-prontos'].textContent === 1, 'um modelo pronto');
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1, 'um modelo em acabamento');
    ok(amb.elementos['stat-acab-pedidos-concluidos'].textContent === 1, 'um pedido concluido');
    ok(amb.elementos['badge-acabamento'].textContent === 2, 'o badge do menu conta a fila inteira');
})();

// ─── 3b. O cache da proposta nao responde pelo modelo ───────────────────
//
// Antes de o pedido ser aberto, `state.osItens` guarda o que veio da PROPOSTA do
// parceiro: uma linha por produto contratado, sem `status_impressao`. O pedido
// 20975 chegava assim — um item de 320 — enquanto o banco tinha oito modelos de
// 40, todos impressos. A lista mostrava "Aguardando" e "0/1 mod.".

(function oCacheDaPropostaNaoRespondePeloModelo() {
    const pedidos = [pedido(20975)];
    const modelos = {
        20975: [
            { id: 1000440, status_impressao: 'IMPRESSO', quantidade: 40 },
            { id: 1000441, status_impressao: 'IMPRESSO', quantidade: 40 },
        ],
    };
    const amb = ambienteComPedidos(pedidos, modelos);
    amb.janela.state.osItens['os-20975'] = [{ id: 'vibe-1', _source: 'vibecode', quantidade: 80 }];

    amb.painel.render();
    let html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('Impresso') !== -1, 'pedido impresso nao aparece como Aguardando');
    ok(html.indexOf('2 modelos') !== -1, 'conta os modelos do banco, e nao a linha da proposta');

    // Com os itens de verdade carregados, eles voltam a mandar.
    amb.janela.state.osItens['os-20975'] = [
        { id: 1000440, status_impressao: 'IMPRESSO', quantidade: 40, _dbLoaded: true },
    ];
    amb.painel.render();
    html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('1 modelo<') !== -1, 'a lista completa vence quando veio mesmo do banco');
})();

// ─── 4 e 5. A amostra ───────────────────────────────────────────────────────

(function aAmostraEaQueOClienteAprovou() {
    const { painel } = montarAmbiente();
    const { amostraDoModelo, ehPdf } = painel._regras;

    const composta = 'https://x.supabase.co/storage/v1/object/public/amostras_renderizadas/123.jpg';
    const arte = 'https://x.supabase.co/storage/v1/object/public/artes/456.jpg';

    let r = amostraDoModelo({ amostra_arte_base64: composta, arte_url: arte });
    ok(r.src === composta, 'a amostra composta do link do cliente vence a arte crua');
    ok(r.aprovada === true, 'e ela e marcada como a que o cliente aprovou');

    r = amostraDoModelo({ arte_url: arte });
    ok(r.src === arte, 'sem amostra composta, vale a arte do modelo');
    ok(r.aprovada === false, 'e essa NAO se anuncia como aprovada pelo cliente');

    ok(amostraDoModelo({}).src === '', 'modelo sem nada nao inventa imagem');

    ok(ehPdf('https://x/y/arte.pdf'), 'url .pdf e PDF');
    ok(ehPdf('data:application/pdf;base64,JVBERi0x'), 'base64 de PDF e PDF');
    ok(!ehPdf('https://x/y/arte.jpg'), 'jpg nao e PDF');
})();

// ─── 6 e 7. O pedido aberto ─────────────────────────────────────────────────

function ambienteComPedidoAberto() {
    const os = pedido(200);
    const amb = ambienteComPedidos([os], { 200: [] });
    amb.janela.state.cores = [{ id: 7, name: 'Azul Ideal', cor_referencia: '#1e40af' }];
    amb.janela.state.numeracoes = [{ id: 9, name: 'QR Ideal', tipo: 'QR_IDEAL' }];
    amb.janela.state.produtosGlobais = [{ id_produto: 55, nomeReal: 'Ingresso Cartao', setor_pcp: 'FLEXO' }];
    amb.janela.state.osItens['os-200'] = [
        {
            id: 3001, produto: 'Pista Inteira', modelo: '3001', _vibe_id_produto: 55,
            amostra_cor_id: 7, amostra_num_id: 9, verso_tipo: 'Frente',
            qtd: 500, num_inicial: 1, num_final: 500, bloco: 100,
            status_impressao: 'Impresso',
            amostra_arte_base64: 'https://x/amostras_renderizadas/3001.jpg',
            acabamento_status: 'Em acabamento',
            acabamento_responsavel: 'Bernardo Farias',
        },
        {
            id: 3002, produto: 'Camarote', modelo: '3002', _vibe_id_produto: 55,
            amostra_cor_id: 7, amostra_num_id: 9, verso_tipo: 'FxVerso',
            qtd: 200, num_inicial: 501, num_final: 700,
            status_impressao: 'Impresso',
            arte_url: 'https://x/artes/3002.pdf',
        },
    ];
    amb.janela._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: true };
    return amb;
}

(function oPedidoAbertoESomenteLeitura() {
    const amb = ambienteComPedidoAberto();
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    // Agrupado por produto, com o nome real e o setor.
    ok(html.indexOf('Ingresso Cartao') !== -1, 'a caixa do produto traz o nome real');
    ok(html.indexOf('FLEXO') !== -1, 'e o setor do produto');

    // As informacoes do modelo aparecem -- como TEXTO.
    ok(html.indexOf('Pista Inteira') !== -1, 'o nome do modelo aparece');
    ok(html.indexOf('Azul Ideal') !== -1, 'a cor aparece pelo nome');
    ok(html.indexOf('QR Ideal') !== -1, 'a numeracao aparece pelo nome');
    ok(html.indexOf('FxVerso') !== -1, 'o verso aparece');
    ok(html.indexOf('500') !== -1, 'a quantidade aparece');

    // A amostra, em tamanho grande e clicavel para ampliar.
    ok(html.indexOf('amostras_renderizadas/3001.jpg') !== -1, 'a amostra aprovada e exibida');
    ok(/AcabamentoPainel\.ampliar\(/.test(html), 'e da para ampliar a amostra');
    ok(html.indexOf('max-height: 360px') !== -1, 'a amostra sai em bom tamanho, nao como miniatura');

    // Pedidos de 20/08/2026, depois de ver a tela.
    ok(html.indexOf('background: #ffffff') === -1, 'nao ha chapa branca atras da amostra');

    // As imagens: sem fio e sem canto arredondado, como nas outras janelas de
    // imagem do projeto, e centradas na altura da caixa.
    const imagens = html.match(/<img[^>]*>/g) || [];
    // O segundo modelo do cenario e um PDF: vira atalho, nao <img>. Por isso um.
    ok(imagens.length >= 1, 'ha imagem de amostra no modelo que tem imagem');
    imagens.forEach(tag => {
        ok(tag.indexOf('border-radius') === -1, 'imagem sem canto arredondado', tag.slice(0, 90));
        ok(!/border:\s*1px/.test(tag), 'imagem sem fio de contorno', tag.slice(0, 90));
    });
    ok((html.match(/align-items: center; justify-content: center;/g) || []).length >= 2,
       'a metade da amostra centra na altura');
    ok(html.indexOf('align-items: stretch') !== -1,
       'a linha estica, para "no meio" ser o meio da caixa');
    // Tres colunas por modelo desde 22/08/2026, a pedido do usuario: a amostra
    // (elastica), a especificacao (metade da largura que tinha) e, a direita
    // dela, as decisoes -- os quatro botoes de status empilhados e o responsavel
    // abaixo deles. Antes eram duas colunas e uma faixa de decisoes no rodape.
    const amostras = html.match(/flex: 1 1 200px/g) || [];
    ok(amostras.length === 2, 'a amostra e a coluna elastica, uma por modelo', amostras.length);
    const espec = html.match(/flex: 0 1 280px/g) || [];
    ok(espec.length === 2, 'a especificacao ficou estreita, uma por modelo', espec.length);
    const decisoes = html.match(/flex: 0 1 210px/g) || [];
    ok(decisoes.length === 2, 'e a coluna das decisoes fica a direita dela', decisoes.length);
    // A ordem na tela: especificacao, depois status, depois responsavel.
    const umModelo = html.slice(html.indexOf('Pista Inteira'), html.indexOf('Camarote'));
    const posEspec = umModelo.indexOf('Especificação');
    const posStatus = umModelo.indexOf('Status do acabamento');
    const posResp = umModelo.indexOf('Responsável');
    ok(posEspec < posStatus && posStatus < posResp,
       'a ordem e especificacao, status e responsavel', { posEspec, posStatus, posResp });

    // Amostra em PDF vira atalho, e nunca imagem: rasterizar a arte do cliente
    // esta fora de cogitacao neste projeto.
    ok(html.indexOf('Amostra em PDF') !== -1, 'a amostra em PDF vira atalho para o arquivo');
    ok(html.indexOf('<img id="acab-amostra-os-200-3002') === -1,
       'a amostra em PDF NAO e rasterizada em imagem');

    // UM seletor por modelo -- o do responsavel. O estagio virou botoes em
    // 22/08/2026, a pedido do usuario.
    const selects = html.match(/<select/g) || [];
    ok(selects.length === 2, 'um seletor por modelo (o responsavel), dois modelos = dois', 'achei ' + selects.length);
    ok(html.indexOf('— Status —') === -1, 'nao ha opcao vazia de estagio');

    // Os quatro estagios, como botoes do mesmo tamanho, um por estagio e por
    // modelo. Se um sumir, o operador perde o caminho para aquele ponto.
    ['Aguardando', 'Impresso', 'Em acabamento', 'Pronto'].forEach(e => {
        const quantos = (html.match(new RegExp('data-estagio="' + e + '"', 'g')) || []).length;
        ok(quantos === 2, 'o estagio "' + e + '" tem um botao em cada um dos dois modelos', quantos);
    });
    // Empilhados numa coluna so (22/08/2026): mesma coluna da grade, mesmo tamanho.
    ok(/grid-template-columns: 1fr/.test(html), 'os quatro botoes ficam um abaixo do outro');
    ok(/AcabamentoPainel\.mudarEstagio\(/.test(html), 'o botao de estagio grava o acabamento');

    // O botao do estagio ATUAL e o unico marcado, em cada modelo. O 3001 esta
    // em "Em acabamento"; o 3002 nao tem estagio gravado e deriva "Impresso"
    // do status de impressao.
    const marcados = (html.match(/aria-pressed="true"/g) || []).length;
    ok(marcados === 2, 'um unico botao marcado por modelo', marcados);
    const doModelo3001 = html.slice(html.indexOf('Pista Inteira'), html.indexOf('Camarote'));
    ok(/data-estagio="Em acabamento" aria-pressed="true"/.test(doModelo3001),
       'o botao marcado e o do estagio em que o modelo esta');
    ok(doModelo3001.indexOf('✓') !== -1, 'e o marcado se ve de relance');
    ok(/AcabamentoPainel\.mudarResponsavel\(/.test(html), 'o seletor de responsavel grava o acabamento');
    ok(html.indexOf('Bernardo Farias') !== -1, 'o responsavel ja gravado aparece escolhido');

    // Nada de editar o que e da Producao. O UNICO campo digitavel da tela e o
    // peso por setor, que mora no box acima dos modelos (21/08/2026) -- e por
    // isso a conta e feita sobre o pedaco DOS MODELOS, e nao sobre o corpo todo.
    const soOsModelos = html.slice(html.indexOf('Ingresso Cartao'));
    ok((soOsModelos.match(/<input/g) || []).length === 0,
       'nenhum campo digitavel na linha dos modelos');
    ok((html.match(/<input/g) || []).length === (html.indexOf('acab-peso-') !== -1 ? 1 : 0),
       'os unicos inputs da tela sao os do peso por setor');
    ok((html.match(/type="checkbox"/g) || []).length === 0, 'nao ha caixa de selecao de modelo');
    [
        'pedQueueUpdateField', 'pedQueueUpdateCor', 'pedQueueUpdateNum',
        'updateBoxFormato', 'updateBoxSaida', 'enviarParaPedido',
        'runImposition', 'imprimir', 'Imprimir', 'Gerar PDF', 'impressora',
    ].forEach(proibido => {
        ok(html.indexOf(proibido) === -1, 'o pedido aberto nao traz "' + proibido + '"');
    });

    ok(amb.elementos['acab-detalhe-progresso'].textContent === '0/2 prontos',
       'o cabecalho conta os prontos', amb.elementos['acab-detalhe-progresso'].textContent);
})();

(function semPermissaoDeEditarOsSeletoresTravam() {
    const amb = ambienteComPedidoAberto();
    amb.janela._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: false };
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    // Por modelo: o seletor do responsavel, os QUATRO botoes de estagio e o
    // botao da camera = seis. Dois modelos = doze.
    ok((html.match(/disabled/g) || []).length === 12,
       'quem so tem VER encontra os seletores, os botoes e a camera travados',
       'achei ' + (html.match(/disabled/g) || []).length);
    // Nenhum botao de estagio escapa: um solto grava o acabamento de quem so ve.
    const botoes = html.match(/<button[^>]*data-estagio="[^"]*"[^>]*>/g) || [];
    ok(botoes.length === 8, 'oito botoes de estagio na tela', botoes.length);
    ok(botoes.every(b => b.indexOf('disabled') !== -1), 'e todos travados');
    // Travado apaga, mas nao apaga a INFORMACAO: o marcado continua marcado.
    ok((html.match(/aria-pressed="true"/g) || []).length === 2,
       'quem so ve continua enxergando em que ponto cada modelo esta');
    ok(html.indexOf('apenas permiss\u00e3o de ver') !== -1,
       'e a camera travada explica por que esta travada');
})();

// ─── 7. O arquivo nao fala com o MOTOR, e com o agente so pelo peso ─────────

(function nadaDeMotorNemDeAgente() {
    // Medido sobre o CODIGO, e nao sobre uma tela: um caminho que so aparece em
    // certa condicao nao seria pego por nenhum render de teste.
    const codigo = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    [
        '/api/impose', '127.0.0.1:9000', 'MOTOR_NUVEM',
        'runImposition', 'imprimirNoAgente', '/api/print', '/api/status',
        'atualizarPainelProducao', 'setProdSort', 'renderPedOSQueue',
    ].forEach(proibido => {
        ok(codigo.indexOf(proibido) === -1,
           'o acabamento.js nao chama "' + proibido + '"');
    });

    // ── A UNICA chamada ao agente, e por que ela existe ──────────────────────
    //
    // O menu nasceu em 20/08/2026 sem ligacao NENHUMA com o agente local, e a
    // regra continua valendo para tudo o que e do motor: impor, gerar PDF,
    // imprimir, perguntar a versao do NewProd.
    //
    // O que mudou em 21/08/2026 foi outra coisa: o usuario decidiu que a
    // digitacao do peso e a escolha dos drops seriam feitas pelo acesso local do
    // agente. O peso mora em tabela do parceiro com RLS de `authenticated`, e a
    // estacao e `anon` -- sem uma porta propria, o campo aceitaria o valor e
    // nada seria gravado.
    //
    // Entao ha QUATRO rotas: tres da FICHA DE EXPEDICAO -- peso, carimbo do
    // setor e o envio para a expedicao -- e, desde 21/08/2026, a conferencia da
    // SENHA DE LIBERACAO do peso, que nao e da ficha: o agente so repassa o que
    // o operador digitou e devolve sim ou nao. Nenhuma e do motor. Este teste
    // existe para que continuem sendo quatro.
    const ESPERADAS = ['expedicao', 'peso-setores', 'senha-liberacao', 'setor-concluido'];
    const rotas = [...new Set(
        (codigo.match(/urlDaEstacao\('([a-z0-9-]+)'/g) || [])
            .map(m => m.replace(/^urlDaEstacao\('/, '').replace(/'$/, ''))
    )].sort();
    ok(rotas.join(',') === ESPERADAS.join(','),
       'as rotas de agente no acabamento.js sao as tres da ficha e a da senha', rotas.join(','));

    // E o endereco se monta num lugar so: ha UM `/api/` no arquivo inteiro (o
    // `urlDeApi`, que serve ao agente e a Edge Function do painel). As duas
    // mencoes de API_BASE_URL sao a leitura do identificador nu e a do `window`
    // -- o mesmo par do `estado()`, porque `const` no topo de script classico
    // nao vira propriedade de window --, e as duas ficam dentro do urlDaEstacao.
    const iUrl = codigo.indexOf('function urlDaEstacao(');
    const corpoUrl = codigo.slice(iUrl, codigo.indexOf('\n    }', iUrl));
    ok((codigo.match(/API_BASE_URL/g) || []).length ===
       (corpoUrl.match(/API_BASE_URL/g) || []).length,
       'o endereco do agente so e montado dentro do urlDaEstacao');
    ok((codigo.match(/\/api\//g) || []).length === 1,
       'e ha um unico `/api/` no arquivo inteiro',
       String((codigo.match(/\/api\//g) || []).length));
    // O mesmo vale para o painel: `API_PAINEL` so e lido dentro do urlDoPainel.
    const iPainel = codigo.indexOf('function urlDoPainel(');
    const corpoPainel = codigo.slice(iPainel, codigo.indexOf('\n    }', iPainel));
    ok(iPainel !== -1 && (codigo.match(/API_PAINEL/g) || []).length ===
       (corpoPainel.match(/API_PAINEL/g) || []).length,
       'o endereco do painel so e montado dentro do urlDoPainel');

    // E nao escreve no que e da Producao.
    ok(codigo.indexOf('status_impressao:') === -1, 'nunca grava status_impressao');

    // Nenhum azul da PRODUCAO na pintura desta tela.
    //
    // Isto ficou mais importante em 21/08/2026, nao menos: ate ali o Acabamento
    // era marrom e o olho separava as duas telas sozinho. Agora as duas sao
    // azuis, e o que as distingue e o TIPO -- a Producao e ardosia dessaturada,
    // esta e indigo saturado. E este teste que impede as duas de convergirem.
    //
    // Medido sobre o codigo SEM comentario, porque o comentario da paleta cita
    // os cinco tons justamente para dizer que eles nao entram.
    ['#3b82f6', '#2563eb', '#334155', '#1e293b', '#0f172a'].forEach(cor => {
        ok(codigo.indexOf(cor) === -1, 'o tom ' + cor + ' e da Producao e nao pode estar aqui');
    });
    const gravacoes = codigo.match(/from\('pedidos_modelos'\)\s*\.update\(/g) || [];
    ok(gravacoes.length === 1, 'ha um unico ponto de gravacao', 'achei ' + gravacoes.length);
})();

(function oMenuVoltaParaAPaginaInicial() {
    // Pedido do usuario em 21/08/2026: clicar no menu "Painel do Acabamento"
    // tem de trazer a pagina inicial -- a lista --, e nao o detalhe do pedido
    // que ficou aberto na visita anterior. Sem isto o operador reencontrava a
    // tela de um pedido, sem topo, sem filtros e sem lista, e precisava achar o
    // botao VOLTAR para chegar onde o menu prometia levar.
    const amb = ambienteComPedidoAberto();
    amb.painel.abrirPedido('os-200');
    ok(amb.elementos['acab-detalhe-card'].style.display === 'flex', 'o detalhe abriu');
    ok(amb.elementos['acab-lista-card'].style.display === 'none', 'e a lista saiu de cena');

    amb.painel.aoAbrir();

    ok(amb.elementos['acab-lista-card'].style.display === '', 'o menu devolve a lista');
    ok(amb.elementos['acab-top-bar'].style.display === '', 'com o topo e os filtros de volta');
    ok(amb.elementos['acab-detalhe-card'].style.display === 'none', 'e o detalhe fechado');
})();

(function osCardsDeSetorSomam() {
    // Pedido do usuario em 21/08/2026, nos dois paineis: clicar num segundo
    // card nao troca o primeiro, SOMA. A lista mostra os pedidos dos dois.
    const pedidos = [pedido(501), pedido(502), pedido(503)];
    const amb = ambienteComPedidos(pedidos, {
        501: [{ id: 11, setor: 'FLEXO', quantidade: 10 }],
        502: [{ id: 12, setor: 'PVC', quantidade: 20 }],
        503: [{ id: 13, setor: 'TEXTIL', quantidade: 30 }],
    });

    const naTela = () => {
        amb.painel.render();
        const html = amb.elementos['tbody-acabamento'].innerHTML;
        return [501, 502, 503].filter(n => html.indexOf('>' + n + '<') !== -1);
    };

    ok(naTela().join(',') === '501,502,503', 'sem setor escolhido, os tres aparecem');

    amb.painel.setFiltroSetor('FLEXO');
    ok(naTela().join(',') === '501', 'um card aceso deixa so o setor dele');

    amb.painel.setFiltroSetor('PVC');
    ok(naTela().join(',') === '501,502',
       'o segundo card SOMA: os dois setores na mesma lista', naTela().join(','));

    amb.painel.setFiltroSetor('TEXTIL');
    ok(naTela().join(',') === '501,502,503', 'e o terceiro tambem soma');

    // Clicar de novo num card aceso tira aquele setor.
    amb.painel.setFiltroSetor('PVC');
    ok(naTela().join(',') === '501,503', 'clicar de novo tira so aquele setor');

    // "Todos os Setores" limpa a escolha inteira.
    amb.painel.setFiltroSetor('');
    ok(naTela().join(',') === '501,502,503', 'o "Todos os Setores" devolve a lista inteira');

    // O ATUALIZAR volta ao padrao, e isso inclui esvaziar a escolha de setores.
    amb.painel.setFiltroSetor('FLEXO');
    amb.painel.setFiltroSetor('PVC');
    amb.painel.atualizar();
    ok(naTela().join(',') === '501,502,503', 'o ATUALIZAR limpa os setores escolhidos');
})();

(function oSetorSaiDoItemQuandoOPedidoEstaAberto() {
    // Com o pedido carregado, o setor vem de `osItens`; com a lista enxuta, de
    // `modelosGlobais`. Os dois caminhos precisam somar igual.
    const amb = ambienteComPedidos([pedido(601)], { 601: [{ id: 21, quantidade: 5 }] });
    amb.janela.state.osItens['os-601'] = [{ id: 21, setor: 'LASER', quantidade: 5 }];

    amb.painel.setFiltroSetor('FLEXO');
    amb.painel.render();
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>601<') === -1,
       'o pedido de Laser fica fora do recorte de Flexo');

    amb.painel.setFiltroSetor('LASER');
    amb.painel.render();
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>601<') !== -1,
       'e entra quando o Laser soma, lido do item do pedido aberto');
})();

// ─── 8. O peso por setor ────────────────────────────────────────────────────
//
// Pedido do usuario em 21/08/2026: um box acima dos modelos, com os setores dos
// produtos daquele pedido e um campo de peso para cada um, gravado em
// `propostas_os_setores.peso_real_kg` -- uma linha por setor.

(function osSetoresSaemDosProdutosDoPedido() {
    const { painel } = montarAmbiente();
    const setores = painel._regras.setoresDoPedido;

    ok(setores([]).length === 0, 'pedido sem item nao tem setor');
    ok(setores([{ setor: 'LASER' }]).join(',') === 'LASER', 'um setor, uma linha');

    // O exemplo do usuario: Triband + Credencial + Mobi = Laser e PVC.
    ok(setores([{ setor: 'LASER' }, { setor: 'PVC' }, { setor: 'LASER' }]).join(',') === 'PVC,LASER',
       'setor repetido conta uma vez so',
       setores([{ setor: 'LASER' }, { setor: 'PVC' }, { setor: 'LASER' }]).join(','));

    // A ordem e a mesma dos cards da fila, e nao a de chegada dos itens.
    ok(setores([{ setor: 'LASER' }, { setor: 'FLEXO' }]).join(',') === 'FLEXO,LASER',
       'a ordem e a dos cards');

    ok(setores([{ setor: 'textil' }]).join(',') === 'TEXTIL', 'a caixa das letras nao decide');
    ok(setores([{ setor: 'Têxtil' }]).join(',') === 'TEXTIL', 'o acento tambem nao');

    // O banco so aceita quatro (`propostas_os_setores_setor_check`). Oferecer um
    // campo para setor que o banco recusa seria prometer o que nao se cumpre.
    ok(setores([{ setor: 'SERIGRAFIA' }]).length === 0, 'setor que o banco nao aceita fica de fora');
    ok(setores([{ setor: '' }, {}]).length === 0, 'item sem setor nao inventa linha');
})();

(function oPesoAceitaVirgulaEnaoAceitaLetra() {
    const { painel } = montarAmbiente();
    const { pesoDoTexto, pesoParaTexto } = painel._regras;

    ok(pesoDoTexto('4,16') === 4.16, 'a virgula da balanca vira ponto');
    ok(pesoDoTexto('4.16') === 4.16, 'o ponto tambem vale');
    ok(pesoDoTexto(' 5 ') === 5, 'espaco em volta nao atrapalha');
    ok(pesoDoTexto('') === null, 'campo vazio apaga o peso');
    ok(pesoDoTexto('   ') === null, 'so espaco tambem apaga');
    ok(pesoDoTexto('abc') === undefined, 'letra nao e peso');
    ok(pesoDoTexto('-2') === undefined, 'peso negativo nao existe');
    ok(pesoDoTexto('0') === 0, 'zero e um peso valido');

    ok(pesoParaTexto(4.16) === '4,16', 'na tela ele volta com virgula');
    ok(pesoParaTexto(null) === '', 'sem peso, campo vazio');
})();

async function oBoxDePesoAbreComOsSetoresDoPedido() {
    const amb = ambienteComPedidoAberto();
    // Dois produtos, dois setores.
    amb.janela.state.produtosGlobais = [
        { id_produto: 55, nomeReal: 'Credencial', setor_pcp: 'PVC' },
        { id_produto: 56, nomeReal: 'Triband', setor_pcp: 'LASER' },
    ];
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: 4.16 },
    ];

    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('Peso por setor') !== -1, 'o box tem titulo');
    ok(html.indexOf('acab-peso-PVC') !== -1, 'ha campo para o PVC');
    ok(html.indexOf('acab-peso-LASER') !== -1, 'e para o Laser');
    ok(html.indexOf('acab-peso-FLEXO') === -1, 'e nenhum para setor que nao esta no pedido');

    // O box vem ANTES dos modelos, que e onde o usuario pediu.
    ok(html.indexOf('Peso por setor') < html.indexOf('Credencial'),
       'o box fica acima dos modelos');

    // O peso que ja estava no banco volta ao campo, com virgula.
    ok(amb.elementos['acab-peso-PVC'].value === '4,16',
       'o peso ja gravado aparece no campo', amb.elementos['acab-peso-PVC'].value);
    ok(amb.elementos['acab-peso-LASER'].value === '', 'setor sem peso vem vazio');
}

async function gravarOPesoAtualizaAlinhaQueExiste() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'PVC';
    amb.banco._setoresDoBanco = [{ id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: null }];

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarPeso(200, 'PVC', '4,16');

    ok(amb.banco._pesosGravados.length === 1, 'linha que existe: uma escrita so',
       String(amb.banco._pesosGravados.length));
    const g = amb.banco._pesosGravados[0];
    ok(g.tipo === 'update', 'e ela e um update, nao um insert');
    ok(g.filtros.id_int === 200 && g.filtros.setor === 'PVC', 'pelo pedido e pelo setor');
    ok(Object.keys(g.payload).sort().join(',') === 'peso_real_kg,updated_at',
       'so o peso e a data sao tocados na tabela do parceiro',
       Object.keys(g.payload).join(','));
    ok(g.payload.peso_real_kg === 4.16, 'com o peso convertido');
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 4.16, 'e a linha ficou com o peso');
}

async function semLinhaNoBancoOPesoCriaUma() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'LASER';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.banco._setoresDoBanco = [];
    amb.banco._osDoBanco = [{ id: 'uuid-da-os', id_int: 200 }];

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarPeso(200, 'LASER', '0,32');

    const tipos = amb.banco._pesosGravados.map(g => g.tipo).join(',');
    ok(tipos === 'update,insert', 'tenta atualizar e, sem linha, insere', tipos);

    const inserida = amb.banco._pesosGravados.find(g => g.tipo === 'insert').linha;
    ok(inserida.id_int === 200 && inserida.setor === 'LASER', 'a linha nova e do pedido e do setor');
    ok(inserida.peso_real_kg === 0.32, 'com o peso');
    ok(inserida.id_os === 'uuid-da-os', 'e amarrada a OS do parceiro quando ela existe');
    ok(inserida.status_producao === undefined, 'sem encostar no status do parceiro');
    ok(inserida.prazo === undefined && inserida.hora === undefined, 'nem no prazo dele');
}

async function semOsNoParceiroAlinhaNasceSemAmarra() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'FLEXO';
    amb.janela.state.osItens['os-200'][1].setor = 'FLEXO';
    amb.banco._setoresDoBanco = [];
    amb.banco._osDoBanco = [];        // o ERP ainda nao abriu OS para este pedido

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;
    await amb.painel.mudarPeso(200, 'FLEXO', '1');

    const inserida = amb.banco._pesosGravados.find(g => g.tipo === 'insert').linha;
    ok(!('id_os' in inserida), 'sem OS, o campo nem e enviado -- nulo por omissao');
}

async function semSessaoOBoxDizOQueFazer() {
    // Na estacao o operador entra pelo codigo local, sem sessao do Supabase, e a
    // tabela do parceiro tem RLS de `authenticated`: a leitura volta VAZIA, sem
    // erro. Mostrar campos que nao gravariam nada seria mentir para ele.
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'PVC';
    amb.banco._sessao = null;

    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('Peso por setor') !== -1, 'o box continua na tela');
    ok(html.indexOf('entre com a sua conta') !== -1, 'e diz o que fazer para poder gravar');
    ok(html.indexOf('acab-peso-PVC') === -1, 'sem campo que nao gravaria nada');
    ok(html.indexOf('PVC') !== -1, 'mas o setor do pedido continua visivel');
}

async function pedidoSemSetorExplicaOPorque() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = ''; });

    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('Peso por setor') !== -1, 'o box aparece mesmo assim');
    ok(html.indexOf('nao ha peso a') !== -1 || html.indexOf('não há peso a') !== -1,
       'e explica por que nao ha campo nenhum');
}

async function oPesoNaoTocaEmOutraTabela() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'PVC';
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarPeso(200, 'PVC', '2,5');
    ok(amb.banco._gravacoes.length === 0,
       'gravar peso nao escreve em pedidos_modelos', String(amb.banco._gravacoes.length));

    // Setor que o banco recusa nao vira escrita nenhuma.
    amb.banco._pesosGravados.length = 0;
    await amb.painel.mudarPeso(200, 'SERIGRAFIA', '3');
    ok(amb.banco._pesosGravados.length === 0, 'setor fora da lista do banco nem tenta gravar');

    // Texto que nao e peso tambem nao chega ao banco.
    await amb.painel.mudarPeso(200, 'PVC', 'dois quilos');
    ok(amb.banco._pesosGravados.length === 0, 'texto que nao e numero nao vira escrita');
}

(function oCaminhoDoPesoDependeDeQuemServiuAPagina() {
    // `SERVIDA_PELA_NUVEM` sai do `supabase-config.js`, que toda pagina carrega
    // antes desta. No harness ele nao existe -- e AUSENTE tem de contar como
    // nuvem, nunca como estacao: inventar um agente que nao esta ali deixaria a
    // tela chamando um endereco que nao responde.
    const amb = montarAmbiente();
    ok(amb.painel._regras.pelaEstacao() === false,
       'sem a constante, o caminho e o da nuvem');
    ok(amb.painel._regras.urlDoPeso(123).indexOf('/api/peso-setores/123') !== -1,
       'a rota do agente leva o numero do pedido',
       amb.painel._regras.urlDoPeso(123));
})();

async function naEstacaoOPesoSaiPeloAgente() {
    // Com o agente servindo a pagina, nem a leitura nem a gravacao encostam na
    // tabela do parceiro: as duas saem pelo `fetch` da rota local.
    const chamadas = [];
    const amb = ambienteComPedidoAberto();
    amb.janela.SERVIDA_PELA_NUVEM = false;
    amb.janela.API_BASE_URL = '';
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = 'PVC'; });
    amb.banco._sessao = null;              // a estacao nao tem sessao, e nao precisa
    amb.janela.fetch = (url, opcoes) => {
        chamadas.push({ url, metodo: (opcoes && opcoes.method) || 'GET',
                        corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ setores: [{ setor: 'PVC', peso_real_kg: 3 }] }),
        });
    };

    await amb.painel.abrirPedido('os-200');

    ok(chamadas.length === 1, 'abrir o pedido le o peso pelo agente', String(chamadas.length));
    ok(chamadas[0].url === '/api/peso-setores/200', 'na rota certa', chamadas[0].url);
    ok(chamadas[0].metodo === 'GET', 'com GET');

    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('acab-peso-PVC') !== -1, 'e o campo aparece, mesmo sem sessao');
    ok(html.indexOf('entre com a sua conta') === -1,
       'sem o aviso de login: na estacao ha caminho');
    ok(amb.elementos['acab-peso-PVC'].value === '3', 'com o peso que veio do agente',
       amb.elementos['acab-peso-PVC'].value);

    amb.banco._pesosGravados.length = 0;
    await amb.painel.mudarPeso(200, 'PVC', '4,16');

    ok(chamadas.length === 2, 'gravar tambem sai pelo agente', String(chamadas.length));
    ok(chamadas[1].metodo === 'POST', 'com POST');
    ok(chamadas[1].url === '/api/peso-setores/200', 'na mesma rota');
    ok(chamadas[1].corpo.setor === 'PVC' && chamadas[1].corpo.peso_real_kg === 4.16,
       'levando o setor e o peso ja convertido', JSON.stringify(chamadas[1].corpo));
    ok(amb.banco._pesosGravados.length === 0,
       'e NADA vai direto a tabela do parceiro pela estacao');
}

async function oErroDoAgenteChegaAoOperador() {
    // A recusa do servidor vem com o motivo escrito. Trocar isso por "erro
    // interno" deixaria o operador sem saber o que corrigir.
    const avisos = [];
    const amb = ambienteComPedidoAberto();
    amb.janela.SERVIDA_PELA_NUVEM = false;
    amb.janela.API_BASE_URL = '';
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = 'PVC'; });
    amb.janela.fetch = () => Promise.resolve({
        ok: false, status: 422,
        json: () => Promise.resolve({ detail: 'setor invalido: XPTO' }),
    });

    await amb.painel.abrirPedido('os-200');
    avisos.length = 0;
    await amb.painel.mudarPeso(200, 'PVC', '4,16');

    ok(avisos.length === 1, 'houve aviso', String(avisos.length));
    ok(avisos[0].texto.indexOf('setor invalido: XPTO') !== -1,
       'e ele repete o motivo que o servidor deu', avisos[0].texto);
    ok(avisos[0].tipo === 'error', 'como erro');
}

// ─── 9. A expedicao ─────────────────────────────────────────────────────────
//
// Pedido do usuario em 21/08/2026: no mesmo box do peso, a direita, um botao
// EXPEDICAO que so fica ativo com TODOS os modelos de TODOS os setores em
// "Pronto"; clicado antes disso, diz quais setores faltam. E, a parte do botao,
// o setor recebe CONCLUIDO assim que o ULTIMO modelo dele fica pronto.

(function oQueFaltaParaExpedirSaiPorSetor() {
    const { painel } = montarAmbiente();
    const { setoresPendentes, pedidoProntoParaExpedicao, modelosPorSetor } = painel._regras;

    const pronto = s => ({ setor: s, acabamento_status: 'Pronto' });
    const fazendo = s => ({ setor: s, acabamento_status: 'Em acabamento' });

    ok(pedidoProntoParaExpedicao([]) === false, 'pedido sem modelo NAO esta pronto');
    ok(pedidoProntoParaExpedicao([pronto('PVC')]) === true, 'um setor, tudo pronto');
    ok(pedidoProntoParaExpedicao([pronto('PVC'), fazendo('LASER')]) === false,
       'um setor pendente segura o pedido inteiro');

    // O exemplo do usuario: dois setores, um deles atrasado.
    const mistura = [pronto('PVC'), pronto('PVC'), fazendo('LASER'), pronto('LASER')];
    const faltando = setoresPendentes(mistura);
    ok(faltando.length === 1, 'so o setor pendente e listado', String(faltando.length));
    ok(faltando[0].setor === 'LASER', 'e ele e o Laser', faltando[0].setor);
    ok(faltando[0].faltam === 1, 'com a conta de quantos modelos faltam', String(faltando[0].faltam));

    // Modelo sem setor NAO some da conta: material do pedido e material do
    // pedido, e expedir com ele pendente e o erro caro desta tela.
    const semSetor = [pronto('PVC'), { acabamento_status: 'Aguardando' }];
    ok(pedidoProntoParaExpedicao(semSetor) === false, 'modelo sem setor tambem segura');
    ok(setoresPendentes(semSetor)[0].setor === '(sem setor)',
       'e ele aparece nomeado como "(sem setor)"');

    // A ordem dos grupos e a dos cards, e nao a de chegada.
    const ordem = modelosPorSetor([fazendo('LASER'), fazendo('FLEXO')]).map(g => g.setor);
    ok(ordem.join(',') === 'FLEXO,LASER', 'os setores saem na ordem dos cards', ordem.join(','));
})();

(function oAvisoDizOQueFalta() {
    const { painel } = montarAmbiente();
    const { setoresPendentes, textoDoQueFalta } = painel._regras;

    const itens = [
        { setor: 'PVC', acabamento_status: 'Pronto' },
        { setor: 'LASER', acabamento_status: 'Aguardando' },
        { setor: 'LASER', acabamento_status: 'Em acabamento' },
        { setor: 'FLEXO', acabamento_status: 'Aguardando' },
    ];
    const texto = textoDoQueFalta(setoresPendentes(itens), itens);

    ok(texto.indexOf('Flexo') !== -1, 'o aviso nomeia o Flexo', texto);
    ok(texto.indexOf('Laser') !== -1, 'e o Laser');
    ok(texto.indexOf('PVC') === -1, 'e NAO nomeia o setor que ja terminou');
    ok(texto.indexOf('2 modelos') !== -1, 'diz quantos faltam em cada um', texto);
    ok(texto.indexOf('1 modelo,') !== -1 || texto.indexOf('(1 modelo)') !== -1,
       'no singular quando e um so', texto);

    ok(textoDoQueFalta([], []).indexOf('nao tem modelo') !== -1 ||
       textoDoQueFalta([], []).indexOf('não tem modelo') !== -1,
       'pedido sem modelo tem aviso proprio', textoDoQueFalta([], []));
})();

async function oBotaoDeExpedicaoSoAcendeComTudoPronto() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Em acabamento';

    await amb.painel.abrirPedido('os-200');
    let html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('EXPEDIÇÃO') !== -1, 'o botao existe mesmo com o pedido pendente');
    ok(html.indexOf('1 setor pendente') !== -1, 'e ele diz quantos setores faltam', html.slice(0, 0));
    ok(html.indexOf('AcabamentoPainel.expedir(') !== -1, 'e continua clicavel: e assim que ele explica');

    // Com tudo pronto, ele acende.
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Pronto';
    amb.painel.render();
    await amb.painel.abrirPedido('os-200');
    html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('todos os modelos prontos') !== -1, 'com tudo pronto ele muda de cara');
}

async function clicarCedoDemaisAbreOPopupComOQueFalta() {
    // Ate 21/08/2026 isto era um aviso que sumia sozinho. Virou popup no mesmo
    // dia, a pedido do usuario: a lista do que falta e a informacao que o
    // operador vai USAR, e ela nao pode desaparecer enquanto ele le.
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Aguardando';

    await amb.painel.abrirPedido('os-200');
    amb.banco._propostasGravadas.length = 0;

    await amb.painel.expedir('os-200');

    ok(amb.elementos['acab-expedicao'].style.display === 'flex', 'o popup abriu');
    ok(amb.elementos['acab-expedicao-titulo'].textContent.indexOf('nao da') !== -1 ||
       amb.elementos['acab-expedicao-titulo'].textContent.indexOf('não dá') !== -1,
       'com o titulo do que nao da para fazer',
       amb.elementos['acab-expedicao-titulo'].textContent);

    const corpo = amb.elementos['acab-expedicao-corpo'].innerHTML;
    ok(corpo.indexOf('Laser') !== -1, 'o corpo diz qual setor falta');
    ok(corpo.indexOf('faltam 1') !== -1, 'e quantos modelos', corpo.indexOf('faltam 1'));
    ok(corpo.indexOf('>200<') !== -1 || corpo.indexOf('Pedido 200') !== -1,
       'e de qual pedido se trata');

    // O botao de enviar SOME: nao ha o que confirmar.
    ok(amb.elementos['acab-expedicao-ok'].style.display === 'none', 'sem botao de enviar');
    ok(amb.elementos['acab-expedicao-cancelar'].textContent === 'Entendi',
       'e o de fechar diz "Entendi"', amb.elementos['acab-expedicao-cancelar'].textContent);

    ok(amb.banco._propostasGravadas.length === 0,
       'NADA foi gravado no pedido', String(amb.banco._propostasGravadas.length));
    ok(amb.janela.state.ordens[0].status_interno === 'EM PRODUCAO',
       'o pedido continua onde estava');
}

async function oPopupMostraOResumoEEsperaOOk() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.janela.state.osItens['os-200'].forEach(i => { i.acabamento_status = 'Pronto'; });
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: 4.16, status_producao: 'CONCLUIDO' },
    ];

    await amb.painel.abrirPedido('os-200');
    amb.banco._propostasGravadas.length = 0;

    await amb.painel.expedir('os-200');

    ok(amb.elementos['acab-expedicao'].style.display === 'flex', 'o popup abriu');
    const corpo = amb.elementos['acab-expedicao-corpo'].innerHTML;
    ok(corpo.indexOf('PVC') !== -1 && corpo.indexOf('Laser') !== -1,
       'o resumo lista os dois setores');
    ok(corpo.indexOf('4,16 kg') !== -1, 'com o peso digitado', corpo.indexOf('4,16'));
    ok(corpo.indexOf('Sem peso digitado em Laser') !== -1,
       'e avisa qual setor foi sem peso');
    ok(corpo.indexOf('EXPEDIÇÃO') !== -1, 'e diz o que vai acontecer ao confirmar');
    ok(amb.elementos['acab-expedicao-ok'].style.display !== 'none', 'o botao de enviar aparece');

    // ABRIR NAO GRAVA. So o OK grava.
    ok(amb.banco._propostasGravadas.length === 0,
       'abrir o popup nao gravou nada', String(amb.banco._propostasGravadas.length));
    ok(amb.janela.state.ordens[0].status_interno === 'EM PRODUCAO',
       'e o pedido continua na fila enquanto ninguem confirma');
}

async function cancelarFechaOPopupSemGravar() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => {
        i.setor = 'PVC';
        i.acabamento_status = 'Pronto';
    });

    await amb.painel.abrirPedido('os-200');
    await amb.painel.expedir('os-200');
    amb.banco._propostasGravadas.length = 0;

    amb.painel.fecharPopupDaExpedicao();

    ok(amb.elementos['acab-expedicao'].style.display === 'none', 'o popup fechou');
    ok(amb.banco._propostasGravadas.length === 0, 'sem gravar nada');
    ok(amb.janela.state.ordens[0].status_interno === 'EM PRODUCAO',
       'o pedido continua na fila');
}

async function semPermissaoOPopupExplicaEnaoOferece() {
    const amb = ambienteComPedidoAberto();
    amb.janela._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: false };
    amb.janela.state.osItens['os-200'].forEach(i => {
        i.setor = 'PVC';
        i.acabamento_status = 'Pronto';
    });

    await amb.painel.abrirPedido('os-200');
    amb.banco._propostasGravadas.length = 0;
    await amb.painel.expedir('os-200');

    ok(amb.elementos['acab-expedicao-ok'].style.display === 'none',
       'quem so ve nao encontra o botao de enviar');
    ok(amb.elementos['acab-expedicao-corpo'].innerHTML.indexOf('permissão de ver') !== -1,
       'e o popup explica por que');

    // E mesmo chamando o confirmar direto, nada e gravado.
    await amb.painel.confirmarExpedicao('os-200');
    ok(amb.banco._propostasGravadas.length === 0,
       'a conferencia e refeita no confirmar, e nao so no botao');
}

async function comTudoProntoOPedidoVaiParaExpedicao() {
    const avisos = [];
    const amb = ambienteComPedidoAberto();
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });
    amb.janela.state.osItens['os-200'].forEach(i => {
        i.setor = 'PVC';
        i.acabamento_status = 'Pronto';
    });

    await amb.painel.abrirPedido('os-200');
    avisos.length = 0;
    amb.banco._propostasGravadas.length = 0;

    // Abrir o popup NAO grava...
    await amb.painel.expedir('os-200');
    ok(amb.banco._propostasGravadas.length === 0, 'abrir o popup nao grava');

    // ...so o OK grava.
    await amb.painel.confirmarExpedicao('os-200');

    ok(amb.banco._propostasGravadas.length === 1, 'uma gravacao no pedido',
       String(amb.banco._propostasGravadas.length));
    const g = amb.banco._propostasGravadas[0];
    ok(Object.keys(g.payload).join(',') === 'status_interno',
       'e ela toca SO o status_interno da tabela do parceiro', Object.keys(g.payload).join(','));
    ok(g.payload.status_interno === 'EXPEDICAO', 'com o valor EXPEDICAO');
    ok(g.filtros.id_int === 200, 'no pedido certo');

    ok(amb.janela.state.ordens[0].status_interno === 'EXPEDICAO',
       'a tela anda junto: o pedido sai da fila do acabamento');
    ok(avisos.some(a => a.tipo === 'success'), 'e o operador e avisado');
    ok(amb.elementos['acab-expedicao'].style.display === 'none', 'o popup fecha');
    ok(amb.elementos['acab-detalhe-card'].style.display === 'none',
       'e o detalhe volta para a lista');
}

async function asInformacoesDoModeloSaemEmTabela() {
    // Desenho pedido pelo usuario em 22/08/2026, com a imagem em maos: uma
    // tabela ESPECIFICACAO por modelo, rotulo a esquerda e informacao variavel
    // a direita, em negrito. Antes eram oito quadradinhos numa grade que se
    // reorganizava com a largura da tela.
    const amb = ambienteComPedidoAberto();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    const do3001 = html.slice(html.indexOf('Pista Inteira'), html.indexOf('Camarote'));

    ok(do3001.indexOf('Especifica\u00e7\u00e3o') !== -1, 'a tabela tem o cabecalho ESPECIFICACAO');
    ok(do3001.indexOf('<table') !== -1, 'e e uma tabela de verdade');

    // Uma linha por informacao, com o rotulo do desenho do usuario.
    [['Quantidade Total', '500 un'],
     ['Numera\u00e7\u00e3o de', '1 a 500'],
     ['Bloco', '100 unidades'],
     ['Numera\u00e7\u00e3o', 'QR Ideal'],
     ['Cor', 'Azul Ideal'],
     ['Impress\u00e3o', 'Frente'],
     ['Situa\u00e7\u00e3o', 'Impresso']].forEach(([rotulo, valor]) => {
        ok(do3001.indexOf('>' + rotulo + '</td>') !== -1, 'a linha "' + rotulo + '" existe');
        ok(do3001.indexOf('>' + valor + '</td>') !== -1,
           'e o valor "' + valor + '" aparece nela');
     });

    // A informacao variavel em negrito -- foi o que ele pediu, e e o que o
    // operador confere contra o material na mesa.
    const celulasDeValor = do3001.match(/background: #1b2c4e;[^"]*/g) || [];
    ok(celulasDeValor.length >= 7, 'as celulas de valor existem', celulasDeValor.length);
    ok(celulasDeValor.every(c => c.indexOf('font-weight: 800') !== -1),
       'e todas em negrito');

    // A "Numeracao de" nao inventa meia informacao quando falta um dos numeros.
    const amb2 = ambienteComPedidoAberto();
    delete amb2.janela.state.osItens['os-200'][0].num_final;
    amb2.janela.state.osItens['os-200'][0].bloco = '';
    await amb2.painel.abrirPedido('os-200');
    const outro = amb2.elementos['acab-detalhe-corpo'].innerHTML;
    const so3001 = outro.slice(outro.indexOf('Pista Inteira'), outro.indexOf('Camarote'));
    ok(so3001.indexOf('1 a 500') === -1, 'sem o numero final nao ha intervalo');
    ok((so3001.match(/>\u2014<\/td>/g) || []).length >= 2,
       'as duas linhas dizem que falta, em vez de mostrar meia informacao');
}

async function oCabecalhoDoPedidoAbertoDestacaNumeroEEvento() {
    // Pedido do usuario, 22/08/2026: "ao abrir o pedido, no Painel de
    // Acabamento, destacar Numero do pedido e Evento, como ja aparece no pedido
    // do Painel de Producao". Quem abre o pedido na estacao confere de relance
    // que o material na mesa e o deste pedido -- e o que a pessoa do acabamento
    // tem na mao e o nome do EVENTO, nao o do cliente.
    const amb = ambienteComPedidoAberto();
    amb.janela.state.todasArtes = [
        { id_int: 199, nome_evento: 'Outro Evento' },
        { id_int: 200, nome_evento: 'Rock in Rio 2026' },
    ];
    await amb.painel.abrirPedido('os-200');

    // DUAS linhas, desde 23/08/2026: em cima numero e evento, embaixo o cliente
    // (que ja vem com o numero dele, pelo `rotuloDoCliente`) 20% menor e em
    // amarelo.
    const titulo = amb.elementos['acab-detalhe-titulo'].innerHTML;
    const linhas = titulo.match(/<div[^>]*>[^<]*<\/div>/g) || [];
    ok(linhas.length === 2, 'o titulo sai em duas linhas', linhas.length + ': ' + titulo);
    ok(linhas[0] === '<div>200 - Rock in Rio 2026</div>',
       'a de cima traz numero e evento, como ja estava', linhas[0]);
    ok(linhas[1].indexOf('>Cliente 200</div>') !== -1,
       'a de baixo traz o nome e o numero do cliente', linhas[1]);
    ok(linhas[1].indexOf('font-size: 0.8em') !== -1,
       'ela e 20% menor que a de cima -- em `em`, para acompanhar se o titulo mudar',
       linhas[1]);
    ok(/#fbbf24/.test(linhas[1]), 'e amarela', linhas[1]);
    // O degrade do <h1> pinta o texto com `-webkit-text-fill-color: transparent`,
    // e esse transparente e herdado: sem devolver o seu, a linha sairia CINZA,
    // pintada pelo degrade, com o amarelo todo certo no codigo. O harness em
    // Chrome (`titulo_do_acabamento_harness.js`) mede a cor no pixel.
    ok(linhas[1].indexOf('-webkit-text-fill-color: #fbbf24') !== -1,
       'e devolve o seu proprio text-fill, senao o amarelo nao apareceria', linhas[1]);

    // Briefing sem evento: a primeira linha se fecha no numero, em vez de
    // terminar num hifen solto -- e a do cliente continua.
    const amb2 = ambienteComPedidoAberto();
    await amb2.painel.abrirPedido('os-200');
    const linhas2 = (amb2.elementos['acab-detalhe-titulo'].innerHTML
        .match(/<div[^>]*>[^<]*<\/div>/g) || []);
    ok(linhas2[0] === '<div>200</div>', 'sem evento, a primeira linha e so o numero', linhas2[0]);
    ok(linhas2.length === 2 && linhas2[1].indexOf('>Cliente 200</div>') !== -1,
       'e a do cliente continua embaixo', linhas2.join(' | '));

    // O tamanho e o degrade vem do titulo das outras telas -- e a faixa cinza
    // do cabecalho saiu, que era o "box" que o usuario mandou tirar.
    const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    const cabecalho = HTML.slice(HTML.indexOf('id="acab-detalhe-card"'),
                                 HTML.indexOf('id="acab-detalhe-corpo"'));
    ok(cabecalho.indexOf('calc(2.2rem + 5pt)') !== -1,
       'o titulo tem o mesmo tamanho do da tela de Pedido');
    ok(cabecalho.indexOf('page-header-text') !== -1, 'e o mesmo degrade');
    // Sem a faixa: o comentario do HTML cita a classe para explicar por que ela
    // saiu, entao o que se procura e o ATRIBUTO.
    ok(cabecalho.indexOf('class="prod-table-header') === -1, 'sem a faixa em volta');
}

async function semResponsavelOStatusNaoSeMexe() {
    // Regra do usuario, 22/08/2026: "so permitir alterar o status apos
    // selecionar o responsavel". Marcar um estagio e dizer que ALGUEM fez
    // aquele trabalho; sem nome, o registro nao responde a pergunta que o setor
    // faz depois -- quem acabou este material.
    const avisos = [];
    const amb = ambienteComPedidoAberto();
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });
    await amb.painel.abrirPedido('os-200');

    // O 3002 nao tem responsavel. Os quatro botoes dele estao travados...
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    const do3002 = html.slice(html.indexOf('Camarote'));
    const botoes3002 = do3002.match(/<button[^>]*data-estagio="[^"]*"[^>]*>/g) || [];
    ok(botoes3002.length === 4, 'os quatro botoes do modelo sem responsavel aparecem', botoes3002.length);
    ok(botoes3002.every(b => b.indexOf('disabled') !== -1),
       'e todos travados enquanto nao ha responsavel');
    ok(do3002.indexOf('para liberar o status') !== -1, 'a tela diz o que falta');
    ok(do3002.indexOf('<b>Responsável</b> abaixo') !== -1,
       'e aponta para onde o responsavel ficou agora');
    // ...mas o estagio continua LEGIVEL: travar nao e esconder.
    ok(/data-estagio="Impresso" aria-pressed="true"/.test(do3002),
       'o estagio derivado continua marcado');

    // O 3001 TEM responsavel: os botoes dele estao livres.
    const do3001 = html.slice(html.indexOf('Pista Inteira'), html.indexOf('Camarote'));
    const botoes3001 = do3001.match(/<button[^>]*data-estagio="[^"]*"[^>]*>/g) || [];
    ok(botoes3001.every(b => b.indexOf('disabled') === -1),
       'o modelo com responsavel tem os botoes livres');
    ok(do3001.indexOf('para liberar o status') === -1, 'e nao recebe o recado');

    // A trava vale tambem na FUNCAO: botao cinza nao impede o console.
    amb.banco._gravacoes.length = 0;
    avisos.length = 0;
    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');
    ok(amb.banco._gravacoes.length === 0, 'chamar a funcao direto tambem nao grava',
       JSON.stringify(amb.banco._gravacoes));
    ok(avisos.some(a => /respons/i.test(a.texto || '')),
       'e o operador ouve o porque', JSON.stringify(avisos));

    // Escolhido o responsavel, o mesmo clique grava.
    await amb.painel.mudarResponsavel('3002', 'os-200', 'Cesar Almeida');
    amb.banco._gravacoes.length = 0;
    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');
    ok(amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status === 'Pronto'),
       'com responsavel escolhido, o status grava',
       JSON.stringify(amb.banco._gravacoes));

    const depois = amb.elementos['acab-detalhe-corpo'].innerHTML;
    const do3002Depois = depois.slice(depois.indexOf('Camarote'));
    ok((do3002Depois.match(/<button[^>]*data-estagio="[^"]*"[^>]*disabled/g) || []).length === 0,
       'e os botoes daquele modelo ficam livres na hora, sem ATUALIZAR');
}

async function oSetorGanhaConcluidoQuandoOUltimoModeloFicaPronto() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = 'PVC'; });
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Em acabamento';
    // Sem responsavel o status nao se mexe (22/08/2026): o operador escolhe o
    // nome antes de marcar o estagio, e e isso que este teste reproduz.
    amb.janela.state.osItens['os-200'][1].acabamento_responsavel = 'Cesar Almeida';
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: 4, status_producao: null },
    ];

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    // O ULTIMO modelo do setor vira Pronto.
    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    const carimbo = amb.banco._pesosGravados.find(
        g => g.payload && g.payload.status_producao);
    ok(!!carimbo, 'o setor foi carimbado', JSON.stringify(amb.banco._pesosGravados));
    ok(carimbo.payload.status_producao === 'CONCLUIDO', 'com CONCLUIDO');
    ok(carimbo.filtros.setor === 'PVC', 'na linha do setor certo');
    ok(Object.keys(carimbo.payload).sort().join(',') === 'status_producao,status_producao_em,updated_at',
       'e so nas tres colunas do carimbo', Object.keys(carimbo.payload).join(','));
}

// ─── A hora do Pronto, e o peso que fecha o setor (23/08/2026) ──────────────
//
// Pedido do usuario: "ao marcar o ultimo modelo como pronto deve exigir indicar
// a informacao do peso do setor que esta pronto, so alterar status apos o peso
// real for indicado. Modelos prontos devem indicar a hora em que ficaram
// prontos".
//
// A hora vem do banco (gatilho `trg_carimba_acabamento_pronto_em`); aqui se mede
// o que a tela faz com ela. O peso e uma TRAVA no `mudarEstagio` -- a unica
// porta por onde o status do acabamento e gravado.

async function aHoraDoProntoApareceNoCard() {
    const amb = ambienteComPedidoAberto();
    const { textoDaHoraDoPronto, prontoEmDoModelo } = amb.painel._regras;

    // O texto: hoje sai so a hora; noutro dia, a data junto.
    const hoje = new Date();
    hoje.setHours(14, 32, 0, 0);
    ok(textoDaHoraDoPronto(hoje.toISOString()) === 'Pronto às 14:32',
       'no mesmo dia sai so a hora', textoDaHoraDoPronto(hoje.toISOString()));

    const outroDia = new Date(hoje.getTime() - 3 * 24 * 3600 * 1000);
    ok(/^Pronto em \d\d\/\d\d às \d\d:\d\d$/.test(textoDaHoraDoPronto(outroDia.toISOString())),
       'noutro dia a data aparece junto', textoDaHoraDoPronto(outroDia.toISOString()));

    ok(textoDaHoraDoPronto('') === '' && textoDaHoraDoPronto(null) === '',
       'sem hora, nenhum texto');
    ok(textoDaHoraDoPronto('nao e uma data') === '', 'texto que nao e data nao vira "Invalid Date"');

    // De onde ela e lida: do modelo ou do mapa da lista.
    ok(prontoEmDoModelo({ id: 'x', acabamento_pronto_em: '2026-08-23T17:32:00Z' }) === '2026-08-23T17:32:00Z',
       'a hora vem do proprio modelo quando ele a traz');
    ok(prontoEmDoModelo({ id: 'y' }) === '', 'modelo sem hora devolve vazio');
    ok(prontoEmDoModelo(null) === '', 'sem modelo, vazio');

    // E o card: o modelo Pronto COM hora mostra o carimbo.
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][0].acabamento_pronto_em = hoje.toISOString();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('Pronto às 14:32') !== -1, 'o card do modelo pronto mostra a hora', html.length);

    // Modelo pronto SEM hora (concluido antes de 23/08/2026) nao mostra nada --
    // a migracao nao inventou historico, e a tela nao inventa tampouco.
    const amb2 = ambienteComPedidoAberto();
    amb2.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    await amb2.painel.abrirPedido('os-200');
    ok(amb2.elementos['acab-detalhe-corpo'].innerHTML.indexOf('🕒') === -1,
       'modelo pronto sem hora registrada nao mostra carimbo nenhum');

    // E o modelo que NAO esta pronto nao mostra hora, mesmo que a carregue.
    const amb3 = ambienteComPedidoAberto();
    amb3.janela.state.osItens['os-200'][0].acabamento_status = 'Em acabamento';
    amb3.janela.state.osItens['os-200'][0].acabamento_pronto_em = hoje.toISOString();
    await amb3.painel.abrirPedido('os-200');
    ok(amb3.elementos['acab-detalhe-corpo'].innerHTML.indexOf('Pronto às') === -1,
       'so o estagio Pronto mostra a hora');
}

/** Os dois modelos no mesmo setor, um ja pronto: o outro fecha o setor. */
function ambienteComSetorQuaseFechado(pesoDoSetor) {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = 'PVC'; });
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Em acabamento';
    amb.janela.state.osItens['os-200'][1].acabamento_responsavel = 'Cesar Almeida';
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: pesoDoSetor, status_producao: null },
    ];
    return amb;
}

async function oUltimoProntoDoSetorPedeOPeso() {
    const amb = ambienteComSetorQuaseFechado(null);
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    const gravou = await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    ok(gravou === false, 'o clique NAO grava enquanto o peso nao vier');
    ok(!amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status),
       'nada de acabamento_status foi ao banco', JSON.stringify(amb.banco._gravacoes));

    const popup = amb.documento.getElementById('acab-peso-obrigatorio');
    ok(popup && popup.style.display === 'flex', 'e o popup do peso abriu -- a saida da trava esta na tela');
    ok((popup.innerHTML || '').indexOf('último modelo') !== -1
       || (amb.documento.getElementById('acab-peso-obrig-corpo').innerHTML || '').indexOf('último modelo') !== -1,
       'o popup diz por que esta cobrando');
}

async function comPesoJaGravadoOProntoPassaDireto() {
    const amb = ambienteComSetorQuaseFechado(4.16);
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    ok(amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status === 'Pronto'),
       'setor que ja tem peso nao e cobrado de novo', JSON.stringify(amb.banco._gravacoes));
}

async function naoSendoOUltimoDoSetorOProntoPassaDireto() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = 'PVC'; });
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Em acabamento';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Em acabamento';
    amb.janela.state.osItens['os-200'][1].acabamento_responsavel = 'Cesar Almeida';
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: null, status_producao: null },
    ];
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    ok(amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status === 'Pronto'),
       'com outro modelo pendente o setor nao fecha, e o peso nao e cobrado');
    const popup = amb.documento.getElementById('acab-peso-obrigatorio');
    ok(!popup || popup.style.display !== 'flex', 'e o popup nem aparece');
}

async function semCaminhoParaOPesoAtravaNaoPrende() {
    // Nem estacao servindo a pagina, nem sessao do Vibe: o box de peso ja diz
    // "entre com a sua conta", e o campo nem existe. Cobrar o peso aqui seria
    // trancar o Pronto sem oferecer saida -- e o material continuaria pronto na
    // mesa, com a tela dizendo o contrario.
    const amb = ambienteComSetorQuaseFechado(null);
    await amb.painel.abrirPedido('os-200');
    amb.painel._tela.temSessao = false;
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    ok(amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status === 'Pronto'),
       'sem onde gravar o peso, o Pronto nao fica preso');
}

async function oPopupDoPesoGravaEEntaoMarcaPronto() {
    const amb = ambienteComSetorQuaseFechado(null);
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarEstagio('3002', 'os-200', 'Pronto');

    // O operador digita o peso no popup e confirma.
    amb.documento.getElementById('acab-peso-obrig-campo').value = '4,16';
    await amb.painel.confirmarPesoDoSetor();

    const peso = amb.banco._pesosGravados.find(g => g.payload && g.payload.peso_real_kg !== undefined);
    ok(!!peso && peso.payload.peso_real_kg === 4.16, 'o peso foi gravado a partir do popup',
       JSON.stringify(amb.banco._pesosGravados));
    ok(amb.banco._gravacoes.some(g => g.payload && g.payload.acabamento_status === 'Pronto'),
       'e SO ENTAO o modelo virou Pronto', JSON.stringify(amb.banco._gravacoes));

    const popup = amb.documento.getElementById('acab-peso-obrigatorio');
    ok(popup.style.display === 'none', 'o popup se fecha sozinho depois de cumprir o papel');
}

async function setorIncompletoNaoGanhaCarimbo() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'PVC';
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Aguardando';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Aguardando';
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: null, status_producao: null },
    ];

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    // Um dos dois fica pronto: o setor ainda nao terminou.
    await amb.painel.mudarEstagio('3001', 'os-200', 'Pronto');

    const carimbo = amb.banco._pesosGravados.find(
        g => g.payload && g.payload.status_producao);
    ok(!carimbo, 'setor com modelo pendente NAO recebe CONCLUIDO',
       JSON.stringify(amb.banco._pesosGravados));
}

async function desmarcarUmModeloTiraOCarimbo() {
    // Marcar Pronto por engano e corrigir tem de devolver a ficha a verdade.
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => {
        i.setor = 'PVC';
        i.acabamento_status = 'Pronto';
    });
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: 4, status_producao: 'CONCLUIDO' },
    ];

    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarEstagio('3001', 'os-200', 'Em acabamento');

    const carimbo = amb.banco._pesosGravados.find(
        g => g.payload && g.payload.status_producao);
    ok(!!carimbo, 'houve escrita', JSON.stringify(amb.banco._pesosGravados));
    ok(carimbo.payload.status_producao === 'EM ACABAMENTO',
       'o setor volta para EM ACABAMENTO, e nao para nulo',
       carimbo.payload.status_producao);
    // E o descarimbo so alcanca linha que esta EXATAMENTE em CONCLUIDO.
    ok(carimbo.filtros.status_producao === 'CONCLUIDO',
       'e o filtro protege o que o ERP escreveu', JSON.stringify(carimbo.filtros));
}

// ─── 10. O peso estimado e a senha de liberacao ─────────────────────────────
//
// Pedido do usuario em 21/08/2026: ao lado do peso real, o peso ESTIMADO do
// setor (a soma de `produtos_proposta.peso_total`, em gramas, dos produtos
// daquele setor). O real nao pode fugir mais de 5 % do estimado; acima disso
// a gravacao fica PENDENTE e um popup pede a senha semanal de liberacao, que o
// servidor confere. Nada e gravado antes do sim.

(function oEstimadoSomaAsLinhasDoSetorEmGramas() {
    const { painel } = montarAmbiente();
    const { estimadoPorSetor } = painel._regras;
    const setores = { 55: 'PVC', 56: 'LASER', 57: '' };

    // Gramas no banco, quilos na tela: 4160 g = 4,160 kg. E o caso conferido
    // contra o pedido 21000 (est. 4,160 x real 4,16).
    let r = estimadoPorSetor([{ id_produto: 55, qtd: 500, peso_total: 4160 }], setores);
    ok(r.PVC === 4.16, 'o estimado do setor e a soma em kg', JSON.stringify(r));

    // Duas linhas do mesmo setor somam; setores diferentes nao se misturam.
    r = estimadoPorSetor([
        { id_produto: 55, peso_total: 4160 },
        { id_produto: 55, peso_total: 840 },
        { id_produto: 56, peso_total: 450 },
    ], setores);
    ok(r.PVC === 5 && r.LASER === 0.45, 'soma por setor, sem misturar', JSON.stringify(r));

    // Produto sem setor nao entra em conta nenhuma; produto que a lista nao
    // conhece tambem nao.
    r = estimadoPorSetor([
        { id_produto: 57, peso_total: 9999 },
        { id_produto: 99, peso_total: 9999 },
        { id_produto: 55, peso_total: 100 },
    ], setores);
    ok(Object.keys(r).join(',') === 'PVC' && r.PVC === 0.1,
       'produto sem setor (ou desconhecido) fica de fora', JSON.stringify(r));

    // Linha sem peso (ou zero) nao cria estimado: sem estimado nao ha com o que
    // comparar, e o box mostra "est. —".
    r = estimadoPorSetor([{ id_produto: 55, peso_total: 0 }, { id_produto: 56, peso_total: null }], setores);
    ok(Object.keys(r).length === 0, 'peso zero ou nulo nao vira estimado', JSON.stringify(r));
    ok(Object.keys(estimadoPorSetor([], setores)).length === 0, 'pedido sem linha: sem estimado');

    // O setor do produto passa pela mesma normalizacao dos cards.
    r = estimadoPorSetor([{ id_produto: 55, peso_total: 1000 }], { 55: 'Têxtil' });
    ok(r.TEXTIL === 1, 'o setor e normalizado como nos cards', JSON.stringify(r));

    // Tres casas, sempre: 1 g e 0,001 kg; meia grama e arredondada.
    r = estimadoPorSetor([{ id_produto: 55, peso_total: 1 }], setores);
    ok(r.PVC === 0.001, 'um grama e 0,001 kg', JSON.stringify(r));
    r = estimadoPorSetor([{ id_produto: 55, peso_total: 4160.4 }], setores);
    ok(r.PVC === 4.16, 'a fracao de grama e arredondada', JSON.stringify(r));
})();

(function aRegraDosCincoPorCentoTemBordaInclusiva() {
    const { painel } = montarAmbiente();
    const { divergencia, precisaDeLiberacao } = painel._regras;

    ok(divergencia(4.16, 4.16) === 0, 'peso igual ao estimado nao diverge');
    ok(divergencia(null, 4.16) === null, 'sem peso digitado nao ha divergencia');
    ok(divergencia(4, null) === null, 'sem estimado tambem nao');
    ok(divergencia(4, 0) === null, 'estimado zero nao divide');
    ok(Math.abs(divergencia(4.5, 4.16) - 0.0817) < 0.0001, '4,5 contra 4,16 e 8,2 %');

    // EXATAMENTE 5 % passa; um centesimo acima nao.
    ok(precisaDeLiberacao(105, 100) === false, '5,0 % para cima ainda grava direto');
    ok(precisaDeLiberacao(95, 100) === false, '5,0 % para baixo tambem');
    // ...inclusive onde o ponto flutuante erra por um bilionesimo: 2,1 contra
    // 2,0 e 4,368 contra 4,160 dao 0,050000000000000044 em JavaScript.
    ok(precisaDeLiberacao(2.1, 2) === false, '2,1 contra 2,0 e 5 % exatos, e passa');
    ok(precisaDeLiberacao(4.368, 4.16) === false, '4,368 contra 4,160 tambem');
    ok(precisaDeLiberacao(0.315, 0.3) === false, 'e 0,315 contra 0,300');
    ok(precisaDeLiberacao(105.01, 100) === true, '5,01 % para cima pede a senha');
    ok(precisaDeLiberacao(94.99, 100) === true, '5,01 % para baixo tambem');
    ok(precisaDeLiberacao(null, 100) === false, 'apagar o campo nao pede senha');
    ok(precisaDeLiberacao(999, null) === false, 'sem estimado, qualquer peso grava direto');
    ok(precisaDeLiberacao(999, 0) === false, 'estimado zero e o mesmo que nenhum');
})();

(function oEnderecoDoPainelSeMontaComoODoAgente() {
    const amb = montarAmbiente();
    const { urlDeApi, urlDoPainel, urlDaEstacao } = amb.painel._regras;
    ok(urlDeApi('https://p', 'senha-liberacao', 'conferir') === 'https://p/api/senha-liberacao/conferir',
       'urlDeApi monta base + api + rota + x', urlDeApi('https://p', 'senha-liberacao', 'conferir'));
    ok(urlDeApi('', 'peso-setores', 200) === '/api/peso-setores/200', 'base vazia e o caminho relativo');
    ok(urlDaEstacao('senha-liberacao', 'conferir') === '/api/senha-liberacao/conferir',
       'sem API_BASE_URL a estacao e o caminho relativo', urlDaEstacao('senha-liberacao', 'conferir'));

    amb.janela.API_PAINEL = 'https://x.supabase.co/functions/v1/painel';
    ok(urlDoPainel('senha-liberacao', 'conferir') === 'https://x.supabase.co/functions/v1/painel/api/senha-liberacao/conferir',
       'urlDoPainel le API_PAINEL pelo window quando o identificador nao existe',
       urlDoPainel('senha-liberacao', 'conferir'));
})();

/** Um pedido aberto com PVC (produto 55) e Laser (produto 56), e o estimado so do PVC. */
function ambienteComEstimado() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.produtosGlobais = [
        { id_produto: 55, nomeReal: 'Credencial', setor_pcp: 'PVC' },
        { id_produto: 56, nomeReal: 'Triband', setor_pcp: 'LASER' },
    ];
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.janela.state.osItens['os-200'][1]._vibe_id_produto = 56;
    amb.banco._produtosDaProposta = [
        { id: 1, id_int: 200, id_produto: 55, qtd: 500, peso_total: 4160 },
        { id: 2, id_int: 201, id_produto: 55, qtd: 500, peso_total: 99999 },   // de OUTRO pedido
    ];
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'PVC', peso_real_kg: 4.16 },
    ];
    return amb;
}

async function oBoxMostraOEstimadoAoLadoDoPeso() {
    const amb = ambienteComEstimado();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('id="acab-peso-est-PVC"') !== -1, 'ha o estimado ao lado do PVC');
    ok(html.indexOf('est. 4,160 kg') !== -1, 'com tres casas e virgula, como o ERP soma', html.indexOf('est.'));
    ok(html.indexOf('est. —') !== -1, 'e o Laser, sem linha com peso, mostra "est. —"');
    ok(html.indexOf('99999') === -1 && html.indexOf('99,999') === -1 && html.indexOf('104,159') === -1,
       'a linha de OUTRO pedido nao entra na soma');

    // Com peso digitado igual ao estimado, a divergencia aparece e e zero.
    const est = amb.elementos['acab-peso-est-PVC'];
    ok(est.textContent.indexOf('+0,0%') !== -1, 'peso igual ao estimado: +0,0%', est.textContent);
    ok(est.style.color !== '#fbbf24', 'e sem o ambar');

    // Gravar dentro dos 5 % atualiza o texto: 4,3 contra 4,16 e +3,4 %.
    await amb.painel.mudarPeso(200, 'PVC', '4,3');
    ok(est.textContent.indexOf('+3,4%') !== -1, 'a divergencia acompanha o peso gravado', est.textContent);
    ok(est.style.color !== '#fbbf24', 'dentro dos 5 % nao e ambar');
}

async function dentroDosCincoPorCentoGravaDireto() {
    const amb = ambienteComEstimado();
    // Estimado redondo para a borda ficar exata: 100 kg.
    amb.banco._produtosDaProposta = [{ id: 1, id_int: 200, id_produto: 55, qtd: 1, peso_total: 100000 }];
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarPeso(200, 'PVC', '105');
    ok(amb.banco._pesosGravados.length === 1, '5,0 % exatos: grava como sempre',
       String(amb.banco._pesosGravados.length));
    ok(amb.elementos['acab-liberacao'].style.display !== 'flex', 'sem popup');
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 105, 'e o banco ficou com o peso');

    // 5,01 %: a gravacao para, e o popup abre.
    amb.banco._pesosGravados.length = 0;
    await amb.painel.mudarPeso(200, 'PVC', '105,01');
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', '5,01 %: o popup da senha abre');
    ok(amb.banco._pesosGravados.length === 0, 'e NADA foi gravado', String(amb.banco._pesosGravados.length));
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 105, 'o banco continua com o peso de antes');
}

async function acimaDosCincoPorCentoNadaEGravadoECancelarDevolveOValor() {
    const amb = ambienteComEstimado();
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;
    ok(amb.elementos['acab-peso-PVC'].value === '4,16', 'o campo comeca com o peso do banco');

    // O operador digita 4,5 (8,2 % acima de 4,160): o campo ja mostra 4,5 e o
    // onchange dispara.
    amb.elementos['acab-peso-PVC'].value = '4,5';
    await amb.painel.mudarPeso(200, 'PVC', '4,5');

    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'o popup abriu');
    const corpo = amb.elementos['acab-liberacao-corpo'].innerHTML;
    ok(corpo.indexOf('PVC') !== -1, 'o popup diz o setor');
    ok(corpo.indexOf('4,5 kg') !== -1, 'o peso digitado', corpo);
    ok(corpo.indexOf('4,160 kg') !== -1, 'o estimado');
    ok(corpo.indexOf('+8,2%') !== -1, 'e a divergencia em %', corpo);
    ok(amb.banco._pesosGravados.length === 0, 'NADA foi gravado', String(amb.banco._pesosGravados.length));
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 4.16, 'o banco continua com 4,16');

    // Cancelar: fecha, e o campo volta ao valor de antes.
    amb.painel.fecharPopupDaLiberacao();
    ok(amb.elementos['acab-liberacao'].style.display === 'none', 'Cancelar fecha o popup');
    ok(amb.elementos['acab-peso-PVC'].value === '4,16',
       'e o campo volta ao valor de antes', amb.elementos['acab-peso-PVC'].value);
    ok(amb.banco._pesosGravados.length === 0, 'sem gravar nada');

    // Liberar sem nada pendente nao grava nem explode.
    await amb.painel.liberarDivergencia();
    ok(amb.banco._pesosGravados.length === 0, 'liberar sem pendencia nao grava');
}

async function senhaErradaNaoGravaEAvisa() {
    const chamadas = [];
    const amb = ambienteComEstimado();
    amb.janela.API_PAINEL = 'https://x.supabase.co/functions/v1/painel';
    amb.janela.fetch = (url, opcoes) => {
        chamadas.push({ url, metodo: (opcoes && opcoes.method) || 'GET',
                        corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, confere: false }) });
    };
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarPeso(200, 'PVC', '4,5');
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'o popup abriu');

    // Senha vazia nem vai ao servidor.
    amb.documento.getElementById('acab-liberacao-senha').value = '';
    await amb.painel.liberarDivergencia();
    ok(chamadas.length === 0, 'senha vazia nao vai ao servidor', String(chamadas.length));
    ok(/senha/i.test(amb.elementos['acab-liberacao-erro'].textContent), 'e a tela pede a senha');

    amb.documento.getElementById('acab-liberacao-senha').value = 'k48';
    await amb.painel.liberarDivergencia();

    ok(chamadas.length === 1, 'a senha foi conferida no servidor', String(chamadas.length));
    ok(chamadas[0].url === 'https://x.supabase.co/functions/v1/painel/api/senha-liberacao/conferir',
       'no site, pela Edge Function do painel', chamadas[0].url);
    ok(chamadas[0].metodo === 'POST' && chamadas[0].corpo && chamadas[0].corpo.senha === 'K48',
       'POST com a senha digitada, em maiusculas', JSON.stringify(chamadas[0]));
    ok(amb.elementos['acab-liberacao-erro'].textContent.indexOf('Senha incorreta') !== -1,
       'senha errada: "Senha incorreta"', amb.elementos['acab-liberacao-erro'].textContent);
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'e o popup continua aberto');
    ok(amb.banco._pesosGravados.length === 0, 'e nada foi gravado');
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 4.16, 'o banco continua com 4,16');

    // Rede fora: o motivo aparece, e o popup fica.
    amb.janela.fetch = () => Promise.reject(new Error('Failed to fetch'));
    amb.documento.getElementById('acab-liberacao-senha').value = 'K47';
    await amb.painel.liberarDivergencia();
    ok(amb.elementos['acab-liberacao-erro'].textContent.indexOf('Failed to fetch') !== -1,
       'erro de rede mostra o motivo', amb.elementos['acab-liberacao-erro'].textContent);
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'e o popup continua aberto');
    ok(amb.banco._pesosGravados.length === 0, 'sem gravar');
}

async function senhaCertaNoSiteGravaPeloCaminhoDeSempre() {
    const chamadas = [];
    const amb = ambienteComEstimado();
    amb.janela.API_PAINEL = 'https://x.supabase.co/functions/v1/painel';
    amb.janela.fetch = (url, opcoes) => {
        chamadas.push({ url, metodo: (opcoes && opcoes.method) || 'GET',
                        corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, confere: true }) });
    };
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    await amb.painel.mudarPeso(200, 'PVC', '4,5');
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'o popup abriu');
    ok(amb.banco._pesosGravados.length === 0, 'abrir nao gravou');

    amb.documento.getElementById('acab-liberacao-senha').value = 'K47';
    await amb.painel.liberarDivergencia();

    ok(chamadas.length === 1 && chamadas[0].corpo.senha === 'K47', 'a senha foi ao painel', JSON.stringify(chamadas));
    ok(amb.elementos['acab-liberacao'].style.display === 'none', 'senha certa: o popup fecha');
    ok(amb.banco._pesosGravados.length === 1, 'e o peso e gravado, pelo PostgREST como sempre',
       String(amb.banco._pesosGravados.length));
    const g = amb.banco._pesosGravados[0];
    ok(g.tipo === 'update' && g.payload.peso_real_kg === 4.5, 'com o peso digitado', JSON.stringify(g));
    ok(Object.keys(g.payload).sort().join(',') === 'peso_real_kg,updated_at',
       'e a escrita continua estreita: so peso e data');
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === 4.5, 'o banco ficou com 4,5');
    ok(amb.elementos['acab-peso-est-PVC'].textContent.indexOf('+8,2%') !== -1,
       'e o estimado ao lado mostra a divergencia', amb.elementos['acab-peso-est-PVC'].textContent);
    ok(amb.elementos['acab-peso-est-PVC'].style.color === '#fbbf24', 'em ambar, porque passou dos 5 %');
}

async function senhaCertaNaEstacaoGravaPeloAgente() {
    // Na estacao as duas coisas saem pelo agente: a senha vai para a rota
    // `senha-liberacao/conferir` e, com o sim, o peso vai para `peso-setores`.
    const chamadas = [];
    const amb = ambienteComEstimado();
    amb.janela.SERVIDA_PELA_NUVEM = false;
    amb.janela.API_BASE_URL = '';
    amb.banco._sessao = null;
    amb.janela.fetch = (url, opcoes) => {
        const metodo = (opcoes && opcoes.method) || 'GET';
        chamadas.push({ url, metodo, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        if (url === '/api/senha-liberacao/conferir') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', confere: true }) });
        }
        if (metodo === 'GET') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ setores: [{ setor: 'PVC', peso_real_kg: 4.16 }] }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
    };

    await amb.painel.abrirPedido('os-200');
    ok(amb.elementos['acab-detalhe-corpo'].innerHTML.indexOf('est. 4,160 kg') !== -1,
       'o estimado aparece na estacao tambem: a leitura e publica, sem sessao');
    chamadas.length = 0;

    // O operador digitou 4,5 no campo; o onchange traz o texto.
    amb.documento.getElementById('acab-peso-PVC').value = '4,5';
    await amb.painel.mudarPeso(200, 'PVC', '4,5');
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'o popup abriu');
    ok(chamadas.length === 0, 'e nenhum POST de peso saiu para o agente', JSON.stringify(chamadas));

    amb.documento.getElementById('acab-liberacao-senha').value = 'K47';
    await amb.painel.liberarDivergencia();

    ok(chamadas.length === 2, 'senha e depois peso: duas chamadas ao agente', JSON.stringify(chamadas));
    ok(chamadas[0].url === '/api/senha-liberacao/conferir' && chamadas[0].metodo === 'POST'
       && chamadas[0].corpo && chamadas[0].corpo.senha === 'K47',
       'a primeira confere a senha pelo agente', JSON.stringify(chamadas[0]));
    ok(chamadas[1].url === '/api/peso-setores/200' && chamadas[1].metodo === 'POST'
       && chamadas[1].corpo.setor === 'PVC' && chamadas[1].corpo.peso_real_kg === 4.5,
       'a segunda grava o peso pela rota de sempre', JSON.stringify(chamadas[1]));
    ok(amb.elementos['acab-liberacao'].style.display === 'none', 'e o popup fechou');
    ok(amb.banco._pesosGravados.length === 0, 'NADA foi direto a tabela do parceiro pela estacao');
    ok(amb.elementos['acab-peso-PVC'].value === '4,5', 'o campo ficou com o peso liberado',
       amb.elementos['acab-peso-PVC'].value);
}

async function semEstimadoGravaDireto() {
    const amb = ambienteComEstimado();
    amb.banco._produtosDaProposta = [];   // pedido sem linha com peso
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;

    ok(amb.elementos['acab-detalhe-corpo'].innerHTML.indexOf('est. —') !== -1, 'o box mostra "est. —"');
    await amb.painel.mudarPeso(200, 'PVC', '999');
    ok(amb.elementos['acab-liberacao'].style.display !== 'flex', 'sem estimado nao ha popup');
    ok(amb.banco._pesosGravados.length === 1, 'e o peso grava direto', String(amb.banco._pesosGravados.length));

    // Apagar o campo tambem nao confere, mesmo com estimado.
    amb.banco._produtosDaProposta = [{ id: 1, id_int: 200, id_produto: 55, qtd: 1, peso_total: 4160 }];
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;
    await amb.painel.mudarPeso(200, 'PVC', '');
    ok(amb.elementos['acab-liberacao'].style.display !== 'flex', 'apagar o peso nao pede senha');
    ok(amb.banco._pesosGravados.length === 1 && amb.banco._pesosGravados[0].payload.peso_real_kg === null,
       'e grava o nulo como sempre', JSON.stringify(amb.banco._pesosGravados));
}

// ─── Resultado ──────────────────────────────────────────────────────────────

(function oQueAguardaTemFundoMarrom() {
    // Pedido do usuario: "modelos Aguardando ... fundo do box do modelo marrom".
    //
    // Estas quatro cores atravessaram DUAS repaginacoes sem mudar: a de
    // 20/08/2026 (marrom) e a de 21/08 (azul). O marrom do "Aguardando" agora
    // contrasta forte com a pagina azul, e e assim que fica ate o usuario dizer
    // o contrario -- cor de estado nao acompanha a paleta.
    const amb = ambienteComPedidoAberto();
    // O primeiro NAO saiu da impressora: e assim que se chega ao Aguardando de
    // verdade. Desde 21/08/2026, `acabamento_status = 'Aguardando'` sozinho nao
    // basta -- ele cai para a derivacao, e o derivado de um modelo impresso e
    // "Impresso".
    amb.janela.state.osItens['os-200'][0].status_impressao = 'Aguardando';
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Aguardando';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Pronto';
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('background: #003768') !== -1, 'o modelo Aguardando tem o fundo proprio');

    // As cores por STATUS nao acompanham a paleta da tela, e e de proposito:
    // elas dizem em que ponto o modelo esta, e sao ditadas pelo usuario -- estas
    // vieram dele em 22/08/2026, uma a uma.
    ok(html.indexOf('background: #00471c') !== -1, 'e o Pronto, verde escuro');

    // O Impresso, num cenario onde ele exista: neste os dois modelos foram
    // forcados para Aguardando e Pronto.
    const amb2 = ambienteComPedidoAberto();   // sem forcar: os dois derivam de "Impresso"
    amb2.painel.abrirPedido('os-200');
    ok(amb2.elementos['acab-detalhe-corpo'].innerHTML.indexOf('background: #001249') !== -1,
       'o Impresso fica no azul da tela');

    // A PAGINA, essa sim, seguiu a paleta azul de 21/08/2026.
    ok(html.indexOf('#001249') !== -1, 'a caixa do produto e o navy da paleta');
    ok(html.indexOf('#0d0e20') !== -1, 'o cabecalho dela e o navy mais fundo');
    ok(html.indexOf('#2b32af') !== -1, 'e o contorno e o azul royal da paleta');
    ok(html.indexOf('#918f8c') === -1, 'e o cinza da fila do Pedido nao sobrou');
    ok(html.indexOf('var(--blue)') === -1, 'nem o azul do numero do pedido');
})();

(function aCameraApareceEmCadaModelo() {
    const amb = ambienteComPedidoAberto();
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    const botoes = html.match(/AcabamentoPainel\.abrirCamera\(/g) || [];
    ok(botoes.length === 2, 'um botao de camera por modelo', 'achei ' + botoes.length);
    ok(html.indexOf('Fotografar') !== -1, 'o botao diz o que faz');
    ok(html.indexOf('Foto do material') !== -1, 'e a faixa tem rotulo em texto');
    ok(html.indexOf('Nenhuma foto do material ainda') !== -1,
       'modelo sem foto diz que nao tem foto, em vez de mostrar caixa vazia');

    // Com foto gravada, aparece a miniatura e o botao vira "Refazer".
    const amb2 = ambienteComPedidoAberto();
    amb2.janela.state.osItens['os-200'][0].acabamento_foto_url =
        'https://x.supabase.co/storage/v1/object/public/artes/acabamento-fotos/200_3001_1.jpg';
    amb2.painel.abrirPedido('os-200');
    const html2 = amb2.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html2.indexOf('acabamento-fotos/200_3001_1.jpg') !== -1, 'a foto gravada vira miniatura');
    ok(html2.indexOf('Refazer foto') !== -1, 'e o botao passa a oferecer refazer');
})();

(function aFotoVaiParaOBucketQueJaAceitaEscrita() {
    // Bucket novo com escrita anonima JA FOI TENTADO neste projeto e nao
    // funcionou -- ver sql/criar_bucket_previews.sql, que comeca com "NAO
    // EXECUTE ESTE ARQUIVO". A saida foi usar o `artes` com um prefixo, e e o
    // que este teste trava.
    const { painel } = montarAmbiente();
    ok(painel._regras.BUCKET_DA_FOTO === 'artes', 'a foto vai para o bucket artes');
    ok(painel._regras.PASTA_DA_FOTO === 'acabamento-fotos', 'num prefixo proprio');

    const codigo = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(codigo.indexOf("createBucket") === -1, 'a tela nao tenta criar bucket');
    const uploads = codigo.match(/\.storage\s*\n?\s*\.from\(|storage\.from\(/g) || [];
    ok(uploads.length >= 1, 'ha upload para o storage');
    ok(codigo.indexOf("from('previews-numeracoes')") === -1,
       'e nao para o bucket que nao aceita escrita');
})();

(function aFotoELidaComoOsOutrosCampos() {
    const { painel } = montarAmbiente();
    const foto = painel._regras.fotoDoModelo;
    ok(foto({}) === '', 'modelo sem foto devolve vazio');
    ok(foto({ acabamento_foto_url: null }) === '', 'nulo tambem');
    ok(foto({ acabamento_foto_url: ' https://x/y.jpg ' }) === 'https://x/y.jpg', 'e a URL vem limpa');
})();

async function pedidoEncerradoComoTesteSomeDaFila() {
    // Pedido do usuario em 20/08/2026: ignorar na lista as propostas cuja
    // coluna `encerrado_teste_em` esta preenchida. E o carimbo de "isto foi um
    // teste, pode sumir" -- e some da lista E das metricas, nao so da tabela.
    const pedidos = [pedido(501), pedido(502), pedido(503)];
    const amb = ambienteComPedidos(pedidos, {
        501: [{ id: 1, quantidade: 10, status_impressao: 'Impresso' }],
        502: [{ id: 2, quantidade: 20, status_impressao: 'Impresso' }],
        503: [{ id: 3, quantidade: 30, status_impressao: 'Impresso' }],
    });
    amb.banco._encerradosTeste = [{ id_int: 502 }];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    const html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>501<') !== -1, 'o pedido de verdade continua na lista');
    ok(html.indexOf('>503<') !== -1, 'e o outro tambem');
    ok(html.indexOf('>502<') === -1, 'o pedido encerrado como teste some da lista');

    ok(amb.elementos['stat-acab-pedidos-fila'].textContent === 2,
       'e some tambem da contagem da fila', amb.elementos['stat-acab-pedidos-fila'].textContent);
    ok(amb.elementos['badge-acabamento'].textContent === 2, 'e do badge do menu');
    ok(amb.elementos['os-acabamento-count-badge'].textContent === '2 Pedidos',
       'e do contador da tabela', amb.elementos['os-acabamento-count-badge'].textContent);
}

async function bancoSemAColunaDoTesteNaoEscondeNinguem() {
    // Falhar a leitura NAO pode esconder pedido: sem resposta, a fila aparece
    // inteira, que e o comportamento de antes deste recurso. Esconder por
    // engano e o erro caro -- o pedido some da tela de quem trabalha nele.
    const pedidos = [pedido(601), pedido(602)];
    const amb = ambienteComPedidos(pedidos, {
        601: [{ id: 1, quantidade: 10 }],
        602: [{ id: 2, quantidade: 20 }],
    });
    amb.banco.from = () => { throw new Error('coluna encerrado_teste_em nao existe'); };

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    const html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>601<') !== -1 && html.indexOf('>602<') !== -1,
       'sem resposta do banco, a fila aparece inteira');
}

async function aListaDeResponsaveisVemDaViewDeOperadores() {
    const amb = ambienteComPedidoAberto();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('>Bernardo Farias<') !== -1, 'o operador ativo entra na lista de responsaveis');
    ok(html.indexOf('>Cesar Almeida<') !== -1, 'e o outro tambem');
    ok(html.indexOf('Quem Saiu') === -1, 'acesso desativado NAO aparece como responsavel');
    ok(html.indexOf('Responsável —</option>') !== -1, 'ha a opcao de deixar sem responsavel');

    // Regra do usuario, 22/08/2026: so o perfil Acabamento e opcao.
    ok(html.indexOf('Gustavo Impressor') === -1,
       'operador de outro perfil NAO aparece como responsavel');
    ok(FONTE.indexOf("PERFIL_DO_RESPONSAVEL = 'acabamento'") !== -1,
       'o filtro esta escrito no acabamento.js');

    // O codigo de acesso e segredo de estacao: nem pedido ao banco, nem exibido.
    ok(FONTE.indexOf("'codigo'") === -1, 'o acabamento.js nunca pede o codigo de acesso');
    ok(FONTE.indexOf('imposition_acessos_locais') === -1,
       'a leitura passa pela view, nunca pela tabela dos codigos');
    ok(FONTE.indexOf('imposition_operadores') !== -1, 'a lista vem da view de operadores');
}

async function oResponsavelGravadoForaDoPerfilContinuaAparecendo() {
    // O perfil de alguem muda, ou a pessoa sai da grafica -- e o modelo que ela
    // acabou continua sendo dela. Sumir com o nome faria o trabalho parecer sem
    // dono, e o proximo operador regravaria por cima sem saber que houve alguem.
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][1].acabamento_responsavel = 'Gustavo Impressor';
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('>Gustavo Impressor<') !== -1,
       'o responsavel ja gravado aparece mesmo fora do perfil');
    ok(/Gustavo Impressor<\/option>/.test(html.replace(/\s+selected/g, '')),
       'e como opcao do seletor, nao como texto solto');
}

async function semNinguemNoPerfilOSeletorDizOQueFazer() {
    // Trava sem saida e trava que para a producao: o operador abriria um seletor
    // vazio sem ter como saber que falta escolher o perfil de alguem.
    const amb = ambienteComPedidoAberto();
    amb.banco._operadores = [
        { id: 4, nome: 'Gustavo Impressor', role: 'impressor', ativo: true },
    ];
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('perfil <b>✂️ Acabamento</b>') !== -1, 'a tela diz que falta perfil');
    ok(html.indexOf('Acesso Local') !== -1, 'e diz onde resolver');
    ok(html.indexOf('ATUALIZAR') !== -1, 'e diz como recarregar depois de resolver');
}

async function gravarEscreveSoNasDuasColunasNovas() {
    const amb = ambienteComPedidoAberto();
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarEstagio('3001', 'os-200', 'Pronto');
    await amb.painel.mudarResponsavel('3001', 'os-200', 'Cesar Almeida');

    ok(amb.banco._gravacoes.length === 2, 'duas escolhas, duas gravacoes',
       'achei ' + amb.banco._gravacoes.length);
    amb.banco._gravacoes.forEach(g => {
        ok(g.tabela === 'pedidos_modelos', 'grava em pedidos_modelos');
        ok(g.coluna === 'id', 'grava pelo id do modelo');
        ok(g.valor === 3001, 'id numerico vai como numero, e nao como texto', String(g.valor));
        const colunas = Object.keys(g.payload);
        ok(colunas.length === 1, 'uma coluna por gravacao');
        ok(['acabamento_status', 'acabamento_responsavel', 'acabamento_foto_url'].indexOf(colunas[0]) !== -1,
           'so as colunas do acabamento sao escritas', colunas[0]);
    });

    // A tela ja mostra a escolha antes de a rede responder.
    const item = amb.janela.state.osItens['os-200'].find(i => String(i.id) === '3001');
    ok(item.acabamento_status === 'Pronto', 'a escolha aparece na hora, sem esperar o banco');
    ok(item.acabamento_responsavel === 'Cesar Almeida', 'o responsavel tambem');

    // Limpar o responsavel grava NULO, e nao texto vazio.
    amb.banco._gravacoes.length = 0;
    await amb.painel.mudarResponsavel('3001', 'os-200', '');
    ok(amb.banco._gravacoes[0].payload.acabamento_responsavel === null,
       'apagar o responsavel grava nulo, nao string vazia');
}

async function oEstagioDaListaVemDeConsultaPropria() {
    // A lista NAO depende de o `carregarModelosGlobais` do script.js trazer as
    // colunas novas: ela pergunta por elas por conta propria. E o que protege o
    // Painel de Producao de quebrar enquanto o SQL nao tiver rodado.
    const pedidos = [pedido(301), pedido(302)];
    const amb = ambienteComPedidos(pedidos, {
        301: [{ id: 900, quantidade: 10 }],   // sem acabamento_status: e a lista enxuta
        302: [{ id: 901, quantidade: 20 }],
    });
    amb.banco._modelosDoBanco = [
        { id: 900, id_int: 301, acabamento_status: 'Pronto', acabamento_responsavel: 'Bernardo Farias' },
        { id: 901, id_int: 302, acabamento_status: 'Em acabamento', acabamento_responsavel: null },
    ];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    ok(amb.elementos['stat-acab-modelos-prontos'].textContent === 1,
       'o pronto veio da consulta propria', amb.elementos['stat-acab-modelos-prontos'].textContent);
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1,
       'e o em acabamento tambem');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>301<') === -1,
       'o pedido pronto sai da fila de trabalho');
}

async function bancoSemAsColunasNaoDerrubaATela() {
    // Enquanto o SQL nao tiver rodado, o PostgREST responde que a coluna nao
    // existe. A tela tem de continuar listando os pedidos e dizer, uma vez, o
    // que fazer -- e nunca deixar o operador diante de uma tela muda.
    const pedidos = [pedido(401)];
    const amb = ambienteComPedidos(pedidos, { 401: [{ id: 950, quantidade: 5 }] });
    amb.banco._erroDoBanco = { message: 'column pedidos_modelos.acabamento_status does not exist' };

    const avisos = [];
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>401<') !== -1,
       'a lista de pedidos continua de pe sem as colunas novas');
    ok(avisos.length === 1, 'houve um aviso', 'achei ' + avisos.length);
    ok(/banco/i.test(avisos[0].texto), 'o aviso fala do banco');
    ok(/administrador/i.test(avisos[0].texto), 'e diz a quem pedir -- a trava tem saida');

    // E nao se repete a cada desenho.
    amb.painel.render();
    await amb.painel.atualizar();
    await new Promise(r => setTimeout(r, 0));
    ok(avisos.length === 1, 'o aviso nao vira ruido a cada desenho', 'achei ' + avisos.length);
}

// ─── Os volumes (23/08/2026) ─────────────────────────────────────────────────
//
// Pedido do usuario, depois de o peso por setor entrar: um modelo grande feito
// por varias pessoas, varios modelos pesados juntos, e o mesmo modelo repartido
// em varias caixas -- "nada disso invalida o campo ja existente onde precisa
// informar o peso total do setor".
//
// O que estes testes travam, em uma frase cada:
//
//   1. setor sem volume continua sendo 1 volume unico, dito em texto;
//   2. um volume leva varios modelos, e um modelo cabe em varios volumes;
//   3. cada volume tem o SEU responsavel, sem disputar o do card;
//   4. volume nao atravessa setor;
//   5. a soma e conferida contra o peso do setor, e nao o substitui;
//   6. e NADA disso escreve em tabela do parceiro.

function ambienteDeVolumes() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.produtosGlobais = [
        { id_produto: 55, nomeReal: 'Credencial', setor_pcp: 'LASER' },
        { id_produto: 56, nomeReal: 'Cartao', setor_pcp: 'PVC' },
    ];
    const itens = amb.janela.state.osItens['os-200'];
    itens[0].setor = 'LASER';
    itens[0].produto = 'Credencial VIP';
    itens[0].qtd = 5000;
    itens[1].setor = 'LASER';
    itens[1].produto = 'Credencial Staff';
    itens[1].qtd = 500;
    itens[1].acabamento_status = 'Em acabamento';
    itens[1].acabamento_responsavel = 'Cesar Almeida';
    // Um terceiro modelo, de OUTRO setor: e ele que prova que o volume nao
    // atravessa setor.
    itens.push({
        id: 3003, produto: 'Cartao Socio', modelo: '3003', _vibe_id_produto: 56,
        setor: 'PVC', qtd: 3000, status_impressao: 'Impresso',
        acabamento_status: 'Em acabamento', acabamento_responsavel: 'Cesar Almeida',
    });
    amb.banco._setoresDoBanco = [
        { id: 'a', id_int: 200, setor: 'LASER', peso_real_kg: null },
        { id: 'b', id_int: 200, setor: 'PVC', peso_real_kg: null },
    ];
    return amb;
}

/**
 * O indice da linha do pacote daquele modelo na janela aberta.
 *
 * Os campos passaram a ser numerados pela POSICAO (`acab-vol-qtd-0`) e nao
 * mais pelo id do modelo: dois pacotes do mesmo modelo na mesma caixa dariam
 * dois campos com o mesmo id.
 */
function indiceDoPacote(amb, modeloId) {
    const v = amb.painel._tela.volumeEmEdicao;
    if (!v) return -1;
    return v.pacotes.findIndex(p => String(p.modeloId) === String(modeloId));
}

/** O campo da quantidade do pacote daquele modelo. */
function campoDaQtd(amb, modeloId) {
    return amb.documento.getElementById('acab-vol-qtd-' + indiceDoPacote(amb, modeloId));
}

/** O caminho inteiro do operador: "+ Volume", marcar, pesar, gravar. */
async function criarVolume(amb, opcoes) {
    amb.painel.novoVolume(opcoes.setor, 200);
    (opcoes.marcar || []).forEach(id => amb.painel.marcarModelo(id));
    amb.painel.pesarVolume();
    const qtds = opcoes.qtds || {};
    Object.keys(qtds).forEach(id => {
        campoDaQtd(amb, id).value = String(qtds[id]);
    });
    // Quem fez cada pacote: `{ 3001: 'Ana Paula' }`.
    const quem = opcoes.pacoteDe || {};
    Object.keys(quem).forEach(id => {
        amb.documento.getElementById('acab-vol-resp-' + indiceDoPacote(amb, id)).value = quem[id];
    });
    amb.documento.getElementById('acab-vol-peso').value = opcoes.peso;
    amb.documento.getElementById('acab-vol-nome').value = opcoes.nome || '';
    amb.documento.getElementById('acab-vol-tipo').value = opcoes.tipo || 'Caixa';
    amb.documento.getElementById('acab-vol-responsavel').value = opcoes.responsavel || '';
    amb.documento.getElementById('acab-vol-obs').value = opcoes.observacao || '';
    await amb.painel.confirmarVolume();
}

/** As janelas dos volumes nascem por `createElement`; aqui elas ficam a mao. */
function capturarJanelas(amb) {
    const criadas = [];
    const original = amb.documento.createElement;
    amb.documento.createElement = function (tag) {
        const el = original(tag);
        criadas.push(el);
        return el;
    };
    return {
        achar: id => criadas.filter(e => e.id === id).pop(),
    };
}

async function setorSemVolumeSaiComoUmSo() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('1 volume único') !== -1, 'o setor sem volume diz que sai como um so');
    ok(html.indexOf('Dividir em volumes') !== -1, 'e oferece a saida, na propria tela');
    ok(html.indexOf('Ver volumes') === -1, 'sem volume nao ha lista a oferecer');
    // O card do modelo tambem fica quieto: bloco de volumes so onde ha volume.
    ok(html.indexOf('>Volumes<') === -1, 'e o card do modelo nao ganha bloco nenhum');
}

async function umVolumeLevaVariosModelos() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    // A escolha comeca: os dois do Laser sao marcaveis, o do PVC nao.
    amb.painel.novoVolume('LASER', 200);
    const naEscolha = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(naEscolha.indexOf('Escolha o que vai neste volume') !== -1, 'a faixa anuncia o modo');
    ok(naEscolha.indexOf('marcarModelo(&#39;3001&#39;)') !== -1
       || naEscolha.indexOf("marcarModelo('3001')") !== -1, 'o modelo do setor ganha caixa de marcar');
    ok(naEscolha.indexOf('Este modelo é de outro setor') !== -1,
       'e o de outro setor aparece, apagado, dizendo por que');

    amb.painel.marcarModelo(3001);
    amb.painel.marcarModelo(3002);
    ok(amb.elementos['acab-detalhe-corpo'].innerHTML.indexOf('2 modelos escolhidos') !== -1,
       'a barra conta o que foi marcado');

    // A janela nasce com o que AINDA ESTA FORA de volume -- a tiragem inteira.
    amb.painel.pesarVolume();
    const emEdicao = amb.painel._tela.volumeEmEdicao;
    ok(emEdicao.numero === 1, 'o primeiro volume e o V1', String(emEdicao.numero));
    ok(emEdicao.pacotes.length === 2, 'com os dois modelos dentro', String(emEdicao.pacotes.length));
    ok(emEdicao.pacotes[0].qtd === 5000 && emEdicao.pacotes[1].qtd === 500,
       'e a quantidade ja vem cheia com o que falta embalar');

    campoDaQtd(amb, 3001).value = '5.000';
    campoDaQtd(amb, 3002).value = '500';
    amb.documento.getElementById('acab-vol-peso').value = '12,48';
    amb.documento.getElementById('acab-vol-tipo').value = 'Caixa';
    amb.documento.getElementById('acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();

    ok(amb.banco._volumesDoBanco.length === 1, 'um volume foi gravado',
       String(amb.banco._volumesDoBanco.length));
    const v = amb.banco._volumesDoBanco[0];
    ok(v.id_int === 200 && v.setor === 'LASER' && v.numero === 1, 'no pedido e no setor certos');
    ok(Number(v.peso_kg) === 12.48, 'com o peso da balanca', String(v.peso_kg));
    ok(v.responsavel === 'Bernardo Farias', 'e com quem pesou');
    ok(amb.banco._itensDeVolume.length === 2, 'os dois modelos entraram',
       String(amb.banco._itensDeVolume.length));
    ok(amb.banco._itensDeVolume[0].modelo_id === 3001, 'pelo id do modelo, numero',
       String(amb.banco._itensDeVolume[0].modelo_id));

    // E a escolha se desfaz sozinha: a lista volta ao normal.
    ok(amb.painel._tela.escolhaDeVolume === null, 'o modo de escolha termina com a gravacao');
    const depois = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(depois.indexOf('1 volume') !== -1 && depois.indexOf('12,480 kg') !== -1,
       'e a faixa passa a mostrar o volume e a soma');
}

async function oMesmoModeloCabeEmVariosVolumes() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    // V1 leva 2.000 das 5.000 credenciais.
    await criarVolume(amb, {
        setor: 'LASER', marcar: [3001], qtds: { 3001: '2.000' },
        peso: '4,18', responsavel: 'Bernardo Farias',
    });

    // O que sobrou aparece na faixa e no card.
    let html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('ainda fora de volume') !== -1, 'a faixa avisa o que falta embalar');
    ok(html.indexOf('2.000 de 5.000 embalados') !== -1, 'e o card do modelo faz a conta', html.indexOf('embalados'));

    // V2 nasce ja sugerindo as 3.000 que sobraram -- e so as dele.
    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    const emEdicao = amb.painel._tela.volumeEmEdicao;
    ok(emEdicao.numero === 2, 'o segundo volume e o V2', String(emEdicao.numero));
    ok(emEdicao.pacotes[0].qtd === 3000, 'e a sugestao e o RESTO, nao a tiragem',
       String(emEdicao.pacotes[0].qtd));

    campoDaQtd(amb, 3001).value = '3000';
    amb.documento.getElementById('acab-vol-peso').value = '6,3';
    amb.documento.getElementById('acab-vol-responsavel').value = 'Cesar Almeida';
    await amb.painel.confirmarVolume();

    html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('5.000 de 5.000 embalados') !== -1, 'agora o modelo esta inteiro em caixa');
    ok(html.indexOf('Credencial VIP (') === -1, 'e o aviso do que falta nao cita mais a VIP');
    ok(html.indexOf('Credencial Staff (500)') !== -1,
       'mas continua citando o modelo do setor que ninguem embalou ainda');
    ok(html.indexOf('10,480 kg') !== -1, 'a soma dos dois volumes aparece na faixa');
}

async function cadaVolumeTemOSeuResponsavel() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '2500' },
                             peso: '5', responsavel: 'Bernardo Farias' });
    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '2500' },
                             peso: '5', responsavel: 'Cesar Almeida' });

    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('Bernardo Farias') !== -1 && html.indexOf('Cesar Almeida') !== -1,
       'os dois nomes aparecem, um por volume');

    // O responsavel do CARD continua sendo um so, e continua o mesmo.
    const gravadosNoModelo = amb.banco._gravacoes.filter(g => g.payload
        && g.payload.acabamento_responsavel !== undefined);
    ok(gravadosNoModelo.length === 0,
       'e o responsavel do modelo nao foi tocado por causa dos volumes',
       String(gravadosNoModelo.length));
}

async function oVolumeNaoAtravessaSetor() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3003);            // o do PVC
    ok(Object.keys(amb.painel._tela.escolhaDeVolume.marcados).length === 1,
       'marcar pelo console ate deixa, porque a caixa nem existe na tela');

    // Mas o que importa: a regra diz que ele nao e marcavel, e a tela nao
    // desenha caixa para ele.
    const itens = amb.janela.state.osItens['os-200'];
    ok(amb.painel._regras.marcavelNaEscolha(itens[0]) === true, 'o do Laser e marcavel');
    ok(amb.painel._regras.marcavelNaEscolha(itens[2]) === false, 'o do PVC nao e');

    amb.painel.cancelarVolume();
    ok(amb.painel._tela.escolhaDeVolume === null, 'cancelar desfaz a escolha inteira');
}

async function aSomaEConferidaContraOPesoDoSetor() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             peso: '12,48', responsavel: 'Bernardo Farias' });

    // Sem ninguem mexer no box, os dois numeros sao o mesmo: o peso do setor
    // passou a ser a soma das caixas (pedido do usuario, 23/08/2026).
    let html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('12,480 kg') !== -1, 'a soma dos volumes aparece');
    ok(html.indexOf('acompanha a soma') !== -1,
       'e a tela anuncia que o peso do setor segue essa soma sozinho');
    ok(amb.painel._regras.diferencaDosVolumes('LASER') === 0,
       'sem diferenca, porque o peso do setor E a soma',
       String(amb.painel._regras.diferencaDosVolumes('LASER')));

    // Alguem digita OUTRO numero no box: a diferenca volta a existir e e dita.
    // O `gravarPeso` nao redesenha o pedido de proposito (nao arrancar o foco
    // de quem digita); a faixa se atualiza na proxima pintura da tela.
    await amb.painel.mudarPeso(200, 'LASER', '12,50');
    await amb.painel.abrirPedido('os-200');
    html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('20 g acima') !== -1, 'a diferenca contra o peso digitado, em gramas');
    ok(html.indexOf('digitou à mão') !== -1, 'e a tela diz de onde ela veio');

    // O campo do peso do setor continua sendo o que sempre foi.
    ok(html.indexOf('id="acab-peso-LASER"') !== -1, 'o campo do peso do setor continua la');
    ok(amb.painel._regras.diferencaDosVolumes('LASER') === 20, 'a conta e em gramas',
       String(amb.painel._regras.diferencaDosVolumes('LASER')));
}

async function usarASomaPassaPeloGravarPesoDeSempre() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    amb.banco._pesosGravados.length = 0;
    await amb.painel.usarSomaDosVolumes('LASER');

    ok(amb.banco._pesosGravados.length === 1, 'a soma virou peso do setor pelo caminho de sempre',
       String(amb.banco._pesosGravados.length));
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 9.5, 'e o banco ficou com 9,5',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
}

async function excluirUmVolumeDevolveOsModelos() {
    const amb = ambienteDeVolumes();
    amb.janela.caixaConfirmar = { perguntar: () => Promise.resolve(true) };
    await amb.painel.abrirPedido('os-200');
    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    const id = amb.banco._volumesDoBanco[0].id;
    await amb.painel.excluirVolume(id);

    ok(amb.banco._volumesDoBanco.length === 0, 'o volume saiu do banco');
    ok(amb.banco._itensDeVolume.length === 0, 'e os itens dele foram junto (cascade)');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('1 volume único') !== -1, 'o setor volta a ser 1 volume unico');
}

async function osVolumesNaoTocamEmTabelaDoParceiro() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    amb.banco._pesosGravados.length = 0;
    amb.banco._propostasGravadas.length = 0;

    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             peso: '12,48', responsavel: 'Bernardo Farias' });

    // Desde 23/08/2026 criar volume ATUALIZA o peso do setor -- foi pedido
    // ("a soma de seus pesos vai atualizando o peso real do setor"). O que a
    // regra da casa protege continua valendo: na ficha do parceiro entra o
    // peso, e SO o peso.
    const naFicha = amb.banco._pesosGravados;
    ok(naFicha.length >= 1, 'criar volume atualiza o peso do setor na ficha',
       String(naFicha.length));
    const colunas = [];
    naFicha.forEach(g => Object.keys(g.payload || g.linha || {}).forEach(c => {
        if (colunas.indexOf(c) === -1) colunas.push(c);
    }));
    ok(colunas.sort().join(',') === 'peso_real_kg,updated_at',
       'e escreve NAQUELA ficha apenas peso e carimbo de hora', colunas.join(','));
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 12.48,
       'o peso do setor virou a soma das caixas',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
    ok(amb.banco._propostasGravadas.length === 0, 'e nada em `propostas`');
    ok(amb.banco._volumesGravados.some(g => g.tipo === 'insert'), 'o volume em si e tabela nossa');

    // A decisao do usuario em 23/08/2026, travada no codigo: nada de
    // `qtd_volumes` nem de `tipo_volume`.
    // Os comentarios do arquivo CITAM as duas colunas, para explicar por que
    // elas nao sao escritas. O que a regra proibe e o codigo.
    const codigo = FONTE
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*)/.test(l))
        .join('\n');
    ok(codigo.indexOf('qtd_volumes') === -1, 'o CODIGO nao escreve qtd_volumes');
    ok(codigo.indexOf('tipo_volume') === -1, 'nem tipo_volume');
}

async function naEstacaoOVolumeGravaSemAgente() {
    const amb = ambienteDeVolumes();
    amb.banco._sessao = null;                  // estacao: sem sessao do Supabase
    const chamadas = [];
    amb.janela.fetch = (url) => { chamadas.push(url); return Promise.reject(new Error('nao deveria')); };
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    ok(amb.banco._volumesDoBanco.length === 1, 'o volume foi gravado sem sessao nenhuma',
       String(amb.banco._volumesDoBanco.length));
    ok(chamadas.length === 0, 'e sem passar pelo agente -- a tabela e nossa',
       chamadas.join(' | '));
}

async function numeroRepetidoDizOQueFazer() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    // Outro operador criou o V1 enquanto este montava o dele.
    amb.banco._volumesDoBanco.push({ id: 'de-outro', id_int: 200, setor: 'LASER', numero: 1 });

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    const erro = amb.documento.getElementById('acab-vol-erro').textContent;
    ok(/outro operador/i.test(erro), 'a janela diz o que aconteceu', erro);
    ok(/\+ Volume/.test(erro), 'e o que fazer para sair -- a trava tem saida', erro);
}

async function aListaDoSetorMostraOQueTemDentro() {
    const amb = ambienteDeVolumes();
    amb.banco._setoresDoBanco[0].peso_real_kg = 12.5;
    const janelas = capturarJanelas(amb);
    await amb.painel.abrirPedido('os-200');
    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             peso: '12,48', responsavel: 'Bernardo Farias', tipo: 'Fardo' });

    amb.painel.verVolumes('LASER');
    const caixa = janelas.achar('acab-volumes-lista');
    ok(!!caixa, 'a janela dos volumes abriu');
    const html = caixa ? caixa.innerHTML : '';

    ok(html.indexOf('V1') !== -1, 'o volume aparece pelo numero');
    ok(html.indexOf('Fardo') !== -1, 'com o tipo');
    ok(html.indexOf('Credencial VIP') !== -1 && html.indexOf('Credencial Staff') !== -1,
       'e com os modelos que estao dentro dele');
    ok(html.indexOf('5.000 un') !== -1, 'cada um com a sua quantidade');
    ok(html.indexOf('Soma dos volumes') !== -1 && html.indexOf('Peso do setor') !== -1,
       'a conferencia mostra os dois numeros lado a lado');
    ok(html.indexOf('acompanha a soma das caixas') !== -1,
       'e diz que o peso do setor ja segue a soma');
    ok(html.indexOf('todos os modelos do setor já estão em algum volume') !== -1,
       'a cobertura do setor e dita');

    // Alguem digita outro peso no box: ai sim aparece a saida para voltar a soma.
    await amb.painel.mudarPeso(200, 'LASER', '12,50');
    amb.painel.verVolumes('LASER');
    const html2 = janelas.achar('acab-volumes-lista').innerHTML;
    ok(html2.indexOf('Usar 12,480 kg como peso do setor') !== -1,
       'com divergencia, o botao de voltar a soma aparece');
}

async function oPesoQueFechaOSetorJaVemComASoma() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    // Caixa SEM peso: nao ha soma para o setor herdar, e a trava do Pronto
    // continua sendo a de sempre.
    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             peso: '', responsavel: 'Bernardo Farias' });
    ok(amb.banco._setoresDoBanco[0].peso_real_kg === null,
       'caixa sem peso nao escreve peso nenhum no setor',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));

    // Os dois modelos do Laser viram Pronto; o segundo fecha o setor.
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');
    await amb.painel.mudarEstagio(3002, 'os-200', 'Pronto');

    ok(amb.elementos['acab-peso-obrigatorio'].style.display === 'flex',
       'a janela do peso continua cobrando ao fechar o setor');

    // Confirmar grava o peso e SO ENTAO marca o Pronto -- como antes.
    amb.documento.getElementById('acab-peso-obrig-campo').value = '12,48';
    await amb.painel.confirmarPesoDoSetor();
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 12.48, 'o peso entrou no setor',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
    const pronto = amb.banco._gravacoes.filter(g => g.payload
        && g.payload.acabamento_status === 'Pronto');
    ok(pronto.length >= 1, 'e o modelo virou Pronto depois disso');
}

/**
 * Com caixa PESADA, o setor nao chega a ser cobrado: o peso ja entrou pela
 * soma, e os modelos ja fecharam sozinhos pelos pacotes.
 */
async function comCaixaPesadaOSetorNaoECobrado() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             peso: '12,48', responsavel: 'Bernardo Farias',
                             pacoteDe: { 3001: 'Bernardo Farias', 3002: 'Bernardo Farias' } });

    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 12.48,
       'o peso do setor entrou pela soma das caixas',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
    const janela = amb.elementos['acab-peso-obrigatorio'];
    ok(!janela || janela.style.display !== 'flex',
       'e a janela do peso nem chega a aparecer');
}

async function asContasDosVolumesSaoPuras() {
    const r = ambienteDeVolumes().painel._regras;

    // A soma some em gramas inteiras: 0,1 + 0,2 nao pode dar 0,30000000000000004.
    ok(r.somaDosVolumes([{ peso: 0.1 }, { peso: 0.2 }]) === 0.3, 'a soma nao escorrega no ponto flutuante');
    ok(r.somaDosVolumes([{ peso: 4.18 }, { peso: null }]) === 4.18, 'volume sem peso conta como zero');
    ok(r.somaDosVolumes([]) === 0, 'lista vazia soma zero');

    ok(r.proximoNumeroDeVolume([]) === 1, 'o primeiro volume e o V1');
    ok(r.proximoNumeroDeVolume([{ numero: 1 }, { numero: 3 }]) === 4,
       'e buraco nao se reaproveita: depois do V3 vem o V4');

    // Embalar mais do que a tiragem nunca vira numero negativo na tela.
    ok(r.faltaEmbalar({ id: 1, qtd: 100 }, { 1: 140 }) === 0, 'embalado a mais nao fica negativo');
    ok(r.faltaEmbalar({ id: 1, qtd: 100 }, {}) === 100, 'sem volume, falta a tiragem inteira');

    ok(r.qtdDoTexto('2.000') === 2000 && r.qtdDoTexto('2000') === 2000,
       '"2.000" e "2000" sao o mesmo numero');
    ok(r.qtdDoTexto('') === 0 && r.qtdDoTexto('abc') === 0, 'e o que nao e numero vale zero');

    ok(r.textoDaDiferenca(20) === '20 g', 'diferenca pequena sai em gramas');
    ok(r.textoDaDiferenca(1250) === '1,250 kg', 'e a grande em quilos');

    // Setor que o banco nao aceita fica de fora do agrupamento.
    const agrupado = r.agruparVolumes([
        { id: 'a', setor: 'LASER', numero: 2, peso_kg: 1 },
        { id: 'b', setor: 'LASER', numero: 1, peso_kg: 2 },
        { id: 'c', setor: 'XPTO', numero: 1, peso_kg: 9 },
    ]);
    ok(Object.keys(agrupado).length === 1, 'setor invalido nao entra');
    ok(agrupado.LASER[0].numero === 1, 'e a lista sai na ordem do numero');
}

// ─── O peso esperado de cada volume, e a regra dos 5 % nele ─────────────────
//
// Pedido do usuario em 23/08/2026, no dia seguinte ao dos volumes: a caixa e
// conferida contra a QUANTIDADE que leva. Um modelo so ou varios, a conta e a
// mesma -- quantidade vezes o peso da peca, com a regua dos 5 % do setor.

function ambienteDeVolumesComPeso() {
    const amb = ambienteDeVolumes();
    const itens = amb.janela.state.osItens['os-200'];
    // Os dois do Laser saem da MESMA linha da proposta, como acontece de
    // verdade: as oito credenciais do pedido 21085 saem da linha 2281.
    itens[0].id_produto_proposta_origem = 2281;
    itens[1].id_produto_proposta_origem = 2281;
    // Um terceiro do Laser SEM linha de proposta: e ele que prova que a tela
    // nao inventa base quando o ERP nao tem peso.
    itens.push({
        id: 3004, produto: 'Credencial Sem Peso', modelo: '3004', _vibe_id_produto: 55,
        setor: 'LASER', qtd: 100, status_impressao: 'Impresso',
        acabamento_status: 'Em acabamento', acabamento_responsavel: 'Bernardo Farias',
    });
    // 28.600 g para 5.500 unidades = 5,2 g a peca.
    amb.banco._produtosDaProposta = [
        { id: 2281, id_int: 200, id_produto: 55, qtd: 5500, peso_total: 28600 },
    ];
    return amb;
}

function campoDoVolume(amb, id) {
    return amb.documento.getElementById(id);
}

async function oVolumeDeUmModeloSoSaiDaQuantidade() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();

    // A janela abre sugerindo a tiragem inteira; o operador reparte.
    campoDaQtd(amb, 3001).value = '2.000';
    amb.painel.recalcularVolume();

    const est = amb.elementos['acab-vol-est'];
    ok(est.textContent.indexOf('est. 10,400 kg') !== -1,
       '2.000 pecas de 5,2 g dao 10,400 kg', est.textContent);

    // Mudar a quantidade muda a base -- e isso e o coracao do pedido.
    campoDaQtd(amb, 3001).value = '1.000';
    amb.painel.recalcularVolume();
    ok(est.textContent.indexOf('est. 5,200 kg') !== -1,
       'metade da quantidade, metade do peso esperado', est.textContent);

    // Dentro dos 5 %: grava direto, sem senha.
    campoDaQtd(amb, 3001).value = '2000';
    campoDoVolume(amb, 'acab-vol-peso').value = '10,4';
    campoDoVolume(amb, 'acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();

    ok(amb.banco._volumesDoBanco.length === 1, 'peso certo grava sem passar pela senha',
       String(amb.banco._volumesDoBanco.length));
    ok(amb.elementos['acab-liberacao'].style.display !== 'flex', 'e o popup da senha nem aparece');
}

async function oVolumeDeVariosModelosSomaAsQuantidades() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.marcarModelo(3002);
    amb.painel.pesarVolume();

    campoDaQtd(amb, 3001).value = '2.000';
    campoDaQtd(amb, 3002).value = '500';
    amb.painel.recalcularVolume();

    ok(amb.elementos['acab-vol-est'].textContent.indexOf('est. 13,000 kg') !== -1,
       '2.500 pecas somadas dao 13,000 kg', amb.elementos['acab-vol-est'].textContent);

    campoDoVolume(amb, 'acab-vol-peso').value = '13';
    campoDoVolume(amb, 'acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();
    ok(amb.banco._volumesDoBanco.length === 1, 'e grava, porque bate com a soma');
}

async function oVolumeForaDosCincoPorCentoPedeASenha() {
    const amb = ambienteDeVolumesComPeso();
    amb.janela.API_PAINEL = 'https://x.supabase.co/functions/v1/painel';
    const chamadas = [];
    amb.janela.fetch = (url, opcoes) => {
        chamadas.push({ url, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, confere: true }) });
    };
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3001).value = '2000';
    campoDoVolume(amb, 'acab-vol-peso').value = '12';       // esperado 10,400
    campoDoVolume(amb, 'acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();

    ok(amb.elementos['acab-liberacao'].style.display === 'flex',
       '12 kg contra 10,400: o popup da senha abre');
    ok(amb.banco._volumesDoBanco.length === 0, 'e NADA foi gravado',
       String(amb.banco._volumesDoBanco.length));
    ok(amb.elementos['acab-volume-janela'].style.display === 'none',
       'a janela do volume sai da frente, em vez de ficar por baixo');
    const corpo = amb.elementos['acab-liberacao-corpo'].innerHTML;
    ok(corpo.indexOf('volume 1 do setor Laser') !== -1,
       'o popup diz que a divergencia e da CAIXA, e nao do setor', corpo.slice(0, 160));
    ok(corpo.indexOf('10,400 kg') !== -1, 'e mostra o peso esperado da caixa');

    // Senha certa: grava, com o peso que o operador insistiu.
    campoDoVolume(amb, 'acab-liberacao-senha').value = 'K47';
    await amb.painel.liberarDivergencia();

    ok(chamadas.length === 1 && chamadas[0].corpo.senha === 'K47',
       'a senha foi conferida no servidor', JSON.stringify(chamadas));
    ok(amb.banco._volumesDoBanco.length === 1, 'e o volume entrou',
       String(amb.banco._volumesDoBanco.length));
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 12, 'com os 12 kg digitados',
       String(amb.banco._volumesDoBanco[0].peso_kg));
    ok(amb.banco._itensDeVolume.length === 1 && amb.banco._itensDeVolume[0].qtd === 2000,
       'e com a quantidade que deu origem a conta');
}

async function cancelarASenhaDevolveAJanelaDoVolume() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3001).value = '2000';
    campoDoVolume(amb, 'acab-vol-peso').value = '12';
    await amb.painel.confirmarVolume();
    ok(amb.elementos['acab-liberacao'].style.display === 'flex', 'o popup da senha abriu');

    amb.painel.fecharPopupDaLiberacao();     // o Cancelar

    ok(amb.elementos['acab-volume-janela'].style.display === 'flex',
       'a janela do volume volta, em vez de o trabalho sumir');
    ok(amb.painel._tela.volumeEmEdicao !== null, 'com os modelos escolhidos ainda montados');
    ok(/5 %/.test(amb.elementos['acab-vol-erro'].textContent),
       'e ela diz por que nao gravou', amb.elementos['acab-vol-erro'].textContent);
    ok(amb.banco._volumesDoBanco.length === 0, 'nada foi gravado');
}

async function semPesoNoErpOVolumeGravaSemConferir() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    // So o modelo que nao tem linha de proposta.
    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3004);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3004).value = '100';
    amb.painel.recalcularVolume();

    ok(amb.elementos['acab-vol-est'].textContent === 'est. —',
       'sem base no ERP a tela nao inventa uma', amb.elementos['acab-vol-est'].textContent);

    campoDoVolume(amb, 'acab-vol-peso').value = '99';        // absurdo, e ainda assim grava
    campoDoVolume(amb, 'acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();
    ok(amb.banco._volumesDoBanco.length === 1, 'sem o que comparar, o volume grava como gravava');
    ok(amb.elementos['acab-liberacao'].style.display !== 'flex', 'e nao ha senha a pedir');
}

async function modeloSemPesoNoMeioDosOutrosEDenunciado() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.marcarModelo(3004);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3001).value = '2000';
    campoDaQtd(amb, 3004).value = '100';
    amb.painel.recalcularVolume();

    const texto = amb.elementos['acab-vol-est'].textContent;
    ok(texto.indexOf('est. 10,400 kg') !== -1, 'a conta sai do que TEM peso', texto);
    ok(texto.indexOf('1 modelo sem peso no ERP') !== -1,
       'e a tela diz que a base esta incompleta, em vez de esconder o buraco', texto);
}

async function asContasDoPesoEsperadoSaoPuras() {
    const amb = ambienteDeVolumes();
    const r = amb.painel._regras;

    const mapa = r.gramasPorUnidadeDaLinha([
        { id: 2281, qtd: 5500, peso_total: 28600 },
        { id: 9,    qtd: 0,    peso_total: 100 },   // divisao por zero fica de fora
        { id: 10,   qtd: 10,   peso_total: 0 },     // linha sem peso tambem
    ]);
    ok(mapa['2281'] === 5.2, '28.600 g / 5.500 un = 5,2 g a peca', String(mapa['2281']));
    ok(mapa['9'] === undefined && mapa['10'] === undefined,
       'linha sem quantidade ou sem peso nao vira base');

    amb.painel._tela.gramasPorUnidade = mapa;
    const modelos = [
        { id: 1, id_produto_proposta_origem: 2281 },
        { id: 2, id_produto_proposta_origem: 2281 },
        { id: 3 },                                   // sem origem: sem base
    ];

    ok(r.estimadoDoVolume([{ modeloId: 1, qtd: 2000 }], modelos).kg === 10.4,
       'um modelo so: quantidade vezes o peso da peca');
    ok(r.estimadoDoVolume([{ modeloId: 1, qtd: 2000 }, { modeloId: 2, qtd: 500 }], modelos).kg === 13,
       'varios modelos: as quantidades somam antes da conta');

    const misto = r.estimadoDoVolume([{ modeloId: 1, qtd: 2000 }, { modeloId: 3, qtd: 100 }], modelos);
    ok(misto.kg === 10.4 && misto.semBase === 1, 'modelo sem base fica de fora, e e contado');

    const nenhum = r.estimadoDoVolume([{ modeloId: 3, qtd: 100 }], modelos);
    ok(nenhum.kg === null, 'sem base nenhuma o resultado e null, e nao zero');

    // A regua e a MESMA do setor -- e a mesma funcao.
    ok(r.precisaDeLiberacao(10.92, 10.4) === false, '5 % exatos ainda passam');
    ok(r.precisaDeLiberacao(10.93, 10.4) === true, 'acima disso pede a senha');
}

(async function () {
    await oVolumeDeUmModeloSoSaiDaQuantidade();
    await oVolumeDeVariosModelosSomaAsQuantidades();
    await oVolumeForaDosCincoPorCentoPedeASenha();
    await cancelarASenhaDevolveAJanelaDoVolume();
    await semPesoNoErpOVolumeGravaSemConferir();
    await modeloSemPesoNoMeioDosOutrosEDenunciado();
    await asContasDoPesoEsperadoSaoPuras();
})();

// ═══════════════════════════════════════════════════════════════════════════
//  OS PACOTES DENTRO DA CAIXA
// ═══════════════════════════════════════════════════════════════════════════
//
// Pedido do usuario em 23/08/2026, em duas mensagens:
//
//   "Ao criar o volume, opcao de nomear volume, dentro do mesmo volume,
//    podemos adicionar varios pacotes, ao adicionar os volumes, volumes
//    criados a soma de seus pesos vai atualizando o peso real do setor, ao
//    editar os volumes, mostra os pacotes, quantidades e responsaveis de cada
//    pacote"
//
//   "modelos com mais de 1 volume ao atingir a quantidade total, quando mais
//    de 1 responsavel mostra no drop responsavel o nome do setor e marca
//    status como pronto, se todos os pacotes do volume sao mesmo responsavel
//    marca este como responsavel."
//
// O que estes testes travam:
//   1. a caixa tem nome, e o nome chega ao banco e a tela;
//   2. dois pacotes do mesmo modelo cabem na mesma caixa, cada um com o seu
//      responsavel -- e o segundo ja nasce com o que sobrou do primeiro;
//   3. o peso do setor acompanha a soma das caixas, sozinho, e a regua dos 5 %
//      compara com o que JA ESTA embalado, e nao com a tiragem inteira;
//   4. modelo embalado por inteiro fecha sozinho: uma pessoa assina com o
//      proprio nome, mais de uma assina com o nome do setor;
//   5. modelo incompleto nao fecha, e Pronto ja dado nao e reescrito.

async function aCaixaGanhaNome() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', nome: 'Camarote', responsavel: 'Bernardo Farias' });

    ok(amb.banco._volumesDoBanco[0].nome === 'Camarote', 'o nome da caixa vai para o banco',
       String(amb.banco._volumesDoBanco[0].nome));
    ok(amb.elementos['acab-detalhe-corpo'].innerHTML.indexOf('Camarote') !== -1,
       'e aparece no chip da faixa, ao lado do numero');
}

async function caixaSemNomeGravaNuloENaoStringVazia() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    ok(amb.banco._volumesDoBanco[0].nome === null,
       'caixa sem nome grava nulo -- string vazia viraria um nome de um espaco',
       String(amb.banco._volumesDoBanco[0].nome));
}

async function doisPacotesDoMesmoModeloNaMesmaCaixa() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();

    // O pacote nasce com a tiragem inteira; parte dela vai para o segundo.
    campoDaQtd(amb, 3001).value = '3000';
    amb.painel.adicionarPacote();

    const v = amb.painel._tela.volumeEmEdicao;
    ok(v.pacotes.length === 2, 'a caixa passou a ter dois pacotes', String(v.pacotes.length));
    // O DOM falso nao desenha o que o `innerHTML` repintado traria; preencher o
    // campo a mao e o que o navegador faz sozinho ao redesenhar a linha.
    amb.documento.getElementById('acab-vol-qtd-1').value = String(v.pacotes[1].qtd);
    ok(String(v.pacotes[1].modeloId) === '3001',
       'o segundo e do MESMO modelo -- e o caso do modelo grande repartido');
    ok(v.pacotes[1].qtd === 2000, 'e ja nasce com o que sobrou do primeiro',
       String(v.pacotes[1].qtd));

    amb.documento.getElementById('acab-vol-resp-0').value = 'Bernardo Farias';
    amb.documento.getElementById('acab-vol-resp-1').value = 'Cesar Almeida';
    amb.documento.getElementById('acab-vol-peso').value = '9,5';
    amb.documento.getElementById('acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();

    ok(amb.banco._volumesDoBanco.length === 1, 'uma caixa so',
       String(amb.banco._volumesDoBanco.length));
    ok(amb.banco._itensDeVolume.length === 2, 'com dois pacotes dentro dela',
       String(amb.banco._itensDeVolume.length));
    const nomes = amb.banco._itensDeVolume.map(i => i.responsavel).sort().join(',');
    ok(nomes === 'Bernardo Farias,Cesar Almeida', 'cada pacote com o seu responsavel', nomes);
    const somaDosDois = amb.banco._itensDeVolume.reduce((s, i) => s + i.qtd, 0);
    ok(somaDosDois === 5000, 'e os dois somam a tiragem', String(somaDosDois));
}

async function tirarUmPacoteDevolveAQuantidade() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.marcarModelo(3002);
    amb.painel.pesarVolume();
    ok(amb.painel._tela.volumeEmEdicao.pacotes.length === 2, 'dois modelos, dois pacotes');

    amb.painel.removerPacote(0);
    const v = amb.painel._tela.volumeEmEdicao;
    ok(v.pacotes.length === 1, 'tirar um pacote deixa a caixa com o outro',
       String(v.pacotes.length));
    ok(String(v.pacotes[0].modeloId) === '3002', 'e e o que sobrou, nao o que saiu',
       String(v.pacotes[0].modeloId));
}

async function caixaSemPacoteNaoGrava() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    amb.painel.removerPacote(0);
    amb.documento.getElementById('acab-vol-peso').value = '9,5';
    await amb.painel.confirmarVolume();

    ok(amb.banco._volumesDoBanco.length === 0, 'caixa vazia nao vira volume no banco');
    const erro = amb.documento.getElementById('acab-vol-erro').textContent;
    ok(/pelo menos um pacote/i.test(erro), 'e a janela diz o que falta', erro);
}

async function oLivreDeCadaPacoteDescontaOsOutros() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3001).value = '3000';
    amb.painel.adicionarPacote();
    amb.painel.recalcularVolume();

    // P1 leva 3.000 das 5.000; sobram 2.000 para o P2, e nao 5.000.
    const livreDoSegundo = amb.elementos['acab-vol-livre-1'].textContent;
    ok(livreDoSegundo.indexOf('2.000 livres') !== -1,
       'o livre do segundo pacote desconta o que o primeiro tomou', livreDoSegundo);

    // Passar da tiragem e dito, e nao escondido.
    amb.documento.getElementById('acab-vol-qtd-1').value = '4000';
    amb.painel.recalcularVolume();
    ok(amb.elementos['acab-vol-livre-1'].textContent.indexOf('a mais do que a tiragem') !== -1,
       'e passar da tiragem e denunciado na propria linha',
       amb.elementos['acab-vol-livre-1'].textContent);
}

async function editarACaixaMostraPacotesQuantidadesEResponsaveis() {
    const amb = ambienteDeVolumes();
    const janelas = capturarJanelas(amb);
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001, 3002],
                             qtds: { 3001: '5000', 3002: '500' },
                             pacoteDe: { 3001: 'Bernardo Farias', 3002: 'Cesar Almeida' },
                             peso: '12,48', nome: 'Camarote', responsavel: 'Bernardo Farias' });

    amb.painel.verVolumes('LASER');
    const html = janelas.achar('acab-volumes-lista').innerHTML;

    ok(html.indexOf('Camarote') !== -1, 'a lista mostra o nome da caixa');
    ok(html.indexOf('P1') !== -1 && html.indexOf('P2') !== -1, 'e os pacotes, um a um');
    ok(html.indexOf('5.000 un') !== -1 && html.indexOf('500 un') !== -1,
       'cada um com a sua quantidade');
    ok(html.indexOf('Bernardo Farias') !== -1 && html.indexOf('Cesar Almeida') !== -1,
       'e com o responsavel de cada pacote');

    // Reabrir para editar traz os pacotes de volta, com nome e responsaveis.
    const id = amb.banco._volumesDoBanco[0].id;
    amb.painel.editarVolume(id);
    const v = amb.painel._tela.volumeEmEdicao;
    ok(v.nome === 'Camarote', 'editar volta com o nome', v.nome);
    ok(v.pacotes.length === 2, 'e com os dois pacotes', String(v.pacotes.length));
    ok(v.pacotes[0].responsavel === 'Bernardo Farias', 'cada um com o seu nome',
       v.pacotes[0].responsavel);
}

async function oPesoDoSetorAcompanhaASomaDasCaixas() {
    const amb = ambienteDeVolumes();
    amb.janela.caixaConfirmar = { perguntar: () => Promise.resolve(true) };
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 9.5,
       'a primeira caixa ja escreve o peso do setor',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));

    await criarVolume(amb, { setor: 'LASER', marcar: [3002], qtds: { 3002: '500' },
                             peso: '1,2', responsavel: 'Bernardo Farias' });
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 10.7,
       'a segunda soma com a primeira, sem ninguem digitar nada',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));

    // E excluir uma devolve o peso para baixo.
    const id = amb.banco._volumesDoBanco[0].id;
    await amb.painel.excluirVolume(id);
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 1.2,
       'e excluir uma caixa desce o peso do setor junto',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
}

async function comMetadeDoSetorEmbaladoNaoHaSenhaAPedir() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');

    // So 2.000 das 5.000 do 3001. O setor inteiro estima 28,600 kg; esta caixa,
    // 10,400 kg. Comparar uma coisa com a outra acusaria 64 % de divergencia.
    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '2000' },
                             peso: '10,4', responsavel: 'Bernardo Farias' });

    ok(amb.elementos['acab-liberacao'].style.display !== 'flex',
       'a regua compara com o que JA ESTA embalado, e nao com a tiragem inteira');
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 10.4,
       'e o peso parcial entra no setor',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
}

async function modeloEmbaladoPorUmSoFechaNoNomeDele() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             pacoteDe: { 3001: 'Bernardo Farias' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    const item = amb.janela.state.osItens['os-200'].find(i => String(i.id) === '3001');
    ok(item.acabamento_responsavel === 'Bernardo Farias',
       'um responsavel so assina com o proprio nome', String(item.acabamento_responsavel));
    ok(item.acabamento_status === 'Pronto', 'e o modelo fecha sozinho',
       String(item.acabamento_status));
}

async function modeloEmbaladoPorVariosFechaNoNomeDoSetor() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    amb.painel.novoVolume('LASER', 200);
    amb.painel.marcarModelo(3001);
    amb.painel.pesarVolume();
    campoDaQtd(amb, 3001).value = '3000';
    amb.painel.adicionarPacote();
    amb.documento.getElementById('acab-vol-qtd-1').value = '2000';
    amb.documento.getElementById('acab-vol-resp-0').value = 'Bernardo Farias';
    amb.documento.getElementById('acab-vol-resp-1').value = 'Cesar Almeida';
    amb.documento.getElementById('acab-vol-peso').value = '9,5';
    amb.documento.getElementById('acab-vol-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarVolume();

    const item = amb.janela.state.osItens['os-200'].find(i => String(i.id) === '3001');
    ok(item.acabamento_responsavel === 'Laser',
       'duas pessoas no mesmo modelo: quem assina e o SETOR',
       String(item.acabamento_responsavel));
    ok(item.acabamento_status === 'Pronto', 'e o modelo fecha do mesmo jeito',
       String(item.acabamento_status));

    // O seletor do card mostra o nome do setor, mesmo ele nao sendo operador.
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html.indexOf('<option value="Laser" selected>Laser</option>') !== -1,
       'e o seletor do card mostra "Laser" escolhido');
}

async function modeloIncompletoNaoFechaSozinho() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    // 3.000 das 5.000: falta material fora de caixa.
    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '3000' },
                             pacoteDe: { 3001: 'Bernardo Farias' },
                             peso: '6', responsavel: 'Bernardo Farias' });

    const item = amb.janela.state.osItens['os-200'].find(i => String(i.id) === '3001');
    ok(item.acabamento_status !== 'Pronto',
       'com material fora de caixa o modelo NAO fecha', String(item.acabamento_status));
}

async function pacoteSemResponsavelNaoCarimbaNinguem() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    // O 3001 nao tem responsavel no card, entao o pacote nasce sem nome.
    const item = amb.janela.state.osItens['os-200'].find(i => String(i.id) === '3001');
    item.acabamento_responsavel = null;

    await criarVolume(amb, { setor: 'LASER', marcar: [3001], qtds: { 3001: '5000' },
                             peso: '9,5', responsavel: 'Bernardo Farias' });

    ok(item.acabamento_status !== 'Pronto',
       'pacote sem dono nao fecha o modelo -- ninguem assinou aquele trabalho',
       String(item.acabamento_status));
}

async function asContasDosPacotesSaoPuras() {
    const r = ambienteDeVolumes().painel._regras;
    const item = { id: 1, setor: 'LASER', qtd: 100 };
    const caixa = (...pacotes) => [{ pacotes }];

    const um = r.responsavelPelosPacotes(item, caixa({ modeloId: '1', qtd: 100, responsavel: 'Ana' }));
    ok(um && um.nome === 'Ana' && um.varios === false, 'um responsavel so assina com o nome dele');

    const dois = r.responsavelPelosPacotes(item, caixa(
        { modeloId: '1', qtd: 60, responsavel: 'Ana' },
        { modeloId: '1', qtd: 40, responsavel: 'Bruno' }));
    ok(dois && dois.nome === 'Laser' && dois.varios === true,
       'dois responsaveis assinam com o nome do setor', dois && dois.nome);

    const mesmo = r.responsavelPelosPacotes(item, caixa(
        { modeloId: '1', qtd: 60, responsavel: 'Ana Paula' },
        { modeloId: '1', qtd: 40, responsavel: 'ana paula' }));
    ok(mesmo && mesmo.varios === false,
       'o mesmo nome com caixa diferente continua sendo uma pessoa so');

    ok(r.responsavelPelosPacotes(item, caixa({ modeloId: '1', qtd: 60, responsavel: 'Ana' })) === null,
       'modelo incompleto nao tem quem assinar');
    ok(r.responsavelPelosPacotes(item, caixa({ modeloId: '1', qtd: 100, responsavel: '' })) === null,
       'pacote sem dono tambem nao');

    const meioAnonimo = r.responsavelPelosPacotes(item, caixa(
        { modeloId: '1', qtd: 60, responsavel: 'Ana' },
        { modeloId: '1', qtd: 40, responsavel: '' }));
    ok(meioAnonimo && meioAnonimo.nome === 'Laser',
       'um pacote sem dono no meio conta como mais uma origem: assina o setor',
       meioAnonimo && meioAnonimo.nome);

    ok(r.responsavelPelosPacotes(item, []) === null, 'modelo sem pacote nenhum nao fecha');
    ok(r.responsavelPelosPacotes(null, caixa({ modeloId: '1', qtd: 100, responsavel: 'Ana' })) === null,
       'e sem modelo nao ha o que decidir');

    // O rotulo do chip.
    ok(r.rotuloDoVolume({ numero: 3 }) === 'V3', 'caixa sem nome e so o numero');
    ok(r.rotuloDoVolume({ numero: 3, nome: 'Camarote' }) === 'V3 · Camarote',
       'com nome, os dois juntos');
}


(async function () {
    await setorSemVolumeSaiComoUmSo();
    await umVolumeLevaVariosModelos();
    await oMesmoModeloCabeEmVariosVolumes();
    await cadaVolumeTemOSeuResponsavel();
    await oVolumeNaoAtravessaSetor();
    await aSomaEConferidaContraOPesoDoSetor();
    await usarASomaPassaPeloGravarPesoDeSempre();
    await excluirUmVolumeDevolveOsModelos();
    await osVolumesNaoTocamEmTabelaDoParceiro();
    await naEstacaoOVolumeGravaSemAgente();
    await numeroRepetidoDizOQueFazer();
    await aListaDoSetorMostraOQueTemDentro();
    await oPesoQueFechaOSetorJaVemComASoma();
    await comCaixaPesadaOSetorNaoECobrado();
    await asContasDosVolumesSaoPuras();

    // Os pacotes dentro da caixa (23/08/2026)
    await aCaixaGanhaNome();
    await caixaSemNomeGravaNuloENaoStringVazia();
    await doisPacotesDoMesmoModeloNaMesmaCaixa();
    await tirarUmPacoteDevolveAQuantidade();
    await caixaSemPacoteNaoGrava();
    await oLivreDeCadaPacoteDescontaOsOutros();
    await editarACaixaMostraPacotesQuantidadesEResponsaveis();
    await oPesoDoSetorAcompanhaASomaDasCaixas();
    await comMetadeDoSetorEmbaladoNaoHaSenhaAPedir();
    await modeloEmbaladoPorUmSoFechaNoNomeDele();
    await modeloEmbaladoPorVariosFechaNoNomeDoSetor();
    await modeloIncompletoNaoFechaSozinho();
    await pacoteSemResponsavelNaoCarimbaNinguem();
    await asContasDosPacotesSaoPuras();
})();

(async function () {
    await aListaDeResponsaveisVemDaViewDeOperadores();
    await oResponsavelGravadoForaDoPerfilContinuaAparecendo();
    await semNinguemNoPerfilOSeletorDizOQueFazer();
    await gravarEscreveSoNasDuasColunasNovas();
    await oEstagioDaListaVemDeConsultaPropria();
    await bancoSemAsColunasNaoDerrubaATela();
    await pedidoEncerradoComoTesteSomeDaFila();
    await bancoSemAColunaDoTesteNaoEscondeNinguem();

    await oBoxDePesoAbreComOsSetoresDoPedido();
    await gravarOPesoAtualizaAlinhaQueExiste();
    await semLinhaNoBancoOPesoCriaUma();
    await semOsNoParceiroAlinhaNasceSemAmarra();
    await semSessaoOBoxDizOQueFazer();
    await pedidoSemSetorExplicaOPorque();
    await oPesoNaoTocaEmOutraTabela();
    await naEstacaoOPesoSaiPeloAgente();
    await oErroDoAgenteChegaAoOperador();

    await oBotaoDeExpedicaoSoAcendeComTudoPronto();
    await clicarCedoDemaisAbreOPopupComOQueFalta();
    await oPopupMostraOResumoEEsperaOOk();
    await cancelarFechaOPopupSemGravar();
    await semPermissaoOPopupExplicaEnaoOferece();
    await comTudoProntoOPedidoVaiParaExpedicao();
    await asInformacoesDoModeloSaemEmTabela();
    await oCabecalhoDoPedidoAbertoDestacaNumeroEEvento();
    await semResponsavelOStatusNaoSeMexe();
    await oSetorGanhaConcluidoQuandoOUltimoModeloFicaPronto();
    await setorIncompletoNaoGanhaCarimbo();
    await desmarcarUmModeloTiraOCarimbo();

    await aHoraDoProntoApareceNoCard();
    await oUltimoProntoDoSetorPedeOPeso();
    await comPesoJaGravadoOProntoPassaDireto();
    await naoSendoOUltimoDoSetorOProntoPassaDireto();
    await semCaminhoParaOPesoAtravaNaoPrende();
    await oPopupDoPesoGravaEEntaoMarcaPronto();

    await oBoxMostraOEstimadoAoLadoDoPeso();
    await dentroDosCincoPorCentoGravaDireto();
    await acimaDosCincoPorCentoNadaEGravadoECancelarDevolveOValor();
    await senhaErradaNaoGravaEAvisa();
    await senhaCertaNoSiteGravaPeloCaminhoDeSempre();
    await senhaCertaNaEstacaoGravaPeloAgente();
    await semEstimadoGravaDireto();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do Painel do Acabamento passaram.');
})();
