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
        await page.addStyleTag({ content: fs.readFileSync(path.join(raiz, 'frontend/style.css'), 'utf8') });
        await page.addStyleTag({ content: 'main { max-width: 760px; margin: 16px auto; padding: 0 16px; }' });
        await page.evaluate(() => {
            window.registrarSecao = () => {};
            window.tituloDoCartao = (_icone, titulo) => titulo;
            window.botaoDeAjuda = () => '<div>Atendimento</div>';
            window.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            window.chamadas = 0;
            window.clienteState = {};
            window.abrirSecao = nome => { window.abaAberta = nome; };
            window.supabaseClient = {
                rpc: async () => ({ data: { pedido: { numero: '11', valor_total: 100 }, pagamentos: [] }, error: null }),
                functions: { invoke: async (_nome, entrada) => {
                    window.chamadas++;
                    window.entrada = entrada;
                    return { data: { url: 'https://vibe.ai-ideal.com.br/p/11-sintetico' } };
                } }
            };
        });
        for (const nome of ['pagamento-do-pedido.js', 'cliente-dados.js', 'cliente-confirmacoes.js', 'cliente-pagamento.js']) {
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
        await page.evaluate(() => {
            // Observa o resultado da guarda sem navegar para um pagamento real.
            document.querySelector('a').addEventListener('click', e => {
                window.bloqueado = e.defaultPrevented;
                e.preventDefault();
                window.clicado = e.currentTarget.href;
            });
        });
        await page.click('a');
        assert.equal(await page.evaluate(() => bloqueado), true);
        assert.equal(await page.$eval('dialog p', e => e.textContent), 'Antes de realizar o pagamento, confirme os dados da ENTREGA');
        await page.click('[data-conferir]');
        assert.equal(await page.evaluate(() => abaAberta), 'entrega');
        assert.equal(await page.evaluate(() => portalConfirmacoes.entrega), null);
        for (const entrega of [false, null, 'true']) {
            await page.evaluate(entrega => { portalConfirmacoes.entrega = entrega; }, entrega);
            await page.click('a');
            assert.equal(await page.evaluate(() => bloqueado), true);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('dialog'));
        }
        await page.evaluate(() => {
            portalConfirmacoes.entrega = null;
            reidratarConfirmacoes({ entrega: { entrega_dados: '', observacoes: {
                confirmacoes_portal: { selo: '', entrega: true, faturamento: null }
            } } });
        });
        await page.click('a');
        assert.equal(await page.evaluate(() => bloqueado), false);
        assert.equal(await page.evaluate(() => clicado), pagamento);
        for (const motivo of ['salvando', 'erro', 'alterado']) {
            await page.evaluate(motivo => {
                portalConfirmacoes.entrega = true;
                portalGravandoConfirmacao = motivo === 'salvando' ? 'entrega' : false;
                portalErroConfirmacao.entrega = motivo === 'erro';
                if (motivo === 'alterado') {
                    portalConfirmacoes.entrega = null;
                    reidratarConfirmacoes({ entrega: { entrega_dados: 'ALTERADO', observacoes: {
                        confirmacoes_portal: { selo: 'APROVADO', entrega: true }
                    } } });
                }
            }, motivo);
            await page.focus('a');
            await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => bloqueado), true);
            await page.click('[data-voltar]');
            await page.waitForFunction(() => !document.querySelector('dialog'));
        }
        console.log('OK entrega pendente, correção, gravação, erro e alteração bloqueiam; confirmação salva libera sem exigir nota');
        const imagens = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ideal-pagar-entrega-'));
        for (const width of [390, 1100]) {
            await page.setViewport({ width, height: 850 });
            const medidas = await page.evaluate(() => {
                const card = document.querySelector('.portal-pagar-pedido');
                const c = card.getBoundingClientRect(), p = card.querySelector('p').getBoundingClientRect();
                const b = card.querySelector('a').getBoundingClientRect();
                return { gap: b.top - p.bottom, esquerda: b.left - c.left, direita: c.right - b.right, rodape: c.bottom - b.bottom };
            });
            assert.ok(medidas.gap >= 20, JSON.stringify(medidas));
            assert.ok(medidas.esquerda >= 16 && medidas.direita >= 16 && medidas.rodape >= 18);
            await page.screenshot({ path: path.join(imagens, `pagamento-${width}.png`) });
            await page.click('a');
            const caixa = await page.$eval('dialog', e => ({ largura: e.getBoundingClientRect().width, scroll: e.scrollWidth, cliente: e.clientWidth, centro: e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2 }));
            assert.ok(caixa.largura <= width - 32 && caixa.scroll <= caixa.cliente);
            assert.ok(Math.abs(caixa.centro - 425) <= 1, 'popup centralizado');
            await page.screenshot({ path: path.join(imagens, `popup-${width}.png`) });
            await page.click('[data-voltar]');
            await page.waitForFunction(() => !document.querySelector('dialog'));
        }
        console.log('OK espaçamento e popup em 390/1100px; imagens: ' + imagens);
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
        // Mesmo caminho usado pelo e-mail: hash de pagamento após reidratar os dados.
        await page.addScriptTag({ content: fs.readFileSync(path.join(raiz, 'frontend/cliente-shell.js'), 'utf8') });
        await page.evaluate(() => {
            document.body.innerHTML = '<nav id="portal-abas"></nav>' + SECOES.map(s => '<section id="secao-' + s + '"></section>').join('');
            atualizarPainelDoPedido = () => {};
            registrarSecao('pagamento', desenharSecaoPagamento);
            portalDados = { pedido: { numero: '11', valor_total: 100 }, pagamentos: [], linkPagamentoVibe: 'https://vibe.ai-ideal.com.br/p/11-sintetico' };
            portalConfirmacoes.entrega = null;
            portalErroConfirmacao.entrega = false;
            history.replaceState(null, '', '#pagamento');
            montarPortal('APROVADO');
        });
        assert.equal(await page.$eval('#secao-pagamento', e => e.hidden), false);
        assert.equal(await page.$eval('dialog', e => e.open), true);
        await page.click('[data-conferir]');
        assert.equal(await page.$eval('#secao-entrega', e => e.hidden), false);
        assert.equal(await page.evaluate(() => portalConfirmacoes.entrega), null);
        await page.evaluate(() => {
            reidratarConfirmacoes({ entrega: { entrega_dados: 'APROVADO' } });
            portalDados.pagamentos = [{ status: 'PAID', valor: 100 }];
            history.replaceState(null, '', '#pagamento');
            montarPortal('APROVADO');
        });
        assert.equal(await page.$('dialog'), null);
        assert.equal(await page.$eval('#secao-pagamento', e => e.hidden), false);
        console.log('OK e-mail abre Pagamento e pede entrega; confirmação restaurada não exige nova aprovação');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
