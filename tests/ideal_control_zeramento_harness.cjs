// Reproduction using original browser scripts, real IndexedDB and original Edge functions.
// Only PostgREST storage is simulated. Every browser request is intercepted.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const readline = require('node:readline');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'tmp_ideal_control_zeramento');
const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer'));
const DENO = path.join(ROOT, 'node_modules', 'deno', 'deno.exe');
let serial = 0;
const jobs = new Map();
let deno, browser;
const requests = [];
const errors = [];

function rpc(payload) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    jobs.set(id, { resolve, reject });
    deno.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
  });
}

async function openCase(withOld) {
  const fixture = await rpc({ op: 'fixture', withOld });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }));
  page.on('pageerror', error => errors.push(String(error)));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const url = new URL(request.url());
      if (url.protocol === 'data:') return await request.continue();
      if (url.origin === 'http://localhost') {
        if (url.pathname === '/seed.html') return await request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic fixture</title>' });
        const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
        const file = path.resolve(ROOT, 'frontend', relative);
        if (!file.startsWith(path.join(ROOT, 'frontend') + path.sep)) throw new Error('Path outside frontend');
        if (relative === 'sw-registro.js' || relative === 'sw.js') return await request.respond({ status: 200, contentType: 'application/javascript', body: '// Service worker excluded from this storage test.' });
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return await request.respond({ status: 404, body: '' });
        const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
        return await request.respond({ status: 200, contentType, body: fs.readFileSync(file) });
      }
      if (url.pathname.startsWith('/functions/v1/portaria/')) {
        requests.push({ method: request.method(), path: url.pathname + url.search });
        const response = await rpc({ op: 'request', url: request.url(), method: request.method(), headers: request.headers(), body: request.postData() });
        return await request.respond(response);
      }
      errors.push('Unexpected request blocked: ' + request.url());
      return await request.abort('connectionrefused');
    } catch (error) {
      errors.push(String(error));
      await request.abort('failed').catch(() => {});
    }
  });
  await page.goto('http://localhost/seed.html');
  await page.addScriptTag({ path: path.join(ROOT, 'frontend', 'portaria-deposito.js') });
  await page.evaluate(async ({ fixture, withOld }) => {
    const d = window.portariaDeposito;
    localStorage.setItem('ideal_portaria_token', fixture.token);
    localStorage.setItem('ideal_portaria_evento', fixture.carga.evento.id);
    await d.gravarCarga(fixture.carga);
    if (withOld) {
      await d.enfileirar(fixture.reading);
      await d.removerDaFila([fixture.reading.id_local]);
      await d.gravarTotais({ [fixture.reading.setor_id]: 1 });
    }
  }, { fixture, withOld });
  await page.goto('http://localhost/portaria.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.portaria?.estado.carga && document.querySelector('#contador-numeros').textContent.includes('/'));
  return { page, context, fixture };
}

async function snapshot(page) {
  return await page.evaluate(async () => ({
    carga: await window.portariaDeposito.lerCarga(),
    entradas: await window.portariaDeposito.entradasPermitidas(),
    fila: await window.portariaDeposito.lerFila(100),
    totais: await window.portariaDeposito.lerTotais(),
    contador: document.querySelector('#contador-numeros').textContent,
    resposta: document.querySelector('#resposta-titulo').textContent,
    detalhe: document.querySelector('#resposta-detalhe').textContent,
    respostaVisivel: !document.querySelector('#tela-resposta').classList.contains('sumindo'),
  }));
}

async function news(page) {
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await window.portaria.puxarNovidades();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  });
}

async function main() {
  assert(fs.existsSync(DENO), 'Deno executable must already exist');
  fs.mkdirSync(OUTPUT, { recursive: true });
  deno = cp.spawn(DENO, ['run', '--no-config', '--no-lock', '--no-npm', '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY', path.join(__dirname, 'ideal_control_zeramento_fixture.ts')], { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  readline.createInterface({ input: deno.stdout }).on('line', line => {
    const message = JSON.parse(line); const job = jobs.get(message.id); jobs.delete(message.id);
    if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);
  });
  deno.stderr.on('data', data => process.stderr.write(data));
  deno.on('exit', code => { for (const job of jobs.values()) job.reject(new Error('Deno exited: ' + code)); });
  browser = await puppeteer.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), browser: await browser.version(),
    scope: 'Original local sources; real Chromium IndexedDB; original Edge handlers in Deno without network permission; in-memory PostgREST fixture.',
    head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    originMain: cp.execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim() };

  // A: Already synchronized entry, no old pending queue.
  const a = await openCase(true);
  await a.page.evaluate(() => window.portaria.validarTexto('000001'));
  const before = await snapshot(a.page);
  assert.equal(before.fila.at(-1).motivo, 'ja_entrou', 'Control: used ticket must be refused before reset');
  // Remove only this diagnostic denial; the original entry was already synchronized.
  await a.page.evaluate(async () => {
    const d = window.portariaDeposito; await d.removerDaFila((await d.lerFila(100)).map(row => row.id_local));
  });
  const resetA = await rpc({ op: 'reset' });
  assert(resetA.ok && resetA.zerado_em);
  await news(a.page);
  const afterSync = await snapshot(a.page);
  assert.equal(afterSync.carga.entradas_zeradas_em, resetA.zerado_em, 'Reset must really reach the browser');
  assert.deepEqual(afterSync.carga.entradas, {}, 'Pure synchronism cleared the carga map');
  assert.equal(afterSync.fila.length, 0, 'No old queue may explain case A');
  assert.equal(afterSync.totais[a.fixture.reading.setor_id], 0, 'Counter actually resets');
  assert.equal(afterSync.entradas[a.fixture.reading.credencial_id], undefined, 'Reset must clear the separate IndexedDB entry');
  await a.page.reload({ waitUntil: 'load' });
  await a.page.waitForFunction(() => !!window.portaria?.estado.carga);
  await a.page.click('#btn-toque');
  // Use the real manual-input button, the same handler that calls validarTexto.
  await a.page.evaluate(() => {
    document.querySelector('#btn-digitar').click();
    document.querySelector('#campo-numero').value = '000001';
    document.querySelector('#btn-conferir').click();
  });
  await a.page.waitForFunction(async () => (await window.portariaDeposito.contarFila()) === 1);
  await a.page.waitForFunction(() => !document.querySelector('#faixa-ultima').classList.contains('vazia'));
  const afterRead = await snapshot(a.page);
  assert.equal(afterRead.fila.at(-1).resultado, 'permitido');
  assert.equal(afterRead.fila.at(-1).motivo, null);
  assert.equal(afterRead.respostaVisivel, false);
  await a.page.screenshot({ path: path.join(OUTPUT, 'apos-zerar-permitido.png'), fullPage: true });
  await a.page.evaluate(() => window.portaria.validarTexto('000002'));
  const freshControl = await snapshot(a.page);
  assert.equal(freshControl.fila.at(-1).resultado, 'permitido', 'Control: unused ticket must still be accepted');
  report.caseA = { before, reset: resetA, afterSync, afterReloadAndRead: afterRead,
    unusedTicketControl: freshControl.fila.at(-1), server: await rpc({ op: 'snapshot' }) };
  await a.context.close();

  // B: A genuine offline read queued before reset and uploaded after receiving the reset marker.
  const b = await openCase(false);
  await b.page.evaluate(() => window.portaria.validarTexto('000001'));
  const offline = await snapshot(b.page);
  assert.equal(offline.fila.length, 1);
  assert.equal(offline.fila[0].resultado, 'permitido');
  const resetB = await rpc({ op: 'reset' });
  assert(Date.parse(offline.fila[0].momento) < Date.parse(resetB.zerado_em), 'Queued reading must precede reset');
  await news(b.page);
  const syncedReset = await snapshot(b.page);
  assert.equal(syncedReset.carga.entradas_zeradas_em, resetB.zerado_em);
  assert.equal(syncedReset.fila.length, 1);
  assert.equal(syncedReset.totais[b.fixture.reading.setor_id], 0);
  await b.page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await window.portaria.sincronizar();
    await window.portaria.puxarNovidades();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  });
  const afterUpload = await snapshot(b.page);
  const serverB = await rpc({ op: 'snapshot' });
  assert.equal(afterUpload.fila.length, 0);
  assert.equal(afterUpload.totais[b.fixture.reading.setor_id], 0);
  assert.equal(serverB.tables.producao_acesso_leituras.length, 0);
  // A delayed online /entrada uses the same trigger protection. It must not
  // report "ja_entrou" when the old reservation was intentionally discarded.
  const oldOnline = await rpc({ op: 'request', url: 'http://localhost/functions/v1/portaria/entrada',
    method: 'POST', headers: { authorization: 'Bearer ' + b.fixture.token, 'content-type': 'application/json' },
    body: JSON.stringify(offline.fila[0]) });
  assert.equal(oldOnline.status, 200);
  assert.equal(JSON.parse(oldOnline.body).zerada, true);
  assert.equal(JSON.parse(oldOnline.body).primeira, true);
  // Readings after reset are accepted, and retries remain idempotent.
  const newReading = { ...offline.fila[0], id_local: 'leitura-nova-pos-zeramento', momento: new Date(Date.now() + 1000).toISOString() };
  const uploadNew = () => rpc({ op: 'request', url: 'http://localhost/functions/v1/portaria/leituras',
    method: 'POST', headers: { authorization: 'Bearer ' + b.fixture.token, 'content-type': 'application/json' },
    body: JSON.stringify({ leituras: [newReading] }) });
  assert.equal((await uploadNew()).status, 200);
  assert.equal((await uploadNew()).status, 200);
  await news(b.page);
  const current = await snapshot(b.page);
  assert.equal(current.totais[b.fixture.reading.setor_id], 1);
  assert.equal((await rpc({ op: 'snapshot' })).tables.producao_acesso_leituras.length, 1);
  report.caseB = { offline, reset: resetB, afterResetReceived: syncedReset, afterUpload, server: serverB };
  await b.context.close();
  report.requestsIntercepted = requests;
  report.unexpectedErrors = errors;
  assert.deepEqual(errors, []);
  const sources = ['frontend/portaria.js', 'frontend/portaria-deposito.js', 'frontend/portaria-sincronismo.js', 'frontend/portaria-validacao.js', 'supabase/functions/portaria/index.ts', 'supabase/functions/_compartilhado/configuracao.ts'];
  report.sources = sources.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }));
  report.conclusions = { caseA: 'PASS: used ticket is accepted after reset and page reload.', caseB: 'PASS_WITH_SIMULATED_DATABASE: old queued reading does not restore the count; new readings and retries remain valid.', sqlLimit: 'Database trigger behavior is simulated here; this test does not execute the SQL migration.' };
  fs.writeFileSync(path.join(OUTPUT, 'prova.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: path.join(OUTPUT, 'prova.json'), browser: report.browser, conclusions: report.conclusions, requests: requests.length, unexpectedErrors: errors.length }, null, 2));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (deno) deno.stdin.end();
});
