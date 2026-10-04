const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const imagens=[];
class Imagem {
 constructor(){this.naturalWidth=30;this.naturalHeight=20;this.eventos={};imagens.push(this);}
 addEventListener(n,fn){this.eventos[n]=fn;}
 set src(v){this.origem=v;queueMicrotask(()=>{this.onload?.();this.eventos.load?.();});}
}
const c={Promise,Map,Set,Image:Imagem,queueMicrotask,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},
 revisao:'r1',leituras:0,falhar:false};c.window=c;
c.PilotoSelecao={chaveRecurso:url=>'/local/'+c.revisao,lerUrl:async()=>{c.leituras++;if(c.falhar)throw Error();return{blob:async()=>({})};}};
vm.runInNewContext(fs.readFileSync('frontend/foto-lib.js','utf8'),c);
(async()=>{
 const url='https://teste.invalid/foto.png';const els=[{type:'FOTO',csv_column:'Foto'}],rows=[{Foto:url}];
 await c.carregarFoto(url);assert.equal(c.leituras,1);assert.equal(imagens[0].origem,'blob:local');
 assert.equal(c.dimensoesDaFoto(url).w,30);assert.equal(c.fotosPendentes(els,rows).length,0);
 await c.carregarFoto(url);assert.equal(c.leituras,1);
 c.revisao='r2';await c.carregarFoto(url);assert.equal(c.leituras,2);
 c.revisao='r3';c.falhar=true;assert.equal((await c.carregarFoto(url)).falhou,true);
 assert.equal(imagens.at(-1).origem,undefined);c.repetirFotosQueFalharam([url]);c.falhar=false;
 await c.carregarFoto(url);assert.equal(c.leituras,4);
 c.PilotoSelecao=undefined;await c.carregarFoto(url);assert.equal(imagens.at(-1).origem,url);
 console.log('OK: fotos autenticadas locais, revisão, dimensões, falha sem fallback e fluxo padrão.');
})().catch(e=>{console.error(e);process.exitCode=1;});
