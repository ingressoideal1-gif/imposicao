const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let consultas=0, recibos=0, ocupado=false, pausado=false, adiar=false, soltar, autonoma=false;
const ctx={URL,Blob,FormData,AbortController,structuredClone,setTimeout,clearTimeout,
    document:{querySelectorAll:()=>[],body:{}},MutationObserver:class{observe(){}disconnect(){}},
    supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'sessao-sintetica'}}})}},consultarPropostas:()=>{},
    AntecipacaoPedidos:{consultar:async({receber,avancar})=>{
        consultas++;
        if(adiar)await new Promise(resolve=>{soltar=resolve});
        await receber({modelo:'1'});avancar(0);return {proximo:0,limitados:false};
    }},
    fetch:async(url,op)=>{
        if(url.endsWith('/estado'))return {ok:true,json:async()=>({empresa:'teste',setor:'laser',modelos:[],fila:{ocupado,pausado},coleta_autonoma:{habilitada:autonoma}})};
        assert.ok(url.endsWith('/antecipacao'),'não chama impressão');
        assert.equal(op.headers.Authorization,'Bearer sessao-sintetica');
        assert.ok(!op.body.includes('sessao-sintetica'),'credencial não pertence aos metadados persistidos');
        recibos++;return {ok:true,json:async()=>({recebido:true,modelo:'1'})};
    }};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/pacotes-locais.js','utf8'),ctx);
const api=ctx.PacotesLocais;
const iniciar=opts=>api.iniciar({base:'http://127.0.0.1:9011',token:'sintetico-000000000000000000000000',empresa:'teste',...opts});
const flush=async()=>{await new Promise(setImmediate);await new Promise(setImmediate)};
(async()=>{
    try {
        iniciar();await flush();assert.equal(consultas,0,'coleta exige opt-in separado');
        autonoma=true;iniciar({antecipar:true});await flush();assert.equal(consultas,0,'agente autonomo impede coleta duplicada no navegador');autonoma=false;
        iniciar({antecipar:true});await flush();assert.equal(recibos,1);
        ocupado=true;iniciar({antecipar:true});await flush();assert.equal(consultas,1);
        ocupado=false;pausado=true;iniciar({antecipar:true});await flush();assert.equal(consultas,1);
        pausado=false;adiar=true;iniciar({antecipar:true});await flush();
        assert.equal(consultas,2);api.parar();soltar();await flush();
        assert.equal(recibos,1,'coleta de sessão encerrada não deve enviar metadados');
        console.log('OK: opt-in, ociosidade, pausa e cancelamento antes da admissão');
    } finally {api.parar()}
})().catch(e=>{console.error(e);process.exitCode=1});
