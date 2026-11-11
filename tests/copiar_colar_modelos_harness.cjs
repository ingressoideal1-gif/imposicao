const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const code = source.slice(source.indexOf('window.copiarArte ='), source.indexOf('/**', source.indexOf('window.colarArte =')));
function setup() {
    const storage = new Map(), messages = [], writes = [], rendered = [], bridge = [];
    const models = [{id:1,arte_url:'https://example.invalid/first.pdf'},
        {id:2,arte_url:'https://example.invalid/second.pdf'},
        {id:3,arte_url:null,amostra_arte_base64:'https://example.invalid/amostras_renderizadas/sample.jpg'},
        {id:4,arte_url:'https://example.invalid/destination.pdf',amostra_cor_id:7,amostra_num_id:8}];
    const state = {osItens:{order:models}};
    const context = {window:{ImpositionTraceDraw:{assertCanPaste(){},artPasted:(...x)=>bridge.push(x)}},state,
        localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
        navigator:{},toast:(...x)=>messages.push(x),console,
        document:{getElementById:()=>({value:'',files:[]}),querySelector:()=>null},
        ehRenderComposto:url=>url.includes('amostras_renderizadas'),
        invalidarArteVetorial:item=>{item.arte_json=null;},
        saveAmostraToDB:async(id,os,data)=>{writes.push({id,os,data});return {confirmado:true};},
        renderItemAmostraCombinada:async(...x)=>rendered.push(x),
        atualizarMarcasDeArteCompartilhada:()=>{}};
    vm.createContext(context);vm.runInContext(code,context);
    return {context,models,state,storage,messages,writes,rendered,bridge,api:context.window};
}
(async()=>{
    let t=setup();
    await t.api.copiarArte(null,'frente','order',1);
    await t.api.copiarArte(null,'frente','order',3);
    t.context.navigator.clipboard={readText:async()=>{throw Error('Nao recuperar clipboard antigo');}};
    await t.api.colarArte(3,'order',4);
    assert.equal(t.writes.length,0,'copia sem original invalida a anterior');
    assert.equal(t.models[3].arte_url,'https://example.invalid/destination.pdf');
    await t.api.copiarArte('https://example.invalid/amostras_renderizadas/sample.jpg','frente');
    await t.api.colarArte(3,'order',4);assert.equal(t.writes.length,0,'amostra nunca vira original');
    t=setup();
    await t.api.copiarArte('https://example.invalid/stale.pdf','frente','order',2);
    assert.equal(t.state.copiedArte.url,t.models[1].arte_url,'ID resolve o original atual');
    await t.api.colarArte(3,'order',4);
    assert.equal(t.models[3].arte_url,t.models[1].arte_url);
    assert.equal(t.writes[0].data.amostra_cor_id,7);assert.equal(t.writes[0].data.amostra_num_id,8);
    assert.equal(t.models[1].arte_url,'https://example.invalid/second.pdf','origem preservada');
    assert.equal(t.models[3]._needsSnapshot,true);assert.equal(t.rendered.length,1);assert.equal(t.bridge.length,1);
    t=setup();await t.api.copiarArte(null,'frente','order',1);
    t.storage.set('imposicao_copied_arte',JSON.stringify({url:t.models[1].arte_url,face:'frente'}));
    await t.api.colarArte(3,'order',4);assert.equal(t.models[3].arte_url,t.models[1].arte_url,'ultima copia de outra aba prevalece');
    t=setup();await t.api.copiarArte(null,'frente','order',1);
    t.context.saveAmostraToDB=async()=>{throw Error('Falha simulada');};
    t.context.console={error(){}};
    await t.api.colarArte(3,'order',4);
    assert.equal(t.models[3].arte_url,'https://example.invalid/destination.pdf','falha preserva destino');
    assert.equal(t.bridge.length,0);assert.equal(t.rendered.length,0);assert.equal(t.models[3]._colandoArte,undefined);
    t.context.saveAmostraToDB=async()=>({confirmado:false});
    await t.api.colarArte(3,'order',4);assert.equal(t.bridge.length,0);
    t=setup();t.models[1].verso_arte_url='https://example.invalid/back.pdf';
    await t.api.copiarArte(null,'verso','order',2);await t.api.colarArte(3,'order',4,'verso');
    assert.equal(t.models[3].verso_arte_url,t.models[1].verso_arte_url);assert.equal(t.models[3].arte_url,'https://example.invalid/destination.pdf');
    await t.api.colarArte(0,'order',4);assert.equal(t.writes.length,1,'indice de outro card rejeitado');
    console.log('Copiar/colar: original atual, vazio, amostra, outra aba, falha, recibo e verso OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
