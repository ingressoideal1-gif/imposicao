const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        let chamadas = 0, falhar = false, capturas = 0, falharCaptura = false;
        let pausado = false, falharComando = false;
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().includes('/api/pacotes-locais/pausa/')) {
                if (req.method() !== 'OPTIONS' && !falharComando) pausado = req.url().endsWith('/true');
                return req.respond({ status: falharComando ? 503 : 200,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
                    contentType: 'application/json', body: JSON.stringify({ pausado }) });
            }
            if (req.url().includes('/api/pacotes-locais/entrada')) {
                if (req.method() !== 'OPTIONS') capturas++;
                return req.respond({ status: falharCaptura ? 503 : 200,
                    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
                    contentType: 'application/json', body: JSON.stringify({ recebido: true, revisao: 'teste' }) });
            }
            if (!req.url().includes('/api/pacotes-locais/estado')) return req.abort();
            chamadas++;
            return req.respond({ status: falhar ? 503 : 200,
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
                contentType: 'application/json', body: JSON.stringify({ modelos: [{ modelo: '1', revisao: 'r1',
                    estado: 'local_validado', verificado_em: '2026-09-25T22:00:00Z' }] }) });
        });
        await page.setContent('<main><div data-pacote-modelo="1" data-pacote-revisao="r1">Modelo 1</div>' +
            '<div data-pacote-modelo="1">Revisão desconhecida</div></main>');
        await page.addScriptTag({ content: fs.readFileSync('frontend/pacotes-locais.js', 'utf8') });
        assert.equal(chamadas, 0, 'piloto desativado nao consulta API');
        assert.equal(await page.$$eval('.pacote-local-selo', els => els.length), 0);
        await page.evaluate(() => PacotesLocais.iniciar({ base: 'http://127.0.0.1:9011', token: 'sintetico-piloto-browser-000000000000' }));
        await page.waitForFunction(() => document.querySelector('.pacote-local-selo')?.textContent.includes('Local validado'));
        let selos = await page.$$eval('.pacote-local-selo', els => els.map(el => el.textContent));
        assert.deepEqual(selos, ['✓ Local validado', 'Cópia local — conferir revisão']);
        await page.evaluate(() => {
            const table = document.createElement('table');
            table.innerHTML = '<tr id="ped-queue-row-1"><td title="Código do Modelo">Modelo na fila do Pedido</td></tr>';
            document.body.appendChild(table);
        });
        await page.waitForFunction(() => document.querySelector('#ped-queue-row-1 .pacote-local-selo'));
        await page.evaluate(() => { const el = document.createElement('div'); el.dataset.pacoteModelo = '2'; document.body.appendChild(el); });
        await page.waitForFunction(() => document.querySelectorAll('.pacote-local-selo').length === 4);
        await page.evaluate(() => PacotesLocais.parar());
        assert.equal(await page.$$eval('.pacote-local-selo', els => els.length), 0);
        falhar = true;
        await page.evaluate(() => PacotesLocais.iniciar({ base: 'http://127.0.0.1:9011', token: 'sintetico-piloto-browser-000000000000' }));
        await page.waitForFunction(() => document.querySelector('.pacote-local-selo')?.textContent === 'Local não verificado');
        await page.evaluate(() => PacotesLocais.parar());
        await assert.rejects(page.evaluate(() => PacotesLocais.iniciar({ base: 'https://fora.invalid', token: 'sintetico-piloto-browser-000000000000' })));
        await page.evaluate(() => {
            window.PacoteEntrada = { criar: async () => ({ manifesto: { revisao: 'teste' }, envio: new FormData() }) };
            PacotesLocais.iniciar({ base: 'http://127.0.0.1:9011', token: 'sintetico-piloto-browser-000000000000' });
            PacotesLocais.capturarEntrada(new FormData(), {});
        });
        assert.equal(capturas, 0, 'captura exige ativacao independente');
        await page.evaluate(() => {
            PacotesLocais.iniciar({ base: 'http://127.0.0.1:9011', token: 'sintetico-piloto-browser-000000000000', capturar: true, empresa: 'teste' });
            if (PacotesLocais.capturarEntrada(new FormData(), {}) !== undefined) throw Error('Captura deve ser destacada');
        });
        await page.waitForFunction(() => PacotesLocais.estadoCaptura().estado === 'recebida');
        assert.equal(capturas, 1);
        falharCaptura = true;
        await page.evaluate(() => PacotesLocais.capturarEntrada(new FormData(), {}));
        await page.waitForFunction(() => PacotesLocais.estadoCaptura().estado === 'falha');
        assert.ok(await page.$('#piloto-local-acompanhamento'));
        await page.click('#piloto-local-acompanhamento button:nth-of-type(1)');
        await page.waitForFunction(() => document.querySelector('#piloto-local-acompanhamento').textContent.includes('Preparação pausada'));
        assert.equal(pausado, true);
        await page.click('#piloto-local-acompanhamento button:nth-of-type(2)');
        await page.waitForFunction(() => !document.querySelector('#piloto-local-acompanhamento button').disabled);
        assert.equal(pausado, false);
        falharComando = true;
        await page.click('#piloto-local-acompanhamento button:nth-of-type(3)');
        await page.waitForFunction(() => document.querySelector('#piloto-local-acompanhamento').textContent.includes('não confirmou o comando'));
        assert.equal(await page.$('#piloto-local-desligado'), null, 'não alegar desligamento sem recibo');
        falharComando = false;
        await page.click('#piloto-local-acompanhamento button:nth-of-type(3)');
        await page.waitForSelector('#piloto-local-desligado');
        assert.equal(pausado, true);
        assert.equal(await page.$('#piloto-local-acompanhamento'), null);
        await page.evaluate(() => PacotesLocais.parar());
        assert.equal(await page.evaluate(() => PacotesLocais.estadoCaptura().estado), 'desativada');
        console.log('OK: selos opt-in, revisão exata, DOM dinâmico, API indisponível e desativação');
        console.log('OK: captura opcional destacada, recibo e falha sem interromper producao');
        console.log('OK: controles de pausa/retomada/desligamento e falha sem falsa confirmação');
    } finally { await browser.close(); }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
