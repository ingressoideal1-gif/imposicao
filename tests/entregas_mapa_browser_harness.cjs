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
   window.role = 'admin'; window.papelAtual = () => role; window._currentPerms = { perm_admin_view: true };
   window.ENTREGAS_MAPA_CONFIG = { apiKey: '' };
   window.calls = []; window.routeCalls = []; window.lines = []; window.markers = []; window.pending = false;
   window.rows = [
    { chave: '01', pedido: 1001, cliente: '<img src=x onerror=alert(1)>', endereco: 'Rua Teste, 10', endereco_completo: true, entregador_id: 'paulo', entregador: 'Paulo', rota_id: 'r1', ordem: 2, retorno: true },
    { chave: '02', pedido: 1002, cliente: 'Cliente 2', endereco: 'Rua Teste, 20', endereco_completo: true, entregador_id: 'paulo', entregador: 'Paulo', rota_id: 'r1', ordem: 1, retorno: true },
    { chave: '03', pedido: 1003, cliente: 'Cliente 3', endereco: 'Rua Teste, 30', endereco_completo: true, entregador_id: 'ana', entregador: 'Ana', rota_id: 'r2', ordem: 1, retorno: false },
    { chave: '04', pedido: 1004, cliente: 'Disponível', endereco: 'Rua Teste, 40', endereco_completo: true },
    { chave: '05', pedido: 1005, cliente: 'Sem endereço', endereco: '', endereco_completo: false }
   ];
   window.vibeClient = { rpc: async (name, args) => { calls.push({ name, args }); if(name==='ve_admin_mapa_config') return {data:{}}; if (pending) await new Promise(r => window.resolvePending = r); return { data: args.p_apos ? rows.filter(r => r.chave > args.p_apos).slice(0, 201) : rows.slice(0, 201) }; } };
   window.installMaps = () => {
    class Bounds { constructor() { this.points = []; } extend(p) { this.points.push(p); } isEmpty() { return !this.points.length; } }
    class MapMock { constructor(el) { this.el = el; el.textContent = 'Google Maps simulado para teste · sem chamadas externas'; } fitBounds(b) { this.bounds = b; } }
    class Marker { constructor(o) { Object.assign(this, o); markers.push(this); } addListener(_, cb) { this.click = cb; } }
    class Polyline { constructor(o) { Object.assign(this, o); lines.push(this); } setMap(m) { this.map = m; } }
    class Geocoder { async geocode({ address }) { const n = Number(address.match(/, (\d+)/)?.[1] || 1); return { results: [{ geometry: { location_type: 'ROOFTOP', location: { toJSON: () => ({ lat: -30 - n / 1000, lng: -51.2 }) } } }] }; } }
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
  assert.equal(await p.$eval('#ve-sem-entregador', e => e.textContent), '2');
  const result = await p.evaluate(() => ({ colors: lines.map(l => l.strokeColor), order: routeCalls[0].intermediates.map(p => p.location.lat), ret: routeCalls[0].origin.lat === routeCalls[0].destination.lat, n: markers.length }));
  assert.notEqual(result.colors[0], result.colors[1]); assert.deepEqual(result.order, [-30.02, -30.01]); assert.equal(result.ret, true); assert.equal(result.n, 5);
  assert.match(await p.$eval('#ve-mapa-erros', e => e.textContent), /1005/);
  await p.click('[data-entregador="ana"]');
  assert.deepEqual(await p.evaluate(() => lines.map(l => !!l.map)), [false, true]);
  await p.evaluate(() => markers.find(m => m.title?.includes('1001')).click());
  assert.equal(await p.evaluate(() => popup.querySelectorAll('img').length), 0);
  await p.evaluate(() => EntregasMapa.atualizar()); assert.equal(await p.evaluate(() => routeCalls.length), 2, 'cache evita recalculo pago sem mudanca');
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
