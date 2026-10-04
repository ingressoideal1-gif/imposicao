// Instalado somente pela injeção opt-in do agente piloto.
(function () {
    'use strict';
    const liberados = new Map();
    const chave = (id, os) => String(os) + ':' + String(id);
    const canonico = v => Array.isArray(v) ? v.map(canonico) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
    async function digest(v) {
        const bytes = new TextEncoder().encode(JSON.stringify(canonico(v)));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async function conferir(itemId, osId, atual) {
        if (!atual()) return null;
        liberados.delete(chave(itemId, osId));
        const pedido = findOSInState(osId);
        if (!pedido || !/^[1-9][0-9]*$/.test(String(itemId))) throw Error('Modelo de produção não identificado.');
        toast('Conferindo o modelo e preparando arquivos locais. Aguarde para imprimir.', 'info');
        const antes = (getOSItens(osId) || []).find(i => String(i.id) === String(itemId));
        const anterior = JSON.stringify(antes?._modeloOnline || null);
        if (await loadOSItens(osId, { atualizar:true, exigirModelos:true }) === false) throw Error('Consulta dos modelos não concluída.');
        if (!atual()) return null;
        const item = (getOSItens(osId) || []).find(i => String(i.id) === String(itemId));
        if (!item?._modeloOnline) throw Error('O modelo não está mais disponível.');
        if (anterior !== JSON.stringify(item._modeloOnline)) toast('Modelo atualizado. Preparando a nova versão local antes de liberar a impressão.', 'info');
        const numero = item._modeloOnline.amostra_num_id || item._modeloOnline.numeracao_id;
        let nums = [];
        if (numero) {
            const r = await supabaseClient.from('producao_numeracoes').select('*').eq('id', numero)
                .abortSignal(AbortSignal.timeout(30000));
            if (r.error || r.data?.length !== 1) throw Error('Numeração não conferida.');
            nums = r.data;
        }
        if (!atual()) return null;
        const hash = await digest([item._modeloOnline, nums]);
        const r = await fetch('/api/pacotes-locais/selecionar-painel', {
            method:'POST', headers:{'Content-Type':'application/json','X-Piloto-Painel':'1'},
            body:JSON.stringify({modelo:String(itemId), pedido:String(pedido.numero), digest:hash}),
            signal:AbortSignal.timeout(180000)
        });
        if (!r.ok) throw Error('Conferência ou atualização local não concluída. Selecione o modelo novamente.');
        const pacote = await r.json();
        if (!atual()) return null;
        if (pacote.modelo !== String(itemId) || pacote.digest !== hash || pacote.origem !== 'local'
            || !/^[a-f0-9]{64}$/.test(pacote.revisao)) throw Error('Resposta local não corresponde à seleção.');
        if (pacote.atualizado) toast('Arquivos atualizados no disco. Carregando a prévia local.', 'info');
        // Substitui o registro correspondente, preservando os outros modelos.
        for (const num of nums) {
            const indice = state.numeracoes.findIndex(n => String(n.id) === String(num.id));
            if (indice < 0) state.numeracoes.push(num); else state.numeracoes[indice] = num;
        }
        liberados.set(chave(itemId, osId), {pacote, modelo:JSON.stringify(canonico(item._modeloOnline))});
        // A URL pode permanecer igual após troca de bytes. Não reaproveitar
        // páginas rasterizadas de outra revisão na combinação.
        state.multiArtesPdfCache = {};
        return pacote;
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
                throw Error('Selecione novamente cada modelo do trabalho para conferir a versão local.');
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
    window.PilotoSelecao = {conferir, lerArte, lerUrl, validarTrabalho};
})();
