const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/supabase-config.js','utf8');
const code = source.slice(source.indexOf('(function () {', source.indexOf('// ─── Toda chamada ao motor')));
function context(origin, localToken='token-local-sintetico', bearer='jwt-sintetico') {
    const calls=[], events=[];
    const win={location:new URL(origin), dispatchEvent:e=>events.push(e.type),
        fetch: async (url,options={})=>{ calls.push({url,headers:new Headers(options.headers)}); return {ok:true,status:String(url).includes('recusado')?401:200,json:async()=>({cancelado:true})}; }};
    const c={window:win, sessionStorage:{getItem:()=>JSON.stringify({token:localToken})},
        Headers, Request, URL, Event, API_PAINEL:'https://projeto.supabase.co/functions/v1/painel',
        supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:bearer}}})}}};
    vm.createContext(c); vm.runInContext(code,c);
    return {fetch:win.fetch,calls,events,c};
}
(async()=>{
    const panel=fs.readFileSync('frontend/script.js','utf8');
    const base=panel.match(/const AGENTE_LOCAL_URL = [\s\S]*?;/)[0];
    const chooser=panel.slice(panel.indexOf('async function escolherHotFolder()'),panel.indexOf('// Plano B do seletor'));
    for (const origin of ['http://127.0.0.1:9001','http://localhost:9001','http://localhost:9000','http://127.0.0.1:8080']) {
        const station=context(origin+'/', 'token-local-sintetico', null);
        Object.assign(station.c,{document:{getElementById:()=>null},_hotFolderPath:()=>'',_hotFolderStatus:()=>{}});
        vm.runInContext(base+chooser,station.c);
        station.c.fetch=station.c.window.fetch;
        await station.c.escolherHotFolder();
        assert.equal(station.calls.length,1);
        assert.equal(station.calls[0].url,origin+'/api/hotfolder/escolher');
        assert.equal(station.calls[0].headers.get('X-NewProd-Sessao'),'token-local-sintetico');
        assert.equal(station.calls[0].headers.get('Authorization'),null);
    }
    const remote=context('https://imposition.ai-ideal.com.br/');
    vm.runInContext(base+'globalThis.destino=AGENTE_LOCAL_URL;',remote.c);
    assert.equal(remote.c.destino,'http://127.0.0.1:9000');
    const extract=name=>{
        const start=panel.indexOf('function '+name+'(');
        assert(start>=0);
        const end=panel.indexOf('\n}',start)+2;
        const asyncStart=panel.slice(start-6,start)==='async '?start-6:start;
        return panel.slice(asyncStart,end);
    };
    for(const origin of ['http://127.0.0.1:9001','http://localhost:9001']) {
        const calls=[],notices=[],footer={style:{}},w={location:new URL(origin)};
        const pilot={window:w,URL,AbortController,setTimeout:()=>1,clearTimeout:()=>{},
            document:{getElementById:()=>footer},toast:m=>notices.push(m),
            getEstacaoEscolhida:()=>assert.fail('Piloto nao usa estacao de producao salva'),
            _agentIdLocalCache:null,_agentIdLocalEm:0,
            fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({version:'NewProd 1.2.355-piloto-local.16',agent_id:'piloto-sintetico',onde:'local'})};}};
        vm.createContext(pilot);
        vm.runInContext(base+['showAgentUpdateWarning','_baseDoAgenteAgora','atualizarVersaoAgenteRodape','descobrirAgentIdLocal','verificarAtualizacaoAgente'].map(extract).join('\n'),pilot);
        pilot.showAgentUpdateWarning('http://127.0.0.1:9000','99.0');
        assert.equal(await pilot._baseDoAgenteAgora('http://127.0.0.1:9000'),origin);
        await pilot.atualizarVersaoAgenteRodape();
        assert.match(footer.textContent,/piloto-local/);
        assert.equal(await pilot.descobrirAgentIdLocal(),'piloto-sintetico');
        await pilot.verificarAtualizacaoAgente(false);
        await pilot.verificarAtualizacaoAgente(true);
        assert(notices.every(m=>m.includes('pacote próprio')));
        assert.equal(notices.length,2);
        assert(calls.every(u=>u===origin+'/api/status'));
    }
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
