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
   origens:[],produtos:[],modelos:[{id:10,id_int:99}],numeracoes:[{id:1,elements:[]}],
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
       dados.confirmacoes.push({dados:JSON.parse(body),estado:'pendente'});
       return res.end('{"registrado_localmente":true}');
     }
   }
   const nome=req.url.split('?')[0];
   if(nome==='/') return res.end('<html><body><div id="user-profile-bar"></div></body></html>');
   const file=path.resolve('frontend','.'+nome);
   if(!file.startsWith(path.resolve('frontend')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
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
     window.nomePreferencialDaProposta=p=>p.cliente_nome;window.comporPrazoDoERP=d=>d;
     window.pedidosJaNaGrafica=()=>new Set(['99']);window.pedidoEntraNoPainel=()=>true;
     window.vibeClient={from(){throw Error('Tentou consultar nuvem');}};
     window.PilotoSelecao={revisaoPedido:()=>({pedido:'99',revisao:'a'.repeat(64)})};
   });
   await page.addScriptTag({content:extrair('loadOrdensFromVibecode')});
   await page.addScriptTag({url:origem+'/offline-estacao.js'});
   const result=await page.evaluate(async()=>{
     const ok=await PilotoOffline.carregarOrdens();
     const formatos=await PilotoOffline.catalogo('/formatos');
     const conferencia=await PilotoOffline.conferencia([{osId:'vibe_99',itemId:'10'}]);
     state.osItens.vibe_99=[{id:10}];
     await PilotoOffline.confirmar([{osId:'vibe_99',itemId:'10'}]);
     state.osItens.vibe_99=[{id:10}]; await PilotoOffline.aplicarConfirmacoes('vibe_99');
     return {ok,ordens:state.ordens,formatos,modelos:conferencia.tabelas.pedidos_modelos,item:state.osItens.vibe_99[0]};
   });
   assert(result.ok);assert.equal(result.ordens[0].numero,99);assert.equal(result.ordens[0].prazo_entrega,'2026-10-15');
   assert.equal(result.formatos[0].id,1);assert.equal(result.modelos[0].id,10);assert(result.item._confirmacaoLocalPendente);
   assert.equal(dados.confirmacoes.length,1);
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
