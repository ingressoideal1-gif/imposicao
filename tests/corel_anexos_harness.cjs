const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

async function transport({cancel=false,old=false}={}) {
 const requests=[],notices=[];let dialogs=0,adapter;
 function node(tag){return {tag,children:[],style:{},listeners:{},value:'1',append(...children){this.children.push(...children)},
  addEventListener(event,fn){this.listeners[event]=fn},close(){},remove(){},showModal(){
   dialogs++;const actions=this.children.at(-1);
   if(dialogs===1){this.children[2].children[0].value='2';queueMicrotask(()=>actions.children[cancel?1:0].listeners.click());}
   else queueMicrotask(()=>actions.children[1].listeners.click());
  }};}
 const ctx={window:{ImpositionTraceDraw:{configure:x=>adapter=x}},document:{createElement:node,body:{append(){}}},
  toast:(...args)=>notices.push(args),setTimeout,clearTimeout,AbortController,
  supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},
  fetch:async(url,options)=>{
   if(url.endsWith('/health'))return {ok:true,json:async()=>({application:'Ponte Imposition',protocol:1,direct_transport:true,ready:true,editors:['coreldraw'],features:old?[]:['anexos-corel']})};
   const data=JSON.parse(options.body).data;requests.push(data);
   let value=requests.length===1?{requires_attachment_page:true,attachment_pages:3,attachment_signature:'filehash',attachment_target:'target',attachment_destination:'Modelo / Frente'}:
    requests.length===2?{requires_font_selection:true,pdf_font_signature:'pdfhash',curves_available:true,text_available:false,missing_fonts:['Fonte'],attachment_target:'target'}:{message:'Inserido'};
   return {ok:true,json:async()=>value};
  }};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),ctx);
 const button={textContent:'Corel',disabled:false};
 await ctx.window.importarAnexoCorel({order:10,attachment_url:'https://example.test/image'},button);
 assert.equal(button.textContent,'Corel');assert.equal(button.disabled,false);
 if(old){assert.equal(requests.length,0);assert.match(notices[0][0],/1.10.0/);return;}
 if(cancel){assert.equal(requests.length,1);assert.match(notices[0][0],/cancelada/);return;}
 assert.equal(requests.length,3);assert.equal(requests[2].attachment_page,2);
 assert.equal(requests[2].attachment_signature,'filehash');assert.equal(requests[2].attachment_target,'target');
 assert.equal(requests[2].pdf_font_mode,'curves');assert.equal(requests[2].pdf_font_signature,'pdfhash');
 assert.equal(notices[0][1],'success');
}

async function list() {
 const source=fs.readFileSync('frontend/script.js','utf8');
 const fn=source.slice(source.indexOf('async function loadAnexosPedido('),source.indexOf('async function uploadAnexoPedido('));
 const buttons=[],calls=[];let html='';
 const container={set innerHTML(value){html=value;buttons.length=0;for(const m of value.matchAll(/data-corel-anexo="(\d+)"/g))buttons.push({dataset:{corelAnexo:m[1]},addEventListener(e,f){this.click=f}})},
  querySelectorAll:()=>buttons};
 const rows=[{arquivos:[{id:1,nome:'A.pdf',url:'https://test/A.pdf'},{id:2,nome:'B.png',url:'https://test/B.png'},{id:3,nome:'Hidden.pdf',url:'https://test/hidden',oculto:true}]}];
 const ctx={window:{importarAnexoCorel:(data)=>calls.push(data)},console,crypto:require('node:crypto').webcrypto,
  document:{getElementById:id=>id.startsWith('anexos-pedido-container')?container:null},
  supabaseClient:{from:()=>({select:()=>({eq:async()=>({data:rows})})})},updateAnexoSelectionCount(){},toast(){}};
 vm.runInNewContext(fn,ctx);await ctx.loadAnexosPedido('os1','10');
 assert.equal(buttons.length,2);buttons[1].click();assert.equal(calls[0].order,10);assert.equal(calls[0].attachment_url,'https://test/B.png');
 assert.match(html,/Preview/);assert.match(html,/Download/);assert.match(html,/Ocultar/);
}
(async()=>{await transport();await transport({cancel:true});await transport({old:true});await list();console.log('Anexos Corel: lista, pagina selecionada, curvas, cancelamento e ponte antiga OK');})().catch(e=>{console.error(e);process.exitCode=1;});
