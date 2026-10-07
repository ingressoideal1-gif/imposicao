'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const J = require('../frontend/mapa-teatro-revisao.js'), T = require('../frontend/teatro-banco.js');
const S = require('../frontend/teatro-snapshot.js');
function modelo() {
    return { id: 'm1', quantidade: 3, mapa_teatro_id: 'mapa1', mapa_teatro_setor_id: 's1', mapa_teatro_revisao: 'a'.repeat(64),
        mapa_teatro_snapshot: { versao: 1, mapa: { id: 'mapa1', nome: 'Mapa histórico' }, setor: { id: 's1', nome: 'Plateia', nomeConjunto: 'Mesa' },
            tiposAssento: [{ id: 'PCD', sufixo: 'Cad' }], cadeiras: [
                { chave: '0,0', prefixo: 'A', num: 1, tipo: 'Normal' }, { chave: '1,0', prefixo: 'A', num: 3, tipo: 'PCD' },
                { chave: '0,1', prefixo: 'B', num: 'Z', tipo: 'Normal' }, { chave: '2,0', tipo: 'Apagado' },
                { chave: '3,0', prefixo: 'A', num: 99, isErased: true } ] } };
}
async function conferirClienteLexical() {
    const m=modelo(),b=S.banco(m), atual={id:'mapa1',config:{setores:[{id:'s1',cadeiras:{}}]}};
    let leituras=0; const caps=['teatro_vertical_modelo_v1','teatro_snapshot_v1'];
    const ctx={MapaTeatroRevisao:J,TeatroSnapshot:S,
        __client:{from(t){assert.equal(t,'producao_mapas_teatro'); return {select(){return this;},eq(k,id){assert.equal(id,'mapa1');return this;},async single(){leituras++;return {data:atual,error:null};}};}},
        api(){throw Error('A leitura caiu no fallback local apesar do cliente lexical');},
        fetch:async()=>({ok:true,json:async()=>({capabilities:caps})}),toast(){}};
    ctx.window=ctx;vm.createContext(ctx);vm.runInContext('let supabaseClient = __client;',ctx);
    assert.equal(Object.hasOwn(ctx,'supabaseClient'),false);
    vm.runInContext(fs.readFileSync('frontend/teatro-banco.js','utf8'),ctx);
    const form=new FormData();form.set('payload',JSON.stringify({schema:'cut_stack',modelo:'m1',numeracao:{tipo:'TEATRO',elements:[{type:'TEATRO_COMBO'}],csv_data:b.csv_data,teatro_modelo:b.teatro_modelo}}));
    await ctx.TeatroBanco.conferirMotor(form,'http://motor');
    assert.equal(leituras,1);assert.equal(JSON.parse(form.get('payload')).numeracao.teatro_modelo.revisao_atual,await J.revisao(atual.config));
    const capa=JSON.parse(form.get('payload'));capa.formato={has_cover:true};form.set('payload',JSON.stringify(capa));
    caps.push('teatro_capas_fila_v1');
    await assert.rejects(()=>ctx.TeatroBanco.conferirMotor(form,'http://motor'),/descrição editada/);
    caps.push('teatro_capa_descricao_atual_v1');await ctx.TeatroBanco.conferirMotor(form,'http://motor');
    caps.splice(caps.indexOf('teatro_snapshot_v1'),1);await assert.rejects(()=>ctx.TeatroBanco.conferirMotor(form,'http://motor'),/snapshots do ERP/);
}
async function executar() {
    const m = modelo(), copia = structuredClone(m), fonte = S.banco(m);
    assert.deepEqual(fonte.csv_data.map(r => [r.Fila, r.Lugar, r.Numero]), [['A','1','1'],['A','3','3 Cad'],['B','Z','Z']]);
    assert.deepEqual(m, copia);
    const invertido = modelo(); invertido.mapa_teatro_snapshot.cadeiras.reverse();
    assert.deepEqual(S.banco(invertido).csv_data, fonte.csv_data, 'A ordem da lista não identifica lugares');
    const textual = modelo(); textual.mapa_teatro_snapshot.cadeiras[0].num = '01';
    assert.equal(S.banco(textual).csv_data[0].Lugar, '01');
    assert.equal(Object.hasOwn(m.mapa_teatro_snapshot, 'revisao'), false);
    assert.equal(S.banco({id:'sem-mapa'}), null);
    for (const alterar of [x => x.quantidade++, x => x.mapa_teatro_snapshot = null,
        x => x.mapa_teatro_snapshot.setor.id = 'outro', x => x.csv_selecao = [],
        x => x.mapa_teatro_snapshot.cadeiras.push(x.mapa_teatro_snapshot.cadeiras[0]),
        x => x.mapa_teatro_snapshot.cadeiras[0].num = '', x => x.mapa_teatro_snapshot.versao = 2]) {
        const invalido = modelo(); alterar(invalido); assert.throws(() => S.banco(invalido));
    }
    const atual = {id:'mapa1',config:{setores:[{id:'s1',nome:'Nome atual',cadeiras:{}}]}};
    const num = {tipo:'TEATRO',elements:[{type:'TEATRO_COMBO'}],csv_data:fonte.csv_data,teatro_modelo:fonte.teatro_modelo};
    const aviso = await S.conferir(num, async () => atual);
    assert.match(aviso,/snapshot histórico/); assert.equal(num.teatro_modelo.mapa_teatro_revisao,'a'.repeat(64));
    assert.deepEqual(num.csv_data,fonte.csv_data);
    assert.equal(num.teatro_modelo.config_canonica_atual,J.canonicalizar(atual.config));
    await assert.rejects(()=>S.conferir(num,async()=>({...atual,id:'outro'})),/não pertence/);
    await assert.rejects(()=>S.conferir({...num,csv_data:[]},async()=>atual),/não correspondem/);
    const source=fs.readFileSync('frontend/script.js','utf8');
    const c={window:{TeatroSnapshot:S},state:{numeracoes:[]},vinculoDeBancoDoModelo:()=>({banco_id:'banco-antigo'})};
    vm.createContext(c);
    for(const nome of ['resolverNumeracaoParaModelo','bancoTeatroDoModelo']) {
        const inicio=source.indexOf('\nfunction '+nome+'('),fim=source.indexOf('\n}',inicio)+2;
        vm.runInContext(source.slice(inicio,fim),c);
    }
    const resolvida=c.resolverNumeracaoParaModelo({tipo:'TEATRO'},m);
    assert.equal(resolvida.csv_data.length,3); assert.equal(resolvida.teatro_modelo.id,m.id);
    assert.equal(c.bancoTeatroDoModelo({...m,quantidade:4}).csv_data.length,0);
    assert.match(c.bancoTeatroDoModelo({...m,quantidade:4}).erro,/quantidade/);
    await conferirClienteLexical();
    // ERP legado omite nomeConjunto: a capa usa o nome editado do mapa atual,
    // enquanto CSV, lugares e snapshot permanecem históricos.
    const legado=modelo(); delete legado.mapa_teatro_snapshot.setor.nomeConjunto;
    const salvo=structuredClone(legado), bancoLegado=S.banco(legado);
    const mapaEditado={id:'mapa1',config:{setores:[{id:'s1',nome:'Plateia',nomeConjunto:'  Mesa   VIP  ',cadeiras:{}}]}};
    const numeracaoLegada={csv_data:bancoLegado.csv_data,teatro_modelo:bancoLegado.teatro_modelo};
    await S.conferir(numeracaoLegada,async()=>mapaEditado);
    assert.deepEqual(legado,salvo); assert.deepEqual(numeracaoLegada.csv_data,bancoLegado.csv_data);
    assert.equal(numeracaoLegada.csv_data[0].Conjunto,'Fila');
    assert.equal(T.capa(numeracaoLegada.csv_data,0,1,numeracaoLegada.teatro_capa).titulo,'Mesa VIP A');
    const cliente={from(){return {select(){return this;},in(){return Promise.resolve({data:[mapaEditado]});}};}};
    await S.conferirPedido([legado],cliente);
    const previa=S.resolver({tipo:'TEATRO'},legado);
    assert.equal(T.capa(previa.csv_data,0,1,previa.teatro_capa).titulo,'Mesa VIP A');
    assert.deepEqual(legado.mapa_teatro_snapshot,salvo.mapa_teatro_snapshot);
    await S.conferirPedido([legado],{from(){return {select(){return this;},in(){return Promise.reject(Error('offline'));}};}});
    assert.equal(Object.hasOwn(legado,'_teatro_capa'),false,'Falha de consulta nao conserva descricao de outra abertura');
    console.log('OK: snapshot v1, prioridade sobre banco, etiquetas, apagadas, quantidade, revisão histórica e fonte completa');
}
if(process.argv.includes('--payload')) {
    (async()=>{const m=modelo(),b=S.banco(m),num={tipo:'TEATRO',csv_data:b.csv_data,teatro_modelo:b.teatro_modelo};
        const atual={id:'mapa1',config:{setores:[{id:'s1',cadeiras:{}}]}};
        await S.conferir(num,async()=>atual);console.log(JSON.stringify({payload:{modelo:m.id,numeracao:num},atual}));})().catch(e=>{console.error(e);process.exitCode=1});
} else if(require.main===module) executar().catch(e=>{console.error(e);process.exitCode=1});
module.exports={modelo};
