// Portal real com dados sinteticos, sem carregar APIs nem inicializar o pedido.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(raiz, 'frontend/cliente.js'), 'utf8');
function funcao(nome) {
    const inicio = fonte.indexOf('\nfunction ' + nome + '(');
    assert(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => request.url().startsWith('data:') ? request.continue() : request.abort());
        await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div class="cliente-page"><div class="cliente-container"><div id="cliente-amostras-itens-container"></div></div></div></body></html>');
        for (const nome of ['style.css', 'cliente-modelo.css']) {
            await page.addStyleTag({ content: fs.readFileSync(path.join(raiz, 'frontend', nome), 'utf8').replace(/^@import[^\r\n]+/gm, '') });
        }
        await page.addScriptTag({ content: ['escapeHtml', 'ehArquivoPdf', 'temArteVisivel', 'cabecalhoModeloCliente', 'blocoDeArteDoCliente', 'renderAmostrasOSItens'].map(funcao).join('\n') });
        await page.evaluate(() => {
            window.temCsvVariavel = () => false;
            window.desenharContadorDeModelos = () => {};
            window.renderItemAmostraCombinada = () => {};
            window.atualizarBarraFinalCliente = () => {};
            window.state = { ordens: [{ id: 'teste', numero: 'DEMO' }], osItens: {}, cores: [], numeracoes: [], amostrasContainerId: 'cliente-amostras-itens-container' };
            window.modelo = { id: 'modelo-demo', nome_modelo: 'Pista — Lote 1', nome_produto_real: 'Ingresso personalizado', quantidade: 1000, num_inicial: '0001', num_final: '1000', amostra_arte_base64: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="620" height="200"><rect width="620" height="200" fill="#f6e8ab"/><text x="28" y="85" font-size="30">ARTE DEMONSTRATIVA</text><text x="28" y="150" font-size="22">Pista — Lote 1 · Nº 0001</text></svg>') };
            window.mostrar = (item = window.modelo, leitura = false) => {
                state.osItens.teste = [item];
                state.arteSomenteLeitura = leitura;
                renderAmostrasOSItens('teste');
            };
            state.cores = [{ id: 'cor-amarela', name: 'Amarela' }];
            modelo.amostra_cor_id = 'cor-amarela';
            mostrar();
        });
        for (const width of [1100, 390, 320]) {
            await page.setViewport({ width, height: 760 });
            const layout = await page.evaluate(() => {
                const nome = document.querySelector('.amostra-modelo-nome-linha');
                const dados = document.querySelector('.amostra-modelo-dados');
                const arte = document.querySelector('.amostra-modelo-arte');
                return {
                    duasLinhas: nome.getBoundingClientRect().bottom <= dados.getBoundingClientRect().top && dados.getBoundingClientRect().bottom <= arte.getBoundingClientRect().top,
                    alturas: [...dados.children].map(el => el.getBoundingClientRect().top),
                    paginaSemVazamento: document.documentElement.scrollWidth <= innerWidth,
                    nomes: document.querySelectorAll('.amostra-modelo-nome').length,
                    cabecalhoDentro: !!document.querySelector('.amostra-preview-container .amostra-modelo-info'),
                    botoes: document.querySelectorAll('.amostra-decisao-cliente button').length,
                    texto: dados.textContent,
                };
            });
            assert(layout.duasLinhas && layout.paginaSemVazamento && layout.cabecalhoDentro, JSON.stringify({ width, layout }));
            assert.equal(new Set(layout.alturas).size, 1);
            assert.equal(layout.nomes, 1);
            assert.equal(layout.botoes, 2);
            assert.match(layout.texto, /NI: 0001/);
            assert.match(layout.texto, /NF: 1000/);
            assert.match(layout.texto, /Cor: Amarela/);
            if (process.env.MODELO_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.MODELO_SCREENSHOTS, `cliente-modelo-${width}.png`), fullPage: true });
        }
        await page.evaluate(() => mostrar({ ...modelo, quantidade: 0, num_inicial: 0, num_final: 0, verso: true, verso_amostra_arte_base64: modelo.amostra_arte_base64 }));
        let texto = await page.$eval('.amostra-modelo-dados', el => el.textContent);
        assert.match(texto, /Qtd: 0/);
        assert.match(texto, /NI: 0/);
        assert.match(texto, /NF: 0/);
        assert.match(texto, /Frente e verso/);
        assert(await page.$('#amostra-item-img-verso-0'));
        await page.evaluate(() => mostrar({ ...modelo, nome_modelo: '<img src=x onerror=alert(1)>', num_inicial: null, num_final: undefined, numeracao_inicio: '0100', numeracao_fim: '0199' }, true));
        assert.equal(await page.$('.amostra-modelo-nome img'), null);
        assert.equal(await page.$('.amostra-decisao-cliente'), null);
        texto = await page.$eval('.amostra-modelo-dados', el => el.textContent);
        assert.match(texto, /NI: 0100/);
        assert.match(texto, /NF: 0199/);
        await page.evaluate(() => mostrar({ ...modelo, num_inicial: null, num_final: null }));
        texto = await page.$eval('.amostra-modelo-dados', el => el.textContent);
        assert.match(texto, /NI: --/);
        assert.match(texto, /NF: --/);
        await page.evaluate(() => mostrar({ ...modelo, amostra_cor_id: null, padrao: 'Azul especial' }));
        texto = await page.$eval('.amostra-modelo-dados', el => el.textContent);
        assert.match(texto, /Cor: Azul especial/);
        await page.evaluate(() => mostrar({ ...modelo, amostra_cor_id: null, padrao: '' }));
        texto = await page.$eval('.amostra-modelo-dados', el => el.textContent);
        assert.match(texto, /Cor: --/);
        await page.evaluate(() => mostrar({ ...modelo, amostra_cor_id: null, padrao: '<img src=x onerror=alert(1)>' }));
        assert.equal(await page.$('.amostra-modelo-dados img'), null);
        console.log('OK: layout em 1100/390/320px, cor do catalogo, cor pelo padrao, cor ausente, valores salvos, zeros, ausencia de numeracao, escape, verso e modo leitura.');
    } finally {
        await browser.close();
    }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
