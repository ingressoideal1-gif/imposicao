// Regressao do modo multipaginas: DOM/canvas reais, rede e persistencia simuladas.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const script = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    const inicio = script.search(new RegExp('\\n(?:async )?function ' + nome + '\\('));
    if (inicio < 0) throw new Error('Funcao ausente: ' + nome);
    return script.slice(inicio, script.indexOf('\n}', inicio) + 2);
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setContent('<main></main>');
        await page.addScriptTag({ content: [
            'blocoDeArteDoModelo', 'modeloEstaAprovado', 'bloqueioDeModeloAprovado',
            'toggleModoPdf', 'escalaDaArteDoModelo', 'atualizarCaixaDeEscalaDaArte',
            'formatoDoModelo', 'salvarEscalaDaArte', 'pdfViewerAindaAtual',
            'atualizarEstadoDoPdf', 'initPdfViewer', 'renderPdfViewerPage',
            'pdfViewerPrevPage', 'pdfViewerNextPage', 'limparVisualizadorPdf',
            'onItemArteUpload', 'drawAmostraFace', 'getPdfUrlForItem',
            'renderImageModeInPdfViewer', 'itemTemArte', 'ehRenderComposto',
            'travarCardsDeModelosAprovados',
        ].map(extrair).join('\n') });
        const resultados = await page.evaluate(async () => {
            let total = 0;
            function ok(cond, texto) { total++; if (!cond) throw new Error(texto); }
            window.ESCALA_ARTE_MIN = 1; window.ESCALA_ARTE_MAX = 400;
            window.pdfViewerState = {};
            const item = { id: 'modelo-1', modo_pdf: true, arte_url: 'original.pdf', formato_id: 'f1', arte_escala_h: 100, arte_escala_v: 100 };
            window.state = { osItens: { 'os-1': [item] }, formatos: [{ id: 'f1', width_mm: 100, height_mm: 50 }], cores: [], numeracoes: [] };
            Object.defineProperty(window, 'localStorage', { value: { setItem() {}, getItem() { return null; } } });
            window.garantirFontesCarregadas = async () => {};
            window.fontesDosElementos = () => [];
            window.podeDestravarModeloAprovado = () => false;
            window.podeCopiarDeModeloAprovado = () => false;
            window.toast = () => {};
            window.tituloDoModeloAprovado = () => 'Modelo aprovado';
            window.renderAmostrasOSItens = () => {};
            window.renderItemAmostraCombinada = async () => {};
            window.precarregarArtesDosElementos = async () => {};
            window.urlDoProxy = url => 'proxy/' + url;
            let falhaSalvar = false;
            const gravacoes = [];
            window.saveAmostraToDB = async (id, os, dados) => {
                if (falhaSalvar) throw new Error('Falha simulada ao gravar');
                gravacoes.push(dados);
            };
            const escala = '<div id="amostra-escala-0"><input id="amostra-escala-h-0"><input id="amostra-escala-v-0"><button>100%</button></div>';
            const montar = (os = 'os-1') => { document.querySelector('main').innerHTML = blocoDeArteDoModelo(item, 0, os, escala, false); };
            montar();
            const el = id => document.getElementById(id);
            const botoes = () => el('amostra-pdf-nav-0').querySelectorAll('[data-navegacao-pdf]');
            const info = () => el('amostra-pdf-page-info-0').textContent;
            const espera = ms => new Promise(resolve => setTimeout(resolve, ms));
            let simultaneos = 0, maxSimultaneos = 0, destruido = 0, falhaRede = false;
            const criarPdf = () => ({
                numPages: 4,
                destroy: async () => { destruido++; },
                getPage: async numero => {
                    // Pagina 2 lenta para reproduzir respostas fora de ordem.
                    await espera(numero === 2 ? 30 : 1);
                    return {
                        getViewport: ({ scale }) => ({ width: 280 * scale, height: 140 * scale }),
                        render: ({ canvasContext }) => {
                            simultaneos++; maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
                            let resolver, rejeitar, acabou = false;
                            const promise = new Promise((r, j) => { resolver = r; rejeitar = j; });
                            const timer = setTimeout(() => {
                                acabou = true; simultaneos--;
                                canvasContext.canvas.dataset.pagina = String(numero); resolver();
                            }, 20);
                            return { promise, cancel() {
                                if (acabou) return;
                                acabou = true; clearTimeout(timer); simultaneos--; rejeitar(new Error('Render cancelado'));
                            } };
                        },
                    };
                },
            });
            window.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve(criarPdf()) }) };
            window.fetch = async url => {
                if (String(url).includes('lento')) await espera(60);
                if (falhaRede) throw new Error('Offline simulado');
                return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
            };

            await toggleModoPdf(0, 'os-1', item.id);
            ok(!item.modo_pdf && item.arte_url === 'original.pdf', 'Desativar PDF deve preservar o original');
            ok(gravacoes.length === 1 && Object.keys(gravacoes[0]).join() === 'modo_pdf', 'Alternar nao deve apagar o vinculo no banco');
            await toggleModoPdf(0, 'os-1', item.id);
            ok(item.modo_pdf && item.arte_url === 'original.pdf', 'Reativar preserva o original');
            falhaSalvar = true;
            await toggleModoPdf(0, 'os-1', item.id);
            ok(item.modo_pdf, 'Falha ao salvar reverte o modo local');
            falhaSalvar = false;

            const carga = initPdfViewer('os-1_0', item.arte_url, 'os-1', 0);
            ok(info().includes('Carregando') && botoes()[1].disabled, 'Carga mostra aviso e setas desabilitadas');
            await carga;
            ok(info().includes('1 / 4') && botoes()[0].disabled && !botoes()[1].disabled, 'Primeira pagina e limites');
            ok(!el('amostra-escala-h-0').disabled, 'Escala ativa com PDF carregado');
            await Promise.all([pdfViewerNextPage(0, 'os-1'), pdfViewerNextPage(0, 'os-1'), pdfViewerNextPage(0, 'os-1')]);
            ok(info().includes('4 / 4') && botoes()[1].disabled, 'Cliques rapidos devem chegar a ultima pagina');
            ok(el('amostra-pdf-canvas-0').dataset.pagina === '4', 'Pagina lenta anterior nao sobrescreve a ultima');
            const render1 = renderPdfViewerPage('os-1_0', 1, 0);
            await espera(5);
            const render3 = renderPdfViewerPage('os-1_0', 3, 0);
            await Promise.all([render1, render3]);
            ok(maxSimultaneos === 1 && info().includes('3 / 4'), 'Cancelar render antes de reutilizar canvas');
            await pdfViewerPrevPage(0, 'outro-pedido');
            ok(info().includes('3 / 4'), 'Outro pedido nao pode controlar o canvas atual');

            item.status_arte = 'APROVADA_CLIENTE';
            await renderPdfViewerPage('os-1_0', 3, 0);
            document.querySelector('main').dataset.modeloAprovado = '1';
            travarCardsDeModelosAprovados(document.body);
            ok(el('amostra-escala-h-0').disabled && !botoes()[0].disabled, 'Modelo aprovado permite folhear, mantendo escala bloqueada');
            const antes = gravacoes.length;
            el('amostra-escala-h-0').value = '120'; el('amostra-escala-v-0').value = '90';
            await salvarEscalaDaArte(0, 'os-1', item.id);
            await toggleModoPdf(0, 'os-1', item.id);
            ok(gravacoes.length === antes && item.modo_pdf && item.arte_escala_h === 100, 'Trava de aprovado antes de alterar estado');
            item.status_arte = 'EM_ARTE';
            falhaSalvar = true;
            el('amostra-escala-h-0').value = '120';
            await salvarEscalaDaArte(0, 'os-1', item.id);
            ok(item.arte_escala_h === 100 && el('amostra-escala-h-0').value === '100', 'Falha de escala restaura valor salvo');
            falhaSalvar = false;

            state.formatos = [];
            await renderPdfViewerPage('os-1_0', 1, 0);
            ok(info().includes('formato') && botoes()[1].disabled, 'Formato ausente explica controles indisponiveis');
            state.formatos = [{ id: 'f1', width_mm: 100, height_mm: 50 }];
            limparVisualizadorPdf(0);
            item.arte_url = null;
            await drawAmostraFace(item, 'front', null, null, null, null, null, 0, 'os-1', 1);
            ok(el('amostra-escala-0').style.display === 'flex' && el('amostra-escala-h-0').disabled, 'PDF ausente nao faz a escala sumir');
            ok(info().includes('original') && botoes()[0].disabled && botoes()[1].disabled, 'PDF ausente tem aviso explicito');
            // Uma previa PNG nao possui as paginas do PDF original.
            item.amostra_arte_base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
            await drawAmostraFace(item, 'front', null, null, null, null, null, 0, 'os-1', 1);
            ok(info().includes('estática') && el('amostra-escala-h-0').disabled, 'Previa estatica mantem aviso e controles visiveis');
            delete item.amostra_arte_base64;

            item.arte_url = 'original.pdf';
            falhaRede = true;
            await initPdfViewer('os-1_0', item.arte_url, 'os-1', 0);
            ok(info().includes('Tentar novamente') && el('amostra-pdf-retry-0').style.display !== 'none', 'Erro oferece nova tentativa');
            falhaRede = false;
            await initPdfViewer('os-1_0', item.arte_url, 'os-1', 0);
            ok(info().includes('1 / 4'), 'Nova tentativa recupera PDF e controles');
            const cargaAntiga = initPdfViewer('os-1_0', 'lento.pdf', 'os-1', 0);
            await initPdfViewer('os-1_0', 'novo.pdf', 'os-1', 0);
            await cargaAntiga;
            ok(pdfViewerState['os-1_0'].pdfUrl === 'novo.pdf' && destruido === 1, 'Carga antiga nao substitui arquivo novo');
            const cargaOutroPedido = initPdfViewer('os-1_0', 'lento-outro.pdf', 'os-1', 0);
            montar('os-2');
            await cargaOutroPedido;
            ok(info().includes('1 / 1'), 'Carga concluida apos trocar de pedido nao toca nos controles novos');
            await initPdfViewer('os-1_0', 'original.pdf', 'os-1', 0);
            ok(info().includes('1 / 1'), 'Pedido antigo nao inicia carga sobre o card atual');
            montar();
            await initPdfViewer('os-1_0', 'novo.pdf', 'os-1', 0);

            // Upload do verso nao pode trocar o snapshot/visualizador da frente.
            const input = document.createElement('input'); input.id = 'amostra-item-arte-verso-0'; input.type = 'file';
            const dados = new DataTransfer(); dados.items.add(new File(['pdf simulado'], 'verso.pdf', { type: 'application/pdf' }));
            input.files = dados.files; document.body.appendChild(input);
            window.supabaseClient = { storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: 'verso.pdf' } }) }) } };
            window.resolveItemCorNumIds = () => {}; window.invalidarArteVetorial = () => {};
            window.atualizarMarcasDeArteCompartilhada = () => {};
            item.amostra_arte_base64 = 'previa-frente';
            await onItemArteUpload(0, 'os-1', item.id, 'verso');
            ok(item.verso_arte_url === 'verso.pdf' && item.amostra_arte_base64 === 'previa-frente', 'Upload verso preserva snapshot da frente');
            ok(pdfViewerState['os-1_0'].pdfUrl === 'novo.pdf', 'Upload verso preserva paginador da frente');
            return total;
        });
        if (erros.length) throw new Error(erros.join('\n'));
        console.log('OK: ' + resultados + ' verificacoes dos controles PDF');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
