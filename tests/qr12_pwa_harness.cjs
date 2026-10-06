const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const front = path.join(root,'frontend');
const puppeteer = require(path.join(root,'node_modules','puppeteer'));
const sw = fs.readFileSync(path.join(front,'sw.js'),'utf8');
const source = name => fs.readFileSync(path.join(front,name),'utf8');
const checkRows=[];
let generation=948;
let networkAvailable=true;
const swContext={URL,self:{location:'http://localhost/ic/sw.js?v=948',addEventListener(){}}};
vm.runInNewContext(sw+'\nglobalThis.auditFiles=ARQUIVOS;',swContext);
const allowed=new Set(swContext.auditFiles.map(s=>s.split('?')[0]).concat(['sw.js','qrcode-generator.min.js']));
const scriptNames=['qr-ideal-hash.js','portaria-validacao.js','portaria-deposito.js','portaria-sincronismo.js','jsqr.min.js','qrcode-generator.min.js','sw-registro.js','reiniciar.js'];
const realRefs=[...source('controle.html').matchAll(/(?:src|href)="([^"#]+\.(?:js|css)\?v=\d+)"/g)].map(m=>m[1]);
realRefs.push('carregar-pedido.js?v=12345'); // regressão de dependência com versão distinta do SW
function html(){return '<!doctype html><meta charset="utf-8"><style>.sumindo{display:none}</style><button id="faixa-atualizacao" class="sumindo">Atualizar</button><script>window.auditGeneration='+generation+'</script>'+scriptNames.map(n=>'<script src="'+n+'?v='+generation+'"></script>').join('')+realRefs.map(n=>'<script type="text/plain" src="'+n+'"></script>').join('');}
const server=http.createServer((req,res)=>{
  if(!networkAvailable){res.destroy();return;}
  const u=new URL(req.url,'http://localhost');
  if(!u.pathname.startsWith('/ic/')) {res.writeHead(404);res.end();return;}
  const name=decodeURIComponent(u.pathname.slice(4));
  if(!allowed.has(name || './')) {res.writeHead(404);res.end();return;}
  res.setHeader('Cache-Control','no-store');
  if(!name || name==='portaria.html'||name==='controle.html') {res.setHeader('Content-Type','text/html');res.end(html());return;}
  const file=path.join(front,name);
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':name.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith(origin+'/')||req.url().startsWith('data:')?req.continue():req.abort());
  await page.goto(origin+'/ic/portaria.html',{waitUntil:'load'});
  await page.waitForFunction(()=>navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('v=948'),{timeout:15000});
  const results=await page.evaluate(async(vectors)=>{
   const V=window.portariaValidacao,H=window.qrIdealHash,D=window.portariaDeposito;
   const rows=[];
   const check=(name,pass,detail)=>{if(!pass)throw new Error(name+': '+JSON.stringify(detail));rows.push({name,pass,detail});};
   const salt='00'.repeat(32),wrong='11'.repeat(32),eventSalt='22'.repeat(32);
   for(const vector of vectors)check('python_browser_hash_'+vector.content,await H(vector.content,vector.salt)===vector.hash);
   const old='36032TEST0001',text='9581TEST0001',other='9591TEST0002';
   const oldHash=await H(old,salt),newHash=await H(text,salt),otherHash=await H(other,salt);
   const carga={evento:{id:'evento-sintetico',ativo:true,sal:eventSalt},sais:{23063:salt},aparelho:{setores:['a','b']},setores:[{id:'a',nome:'A',tipo_uso:'unico'},{id:'b',nome:'B',tipo_uso:'unico'}],credenciais:[{id:'old',h:oldHash,s:'a',n:1},{id:'new',h:newHash,s:'a',n:1},{id:'other',h:otherHash,s:'b',n:1}],bloqueios:[]};
   async function read(t,c=carga,all=false,entradas={}){const salts=all?[...new Set(Object.values(c.sais).concat(c.evento.sal))]:V.saisParaTentar(t,c);return V.decidir({carga:c,hashes:await Promise.all(salts.map(s=>H(t,s))),entradas,agora:'2026-10-05T18:00:00Z'});}
   check('v1_reconhecido',(await read(old)).credencial_id==='old');
   check('v2_sem_pedido_homonimo_funciona_por_fallback',(await read(text)).credencial_id==='new');
   carga.sais['1859']=wrong;
   const bad=await read(text);
   check('v2_pedido_homonimo_nao_perde_o_sal_correto',bad.credencial_id==='new');
   const fixed=await read(text,carga,true);
   check('prova_conceitual_todos_sais_recupera_v2',fixed.credencial_id==='new');
   check('prova_conceitual_preserva_v1',(await read(old,carga,true)).credencial_id==='old');
   check('v1_quatro_digitos_indistinguivel_por_formato','1859'.split('').reverse().join('')+'TEST0001'===text);
   check('prefixos_v2_distintos_geram_hashes_distintos',newHash!==otherHash);
   check('substituir_prefixo_nao_cria_ingresso_de_outro_modelo',(await read('9591TEST0001')).motivo==='desconhecido');
   const consumed={old:'2026-10-05T17:00:00Z'};
   check('antiga_consumida',(await read(old,carga,true,consumed)).motivo==='ja_entrou');
   check('nova_consumida_nao_entra_de_novo',(await read(text,carga,false,{new:'2026-10-05T17:00:00Z'})).motivo==='ja_entrou');
   carga.credenciais.push({id:'same-content-other-order',h:await H(text,wrong),s:'b',n:1});
   check('todos_sais_precisam_preservar_ambiguidade',(await read(text,carga,true)).estado==='ambiguo');
   carga.credenciais.pop();
   carga.publicacao={concluida:true,versao:'fixture-1'};carga.publicacao_baixada='fixture-1';carga.entradas={};carga.totais={};
   await D.gravarEventoPreparado(carga);
   await D.enfileirar({id_local:'fila-sintetica',credencial_id:'old',resultado:'permitido',momento:'2026-10-05T17:00:00Z'});
   await D.gravarTotais({a:1});
   let refused=false;try{await D.gravarEventoPreparado({...carga,publicacao:{concluida:true,versao:'fixture-2'}});}catch(_){refused=true;}
   check('troca_carga_bloqueada_com_fila_pendente',refused && await D.contarFila()===1);
   localStorage.setItem('audit-synthetic-token','preserve');
   for(const payload of [old,text]){
    const qr=qrcode(0,'L');qr.addData(payload);qr.make();
    const modules=qr.getModuleCount(),scale=8,pad=4;
    const cv=document.createElement('canvas');cv.width=cv.height=(modules+2*pad)*scale;
    const ctx=cv.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='black';
    for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))ctx.fillRect((x+pad)*scale,(y+pad)*scale,scale,scale);
    const data=ctx.getImageData(0,0,cv.width,cv.height),decoded=jsQR(data.data,cv.width,cv.height);
    check('jsqr_decodifica_'+payload.length+'_caracteres',decoded&&decoded.data===payload,{characters:payload.length,modules});
   }
   const times=[];for(let i=0;i<5;i++){const start=performance.now();await Promise.all([salt,wrong,eventSalt].map(s=>H(text,s)));times.push(performance.now()-start);}
   rows.push({name:'tempo_tres_sais_desktop',pass:true,detail:{milliseconds:times,browserOnly:true}});
   return rows;
  },[]);
  checkRows.push(...results);
  // Validate actual public HTML references against the real SW cache.
  const control=source('controle.html');
  const refs=[...control.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)\?v=\d+)"/g)].map(m=>m[1]);
  const misses=await page.evaluate(async refs=>{const cache=await caches.open('ideal-control-948');const out=[];for(const ref of refs)if(!await cache.match(new URL(ref,location.href).href))out.push(ref);return out;},refs);
  checkRows.push({name:'recursos_publicos_fora_precache',pass:true,detail:misses});
  assert.deepEqual(misses,[]);
  const session=await page.createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  networkAvailable=false;
  const offlineMiss=await page.evaluate(async()=>{try{return (await fetch('carregar-pedido.js?v=12345')).ok;}catch(_){return false;}});
  assert(offlineMiss);checkRows.push({name:'dependencia_com_versao_distinta_funciona_offline',pass:true});
  await session.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  networkAvailable=true;
  generation=949;
  await page.evaluate(()=>navigator.serviceWorker.register('sw.js?v=949',{scope:'./'}));
  await page.waitForFunction(()=>navigator.serviceWorker.controller.scriptURL.includes('v=949'),{timeout:15000});
  await page.waitForFunction(async()=>!(await caches.keys()).includes('ideal-control-948'),{timeout:15000});
  const beforeReload=await page.evaluate(async()=>({html:window.auditGeneration,sw:navigator.serviceWorker.controller.scriptURL.split('?')[1],cache:await caches.keys(),fila:await portariaDeposito.contarFila(),entradas:await portariaDeposito.entradasPermitidas()}));
  assert.equal(beforeReload.html,948);assert.equal(beforeReload.fila,1);assert(beforeReload.entradas.old);
  checkRows.push({name:'sw_novo_nao_troca_javascript_ja_aberto',pass:true,detail:beforeReload});
  // qrcode-generator is harness-only and not a dependency of the real gate.
  await page.evaluate(async()=>{const c=await caches.open('ideal-control-949');await c.add('qrcode-generator.min.js?v=949');});
  await session.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  networkAvailable=false;
  await page.reload({waitUntil:'load'});
  const after=await page.evaluate(async()=>({html:window.auditGeneration,fila:await portariaDeposito.contarFila(),entradas:await portariaDeposito.entradasPermitidas(),totais:await portariaDeposito.lerTotais(),token:localStorage.getItem('audit-synthetic-token'),hashAvailable:typeof qrIdealHash==='function'}));
  assert.equal(after.html,949);assert.equal(after.fila,1);assert(after.entradas.old);assert.equal(after.totais.a,1);assert.equal(after.token,'preserve');assert(after.hashAvailable);
  checkRows.push({name:'atualizacao_reabertura_offline_preserva_dados',pass:true,detail:after});
  
  console.log('OK: QR12 PWA '+checkRows.length+' verificacoes; '+await browser.version());
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
