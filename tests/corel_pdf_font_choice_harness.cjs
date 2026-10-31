const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function scenario(choice,{missing=true,curves=true,origin='pdf'}={}) {
 let adapter,dialogs=[],requests=[],selected=false;
 function element(tag){return {tag,children:[],style:{},listeners:{},append(...n){this.children.push(...n)},addEventListener(e,cb){this.listeners[e]=cb},close(){},remove(){},showModal(){
   dialogs.push(this);const actions=this.children.at(-1),buttons=actions.children;
   assert.equal(buttons.find(x=>x.textContent==='Abrir como texto editável').disabled,missing);
   assert.equal(buttons.find(x=>x.textContent==='Abrir em curvas').disabled,!curves);
   const button=buttons.find(x=>x.textContent===choice);assert.ok(button&&!button.disabled);
   queueMicrotask(()=>button.listeners.click());
 }};}
 const document={createElement:element,body:{append(){}}};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{
  document,window:{ImpositionTraceDraw:{configure:v=>adapter=v}},setTimeout,clearTimeout,AbortController,
  supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},
  fetch:async(url,opts)=>{
   if(url.endsWith('/health'))return {ok:true,json:async()=>({application:'Ponte Imposition',protocol:1,ready:true,direct_transport:true,editors:['coreldraw']})};
   const data=JSON.parse(opts.body).data;requests.push(data);
   if(selected)return {ok:true,json:async()=>({message:'aberto'})};selected=true;
   return {ok:true,json:async()=>({requires_font_selection:true,pdf_font_signature:'digest',missing_fonts:missing?['Fonte <b>Original</b>']:[],library_fonts:[],text_available:!missing,curves_available:curves,origin,message:'Conferir fontes'})};
  }
 });
 const run=adapter.request('open',{order:123,model:7,editor:'coreldraw'});
 if(choice==='Cancelar'){await assert.rejects(run,/cancelada/);assert.equal(requests.length,1);}
 else{assert.equal((await run).message,'aberto');assert.equal(requests.length,2);assert.equal(requests[1].origin,origin);assert.equal(requests[1].pdf_font_signature,'digest');assert.equal(requests[1].pdf_font_mode,choice==='Abrir em curvas'?'curves':choice==='Verificar fontes novamente'?null:'text');}
 assert.equal(dialogs.length,1);
}
(async()=>{
 await scenario('Abrir em curvas');await scenario('Abrir como texto editável',{missing:false});
 await scenario('Cancelar');await scenario('Verificar fontes novamente',{curves:false,origin:'disk'});
 console.log('PDF: escolha texto/curvas, fontes ausentes, cancelamento e nova conferencia OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
