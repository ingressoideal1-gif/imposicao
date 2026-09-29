// Tela real em Chromium com API e dados sintéticos, sem acessar serviços externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const pagamento = 'https://vibe.ai-ideal.com.br/p/11-sintetico';
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req => req.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
        await page.goto('https://portal.example/cliente/11-abc123');
        await page.setContent('<main id="secao-pagamento"></main>');
        await page.evaluate(() => {
            window.registrarSecao = () => {};
            window.tituloDoCartao = (_icone, titulo) => titulo;
            window.botaoDeAjuda = () => '<div>Atendimento</div>';
            window.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            window.chamadas = 0;
            window.supabaseClient = {
                rpc: async () => ({ data: { pedido: { numero: '11', valor_total: 100 }, pagamentos: [] }, error: null }),
                functions: { invoke: async (_nome, entrada) => {
                    window.chamadas++;
                    window.entrada = entrada;
                    return { data: { url: 'https://vibe.ai-ideal.com.br/p/11-sintetico' } };
                } }
            };
        });
        for (const nome of ['pagamento-do-pedido.js', 'cliente-dados.js', 'cliente-pagamento.js']) {
            await page.addScriptTag({ content: fs.readFileSync(path.join(raiz, 'frontend', nome), 'utf8') });
        }
        await page.evaluate(async () => {
            await carregarPortal('11', 'abc123');
            desenharSecaoPagamento();
        });
        await page.waitForFunction(() => document.querySelector('a')?.textContent.includes('Pagar pedido'));
        assert.equal(await page.$eval('a', e => e.href), pagamento);
        assert.equal(await page.$eval('a', e => e.target), '_blank');
        assert.deepEqual(await page.evaluate(() => entrada.body), { numero: '11', token: 'abc123' });
        assert.equal(await page.evaluate(() => chamadas), 1);
        console.log('OK carga do portal renderiza Pagar pedido sem cobrança');
        await page.evaluate(() => document.querySelector('a').addEventListener('click', e => { e.preventDefault(); window.clicado = e.currentTarget.href; }));
        await page.click('a');
        assert.equal(await page.evaluate(() => clicado), pagamento);
        for (const status of ['A_RECEBER', 'PAID', 'CANCELADO']) {
            await page.evaluate(status => {
                portalDados.pagamentos = [{ valor: 100, status, link: null }];
                desenharSecaoPagamento();
            }, status);
            assert.equal(await page.$eval('a', e => e.textContent), 'Pagar pedido');
        }
        assert.doesNotMatch(await page.$eval('main', e => e.textContent), /link desta cobrança ainda não foi liberado/);
        console.log('OK clique e botão independente do status do pedido');
        for (const width of [390, 1100]) {
            await page.setViewport({ width, height: 800 });
            await page.evaluate(() => { portalDados.pagamentos = [{ valor: 100, status: 'A_RECEBER', link: 'https://pay.example/cobranca' }]; desenharSecaoPagamento(); });
            assert.equal(await page.$eval('a', e => e.textContent), 'Pagar agora');
            assert.doesNotMatch(await page.$eval('main', e => e.textContent), /Pagar pedido/);
            await page.evaluate(() => carregarLinkPagamentoDoPortal(portalDados, '11', 'abc123'));
            assert.equal(await page.evaluate(() => chamadas), 1);
        }
        console.log('OK cobrança existente mantém Pagar agora e não consulta alternativa');
        await page.evaluate(() => {
            portalDados.pagamentos.push({ valor: 30, status: 'A_RECEBER', link: null });
            desenharSecaoPagamento();
        });
        assert.deepEqual(await page.$$eval('a', els => els.map(e => e.textContent)), ['Pagar agora', 'Pagar pedido']);
        console.log('OK parcelas mistas mantêm link existente e uma alternativa para o pedido');
        await page.evaluate(async () => {
            portalDados = { pedido: { numero: '11' }, pagamentos: [] };
            supabaseClient.functions.invoke = async () => { throw new Error('indisponível'); };
            await carregarLinkPagamentoDoPortal(portalDados, '11', 'abc123');
            desenharSecaoPagamento();
        });
        assert.equal(await page.$('a'), null);
        assert.match(await page.$eval('main', e => e.textContent), /atendimento/);
        for (const url of ['javascript:alert(1)', 'https://vibe.ai-ideal.com.br/p/22-outro']) {
            await page.evaluate(url => { portalDados.linkPagamentoVibe = url; desenharSecaoPagamento(); }, url);
            assert.equal(await page.$('a'), null);
        }
        await page.evaluate(async () => {
            const antigo = portalDados;
            supabaseClient.functions.invoke = async () => {
                portalDados = { pedido: { numero: '22' }, pagamentos: [] };
                return { data: { url: 'https://vibe.ai-ideal.com.br/p/11-sintetico' } };
            };
            await carregarLinkPagamentoDoPortal(antigo, '11', 'abc123');
        });
        assert.equal(await page.evaluate(() => portalDados.linkPagamentoVibe), undefined);
        console.log('OK falha opcional, endereço inválido e resposta atrasada de outro pedido');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
