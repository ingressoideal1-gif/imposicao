// Chromium real, servidor efêmero e dados sintéticos. Nenhum recurso externo.
// NODE_PATH pode apontar para dependências já instaladas em outro checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const ler = nome => fs.readFileSync(path.join(raiz, 'frontend', nome), 'utf8');
const script = ler('script.js');
function funcao(nome) {
    const inicio = script.indexOf('function ' + nome + '(');
    assert(inicio >= 0, nome);
    return (script.slice(inicio - 6, inicio) === 'async ' ? 'async ' : '')
        + script.slice(inicio, script.indexOf('\n}', inicio) + 2);
}
const inicioView = script.indexOf('window.showView = function(viewId) {');
const showView = script.slice(inicioView, script.indexOf('\n};', inicioView) + 3);
const views = [...new Set([...ler('index.html').matchAll(/id="(view-[a-z0-9-]+)"/g)].map(m => m[1]))];
const painel = `<!doctype html><meta charset="utf-8">
${views.map(v => `<section id="${v}" class="view-section"></section>`).join('')}
<input id="fmt-id"><input id="num-id"><input id="cor-id">
<script>
const state = { ordens: [], osItens: {}, cores: [{}], numeracoes: [{}], formatos: [] };
window._currentUser = { id: sessionStorage.getItem('usuarioTeste') || 'operador-sintetico' };
window.mensagens = []; window.modelosAbertos = []; window.desenhos = [];
window.bloqueio = null;
function podeAbrirView(view) { return view !== sessionStorage.getItem('telaNegada'); }
function avisarFaltaPermissao() {}
function ativarBotaoDoMenu() {}
function toast(t) { mensagens.push(t); }
function renderOrdens() {}
function renderImpOSQueue() {}
function renderPedOSQueue() {}
function drawPedPreview() {}
function pintarTituloDaTelaDePedido() {}
function renderAmostrasOSItens(id) { desenhos.push(id); }
function loadCatalogoFontes() { return Promise.resolve(); }
function renderCatFontesUI() {}
async function loadOrdens() {
    state.ordens = ['101', '102'].map(numero => ({ id: 'vibe_' + numero, numero }));
}
async function loadOSItens(id) {
    if (window.bloqueio) await window.bloqueio;
    state.osItens[id] = sessionStorage.getItem('semModelo') ? [] : [{ id: 'modelo-1' }];
}
async function recarregarNumeracoesDoPedido() {}
async function loadAll() { NavegacaoPainel.dadosProntos(); }
function fecharJanelaDoModelo() { state.activeOSItem = null; }
function cancelNumEdit() { document.getElementById('num-id').value = ''; window.customNumeracaoEditState = null; }
async function enviarParaPedido(itemId, osId, contexto) {
    if (!contexto.aindaAtual()) return;
    if (!contexto.restaurandoNavegacao) throw Error('Restauração sem proteção');
    modelosAbertos.push({ itemId, osId });
    state.activeOSItem = { itemId, osId };
    NavegacaoPainel.exibir('view-pedido', contexto.aindaAtual);
}
${funcao('findOSInState')}
${funcao('getOSItens')}
${funcao('pedidoDoLinkDireto')}
${funcao('navigateToAmostrasFromOS')}
${showView}
</script><script>${ler('navegacao-painel.js')}</script><script>
function iniciarTeste() {
    NavegacaoPainel.iniciar('view-lista-impressao');
    NavegacaoPainel.dadosProntos();
}
if (!sessionStorage.getItem('aguardarLogin')) iniciarTeste();
</script>`;
const portal = `<!doctype html><meta charset="utf-8">
<nav id="portal-abas">${['arte', 'entrega', 'faturamento', 'orcamento', 'pagamento'].map(s =>
    `<button class="portal-aba" data-abre="${s}">${s}</button>`).join('')}</nav>
${['arte', 'entrega', 'faturamento', 'orcamento', 'pagamento'].map(s => `<section id="secao-${s}"></section>`).join('')}
<script>${ler('cliente-shell.js')}</script><script>
// Regra de negócio simulada: uma primeira visita à arte avança ao orçamento.
secaoDeAbertura = (_status, inicial) => inicial === 'arte' ? 'orcamento' : inicial;
atualizarPainelDoPedido = () => {};
montarPortal('APROVADO');
</script>`;
let total = 0;
async function caso(nome, fn) { await fn(); total++; console.log('OK: ' + nome); }
(async () => {
    const servidor = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(req.url.startsWith('/cliente/') ? portal : painel);
    });
    await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
    const origem = 'http://127.0.0.1:' + servidor.address().port;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const erros = [];
        const nova = async () => {
            const page = await browser.newPage();
            page.on('pageerror', e => erros.push(e.message));
            await page.setRequestInterception(true);
            page.on('request', req => req.url().startsWith(origem + '/') ? req.continue() : req.abort());
            return page;
        };
        const page = await nova();
        const ativa = (view, p = page) => p.waitForFunction(v => document.querySelector('.view-section.active')?.id === v, {}, view);
        const ir = view => page.evaluate(v => showView(v), view);
        await caso('F5 mantém a tela e o endereço completo', async () => {
            await page.goto(origem + '/?offline=true#ancora-existente');
            await ativa('view-lista-impressao');
            await ir('view-catalogo');
            await page.reload();
            await ativa('view-catalogo');
            assert.equal(page.url(), origem + '/?offline=true#ancora-existente');
        });
        await caso('Voltar e Avançar percorrem telas sem criar entradas extras', async () => {
            const antes = await page.evaluate(() => history.length);
            await ir('view-lista-arte');
            await ir('view-lista-arte');
            assert.equal(await page.evaluate(() => history.length), antes + 1);
            await page.goBack(); await ativa('view-catalogo');
            await page.goForward(); await ativa('view-lista-arte');
            assert.equal(await page.evaluate(() => history.length), antes + 1);
        });
        await caso('Dois pedidos na mesma tela têm histórico próprio e sobrevivem ao F5', async () => {
            await page.evaluate(() => navigateToAmostrasFromOS('101'));
            await page.evaluate(() => navigateToAmostrasFromOS('102'));
            await page.goBack();
            await page.waitForFunction(() => state.amostrasOSAtivo === 'vibe_101');
            await page.reload(); await ativa('view-amostras');
            await page.waitForFunction(() => state.amostrasOSAtivo === 'vibe_101');
        });
        await caso('Link direto abre o pedido e não sequestra outra tela após F5', async () => {
            await page.goto(origem + '/pedido/102');
            await page.waitForFunction(() => state.amostrasOSAtivo === 'vibe_102');
            await ir('view-catalogo');
            await page.reload(); await ativa('view-catalogo');
            assert.equal(page.url(), origem + '/pedido/102');
        });
        await caso('Uma nova visita pelo link continua abrindo o pedido', async () => {
            const outra = await nova();
            await outra.goto(origem + '/pedido/102');
            await outra.waitForFunction(() => state.amostrasOSAtivo === 'vibe_102');
            await outra.close();
        });
        await caso('Resposta atrasada não reabre pedido abandonado', async () => {
            await page.evaluate(() => {
                window.bloqueio = new Promise(r => { window.liberar = r; });
                window.abertura = navigateToAmostrasFromOS('101');
            });
            await ir('view-saidas');
            await page.evaluate(async () => { liberar(); await abertura; bloqueio = null; });
            await ativa('view-saidas');
        });
        await caso('Restauração usa modelo exato e modo sem gravação', async () => {
            await page.evaluate(() => {
                state.pedidoAberto = { osId: 'vibe_101' };
                state.activeOSItem = { osId: 'vibe_101', itemId: 'modelo-1' };
                showView('view-pedido');
            });
            await page.reload();
            await page.waitForFunction(() => modelosAbertos.length === 1);
            assert.deepEqual(await page.evaluate(() => modelosAbertos[0]), { osId: 'vibe_101', itemId: 'modelo-1' });
        });
        await caso('Modelo removido não seleciona o primeiro item', async () => {
            await page.evaluate(() => sessionStorage.setItem('semModelo', '1'));
            await page.reload(); await ativa('view-lista-impressao');
            assert.equal(await page.evaluate(() => modelosAbertos.length), 0);
            assert(await page.evaluate(() => mensagens.some(m => m.includes('modelo'))));
            await page.evaluate(() => sessionStorage.removeItem('semModelo'));
        });
        await caso('Permissão removida e rota inválida usam destino permitido', async () => {
            await ir('view-catalogo');
            await page.evaluate(() => sessionStorage.setItem('telaNegada', 'view-catalogo'));
            await page.reload(); await ativa('view-lista-impressao');
            await page.evaluate(() => {
                sessionStorage.removeItem('telaNegada');
                const s = history.state;
                s.idealNavegacaoV1.rota.view = 'view-inexistente';
                history.replaceState(s, '');
            });
            await page.reload(); await ativa('view-lista-impressao');
        });
        await caso('Histórico não é aplicado antes do login', async () => {
            await ir('view-catalogo');
            await page.evaluate(() => sessionStorage.setItem('aguardarLogin', '1'));
            await page.reload();
            assert.equal(await page.evaluate(() => document.querySelector('.view-section.active')), null);
            await page.evaluate(() => { sessionStorage.removeItem('aguardarLogin'); iniciarTeste(); });
            await ativa('view-catalogo');
        });
        await caso('Abas independentes e preservação de history.state de terceiros', async () => {
            const outra = await nova();
            await outra.goto(origem + '/');
            await outra.evaluate(() => showView('view-saidas'));
            await page.evaluate(() => history.replaceState({ ...history.state, terceiro: 123 }, ''));
            await ir('view-lista-arte');
            assert.equal(await page.evaluate(() => history.state.terceiro), 123);
            await outra.reload(); await ativa('view-saidas', outra);
            await outra.close();
        });
        await caso('Histórico de outra conta não é reaplicado', async () => {
            await page.goto(origem + '/');
            await ir('view-catalogo');
            await page.evaluate(() => sessionStorage.setItem('usuarioTeste', 'outro-operador'));
            await page.reload(); await ativa('view-lista-impressao');
        });
        await caso('Falha de armazenamento não impede navegação', async () => {
            await page.evaluate(() => { history.pushState = () => { throw new DOMException('bloqueado', 'SecurityError'); }; });
            await ir('view-catalogo'); await ativa('view-catalogo');
        });
        await caso('Retorno do login externo restaura somente a rota da mesma conta', async () => {
            await page.goto(origem + '/');
            await ir('view-saidas');
            await page.evaluate(() => { NavegacaoPainel.guardarRetornoLogin(); history.replaceState(null, ''); });
            await page.reload(); await ativa('view-saidas');
            assert.equal(await page.evaluate(() => sessionStorage.getItem('idealNavegacaoOAuthV1')), null);
        });
        await caso('Back durante carga invalida a resposta antiga', async () => {
            await ir('view-catalogo');
            await page.evaluate(() => {
                window.bloqueio = new Promise(r => { window.liberar = r; });
                window.abertura = navigateToAmostrasFromOS('101');
            });
            await page.goBack(); await ativa('view-saidas');
            await page.evaluate(async () => { liberar(); await abertura; bloqueio = null; });
            await ativa('view-saidas');
        });
        await caso('Voltar não troca o estado durante geração em andamento', async () => {
            await ir('view-catalogo');
            await page.evaluate(() => { window.isImposing = true; });
            await page.goBack();
            await page.waitForFunction(() => mensagens.some(m => m.includes('preparação')));
            await ativa('view-catalogo');
            await page.evaluate(() => { window.isImposing = false; });
        });
        await caso('Editor de modelo não restaura a base como edição comum', async () => {
            await page.evaluate(() => {
                document.getElementById('num-id').value = 'base-1';
                window.customNumeracaoEditState = { osId: 'vibe_101', itemId: 'modelo-1' };
                showView('view-numeracao');
            });
            await page.reload(); await ativa('view-numeracao');
            assert.equal(await page.$eval('#num-id', e => e.value), '');
            assert(await page.evaluate(() => mensagens.some(m => m.includes('reaberta pelo pedido'))));
        });
        await caso('Portal preserva token e query; Voltar e F5 preservam a aba visitada', async () => {
            await page.goto(origem + '/cliente/900-abc123?origem=teste#entrega');
            await page.waitForFunction(() => !document.getElementById('secao-entrega').hidden);
            await page.click('[data-abre="arte"]');
            await page.click('[data-abre="pagamento"]');
            await page.goBack();
            await page.waitForFunction(() => !document.getElementById('secao-arte').hidden);
            await page.reload();
            await page.waitForFunction(() => !document.getElementById('secao-arte').hidden);
            assert.equal(page.url(), origem + '/cliente/900-abc123?origem=teste#arte');
        });
        await caso('Portal mantém avanço de etapa na primeira abertura do link', async () => {
            const outra = await nova();
            await outra.goto(origem + '/cliente/900-abc123#arte');
            await outra.waitForFunction(() => !document.getElementById('secao-orcamento').hidden);
            await outra.close();
        });
        assert.deepEqual(erros, [], 'erros JavaScript no navegador');
        console.log('OK: ' + total + ' cenários de navegador, sem serviços reais.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => servidor.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
