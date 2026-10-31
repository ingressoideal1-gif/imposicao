const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.value='';this.files=[];}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(){} showModal(){this.open=true;} close(){this.open=false;}
}
(async()=>{
  const created=[],body=new Element('body'),document={body,createElement:tag=>{const el=new Element(tag);created.push(el);return el;},createTextNode:text=>({textContent:text})};
  const window={_currentPerms:{role:'designer',perm_fontes_view:true,perm_fontes_edit:true}};
  let requests=[];
  const fetch=async(url,options)=>{
    const data=JSON.parse(options.body);requests.push({url,data,options});
    if(url.endsWith('/listar'))return {ok:true,json:async()=>({fontes:[{nome:'<script>não executar</script>',familia:'Teste',estilo:'Regular',versao:'1',sha256:'a'.repeat(64)}]})};
    if(url.endsWith('/salvar'))return {ok:true,json:async()=>({ok:true,inalterado:true})};
    throw Error('rota inesperada');
  };
  vm.runInNewContext(fs.readFileSync('frontend/tracedraw-integracao.js','utf8'),{window,document,fetch,API_PAINEL:'https://test.invalid',supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}},Uint8Array,btoa,console});
  await window.FontesCorel.abrir();assert.equal(body.children.length,1);
  const upload=created.find(e=>e.textContent==='Carregar fontes'),input=created.find(e=>e.type==='file'),license=created.find(e=>e.type==='checkbox');
  const status=created.find(e=>e.tag==='p'&&e.textContent==='Biblioteca carregada.');
  assert(created.some(e=>e.tag==='strong'&&e.textContent==='<script>não executar</script>'));
  await upload.onclick();assert.match(status.textContent,/licença/);assert.equal(requests.length,1);
  license.checked=true;input.files=[{name:'teste.ttf',size:32,arrayBuffer:async()=>new Uint8Array(32).buffer}];
  await upload.onclick();assert(requests.some(r=>r.url.endsWith('/fontes-corel/salvar')&&r.data.licenca_confirmada===true));
  assert.match(status.textContent,/1 já existente/);assert.equal(license.checked,false);
  window._currentPerms.perm_fontes_edit=false;await window.FontesCorel.abrir();assert.equal(upload.disabled,true);assert.equal(input.disabled,true);
  assert(requests.every(r=>r.options.headers.Authorization==='Bearer synthetic'));
  assert(requests.every(r=>!r.url.includes('/api/fontes/')));
  console.log('Fontes Corel: biblioteca privada, upload autorizado, licenca, duplicata e texto seguro OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
