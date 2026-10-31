import {lerFonteDesktop} from './fonte_desktop.ts';
import {operarFontesCorel} from './fontes_corel.ts';
const assert=(v:unknown)=>{if(!v)throw Error('assert');};
const who={id:'11111111-1111-4111-8111-111111111111',permissoes:{role:'designer',perm_fontes_view:true,perm_fontes_edit:true}};
async function rejects(f:()=>unknown){let failed=false;try{await f();}catch{failed=true;}assert(failed);}
function fixture(version='Version 1.0') {
  const values:[[number,string],[number,string],[number,string],[number,string],[number,string]]=[[1,'Teste'],[2,'Regular'],[4,'Teste Regular'],[5,version],[6,'Teste-Regular']];
  const length=6+12*values.length+values.reduce((n,[,s])=>n+s.length*2,0);
  const name=new Uint8Array(length),n=new DataView(name.buffer);n.setUint16(2,values.length);n.setUint16(4,6+12*values.length);
  let off=0;
  values.forEach(([id,text],i)=>{const p=6+i*12;n.setUint16(p,3);n.setUint16(p+2,1);n.setUint16(p+4,0x409);n.setUint16(p+6,id);n.setUint16(p+8,text.length*2);n.setUint16(p+10,off);for(const c of text){n.setUint16(6+12*values.length+off,c.charCodeAt(0));off+=2;}});
  const tables=[['name',name],...['head','maxp','cmap','hhea','hmtx','glyf','loca'].map(k=>[k,new Uint8Array(4)])] as [string,Uint8Array][];
  const b=new Uint8Array(12+16*tables.length+tables.reduce((s,[,v])=>s+v.length,0)),v=new DataView(b.buffer);v.setUint32(0,0x10000);v.setUint16(4,tables.length);off=12+16*tables.length;
  tables.forEach(([tag,data],i)=>{const p=12+i*16;b.set(new TextEncoder().encode(tag),p);v.setUint32(p+8,off);v.setUint32(p+12,data.length);b.set(data,off);off+=data.length;});return b;
}
Deno.test('fontes Corel: nomes internos e versao, rejeita WOFF, truncado e offset invalido',async()=>{
  assert(lerFonteDesktop(fixture()).postscript==='Teste-Regular');assert(lerFonteDesktop(fixture('Version 2')).versao==='Version 2');
  await rejects(()=>lerFonteDesktop(new TextEncoder().encode('wOFF')));
  const bytes=fixture();await rejects(()=>lerFonteDesktop(bytes.slice(0,-1)));
  new DataView(bytes.buffer).setUint32(20,0xffffffff);await rejects(()=>lerFonteDesktop(bytes));
});
Deno.test('fontes Corel: acesso e licenca antes de gravar, catalogo web intocado',async()=>{
  let calls=0;const db=async()=>{calls++;return [];};const store=async()=>{calls++;return {};};
  await rejects(()=>operarFontesCorel('listar',{}, {...who,permissoes:{...who.permissoes,role:'cliente'}},db,store));
  await rejects(()=>operarFontesCorel('salvar',{arquivo:'xxx'},who,db,store));
  await rejects(()=>operarFontesCorel('salvar',{licenca_confirmada:true,arquivo:'xxx'},{...who,permissoes:{...who.permissoes,perm_fontes_edit:false}},db,store));assert(calls===0);
});
Deno.test('fontes Corel: cadastro por hash, readback obrigatorio e duplicata sem novo upload',async()=>{
  const bytes=fixture(),input={licenca_confirmada:true,arquivo:btoa(String.fromCharCode(...bytes))};
  let uploads=0;
  const db=async(method:string,path:string,body?:any)=>{assert(!path.includes('catalogo_fontes'));return method==='POST'?[{sha256:body.p_dados.sha256}]:[];};
  const store=async(method:string,path:string)=>{assert(method==='POST'&&/^object\/imposition-fontes-corel\/[a-f0-9]{64}\.ttf$/.test(path));uploads++;return {};};
  const result=await operarFontesCorel('salvar',input,who,db,store);assert(uploads===1&&result.ok);
  await operarFontesCorel('salvar',input,who,async()=>[{sha256:result.sha256}],store);assert(uploads===1);
  await rejects(()=>operarFontesCorel('salvar',input,who,async()=>[],store));
});
Deno.test('fontes Corel: baixar exige hash e URL assinada no bucket privado',async()=>{
  const sha='a'.repeat(64),db=async()=>[{sha256:sha,extensao:'ttf',tamanho:50,nome:'Teste'}];
  await rejects(()=>operarFontesCorel('baixar',{sha256:'../font'},who,db));
  await rejects(()=>operarFontesCorel('baixar',{sha256:sha},who,db,async()=>({signedURL:'https://external/font'})));
  const result=await operarFontesCorel('baixar',{sha256:sha},who,db,async()=>({signedURL:`/object/sign/imposition-fontes-corel/${sha}.ttf?token=test`}));assert(result.sha256===sha);
});
