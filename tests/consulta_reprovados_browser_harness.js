const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const pedido=fs.readFileSync('frontend/pedido.js','utf8'),script=fs.readFileSync('frontend/script.js','utf8');
function fn(nome,s){const i=s.search(new RegExp('(?:async )?function '+nome+'\\('));assert.ok(i>=0);return s.slice(i,s.indexOf('\n}',i)+2);}
(async()=>{
 const server=http.createServer((q,r)=>r.end('<!doctype html><select id="ped-numeracao"><option value="n1">Camarote</option><option value="n2">Sequencial</option></select>'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await puppeteer.launch({headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  await page.addScriptTag({content: ['enviarParaPedido','carregarModeloParaPedido','executarPedImposition'].map(n=>fn(n,pedido)).join('\n')+'\n'+['faixaEfetivaDoModelo','preencherFaixaDoModelo','enviarParaImposicao','carregarModeloParaImposicao'].map(n=>fn(n,script)).join('\n')});
  await page.evaluate(()=>{
   const rows=[{id:1,id_int:99,status_arte:'REPROVADA_CLIENTE',arte_url:'https://synthetic.test/a.pdf',amostra_num_id:'n1'},{id:2,id_int:99,status_arte:'REPROVADA_CLIENTE',arte_url:'https://synthetic.test/b.pdf',amostra_num_id:'n2'}];
   window.snapshotTeste={modelos:rows,numeracoes:[{id:'n1',tipo:'CAMAROTE'},{id:'n2',tipo:'SEQUENCIAL'}],origens:[],produtos:[],bancos:[],vinculos:[],artes:[],mapas:[]};
   Object.assign(window,{state:{osItens:{os:rows.map(m=>({...m,_modeloOnline:structuredClone(m)}))},cores:[],numeracoes:[],selectedOSItems:[]},avisos:[],leituras:[],gravacoes:0,
    toast:m=>avisos.push(m),findOSInState:()=>({numero:99}),getOSItens:()=>state.osItens.os,normalizarNumeracaoLida:x=>x,podeAbrirView:()=>true,
    limparPreviaEnquantoCarrega(){},atualizarIndicadorModeloComVerso(){},pintarLinhaAberta(){},moverJanelaParaModelo(){},showView(){},aplicarTravaModoPdf(){},updatePedSummary(){},updateImpSummary(){},renderPedOSQueue(){},renderImpOSQueue(){},guardarPdfDoVersoDaPrevia(){},guardarPdfDoVersoDaImposicao(){},globalFuzzyMatch:()=>false,
    formatoDoModelo:()=>({id:1}),recarregarNumeracoesDoPedido:async()=>{},autoSaveOSItemField:()=>{gravacoes++;},
    loadPedArtFile:async(f,atual)=>{if(atual())state.pedArtFile=f;},loadImpArtFile:async(f)=>{state.impArtFile=f;},
    fetch:async(url)=>{if(url==='/api/pacotes-locais/abrir-pedido-painel')return{ok:true,json:async()=>({protocolo:2,pedido:'99',revisao_pedido:'a'.repeat(64),snapshot:snapshotTeste,pacotes:[],sem_arte:['1','2']})};
     if(!['https://synthetic.test/a.pdf','https://synthetic.test/b.pdf'].includes(url))throw Error('Leitura inesperada');leituras.push(url);return{ok:true,headers:new Headers({'content-type':'application/pdf'}),blob:async()=>new Blob(['%PDF-teste'])};}
   });
  });
  await page.addScriptTag({content:fs.readFileSync('frontend/selecao-piloto.js','utf8')});
  const result=await page.evaluate(async()=>{
   const ctx=PilotoSelecao.iniciarPedido('os');await PilotoSelecao.carregarPedidoLocal('os',()=>true,ctx);await PilotoSelecao.conferirPedido('os',()=>true,ctx);
   for(const id of [1,2]){await enviarParaPedido(id,'os');if(!state.pedArtFile||!state.pedidoSelecaoErro.includes('somente para consulta'))throw Error('Consulta incompleta');await executarPedImposition('pdf');}
   await enviarParaImposicao(1,'os',true,{restaurandoNavegacao:true});
   if(!state.imposicaoSelecaoErro.includes('somente para consulta'))throw Error('Imposicao liberada');
   return{leituras:leituras.length,gravacoes,status:snapshotTeste.modelos.map(m=>m.status_arte)};
  });
  assert.ok(result.leituras>=3);assert.equal(result.gravacoes,0);assert.deepEqual(result.status,['REPROVADA_CLIENTE','REPROVADA_CLIENTE']);console.log('OK navegador: Pedido e Imposicao reais, CAMAROTE e SEQUENCIAL reprovados, arte carregada sem aprovacao/gravacao e geracao bloqueada.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
