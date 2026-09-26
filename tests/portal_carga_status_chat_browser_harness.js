// Navegador real, HTML e shell reais; todas as requisições externas são bloqueadas.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.resolve(__dirname, '..');
const ler = nome => fs.readFileSync(path.join(raiz, 'frontend', nome), 'utf8');
const cliente = ler('cliente.js');
const html = ler('cliente.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
const estilo = ler('style.css').replace(/@import[^;]+;/g, '');
function funcao(nome) {
    const inicio = cliente.search(new RegExp('(?:async )?function ' + nome + '\\('));
    assert.ok(inicio >= 0, nome);
    return cliente.slice(inicio, cliente.indexOf('\n}', inicio) + 2);
}
const regras = cliente.slice(cliente.indexOf('const STATUS_MODELO_APROVADO_PARA_PEDIDO'),
    cliente.indexOf('async function sincronizarStatusConsolidadoPedidoArteCliente'));
const codigo = regras + '\n' + ['initClientePage', 'mostrarErroDeCargaCliente', 'carregarMioloDasNumeracoes',
    'desenharSecaoArte', 'avisoDaArte', 'registrarChatCliente', 'clienteFinalizarFluxo', 'clienteAprovarTudo',
    'saveAmostraToDB', 'sincronizarStatusConsolidadoPedidoArteCliente', 'escapeHtml',
    'decisionAmostraItem', 'seguirSozinhoSeAprovouTudo', 'mostrarProximaEtapaAposArte'].map(funcao).join('\n');
function preparar(cenario) {
    window.state = { osItens: {}, numeracoes: [], cores: [] };
    window.clienteState = {};
    window.portalConfirmacoes = {};
    window.bancoDesenhosCliente = new Map();
    window.PortalBancos = { carregar: async () => {} };
    window.carregarBancosDoPortal = () => {};
    window.carregarPortal = async () => ({ pedido: { cliente: 'Cliente teste' }, entrega: {} });
    window.numeracaoTemVersoNoPortal = () => false;
    window.armarMarcaDeQueOClienteOlhou = () => {};
    window.cartaoDoQueFaltaNaArte = () => {};
    window.pedidosDeAlteracaoDoCliente = () => [];
    window.renderAmostrasOSItens = () => {
        document.getElementById('cliente-amostras-itens-container').innerHTML =
            '<button id="aprovar-modelo-teste" onclick="decisionAmostraItem(12, clienteState.osId, \'APROVADA\')">Aprovar modelo</button>';
    };
    window.artesJaAprovadas = () => ['aprovado', 'producao'].includes(seloDoStatus(clienteState.statusArte).chave);
    window.problemaDoBancoCliente = () => false;
    window.numDoItem = () => null;
    window.mensagemDaAprovacaoDeArte = () => 'Aprovação de teste';
    window.toast = msg => { window.ultimoToast = msg; };
    window.escritas = [];
    const tabelas = {
        pedidos_modelos: [{ id: 12, id_int: 123, nome_modelo: 'Modelo de teste', status_arte: 'AGUARDANDO_CLIENTE' }],
        pedidos_artes: [{ id: 'a1', id_int: 123, status: cenario.status, entrega_dados: '', observacoes: {} }]
    };
    window.supabaseClient = {
        rpc: async () => ({ data: [{ id: 'l1', os_id: 'vibe_123', status_arte: 'Enviar Arte', numero_pedido: '123' }] }),
        from(tabela) {
            let payload;
            const q = {
                select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
                update(d) { payload = d; return q; }, insert(d) { payload = d; return q; },
                then(resolve) {
                    if (payload) window.escritas.push(tabela);
                    if (tabela === 'propostas_chat' && cenario.chatTravado) {
                        return new Promise(() => {});
                    }
                    if (tabela === 'pedidos_modelos' && payload && cenario.falhaAprovacao) {
                        return Promise.resolve({ error: { message: 'gravação recusada' } }).then(resolve);
                    }
                    if (tabela === 'propostas_chat' || (cenario.falha && tabela === 'pedidos_modelos')) {
                        return Promise.resolve({ error: { message: 'recusado' } }).then(resolve);
                    }
                    if (payload) tabelas[tabela].forEach(r => Object.assign(r, payload));
                    return Promise.resolve({ data: tabelas[tabela] || [] }).then(resolve);
                }
            };
            return q;
        }
    };
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const erros = [];
        page.on('pageerror', e => { erros.push(e.message); console.error('Página: ' + e.message); });
        let cenario = { falha: true, status: 'Apr Parcial' };
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.isNavigationRequest() && req.url().startsWith('http://portal.test/cliente/')) {
                const corpo = html.replace('</head>', '<style>' + estilo + '</style></head>')
                    .replace('</body>', '<script>(' + preparar.toString() + ')(' + JSON.stringify(cenario) + ');\n'
                        + ler('cliente-shell.js') + '\n' + codigo
                        + '\ninitClientePage("123", "sintetico").then(() => { window.testePronto = true; });</script></body>');
                req.respond({ status: 200, contentType: 'text/html', body: corpo });
            } else req.abort();
        });
        await page.goto('http://portal.test/cliente/123-sintetico#arte');
        await page.waitForFunction(() => window.testePronto === true);
        assert.equal(await page.$eval('#cliente-content', e => getComputedStyle(e).display), 'none');
        assert.match(await page.$eval('#cliente-error', e => e.textContent), /Tentar novamente/);
        cenario = { falha: false, status: 'Apr Parcial' };
        await Promise.all([page.waitForNavigation(), page.click('#cliente-error button')]);
        await page.waitForFunction(() => window.testePronto === true);
        assert.equal(await page.$eval('#portal-selo', e => e.textContent), 'Aprovação parcial');
        assert.equal(await page.$eval('#cliente-aviso-chat', e => getComputedStyle(e).display), 'none');
        await page.click('#btn-cliente-aprovar-tudo');
        await page.waitForSelector('#portal-artes-aprovadas[open]');
        assert.equal(await page.evaluate(() => location.hash), '#arte');
        assert.match(await page.$eval('#portal-artes-aprovadas', e => e.textContent), /Falta a aprovação dos dados de entrega/);
        await page.click('#portal-artes-aprovadas button');
        await page.waitForFunction(() => window.location.hash === '#entrega');
        assert.match(await page.$eval('#cliente-aviso-chat', e => e.textContent), /Não é necessário aprovar novamente/);
        assert.notEqual(await page.$eval('#cliente-aviso-chat', e => getComputedStyle(e).display), 'none');
        assert.equal(await page.evaluate(() => escritas.filter(t => t === 'propostas_chat').length), 1);
        await page.click('[data-abre="orcamento"]');
        assert.equal(await page.$eval('#cliente-aviso-chat', e => e.hidden), false);
        await page.goBack();
        await page.waitForFunction(() => window.location.hash === '#entrega');
        // Após F5 o espelho do link ainda diz Enviar Arte. A linha consolidada já mudou.
        cenario.status = 'Dados Pendentes';
        await page.reload();
        await page.waitForFunction(() => window.testePronto === true);
        assert.equal(await page.evaluate(() => window.location.hash), '#entrega');
        assert.match(await page.$eval('#portal-selo', e => e.textContent), /dados pendentes/);
        await page.click('[data-abre="arte"]');
        assert.equal(await page.$eval('#portal-aviso-arte h2', e => e.textContent), 'Artes aprovadas');
        assert.equal(await page.evaluate(() => escritas.length), 0, 'reabertura não escreve decisões');
        cenario.status = 'Corrigir Dados';
        await page.reload();
        await page.waitForFunction(() => window.testePronto === true);
        assert.equal(await page.$eval('#portal-selo', e => e.textContent), 'Corrigir dados');
        assert.equal(await page.$eval('#portal-aviso-arte h2', e => e.textContent), 'Dados em correção');
        for (const individual of [false, true]) {
            cenario = { status: 'Em Aprovação', chatTravado: true };
            await page.goto('http://portal.test/cliente/123-sintetico?individual=' + individual + '#arte');
            await page.waitForFunction(() => window.testePronto === true);
            await page.click(individual ? '#aprovar-modelo-teste' : '#btn-cliente-aprovar-tudo');
            await page.waitForSelector('#portal-artes-aprovadas[open]', { timeout: 5000 });
            assert.equal(await page.evaluate(() => location.hash), '#arte');
            const escritasAntes = await page.evaluate(() => escritas.length);
            await page.click('#portal-artes-aprovadas button');
            await page.waitForFunction(() => location.hash === '#entrega', { timeout: 5000 });
            assert.equal(await page.evaluate(() => escritas.length), escritasAntes, 'confirmar popup só navega');
            assert.equal(await page.evaluate(() => state.osItens[clienteState.osId][0].amostra_status), 'APROVADA');
            assert.equal(await page.evaluate(() => !!state.portalGravandoArte), false);
            assert.equal(await page.evaluate(() => escritas.filter(t => t === 'propostas_chat').length), individual ? 2 : 1);
        }
        cenario = { status: 'Em Aprovação', falhaAprovacao: true };
        await page.goto('http://portal.test/cliente/123-sintetico?falhaAprovacao=true#arte');
        await page.waitForFunction(() => window.testePronto === true);
        await page.click('#aprovar-modelo-teste');
        await page.waitForFunction(() => !!window.ultimoToast);
        assert.equal(await page.evaluate(() => location.hash), '#arte', 'aprovação recusada não avança');
        assert.equal(await page.evaluate(() => escritas.filter(t => t === 'propostas_chat').length), 0);
        assert.equal(await page.$('#portal-artes-aprovadas'), null, 'erro não mostra sucesso');
        for (const largura of [390, 1280]) {
            await page.setViewport({ width: largura, height: 844 });
            for (const entrega of [null, true, false]) {
                await page.evaluate(entrega => {
                    window.portalConfirmacoes = { entrega, faturamento: null };
                    mostrarProximaEtapaAposArte();
                }, entrega);
                assert.equal(await page.$eval('#portal-artes-aprovadas button', e => e === document.activeElement), true);
                assert.equal(await page.$eval('#portal-artes-aprovadas', e => e.getBoundingClientRect().width <= innerWidth), true);
                await page.keyboard.press('Enter');
                assert.equal(await page.evaluate(() => location.hash), entrega === null ? '#entrega' : '#faturamento');
            }
        }
        await page.evaluate(() => {
            window.portalConfirmacoes = { entrega: true, faturamento: true };
            mostrarProximaEtapaAposArte();
        });
        assert.equal(await page.$eval('#portal-artes-aprovadas button', e => e.textContent), 'Revisar e finalizar');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('portal-artes-aprovadas'));
        assert.deepEqual(erros, []);
        console.log('OK: celular, carga, abas/F5, aprovação individual e geral com chat travado; erro de aprovação não avança.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
