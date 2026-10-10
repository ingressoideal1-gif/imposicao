const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(root, 'frontend/pedido.js'), 'utf8');
function extract(name) {
  const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
  const browser = await puppeteer.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.respond({status: 200, contentType: 'text/html', body: '<html></html>'}));
    await page.goto('http://127.0.0.1:9001/app/index.html');
    const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.setContent(html);
    await page.addScriptTag({path: path.join(root, 'frontend/impressao-teste-modelo.js')});
    await page.evaluate(() => {
      window.calls = []; window.fail = false; window.messages = [];
      window.fetch = async (url, init) => {
        if (url.endsWith('/capabilities')) return {ok: true, json: async () => ({schema: 2, perfil_destino: 1, lote_gdi: 1, modos: ['gdi_atual','experimental_gdi','pdf_raw'], max_pages: null, max_bytes: null})};
        if (url.endsWith('/destino')) {
          window.preflight = JSON.parse(init.body);
          return {ok: !window.destinoFail, json: async () => window.destinoFail ? {detail:'Bandeja indisponível'} :
            {schema:1, impressora:preflight.printer_name, estacao:'PC-TESTE', assinatura:'a'.repeat(64)}};
        }
        const arquivos = init.body.has('files') ? init.body.getAll('files') : [init.body.get('file')];
        calls.push({url, options: JSON.parse(init.body.get('options')), file: (await Promise.all(arquivos.map(f=>f.text()))).join('|')});
        return {ok: !window.fail, text: async () => 'Falha simulada', json: async()=>({spool_id:42, detail:'Falha simulada'})};
      };
      window.AGENTE_LOCAL_URL = location.origin;
      window.getNormal = 0;
      window.toast = m => messages.push(m);
      window.hashArquivoImpressao = async () => 'hash-sintetico';
      window.contextoHistoricoArquivo = (ctx, name) => ({...ctx, arquivo: name});
      window.nomeParaSpool = (n, name) => name;
      window._conferirConsumoHotFolder = () => {};
      window._hotFolderPath = () => '';
      window._hotFolderAtivo = () => false;
      window.processPrintQueueOptions = async queue => queue;
      window.confirm = () => true;
      window.NewProdTesteModelo.montar(document.getElementById('ped-print-driver-panel'));
      window.NewProdTesteModelo.montar(document.getElementById('ped-print-driver-panel'));
    });
    await page.addScriptTag({content: extract('criarEntregaDeImpressao') + '\n' + extract('sendPrintJobDirect')});
    await page.addScriptTag({content: extract('_aplicarEstadoHotFolder')});
    await page.evaluate(() => {
      window._hotFolderAtivo=()=>true; window._hotFolderPath=()=> 'C:/pasta-salva'; window._nomeDaPasta=p=>p;
      _aplicarEstadoHotFolder();
    });
    assert.equal(await page.$eval('#ped-print-printer', e=>e.disabled), true);
    assert.equal(await page.$$eval('#ped-teste-saida', es => es.length), 1);
    assert.equal(await page.$$eval('#ped-teste-saida option[value]:not([value=""])', es => es.length), 3);
    const config = {printerName: 'Sintetica', options: {copies: 3, paper_size: 8, tray: 7, tray_capa: 2, tray_miolo: 4, duplex: 2, color: 1, orientation: 2}};
    const empty = await page.evaluate(async cfg => {try {await NewProdTesteModelo.capturar(cfg); return false;} catch {return true;}}, config);
    assert(empty, 'sem modo nao gera nem envia');
    for (const mode of ['gdi_atual','experimental_gdi','pdf_raw']) {
      await page.select('#ped-teste-saida', mode);
      assert.equal(await page.$eval('#ped-print-printer', e=>e.disabled), false, 'teste libera impressora apesar da pasta salva');
      assert.equal(await page.$eval('#jg-config-corpo', e=>e.style.display), 'block');
      const result = await page.evaluate(async cfg => {
        calls.length = 0;
        cfg.options.hot_folder_path = 'C:/pasta-salva';
        const testeModelo = await NewProdTesteModelo.capturar(cfg);
        if ('hot_folder_path' in testeModelo.options || cfg.options.hot_folder_path !== 'C:/pasta-salva') throw new Error('Pasta nao isolada do teste');
        cfg.options.copies = 9; // estado posterior nao muda o trabalho capturado
        const ok = await sendPrintJobDirect([
          {name:'1001_capa.pdf',blob:new Blob(['PDF capa gerado pelo modelo'])},
          {name:'1001_miolo.pdf',blob:new Blob(['PDF miolo gerado pelo modelo'])}
        ], {testeModelo, historicoContexto:{pedido:'123',modelo:'1001'}});
        return {ok,calls};
      }, config);
      assert(result.ok);
      assert.equal(result.calls.length, mode === 'pdf_raw' ? 2 : 1);
      result.calls.forEach((c, i) => {
        assert(c.url.endsWith('/api/print/experimental/' + (mode === 'pdf_raw' ? 'submit' : 'submit-lote')));
        assert.equal(c.options.modo, mode);
        assert.equal(c.options.copies, 3);
        assert.equal(c.options.perfil_driver, 'a'.repeat(64));
        assert.equal(c.options.historico_contexto.modelo, '1001');
        assert(c.file.includes(i ? 'miolo' : 'capa'));
        if (mode === 'pdf_raw') assert(!('tray' in c.options));
        else {
          assert.deepEqual(c.options.partes.map(p=>p.tray), [2,4]);
          assert(c.file.includes('capa') && c.file.includes('miolo'));
          assert.equal(c.options.paper_size, 8);
          assert.equal(c.options.duplex, 2);
          assert.equal(c.options.color, 1);
          assert.equal(c.options.orientation, 2);
        }
      });
    }
    await page.select('#ped-teste-saida', 'experimental_gdi');
    const failed = await page.evaluate(async cfg => {
      calls.length=0; window.fail=true;
      const testeModelo=await NewProdTesteModelo.capturar(cfg);
      try {await sendPrintJobDirect([{name:'a.pdf',blob:new Blob(['A'])},{name:'b.pdf',blob:new Blob(['B'])}],{testeModelo});} catch {}
      return calls;
    }, config);
    assert.equal(failed.length,1,'falha para a fila sem fallback ou reenvio');
    assert(failed[0].url.endsWith('/experimental/submit-lote'));
    const cancelou = await page.evaluate(async cfg => {
      window.fail=false; calls.length=0;
      const testeModelo=await NewProdTesteModelo.capturar(cfg);
      const entrega=criarEntregaDeImpressao({testeModelo});
      await entrega.entregar([{name:'a.pdf',blob:new Blob(['A'])}]);
      const antes=calls.length;
      await entrega.finalizar({interrompido:true});
      return {antes,depois:calls.length,imprimindo:window.isPrinting};
    }, config);
    assert.deepEqual(cancelou,{antes:0,depois:0,imprimindo:false});
    const repetido = await page.evaluate(async cfg => {
      calls.length=0;
      const testeModelo=await NewProdTesteModelo.capturar(cfg);
      const entrega=criarEntregaDeImpressao({testeModelo});
      await entrega.entregar([{name:'a.pdf',blob:new Blob(['A'])}]);
      await entrega.entregar([{name:'b.pdf',blob:new Blob(['B'])}]);
      const antes=calls.length;
      const resultados=await Promise.all([entrega.finalizar(),entrega.finalizar()]);
      return {antes,depois:calls.length,resultados};
    }, config);
    assert.deepEqual(repetido,{antes:0,depois:1,resultados:[true,true]});
    const destinoErro = await page.evaluate(async cfg => {
      calls.length=0; window.destinoFail=true;
      try {await NewProdTesteModelo.capturar(cfg); return '';} catch(e) {return e.message;}
      finally {window.destinoFail=false;}
    }, config);
    assert.equal(destinoErro, 'Bandeja indisponível');
    assert.equal(await page.evaluate(()=>calls.length), 0);
    const simplex = await page.evaluate(async cfg => {
      await NewProdTesteModelo.capturar(cfg, {apenasUmaFace:true});
      return preflight.options.duplex;
    }, config);
    assert.equal(simplex, 1, 'face única conferida como simplex antes da geração');
    assert.equal((pedido.match(/if \(ok && !testeModelo && alvoImpressao.length\)/g)||[]).length,4,'todos os caminhos de conclusao excluem status comercial no teste');
    assert(pedido.includes('const opcoesDeFace = { testeModelo,'));
    for(const file of ['index.html']) assert(fs.readFileSync(path.join(root,'frontend',file),'utf8').includes('/impressao-teste-modelo.js?v=1'));
    // A entrega normal continua usando o endpoint e opcoes anteriores quando nao ha teste.
    const normal = await page.evaluate(async cfg => {
      calls.length=0; window.fail=false; window._hotFolderAtivo=()=>false; window.getPedPrintOptions=()=>structuredClone(cfg);
      await sendPrintJobDirect([{name:'normal.pdf',blob:new Blob(['NORMAL'])}]);
      return calls;
    }, config);
    assert.equal(normal[0].url, 'http://127.0.0.1:9001/api/print/submit');
    assert.equal(normal[0].options.experimental, undefined);
    console.log('OK: seletor unico no HTML real, 3 modos, configuracao/capas/miolo preservados, snapshot, falha sem fallback, sem confirmacao comercial.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
