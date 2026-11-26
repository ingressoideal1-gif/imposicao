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
async function conferirNumeracaoDaComposicao() {
 let adapter;
 const original={id:7,amostra_num_id:'lista',numeracao_id:'espelho-antigo',verso:false};
 const state={osItens:{o:[original]},cores:[],numeracoes:[
  {id:'lista',print_mode:'front'},
  {id:'confirmada',print_mode:'duplex'}
 ]};
 const chamadas=[];
 const container={querySelector:()=>null,append:host=>{host.isConnected=true;}};
 const miniatura='data:image/png;base64,fixture';
 const window={ImpositionTraceDraw:{configure:v=>adapter=v},VersoDoModelo:{
  aplicar(item,num){item.verso=num.print_mode==='duplex';}
 }};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{
  window,state,pdfViewerState:{},crypto:{randomUUID:()=> 'fixture'},
  document:{getElementById:()=>container,createElement:()=>({
   style:{},dataset:{},width:1,height:1,append(){},setAttribute(){},remove(){},toDataURL:()=>miniatura
  })},
  resolverNumeracaoParaModelo:num=>num,
  formatoDoModelo:()=>({width_mm:90,height_mm:140}),
  garantirFontesCarregadas:async()=>{},fontesDosElementos:()=>[],preloadAmostraItemPdfElements:async()=>{},
  drawAmostraFace:async(item,face,_canvas,_empty,_fmt,_cor,num)=>{
   chamadas.push([face,num.id,item.amostra_num_id,item.numeracao_id,item.verso]);
  }
 });
 const binding={osId:'o',index:0,model:'7'};
 const compose=draft=>adapter.compose(binding,draft);
 const amostras=await compose({numbering_id:'confirmada',files:{front:'pdf-frente',back:'pdf-verso'}});
 assert.equal(amostras.front,miniatura);
 assert.equal(amostras.back,miniatura);
 assert.deepEqual(chamadas,[
  ['front','confirmada','confirmada','confirmada',true],
  ['back','confirmada','confirmada','confirmada',true]
 ]);
 assert.deepEqual(original,{id:7,amostra_num_id:'lista',numeracao_id:'espelho-antigo',verso:false});
 assert.deepEqual(Object.keys(state.osItens),['o']);

 await assert.rejects(compose({numbering_id:'ausente',files:{front:'pdf'}}),/Numera.*do modelo 7.*indispon/);
 await assert.rejects(compose({numbering_id:null,files:{front:'pdf'}}),/Numera.*do modelo 7.*indispon/);
 assert.equal(chamadas.length,2);

 await compose({files:{front:'pdf'}});
 assert.deepEqual(chamadas.at(-1),['front','lista','lista','espelho-antigo',false]);
}
(async()=>{for(const mode of ['ok','session','old','offline','denied','gabarito','trace','trace-old'])await scenario(mode);
 await conferirDownload(false);await conferirDownload(true);
 await conferirNumeracaoDaComposicao();
 console.log('Transporte da Ponte e download do CDR para conferência OK');})().catch(e=>{console.error(e);process.exitCode=1;});
