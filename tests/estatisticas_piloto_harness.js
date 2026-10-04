const puppeteer = require('puppeteer');
const fs = require('fs');
const assert = require('assert/strict');
(async()=>{
 const browser=await puppeteer.launch({headless:true, ...(process.env.PUPPETEER_EXECUTABLE_PATH ? {executablePath:process.env.PUPPETEER_EXECUTABLE_PATH} : {})});
 try {
  const page=await browser.newPage();let falha=false;let preferencias=[];const comandos=[];let pausado=false;
  await page.setRequestInterception(true);
  page.on('request',route=>{
   if(route.url().endsWith('/controle-painel')) {
    const cmd=JSON.parse(route.postData());comandos.push(cmd);
    if(cmd.acao==='preferir')preferencias=cmd.marcado?[cmd.pedido]:[];
    if(cmd.acao==='pausar')pausado=true;
    if(cmd.acao==='iniciar')pausado=false;
    return route.respond({contentType:'application/json',body:'{}'});
   }
   if(route.url().endsWith('/resumo-painel'))return falha ? route.abort() : route.respond({contentType:'application/json',body:JSON.stringify({
    preferenciais:preferencias,modelos:[{modelo:'1',estado:'recursos_antecipados'}],estatisticas:{arquivos_cache:1,bytes_cache:1048576,bytes_livres:1073741824,modelos_catalogados:1,revisoes_com_falha:0},fila:{pendentes:2,pausado},coleta:{}})});
   return route.respond({contentType:'text/html',body:`<html><body><div class="prod-table-card"><div class="prod-table-body"><table id="table-impressao"><tr class="os-row" onclick="abrirImposicaoDoPedido('os1','1')"><td></td><td></td><td></td><td></td><td>2 modelos</td></tr></table></div></div><script>let aberturas=0;function abrirImposicaoDoPedido(){aberturas++;return 'aberto'};const state={ordens:[{id:'os1',numero:'1'}],modelosGlobais:{1:[{id:1},{id:2}]}};</script></body></html>`});
  });
  // O recurso experimental nao deve atuar sobre o painel de producao.
  await page.goto('http://127.0.0.1:9000/app/');
  await page.addScriptTag({content:fs.readFileSync('frontend/estatisticas-piloto.js','utf8')});
  assert.equal(await page.$('#estatisticas-piloto-local'),null);
  assert.equal(await page.$('[data-piloto-preferir]'),null);
  assert.equal(comandos.length,0);
  await page.goto('http://127.0.0.1:9001/app/');
  await page.evaluate(()=>{const original=setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===15000?200:ms,...args);});
  await page.addScriptTag({content:fs.readFileSync('frontend/estatisticas-piloto.js','utf8')});
  await page.waitForFunction(()=>document.querySelector('[data-piloto-modelos]')?.textContent.includes('1/2'));
  assert.match(await page.$eval('#estatisticas-piloto-local',el=>el.textContent),/Arquivos no cache: 1/);
  assert.match(await page.$eval('[data-piloto-modelos]',el=>el.textContent),/atualização ao abrir/);
  await page.click('[data-piloto-preferir]');
  await page.waitForFunction(()=>document.querySelector('[data-piloto-preferir]').checked && !document.querySelector('[data-piloto-preferir]').disabled);
  assert.deepEqual(comandos[0],{acao:'preferir',pedido:'1',marcado:true});
  await page.click('[data-pausar]');
  await page.waitForFunction(()=>document.querySelector('[data-iniciar]').textContent==='Retomar cópia local');
  await page.click('[data-iniciar]');
  await page.waitForFunction(()=>document.querySelector('[data-iniciar]').textContent==='Iniciar cópia local');
  assert.deepEqual(comandos.slice(1),[{acao:'pausar'},{acao:'iniciar'}]);
  assert.equal(await page.evaluate(()=>abrirImposicaoDoPedido('os1','1')),'aberto');
  await page.waitForFunction(()=>aberturas===1);
  await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(comandos.at(-1),{acao:'abrir',pedido:'1'});
  falha=true;
  await page.waitForFunction(()=>document.querySelector('[data-piloto-modelos]')?.textContent==='Local não verificado');
  console.log('Estatisticas e selo parcial, sem falso verde; falha de rede confirmada.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
