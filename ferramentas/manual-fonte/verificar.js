// Abre o manual num Chrome de verdade e exercita tudo o que foi prometido.
const path = require('path');
const fs = require('fs');
const REPO = path.dirname(path.dirname(__dirname));
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

const ARQUIVO = 'file:///' + path.join(REPO, 'manual-ideal-control.html').replace(/\\/g, '/');
const FOTOS = path.join(__dirname, 'fotos');
if (!fs.existsSync(FOTOS)) fs.mkdirSync(FOTOS, { recursive: true });

const ALVOS = [1, 2, 4, 5, 6, 8, 12, 17, 19, 22, 25, 27, 28];

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const relato = { erros: [], testes: {} };

    async function abrir(largura, altura, tema) {
        const page = await browser.newPage();
        page.on('pageerror', (e) => relato.erros.push(`[${tema} ${largura}] pageerror: ${e}`));
        page.on('console', (m) => {
            if (m.type() === 'error') relato.erros.push(`[${tema} ${largura}] console: ${m.text()}`);
        });
        await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([
            { name: 'prefers-color-scheme', value: tema },
            { name: 'prefers-reduced-motion', value: 'no-preference' },
        ]);
        await page.goto(ARQUIVO, { waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 350));
        return page;
    }

    // ── Fotos: 1440 e 390, claro e escuro ──────────────────────────────────
    for (const tema of ['light', 'dark']) {
        for (const [larg, alt, nome] of [[1440, 900, 'desktop'], [390, 844, 'celular']]) {
            const page = await abrir(larg, alt, tema);
            for (const n of ALVOS) {
                await page.evaluate((n) => {
                    const el = document.getElementById('slide-' + n);
                    document.getElementById('conves').scrollTo({ top: el.offsetTop, behavior: 'auto' });
                }, n);
                await new Promise((r) => setTimeout(r, 420));
                await page.screenshot({
                    path: path.join(FOTOS, `${nome}-${tema}-slide${String(n).padStart(2, '0')}.png`),
                });
            }
            await page.close();
        }
    }

    // ── Testes de comportamento (1440, escuro) ─────────────────────────────
    const page = await abrir(1440, 900, 'dark');

    relato.testes.totalDeSlides = await page.evaluate(() => document.querySelectorAll('.slide').length);
    relato.testes.contadorInicial = await page.$eval('#contador', (e) => e.textContent);
    relato.testes.itensNoIndice = await page.evaluate(() => document.querySelectorAll('#lista-indice a').length);

    // Teclado: seta para a direita avança
    await page.keyboard.press('ArrowRight');
    await new Promise((r) => setTimeout(r, 700));
    relato.testes.depoisDaSeta = await page.$eval('#contador', (e) => e.textContent);
    relato.testes.hashDepoisDaSeta = await page.evaluate(() => location.hash);

    // End vai para o fim
    await page.keyboard.press('End');
    await new Promise((r) => setTimeout(r, 900));
    relato.testes.depoisDoEnd = await page.$eval('#contador', (e) => e.textContent);
    await page.keyboard.press('Home');
    await new Promise((r) => setTimeout(r, 900));

    // Busca por "/" e Enter
    await page.keyboard.press('/');
    await new Promise((r) => setTimeout(r, 250));
    relato.testes.buscaAbriu = await page.evaluate(() => document.getElementById('busca').classList.contains('aberta'));
    await page.type('#campo-busca', 'lanterna');
    await new Promise((r) => setTimeout(r, 250));
    relato.testes.resultadosDaBusca = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#resultados button')).map((b) => b.firstChild.textContent.trim()));
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 900));
    relato.testes.depoisDaBusca = await page.$eval('#contador', (e) => e.textContent);

    // Tema
    relato.testes.temaAntes = await page.evaluate(() => ({
        atributo: document.documentElement.getAttribute('data-tema'),
        fundo: getComputedStyle(document.body).backgroundColor,
        rotulo: document.getElementById('rotulo-tema').textContent,
    }));
    await page.click('#btn-tema');
    await new Promise((r) => setTimeout(r, 250));
    relato.testes.temaDepois = await page.evaluate(() => ({
        atributo: document.documentElement.getAttribute('data-tema'),
        fundo: getComputedStyle(document.body).backgroundColor,
        rotulo: document.getElementById('rotulo-tema').textContent,
    }));
    await page.click('#btn-tema');

    // Copiar (sem permissão de área de transferência: exercita o caminho reserva)
    await page.evaluate(() => {
        const el = document.getElementById('slide-15');
        document.getElementById('conves').scrollTo({ top: el.offsetTop, behavior: 'auto' });
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => document.querySelector('[data-copiar="alvo-codigos"]').click());
    await new Promise((r) => setTimeout(r, 400));
    relato.testes.rotuloDoCopiar = await page.evaluate(() =>
        document.querySelector('[data-copiar="alvo-codigos"]').textContent.trim());

    // Índice
    await page.click('#btn-indice');
    await new Promise((r) => setTimeout(r, 450));
    relato.testes.indiceAbriu = await page.evaluate(() => document.getElementById('indice').classList.contains('aberto'));
    relato.testes.indiceMarcaAtual = await page.evaluate(() => {
        const a = document.querySelector('#lista-indice a[aria-current="true"]');
        return a ? a.textContent.trim() : null;
    });
    await page.keyboard.press('Escape');

    // Lista de conferência
    await page.evaluate(() => {
        const el = document.getElementById('slide-5');
        document.getElementById('conves').scrollTo({ top: el.offsetTop, behavior: 'auto' });
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => document.querySelector('#conferir-requisitos input').click());
    relato.testes.conferirMarcado = await page.evaluate(() => document.querySelector('#conferir-requisitos input').checked);
    relato.testes.usaLocalStorage = await page.evaluate(() => localStorage.length);

    // Contraste: mede o texto principal contra o fundo em ambos os temas
    async function contrastes() {
        return page.evaluate(() => {
            // Compoe o alpha sobre o fundo: medir rgba(...,.14) como cor cheia
            // dava contraste falso -- foi o que aconteceu na primeira medicao.
            function rgba(cor) {
                const m = (cor || '').match(/[\d.]+/g);
                if (!m) return [255, 255, 255, 1];
                return [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1];
            }
            function sobre(frente, fundo) {
                const f = rgba(frente), t = rgba(fundo);
                const a = f[3];
                return [0, 1, 2].map((i) => f[i] * a + t[i] * (1 - a)).concat([1]);
            }
            function lum(cor) {
                const c = Array.isArray(cor) ? cor : rgba(cor);
                const f = c.slice(0, 3).map((v) => {
                    v /= 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
            }
            function razao(a, b) {
                const l1 = lum(a), l2 = lum(b);
                const c = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                return Math.round(c * 100) / 100;
            }
            const fundoPagina = getComputedStyle(document.body).backgroundColor;
            const cartao = document.querySelector('.cartao');
            const fundoCartao = getComputedStyle(cartao).backgroundColor;
            const alvos = {
                'corpo sobre fundo': [getComputedStyle(document.querySelector('.linha-fina')).color, fundoPagina],
                'dim sobre cartão': [getComputedStyle(document.querySelector('.cartao .dim')).color, fundoCartao],
                'narração': [getComputedStyle(document.querySelector('.narracao')).color,
                             sobre(getComputedStyle(document.querySelector('.narracao')).backgroundColor, fundoPagina)],
                'bloco perigo': [getComputedStyle(document.querySelector('.bloco.perigo svg')).color,
                                 sobre(getComputedStyle(document.querySelector('.bloco.perigo')).backgroundColor, fundoPagina)],
                'bloco atenção': [getComputedStyle(document.querySelector('.bloco.atencao svg')).color,
                                  sobre(getComputedStyle(document.querySelector('.bloco.atencao')).backgroundColor, fundoPagina)],
                'sobre-título': [getComputedStyle(document.querySelector('.sobre-titulo')).color, fundoPagina],
                'contador do topo': [getComputedStyle(document.querySelector('.contador')).color, fundoPagina],
                'cabeçalho de tabela': [getComputedStyle(document.querySelector('th')).color, getComputedStyle(document.querySelector('th')).backgroundColor],
                'texto de tabela': [getComputedStyle(document.querySelector('td')).color, getComputedStyle(document.querySelector('table')).backgroundColor],
                'legenda do print': [getComputedStyle(document.querySelector('.print-tela span')).color, fundoPagina],
                'índice (item)': [getComputedStyle(document.querySelector('#lista-indice a')).color, getComputedStyle(document.querySelector('#indice')).backgroundColor],
            };
            const saida = {};
            for (const k in alvos) saida[k] = razao(alvos[k][0], alvos[k][1]);
            return saida;
        });
    }
    relato.testes.contrasteEscuro = await contrastes();
    await page.evaluate(() => document.documentElement.setAttribute('data-tema', 'claro'));
    await new Promise((r) => setTimeout(r, 250));
    relato.testes.contrasteClaro = await contrastes();
    await page.evaluate(() => document.documentElement.removeAttribute('data-tema'));

    // Rolagem horizontal indevida
    relato.testes.rolagemHorizontal1440 = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await page.close();

    // Slides mais altos que a janela — com `proximity` eles rolam, mas vale
    // saber quais e quanto.
    const page5 = await abrir(1440, 900, 'dark');
    relato.testes.slidesAltos = await page5.evaluate(() =>
        Array.from(document.querySelectorAll('.slide'))
            .map((s, i) => ({ n: i + 1, altura: Math.round(s.getBoundingClientRect().height) }))
            .filter((s) => s.altura > 900));
    await page5.close();

    // Deep link direto
    const page2 = await abrir(1440, 900, 'dark');
    await page2.goto(ARQUIVO + '#slide-19', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));
    relato.testes.deepLink = await page2.$eval('#contador', (e) => e.textContent);
    await page2.close();

    // 390px: rolagem horizontal e legibilidade
    const page3 = await abrir(390, 844, 'light');
    relato.testes.rolagemHorizontal390 = await page3.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    relato.testes.larguraDaTabela = await page3.evaluate(() => {
        const t = document.querySelector('.rolagem-lado');
        return { caixa: Math.round(t.getBoundingClientRect().width), rola: t.scrollWidth > t.clientWidth };
    });
    await page3.close();

    // Impressão: gera o PDF e conta as páginas
    const page4 = await abrir(1440, 900, 'light');
    const pdf = path.join(FOTOS, 'manual.pdf');
    await page4.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
    const bruto = fs.readFileSync(pdf, 'latin1');
    relato.testes.paginasNoPdf = (bruto.match(/\/Type\s*\/Page[^s]/g) || []).length;
    relato.testes.tamanhoDoPdfKB = Math.round(fs.statSync(pdf).size / 1024);
    await page4.close();

    // Segredos que não podem ter vazado
    const fonte = fs.readFileSync(path.join(REPO, 'manual-ideal-control.html'), 'utf8');
    const semDados = fonte.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,<recurso>');
    const proibidos = ['supabase', 'vercel', 'service_role', 'sbp_', 'render.com',
        'localhost', '127.0.0.1', 'vwbtitjlpelrcnsytzqw', 'apikey', 'Bearer ', '@gmail',
        'http://', 'ingressoideal1'];
    relato.testes.vazamentos = proibidos.filter((p) => semDados.toLowerCase().includes(p.toLowerCase()));
    relato.testes.jwtSolto = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(semDados);
    relato.testes.enderecosNoTexto = (semDados.match(/https?:\/\/[^\s"'<)]+/g) || []);
    relato.testes.tamanhoDoArquivoKB = Math.round(fs.statSync(path.join(REPO, 'manual-ideal-control.html')).size / 1024);

    await browser.close();
    console.log(JSON.stringify(relato, null, 2));
})();
