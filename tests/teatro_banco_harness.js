'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../frontend/teatro-banco.js');
function mapa() {
    return {id:'mapa-ideal', name:'Teatro Ideal', config:{tiposAssento:[{id:'PCD',sufixo:'Cad'}], setores:
        ['Plateia','Balcão','Mesas','Camarotes'].map((nome,i) => ({id:'setor-'+i,nome,nomeConjunto:i===2?'Mesa':'Fila',cadeiras:
            Object.fromEntries([['A',3],['B',4],['C',2]].flatMap(([fila,q],y) => Array.from({length:q},(_,x) => [x+','+y,{prefixo:fila,num:String(x+1),tipo:x===0&&y===0?'PCD':'Normal'}])))
        }))}};
}
async function executar() {
    const original = mapa(), copia = structuredClone(original), rev = await T.revisao(original);
    const plano = T.preparar(original,rev);
    assert.deepEqual(original,copia); assert.equal(plano.quantidade,36);
    assert.deepEqual(plano.setores[0].blocos.map(b=>b.quantidade),[3,4,2]);
    assert.equal(plano.setores[0].rows[0].Numero,'1 Cad');
    assert.equal(plano.setores[0].rows[0].Mapa_ID,'mapa-ideal');
    assert.equal(plano.setores[2].rows[0].Conjunto,'Mesa');
    assert.deepEqual(T.capa(plano.setores[2].rows,3,5),{titulo:'Mesas',detalhe:' - Mesa A / 1 Cad a Mesa B / 2 (5 lugares)'});
    assert.equal(new Set(plano.setores.flatMap(s=>s.rows.map(r=>r.__id))).size,36);
    original.config.setores[0].cadeiras['8,0']={tipo:'Apagado'};
    assert.equal(T.preparar(original,rev).quantidade,36);
    const duplicado=mapa(); duplicado.config.setores[0].cadeiras['9,0']={prefixo:'A',num:'1'};
    assert.throws(()=>T.preparar(duplicado,rev),/repetido/);
    const semId=mapa(); semId.config.setores[0].id='local_1';
    assert.throws(()=>T.preparar(semId,rev),/IDs salvos/);
    const rows=plano.setores[0].rows;
    assert.throws(()=>T.grupos([rows[0],rows[3],rows[1]]),/permanecer juntas/);
    assert.throws(()=>T.grupos([rows[0],plano.setores[1].rows[0]]),/mistura setores/);
    assert.throws(()=>T.grupos(rows.map(r=>({...r,Origem:''}))),/incompleto/);
    const modelos=plano.setores.map(s=>({rows:s.rows,items:s.rows.map((r,i)=>({id:r.__id,local_index:i}))}));
    const sets=T.montarSets(modelos,2);
    assert.deepEqual(sets.map(s=>s.num_sheets),[5,5,5,5]);
    const impressos=sets.flatMap(s=>s.cell_allocations.flat()).filter(Boolean);
    assert.equal(impressos.length,36); assert.equal(new Set(impressos.map(i=>i.id)).size,36);
    for(const set of sets) for(const pose of set.cell_allocations) {
        const locais=pose.filter(Boolean).map(i=>i.local_index);
        assert.deepEqual(locais,Array.from({length:locais.length},(_,i)=>locais[0]+i));
    }
    assert.equal(T.montarSets([{rows:[],items:[1,2]}],2),null);
    assert.throws(()=>T.montarSets([modelos[0],{rows:[],items:[1]}],2),/Combine/);
    const itens=plano.setores.map((s,i)=>({id:'modelo-'+i,id_int:123,qtd:9,arte:'arte-'+i,bloco:50,csv_selecao:i===0?['antigo']:null}));
    const associacoes=Object.fromEntries(plano.setores.map((s,i)=>[s.id,itens[i].id]));
    assert.throws(()=>T.validarAssociacoes(plano,{...associacoes,'setor-1':'modelo-0'},itens),/diferente/);
    assert.throws(()=>T.validarAssociacoes(plano,associacoes,itens,()=> 'Aprovado'),/Aprovado/);
    assert.throws(()=>T.validarAssociacoes(plano,associacoes,itens.map(i=>({...i,qtd:8}))),/ERP/);
    let dados={bancos:[],vinculos:[]}, chamadas=[], falhar=true, ultimo, ativo=true;
    const deps={idInt:123,itens:()=>itens,bloqueio:()=>null,exigirAtivo:()=>{assert.ok(ativo)},
        consultar:async()=>structuredClone(dados),atualizar:d=>{ultimo=d},
        limparSelecao:async item=>{item.csv_selecao=null},
        chamar:async(acao,corpo)=>{
            chamadas.push([acao,corpo]);
            if(acao==='criar') {const banco={...structuredClone(corpo),id:'banco-'+dados.bancos.length};dados.bancos.push(banco);return {banco};}
            if(falhar && corpo.modelo_id==='modelo-1') throw Error('Falha simulada');
            dados.vinculos=dados.vinculos.filter(v=>v.modelo_id!==corpo.modelo_id);
            dados.vinculos.push({modelo_id:corpo.modelo_id,banco_id:corpo.banco_id});return {};
        }};
    await assert.rejects(T.importar(plano,associacoes,deps),/simulada/);
    assert.equal(dados.bancos.length,2);assert.equal(dados.vinculos.length,1);
    falhar=false; const resultado=await T.importar(plano,associacoes,deps);
    assert.deepEqual(resultado,{setores:4,lugares:36}); assert.equal(dados.bancos.length,4);
    assert.equal(ultimo.vinculos.length,4); assert.ok(itens.every((i,n)=>i.arte==='arte-'+n&&i.bloco===50&&i.qtd===9));
    const antes=chamadas.length; await T.importar(plano,associacoes,deps); assert.equal(chamadas.length,antes);
    // Uma resposta de POST não comprova uma gravação; a releitura deve conter o banco.
    await assert.rejects(T.importar(plano,associacoes,{...deps,consultar:async()=>({bancos:[],vinculos:[]}),chamar:async()=>({banco:{id:'ausente'}})}),/conferir/);
    const fd=new FormData();fd.set('payload',JSON.stringify({schema:'cut_stack',cut_stack_mode:'strict_assembly',numeracao:{csv_data:rows,elements:[{type:'TEATRO_COMBO'}]}}));
    const fetchAntigo=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({capabilities:[]})});
    await assert.rejects(T.conferirMotor(fd,'http://estacao'),/Atualize/);
    global.fetch=async()=>({ok:true,json:async()=>({capabilities:['mapa_teatro_blocos_v1']})});
    await assert.rejects(T.conferirMotor(fd,'http://estacao'),/Atualize/);
    global.fetch=async()=>({ok:true,json:async()=>({capabilities:['teatro_vertical_modelo_v1']})});
    await T.conferirMotor(fd,'http://estacao'); global.fetch=fetchAntigo;
    // Executa a função real da prévia, com os mesmos modelos e bancos enviados ao motor.
    const fonte=fs.readFileSync('frontend/pedido.js','utf8'), inicio=fonte.indexOf('\nfunction buildStrictAssemblySets('),fim=fonte.indexOf('\n}',inicio)+2;
    const contexto={window:{TeatroBanco:T},state:{numeracoes:[]},numeracaoDaArteNaPreviaPedido:()=>null};
    vm.createContext(contexto);vm.runInContext(fonte.slice(inicio,fim),contexto);
    const artes=plano.setores.map(s=>({qtd:s.quantidade,numeracao:{csv_data:s.rows}}));
    const previa=contexto.buildStrictAssemblySets(artes,true,36,50,2);
    assert.deepEqual(JSON.parse(JSON.stringify(previa.map(s=>s.num_sheets))),sets.map(s=>s.num_sheets));
    const legado={tipo:'TEATRO',rows:Array.from({length:12},(_,i)=>({Fila:i<6?'A':'B',Numero:String(i+1)})),items:Array.from({length:12},(_,i)=>i)};
    assert.deepEqual(T.montarSets([legado],4)[0].cell_allocations,[[0,1,2],[3,4,5],[6,7,8],[9,10,11]]);
    const payload={schema:'sequential',cut_stack_mode:'independent',numeracao:{tipo:'TEATRO',csv_data:legado.rows}};
    assert.equal(T.configurarMontagem(payload),true);
    assert.equal(payload.schema,'cut_stack');assert.equal(payload.cut_stack_mode,'strict_assembly');
    console.log('OK: conversão, 4 setores, montagem vertical por modelo, vínculo existente, releitura, retomada e prévia.');
}
if(require.main===module) executar().catch(e=>{console.error(e);process.exitCode=1});
module.exports={mapa};
