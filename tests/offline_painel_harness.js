/* Painel em Chromium, API local sintetica, qualquer rede externa proibida. */
const fs=require('node:fs'), http=require('node:http'), path=require('node:path');
const assert=require('node:assert/strict'), puppeteer=require('puppeteer');
const source=fs.readFileSync('frontend/script.js','utf8');
function extrair(nome) {
  const inicio=source.search(new RegExp('\\n(?:async )?function '+nome+'\\('));
  assert(inicio>=0); return source.slice(inicio,source.indexOf('\n}',inicio)+2);
}
(async()=>{
 let browser;
 const snapshot={pedidos:[{id_int:99,status_interno:'EM PRODUCAO',cliente_nome:'Cliente sintetico'}],
   origens:[{id:1,id_int:99,id_produto:911,nome_produto:'Credencial 10x15'},
     {id:2,id_int:99,id_produto:'2004',nome_produto:'Cordão Preto'},
     {id:3,id_int:99,id_produto:3002,nome_produto:'Nome anterior'},
     {id:4,id_int:99,id_produto:9,nome_produto:'Nome A'},
     {id:5,id_int:99,id_produto:9,nome_produto:'Nome B'}],
   produtos:[{id_produto:911,setor_pcp:'LASER'}, {id_produto:2004,setor_pcp:'TEXTIL',is_estoque:true},
     {id_produto:3002,nomeReal:'Chaveiro & Cordão',setor_pcp:'TEXTIL'}, {id_produto:9}, {id_produto:10}],
   modelos:[{id:10,id_int:99}],numeracoes:[{id:1,elements:[]}],
   prazos:[{id_int:99,data_termino:'2026-10-15'}],artes:[],bancos:[],vinculos:[]};
 const dados={catalogos:{formatos:[{id:1}],saidas:[{id:2}],cores:[],modelos_imposicao:[]},
   pedidos:[{pedido:'99',revisao:'a'.repeat(64),snapshot}],confirmacoes:[]};
 const chamadas=[];
 const server=http.createServer(async(req,res)=>{
   chamadas.push(req.url);
   if(req.url.startsWith('/api/pacotes-locais/')) {
     res.setHeader('Content-Type','application/json');
     if(req.url.endsWith('offline-painel')) return res.end(JSON.stringify(dados));
     let body=''; for await (const part of req) body+=part;
     if(req.url.endsWith('conferencia-trabalho-painel')) return res.end(JSON.stringify(dados));
     if(req.url.endsWith('confirmar-impressao-painel')) {
       dados.confirmacoes.unshift({dados:JSON.parse(body),estado:'pendente'});
       return res.end('{"registrado_localmente":true}');
     }
   }
   const nome=req.url.split('?')[0];
   if(nome==='/') return res.end('<html><body><div id="user-profile-bar"></div></body></html>');
   const file=path.resolve('frontend','.'+nome);
   if(!file.startsWith(path.resolve('frontend')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':'application/octet-stream');
   res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
   browser=await puppeteer.launch({headless:true}); const page=await browser.newPage();
   const origem='http://127.0.0.1:'+server.address().port; const externas=[];
   await page.setRequestInterception(true);
   page.on('request',r=>{if(r.url().startsWith(origem)||r.url().startsWith('blob:')||r.url().startsWith('data:'))r.continue();else{externas.push(r.url());r.abort();}});
   await page.goto(origem);
   await page.evaluate(()=>{
     window.state={osItens:{},modelosGlobais:{},selectedOSItems:[]};
     window.toast=()=>{};window.renderOrdens=()=>{};window.normalizarNumeracaoLida=()=>{};
     window.arteFoiLancada=()=>true;window.lerStatusOverride=()=>null;
     window.mapVibecodeProdutoToOSItem=p=>({...p});
     window.nomePreferencialDaProposta=p=>p.cliente_exibicao || p.cliente_nome;window.comporPrazoDoERP=d=>d;
     window.pedidosJaNaGrafica=()=>new Set(['99']);window.pedidoEntraNoPainel=()=>true;
     window.vibeClient={from(){throw Error('Tentou consultar nuvem');}};
     window.PilotoSelecao={revisaoPedido:()=>({pedido:'99',revisao:'a'.repeat(64)})};
   });
   await page.addScriptTag({content:extrair('loadOrdensFromVibecode')});
   await page.addScriptTag({content:extrair('normalizarStatusImpressao')+'\n'+extrair('updateItemImpressao')});
   await page.addScriptTag({content:extrair('escHtmlSimples')+'\n'+extrair('confirmarImpressaoModelos')});
   await page.evaluate(()=>{window.confirmarPopup=async()=>true;});
   await page.addScriptTag({url:origem+'/offline-estacao.js'});
   const result=await page.evaluate(async()=>{
     const ok=await PilotoOffline.carregarOrdens();
     const formatos=await PilotoOffline.catalogo('/formatos');
     const conferencia=await PilotoOffline.conferencia([{osId:'vibe_99',itemId:'10'}]);
     state.osItens.vibe_99=[{id:10}];
     // O seletor manual deve usar a mesma confirmação durável do popup.
     // Não existe acesso à nuvem neste ensaio.
     const marcado = await updateItemImpressao('10','vibe_99','Impresso');
     if (!marcado) throw Error('Seletor manual não confirmou localmente');
     state.osItens.vibe_99=[{id:10}]; await PilotoOffline.aplicarConfirmacoes('vibe_99');
     return {ok,ordens:state.ordens,formatos,modelos:conferencia.tabelas.pedidos_modelos,item:state.osItens.vibe_99[0]};
   });
   assert(result.ok);assert.equal(result.ordens[0].numero,99);assert.equal(result.ordens[0].prazo_entrega,'2026-10-15');
   assert.equal(result.formatos[0].id,1);assert.equal(result.modelos[0].id,10);assert(result.item._confirmacaoLocalPendente);
   assert.equal(dados.confirmacoes.length,1);
   assert.equal(await page.evaluate(()=>confirmarImpressaoModelos([{osId:'vibe_99',itemId:'10'}])),true,
     'a confirmação original do popup também é persistida');
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'IMPRESSO');
   await page.evaluate(()=>PilotoOffline.carregarOrdens());
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'IMPRESSO',
     'voltar à lista preserva confirmação local pendente');
   assert.equal(snapshot.modelos[0].status_impressao,undefined,'não altera o snapshot preparado');
   assert.deepEqual(await page.evaluate(()=>state.produtosGlobais.map(p=>p.nomeReal||null)),
     ['Credencial 10x15','Cordão Preto','Chaveiro & Cordão',null,null]);
   assert.equal(snapshot.produtos[0].nomeReal,undefined,'snapshot original preservado');
   assert.equal(await page.evaluate(()=>state.produtosGlobais[1].is_estoque),true);
   const catalogoAtualizado=await page.evaluate(()=>{
     const novo={formatos:[{id:1,height_mm:480}],saidas:[{id:2,name:'Cartaz'}],cores:[],modelos_imposicao:[]};
     PilotoOffline.aplicarCatalogos(novo);
     novo.formatos[0].height_mm=1;
     return {altura:state.formatos[0].height_mm,nome:state.saidas[0].name};
   });
   assert.deepEqual(catalogoAtualizado,{altura:480,nome:'Cartaz'});
   dados.lista={revisao:'b'.repeat(64),lista:{...snapshot,
     pedidos:Array.from({length:65},(_,i)=>({id_int:99+i,status_interno:'EM PRODUCAO',
       cliente_exibicao:'Cliente '+i,id_cliente:100+i,id_faturado:900+i})),
     modelos:Array.from({length:65},(_,i)=>({id:10+i,id_int:99+i,status_arte:'APROVADO',status_impressao:'AGUARDANDO'}))}};
   // Nova instancia simula reabrir o painel sem internet; apenas um PDF pronto.
   await page.addScriptTag({url:origem+'/offline-estacao.js?lista=1'});
   const completa=await page.evaluate(async()=>{
     await PilotoOffline.carregarOrdens();
     return {ordens:state.ordens,modelos:Object.keys(state.modelosGlobais).length};
   });
   assert.equal(completa.ordens.length,65);assert.equal(completa.modelos,65);
   const primeiro=completa.ordens.find(o=>Number(o.numero)===99);
   assert.equal(primeiro.cliente,'Cliente 0');assert.equal(primeiro.numero_cliente,100);
   assert.equal(primeiro.id_cliente,900);assert(primeiro._disponivelOffline);
   assert.equal(completa.ordens.filter(o=>o._disponivelOffline).length,1);
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'IMPRESSO',
     'lista resumida antiga não desfaz confirmação persistida');
   dados.confirmacoes[0].estado='conflito';
   await page.addScriptTag({url:origem+'/offline-estacao.js?conflito=1'});
   await page.evaluate(()=>PilotoOffline.carregarOrdens());
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'Conferir impressão',
     'conflito não pode voltar à fila Aguardando nem declarar impressão da revisão atual');
   await page.evaluate(async()=>{state.osItens.vibe_99=[{id:10}];await PilotoOffline.aplicarConfirmacoes('vibe_99');});
   assert.equal(await page.evaluate(()=>state.osItens.vibe_99[0]._confirmacaoLocalRevisaoNecessaria),true);
   assert.match(await page.evaluate(async()=>{
     try {await PilotoOffline.conferencia([{osId:'vibe_99',itemId:'10'}]);return 'permitiu';}
     catch(e){return e.message;}
   }),/já teve impressão confirmada/,'impede gerar/imprimir novamente enquanto houver divergência');
   dados.confirmacoes[0].estado='pendente';
   dados.confirmacoes[0].dados.revisao='c'.repeat(64);
   await page.addScriptTag({url:origem+'/offline-estacao.js?revisao=1'});
   await page.evaluate(()=>PilotoOffline.carregarOrdens());
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'Conferir impressão',
     'mudança de revisão também exige conferência, sem recolocar em Aguardando');
   snapshot.modelos[0].status_impressao='IMPRESSO';
   await page.addScriptTag({url:origem+'/offline-estacao.js?sincronizado=1'});
   await page.evaluate(()=>PilotoOffline.carregarOrdens());
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'IMPRESSO',
     'snapshot atualizado confirma impressão mesmo se a lista resumida estiver antiga');
   await page.evaluate(async()=>{state.osItens.vibe_99=[{id:10}];await PilotoOffline.aplicarConfirmacoes('vibe_99');});
   assert.equal(await page.evaluate(()=>state.osItens.vibe_99[0]._confirmacaoLocalRevisaoNecessaria),false);
   delete snapshot.modelos[0].status_impressao;
   assert.equal(await page.evaluate(()=>confirmarImpressaoModelos([{osId:'vibe_99',itemId:'10'}])),true);
   await page.evaluate(()=>PilotoOffline.carregarOrdens());
   assert.equal(await page.evaluate(()=>state.modelosGlobais[99][0].status_impressao),'IMPRESSO',
     'nova confirmação explícita da revisão atual prevalece sobre registros antigos');
   dados.pedidos=[];
   await page.addScriptTag({url:origem+'/offline-estacao.js?lista=2'});
   assert.equal(await page.evaluate(async()=>{await PilotoOffline.carregarOrdens();return state.ordens.length;}),65);
   for(const lib of ['vendor/offline/jszip.min.js','vendor/offline/fabric.min.js','vendor/offline/pdf.min.js','pdf-lib.min.js'])
     await page.addScriptTag({url:origem+'/'+lib});
   const paginas=await page.evaluate(async()=>{
     pdfjsLib.GlobalWorkerOptions.workerSrc='/vendor/offline/pdf.worker.min.js';
     const doc=await PDFLib.PDFDocument.create();doc.addPage([200,300]);
     const pdf=await pdfjsLib.getDocument({data:await doc.save()}).promise;return pdf.numPages;
   });
   assert.equal(paginas,1);assert.deepEqual(externas,[]);
   assert(chamadas.some(c=>c.includes('pdf.worker.min.js')));
   console.log('OK: Chromium sem rede externa; lista real, catalogos, conferencia, confirmacao/reabertura e PDF/worker locais.');
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
