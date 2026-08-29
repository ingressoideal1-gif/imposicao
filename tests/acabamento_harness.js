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

// A regra dos status "depois da grafica" (EXPEDICAO, EM TRANSITO, ENTREGUE)
// mora no `script.js`, porque o Painel de Producao obedece a mesma. Ela e LIDA
// de la, e nao copiada: uma copia continuaria passando depois de o original
// mudar.
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const pedidoJaPassouDaGraficaReal = (() => {
    const NL = String.fromCharCode(10);
    const iLista = SCRIPT.indexOf('const SINAIS_DEPOIS_DA_GRAFICA = [');
    if (iLista < 0) throw new Error('nao achei SINAIS_DEPOIS_DA_GRAFICA no script.js');
    const lista = SCRIPT.slice(iLista, SCRIPT.indexOf('];', iLista) + 2);
    const iFn = SCRIPT.indexOf(NL + 'function pedidoJaPassouDaGrafica(');
    if (iFn < 0) throw new Error('nao achei pedidoJaPassouDaGrafica no script.js');
    const corpo = SCRIPT.slice(iFn, SCRIPT.indexOf(NL + '}', iFn) + 2);
    return new Function(lista + corpo + NL + 'return pedidoJaPassouDaGrafica;')();
})();

let total = 0, falhas = 0;
/**
 * A tela do pedido aberto, nos dois pedacos em que ela mora.
 *
 * Ate 29/08/2026 tudo saia do `acab-detalhe-corpo`: os modelos, e acima deles a
 * faixa larga do peso por setor com o botao da expedicao. Naquele dia o peso, os
 * volumes e a expedicao mudaram para o Resumo do pedido, na coluna da direita,
 * que NAO rola com os modelos -- antes, quem estava no terceiro modelo ja nao
 * via nenhum dos dois.
 *
 * Os testes que perguntam pelo peso e pelos volumes leem daqui.
 */
function telaDoPedido(amb) {
    return amb.elementos['acab-detalhe-corpo'].innerHTML
         + amb.elementos['acab-lateral-resumo'].innerHTML;
}

function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── Um DOM de mentira, do tamanho exato do que a tela pede ──────────────────

function criarElemento(id) {
    const classes = new Set();
    // O `style` real tem `setProperty`: e por ele que o painel publica as
    // alturas das barras da base da tela em variaveis de CSS.
    const style = {};
    style.setProperty = (nome, valor) => { style[nome] = valor; };
    style.removeProperty = nome => { delete style[nome]; };
    style.getPropertyValue = nome => style[nome] || '';
    return {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        style,
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
        // O `body` e o `documentElement` sao elementos como os outros: o
        // `acabamento.js` poe classe no body e publica variavel de CSS na raiz,
        // e um `body` so com `appendChild` explodia na primeira das duas.
        body: criarElemento('body'),
        documentElement: criarElemento('html'),
    };
    documento.body.appendChild = () => {};
    // A tela do Acabamento esta ABERTA em todo este harness -- e o que ele
    // exercita. A barra da escolha de volume mora fora das views e so aparece
    // com a secao ativa, para nao boiar por cima de outra tela.
    documento.getElementById('view-acabamento').classList.add('active');

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
        // Mora no `script.js` e e chamado toda vez que a lista de pedidos e
        // trocada. O `acabamento.js` o embrulha para redesenhar a tela dele --
        // e, desde 24/08/2026, para buscar o estagio dos pedidos que chegaram
        // depois. Sem ele aqui o embrulho nem se instalava.
        renderOrdens: () => {},
        toast: () => {},
        // A regra de 27/08/2026, vinda do `script.js` de verdade.
        pedidoJaPassouDaGrafica: pedidoJaPassouDaGraficaReal,
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
        _perguntados: [],          // os `in(...)` que a tela mandou, na ordem
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
        _proximoIdDeItem: 1,

        _sessao: { user: { id: 'u1' } },   // null = estacao, sem sessao

        // O Storage, so o suficiente para a camera (28/08/2026). Guarda o que
        // subiu e devolve um endereco publico previsivel -- e assim o teste
        // consegue seguir a foto do clique ate a coluna do banco.
        _arquivosSubidos: [],      // [{ bucket, caminho, tipo }]
        _erroAoSubirFoto: null,

        storage: {
            from(bucket) {
                return {
                    upload(caminho, _blob, opcoes) {
                        if (banco._erroAoSubirFoto) {
                            return Promise.resolve({ error: banco._erroAoSubirFoto });
                        }
                        banco._arquivosSubidos.push({
                            bucket, caminho,
                            tipo: (opcoes && opcoes.contentType) || '',
                        });
                        return Promise.resolve({ data: { path: caminho }, error: null });
                    },
                    getPublicUrl(caminho) {
                        return {
                            data: {
                                publicUrl: `https://x.supabase.co/storage/v1/object/public/`
                                    + `${bucket}/${caminho}`,
                            },
                        };
                    },
                };
            },
        },

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
                                    id: i.id || ('reg-' + v.id + '-' + n),
                                    modelo_id: i.modelo_id,
                                    qtd: i.qtd,
                                    peso_kg: (i.peso_kg === undefined) ? null : i.peso_kg,
                                    responsavel: i.responsavel || null,
                                    registrado_em: i.registrado_em || '',
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
                        // Duas formas de esperar o insert, como no PostgREST
                        // de verdade: `await insert(...)` quando nao se precisa
                        // do id, e `.select('id').single()` quando se precisa.
                        const gravar = () => {
                            if (repetido) {
                                return { data: null, error: { message: 'producao_volumes_unico' } };
                            }
                            if (self._erroAoGravarVolume) {
                                return { data: null, error: self._erroAoGravarVolume };
                            }
                            const id = 'vol-' + (self._proximoIdDeVolume++);
                            self._volumesDoBanco.push(Object.assign({ id }, linha));
                            return { data: { id }, error: null };
                        };
                        return {
                            select: () => ({ single: () => Promise.resolve(gravar()) }),
                            then: (res, rej) => Promise.resolve(gravar()).then(res, rej),
                        };
                    },
                };
            }

            if (tabela === 'producao_volume_itens') {
                const filtros = {};
                const remocao = {
                    eq: (c, v) => { filtros[c] = v; return remocao; },
                    // `.in('id', [...])` e o caminho de quem tira VARIOS de uma
                    // vez -- o modelo repartido que sai de Pronto.
                    in: (c, vs) => { filtros[c] = { dentro: (vs || []).map(String) }; return remocao; },
                    then: (res, rej) => {
                        // Dois caminhos de exclusao: o volume inteiro
                        // (`volume_id`) e UM registro (`id`), que e o "Tirar".
                        self._itensDeVolume = self._itensDeVolume.filter(i => {
                            if (filtros.id !== undefined) {
                                return filtros.id && filtros.id.dentro
                                    ? filtros.id.dentro.indexOf(String(i.id)) === -1
                                    : String(i.id) !== String(filtros.id);
                            }
                            return String(i.volume_id) !== String(filtros.volume_id);
                        });
                        self._volumesGravados.push({ tipo: 'tirar', filtros: { ...filtros } });
                        return Promise.resolve({ error: null }).then(res, rej);
                    },
                };
                return {
                    delete: () => remocao,
                    insert: (linhas) => {
                        (linhas || []).forEach(l => self._itensDeVolume.push(Object.assign(
                            { id: 'reg-' + (self._proximoIdDeItem++),
                              registrado_em: new Date(2026, 7, 29, 10, self._proximoIdDeItem).toISOString() },
                            l)));
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
                    in: (coluna, valores) => {
                        // O `in` e FILTRO de verdade aqui, e nao enfeite: era
                        // devolvendo `_modelosDoBanco` inteiro que o harness
                        // deixou passar, em 24/08/2026, a consulta que pedia so
                        // os pedidos da fila e esquecia os ja expedidos. Com o
                        // filtro real, um pedido fora do recorte volta sem
                        // estagio -- que e o que acontecia na grafica.
                        const pedidos = (valores || []).map(String);
                        self._perguntados.push({ tabela, coluna, valores: pedidos });
                        if (self._erroDoBanco) {
                            return Promise.resolve({ data: null, error: self._erroDoBanco });
                        }
                        return Promise.resolve({
                            data: self._modelosDoBanco.filter(m =>
                                pedidos.indexOf(String(m[coluna])) !== -1),
                            error: null,
                        });
                    },
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

// Quem tira o pedido da lista de trabalho e o ENVIO A EXPEDICAO, e nao o
// estagio (regra do usuario, 24/08/2026). Ate aqui bastava o ultimo modelo
// virar "Pronto" para o pedido sumir sozinho -- e sumia justamente quando ainda
// faltava pesar, embalar e entregar.
(function soOEnvioAExpedicaoTiraOPedidoDaLista() {
    const pedidos = [pedido(101), pedido(102)];
    const modelos = {
        101: [{ id: 1, acabamento_status: 'Pronto', quantidade: 10 }],
        // O modelo 2 tem RESPONSAVEL e nao esta revisado: e isso que faz dele um
        // modelo em acabamento desde 29/08/2026, quando o estagio deixou de ser
        // marcado a mao. O `acabamento_status` gravado e legado, e nao muda nada.
        102: [{ id: 2, acabamento_status: 'Em acabamento', quantidade: 20,
                acabamento_responsavel: 'Bernardo Farias' }],
    };
    const amb = ambienteComPedidos(pedidos, modelos);

    amb.painel.render();
    let html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>102<') !== -1, 'o pedido em acabamento aparece na fila');
    ok(html.indexOf('>101<') !== -1,
       'e o pedido todo pronto CONTINUA na fila geral: ainda falta despacha-lo');
    ok(html.indexOf('Revisado') !== -1, 'com o selo REVISADO, para se ver de relance');

    amb.painel.setFiltroPrazo('expedicao');
    html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('>101<') === -1,
       'e no botao PRONTO ele NAO esta: essa lista e a do que ja foi entregue');
    ok(html.indexOf('>102<') === -1, 'nem o que ainda esta em acabamento');

    // Enviado, ele troca de lista -- as duas pontas da regra, no mesmo teste.
    amb.painel.setFiltroPrazo('geral');
    amb.janela.state.ordens[0].status_interno = 'EXPEDICAO';
    amb.painel.render();
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>101<') === -1,
       'depois de enviado a expedicao ele sai da geral');
    amb.painel.setFiltroPrazo('expedicao');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>101<') !== -1,
       'e so entao aparece no botao PRONTO');
    amb.janela.state.ordens[0].status_interno = 'EM PRODUCAO';
    amb.painel.setFiltroPrazo('geral');
    amb.painel.render();

    // As metricas contam a fila inteira, e nao o recorte visivel.
    ok(amb.elementos['stat-acab-pedidos-fila'].textContent === 2,
       'a metrica de pedidos conta a fila inteira', amb.elementos['stat-acab-pedidos-fila'].textContent);
    ok(amb.elementos['stat-acab-modelos-prontos'].textContent === 1, 'um modelo pronto');
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1,
       'um modelo em acabamento: tem responsavel e ainda nao foi revisado',
       amb.elementos['stat-acab-modelos-acabamento'].textContent);
    // E a conta e do RESPONSAVEL, e nao da coluna: tirar o nome tira o modelo
    // da metrica, mesmo com 'Em acabamento' gravado.
    amb.janela.state.modelosGlobais[102][0].acabamento_responsavel = '';
    amb.painel.render();
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 0,
       'sem responsavel ele nao conta: ninguem pegou o modelo ainda',
       amb.elementos['stat-acab-modelos-acabamento'].textContent);
    amb.janela.state.modelosGlobais[102][0].acabamento_responsavel = 'Bernardo Farias';
    amb.painel.render();
    ok(amb.elementos['stat-acab-pedidos-concluidos'].textContent === 1, 'um pedido concluido');
    ok(amb.elementos['badge-acabamento'].textContent === 2, 'o badge do menu conta a fila inteira');
})();

// O alerta de atraso conta o mesmo que a lista mostra (24/08/2026).
//
// Antes ele tirava da conta o pedido totalmente pronto -- fazia sentido quando
// o pronto sumia da lista sozinho. Agora o pronto FICA na frente do operador
// ate ser despachado, e um prazo vencido nele e atraso de verdade: o material
// esta parado na bancada.
(function oAlertaDeAtrasoContaOQueEstaNaLista() {
    const atrasado = pedido(110);
    atrasado._atrasado = true;
    const amb = ambienteComPedidos([atrasado], {
        110: [{ id: 11, acabamento_status: 'Pronto', quantidade: 10 }],
    });

    amb.painel.render();
    ok(amb.painel._tela.temAtrasados === true,
       'pedido pronto e atrasado, ainda na bancada, ACENDE o alerta');

    // Despachado, ele sai da lista -- e sai da conta junto.
    amb.janela.state.ordens[0].status_interno = 'EXPEDICAO';
    amb.painel.render();
    ok(amb.painel._tela.temAtrasados === false,
       'depois de enviado a expedicao ele nao conta mais: nao e trabalho daqui');
})();

// Status posterior ao trabalho da grafica tira o pedido da tela (27/08/2026).
//
// Regra do usuario: *"quando um pedido constar com Status posterior aos status
// do painel de acabamento e do painel de producao (EXPEDICAO, EM TRANSITO,
// ENTREGUE) devem sair da tela inicial dos paineis"*.
//
// EXPEDICAO ja saia da tela inicial pelo `passaNoPrazo` -- ele vai para o botao
// Expedicao, que e o comprovante do que esta bancada despachou. EM TRANSITO e
// ENTREGUE nao podem aparecer em lugar NENHUM daqui: o material ja saiu do
// predio.
(function statusPosteriorSaiDaTela() {
    const amb = ambienteComPedidos([pedido(120)], {
        120: [{ id: 12, acabamento_status: 'Pronto', quantidade: 10 }],
    });

    const naLista = () => amb.elementos['tbody-acabamento'].innerHTML.indexOf('>120<') !== -1;
    const noBotaoExpedicao = () => {
        amb.painel.setFiltroPrazo('expedicao');
        amb.painel.render();
        const tem = amb.elementos['tbody-acabamento'].innerHTML.indexOf('>120<') !== -1;
        amb.painel.setFiltroPrazo('geral');
        amb.painel.render();
        return tem;
    };

    amb.janela.state.ordens[0].status_interno = 'EM PRODUCAO';
    amb.painel.render();
    ok(naLista(), 'EM PRODUCAO: o pedido esta na tela inicial');

    amb.janela.state.ordens[0].status_interno = 'EXPEDICAO';
    amb.painel.render();
    ok(!naLista(), 'EXPEDICAO sai da tela inicial');
    ok(noBotaoExpedicao(), 'e EXPEDICAO continua no botao Expedicao: e o comprovante da bancada');

    for (const status of ['EM TRANSITO', 'EM TRÂNSITO', 'ENTREGUE']) {
        amb.janela.state.ordens[0].status_interno = status;
        amb.painel.render();
        ok(!naLista(), status + ' sai da tela inicial');
        ok(!noBotaoExpedicao(), status + ' tambem NAO aparece no botao Expedicao');
    }

    // E volta quando o ERP volta atras: a regra le o status, nao um carimbo nosso.
    amb.janela.state.ordens[0].status_interno = 'EM PRODUCAO';
    amb.painel.render();
    ok(naLista(), 'de volta a EM PRODUCAO, o pedido reaparece');
})();

// A regra e a MESMA nos dois paineis, escrita uma vez so.
(function aRegraVemDoScriptJs() {
    const f = pedidoJaPassouDaGraficaReal;
    ok(f({ status_interno: 'EXPEDICAO' }) === true, 'EXPEDICAO passou da grafica');
    ok(f({ status_interno: 'EXPEDIÇÃO' }) === true, 'EXPEDICAO com cedilha e til');
    ok(f({ status_interno: 'EM TRANSITO' }) === true, 'EM TRANSITO passou da grafica');
    ok(f({ status_interno: 'EM TRÂNSITO' }) === true, 'EM TRANSITO com acento');
    ok(f({ status_interno: 'ENTREGUE' }) === true, 'ENTREGUE passou da grafica');
    ok(f({ status_interno: 'em transito' }) === true, 'a comparacao ignora a caixa');
    ok(f({ status_interno: '  ENTREGUE  ' }) === true, 'e o espaco em volta');
    ok(f({ status_interno: 'EM PRODUCAO' }) === false, 'EM PRODUCAO e trabalho daqui');
    ok(f({ status_interno: 'EM ACABAMENTO' }) === false, 'EM ACABAMENTO e trabalho daqui');
    ok(f({ status_interno: 'A RETIRAR' }) === false,
       'A RETIRAR fica de fora: o material esta no balcao, nao entregue');
    ok(f({}) === false, 'pedido sem status nao passou da grafica');
    ok(f(null) === false, 'sem pedido, false');
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
    // A amostra sai grande, e nao como miniatura. Ate 25/08/2026 isso era um
    // teto fixo de 360 px, com a arte centrada no meio de um vao escuro.
    //
    // Desde 26/08/2026 a PILHA DE BOTOES e o piso da janela: ela nasce com a
    // altura dos quatro botoes (o que alinha a coluna da amostra com a das
    // decisoes, pedido do usuario) e cresce ate o fim da coluna. O minimo e
    // calculado dos botoes (`ALTURA_DA_PILHA` = 4 x 44 + 3 x 6 = 194), nao
    // copiado: se um dia o botao mudar de altura, a janela acompanha sozinha.
    //
    // O `min-` importa e nao e detalhe. Com altura EXATA, arte em pe -- uma
    // credencial PVC, por exemplo -- encostava nos 194 px antes de usar um
    // decimo da largura e saia do tamanho de um selo. Foi o proprio usuario que
    // pegou isso na producao: "altura ficou pequena".
    ok(html.indexOf('min-height: 194px') !== -1,
       'a janela da amostra nunca fica menor que a pilha de botoes');
    ok(html.indexOf('flex: 1 1 0; min-height: 194px') !== -1,
       'e cresce dali para cima ate o fim da coluna');
    // Base 0, e nao `auto`: com base `auto` a janela e medida pelo que esta
    // DENTRO dela, e uma arte em pe esticada na largura da coluna arrastava a
    // altura junto pela proporcao -- 830 px numa coluna de 600 --, esticando o
    // card inteiro. Quem decide a altura tem de ser a COLUNA.
    ok(html.indexOf('flex: 1 1 auto; min-height: 194px') === -1,
       'a janela nao e medida pela imagem que esta dentro dela');
    // Ate 29/08/2026 esse minimo era DERIVADO da pilha de quatro botoes de
    // estagio, para as duas colunas comecarem e terminarem na mesma linha. Com a
    // pilha desfeita o numero ficou sem dono, e virou constante propria -- mas
    // continua num lugar so, e nao espalhado pelas duas janelas.
    ok(FONTE.indexOf('const ALTURA_DA_JANELA = 194;') !== -1
       && (FONTE.match(/\+ ALTURA_DA_JANELA \+ 'px/g) || []).length === 2,
       'esse minimo vem de uma constante so, usada pelas duas janelas');
    // E a imagem ACOMPANHA a janela. Com `max-height` ela so encolhia: uma
    // amostra cujo arquivo e menor que a janela era desenhada no tamanho do
    // arquivo, com o resto da janela vazio em volta.
    ok(html.indexOf('width: 100%; height: 100%; object-fit: contain') !== -1,
       'a imagem preenche a janela, em vez de so caber nela');
    // E preenche de FORA do fluxo: e isso que a impede de virar a regua da
    // janela em vez de se acomodar nela.
    ok(/<img[^>]*position: absolute; inset: 0; width: 100%; height: 100%/.test(html),
       'e faz isso sem poder empurrar a janela');
    // Nao ha teto em pixel na amostra, e isso e regra e nao acaso: quem limita
    // a arte sao a janela e a coluna, nunca um numero escrito a mao. Um teto
    // solto aqui reintroduz o vao escuro que 26/08/2026 tirou.
    ok(!/max-height:\s*\d+px/.test(html),
       'a amostra sai em bom tamanho, nao como miniatura');

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
    //
    // As larguras continuam as de 22/08/2026, e e proposital: a conta que o
    // navegador faz para decidir se as tres cabem na mesma linha usa a BASE do
    // flex, nao o `min-width`. Engordar a base da amostra nao a faz crescer numa
    // tela larga (ela ja tem `flex-grow: 1` e ja fica com a sobra), mas numa
    // tela de 1366 -- tamanho de estacao -- joga a coluna das decisoes para a
    // linha de baixo.
    const amostras = html.match(/flex: 1 1 200px/g) || [];
    ok(amostras.length === 2, 'a amostra e a coluna elastica, uma por modelo', amostras.length);
    const espec = html.match(/flex: 0 1 280px/g) || [];
    ok(espec.length === 2, 'a especificacao ficou estreita, uma por modelo', espec.length);
    // A coluna das DECISOES saiu em 29/08/2026: o Revisado subiu para a barra de
    // titulo, ao lado do responsavel que o libera, e a FOTO tomou o lugar dela --
    // do outro lado da amostra, para o revisor comparar o que o cliente aprovou
    // com o que esta na mesa sem ampliar nada.
    const foto = html.match(/flex: 0 1 180px/g) || [];
    ok(foto.length === 2, 'a foto ganhou coluna propria, uma por modelo', foto.length);
    ok((html.match(/flex: 0 1 210px/g) || []).length === 0,
       'e a coluna das decisoes nao existe mais');
    // E as tres comecam na mesma linha: cada coluna abre com um rotulo da
    // altura exata do cabecalho azul da tabela (26/08/2026). Sem essa regua, a
    // amostra e os botoes voltam a flutuar centrados na vertical.
    ok((html.match(/height: 36px;/g) || []).length >= 4,
       'as tres colunas comecam na mesma linha, pelo rotulo de altura fixa');
    // A ORDEM na tela, refeita em 26/08/2026 a pedido do usuario: o responsavel
    // subiu para a BARRA DE TITULO, no lugar onde estava o botao Fotografar, e
    // este desceu para a faixa acima da especificacao.
    //
    // A troca segue a hierarquia do card: a barra de titulo responde QUEM -- o
    // nome do modelo, o codigo, o estagio, o setor --, e o responsavel e a
    // ultima pergunta desse grupo. A foto e registro, nao decisao.
    //
    // E poe o comando ACIMA do que ele comanda: sem responsavel nenhum dos
    // quatro botoes de status se mexe.
    // SEM os comentarios: eles viajam para a pagina junto com a marcacao, e uma
    // palavra citada dentro de um deles ("Foto | Amostra | Especificação", por
    // exemplo) desloca a conta da ordem para antes do elemento de verdade.
    const semComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
    const umModelo = semComentarios.slice(semComentarios.indexOf('Pista Inteira'),
                                          semComentarios.indexOf('Camarote'));
    const posResp = umModelo.indexOf('Responsável');
    const posRevisado = umModelo.indexOf('Revisado</button>');
    const posFoto = umModelo.indexOf('Fotografar');
    const posAmostra = umModelo.indexOf('>Amostra<');
    const posEspec = umModelo.indexOf('Especificação');
    ok(posResp < posRevisado && posRevisado < posFoto
       && posFoto < posAmostra && posAmostra < posEspec,
       'a ordem e responsavel e Revisado (no titulo), foto, amostra e especificacao',
       { posResp, posRevisado, posFoto, posAmostra, posEspec });
    ok(umModelo.indexOf('Status do acabamento') === -1,
       'e a coluna de status saiu da tela');

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

    // UM botao, no lugar dos quatro (29/08/2026). Dois deles nunca foram escolha
    // deste setor -- "Aguardando" e "Impresso" sao derivados da impressao --, e
    // "Em acabamento" passou a ser respondido pelo responsavel, que e obrigatorio
    // antes do Revisado.
    const revisados = (html.match(/data-revisado="/g) || []).length;
    ok(revisados === 2, 'um botao Revisado por modelo', revisados);
    ok((html.match(/data-estagio="/g) || []).length === 0,
       'e nenhum resto da pilha de quatro');
    ok(/AcabamentoPainel\.mudarEstagio\(/.test(html), 'o botao Revisado grava o acabamento');

    // Nenhum dos dois modelos esta revisado: o 3001 esta em "Em acabamento" e o
    // 3002 deriva "Impresso" da impressao. Os dois botoes ficam apagados.
    ok((html.match(/aria-pressed="true"/g) || []).length === 0,
       'nenhum modelo revisado, nenhum botao aceso');
    // E clicar num apagado MARCA; clicar num aceso desmarca, gravando vazio.
    ok(/mudarEstagio\('3001', 'os-200', 'Pronto'\)/.test(html),
       'o botao apagado marca, gravando o valor que o banco guarda');
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

    ok(amb.elementos['acab-detalhe-progresso'].textContent === '0/2 revisados',
       'o resumo conta os revisados', amb.elementos['acab-detalhe-progresso'].textContent);
})();

(function semPermissaoDeEditarOsSeletoresTravam() {
    const amb = ambienteComPedidoAberto();
    amb.janela._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: false };
    amb.painel.abrirPedido('os-200');
    const html = amb.elementos['acab-detalhe-corpo'].innerHTML;
    // Por modelo: o seletor do responsavel, o botao Revisado e o da camera =
    // tres. Dois modelos = seis.
    ok((html.match(/disabled/g) || []).length === 6,
       'quem so tem VER encontra o seletor, o Revisado e a camera travados',
       'achei ' + (html.match(/disabled/g) || []).length);
    // Nenhum Revisado escapa: um solto grava o acabamento de quem so ve.
    const botoes = html.match(/<button[^>]*data-revisado="[^"]*"[^>]*>/g) || [];
    ok(botoes.length === 2, 'dois botoes Revisado na tela', botoes.length);
    ok(botoes.every(b => b.indexOf('disabled') !== -1), 'e os dois travados');
    // Travado apaga, mas nao apaga a INFORMACAO: o selo do estagio continua na
    // barra de titulo, e e por ele que quem so ve sabe onde o modelo esta.
    ok(html.indexOf('Em acabamento') !== -1 && html.indexOf('Impresso') !== -1,
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
    // Entao ha CINCO rotas: tres da FICHA DE EXPEDICAO -- peso, carimbo do
    // setor e o envio para a expedicao --; desde 21/08/2026 a conferencia da
    // SENHA DE LIBERACAO do peso, que nao e da ficha (o agente so repassa o que
    // o operador digitou e devolve sim ou nao); e, desde 24/08/2026, a BALANCA
    // da estacao -- porta serial nao se le do navegador sem WebSerial, que pede
    // permissao maquina a maquina, e nenhuma solucao daqui pode depender de
    // configurar navegador. Nenhuma delas e do motor: nao ha impor, gerar PDF
    // nem imprimir nesta tela, e este teste existe para que continue assim.
    const ESPERADAS = ['balanca', 'expedicao', 'peso-setores', 'senha-liberacao', 'setor-concluido'];
    const rotas = [...new Set(
        (codigo.match(/urlDaEstacao\('([a-z0-9-]+)'/g) || [])
            .map(m => m.replace(/^urlDaEstacao\('/, '').replace(/'$/, ''))
    )].sort();
    ok(rotas.join(',') === ESPERADAS.join(','),
       'as rotas de agente no acabamento.js sao as tres da ficha, a senha e a balanca', rotas.join(','));

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

// ─── O RECORTE POR SETOR (27/08/2026) ────────────────────────────────
//
// Regra do usuario: *"ao selecionar o filtro por setor, deve levar em
// consideracao apenas o setor selecionado"*. O card deixou de ser filtro de
// LINHAS e virou RECORTE: o que a linha diz passa a ser o do setor aceso.
//
// O exemplo que ele deu e o primeiro teste daqui, ao pe da letra.

/** Um pedido com LASER pronto e TEXTIL ainda aguardando. */
function pedidoDeDoisSetores() {
    return ambienteComPedidos([pedido(701)], {
        701: [
            { id: 71, setor: 'LASER',  quantidade: 100, acabamento_status: 'Pronto' },
            { id: 72, setor: 'TEXTIL', quantidade: 400 },
        ],
    });
}

(function oCardDeSetorRecortaOSeloDoPedido() {
    const amb = pedidoDeDoisSetores();
    const html = () => { amb.painel.render(); return amb.elementos['tbody-acabamento'].innerHTML; };

    // Sem card aceso, o selo continua sendo o do PEDIDO INTEIRO.
    ok(html().indexOf('Em acabamento') !== -1,
       'sem recorte o selo fala do pedido: um setor pronto e outro nao');

    // O exemplo do usuario: card LASER aceso, LASER pronto -> PRONTO.
    amb.painel.setFiltroSetor('LASER');
    const comLaser = html();
    ok(comLaser.indexOf('Revisado') !== -1 && comLaser.indexOf('Em acabamento') === -1,
       'com o card LASER aceso o selo e REVISADO, mesmo com o TEXTIL na bancada',
       comLaser.slice(0, 400));
    ok(comLaser.indexOf('1/1 mod.') !== -1, 'e o progresso e o do LASER: 1/1');
    ok(comLaser.indexOf('100%') !== -1, 'ou seja, 100 %');
    ok(comLaser.indexOf('>100<') !== -1,
       'a quantidade tambem e so a do LASER', comLaser.slice(0, 600));
    ok(comLaser.indexOf('1 modelo<') !== -1, 'e a contagem de itens tambem');

    // O outro card, no mesmo pedido, diz a verdade oposta.
    amb.painel.setFiltroSetor('LASER');   // apaga o LASER
    amb.painel.setFiltroSetor('TEXTIL');
    const comTextil = html();
    ok(comTextil.indexOf('Aguardando') !== -1, 'com o card TEXTIL o selo e o do TEXTIL');
    ok(comTextil.indexOf('0/1 mod.') !== -1, 'e o progresso, 0/1');

    // Os cards SOMAM, e a soma volta a ser o pedido inteiro.
    amb.painel.setFiltroSetor('LASER');
    const comOsDois = html();
    ok(comOsDois.indexOf('Em acabamento') !== -1,
       'com os dois acesos o recorte e a uniao, e o selo volta a "Em acabamento"');
    ok(comOsDois.indexOf('1/2 mod.') !== -1, 'com o progresso dos dois somados');
})();

(function oRecorteSeAnunciaNaTela() {
    // Sem isto a mesma linha diz "1/1 mod." e "Pronto" sem nada explicando que
    // aquilo e so um setor -- e o operador leria o pedido inteiro como pronto.
    const amb = pedidoDeDoisSetores();
    amb.painel.render();
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('◧') === -1,
       'sem recorte a linha nao ganha marca nenhuma');

    amb.painel.setFiltroSetor('LASER');
    amb.painel.render();
    const html = amb.elementos['tbody-acabamento'].innerHTML;
    ok(html.indexOf('◧ LASER') !== -1,
       'com recorte, a linha diz de que setor ela fala', html.slice(0, 500));
    ok(html.indexOf('Estágio do setor LASER') !== -1,
       'e o selo explica o mesmo no title, que e onde o operador confere');

    amb.painel.setFiltroSetor('TEXTIL');
    amb.painel.render();
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('◧ TÊXTIL + LASER') !== -1,
       'com dois cards, os dois nomes aparecem na ordem dos cards');
})();

(function aConsultaDoEstagioPedeOProdutoDeOrigem() {
    // Teste de FONTE, e nao de comportamento, de proposito.
    //
    // O `select` de mentira deste harness ignora a lista de colunas e devolve a
    // linha inteira, entao a coluna pode sumir da consulta sem nenhum teste de
    // comportamento piscar. Quem perceberia seria a grafica, e do pior jeito: o
    // recorte por setor cegaria na lista, e os quatro cards ficariam vazios.
    ok(/\.select\('id, id_int, acabamento_status[^']*id_produto_proposta_origem'/.test(FONTE),
       'a consulta do estagio continua pedindo o id_produto_proposta_origem');

    // E ela continua sendo UMA consulta: a coluna pega carona, e nao abre uma
    // segunda ida ao banco por pedido.
    const consultas = (FONTE.match(/from\('pedidos_modelos'\)\s*\.select\(/g) || []);
    ok(consultas.length === 1,
       'e ela e a unica leitura de pedidos_modelos da tela', String(consultas.length));
})();

(function oEstagioPerguntaPelosModelosDoRecorte() {
    // Este defeito e ANTERIOR ao recorte, e vivia de as duas clausulas serem
    // independentes: a de setor perguntava "tem item em LASER?" e a de estagio,
    // "tem ALGUM modelo Pronto?", sem exigir que fosse o mesmo modelo.
    const amb = ambienteComPedidos([pedido(702)], {
        702: [
            { id: 81, setor: 'LASER',  quantidade: 10 },                             // aguardando
            { id: 82, setor: 'TEXTIL', quantidade: 20, acabamento_status: 'Pronto' },
        ],
    });
    const html = () => { amb.painel.render(); return amb.elementos['tbody-acabamento'].innerHTML; };

    amb.painel.setFiltroSetor('LASER');
    amb.painel.setFiltroStatus('Pronto');
    ok(html().indexOf('>702<') === -1,
       'LASER + Pronto NAO lista o pedido cujo pronto e do TEXTIL');

    amb.painel.setFiltroStatus('Aguardando');
    ok(html().indexOf('>702<') !== -1, 'e LASER + Aguardando lista, porque o LASER aguarda');
})();

(function modeloSemSetorSomeDoRecorte() {
    // Decisao do usuario em 27/08/2026, perguntado de frente: modelo sem setor
    // NAO ganha pilula propria e nao entra em recorte nenhum. Ele so volta a ser
    // contado quando nenhum card esta aceso.
    //
    // Nao e caso de laboratorio: 43 dos 68 produtos do catalogo do parceiro nao
    // tem `setor_pcp`, porque sao itens de estoque e revenda.
    const amb = ambienteComPedidos([pedido(703)], {
        703: [
            { id: 91, setor: 'LASER', quantidade: 10, acabamento_status: 'Pronto' },
            { id: 92, quantidade: 999 },                       // sem setor nenhum
        ],
    });
    const html = () => { amb.painel.render(); return amb.elementos['tbody-acabamento'].innerHTML; };

    ok(html().indexOf('1.009') !== -1,
       'sem recorte, o modelo sem setor conta na quantidade do pedido', html().slice(0, 600));

    amb.painel.setFiltroSetor('LASER');
    const comLaser = html();
    ok(comLaser.indexOf('1/1 mod.') !== -1, 'com o card LASER, o sem-setor sai da conta');
    ok(comLaser.indexOf('>10<') !== -1, 'e da quantidade tambem');

    // E um pedido SO de material sem setor nao aparece em recorte nenhum.
    const so = ambienteComPedidos([pedido(704)], { 704: [{ id: 93, quantidade: 5 }] });
    so.painel.setFiltroSetor('LASER');
    so.painel.render();
    ok(so.elementos['tbody-acabamento'].innerHTML.indexOf('>704<') === -1,
       'pedido so de material sem setor fica fora do recorte');
    ok(so.elementos['empty-acabamento-texto'].textContent.indexOf('Todos os Setores') !== -1,
       'e a tela vazia diz como sair dali, em vez de parecer que nao ha trabalho',
       so.elementos['empty-acabamento-texto'].textContent);
})();

(function oRecorteNaoMexeNaExpedicaoNemNasMetricas() {
    // As duas outras bordas da regra, decididas na mesma conversa:
    //
    //  1. o envio a EXPEDICAO continua sendo do pedido inteiro -- um setor nao se
    //     despacha sozinho;
    //  2. as metricas da coluna lateral e o alerta de atraso continuam contando a
    //     fila INTEIRA: elas medem trabalho a fazer, e trabalho a fazer nao muda
    //     porque o operador filtrou a vista.
    const amb = pedidoDeDoisSetores();
    amb.painel.render();
    const prontosSemRecorte = String(amb.elementos['stat-acab-modelos-prontos'].textContent);
    const filaSemRecorte = String(amb.elementos['stat-acab-pedidos-fila'].textContent);
    const concluidosSemRecorte = String(amb.elementos['stat-acab-pedidos-concluidos'].textContent);

    amb.painel.setFiltroSetor('LASER');
    amb.painel.render();
    ok(String(amb.elementos['stat-acab-modelos-prontos'].textContent) === prontosSemRecorte,
       'a contagem de modelos prontos ignora o recorte');
    ok(String(amb.elementos['stat-acab-pedidos-fila'].textContent) === filaSemRecorte,
       'a de pedidos em fila tambem');
    ok(String(amb.elementos['stat-acab-pedidos-concluidos'].textContent) === concluidosSemRecorte,
       'e a de pedidos concluidos, que continua exigindo o pedido inteiro pronto');
    ok(concluidosSemRecorte === '0',
       'com um setor pendente o pedido NAO conta como concluido, recorte ou nao',
       concluidosSemRecorte);

    // A expedicao continua sendo do pedido inteiro, com o card aceso ou sem ele.
    const itens = [
        { id: 71, setor: 'LASER',  acabamento_status: 'Pronto' },
        { id: 72, setor: 'TEXTIL' },
    ];
    ok(amb.painel._regras.pedidoProntoParaExpedicao(itens) === false,
       'com o LASER pronto e o TEXTIL nao, o pedido NAO esta pronto para expedir');
    ok(amb.painel._regras.setoresPendentes(itens).length === 1,
       'e o TEXTIL continua constando como pendente');

    // E o pedido nao sai da lista de trabalho so porque o recorte diz "Pronto".
    amb.painel.setFiltroPrazo('expedicao');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>701<') === -1,
       'o recorte pronto NAO manda o pedido para a lista de expedidos');
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
    const html = telaDoPedido(amb);

    ok(html.indexOf('Peso e volumes') !== -1, 'o bloco tem titulo');
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
    const html = telaDoPedido(amb);

    ok(html.indexOf('Peso e volumes') !== -1, 'o bloco continua na tela');
    ok(html.indexOf('entre com a sua conta') !== -1, 'e diz o que fazer para poder gravar');
    ok(html.indexOf('acab-peso-PVC') === -1, 'sem campo que nao gravaria nada');
    ok(html.indexOf('PVC') !== -1, 'mas o setor do pedido continua visivel');
}

async function pedidoSemSetorExplicaOPorque() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'].forEach(i => { i.setor = ''; });

    await amb.painel.abrirPedido('os-200');
    const html = telaDoPedido(amb);

    ok(html.indexOf('Peso e volumes') !== -1, 'o bloco aparece mesmo assim');
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

    const html = telaDoPedido(amb);
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

// ─── A balanca da estacao (24/08/2026) ───────────────────────────────────────
//
// O operador do acabamento pesa o material numa balanca Urano CP 3/0.5 POP e
// ate aqui digitava no campo o numero que lia no visor. O botao ⚖ traz o numero
// da propria balanca, pela porta serial, lida pelo AGENTE -- porta serial nao se
// le do navegador sem WebSerial, que so existe no Chrome e pede permissao
// maquina a maquina, e nenhuma solucao deste projeto pode depender de configurar
// navegador.

function ambienteComBalanca(responder) {
    const amb = ambienteComEstimado();
    amb.janela.SERVIDA_PELA_NUVEM = false;   // servida PELA ESTACAO
    amb.janela.API_BASE_URL = '';
    amb.banco._sessao = null;                // acesso local: sem sessao do Vibe
    amb.chamadas = [];
    amb.janela.fetch = (url, opcoes) => {
        const metodo = (opcoes && opcoes.method) || 'GET';
        amb.chamadas.push({ url, metodo, corpo: opcoes && opcoes.body ? JSON.parse(opcoes.body) : null });
        if (url.indexOf('/api/balanca/') === 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(responder(url)) });
        }
        if (metodo === 'GET') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ setores: [] }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
    };
    return amb;
}

async function oBotaoDaBalancaSoExisteNaEstacao() {
    // Na estacao ele fica ao lado do campo de peso de cada setor.
    const naEstacao = ambienteComBalanca(() => ({ ok: true, peso_kg: 4.2, estavel: true }));
    await naEstacao.painel.abrirPedido('os-200');
    const html = telaDoPedido(naEstacao);
    ok(html.indexOf('acab-balanca-btn-acab-peso-PVC') !== -1,
       'na estacao ha o botao da balanca ao lado do peso do setor');
    ok(html.indexOf('AcabamentoPainel.lerBalanca(') !== -1,
       'e ele chama a leitura da balanca');

    // No site, nao. A balanca esta numa mesa, ligada a UM computador: botao que
    // nao faz nada e pior que botao nenhum.
    const noSite = ambienteComEstimado();
    noSite.janela.SERVIDA_PELA_NUVEM = true;
    await noSite.painel.abrirPedido('os-200');
    const htmlDoSite = telaDoPedido(noSite);
    ok(htmlDoSite.indexOf('acab-balanca-btn') === -1,
       'no site o botao da balanca nao existe');
    ok(htmlDoSite.indexOf('id="acab-peso-PVC"') !== -1,
       'mas o campo para digitar a mao continua la');
}

async function aBalancaPreencheOPesoDoSetorEGravaPeloCaminhoDeSempre() {
    const amb = ambienteComBalanca(() => ({
        ok: true, peso_kg: 4.2, estavel: true, porta: 'COM7',
    }));
    await amb.painel.abrirPedido('os-200');
    amb.chamadas.length = 0;

    const deu = await amb.painel.lerBalanca('setor', '200', 'PVC');

    ok(deu === true, 'a leitura deu certo');
    ok(amb.chamadas[0] && amb.chamadas[0].url === '/api/balanca/peso',
       'o peso foi pedido ao agente desta estacao, em caminho relativo',
       JSON.stringify(amb.chamadas[0]));
    ok(amb.elementos['acab-peso-PVC'].value === '4,2',
       'o campo ficou com o peso da balanca, com virgula',
       amb.elementos['acab-peso-PVC'].value);

    // E gravou pelo caminho de sempre: a rota do peso do agente, nao uma nova.
    const post = amb.chamadas.find(c => c.metodo === 'POST'
        && c.url.indexOf('/api/peso-setores/') === 0);
    ok(!!post && post.corpo.setor === 'PVC' && post.corpo.peso_real_kg === 4.2,
       'e o peso foi gravado pela rota de sempre', JSON.stringify(post));
    ok(!amb.elementos['acab-balanca'],
       'dando certo, a caixa de diagnostico nem chega a ser montada');
}

async function oPesoDaBalancaPassaPelaReguaDosCincoPorCento() {
    // 4,5 kg contra 4,16 estimados sao +8,2 %: mesmo vindo da balanca, o peso
    // para no popup da senha. A balanca preenche o campo; ela nao libera nada.
    const amb = ambienteComBalanca(() => ({ ok: true, peso_kg: 4.5, estavel: true }));
    await amb.painel.abrirPedido('os-200');
    amb.chamadas.length = 0;

    await amb.painel.lerBalanca('setor', '200', 'PVC');

    ok(amb.elementos['acab-liberacao'].style.display === 'flex',
       'o popup da senha de liberacao abriu, como na digitacao a mao');
    ok(!amb.chamadas.some(c => c.metodo === 'POST' && c.url.indexOf('/api/peso-setores/') === 0),
       'e nada foi gravado antes da senha', JSON.stringify(amb.chamadas));
}

async function balancaMudaAbreACaixaQueDizOQueFazer() {
    // A saida de dados da CP POP e opcional de fabrica, e mesmo instalada pode
    // estar desligada no teclado dela. Nada disso o operador adivinha.
    const amb = ambienteComBalanca(() => ({
        ok: false,
        motivo: 'A porta COM7 não respondeu como a balança CP POP.',
        comoResolver: 'Na balança: FUNÇÃO, 8, senha 191249, e escolha "Tipo 1".',
    }));
    await amb.painel.abrirPedido('os-200');
    amb.chamadas.length = 0;

    const deu = await amb.painel.lerBalanca('setor', '200', 'PVC');

    ok(deu === false, 'a leitura nao deu certo');
    ok(amb.elementos['acab-balanca'].style.display === 'flex', 'e a caixa abriu');
    ok(amb.elementos['acab-balanca-motivo'].textContent.indexOf('não respondeu') !== -1,
       'dizendo o motivo', amb.elementos['acab-balanca-motivo'].textContent);
    ok(amb.elementos['acab-balanca-saida'].textContent.indexOf('191249') !== -1,
       'e a saida: os passos no teclado da balanca',
       amb.elementos['acab-balanca-saida'].textContent);
    ok(amb.elementos['acab-peso-PVC'].value !== '4,2', 'o campo nao foi preenchido com nada');
    ok(!amb.chamadas.some(c => c.metodo === 'POST'), 'e nada foi gravado',
       JSON.stringify(amb.chamadas));
}

async function oDiagnosticoMostraOQueCadaPortaRespondeu() {
    // A pergunta que nenhuma tela responde de longe: a balanca esta mesmo ligada
    // NESTA maquina, e em qual porta.
    const amb = ambienteComBalanca(url => {
        if (url === '/api/balanca/portas') {
            return {
                porta: 'COM7',
                portas: [
                    { porta: 'COM1', descricao: 'Porta de Comunicações', respondeu: false,
                      detalhe: 'não respondeu' },
                    { porta: 'COM7', descricao: 'USB Serial', respondeu: true,
                      peso_kg: 2.5, estavel: true },
                ],
            };
        }
        if (url === '/api/balanca/porta') return { ok: true, porta: 'COM1' };
        return { ok: false, motivo: 'Não achei a balança.' };
    });
    await amb.painel.abrirPedido('os-200');
    await amb.painel.lerBalanca('setor', '200', 'PVC');
    await amb.painel.procurarBalanca();

    const lista = amb.elementos['acab-balanca-portas'].innerHTML;
    ok(lista.indexOf('COM1') !== -1 && lista.indexOf('COM7') !== -1,
       'a caixa lista as portas COM da maquina', lista);
    ok(lista.indexOf('é a balança') !== -1, 'e diz qual delas e a balanca');
    ok(lista.indexOf('2,5 kg') !== -1,
       'mostrando o que ela marca agora, para conferir com o visor');
    ok(lista.indexOf("usarPortaDaBalanca('COM1')") !== -1,
       'as outras ficam com o botao de escolher a mao');

    // Escolher uma porta a mao grava a escolha NESTA maquina.
    amb.chamadas.length = 0;
    await amb.painel.usarPortaDaBalanca('COM1');
    const post = amb.chamadas.find(c => c.url === '/api/balanca/porta');
    ok(!!post && post.metodo === 'POST' && post.corpo.porta === 'COM1',
       'a escolha foi gravada pelo agente', JSON.stringify(post));
    ok(amb.elementos['acab-balanca'].style.display === 'none', 'e a caixa fechou');
}

function aBalancaEstaNosTresCamposDePeso() {
    // Os tres campos sao o MESMO ato de pesar, e o usuario pediu o botao nos
    // tres (24/08/2026). Dois deles moram em popups montados uma vez so, fora do
    // alcance do DOM de mentira -- por isso a medida aqui e na fonte.
    ok(FONTE.indexOf("botaoDaBalanca('setor', numeroDoPedido, setor)") !== -1,
       'o peso de cada setor, na ficha de expedicao');
    ok(FONTE.indexOf("botaoDaBalanca('registro')") !== -1,
       'o "Peso na balanca" da janela do registro');
    ok(FONTE.indexOf("botaoDaBalanca('linha', indice)") !== -1,
       'e o de cada linha, quando se pesa um a um');
    ok(FONTE.indexOf("botaoDaBalanca('obrigatorio')") !== -1,
       'e a janela do peso que fecha o setor');
}

async function oBotaoDeExpedicaoSoAcendeComTudoPronto() {
    const amb = ambienteComPedidoAberto();
    amb.janela.state.osItens['os-200'][0].setor = 'PVC';
    amb.janela.state.osItens['os-200'][1].setor = 'LASER';
    amb.janela.state.osItens['os-200'][0].acabamento_status = 'Pronto';
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Em acabamento';

    await amb.painel.abrirPedido('os-200');
    let html = telaDoPedido(amb);

    ok(html.indexOf('EXPEDIÇÃO') !== -1, 'o botao existe mesmo com o pedido pendente');
    ok(html.indexOf('1 setor pendente') !== -1, 'e ele diz quantos setores faltam', html.slice(0, 0));
    ok(html.indexOf('AcabamentoPainel.expedir(') !== -1, 'e continua clicavel: e assim que ele explica');

    // Com tudo pronto, ele acende.
    amb.janela.state.osItens['os-200'][1].acabamento_status = 'Pronto';
    amb.painel.render();
    await amb.painel.abrirPedido('os-200');
    html = telaDoPedido(amb);
    ok(html.indexOf('todos os modelos revisados') !== -1, 'com tudo pronto ele muda de cara');
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
    const botoes3002 = do3002.match(/<button[^>]*data-revisado="[^"]*"[^>]*>/g) || [];
    ok(botoes3002.length === 1, 'o botao do modelo sem responsavel aparece', botoes3002.length);
    ok(botoes3002.every(b => b.indexOf('disabled') !== -1),
       'e todos travados enquanto nao ha responsavel');
    ok(do3002.indexOf('para liberar o Revisado') !== -1, 'a tela diz o que falta');
    // Ele aponta para CIMA desde 26/08/2026: o seletor subiu para a barra do
    // Desde 29/08/2026 o seletor esta na MESMA LINHA do botao, e a seta saiu
    // junto: o recado so precisa dizer onde o nome se escolhe, e "ao lado" e a
    // verdade agora. Seta que aponta para o lugar errado e pior do que seta
    // nenhuma -- foi por isso que ela mudou de lado em 26/08, e por isso que
    // agora ela nao existe.
    ok(do3002.indexOf('<b>Responsável</b> ao lado') !== -1,
       'e aponta para onde o responsavel ficou agora');
    ok(do3002.indexOf('⬆️') === -1 && do3002.indexOf('⬇️') === -1,
       'sem seta: o seletor esta na mesma linha do botao');
    // ...mas o estagio continua LEGIVEL: travar nao e esconder.
    ok(do3002.indexOf('Impresso') !== -1,
       'o estagio derivado continua legivel no selo da barra');

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
    ok(textoDaHoraDoPronto(hoje.toISOString()) === 'Revisado às 14:32',
       'no mesmo dia sai so a hora', textoDaHoraDoPronto(hoje.toISOString()));

    const outroDia = new Date(hoje.getTime() - 3 * 24 * 3600 * 1000);
    ok(/^Revisado em \d\d\/\d\d às \d\d:\d\d$/.test(textoDaHoraDoPronto(outroDia.toISOString())),
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
    const html = telaDoPedido(amb);
    ok(html.indexOf('Revisado às 14:32') !== -1, 'o card do modelo revisado mostra a hora', html.length);

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
    const html = telaDoPedido(amb);

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
    ok(telaDoPedido(amb).indexOf('est. 4,160 kg') !== -1,
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

    ok(telaDoPedido(amb).indexOf('est. —') !== -1, 'o bloco mostra "est. —"');
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
    // A frase "Nenhuma foto do material ainda." saiu em 26/08/2026, quando o
    // bloco desceu da barra de titulo para a faixa acima da especificacao: ali
    // cabe uma linha so, e ela disputava lugar com o proprio botao.
    //
    // Nada se perdeu, porque o ESTADO continua dito -- no rotulo do botao, que
    // e onde o operador olha: sem foto ele le "Fotografar"; com foto ele le
    // "Refazer foto" e a miniatura aparece ao lado.
    ok(html.indexOf('Nenhuma foto do material ainda') === -1,
       'a frase saiu junto com a mudanca de lugar');
    ok((html.match(/📷 Fotografar/g) || []).length === 2,
       'os dois modelos sem foto dizem "Fotografar" no proprio botao');

    // Com foto gravada, aparece a miniatura e o botao vira "Refazer".
    const amb2 = ambienteComPedidoAberto();
    amb2.janela.state.osItens['os-200'][0].acabamento_foto_url =
        'https://x.supabase.co/storage/v1/object/public/artes/acabamento-fotos/200_3001_1.jpg';
    amb2.painel.abrirPedido('os-200');
    const html2 = amb2.elementos['acab-detalhe-corpo'].innerHTML;
    ok(html2.indexOf('acabamento-fotos/200_3001_1.jpg') !== -1, 'a foto gravada vira miniatura');
    ok(html2.indexOf('📷 Refazer') !== -1, 'e o botao passa a oferecer refazer');
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
        { id: 901, id_int: 302, acabamento_status: 'Em acabamento', acabamento_responsavel: 'Ana Prado' },
    ];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    amb.painel.render();

    ok(amb.elementos['stat-acab-modelos-prontos'].textContent === 1,
       'o pronto veio da consulta propria', amb.elementos['stat-acab-modelos-prontos'].textContent);
    ok(amb.elementos['stat-acab-modelos-acabamento'].textContent === 1,
       'e o em acabamento tambem -- pelo responsavel que a consulta trouxe',
       amb.elementos['stat-acab-modelos-acabamento'].textContent);
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>301<') !== -1,
       'e o pedido todo pronto continua na fila: so o envio a expedicao o tira de la');
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

// ─── Os volumes (29/08/2026) ────────────────────────────────────────────────
//
// A regra que o usuario ditou, e que substitui a de 23/08:
//
//   "pedido sem criacao de volumes seguem o fluxo existente, ao criar volumes
//    cada modelo registrado como pronto precisa indicar a qual volume pertence
//    e registrar seu peso, esse registro pode ser feito em grupos, volumes ja
//    criados podem receber novos modelos ou grupos de modelos, somando os pesos
//    ao volume, retirar o conceito de caixa e pacote e rolo, teremos apenas o
//    conceito de volumes."
//
// E o gesto na estacao, que ele confirmou no mesmo dia:
//
//   "modelos sao pesados antes de colocados no volume, as somas dos pesos dos
//    modelos sao o peso do volume. pedidos sem volume criado e pesado ao final"
//
// O que estes testes travam, em uma frase cada:
//
//   1. pedido SEM volume nao mudou em nada -- e a maioria dos pedidos;
//   2. criar o primeiro volume liga a trava: o Pronto passa a pedir o registro;
//   3. o peso e do REGISTRO, e o do volume e a soma deles;
//   4. um volume ja criado recebe mais modelos, somando;
//   5. registro parcial NAO fecha o modelo -- ele so fica Pronto no fim;
//   6. em grupo, uma pesagem so e repartida pela proporcao do peso estimado;
//   7. tirar do volume devolve o modelo para "Em acabamento";
//   8. com volumes, o peso do setor e LEITURA -- ele e a soma;
//   9. nada disso escreve em tabela do parceiro alem do peso de sempre;
//  10. caixa, pacote, fardo e rolo sumiram do vocabulario da tela.

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
    itens[0].acabamento_status = 'Em acabamento';
    itens[0].acabamento_responsavel = 'Bernardo Farias';
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
 * O mesmo ambiente, com peso por peca no ERP.
 *
 * Os dois do Laser saem da MESMA linha da proposta, como acontece de verdade:
 * 28.600 g para 5.500 unidades = 5,2 g a peca. E o `3004` nao tem linha
 * nenhuma: e ele que prova que a tela nao inventa base quando o ERP nao tem.
 */
function ambienteDeVolumesComPeso() {
    const amb = ambienteDeVolumes();
    const itens = amb.janela.state.osItens['os-200'];
    itens[0].id_produto_proposta_origem = 2281;
    itens[1].id_produto_proposta_origem = 2281;
    itens.push({
        id: 3004, produto: 'Credencial Sem Peso', modelo: '3004', _vibe_id_produto: 55,
        setor: 'LASER', qtd: 100, status_impressao: 'Impresso',
        acabamento_status: 'Em acabamento', acabamento_responsavel: 'Bernardo Farias',
    });
    amb.banco._produtosDaProposta = [
        { id: 2281, id_int: 200, id_produto: 55, qtd: 5500, peso_total: 28600 },
    ];
    return amb;
}

/** As janelas nascem por `createElement`; aqui elas ficam a mao. */
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

/** O indice da linha daquele modelo na janela do registro. */
function indiceDaLinha(amb, modeloId) {
    const r = amb.painel._tela.registroEmCurso;
    if (!r) return -1;
    return r.linhas.findIndex(l => String(l.modeloId) === String(modeloId));
}

function campoDaQtd(amb, modeloId) {
    return amb.documento.getElementById('acab-reg-qtd-' + indiceDaLinha(amb, modeloId));
}

/**
 * O caminho inteiro do operador.
 *
 * `um: 3001` clica no PRONTO daquele card; `grupo: [3001, 3002]` marca os dois
 * e usa a barra. Os dois caminhos caem na MESMA janela, que e o ponto.
 */
async function registrar(amb, opcoes) {
    if (opcoes.grupo) {
        (opcoes.grupo || []).forEach(id => amb.painel.marcarModelo(id));
        amb.painel.registrarEmGrupo();
    } else {
        await amb.painel.mudarEstagio(opcoes.um, 'os-200', 'Pronto');
    }
    const r = amb.painel._tela.registroEmCurso;
    if (!r) return null;

    if (opcoes.volumeId !== undefined) amb.painel.escolherVolume(opcoes.volumeId);

    const qtds = opcoes.qtds || {};
    r.linhas.forEach((l, i) => {
        const campo = amb.documento.getElementById('acab-reg-qtd-' + i);
        campo.value = String(qtds[l.modeloId] !== undefined ? qtds[l.modeloId] : l.qtd);
    });

    if (opcoes.porModelo) {
        amb.painel.pesarPorModelo();
        const pesos = opcoes.pesos || {};
        Object.keys(pesos).forEach(id => {
            amb.documento.getElementById('acab-reg-peso-' + indiceDaLinha(amb, id)).value = String(pesos[id]);
        });
    } else {
        amb.documento.getElementById('acab-reg-peso').value = opcoes.peso;
    }
    amb.documento.getElementById('acab-reg-responsavel').value = opcoes.responsavel || '';
    // A foto do volume nao vem de campo: ela ja subiu ao Storage no "Salvar
    // foto" da camera, e a janela guarda so o endereco.
    if (opcoes.foto) amb.painel._tela.registroEmCurso.fotoUrl = opcoes.foto;
    await amb.painel.confirmarRegistro();
    return r;
}

/** Os registros gravados de um volume, direto do banco de mentira. */
function registrosDoBanco(amb, volumeId) {
    return amb.banco._itensDeVolume.filter(i => String(i.volume_id) === String(volumeId));
}

// ─── 1. O pedido sem volume nao mudou ───────────────────────────────────────

async function pedidoSemVolumeSegueOFluxoDeSempre() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    const html = telaDoPedido(amb);

    ok(html.indexOf('1 volume único') !== -1, 'o setor sem volume diz que sai como um so');
    ok(html.indexOf('pesado no fim') !== -1,
       'e diz QUANDO ele e pesado -- "pedidos sem volume criado e pesado ao final"');
    ok(html.indexOf('Dividir em volumes') !== -1, 'e oferece a saida, na propria tela');
    ok(html.indexOf('id="acab-peso-LASER"') !== -1 && html.indexOf('input type="text" inputmode="decimal" id="acab-peso-LASER"') !== -1,
       'o campo do peso do setor continua digitavel');
    ok(html.indexOf('>Volume<') === -1, 'e o card do modelo nao ganha bloco de volume');

    // E o PRONTO grava direto, sem janela nenhuma.
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');
    ok(!amb.painel._tela.registroEmCurso, 'o Pronto nao abre janela de registro');
}

// ─── 2. Criar o primeiro volume liga a trava do Pronto ──────────────────────

async function criarVolumeVazioLigaATravaDoPronto() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');

    await amb.painel.novoVolume('LASER', 200);
    ok(amb.banco._volumesDoBanco.length === 1, 'o volume nasce VAZIO, com um clique',
       String(amb.banco._volumesDoBanco.length));
    const v = amb.banco._volumesDoBanco[0];
    ok(v.id_int === 200 && v.setor === 'LASER' && v.numero === 1, 'no pedido e no setor certos');
    ok(registrosDoBanco(amb, v.id).length === 0, 'e sem nada dentro');

    const html = telaDoPedido(amb);
    ok(html.indexOf('vazio') !== -1, 'a faixa diz que ele esta vazio');
    ok(html.indexOf('ainda sem volume') !== -1, 'e os modelos aparecem como sem volume');

    // Agora o Pronto pergunta em vez de gravar.
    const gravadosAntes = amb.banco._gravacoes.length;
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');
    ok(!!amb.painel._tela.registroEmCurso, 'o Pronto abre a janela do registro');
    ok(amb.banco._gravacoes.length === gravadosAntes, 'e nada e gravado antes dela');
}

async function excluirOUltimoVolumeDevolveOFluxoDeSempre() {
    const amb = ambienteDeVolumes();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const id = amb.banco._volumesDoBanco[0].id;

    await amb.painel.excluirVolume(id);
    ok(amb.banco._volumesDoBanco.length === 0, 'o volume vazio pode ser excluido');
    // A trava tem saida: criar um volume por engano nao tranca a tela.
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');
    ok(!amb.painel._tela.registroEmCurso, 'e o Pronto volta a gravar direto');
}

// ─── 3. O peso e do registro; o do volume e a soma ──────────────────────────

async function oRegistroGravaQuantidadeEPeso() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    const regs = registrosDoBanco(amb, volumeId);
    ok(regs.length === 1, 'uma linha de registro foi gravada', String(regs.length));
    ok(Number(regs[0].modelo_id) === 3001 && regs[0].qtd === 5000,
       'com o modelo e a quantidade que faltavam');
    ok(Number(regs[0].peso_kg) === 26, 'e com o PESO na propria linha', String(regs[0].peso_kg));
    ok(regs[0].responsavel === 'Bernardo Farias', 'e com quem fez');

    // O espelho: `producao_volumes.peso_kg` recebe a soma, para a estacao
    // atrasada continuar mostrando um numero certo.
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 26,
       'o volume guarda a soma como espelho', String(amb.banco._volumesDoBanco[0].peso_kg));

    // E o modelo fica Pronto sozinho: entrou inteiro no volume.
    const status = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_status !== undefined);
    ok(status.some(g => String(g.valor) === '3001' && g.payload.acabamento_status === 'Pronto'),
       'o modelo fica Pronto ao entrar inteiro no volume',
       JSON.stringify(status.map(g => [g.valor, g.payload.acabamento_status])));
}

async function oVolumeJaCriadoRecebeMaisModelos() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });
    await registrar(amb, { um: 3002, peso: '2,60', responsavel: 'Cesar Almeida' });

    const regs = registrosDoBanco(amb, volumeId);
    ok(regs.length === 2, 'o segundo registro ACRESCENTA, nao substitui', String(regs.length));
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 28.6,
       'e o peso do volume soma os dois', String(amb.banco._volumesDoBanco[0].peso_kg));

    const v = amb.painel._regras.volumesDoSetor('LASER')[0];
    ok(v.peso === 28.6, 'a tela le a soma dos registros', String(v.peso));
    ok(v.registros.length === 2, 'com os dois registros dentro', String(v.registros.length));
}

async function registroParcialNaoFechaOModelo() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);

    await registrar(amb, { um: 3001, qtds: { 3001: '2000' }, peso: '10,40',
                           responsavel: 'Bernardo Farias' });

    const status = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_status !== undefined);
    ok(!status.some(g => String(g.valor) === '3001'),
       'metade do modelo no volume NAO o marca como Pronto');

    const html = telaDoPedido(amb);
    ok(html.indexOf('2.000 de 5.000 registrados') !== -1, 'o card diz quanto ja entrou', html.slice(0, 0));
    ok(html.indexOf('3.000 fora') !== -1, 'e quanto falta');

    // A segunda leva fecha.
    await registrar(amb, { um: 3001, qtds: { 3001: '3000' }, peso: '15,60',
                           responsavel: 'Bernardo Farias' });
    const status2 = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_status !== undefined);
    ok(status2.some(g => String(g.valor) === '3001' && g.payload.acabamento_status === 'Pronto'),
       'a ultima leva e que fecha o modelo');
}

async function oMesmoModeloCabeEmVariosVolumes() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const v1 = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, qtds: { 3001: '2000' }, peso: '10,40',
                           responsavel: 'Bernardo Farias' });
    await amb.painel.novoVolume('LASER', 200);
    const v2 = amb.banco._volumesDoBanco[1].id;
    await registrar(amb, { um: 3001, volumeId: v2, qtds: { 3001: '3000' }, peso: '15,60',
                           responsavel: 'Cesar Almeida' });

    ok(registrosDoBanco(amb, v1).length === 1 && registrosDoBanco(amb, v2).length === 1,
       'o mesmo modelo entrou em dois volumes');
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 10.4
       && Number(amb.banco._volumesDoBanco[1].peso_kg) === 15.6,
       'cada volume com o peso da sua parte');

    // Duas pessoas: quem assina o modelo passa a ser o SETOR.
    const resp = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_responsavel !== undefined);
    ok(resp.some(g => String(g.valor) === '3001' && g.payload.acabamento_responsavel === 'Laser'),
       'com mais de um responsavel, o modelo e assinado pelo setor',
       JSON.stringify(resp.map(g => g.payload.acabamento_responsavel)));
}

// ─── 4. O grupo, com uma pesagem so ─────────────────────────────────────────

async function oGrupoRepartePesoNaProporcaoDoEstimado() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    // 5.000 + 500 unidades a 5,2 g = 26,000 + 2,600 = 28,600 kg estimados.
    // A balanca leu 28,600: a repartição tem de dar exatamente esses dois.
    await registrar(amb, { grupo: [3001, 3002], peso: '28,60', responsavel: 'Bernardo Farias' });

    const regs = registrosDoBanco(amb, volumeId);
    ok(regs.length === 2, 'os dois modelos entraram num registro so', String(regs.length));
    const porModelo = {};
    regs.forEach(r => { porModelo[r.modelo_id] = Number(r.peso_kg); });
    ok(porModelo[3001] === 26 && porModelo[3002] === 2.6,
       'e o peso foi repartido na proporcao do estimado', JSON.stringify(porModelo));
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 28.6,
       'a soma fecha com o que a balanca leu', String(amb.banco._volumesDoBanco[0].peso_kg));
}

async function pesarUmAUmDaUmCampoPorModelo() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { grupo: [3001, 3002], porModelo: true,
                           pesos: { 3001: '25,80', 3002: '2,90' },
                           responsavel: 'Bernardo Farias' });

    const porModelo = {};
    registrosDoBanco(amb, volumeId).forEach(r => { porModelo[r.modelo_id] = Number(r.peso_kg); });
    ok(porModelo[3001] === 25.8 && porModelo[3002] === 2.9,
       'cada modelo com o peso que ele mesmo marcou', JSON.stringify(porModelo));
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 28.7,
       'e o volume soma os dois', String(amb.banco._volumesDoBanco[0].peso_kg));
}

async function aReparticaoDoPesoEPura() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    const r = amb.painel._regras;
    const modelos = amb.janela.state.osItens['os-200'];

    const duas = r.repartirPeso([{ modeloId: 3001, qtd: 5000 }, { modeloId: 3002, qtd: 500 }], 28.6, modelos);
    ok(duas[0] === 26 && duas[1] === 2.6, 'reparte pelo peso estimado', JSON.stringify(duas));
    ok(Math.round((duas[0] + duas[1]) * 1000) === 28600,
       'e a soma e exatamente o peso lido -- a sobra vai para a ultima linha');

    // Um peso que nao divide redondo: a soma continua fechando.
    const feias = r.repartirPeso([{ modeloId: 3001, qtd: 1 }, { modeloId: 3001, qtd: 1 },
                                  { modeloId: 3001, qtd: 1 }], 1, modelos);
    ok(Math.round(feias.reduce((s, p) => s + p, 0) * 1000) === 1000,
       'mesmo com tres partes de um terco', JSON.stringify(feias));

    // Sem base no ERP, cai para a proporcao da quantidade.
    const semBase = r.repartirPeso([{ modeloId: 3004, qtd: 30 }, { modeloId: 3004, qtd: 70 }], 10, modelos);
    ok(semBase[0] === 3 && semBase[1] === 7, 'sem peso no ERP, reparte pela quantidade',
       JSON.stringify(semBase));

    ok(JSON.stringify(r.repartirPeso([], 10, modelos)) === '[]', 'lista vazia devolve vazio');
}

// ─── 5. A escolha, sem modo ─────────────────────────────────────────────────

async function asCaixasDeMarcarNaoTemModo() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    const html = telaDoPedido(amb);

    ok(html.indexOf('marcarModelo(&#39;3001&#39;)') !== -1
       || html.indexOf("marcarModelo('3001')") !== -1,
       'a caixa de marcar existe SEM nenhum modo ligado');
    ok(html.indexOf('Escolha o que vai neste volume') === -1,
       'e nao ha faixa de modo anunciando nada');
    ok(amb.elementos['acab-barra-escolha'].innerHTML === '',
       'a barra so aparece quando ha algo marcado');

    amb.painel.marcarModelo(3001);
    ok(amb.elementos['acab-barra-escolha'].innerHTML.indexOf('1 modelo marcado') !== -1,
       'a barra conta o que foi marcado');
    const comUm = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(comUm.indexOf('Um volume não mistura setores') !== -1,
       'e so entao o modelo de outro setor deixa de ser marcavel, dizendo por que');

    amb.painel.marcarModelo(3002);
    ok(amb.elementos['acab-barra-escolha'].innerHTML.indexOf('2 modelos marcados') !== -1,
       'dois marcados');
    ok(amb.painel._regras.setorDaEscolha() === 'LASER', 'o setor sai do primeiro marcado');

    amb.painel.cancelarVolume();
    ok(amb.elementos['acab-barra-escolha'].innerHTML === '', 'Desmarcar limpa tudo');
}

async function oVolumeNaoAtravessaSetor() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    amb.painel.marcarModelo(3001);
    amb.painel.marcarModelo(3003);   // PVC
    ok(!amb.painel._regras.marcadoNaEscolha({ id: 3003 }),
       'o modelo de outro setor nao entra na escolha');

    const itens = amb.janela.state.osItens['os-200'];
    ok(amb.painel._regras.marcavelNaEscolha(itens[2]) === false,
       'e a tela sabe dizer que ele nao e marcavel');
}

// ─── 6. O volume por dentro ─────────────────────────────────────────────────

async function oVolumeMostraOsRegistrosNaOrdem() {
    const amb = ambienteDeVolumesComPeso();
    const janelas = capturarJanelas(amb);
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });
    await registrar(amb, { um: 3002, peso: '2,60', responsavel: 'Cesar Almeida' });

    amb.painel.abrirVolume(volumeId);
    const caixa = janelas.achar('acab-volume-janela');
    ok(!!caixa, 'a janela do volume abriu');
    const html = caixa ? caixa.innerHTML : '';

    ok(html.indexOf('Volume 1') !== -1, 'o volume aparece pelo numero');
    ok(html.indexOf('Credencial VIP') !== -1 && html.indexOf('Credencial Staff') !== -1,
       'com os modelos que estao dentro dele');
    ok(html.indexOf('5.000 un') !== -1, 'cada um com a sua quantidade');
    ok(html.indexOf('26,000 kg') !== -1 && html.indexOf('2,600 kg') !== -1,
       'e cada um com o SEU peso');
    ok(html.indexOf('28,600') !== -1, 'o total e a soma deles');
    ok(html.indexOf('somados dos 2 registros') !== -1, 'e a tela diz de onde ele vem');
    ok(html.indexOf('não tem peso próprio') !== -1,
       'dizendo que o volume nao vai a balanca');
    ok(html.indexOf('Soma dos volumes') === -1 && html.indexOf('Peso do setor') === -1,
       'a conferencia soma x setor sumiu -- os dois numeros passaram a ser o mesmo');
}

async function tirarDoVolumeDevolveOModelo() {
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });
    await registrar(amb, { um: 3002, peso: '2,60', responsavel: 'Cesar Almeida' });
    const alvo = registrosDoBanco(amb, volumeId).find(r => Number(r.modelo_id) === 3001);

    // O card ja esta Pronto: e isso que o Tirar tem de desfazer.
    const itens = amb.janela.state.osItens['os-200'];
    ok(itens[0].acabamento_status === 'Pronto', 'o modelo estava Pronto');

    await amb.painel.tirarDoVolume(volumeId, alvo.id);

    ok(registrosDoBanco(amb, volumeId).length === 1, 'o registro saiu do volume');
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 2.6,
       'e o peso dele saiu da soma', String(amb.banco._volumesDoBanco[0].peso_kg));
    const status = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_status !== undefined
        && String(g.valor) === '3001');
    ok(status.length && !status[status.length - 1].payload.acabamento_status,
       'e o modelo deixou de estar revisado: a coluna foi LIMPA, e nao reescrita '
       + 'com um estagio que a tela nao oferece mais',
       JSON.stringify(status.map(g => g.payload.acabamento_status)));
}

async function oVolumeGanhaNome() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await amb.painel.renomearVolume(volumeId, '  Camarote  ');
    ok(amb.banco._volumesDoBanco[0].nome === 'Camarote', 'o nome e gravado sem os espacos',
       String(amb.banco._volumesDoBanco[0].nome));

    await amb.painel.renomearVolume(volumeId, '   ');
    ok(amb.banco._volumesDoBanco[0].nome === null,
       'e apagar grava NULO, e nao string vazia', String(amb.banco._volumesDoBanco[0].nome));
}

// ─── 7. O peso do setor, com volumes, e leitura ─────────────────────────────

async function comVolumesOPesoDoSetorEDeLeitura() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    const html = telaDoPedido(amb);
    ok(html.indexOf('input type="text" inputmode="decimal" id="acab-peso-LASER"') === -1,
       'o campo do peso do setor deixou de ser digitavel');
    ok(html.indexOf('data-somado="1"') !== -1, 'ele virou leitura');
    ok(html.indexOf('soma dos volumes') !== -1, 'e a tela diz de onde o numero vem');

    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 26,
       'a ficha do parceiro recebe a soma', String(amb.banco._setoresDoBanco[0].peso_real_kg));
    // O setor de OUTRO pedido -- o PVC, sem volume -- continua digitavel.
    ok(html.indexOf('id="acab-peso-PVC"') !== -1, 'o outro setor continua na tela');
}

async function osVolumesNaoTocamEmTabelaDoParceiro() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    const naFicha = amb.banco._pesosGravados;
    ok(naFicha.length >= 1, 'registrar atualiza o peso do setor na ficha', String(naFicha.length));
    const colunas = [];
    naFicha.forEach(g => Object.keys(g.payload || g.linha || {}).forEach(c => {
        if (colunas.indexOf(c) === -1) colunas.push(c);
    }));
    ok(colunas.sort().join(',') === 'peso_real_kg,updated_at',
       'e escreve NAQUELA ficha apenas peso e carimbo de hora', colunas.join(','));
    ok(amb.banco._propostasGravadas.length === 0, 'e nada em `propostas`');

    // A decisao do usuario em 23/08/2026, travada no codigo: nada de
    // `qtd_volumes` nem de `tipo_volume`. Os comentarios do arquivo CITAM as
    // duas colunas, para explicar por que elas nao sao escritas.
    const codigo = FONTE
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*)/.test(l))
        .join('\n');
    ok(codigo.indexOf('qtd_volumes') === -1, 'o CODIGO nao escreve qtd_volumes');
    ok(codigo.indexOf('tipo_volume') === -1, 'nem tipo_volume');
}

async function naEstacaoOVolumeGravaSemAgente() {
    const amb = ambienteDeVolumesComPeso();
    amb.banco._sessao = null;                  // estacao: sem sessao do Supabase
    const chamadas = [];
    amb.janela.fetch = (url) => { chamadas.push(url); return Promise.reject(new Error('nao deveria')); };
    await amb.painel.abrirPedido('os-200');

    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    ok(amb.banco._volumesDoBanco.length === 1, 'o volume foi gravado sem sessao nenhuma',
       String(amb.banco._volumesDoBanco.length));
    ok(registrosDoBanco(amb, amb.banco._volumesDoBanco[0].id).length === 1,
       'com o registro dentro dele');
    ok(chamadas.length === 0, 'e sem passar pelo agente -- a tabela e nossa',
       chamadas.join(' | '));
}

async function numeroRepetidoDizOQueFazer() {
    const amb = ambienteDeVolumes();
    const avisos = [];
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });
    await amb.painel.abrirPedido('os-200');
    // Outro operador criou o V1 enquanto este clicava.
    amb.banco._volumesDoBanco.push({ id: 'de-outro', id_int: 200, setor: 'LASER', numero: 1 });

    await amb.painel.novoVolume('LASER', 200);
    const aviso = avisos.map(a => a.texto).join(' | ');
    ok(/outro operador/i.test(aviso), 'a tela diz o que aconteceu', aviso);
    ok(/\+ Volume/.test(aviso), 'e o que fazer para sair -- a trava tem saida', aviso);
}

// ─── 8. A regua dos 5 % no registro ─────────────────────────────────────────

async function oRegistroForaDosCincoPorCentoPedeASenha() {
    const amb = ambienteDeVolumesComPeso();
    const janelas = capturarJanelas(amb);
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    // Estimado 26,000 kg; 28,000 e +7,7 %.
    await registrar(amb, { um: 3001, peso: '28,00', responsavel: 'Bernardo Farias' });

    ok(registrosDoBanco(amb, volumeId).length === 0, 'nada foi gravado');
    const p = amb.painel._tela.liberacaoPendente;
    ok(!!p && p.tipo === 'volume', 'o popup da senha esperou o operador');
    const caixa = janelas.achar('acab-liberacao');
    const html = caixa ? caixa.innerHTML : amb.elementos['acab-liberacao-corpo'].innerHTML;
    ok(html.indexOf('volume 1') !== -1, 'dizendo de qual volume se trata', html.slice(0, 200));

    // Cancelar devolve a janela com o que ja estava digitado.
    amb.painel.fecharPopupDaLiberacao();
    ok(!!amb.painel._tela.registroEmCurso, 'cancelar nao joga fora o registro montado');
    const erro = amb.documento.getElementById('acab-reg-erro').textContent;
    ok(/5 %/.test(erro), 'e a janela diz por que nao gravou', erro);
}

// ─── 9. A foto do volume ────────────────────────────────────────────────────

const FOTO_DO_VOLUME = 'https://x.supabase.co/storage/v1/object/public/artes/'
    + 'acabamento-fotos/volume_200_LASER_1_9.jpg';

async function aJanelaDoRegistroOfereceFotografar() {
    const amb = ambienteDeVolumes();
    const janelas = capturarJanelas(amb);
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');

    const caixa = janelas.achar('acab-registro-janela');
    ok(!!caixa, 'a janela do registro abriu');
    const html = caixa ? caixa.innerHTML : '';
    const quantos = (html.match(/fotografarVolume\(\)/g) || []).length;
    ok(quantos === 1, 'ela oferece UM botao de foto, para o volume inteiro', String(quantos));
    ok(html.indexOf('Foto do volume') !== -1, 'e diz que a foto e do volume');
}

async function aFotoDoVolumeSobeAoStorageEEsperaOGravar() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await amb.painel.mudarEstagio(3001, 'os-200', 'Pronto');

    const r = amb.painel._regras;
    r.camera.blob = { size: 10, type: 'image/jpeg' };
    r.camera.alvo = 'volume';
    await r.salvarFoto();

    ok(amb.banco._arquivosSubidos.length === 1, 'a foto subiu ao Storage',
       String(amb.banco._arquivosSubidos.length));
    const caminho = String(amb.banco._arquivosSubidos[0].caminho);
    ok(caminho.indexOf('acabamento-fotos/volume_200_LASER_1_') === 0,
       'com o nome do volume', caminho);
    ok(amb.banco._arquivosSubidos[0].bucket === 'artes', 'no bucket de sempre');
    ok(!amb.banco._volumesDoBanco[0].foto_url,
       'e o banco AINDA nao tem a foto -- quem grava e o Gravar');

    amb.documento.getElementById('acab-reg-qtd-0').value = '5000';
    amb.documento.getElementById('acab-reg-peso').value = '26,00';
    amb.documento.getElementById('acab-reg-responsavel').value = 'Bernardo Farias';
    await amb.painel.confirmarRegistro();
    ok(!!amb.banco._volumesDoBanco[0].foto_url, 'gravar leva a foto junto');
}

async function aFotoDoVolumeApareceNosModelosDele() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { grupo: [3001, 3002], peso: '12,48',
                           responsavel: 'Bernardo Farias', foto: FOTO_DO_VOLUME });

    const html = telaDoPedido(amb);
    const quantas = (html.match(new RegExp(FOTO_DO_VOLUME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    ok(quantas >= 2, 'os dois modelos do volume passam a mostrar a foto dele', String(quantas));
    ok(html.indexOf('Foto do volume V1') !== -1, 'e o card diz de qual volume ela e');
}

async function aFotoPropriaDoModeloVemPrimeiro() {
    const amb = ambienteDeVolumes();
    amb.janela.state.osItens['os-200'][0].acabamento_foto_url = 'https://x/propria.jpg';
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { grupo: [3001, 3002], peso: '12,48',
                           responsavel: 'Bernardo Farias', foto: FOTO_DO_VOLUME });

    const html = telaDoPedido(amb);
    ok(html.indexOf('https://x/propria.jpg') !== -1,
       'o modelo com foto propria continua mostrando a DELE');
    ok(html.indexOf('📷 Refazer') !== -1, 'e o botao dele diz Refazer');
}

async function aFotoDoModeloContinuaIndoParaOCardDele() {
    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    const r = amb.painel._regras;
    r.camera.blob = { size: 10, type: 'image/jpeg' };
    r.camera.alvo = 'modelo';
    r.camera.itemId = 3001;
    r.camera.osId = 'os-200';
    await r.salvarFoto();

    const gravou = amb.banco._gravacoes.filter(g => g.payload && g.payload.acabamento_foto_url);
    ok(gravou.length === 1, 'a foto do modelo continua indo para a coluna dele',
       String(gravou.length));
    ok(String(gravou[0].valor) === '3001', 'no modelo certo', String(gravou[0].valor));
    ok(String((amb.banco._arquivosSubidos[0] || {}).caminho).indexOf('acabamento-fotos/200_3001_') === 0,
       'e com o nome de sempre', String((amb.banco._arquivosSubidos[0] || {}).caminho));
    ok(amb.banco._volumesDoBanco.length === 0, 'sem tocar em volume nenhum');
}

// ─── 10. O vocabulario ──────────────────────────────────────────────────────

async function soExisteVolumeNoVocabulario() {
    // Os comentarios CITAM as palavras removidas, para explicar por que elas
    // sairam. O que a regra proibe e o que chega a tela.
    const codigo = FONTE
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*)/.test(l))
        .join('\n');

    ok(codigo.indexOf('TIPOS_DE_VOLUME') === -1, 'o seletor de tipo do volume sumiu');
    ok(codigo.indexOf("'Fardo'") === -1 && codigo.indexOf("'Palete'") === -1,
       'e com ele Fardo e Palete');
    ok(!/[Pp]acote/.test(codigo), 'a palavra "pacote" nao aparece mais no codigo');
    ok(!/acab-vol-tipo|acab-vol-pacotes|acab-vol-obs/.test(codigo),
       'nem os campos que so existiam para eles');

    const amb = ambienteDeVolumes();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const html = telaDoPedido(amb);
    // Comentario de marcacao nao e vocabulario da tela: o `<!-- ... -->` do
    // card explica uma decisao de layout de 22/08/2026 e ninguem o le na
    // estacao. O que conta e o que fica visivel.
    const visivel = html.replace(/<!--[\s\S]*?-->/g, ' ');
    const achados = visivel.match(/[Cc]aixa|[Pp]acote|[Ff]ardo|[Rr]olo/g) || [];
    ok(achados.length === 0, 'e a tela do pedido so fala em volume',
       JSON.stringify(achados.slice(0, 6)) + ' | '
       + achados.slice(0, 2).map(a => visivel.slice(Math.max(0, visivel.indexOf(a) - 70),
                                                    visivel.indexOf(a) + 40)).join(' /// '));
}

// ─── 11. As contas, puras ───────────────────────────────────────────────────

async function asContasDosVolumesSaoPuras() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    const r = amb.painel._regras;

    // O peso do volume e a soma dos registros...
    ok(r.pesoDosRegistros([{ peso: 0.1 }, { peso: 0.2 }], null) === 0.3,
       'a soma e feita em gramas inteiras -- nada de 0,30000000000000004');
    ok(r.pesoDosRegistros([{ peso: 4 }, { peso: null }], null) === 4,
       'registro sem peso conta como zero');
    // ...e o `peso_kg` gravado so vale enquanto NENHUM registro tem peso: e a
    // saida para o volume anterior a 29/08/2026.
    ok(r.pesoDosRegistros([{ peso: null }], 9.5) === 9.5, 'volume velho vale pelo peso gravado');
    ok(r.pesoDosRegistros([{ peso: 4 }], 9.5) === 4, 'assim que ha registro com peso, manda a soma');
    ok(r.pesoDosRegistros([], null) === null, 'volume vazio e sem peso nenhum devolve null');

    const volumes = r.agruparVolumes([
        { id: 'v1', setor: 'LASER', numero: 1, peso_kg: 3,
          producao_volume_itens: [
              { id: 'b', modelo_id: 3001, qtd: 100, peso_kg: 2, registrado_em: '2026-08-29T12:00:00Z' },
              { id: 'a', modelo_id: 3002, qtd: 50, peso_kg: 1, registrado_em: '2026-08-29T10:00:00Z' },
          ] },
        { id: 'v2', setor: 'NAOEXISTE', numero: 1 },
    ]);
    ok(Object.keys(volumes).join(',') === 'LASER', 'setor que o banco nao aceita fica de fora');
    ok(volumes.LASER[0].registros.map(i => i.id).join(',') === 'a,b',
       'e os registros saem na ordem em que entraram',
       volumes.LASER[0].registros.map(i => i.id).join(','));
    ok(volumes.LASER[0].peso === 3, 'o peso do volume e a soma deles');

    ok(r.somaDosVolumes([{ peso: 0.1 }, { peso: 0.2 }]) === 0.3, 'a soma dos volumes tambem');
    ok(r.faltaEmbalar({ id: 1, qtd: 100 }, { 1: 140 }) === 0,
       'embalado alem da tiragem nao devolve negativo');
    ok(r.proximoNumeroDeVolume([{ numero: 1 }, { numero: 3 }]) === 4,
       'buraco de numero nao se reaproveita');

    const modelos = amb.janela.state.osItens['os-200'];
    const est = r.estimadoDoVolume([{ modeloId: 3001, qtd: 2000 }], modelos);
    ok(est.kg === 10.4 && est.semBase === 0, 'o esperado e quantidade x peso da peca');
    const misto = r.estimadoDoVolume([{ modeloId: 3001, qtd: 2000 }, { modeloId: 3004, qtd: 100 }], modelos);
    ok(misto.kg === 10.4 && misto.semBase === 1, 'modelo sem base fica de fora, e e contado');
    ok(r.estimadoDoVolume([{ modeloId: 3004, qtd: 100 }], modelos).kg === null,
       'sem base nenhuma o resultado e null, e nao zero');

    // A regua e a MESMA do setor -- e a mesma funcao.
    ok(r.precisaDeLiberacao(10.92, 10.4) === false, '5 % exatos ainda passam');
    ok(r.precisaDeLiberacao(10.93, 10.4) === true, 'acima disso pede a senha');
}

async function quemAssinaOModeloSaiDosRegistros() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    const r = amb.painel._regras;
    const item = amb.janela.state.osItens['os-200'][0];   // 3001, tiragem 5000

    const umSo = [{ setor: 'LASER', registros: [{ modeloId: '3001', qtd: 5000, responsavel: 'Ana' }] }];
    ok(JSON.stringify(r.responsavelPelosRegistros(item, umSo)) === '{"nome":"Ana","varios":false}',
       'uma pessoa so assina com o proprio nome');

    const duas = [{ setor: 'LASER', registros: [{ modeloId: '3001', qtd: 2000, responsavel: 'Ana' }] },
                  { setor: 'LASER', registros: [{ modeloId: '3001', qtd: 3000, responsavel: 'Beto' }] }];
    const quem = r.responsavelPelosRegistros(item, duas);
    ok(quem && quem.varios === true && quem.nome === 'Laser',
       'mais de uma assina com o nome do setor', JSON.stringify(quem));

    const meio = [{ setor: 'LASER', registros: [{ modeloId: '3001', qtd: 2000, responsavel: 'Ana' }] }];
    ok(r.responsavelPelosRegistros(item, meio) === null,
       'modelo pela metade nao fecha');

    const anonimo = [{ setor: 'LASER', registros: [{ modeloId: '3001', qtd: 5000, responsavel: '' }] }];
    ok(r.responsavelPelosRegistros(item, anonimo) === null,
       'e registro sem dono nenhum nao carimba ninguem');
}

// ─── 12. O modelo PRONTO ja esta alocado (29/08/2026) ───────────────────────
//
// Regra do usuario, olhando a tela publicada:
//
//   "pedidos marcados prontos, ja estao alocados a um volume, nao podem
//    oferecer opcao de serem adicionados a outros volumes, precisam sair do
//    status de pronto para liberar o checkbox, e ao sair de pronto sai do
//    volume e atualiza peso do volume. modelos marcados prontos vao para final
//    da lista"
//
// E, logo depois: "ao excluir modelos de um volume, peso do volume deve
// atualizar".

async function prontoNaoOfereceCaixaDeMarcar() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    const itens = amb.janela.state.osItens['os-200'];
    ok(itens[0].acabamento_status === 'Pronto', 'o modelo ficou Pronto ao entrar inteiro');
    ok(amb.painel._regras.marcavelNaEscolha(itens[0]) === false,
       'e deixou de ser marcavel -- ele ja esta alocado');
    ok(amb.painel._regras.marcavelNaEscolha(itens[1]) === true,
       'enquanto o que nao esta pronto continua marcavel');

    // E o clique nao passa nem por fora da tela.
    amb.painel.marcarModelo(3001);
    ok(!amb.painel._regras.marcadoNaEscolha(itens[0]),
       'marcar um Pronto pelo console tambem nao faz nada');

    const html = telaDoPedido(amb);
    ok(html.indexOf('Este modelo está REVISADO.') !== -1,
       'a caixa travada diz por que esta travada');
    ok(html.indexOf('tire-o de Revisado') !== -1,
       'e diz o que fazer para sair dela -- toda trava daqui tem saida');
    ok(html.indexOf('Ele está no volume V1.') !== -1,
       'dizendo tambem em qual volume ele esta');
}

async function sairDeProntoTiraDoVolumeEAtualizaOPeso() {
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;

    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });
    await registrar(amb, { um: 3002, peso: '2,60', responsavel: 'Cesar Almeida' });
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 28.6, 'o volume somava os dois');

    await amb.painel.mudarEstagio(3001, 'os-200', 'Em acabamento');

    const dentro = registrosDoBanco(amb, volumeId);
    ok(dentro.length === 1 && Number(dentro[0].modelo_id) === 3002,
       'sair de Pronto tirou o modelo do volume', JSON.stringify(dentro.map(r => r.modelo_id)));
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 2.6,
       'e o peso do volume acompanhou', String(amb.banco._volumesDoBanco[0].peso_kg));
    ok(amb.painel._regras.volumesDoSetor('LASER')[0].peso === 2.6,
       'a tela le a soma nova');

    const status = amb.banco._gravacoes.filter(g => g.payload
        && g.payload.acabamento_status !== undefined && String(g.valor) === '3001');
    ok(status.length && status[status.length - 1].payload.acabamento_status === 'Em acabamento',
       'e o estagio mudou', JSON.stringify(status.map(g => g.payload.acabamento_status)));

    // O peso do setor tambem: ele e a soma dos volumes.
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 2.6,
       'o peso do setor encolheu junto', String(amb.banco._setoresDoBanco[0].peso_real_kg));

    // E a caixa de marcar voltou.
    const itens = amb.janela.state.osItens['os-200'];
    ok(amb.painel._regras.marcavelNaEscolha(itens[0]) === true,
       'sair de Pronto liberou o checkbox de novo');
}

async function oModeloRepartidoSaiDeTodosOsVolumes() {
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const v1 = amb.banco._volumesDoBanco[0].id;
    await registrar(amb, { um: 3001, qtds: { 3001: '2000' }, peso: '10,40',
                           responsavel: 'Bernardo Farias' });
    await amb.painel.novoVolume('LASER', 200);
    const v2 = amb.banco._volumesDoBanco[1].id;
    await registrar(amb, { um: 3001, volumeId: v2, qtds: { 3001: '3000' }, peso: '15,60',
                           responsavel: 'Cesar Almeida' });

    await amb.painel.mudarEstagio(3001, 'os-200', 'Impresso');

    ok(registrosDoBanco(amb, v1).length === 0 && registrosDoBanco(amb, v2).length === 0,
       'o modelo repartido sai dos DOIS volumes');
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 0
       && Number(amb.banco._volumesDoBanco[1].peso_kg) === 0,
       'e os dois pesos zeram',
       amb.banco._volumesDoBanco.map(v => v.peso_kg).join(' / '));
    ok(!Number(amb.banco._setoresDoBanco[0].peso_real_kg),
       'com todos os volumes vazios, o peso do setor tambem se apaga',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));
}

async function cancelarASaidaDeProntoNaoMudaNada() {
    const amb = ambienteDeVolumesComPeso();
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    amb.janela.confirm = () => false;
    const antes = amb.banco._gravacoes.length;
    await amb.painel.mudarEstagio(3001, 'os-200', 'Em acabamento');

    ok(registrosDoBanco(amb, volumeId).length === 1, 'cancelar deixa o registro no volume');
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 26, 'e o peso do volume onde estava');
    ok(amb.banco._gravacoes.length === antes,
       'e o estagio NAO muda -- senao o modelo sairia de Pronto continuando dentro do volume');
    ok(amb.janela.state.osItens['os-200'][0].acabamento_status === 'Pronto',
       'o card continua Pronto');
}

async function tirarUmModeloAtualizaOPesoDoVolume() {
    // "ao excluir modelos de um volume, peso do volume deve atualizar" --
    // agora pelo botao Tirar da janela do volume, que e o outro caminho.
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;
    await registrar(amb, { grupo: [3001, 3002], peso: '28,60', responsavel: 'Bernardo Farias' });

    const alvo = registrosDoBanco(amb, volumeId).find(r => Number(r.modelo_id) === 3002);
    await amb.painel.tirarDoVolume(volumeId, alvo.id);

    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 26,
       'tirar um modelo desconta o peso dele do volume',
       String(amb.banco._volumesDoBanco[0].peso_kg));
    ok(amb.painel._regras.volumesDoSetor('LASER')[0].peso === 26, 'e a tela mostra a soma nova');
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 26,
       'o peso do setor tambem', String(amb.banco._setoresDoBanco[0].peso_real_kg));
}

async function oPesoDoVolumeVelhoNaoEChutado() {
    // Volume anterior a 29/08/2026: o peso morava no volume, e os registros nao
    // tinham peso nenhum. Subtrair partiria do numero errado -- por isso o
    // espelho e RECALCULADO do que sobrou.
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    amb.banco._volumesDoBanco = [{ id: 'velho', id_int: 200, setor: 'LASER', numero: 1, peso_kg: 9.5 }];
    amb.banco._itensDeVolume = [
        { id: 'r-velho-1', volume_id: 'velho', modelo_id: 3001, qtd: 5000, peso_kg: null },
        { id: 'r-velho-2', volume_id: 'velho', modelo_id: 3002, qtd: 500, peso_kg: null },
    ];
    await amb.painel.abrirPedido('os-200');

    ok(amb.painel._regras.volumesDoSetor('LASER')[0].peso === 9.5,
       'sem peso por registro, vale o que a balanca leu na epoca');

    await amb.painel.tirarDoVolume('velho', 'r-velho-1');
    ok(Number(amb.banco._volumesDoBanco[0].peso_kg) === 0,
       'tirado o registro, o espelho vem do que sobrou -- e o que sobrou nao tem peso',
       String(amb.banco._volumesDoBanco[0].peso_kg));
}

async function excluirOUltimoVolumeApagaOPesoDoSetor() {
    // O que o usuario viu no pedido 21074 em 29/08/2026: excluidos os volumes,
    // o campo do peso do setor continuava marcando a soma que nao existia mais.
    //
    // A trava que protege o peso digitado a mao ("setor sem volume nao tem o
    // que copiar") estava pegando tambem o setor que ACABOU de perder o ultimo
    // volume -- e os dois estados sao identicos depois do fato. Quem sabe a
    // diferenca e quem excluiu.
    const amb = ambienteDeVolumesComPeso();
    amb.janela.confirm = () => true;
    await amb.painel.abrirPedido('os-200');
    await amb.painel.novoVolume('LASER', 200);
    const volumeId = amb.banco._volumesDoBanco[0].id;
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });
    ok(Number(amb.banco._setoresDoBanco[0].peso_real_kg) === 26,
       'o peso do setor era a soma do volume');

    await amb.painel.excluirVolume(volumeId);

    ok(amb.banco._volumesDoBanco.length === 0, 'o volume saiu');
    ok(!amb.banco._setoresDoBanco[0].peso_real_kg,
       'e o peso do setor foi apagado junto -- nao ha mais soma que o sustente',
       String(amb.banco._setoresDoBanco[0].peso_real_kg));

    const html = telaDoPedido(amb);
    ok(html.indexOf('input type="text" inputmode="decimal" id="acab-peso-LASER"') !== -1,
       'e o campo volta a ser digitavel -- o pedido voltou ao fluxo de sempre');
    ok(html.indexOf('data-somado') === -1, 'sem o rotulo de leitura');
    ok(html.indexOf('1 volume único') !== -1 && html.indexOf('de 26,000 kg') === -1,
       'e a faixa nao anuncia mais um peso que nao existe');
}

async function osProntosVaoParaOFimDaLista() {
    const amb = ambienteDeVolumesComPeso();
    const r = amb.painel._regras;

    const ordenado = r.ordenarProntosNoFim([
        { id: 1, acabamento_status: 'Pronto' },
        { id: 2, acabamento_status: 'Em acabamento' },
        { id: 3, acabamento_status: 'Pronto' },
        { id: 4, acabamento_status: 'Impresso' },
    ]);
    ok(ordenado.map(i => i.id).join(',') === '2,4,1,3',
       'os prontos vao para o fim, e o resto fica na ordem em que estava',
       ordenado.map(i => i.id).join(','));
    ok(JSON.stringify(r.ordenarProntosNoFim([])) === '[]', 'lista vazia nao quebra');

    // E na tela: o 3001 fica Pronto e desce para baixo do 3002.
    await amb.painel.abrirPedido('os-200');
    const antes = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(antes.indexOf('Credencial VIP') < antes.indexOf('Credencial Staff'),
       'antes, o primeiro do pedido vem primeiro');

    await amb.painel.novoVolume('LASER', 200);
    await registrar(amb, { um: 3001, peso: '26,00', responsavel: 'Bernardo Farias' });

    const depois = amb.elementos['acab-detalhe-corpo'].innerHTML;
    ok(depois.indexOf('Credencial VIP') > depois.indexOf('Credencial Staff'),
       'depois de Pronto, ele desce para o fim da lista do produto');
}

(async function () {
    await pedidoSemVolumeSegueOFluxoDeSempre();
    await criarVolumeVazioLigaATravaDoPronto();
    await excluirOUltimoVolumeDevolveOFluxoDeSempre();

    await oRegistroGravaQuantidadeEPeso();
    await oVolumeJaCriadoRecebeMaisModelos();
    await registroParcialNaoFechaOModelo();
    await oMesmoModeloCabeEmVariosVolumes();

    await oGrupoRepartePesoNaProporcaoDoEstimado();
    await pesarUmAUmDaUmCampoPorModelo();
    await aReparticaoDoPesoEPura();

    await asCaixasDeMarcarNaoTemModo();
    await oVolumeNaoAtravessaSetor();

    await oVolumeMostraOsRegistrosNaOrdem();
    await tirarDoVolumeDevolveOModelo();
    await oVolumeGanhaNome();

    await comVolumesOPesoDoSetorEDeLeitura();
    await osVolumesNaoTocamEmTabelaDoParceiro();
    await naEstacaoOVolumeGravaSemAgente();
    await numeroRepetidoDizOQueFazer();

    await oRegistroForaDosCincoPorCentoPedeASenha();

    await aJanelaDoRegistroOfereceFotografar();
    await aFotoDoVolumeSobeAoStorageEEsperaOGravar();
    await aFotoDoVolumeApareceNosModelosDele();
    await aFotoPropriaDoModeloVemPrimeiro();
    await aFotoDoModeloContinuaIndoParaOCardDele();

    await soExisteVolumeNoVocabulario();
    await asContasDosVolumesSaoPuras();
    await quemAssinaOModeloSaiDosRegistros();

    // O modelo PRONTO ja esta alocado (29/08/2026)
    await prontoNaoOfereceCaixaDeMarcar();
    await sairDeProntoTiraDoVolumeEAtualizaOPeso();
    await oModeloRepartidoSaiDeTodosOsVolumes();
    await cancelarASaidaDeProntoNaoMudaNada();
    await tirarUmModeloAtualizaOPesoDoVolume();
    await oPesoDoVolumeVelhoNaoEChutado();
    await excluirOUltimoVolumeApagaOPesoDoSetor();
    await osProntosVaoParaOFimDaLista();
})();

// ═══════════════════════════════════════════════════════════════════════════
//  O PEDIDO EXPEDIDO CONTINUA NA LISTA, EM "PRONTO"
// ═══════════════════════════════════════════════════════════════════════════
//
// Pedido do usuario em 23/08/2026, olhando o 21030:
//
//   "No Painel de acabamento, na edicao do pedido, ao clicar e envialo para a
//    Expedicao, ele deve ir para a lista de 'PRONTO'"
//
// Ate aqui o pedido SUMIA no instante em que era enviado: o `status_interno`
// virava EXPEDICAO, que o `ehDeProducao` nao aceita, e o operador ficava sem o
// comprovante do proprio trabalho -- clicava, a tela voltava para a lista, e o
// pedido nao estava em lugar nenhum.
//
// O que estes testes travam:
//   1. o pedido expedido aparece na LISTA, com o selo PRONTO e a marca propria;
//   2. e aparece sob o filtro "Pronto", nao sob "Em acabamento";
//   3. as METRICAS nao o contam -- ele nao e mais trabalho na fila;
//   4. aberto, o botao EXPEDICAO vira comprovante e nao oferece enviar de novo;
//   5. e mandar para a expedicao nao o faz sumir.

/**
 * Um pedido com os dois modelos PRONTOS e o `status_interno` a escolher.
 *
 * Os modelos entram nos dois lugares de proposito: em `modelosGlobais`, que e
 * o que a TABELA le, e em `osItens`, que e o que o DETALHE le. Sem o primeiro a
 * lista mostraria "Aguardando" num pedido que ja acabou.
 */
function ambienteDeExpedicao(status) {
    const prontos = [
        { id: 3001, quantidade: 500, setor: 'PVC', status_impressao: 'Impresso',
          acabamento_status: 'Pronto', acabamento_responsavel: 'Ana Paula' },
        { id: 3002, quantidade: 200, setor: 'PVC', status_impressao: 'Impresso',
          acabamento_status: 'Pronto', acabamento_responsavel: 'Ana Paula' },
    ];
    const amb = ambienteComPedidoAberto();
    amb.janela.state.ordens[0].status_interno = status;
    amb.janela.state.modelosGlobais[200] = prontos;
    amb.janela.state.osItens['os-200'].forEach(i => {
        i.setor = 'PVC';
        i.acabamento_status = 'Pronto';
        i.acabamento_responsavel = 'Ana Paula';
    });
    return amb;
}

/**
 * A tabela desenhada, sem passar pela rede.
 *
 * `recorte` e o botao de prazo. A "lista de PRONTO" do pedido do usuario e o
 * `prontos`: pedido com todos os modelos prontos sai das outras listas de
 * proposito -- ele nao e mais trabalho do dia -- e so aparece nesse botao.
 */
function listaDo(amb, recorte) {
    if (recorte) amb.painel.setFiltroPrazo(recorte);
    else amb.painel.render();
    return amb.elementos['tbody-acabamento'].innerHTML;
}

async function oPedidoExpedidoContinuaNaLista() {
    const amb = ambienteDeExpedicao('EXPEDICAO');
    const html = listaDo(amb, 'expedicao');
    ok(html.indexOf('>200<') !== -1, 'o pedido expedido continua na lista');
    ok(html.indexOf('NA EXPEDIÇÃO') !== -1,
       'com a marca que o distingue de um pedido ainda na bancada');

    // O selo do estagio e o de REVISADO, que e o que o usuario pediu.
    ok(html.indexOf('Revisado') !== -1, 'e com o selo REVISADO');
}

async function oExpedidoAparecerSobOFiltroPronto() {
    const amb = ambienteDeExpedicao('EXPEDICAO');

    ok(listaDo(amb, 'expedicao').indexOf('>200<') !== -1,
       'no botao PRONTO ele esta la -- foi exatamente isso que o usuario pediu');
    ok(listaDo(amb, 'geral').indexOf('>200<') === -1,
       'e no GERAL nao: pedido pronto sai da lista de trabalho, como sempre saiu');
    ok(listaDo(amb, 'hoje').indexOf('>200<') === -1, 'nem no PARA HOJE');

    // E no filtro de ESTAGIO, que e outro eixo, ele esta em Pronto.
    amb.painel.setFiltroPrazo('expedicao');
    amb.painel.setFiltroStatus('Pronto');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>200<') !== -1,
       'e o estagio dele e Pronto');
    amb.painel.setFiltroStatus('Em acabamento');
    ok(amb.elementos['tbody-acabamento'].innerHTML.indexOf('>200<') === -1,
       'nao Em acabamento: o trabalho dele terminou');
}

async function oExpedidoNaoContaComoFila() {
    const naFila = ambienteDeExpedicao('EM PRODUCAO');
    listaDo(naFila);
    const antes = naFila.elementos['stat-acab-pedidos-fila'].textContent;

    const expedido = ambienteDeExpedicao('EXPEDICAO');
    const html = listaDo(expedido, 'expedicao');
    const depois = expedido.elementos['stat-acab-pedidos-fila'].textContent;

    ok(String(antes) === '1', 'na producao, o pedido conta na fila', String(antes));
    ok(String(depois) === '0',
       'expedido, ele sai da conta da fila -- nao e mais trabalho a fazer', String(depois));
    ok(String(expedido.elementos['badge-acabamento'].textContent) === '0',
       'e o numero do menu tambem nao o conta',
       String(expedido.elementos['badge-acabamento'].textContent));

    // Mas continua na tabela: e essa a diferenca entre a metrica e a lista.
    ok(html.indexOf('>200<') !== -1, 'ainda assim ele esta na tabela');
}

async function oPedidoJaExpedidoNaoOferecerEnviarDeNovo() {
    const amb = ambienteDeExpedicao('EXPEDICAO');
    await amb.painel.abrirPedido('os-200');

    const html = telaDoPedido(amb);
    ok(html.indexOf('NA EXPEDIÇÃO') !== -1, 'o botao vira comprovante');
    ok(html.indexOf('já entregue') !== -1, 'dizendo que o pedido ja saiu');
    ok(html.indexOf('AcabamentoPainel.expedir(') === -1,
       'e nao ha mais o que clicar para enviar de novo');
}

async function mandarParaExpedicaoNaoFazOPedidoSumir() {
    const avisos = [];
    const amb = ambienteDeExpedicao('EM PRODUCAO');
    amb.janela.toast = (texto, tipo) => avisos.push({ texto, tipo });
    await amb.painel.abrirPedido('os-200');
    avisos.length = 0;

    await amb.painel.expedir('os-200');
    await amb.painel.confirmarExpedicao('os-200');

    ok(amb.janela.state.ordens[0].status_interno === 'EXPEDICAO', 'o status mudou');
    ok(listaDo(amb, 'expedicao').indexOf('NA EXPEDIÇÃO') !== -1,
       'e o pedido continua na tela, no botao EXPEDICAO, marcado como expedido');
    ok(avisos.some(a => /botão EXPEDIÇÃO/.test(a.texto)),
       'o aviso diz ONDE reencontra-lo',
       avisos.map(a => a.texto).join(' | '));
}

async function asContasDoRecorteDaListaSaoPuras() {
    const r = ambienteDeVolumes().painel._regras;

    ok(r.ehDeProducao({ status_interno: 'EM PRODUCAO' }), 'EM PRODUCAO e fila');
    ok(r.ehDeProducao({ status_interno: 'EM IMPRESSÃO' }), 'EM IMPRESSAO tambem, com acento');
    ok(!r.ehDeProducao({ status_interno: 'EXPEDICAO' }), 'EXPEDICAO nao e fila');

    ok(r.ehExpedido({ status_interno: 'EXPEDICAO' }), 'EXPEDICAO e expedido');
    ok(r.ehExpedido({ status_interno: 'expedicao' }), 'e a caixa da letra nao importa');
    ok(!r.ehExpedido({ status_interno: 'EM TRANSITO' }),
       'EM TRANSITO ja nao e: embarcado, o pedido sai desta tela sozinho');
    ok(!r.ehExpedido({ status_interno: 'ENTREGUE' }), 'ENTREGUE tambem nao');
    ok(!r.ehExpedido({}), 'pedido sem status nenhum nao e expedido');
}

// ── O estagio do expedido tem de vir do banco, como o dos outros ───────────
//
// Corrigido em 24/08/2026, com o usuario olhando a tela: "pedidos que ja
// estavam marcados como pronto voltaram para a lista inicial".
//
// O `ambienteDeExpedicao` acima planta `acabamento_status` DENTRO do
// `modelosGlobais` -- e por isso ele nao pegava o defeito. Em producao o
// `carregarModelosGlobais` do `script.js` nao pede essa coluna: o estagio da
// lista vem SEMPRE da consulta propria do acabamento. E essa consulta pedia so
// os pedidos da fila, deixando de fora justamente os que acabaram de ser
// enviados a expedicao.
//
// Sem estagio nenhum, o `estagioDoModelo` caia na derivacao da impressao e
// respondia "Impresso": o pedido voltava para a lista inicial e sumia do botao
// "Pronto", que e onde o aviso do envio manda o operador procura-lo.
async function oEstagioDoExpedidoVemDoBancoComoODosOutros() {
    const os = pedido(600, null, { status_interno: 'EXPEDICAO' });
    const amb = ambienteComPedidos([os], {
        // A lista ENXUTA, do jeito que o `script.js` a monta: sem
        // `acabamento_status`, so com o status de impressao.
        600: [{ id: 801, quantidade: 300, status_impressao: 'Impresso' },
              { id: 802, quantidade: 100, status_impressao: 'Impresso' }],
    });
    amb.banco._modelosDoBanco = [
        { id: 801, id_int: 600, acabamento_status: 'Pronto', acabamento_responsavel: 'Ana Paula' },
        { id: 802, id_int: 600, acabamento_status: 'Pronto', acabamento_responsavel: 'Ana Paula' },
    ];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));

    ok(amb.banco._perguntados.some(q => q.valores.indexOf('600') !== -1),
       'a consulta do estagio pergunta pelo pedido ja expedido',
       JSON.stringify(amb.banco._perguntados));

    ok(listaDo(amb, 'geral').indexOf('>600<') === -1,
       'ele NAO volta para a lista inicial: o acabamento dele terminou');
    const naExpedicao = listaDo(amb, 'expedicao');
    ok(naExpedicao.indexOf('>600<') !== -1,
       'e aparece no botao PRONTO, que e onde o operador foi mandado procura-lo');
    ok(naExpedicao.indexOf('NA EXPEDIÇÃO') !== -1, 'com a marca de que ja saiu do setor');
}

// ── O recorte descobre o setor pelo PRODUTO DE ORIGEM ──────────────────────
//
// Este e o caminho de verdade, e o unico que a grafica exercita: a tabela e
// desenhada com `modelosGlobais`, e essa consulta NAO traz setor nenhum. Os
// testes acima poem `setor` na linha enxuta, que e generoso demais com o
// codigo -- em producao aquela chave nao existe.
//
// A cadeia real e `pedidos_modelos.id_produto_proposta_origem` ->
// `produtos_proposta.id` -> `produtos.setor_pcp`, e o ultimo salto ja esta em
// memoria: o `script.js` pre-carrega os produtos da proposta de TODOS os
// pedidos em `state.osItens`, com o setor resolvido.
//
// `pedidos_modelos.setor` existe no banco e seria o caminho obvio, mas estava
// preenchida em 105 das 355 linhas quando isto foi escrito. O
// `id_produto_proposta_origem` estava em 355 das 355.
async function oRecorteDescobreOSetorPeloProdutoDeOrigem() {
    const amb = ambienteComPedidos([pedido(705)], {
        // A lista ENXUTA, do jeito que o `script.js` a monta: sem setor.
        705: [{ id: 1001, quantidade: 100, status_impressao: 'Impresso' },
              { id: 1002, quantidade: 400, status_impressao: 'Impresso' }],
    });

    // O cache da proposta, que o `script.js` pre-carrega para todo pedido.
    amb.janela.state.osItens['os-705'] = [
        { id: 'vibe_item_31', _vibe_produto_id: 31, setor: 'LASER',  quantidade: 100 },
        { id: 'vibe_item_32', _vibe_produto_id: 32, setor: 'TEXTIL', quantidade: 400 },
    ];

    // E o banco, que amarra um ao outro.
    amb.banco._modelosDoBanco = [
        { id: 1001, id_int: 705, acabamento_status: 'Pronto', id_produto_proposta_origem: 31 },
        { id: 1002, id_int: 705, acabamento_status: '',       id_produto_proposta_origem: 32 },
    ];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));

    const html = () => { amb.painel.render(); return amb.elementos['tbody-acabamento'].innerHTML; };

    ok(html().indexOf('Em acabamento') !== -1,
       'sem recorte, o pedido inteiro esta em acabamento');

    amb.painel.setFiltroSetor('LASER');
    const comLaser = html();
    ok(comLaser.indexOf('>705<') !== -1,
       'o pedido entra no recorte de LASER mesmo sem setor na linha enxuta',
       comLaser.slice(0, 300));
    ok(comLaser.indexOf('1/1 mod.') !== -1,
       'e a linha conta so o modelo do LASER', comLaser.slice(0, 600));
    ok(comLaser.indexOf('Em acabamento') === -1 && comLaser.indexOf('Revisado') !== -1,
       'com o selo do LASER, que esta revisado');

    amb.painel.setFiltroSetor('LASER');    // apaga
    amb.painel.setFiltroSetor('PVC');
    ok(html().indexOf('>705<') === -1,
       'e fica fora do PVC, onde ele nao tem material nenhum');

    // A coluna tem de continuar sendo pedida: sem ela, o recorte da lista cega.
    ok(amb.banco._perguntados.some(q => q.tabela === 'pedidos_modelos'),
       'a consulta do estagio e a mesma que traz o produto de origem');
}

// ── E o pedido que chega DEPOIS do mapa tambem ganha estagio ───────────────
//
// A primeira abertura da tela: quando o mapa e montado, `state.ordens` ainda
// esta vazio -- o `loadOrdens` so responde depois. Sem completar o mapa quando
// a lista chega, TODO pedido pronto aparecia como "Impresso" ate o operador
// clicar em Atualizar.
async function oPedidoQueChegaDepoisGanhaEstagio() {
    const amb = montarAmbiente();
    amb.banco._modelosDoBanco = [
        { id: 700, id_int: 500, acabamento_status: 'Pronto', acabamento_responsavel: 'Ana Paula' },
    ];

    amb.painel.aoAbrir();               // com a lista ainda vazia
    await new Promise(r => setTimeout(r, 0));
    ok(amb.painel._regras.faltamEstagiosNaLista() === false,
       'com a lista vazia nao falta estagio nenhum');

    // Agora o `loadOrdens` respondeu, e o `script.js` redesenha.
    amb.janela.state.ordens = [pedido(500)];
    amb.janela.state.modelosGlobais[500] = [{ id: 700, quantidade: 10, status_impressao: 'Impresso' }];
    amb.janela.renderOrdens();
    await new Promise(r => setTimeout(r, 0));

    ok(listaDo(amb, 'geral').indexOf('>500<') !== -1,
       'o pedido que chegou depois esta na lista');
    ok(listaDo(amb, 'geral').indexOf('Revisado') !== -1,
       'com o estagio que veio do banco, e nao com o derivado da impressao');
    ok(amb.painel._regras.faltamEstagiosNaLista() === false,
       'e o mapa passa a cobrir a lista inteira');
}

// ── Banco sem a coluna nao vira laco de consulta ───────────────────────────
async function semAColunaNoBancoNaoFicaPerguntandoParaSempre() {
    const amb = montarAmbiente();
    amb.banco._erroDoBanco = { message: 'column pedidos_modelos.acabamento_status does not exist' };
    amb.janela.state.ordens = [pedido(510)];
    amb.janela.state.modelosGlobais[510] = [{ id: 710, quantidade: 10 }];

    amb.painel.aoAbrir();
    await new Promise(r => setTimeout(r, 0));
    const perguntas = amb.banco._perguntados.length;

    amb.janela.renderOrdens();
    amb.janela.renderOrdens();
    await new Promise(r => setTimeout(r, 0));

    ok(amb.banco._perguntados.length === perguntas,
       'depois do erro a tela para de perguntar -- o recado ao operador ja foi dado',
       perguntas + ' -> ' + amb.banco._perguntados.length);
    ok(listaDo(amb, 'geral').indexOf('>510<') !== -1, 'e a lista continua de pe');
}

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

    // O pedido expedido continua na lista, em PRONTO (23/08/2026)
    await oPedidoExpedidoContinuaNaLista();
    await oExpedidoAparecerSobOFiltroPronto();
    await oExpedidoNaoContaComoFila();
    await oPedidoJaExpedidoNaoOferecerEnviarDeNovo();
    await mandarParaExpedicaoNaoFazOPedidoSumir();
    await asContasDoRecorteDaListaSaoPuras();
    await oEstagioDoExpedidoVemDoBancoComoODosOutros();
    await oRecorteDescobreOSetorPeloProdutoDeOrigem();
    await oPedidoQueChegaDepoisGanhaEstagio();
    await semAColunaNoBancoNaoFicaPerguntandoParaSempre();
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

    // A balanca da estacao (24/08/2026)
    await oBotaoDaBalancaSoExisteNaEstacao();
    await aBalancaPreencheOPesoDoSetorEGravaPeloCaminhoDeSempre();
    await oPesoDaBalancaPassaPelaReguaDosCincoPorCento();
    await balancaMudaAbreACaixaQueDizOQueFazer();
    await oDiagnosticoMostraOQueCadaPortaRespondeu();
    aBalancaEstaNosTresCamposDePeso();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do Painel do Acabamento passaram.');
})();
