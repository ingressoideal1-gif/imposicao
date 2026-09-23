const fs=require('fs'),path=require('path'),assert=require('assert'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),E='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
(async()=>{
 const browser=await puppeteer.launch({args:['--no-sandbox']});
 try {
  const page=await browser.newPage(); let published=false,fail=false,pages=0;
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.evaluateOnNewDocument(E=>{localStorage.setItem('ideal_portaria_token','token-sintetico');localStorage.setItem('ideal_portaria_reconfigurado','1');localStorage.setItem('ideal_qr_baixar',E);},E);
  await page.setRequestInterception(true);
  page.on('request',async req=>{
   const u=new URL(req.url());
   if(u.hostname.endsWith('supabase.co')) {
    if(req.method()==='OPTIONS')return req.respond({status:204,headers:CORS});
    const publicacao={versao:published?'publicada-1':'pendente',concluida:published};
    let body={};
    if(u.pathname.endsWith('/faixa')) {
     pages++;const next=!!Number(u.searchParams.get('desde'));
     if(fail&&next)return req.respond({status:503,headers:CORS,contentType:'application/json',body:'{"detail":"Falha sintética"}'});
     body={evento:{id:E,nome:'Evento sintético',ativo:true,sal:'ab'.repeat(32)},aparelho:{id:'a1',nome:'Celular',setores:[S]},setores:[{id:S,nome:'Pista',quantidade:2,tipo_uso:'unico'}],sais:{},bloqueios:[],publicacao,credenciais:published?[{id:next?'c2':'c1',h:'cd'.repeat(32),s:S,n:next?2:1}]:[],proxima:published&&!next?1:null};
    }
    if(u.pathname.endsWith('/sincronizar'))body={evento:{ativo:true},setores:[],bloqueios:[],entradas:[],totais:{},publicacao,proxima_desde:null};
    return req.respond({status:200,headers:CORS,contentType:'application/json',body:JSON.stringify(body)});
   }
   if(u.hostname==='localhost') {
    const name=decodeURIComponent(u.pathname.split('/').pop()),file=path.join(root,'frontend',name);
    if(name==='sw.js')return req.respond({status:200,contentType:'application/javascript',body:''});
    if(fs.existsSync(file)&&fs.statSync(file).isFile())return req.respond({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   }
   return req.respond({status:204,body:''});
  });
  await page.goto('http://localhost/portaria.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.portaria&&portaria.estado.carga&&!document.getElementById('tela-lendo').classList.contains('sumindo'));
  assert.match(await page.$eval('#evento-salvo-offline',e=>e.textContent),/Aguardando publicação/);
  assert.equal(await page.$eval('#btn-digitar',e=>e.disabled),true);
  assert.equal(await page.$eval('#btn-voltar',e=>e.classList.contains('sumindo')),false);
  await page.evaluate(()=>portaria.validarTexto('123'));
  assert.equal(await page.evaluate(()=>portariaDeposito.contarFila()),0);
  assert.equal((await page.evaluate(()=>portariaDeposito.lerCarga())).credenciais.length,0);
  // A publicação chega sem trocar QR/token. Falhar na segunda página não libera leitura.
  published=true;fail=true;
  await page.evaluate(()=>portaria.puxarNovidades());
  assert.equal((await page.evaluate(()=>portariaDeposito.lerCarga())).credenciais.length,0);
  assert.equal(await page.$eval('#btn-digitar',e=>e.disabled),true);
  fail=false;await page.evaluate(()=>portaria.puxarNovidades());
  const ready=await page.evaluate(async()=>({c:await portariaDeposito.lerCarga(),token:localStorage.getItem('ideal_portaria_token')}));
  assert.equal(ready.c.credenciais.length,2);assert.equal(ready.c.publicacao_baixada,'publicada-1');assert.equal(ready.token,'token-sintetico');
  assert.match(await page.$eval('#evento-salvo-offline',e=>e.textContent),/Pronto para uso offline/);
  assert.equal(await page.$eval('#btn-digitar',e=>e.disabled),false);
  await page.setOfflineMode(true);
  assert.equal(await page.evaluate(()=>portaria.estado.carga.credenciais.length),2);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pendingConfigurable:true,emptyCannotRead:true,retryAfterPartialDownload:true,sameToken:true,readyOffline:true,pages}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
