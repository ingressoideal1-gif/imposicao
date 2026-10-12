/* Exclusivo do painel local: dados preparados pelo agente, sem escrita comercial direta. */
(function () {
    'use strict';
    let pendente;
    async function pedir(path, body) {
        const r = await fetch('/api/pacotes-locais/' + path, body === undefined ? {cache:'no-store'} : {
            method:'POST', headers:{'Content-Type':'application/json','X-Piloto-Painel':'1'}, body:JSON.stringify(body)
        });
        if (!r.ok) throw Error('Dados locais indisponíveis (HTTP ' + r.status + '). Aguarde a preparação da estação.');
        return r.json();
    }
    function bootstrap() {
        if (!pendente) {
            pendente = pedir('offline-painel').then(b => {
                if (typeof document !== 'undefined') {
                    const parent = document.getElementById('user-profile-bar');
                    let aviso = document.getElementById('newprod-confirmacoes-locais');
                    if (!aviso && parent) {
                        aviso = document.createElement('span'); aviso.id = 'newprod-confirmacoes-locais';
                        aviso.setAttribute('role','status'); parent.appendChild(aviso);
                    }
                    const filas = b.confirmacoes || [];
                    const conflitos = filas.filter(c => c.estado === 'conflito').length;
                    const aguardando = filas.filter(c => c.estado === 'pendente').length;
                    const preparo = b.preparacao;
                    const lista = b.lista?.lista?.pedidos;
                    const prontos = new Set((b.pedidos || []).map(p => String(p.pedido)));
                    const estado = Array.isArray(lista)
                        ? `Lista: ${lista.length} pedido(s). Offline: ${lista.filter(p => prontos.has(String(p.id_int))).length} preparado(s). `
                        : preparo ? `Lista completa aguardando sincronização. Offline: ${preparo.prontos} pedido(s) preparado(s). ` : '';
                    if (aviso) aviso.textContent = estado + (conflitos ? `${conflitos} confirmação(ões) com divergência no banco; solicitar revisão.`
                        : aguardando ? `${aguardando} confirmação(ões) guardada(s), aguardando sincronização.` : '');
                }
                return b;
            });
            setTimeout(() => { pendente = null; }, 30000);
        }
        return pendente;
    }
    function unir(registros, chave, id='id') {
        const mapa = new Map();
        for (const r of registros) for (const row of r.snapshot?.[chave] || []) mapa.set(String(row[id]), row);
        return [...mapa.values()];
    }
    async function catalogo(path) {
        const b = await bootstrap();
        if (!b.catalogos) throw Error('Os catálogos ainda não foram preparados nesta estação. Conecte uma vez para concluir o download.');
        const [nome,id] = path.replace(/^\//,'').split('/');
        const rows = nome === 'numeracoes' ? unir(b.pedidos,'numeracoes') : b.catalogos[nome];
        if (!Array.isArray(rows)) throw Error('Catálogo local indisponível.');
        const lista = structuredClone(rows);
        if (nome === 'numeracoes') lista.forEach(normalizarNumeracaoLida);
        return id ? lista.find(r => String(r.id) === id) : lista;
    }
    async function carregarOrdens() {
        const b = await bootstrap();
        const registros = b.pedidos || [];
        const lista = b.lista?.lista;
        // A lista comercial nao depende do download completo das artes e bancos.
        const dados = chave => lista ? lista[chave] : unir(registros,chave,
            ['pedidos','prazos'].includes(chave) ? 'id_int' : chave === 'produtos' ? 'id_produto' : 'id');
        state.todasArtes = dados('artes');
        state.produtosGlobais = dados('produtos');
        const propostas = dados('pedidos');
        const ok = await loadOrdensFromVibecode(propostas, dados('origens'), {
            propostasPreloaded:propostas, prazosPreloaded:dados('prazos'),
            localPreparado:true, recorteGrafica:'producao', propagarErro:true, artes:state.todasArtes
        });
        state.modelosGlobais = {};
        for (const modelo of structuredClone(dados('modelos'))) {
            modelo.impressao = typeof normalizarStatusImpressao === 'function'
                ? normalizarStatusImpressao(modelo.status_impressao || modelo.status_producao) : modelo.status_impressao;
            modelo.quantidade = parseInt(modelo.quantidade || 0);
            modelo.amostra_status = modelo.status_arte || modelo.amostra_status || '';
            modelo.modelo = modelo.nome_modelo || '';
            if (typeof aplicarRegraProdutoPrateleira === 'function') aplicarRegraProdutoPrateleira(modelo);
            (state.modelosGlobais[modelo.id_int] ||= []).push(modelo);
        }
        const prontos = new Set(registros.map(r => String(r.pedido)));
        for (const os of state.ordens || []) os._disponivelOffline = prontos.has(String(os.numero));
        if (!lista && !registros.length) toast('A lista ainda não foi sincronizada nesta estação. Conecte para baixá-la.', 'warning');
        renderOrdens();
        return ok;
    }
    async function conferencia(alvos) {
        const pedidos = [...new Set(alvos.map(a => String(a.osId)))];
        const referencias = pedidos.map(osId => {
            const r = window.PilotoSelecao.revisaoPedido(osId);
            if (!r) throw Error('Reabra o pedido para conferir a revisão local.');
            return r;
        });
        const dados = await pedir('conferencia-trabalho-painel', referencias);
        return {
            referencias,
            tabelas: {
                pedidos_modelos:unir(dados.pedidos,'modelos'),
                producao_numeracoes:unir(dados.pedidos,'numeracoes'),
                producao_formatos:dados.catalogos.formatos,
                producao_saidas:dados.catalogos.saidas
            },
            bancos:id => {
                const r=dados.pedidos.find(p=>String(p.pedido)===String(id));
                if (!r) throw Error('Banco de outro pedido.');
                return {bancos:structuredClone(r.snapshot.bancos),vinculos:structuredClone(r.snapshot.vinculos)};
            }
        };
    }
    async function confirmar(alvos) {
        const grupos = new Map();
        for (const a of alvos) {
            const r = window.PilotoSelecao.revisaoPedido(a.osId);
            if (!r) throw Error('Revisão local não identificada.');
            if (!grupos.has(r.pedido)) grupos.set(r.pedido, {...r, id:crypto.randomUUID(), modelos:[]});
            grupos.get(r.pedido).modelos.push(String(a.itemId));
        }
        for (const dados of grupos.values()) await pedir('confirmar-impressao-painel', dados);
        for (const a of alvos) {
            const item = (state.osItens[a.osId] || []).find(i => String(i.id) === String(a.itemId));
            if (item) { item.impressao = 'IMPRESSO'; item.status_impressao = 'IMPRESSO'; item._confirmacaoLocalPendente = true; }
        }
        if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
        pendente = null;
        toast('Confirmação guardada nesta estação. O banco será atualizado quando houver conexão; nenhum arquivo será reenviado à impressora.', 'success');
        return true;
    }
    async function aplicarConfirmacoes(osId) {
        const b = await bootstrap();
        const numero = String(osId).replace(/^vibe_/, '');
        const atual = b.pedidos.find(p => p.pedido === numero);
        for (const c of b.confirmacoes || []) {
            if (c.dados.pedido !== numero || c.estado === 'conflito' || c.dados.revisao !== atual?.revisao) continue;
            for (const item of state.osItens[osId] || []) if (c.dados.modelos.includes(String(item.id))) {
                item.impressao = 'IMPRESSO'; item.status_impressao = 'IMPRESSO';
                item._confirmacaoLocalPendente = c.estado === 'pendente';
            }
        }
    }
    window.PilotoOffline = {bootstrap,catalogo,carregarOrdens,conferencia,confirmar,aplicarConfirmacoes};
})();
