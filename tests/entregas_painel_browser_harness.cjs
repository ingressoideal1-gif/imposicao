const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true});
 try {
  const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const root=path.resolve(__dirname,'..');const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
  const section=html.match(/<section id="view-entregas"[\s\S]*?<\/section>/)[0];
  await p.setContent('<button id="nav-entregas"></button>'+section);
  await p.evaluate(()=>{
   window.role='operador';window.papelAtual=()=>window.role;window._currentPerms={perm_admin_view:true};window.showView=()=>{};window.calls=0;window.fotos=0;
   window.rows=[{pedido:1001,cliente:'<img src=x onerror="window.injetou=true">',entregador:'Motorista teste',recebedor:'Pessoa teste',concluida_em:new Date().toISOString(),foto:'pasta/foto.jpg',tentativas:[{registrada_em:new Date().toISOString(),motivo:'ausente',observacao:'Teste'}]}];
   window.vibeClient={auth:{getSession:async()=>({data:{session:{}}})},rpc:async()=>{window.calls++;if(window.pendente)return new Promise(resolve=>{window.resolver=resolve});return window.erro?{error:{code:'PGRST202'}}:{data:window.rows};},storage:{from:()=>({createSignedUrl:async()=>{window.fotos++;return{data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOuoAAAAASUVORK5CYII='}};}})}};
  });
  const script=fs.readFileSync(path.join(root,'frontend/script.js'),'utf8').split('// INICIO PAINEL ENTREGAS')[1].split('// FIM PAINEL ENTREGAS')[0];await p.addScriptTag({content:script});
  await p.evaluate(()=>showView('view-entregas'));assert.equal(await p.evaluate(()=>calls),0);
  await p.evaluate(()=>{role='admin';EntregasPainel.atualizarAcesso();showView('view-entregas')});await p.waitForFunction(()=>document.querySelector('#ve-linhas button'));
  assert.equal(await p.$eval('#ve-linhas',e=>e.querySelectorAll('img').length),0);assert.equal(await p.evaluate(()=>window.injetou),undefined);
  await p.click('#ve-linhas button');await p.waitForFunction(()=>!document.getElementById('ve-comprovante').hidden);assert.equal(await p.evaluate(()=>fotos),1);
  await p.click('#ve-fechar');await p.waitForFunction(()=>!document.getElementById('ve-comprovante').getAttribute('src'));
  const calls=await p.evaluate(()=>window.calls);await p.click('#ve-demo');assert.equal(await p.evaluate(()=>window.calls),calls);assert.match(await p.$eval('#ve-mensagem',e=>e.textContent),/DEMONSTRAÇÃO/);
  await p.evaluate(()=>{erro=true;document.getElementById('ve-filtros').requestSubmit()});await p.waitForFunction(()=>document.getElementById('ve-mensagem').textContent.includes('não implantada'));
  await p.evaluate(()=>{erro=false;pendente=true;EntregasPainel.abrir()});await p.waitForFunction(()=>typeof window.resolver==='function');
  await p.evaluate(()=>{role='operador';EntregasPainel.atualizarAcesso();resolver({data:rows})});await p.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));
  assert.equal(await p.$$eval('#ve-linhas tr',els=>els.length),0);assert.deepEqual(errors,[]);
  console.log('PASS: painel Entregas; acesso ADM, consulta, XSS, comprovante temporario, demonstracao, erro de implantacao e troca de permissao durante consulta.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
