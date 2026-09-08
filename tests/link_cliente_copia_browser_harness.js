// Clique e seleção reais no Chrome; página sintética, sem credenciais ou APIs externas.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const fonte = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    const inicio = fonte.search(new RegExp('(?:async )?function ' + nome + '\\('));
    assert.ok(inicio >= 0);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
const servidor = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><button id="copiar" onclick="gerarLinkCliente(\'vibe_987654\', \'987654\', false, this)">Copiar Link</button>');
});

(async () => {
    let browser;
    try {
        await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
        const origem = 'http://127.0.0.1:' + servidor.address().port;
        browser = await puppeteer.launch({ headless: true });
        const pagina = await browser.newPage();
        await pagina.setRequestInterception(true);
        pagina.on('request', req => req.url().startsWith(origem + '/') ? req.continue() : req.abort());
        await pagina.goto(origem, { waitUntil: 'domcontentloaded' });
        await pagina.addScriptTag({ content: `
            const state = { ordens: [] };
            const supabaseClient = {};
            const CLIENTE_BASE_URL = window.location.origin;
            const linksClienteEmAndamento = new Set();
            window.avisos = []; window.popups = 0;
            function toast(texto, tipo) { avisos.push({ texto, tipo }); }
            function _mostrarIconeEmailNaLinha() { window.popups++; }
            async function buscarLinkClienteAtivo() {
                await new Promise(resolve => setTimeout(resolve, 30));
                return { os_id: 'vibe_987654', numero_pedido: '987654', token: 'abc123', ativo: true };
            }
            async function prepararLinkDaArtePronta() { throw new Error('Cópia não deve preparar arte'); }
            ${extrair('memorizarLinkCliente')}
            ${extrair('copiarTextoDoLinkCliente')}
            ${extrair('gerarLinkCliente')}
        ` });

        // Exercitar DOM/foco/seleção de verdade; o evento de cópia captura só
        // o texto sintético, sem ler nem alterar a área de transferência do usuário.
        await pagina.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
                writeText: async () => { throw new DOMException('Teste', 'NotAllowedError'); }
            } });
            document.addEventListener('copy', evento => {
                const campo = document.activeElement;
                window.textoSelecionado = campo.value.slice(campo.selectionStart, campo.selectionEnd);
                evento.preventDefault();
            });
        });
        await pagina.click('#copiar');
        await pagina.waitForFunction(() => window.popups === 1);
        assert.equal(await pagina.evaluate(() => window.textoSelecionado), origem + '/cliente/987654-abc123');
        assert.equal(await pagina.$eval('#copiar', b => b.disabled), false);
        assert.equal(await pagina.evaluate(() => document.activeElement.id), 'copiar');
        assert.equal(await pagina.$$eval('textarea', campos => campos.length), 0);

        // Bloqueio completo: a janela manual contém a URL inteira e o botão
        // volta a funcionar depois de fechar; nenhum aviso falso de sucesso.
        await pagina.evaluate(() => {
            document.execCommand = () => false;
            window.avisos = []; window.popups = 0;
        });
        const dialogo = new Promise(resolve => pagina.once('dialog', async d => {
            const valor = d.defaultValue();
            await d.dismiss();
            resolve(valor);
        }));
        await pagina.click('#copiar');
        assert.equal(await dialogo, origem + '/cliente/987654-abc123');
        await pagina.waitForFunction(() => !document.getElementById('copiar').disabled);
        assert.equal(await pagina.evaluate(() => avisos.some(a => a.tipo === 'success')), false);
        assert.equal(await pagina.evaluate(() => window.popups), 0);
        console.log('OK: Chrome confirmou seleção, foco, cópia manual e recuperação do botão.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => servidor.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
