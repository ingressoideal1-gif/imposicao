// Diagnostico offline: executa drawPedPreview sem alterar o codigo de producao.
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const p = fs.readFileSync(path.join(root, 'frontend/pedido.js'), 'utf8');
const s = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(src, n) {
  const i = src.indexOf('\nfunction ' + n + '(');
  if (i < 0) throw Error(n);
  return src.slice(i, src.indexOf('\n}', i) + 2);
}
function scenario(mode, bar, quantities, options = {}) {
  const records = [];
  const ctx = new Proxy({}, {get(o, k) {
    if (k in o) return o[k];
    if (k === 'drawImage') return (img, ...args) => {if (img.tag) records.push({art: img.tag, size:args.slice(-2)});};
    if (k === 'fillText') return text => records.push({text});
    if (k === 'measureText') return () => ({width:10});
    if (k === 'getTransform') return () => ({a:1,b:0,c:0,d:1,e:300,f:200});
    return () => {};
  }});
  function canvas() {return {width:600,height:400,style:{},getContext:()=>ctx,closest:()=>({clientWidth:800,clientHeight:600})};}
  const el = (value='') => ({value,style:{},textContent:'',checked:false});
  const elements = {
    'ped-preview-canvas':canvas(), 'ped-preview-sheet-num':el(), 'ped-preview-modelo':el(),
    'ped-print-mode':el(options.back?'duplex':'front'), 'ped-schema':el('sequential'),
    'ped-cutstack-mode':el('strict_assembly'), 'ped-sheets-per-block':el('4'),
    'ped-block-depth':el(String(options.depth||1)),
    'ped-preview-page-input':el('1'),
    'ped-preview-set-input':Object.assign(el(String(options.set||1)),{options:[],add(x){this.options.push(x);}}),
    'ped-refazer-set':Object.assign(el('1'),{options:[],add(x){this.options.push(x);}}), 'ped-preview-toggle-arte':{checked:true},
  };
  const pdf = tag=>({numPages:2,pagesCache:{page_1:{tag:tag+'F'},page_2:{tag:tag+'V'}}});
  const items = [96,97,98].map((n,i)=>({id:String(n),modelo:String(n),qtd:quantities[i],
    formato_id:'f',saida_id:'s',numeracao_id:'n'+n,num_inicial:options.zeroStart ? 0 : n*10,num_final:n*10+quantities[i]-1,
    arte_url:'mock'+n,modo_impressao:mode,bloco:4,cutstack_folhas:options.savedBlock||4,
    verso_tipo:options.back?'FRENTE E VERSO':'Frente',print_mode:options.back?'duplex':'front'}));
  const state = {formatos:[{id:'f',cols:2,rows:2,width_mm:50,height_mm:30,default_schema:'sequential',default_saida_id:'s'}],
    saidas:[{id:'s',width_mm:100,height_mm:60}],numeracoes:items.map(x=>({id:x.numeracao_id,tipo:options.ticket?'TICKET':'SEQUENCIAL',ticket_qtd:options.ticket||1,start:1,print_mode:options.back?'duplex':'front',elements:[{type:'TEXT',x_mm:5,y_mm:10,font_size:10,prefix:x.modelo+':',face:'both',ticket_pos:options.ticket||1}]})),
    osItens:{vibe_22247:items},selectedOSItems:items.map(x=>({osId:'vibe_22247',itemId:x.id})),
    activeOSItem:{osId:'vibe_22247',itemId:'96'},modoSomaFolha:bar,cores:[],
    pedArtPdfDoc:pdf('96'),pedArtWidth:141.73,pedArtHeight:85.038,
    multiArtesPdfCache:Object.fromEntries(items.map(x=>[x.arte_url,pdf(x.modelo)])),
    multiArtesPdfTamanho:Object.fromEntries(items.map(x=>[x.arte_url,{w:141.73,h:85.038}])),
    previewFace:options.back?'back':'front',printMode:options.back?'duplex':'front'};
  if(options.paginado) items.forEach(x=>x.modo_pdf=true);
  if(options.paginadoDuplex) {
    items.forEach((x,i)=>{
      x.modo_pdf=true; x.verso_arte_url='back'+x.id;
      state.numeracoes[i].print_mode='duplex_unico';
      const count=options.paginas?.[i] ?? quantities[i];
      state.multiArtesPdfCache[x.arte_url]={numPages:count,pagesCache:Object.fromEntries(
        Array.from({length:count},(_,j)=>['page_'+(j+1),{tag:x.id+'F'+(j+1)}]))};
      state.multiArtesPdfCache[x.verso_arte_url]={numPages:1,pagesCache:{page_1:{tag:x.id+'V'}}};
    });
  }
  if(options.blockMismatch) items[1].bloco=100;
  if(options.special) state.numeracoes[1].print_mode=options.special;
  if(options.separateBack) { items.forEach(x=>{x.verso_arte_url='back'+x.id;state.multiArtesPdfCache[x.verso_arte_url]=pdf(x.id+'S');}); }
  if(options.missingBack) {delete state.multiArtesPdfCache.back97;state.multiArtesPdfLoading={back97:true};}
  if(options.missing) {delete state.multiArtesPdfCache.mock97;state.multiArtesPdfLoading={mock97:true};}
  if(options.single) state.selectedOSItems=[{osId:'vibe_22247',itemId:'97'}];
  if(options.scales) items.forEach((x,i)=>{x.arte_escala_h=[90,100,110][i];x.arte_escala_v=100;});
  const sandbox = {state,console,document:{getElementById:id=>elements[id]||null,createElement:()=>canvas()},
    atualizarIndicadorModeloComVerso(){},atualizarAvisoPaginacao(){},mostrarControleDaPrevia(el,show){el.style.display=show?'':'none';},arteParaImpor:x=>x,globalFuzzyMatch:()=>false,
    buildCanvasFont:()=> '10px sans-serif',fetch:()=>{throw Error('NETWORK BLOCKED');},
    Option: function(text,value){this.text=text;this.value=value;},
    currentPreviewPage:options.page||1,ESCALA_ARTE_MIN:1,ESCALA_ARTE_MAX:400};
  sandbox.window=sandbox;
  sandbox.desenharTextoAjustado=(_ctx,_el,label)=>records.push({vdp:label});
  const scriptFns=['esquemaDaSelecaoCombinada','modoDeImpressaoDaSelecao','modoDeImpressaoDoModelo','modoSomaFolha','itensDaImposicao','itemAtivoDoPedido','temVerso','versoUnico','modoDeVersoDoModelo','escalaDaArteDoModelo','escalaDaArteDoTrabalho','blocagemDaSelecao','blocagemDoModelo','modoCutStackDaSelecao','porQueNaoCombina','problemaNaSelecao','alvosDaImpressao','numeracaoIdDoItem'];
  const pedidoFns=['pdfDaFaceNaPreviaPedido','numeracaoDaArteNaPreviaPedido','buildStrictAssemblySets','arteDoModeloParaFolha','arteParaOMotor','carregarPdfsDaCombinacaoPaginada','drawPedPreview'];
  const code=scriptFns.map(n=>extract(s,n)).concat(pedidoFns.map(n=>extract(p,n))).join('\n');
  vm.createContext(sandbox);vm.runInContext(code,sandbox);vm.runInContext('drawPedPreview()',sandbox);
  if (options.context) return {sandbox,elements,items};
  const payload=vm.runInContext('state.selectedOSItems.map(x=>arteParaOMotor(arteDoModeloParaFolha(x,null,{comPrevia:false}),true))',sandbox);
  const extra=vm.runInContext(`({blocagem:blocagemDaSelecao(),alvos:alvosDaImpressao(state.selectedOSItems.length>1),blocosDiferentes:porQueNaoCombina(state.osItens.vibe_22247[0],{...state.osItens.vibe_22247[1],bloco:100}),problema:problemaNaSelecao()})`,sandbox);
  return JSON.parse(JSON.stringify({mode,bar,quantities,options,payload,extra,title:elements['ped-preview-modelo'].textContent,schema:state.esquemaDaPrevia,label:elements['ped-preview-sheet-num'].textContent,
    sheetsControl:elements['ped-sheets-per-block'].value,sets:sandbox.currentAssemblySets?.map(x=>({sheets:x.num_sheets})),records}));
}
const arts=c=>c.records.filter(r=>r.art).map(r=>r.art);
const values=c=>c.records.filter(r=>r.vdp).map(r=>r.vdp);
function regression() {
    const sequential=scenario('sequencial','separado',[4,4,4],{page:2});
    assert.deepEqual(arts(sequential),['97F','97F','97F','97F']);
    assert.deepEqual(values(sequential),['97:970','97:971','97:972','97:973']);
    assert.equal(sequential.title,'Modelos 96, 97, 98');
    const strict=scenario('blocado','separado',[2,2,2],{set:2});
    assert.deepEqual(strict.sets,[{sheets:1},{sheets:1},{sheets:1}]);
    assert.deepEqual(arts(strict),['97F','97F']);
    const mixed=scenario('blocado','aproveitar',[4,4,4]);
    assert.deepEqual(values(mixed),['96:960','97:972','96:963','98:981']);
    assert.deepEqual(mixed.payload.map(a=>a.numeracao.start),[960,970,980]);
    assert.deepEqual(arts(scenario('blocado','aproveitar',[4,4,4],{back:true})),['96V','97V','96V','98V']);
    const missing=scenario('blocado','aproveitar',[4,4,4],{missing:true});
    assert.deepEqual(arts(missing),['96F','96F','98F']);
    assert(missing.records.some(r=>r.text?.includes('indisponível')));
    const scales=scenario('blocado','aproveitar',[4,4,4],{scales:true});
    assert.deepEqual(scales.records.filter(x=>x.art).map(x=>Math.round(x.size[0])),[691,768,691,845]);
    const different=scenario('blocado','separado',[20,4,8],{savedBlock:8,depth:2,set:2});
    assert.equal(Number(different.sheetsControl),8);
    assert.deepEqual(arts(different),['98F','98F','98F','98F']);
    for (const opts of [{single:true},{paginado:true},{blockMismatch:true},{special:'pdf_odd_even'},{special:'pdf_duplicate_back'}]) {
        const blocked=scenario('sequencial','separado',[4,4,4],opts);
        assert.equal(blocked.label,'Confira a seleção'); assert.equal(arts(blocked).length,0);
    }
    const ticket=scenario('blocado','aproveitar',[4,4,4],{ticket:3});
    assert.deepEqual(values(ticket),['96:962','97:978','96:971','98:985']);
    assert.equal(ticket.payload.reduce((n,a)=>n+a.qtd,0),12);
    const zero=scenario('blocado','aproveitar',[4,4,4],{zeroStart:true});
    assert(zero.payload.every(a=>a.numeracao.start===0));
    const back=scenario('blocado','aproveitar',[4,4,4],{back:true,separateBack:true,missingBack:true});
    assert.deepEqual(arts(back),['96SF','96SF','98SF']);
    console.log('OK: regressao da previa combinada, numeracao, escalas, selecao, verso e bloqueios');
    const pag=scenario('sequencial','separado',[7,12,4],{paginadoDuplex:true,page:2});
    assert.deepEqual(arts(pag),['96F5','96F6','96F7','97F1']);
    assert.deepEqual(arts(scenario('sequencial','separado',[7,12,4],{paginadoDuplex:true,page:2,back:true})),['96V','96V','96V','97V']);
    const parcial=scenario('sequencial','separado',[9,24,16],{paginadoDuplex:true,paginas:[7,12,4]});
    assert.deepEqual(parcial.payload.map(a=>a.qtd),[7,12,4]);
    assert(parcial.payload.every(a=>a.modo_pdf && a.print_mode==='duplex_unico'));
    const missingPag=scenario('sequencial','separado',[7,12,4],{paginadoDuplex:true,missingBack:true});
    assert.equal(arts(missingPag).length,0);
    const incompatible=scenario('sequencial','separado',[7,12,4],{paginadoDuplex:true,special:'duplex'});
    assert.equal(arts(incompatible).length,0);
}
function matrix() {
    const results=[];
    for(const [mode,bar,q,extra] of [
        ['sequencial','separado',[4,4,4],{}],
        ['blocado','aproveitar',[4,4,4],{}],
        ['blocado','separado',[2,2,2],{}],
        ['blocado','separado',[20,4,8],{savedBlock:8,depth:2}],
        ['blocado','separado',[20,4,8],{savedBlock:2}],
        ['blocado','aproveitar',[4,4,4],{ticket:3}],
        ['sequencial','separado',[7,12,4],{paginadoDuplex:true}],
        ['blocado','aproveitar',[7,12,4],{paginadoDuplex:true}],
        ['blocado','separado',[7,12,4],{paginadoDuplex:true,savedBlock:2}],
    ]) {
        const first=scenario(mode,bar,q,extra);
        const sizes=first.sets?.map(s=>s.sheets)||[Math.ceil(q.reduce((a,b)=>a+b,0)/4)];
        const pages=[];
        for(let set=1;set<=sizes.length;set++) for(let page=1;page<=sizes[set-1];page++) {
            const front=scenario(mode,bar,q,{...extra,set,page});
            const back=scenario(mode,bar,q,{...extra,set,page,back:true});
            pages.push({set,page,front:front.records.filter(r=>r.art||r.vdp),back:back.records.filter(r=>r.art||r.vdp)});
        }
        results.push({...first,pages});
    }
    return results;
}
if(require.main===module) {
    if(process.argv.includes('--json')) console.log(JSON.stringify(matrix()));
    else regression();
}
module.exports={scenario,matrix,extract};
