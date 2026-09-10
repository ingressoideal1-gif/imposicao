// Login e pedidos sintéticos; o navegador exercita o botão e o Web Audio reais.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const raiz = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'frontend/index.html'), 'utf8');
function extrair(nome) {
    let inicio = fonte.indexOf(`function ${nome}(`);
    assert.ok(inicio >= 0, nome);
    if (fonte.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        const botao = html.match(/<button id="btn-som-lista-arte"[\s\S]*?<\/button>/)[0];
        await page.setContent(`<meta charset="utf-8"><section id="view-lista-arte" class="active">${botao}</section>`);
        await page.addScriptTag({ content: `
            const state = { ordens: [], todasArtes: [] };
            window.testState = state;
            const localStorage = { getItem: () => null };
            let usuariosSupabase = [], usuariosObjetosSupabase = [];
            let designersSupabase = [], designersObjetosSupabase = [];
            let atendentesSupabase = [], atendentesObjetosSupabase = [];
            const supabaseClient = { from: () => ({ select: async () => ({ data: [
                { user_id: 'designer-a', nome_usuario: 'Designer A', setor: 'Designer' },
                { user_id: 'designer-b', nome_usuario: 'Designer B', setor: 'Designer' },
                { user_id: 'atendente-a', nome_usuario: 'Atendente A', setor: 'Atendimento' },
                { user_id: 'admin-a', nome_usuario: 'Administrador A', setor: 'Administrador' }
            ] }) }) };
            function populateDesignerFilter() {}
            function populateAtendenteFilter() {}
            window._currentUser = { id: 'designer-a' };
            window.avisos = [];
            function toast(texto) { avisos.push(texto); }
            function classificarPedidoNaArte(os) { return { fila: os.fila || 'fila' }; }
            ${['loadUsuarios', 'nomeDoUsuarioLogadoEm', 'getLoggedInDesignerName', 'getLoggedInAtendenteName',
                'getOSDesigner', 'getOSVendedor'].map(extrair).join('\n')}
            ${fonte.slice(fonte.indexOf('const _avisosArtePorUsuario ='), fonte.indexOf('let _relogioDaListaLigado ='))}
            window.tons = 0;
            const criarOscilador = AudioContext.prototype.createOscillator;
            AudioContext.prototype.createOscillator = function () {
                window.tons++; return criarOscilador.call(this);
            };
            state.ordens = [{ id: '1', numero: 1, designer_nome: 'Designer A' }];
        ` });
        await page.evaluate(async () => {
            await loadUsuarios();
            conferirNovosPedidosDoUsuario();
        });
        assert.deepEqual(await page.evaluate(() => [tons, avisos.length]), [0, 0], 'primeira carga silenciosa');
        await page.click('#btn-som-lista-arte');
        await page.waitForFunction(() => document.getElementById('btn-som-lista-arte').getAttribute('aria-pressed') === 'true');
        assert.equal(await page.evaluate(() => tons), 2, 'botão libera áudio e toca confirmação');
        const resultado = await page.evaluate(() => {
            const registros = {};
            const guardar = nome => { registros[nome] = [tons, avisos.length]; };
            const s = testState;
            s.ordens.push({ id: '2', numero: 2, designer_nome: 'Designer B' });
            conferirNovosPedidosDoUsuario(); guardar('outro');
            s.ordens.push({ id: '3', numero: 3, designer_nome: 'Designer A' });
            conferirNovosPedidosDoUsuario(); guardar('novo');
            conferirNovosPedidosDoUsuario(); guardar('repetido');
            s.ordens.push({ id: '4', numero: 4, designer_nome: 'Designer A', fila: 'concluidos' });
            conferirNovosPedidosDoUsuario(); guardar('concluido');
            s.ordens[1].designer_nome = 'Designer A';
            conferirNovosPedidosDoUsuario(); guardar('atribuido');
            // Mesmo número vindo de outra origem continua sendo o mesmo pedido.
            s.ordens.push({ id: 'vibe_3', numero: '3', designer_nome: 'Designer A' });
            conferirNovosPedidosDoUsuario(); guardar('duplicado');
            _currentUser = { id: 'designer-b' };
            conferirNovosPedidosDoUsuario(); guardar('trocaLogin');
            registros.botaoOutroLogin = document.getElementById('btn-som-lista-arte').getAttribute('aria-pressed');
            _currentUser = { id: 'atendente-a' };
            s.ordens.push({ id: '5', numero: 5, vendedor: 'Atendente A' });
            conferirNovosPedidosDoUsuario(); guardar('primeiraAtendente');
            return registros;
        });
        assert.deepEqual(resultado.outro, [2, 0]);
        assert.deepEqual(resultado.novo, [4, 1]);
        assert.deepEqual(resultado.repetido, [4, 1]);
        assert.deepEqual(resultado.concluido, [4, 1]);
        assert.deepEqual(resultado.atribuido, [6, 2]);
        assert.deepEqual(resultado.duplicado, [6, 2]);
        assert.deepEqual(resultado.trocaLogin, [6, 2]);
        assert.equal(resultado.botaoOutroLogin, 'false');
        assert.deepEqual(resultado.primeiraAtendente, [6, 2]);
        await page.click('#btn-som-lista-arte');
        await page.waitForFunction(() => document.getElementById('btn-som-lista-arte').getAttribute('aria-pressed') === 'true');
        await page.evaluate(() => {
            testState.ordens.push({ id: '6', numero: 6, vendedor: 'Atendente A' });
            conferirNovosPedidosDoUsuario();
        });
        assert.deepEqual(await page.evaluate(() => [tons, avisos.length]), [10, 3], 'atendente recebe apenas seu pedido');
        await page.click('#btn-som-lista-arte');
        await page.evaluate(() => {
            testState.ordens.push({ id: '7', numero: 7, vendedor: 'Atendente A' });
            conferirNovosPedidosDoUsuario();
        });
        assert.deepEqual(await page.evaluate(() => [tons, avisos.length]), [10, 4], 'silenciado mantém aviso visual');
        await page.evaluate(() => {
            _currentUser = null;
            conferirNovosPedidosDoUsuario();
        });
        assert.equal(await page.$eval('#btn-som-lista-arte', b => b.disabled), true);
        await page.evaluate(() => {
            _currentUser = { id: 'admin-a' };
            window._currentPerms = { role: 'admin' };
            conferirNovosPedidosDoUsuario();
        });
        assert.equal(await page.$eval('#btn-som-lista-arte', b => b.disabled), false,
            'administrador autenticado pode ativar o som mesmo fora das listas de designer/atendente');
        await page.click('#btn-som-lista-arte');
        await page.waitForFunction(() => document.getElementById('btn-som-lista-arte').getAttribute('aria-pressed') === 'true');
        const antesAdmin = await page.evaluate(() => [tons, avisos.length]);
        await page.evaluate(() => {
            testState.ordens.push({ id: '8', numero: 8, designer_nome: 'Administrador A' });
            conferirNovosPedidosDoUsuario();
        });
        assert.deepEqual(await page.evaluate(() => [tons, avisos.length]),
            [antesAdmin[0] + 2, antesAdmin[1] + 1], 'administrador recebe seu pedido');
        await page.evaluate(() => {
            testState.ordens.push({ id: '9', numero: 9, designer_nome: 'Designer B' });
            conferirNovosPedidosDoUsuario();
        });
        assert.deepEqual(await page.evaluate(() => [tons, avisos.length]),
            [antesAdmin[0] + 2, antesAdmin[1] + 1], 'perfil admin não recebe pedidos dos demais');
        await page.evaluate(() => {
            _currentUser = { id: 'sem-vinculo' };
            conferirNovosPedidosDoUsuario();
        });
        assert.equal(await page.$eval('#btn-som-lista-arte', b => b.disabled), false,
            'a ativação do áudio depende do login, não do cadastro de responsáveis');
        // Falta de suporte ao áudio não interrompe a atualização da lista.
        await page.evaluate(async () => {
            _currentUser = { id: 'atendente-a' };
            await _audioListaArte.close();
            window.AudioContext = undefined;
            window.webkitAudioContext = undefined;
            atualizarBotaoSomArte();
        });
        await page.click('#btn-som-lista-arte');
        assert.equal(await page.$eval('#btn-som-lista-arte', b => b.getAttribute('aria-pressed')), 'false');
        assert.match(await page.evaluate(() => avisos.at(-1)), /Não foi possível ativar o som/);
        assert.deepEqual(erros, []);
        console.log('OK: Web Audio por clique, carregamento e login de administrador/designer/atendente, primeira carga silenciosa, novos pedidos, atribuição, deduplicação, troca de login, silenciar e ausência de áudio.');
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
