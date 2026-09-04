// Roda a tela "Ao vivo" dentro de um navegador de verdade, sobre o HTML REAL.
//
// Por que o HTML real, e não um esqueleto escrito aqui: o arnês que semeia os
// próprios elementos é mais generoso que a página, e esta aplicação já pagou
// por isso — os testes da tela do Ideal Control passavam com a tela quebrada
// porque o arnês criava um `window.supabaseClient` que o `supabase-config.js`
// nunca cria. Aqui o `controle.html` é servido como está, e os `<script>` dele
// respondem vazio; só o `ao-vivo.js` é o de verdade.
//
// Recebe pelo stdin: {chamada, argumentos}. Imprime, em JSON:
//   { resultado, titulo, nome, sub, resumo, setores, horas,
//     recusasEscondidas, recusas, aparelhos, achados, corpoEscondido }

const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

let bruto = '';
process.stdin.on('data', d => (bruto += d));
process.stdin.on('end', () => rodar(JSON.parse(bruto)));

async function rodar(caso) {
    const html = fs.readFileSync(path.join(REPO, 'frontend', 'controle.html'), 'utf-8');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url();
        if (url.endsWith('/controle.html')) {
            return req.respond({
                status: 200, contentType: 'text/html; charset=utf-8', body: html,
            });
        }
        // Todo o resto da página responde vazio: fontes, imagens, CSS e os
        // outros módulos. O que se está testando é o `ao-vivo.js`, e carregar
        // os vizinhos traria o arranque inteiro da casa junto.
        if (url.startsWith('http://localhost/')) {
            return req.respond({ status: 200, contentType: 'text/plain', body: '' });
        }
        req.continue();
    });
    await page.goto('http://localhost/controle.html');

    // Os vizinhos de que o `ao-vivo.js` depende, como dublês. `abrir()` e
    // `fechar()` os chamam; `desenhar()` não toca em nenhum.
    await page.evaluate(() => {
        window.conta = {
            esconderTelaInicial: function () {},
            mostrarEntrar: function () { window.__pediuEntrar = true; }
        };
        window.AcessoConta = {
            sessao: function () { return Promise.resolve({ access_token: 't' }); },
            pedir: function (caminho) {
                window.__pedidos = (window.__pedidos || []).concat([caminho]);
                return Promise.resolve(window.__resposta || {});
            }
        };
        window.botaoEspera = { comecar: function () {}, terminar: function () {} };
        window.listaEventos = { recarregar: function () { return Promise.resolve(); } };
        window.Controle = { fecharEngrenagem: function () { return Promise.resolve(); } };
    });

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'ao-vivo.js') });
    // O arquivo liga os botões no DOMContentLoaded, que já passou quando ele
    // entrou. Um disparo manual roda os ouvintes registrados depois — é a
    // única forma de exercitar o `ligar()` de verdade.
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));

    const ok = await page.evaluate(() => typeof window.aoVivo === 'object');
    if (!ok) {
        console.error('ao-vivo.js nao registrou window.aoVivo');
        await browser.close();
        process.exit(1);
    }

    const saida = await page.evaluate((c) => {
        var r = window.aoVivo[c.chamada].apply(null, c.argumentos);
        var texto = function (sel) {
            var el = document.querySelector(sel);
            return el ? el.textContent.trim() : null;
        };
        var lista = function (sel) {
            return Array.prototype.map.call(
                document.querySelectorAll(sel),
                function (el) { return el.textContent.replace(/\s+/g, ' ').trim(); }
            );
        };
        var escondido = function (id) {
            var el = document.getElementById(id);
            return el ? el.classList.contains('sumindo') : null;
        };
        return {
            resultado: typeof r === 'undefined' ? null : r,
            titulo: texto('#ao-vivo-titulo'),
            nome: texto('#ao-vivo-nome'),
            sub: texto('#ao-vivo-sub'),
            avisandoQueAtualiza: !escondido('ao-vivo-atualizando'),
            corpoEscondido: escondido('ao-vivo-corpo'),
            resumo: lista('#ao-vivo-resumo .placa'),
            setores: lista('#ao-vivo-setores .cartao-setor-vivo'),
            larguras: Array.prototype.map.call(
                document.querySelectorAll('#ao-vivo-setores .barra-cheia'),
                function (el) { return el.style.width; }
            ),
            horas: lista('#ao-vivo-horas .barra-linha'),
            horasTexto: texto('#ao-vivo-horas'),
            picos: document.querySelectorAll('#ao-vivo-horas .barra-pico').length,
            recusasEscondidas: escondido('ao-vivo-secao-recusas'),
            recusas: lista('#ao-vivo-recusas .barra-linha'),
            aparelhos: lista('#ao-vivo-aparelhos .aparelho-vivo'),
            achados: lista('#ao-vivo-achados .cartao-achado'),
        };
    }, caso);

    await browser.close();
    console.log(JSON.stringify(saida));
}
