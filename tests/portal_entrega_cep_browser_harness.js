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
            window.portalDados = { endereco: null, cliente: null, pedido: { frete_escolhido: 'PAC' }, enderecos_entrega: [
                { tipo_endereco: 'PRINCIPAL', recebedor: 'Pessoa Cadastrada', cpf_recebedor: '52998224725',
                  cep: '01001000', endereco: 'Rua Cadastrada', numero: '80', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' }
            ] };
            window.clienteState = { numero: '123', token: 'teste', pedidoFinalizado: false };
            window.state = {};
            window.SECOES = ['entrega','faturamento'];
            window.escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
            window.documentoEmMascara = documento => {
                const d = String(documento || '').replace(/\D/g, '');
                if (d.length === 11) return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
                if (d.length === 14) return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12);
                return String(documento || '').trim();
            };
            window.tipoDaPessoa = () => 'juridica';
            window.cepEmMascara = valor => String(valor || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
            window.ehRetirada = () => false;
            window.redesenharSecao = qual => {
                if (qual === 'entrega') document.getElementById('secao-entrega').innerHTML = formularioEnderecoEntrega() + cartaoDeDecisaoEntrega();
            };
            window.atualizarPainelDoPedido = () => {};
            window.abrirSecao = qual => { window.avancou = qual; };
            window.gravarCorrecaoDoCliente = async () => ({ ok: true });
            window.fetch = async url => ({ ok: true, json: async () => String(url).includes('/cnpj/')
                ? { cnpj: '11222333000181', razao_social: 'Empresa Oficial', cep: '01310930',
                    logradouro: 'Avenida Paulista', numero: '100', complemento: 'Conjunto 10',
                    bairro: 'Bela Vista', municipio: 'São Paulo', uf: 'SP' }
                : { cep: '01001-000', logradouro: 'Rua de teste', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' } });
            window.supabaseClient = { rpc: async (nome, args) => ({ data: { ok: true, numero: '123', endereco: { ...args.p_endereco, do_cadastro: false } } }) };
        });
        for (const name of ['cliente-confirmacoes.js','cliente-entrega-form.js'])
            await page.addScriptTag({ content: fs.readFileSync(path.join(raiz,'frontend',name),'utf8') });
        await page.evaluate(() => redesenharSecao('entrega'));
        assert.equal(await page.$('#entrega-cep'), null, 'endereço principal não usa campos editáveis');
        assert.equal(await page.$('[onclick="buscarCepEntrega()"]'), null);
        assert.ok((await page.$eval('#secao-entrega', e => e.textContent)).includes('Meus Endereços'));
        assert.ok(!(await page.$eval('#secao-entrega', e => e.textContent)).includes('Alterar'));
        await page.click('[onclick="abrirEnderecosEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open);
        const enderecoCadastrado = await page.$eval('.portal-endereco-opcao', e => e.textContent);
        assert.ok(enderecoCadastrado.includes('Rua Cadastrada, 80'));
        assert.ok(enderecoCadastrado.includes('Pessoa Cadastrada'));
        assert.ok(enderecoCadastrado.includes('529.982.247-25'));
        await page.click('[onclick="selecionarEnderecoEntrega(0)"]');
        await page.waitForFunction(() => document.getElementById('secao-entrega').textContent.includes('Rua Cadastrada, 80'));
        assert.equal(await page.$('#entrega-endereco'), null);
        await page.click('[onclick="abrirEnderecosEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open);
        await page.click('[onclick="informarOutroEnderecoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open
            && document.getElementById('entrega-cpf_recebedor'));
        await page.type('#entrega-recebedor', 'Pessoa Teste');
        await page.type('#entrega-cpf_recebedor', '52998224725');
        assert.equal(await page.$('#entrega-cep'), null, 'CEP só aparece depois do documento válido');
        await page.click('[onclick="continuarDocumentoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open
            && document.getElementById('entrega-cep'));
        await page.type('#entrega-cep', '01001000');
        await page.click('[onclick="buscarCepEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open
            && document.getElementById('entrega-cidade').value === 'São Paulo');
        await page.type('#entrega-numero','25');
        await page.type('#entrega-complemento','Portaria');
        assert.equal(await page.$eval('#entrega-recebedor', e => e.value), 'Pessoa Teste');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'sem rolagem horizontal no celular');
        await page.click('[onclick="usarNovoEnderecoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('secao-entrega').textContent.includes('Rua de teste, 25'));
        assert.equal(await page.$('#entrega-recebedor'), null, 'novo endereço volta como apresentação somente leitura');

        await page.click('[onclick="abrirEnderecosEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open);
        await page.click('[onclick="informarOutroEnderecoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open
            && document.getElementById('entrega-cpf_recebedor'));
        await page.type('#entrega-cpf_recebedor', '11222333000181');
        await page.click('[onclick="continuarDocumentoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('portal-modal-enderecos').open
            && document.getElementById('portal-modal-enderecos').textContent.includes('Avenida Paulista, 100'));
        assert.equal(await page.$('#entrega-endereco'), null, 'endereço do CNPJ não tem campo editável');
        assert.ok((await page.$eval('#portal-modal-enderecos', e => e.textContent)).includes('não pode ser editado'));
        await page.evaluate(() => editarCampoEntrega('endereco', 'Endereço adulterado'));
        assert.equal(await page.evaluate(() => dadosDoFormularioEntrega().valores.endereco), 'Avenida Paulista');
        await page.click('[onclick="usarNovoEnderecoEntrega()"]');
        await page.waitForFunction(() => document.getElementById('secao-entrega').textContent.includes('Avenida Paulista, 100'));
        await page.click('[onclick="decidirDados(\'entrega\', true)"]');
        await page.waitForFunction(() => window.avancou === 'faturamento');
        assert.equal(await page.evaluate(() => portalDados.endereco.numero), '100');
        assert.equal(await page.$('#entrega-recebedor'), null);
        assert.deepEqual(erros, []);
        console.log('OK: navegador móvel — preencher, consultar CEP, salvar, confirmar e avançar.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
