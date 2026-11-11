const fs=require('node:fs'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{
 const base=process.argv[2], browser=await puppeteer.launch({headless:true});
 const script=fs.readFileSync('frontend/impressao-autonoma.js','utf8');
 async function abrir(){const p=await browser.newPage();await p.goto(base);await p.addScriptTag({content:script});return p;}
 async function iniciar(p,capas=false){return p.evaluate(capas=>{
  const id=crypto.randomUUID(),formData=new FormData();
  formData.set('payload',JSON.stringify({integridade:{job_id:id},refazer_capas:capas,impressao_autonoma:{}}));
  window.resultado=null;
  window.promessa=ImpressaoAutonoma.iniciar({baseUrl:location.origin,formData,headers:{},
   destino:{printerName:'sintetica',options:{experimental:true,modo:'experimental_gdi',copies:1}},
   face:'both',rotacionarPares:false,historicoContexto:{reimpressao:capas}})
   .then(ok=>window.resultado={ok},e=>window.resultado={erro:e.message});
  return id;
 },capas);}
 async function estado(id){return (await fetch(base+'/api/print/trabalhos/'+id)).json();}
 async function esperar(id,check){for(let i=0;i<150;i++){const s=await estado(id);if(check(s))return s;await new Promise(r=>setTimeout(r,100));}throw new Error('prazo do teste');}
 try{
  let p=await abrir(),id=await iniciar(p);
  await esperar(id,s=>s.enviados>=2&&s.estado==='enviando');
  await p.close(); // Desapareceu o cliente que iniciou a impressao.
  p=await abrir();
  await p.evaluate(()=>ImpressaoAutonoma.consultar());
  assert.match(await p.$eval('#impressao-autonoma-andamento',e=>e.textContent),/Impressão na estação/);
  let final=await esperar(id,s=>s.estado==='enviado');
  assert.equal(final.enviados,15);assert.equal(final.paginas_enviadas,110);
  assert.equal(new Set(final.lotes.map(l=>l.envio)).size,15);
  assert.deepEqual(final.lotes.filter(l=>['capa','contracapa'].includes(l.tipo)).map(l=>l.tipo),['capa','contracapa','capa','contracapa']);
  await p.evaluate(()=>ImpressaoAutonoma.consultar());
  id=await iniciar(p,true);
  final=await esperar(id,s=>s.estado==='enviado');
  assert.equal(final.enviados,2);assert.ok(final.lotes.every(l=>l.tipo==='capa'));
  // Espere a promessa da tela terminar antes de iniciar o proximo trabalho.
  await p.evaluate(()=>window.promessa);
  id=await iniciar(p);
  await esperar(id,s=>s.estado==='enviando');
  await p.evaluate(()=>ImpressaoAutonoma.cancelar());
  final=await esperar(id,s=>s.estado==='cancelado');
  assert.equal(final.enviados,1);assert.equal(final.gerados,1);
  console.log('OK: navegador fechado/reaberto, 110 paginas sem duplicacao, capas por bloco e cancelamento explicito.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
