// Persistencia atomica do retorno da Producao para a Arte.
// Roda sem navegador: node tests/corrigir_arte_persistencia_harness.js

const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'script.js'), 'utf8')
    .replace(/\r\n/g, '\n');

function extrairFuncao(nome) {
    const inicio = script.indexOf('async function ' + nome + '(');
    if (inicio < 0) throw new Error('funcao ausente: ' + nome);
    const abre = script.indexOf('{', inicio);
    let nivel = 0;
    let aspas = '';
    let escape = false;
    for (let i = abre; i < script.length; i++) {
        const c = script[i];
        if (escape) { escape = false; continue; }
        if (aspas) {
            if (c === '\\') { escape = true; continue; }
            if (c === aspas) aspas = '';
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { aspas = c; continue; }
        if (c === '{') nivel++;
        if (c === '}' && --nivel === 0) return script.slice(inicio, i + 1);
    }
    throw new Error('fim da funcao ausente: ' + nome);
}

function clienteQueResponde(resposta, chamadas) {
    return {
        from(tabela) {
            chamadas.tabela = tabela;
            return {
                update(payload) {
                    chamadas.payload = payload;
                    return {
                        eq(campo1, valor1) {
                            chamadas.filtros = [[campo1, valor1]];
                            return {
                                eq(campo2, valor2) {
                                    chamadas.filtros.push([campo2, valor2]);
                                    return {
                                        select(colunas) {
                                            chamadas.select = colunas;
                                            return Promise.resolve(resposta);
                                        }
                                    };
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

function montar(resposta) {
    const item = { id: 1000935, status_impressao: 'Aguardando', impressao: 'Aguardando', status_arte: 'APROVADA' };
    const global = { ...item };
    const state = {
        osItens: { vibe_21869: [item] },
        modelosGlobais: { 21869: [global] }
    };
    const chamadas = { toasts: [], sincronizacoes: 0 };
    const cliente = clienteQueResponde(resposta, chamadas);
    const fonte = extrairFuncao('devolverArteParaAlteracao');
    const devolver = new Function(
        'state', 'STATUS_CORRIGIR_ARTE', 'normalizarStatusImpressao',
        'sincronizarStatusConsolidadoPedidoArte', 'toast', 'vibeClient', 'supabaseClient', 'console',
        fonte + '\nreturn devolverArteParaAlteracao;'
    )(
        state,
        'Corrigir Arte',
        valor => valor,
        async () => { chamadas.sincronizacoes++; },
        (msg, tipo) => chamadas.toasts.push({ msg, tipo }),
        cliente,
        cliente,
        { log() {}, warn() {}, error() {} }
    );
    return { devolver, item, global, chamadas };
}

function clienteEmLote(resposta, chamadas) {
    return {
        from(tabela) {
            chamadas.tabela = tabela;
            return {
                update(payload) {
                    chamadas.payload = payload;
                    return {
                        eq(campo, valor) {
                            chamadas.filtro = [campo, valor];
                            return {
                                in(campoIds, ids) {
                                    chamadas.ids = [campoIds, ids];
                                    return {
                                        select(colunas) {
                                            chamadas.select = colunas;
                                            return Promise.resolve(resposta);
                                        }
                                    };
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

function montarRetornoDoPedido(resposta, saiuDaArte = true, statusArte = 'REPROVADA_CLIENTE') {
    const modelos = [
        { id: 1000878, status_impressao: 'Aguardando', status_arte: statusArte },
        { id: 1000879, status_impressao: 'Aguardando', status_arte: statusArte }
    ];
    const state = {
        osItens: {},
        modelosGlobais: { 21396: modelos }
    };
    const chamadas = { toasts: [], sincronizacoes: 0 };
    const cliente = clienteEmLote(resposta, chamadas);
    const fonte = extrairFuncao('prepararModelosReprovadosParaRetornoAArte');
    const preparar = new Function(
        'state', 'STATUS_CORRIGIR_ARTE', 'ARTE_REPROVADOS', 'normalizarStatusImpressao',
        'pedidoSaiuDaArte', 'sincronizarStatusConsolidadoPedidoArte', 'toast',
        'vibeClient', 'supabaseClient', 'console',
        fonte + '\nreturn prepararModelosReprovadosParaRetornoAArte;'
    )(
        state,
        'Corrigir Arte',
        ['REPROVADO', 'REPROVADA', 'REPROVADA_CLIENTE', 'EM ALTERAÇÃO', 'EM ALTERACAO', 'ARTE_EM_CORRECAO'],
        valor => valor,
        () => saiuDaArte,
        async () => { chamadas.sincronizacoes++; },
        (msg, tipo) => chamadas.toasts.push({ msg, tipo }),
        cliente,
        cliente,
        { log() {}, warn() {}, error() {} }
    );
    return { preparar, modelos, chamadas };
}

let total = 0;
function ok(condicao, nome, extra) {
    total++;
    if (!condicao) throw new Error(nome + (extra === undefined ? '' : ': ' + JSON.stringify(extra)));
}

async function main() {
    const sucesso = montar({
        data: [{ id: 1000935, status_impressao: 'Corrigir Arte', status_arte: 'REPROVADA_CLIENTE' }],
        error: null
    });
    ok(await sucesso.devolver(1000935, 'vibe_21869') === true, 'sucesso confirmado');
    ok(sucesso.chamadas.tabela === 'pedidos_modelos', 'tabela correta');
    ok(sucesso.chamadas.payload.status_impressao === 'Corrigir Arte' &&
        sucesso.chamadas.payload.status_arte === 'REPROVADA_CLIENTE', 'duas colunas na mesma escrita');
    ok(JSON.stringify(sucesso.chamadas.filtros) === JSON.stringify([['id', 1000935], ['id_int', 21869]]),
        'filtros protegem modelo e pedido', sucesso.chamadas.filtros);
    ok(sucesso.item.status_impressao === 'Corrigir Arte' && sucesso.global.status_arte === 'REPROVADA_CLIENTE',
        'memoria muda depois da resposta');
    ok(sucesso.chamadas.sincronizacoes === 1, 'consolidado recalculado');

    for (const resposta of [
        { data: [], error: null },
        { data: null, error: { message: 'RLS recusou' } }
    ]) {
        const falha = montar(resposta);
        ok(await falha.devolver(1000935, 'vibe_21869') === false, 'falha nao vira sucesso');
        ok(falha.item.status_impressao === 'Aguardando' && falha.item.status_arte === 'APROVADA',
            'falha nao altera memoria');
        ok(falha.chamadas.sincronizacoes === 0, 'falha nao consolida estado inexistente');
        ok(falha.chamadas.toasts.some(t => t.tipo === 'error'), 'falha fica visivel ao operador');
    }

    const retorno = montarRetornoDoPedido({
        data: [
            { id: 1000878, status_impressao: 'Corrigir Arte', status_arte: 'REPROVADA_CLIENTE' },
            { id: 1000879, status_impressao: 'Corrigir Arte', status_arte: 'REPROVADA_CLIENTE' }
        ],
        error: null
    });
    ok(await retorno.preparar({ id: 'vibe_21396', numero: 21396, status_interno: 'EXPEDICAO' }) === true,
        'retorno do pedido confirmado');
    ok(retorno.chamadas.tabela === 'pedidos_modelos', 'retorno usa a tabela de modelos');
    ok(JSON.stringify(retorno.chamadas.filtro) === JSON.stringify(['id_int', 21396]),
        'retorno protege o numero do pedido', retorno.chamadas.filtro);
    ok(JSON.stringify(retorno.chamadas.ids) === JSON.stringify(['id', [1000878, 1000879]]),
        'retorno atualiza somente os modelos reprovados', retorno.chamadas.ids);
    ok(retorno.modelos.every(m => m.status_impressao === 'Corrigir Arte'),
        'retorno atualiza a memoria dos dois modelos');
    ok(retorno.chamadas.sincronizacoes === 1, 'retorno consolida uma vez depois do lote');

    for (const resposta of [
        { data: [{ id: 1000878, status_impressao: 'Corrigir Arte', status_arte: 'REPROVADA_CLIENTE' }], error: null },
        { data: null, error: { message: 'RLS recusou' } }
    ]) {
        const falha = montarRetornoDoPedido(resposta);
        ok(await falha.preparar({ id: 'vibe_21396', numero: 21396, status_interno: 'EXPEDICAO' }) === false,
            'retorno parcial ou recusado nao vira sucesso');
        ok(falha.modelos.every(m => m.status_impressao === 'Aguardando'),
            'retorno sem confirmacao nao altera a memoria');
        ok(falha.chamadas.sincronizacoes === 0, 'retorno sem confirmacao nao consolida');
    }

    const aindaNaArte = montarRetornoDoPedido({ data: null, error: null }, false);
    ok(await aindaNaArte.preparar({ id: 'vibe_21396', numero: 21396 }) === true,
        'pedido que ainda esta na Arte preserva o fluxo anterior');
    ok(aindaNaArte.chamadas.tabela === undefined, 'pedido que ainda esta na Arte nao grava modelos');

    const semModeloReprovado = montarRetornoDoPedido({ data: null, error: null }, true, 'APROVADA_CLIENTE');
    ok(await semModeloReprovado.preparar({ id: 'vibe_21396', numero: 21396, status_interno: 'EXPEDICAO' }) === false,
        'pedido expedido sem modelo reprovado nao anuncia retorno falso');
    ok(semModeloReprovado.chamadas.toasts.some(t => t.tipo === 'error'),
        'pedido sem alvo informa como marcar o modelo');

    for (const nome of ['voltarParaArte', 'voltarParaArteFromLista']) {
        const fonte = nome === 'voltarParaArte'
            ? extrairFuncao(nome)
            : script.slice(script.indexOf('window.voltarParaArteFromLista = async function'),
                script.indexOf('\n};', script.indexOf('window.voltarParaArteFromLista = async function')) + 3);
        const preparo = fonte.indexOf('await prepararModelosReprovadosParaRetornoAArte(os)');
        const memoria = fonte.indexOf('gravarStatusOverride');
        ok(preparo > 0 && memoria > preparo,
            nome + ': confirma os modelos antes de anunciar o retorno');
    }

    console.log('OK: persistencia de Corrigir Arte -- ' + total + ' verificacoes passaram.');
}

main().catch(e => {
    console.error(e && e.stack || e);
    process.exit(1);
});
