const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function scenario(mode='ok') {
 let adapter,calls=[];
 const window={open:()=>{throw Error('Nao deve abrir janelas');},ImpositionTraceDraw:{configure:v=>adapter=v}};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{
  window,setTimeout,clearTimeout,AbortController,
  supabaseClient:{auth:{getSession:async()=>({data:{session:mode==='session'?null:{access_token:'synthetic'}}})}},
  fetch:async(url,opts)=>{
   calls.push(url);assert.equal(opts.credentials,'omit');
   if(mode==='offline')throw TypeError('network');
   if(url.endsWith('/health'))return {ok:true,json:async()=>({application:'Ponte Imposition',protocol:1,ready:true,editors:['tracedraw'],features:mode==='trace-old'?[]:['tracedraw-cdr'],direct_transport:mode!=='old'})};
   assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).token,'synthetic');
   return {ok:mode!=='denied',json:async()=>({message:mode==='denied'?'Acesso recusado':'aberto'})};
  }
 });
 if(mode==='trace' || mode==='trace-old') {
  const data={order:123,model:7,editor:'tracedraw'};
  if(mode==='trace-old'){
   await assert.rejects(adapter.request('open_cdr',data),/Atualize a Ponte/);assert.equal(calls.length,1);
  }else{
   assert.equal((await adapter.request('open_cdr',data)).message,'aberto');
   assert.match(calls[1],/producao\/open_cdr$/);
  }
 } else if(mode==='gabarito') {
  await assert.rejects(adapter.request('open',{gabarito:true}),/Atualize.*Gab/);assert.equal(calls.length,1);
 } else if(mode==='ok') {
  assert.equal((await adapter.request('open',{order:123,model:7})).message,'aberto');
  assert.equal((await adapter.request('open',{order:123,model:8})).message,'aberto');
  assert.equal(calls.length,4);
 } else {
  await assert.rejects(adapter.request('open',{}),mode==='session'?/Entre novamente/:mode==='old'?/1.3.0/:mode==='offline'?/rede local/:/Acesso recusado/);
  assert.equal(calls.length,mode==='denied'?2:1);
 }
}
async function conferirDownload(multipaginas) {
 let adapter, baixados=0;
 const link={click(){baixados++;},remove(){}};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{
  window:{ImpositionTraceDraw:{configure:v=>adapter=v}},API_PAINEL:'https://painel.invalid',
  URLSearchParams,URL:{createObjectURL:()=> 'blob:teste',revokeObjectURL(){}},setTimeout:fn=>fn(),
  document:{body:{append(){}},createElement:()=>link},
  supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},
  fetch:async(url,opts)=>{
   const pedido=new URL(url);
   assert.equal(pedido.pathname,'/api/corel/conferencia');
   assert.equal(pedido.searchParams.get('documento'),multipaginas?'modelo-7':'produto-45');
   assert.equal(opts.headers.Authorization,'Bearer synthetic');
   return new Response('cdr',{headers:{'Content-Type':'application/octet-stream'}});
  }
 });
 await adapter.baixarCdr({order:'123',model:'7',item:{id_produto:45,modo_pdf:multipaginas}});
 assert.equal(baixados,1);assert.equal(link.download,'Pedido-123-Modelo-7-conferencia.cdr');
}
(async()=>{for(const mode of ['ok','session','old','offline','denied','gabarito','trace','trace-old'])await scenario(mode);
 await conferirDownload(false);await conferirDownload(true);
 console.log('Transporte da Ponte e download do CDR para conferência OK');})().catch(e=>{console.error(e);process.exitCode=1;});
