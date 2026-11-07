// Botão real de aprovação e modal WhatsApp, com rede inteiramente simulada.
const fs = require('fs'), assert = require('node:assert/strict'), puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const start = source.indexOf('async function gerarLinkClienteBanner()');
const banner = source.slice(start, source.indexOf('window.gerarLinkClienteBanner =', start));
(async () => {
 const browser = await puppeteer.launch({headless:true});
 try {
  const page=await browser.newPage(); await page.setViewport({width:390,height:844});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true); page.on('request',r=>r.abort());
  const button=fs.readFileSync('frontend/index.html','utf8').match(/<button[^>]*id="btn-enviar-link-os-banner"[^>]*>[\s\S]*?<\/button>/)[0];
  await page.setContent('<!doctype html><body>'+button+'</body>');
  await page.addScriptTag({content:`
   const state={amostrasOSAtivo:'vibe_11'},linksClienteEmAndamento=new Set(),API_PAINEL='https://synthetic.example';
   const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}};
   function findOSInState(id){return {id,numero:11};}
   window.preparos=0;window.retornos=0;window.chamadas=[];window.falharRetorno=true;
   window.semLink=false;window.falharPreparo=false;window.estadoServidor='novo';window.concluidoServidor=false;
   window.conclusaoInvalida=false;window.resultadoEnvio='aguardando';window.modoDialogo=false;window.ultimoToast='';
   function toast(texto){ultimoToast=texto;}
   async function buscarLinkClienteAtivo(){return semLink?null:{token:'abc123'};}
   function linkPrecisaPrepararArte(){return false;}
   async function prepararLinkDaArtePronta(){preparos++;return {ok:!falharPreparo,link:falharPreparo?null:'link'};}
   async function concluirEnvioLinkParaAtendimento(id,preservar){
    if(id!=='vibe_11'||preservar!==true)throw Error('Contrato incorreto');
    retornos++;if(falharRetorno)throw Error('Falha simulada');
   }
   window.fetch=async(url,op)=>{
    const acao=url.split('/').pop();chamadas.push({acao,dados:JSON.parse(op.body)});
    if(op.headers.Authorization!=='Bearer synthetic')throw Error('Sem sessão');
    if(acao==='enviar'||acao==='reenviar'){estadoServidor=resultadoEnvio;await new Promise(r=>setTimeout(r,80));}
    if(acao==='status'&&!modoDialogo)estadoServidor='enviado';
    if(acao==='concluir')concluidoServidor=!conclusaoInvalida;
    return {ok:true,json:async()=>({ok:true,estado:estadoServidor,confirmacao:'hash',aceito:['aguardando','enviado'].includes(estadoServidor),
      dialogo_executado:modoDialogo&&estadoServidor==='aguardando',concluido:concluidoServidor,contato:{nome:'Contato Exemplo',whatsapp:'5511999990000'},texto:'Link de aprovação sintético'})};
   };
  `+banner});
  await page.addScriptTag({content:source.slice(source.indexOf('/* Envio do link pelo contato selecionado'))});
  await page.click('#btn-enviar-link-os-banner');
  await page.waitForFunction(()=>!document.querySelector('[data-enviar]').disabled);
  assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.acao==='enviar').length),0);
  assert.match(await page.$eval('[data-contato]',e=>e.textContent),/Contato Exemplo/);
  assert.equal(await page.evaluate(()=>preparos),0);
  await page.evaluate(()=>{document.querySelector('[data-enviar]').click();document.querySelector('[data-enviar]').click();});
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Retorno ao atendimento pendente'));
  assert.equal(await page.$eval('dialog',e=>e.open),true);
  assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.acao==='enviar').length),1);
  await page.evaluate(()=>{falharRetorno=false;conclusaoInvalida=true;}); await page.click('[data-concluir]');
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Retorno ao atendimento pendente'));
  assert.equal(await page.$eval('dialog',e=>e.open),true,'conclusão não confirmada mantém janela');
  await page.evaluate(()=>{conclusaoInvalida=false;}); await page.click('[data-concluir]');
  await page.waitForFunction(()=>concluidoServidor&&!document.querySelector('dialog').open);
  assert.equal(await page.evaluate(()=>retornos),3);
  await page.evaluate(()=>abrirWhatsappArte('vibe_11'));
  assert.equal(await page.$eval('dialog',e=>e.open),true,'reabrir permite consultar envio anterior');
  await page.click('[data-consultar]');
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Envio informado'));
  assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.acao==='enviar').length),1);
  await page.click('[data-fechar]'); await page.evaluate(()=>abrirWhatsappArte('vibe_11'));
  assert.equal(await page.$eval('[data-concluir]',e=>e.hidden),true);
  assert.equal(await page.$eval('[data-enviar]',e=>e.disabled),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.click('[data-fechar]');
  for(const resultado of ['falhou','desconhecido']){
   await page.evaluate(r=>{estadoServidor='novo';concluidoServidor=false;resultadoEnvio=r;},resultado);
   await page.evaluate(()=>abrirWhatsappArte('vibe_11'));
   await page.click('[data-enviar]');
   await page.waitForFunction(r=>estadoServidor===r&&document.querySelector('[data-consultar]').disabled===false,{},resultado);
   assert.equal(await page.$eval('dialog',e=>e.open),true,'falha/incerteza mantém janela');
   await page.click('[data-fechar]');
  }
  await page.evaluate(()=>{estadoServidor='novo';concluidoServidor=false;resultadoEnvio='aguardando';modoDialogo=true;});
  await page.evaluate(()=>abrirWhatsappArte('vibe_11')); await page.click('[data-enviar]');
  await page.waitForFunction(()=>concluidoServidor&&!document.querySelector('dialog').open);
  assert.equal(await page.evaluate(()=>ultimoToast),'Diálogo executado pelo ChatGuru.');
  await page.evaluate(()=>abrirWhatsappArte('vibe_11'));
  assert.match(await page.$eval('[data-status]',e=>e.textContent),/Diálogo executado/);
  assert.equal(await page.$eval('[data-enviar]',e=>e.disabled),true);
  await page.click('[data-fechar]');await page.evaluate(()=>{semLink=true;falharPreparo=true;});
  const antes=await page.evaluate(()=>chamadas.length);
  await page.evaluate(()=>gerarLinkClienteBanner());
  assert.equal(await page.evaluate(()=>chamadas.length),antes);
  assert.deepEqual(errors,[]);
  console.log('OK: WhatsApp fecha após confirmação; falha/incerteza/conclusão pendente mantêm janela; recuperação sem reenvio, status e mobile');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
