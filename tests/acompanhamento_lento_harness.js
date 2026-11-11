const fs = require('fs');
const assert = require('assert/strict');
const source = fs.readFileSync('frontend/pedido.js', 'utf8');
const helper = source.slice(source.indexOf('async function entregarLoteComAcompanhamento('), source.indexOf('async function executarPedImposition('));
const flush = () => new Promise(resolve => setImmediate(resolve));

async function scenario({delay=6000, networkFailures=0, forbidden=false, alwaysTimeout=false, cancel=false}={}) {
    let now=0, id=0, pulses=0, sends=0, settled=false, error=null;
    const timers=new Map(), controller=new AbortController();
    const schedule=(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;};
    const clear=i=>timers.delete(i);
    const fetch=(_url,options)=>{
        pulses++;
        assert.equal(JSON.parse(options.body).acao,'acompanhar');
        if(forbidden) return Promise.resolve({ok:false,status:403,json:async()=>({})});
        if(pulses===1) return Promise.resolve({ok:true,status:200,json:async()=>({acao:'acompanhar'})});
        if(networkFailures-->0) return Promise.reject(new TypeError('network'));
        return new Promise((resolve,reject)=>{
            const finish=()=>{options.signal.removeEventListener('abort',abort);resolve({ok:true,status:200,json:async()=>({acao:'acompanhar'})});};
            const timer=schedule(finish,alwaysTimeout?120000:delay);
            const abort=()=>{clear(timer);options.signal.removeEventListener('abort',abort);reject(new DOMException('timeout','AbortError'));};
            options.signal.addEventListener('abort',abort,{once:true});
        });
    };
    const run=new Function('fetch','setTimeout','clearTimeout',helper+';return entregarLoteComAcompanhamento;')(fetch,schedule,clear);
    const task=run({entregar(){sends++;return new Promise(resolve=>schedule(()=>resolve(true),70000));}},
        {name:'miolo.pdf',token_entrega:'synthetic',acompanhar_entrega:true},{},'http://synthetic',{},controller.signal)
        .then(()=>{settled=true;},e=>{settled=true;error=e;});
    if(cancel)schedule(()=>controller.abort(),32000);
    for(let i=0;i<100 && !settled;i++) {
        await flush();
        if(settled)break;
        const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
        assert.ok(next,'tarefa precisa de um prazo finito');
        timers.delete(next[0]);now=next[1].at;next[1].fn();
    }
    await task;
    assert.equal(sends,forbidden?0:1,'nunca reenviar PDF');
    assert.equal(timers.size,0,'limpar todos os timers');
    return {error,pulses,now};
}
(async()=>{
    assert.equal((await scenario()).error,null,'resposta de acompanhamento em 6s deve preservar envio de 70s');
    assert.equal((await scenario({networkFailures:1})).error,null,'repetir somente consulta transitoria');
    assert.equal((await scenario({networkFailures:2})).error,null);
    const refused=await scenario({forbidden:true});assert.ok(refused.error);assert.equal(refused.pulses,1);
    const lost=await scenario({alwaysTimeout:true});assert.ok(lost.error);assert.notEqual(lost.error.name,'AbortError');assert.ok(lost.now<300000);assert.equal(lost.pulses,4);
    const canceled=await scenario({cancel:true});assert.ok(canceled.error);assert.equal(canceled.pulses,2);
    console.log('OK: acompanhamento lento, falhas transitorias, recusa, perda persistente e cancelamento; PDF enviado uma unica vez.');
})().catch(e=>{console.error(e);process.exitCode=1;});
