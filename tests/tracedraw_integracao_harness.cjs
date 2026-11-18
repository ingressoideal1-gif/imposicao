const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(){this.children=[];this.dataset={};this.style={};this.isConnected=true;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  setAttribute(){}
  remove(){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.isConnected=false;}
}
(async()=>{
 const storage=new Map();
 const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const window={modeloEstaAprovado:item=>item.status_arte==='APROVADA_CLIENTE'},document={createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-integracao.js','utf8'),{window,document,localStorage});
 const api=window.ImpositionTraceDraw,host=new Element(),anchor=new Element(),original=new Element();host.append(original,anchor);
 const container={id:'amostras-itens-container',querySelector:()=>anchor};
 let allowPasteOpen=true;
 let openedModels;
 let calls=[],reloads=0,composeFails=false,confirmed=true,legacy=false,waitOpen=null,entry={art_origin:'tracedraw',art_revision:1,operation:'rev1',restorable:true};
 api.configure({baixarCdr:async b=>calls.push({action:'download',model:b.model}),confirmPasted:async()=>allowPasteOpen,canEdit:()=>true,compose:async()=>{if(composeFails)throw Error('Composição incompleta');return {front:'sample'};},
   reload:async()=>{reloads++;},request:async(action,data)=>{
    calls.push({action,data});
    if(action==='prepare')return legacy?{operation:'draft',files:{front:'pdf'}}:{drafts:[{model:7,operation:'draft',files:{front:'pdf'}}]};
    if(action==='open'){if(waitOpen)await waitOpen;return {message:'aberto',document_models:openedModels};}
    return {confirmed,pedido:123,modelo:7,state:action==='restore'?{restorable:false}:entry};
   }});
 api.mount(container,123,[{id:7}],'vibe_123');api.mount(container,123,[{id:7}],'vibe_123');
 assert.equal(host.children.length,3);assert.equal(host.children[0],original);
 const [gabLabel,open,trace,update,badge,feedback]=host.children[2].children;
 assert.equal(gabLabel.children[0].checked,false);
 await open.onclick();assert.equal(calls.at(-1).data.gabarito,undefined);gabLabel.children[0].checked=true;await open.onclick();assert.equal(calls.at(-1).data.gabarito,true);calls.shift();assert.equal(reloads,0);assert.equal(badge.hidden,true);
 await update.onclick();assert.equal(reloads,1);assert.match(badge.textContent,/TraceDraw.*1/);
 assert.deepEqual(calls.map(c=>c.action),['open','prepare','publish']);assert.equal(calls[2].data.samples.front,'sample');
 composeFails=true;await update.onclick();assert.equal(calls.at(-1).action,'prepare');assert.equal(reloads,1);
 assert.match(feedback.textContent,/incompleta/);assert.equal(badge.hidden,false);
 composeFails=false;confirmed=false;await update.onclick();assert.equal(reloads,1);assert.match(feedback.textContent,/não confirmada/);
 legacy=true;calls=[];await update.onclick();assert.deepEqual(calls.map(c=>c.action),['prepare']);assert.match(feedback.textContent,/versão antiga/);
 assert.deepEqual([open,trace,update].map(b=>b.textContent),['CorelDRAW','TraceDraw','Atualizar']);
 const other=new Element();api.mount({id:'cliente-amostras-itens-container',querySelector:()=>({parentElement:other})},123,[{id:7}]);
 assert.equal(other.children.length,0);
 await open.onclick();assert.equal(calls.at(-1).data.editor,'coreldraw');
 assert.match(api.label({art_origin:'tracedraw',art_revision:2,manifesto:{editor:'coreldraw'}}),/CorelDRAW/);
 assert(calls.every(c=>c.action==='prepare'?c.data.use_open_editor && !c.data.editor:c.data.editor==='coreldraw'));
 await api.artRemoved('vibe_123',7,'verso');
 assert.equal(calls.at(-1).action,'clear');assert.equal(calls.at(-1).data.face,'back');
 await api.artRemoved('vibe_123',7,'frente');
 assert.equal(calls.at(-1).data.face,'front');
 let release;waitOpen=new Promise(resolve=>{release=resolve;});
 const opening=open.onclick();
 await api.artRemoved('vibe_123',7,'verso');
 assert.equal(calls.at(-1).action,'open','limpeza aguarda a operacao atual');
 release();await opening;
 assert.equal(calls.at(-1).action,'clear');assert.equal(calls.at(-1).data.face,'back');
 calls=[];
 const finishPaste=api.assertCanPaste();
 assert.equal(trace.disabled,true);assert.equal(open.disabled,true,'aguarda gravacao da colagem');
 await open.onclick();assert.equal(calls.length,0);
 assert.throws(()=>api.assertCanPaste(),/Aguarde/);
 await finishPaste();assert.equal(open.disabled,false);
 legacy=false;calls=[];
 api.artPasted('vibe_123',7);
 assert.equal(storage.get('imposition_corel_colagem_123_7'),'1','pendencia sobrevive a recarga');
 assert.equal(open.disabled,false,'colagem preserva o botao CorelDRAW');
 await update.onclick();assert.equal(calls.length,0,'nao publicar CDR anterior sobre a colagem');
 assert.match(feedback.textContent,/arte colada/);
 await trace.onclick();assert.equal(calls[0].action,'open_cdr');assert.equal(calls[0].data.editor,'tracedraw');
 assert.equal(calls[0].data.gabarito,undefined);assert.equal(storage.get('imposition_corel_colagem_123_7'),'1');calls=[];
 allowPasteOpen=false;
 await open.onclick();assert.equal(calls.length,0,'cancelar preserva documento');
 await update.onclick();assert.equal(calls.length,0,'cancelar nao libera publicacao');
 allowPasteOpen=true;
 await open.onclick();assert.equal(calls.at(-1).action,'open');
 assert.equal(storage.has('imposition_corel_colagem_123_7'),false);
 await update.onclick();assert.equal(calls.at(-1).action,'publish');
 const host8=new Element(),anchor8=new Element();host8.append(anchor8);
 api.mount({id:'amostras-itens-container',querySelector:()=>anchor8},123,[{id:8}],'vibe_123');
 api.artPasted('vibe_123',7);api.artPasted('vibe_123',8);
 openedModels=[7,8];await open.onclick();
 assert.equal(storage.has('imposition_corel_colagem_123_7'),false);
 assert.equal(storage.has('imposition_corel_colagem_123_8'),false,'abrir CDR do produto confirma todos os modelos incorporados');
 for (const status of [{status_arte:'APROVADA_CLIENTE'},{impressao:'Impresso'}]) {
   api.mount(container,123,[{id:7,...status}],'vibe_123');
   calls=[];api.artPasted('vibe_123',7);
   assert.equal(open.disabled,false);assert.equal(update.disabled,true);
   assert.equal(trace.disabled,true);await trace.onclick();await update.onclick();await open.onclick();
   assert.deepEqual(calls,[{action:'download',model:'7'}]);
   assert.equal(storage.get('imposition_corel_colagem_123_7'),'1');
 }
 console.log('CorelDRAW: abrir, preparar, compor, publicar, erros e portal OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
