/* Dados sinteticos, servidor local, nenhuma conexao ao ERP. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../frontend');
(async () => {
  const server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if(!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({headless:true});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vibe-entregas-test-'));
  try {
    const page = await browser.newPage(); await page.setBypassServiceWorker(true); const errors=[];const external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',req=>{if(req.url().startsWith(base)||req.url().startsWith('blob:')||req.url().startsWith('data:'))req.continue();else{external.push(req.url());req.abort();}});
    await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});

    await page.setRequestInterception(false);
    await page.setRequestInterception(true);
    page.removeAllListeners('request');
    const interceptar=req=>{
      if(req.url().endsWith('/entregas/api.js')) return req.respond({contentType:'text/javascript',body:`
        window.VibeEntregas={ativo:true,entrar:async()=>{localStorage.setItem('sessao-teste','ativa');return{id:'driver-a',email:'teste@example.invalid'};},restaurarSessao:async()=>localStorage.getItem('sessao-teste')?{id:'driver-a',email:'teste@example.invalid'}:null,sair:async()=>{localStorage.removeItem('sessao-teste');},
        minhas:async()=>window.fixture.filter(p=>p.estado==='minha'),listar:async()=>window.fixture.filter(p=>p.estado==='concluida'),
        rotasAtivas:async()=>[{minha:true,iniciada_em:'2026-10-18',paradas:[{chave:'b',pedido:1002,entregador:'Motorista teste'},{chave:'a',pedido:1001},{chave:'c',pedido:1003}]}],
        registrar:async(p)=>{if(window.falhar)throw Error('Falha de conexão simulada');window.fixture.find(x=>x.chave===p.chave).estado='concluida';return{confirmada:true,hora:new Date().toISOString()};}};
        window.fixture=[{chave:'a',id:'1001',nome:'Cliente A',endereco:'Endereço A',estado:'minha',status_erp:'EM TRANSITO',volumes:1},{chave:'b',id:'1002',nome:'Cliente B',endereco:'Endereço B',estado:'minha',status_erp:'EM TRANSITO',volumes:2},{chave:'c',id:'1003',nome:'Cliente C',estado:'minha',status_erp:'EM PRODUCAO'}];
      `});
      if(req.url().startsWith(base)||req.url().startsWith('blob:')||req.url().startsWith('data:'))req.continue();else{external.push(req.url());req.abort();}
    };page.on('request',interceptar);
    const login=async()=>{await page.type('#email','teste@example.invalid');await page.type('#senha','senha-sintetica');await page.click('#login button');await page.waitForFunction(()=>document.querySelectorAll('.card').length===3);};
    await page.goto(base+'/entregas/',{waitUntil:'networkidle0'});await login();
    assert.equal(await page.$eval('#titulo',e=>e.textContent),'Minha rota');
    assert.match(await page.$eval('.proxima-entrega',e=>e.textContent),/1002/);
    assert.equal(await page.$$eval('.aguardando button',e=>e.length),0);
    assert.equal(await page.$eval('#identidade',e=>e.textContent),'Motorista teste');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.click('.proxima-entrega button');await page.waitForFunction(()=>document.getElementById('formulario').open);await page.type('#recebedor','Pessoa teste');await page.click('#volumes');
    await page.click('#registro button[type=submit]');assert.match(await page.$eval('#erro',e=>e.textContent),/foto/);
    const foto=path.join(dir,'foto.png');
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL().split(',')[1];});
    fs.writeFileSync(foto,Buffer.from(png,'base64'));await(await page.$('#foto')).uploadFile(foto);
    await page.waitForFunction(async()=>!!(await RascunhosEntregas.ler('driver-a','b'))?.foto);
    assert.equal(await page.evaluate(()=>RascunhosEntregas.ler('driver-b','b')),undefined);
    await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.getElementById('operacao').hidden && document.querySelectorAll('.card').length===3);assert.equal(await page.$eval('#login',e=>e.hidden),true);await page.click('.proxima-entrega button');
    await page.waitForFunction(()=>document.getElementById('formulario').open);
    assert.equal(await page.$eval('#recebedor',e=>e.value),'Pessoa teste');assert.equal(await page.$eval('#preview',e=>e.hidden),false);
    await page.evaluate(()=>window.falhar=true);await page.click('#registro button[type=submit]');await page.click('#confirmar');
    await page.waitForFunction(()=>document.getElementById('envio-erro').textContent.includes('Falha'));
    assert.ok(await page.evaluate(()=>RascunhosEntregas.ler('driver-a','b')));
    await page.evaluate(()=>window.falhar=false);await page.click('#confirmar');
    await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);
    assert.match(await page.$eval('.proxima-entrega',e=>e.textContent),/1001/);
    assert.equal(await page.evaluate(()=>RascunhosEntregas.ler('driver-a','b')),undefined);
    await page.evaluate(()=>{VibeEntregas.rotasAtivas=async()=>[{minha:true,paradas:[{chave:'a',pedido:1001}]}];});
    await page.click('#atualizar');await page.waitForFunction(()=>document.getElementById('rota-progresso').textContent.includes('Rota pronta para iniciar'));
    assert.equal(await page.$$eval('.card button',e=>e.length),0);
    page.on('dialog',d=>d.accept());
    await page.evaluate(()=>{
      window.claimFail=true;window.startFail=true;
      VibeEntregas.listar=async()=>[{chave:'d',id:'1004',estado:'disponivel',status_erp:'EXPEDICAO',nome:'Disponivel teste'}];
      VibeEntregas.assumir=async()=>{if(claimFail)throw Error('Pedido ja atribuido');fixture.push({chave:'d',id:'1004',estado:'minha',status_erp:'EXPEDICAO'});return{confirmado:true};};
      VibeEntregas.iniciarRota=async()=>{if(startFail)throw Error('Google indisponivel');fixture.find(p=>p.chave==='a').status_erp='EM TRANSITO';VibeEntregas.rotasAtivas=async()=>[{minha:true,iniciada_em:'2026-10-19',paradas:[{chave:'a',pedido:1001}]}];return{confirmado:true};};
    });
    await page.click('[data-filtro="disponivel"]');await page.waitForFunction(()=>document.querySelector('.card button')?.textContent==='Assumir entrega');
    await page.click('.card button');await page.waitForFunction(()=>document.getElementById('mensagem').textContent.includes('ja atribuido'));
    assert.equal(await page.$eval('.card button',e=>e.disabled),false);
    await page.evaluate(()=>claimFail=false);await page.click('.card button');await page.waitForFunction(()=>document.getElementById('mensagem').textContent.includes('atribuída a você'));
    assert.equal(await page.$eval('#titulo',e=>e.textContent),'Minha rota');
    await page.click('#iniciar-rota');await page.waitForFunction(()=>document.getElementById('mensagem').textContent.includes('Google indisponivel'));
    assert.equal(await page.$eval('#iniciar-rota',e=>e.disabled),false);
    await page.evaluate(()=>startFail=false);await page.click('#iniciar-rota');await page.waitForFunction(()=>document.getElementById('mensagem').textContent.includes('Rota iniciada'));
    assert.equal(await page.$eval('#iniciar-rota',e=>e.hidden),true);
    await page.evaluate(()=>{
      fixture=[{chave:'v1',id:'2001',nome:'Veppo A',modalidade:'veppo',estado:'minha',status_erp:'EM TRANSITO',endereco:'Destino Veppo 70',volumes:1},{chave:'v2',id:'2002',nome:'Veppo B',modalidade:'veppo',estado:'minha',status_erp:'EM TRANSITO',endereco:'Destino Veppo 70',volumes:2},{chave:'a1',id:'2003',nome:'Aereo',modalidade:'aereo',estado:'minha',status_erp:'EM TRANSITO',endereco:'Destino Aereo 45',volumes:1}];
      VibeEntregas.minhas=async(busca,modalidade)=>fixture.filter(p=>p.estado==='minha'&&p.modalidade===modalidade);
      VibeEntregas.rotasAtivas=async()=>[{id:'rota-grupo',minha:true,iniciada_em:'2026-10-20',paradas:fixture.map(p=>({...p,pedido:p.id,entregue:p.estado==='concluida'}))}];
      VibeEntregas.registrar=async(p,r)=>{window.ultimoRepasse={pedidos:p.grupo.map(x=>x.id),rota:p.rota_id,recebedor:r.recebedor};for(const x of p.grupo)fixture.find(f=>f.chave===x.chave).estado='concluida';return{confirmada:true,tipo:'repasse'};};
    });
    await page.click('[data-modalidade="veppo"]');await page.waitForFunction(()=>document.querySelector('.card h2')?.textContent==='Veppo · 2 pedido(s)');
    assert.equal(await page.$$eval('.card',e=>e.length),1);
    assert.match(await page.$eval('.card',e=>e.textContent),/2001[\s\S]*2002/);
    await page.type('#busca','2001');await page.waitForFunction(()=>document.querySelector('.card')?.textContent.includes('2002'));
    await page.click('.card button');await page.waitForFunction(()=>document.getElementById('formulario').open);
    assert.match(await page.$eval('#resumo',e=>e.textContent),/2001, 2002/);
    assert.equal(await page.$eval('#resultado',e=>e.disabled),true);
    await page.type('#recebedor','Recebedor transportadora');await page.click('#volumes');await(await page.$('#foto')).uploadFile(foto);
    await page.waitForFunction(()=>!document.getElementById('preview').hidden);
    await page.click('#registro button[type=submit]');assert.match(await page.$eval('#confirmar-aviso',e=>e.textContent),/permanecerá Em trânsito/);
    await page.click('#confirmar');await page.waitForFunction(()=>!!window.ultimoRepasse);
    assert.deepEqual(await page.evaluate(()=>ultimoRepasse.pedidos),['2001','2002']);
    assert.equal(await page.evaluate(()=>ultimoRepasse.rota),'rota-grupo');
    await page.click('[data-modalidade="aereo"]');await page.waitForFunction(()=>document.querySelector('.card h2')?.textContent==='Aéreo · 1 pedido(s)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>RascunhosEntregas.salvar('driver-a','a',{recebedor:'Teste'}));
    await page.click('#sair');await page.waitForFunction(()=>document.getElementById('operacao').hidden);
    assert.equal(await page.evaluate(()=>RascunhosEntregas.ler('driver-a','a')),undefined);
    await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#operacao',e=>e.hidden),true);assert.equal(await page.$eval('#login',e=>e.hidden),false);
    await login();
    await page.close();
    const reaberta=await browser.newPage();await reaberta.setBypassServiceWorker(true);await reaberta.setRequestInterception(true);reaberta.on('request',interceptar);
    await reaberta.goto(base+'/entregas/',{waitUntil:'networkidle0'});
    await reaberta.waitForFunction(()=>!document.getElementById('operacao').hidden && document.querySelectorAll('.card').length===3);
    assert.equal(await reaberta.$eval('#login',e=>e.hidden),true);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS: ordem ADM, próxima parada, produção bloqueada, rascunho com foto após recarregar, isolamento por usuário, falha/reenvio, próxima entrega, limpeza ao sair e layout móvel.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
