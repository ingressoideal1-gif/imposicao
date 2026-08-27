// Excluir uma numeracao diz em que PEDIDOS ela esta em uso, com a data de cada um.
//
// Pedido do usuario em 27/08/2026. Ate entao a pergunta era "Excluir esta
// numeracao?" e mais nada: o registro saia do `producao_numeracoes` e os
// modelos que apontavam para ele ficavam com um `amostra_num_id` que nao
// resolve mais — perdem numero, QR e codigo de barras, sem aviso. Quem
// descobre e o operador, no papel.
//
// Roda em node, sem navegador: `node tests/excluir_numeracao_em_uso_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui — nao copiadas.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrair(nome) {
    for (const abre of ['\nasync function ', '\nfunction ']) {
        const i = SCRIPT.indexOf(abre + nome + '(');
        if (i < 0) continue;
        const fim = SCRIPT.indexOf('\n}', i);
        if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
        return SCRIPT.slice(i, fim + 2);
    }
    throw new Error('nao achei a funcao ' + nome + ' no script.js');
}

const NOMES = ['modelosQueUsamNumeracao', 'pedidosQueUsamNumeracao',
    'linhaDoPedidoQueUsa', 'modeloEstaAprovado', 'formatDate'];

// `state` e `supabaseClient` entram como parametros: `typeof x` devolve
// "undefined" para uma variavel declarada que vale undefined, entao passar
// undefined exercita o caminho de memoria, e passar um dublê exercita o banco.
function montar(state, supabaseClient) {
    return new Function('state', 'supabaseClient', 'window',
        NOMES.map(extrair).join('\n') + '\nreturn { ' + NOMES.join(', ') + ' };'
    )(state, supabaseClient, {});
}

const so = (d) => String(d).split(' ')[0];

// ─── Agrupar por pedido ──────────────────────────────────────────────────────

const ORDENS = [
    { id: 'os-a', numero: 21202, cliente: 'Maikel De Souza Trotta', created_at: '2026-08-25T19:39:33Z' },
    { id: 'os-b', numero: 20508, cliente: 'Eduardo Santos De Farias', created_at: '2026-08-11T21:46:32Z' },
];

function estadoComTresModelos() {
    return {
        ordens: ORDENS.map(o => Object.assign({}, o)),
        osItens: {
            'os-a': [
                { id: '1000563', amostra_num_id: 'NUM', nome_modelo: 'Camarote' },
                { id: '1000564', amostra_num_id: 'NUM', nome_modelo: 'Pista' },
                { id: '1000565', amostra_num_id: 'OUTRA', nome_modelo: 'Backstage' },
            ],
            'os-b': [
                { id: '900001', numeracao_id: 'NUM', nome_modelo: 'Credencial' },
            ],
        },
        numeracoes: [{ id: 'NUM', name: 'CAMAROTE PATROCINADORES' }],
    };
}

// Tudo dentro de um IIFE async: as funcoes lidas do script.js sao `async`.
(async function () {

    // ── Um pedido com nove modelos vira UMA linha, e nao nove ────────────────
    {
        const api = montar(estadoComTresModelos(), undefined);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');

        ok(pedidos.length === 2, 'tres modelos em dois pedidos viram duas linhas', pedidos.map(p => p.numero));
        // Mais recente primeiro, que e a ordem da lista de pedidos do painel.
        ok(pedidos[0].numero === 21202 && pedidos[1].numero === 20508,
            'o pedido mais recente vem primeiro', pedidos.map(p => p.numero));
        ok(pedidos[0].modelos.length === 2, 'o pedido com dois modelos conta dois');
        ok(pedidos[1].modelos.length === 1, 'e o com um, um');
        ok(pedidos[0].cliente === 'Maikel De Souza Trotta', 'o cliente vem junto');

        // O modelo que usa OUTRA numeracao nao pode entrar na conta.
        const todos = pedidos.flatMap(p => p.modelos.map(m => m.id));
        ok(!todos.includes('1000565'), 'modelo de outra numeracao fica de fora', todos);
    }

    // ── Numeracao que ninguem usa ───────────────────────────────────────────
    {
        const api = montar(estadoComTresModelos(), undefined);
        ok((await api.pedidosQueUsamNumeracao('NINGUEM')).length === 0, 'sem uso, lista vazia');
        ok((await api.pedidosQueUsamNumeracao(null)).length === 0, 'e sem id, tambem');
    }

    // ── O espelho antigo continua valendo ───────────────────────────────────
    {
        // O modelo do 'os-b' aponta so pelo `numeracao_id`. E o item legado, de
        // antes de a coluna `amostra_num_id` ser preenchida: deixar de acha-lo
        // faria o aviso dizer que a numeracao esta livre quando nao esta.
        const api = montar(estadoComTresModelos(), undefined);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');
        ok(pedidos.some(p => p.numero === 20508), 'quem aponta so pelo espelho antigo tambem conta');
    }

    // ── A data ──────────────────────────────────────────────────────────────
    {
        const api = montar(estadoComTresModelos(), undefined);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');
        ok(so(api.formatDate(pedidos[0].data)) === '25/08/2026', 'a data sai do que o painel ja carregou',
            { data: pedidos[0].data, formatada: api.formatDate(pedidos[0].data) });
    }

    {
        // Pedido que o painel NAO carregou: a data vem do banco, de
        // `propostas.created_at`. Conferido em 27/08/2026 contra a producao —
        // `propostas` responde por todos os pedidos, enquanto `propostas_os`
        // (onde mora o `data_pedido`) tinha 40 linhas e deixaria a maioria dos
        // pedidos sem data nenhuma.
        const st = estadoComTresModelos();
        st.ordens = [];                       // o painel nunca carregou estes pedidos
        st.osItens = {};
        const pedidas = [];
        const supa = {
            from(tabela) {
                return {
                    select(cols) {
                        return {
                            // `pedidos_modelos`: quem usa a numeracao.
                            eq: () => ({ data: [
                                { id: 'm1', id_int: 21202, nome_modelo: 'Camarote' },
                                { id: 'm2', id_int: 21202, nome_modelo: 'Pista' },
                                { id: 'm3', id_int: 20508, nome_modelo: 'Credencial' },
                            ], error: null }),
                            // `propostas`: a data de cada pedido.
                            in: (col, ids) => {
                                pedidas.push({ tabela, cols, col, ids: [...ids].sort() });
                                return { data: [
                                    { id_int: 21202, created_at: '2026-08-25T19:39:33Z', cliente: 'Maikel De Souza Trotta' },
                                ], error: null };
                            },
                        };
                    },
                };
            },
        };
        const api = montar(st, supa);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');

        ok(pedidas.length === 1 && pedidas[0].tabela === 'propostas',
            'a data que falta e buscada em propostas', pedidas);
        ok(pedidas[0].cols.indexOf('created_at') >= 0, 'pela coluna created_at', pedidas[0].cols);
        ok(String(pedidas[0].ids) === '20508,21202', 'so os pedidos que faltam', pedidas[0].ids);

        const a = pedidos.find(p => p.numero === 21202);
        const b = pedidos.find(p => p.numero === 20508);
        ok(so(api.formatDate(a.data)) === '25/08/2026', 'o que o banco respondeu ganha data');
        ok(b.data === null, 'e o que ele nao respondeu fica sem data, em vez de ganhar uma inventada');
    }

    {
        // Recusa do banco nao cancela o aviso: saber QUE esta em uso ja muda a
        // decisao, mesmo sem a data.
        const st = estadoComTresModelos();
        // O painel achou os modelos (em memoria), mas nao tem a data — e o
        // banco recusa a consulta que a traria.
        st.ordens = ORDENS.map(o => ({ id: o.id, numero: o.numero }));
        const supa = { from: () => ({ select: () => ({
            eq: () => ({ data: null, error: { message: 'sem banco de modelos aqui' } }),
            in: () => { throw new Error('banco fora do ar'); },
        }) }) };
        const api = montar(st, supa);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');
        ok(pedidos.length === 2, 'banco fora do ar ainda lista os pedidos', pedidos.length);
        ok(pedidos.every(p => p.data === null), 'so que sem data');
    }

    // ── Modelo aprovado e apontado ──────────────────────────────────────────
    {
        const st = estadoComTresModelos();
        st.osItens['os-a'][0].amostra_status = 'APROVADA';
        const api = montar(st, undefined);
        const pedidos = await api.pedidosQueUsamNumeracao('NUM');
        ok(pedidos[0].aprovados === 1, 'o pedido com modelo aprovado conta um', pedidos[0].aprovados);
        ok(pedidos[1].aprovados === 0, 'e o sem, zero');
    }

    // ── A linha que o operador le ───────────────────────────────────────────
    {
        const api = montar(estadoComTresModelos(), undefined);
        const linha = api.linhaDoPedidoQueUsa({
            numero: 21202, data: '2026-08-25T19:39:33Z',
            cliente: 'Maikel De Souza Trotta', modelos: [{}, {}], aprovados: 0,
        });
        ok(/Pedido 21202/.test(linha), 'o numero do pedido aparece', linha);
        ok(/25\/08\/2026/.test(linha), 'e a data dele tambem', linha);
        // A HORA nao: a lista e para reconhecer o trabalho, e cada minuto a
        // mais e uma linha que nao cabe no dialogo.
        ok(!/\d{2}:\d{2}/.test(linha), 'sem a hora, que nao ajuda a reconhecer o pedido', linha);
        ok(/2 modelos/.test(linha), 'quantos modelos daquele pedido usam', linha);
        ok(/Maikel/.test(linha), 'e o cliente, para nao ter de abrir o pedido', linha);

        const um = api.linhaDoPedidoQueUsa({ numero: 1, data: null, modelos: [{}], aprovados: 0 });
        ok(/1 modelo\b/.test(um) && !/1 modelos/.test(um), 'um modelo no singular', um);
        ok(/sem data/.test(um), 'e sem data quando nao ha data', um);

        const aprov = api.linhaDoPedidoQueUsa({ numero: 2, data: null, modelos: [{}, {}], aprovados: 2 });
        ok(/aprovado/.test(aprov), 'modelo aprovado e apontado na propria linha', aprov);

        const sem = api.linhaDoPedidoQueUsa({ numero: null, data: null, modelos: [{}], aprovados: 0 });
        ok(/sem n[uú]mero/i.test(sem), 'modelo sem pedido nao vira "Pedido null"', sem);
        ok(api.linhaDoPedidoQueUsa(null) === '', 'e registro nulo nao estoura');
    }

    // ─── A consulta so pede coluna que existe ──────────────────────

    {
        // O PostgREST recusa a consulta INTEIRA quando uma das colunas pedidas
        // nao existe. Ate 27/08/2026 esta consulta pedia `nome_produto`,
        // `modelo_descri` e `amostra_status`, e nenhuma das tres existe em
        // `pedidos_modelos`: a funcao NUNCA falou com o banco — caia calada no
        // `emMemoria()`, e o aviso dependia de o pedido ja estar carregado na
        // tela. Medido no navegador, contra a producao.
        const corpo = extrair('modelosQueUsamNumeracao');
        const select = (corpo.match(/[.]select[(]'([^']+)'[)]/) || [])[1] || '';
        const COLUNAS = ['id', 'id_int', 'nome_modelo', 'status_arte', 'created_at',
            'amostra_num_id', 'quantidade', 'padrao', 'gabarito_operacional',
            'csv_selecao', 'verso_tipo', 'ordem', 'setor', 'status_impressao'];
        select.split(',').map(c => c.trim()).filter(Boolean).forEach(col => {
            ok(COLUNAS.includes(col),
                'a coluna "' + col + '" existe em pedidos_modelos', select);
        });
        ok(/nome_modelo/.test(select), 'e o nome do modelo continua vindo');
        ok(/id_int/.test(select), 'e o numero do pedido tambem, que e o que a exclusao mostra');
    }

    // ── O dialogo da exclusao ───────────────────────────────────────────────
    {
        const corpo = extrair('deleteNumeracao');

        ok(/await pedidosQueUsamNumeracao\(id\)/.test(corpo),
            'a exclusao pergunta em que pedidos a numeracao esta em uso');
        ok(/emUso\.slice\(0, MOSTRA\)\.map\(linhaDoPedidoQueUsa\)/.test(corpo),
            'e lista os pedidos no aviso');
        ok(/e mais ' \+ \(emUso\.length - MOSTRA\)/.test(corpo),
            'sem cortar em silencio: o que nao coube e contado');
        ok(/perdem n[uú]mero, QR e c[oó]digo de barras/.test(corpo),
            'o aviso diz o que a exclusao custa, e nao so que ha uso');
        // A saida existe nos dois sentidos — `trava-precisa-ter-saida`.
        ok(/OK = excluir mesmo assim/.test(corpo) && /Cancelar = manter/.test(corpo),
            'e diz o que cada botao faz');
        ok(/n[aã]o est[aá] em uso em nenhum pedido/.test(corpo),
            'a numeracao livre tambem se anuncia: excluir sem uso e seguro, e vale dizer');
        // Confirmar tem de continuar excluindo de verdade.
        ok(/from\('producao_numeracoes'\)\.delete\(\)\.eq\('id', id\)/.test(corpo),
            'confirmar continua excluindo');
    }

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})();
