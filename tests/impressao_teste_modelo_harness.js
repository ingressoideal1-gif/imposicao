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
        if (url.endsWith('/api/hotfolder/drop')) {
          calls.push({url, folder:init.body.get('folder'), file:await init.body.get('file').text()});
          return {ok:!window.fail, json:async()=>window.fail ? {detail:'Pasta indisponivel'} : {path:'C:/pasta-salva/teste.pdf'}};
        }
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
    assert.equal(await page.$eval('#ped-teste-saida', e=>e.disabled), true);
    await page.evaluate(() => {window._hotFolderAtivo=()=>false; _aplicarEstadoHotFolder();});
    assert.equal(await page.$$eval('#ped-teste-saida', es => es.length), 1);
    assert.equal(await page.$eval('#ped-teste-saida', e => e.value), 'gdi_atual', 'GDI atual selecionado ao abrir');
    assert.equal(await page.$eval('#jg-refazer', e => e.nextElementSibling?.id), 'ped-teste-config');
    assert.equal(await page.$eval('#ped-teste-config', e => e.parentElement.lastElementChild === e), true, 'forma de envio no fim da coluna');
    assert.equal(await page.$$eval('#ped-teste-saida option[value]:not([value=""])', es => es.length), 3);
    await page.addScriptTag({content: extract('getPedPrintOptions')});
    const config = {printerName: 'Sintetica', options: {copies: 3, paper_size: 8, tray: 7, tray_capa: 2, tray_miolo: 4, duplex: 2, color: 1, orientation: 2}};
    for (const modo of ['gdi_atual', 'experimental_gdi']) {
      await page.select('#ped-teste-saida', modo);
      const fluxo = await page.evaluate(async cfg => {
        calls.length = 0;
        document.getElementById('ped-entregar-por-bloco').checked = true;
        cfg.options.entregar_por_bloco = getPedPrintOptions().options.entregar_por_bloco;
        const testeModelo = await NewProdTesteModelo.capturar(cfg);
        const entrega = criarEntregaDeImpressao({testeModelo});
        await entrega.entregar([{name:'modelo_capa.pdf',blob:new Blob(['capa'])}]);
        const primeiro = calls.length;
        await entrega.entregar([{name:'modelo_miolo.pdf',blob:new Blob(['miolo'])}]);
        const segundo = calls.length;
        await entrega.finalizar();
        return {primeiro,segundo,calls};
      }, config);
      assert.equal(fluxo.primeiro, 1, 'primeiro bloco enviado antes do segundo ser gerado');
      assert.equal(fluxo.segundo, 2);
      assert.deepEqual(fluxo.calls.map(c=>c.options.tray), [2,4]);
      assert(fluxo.calls.every(c=>c.url.endsWith('/experimental/submit')));
    }
    await page.addScriptTag({path: path.join(root, 'frontend/pdf-lib.min.js')});
    await page.addScriptTag({content: extract('processPrintQueueOptions')});
    for (const modo of ['gdi_atual', 'experimental_gdi', 'pdf_raw']) {
      await page.select('#ped-teste-saida', modo);
      for (const duplex of [1,2,3]) {
        const folhas = await page.evaluate(async ({cfg,duplex}) => {
          calls.length=0;
          const doc=await PDFLib.PDFDocument.create();
          for (let n=0;n<3;n++) doc.addPage([100+n,200]);
          const itens=[{name:'modelo_capa.pdf',blob:new Blob([await doc.save()])}];
          cfg.options={...cfg.options,folha_a_folha:true,duplex,impressao_reversa:true};
          const testeModelo=await NewProdTesteModelo.capturar(cfg);
          const separados=await NewProdTesteModelo.prepararFolhasGdi(itens,testeModelo.options);
          const paginas=[];
          for (const f of separados) paginas.push((await PDFLib.PDFDocument.load(await f.blob.arrayBuffer())).getPages().map(p=>p.getWidth()));
          const entrega=criarEntregaDeImpressao({testeModelo});
          await entrega.entregar(itens);
          const antes=calls.length;
          await entrega.finalizar();
          return {paginas,antes,depois:calls.length,bandejas:calls.map(c=>c.options.tray)};
        }, {cfg:config,duplex});
        assert.deepEqual(folhas.paginas,duplex===1 ? [[102],[101],[100]] : [[102],[100,101]]);
        assert.equal(folhas.antes,duplex===1 ? 3 : 2,'folhas enviadas antes de finalizar');
        assert.equal(folhas.depois,folhas.antes);
        assert(folhas.bandejas.every(b=>modo==='pdf_raw' ? b==null : b===2));
      }
    }
    await page.select('#ped-teste-saida', '');
    const empty = await page.evaluate(async cfg => {try {await NewProdTesteModelo.capturar(cfg); return false;} catch {return true;}}, config);
    assert(empty, 'sem modo nao gera nem envia');
    for (const mode of ['gdi_atual','experimental_gdi','pdf_raw']) {
      await page.select('#ped-teste-saida', mode);
      assert.equal(await page.$eval('#ped-print-printer', e=>e.disabled), false, 'teste libera impressora apesar da pasta salva');
      assert.equal(await page.$eval('#jg-config-corpo', e=>e.style.display), 'block');
      const result = await page.evaluate(async cfg => {
        calls.length = 0;
        const testeModelo = await NewProdTesteModelo.capturar(cfg);
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
    // Pasta selecionada vence inclusive um modo de driver escolhido anteriormente.
    for (const mode of ['', 'gdi_atual', 'experimental_gdi', 'pdf_raw']) {
      await page.select('#ped-teste-saida', mode);
      const hot = await page.evaluate(async cfg => {
        calls.length=0; window.fail=false; window.destinoFail=true;
        window._hotFolderAtivo=()=>true; _aplicarEstadoHotFolder();
        cfg.printerName='';
        cfg.options.hot_folder_path='C:/pasta-salva';
        cfg.options.trabalho_unico=true;
        const testeModelo=await NewProdTesteModelo.capturar(cfg);
        cfg.options.hot_folder_path='C:/outra-pasta';
        const ok=await sendPrintJobDirect([{name:'hot.pdf',blob:new Blob(['HOT'])}],{testeModelo});
        window.destinoFail=false;
        return {ok,calls,disabled:document.getElementById('ped-print-printer').disabled};
      }, config);
      assert.equal(hot.ok,true);
      assert.equal(hot.disabled,true);
      assert.deepEqual(hot.calls.map(c=>[c.url,c.folder]),[['/api/hotfolder/drop','C:/pasta-salva']]);
      await page.evaluate(() => {window._hotFolderAtivo=()=>false; _aplicarEstadoHotFolder();});
      assert.equal(await page.$eval('#ped-teste-saida', e=>e.disabled), false);
    }
    const hotFail = await page.evaluate(async cfg => {
      calls.length=0; window.fail=true;
      cfg.options.hot_folder_path='C:/pasta-salva';
      const testeModelo=await NewProdTesteModelo.capturar(cfg);
      try {await sendPrintJobDirect([{name:'a.pdf',blob:new Blob(['A'])},{name:'b.pdf',blob:new Blob(['B'])}],{testeModelo});} catch {}
      window.fail=false;
      return calls;
    }, config);
    assert.deepEqual(hotFail.map(c=>c.url),['/api/hotfolder/drop'],'falha na pasta interrompe sem usar impressora');
    assert.equal((pedido.match(/if \(ok && !testeModelo && alvoImpressao.length\)/g)||[]).length,4,'todos os caminhos de conclusao excluem status comercial no teste');
    assert(pedido.includes('const opcoesDeFace = { testeModelo,'));
    for(const file of ['index.html']) assert(fs.readFileSync(path.join(root,'frontend',file),'utf8').includes('/impressao-teste-modelo.js?v=6-oficial'));
    assert.equal(await page.$eval('#ped-teste-config label', e=>e.textContent), 'Forma de envio');
    // A entrega normal continua usando o endpoint e opcoes anteriores quando nao ha teste.
    const normal = await page.evaluate(async cfg => {
      calls.length=0; window.fail=false; window._hotFolderAtivo=()=>false; window.getPedPrintOptions=()=>structuredClone(cfg);
      await sendPrintJobDirect([{name:'normal.pdf',blob:new Blob(['NORMAL'])}]);
      return calls;
    }, config);
    assert.equal(normal[0].url, 'http://127.0.0.1:9001/api/print/submit');
    assert.equal(normal[0].options.experimental, undefined);
    await page.addScriptTag({content: [extract('savePrintConfigForProduct'), extract('loadPrintConfigForProduct'), extract('_applyPrintConfig')].join('\n')});
    const persistence = await page.evaluate(async () => {
      window._printConfigCache={}; localStorage.clear();
      window._getActiveProductInfo=()=>({prodId:'produto-a',prodNome:'Produto sintetico'});
      window._hotFolderAtivo=()=>true;
      window._hotFolderPath=()=> 'C:/pasta-sintetica';
      window._hotFolderStatus=()=>{};
      window.salvarCorImpressora=async()=>{};
      window.onPedPrinterChange=async()=>{};
      const store={};
      window.fetch=async (url, init) => {
        if (init?.method==='POST') {
          const config=JSON.parse(init.body);
          store[config.produto_id]=structuredClone(config);
          return {ok:true,json:async()=>({ok:true})};
        }
        const id=decodeURIComponent(url.split('/').pop());
        return {ok:true,json:async()=>({ok:true,config:store[id]||null})};
      };
      const sel=document.getElementById('ped-teste-saida');
      const results=[];
      for (const mode of ['gdi_atual','experimental_gdi','pdf_raw']) {
        sel.value=mode;
        await savePrintConfigForProduct();
        const cached=JSON.parse(localStorage.getItem('printConfig_produto-a')).forma_envio;
        window._printConfigCache={}; localStorage.clear(); sel.value='gdi_atual';
        await loadPrintConfigForProduct('produto-a');
        results.push([mode,store['produto-a'].forma_envio,cached,sel.value]);
      }
      await loadPrintConfigForProduct('produto-sem-config');
      const novo=sel.value;
      await _applyPrintConfig({produto_id:'antigo'});
      const antigo=sel.value;
      await _applyPrintConfig({forma_envio:'modo-inexistente'});
      const invalido=sel.value;
      window._printConfigCache={}; localStorage.clear();
      window.fetch=async()=>{throw new Error('offline simulado');};
      localStorage.setItem('printConfig_offline',JSON.stringify({forma_envio:'experimental_gdi'}));
      await loadPrintConfigForProduct('offline');
      const offline=sel.value;
      await loadPrintConfigForProduct('outra-estacao-sem-config');
      return {results,novo,antigo,invalido,offline,semConfig:sel.value};
    });
    assert.deepEqual(persistence.results,['gdi_atual','experimental_gdi','pdf_raw'].map(mode=>[mode,mode,mode,mode]));
    for (const key of ['novo','antigo','invalido','semConfig']) assert.equal(persistence[key],'gdi_atual',key);
    assert.equal(persistence.offline,'experimental_gdi');
    await page.addStyleTag({path:path.join(root,'frontend/style.css')});
    const layout = await page.evaluate(() => {
      const box=document.getElementById('ped-teste-config');
      for(let el=box.parentElement;el;el=el.parentElement) {
        if(getComputedStyle(el).display==='none') el.style.display='block';
        el.style.visibility='visible';
      }
      const refazer=document.getElementById('jg-refazer');
      return {visivel:box.checkVisibility(),coluna:!!box.closest('.ped-janela-direita'),abaixo:box.getBoundingClientRect().top>=refazer.getBoundingClientRect().bottom};
    });
    assert.deepEqual(layout,{visivel:true,coluna:true,abaixo:true});
    console.log('OK: posicao final, GDI padrao, salvar/reabrir os 3 modos por produto, configuracao antiga e fallback offline.');
    console.log('OK: Hot Folder prioritario nos 4 estados do seletor, snapshot e falha sem impressora; 3 modos de driver, capas/miolo e bloqueio comercial preservados.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
