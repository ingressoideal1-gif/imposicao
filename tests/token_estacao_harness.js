const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/supabase-config.js','utf8');
const code = source.slice(source.indexOf('(function () {', source.indexOf('// ─── Toda chamada ao motor')));
function context(origin, localToken='token-local-sintetico', bearer='jwt-sintetico') {
    const calls=[], events=[];
    const win={location:new URL(origin), dispatchEvent:e=>events.push(e.type),
        fetch: async (url,options={})=>{ calls.push({url,headers:new Headers(options.headers)}); return {status:String(url).includes('recusado')?401:200}; }};
    const c={window:win, sessionStorage:{getItem:()=>JSON.stringify({token:localToken})},
        Headers, Request, URL, Event, API_PAINEL:'https://projeto.supabase.co/functions/v1/painel',
        supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:bearer}}})}}};
    vm.createContext(c); vm.runInContext(code,c);
    return {fetch:win.fetch,calls,events};
}
(async()=>{
    const local=context('http://127.0.0.1:9000/');
    await local.fetch('/api/print/submit');
    assert.equal(local.calls.at(-1).headers.get('X-NewProd-Sessao'),'token-local-sintetico');
    await local.fetch(new Request('http://127.0.0.1:9000/api/print/submit',{headers:{'X-Teste':'preservado'}}));
    assert.equal(local.calls.at(-1).headers.get('X-Teste'),'preservado');
    assert.equal(local.calls.at(-1).headers.get('X-NewProd-Sessao'),'token-local-sintetico');
    for(const url of ['https://projeto.supabase.co/auth/v1/token','https://externo.invalid/api/teste','http://127.0.0.1:9090/api/teste']){
        await local.fetch(url);
        assert.equal(local.calls.at(-1).headers.get('X-NewProd-Sessao'),null);
        assert.equal(local.calls.at(-1).headers.get('Authorization'),null);
    }
    await local.fetch('/api/recusado'); assert.deepEqual(local.events,['newprod-sessao-expirada']);
    const cloud=context('https://imposition.ai-ideal.com.br/');
    await cloud.fetch('http://127.0.0.1:9000/api/print/submit');
    assert.equal(cloud.calls.at(-1).headers.get('Authorization'),'Bearer jwt-sintetico');
    assert.equal(cloud.calls.at(-1).headers.get('X-NewProd-Sessao'),null);
    await cloud.fetch('https://projeto.supabase.co/functions/v1/painel/api/propostas/consultar');
    assert.equal(cloud.calls.at(-1).headers.get('Authorization'),'Bearer jwt-sintetico');
    await cloud.fetch('http://127.0.0.1:9000/api/print/submit',{headers:{Authorization:'Bearer fornecido'}});
    assert.equal(cloud.calls.at(-1).headers.get('Authorization'),'Bearer fornecido');
    console.log('Token local isolado, Request preservado, revogacao e agente pela nuvem: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
