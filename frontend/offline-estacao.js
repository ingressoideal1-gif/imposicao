/* Exclusivo do painel local: dados preparados pelo agente, sem escrita comercial direta. */
(function () {
    'use strict';
    let pendente;
    // Somente decisoes explicitamente confirmadas na rede entram neste mapa.
    // Uma leitura iniciada antes da gravacao nao pode apagar a confirmacao.
    const confirmadosRede = new Map();
    const chaveStatus = (pedido, modelo) => String(pedido) + ':' + String(modelo);
    const impresso = item => String(item?.status_impressao || item?.impressao || '').trim().toUpperCase() === 'IMPRESSO';
    const emCorrecao = item => normalizarStatusImpressao(item?.status_impressao || item?.impressao) === 'Corrigir Arte';
    const horaStatus = item => Date.parse(item?.status_impressao_registrado_em || item?.status_impressao_em || '') || 0;
    function registrarStatusConfirmado(row) {
        confirmadosRede.set(chaveStatus(row.id_int, row.id), {...row});
        pendente = null;
    }
    function aplicarStatus(item, row) {
        for (const campo of ['status_impressao', 'status_impressao_em', 'status_impressao_registrado_em']) {
            item[campo] = row[campo] ?? null;
        }
        item.impressao = normalizarStatusImpressao(row.status_impressao);
        item._confirmacaoLocalPendente = false;
    }
    async function lerStatusDaRede(modelos) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient || !modelos.length) return false;
        const porId = new Map(modelos.map(m => [String(m.id), m]));
        const ids = [...porId.keys()];
        try {
            for (let i=0; i<ids.length; i+=100) {
                const lote=ids.slice(i,i+100);
                const {data,error}=await supabaseClient.from('pedidos_modelos')
                    .select('id,id_int,status_impressao,status_impressao_em,status_impressao_registrado_em').in('id',lote);
                if (error) throw error;
                if (!Array.isArray(data) || data.length!==lote.length || new Set(data.map(r=>String(r.id))).size!==lote.length
                    || data.some(r=>!lote.includes(String(r.id)) || String(r.id_int)!==String(porId.get(String(r.id))?.id_int))) {
                    throw Error('Leitura de status incompleta.');
                }
                for (const row of data) {
                    const item=porId.get(String(row.id));
                    // Atualizacao automatica nunca rebaixa uma impressao observada.
                    // Retorno deliberado e tratado pelo recibo da acao do operador.
                    if (!impresso(item) || impresso(row) || emCorrecao(row)) aplicarStatus(item,row);
                    const chave=chaveStatus(row.id_int,row.id), anterior=confirmadosRede.get(chave);
                    if ((impresso(row) || emCorrecao(row)) && (!anterior || horaStatus(row)>horaStatus(anterior))) confirmadosRede.set(chave,{...row});
                }
            }
            return true;
        } catch (e) {
            console.warn('Status da rede indisponivel; preservando a confirmacao local.', e);
            return false;
        }
    }

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
    function aplicarCatalogos(dados) {
        const campos = {formatos:'formatos', saidas:'saidas'};
        if (Object.keys(campos).some(k => !Array.isArray(dados[k]))) throw Error('Catálogo local incompleto.');
        for (const [origem, destino] of Object.entries(campos)) state[destino] = structuredClone(dados[origem]);
        // Descarta o bootstrap anterior; a próxima consulta lê o catálogo persistido.
        pendente = null;
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
        // Listas antigas nao traziam nomeReal. Recuperar apenas nomes de produto
        // inequivocos das origens, sem usar o nome do modelo nem alterar snapshots.
        const nomesPorProduto = new Map();
        for (const origem of dados('origens')) {
            const nome = String(origem.nome_produto || '').trim();
            if (origem.id_produto == null || !nome) continue;
            const id = String(origem.id_produto);
            if (!nomesPorProduto.has(id)) nomesPorProduto.set(id, new Set());
            nomesPorProduto.get(id).add(nome);
        }
        state.produtosGlobais = dados('produtos').map(produto => {
            if (String(produto.nomeReal || '').trim()) return {...produto};
            const nomes = nomesPorProduto.get(String(produto.id_produto));
            return nomes?.size === 1 ? {...produto, nomeReal: [...nomes][0]} : {...produto};
        });
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
        await lerStatusDaRede(Object.values(state.modelosGlobais).flat());
        for (const os of state.ordens || []) aplicarConfirmacoesDoPedido(os.id, b);
        const prontos = new Set(registros.map(r => String(r.pedido)));
        for (const os of state.ordens || []) os._disponivelOffline = prontos.has(String(os.numero));
        if (!lista && !registros.length) toast('A lista ainda não foi sincronizada nesta estação. Conecte para baixá-la.', 'warning');
        renderOrdens();
        return ok;
    }
    async function conferencia(alvos) {
        const b = await bootstrap();
        for (const osId of new Set(alvos.map(a => a.osId))) aplicarConfirmacoesDoPedido(osId, b);
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
        for (const alvo of alvos) {
            if (!await updateItemImpressao(alvo.itemId, alvo.osId, 'Impresso')) return false;
        }
        if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
        if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
        if (typeof updatePedImprimirButtonsVisibility === 'function') updatePedImprimirButtonsVisibility();
        return true;
    }
    async function aplicarConfirmacoes(osId) {
        const b = await bootstrap();
        const numero=String(osId).replace(/^vibe_/, '');
        await lerStatusDaRede((state.osItens[osId] || []).map(m => { m.id_int ??= Number(numero); return m; }));
        aplicarConfirmacoesDoPedido(osId, b);
    }
    async function iniciarDecisao(itemId, osId, status) {
        const dados = {id:crypto.randomUUID(), pedido:String(osId).replace(/^vibe_/, ''),
            modelo:String(itemId), status, acao:'iniciar'};
        await pedir('decisao-impressao-painel', dados);
        pendente = null;
        return dados;
    }
    async function encerrarDecisao(dados, concluir=true, confirmado=null) {
        await pedir('decisao-impressao-painel', {...dados, acao:concluir ? 'concluir' : 'cancelar', ...(confirmado ? {confirmado} : {})});
        pendente = null;
        await aplicarConfirmacoes('vibe_' + dados.pedido);
    }
    function aplicarConfirmacoesDoPedido(osId, b) {
        const numero = String(osId).replace(/^vibe_/, '');
        const modelos = [...(state.osItens[osId] || []), ...(state.modelosGlobais[numero] || [])];
        const vistos = new Set();
        for (const c of b.confirmacoes || []) {
            if (String(c.dados.pedido) !== numero || ['manual_pendente','cancelada'].includes(c.estado)) continue;
            for (const id of c.dados.modelos.map(String)) {
                if (vistos.has(id)) continue;
                vistos.add(id);
                const chave=chaveStatus(numero,id);
                const ack=c.dados.confirmado;
                const anterior=confirmadosRede.get(chave);
                if (ack && (!anterior || horaStatus(ack)>horaStatus(anterior))) confirmadosRede.set(chave,{...ack});
                for (const item of modelos.filter(m=>String(m.id)===id)) {
                    // Confirmacoes antigas de impressao continuam protegidas e visiveis
                    // como pendentes. Uma decisao antiga Aguardando nao vence Impresso.
                    if (!ack && !confirmadosRede.has(chave) && !emCorrecao(item) && (c.estado!=='manual' || c.dados.status==='Impresso')) {
                        const jaImpresso=impresso(item);
                        item.status_impressao='IMPRESSO'; item.impressao='Impresso';
                        item._confirmacaoLocalPendente=!jaImpresso && c.estado!=='sincronizado';
                    }
                }
            }
        }
        for (const item of modelos) {
            const ack=confirmadosRede.get(chaveStatus(numero,item.id));
            if (!ack) continue;
            if (emCorrecao(item) && horaStatus(item)>=horaStatus(ack)) continue;
            // O recibo local e uma acao explicita. Pode liberar Aguardando apenas
            // se nao houver uma confirmacao mais recente de Impresso na rede.
            if (impresso(ack) || !impresso(item) || horaStatus(ack)>horaStatus(item)) aplicarStatus(item,ack);
        }
    }
    window.PilotoOffline = {bootstrap,catalogo,carregarOrdens,conferencia,confirmar,aplicarConfirmacoes,aplicarCatalogos,iniciarDecisao,encerrarDecisao,registrarStatusConfirmado};
})();
