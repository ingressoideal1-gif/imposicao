// O Painel do Acabamento (20/08/2026).
//
// Nada aqui e copia da regra: o `frontend/acabamento.js` inteiro e executado
// dentro de um DOM de mentira, e o que se mede e o HTML que ele produz.
//
// O que estes testes protegem, em uma frase cada:
//
//  1. a tela lista os MESMOS pedidos da Fila de Producao;
//  2. o estagio do acabamento e um campo separado do status de impressao;
//  3. o pedido so sai da fila quando TODOS os modelos estao revisados;
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
        _operadores: [
            { id: 1, nome: 'Bernardo Farias', role: 'impressor', ativo: true },
            { id: 2, nome: 'Cesar Almeida', role: 'impressor', ativo: true },
            { id: 3, nome: 'Quem Saiu', role: 'impressor', ativo: false },
        ],
        _gravacoes: [],
        _modelosDoBanco: [],
        _erroDoBanco: null,
        from(tabela) {
            const self = this;
            if (tabela === 'imposition_operadores') {
                return { select: () => ({ order: () => Promise.resolve({ data: self._operadores, error: null }) }) };
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
    ok(estagioDoModelo({ status_impressao: 'Impresso', acabamento_status: 'Revisado' }) === 'Revisado',
       'a escolha do operador vence o derivado');
    ok(estagioDoModelo({ status_impressao: 'Impresso', acabamento_status: 'Aguardando' }) === 'Aguardando',
       'inclusive quando ele volta para Aguardando de proposito');
    ok(estagioDoModelo({ acabamento_status: 'em acabamento' }) === 'Em acabamento',
       'a caixa das letras nao muda o estagio');

    ok(estagioDoPedido([]) === 'Aguardando', 'pedido sem modelo fica Aguardando');
    ok(estagioDoPedido([{}, {}]) === 'Aguardando', 'nenhum modelo impresso: Aguardando');
    ok(estagioDoPedido([{ status_impressao: 'Impresso' }, {}]) === 'Impresso',
       'um impresso ja tira o pedido do Aguardando');
    ok(estagioDoPedido([{ acabamento_status: 'Revisado' }, { acabamento_status: 'Impresso' }]) === 'Em acabamento',
       'um revisado no meio de outros ainda e trabalho em curso');
    ok(estagioDoPedido([{ acabamento_status: 'Revisado' }, { acabamento_status: 'Revisado' }]) === 'Revisado',
       'so e Revisado quando TODOS estao revisados');

    // E o acabamento continua sem NUNCA escrever no campo do outro setor.
    ok(FONTE.indexOf('status_impressao:') === -1, 'nunca grava status_impressao');
})();

// ─── 3. O pedido revisado sai da fila de trabalho ───────────────────────────

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

(function oRevisadoSaiDaFila() {
    const pedidos = [pedido(101), pedido(102)];
    const modelos = {
        101: [{ id: 1, acabamento_status: 'Revisado', quantidade: 10 }],
        102: [{ id: 2, acabamento_status: 'Em acabamento', quantidade: 20 }],
    };
    const amb = ambienteComPedidos(pedidos, modelos);

    amb.painel.render();
    let html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>102<') !== -1, 'o pedido em acabamento aparece na fila');
    ok(html.indexOf('>101<') === -1, 'o pedido todo revisado NAO aparece na fila geral');

    amb.painel.setFiltroPrazo('revisados');
    html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>101<') !== -1, 'com o recorte "Revisado" ligado ele reaparece');
    ok(html.indexOf('>102<') === -1, 'e o que ainda esta em acabamento sai');

    // As metricas contam a fila inteira, e nao o recorte visivel.
    ok(amb.elementos['stat-acab-pedidos-fila'].textContent === 2,
       'a metrica de pedidos conta a fila inteira', amb.elementos['stat-acab-pedidos-fila'].textContent);
    ok(amb.elementos['stat-acab-modelos-revisados'].textContent === 1, 'um modelo revisado');
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1, 'um modelo em acabamento');
    ok(amb.elementos['stat-acab-pedidos-concluidos'].textContent === 1, 'um pedido concluido');
    ok(amb.elementos['badge-acabamento'].textContent === 2, 'o badge do menu conta a fila inteira');
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
    const metades = html.match(/flex: 1 1 320px/g) || [];
    ok(metades.length === 4, 'amostra e informacoes dividem a caixa ao meio (2 por modelo, 2 modelos)',
       'achei ' + metades.length);

    // Amostra em PDF vira atalho, e nunca imagem: rasterizar a arte do cliente
    // esta fora de cogitacao neste projeto.
    ok(html.indexOf('Amostra em PDF') !== -1, 'a amostra em PDF vira atalho para o arquivo');
    ok(html.indexOf('<img id="acab-amostra-os-200-3002') === -1,
       'a amostra em PDF NAO e rasterizada em imagem');

    // Os dois -- e somente os dois -- seletores.
    const selects = html.match(/<select/g) || [];
    ok(selects.length === 4, 'dois seletores por modelo, dois modelos = quatro', 'achei ' + selects.length);
    ok(html.indexOf('— Status —') === -1, 'o seletor de estagio nao tem mais a opcao vazia');
    ['Aguardando', 'Impresso', 'Em acabamento', 'Revisado'].forEach(e => {
        ok(html.indexOf('>' + e + '<') !== -1, 'o estagio "' + e + '" esta no seletor');
    });
    ok(/AcabamentoPainel\.mudarEstagio\(/.test(html), 'o seletor de estagio grava o acabamento');
    ok(/AcabamentoPainel\.mudarResponsavel\(/.test(html), 'o seletor de responsavel grava o acabamento');
    ok(html.indexOf('Bernardo Farias') !== -1, 'o responsavel ja gravado aparece escolhido');

    // Nada de editar o que e da Producao.
    ok((html.match(/<input/g) || []).length === 0, 'nao ha NENHUM campo digitavel');
    ok((html.match(/type="checkbox"/g) || []).length === 0, 'nao ha caixa de selecao de modelo');
    [
        'pedQueueUpdateField', 'pedQueueUpdateCor', 'pedQueueUpdateNum',
        'updateBoxFormato', 'updateBoxSaida', 'enviarParaPedido',
        'runImposition', 'imprimir', 'Imprimir', 'Gerar PDF', 'impressora',
    ].forEach(proibido => {
        ok(html.indexOf(proibido) === -1, 'o pedido aberto nao traz "' + proibido + '"');
    });

    ok(amb.elementos['acab-detalhe-progresso'].textContent === '0/2 revisados',
       'o cabecalho conta os revisados', amb.elementos['acab-detalhe-progresso'].textContent);
})();

(function semPermissaoDeEditarOsSeletoresTravam() {
    const amb = ambienteComPedidoAberto();
    amb.janela._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: false };
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    // Dois seletores e um botao de camera por modelo, dois modelos = seis.
    ok((html.match(/disabled/g) || []).length === 6,
       'quem so tem VER encontra os seletores e a camera travados',
       'achei ' + (html.match(/disabled/g) || []).length);
    ok(html.indexOf('apenas permiss\u00e3o de ver') !== -1,
       'e a camera travada explica por que esta travada');
})();

// ─── 7. O arquivo inteiro nao fala com o motor nem com o agente ─────────────

(function nadaDeMotorNemDeAgente() {
    // Medido sobre o CODIGO, e nao sobre uma tela: um caminho que so aparece em
    // certa condicao nao seria pego por nenhum render de teste.
    const codigo = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    [
        '/api/impose', 'API_BASE_URL', '127.0.0.1:9000', 'MOTOR_NUVEM',
        'runImposition', 'imprimirNoAgente', '/api/print', '/api/status',
        'atualizarPainelProducao', 'setProdSort', 'renderPedOSQueue',
    ].forEach(proibido => {
        ok(codigo.indexOf(proibido) === -1,
           'o acabamento.js nao chama "' + proibido + '"');
    });

    // E nao escreve no que e da Producao.
    ok(codigo.indexOf('status_impressao:') === -1, 'nunca grava status_impressao');
    const gravacoes = codigo.match(/from\('pedidos_modelos'\)\s*\.update\(/g) || [];
    ok(gravacoes.length === 1, 'ha um unico ponto de gravacao', 'achei ' + gravacoes.length);
})();

// ─── Resultado ──────────────────────────────────────────────────────────────

(function oQueAguardaTemFundoMarrom() {
    // Pedido do usuario: "modelos Aguardando ... fundo do box do modelo marrom".
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Aguardando';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Revisado';
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('background: #3a2a1c') !== -1, 'o modelo Aguardando tem fundo marrom');
    ok(html.indexOf('background: #14301f') !== -1, 'e o revisado segue verde escuro');
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

async function aListaDeResponsaveisVemDaViewDeOperadores() {
    const amb = ambienteComPedidoAberto();
    await amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;

    ok(html.indexOf('>Bernardo Farias<') !== -1, 'o operador ativo entra na lista de responsaveis');
    ok(html.indexOf('>Cesar Almeida<') !== -1, 'e o outro tambem');
    ok(html.indexOf('Quem Saiu') === -1, 'acesso desativado NAO aparece como responsavel');
    ok(html.indexOf('Responsável —</option>') !== -1, 'ha a opcao de deixar sem responsavel');

    // O codigo de acesso e segredo de estacao: nem pedido ao banco, nem exibido.
    ok(FONTE.indexOf("'codigo'") === -1, 'o acabamento.js nunca pede o codigo de acesso');
    ok(FONTE.indexOf('imposition_acessos_locais') === -1,
       'a leitura passa pela view, nunca pela tabela dos codigos');
    ok(FONTE.indexOf('imposition_operadores') !== -1, 'a lista vem da view de operadores');
}

async function gravarEscreveSoNasDuasColunasNovas() {
    const amb = ambienteComPedidoAberto();
    await amb.painel.abrirPedido('os-200');
    amb.banco._gravacoes.length = 0;

    await amb.painel.mudarEstagio('3001', 'os-200', 'Revisado');
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
    ok(item.acabamento_status === 'Revisado', 'a escolha aparece na hora, sem esperar o banco');
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
        { id: 900, id_int: 301, acabamento_status: 'Revisado', acabamento_responsavel: 'Bernardo Farias' },
        { id: 901, id_int: 302, acabamento_status: 'Em acabamento', acabamento_responsavel: null },
    ];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    ok(amb.elementos['stat-acab-modelos-revisados'].textContent === 1,
       'o revisado veio da consulta propria', amb.elementos['stat-acab-modelos-revisados'].textContent);
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1,
       'e o em acabamento tambem');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>301<') === -1,
       'o pedido revisado sai da fila de trabalho');
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

(async function () {
    await aListaDeResponsaveisVemDaViewDeOperadores();
    await gravarEscreveSoNasDuasColunasNovas();
    await oEstagioDaListaVemDeConsultaPropria();
    await bancoSemAsColunasNaoDerrubaATela();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do Painel do Acabamento passaram.');
})();
