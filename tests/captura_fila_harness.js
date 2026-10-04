const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const posts = [];
const ctx = {URL, Blob, FormData, AbortController, structuredClone, setTimeout, clearTimeout,
    document: {querySelectorAll:()=>[], body:{}},
    MutationObserver: class {observe(){} disconnect(){}},
    PacoteEntrada: {criar: async fd => ({manifesto:{revisao:fd.get('id')}, envio:fd})},
    fetch: async (url, op) => {
        if (url.endsWith('/estado')) return {ok:true,json:async()=>({modelos:[]})};
        return new Promise((resolve,reject)=>{
            posts.push({id:op.body.get('id'), done:()=>resolve({ok:true,json:async()=>({recebido:true,revisao:op.body.get('id')})})});
            op.signal.addEventListener('abort',()=>reject(new Error('Cancelada')));
        });
    }};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('frontend/pacotes-locais.js','utf8'),ctx);
const api=ctx.PacotesLocais;
const ativar=()=>api.iniciar({base:'http://127.0.0.1:9011',token:'sintetico-00000000000000000000000000',capturar:true,empresa:'teste'});
const capturar=id=>{const f=new FormData();f.set('id',id);api.capturarEntrada(f,{})};
const flush=async()=>{await new Promise(setImmediate);await new Promise(setImmediate)};
(async()=>{
    try {
        ativar();capturar('1');capturar('2');await flush();
        assert.equal(posts.length,1,'uma transferência por vez');
        posts[0].done();await flush();
        assert.equal(posts.length,2,'segunda captura deve aguardar, não desaparecer');
        api.parar();ativar();capturar('3');await flush();
        assert.equal(posts.length,3,'sessão anterior não bloqueia nova captura');
        capturar('4');await flush();assert.equal(posts.length,3);
        posts[2].done();await flush();assert.equal(posts.length,4);
        posts[3].done();await flush();
        assert.equal(api.estadoCaptura().estado,'recebida');
        assert.equal(api.estadoCaptura().pendentes,0);
        for(let i=0;i<10;i++)capturar('limite-'+i);
        await flush();
        assert.equal(api.estadoCaptura().pendentes,8);
        assert.equal(api.estadoCaptura().falhas,2,'excesso recusado explicitamente');
        for(let i=0;i<8;i++){posts.at(-1).done();await flush()}
        assert.equal(api.estadoCaptura().pendentes,0);
        assert.equal(api.estadoCaptura().falhas,2,'sucessos posteriores não apagam falha da fila');
        assert.ok(api.estadoCaptura().ultimaFalha.includes('cheia'));
        console.log('OK: fila de capturas, serialização, reinício e cancelamento por sessão');
    } finally {api.parar()}
})().catch(e=>{console.error(e);process.exitCode=1});
