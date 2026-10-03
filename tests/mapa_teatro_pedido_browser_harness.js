// Navegador real, com Supabase e APIs simulados; nenhum dado de produção.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const puppeteer=require('puppeteer');
const {mapa}=require('./teatro_banco_harness.js');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'frontend/script.js'),'utf8');
function extrair(nome) {
    const i=script.indexOf('\nfunction '+nome+'('),j=script.indexOf('\n}',i)+2;
    assert.ok(i>=0&&j>i);return script.slice(i,j);
}
async function executar() {
    const button=script.match(/<button[^\n]+onclick="abrirMapaTeatroDoPedido\('[^\n]+/)[0].replace('${osId}','pedido');
    const adapterInicio=script.indexOf('window.abrirMapaTeatroDoPedido = function'),adapterFim=script.indexOf('\n};',adapterInicio)+3;
    const servidor=http.createServer((req,res)=>{
        if(req.url==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><link rel="stylesheet" href="style.css"><style>body{background:#0b1120;color:white;font:16px Arial}label{display:block}h2{margin-top:0}</style><body>'+button+'</body></html>');return;}
        const arquivo=path.join(root,'frontend',path.basename(req.url));
        if(!fs.existsSync(arquivo)) {res.writeHead(404);res.end();return;}
        res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(arquivo));
    });
    await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
    const browser=await puppeteer.launch({headless:true});
    try {
        const page=await browser.newPage();await page.setViewport({width:1120,height:1000});
        await page.setRequestInterception(true);
        page.on('request',r=>r.url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
        await page.goto('http://127.0.0.1:'+servidor.address().port);
        for(const arquivo of ['mapa-teatro-revisao.js','teatro-banco.js','mapa-teatro-do-pedido.js','banco-do-modelo.js']) await page.addScriptTag({url:'/'+arquivo});
        await page.evaluate(m=>{
            window.fixture={mapa:m,bancos:[],vinculos:[],chamadas:[],falhar:true,renderizado:0,toasts:[],delay:0};
            window.state={amostrasOSAtivo:'pedido',osItens:{pedido:m.config.setores.map((s,i)=>({id:'modelo-'+i,id_int:123,qtd:9,nome:'Arte '+s.nome,amostra_num_id:'teatro',bloco:50,arte_url:'arte-'+i,csv_selecao:i===0?['antigo']:null}))},bancosDoPedido:[],vinculosDeBanco:{},numeracoes:[{id:'teatro',tipo:'TEATRO',elements:[{type:'TEATRO_COMBO'}]}],selectedOSItems:[],activeOSItem:{osId:'pedido',itemId:'modelo-0'}};
            window.idIntDoPedido=()=>123;
            window.bloqueioDeModeloAprovado=()=>null;
            window.toast=(msg,tipo)=>fixture.toasts.push({msg,tipo});
            window.renderAmostrasOSItens=async()=>{fixture.renderizado++};
            window.saveAmostraToDB=async(id,os,data)=>{fixture.chamadas.push(['modelo',data]);Object.assign(state.osItens[os].find(i=>i.id===id),data);return {confirmado:true}};
            window.chamarBancosPedido=async(acao,corpo)=>{
                if(acao==='consultar')return structuredClone({bancos:fixture.bancos,vinculos:fixture.vinculos});
                fixture.chamadas.push([acao,structuredClone(corpo)]);
                if(acao==='criar'){const banco={...corpo,id:'banco-'+fixture.bancos.length};fixture.bancos.push(banco);return {banco};}
                if(fixture.falhar&&corpo.modelo_id==='modelo-1')throw Error('Falha de conexão simulada');
                fixture.vinculos=fixture.vinculos.filter(v=>v.modelo_id!==corpo.modelo_id);fixture.vinculos.push(corpo);return {};
            };
            window.supabaseClient={from:()=>{
                let id=null;const api={select:()=>api,order:()=>api,range:async()=>({data:[{id:m.id,name:m.name}],error:null}),eq:(k,v)=>{id=v;return api},single:async()=>{await new Promise(r=>setTimeout(r,fixture.delay));return {data:structuredClone(fixture.mapa),error:null}}};return api;
            }};
        },mapa());
        await page.addScriptTag({content:extrair('vinculoDeBancoDoModelo')+extrair('bancoTeatroDoModelo')+extrair('itemAtivoDoPedido')+extrair('itensDaImposicao')+extrair('trabalhoUsaMapaTeatro')+script.slice(adapterInicio,adapterFim)});
        await page.click('button');await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-select').options.length===2);
        await page.type('#mapa-teatro-pedido-busca','não existe');
        assert.equal(await page.$eval('#mapa-teatro-pedido-select',n=>n.options.length),1);
        await page.$eval('#mapa-teatro-pedido-busca',n=>{n.value='IDEAL';n.dispatchEvent(new Event('input'))});
        await page.select('#mapa-teatro-pedido-select','mapa-ideal');
        await page.waitForSelector('select[data-setor-id="setor-3"]');
        await page.select('select[data-setor-id="setor-0"]','modelo-0');
        await page.select('select[data-setor-id="setor-1"]','modelo-0');
        await page.select('select[data-setor-id="setor-2"]','modelo-2');
        await page.select('select[data-setor-id="setor-3"]','modelo-3');
        await page.click('#mapa-teatro-pedido-popup .btn-primary');
        await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-status').textContent.includes('modelo diferente'));
        assert.equal(await page.evaluate(()=>fixture.chamadas.length),0);
        await page.select('select[data-setor-id="setor-1"]','modelo-1');
        const out=path.join(root,'tmp_teatro_pedido_evidencia');fs.mkdirSync(out,{recursive:true});
        await page.setViewport({width:1120,height:1400});
        await page.$eval('#mapa-teatro-pedido-popup section',n=>n.scrollTop=0);
        await page.screenshot({path:path.join(out,'popup-associacao.png')});
        await page.click('#mapa-teatro-pedido-popup .btn-primary');
        await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-status').textContent.includes('conexão simulada'));
        assert.equal(await page.evaluate(()=>fixture.bancos.length),2);
        await page.evaluate(()=>fixture.falhar=false);
        await page.click('#mapa-teatro-pedido-popup .btn-primary');
        await page.waitForFunction(()=>!document.querySelector('#mapa-teatro-pedido-popup'));
        const resultado=await page.evaluate(()=>({bancos:fixture.bancos.length,vinculos:fixture.vinculos.length,render:fixture.renderizado,itens:state.osItens.pedido,toasts:fixture.toasts}));
        assert.equal(resultado.bancos,4);assert.equal(resultado.vinculos,4);assert.equal(resultado.render,1);
        resultado.itens.forEach((i,n)=>{assert.equal(i.arte_url,'arte-'+n);assert.equal(i.qtd,9);assert.equal(i.bloco,50)});
        assert.equal(resultado.itens[0].csv_selecao,null);
        // O seletor legado de mapa inteiro deixa de ser exigido para os bancos de setores.
        assert.equal(await page.evaluate(()=>trabalhoUsaMapaTeatro('ped')),false);
        // Uma edição do mapa depois da seleção exige nova leitura e nenhuma escrita.
        const gravacoes=await page.evaluate(()=>fixture.chamadas.length);
        await page.click('body > button');await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-select').options.length===2);
        await page.select('#mapa-teatro-pedido-select','mapa-ideal');
        await page.waitForSelector('select[data-setor-id="setor-3"]');
        for(let i=0;i<4;i++) await page.select('select[data-setor-id="setor-'+i+'"]','modelo-'+i);
        await page.evaluate(()=>fixture.mapa.config.setores[0].nome='Setor alterado');
        await page.click('#mapa-teatro-pedido-popup .btn-primary');
        await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-status').textContent.includes('mapa foi alterado'));
        assert.equal(await page.evaluate(()=>fixture.chamadas.length),gravacoes);
        await page.keyboard.press('Escape');
        // Resposta tardia depois de fechar não pode recriar o popup.
        await page.evaluate(()=>fixture.delay=100);
        await page.click('body > button');await page.waitForFunction(()=>document.querySelector('#mapa-teatro-pedido-select').options.length===2);
        await page.select('#mapa-teatro-pedido-select','mapa-ideal');await page.keyboard.press('Escape');
        await page.evaluate(()=>new Promise(r=>setTimeout(r,150)));
        assert.equal(await page.$('#mapa-teatro-pedido-popup'),null);
        console.log('OK: popup real, busca, quatro modelos, conflito, falha parcial, retomada, IDs, revisão alterada e fechamento durante leitura.');
    } finally {await browser.close();await new Promise(r=>servidor.close(r));}
}
executar().catch(e=>{console.error(e);process.exitCode=1});
