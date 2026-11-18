// Navegador real com rede simulada e dados sintéticos.
const fs=require('node:fs'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const source=fs.readFileSync('frontend/script.js','utf8');
const moduleSource=source.slice(source.indexOf('/* Contato selecionado na Lista de Arte.'),source.indexOf('/* Envio do link pelo contato selecionado'));
(async()=>{const browser=await puppeteer.launch({headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:390,height:844});await page.setRequestInterception(true);page.on('request',r=>r.abort());
 await page.setContent('<!doctype html><body><table><tbody id="linhas"></tbody></table></body>');
 await page.addScriptTag({content:`
 const API_PAINEL='https://synthetic.example';
 const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}};
 function escapeHtml(s){const e=document.createElement('span');e.textContent=String(s);return e.innerHTML;}
 function escapeJsAttr(s){return s;}
 window.abriu=null;function abrirWhatsappArte(id){abriu=id;}
 window.chamadas=[];window.erroNaConsulta=false;
 const a={contato_id:'guru#'+'a'.repeat(24),nome:'Contato A',whatsapp:'5511999990000'};
 const b={contato_id:'guru#'+'b'.repeat(24),nome:'<img src=x onerror=alert(1)>',whatsapp:'5511888880000'};
 window.cadastros={11:{pedido:11,...b,valido:true,opcoes:[a,b]},12:{pedido:12,valido:false,opcoes:[a,b]},13:{pedido:13,valido:false,opcoes:[]}};
 window.fetch=async(url,op)=>{
  const acao=url.split('/').pop(),dados=JSON.parse(op.body);chamadas.push({acao,dados});
  if(erroNaConsulta)return {ok:false,json:async()=>({detail:'Erro simulado'})};
  return {ok:true,json:async()=>dados.pedidos.map(p=>cadastros[p])};
 };
 `+moduleSource});
 await page.evaluate(async()=>{
  const ordens=[11,12,13].map(numero=>({id:'vibe_'+numero,numero}));
  document.querySelector('#linhas').innerHTML=ordens.map(o=>'<tr><td data-contato-os="'+o.id+'" data-contato-arte="'+o.numero+'">'+ContatosListaArte.html(o)+'</td><td>'+ContatosListaArte.botaoWhatsapp(o)+'</td></tr>').join('');
  await ContatosListaArte.carregar(ordens);await ContatosListaArte.carregar(ordens);
 });
 assert.equal(await page.evaluate(()=>chamadas.length),1);
 assert.equal(await page.$$eval('select:disabled',s=>s.length),2);
 assert.equal(await page.$$eval('input,dialog,img',s=>s.length),0);
 assert.ok(await page.$eval('[data-contato-arte="13"]',e=>e.textContent.includes('Sem contato no Guru 3478')));
 assert.equal(await page.$eval('select',e=>e.options.length),2);
 assert.equal(await page.$eval('[data-contato-arte="11"] select',e=>e.value),'guru#'+'b'.repeat(24));
 assert.match(await page.$eval('[data-contato-arte="11"] [role="status"]',e=>e.textContent),/Comprador definido no Vibe/);
 assert.equal(await page.$eval('[data-contato-arte="12"] select',e=>e.value),'');
 assert.match(await page.$eval('[data-contato-arte="12"] select',e=>e.selectedOptions[0].textContent),/Confira o comprador no Vibe/);
 assert.equal(await page.$$eval('select[onchange]',s=>s.length),0);
 await page.evaluate(async()=>{erroNaConsulta=true;await ContatosListaArte.recarregar('11');});
 assert.match(await page.$eval('[data-contato-arte="11"]',e=>e.textContent),/Recarregar contato/);
 await page.evaluate(()=>{
  erroNaConsulta=false;
  cadastros[11]={...cadastros[11],...cadastros[11].opcoes[0]};
 });
 await page.click('[data-contato-arte="11"] button');
 await page.waitForSelector('[data-contato-arte="11"] select');
 assert.equal(await page.$eval('[data-contato-arte="11"] select',e=>e.value),'guru#'+'a'.repeat(24));
 assert.ok(await page.evaluate(()=>chamadas.every(c=>c.acao==='consultar')));
 await page.click('[aria-label="Enviar link pelo WhatsApp"]');assert.equal(await page.evaluate(()=>abriu),'vibe_11');
 assert.deepEqual(errors,[]);
 console.log('OK: dropdown somente leitura, comprador do Vibe, vazio, recarga, XSS e abertura do envio');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
