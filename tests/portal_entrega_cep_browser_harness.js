// DOM e cliques reais; todas as consultas/gravações são simuladas.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.resolve(__dirname, '..');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => /^(data:|about:)/.test(r.url()) ? r.continue() : r.abort());
        await page.setViewport({ width: 390, height: 844 });
        await page.setContent('<html lang="pt-BR"><body><main id="secao-entrega" style="max-width:650px;margin:auto"></main></body></html>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(raiz,'frontend/style.css'),'utf8').replace(/^@import[^\r\n]*$/gm, '') });
        await page.evaluate(() => {
            window.portalDados = { endereco: null, cliente: null, pedido: { frete_escolhido: 'PAC' } };
            window.clienteState = { numero: '123', token: 'teste', pedidoFinalizado: false };
            window.state = {};
            window.SECOES = ['entrega','faturamento'];
            window.escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
            window.tipoDaPessoa = () => 'juridica';
            window.ehRetirada = () => false;
            window.redesenharSecao = qual => {
                if (qual === 'entrega') document.getElementById('secao-entrega').innerHTML = formularioEnderecoEntrega() + cartaoDeDecisao('entrega');
            };
            window.atualizarPainelDoPedido = () => {};
            window.abrirSecao = qual => { window.avancou = qual; };
            window.gravarCorrecaoDoCliente = async () => ({ ok: true });
            window.fetch = async () => ({ ok: true, json: async () => ({ cep: '01001-000', logradouro: 'Rua de teste', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' }) });
            window.supabaseClient = { rpc: async (nome, args) => ({ data: { ok: true, numero: '123', endereco: { ...args.p_endereco, do_cadastro: false } } }) };
        });
        for (const name of ['cliente-confirmacoes.js','cliente-entrega-form.js'])
            await page.addScriptTag({ content: fs.readFileSync(path.join(raiz,'frontend',name),'utf8') });
        await page.evaluate(() => redesenharSecao('entrega'));
        assert.equal(await page.$eval('#entrega-cep', e => e.matches(':disabled')), true);
        assert.equal(await page.$('[onclick="buscarCepEntrega()"]'), null);
        await page.click('[onclick="decidirDados(\'entrega\', false)"]');
        await page.waitForFunction(() => !document.getElementById('entrega-cep').matches(':disabled'));
        await page.type('#entrega-recebedor', 'Pessoa Teste');
        await page.type('#entrega-cpf_recebedor', '52998224725');
        await page.type('#entrega-cep', '01001000');
        await page.click('[onclick="buscarCepEntrega()"]');
        await page.waitForFunction(() => document.getElementById('entrega-cidade').value === 'São Paulo');
        await page.type('#entrega-numero','25');
        await page.type('#entrega-complemento','Portaria');
        assert.equal(await page.$eval('#entrega-recebedor', e => e.value), 'Pessoa Teste');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sem rolagem horizontal no celular');
        await page.click('[onclick="decidirDados(\'entrega\', true)"]');
        await page.waitForFunction(() => window.avancou === 'faturamento');
        assert.equal(await page.evaluate(() => portalDados.endereco.numero), '25');
        assert.equal(await page.$eval('#entrega-recebedor', e => e.matches(':disabled')), true);
        assert.deepEqual(erros, []);
        console.log('OK: navegador móvel — preencher, consultar CEP, salvar, confirmar e avançar.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
