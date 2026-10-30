const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<button id="card-gabaritos-arte" hidden>Gabaritos</button>');
  await page.evaluate(()=>{
   window.API_PAINEL='https://synthetic.invalid';
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}};
   window._currentPerms={role:'atendimento',perm_lista_arte_view:true};
   window.fetch=async()=>({ok:true,json:async()=>({produtos:[{id_produto:1,nomeReal:'Pulseira <script>não executar</script>'},{id_produto:2,nomeReal:'Credencial'}],gabaritos:[{produto:2,revisao:'r1'}]})});
  });
  await page.addScriptTag({path:'frontend/gabaritos.js'});
  assert.equal(await page.$eval('#card-gabaritos-arte',e=>e.hidden),false);
  await page.evaluate(()=>Gabaritos.abrir());
  assert.equal(await page.$$eval('tbody tr',r=>r.length),2);
  assert.equal(await page.$eval('tbody tr td',e=>e.textContent),'Pulseira <script>não executar</script> · 1');
  assert.equal(await page.$$eval('tbody script',r=>r.length),0);
  assert.equal(await page.$eval('tbody tr button:nth-child(2)',e=>e.disabled),true);
  await page.type('input[type=search]','Credencial');
  assert.equal(await page.$$eval('tbody tr',r=>r.length),1);
  assert.equal(await page.$eval('tbody tr button:nth-child(2)',e=>e.disabled),false);
  await page.evaluate(()=>{_currentPerms={role:'cliente'};Gabaritos.atualizarAcesso();});
  assert.equal(await page.$eval('#card-gabaritos-arte',e=>e.hidden),true);
  console.log('Biblioteca: atendimento, pesquisa, download, nomes seguros e ocultacao por papel OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
