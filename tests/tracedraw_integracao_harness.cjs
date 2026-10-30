const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(){this.children=[];this.dataset={};this.style={};this.isConnected=true;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  setAttribute(){}
  remove(){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.isConnected=false;}
}
(async()=>{
 const window={},document={createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-integracao.js','utf8'),{window,document});
 const api=window.ImpositionTraceDraw,host=new Element(),anchor=new Element(),original=new Element();host.append(original,anchor);
 const container={id:'amostras-itens-container',querySelector:()=>anchor};
 let calls=[],reloads=0,composeFails=false,confirmed=true,legacy=false,entry={art_origin:'tracedraw',art_revision:1,operation:'rev1',restorable:true};
 api.configure({canEdit:()=>true,compose:async()=>{if(composeFails)throw Error('Composição incompleta');return {front:'sample'};},
   reload:async()=>{reloads++;},request:async(action,data)=>{
    calls.push({action,data});
    if(action==='prepare')return legacy?{operation:'draft',files:{front:'pdf'}}:{drafts:[{model:7,operation:'draft',files:{front:'pdf'}}]};
    if(action==='open')return {message:'aberto'};
    return {confirmed,pedido:123,modelo:7,state:action==='restore'?{restorable:false}:entry};
   }});
 api.mount(container,123,[{id:7}],'vibe_123');api.mount(container,123,[{id:7}],'vibe_123');
 assert.equal(host.children.length,3);assert.equal(host.children[0],original);
 const [gabLabel,open,update,badge,feedback]=host.children[2].children;
 assert.equal(gabLabel.children[0].checked,false);
 await open.onclick();assert.equal(calls.at(-1).data.gabarito,undefined);gabLabel.children[0].checked=true;await open.onclick();assert.equal(calls.at(-1).data.gabarito,true);calls.shift();assert.equal(reloads,0);assert.equal(badge.hidden,true);
 await update.onclick();assert.equal(reloads,1);assert.match(badge.textContent,/TraceDraw.*1/);
 assert.deepEqual(calls.map(c=>c.action),['open','prepare','publish']);assert.equal(calls[2].data.samples.front,'sample');
 composeFails=true;await update.onclick();assert.equal(calls.at(-1).action,'prepare');assert.equal(reloads,1);
 assert.match(feedback.textContent,/incompleta/);assert.equal(badge.hidden,false);
 composeFails=false;confirmed=false;await update.onclick();assert.equal(reloads,1);assert.match(feedback.textContent,/não confirmada/);
 legacy=true;calls=[];await update.onclick();assert.deepEqual(calls.map(c=>c.action),['prepare']);assert.match(feedback.textContent,/versão antiga/);
 assert.equal(host.children[2].children.length,5,'CorelDRAW e Atualizar, selo e mensagem');
 const other=new Element();api.mount({id:'cliente-amostras-itens-container',querySelector:()=>({parentElement:other})},123,[{id:7}]);
 assert.equal(other.children.length,0);
 await open.onclick();assert.equal(calls.at(-1).data.editor,'coreldraw');
 assert.match(api.label({art_origin:'tracedraw',art_revision:2,manifesto:{editor:'coreldraw'}}),/CorelDRAW/);
 assert(calls.every(c=>c.data.editor==='coreldraw'));
 console.log('CorelDRAW: abrir, preparar, compor, publicar, erros e portal OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
