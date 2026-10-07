// Contrato real e consultas simuladas. Nenhum acesso ao banco operacional.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const V = require('../frontend/cor-numeracao-do-modelo.js').VersoDoModelo;
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/script.js'), 'utf8');
const extract = name => { const start = src.search(new RegExp('^(?:async )?function '+name+'\\(', 'm')); assert(start>=0,name); return src.slice(start,src.indexOf('\n}',start)+2); };
const modos=['front','duplex','duplex_unico','pdf_odd_even','pdf_duplicate_back'];
for(const categoria of ['SÓ FRENTE','FRENTE E VERSO','VERSO FIXO','VERSO VARIÁVEL']) {
 for(const modo of modos) assert.equal(V.compativel(categoria,modo),categoria==='SÓ FRENTE'?modo==='front':modo!=='front');
}
const tiposSemVersoReconhecido = [null, undefined, '', '   ', 'INDEFINIDO', 'outro tipo', 0, false];
for(const categoria of tiposSemVersoReconhecido) {
 assert.equal(V.normalizar(categoria),'SÓ FRENTE');
 assert.equal(V.temVerso(categoria),false);
 for(const modo of modos) assert.equal(V.compativel(categoria,modo),modo==='front');
 const item={verso_tipo:categoria,verso:true,frente_verso:true};
 assert.equal(V.modo(item,null),'front','fallback não herda booleano antigo');
 assert.equal(V.erro(item,'front'),'','entrada sem tipo reconhecido permite só frente');
 assert.equal(V.modo(item,{print_mode:'duplex_unico'}),'duplex_unico','modo vinculado continua sendo a fonte técnica');
 assert.equal(item.verso_tipo,categoria,'normalização não altera o dado persistido');
 const patch=V.payload({amostra_num_id:'frente'},{...item,amostra_num_id:'anterior'},[{id:'frente',print_mode:'front'}]);
 assert.deepEqual(patch,{amostra_num_id:'frente'},'vínculo só frente não reescreve a categoria');
}
assert.equal(V.compativel('SÓ FRENTE','desconhecido'),false);

function ambiente(options={}) {
 const item={id:1,id_int:10,amostra_num_id:'n',verso_tipo:'VERSO FIXO'};
 const current={...item,...options.row};
 const num={id:'n',print_mode:options.modo||'duplex'};
 const loaded={...num,...options.loaded};
 const notices=[], calls=[];
 const selects={'ped-print-mode':{value:options.selected||'duplex'},'ped-numeracao':{value:'n'}};
 const box={console,VersoDoModelo:V,window:{},state:{activeOSItem:{osId:'vibe_10',itemId:1},selectedOSItems:[],numeracoes:[loaded],osItens:{vibe_10:[item]}},
  document:{getElementById:id=>selects[id]||null},toast:m=>notices.push(m),findOSInState:()=>({numero:10}),
  numeracaoIdDoItem:i=>i.amostra_num_id,itensDaImposicao:()=>[item],
  supabaseClient:{from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},
   range(a,b){calls.push({table,a,b});return Promise.resolve({data:(options.vinculos||[]).slice(a,b+1)});},
   async maybeSingle(){calls.push({table,filters});if(options.falha)return {error:{message:'rede'}};
    if(options.troca)box.state.activeOSItem.itemId=2;
    return {data:table==='pedidos_modelos'?current:num};}};return q;}}};
 vm.createContext(box);
 vm.runInContext(['modelosDoEditorVibe','lerModeloModoVibe','conferirModoVibeDaNumeracao','conferirModoVibeDoTrabalho'].map(extract).join('\n'),box);
 return {box,item,current,calls,notices};
}
(async()=>{
 const ok=ambiente();assert.equal(await ok.box.conferirModoVibeDoTrabalho('ped'),true);
 for(const tipo of tiposSemVersoReconhecido) {
  const s=ambiente({row:{verso_tipo:tipo},modo:'front',selected:'front'});
  s.item.verso_tipo=tipo;
  assert.equal(await s.box.conferirModoVibeDoTrabalho('ped','front'),true,'fallback libera geração só frente');
  s.box.window.customNumeracaoEditState={osId:'vibe_10',itemId:1};
  await s.box.conferirModoVibeDaNumeracao('n','front');
  assert.equal(s.notices.length,0);
  assert.equal(s.item.verso_tipo,tipo);
 }
 assert.equal(await ambiente().box.conferirModoVibeDoTrabalho('ped','front'),false,'payload anterior a troca de modo bloqueado');
 const incompleta=ambiente();incompleta.box.itensDaImposicao=()=>[];
 assert.equal(await incompleta.box.conferirModoVibeDoTrabalho('ped'),false,'pedido sem modelo carregado nao e avulso');
 incompleta.box.state.activeOSItem=null;
 assert.equal(await incompleta.box.conferirModoVibeDoTrabalho('ped'),true,'avulso sem pedido continua permitido');
 assert.deepEqual(ok.calls[0].filters,[['id',1],['id_int',10]]);
 for(const options of [{row:{verso_tipo:'SÓ FRENTE'}},{row:{verso_tipo:null}}, {falha:true},
  {modo:'front'}, {loaded:{print_mode:'duplex_unico'}},{selected:'duplex_unico'},
  {row:{amostra_num_id:'outra'}},{troca:true}]) {
  const s=ambiente(options);assert.equal(await s.box.conferirModoVibeDoTrabalho('ped'),false,JSON.stringify(options));assert.equal(s.notices.length,1);
 }
 const pares=ambiente({modo:'pdf_odd_even'});assert.equal(await pares.box.conferirModoVibeDoTrabalho('ped'),true,'PDF em pares usa duplex no payload');
 const compartilhada=ambiente({vinculos:Array.from({length:501},(_,i)=>({id:i,verso_tipo:i===500?'SÓ FRENTE':'VERSO FIXO'}))});
 await assert.rejects(compartilhada.box.conferirModoVibeDaNumeracao('n','duplex'),/incompatível/);
 assert.equal(compartilhada.calls.length,2,'verificar segunda pagina de vinculos');
 const contexto=ambiente({row:{verso_tipo:'SÓ FRENTE'}});
 contexto.box.window.customNumeracaoEditState={osId:'vibe_10',itemId:1};
 await assert.rejects(contexto.box.conferirModoVibeDaNumeracao(null,'duplex'),/Vibe/);
 contexto.box.window.customNumeracaoEditState={view:'imposicao',osId:'vibe_10',itemId:1};
 await assert.rejects(contexto.box.conferirModoVibeDaNumeracao(null,'duplex'),/Vibe/);
 contexto.box.window.customNumeracaoEditState={view:'imposicao',osId:null,itemId:null};
 await contexto.box.conferirModoVibeDaNumeracao(null,'duplex');
 assert(src.includes("await conferirModoVibeDoTrabalho('imp')"));
 const ped=fs.readFileSync(require('node:path').join(__dirname,'../frontend/pedido.js'),'utf8');
 assert(ped.includes("await conferirModoVibeDoTrabalho('ped')"));

 // DOM real: opção incompatível atual visível; nenhuma troca silenciosa; reset no catálogo.
 const puppeteer=require('puppeteer');const browser=await puppeteer.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<select id="modo">'+modos.map(m=>`<option value="${m}">${m}</option>`).join('')+'</select>');
  await page.addScriptTag({path:require('node:path').join(__dirname,'../frontend/cor-numeracao-do-modelo.js')});
  const result=await page.evaluate(()=>{
   const s=document.getElementById('modo');s.value='front';
   const aviso=VersoDoModelo.limitarSelect(s,[{verso_tipo:'VERSO FIXO'}]);
   const anterior={value:s.value,aviso,options:[...s.options].map(o=>({v:o.value,d:o.disabled,h:o.hidden}))};
   s.value='duplex';VersoDoModelo.limitarSelect(s,[{verso_tipo:'SÓ FRENTE'}]);
   const frente={value:s.value,permitidos:[...s.options].filter(o=>!o.disabled).map(o=>o.value)};
   VersoDoModelo.limitarSelect(s,[]);
   const catalogo=[...s.options].every(o=>!o.disabled&&!o.hidden);
   const fallback=[null,'','INDEFINIDO'].map(tipo=>{
    s.value='front';const aviso=VersoDoModelo.limitarSelect(s,[{verso_tipo:tipo}]);
    return {aviso,valido:s.checkValidity(),permitidos:[...s.options].filter(o=>!o.disabled).map(o=>o.value)};
   });
   return {anterior,frente,catalogo,fallback};
  });
  assert.equal(result.anterior.value,'front');assert(result.anterior.aviso);
  assert.equal(result.anterior.options[0].d,true);assert.equal(result.anterior.options[0].h,false);
  assert(result.anterior.options.slice(1).every(o=>!o.d&&!o.h));
  assert.equal(result.frente.value,'duplex');assert.deepEqual(result.frente.permitidos,['front']);assert(result.catalogo);
  for(const fallback of result.fallback) {
   assert.equal(fallback.aviso,'');assert.equal(fallback.valido,true);assert.deepEqual(fallback.permitidos,['front']);
  }
 }finally{await browser.close();}
 console.log('OK: matriz 4x5; DOM real; Vibe alterado; modo e vínculo alterados; falha de rede; compartilhamento paginado; geração e salvamento.');
})().catch(e=>{console.error(e);process.exitCode=1;});
