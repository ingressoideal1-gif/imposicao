// Popup real, sem acesso a banco ou agente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const start = source.indexOf('async function devolverArteParaAlteracao(');
const fn = source.slice(start, source.indexOf('window.devolverArteParaAlteracao =', start));
const escapeStart = source.indexOf('function escapeHtml(');
const escapeFn = source.slice(escapeStart, source.indexOf('\n}', escapeStart) + 2);
const textareaStart = source.indexOf('<textarea id="amostra-obs-${item.id}"');
const textarea = source.slice(textareaStart, source.indexOf('</textarea>', textareaStart) + 11);

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<button id="corrigir">Corrigir Arte</button>');
        await page.evaluate(fn => {
            window.STATUS_CORRIGIR_ARTE = 'Corrigir Arte';
            window.normalizarStatusImpressao = value => value;
            window.toast = () => {};
            window.sincronizarStatusConsolidadoPedidoArte = async () => {};
            window.vibeClient = { from() { return {
                update(payload) { window.gravacoes.push(payload); this.payload = payload; return this; },
                eq() { return this; },
                select() { return Promise.resolve({ data: [{ id: 11, ...this.payload }] }); }
            }; } };
            window.devolver = new Function(fn + '\nreturn devolverArteParaAlteracao;')();
            document.getElementById('corrigir').onclick = async () => {
                window.resultado = await window.devolver(11, 'vibe_1');
            };
        }, fn);
        for (const texto of [null, '   ', 'Corrigir nome <VIP> & data </textarea><b id="injetado">texto</b>']) {
            await page.evaluate(() => {
                window.state = { osItens: { vibe_1: [{ id: 11, status_impressao: 'Aguardando',
                    amostra_obs: 'Anotacao anterior' }] }, modelosGlobais: { 1: [{ id: 11 }] } };
                window.gravacoes = [];
                window.resultado = null;
            });
            const dialogo = new Promise((resolve, reject) => page.once('dialog', async dialog => {
                try {
                    assert.equal(dialog.type(), 'prompt');
                    assert.match(dialog.message(), /correção desejada/);
                    assert.equal(dialog.defaultValue(), 'Anotacao anterior');
                    if (texto === null) await dialog.dismiss();
                    else await dialog.accept(texto);
                    resolve();
                } catch (e) { reject(e); }
            }));
            await Promise.all([page.click('#corrigir'), dialogo]);
            await page.waitForFunction(() => window.resultado !== null);
            const result = await page.evaluate(() => ({ ok: window.resultado,
                writes: window.gravacoes, item: window.state.osItens.vibe_1[0] }));
            if (!texto || !texto.trim()) {
                assert.equal(result.ok, false);
                assert.equal(result.writes.length, 0);
                assert.equal(result.item.status_impressao, 'Aguardando');
                assert.equal(result.item.amostra_obs, 'Anotacao anterior');
            } else {
                assert.equal(result.ok, true);
                assert.equal(result.writes.length, 1);
                assert.equal(result.writes[0].observacao_arte, texto);
                assert.equal(result.item.amostra_obs, texto);
                // Usa o proprio template do box, incluindo o escape de texto.
                const exibido = await page.evaluate(({ textarea, escapeFn }) => {
                    const render = new Function('item', 'osId', 'obs',
                        escapeFn + '\nreturn `' + textarea + '`;');
                    const item = window.state.osItens.vibe_1[0];
                    document.body.insertAdjacentHTML('beforeend', render(item, 'vibe_1', item.amostra_obs));
                    return { texto: document.getElementById('amostra-obs-11').value,
                        injetado: !!document.getElementById('injetado') };
                }, { textarea, escapeFn });
                assert.equal(exibido.texto, texto);
                assert.equal(exibido.injetado, false);
            }
        }
        console.log('OK: popup real, cancelar, vazio, confirmacao e texto seguro no box de alteracao.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
