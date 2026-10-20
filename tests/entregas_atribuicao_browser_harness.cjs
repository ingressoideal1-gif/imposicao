const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8').match(/<section id="view-entregas"[\s\S]*?<\/section>/)[0];
 await p.setContent('<button id="nav-entregas"></button>'+html);
 await p.evaluate(()=>{
  window.role='admin';window.papelAtual=()=>role;window._currentPerms={perm_admin_view:true};window.showView=()=>{};
  window.calls=[];window.route=null;window.fail=false;window.edit=true;
  window.rows=[{chave:'p1',empresa:'A',pedido:1001,cliente:'Cliente teste',status_erp:'EXPEDICAO',entregador_id:null},{chave:'p2',empresa:'A',pedido:1002,cliente:'Outro',status_erp:'ENTREGUE',entregador_id:'d1',entregador:'Motorista A',concluida_em:'2026-10-17T15:31:22Z',prevista_em:'2026-10-17T16:00:00Z'}];
  window.vibeClient={functions:{invoke:async(n,{body:a})=>{calls.push({n,a});if(n==='ve_entregas_permissoes')return{data:{consultar:['admin','financeiro','expedidor','atendimento'].includes(role),editar:['admin','financeiro','expedidor'].includes(role)}};if(fail)return{data:{erro:'Previsão inválida'}};const previsoes={p1:new Date(Date.now()+3600000).toISOString()};if(a.acao==='iniciar'){route.iniciada_em=new Date().toISOString();rows[0].status_erp='EM TRANSITO';rows[0].prevista_em=previsoes.p1;route.paradas[0].prevista_em=previsoes.p1;}return{data:{confirmado:true,previsoes,iniciada_em:route.iniciada_em}};}},auth:{getSession:async()=>({data:{session:{}}})},rpc:async(n,a)=>{
   calls.push({n,a});if(n==='ve_entregas_permissoes')return{data:{consultar:['admin','financeiro','expedidor','atendimento'].includes(role),editar:['admin','financeiro','expedidor'].includes(role)}};
   if(n==='ve_acompanhar_modalidades')return{data:structuredClone(rows)};
   if(n==='ve_admin_contexto')return{data:{editar:edit,empresas:['A','B'],entregadores:[{usuario:'d1',nome:'Motorista A',ativo:true,empresas:['A']},{usuario:'d2',nome:'Motorista B',ativo:true,empresas:['B']},{usuario:'d3',nome:'Inativo',ativo:false,empresas:['A']}]}};
   if(n==='ve_admin_retirar_entregador'){if(fail)return{error:{message:'Conflito de retirada'}};rows[0].entregador_id=null;rows[0].entregador=null;rows[0].status_erp='EXPEDICAO';route=null;return{data:{confirmado:true,retirada:true,proposta:a.p_proposta}};}
   if(n==='ve_admin_atribuir_rota'){
    if(fail)return{error:{message:'Conflito de atribuição'}};
    rows[0].entregador_id=a.p_usuario;rows[0].entregador='Motorista A';rows[0].assumida_em=new Date().toISOString();route={id:'r1',usuario:'d1',paradas:[{chave:'p1',pedido:1001,entregue:false,entregador:'Motorista A'}]};
    return{data:{confirmado:true,id:'r1',usuario:a.p_usuario}};
   }
   if(n==='ve_rotas_status'||n==='ve_admin_rotas')return{data:route?[structuredClone(route),...(window.extraRoutes||[])]:[]};
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
 assert.deepEqual(await p.evaluate(()=>{const s=EntregasGestao.seletor({chave:'av1',pedido:'AV-1',avulsa:true,empresa:'__VIBE_AVULSA__',status_erp:'EXPEDICAO'},{editar:true,entregadores:[{usuario:'ativo',nome:'Ativo',ativo:true,empresas:['B']},{usuario:'inativo',nome:'Inativo',ativo:false,empresas:['B']}]});return [...s.options].map(o=>o.value);}),['','ativo']);
 assert.deepEqual(await p.$$eval('#ve-linhas tr:first-child select option',els=>els.map(e=>e.textContent)),['Selecionar entregador','Motorista A']);
 assert.equal(await p.$eval('#ve-linhas tr:nth-child(2) select',e=>e.disabled),true);
 assert.equal(await p.$$eval('#ve-linhas tr:first-child td',e=>e.length),7);
 await p.evaluate(()=>fail=true);await p.select('#ve-linhas tr:first-child select','d1');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Conflito'));assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'');
 await p.evaluate(()=>fail=false);await p.select('#ve-linhas tr:first-child select','d1');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Rota atualizada'));
 assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'d1');
 assert.equal(await p.$('#ve-rotas-lista details'),null);
 const start=await p.$('#ve-rotas-lista .btn-primary');assert.ok(start);await start.click();
 await p.waitForFunction(()=>document.querySelector('#ve-deslocamento').open);
 await p.waitForFunction(()=>!document.querySelector('#ve-deslocamento-salvar').disabled);
 assert.equal(await p.$$eval('#ve-previsoes input',e=>e.length),0);
 assert.match(await p.$eval('#ve-previsoes',e=>e.textContent),/chegada prevista/);
 await p.evaluate(()=>fail=true);await p.click('#ve-deslocamento-salvar');
 await p.waitForFunction(()=>document.querySelector('#ve-deslocamento-msg').textContent==='Previsão inválida');assert.equal(await p.$eval('#ve-deslocamento',e=>e.open),true);
 await p.evaluate(()=>fail=false);await p.click('#ve-deslocamento-salvar');
 await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Deslocamento confirmado'));
 assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.disabled),false);
 assert.match(await p.$eval('#ve-linhas tr:first-child',e=>e.textContent),/Em deslocamento/);
 assert.equal(await p.evaluate(()=>calls.filter(c=>c.n==='vibe-entregas-previsoes').at(-1).a.acao),'iniciar');
 assert.notEqual(await p.$eval('#ve-linhas tr:first-child td:nth-child(5)',e=>e.textContent),'—');
 assert.notEqual(await p.$eval('#ve-linhas tr:nth-child(2) td:nth-child(6)',e=>e.textContent),'—');
 await p.waitForFunction(()=>document.querySelector('#ve-rotas-lista tbody tr')?.textContent.includes('Em deslocamento'));
 assert.equal(await p.$$eval('#ve-rotas-lista tbody tr',e=>e.length),1);
 assert.notEqual(await p.$eval('#ve-rotas-lista tbody td:last-child',e=>e.textContent),'—');
 assert.equal(await p.$eval('#ve-rotas-lista',e=>e.closest('details')),null);
 assert.equal(await p.$$eval('#ve-rotas-lista button',e=>e.length),0);
 await p.evaluate(()=>{extraRoutes=[{id:'r2',iniciada_em:new Date().toISOString(),paradas:[{chave:'p3',pedido:1003,entregador:'Motorista B',prevista_em:'2026-10-19T18:30:00Z',entregue:false}]}];document.querySelector('#ve-rotas-atualizar').click();});
 await p.waitForFunction(()=>document.querySelectorAll('#ve-rotas-lista tbody tr').length===2);
 assert.match(await p.$eval('#ve-rotas-lista',e=>e.textContent),/Motorista B/);
 assert.match(await p.$eval('#ve-rotas-lista article:last-child tbody',e=>e.textContent),/1003/);
 assert.notEqual(await p.$eval('#ve-rotas-lista article:last-child tbody td:last-child',e=>e.textContent),'—');
 await p.evaluate(()=>{extraRoutes=[];});
 await p.evaluate(()=>window.confirm=()=>false);await p.select('#ve-linhas tr:first-child select','__retirar__');assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'d1');
 await p.evaluate(()=>{window.confirm=()=>true;fail=true;});await p.select('#ve-linhas tr:first-child select','__retirar__');await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('Conflito de retirada'));assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'d1');
 await p.evaluate(()=>fail=false);await p.select('#ve-linhas tr:first-child select','__retirar__');await p.waitForFunction(()=>document.querySelector('#ve-mensagem').textContent.includes('disponível para nova atribuição'));assert.equal(await p.$eval('#ve-status',e=>e.value),'disponivel');assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.value),'');
 await p.evaluate(()=>{edit=false;rows[0].status_erp='EXPEDICAO';return EntregasPainel.recarregar()});assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.disabled),true);
 await p.evaluate(async()=>{role='financeiro';edit=true;await EntregasAcesso.atualizar();await EntregasPainel.abrir();});
 assert.equal(await p.$eval('#nav-entregas',e=>e.style.display),'');assert.equal(await p.$eval('#ve-nova-rota',e=>e.hidden),false);
 await p.evaluate(async()=>{role='atendimento';edit=false;await EntregasAcesso.atualizar();await EntregasPainel.abrir();});
 assert.equal(await p.$eval('#nav-entregas',e=>e.style.display),'');assert.equal(await p.$eval('#ve-nova-rota',e=>e.hidden),true);assert.equal(await p.$eval('#ve-entregadores',e=>e.hidden),true);
 assert.equal(await p.$eval('#ve-linhas tr:first-child select',e=>e.disabled),true);
 await p.click('[data-ve-modalidade="veppo"]');await p.waitForFunction(()=>calls.some(c=>c.n==='ve_acompanhar_modalidades'&&c.a.p_modalidade==='veppo'));
 assert.match(await p.$eval('#ve-modalidade-info',e=>e.textContent),/90035-040/);
 await p.click('[data-ve-modalidade="aereo"]');await p.waitForFunction(()=>calls.some(c=>c.n==='ve_acompanhar_modalidades'&&c.a.p_modalidade==='aereo'));
 assert.match(await p.$eval('#ve-modalidade-info',e=>e.textContent),/92020-400/);
 await p.evaluate(()=>{role='operador';return EntregasAcesso.atualizar()});assert.equal(await p.$$eval('#ve-linhas tr',e=>e.length),0);assert.deepEqual(errors,[]);
 console.log('PASS: seletor por empresa, atribuicao automatica, conflito, concluidas bloqueadas, previsoes automaticas, deslocamento, horario real e ADM leitura.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
