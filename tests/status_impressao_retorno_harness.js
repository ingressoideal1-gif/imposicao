// Regressões do vídeo: leitura do pedido não deve mudar a elegibilidade.
// Persistência simulada: nenhuma rede, credencial ou impressora.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
function extract(name, source = script) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function ambiente(resposta, conectado = true) {
    const item = {id: 123, status_impressao: 'Aguardando', impressao: 'Aguardando'};
    const global = {...item};
    const writes = [], notices = [], reads = [];
    const query = {
        eq(k, v) { writes.push([k, v]); return this; },
        is(k,v) { writes.push([k,v]); return this; },
        select() { return resposta; }
    };
    const ctx = {
        STATUS_CORRIGIR_ARTE: 'Corrigir Arte',
        state: {osItens: {vibe_999: [item]}, modelosGlobais: {999: [global]}},
        supabaseClient: conectado ? {from(table) {
            assert.equal(table, 'pedidos_modelos');
            return {select() {
                const q={eq(){return q;},then(ok){return (writes.some(w=>w.status_impressao) ? resposta : Promise.resolve({data:[{id:123,id_int:999,status_impressao:'Aguardando'}]})).then(ok);}};
                return q;
            },update(payload) { writes.push(payload); return query; }};
        }} : null,
        findOSInState: () => ({numero: 999}),
        loadOSItens: async (...args) => { reads.push(args); },
        toast: (...args) => notices.push(args),
        console: {error() {}, warn() {}},
        window: {STATUS_CORRIGIR_ARTE: 'Corrigir Arte', dispatchEvent() {}},
        CustomEvent: function () {},
        renderOrdens() {}, renderPedOSQueue() {}, renderImpOSQueue() {},
        updatePedImprimirButtonsVisibility() {},
        fetch() { throw Error('Não deve usar a rota legada'); },
        devolverArteParaAlteracao: async () => true,
        avisarCorrecaoDeArte() {}
    };
    vm.createContext(ctx);
    for (const name of ['normalizarStatusImpressao', 'pedidoBateNosSetores',
        'updateItemImpressao', 'autoSaveOSItemField', 'impQueueUpdateField', 'calcularStatusImpressaoPedido']) {
        vm.runInContext(extract(name), ctx);
    }
    vm.runInContext(extract('pedQueueUpdateField', pedido), ctx);
    return {ctx, item, global, writes, notices, reads};
}
(async () => {
    const {ctx} = ambiente(null);
    for (const nome of ['formatarDataHoraStatus', 'horaStatusImpressao', 'ultimaHoraStatus', 'carimboStatusHtml', 'rotuloStatusComHora']) {
        vm.runInContext(extract(nome), ctx);
    }
    assert.equal(ctx.formatarDataHoraStatus('2026-10-23T00:30:00Z'), '22/10 21:30h');
    assert.equal(ctx.formatarDataHoraStatus('invalida'), '');
    assert.equal(ctx.formatarDataHoraStatus(null), '');
    assert.equal(ctx.horaStatusImpressao({status_impressao: 'Impresso', status_impressao_registrado_em: '2026-10-23T00:30:00Z', _confirmacaoLocalPendente: true}), '', 'Confirmacao local pendente nao exibe o horario do status anterior');
    for (const status of ['Aguardando', 'Impresso', 'Corrigir Arte']) {
        const item = {status_impressao: status, status_impressao_registrado_em: '2026-10-23T00:30:00Z'};
        assert.equal(ctx.rotuloStatusComHora(status, status, item), status + ' (22/10 21:30h)');
    }
    assert.equal(ctx.horaStatusImpressao({status_impressao: 'Aguardando', status_impressao_em: '2026-10-23T00:30:00Z'}), '');
    assert.equal(ctx.ultimaHoraStatus(['2026-10-23T00:30:00Z', '2026-10-22T20:00:00Z']), '2026-10-23T00:30:00.000Z');
    assert.equal(ctx.ultimaHoraStatus(['2026-10-23T00:30:00Z', null]), '');
    assert.equal(ctx.carimboStatusHtml('invalida'), '');
    // Antes: resumo AGUARD.; depois: modelos com status_producao=PENDENTE.
    const predicate = script.match(/const matchStatus = (itens\.some\([\s\S]*?);/)[1];
    ctx.state.filtroStatus = 'AGUARD.';
    for (const status of ['AGUARD.', 'Aguardando', 'PENDENTE', null, '  ']) {
        const item = {setor: 'LASER', impressao: ctx.normalizarStatusImpressao(status)};
        ctx.itens = [item];
        assert.equal(vm.runInContext(predicate, ctx), true, String(status));
        assert.equal(ctx.pedidoBateNosSetores([item], ['LASER']), true);
        assert.equal(ctx.pedidoBateNosSetores([item], ['FLEXO']), false);
    }
    const impresso = [{setor: 'LASER', impressao: 'Impresso'}];
    assert.equal(ctx.pedidoBateNosSetores(impresso, ['LASER']), false);
    assert.equal(ctx.pedidoBateNosSetores(impresso, ['LASER'], true), true);
    assert(script.includes('pedidoBateNosSetores(itens, state.filtroSetores, listaEhDosImpressos)'));
    assert.equal(ctx.calcularStatusImpressaoPedido([{status_impressao:'IMPRESSO'}]),'Impresso');
    ctx.itens=[{impressao:'Impresso'}];
    assert.equal(vm.runInContext(predicate,ctx),false,'divergência não entra no filtro Aguardando');

    const sucesso = {data: [{id: 123, id_int: 999, status_impressao: 'Impresso', status_impressao_registrado_em: '2026-10-23T00:30:00Z'}], error: null};
    for (const name of ['pedQueueUpdateField', 'impQueueUpdateField', 'autoSaveOSItemField']) {
        let liberar;
        const a = ambiente(new Promise(resolve => { liberar = resolve; }));
        const pendente = a.ctx[name](123, 'vibe_999', 'status_impressao', 'Impresso');
        assert.equal(a.item.impressao, 'Aguardando', name + ': aguardar gravação');
        assert.equal(a.item.status_impressao, 'Aguardando');
        liberar(sucesso);
        assert.equal(await pendente, true);
        assert.equal(a.item.impressao, 'Impresso');
        assert.equal(a.global.status_impressao, 'Impresso');
        assert.equal(a.item.status_impressao_registrado_em, '2026-10-23T00:30:00Z');
        assert.equal(a.global.status_impressao_registrado_em, a.item.status_impressao_registrado_em);
        assert.equal(a.writes.filter(x => Array.isArray(x) && x[0] === 'id_int')[0][1], 999);

        for (const resposta of [
            {data: [], error: null},
            {data: null, error: {message: 'Falha de rede simulada'}},
            {data: [{id: 124, id_int: 999, status_impressao: 'Impresso'}]},
            {data: [{id: 123, id_int: 998, status_impressao: 'Impresso'}]},
            {data: [{id: 123, id_int: 999, status_impressao: 'Aguardando'}]}
        ]) {
            const b = ambiente(Promise.resolve(resposta));
            assert.equal(await b.ctx[name](123, 'vibe_999', 'status_impressao', 'Impresso'), false);
            assert.equal(b.item.impressao, 'Aguardando');
            assert.equal(b.global.status_impressao, 'Aguardando');
            assert.equal(b.notices.some(n => n[1] === 'success'), false);
            assert.equal(b.reads[0][1].atualizar, true);
        }
        const offline = ambiente(null, false);
        assert.equal(await offline.ctx[name](123, 'vibe_999', 'status_impressao', 'Impresso'), false);
        assert.equal(offline.item.impressao, 'Aguardando');
        assert.equal(offline.writes.length, 0);

        const correcao = ambiente(null);
        let chamadas = 0;
        correcao.ctx.devolverArteParaAlteracao = async () => { chamadas++; return true; };
        await correcao.ctx[name](123, 'vibe_999', 'status_impressao', 'Corrigir Arte');
        assert.equal(chamadas, 1, 'Preservar o fluxo de correção de arte');

        const local = ambiente(Promise.resolve({data:[{id:123,id_int:999,status_impressao:'Impresso'}]}));
        const eventos = [];
        local.ctx.window.PilotoOffline = {
            async confirmar(){throw Error('Nao usar fila local para confirmar na rede');},
            async iniciarDecisao(){eventos.push('reserva');return {};},
            registrarStatusConfirmado(){eventos.push('rede');},
            async encerrarDecisao(){eventos.push('recibo');}
        };
        assert.equal(await local.ctx[name](123,'vibe_999','status_impressao','Impresso'),true);
        assert.deepEqual(eventos,['reserva','rede','recibo']);
        assert(local.writes.some(w=>w.status_impressao==='Impresso'));

    }
    console.log('OK: retorno/filtros, confirmação, zero linhas, falha de rede, registro divergente, offline e Corrigir Arte.');
})().catch(e => { console.error(e); process.exitCode = 1; });
