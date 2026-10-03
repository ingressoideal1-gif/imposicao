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
    console.log('OK: snapshot v1, prioridade sobre banco, etiquetas, apagadas, quantidade, revisão histórica e fonte completa');
}
if(process.argv.includes('--payload')) {
    (async()=>{const m=modelo(),b=S.banco(m),num={tipo:'TEATRO',csv_data:b.csv_data,teatro_modelo:b.teatro_modelo};
        const atual={id:'mapa1',config:{setores:[{id:'s1',cadeiras:{}}]}};
        await S.conferir(num,async()=>atual);console.log(JSON.stringify({payload:{modelo:m.id,numeracao:num},atual}));})().catch(e=>{console.error(e);process.exitCode=1});
} else if(require.main===module) executar().catch(e=>{console.error(e);process.exitCode=1});
module.exports={modelo};
