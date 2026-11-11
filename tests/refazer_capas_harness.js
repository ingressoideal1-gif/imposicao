const fs=require('fs'),assert=require('assert/strict'),puppeteer=require('puppeteer');
const fonte=fs.readFileSync('frontend/pedido.js','utf8');
function extrair(nome){const inicio=fonte.indexOf('function '+nome+'(');let pos=fonte.indexOf('{',inicio),nivel=1,fim=pos+1;for(;nivel&&fim<fonte.length;fim++){if(fonte[fim]==='{')nivel++;else if(fonte[fim]==='}')nivel--;}return fonte.slice(inicio,fim);}
(async()=>{
 const browser=await puppeteer.launch({headless:true});
 try {
  for(const pagina of ['index.html','producao.html']) {
  const page=await browser.newPage();
  const html=fs.readFileSync('frontend/'+pagina,'utf8');const inicio=html.lastIndexOf('<label',html.indexOf('id="ped-refazer-checkbox"'));
  await page.setContent(html.slice(inicio,html.indexOf('<div id="ped-refazer-acoes"',inicio)));
  await page.addScriptTag({content:['refazerFolhasAtivo','refazerCelulasAtivo','montarRefazerPayload','resetRefazerControls','refazerLigado'].map(extrair).join('\n')});
  const a=fonte.indexOf('window.onRefazerToggle = function('),b=fonte.indexOf('\n};',a)+3;
  await page.addScriptTag({content:'window.drawPedPreview=()=>{};window.irParaFolhaRefazer=()=>{};window.irParaPrimeiraFolhaDaPrevia=()=>{};'+fonte.slice(a,b)});
  await page.addScriptTag({content:fs.readFileSync('frontend/arte-de-impressao.js','utf8')});
  const r=await page.evaluate(()=>{
   const el=id=>document.getElementById('ped-refazer-'+id);
   window.pedRefazerFolhasPorSet=[50,50,50,25];
   el('checkbox').checked=true;el('capas-checkbox').checked=true;onRefazerToggle('capas');
   const todos=montarRefazerPayload(true),ligado=refazerLigado(),exclusivo=!el('checkbox').checked&&!el('cel-checkbox').checked;
   el('capas-de').value='2';el('capas-ate').value='3';const faixa=montarRefazerPayload(true);
   let antigo=false;try{conferirRecursosDoMotor(faixa,{capabilities:['refazer_intervalo_sets_v1']});}catch(e){antigo=true;}
   conferirRecursosDoMotor(faixa,{capabilities:['refazer_intervalo_sets_v1','refazer_capas_v1']});
   el('capas-ate').value='5';const fora=montarRefazerPayload(true);
   const normal=montarRefazerPayload(false);
   resetRefazerControls();return {todos,faixa,fora,normal,ligado,exclusivo,antigo,reset:!refazerLigado()};
  });
  assert.equal(r.todos.refazer_set,1);assert.equal(r.todos.refazer_set_ate,4);assert.equal(r.todos.refazer_de,0);
  assert.equal(r.faixa.refazer_set,2);assert.equal(r.faixa.refazer_set_ate,3);assert.equal(r.faixa.refazer_capas,true);
  assert.ok(r.fora.erro);assert.ok(!r.normal.refazer_capas);assert.ok(r.ligado&&r.exclusivo&&r.antigo&&r.reset);
  console.log('OK: somente capas por bloco, intervalo, modos exclusivos, reset e agente antigo bloqueado.');
  await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
