const puppeteer=require('puppeteer');
const fs=require('fs');
const assert=require('assert/strict');
(async()=>{
 const browser=await puppeteer.launch({headless:true,...(process.env.PUPPETEER_EXECUTABLE_PATH?{executablePath:process.env.PUPPETEER_EXECUTABLE_PATH}:{})});
 try {
  for(const porta of [9000,9001,'web']){
   const page=await browser.newPage();const erros=[];const comandos=[];
   page.on('pageerror',e=>erros.push(e.message));
   page.on('dialog',d=>d.accept());
   await page.setRequestInterception(true);
   page.on('request',r=>{
    const p=new URL(r.url()).pathname;
    if(p.startsWith('/api/gestao-estacoes/')){
     assert.equal(r.headers()['x-newprod-sessao'],'sessao-sintetica');
     if(r.method()==='POST'){comandos.push(JSON.parse(r.postData()));return r.respond({contentType:'application/json',body:'{"ok":true}'});}
     const d=p.endsWith('/fila')?{disponivel:true,trabalhos:[{impressora:'Teste <script>',spool_id:3,estado:'erro_fila',criado:'2026-01-01',assinatura:'sintetica'}]}:
       p.endsWith('/relatorio')?{trabalhos:[{id:'job-sintetico',impressora:'Teste',estado:'incerto'}],eventos:[],totais:[],amostras:[],limite_trabalhos:500}:
       p.endsWith('/logs')?{linhas:['diagnostico sintetico']}:
       {canal:porta===9001?'piloto':'producao',versao:'teste',armazenamento:{disco_temp_livre_bytes:1000},retencao_metricas_dias:90};
     return r.respond({contentType:'application/json',body:JSON.stringify(d)});
    }
    r.respond({contentType:'text/html',body:'<html><head></head><body><aside class="sidebar"></aside></body></html>'});
   });
   await page.goto(porta==='web'?'https://painel.sintetico.invalid/':`http://127.0.0.1:${porta}/app/`);
   await page.evaluate(()=>{window._currentPerms={perm_admin_view:true};sessionStorage.setItem('newprod_acesso_local',JSON.stringify({token:'sessao-sintetica'}));window.supabaseClient={from(){const q={select(){return q},order(){return q},range(){return Promise.resolve({data:[{name:'Estacao sintetica',last_seen:new Date().toISOString(),printers_json:{version:'teste',gestao:{fila:{},totais_30d:[],diagnosticos:{carregado:true,recentes:[{id:'D-123456789abc',codigo:'canal_autonomo',pedido:'23381',http_origem:403,etapa:'abrir-pedido',tipo:'<img src=x onerror=alert(1)>'}]}}}}],error:null})}};return q}};});
   await page.addScriptTag({content:fs.readFileSync('frontend/gestao-estacoes.js','utf8')});
   await page.evaluate(()=>{window.historicoConsultas=[];window.supabaseClient.functions={async invoke(nome,{body}){
     if(nome.endsWith('/consultar-logs')) {
       window.historicoConsultas.push({nome,body});
       if(window.falharLogs)return {error:{message:'sintetico'}};
       return {data:{estacao:body.estacao,arquivos:[{arquivo:'agent.log',coletado_em:'2026-01-01T00:00:00Z',recebido_em:'2026-01-01T00:00:00Z',estado:'disponivel',parcial:true,tamanho:100000,linhas:['[print] pagina 1/5','[print] <img src=x onerror=alert(1)>']}]}};
     }
     window.historicoConsultas.push({nome,body});return {data:{eventos:[{id:123,estacao:'LASER-TESTE',codigo:'trabalho_enviado',contexto:{tipo:'capa',alvos:[{pedido:'23143',modelo:'1002240'}]}}],proximo:body.antes?null:123}};
   }};});
   await page.waitForSelector('#gestao-estacoes-abrir',{visible:true});await page.click('#gestao-estacoes-abrir');
   await page.waitForFunction(()=>document.querySelector('dialog')?.textContent.includes('Estacao sintetica'));
   assert.ok(await page.evaluate(()=>document.querySelector('dialog').textContent.includes('D-123456789abc')));
   assert.equal(await page.$('dialog img'),null);
   async function clicar(text){await page.evaluate(t=>[...document.querySelectorAll('dialog button')].find(b=>b.textContent===t).click(),text);}
   await clicar('Histórico por pedido');await page.waitForFunction(()=>document.querySelector('dialog')?.textContent.includes('LASER-TESTE'));
   await page.type('[data-filtro="pedido"]','23143');await clicar('Consultar histórico');
   await page.waitForFunction(()=>window.historicoConsultas.some(c=>c.body.pedido==='23143'));
   await clicar('Próxima página');await page.waitForFunction(()=>window.historicoConsultas.some(c=>c.body.antes===123));
   assert.equal(comandos.length,0);
   await clicar('Logs remotos');
   await page.type('[data-estacao-logs]','LASER-TESTE');await clicar('Consultar logs remotos');
   await page.waitForFunction(()=>document.querySelector('dialog').textContent.includes('pagina 1/5'));
   assert.equal(await page.$('dialog img'),null);
   assert.ok(await page.evaluate(()=>document.querySelector('dialog').textContent.includes('Trecho parcial')));
   assert.ok(await page.evaluate(()=>document.querySelector('dialog').textContent.includes('mais de 10 minutos')));
   assert.ok(await page.evaluate(()=>window.historicoConsultas.some(c=>c.nome.endsWith('/consultar-logs')&&c.body.estacao==='LASER-TESTE')));
   await page.type('input[type=search]','inexistente');
   assert.ok(await page.evaluate(()=>document.querySelector('[data-corpo]').textContent.includes('Nenhuma linha neste trecho')));
   await page.evaluate(()=>window.falharLogs=true);await clicar('Consultar logs remotos');
   await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Falha na atualização'));
   if(porta==='web'){
     assert.equal(await page.evaluate(()=>[...document.querySelectorAll('dialog button')].some(b=>b.textContent==='Logs locais')),false);
     await page.evaluate(()=>window._currentPerms={});await page.waitForFunction(()=>!document.querySelector('dialog'));
     assert.deepEqual(erros,[]);await page.close();continue;
   }
   await clicar('Fila ao vivo');await page.waitForFunction(()=>document.querySelector('dialog')?.textContent.includes('Teste <script>'));
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='pausar').disabled),true);
   assert.equal(comandos.length,0);
   await page.evaluate(()=>window._currentPerms.perm_admin_edit=true);await clicar('Atualizar');
   await page.waitForFunction(()=>[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='pausar')?.disabled===false);
   await clicar('pausar');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Atualizado'));
   assert.equal(comandos[0].acao,'pausar');assert.equal(comandos[0].confirmacao,true);
   await clicar('Histórico e relatórios');await page.waitForFunction(()=>document.querySelector('dialog')?.textContent.includes('job-sintetico'));
   await Promise.all([page.waitForResponse(r=>r.url().endsWith('/conferir')&&r.request().method()==='POST'),clicar('Confirmar papel')]);assert.ok(comandos.some(c=>c.resultado==='conferido'));
   await page.evaluate(()=>window._currentPerms={});await page.waitForFunction(()=>!document.querySelector('dialog'));
   assert.deepEqual(erros,[]);await page.close();
  }
  console.log('OK: gestao nos dois canais, consulta, historico, permissao, confirmacao, revogacao e texto seguro.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
