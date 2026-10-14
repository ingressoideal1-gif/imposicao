/* Somente no pacote NewProd Teste. A geracao do PDF continua no pedido.js. */
(() => {
    'use strict';
    const modes = new Set(['gdi_atual', 'experimental_gdi', 'pdf_raw']);
    let modoRestaurado = 'gdi_atual';
    function formaEnvio() {
        const value = document.getElementById('ped-teste-saida')?.value || modoRestaurado;
        return modes.has(value) ? value : 'gdi_atual';
    }
    function restaurar(config) {
        modoRestaurado = modes.has(config?.forma_envio) ? config.forma_envio : 'gdi_atual';
        const select = document.getElementById('ped-teste-saida');
        if (select) select.value = modoRestaurado;
        const destino = document.getElementById('ped-teste-destino');
        if (destino) destino.textContent = '';
    }
    const ativo = () => modes.has(document.getElementById('ped-teste-saida')?.value);
    function montar(panel) {
        if (document.getElementById('ped-teste-saida')) return;
        const box = document.createElement('div');
        box.id = 'ped-teste-config';
        box.style.cssText = 'padding:12px;border:1px solid #f59e0b;border-radius:8px;margin-bottom:12px;color:#e2e8f0';
        box.innerHTML = `<label for="ped-teste-saida">Teste — forma de envio</label>
          <select id="ped-teste-saida" style="display:block;width:100%;padding:9px;background:#0f172a;color:white">
            <option value="" disabled>Selecione a saída do teste…</option>
            <option value="gdi_atual" selected>1 — GDI atual (resolução do driver)</option>
            <option value="experimental_gdi">2 — GDI otimizado (300 DPI)</option>
            <option value="pdf_raw">3 — PDF direto ao RIP (RAW)</option>
          </select>
          <p id="ped-teste-aviso" style="font-size:12px;margin:8px 0 0">Use Imprimir no modelo. O teste usa o PDF e as configurações do modelo e não marca o pedido como impresso.</p>
          <p id="ped-teste-destino" style="font-size:12px;margin:8px 0 0"></p>`;
        const refazer = document.getElementById('jg-refazer');
        if (!refazer) return;
        refazer.after(box);
        box.querySelector('select').value = modoRestaurado;
        box.querySelector('select').addEventListener('change', event => {
            document.getElementById('ped-teste-destino').textContent = '';
            window._aplicarEstadoHotFolder?.();
            const body = document.getElementById('jg-config-corpo');
            if (body) body.style.display = 'block';
            document.querySelector('#jg-config .jg-botao')?.setAttribute('aria-expanded', 'true');
            document.getElementById('ped-teste-aviso').textContent = event.target.value === 'pdf_raw'
                ? 'PDF intacto: papel, bandeja, duplex, cópias e cores precisam estar configurados no preset do RIP. As opções do driver não acompanham o PDF RAW.'
                : 'Use Imprimir no modelo. Papel, bandejas de capa/miolo, duplex, cópias e cores vêm da configuração atual. O teste não marca o pedido como impresso.';
        });
    }
    async function capturar(current, {apenasUmaFace = false} = {}) {
        // A pasta escolhida tem prioridade sobre qualquer modo de driver salvo.
        // Mantemos o snapshot de teste para nao confirmar o pedido comercialmente.
        if (current.options.hot_folder_path) {
            if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) throw new Error('Abra o modelo no painel local do NewProd Teste.');
            const snapshot = structuredClone(current);
            delete snapshot.options.trabalho_unico;
            delete snapshot.options.experimental;
            delete snapshot.options.perfil_driver;
            delete snapshot.options.raw_confirmado;
            snapshot.options.modo = 'hot_folder';
            if (apenasUmaFace) snapshot.options.duplex = 1;
            return snapshot;
        }
        const mode = document.getElementById('ped-teste-saida')?.value;
        if (!modes.has(mode)) throw new Error('Selecione a forma de envio do teste na configuração do modelo.');
        if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) throw new Error('Abra o modelo no painel local do NewProd Teste.');
        if (typeof criarEntregaDeImpressao !== 'function' || typeof sendPrintJobDirect !== 'function') throw new Error('Reabra o painel completo antes do teste.');
        if (!current.printerName) throw new Error('Selecione a impressora na configuração do modelo.');
        const headers = {};
        const session = JSON.parse(sessionStorage.getItem('newprod_acesso_local') || 'null');
        if (session?.token) headers['X-NewProd-Sessao'] = session.token;
        const response = await fetch(`${location.origin}/api/print/experimental/capabilities`, {headers, signal: AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error('Agente experimental indisponível. Nenhum envio normal será usado como alternativa.');
        const caps = await response.json();
        if (caps.schema !== 2 || !caps.modos?.includes(mode) || caps.max_pages !== null || caps.max_bytes !== null) throw new Error('Atualize o pacote NewProd Teste para o envio sem limite de páginas ou tamanho.');
        const snapshot = structuredClone(current);
        // O teste usa impressora sem apagar a pasta/configuracao de producao.
        delete snapshot.options.hot_folder_path;
        snapshot.options = {...snapshot.options, experimental: true, modo: mode, dpi: 300};
        if (apenasUmaFace) snapshot.options.duplex = 1;
        if (caps.perfil_destino !== 1) throw new Error('Atualize o NewProd Teste para conferir o perfil da impressora antes de imprimir.');
        const destino = await fetch(`${location.origin}/api/print/experimental/destino`, {
            method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
            body: JSON.stringify({printer_name: snapshot.printerName, options: snapshot.options}),
            signal: AbortSignal.timeout(30000)
        });
        const perfil = await destino.json();
        if (!destino.ok) throw new Error(typeof perfil.detail === 'string' ? perfil.detail : 'Não foi possível conferir o destino.');
        if (perfil.schema !== 1 || perfil.impressora !== snapshot.printerName || !/^[a-f0-9]{64}$/.test(perfil.assinatura || '')) throw new Error('Perfil de destino incompatível. Reabra o teste.');
        snapshot.options.perfil_driver = perfil.assinatura;
        if (mode !== 'pdf_raw') {
            if (caps.lote_gdi !== 1) throw new Error('Atualize o NewProd Teste para enviar a sequência em um único trabalho.');
            snapshot.options.trabalho_unico = !snapshot.options.entregar_por_bloco && !snapshot.options.folha_a_folha;
        }
        const resumo = document.getElementById('ped-teste-destino');
        if (resumo) resumo.textContent = `${perfil.estacao} · ${perfil.impressora} · ${mode === 'pdf_raw' ? 'PDF usa o preset do RIP; troca automática de bandejas não disponível nesta saída.' : 'Configuração do modelo conferida com o driver.'}`;
        if (mode === 'pdf_raw') {
            if (!confirm(`PDF direto: confirme que a fila ${current.printerName} aceita PDF nativo e que o preset do RIP corresponde ao modelo (papel, bandeja, duplex, cor, orientação, ${current.options.copies} cópia(s), escala 100%).\n\nO PDF puro não transmite essas opções ao driver. Continuar?`)) throw new Error('Teste cancelado antes de gerar ou enviar.');
            snapshot.options.raw_confirmado = true;
        }
        return snapshot;
    }
    function opcoesEnvio(options) {
        if (!modes.has(options.modo)) throw new Error('Modo experimental inválido.');
        if (options.modo !== 'pdf_raw') return options;
        // Transformacoes de paginas ja foram feitas na fila comum; RAW nao recebe DEVMODE.
        return {experimental: true, modo: 'pdf_raw', raw_confirmado: options.raw_confirmado,
            perfil_driver: options.perfil_driver,
            copies: options.copies, integridade_sha256: options.integridade_sha256,
            gestao_envio_id: options.gestao_envio_id, historico_contexto: options.historico_contexto};
    }
    async function prepararFolhasGdi(itens, options) {
        return processPrintQueueOptions(itens, options);
    }

    function criarEntregaUnica({testeModelo, apenasUmaFace = false, historicoContexto = null}) {
        const {printerName, options} = structuredClone(testeModelo);
        if (!['gdi_atual','experimental_gdi'].includes(options.modo)) throw new Error('Trabalho único requer uma saída GDI.');
        if (apenasUmaFace) options.duplex = 1;
        const fila = [];
        let encerrada = false, cancelado = false, falhas = 0, enviados = 0, conclusao;
        function informar(texto) {
            const destino = document.getElementById('ped-teste-destino');
            if (destino) destino.textContent = texto;
            console.info('[Teste GDI]', texto);
        }
        informar('GDI: aguardando os arquivos gerados pelo modelo.');
        window.isPrinting = true;
        function botoes(emCurso) {
            for (const [id, visible] of [['ped-btn-cancel-print', emCurso], ['ped-btn-impose', !emCurso], ['ped-btn-impose-print', !emCurso]]) {
                const botao = document.getElementById(id);
                if (botao) botao.style.display = visible ? 'inline-flex' : 'none';
            }
        }
        botoes(true);
        return {
            get cancelado() {return cancelado;},
            get enviados() {return enviados;},
            get falhas() {return falhas;},
            async entregar(itens) {
                if (encerrada || cancelado) throw new Error('Trabalho encerrado.');
                if (window._printCancelRequested) {cancelado = true; return false;}
                const partes = options.impressao_reversa || options.folha_a_folha
                    ? await processPrintQueueOptions(itens, options) : itens;
                if (encerrada || cancelado) throw new Error('Trabalho encerrado.');
                fila.push(...partes);
                informar(`GDI: ${fila.length} arquivo(s) recebido(s). Aguardando concluir a geração para enviar o lote.`);
                toast(`${fila.length} arquivo(s) preparado(s). O envio único começa após concluir a geração.`, 'info');
                return true;
            },
            finalizar({interrompido = false} = {}) {
                if (conclusao) return conclusao;
                encerrada = true;
                conclusao = (async () => {
                    let iniciouRequisicao = false;
                    try {
                        if (interrompido || cancelado || window._printCancelRequested) {
                            cancelado = true;
                            window._printCancelRequested = false;
                            informar('GDI: lote cancelado antes do envio ao agente.');
                            return false;
                        }
                        if (!fila.length) throw new Error('Nenhum PDF preparado para o trabalho.');
                        const form = new FormData();
                        informar(`GDI: conferindo ${fila.length} arquivo(s) para envio.`);
                        const partes = [];
                        for (const item of fila) {
                            const capa = /_(?:contra)?capa/i.test(item.name || '');
                            const tray = options.tray_capa && options.tray_miolo
                                ? (capa ? options.tray_capa : options.tray_miolo) : options.tray;
                            partes.push({sha256: await hashArquivoImpressao(item.blob), tray, duplex: options.duplex});
                            form.append('files', item.blob, item.name);
                        }
                        if (window._printCancelRequested) {cancelado = true; window._printCancelRequested = false; return false;}
                        const envio = {...options, partes, gestao_envio_id: crypto.randomUUID(), historico_contexto: historicoContexto};
                        form.append('printer_name', printerName);
                        form.append('options', JSON.stringify(envio));
                        const headers = {};
                        const session = JSON.parse(sessionStorage.getItem('newprod_acesso_local') || 'null');
                        if (session?.token) headers['X-NewProd-Sessao'] = session.token;
                        iniciouRequisicao = true;
                        informar(`GDI: enviando ${fila.length} arquivo(s) ao agente; aguardando resposta do driver.`);
                        const res = await fetch(`${location.origin}/api/print/experimental/submit-lote`, {
                            method: 'POST', headers, body: form, signal: AbortSignal.timeout(600000)
                        });
                        let data;
                        try { data = await res.json(); }
                        catch (_) { throw new Error(`Agente respondeu HTTP ${res.status} sem resposta JSON válida.`); }
                        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Falha no trabalho único.');
                        enviados = fila.length;
                        informar(`GDI: enviado ao spool ${data.spool_id}. Confira a fila da impressora.`);
                        if (data.avisos?.length) toast(data.avisos.join('\n'), 'warning');
                        toast(`Teste enviado em um trabalho (spool ${data.spool_id}). Confira as folhas; o pedido não foi marcado como impresso.`, 'info');
                        return true;
                    } catch (error) {
                        informar(`GDI: ${error.message}`);
                        falhas++;
                        cancelado = true;
                        if (iniciouRequisicao) window.registrarImpressaoInterrompida?.(0);
                        toast(iniciouRequisicao ? 'Envio interrompido. Confira a fila antes de retomar.' : 'Preparação interrompida; nenhum trabalho enviado.', 'error');
                        throw error;
                    } finally {
                        if (iniciouRequisicao && window._printCancelRequested) {
                            toast('O envio já foi iniciado. Confira ou cancele o trabalho na fila do Windows.', 'warning');
                        }
                        window._printCancelRequested = false;
                        fila.length = 0;
                        window.isPrinting = false;
                        botoes(false);
                    }
                })();
                return conclusao;
            }
        };
    }
    window.NewProdTesteModelo = {montar, capturar, opcoesEnvio, ativo, criarEntregaUnica, prepararFolhasGdi, formaEnvio, restaurar};
})();
