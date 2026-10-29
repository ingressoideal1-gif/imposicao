const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function run(choice) {
 let adapter,requests=[],dialog;
 class El {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.handlers={};}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(name,fn){this.handlers[name]=fn;}
  close(){} remove(){}
  showModal(){dialog=this;queueMicrotask(()=>{
   const button=this.children[2].children.find(b=>b.textContent===choice);
   assert(button&&!button.disabled);button.handlers.click();
  });}
 }
 const document={createElement:tag=>new El(tag),body:new El('body')};
 const window={open:()=>{throw Error('Nao abrir janela');},ImpositionTraceDraw:{configure:a=>adapter=a}};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{document,window,setTimeout,clearTimeout,AbortController,
  supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'sintetico'}}})}},
  fetch:async(url,options)=>{
   if(url.endsWith('/health'))return {ok:true,json:async()=>({application:'Ponte Imposition',protocol:1,direct_transport:true,ready:true})};
   const data=JSON.parse(options.body).data;requests.push(data);
   return {ok:true,json:async()=>data.origin?{message:'aberto'}:{requires_selection:true,selection_token:'sintetico',disk_available:true,drive_available:true}};
  }});
 const result=adapter.request('open',{order:123,model:7});
 if(choice==='Cancelar'){await assert.rejects(result,/cancelada/);assert.equal(requests.length,1);}
 else {assert.equal((await result).message,'aberto');assert.equal(requests.length,2);assert.equal(requests[1].origin,choice.endsWith('disco')?'disk':'drive');assert.equal(requests[1].selection_token,'sintetico');}
 assert(dialog);
}
(async()=>{for(const c of ['Abrir do disco','Abrir do Drive','Cancelar'])await run(c);console.log('Escolha disco/Drive/cancelar: OK, sem publicacao nem janelas.');})().catch(e=>{console.error(e);process.exitCode=1;});
