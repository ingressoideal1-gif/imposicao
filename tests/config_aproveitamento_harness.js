const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../frontend/script.js'),'utf8');
const start=source.indexOf('async function salvarConfigAproveitamentoSegura(');
const end=source.indexOf('async function gravarProdutoCombinavel(',start);
assert(start>=0 && end>start);
(async()=>{
 let calls=0,session=null,response={ok:true,json:async()=>({configuracao:{valor:.275}})};
 const ctx=vm.createContext({supabaseClient:{auth:{getSession:async()=>({data:{session}})}},API_PAINEL:'https://exemplo.invalid/painel',fetch:async(url,options)=>{
   calls++;assert(url.endsWith('/api/config-aproveitamento/limiar'));assert.equal(options.headers.Authorization,'Bearer token-sintetico');assert.equal(JSON.parse(options.body).valor,.275);return response;
 }});
 vm.runInContext(source.slice(start,end),ctx);
 await assert.rejects(()=>ctx.salvarConfigAproveitamentoSegura('limiar',{valor:.275}),/administrador no painel web/);assert.equal(calls,0);
 session={access_token:'token-sintetico'};
 assert.equal((await ctx.salvarConfigAproveitamentoSegura('limiar',{valor:.275})).valor,.275);
 response={ok:false,json:async()=>({detail:'Sem permissao'})};
 await assert.rejects(()=>ctx.salvarConfigAproveitamentoSegura('limiar',{valor:.275}),/Sem permissao/);
 response={ok:true,json:async()=>({})};
 await assert.rejects(()=>ctx.salvarConfigAproveitamentoSegura('limiar',{valor:.275}),/nao confirmou/);
 console.log('Configuracao: sessao, payload, permissao e confirmacao verificadas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
