// Chromium com dados sinteticos. Nenhuma chamada ao banco ou arquivo real.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(name) {
    const i = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name); return source.slice(i, source.indexOf('\n}', i) + 2);
}
(async () => {
    const requests = [], server = http.createServer((req, res) => {
        res.end('<!doctype html><body><section id="view-lista-arte" class="active"></section><section id="view-lista-impressao"></section><section id="view-amostras"></section><input id="os-search-arte"><table><tbody id="tbody-arte"></tbody><tbody id="tbody-impressao"></tbody></table>');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage(); let failProxy = false, differentProxy = false, hold = false;
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().startsWith(origin)) return req.continue();
            if (req.url().startsWith('https://synthetic.supabase.co/')) {
                requests.push(req.url().includes('/api/proxy') ? 'proxy' : 'direto');
                if (hold) return; // AbortController deve encerrar a comparacao.
                const proxy = req.url().includes('/api/proxy');
                return req.respond({ status: proxy && failProxy ? 503 : 200,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/pdf' },
                    body: proxy && differentProxy ? 'OUTRA_RESPOSTA' : 'ARTE_SINTETICA_PRIVADA' });
            }
            req.abort();
        });
        await page.goto(origin + '/?diagnostico_artes=1');
        await page.addScriptTag({ content: `
            const state = {ordens:Array.from({length:4747},(_,i)=>({numero:i})),filtroFilaTipo:'fila'};
            let _cargaOrdensEmAndamento=null, _linkDiretoJaAberto=true;
            function pedidoDoLinkDireto(){return null}
            function abrirPedidoDoLinkDireto(){}
            function urlDoProxy(url){return 'https://synthetic.supabase.co/functions/v1/arquivo/api/proxy?url='+encodeURIComponent(url)}
            let repaired=0;
            function repararSetoresDosItens(){repaired++; throw Error('ENTROU_NO_DESENHO_VISIVEL')}
            window.loadOrdens=()=>Promise.resolve(true);
            ${extract('recorteDaCargaDeOrdens')}
            ${extract('renderOrdens')}
            ${extract('fetchPdfBytes')}
        ` });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend/diagnostico-artes.js'), 'utf8') });
        let checks = await page.evaluate(async () => {
            let n=0; const ok=(b,m)=>{n++;if(!b)throw Error(m)};
            const api=DiagnosticoArtes;
            ok(!await api.compararDownload(), 'sem captura nao gera trafego');
            api.iniciar({participante:'sintetico',estacao:'rede-a'});
            ok(!await api.compararDownload(), 'sem arte observada nao gera trafego');
            document.getElementById('os-search-arte').value='13020'; await loadOrdens();
            let e=api.relatorio().eventos.find(e=>e.tipo==='solicitacao_lista');
            ok(e.pesquisa==='numero' && e.recorte==='pedido' && e.view==='view-lista-arte', 'motivo da carga sem texto pesquisado');
            document.getElementById('view-lista-arte').classList.remove('active');
            document.getElementById('view-amostras').classList.add('active');
            renderOrdens(); ok(repaired===0, 'carga com pedido aberto nao processa tabelas ocultas');
            document.getElementById('view-amostras').classList.remove('active');
            document.getElementById('view-lista-arte').classList.add('active');
            try {renderOrdens()} catch(err){ok(err.message==='ENTROU_NO_DESENHO_VISIVEL','retorno retoma desenho')}
            ok(repaired===1, 'painel visivel retoma caminho original');
            await fetchPdfBytes('https://synthetic.supabase.co/storage/v1/object/public/artes/ARQUIVO_PRIVADO.pdf?token=TOKEN_PRIVADO');
            ok(await api.compararDownload(), 'direto e proxy entregam mesmos bytes');
            e=api.relatorio().eventos.filter(e=>e.tipo==='comparacao_download');
            ok(e.length===2 && e[0].caminho==='direto' && e[1].caminho==='proxy', 'duas rotas separadas');
            ok(e.every(e=>e.status_http===200 && e.bytes===22), 'headers, corpo e tamanho medidos');
            ok(await api.compararDownload(), 'segunda rodada conserva arquivo');
            e=api.relatorio().eventos.filter(e=>e.tipo==='comparacao_download');
            ok(e[2].caminho==='proxy' && e[3].caminho==='direto' && e.every(x=>x.arquivo_ref===e[0].arquivo_ref), 'alterna ordem sem trocar arte');
            const json=JSON.stringify(api.relatorio());
            ok(!/TOKEN_PRIVADO|ARQUIVO_PRIVADO|ARTE_SINTETICA_PRIVADA|13020|https:/.test(json), 'nao exporta URL, token, bytes ou texto da pesquisa');
            ok(api.relatorio().eventos.some(e=>e.experimento==='comparacao_download'), 'separa experimento de trafego normal');
            return n;
        });
        failProxy = true;
        assert.equal(await page.evaluate(()=>DiagnosticoArtes.compararDownload()), false); checks++;
        assert(await page.evaluate(()=>DiagnosticoArtes.relatorio().eventos.some(e=>e.tipo==='comparacao_download' && e.status_http===503))); checks++;
        failProxy = false; differentProxy = true;
        assert.equal(await page.evaluate(()=>DiagnosticoArtes.compararDownload()), false); checks++;
        assert(await page.evaluate(()=>DiagnosticoArtes.relatorio().eventos.filter(e=>e.tipo==='comparacao_download_fim').at(-1).conteudo_igual===false)); checks++;
        hold = true;
        const stop = await page.evaluate(async () => {
            const pending=DiagnosticoArtes.compararDownload();
            const duplicate=await DiagnosticoArtes.compararDownload();
            DiagnosticoArtes.parar(); const before=JSON.stringify(DiagnosticoArtes.relatorio());
            await pending;
            return !duplicate && before===JSON.stringify(DiagnosticoArtes.relatorio());
        });
        assert(stop); checks++;
        console.log(JSON.stringify({checks,requests:requests.length,syntheticOrders:4747,externalServices:false}));
    } finally { if(browser) await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1});
