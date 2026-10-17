const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8').match(/<section id="view-entregas"[\s\S]*?<\/section>/)[0];
 await p.setContent('<button id="nav-entregas"></button>'+html);
 await p.evaluate(()=>{
  window.role='admin';window.papelAtual=()=>role;window._currentPerms={perm_admin_view:true};window.showView=()=>{};
  window.calls=[];window.route=null;window.fail=false;window.edit=true;
  window.rows=[{chave:'p1',empresa:'A',pedido:1001,cliente:'Cliente teste',status_erp:'EXPEDICAO',entregador_id:null},{chave:'p2',empresa:'A',pedido:1002,cliente:'Outro',status_erp:'ENTREGUE',entregador_id:'d1',entregador:'Motorista A',concluida_em:'2026-10-17T15:31:22Z',prevista_em:'2026-10-17T16:00:00Z'}];
  window.vibeClient={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(n,a)=>{
   calls.push({n,a});
   if(n==='ve_acompanhar')return{data:structuredClone(rows)};
   if(n==='ve_admin_contexto')return{data:{editar:edit,empresas:['A','B'],entregadores:[{usuario:'d1',nome:'Motorista A',ativo:true,empresas:['A']},{usuario:'d2',nome:'Motorista B',ativo:true,empresas:['B']},{usuario:'d3',nome:'Inativo',ativo:false,empresas:['A']}]}};
   if(n==='ve_admin_atribuir_rota'){
    if(fail)return{error:{message:'Conflito de atribuição'}};
    rows[0].entregador_id=a.p_usuario;rows[0].entregador='Motorista A';rows[0].assumida_em=new Date().toISOString();route={id:'r1',usuario:'d1',paradas:[{chave:'p1',pedido:1001,entregue:false,entregador:'Motorista A'}]};
    return{data:{confirmado:true,id:'r1',usuario:a.p_usuario}};
   }
   if(n==='ve_rotas_status'||n==='ve_admin_rotas')return{data:route?[structuredClone(route)]:[]};
   if(n==='ve_admin_iniciar_deslocamento'){
    if(fail)return{error:{message:'Previsão inválida'}};
    route.iniciada_em=new Date().toISOString();rows[0].status_erp='EM TRANSITO';rows[0].prevista_em=a.p_previsoes.p1;
    return{data:{confirmado:true,iniciada_em:route.iniciada_em}};
   }
   return{data:[]};
  }};
 });
 const js=fs.readFileSync(path.join(root,'frontend/script.js'),'utf8');await p.addScriptTag({content:js.slice(js.indexOf('// INICIO PAINEL ENTREGAS'))});
 await p.evaluate(()=>EntregasPainel.abrir());
 assert.deepEqual(await p.$$eval('#ve-linhas tr:first-child select option',els=>els.map(e=>e.textContent)),['Selecionar entregador','Motorista A']);
 assert.equal(await p.$eval('#ve-linhas tr:nth-child(2) select',e=>e.disabled),true);
 assert.equal(await p.$$eval('#ve-linhas tr:first-child td',e=>e.length),7);
 await p.evaluate(()=>fail=true);await p.select('#ve-linhas tr:first-child select','d1');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Conflito'));assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'');
 await p.evaluate(()=>fail=false);await p.select('#ve-linhas tr:first-child select','d1');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Rota atualizada'));
 assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'d1');
 await p.evaluate(()=>document.querySelector('#ve-rotas-lista').closest('details').open=true);
 const start=await p.$('#ve-rotas-lista .btn-primary');assert.ok(start);await start.click();
 await p.waitForFunction(()=>document.querySelector('#ve-deslocamento').open);
 assert.equal(await p.$$eval('#ve-previsoes input',e=>e.length),1);
 await p.$eval('#ve-previsoes input',e=>e.value='2026-10-17T18:30');await p.evaluate(()=>fail=true);await p.click('#ve-deslocamento-salvar');
 await p.waitForFunction(()=>document.querySelector('#ve-deslocamento-msg').textContent==='Previsão inválida');assert.equal(await p.$eval('#ve-deslocamento',e=>e.open),true);
 await p.evaluate(()=>fail=false);await p.click('#ve-deslocamento-salvar');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Deslocamento confirmado'));
 assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.disabled),true);
 assert.match(await p.$eval('#ve-linhas tr:first-child',e=>e.textContent),/Em deslocamento/);
 assert.equal(await p.evaluate(()=>calls.filter(c=>c.n==='ve_admin_iniciar_deslocamento').at(-1).a.p_previsoes.p1),'2026-10-17T18:30:00-03:00');
 assert.notEqual(await p.$eval('#ve-linhas tr:first-child td:nth-child(5)',e=>e.textContent),'—');
 assert.notEqual(await p.$eval('#ve-linhas tr:nth-child(2) td:nth-child(6)',e=>e.textContent),'—');
 assert.equal(await p.$$eval('#ve-rotas-lista button',e=>e.length),0);
 await p.evaluate(()=>{edit=false;rows[0].status_erp='EXPEDICAO';return EntregasPainel.recarregar()});assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.disabled),true);
 await p.evaluate(()=>{role='operador';EntregasPainel.atualizarAcesso()});assert.equal(await p.$$eval('#ve-linhas tr',e=>e.length),0);assert.deepEqual(errors,[]);
 console.log('PASS: seletor por empresa, atribuicao automatica, conflito, concluidas bloqueadas, previsoes manuais, deslocamento, horario real e ADM leitura.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
