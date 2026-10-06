// HTML real, aviso real e dados sinteticos; nenhuma consulta ou gravacao remota.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'frontend/script.js'),'utf8');
function extract(name){const p=script.indexOf('function '+name+'(');assert(p>=0);return script.slice(p,script.indexOf('\n}',p)+2);}
(async()=>{
 const browser=await require('puppeteer').launch({headless:true});
 try{for(const file of ['index.html','producao.html']){
  const page=await browser.newPage();await page.setViewport({width:1366,height:900});
  await page.setRequestInterception(true);page.on('request',r=>r.resourceType()==='stylesheet'?r.respond({status:200,contentType:'text/css',body:''}):r.abort());
  await page.setContent('<body></body>');
  await page.evaluate(html=>{
   const t=document.createElement('template');t.innerHTML=html;
   const view=t.content.querySelector('#view-pedido');view.querySelectorAll('script,link,img,iframe').forEach(n=>n.remove());
   view.classList.add('active');document.body.append(view);
   const preview=document.getElementById('ped-preview-card-container');if(preview)preview.style.display='block';
   window.item={id:1002265,verso_tipo:'FRENTE E VERSO',amostra_num_id:null,gabarito_operacional:'90x140 - Só Frente'};
   window.state={selectedOSItems:[],numeracoes:[{id:'front',name:'90x140 - Só Frente',print_mode:'front'}]};
   window.itensDaImposicao=()=>[item];
   window.numeracaoIdDoItem=i=>reconciliarCorNumDoModelo(i,[],state.numeracoes).numId;
   document.getElementById('ped-print-mode').value='front';
  },fs.readFileSync(path.join(root,'frontend',file),'utf8'));
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'frontend/style.css'),'utf8')});
  await page.addScriptTag({path:path.join(root,'frontend/cor-numeracao-do-modelo.js')});
  await page.addScriptTag({content:extract('atualizarRestricaoModoVibe')});
  const original=await page.evaluate(()=>JSON.stringify([item,state.numeracoes]));
  await page.evaluate(()=>atualizarRestricaoModoVibe('ped'));
  const visible=await page.evaluate(()=>{
   const e=document.getElementById('ped-modo-alerta-vibe');
   return !!e&&e.checkVisibility()&&e.textContent.includes('FRENTE E VERSO')&&!e.closest('#jg-config-corpo');
  });
  assert(visible,file+': incompatibilidade deve aparecer fora da Configuracao recolhida');
  // Mudar apenas o seletor nao corrige uma numeracao que continua front.
  await page.evaluate(()=>{document.getElementById('ped-print-mode').value='duplex';atualizarRestricaoModoVibe('ped');});
  assert(await page.$eval('#ped-modo-alerta-vibe',e=>e.checkVisibility()),file+': aviso acompanha numeracao vinculada');
  assert.equal(await page.evaluate(()=>JSON.stringify([item,state.numeracoes])),original,'avisar nao altera dados');
  await page.evaluate(()=>{state.numeracoes[0].print_mode='duplex';atualizarRestricaoModoVibe('ped');});
  assert(await page.$eval('#ped-modo-alerta-vibe',e=>e.hidden),'aviso some ao corrigir incompatibilidade');
  await page.evaluate(()=>{document.getElementById('ped-print-mode').value='front';state.numeracoes[0].print_mode='front';item.verso_tipo='SÓ FRENTE';atualizarRestricaoModoVibe('ped');});
  assert(await page.$eval('#ped-modo-alerta-vibe',e=>e.hidden),'modelo compativel nao herda aviso anterior');
  await page.close();
 }}finally{await browser.close();}
 console.log('OK: aviso visivel nos dois HTMLs com Configuracao recolhida; resolucao pelo nome; seletor nao mascara conflito; troca de modelo limpa aviso; sem mutacao.');
})().catch(e=>{console.error(e);process.exitCode=1;});
