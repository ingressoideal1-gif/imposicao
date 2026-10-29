const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const P=require('pdf-lib');
const source=fs.readFileSync('frontend/script.js','utf8');
function extract(name){const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
const ctx={window:{PDFLib:P},Set};vm.createContext(ctx);
vm.runInContext(extract('preservarPerfilArtePdf'),ctx);
const name=P.PDFName.of;
async function sourcePdf(tag){
 const doc=await P.PDFDocument.create();doc.addPage([100,50]).drawText('VETOR');
 if(tag!==null){
  const profile=doc.context.register(doc.context.flateStream(new Uint8Array([1,2,3,tag]),{N:4}));
  doc.catalog.set(name('OutputIntents'),doc.context.obj([{Type:'OutputIntent',S:'GTS_PDFX',DestOutputProfile:profile}]));
 }
 return doc;
}
async function add(out,src){const [page]=await out.copyPages(src,[0]);ctx.preservarPerfilArtePdf(out,src,page);out.addPage(page);}
function pageProfile(doc,index){const resources=doc.getPage(index).node.Resources();const colors=resources.lookup(name('ColorSpace'));const cs=colors.lookup(name('DefaultCMYK'));return [...P.decodePDFRawStream(doc.context.lookup(cs.get(1))).decode()];}
(async()=>{
 const a=await sourcePdf(4),b=await sourcePdf(5),plain=await sourcePdf(null);
 const same=await P.PDFDocument.create();await add(same,a);await add(same,a);
 const saved=await P.PDFDocument.load(await same.save());
 assert(saved.catalog.has(name('OutputIntents')));assert.deepEqual(pageProfile(saved,0),[1,2,3,4]);assert.deepEqual(pageProfile(saved,1),[1,2,3,4]);
 const mixed=await P.PDFDocument.create();await add(mixed,a);await add(mixed,b);
 const reopened=await P.PDFDocument.load(await mixed.save());
 assert(!reopened.catalog.has(name('OutputIntents')));assert.deepEqual(pageProfile(reopened,0),[1,2,3,4]);assert.deepEqual(pageProfile(reopened,1),[1,2,3,5]);
 const unknown=await P.PDFDocument.create();await add(unknown,a);await add(unknown,plain);
 assert(!unknown.catalog.has(name('OutputIntents')));assert.deepEqual(pageProfile(unknown,0),[1,2,3,4]);
 assert(!unknown.getPage(1).node.Resources().has(name('ColorSpace')));
 assert(!saved.catalog.has(name('Metadata')),'nao inventar PDF/X');
 console.log('Perfis iguais, mistos e ausentes: preservacao por pagina sem atribuir perfil a arte desconhecida OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
