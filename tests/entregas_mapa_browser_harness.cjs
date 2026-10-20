const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), puppeteer = require('puppeteer');
(async () => {
 const browser = await puppeteer.launch({ headless: true });
 try {
  const p = await browser.newPage(), errors = [], root = path.resolve(__dirname, '..');
  p.on('pageerror', e => errors.push(e.message));
  await p.setViewport({ width: 1440, height: 1100 });
  const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8').match(/<section id="view-entregas"[\s\S]*?<\/section>/)[0];
  await p.setContent(html);
  await p.addStyleTag({ path: path.join(root, 'frontend/style.css') });
  await p.addStyleTag({ content: 'body{background:#0c1424;color:#e8edf6;font:14px system-ui;margin:0}.view-section{display:block!important}' });
  await p.evaluate(() => {
   window.role = 'admin'; window.papelAtual = () => role; window._currentPerms = { perm_admin_view: true };window.EntregasAcesso={get consultar(){return papelAtual()==='admin';}};
   window.ENTREGAS_MAPA_CONFIG = { apiKey: '' };
   window.calls = []; window.routeCalls = []; window.lines = []; window.markers = []; window.pending = false;
   window.rows = [
    { chave: '01', pedido: 1001, cliente: '<img src=x onerror=alert(1)>', endereco: 'Rua Teste, 10', endereco_completo: true, entregador_id: 'paulo', entregador: 'Paulo', rota_id: 'r1', ordem: 2, retorno: true },
    { chave: '02', pedido: 1002, cliente: 'Cliente 2', endereco: 'Rua Teste, 20', endereco_completo: true, entregador_id: 'paulo', entregador: 'Paulo', rota_id: 'r1', ordem: 1, retorno: true },
    { chave: '03', pedido: 1003, cliente: 'Cliente 3', endereco: 'Rua Teste, 30', endereco_completo: true, entregador_id: 'ana', entregador: 'Ana', rota_id: 'r2', ordem: 1, retorno: false },
    { chave: '04', pedido: 1004, cliente: 'Disponível', endereco: 'Rua Teste, 40', endereco_completo: true },
    { chave: '05', pedido: 1005, cliente: 'Sem endereço', endereco: '', endereco_completo: false }
   ];
   rows.forEach((r,i)=>r.status_erp=i===4?'EM PRODUCAO':'EXPEDICAO');
   window.vibeClient = { rpc: async (name, args) => { calls.push({ name, args }); if(name==='ve_admin_mapa_config') return {data:{}}; if (pending) await new Promise(r => window.resolvePending = r); return { data: args.p_apos ? rows.filter(r => r.chave > args.p_apos).slice(0, 201) : rows.slice(0, 201) }; } };
   window.installMaps = () => {
    class Bounds { constructor() { this.points = []; } extend(p) { this.points.push(p); } isEmpty() { return !this.points.length; } }
    class MapMock { constructor(el) { this.el = el; el.textContent = 'Google Maps simulado para teste · sem chamadas externas'; } fitBounds(b) { this.bounds = b; } }
    class Marker { constructor(o) { Object.assign(this, o); markers.push(this); } addListener(_, cb) { this.click = cb; } }
    class Polyline { constructor(o) { Object.assign(this, o); lines.push(this); } setMap(m) { this.map = m; } }
    class Geocoder { async geocode({ address }) { if(window.geocodeOverride){const r=window.geocodeOverride(address);if(r)return r;} const n = Number(address.match(/, (\d+)/)?.[1] || 1); return { results: [{ geometry: { location_type: 'ROOFTOP', location: { toJSON: () => ({ lat: -30 - n / 1000, lng: -51.2 }) } } }] }; } }
    class InfoWindow { setContent(n) { window.popup = n; } open() {} close() {} }
    const Route = { computeRoutes: async r => { routeCalls.push(r); return { routes: [{ path: [r.origin, ...r.intermediates.map(p => p.location), r.destination] }] }; } };
    window.google = { maps: { LatLngBounds: Bounds, importLibrary: async () => ({ Map: MapMock, AdvancedMarkerElement: Marker, Polyline, Geocoder, InfoWindow, Route }) } };
   };
  });
  await p.addScriptTag({ path: path.join(root, 'frontend/entregas-mapa.js') });
  await p.evaluate(() => EntregasMapa.atualizar());
  assert.match(await p.$eval('#ve-mapa-status', e => e.textContent), /Aguardando ativação/);
  assert.equal(await p.$eval('#ve-total', e => e.textContent), '5');
  await p.click('[data-entregador="ana"]'); // sem API ativa nao gera excecao
  await p.evaluate(() => { installMaps(); return EntregasMapa.atualizar(); });
  assert.equal(await p.$eval('#ve-total-rotas', e => e.textContent), '2');
  assert.equal(await p.$eval('#ve-sem-entregador', e => e.textContent), '4');
  assert.equal(await p.$$eval('.ve-mapa-item',e=>e.length),5);
  assert.match(await p.$eval('[data-entregador=""]',e=>e.textContent),/Todas as entregas/);
  assert.equal(await p.evaluate(()=>markers.find(m=>m.title?.includes('1004')).content.style.background),'rgb(37, 99, 235)');
  const result = await p.evaluate(() => ({ colors: lines.map(l => l.strokeColor), order: routeCalls[0].intermediates.map(p => p.location.lat), ret: routeCalls[0].origin.lat === routeCalls[0].destination.lat, n: markers.length }));
  assert.equal(await p.evaluate(()=>markers.find(m=>m.title?.includes('1001')).content.textContent),'#1001');
  assert.equal(await p.evaluate(()=>markers.find(m=>m.title?.includes('1003')).content.textContent),'#1003');
  assert.notEqual(result.colors[0], result.colors[1]); assert.deepEqual(result.order, [-30.02, -30.01]); assert.equal(result.ret, true); assert.equal(result.n, 5);
  assert.match(await p.$eval('#ve-mapa-erros', e => e.textContent), /1005/);
  await p.click('[data-entregador="ana"]');
  assert.deepEqual(await p.evaluate(() => lines.map(l => !!l.map)), [false, true]);
  await p.evaluate(() => markers.find(m => m.title?.includes('1001')).click());
  assert.equal(await p.evaluate(() => popup.querySelectorAll('img').length), 0);
  await p.evaluate(() => EntregasMapa.atualizar()); assert.equal(await p.evaluate(() => routeCalls.length), 2, 'cache evita recalculo pago sem mudanca');
  // Integra o popup ao seletor real, com sucesso, conflito e permissao somente leitura.
  const gestao = fs.readFileSync(path.join(root,'frontend/script.js'),'utf8');
  await p.addScriptTag({content:gestao.slice(gestao.indexOf('// INICIO GESTAO ENTREGAS'))});
  await p.evaluate(()=>{
    rows.forEach(r=>{r.empresa='A';r.status_erp='EXPEDICAO';});window.failAssign=true;window.canEdit=true;
    const previous=vibeClient.rpc;
    vibeClient.rpc=async(n,a)=>{
      if(n==='ve_admin_contexto')return {data:{editar:canEdit,entregadores:[{usuario:'paulo',nome:'Paulo',ativo:true,empresas:['A']},{usuario:'ana',nome:'Ana',ativo:true,empresas:['A']}]}};
      if(n==='ve_admin_atribuir_rota'){
        if(failAssign)return {error:{message:'Conflito simulado'}};
        const row=rows.find(r=>r.chave===a.p_proposta);row.entregador_id=a.p_usuario;row.entregador='Ana';row.rota_id='r2';return {data:{confirmado:true,usuario:a.p_usuario,id:'r2'}};
      }
      return previous(n,a);
    };
    window.EntregasPainel={recarregar:()=>EntregasMapa.atualizar()};
  });
  await p.evaluate(()=>markers.filter(m=>m.map&&m.title?.includes('1001')).at(-1).click());
  assert.equal(await p.evaluate(()=>popup.querySelector('select').value),'paulo');
  await p.evaluate(async()=>{document.body.append(popup);const select=popup.querySelector('select');select.value='ana';await select.onchange();});
  assert.match(await p.evaluate(()=>popup.querySelector('[role=status]').textContent),/Conflito simulado/);
  assert.equal(await p.evaluate(()=>popup.querySelector('select').value),'paulo');
  await p.evaluate(async()=>{failAssign=false;const select=popup.querySelector('select');select.value='ana';await select.onchange();});
  assert.equal(await p.evaluate(()=>rows[0].entregador_id),'ana');
  assert.match(await p.$eval('#ve-mensagem',e=>e.textContent),/atribuído/);
  await p.evaluate(()=>{canEdit=false;return markers.filter(m=>m.map&&m.title?.includes('1001')).at(-1).click();});
  assert.equal(await p.evaluate(()=>popup.querySelector('select').disabled),true);
  await p.evaluate(()=>{canEdit=true;rows[0].status_erp='EM TRANSITO';return markers.filter(m=>m.map&&m.title?.includes('1001')).at(-1).click();});
  assert.equal(await p.evaluate(()=>popup.querySelector('select').disabled),false);
  assert.deepEqual(await p.evaluate(()=>[...popup.querySelector('select').options].filter(o=>!o.disabled).map(o=>o.value)),['__retirar__']);
  await p.evaluate(()=>{rows[3].status_erp='EM PRODUCAO';return EntregasMapa.atualizar();});
  assert.equal(await p.evaluate(()=>markers.filter(m=>m.map&&m.title?.includes('1004')).at(-1).content.style.background),'rgb(100, 116, 139)');
  await p.evaluate(()=>markers.filter(m=>m.map&&m.title?.includes('1004')).at(-1).click());
  assert.equal(await p.evaluate(()=>popup.querySelector('select').disabled),true);
  await p.evaluate(()=>{window.EntregasModalidade={atual:'veppo'};rows=[{chave:'v1',pedido:2001,cliente:'A',modalidade:'veppo',endereco:'Destino Veppo 70',endereco_completo:true,status_erp:'EXPEDICAO',empresa:'A'},{chave:'v2',pedido:2002,cliente:'B',modalidade:'veppo',endereco:'Destino Veppo 70',endereco_completo:true,status_erp:'EXPEDICAO',empresa:'A'}];return EntregasMapa.atualizar();});
  assert.equal(await p.evaluate(()=>markers.filter(m=>m.map&&m.content?.textContent==='Veppo · #2001, #2002').length),1);
  assert.ok(await p.evaluate(()=>calls.some(c=>c.args?.p_modalidade==='todas')));
  await p.evaluate(()=>markers.filter(m=>m.map&&m.content?.textContent==='Veppo · #2001, #2002').at(-1).click());
  assert.equal(await p.evaluate(()=>popup.querySelectorAll('select').length),2);
  assert.match(await p.evaluate(()=>popup.textContent),/2001[\s\S]*2002/);
  // Complementos nao impedem localizar o predio; respostas imprecisas continuam bloqueadas.
  await p.evaluate(()=>{
    window.EntregasModalidade.atual='motoboy';window.geocodeCalls=[];
    window.geocodeOverride=address=>{
      geocodeCalls.push(address);
      if(address.includes('TERREO'))return {results:[{partial_match:true}]};
      if(address.includes('CONJ'))throw Object.assign(new Error('Sem resultado'),{code:'ZERO_RESULTS'});
      if(address.includes('Rua Incerta'))return {results:[{geometry:{location_type:'APPROXIMATE'}}]};
    };
    rows=[
      {chave:'t1',pedido:3001,endereco:'Rua Exemplo, 123, TERREO, Centro, Cidade Teste, RS, 90000-000',endereco_completo:true,status_erp:'EXPEDICAO'},
      {chave:'t2',pedido:3002,endereco:'Avenida Exemplo, 456, CONJ 101 102, Centro, Cidade Teste, RS, 90000-000',endereco_completo:true,status_erp:'EM PRODUCAO'},
      {chave:'t3',pedido:3003,endereco:'Rua Incerta, 789, SALA 1, Centro, Cidade Teste, RS, 90000-000',endereco_completo:true,status_erp:'EXPEDICAO'}
    ];
    return EntregasMapa.atualizar();
  });
  assert.equal(await p.evaluate(()=>markers.filter(m=>m.map&&/^#300[12]$/.test(m.content?.textContent)).length),2);
  assert.ok(await p.evaluate(()=>geocodeCalls.includes('Rua Exemplo, 123, Centro, Cidade Teste, RS, 90000-000')));
  assert.ok(await p.evaluate(()=>geocodeCalls.includes('Avenida Exemplo, 456, Centro, Cidade Teste, RS, 90000-000')));
  assert.match(await p.$eval('#ve-mapa-erros',e=>e.textContent),/3003/);
  assert.doesNotMatch(await p.$eval('#ve-mapa-erros',e=>e.textContent),/3001|3002/);
  assert.match(await p.evaluate(()=>rows[0].endereco),/TERREO/);
  await p.evaluate(()=>EntregasMapa.atualizar());
  assert.equal(await p.evaluate(()=>geocodeCalls.filter(a=>a==='Rua Exemplo, 123, Centro, Cidade Teste, RS, 90000-000').length),1);
  // Todas as paginas, sem limite silencioso de 50 pedidos e sem geocodificar endereco ausente.
  await p.evaluate(() => { rows = Array.from({ length: 202 }, (_, i) => ({ chave: String(i).padStart(4, '0'), pedido: i, endereco_completo: false })); return EntregasMapa.atualizar(); });
  assert.equal(await p.$eval('#ve-total', e => e.textContent), '202');
  assert.ok(await p.evaluate(() => calls.some(c => c.args?.p_apos === '0199')));
  await p.evaluate(() => { pending = true; window.running = EntregasMapa.atualizar(); });
  await p.waitForFunction(() => typeof resolvePending === 'function');
  await p.evaluate(async () => { role = 'visualizador'; EntregasMapa.limpar(); resolvePending(); await running; });
  assert.equal(await p.$eval('#ve-mapa-legenda', e => e.children.length), 0);
  assert.equal(await p.$eval('#ve-total', e => e.textContent), '—');
  assert.deepEqual(errors, []);
  console.log('PASS: mapa sem chave, rotas reais via adapter, cores, sequencia, retorno, endereco incompleto, 202 pedidos, cache, XSS e revogacao durante consulta.');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
