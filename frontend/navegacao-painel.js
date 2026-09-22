/* Navegação por entrada do histórico, sem reescrever URLs públicas ou tokens.
 * Só identificadores de navegação são persistidos; nunca PDFs, credenciais,
 * escolhas de impressão ou conteúdo de formulários. Não executa ações de negócio.
 */
(function () {
    'use strict';
    const CHAVE = 'idealNavegacaoV1';
    const RETORNO = 'idealNavegacaoOAuthV1';
    let pronta = false, geracao = 0, exibindo = false, leitura = false, inicialPendente = null;
    let home = null, atual = null, dadosCarregados = false;
    let liberarModelo = null;
    const estado = () => typeof state === 'undefined' ? {} : state;
    const id = valor => (typeof valor === 'string' || typeof valor === 'number')
        && String(valor).length <= 160 ? String(valor) : null;
    const caminho = () => window.location.pathname;
    function dono() {
        // O código de acesso local nunca entra no histórico.
        if (window._currentUser?.id) return window._currentUser.id;
        try {
            let sessao = sessionStorage.getItem('idealNavegacaoLocalV1');
            if (!sessao) {
                sessao = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
                sessionStorage.setItem('idealNavegacaoLocalV1', sessao);
            }
            return 'local:' + sessao;
        } catch (_) { return 'local'; }
    }
    function permitida(view) {
        return typeof view === 'string' && /^view-[a-z0-9-]+$/.test(view)
            && !!document.getElementById(view)?.classList.contains('view-section')
            && typeof window.podeAbrirView === 'function' && window.podeAbrirView(view);
    }
    function validar(rota) {
        if (!rota || !permitida(rota.view)) return null;
        const r = { view: rota.view };
        if (rota.rascunhoModelo === true) r.rascunhoModelo = true;
        const campos = ['view-amostras', 'view-pedido'].includes(r.view)
            ? ['osId', 'itemId'] : ['view-formatos', 'view-numeracao', 'view-cores'].includes(r.view) ? ['editorId'] : [];
        for (const campo of campos) {
            const valor = id(rota[campo]);
            if (valor !== null) r[campo] = valor;
        }
        return r;
    }
    function ler() {
        const salvo = window.history.state?.[CHAVE];
        return salvo && salvo.caminho === caminho() && salvo.dono === dono()
            ? validar(salvo.rota) : null;
    }
    function gravar(rota, substituir) {
        try {
            const base = window.history.state;
            const novo = { ...(base && typeof base === 'object' ? base : {}) };
            novo[CHAVE] = { caminho: caminho(), dono: dono(), rota };
            // Sem terceiro argumento: pathname, query e fragmento ficam intactos.
            window.history[substituir ? 'replaceState' : 'pushState'](novo, '');
        } catch (e) {
            console.warn('[navegacao] Histórico indisponível:', e.name);
        }
    }
    function capturar(view) {
        const s = estado(), r = { view };
        if (view === 'view-amostras') r.osId = s.amostrasOSAtivo;
        if (view === 'view-pedido') {
            r.osId = s.pedidoAberto?.osId || s.activeOSItem?.osId;
            if (String(s.activeOSItem?.osId) === String(r.osId)) r.itemId = s.activeOSItem?.itemId;
        }
        // Imposição avulsa contém arquivos/escolhas transitórios. O histórico
        // restaura a tela; não inventa um trabalho de impressão a partir de ids.
        const campo = { 'view-formatos': 'fmt-id', 'view-numeracao': 'num-id', 'view-cores': 'cor-id' }[view];
        if (campo) r.editorId = document.getElementById(campo)?.value || undefined;
        if (view === 'view-numeracao' && window.customNumeracaoEditState) r.rascunhoModelo = true;
        return validar(r);
    }
    function registrar(view, substituir = false) {
        if (!pronta || exibindo || !permitida(view)) return;
        const rota = capturar(view);
        if (!rota || JSON.stringify(rota) === JSON.stringify(atual)) return;
        geracao++;
        cancelarModelo();
        inicialPendente = null;
        gravar(rota, substituir || !atual);
        atual = rota;
    }
    function iniciarAcao() {
        const numero = ++geracao;
        cancelarModelo();
        inicialPendente = null;
        return () => pronta && numero === geracao;
    }
    function cancelarModelo() {
        const liberar = liberarModelo;
        liberarModelo = null;
        if (liberar) liberar();
    }
    function exibir(view, aindaAtual, somenteLeitura = true) {
        if (aindaAtual && !aindaAtual()) return false;
        if (!permitida(view)) return false;
        exibindo = true;
        leitura = somenteLeitura;
        try { window.showView(view); } finally { exibindo = false; leitura = false; }
        return true;
    }
    function concluir(view, aindaAtual) {
        if (!exibir(view, aindaAtual, false)) return false;
        // A ação já tem uma geração: registrar aqui não deve invalidar suas
        // próprias tarefas atrasadas de prévia. Outra navegação as invalidará.
        const rota = capturar(view);
        if (JSON.stringify(rota) !== JSON.stringify(atual)) {
            gravar(rota, !atual);
            atual = rota;
        }
        return true;
    }
    function aviso(texto) {
        if (typeof window.toast === 'function') window.toast(texto, 'warning');
    }
    function semGravacao(fn) {
        const anterior = leitura;
        leitura = true;
        try { return fn(); } finally { leitura = anterior; }
    }
    async function restaurar(rota, aindaAtual) {
        if (!aindaAtual()) return;
        const s = estado();
        try {
            if (!permitida(rota.view)) throw new Error('Tela indisponível para este acesso.');
            if (rota.osId) {
                if (!window.findOSInState(rota.osId)) await window.loadOrdens();
                if (!aindaAtual()) return;
                const os = window.findOSInState(rota.osId);
                if (!os) throw new Error('O pedido não está disponível.');
                await window.loadOSItens(os.id);
                if (!aindaAtual()) return;
                if (rota.view === 'view-amostras') {
                    s.amostrasOSAtivo = os.id;
                    exibir(rota.view, aindaAtual);
                    window.renderAmostrasOSItens(os.id);
                } else {
                    const item = (window.getOSItens(os.id) || []).find(i => String(i.id) === rota.itemId);
                    if (rota.itemId && !item) throw new Error('O modelo não está mais disponível neste pedido.');
                    s.pedidoAberto = { osId: os.id };
                    s.activeOSItem = null;
                    s.modeloLiberado = null;
                    if (item) {
                        const contexto = { aindaAtual, restaurandoNavegacao: true };
                        s.selectedOSItems = [];
                        s.pedidoSelecaoCarregando = true;
                        const liberar = () => {
                            s.pedidoSelecaoCarregando = false;
                            if (typeof window.updatePedImprimirButtonsVisibility === 'function') window.updatePedImprimirButtonsVisibility();
                        };
                        liberarModelo = liberar;
                        try {
                            if (rota.view === 'view-pedido') await window.enviarParaPedido(item.id, os.id, contexto);
                        } finally {
                            if (liberarModelo === liberar) cancelarModelo();
                        }
                        if (!aindaAtual()) return;
                    } else if (typeof window.fecharJanelaDoModelo === 'function') {
                        window.fecharJanelaDoModelo();
                    }
                    if (typeof window.pintarTituloDaTelaDePedido === 'function') {
                        const arte = (s.todasArtes || []).find(a => String(a.id_int) === String(os.id).replace('vibe_', ''));
                        window.pintarTituloDaTelaDePedido(document.getElementById('ped-view-title'), os, arte?.nome_evento || '');
                        const subtitulo = document.getElementById('ped-view-subtitle');
                        if (subtitulo) subtitulo.style.display = 'none';
                    }
                    exibir(rota.view, aindaAtual);
                    if (rota.view === 'view-pedido') window.renderPedOSQueue({ somenteLeitura: true });
                }
            } else if (['view-formatos', 'view-numeracao', 'view-cores'].includes(rota.view)) {
                const editores = {
                    'view-formatos': ['formatos', 'editFmt', 'cancelFmtEdit'],
                    'view-numeracao': ['numeracoes', 'editNumeracao', 'cancelNumEdit'],
                    'view-cores': ['cores', 'editCor', 'cancelCorEdit']
                };
                const [lista, editar, limpar] = editores[rota.view];
                if (rota.rascunhoModelo) {
                    // Sem o vínculo completo e o conteúdo não salvo, reabrir a
                    // numeração base como edição comum alteraria outro cadastro.
                    window.cancelNumEdit();
                    exibir(rota.view, aindaAtual);
                    aviso('A edição do modelo deve ser reaberta pelo pedido. Alterações não salvas não são recuperadas pelo histórico.');
                    return;
                }
                const item = (s[lista] || []).find(i => String(i.id) === rota.editorId);
                if (rota.editorId && !item) throw new Error('O cadastro não está mais disponível.');
                if (item) await window[editar](item.id, { aindaAtual, restaurandoNavegacao: true });
                else if (typeof window[limpar] === 'function') window[limpar]();
                if (!aindaAtual()) return;
                exibir(rota.view, aindaAtual);
            } else {
                if (rota.view === 'view-amostras') s.amostrasOSAtivo = null;
                if (rota.view === 'view-pedido') {
                    s.pedidoAberto = null;
                    if (typeof window.fecharJanelaDoModelo === 'function') window.fecharJanelaDoModelo();
                    s.activeOSItem = null;
                }
                exibir(rota.view, aindaAtual);
                if (rota.view === 'view-pedido') window.renderPedOSQueue({ somenteLeitura: true });
            }
            if (aindaAtual()) { atual = rota; gravar(rota, true); }
        } catch (e) {
            if (!aindaAtual()) return;
            aviso('Não foi possível restaurar esta página. ' + (e.message || 'Tente novamente.'));
            const fallback = permitida(home) ? { view: home } : null;
            if (fallback) { atual = fallback; exibir(home, aindaAtual); gravar(fallback, true); }
        }
    }
    function iniciar(telaInicial) {
        home = telaInicial;
        const eraPronta = pronta;
        pronta = true;
        const aindaAtual = iniciarAcao();
        let rota = ler();
        const anterior = window.history.state?.[CHAVE];
        const tinhaPosicao = anterior?.caminho === caminho() && anterior?.dono === dono();
        // Retorno OAuth é de uso único, limitado a esta aba/caminho e 10 minutos.
        try {
            const retorno = JSON.parse(sessionStorage.getItem(RETORNO) || 'null');
            sessionStorage.removeItem(RETORNO);
            if (!rota && retorno && retorno.caminho === window.location.pathname
                && retorno.dono === dono() && Date.now() - retorno.quando < 600000) rota = validar(retorno.rota);
        } catch (_) { /* armazenamento pode estar bloqueado */ }
        if (!rota && !tinhaPosicao && !eraPronta && typeof window.pedidoDoLinkDireto === 'function' && window.pedidoDoLinkDireto()) {
            rota = { view: 'view-amostras', osId: window.pedidoDoLinkDireto() };
        }
        rota = validar(rota) || validar({ view: home });
        if (!rota) return;
        atual = rota;
        gravar(rota, true);
        // O shell abre após as permissões. Detalhes esperam os catálogos.
        exibir(rota.view, aindaAtual);
        if (dadosCarregados) void restaurar(rota, aindaAtual);
        else inicialPendente = { rota, aindaAtual };
    }
    function dadosProntos() {
        dadosCarregados = true;
        const pendente = inicialPendente;
        inicialPendente = null;
        if (pendente) void restaurar(pendente.rota, pendente.aindaAtual);
    }
    function suspender() { pronta = false; geracao++; cancelarModelo(); inicialPendente = null; }
    function encerrarSessao() {
        suspender();
        atual = null;
        try {
            sessionStorage.removeItem('idealNavegacaoLocalV1');
            sessionStorage.removeItem(RETORNO);
            const novo = { ...window.history.state };
            delete novo[CHAVE];
            window.history.replaceState(novo, '');
        } catch (_) { /* sair continua disponível */ }
    }
    function guardarRetornoLogin() {
        try {
            const anterior = window.history.state?.[CHAVE];
            const mesmoCaminho = anterior?.caminho === caminho();
            sessionStorage.setItem(RETORNO, JSON.stringify({ caminho: window.location.pathname,
                dono: mesmoCaminho ? anterior.dono : dono(), quando: Date.now(),
                rota: atual || (mesmoCaminho ? validar(anterior.rota) : null) }));
        } catch (_) { /* login continua funcionando sem sessionStorage */ }
    }
    window.addEventListener('popstate', () => {
        if (!pronta) return;
        if (window.isImposing || (estado().pedidoSelecaoCarregando && !liberarModelo)) {
            if (atual) gravar(atual, true);
            aviso('Aguarde a preparação do trabalho terminar antes de voltar.');
            return;
        }
        const aindaAtual = iniciarAcao();
        const rota = ler() || validar({ view: home });
        if (!rota) return;
        atual = rota;
        if (dadosCarregados) void restaurar(rota, aindaAtual);
        else { exibir(rota.view, aindaAtual); inicialPendente = { rota, aindaAtual }; }
    });
    window.NavegacaoPainel = { iniciar, registrar, iniciarAcao, exibir, concluir,
        dadosProntos, suspender, encerrarSessao, guardarRetornoLogin,
        semGravacao, restaurando: () => leitura, ativa: () => pronta };
})();
