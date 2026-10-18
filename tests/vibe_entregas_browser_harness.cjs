/* Dados sinteticos, servidor local, nenhuma conexao ao ERP. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../frontend');
(async () => {
  const server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if(!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({headless:true});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vibe-entregas-test-'));
  try {
    const page = await browser.newPage(); const errors=[];const external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',req=>{if(req.url().startsWith(base)||req.url().startsWith('blob:')||req.url().startsWith('data:'))req.continue();else{external.push(req.url());req.abort();}});
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await page.goto(base+'/entregas/',{waitUntil:'networkidle0'});
    assert.equal(await page.title(),'Vibe Entregas');
    assert.equal(await page.$eval('#login',e=>e.hidden),false);
    await page.click('#demonstrar');assert.equal(await page.$$eval('.card',els=>els.length),3);
    await page.type('#busca','1002');assert.equal(await page.$$eval('.card',els=>els.length),1);
    const route=await page.$eval('.card .route',e=>e.href);assert.ok(route.startsWith('https://www.google.com/maps/dir/'));
    await page.click('.actions button');assert.match(await page.$eval('#titulo',e=>e.textContent),/Minhas/);
    await page.click('.actions button');await page.type('#recebedor','Pessoa de teste');await page.click('#volumes');
    await page.click('#registro button[type=submit]');assert.match(await page.$eval('#erro',e=>e.textContent),/foto/);
    const foto=path.join(dir,'foto.png');
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL().split(',')[1];});
    fs.writeFileSync(foto,Buffer.from(png,'base64'));await (await page.$('#foto')).uploadFile(foto);
    await page.waitForFunction(()=>!document.getElementById('preview').hidden);
    await page.click('#registro button[type=submit]');await page.waitForFunction(()=>document.getElementById('confirmacao').open);
    await page.click('#voltar');assert.equal(await page.$eval('#recebedor',e=>e.value),'Pessoa de teste');
    await page.click('#registro button[type=submit]');await page.click('#confirmar');
    assert.match(await page.$eval('#titulo',e=>e.textContent),/Concluídas/);assert.match(await page.$eval('.card',e=>e.textContent),/Pessoa de teste/);
    await page.$eval('#busca',e=>{e.value='';e.dispatchEvent(new Event('input'));});await page.click('[data-filtro=disponivel]');
    assert.equal(await page.$$eval('.card',els=>els.length),2);
    await page.click('.actions button');await page.click('.actions button');await page.select('#resultado','ausente');
    await page.click('#registro button[type=submit]');await page.click('#confirmar');assert.match(await page.$eval('.card',e=>e.textContent),/Destinatário ausente/);
    await page.type('#busca','<img onerror=alert(1)>');assert.equal(await page.$$eval('.card',els=>els.length),0);
    for(const width of [320,390,768]) { await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); }
    await page.setViewport({width:390,height:844});
    await page.$eval('#busca',e=>{e.value='';e.dispatchEvent(new Event('input'));});
    fs.mkdirSync(path.resolve(__dirname,'../dist/vibe-entregas'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../dist/vibe-entregas/mobile.png'),fullPage:true});
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'networkidle0'});
    await page.setOfflineMode(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#demonstrar');await page.click('#demonstrar');assert.equal(await page.$$eval('.card',els=>els.length),3);
    await page.setOfflineMode(false);
    await page.click('.actions button');await page.click('[data-filtro=disponivel]');await page.click('.actions button');
    await page.click('#rotas-painel summary');
    await page.$$eval('#rota-selecao input',els=>els.forEach(e=>{e.checked=true;e.dispatchEvent(new Event('change'));}));
    assert.equal(await page.$eval('#rota-retorno',e=>e.checked),false);await page.select('#rota-ultima','DEMO-1001');
    await page.click('#rota-calcular');await page.waitForFunction(()=>!document.getElementById('rota-revisao').hidden);
    assert.match(await page.$eval('#rota-estimativa',e=>e.textContent),/sem cálculo do Google/);
    assert.match(await page.$eval('#rota-ordem li:last-child',e=>e.textContent),/DEMO-1001/);
    await page.click('#rota-iniciar');assert.match(await page.$eval('#rota-progresso',e=>e.textContent),/0 de 2/);
    assert.equal(await page.$eval('#rota-proxima',e=>e.hidden),false);
    await page.select('#rota-origem','atual');
    await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=(_ok,err)=>err({code:1});});
    await page.click('#rota-calcular');await page.waitForFunction(()=>document.getElementById('rota-erro').textContent.includes('localização'));
    await page.click('#sair');assert.equal(await page.$eval('#operacao',e=>e.hidden),true);
    assert.equal(await page.$eval('#rota-proxima',e=>e.getAttribute('href')),null);

    // Transporte sintetico: pedidos em deslocamento continuam navegaveis no PWA.
    await page.evaluate(()=>{
      const pedido={chave:'p-transito',id:'1099',nome:'Cliente sintetico',endereco:'Rua de teste, 81',estado:'minha',status_erp:'EM TRANSITO',prevista_em:'2026-10-17T19:30:00Z'};
      window.VibeEntregas.entrar=async()=>({id:'driver'});
      window.VibeEntregas.listar=async()=>[pedido];
      window.VibeEntregas.rotasAtivas=async()=>[{minha:true,id:'r-transito',iniciada_em:new Date().toISOString(),paradas:[{chave:pedido.chave,pedido:1099,endereco:pedido.endereco,status_erp:'EM TRANSITO',entregue:false}]}];
    });
    await page.type('#email','driver@example.invalid');await page.type('#senha','senha-sintetica');await page.click('#login button');
    await page.waitForFunction(()=>!document.getElementById('operacao').hidden);await page.click('[data-filtro=minha]');
    await page.waitForFunction(()=>document.querySelector('.card')?.textContent.includes('Em deslocamento'));
    assert.match(await page.$eval('.card',e=>e.textContent),/Previsão de entrega/);
    await page.evaluate(()=>document.getElementById('rotas-painel').open=true);await page.click('#rota-recuperar');
    await page.waitForFunction(()=>!document.getElementById('rota-proxima').hidden);
    assert.match(await page.$eval('#rota-andamento',e=>e.textContent),/Em deslocamento/);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: busca, isolamento, retirada, foto, confirmacao, tentativa, revisao, mobile, offline e saida. Zero chamadas ao ERP.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep+'vibe-entregas-test-'));fs.rmSync(target,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
