const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(){this.children=[];this.dataset={};this.style={};this.isConnected=true;}append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}setAttribute(){}remove(){this.isConnected=false;}}
(async()=>{
 const window={},document={createElement:()=>new Element()};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-integracao.js','utf8'),{window,document});
 const hosts=[new Element(),new Element()],anchors=hosts.map(h=>{const a=new Element();h.append(a);return a;});
 const container={id:'amostras-itens-container',querySelector:s=>anchors[Number(s.split('-').at(-1))]};
 let calls=[],reloads=0,fail=false,atomic=false;
 window.ImpositionTraceDraw.configure({canEdit:()=>true,
 request:async(action,data)=>{calls.push([action,data.model]);if(action==='prepare')return {atomic_document:atomic,drafts:[{model:7,operation:'a',files:{front:'a'}},{model:8,operation:'b',files:{front:'b'}}]};
 if(action==='publish_document') {
   assert.deepEqual(Array.from(data.parts,p=>p.model),[7,8]);
   if(fail)throw Error('Conflito no lote');
   return {confirmed:true,pedido:123,receipts:[{modelo:7,pedido:123,operacao:'a'},{modelo:8,pedido:123,operacao:'b'}]};
 }
 if(fail&&data.model===8)throw Error('Falha simulada');return {confirmed:true,pedido:123,modelo:data.model};},
 compose:async(binding)=>{calls.push(['compose',Number(binding.model)]);return {front:'sample'+binding.model};},reload:async()=>reloads++});
 window.ImpositionTraceDraw.mount(container,123,[{id:7},{id:8}],'order');
 await hosts[0].children[1].children[1].onclick();
 assert.deepEqual(calls,[['prepare',7],['compose',7],['compose',8],['publish',7],['publish',8]]);
 assert.equal(reloads,1);
 fail=true;calls=[];await hosts[0].children[1].children[1].onclick();
 assert.match(hosts[0].children[1].children[3].textContent,/1\/2 modelos confirmados/);
 assert.equal(reloads,2);
 atomic=true;fail=false;calls=[];
 await hosts[1].children[1].children[1].onclick();
 assert.deepEqual(calls,[['prepare',8],['compose',7],['compose',8],['publish_document',8]],'qualquer modelo publica o documento inteiro uma vez');
 assert.equal(reloads,3);
 fail=true;calls=[];await hosts[0].children[1].children[1].onclick();
 assert.match(hosts[0].children[1].children[3].textContent,/0\/2 modelos confirmados/);
 assert.equal(reloads,3,'erro atomico nao recarrega como publicacao parcial');
 fail=false;calls=[];
 await window.ImpositionTraceDraw.artRemoved('order',7);
 assert.deepEqual(calls,[['clear',7]],'exclusao limpa nativo sem preparar ou publicar PDF');
 assert.equal(reloads,3);
 console.log('Documento: duas composicoes antes de publicar, duas publicacoes e falha parcial explicita OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
