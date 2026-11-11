(function (root) {
    'use strict';
    const ativos = new Set(['aceito', 'gerando', 'enviando', 'cancelando']);
    let base = null, atual = null, registros = [], painel = null, consultando = false;
    const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function api(caminho, opcoes = {}) {
        const resposta = await fetch(base + '/api/print/trabalhos' + caminho, {
            ...opcoes, signal: AbortSignal.timeout(15000)
        });
        if (!resposta.ok) throw new Error('Não foi possível consultar ou alterar o trabalho na estação.');
        return resposta.json();
    }
    function mostrar() {
        if (!painel) {
            painel = document.createElement('section');
            painel.id = 'impressao-autonoma-andamento';
            Object.assign(painel.style, {position:'fixed', right:'16px', bottom:'55px', zIndex:10002,
                maxWidth:'390px', maxHeight:'45vh', overflow:'auto', padding:'12px', borderRadius:'8px',
                background:'#172334', color:'#fff', boxShadow:'0 2px 12px #0006'});
            document.body.appendChild(painel);
        }
        painel.replaceChildren();
        const titulo = document.createElement('strong');
        titulo.textContent = 'Impressão na estação'; painel.appendChild(titulo);
        for (const item of registros.slice(0, 3)) {
            const linha = document.createElement('div'); linha.style.marginTop = '8px';
            const texto = document.createElement('div');
            const estado = {aceito:'Aceito',gerando:'Gerando',enviando:'Enviando',enviado:'Enviado ao Windows',
                cancelado:'Cancelado após o último envio',conferencia:'Confira a fila e as folhas',encerrado:'Conferido'}[item.estado] || item.estado;
            texto.textContent = `${item.id.slice(0,8)} — ${estado}. ${item.enviados} lote(s), ${item.paginas_enviadas} página(s) enviadas.`;
            linha.appendChild(texto);
            if (ativos.has(item.estado) || item.estado === 'conferencia') {
                const botao = document.createElement('button');
                botao.textContent = ativos.has(item.estado) ? 'Cancelar próximos lotes' : 'Já conferi a fila e as folhas';
                botao.onclick = async () => {
                    botao.disabled = true;
                    try {
                        if (item.estado === 'conferencia') {
                            if (!confirm('Confirma que conferiu a fila e as folhas já impressas? Isto encerra o registro; nenhum lote será reenviado.')) return;
                            await api('/' + item.id + '/conferir', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conferido:true})});
                        } else await api('/' + item.id + '/cancelar', {method:'POST'});
                        await consultar();
                    } catch (e) { root.toast?.(e.message, 'error'); }
                    finally { botao.disabled = false; }
                };
                linha.appendChild(botao);
            }
            painel.appendChild(linha);
        }
        painel.hidden = !registros.length;
    }
    async function consultar() {
        if (!base || consultando) return;
        consultando = true;
        try {
            registros = (await api('')).trabalhos;
            if (atual?.cancelar && registros.some(r => r.id === atual.id && ativos.has(r.estado))) {
                await api('/' + atual.id + '/cancelar', {method:'POST'});
                atual.cancelar = false;
            }
            mostrar();
        } finally { consultando = false; }
    }
    async function cancelar() {
        if (atual) atual.cancelar = true;
        const item = registros.find(r => ativos.has(r.estado));
        try {
            if (item) await api('/' + item.id + '/cancelar', {method:'POST'});
            root.toast?.('Cancelamento solicitado. O envio em curso pode terminar; os próximos serão interrompidos.', 'info');
        } catch (_) { root.toast?.('Cancelamento ainda não confirmado. Consulte o andamento da estação.', 'error'); }
    }
    async function iniciar({baseUrl, formData, headers, destino, face, rotacionarPares, historicoContexto, signal}) {
        base = baseUrl;
        const versao = await fetch(base + '/api/version', {signal:AbortSignal.timeout(15000)});
        const info = versao.ok ? await versao.json() : null;
        if (!info?.capabilities?.includes('impressao_autonoma_v1')) throw new Error('Atualize o NewProd para imprimir sem depender da conexão do painel.');
        if (signal?.aborted) throw new Error('Impressão cancelada antes do envio ao agente.');
        try { localStorage.setItem('newprod_impressao_autonoma_base', base); } catch (_) { /* armazenamento opcional */ }
        const payload = JSON.parse(formData.get('payload'));
        payload.impressao_autonoma = { ...structuredClone(destino), face, rotacionar_pares:rotacionarPares,
            experimental:!!destino.options.experimental, historico_contexto:historicoContexto };
        if (face !== 'both') payload.impressao_autonoma.options.duplex = 1;
        formData.set('payload', JSON.stringify(payload));
        atual = {id:payload.integridade.job_id, cancelar:false};
        const botao = document.getElementById('btn-cancel-imposition');
        if (botao) botao.onclick = cancelar;
        try {
            // Uma unica submissao. Resposta perdida e reconciliada pela consulta;
            // nunca repetir POST /impose ou interpretar uma queda como cancelamento.
            const resposta = await fetch(base + '/api/impose', {method:'POST',headers,body:formData});
            if (!resposta.ok) {
                const erro = await resposta.json().catch(() => ({}));
                throw new Error(erro.detail || 'Trabalho não aceito; consulte o andamento da estação.');
            }
            const aceite = await resposta.json();
            if (aceite.type !== 'impressao_autonoma') throw new Error('Resposta inesperada. Confira o andamento antes de iniciar novamente.');
            root.toast?.('Trabalho aceito pelo agente. Fechar o painel não cancela a impressão.', 'info');
            while (true) {
                try {
                    await consultar();
                    const item = registros.find(r => r.id === atual.id);
                    if (item && !ativos.has(item.estado)) {
                        if (item.estado === 'conferencia') throw new Error('Impressão interrompida. Confira a fila e as folhas antes de iniciar outro trabalho.');
                        return item.estado === 'enviado';
                    }
                } catch (erro) {
                    if (registros.some(r => r.id === atual.id && r.estado === 'conferencia')) throw erro;
                    root.toast?.('Acompanhamento indisponível. O agente pode continuar imprimindo; não reenvie o trabalho.', 'warning');
                }
                await pausa(3000);
            }
        } finally { atual = null; }
    }
    root.ImpressaoAutonoma = {iniciar, cancelar, consultar,
        ocupada:() => !!atual || registros.some(r => ativos.has(r.estado) || r.estado === 'conferencia')};
    async function localizar() {
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return location.origin;
        let anterior = null;
        try {
            const u = new URL(localStorage.getItem('newprod_impressao_autonoma_base'));
            if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)
                && ['9000','9001'].includes(u.port)) anterior = u.origin;
        } catch (_) { /* sem endereco anterior */ }
        for (const candidato of [...new Set([anterior, 'http://127.0.0.1:9001', 'http://127.0.0.1:9000'].filter(Boolean))]) {
            try {
                const r = await fetch(candidato + '/api/version', {signal:AbortSignal.timeout(2000)});
                if (r.ok && (await r.json()).capabilities?.includes('impressao_autonoma_v1')) return candidato;
            } catch (_) { /* proxima porta local */ }
        }
        return null;
    }
    async function observar() {
        if (!base) base = await localizar();
        try { await consultar(); } catch (_) { /* Desconexao nunca cancela o trabalho local. */ }
        setTimeout(observar, 10000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar, {once:true});
    else observar();
})(window);
