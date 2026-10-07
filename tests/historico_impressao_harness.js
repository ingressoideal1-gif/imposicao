const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const src=fs.readFileSync('frontend/script.js','utf8');
function extrair(nome){let p=src.indexOf('function '+nome+'(');if(src.slice(p-6,p)==='async ')p-=6;return src.slice(p,src.indexOf('\n}',p)+2);}
(async()=>{
 const chamadas=[], avisos=[];
 const ctx=vm.createContext({crypto,Blob,FormData,AbortSignal,console,setTimeout:()=>{},
   window:{location:{hostname:'127.0.0.1'}},
   document:{getElementById:id=>id==='print-direct-printer'?{value:'Sintetica'}:null,querySelector:()=>null},
   AGENTE_LOCAL_URL:'http://127.0.0.1:9001',
   _printBlobQueue:[{name:'1002240_set1_01_capa.pdf',blob:new Blob(['sintetico'])}],
   confirmarRetomadaImpressao:()=>true,hashArquivoImpressao:async()=> 'a'.repeat(64),nomeParaSpool:(_n,s)=>s,
   toast:(...a)=>avisos.push(a),
   fetch:async(url,opts)=>{chamadas.push({url,options:JSON.parse(opts.body.get('options'))});return {ok:true};}
 });
 vm.runInContext(['contextoHistoricoImpressao','contextoHistoricoArquivo','sendPrintJob'].map(extrair).join('\n'),ctx);
 const alvos=[{osId:'vibe_23143',itemId:'1002240'},{osId:'vibe_23144',itemId:'1002241'}];
 const contexto=ctx.contextoHistoricoImpressao(alvos,true);alvos[0].itemId='999';
 ctx.window._printHistoryContext=contexto;
 await ctx.sendPrintJob();
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].url,'http://127.0.0.1:9001/api/print/submit');
 const c=chamadas[0].options.historico_contexto;
 assert.deepEqual(c.alvos,[{pedido:'23143',modelo:'1002240'},{pedido:'23144',modelo:'1002241'}]);
 assert.equal(c.tipo,'capa');assert.equal(c.reimpressao,true);
 assert.equal(ctx.contextoHistoricoArquivo(contexto,'123_03_contracapa.pdf').tipo,'contracapa');
 assert.equal(ctx.contextoHistoricoArquivo(contexto,'123_02_miolo.pdf').tipo,'miolo');
 assert.equal(ctx.contextoHistoricoArquivo(null,'avulso.pdf').alvos.length,0);
 await ctx.sendPrintJob();assert.equal(chamadas.length,1,'envio aceito nao deve repetir');
 let recebido;
 ctx.criarEntregaDeImpressao=opts=>{recebido=opts;return {entregar:async()=>{},finalizar:()=>true};};
 vm.runInContext(extrair('sendPrintJobDirect'),ctx);
 assert.equal(await ctx.sendPrintJobDirect([],{historicoContexto:contexto}),true);
 assert.equal(recebido.historicoContexto,contexto);
 console.log('OK: contexto capturado, modelos combinados, reimpressao, partes, modal, entrega direta e nao duplicacao.');
})().catch(e=>{console.error(e);process.exitCode=1;});
