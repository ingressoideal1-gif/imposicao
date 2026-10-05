// Instalado somente pela injeção opt-in do agente piloto.
(function () {
    'use strict';
    const liberados = new Map();
    const revisoesPedidos = new Map();
    let pedidoAtual = null;
    let popupConferencia = null;
    function mostrarConferencia() {
        if (popupConferencia) {
            popupConferencia.close();
            popupConferencia.remove();
        }
        if (!document.getElementById('piloto-conferencia-estilo')) {
            const estilo = document.createElement('style');
            estilo.id = 'piloto-conferencia-estilo';
            estilo.textContent = `
                #piloto-conferencia { width:min(420px,calc(100vw - 40px)); box-sizing:border-box;
                    padding:32px 24px; border:1px solid #d5e5e9; border-radius:16px;
                    background:#fff; color:#19364b; text-align:center;
                    box-shadow:0 20px 70px #0004; }
                #piloto-conferencia::backdrop { background:rgba(10,25,40,.6); }
                #piloto-conferencia img { display:block; width:320px; max-width:100%; height:auto; margin:0 auto 28px; }
                #piloto-conferencia p { margin:18px 0 0; font:600 17px/1.5 system-ui,sans-serif; }
                #piloto-conferencia .indicador { width:32px; height:32px; margin:auto;
                    border:3px solid #d8eeed; border-top-color:#13aaa5; border-radius:50%;
                    animation:piloto-conferencia-girar .9s linear infinite; }
                @keyframes piloto-conferencia-girar { to { transform:rotate(360deg); } }
                @media (prefers-reduced-motion:reduce) { #piloto-conferencia .indicador { animation:none; } }
            `;
            document.head.appendChild(estilo);
        }
        const dialogo = document.createElement('dialog');
        dialogo.id = 'piloto-conferencia';
        dialogo.setAttribute('aria-labelledby', 'piloto-conferencia-mensagem');
        dialogo.setAttribute('aria-busy', 'true');
        const logo = document.createElement('img');
        logo.src = '/logo-ideal-2026.png';
        logo.alt = 'Ingresso Ideal';
        const indicador = document.createElement('div');
        indicador.className = 'indicador';
        indicador.setAttribute('aria-hidden', 'true');
        const mensagem = document.createElement('p');
        mensagem.id = 'piloto-conferencia-mensagem';
        mensagem.setAttribute('role', 'status');
        mensagem.textContent = 'Aguarde, conferencia de dados';
        dialogo.append(logo, indicador, mensagem);
        // Escape não deve esconder uma conferência que continua em andamento.
        dialogo.addEventListener('cancel', evento => evento.preventDefault());
        document.body.appendChild(dialogo);
        dialogo.showModal();
        popupConferencia = dialogo;
        return () => {
            // Uma abertura antiga não pode fechar o popup do pedido seguinte.
            if (popupConferencia !== dialogo) return;
            dialogo.close();
            dialogo.remove();
            popupConferencia = null;
        };
    }
    function iniciarPedido(osId) {
        liberados.clear();
        pedidoAtual = {osId:String(osId)};
        state.multiArtesPdfCache = {};
        return pedidoAtual;
    }
    const chave = (id, os) => String(os) + ':' + String(id);
    const canonico = v => Array.isArray(v) ? v.map(canonico) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
    async function digest(v) {
        const bytes = new TextEncoder().encode(JSON.stringify(canonico(v)));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async function conferirPedido(osId, atual, contexto = iniciarPedido(osId)) {
        const pedido = findOSInState(osId);
        if (!pedido || contexto !== pedidoAtual) throw Error('Pedido de produção não identificado.');
        const itens = (getOSItens(osId) || []).filter(i => i._produto_prateleira !== true);
        if (!itens.length || itens.some(i => !i._modeloOnline)) throw Error('Modelos completos indisponíveis.');
        toast('Conferindo o pedido e preparando os arquivos locais. Aguarde.', 'info');
        const ids = [...new Set(itens.map(i => i._modeloOnline.amostra_num_id || i._modeloOnline.numeracao_id).filter(Boolean))];
        let nums = [];
        if (ids.length) {
            const r = await lerDadosLista(supabaseClient.from('producao_numeracoes').select('*').in('id', ids)
                .abortSignal(AbortSignal.timeout(30000)), 'numerações do pedido');
            if (r.error || ids.some(id => !r.data?.some(n => String(n.id) === String(id)))) throw Error('Numeração não conferida.');
            nums = r.data || [];
        }
        if (!atual() || contexto !== pedidoAtual) return null;
        const fotografias = new Map(itens.map(i => [String(i.id), JSON.stringify(canonico(i._modeloOnline))]));
        const modelos = await Promise.all(itens.map(async item => {
            const modelo = JSON.parse(fotografias.get(String(item.id)));
            const id = item._modeloOnline.amostra_num_id || item._modeloOnline.numeracao_id;
            return {modelo:String(item.id), digest:await digest([modelo, nums.filter(n => String(n.id) === String(id))])};
        }));
        const r = await fetch('/api/pacotes-locais/preparar-pedido-painel', {
            method:'POST', headers:{'Content-Type':'application/json','X-Piloto-Painel':'1'},
            body:JSON.stringify({pedido:String(pedido.numero), modelos}),
            signal:AbortSignal.timeout(600000)
        });
        if (!r.ok) throw Error('Conferência do pedido não concluída. Reabra o pedido para tentar novamente.');
        const resposta = await r.json();
        if (!atual() || contexto !== pedidoAtual) return null;
        const pacotes = resposta.pacotes;
        if (resposta.pedido !== String(pedido.numero) || !Array.isArray(pacotes) || !Array.isArray(resposta.sem_arte)
            || new Set([...pacotes.map(p => p.modelo), ...resposta.sem_arte]).size !== modelos.length
            || pacotes.length + resposta.sem_arte.length !== modelos.length) throw Error('Resposta local incompleta.');
        for (const pacote of pacotes) {
            const esperado = modelos.find(m => m.modelo === pacote.modelo);
            const itemAtual = (getOSItens(osId) || []).find(i => String(i.id) === pacote.modelo);
            if (!esperado || pacote.digest !== esperado.digest || pacote.origem !== 'local'
                || !/^[a-f0-9]{64}$/.test(pacote.revisao)
                || fotografias.get(pacote.modelo) !== JSON.stringify(canonico(itemAtual?._modeloOnline))) throw Error('Resposta local não corresponde ao pedido.');
        }
        if (resposta.sem_arte.some(id => !modelos.some(m => m.modelo === id))) throw Error('Modelo local desconhecido.');
        if (/^[a-f0-9]{64}$/.test(resposta.revisao_pedido || '')) {
            // Bancos do pedido/vinculos tambem participam da revisao. A marca
            // anterior nao pode dispensar a carga depois de uma alteracao.
            if (revisoesPedidos.get(String(osId)) !== resposta.revisao_pedido) {
                state._bancosPedidoDe = null;
                if (state._bancosConsultados) delete state._bancosConsultados[String(osId)];
            }
            revisoesPedidos.set(String(osId), resposta.revisao_pedido);
        }
        // Substitui o registro correspondente, preservando os outros modelos.
        for (const raw of nums) {
            // O digest acima usa a linha integral da nuvem. O painel precisa
            // da mesma forma tratada do catálogo (sem METADATA, modo efetivo),
            // sem alterar essa linha nem o snapshot conferido.
            const num = normalizarNumeracaoLida(structuredClone(raw));
            const indice = state.numeracoes.findIndex(n => String(n.id) === String(num.id));
            if (indice < 0) state.numeracoes.push(num); else state.numeracoes[indice] = num;
        }
        for (const pacote of pacotes) {
            const item = itens.find(i => String(i.id) === pacote.modelo);
            liberados.set(chave(item.id, osId), {pacote, modelo:fotografias.get(pacote.modelo)});
        }
        contexto.pronto = true;
        toast('Pedido conferido. Modelos preparados para leitura local.', 'success');
        return resposta;
    }
    async function conferir(itemId, osId, atual) {
        if (!atual()) return null;
        validarTrabalho([{itemId, osId}]);
        return liberados.get(chave(itemId, osId)).pacote;
    }
    async function lerArte(pacote, nome, origem) {
        const caminho = pacote.recursos?.[nome];
        const esperado = '/api/pacotes-locais/recurso-painel/' + pacote.modelo + '/' + pacote.revisao + '/' + nome;
        if (pacote.fontes?.[nome] !== origem || caminho !== esperado) throw Error('A arte mudou durante a seleção. Selecione novamente.');
        const r = await fetch(caminho, {cache:'no-store', signal:AbortSignal.timeout(30000)});
        if (!r.ok || r.headers.get('X-Piloto-Origem') !== 'local') throw Error('Arquivo local indisponível ou inválido.');
        return r;
    }
    function validarTrabalho(alvos) {
        if (!alvos?.length) throw Error('Selecione e confira um modelo antes de imprimir.');
        for (const alvo of alvos) {
            const liberado = liberados.get(chave(alvo.itemId, alvo.osId));
            const item = (getOSItens(alvo.osId) || []).find(i => String(i.id) === String(alvo.itemId));
            if (!liberado || !item?._modeloOnline || liberado.modelo !== JSON.stringify(canonico(item._modeloOnline))) {
                throw Error('Reabra o pedido para conferir a versão local antes de gerar ou imprimir.');
            }
        }
    }
    async function lerUrl(url) {
        const alvos = state.selectedOSItems?.length > 1 ? state.selectedOSItems : [state.activeOSItem].filter(Boolean);
        validarTrabalho(alvos);
        const candidatos = [];
        for (const alvo of alvos) {
            const {pacote} = liberados.get(chave(alvo.itemId, alvo.osId));
            for (const [nome, origem] of Object.entries(pacote.fontes)) if (origem === url) candidatos.push([pacote, nome]);
        }
        if (!candidatos.length) throw Error('Recurso não preparado localmente. Selecione novamente o modelo.');
        if (new Set(candidatos.map(([p,n]) => p.hashes?.[n])).size > 1) throw Error('Modelos usam versões diferentes do mesmo arquivo. Selecione novamente os modelos.');
        return lerArte(candidatos[0][0], candidatos[0][1], url);
    }
    function referencias(alvos) {
        validarTrabalho(alvos);
        return alvos.map(a => {
            const p = liberados.get(chave(a.itemId, a.osId)).pacote;
            return {modelo:p.modelo, revisao:p.revisao};
        });
    }
    function chaveRecurso(url) {
        const locais = [...liberados.values()].flatMap(({pacote:p}) => Object.entries(p.fontes || {})
            .filter(([,u]) => u === url).map(([n]) => ({chave:p.recursos[n], hash:p.hashes?.[n]})));
        if (new Set(locais.map(l => l.hash)).size > 1) throw Error('Revisões locais divergentes. Reabra o pedido.');
        return locais[0]?.chave || url;
    }
    window.PilotoSelecao = {iniciarPedido, conferirPedido, conferir, lerArte, lerUrl, validarTrabalho, referencias, chaveRecurso};
    // A injeção exclusiva do Piloto ocorre depois do script principal. Manter
    // o fluxo original e acompanhar também seus retornos antecipados e erros.
    const abrirPedido = window.abrirImposicaoDoPedido;
    if (typeof abrirPedido === 'function') {
        window.abrirImposicaoDoPedido = async function (...argumentos) {
            const fechar = mostrarConferencia();
            try {
                return await abrirPedido.apply(this, argumentos);
            } finally {
                fechar();
            }
        };
    }
})();
