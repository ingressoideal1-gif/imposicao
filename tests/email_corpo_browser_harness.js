// DOM e rasterização reais; banco, HTTP e SMTP inteiramente sintéticos.
const fs = require('fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome, async = false) {
    const inicio = source.indexOf('function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return (async ? 'async ' : '') + source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.url().startsWith('data:') ? req.continue() : req.abort());
        await page.setContent('<!doctype html><body></body>');
        await page.setViewport({ width: 1280, height: 1000 });
        const transporte = source.slice(source.indexOf('let emailOperacaoEmAndamento'), source.indexOf('window.abrirModalConfigEmail = abrirModalConfigEmail;', source.indexOf('let emailOperacaoEmAndamento')));
        await page.addScriptTag({ content: `
            const API_PAINEL = 'https://synthetic.example';
            window.avisos = []; window.envios = []; window.sucessos = [];
            window.modelos = []; window.consultas = []; window.cadastros = {};
            function toast(msg) { avisos.push(msg); }
            function mostrarSucessoEnvioEmail(to) { sucessos.push(to); }
            async function buscarDadosEmailCliente(osId) {
                if (cadastros[osId]) await cadastros[osId];
                return {clienteNome:'Cliente Exemplo',clienteEmail:'cliente@example.com',atendente:'Atendimento'};
            }
            const supabaseClient = {
                auth:{getSession:async()=>({data:{session:{access_token:'sintetico'}}})},
                from: tabela => {
                    if (tabela !== 'pedidos_modelos') throw new Error('Tabela inesperada');
                    const q = {select:()=>q,eq:(campo,valor)=>{consultas.push([campo,valor]);return q;},order:()=>q,
                        limit:async()=>({data:window.modelos,error:null})}; return q;
                }
            };
            const fetchReal = window.fetch.bind(window);
            window.fetch = async (url, opcoes) => {
                if (url.startsWith('data:')) return fetchReal(url, opcoes);
                if (url === API_PAINEL + '/api/email/enviar') {
                    envios.push(JSON.parse(opcoes.body));
                    return {ok:true,json:async()=>({ok:true})};
                }
                throw new Error('Nenhuma rede real permitida');
            };
            ${extrair('mensagemEmailSemLink')}
            ${extrair('imagensParaCorpoEmail', true)}
            ${extrair('prepararModelosEmailCorpo', true)}
            ${extrair('alterarModoEmailCliente', true)}
            ${extrair('ensureModalEmailElement')}
            ${extrair('montarMensagemEmailCliente')}
            ${extrair('abrirModalEnviarEmailCliente', true)}
            ${extrair('fecharModalEnviarEmailCliente')}
            ${transporte}
        ` });
        await page.evaluate(async () => {
            const arte = (texto, cor) => {
                const c = document.createElement('canvas'); c.width = 1000; c.height = 350;
                const ctx = c.getContext('2d'); ctx.fillStyle = cor; ctx.fillRect(0, 0, 1000, 350);
                ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif'; ctx.fillText(texto, 40, 180);
                return c.toDataURL('image/png');
            };
            window.modelos = [
                {id:1,nome_modelo:'Ingresso — Setor A',quantidade:100,padrao:'Azul',gabarito_operacional:'001 a 100',verso_tipo:'FxVerso',
                    amostra_arte_base64:arte('SETOR A · 001','#1769aa'),verso_amostra_arte_base64:arte('VERSO · Informações','#285246'),arte_url:'https://nao-usar.example/original.pdf'},
                {id:2,nome_modelo:'Credencial',quantidade:20,padrao:'Verde',amostra_arte_base64:arte('CREDENCIAL','#178060')},
            ];
            await abrirModalEnviarEmailCliente('vibe_11', 11, 'https://example.com/cliente/11-abc123');
        });
        assert.equal(await page.$eval('#modal-email-modo', e => e.value), 'link');
        const textoLink = await page.$eval('#modal-email-body', e => e.value);
        assert.match(textoLink, /\/cliente\/11-abc123/);
        await page.select('#modal-email-modo', 'artes_corpo');
        await page.waitForFunction(() => document.querySelectorAll('#modal-email-artes-corpo img').length === 3);
        assert.equal(await page.$eval('#modal-email-link-box', e => getComputedStyle(e).display), 'none');
        assert.equal(await page.$eval('#btn-email-outlook', e => e.hidden), true);
        assert.doesNotMatch(await page.$eval('#modal-email-body', e => e.value), /\/cliente\/|link acima/i);
        assert.equal(await page.$$eval('#modal-email-artes-corpo img', imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
        assert.match(await page.$eval('#modal-email-artes-corpo', e => e.textContent), /Quantidade: 100.*001 a 100/);
        await page.evaluate(() => document.getElementById('modal-email-body').value += '\nObservação editada.');
        await page.select('#modal-email-modo', 'link');
        assert.equal(await page.$eval('#modal-email-body', e => e.value), textoLink);
        assert.equal(await page.$eval('#modal-email-artes-corpo', e => e.hidden), true);
        await page.select('#modal-email-modo', 'artes_corpo');
        await page.waitForFunction(() => document.querySelectorAll('#modal-email-artes-corpo img').length === 3);
        assert.match(await page.$eval('#modal-email-body', e => e.value), /Observação editada/);
        const preview = process.env.EMAIL_CORPO_PREVIEW_DIR;
        if (preview) fs.mkdirSync(preview, { recursive: true });
        for (const [nome, width, height] of [['desktop',1280,1000],['mobile',390,900]]) {
            await page.setViewport({ width, height });
            assert.ok(await page.$eval('.email-dialog', e => e.scrollWidth <= e.clientWidth + 1));
            if (preview) {
                await page.$eval('#modal-email-artes-corpo', e => e.scrollIntoView({block:'start'}));
                await page.screenshot({ path: preview + '/email-corpo-' + nome + '.png' });
            }
        }
        await page.evaluate(() => dispararEmailDiretoCliente());
        const enviado = await page.evaluate(() => envios[0]);
        if (preview) fs.writeFileSync(preview + '/pedido-sintetico.json', JSON.stringify(enviado));
        assert.equal(enviado.modo, 'artes_corpo');
        assert.equal(enviado.link_url, undefined);
        assert.equal(enviado.modelos.length, 2);
        assert.equal(enviado.modelos[0].imagens.length, 2);
        assert.match(enviado.modelos[0].imagens[0].dados, /^data:image\/jpeg;base64,/);
        assert.doesNotMatch(enviado.body_text, /\/cliente\//);
        assert.deepEqual(Object.keys(enviado.modelos[0]).sort(), ['id','imagens']);
        await page.evaluate(() => dispararEmailDiretoCliente());
        assert.equal(await page.evaluate(() => envios.length), 1, 'Repetição não reenvia');
        await page.select('#modal-email-modo', 'link');
        await page.evaluate(() => dispararEmailDiretoCliente());
        const atual = await page.evaluate(() => envios[1]);
        assert.equal(atual.modo, undefined);
        assert.match(atual.body_text, /\/cliente\//);

        // O atalho novo abre a opção 2 sem gerar ou consultar link do cliente.
        await page.addScriptTag({ content: `
            const state = {amostrasOSAtivo:'vibe_11',ordens:[{id:'vibe_11',numero:11}]};
            ${extrair('abrirEmailArtesCorpoBanner', true)}
        ` });
        await page.evaluate(() => abrirEmailArtesCorpoBanner());
        assert.equal(await page.$eval('#modal-email-modo', e => e.value), 'artes_corpo');
        assert.equal(await page.evaluate(() => _activeEmailModalData.linkUrl), '');
        assert.equal(await page.$eval('#modal-email-modo', e => e.options[0].disabled), true);
        await page.evaluate(() => dispararEmailDiretoCliente());
        assert.equal(await page.evaluate(() => envios.length), 3);

        // PDF com duas páginas: verifica rasterização de todas e liberação do documento.
        await page.evaluate(async () => {
            window.paginasRenderizadas = []; window.pdfLiberado = false;
            window.pdfjsLib = { getDocument: () => ({
                promise: Promise.resolve({ numPages:2, getPage:async n => ({
                    getViewport:({scale})=>({width:500*scale,height:200*scale}),
                    render:({canvasContext})=>{paginasRenderizadas.push(n);canvasContext.fillRect(0,0,10,10);return {promise:Promise.resolve()};},cleanup:()=>{}
                }) }), destroy:async()=>{pdfLiberado=true;}
            }) };
            window.pdfImagens = await imagensParaCorpoEmail('data:application/pdf;base64,' + btoa('%PDF-sintetico'));
        });
        assert.deepEqual(await page.evaluate(() => paginasRenderizadas), [1,2]);
        assert.equal(await page.evaluate(() => pdfLiberado && pdfImagens.length === 2), true);

        // Falta de verso: nenhum envio parcial é permitido.
        await page.evaluate(async () => {
            delete modelos[0].verso_amostra_arte_base64;
            await abrirModalEnviarEmailCliente('vibe_11',11,'https://example.com/cliente/11-abc123');
        });
        await page.select('#modal-email-modo', 'artes_corpo');
        await page.waitForFunction(() => document.getElementById('modal-email-artes-corpo').textContent.includes('Gere a prévia de verso'));
        await page.evaluate(() => dispararEmailDiretoCliente());
        assert.equal(await page.evaluate(() => envios.length), 3);

        // Aberturas concorrentes e fechamento descartam respostas antigas.
        await page.evaluate(async () => {
            cadastros.vibe_11 = new Promise(r => window.liberarAntigo = r);
            window.antigo = abrirModalEnviarEmailCliente('vibe_11',11,'https://example.com/cliente/11-abc123');
            await abrirModalEnviarEmailCliente('vibe_22',22,'https://example.com/cliente/22-xyz999');
            liberarAntigo(); await antigo;
        });
        assert.equal(await page.evaluate(() => _activeEmailModalData.osId), 'vibe_22');
        await page.evaluate(async () => {
            cadastros.vibe_11 = new Promise(r => window.liberarAntigo = r);
            window.antigo = abrirModalEnviarEmailCliente('vibe_11',11,'https://example.com/cliente/11-abc123');
            fecharModalEnviarEmailCliente(); liberarAntigo(); await antigo;
        });
        assert.equal(await page.evaluate(() => _activeEmailModalData), null);
        assert.deepEqual(erros, []);
        console.log('OK: duas opções, JPEG real, frente/verso, páginas PDF, rascunhos, limites de envio e concorrência');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
