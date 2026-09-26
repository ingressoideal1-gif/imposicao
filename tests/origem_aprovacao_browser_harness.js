const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const raiz=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(raiz,'frontend/script.js'),'utf8');
const modulo=fs.readFileSync(path.join(raiz,'frontend/origem-aprovacao.js'),'utf8');
const inicio=script.indexOf('<td style="text-align: center; vertical-align: middle;">${entregaHtml}');
const fim=script.indexOf('${celulaDePagamentoHtml(os)}',inicio);
assert.ok(inicio>0&&fim>inicio);
const celulas=script.slice(inicio,fim);
const entrega=script.match(/entregaHtml = `([^`]*✅ APROVADO[^`]*)`/)[1];
(async()=>{
 const browser=await puppeteer.launch({headless:true});
 try{
  const page=await browser.newPage();
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().startsWith('http://origem.test/')?r.respond({status:200,contentType:'text/html',body:'<meta charset="utf-8"><table><tbody id="linhas"></tbody></table>'}):r.abort());
  async function montar(){
   await page.addScriptTag({content:modulo});
   await page.evaluate(async({celulas,entrega})=>{
    window.navegou=0;window.alterou=0;window.chamadas=[];
    window.navigateToAmostrasFromOS=()=>window.navegou++;
    window.alterarEntregaDadosStatus=()=>window.alterou++;
    const banco={auth:{getSession:async()=>({data:{session:{user:{id:'teste'}}}})},
     rpc:async(nome)=>{chamadas.push(nome);return nome==='registrar_rede_atendimento'?{data:true}:{data:[{pedido:123,arte:'Cliente',dados:'Atendente'}]};}};
    await OrigemAprovacao.carregar(banco,[123]);
    const os={numero:123,status:'APROVADO'},entregaStatus='APROVADO';
    const entregaHtml=new Function('os','entregaStatus','return `'+entrega+'`;')(os,entregaStatus);
    const row=new Function('os','entregaStatus','entregaHtml','artProgressHtml','getStatusBadge','return `'+celulas+'`;')
      (os,entregaStatus,entregaHtml,'',()=>'<span class="badge">APROVADO</span>');
    document.getElementById('linhas').innerHTML='<tr onclick="navigateToAmostrasFromOS()">'+row+'</tr>';
   },{celulas,entrega});
  }
  await page.goto('http://origem.test/');
  for(const width of [1280,390]){
   await page.setViewport({width,height:850});await montar();
   const dados=await page.$$eval('td',tds=>tds.map(td=>({texto:td.textContent.trim(),abaixo:td.querySelector('.origem-aprovacao').getBoundingClientRect().top>=td.querySelector('.badge').getBoundingClientRect().bottom})));
   assert.match(dados[0].texto,/APROVADO.*Atendente/s);assert.match(dados[1].texto,/APROVADO.*Cliente/s);
   assert.ok(dados.every(d=>d.abaixo));
   await page.click('td:first-child .badge');assert.equal(await page.evaluate(()=>alterou),1);assert.equal(await page.evaluate(()=>navegou),0);
   await page.click('td:nth-child(2) .origem-aprovacao');assert.equal(await page.evaluate(()=>navegou),1);
  }
  await page.reload();await montar();
  assert.equal(await page.$$eval('.origem-aprovacao',els=>els.map(e=>e.textContent).join('/')),'Atendente/Cliente');
  assert.deepEqual(erros,[]);
  console.log('OK: células reais da Lista, indicadores abaixo dos status, desktop/celular, cliques e recarga.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
