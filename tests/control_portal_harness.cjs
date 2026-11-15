// Navegador real, HTML/CSS reais e RPC simulada. Nenhuma requisição externa.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const results = [];
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({width, height: 900});
      await page.setRequestInterception(true);
      page.on('request', req => req.abort());
      const html = fs.readFileSync(path.join(root, 'frontend/cliente.html'), 'utf8')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
      await page.setContent(html);
      // A fonte externa não participa da funcionalidade; nenhum acesso à rede.
      await page.addStyleTag({content: fs.readFileSync(path.join(root, 'frontend/style.css'), 'utf8').replace(/^@import[^;]+;/gm, '')});
      for (const file of ['qrcode-generator.min.js','qr-canvas.js','jsqr.min.js']) {
        await page.addScriptTag({path: path.join(root, 'frontend', file)});
      }
      await page.evaluate(() => {
        window.clienteState = {};
        window.calls = [];
        window.reply = {disponivel: false};
        window.supabaseClient = {functions: {invoke: async (name, options) => {
          const args = options.body;
          window.calls.push({name, args});
          if (window.fail) throw new Error('falha simulada');
          if (args.criar) await new Promise(r => setTimeout(r, 80));
          return {data: window.queue?.length ? window.queue.shift() : window.reply};
        }}};

        document.getElementById('portal-abas').hidden = false;
      });
      await page.addScriptTag({path: path.join(root, 'frontend/cliente-shell.js')});
      await page.evaluate(() => montarPortal('Impresso'));
      await page.addScriptTag({path: path.join(root, 'frontend/cliente-ideal-control.js')});
      const outcome = await page.evaluate(async () => {
        const wait = () => new Promise(r => setTimeout(r, 120));
        const tab = document.getElementById('portal-ideal-control-aba');
        const box = document.getElementById('secao-ideal-control');
        PortalIdealControl.iniciar('24880','token-ficticio'); await wait();
        const hidden = tab.hidden;
        window.reply = {disponivel: true, estado: 'aguardando_impressao'};
        window.dispatchEvent(new Event('focus')); await wait();
        const partial = !box.textContent.includes('Criar evento') && box.textContent.includes('após a impressão');
        window.reply = {disponivel: true, estado: 'pronto'};
        window.dispatchEvent(new Event('focus')); await wait();
        tab.click(); await wait();
        const opened = !box.hidden && window.SECOES.includes('ideal-control');
        const button = box.querySelector('button');
        window.reply = {disponivel: true, estado:'criado', nome_evento:'<img src=x onerror=alert(1)>',
          qr:'IDEAL-CONTROL-EVENTO:1:' + 'a'.repeat(64)};
        button.click(); button.click(); await wait();
        const canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d');
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
        const decoded = jsQR(pixels.data,pixels.width,pixels.height);
        const creates = calls.filter(c => c.args.criar).length;
        const safeText = !box.querySelector('img') && box.textContent.includes('<img');
        const qrOK = decoded && decoded.data === window.reply.qr;
        const install = box.querySelector('a').href;
        const tabSize = tab.getBoundingClientRect();
        window.reply = {disponivel:true,estado:'acesso_revogado'};
        window.dispatchEvent(new Event('focus')); await wait();
        const revoked = !box.querySelector('canvas') && box.textContent.includes('revogado');
        window.reply = {disponivel:false};
        window.dispatchEvent(new Event('focus')); await wait();
        const disabled = tab.hidden && !box.querySelector('canvas');
        window.reply = {disponivel:true,estado:'preparando'};
        window.dispatchEvent(new Event('focus')); await wait();
        window.queue = [{disponivel:true,estado:'preparando'},
          {disponivel:true,estado:'criado',nome_evento:'Evento fictício',qr:'IDEAL-CONTROL-EVENTO:1:'+'b'.repeat(64)}];
        box.querySelector('button').click();
        await new Promise(r => setTimeout(r,350));
        const batches = !!box.querySelector('canvas') && window.queue.length === 0;
        window.reply = {disponivel:true,estado:'pronto'};
        window.dispatchEvent(new Event('focus')); await wait();
        window.fail = true;
        box.querySelector('button').click(); await wait();
        const retryOffered = box.textContent.includes('Tentar novamente') && !box.querySelector('canvas');
        window.fail = false;
        window.reply = {disponivel:true,estado:'criado',qr:'IDEAL-CONTROL-EVENTO:1:'+'c'.repeat(64)};
        box.querySelector('button').click(); await wait();
        const resumed = !!box.querySelector('canvas') && calls[calls.length-1].args.criar;
        window.fail = true;
        PortalIdealControl.iniciar('24880','token-ficticio'); await wait();
        return {batches,retryOffered,resumed,opened,hidden,partial,creates,safeText,qrOK,install,revoked,disabled,
          failClosed:tab.hidden, width:tabSize.width, height:tabSize.height};
      });
      for (const key of ['batches','retryOffered','resumed','opened','hidden','partial','safeText','qrOK','revoked','disabled','failClosed']) assert.equal(outcome[key], true, key);
      assert.equal(outcome.creates, 1);
      assert.equal(outcome.install, 'https://imposition.ai-ideal.com.br/ic/');
      assert.ok(outcome.width >= 44 && outcome.height >= 44);
      results.push({width, checks: 14});
      await page.close();
    }
    console.log('OK: ' + JSON.stringify({ok:true, results}));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
