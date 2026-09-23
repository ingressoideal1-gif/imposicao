// Portaria real, duas páginas de credenciais e sincronismo controlado. Zero rede externa.
const fs = require('fs'), path = require('path'), assert = require('assert');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const E = '11111111-1111-4111-8111-111111111111', S = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
async function run() {
 const browser = await puppeteer.launch({args:['--no-sandbox']});
 try {
  for(const fail of [false,true]) {
   const context=await browser.createBrowserContext(), page=await context.newPage();
   let release, waiting, pages=0;
   const atSync = new Promise(r=>waiting=r), gate=new Promise(r=>release=r);
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.evaluateOnNewDocument((E)=>{
    localStorage.setItem('ideal_portaria_token','token-sintetico');
    localStorage.setItem('ideal_portaria_reconfigurado','1');
    localStorage.setItem('ideal_qr_baixar',E);
   },E);
   await page.setRequestInterception(true);
   page.on('request',async req=>{
    const u=new URL(req.url());
    if(u.pathname.includes('/functions/v1/portaria/')) {
     if(req.method()==='OPTIONS')return req.respond({status:204,headers:CORS});
     if(u.pathname.endsWith('/faixa')) {
      const first=!Number(u.searchParams.get('desde'));pages++;
      return req.respond({status:200,headers:CORS,contentType:'application/json',body:JSON.stringify({
       evento:{id:E,nome:'Evento sintético',sal:'ab'.repeat(32),ativo:true},aparelho:{id:A,nome:'Celular',setores:[S]},
       setores:[{id:S,nome:'Pista',quantidade:2,tipo_uso:'unico'}],bloqueios:[],sais:{},
       credenciais:[{id:first?'c1':'c2',h:'cd'.repeat(32),s:S,n:first?1:2}],proxima:first?1:null
      })});
     }
     if(u.pathname.endsWith('/sincronizar')) {
      waiting(); await gate;
      return req.respond({status:fail?503:200,headers:CORS,contentType:'application/json',body:JSON.stringify(fail?{detail:'falha simulada'}:{
       evento:{ativo:true},setores:[],bloqueios:[],entradas:[{credencial_id:'c1',momento:'2026-09-22T12:00:00Z'}],totais:{[S]:1},proxima_desde:null,entradas_zeradas_em:null
      })});
     }
     return req.respond({status:200,headers:CORS,contentType:'application/json',body:'{}'});
    }
    if(u.hostname==='localhost') {
     const name=decodeURIComponent(u.pathname.split('/').pop());
     const file=path.join(root,'frontend',name);
     if(name==='sw.js') return req.respond({status:200,contentType:'application/javascript',body:''});
     if(fs.existsSync(file)&&fs.statSync(file).isFile()) return req.respond({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    }
    return req.respond({status:204,body:''});
   });
   await page.goto('http://localhost/portaria.html',{waitUntil:'domcontentloaded'});
   await Promise.race([atSync,new Promise((_,reject)=>setTimeout(()=>reject(new Error('sincronismo não iniciou')),8000))]);
   assert.equal(await page.$eval('#tela-lendo',e=>e.classList.contains('sumindo')),true);
   release();
   if(fail) {
    await page.waitForFunction(()=>document.body.textContent.includes('Não deu para baixar'));
    assert.equal(await page.$eval('#tela-lendo',e=>e.classList.contains('sumindo')),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ideal_qr_baixar')),E);
   } else {
    await page.waitForFunction(()=>!document.getElementById('tela-lendo').classList.contains('sumindo'));
    const saved=await page.evaluate(async()=>({c:await portariaDeposito.lerCarga(),t:await portariaDeposito.lerTotais(),flag:localStorage.getItem('ideal_qr_baixar')}));
    assert.equal(saved.c.credenciais.length,2);assert.equal(saved.c.entradas.c1,'2026-09-22T12:00:00Z');
    assert.equal(saved.t[S],1);assert.equal(saved.flag,null);
   }
   assert.equal(pages,2);assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log(JSON.stringify({cases:2,readyOnlyAfterDownload:true,failedDownloadBlocksReading:true}));
 } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
