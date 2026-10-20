const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true});
 try{
  const page=await browser.newPage(),root=path.resolve(__dirname,'..'),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});
  const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8').match(/<section id="view-entregas"[\s\S]*?<\/section>/)[0];
  await page.setContent(html);await page.addStyleTag({path:path.join(root,'frontend/style.css')});
  await page.evaluate(()=>{
   window.EntregasAcesso={editar:true};window.calls=[];window.falhar=true;window.cepErro=false;
   Object.defineProperty(window,'crypto',{value:{randomUUID:()=> '00000000-0000-0000-0000-000000000201'}});
   window.EntregasPainel={abrir:async()=>{window.recarregado=true;}};
   window.fetch=async()=>({ok:true,json:async()=>cepErro?{erro:true}:{logradouro:'Rua Sintetica',bairro:'Centro',localidade:'Cidade Teste',uf:'RS'}});
   window.vibeClient={rpc:async(n,a)=>{
    calls.push({n,a});
    if(n==='ve_admin_buscar_locais')return{data:[{id:'local1',nome:'<img src=x onerror=alert(1)>',cep:'90000000',numero:'20',logradouro:'Rua Salva',cidade:'Cidade',uf:'RS'}]};
    if(falhar)return{error:{message:'Falha temporaria'}};
    return{data:{confirmado:true,id:a.p_operacao,numero:1}};
   }};
   document.getElementById('ve-adicionar-entrega').hidden=false;
   document.getElementById('view-entregas').style.display='block';
  });
  await page.addScriptTag({path:path.join(root,'frontend/entregas-avulsas.js')});
  await page.click('#ve-adicionar-entrega');
  await page.type('#ve-local-nome','Local teste');await page.type('#ve-local-cep','90000-000');
  await page.evaluate(()=>cepErro=true);await page.click('#ve-local-consultar-cep');
  await page.waitForFunction(()=>document.getElementById('ve-avulsa-msg').textContent.includes('não encontrado'));
  await page.evaluate(()=>cepErro=false);await page.click('#ve-local-consultar-cep');
  await page.waitForFunction(()=>document.getElementById('ve-local-logradouro').value==='Rua Sintetica');
  await page.type('#ve-local-numero','10');await page.click('#ve-avulsa-salvar');
  await page.waitForFunction(()=>document.getElementById('ve-avulsa-msg').textContent==='Falha temporaria');
  assert.equal(await page.$eval('#ve-avulsa',e=>e.open),true);
  await page.evaluate(()=>falhar=false);await page.click('#ve-avulsa-salvar');await page.waitForFunction(()=>!document.getElementById('ve-avulsa').open);
  const creates=await page.evaluate(()=>calls.filter(c=>c.n==='ve_admin_criar_avulsa'));
  assert.equal(creates.length,2);assert.deepEqual(creates[0].a,creates[1].a);
  assert.equal(creates[0].a.p_dados.logradouro,'Rua Sintetica');assert.equal(creates[0].a.p_local,null);
  assert.equal(await page.evaluate(()=>recarregado),true);
  await page.click('#ve-adicionar-entrega');await page.type('#ve-local-busca','local');await page.click('#ve-local-pesquisar');
  await page.waitForSelector('#ve-local-resultados button');assert.equal(await page.$$eval('#ve-local-resultados img',e=>e.length),0);
  await page.click('#ve-local-resultados button');assert.equal(await page.$eval('#ve-local-campos',e=>e.disabled),true);
  await page.click('#ve-avulsa-salvar');await page.waitForFunction(()=>!document.getElementById('ve-avulsa').open);
  assert.equal(await page.evaluate(()=>calls.at(-1).a.p_local),'local1');
  assert.equal(await page.evaluate(()=>calls.at(-1).a.p_dados),null);
  await page.click('#ve-adicionar-entrega');await page.evaluate(()=>{EntregasAcesso.editar=false;EntregasAvulsas.limpar();});
  await page.click('#ve-adicionar-entrega');assert.equal(await page.$eval('#ve-avulsa',e=>e.open),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: cadastro avulso, CEP invalido/encontrado, erro/reenvio idempotente, local salvo, XSS e acesso revogado.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
