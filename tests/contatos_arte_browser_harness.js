// Navegador real com rede simulada e contatos sintéticos.
const fs = require('node:fs'), assert = require('node:assert/strict'), puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const moduleSource = source.slice(source.indexOf('/* Contato selecionado na Lista de Arte.'), source.indexOf('/* Envio do link pelo contato selecionado'));
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 390, height: 844 });
    await page.setRequestInterception(true); page.on('request', r => r.abort());
    const index = fs.readFileSync('frontend/index.html', 'utf8');
    const table = index.match(/<table[^>]*id="table-arte"[\s\S]*?<\/table>/)[0];
    await page.setContent('<!doctype html><body>' + table + '</body>');
    assert.equal(await page.$$eval('#table-arte th', els => els.filter(e => /Prazo/.test(e.textContent)).length), 0);
    assert.equal(await page.$$eval('#table-arte th', els => els.filter(e => /Contato \/ WhatsApp/.test(e.textContent)).length), 1);
    await page.evaluate(css => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); }, fs.readFileSync('frontend/style.css', 'utf8'));
    await page.addScriptTag({ content: `
      const API_PAINEL='https://synthetic.example';
      const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}};
      window._currentPerms={perm_lista_arte_view:true,perm_lista_arte_edit:true};
      function escapeHtml(s){const e=document.createElement('span');e.textContent=String(s);return e.innerHTML;}
      function escapeJsAttr(s){return s;}
      window.avisos=[];function toast(m,t){avisos.push({m,t});}
      window.chamadas=[];window.salvarVazio=false;window.conflito=false;window.abriuWhats=null;
      function abrirWhatsappArte(id){abriuWhats=id;}
      window.cadastro={pedido:11,contato_id:'7',nome:'Contato Exemplo',whatsapp:'11999990000',valido:true};
      window.fetch=async(url,op)=>{
        const acao=url.split('/').pop(),dados=JSON.parse(op.body);chamadas.push({acao,dados});
        if(op.headers.Authorization!=='Bearer synthetic')throw Error('Sessão ausente');
        if(acao==='consultar')return {ok:true,json:async()=>dados.pedidos.map(p=>({...cadastro,pedido:Number(p)}))};
        await new Promise(r=>setTimeout(r,70));
        if(conflito)return {ok:false,json:async()=>({detail:'Reabra o contato: alteração concorrente.'})};
        if(salvarVazio)return {ok:true,json:async()=>[]};
        cadastro={...cadastro,nome:dados.nome,whatsapp:dados.whatsapp};
        return {ok:true,json:async()=>cadastro};
      };
    ` + moduleSource });
    await page.evaluate(async () => {
      const ordens = [{ id: 'vibe_11', numero: 11 }, { id: 'vibe_12', numero: 12 }];
      document.querySelector('#tbody-arte').innerHTML = ordens.map(o => '<tr><td data-contato-os="'+o.id+'" data-contato-arte="'+o.numero+'">'+ContatosListaArte.html(o)+'</td><td>'+ContatosListaArte.botaoWhatsapp(o)+'</td></tr>').join('');
      await ContatosListaArte.carregar(ordens); await ContatosListaArte.carregar(ordens);
    });
    assert.equal(await page.evaluate(() => chamadas.length), 1, 'uma consulta em lote, sem nova consulta por desenho');
    await page.click('[aria-label="Enviar link pelo WhatsApp"]');
    assert.equal(await page.evaluate(() => abriuWhats), 'vibe_11');
    await page.evaluate(() => ContatosListaArte.editar('11'));
    await page.waitForSelector('dialog[open]');
    assert.ok(await page.$eval('dialog', e => e.getBoundingClientRect().width <= window.innerWidth));
    await page.evaluate(() => { const f=document.querySelector('dialog form'); f.elements.nome.value='<img src=x onerror=alert(1)>'; f.elements.whatsapp.value='1188880000'; f.requestSubmit(); f.requestSubmit(); });
    await page.waitForFunction(() => !document.querySelector('dialog'));
    assert.equal(await page.evaluate(() => chamadas.filter(c => c.acao === 'salvar').length), 1);
    assert.equal(await page.$$eval('[data-contato-arte] img', es => es.length), 0, 'nome escapado');
    assert.ok(await page.$$eval('[data-contato-arte]', es => es.every(e => e.textContent.includes('1188880000'))), 'atualiza pedidos do mesmo contato');
    await page.evaluate(() => { salvarVazio=true; return ContatosListaArte.editar('11'); });
    await page.evaluate(() => document.querySelector('dialog form').requestSubmit());
    await page.waitForFunction(() => document.querySelector('[data-aviso]').textContent.includes('não confirmou'));
    assert.equal(await page.evaluate(() => avisos.filter(a => a.t === 'success').length), 1);
    await page.click('[data-cancelar]');
    await page.evaluate(() => { salvarVazio=false;conflito=true;return ContatosListaArte.editar('11'); });
    await page.evaluate(() => document.querySelector('dialog form').requestSubmit());
    await page.waitForFunction(() => document.querySelector('[data-aviso]').textContent.includes('concorrente'));
    await page.click('[data-cancelar]');
    await page.evaluate(() => { _currentPerms.perm_lista_arte_edit=false; });
    assert.ok(!(await page.evaluate(() => ContatosListaArte.html({id:'vibe_11',numero:11}))).includes('✎ Editar'));
    await page.evaluate(() => ContatosListaArte.editar('11'));
    assert.equal(await page.$('dialog'), null);
    assert.deepEqual(errors, []);
    console.log('OK: coluna, prazo removido, lote/cache, WhatsApp, modal mobile, salvamento, duplicação, XSS, falha e permissão');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
