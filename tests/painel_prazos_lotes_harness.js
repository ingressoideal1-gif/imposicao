const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('frontend/script.js','utf8');
function extract(name){const i=source.search(new RegExp('\\n(?:async )?function '+name+'\\('));assert(i>=0);return source.slice(i,source.indexOf('\n}',i)+2)}
async function models(fail){
 let calls=0,writes=0,sessions=0;const rows=Array.from({length:501},()=>({id_int:1,status_arte:fail?'PRONTO':'EM ARTE'}));
 const ctx={console:{log(){},warn(){},error(){}},state:{ordens:Array.from({length:4685},(_,i)=>({numero:String(i+1),id:'vibe_'+(i+1),status:'Em Arte'})),todasArtes:[]},pedidoIgnoradoNosPaineis:()=>false,temSessaoDoSupabase:async()=>{sessions++;return false},
 supabaseClient:{from(table){assert.equal(table,'pedidos_modelos');let ids,offset;return {select(){return this},in(_,v){ids=v;assert(v.length<=100);return this},order(){return this},range(a,b){offset=a;assert.equal(b-a,499);return this},then(resolve){calls++;return Promise.resolve({data:ids.includes(1)?rows.slice(offset,offset+500):[],error:fail&&calls===2?new Error('offline'):null}).then(resolve)},update(){writes++;throw Error('unexpected write')}}}},};
 vm.createContext(ctx);vm.runInContext(extract('sincronizarPedidosProntosParaEnvio'),ctx);await ctx.sincronizarPedidosProntosParaEnvio();assert.equal(writes,0);assert.equal(calls,fail?2:48);assert.equal(sessions,fail?0:1);
}
(async()=>{await models(false);await models(true);
 assert(!source.includes('function gravarTemposNoCard('), 'o navegador nao grava mais os inicios');
 console.log('OK: 4685 pedidos, paginacao de 501 modelos, falha parcial sem escrita, relogios somente leitura.');
})().catch(e=>{console.error(e);process.exitCode=1});
