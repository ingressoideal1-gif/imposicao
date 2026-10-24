const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const XLSX = require('../frontend/vendor/sheetjs-0.20.3/xlsx.full.min.js');
(async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Nome'], ['<img src=x onerror=alert(1)>']]), 'Primeira');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Código'], ['0007']]), 'Segunda');
    const bytes = Array.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<body></body>');
        await page.addScriptTag({ path: path.resolve(__dirname, '../frontend/vendor/sheetjs-0.20.3/xlsx.full.min.js') });
        await page.addScriptTag({ path: path.resolve(__dirname, '../frontend/banco-excel.js') });
        await page.evaluate(bytes => {
            window.toast = text => { throw new Error(text); };
            window.salvos = [];
            HTMLInputElement.prototype.click = function () {
                if (this.type !== 'file') return;
                const dt = new DataTransfer();
                dt.items.add(new File([new Uint8Array(bytes)], 'pessoas.xlsx'));
                this.files = dt.files;
                this.dispatchEvent(new Event('change'));
            };
            window.BancoExcel.abrir(async data => {
                window.salvos.push(data);
                if (window.salvos.length === 1) throw new Error('Falha simulada');
                await new Promise(resolve => setTimeout(resolve, 200));
            });
        }, bytes);
        await page.waitForSelector('dialog[open]');
        assert.equal(await page.$eval('table', el => el.textContent.includes('<img')), true);
        assert.equal(await page.$('table img'), null);
        assert.equal(await page.evaluate(() => salvos.length), 0);
        await page.select('dialog select', 'Segunda');
        await page.click('dialog .btn-primary');
        await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Falha simulada'));
        assert.equal(await page.$eval('dialog .btn-primary', el => el.disabled), false);
        await page.click('dialog .btn-primary');
        assert.equal(await page.$eval('dialog .btn-primary', el => el.disabled), true);
        await page.waitForFunction(() => !document.querySelector('dialog'));
        const data = await page.evaluate(() => salvos);
        assert.equal(data.length, 2);
        assert.deepEqual(data[1].rows, [{ Código: '0007' }]);
        assert.equal(data[1].nome, 'pessoas - Segunda');
        // Estacao antiga: somente script.js sincronizado; ambos os novos
        // arquivos devem vir da origem web, sem acessar servicos reais.
        const station = await browser.newPage();
        const requests = [];
        await station.setRequestInterception(true);
        station.on('request', request => {
            const url = new URL(request.url());
            requests.push(url.href);
            const file = url.pathname === '/banco-excel.js' ? 'banco-excel.js'
                : url.pathname === '/vendor/sheetjs-0.20.3/xlsx.full.min.js' ? 'vendor/sheetjs-0.20.3/xlsx.full.min.js' : null;
            request.respond({ status: 200, contentType: file ? 'application/javascript' : 'text/html',
                body: file ? fs.readFileSync(path.resolve(__dirname, '../frontend', file)) : '<body></body>' });
        });
        await station.goto('http://127.0.0.1:9001/');
        const source = fs.readFileSync(path.resolve(__dirname, '../frontend/script.js'), 'utf8');
        await station.addScriptTag({ content: source.slice(source.indexOf('async function carregarImportadorExcel('), source.indexOf('\nwindow.importarExcelDoPedido')) });
        await station.evaluate(bytes => {
            window.avisos = [];
            window.toast = (text, type) => avisos.push({ text, type });
            window.idIntDoPedido = () => 123;
            window.criarBancoDoPedido = async () => ({ nome: 'Teste' });
            window.renderAmostrasOSItens = () => {};
            HTMLInputElement.prototype.click = function () {
                if (this.type !== 'file') return;
                const dt = new DataTransfer();
                dt.items.add(new File([new Uint8Array(bytes)], 'pessoas.xlsx'));
                this.files = dt.files;
                this.dispatchEvent(new Event('change'));
            };
            return importarExcelDoPedido('os-123');
        }, bytes);
        await station.waitForSelector('dialog[open]');
        assert.ok(requests.some(url => url.startsWith('https://imposition.ai-ideal.com.br/banco-excel.js?')));
        assert.ok(requests.includes('https://imposition.ai-ideal.com.br/vendor/sheetjs-0.20.3/xlsx.full.min.js'));
        await station.click('dialog .btn-primary');
        await station.waitForFunction(() => !document.querySelector('dialog'));
        assert.equal(await station.evaluate(() => avisos.at(-1).type), 'success');
        console.log('Browser: prévia segura, escolha da aba, gravação explícita, falha e bloqueio durante envio OK.');
        console.log('Browser: estacao sem arquivos novos carrega importador e biblioteca pela origem web OK.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
