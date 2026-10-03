'use strict';
// Dados sintéticos; nenhuma leitura/gravação em Supabase ou serviço de impressão.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../frontend/teatro-banco.js');
const S = require('../frontend/teatro-snapshot.js');
const B = require('../frontend/banco-do-modelo.js');
const { extract } = require('./impressao_combinada_harness.js');
const script = fs.readFileSync('frontend/script.js', 'utf8');
const read = f => fs.readFileSync('frontend/' + f, 'utf8');

async function fixture() {
    const mapa = {id:'mapa-sintetico',name:'Teatro sintético',config:{tiposAssento:[{id:'PCD',sufixo:'Cad'}],
        setores:[82,515].map((q,i)=>({id:'setor-'+i,nome:i?'Plateia':'Mesas',nomeConjunto:i?'Fila':'Mesa',
            cadeiras:Object.fromEntries(Array.from({length:q},(_,n)=>[n+','+i,
                {prefixo:i?String.fromCharCode(68+Math.floor(n/40)):String(Math.floor(n/2)+1),
                    num:i?(n%40+1):(n%2?'B':'A'),tipo:n===0?'PCD':'Normal'}]))}))}};
    const rev = await T.revisao(mapa);
    const nums = mapa.config.setores.map((s,i)=>({id:'num-'+i,tipo:'TEATRO',csv_data:[],elements:[
        {type:'TEATRO_COMBO',prefix_fila:s.nomeConjunto+': ',prefix_lugar:'Lugar: '},
        {type:'TEATRO_FILA'},{type:'TEATRO_LUGAR'}]}));
    const modelos = mapa.config.setores.map((s,i)=>({id:String(i+1),qtd:Object.keys(s.cadeiras).length,
        bloco:50,numeracao_id:nums[i].id,mapa_teatro_id:mapa.id,mapa_teatro_setor_id:s.id,mapa_teatro_revisao:rev,
        mapa_teatro_snapshot:{versao:1,mapa:{id:mapa.id,nome:mapa.name},setor:{id:s.id,nome:s.nome,nomeConjunto:s.nomeConjunto},
            cadeiras:Object.entries(s.cadeiras).reverse().map(([chave,c])=>({chave,...c})),tiposAssento:structuredClone(mapa.config.tiposAssento)}}));
    return {mapa,nums,modelos};
}

async function executar() {
    const {mapa,nums,modelos} = await fixture();
    const original = structuredClone({mapa,nums,modelos});
    const c = {state:{numeracoes:nums,vinculosDeBanco:{},bancosDoPedido:[]},window:{TeatroSnapshot:S,BancoDoModelo:B,TeatroBanco:T}};
    vm.createContext(c);
    for (const n of ['numeracaoIdDoItem','numeracaoDoModelo','resolverNumeracaoParaModelo','vinculoDeBancoDoModelo',
        'bancoTeatroDoModelo','quantidadeContratada','colunasDoBancoDaNumeracao','linhasAtivasCsv',
        'linhasComDadoDaNumeracao','fatiaCsvDoItem','linhasDoModeloNoPayload','bancoDeDadosIncompletoDoModelo','numeracaoConfirmadaDoModelo','fonteDoModelo']) {
        vm.runInContext(extract(script,n),c);
    }
    const resolvidas = modelos.map(m=>c.numeracaoDoModelo(m));
    assert.deepEqual(resolvidas.map(n=>n.csv_data.length),[82,515]);
    for(let i=0;i<2;i++) {
        const num=resolvidas[i],m=modelos[i];
        assert.equal(c.bancoDeDadosIncompletoDoModelo(m),null);
        assert.equal(c.numeracaoConfirmadaDoModelo(num,m).csv_data.length,m.qtd);
        assert.equal(c.bancoTeatroDoModelo(m).csv_data.length,m.qtd);
        const previsto=T.preparar(mapa,m.mapa_teatro_revisao).setores[i].rows;
        assert.deepEqual(num.csv_data,previsto);
    }
    assert.equal(resolvidas[0].csv_data[0].Numero,'A Cad');
    assert.equal(resolvidas[0].csv_data[0].Conjunto,'Mesa');
    assert.equal(resolvidas[1].csv_data[0].Fila,'D');
    const sets=T.montarSets(resolvidas.map(n=>({tipo:n.tipo,rows:n.csv_data,items:n.csv_data.map((r,i)=>i)})),8);
    assert.deepEqual(sets.map(s=>s.num_sheets),[11,65]);
    assert.equal(sets.flatMap(s=>s.cell_allocations.flat()).filter(x=>x!==null).length,597);
    assert.deepEqual({mapa,nums,modelos},original,'Não alterar modelos, snapshots nem catálogo');
    // Mesmo uma numeração com CSV de outro pedido não pode prevalecer sobre o snapshot.
    const contaminada={...nums[0],csv_data:[{Fila:'ERRADO',Numero:'999'}]};
    assert.equal(S.resolver(contaminada,modelos[0]).csv_data.length,82);
    c.state.vinculosDeBanco['1']={banco_id:'outro'};
    c.state.bancosDoPedido=[{id:'outro',csv_data:[{Numero:'ERRADO'}]}];
    assert.equal(c.numeracaoDoModelo(modelos[0]).csv_data.length,82);
    assert.equal(c.fonteDoModelo(modelos[0]),null,'Não abrir o CSV editável do catálogo para o snapshot histórico');

    const alteracoes = [
        m=>m.qtd--,
        m=>m.qtd=82.5,
        m=>m.mapa_teatro_id='outro',
        m=>m.mapa_teatro_setor_id='outro',
        m=>m.mapa_teatro_revisao='invalida',
        m=>m.mapa_teatro_snapshot=null,
        m=>m.mapa_teatro_snapshot='{errado',
        m=>m.mapa_teatro_snapshot.versao=2,
        m=>m.mapa_teatro_snapshot.cadeiras.push(m.mapa_teatro_snapshot.cadeiras[0]),
        m=>m.mapa_teatro_snapshot.cadeiras[0].chave='a,b',
        m=>m.mapa_teatro_snapshot.cadeiras[0].num={},
        m=>m.mapa_teatro_snapshot.cadeiras[0].isErased='false',
        m=>m.csv_selecao={ids:[1]},
    ];
    for(const alterar of alteracoes) {
        const m=structuredClone(modelos[0]);alterar(m);
        assert.equal(c.bancoDeDadosIncompletoDoModelo(m).motivo,'mapa_teatro');
        assert(S.problema(m,nums[0]));
    }
    assert(S.problema(modelos[0],null));
    assert(S.problema(modelos[0],{elements:[{type:'TEXT'}]}));
    const parcial={id:'parcial',mapa_teatro_setor_id:'s'};
    assert(S.tem(parcial));assert(S.problema(parcial,nums[0]));
    const apagada=structuredClone(modelos[0]);
    apagada.mapa_teatro_snapshot.cadeiras.push({chave:'900,900',tipo:'Apagado'});
    assert.equal(S.resolver(nums[0],apagada).csv_data.length,82);
    const serializado={...modelos[0],mapa_teatro_snapshot:JSON.stringify(modelos[0].mapa_teatro_snapshot)};
    assert.deepEqual(S.resolver(nums[0],serializado).csv_data,resolvidas[0].csv_data);
    const hist=structuredClone(modelos[0]);hist.mapa_teatro_revisao='b'.repeat(64);
    assert.match(await S.conferirRevisao(hist,mapa),/outra revisão/);
    assert.equal(S.resolver(nums[0],hist).csv_data[0].Revisao_Mapa,'b'.repeat(64));
    assert.equal(await S.conferirRevisao(modelos[0],mapa),'');
    assert.match(await S.conferirRevisao(modelos[0],null),/versão salva/);
    const novo=structuredClone(mapa);novo.config.setores[0].cadeiras['0,0'].num='NOVO';
    assert.match(await S.conferirRevisao(modelos[0],novo),/outra revisão/);
    assert.equal(S.resolver(nums[0],modelos[0]).csv_data[0].Numero,'A Cad');
    const l={id:'legado'},n={id:'n',csv_data:[{Numero:9}],elements:[]};
    assert.equal(S.resolver(n,l),n);assert.equal(c.resolverNumeracaoParaModelo(n,l),n);
    // Consulta de revisão é opcional para o histórico, só lê IDs do pedido e falha com aviso.
    let consultas=0;
    const cliente={from(t){assert.equal(t,'producao_mapas_teatro');return{select(cols){assert.equal(cols,'id,config');return{async in(k,ids){
        assert.equal(k,'id');assert.deepEqual(ids,['mapa-sintetico']);consultas++;return{data:[novo]};}};}};}};
    await S.conferirPedido(modelos,cliente);assert.equal(consultas,1);
    assert(modelos.every(m=>m._mapa_teatro_aviso.includes('outra revisão')));
    await S.conferirPedido([l],cliente);assert.equal(consultas,1);
    await S.conferirPedido(modelos,{from(){throw Error('Leitura negada');}});
    assert.match(modelos[0]._mapa_teatro_aviso,/Não foi possível/);
    // Porta final de impressão recusa erro e seleção parcial antes de consultar o agente.
    const fetchAntigo=global.fetch;
    global.fetch=async()=>({ok:true,json:async()=>({capabilities:['teatro_vertical_modelo_v1','teatro_snapshot_v1']})});
    const apiAntiga=global.api;global.api=async()=>mapa;
    try {
        const enviar=async num=>{const f=new FormData();f.set('payload',JSON.stringify({schema:'sequential',numeracao:num}));await T.conferirMotor(f,'http://sintetico');return JSON.parse(f.get('payload'));};
        const payload=await enviar(resolvidas[0]);assert.equal(payload.schema,'cut_stack');assert.equal(payload.numeracao.csv_data.length,82);
        await assert.rejects(()=>enviar({...resolvidas[0],csv_data:resolvidas[0].csv_data.slice(1)}),/todos os lugares/);
        await assert.rejects(()=>enviar(S.resolver(nums[0],parcial)),/snapshot/);
    } finally {global.fetch=fetchAntigo;global.api=apiAntiga;}

    // Portal conserva o acesso autorizado por pedido e usa os mesmos lugares do painel.
    const portal={window:null,setTimeout,clearTimeout,TeatroSnapshot:S,BancoDoModelo:B};portal.window=portal;
    vm.createContext(portal);vm.runInContext(read('cliente-bancos.js'),portal);
    await portal.PortalBancos.carregar('123','token-sintetico',async()=>({versao:1,numero_pedido:'123',modelos:modelos.map(m=>({modelo_id:m.id,banco:null,csv_mapa:null}))}));
    assert.equal(portal.PortalBancos.resolver(modelos[0],nums[0]).csv_data.length,82);
    assert.equal(portal.PortalBancos.resolver(modelos[0],nums[0]),portal.PortalBancos.resolver(modelos[0],nums[0]),'Cache por modelo conserva referência para desenhar a arte');
    assert.equal(portal.PortalBancos.problema(modelos[0],nums[0]),'');
    assert.equal(portal.PortalBancos.resolver({...modelos[0],id:'nao-autorizado'},nums[0]),null);
    const invalido={...modelos[0],qtd:81};assert(portal.PortalBancos.problema(invalido,nums[0]));
    vm.runInContext(extract(read('cliente.js'),'temCsvVariavel'),portal);
    assert.equal(portal.temCsvVariavel(portal.PortalBancos.resolver(modelos[0],nums[0])),true);
    console.log('OK: snapshots ERP, 82/515 lugares, etiquetas, sufixos, 11/65 folhas, históricos, PRONTO, payload, erros, legados e portal.');
}
if(require.main===module)executar().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
