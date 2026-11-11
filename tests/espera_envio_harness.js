const fs = require('fs');
const assert = require('assert/strict');
const fonte = fs.readFileSync('frontend/pedido.js','utf8');
const helper = fonte.slice(fonte.indexOf('async function entregarLoteComAcompanhamento('), fonte.indexOf('async function executarPedImposition('));
const flush = () => new Promise(resolve => setImmediate(resolve));
async function caso({renovacoes=11, falhar=false, legado=false, rejeitarInicial=false}={}) {
    const timers=new Map();let id=0,pulsos=0,envios=0,liberar;
    const fetch=async(_url,opts)=>{
        pulsos++;
        assert.deepEqual(JSON.parse(opts.body),{token:'sintetico',acao:'acompanhar'});
        return {ok:!rejeitarInicial && !(falhar && pulsos===2),json:async()=>({acao:'acompanhar'})};
    };
    const iniciar = new Function('fetch','setTimeout','clearTimeout',helper+'; return entregarLoteComAcompanhamento;')(
        fetch,(fn,ms)=>{timers.set(++id,{fn,ms});return id;},i=>timers.delete(i));
    const entrega={entregar(){envios++;return new Promise(resolve=>liberar=resolve);}};
    const tarefa=iniciar(entrega,{name:'miolo.pdf',token_entrega:'sintetico',acompanhar_entrega:!legado},{},'http://teste',{},new AbortController().signal);
    const resultado=tarefa.then(()=>null,e=>e);
    await flush();
    if(rejeitarInicial){assert.ok(await resultado);assert.equal(envios,0);return;}
    for(let i=0;i<renovacoes;i++) {
        const t=[...timers].find(([,v])=>v.ms===30000);
        if(!t)break;
        timers.delete(t[0]);t[1].fn();await flush();
    }
    assert.equal(envios,1);
    liberar(true);
    const erro=await resultado;
    assert.equal(Boolean(erro),falhar);
    assert.equal(timers.size,0);
    assert.equal(pulsos,legado?0:falhar?2:renovacoes+1);
}
(async()=>{
    await caso(); // 330 segundos simulados, sem aguardar tempo real.
    await caso({falhar:true});
    await caso({legado:true});
    await caso({rejeitarInicial:true});
    console.log('OK: acompanhamento por 330 s, falha sem reenvio, compatibilidade e limpeza de timers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
