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
   if(url.endsWith('/health'))return {ok:true,json:async()=>({application:'Ponte Imposition',protocol:1,ready:true,direct_transport:mode!=='old'})};
   assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).token,'synthetic');
   return {ok:mode!=='denied',json:async()=>({message:mode==='denied'?'Acesso recusado':'aberto'})};
  }
 });
 if(mode==='ok') {
  assert.equal((await adapter.request('open',{order:123,model:7})).message,'aberto');
  assert.equal((await adapter.request('open',{order:123,model:8})).message,'aberto');
  assert.equal(calls.length,4);
 } else {
  await assert.rejects(adapter.request('open',{}),mode==='session'?/Entre novamente/:mode==='old'?/1.3.0/:mode==='offline'?/rede local/:/Acesso recusado/);
  assert.equal(calls.length,mode==='denied'?2:1);
 }
}
(async()=>{for(const mode of ['ok','session','old','offline','denied'])await scenario(mode);console.log('Transporte direto: sem janelas, sem cookies, sem retry de escrita e com recusas preservadas OK');})().catch(e=>{console.error(e);process.exitCode=1;});
