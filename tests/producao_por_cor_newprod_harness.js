'use strict';
// Reusa a fixture sintética da página; executa seleção/conferência reais, sem rede.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const fixtureSource = fs.readFileSync(path.join(__dirname, 'producao_por_cor_fluxo_harness.js'), 'utf8');
const context = { require, __dirname, console, setTimeout, process, structuredClone,
    TextEncoder, AbortSignal, crypto: require('crypto').webcrypto };
vm.runInNewContext(fixtureSource.slice(0, fixtureSource.indexOf('let checks = 0;')) + `
async function localFixture() {
    const f = fixture(); await f.start();
    Object.assign(f.ctx, {structuredClone, TextEncoder, AbortSignal, crypto});
    const raw = {...f.tables.pedidos_modelos[0], status_arte:'APROVADO'};
    const snapshot = {modelos:[raw], numeracoes:[], origens:[], produtos:[], bancos:[], vinculos:[], artes:[], mapas:[]};
    const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
    const digest = require('crypto').createHash('sha256').update(JSON.stringify(canonical([raw,[]]))).digest('hex');
    const response = {protocolo:2,pedido:'1',revisao_pedido:'a'.repeat(64),snapshot,sem_arte:[],
        pacotes:[{modelo:'11',digest,origem:'local',revisao:'b'.repeat(64)}]};
    f.ctx.findOSInState = id => f.ctx.state.ordens.find(o=>o.id===id);
    f.ctx.normalizarNumeracaoLida = n=>n;
    f.ctx.mesclarNumeracoesNoCatalogo = ()=>{};
    f.ctx.fetch = async url => {
        assert.equal(url,'/api/pacotes-locais/abrir-pedido-painel');
        f.calls.push('preparar'); return {ok:true,json:async()=>response};
    };
    f.ctx.loadOSItens = async (id, options) => {
        assert(options.atualizar && options.exigirModelos && options.snapshotLocal);
        f.calls.push('carregar');
        f.ctx.state.osItens[id] = options.snapshotLocal.modelos.map(m=>({...m,_dbLoaded:true,_pedidoModeloId:m.id,_modeloOnline:m}));
        return true;
    };
    f.ctx.PilotoOffline = {aplicarConfirmacoes:async()=>{f.calls.push('confirmacoes');}};
    vm.runInContext(read('selecao-piloto.js'),f.ctx);
    vm.runInContext(extract(pedido,'enviarParaPedido'),f.ctx);
    f.ctx.carregarModeloParaPedido = async (id,os,options)=>{
        assert.equal(options.pacoteLocal.modelo,'11');
        f.calls.push('abrir'); f.ctx.state.activeOSItem={itemId:id,osId:os};
    };
    return f;
}
(async()=>{
    const ok=await localFixture(); await ok.api.openModel(11,'vibe_1');
    assert.deepEqual(ok.calls,['preparar','carregar','confirmacoes','abrir']);
    assert.equal(ok.api.local.ready,true);
    assert.equal(ok.ctx.PedidoJanelaExterna.validarGeracao()(),true);
    console.log('OK: abertura prepara snapshot e passa pela conferência real antes da janela');
    const fail=await localFixture();
    fail.ctx.fetch=async()=>({ok:false,status:409,headers:{get:()=>null},json:async()=>({})});
    await fail.api.openModel(11,'vibe_1');
    assert.equal(fail.api.local.ready,false); assert(!fail.calls.includes('abrir'));
    assert(fail.notices.some(n=>n[0].includes('HTTP 409')));
    console.log('OK: falha de preparação preserva motivo e impede abertura');
    for (const action of ['sair','trocar']) {
        const f=await localFixture(), delayed=deferred(), fetch=f.ctx.fetch;
        f.ctx.fetch=async(...args)=>{await delayed.promise;return fetch(...args);};
        const opening=f.api.openModel(11,'vibe_1');
        if(action==='sair') f.api.leavePage();
        else { f.api.local.opening++; f.ctx.PilotoSelecao.iniciarPedido('vibe_2'); }
        delayed.resolve(); await opening;
        assert(!f.calls.includes('carregar')); assert(!f.calls.includes('abrir'));
        console.log('OK: resposta antiga descartada ao '+action);
    }
    const loadFail=await localFixture(); loadFail.ctx.loadOSItens=async()=>false;
    await loadFail.api.openModel(11,'vibe_1'); assert(!loadFail.calls.includes('abrir'));
    assert(loadFail.notices.some(n=>n[0].includes('modelos locais')));
    const web=fixture();await web.start();await web.api.openModel(11,'vibe_1');
    assert(web.calls.some(c=>c.open)); assert.equal(web.api.local.ready,true);
    console.log('OK: falha de carga bloqueada e abertura web preservada');
})().catch(error=>{console.error(error);process.exitCode=1});
`, context);
