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
process.stdin.on('end', () => {
    if (bruto.trim()) return rodar(JSON.parse(bruto));
    // A entrega segura chama os harnesses sem stdin: executar a suite real.
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.env.IDEAL_TEST_PYTHON || 'python',
        ['-m', 'pytest', '-n', '0', '-q', 'tests/test_ao_vivo.py'],
        { cwd: REPO, stdio: 'inherit' });
    if (r.error) console.error(r.error.message);
    process.exit(r.status === null ? 1 : r.status);
});

async function rodar(caso) {
    const html = fs.readFileSync(path.join(REPO, 'frontend', 'controle.html'), 'utf-8');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    if (caso.fusoNavegador) await page.emulateTimezone(caso.fusoNavegador);
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
        req.abort();
    });
    await page.goto('http://localhost/controle.html');

    // Os vizinhos de que o `ao-vivo.js` depende, como dublês. `abrir()` e
    // `fechar()` os chamam; `desenhar()` não toca em nenhum.
    await page.evaluate(() => {
        window.conta = {
            esconderTelaInicial: function () { document.getElementById('engrenagem').classList.add('sumindo'); },
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
        window.Controle = { fecharEngrenagem: function () { window.__configFechada = true; return Promise.resolve(); } };
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

    const saida = await page.evaluate(async (c) => {
        if (c.pin) {
            window.AcessoConta.sessao = function () { window.__contaConsultada = true; throw new Error('Conta não deve ser consultada'); };
            window.pinInstalacao = {
                aparelho: function (id) { return id === 'e1' ? { token: 'aparelho-sintetico' } : null; },
                consultar: function (id, caminho) {
                    window.__quantasPin = (window.__quantasPin || 0) + 1;
                    window.__consultaPin = { id: id, caminho: caminho };
                    if (c.pinExpirado) { var e = new Error('A autorização expirou. Volte às Configurações para liberar o acesso.'); e.status = 401; return Promise.reject(e); }
                    return Promise.resolve({ evento: { id: id, status: 'ativo', ao_vivo_na_leitura: !!c.publico }, publico: { entraram: 42 } });
                }
            };
        }
        if (c.leitura || c.publico) {
            window.AcessoConta.sessao = function () { window.__contaConsultada = true; throw new Error('Não pedir conta'); };
            window.chaveiro = { procurar: function () { return { token: 'token-sintetico' }; } };
            window.fetch = function (url, opcoes) {
                window.__consultaLeitura = { url: url, token: opcoes.headers.Authorization };
                return Promise.resolve(new Response(JSON.stringify(c.revogado ? {detail:'AO VIVO não liberado'} : {
                    evento: {id:'e1',status:'ativo',ao_vivo_na_leitura:true},publico:{entraram:42}
                }), { status: c.revogado ? 403 : 200 }));
            };
        }
        if (c.liberar) window.Controle.gravar = function (rota, corpo) {
            window.__liberacao = {rota:rota,corpo:corpo}; return Promise.resolve({ok:true});
        };
        if (c.configuracao) {
            document.getElementById('engrenagem').classList.remove('sumindo');
            document.getElementById('campo-nome-evento').value = 'Edicao ainda nao salva';
        }
        var r = await window.aoVivo[c.chamada].apply(null, c.argumentos);
        if (c.publico) {
            document.getElementById('btn-atualizar-ao-vivo').click();
            await new Promise(r => setTimeout(r, 20));
        }
        if (c.liberar) {
            var liberar = document.getElementById('ao-vivo-na-leitura'); liberar.checked = true;
            liberar.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 20));
        }
        var retorno = document.getElementById('btn-voltar-ao-vivo').textContent;
        if (c.voltar) await window.aoVivo.fechar();
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
            retorno,
            quantasPin: window.__quantasPin || 0,
            consultaLeitura: window.__consultaLeitura || null,
            liberacao: window.__liberacao || null,
            liberacaoVisivel: !escondido('ao-vivo-liberacao'),
            consultaPin: window.__consultaPin || null,
            contaConsultada: !!window.__contaConsultada,
            pediuEntrar: !!window.__pediuEntrar,
            aviso: texto('#ao-vivo-aviso'),
            configuracaoVisivel: !escondido('engrenagem'),
            configuracaoEncerrada: !!window.__configFechada,
            nomeEditado: document.getElementById('campo-nome-evento').value,
            aoVivoVisivel: !escondido('ao-vivo'),
            botaoNasConfiguracoes: !!document.querySelector('#engrenagem #btn-config-ao-vivo'),
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
