// Roda a tela "Ao vivo" dentro de um navegador de verdade, sobre o HTML REAL.
//
// Por que o HTML real, e não um esqueleto escrito aqui: o arnês que semeia os
// próprios elementos é mais generoso que a página, e esta aplicação já pagou
// por isso — os testes da tela do Ideal Control passavam com a tela quebrada
// porque o arnês criava um `window.supabaseClient` que o `supabase-config.js`
// nunca cria. Aqui o `controle.html` é servido como está, e os `<script>` dele
// respondem vazio; os módulos exercitados pelo caso são carregados em seguida.
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
        window.listaEventos = { recarregar: function () { return Promise.resolve(); } };
        window.Controle = { fecharEngrenagem: function () { window.__configFechada = true; return Promise.resolve(); } };
    });

    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'botao-espera.js') });
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

    if (caso.exportacao) {
        try {
            console.log(JSON.stringify(await testarExportacao(page, caso)));
        } finally {
            await browser.close();
        }
        return;
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

async function testarExportacao(page, caso) {
    await page.addScriptTag({ path: path.join(REPO, 'frontend', 'acesso-conta.js') });
    if (caso.modo === 'pin') {
        await page.addScriptTag({ path: path.join(REPO, 'frontend', 'pin-instalacao.js') });
    }
    return page.evaluate(async (c) => {
        const botao = document.getElementById('btn-ao-vivo-csv');
        const aviso = document.getElementById('ao-vivo-aviso-csv');
        const chamadas = [], pendencias = [], arquivos = [], blobs = new Map();
        const passo = () => new Promise(resolve => setTimeout(resolve, 0));
        const status = () => ({
            ocupado: botao.disabled && botao.getAttribute('aria-busy') === 'true',
            rotulo: botao.textContent,
            aviso: aviso.textContent,
            arquivos: arquivos.length,
        });
        const resposta = (objeto, status = 200) =>
            new Response(JSON.stringify(objeto), { status });
        let sessaoPendente;
        const obterSessao = () => Promise.resolve({ data: { session: { access_token: 'conta-teste' } } });
        window.supabaseClient = { auth: { getSession: obterSessao } };
        window.chaveiro = {
            procurar: () => ({ por_qr: true, token: 'aparelho-teste' })
        };
        if (c.acao === 'timeout-rede' || c.acao === 'timeout-sessao') {
            const timer = window.setTimeout.bind(window);
            window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 60000 ? 75 : ms, ...args);
        }
        URL.createObjectURL = blob => {
            const url = 'blob:exportacao-' + blobs.size;
            blobs.set(url, blob);
            return url;
        };
        URL.revokeObjectURL = url => blobs.delete(url);
        let bloquearDownload = c.acao === 'download';
        HTMLAnchorElement.prototype.click = function () {
            if (bloquearDownload) {
                bloquearDownload = false;
                throw new Error('Download indisponível no navegador de teste.');
            }
            arquivos.push({ nome: this.download, blob: blobs.get(this.getAttribute('href')) });
        };
        const leituras = Array.from({ length: c.quantidade ?? 1 }, (_, i) => ({
            momento: '2026-11-15T01:20:00Z', recebido_em: '2026-11-15T04:45:00Z',
            numero: String(i + 1).padStart(4, '0'), setor: 'Público; geral', aparelho: 'Portão 1',
            tipo: 'entrada', resultado: i ? 'permitido' : 'negado',
            rotulo_motivo: i ? null : 'Ingresso já usado',
        }));
        window.fetch = async (url, opcoes) => {
            const destino = new URL(url);
            let caminho = destino.pathname.replace('/functions/v1/acesso-conta', '') + destino.search;
            if (destino.pathname.endsWith('/elevar-pin')) {
                return resposta({ token: 'elevacao-teste', expira_em: Date.now() / 1000 + 60 });
            }
            if (destino.pathname.endsWith('/editar-pin')) {
                caminho = JSON.parse(opcoes.body).caminho;
            }
            if (destino.pathname.endsWith('/relatorio')) {
                caminho = '/eventos/e1/' + destino.searchParams.get('recurso')
                    + (destino.searchParams.has('exportar') ? '?exportar=1' : '');
            }
            const id = caminho.split('/')[2];
            if (caminho.endsWith('/ao-vivo')) {
                return resposta({ evento: { id, nome_evento: 'Evento ' + id, status: 'finalizado' } });
            }
            const chamada = {
                caminho, token: opcoes.headers.Authorization, signal: !!opcoes.signal,
                abortada: false,
            };
            chamadas.push(chamada);
            if (opcoes.signal) opcoes.signal.addEventListener('abort', () => { chamada.abortada = true; });
            const tentativa = chamadas.length;
            const resultado = { leituras, ha_mais: !!c.cortado };
            if (c.acao === 'troca' || c.acao === 'fechar' || (c.acao === 'timeout-rede' && tentativa === 1)) {
                // A resposta atrasada simula uma rede que ignora o cancelamento.
                return new Promise(resolve => pendencias.push(() => resolve(resposta(resultado))));
            }
            if (tentativa === 1) {
                if (c.acao === 'rede') throw new TypeError('Falha de rede simulada.');
                if (c.acao === 'servidor') return resposta({ detail: 'Falha no PostgREST' }, 503);
                if (c.acao === 'autorizacao') return resposta({}, 401);
                if (c.acao === 'proibido') return resposta({}, 403);
                if (c.acao === 'invalido') return resposta({ leituras: [null], ha_mais: false });
                if (c.acao === 'primitivo') return resposta('resposta inesperada');
                if (c.acao === 'antigo') return resposta({ ...resultado, pagina: 1, por_pagina: 100 });
            }
            return resposta(resultado);
        };
        if (c.modo === 'pin') {
            localStorage.setItem('ideal_control_pin_configurado', 'instalacao-teste');
            localStorage.setItem('ideal_control_instalacao', 'instalacao-teste');
            const autorizar = window.pinInstalacao.autorizar('e1');
            await passo();
            document.querySelector('dialog input[name=pin]').value = '123456';
            document.querySelector('dialog [data-pin-salvar]').click();
            await autorizar;
        }
        await window.aoVivo.abrir('e1', 'Evento e1', c.modo === 'pin', c.modo === 'leitura');
        if (c.acao === 'timeout-sessao') {
            window.supabaseClient.auth.getSession = () => new Promise(resolve => { sessaoPendente = resolve; });
        }
        const esperarConclusao = async () => {
            const limite = Date.now() + 5000;
            while (botao.disabled && Date.now() < limite) await passo();
            if (botao.disabled) throw new Error('Botão da exportação permaneceu ocupado.');
        };
        botao.click();
        const inicio = status();
        await passo();
        let depoisDaTroca, depoisDaRespostaAntiga, novaTentativa, depoisDaFalha;
        if (c.acao === 'troca') {
            await window.aoVivo.abrir('e2', 'Evento e2');
            depoisDaTroca = status();
            botao.click();
            await passo();
            pendencias[0]();
            await passo();
            depoisDaRespostaAntiga = status();
            pendencias[1]();
        } else if (c.acao === 'fechar') {
            await window.aoVivo.fechar();
            pendencias[0]();
            await passo();
        } else if (c.repetir) {
            await esperarConclusao();
            depoisDaFalha = status();
            if (sessaoPendente) {
                window.supabaseClient.auth.getSession = obterSessao;
                sessaoPendente(await obterSessao());
            }
            botao.click();
            novaTentativa = status();
            if (pendencias.length) pendencias[0]();
        }
        await esperarConclusao();
        return {
            chamadas, inicio, depoisDaTroca, depoisDaRespostaAntiga, novaTentativa, depoisDaFalha,
            fim: status(),
            arquivos: await Promise.all(arquivos.map(async a => ({
                nome: a.nome, mime: a.blob.type, texto: await a.blob.text(),
                bom: [...new Uint8Array(await a.blob.slice(0, 3).arrayBuffer())],
            }))),
        };
    }, caso);
}
