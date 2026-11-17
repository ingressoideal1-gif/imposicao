const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'frontend/montagem.js'), 'utf8').replace(/\r/g, '');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
function extract(name, source = code) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
async function testarSeletorProgressivo(page) {
    await page.setContent('<select id="mtg-pedido"><option value="__todos__">Todos</option></select><select id="mtg-modelo"></select>');
    await page.evaluate(() => {
        window.state = {montagem:{modelos:[], celulas:[]}, ordens:[{id:'A'},{id:'B'}],
            osItens:{A:[{id:'M',qtd:10}], B:[{id:'M',qtd:22}]}};
        Object.assign(window, {
            pedidosParaMontagem: () => state.ordens,
            loadOSItens: async id => { if (id === 'B') await new Promise(r => { window.liberar = r; }); },
            modeloDisponivelNaMontagem: () => true,
            _mtgGarantirBancosDoPedido: async id => { state.banco = state.osItens[id][0].qtd; },
            _mtgModeloDoItem: (osId,item) => ({itemId:item.id, qtd:state.banco}),
            _mtgOpcaoDoModelo: (os,item) => '<option value="' + os.id + '::' + item.id + '">' + item.id + '</option>',
            _mtgAtualizarGeracao() {}, _mtgRenderSeletorDeModelos() {}, renderMontagem() {}, onMontagemPosicoesChange() {}
        });
    });
    await page.addScriptTag({content: ['onMontagemPedidoChange','_mtgChaveDoCandidato','_mtgModeloEscolhido'].map(n => extract(n)).join('\n')});
    await page.evaluate(() => { window.carga = onMontagemPedidoChange(); });
    await page.waitForFunction(() => !!window.liberar);
    assert.equal(await page.$eval('#mtg-modelo', el => el.disabled), false);
    assert.deepEqual(await page.select('#mtg-modelo','A::M'), ['A::M']);
    await page.evaluate(async () => { state.montagem.pedidoSel = 'A'; liberar(); await carga; });
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#mtg-modelo').value,
        _mtgModeloEscolhido(state.osItens.A[0]).qtd, state.montagem.modelosDisponiveis[1].modelo.qtd]), ['A::M',10,22]);
    await page.evaluate(async () => {
        window.loadOSItens = async () => true;
        window._mtgGarantirBancosDoPedido = async () => { state._bancosPedidoDe = 'A'; };
        window.toast = mensagem => { window.aviso = mensagem; };
        await onMontagemPedidoChange();
    });
    assert.deepEqual(await page.$eval('#mtg-modelo', el => [...el.options].map(o => o.value)), ['', 'A::M']);
    assert.match(await page.evaluate(() => aviso), /pedidos B/);
}

async function testarRevisoes(page) {
    const {PDFDocument, rgb} = require('pdf-lib');
    async function criar(frente, verso) {
        const doc = await PDFDocument.create();
        for (const cor of [frente, verso]) {
            doc.addPage([32,32]).drawRectangle({x:0, y:0, width:32, height:32, color:rgb(...cor)});
        }
        return Array.from(await doc.save());
    }
    const vermelho = await criar([1,0,0],[0,1,0]);
    const azul = await criar([0,0,1],[1,0,0]);
    const worker = fs.readFileSync(path.join(root,'frontend/vendor/offline/pdf.worker.min.js'));
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = new URL(req.url());
        if (url.pathname === '/vendor/offline/pdf.worker.min.js') {
            return req.respond({contentType:'text/javascript', body:worker});
        }
        if (url.pathname === '/') return req.respond({contentType:'text/html',
            body:'<main><span class="mtg-celula-amostra" data-i="0"></span></main>'});
        return req.abort();
    });
    await page.goto('http://sintetico.test/');
    await page.addScriptTag({path:path.join(root,'frontend/vendor/offline/pdf.min.js')});
    const main = fs.readFileSync(path.join(root,'frontend/script.js'),'utf8').replace(/\r/g,'');
    await page.addScriptTag({content: ['aguardarRecursoDaPrevia','rasterDaAmostra'].map(n => extract(n,main))
        .concat(['chaveDoModelo','fonteDaAmostraDaCelula','desenharAmostrasDaFolha'].map(n => extract(n))).join('\n')});
    const prova = await page.evaluate(async (r, b) => {
        const folha = document.querySelector('main');
        const celula = {osId:'A', itemId:'1', pos:1};
        window.state = {osItens:{A:[{id:'1', arte_url:'/arte.pdf'}]}};
        let rev = 0, leituras = 0, iniciou, continuar;
        const inicioAntigo = new Promise(resolve => { iniciou = resolve; });
        window.PilotoSelecao = {recursoDaMontagem: (url, item, os) => {
            if (url !== '/arte.pdf' || item !== '1' || os !== 'A') throw Error('Modelo incorreto');
            const atual = rev;
            return {chave:'revisao-' + atual, ler: async () => {
                leituras++;
                if (atual === 2) { iniciou(); await new Promise(resolve => { continuar = resolve; }); }
                if (atual === 4) return new Response(null, {status:404});
                return new Response(Uint8Array.from(atual % 2 ? b : r));
            }};
        }};
        const desenhar = (face='front') => desenharAmostrasDaFolha(folha,[celula],[celula],face);
        const pixel = () => Array.from(folha.querySelector('canvas').getContext('2d').getImageData(10,10,1,1).data).slice(0,3);
        await desenhar(); const primeira = pixel();
        await desenhar(); const leiturasDaPrimeira = leituras;
        rev = 1; await desenhar(); const segunda = pixel();
        await desenhar('back'); const verso = pixel();
        rev = 2; const antiga = desenhar(); await inicioAntigo;
        rev = 3; await desenhar(); continuar(); await antiga; const aposTroca = pixel();
        rev = 4; await desenhar(); const erro = folha.querySelector('span').dataset.estado;
        rev = 5; await desenhar(); const recuperada = pixel();
        window.PilotoSelecao = null;
        let chamadasWeb = 0;
        window.fetch = async (url, op) => {
            if (url !== '/arte.pdf' || op.cache !== 'no-store') throw Error('Cache inesperado');
            return new Response(Uint8Array.from(chamadasWeb++ === 0 ? r : b));
        };
        await desenhar(); const web1 = pixel(); await desenhar(); const web2 = pixel();
        return {primeira, segunda, verso, leiturasDaPrimeira, aposTroca, erro, recuperada, web1, web2};
    },vermelho,azul);
    const red=[255,0,0], blue=[0,0,255];
    assert.deepEqual(prova,{primeira:red, segunda:blue, verso:red, leiturasDaPrimeira:1, aposTroca:blue,
        erro:'erro', recuperada:blue, web1:red, web2:blue});
}

(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        const page = await browser.newPage();
        const start = html.indexOf('<select id="mtg-formato"');
        assert(start >= 0);
        await page.setContent(html.slice(start, html.indexOf('</select>', start) + 9) + '<select id="mtg-pedido"></select>');
        await page.evaluate(() => {
            window.state = {montagem: {celulas: [], modelos: []}, formatos: [{id:'F1',name:'Ingresso'}], ordens:[{id:'A',numero:1,status_interno:'EM PRODUCAO'}],
                osItens:{A:[{id:'M',_vibe_id_produto:'P',formato_id:'F1'}]}, modelosGlobais:{},
                produtosGlobais:[{id_produto:'P',setor_pcp:'TEXTIL'}]};
            window.loadOrdens = () => new Promise(() => {});
            window.escapeHtml = String;
            window.formatoDoItem = it => state.formatos.find(f => f.id === it.formato_id);
            window.onMontagemPedidoChange = async () => {};
            window.onMontagemPosicoesChange = () => {};
            window.renderMontagem = () => {};
        });
        await page.addScriptTag({content: ['pintarSetoresDaMontagem','setorDoModeloNaMontagem','pedidoEmProducaoNaMontagem','produtoDoModeloNaMontagem','formatoDoModeloNaMontagem','modelosDoPedidoNaMontagem','modeloDisponivelNaMontagem','pedidoDisponivelNaMontagem','pedidosParaMontagem','encherFormatosDaMontagem','encherPedidosDaMontagem','onMontagemFormatoChange','abrirMontagem'].map(n => extract(n)).join('\n')});
        await page.evaluate(() => { abrirMontagem(); });
        assert.equal(await page.$eval('#mtg-formato', el => el.disabled), false);
        await page.click('#mtg-formato');
        await page.keyboard.press('Escape');
        await page.select('#mtg-formato', 'F1');
        assert.equal(await page.evaluate(() => state.montagem.formatoSel), 'F1');
        await testarSeletorProgressivo(page);
        await testarRevisoes(page);
        console.log('OK: primeiro modelo selecionável durante a carga, quantidade por pedido e pixels da revisão em uso.');
    } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
