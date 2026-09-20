/*
 * Produção por Cor
 *
 * Lista modelos por produto/cor e usa a janela compartilhada do Pedido.
 * A carga de pedidos e as gravações continuam nos caminhos comuns do painel.
 */
(function () {
    'use strict';

    const local = {
        active: false,
        loading: false,
        records: [],
        colors: [],
        productKey: '',
        colorKey: '',
        openItemId: null,
        openOSId: null,
        error: '',
        opening: 0,
        refreshId: 0,
        savedSelection: null,
        ready: false,
        refreshPending: false,
        statusBusy: new Set(),
    };

    const byId = id => document.getElementById(id);
    const appState = () => (typeof state !== 'undefined' ? state : null);
    const text = value => String(value === null || value === undefined ? '' : value);
    const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const esc = value => text(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    function printStatus(value) {
        return typeof normalizarStatusImpressao === 'function'
            ? normalizarStatusImpressao(value) : (value || 'Aguardando');
    }

    function modeloEstaAguardando(record) {
        return printStatus(record && record.status) === 'Aguardando';
    }

    function modelosDoFiltro(records, productKey, colorKey) {
        return (records || []).filter(record =>
            String(record.productKey) === String(productKey)
            && String(record.colorKey) === String(colorKey)
            && modeloEstaAguardando(record));
    }

    function colorInfo(model, catalog, product) {
        let resolved = null;
        if (typeof reconciliarCorNumDoModelo === 'function') {
            try { resolved = reconciliarCorNumDoModelo(model, catalog || [], []); } catch (_) {}
        }
        const colorId = (resolved && resolved.corId) || model.amostra_cor_id || model.id_cor || model.cor_id
            || (product && (product.amostra_cor_id || product.id_cor)) || null;
        const color = colorId
            ? (catalog || []).find(item => String(item.id) === String(colorId))
            : (catalog || []).find(item => norm(item.name || item.nome) === norm(model.padrao || model.cor));
        const label = (color && (color.name || color.nome)) || model.padrao || model.cor || 'Sem cor definida';
        const key = color ? `id:${color.id}` : `nome:${norm(label)}`;
        const swatch = (color && (color.cor_referencia || color.hex || color.cor_hex)) || '#64748b';
        return { key, label, swatch };
    }

    function orderNumber(order) {
        return Number.parseInt(order && (order.numero || order.id_int), 10);
    }

    async function selectInBatches(client, table, columns, values, column = 'id_int') {
        const rows = [];
        const unique = values === null ? null : Array.from(new Set(values.filter(Number.isFinite)));
        const batches = unique === null ? [null] : [];
        for (let start = 0; unique && start < unique.length; start += 100) batches.push(unique.slice(start, start + 100));
        for (const batch of batches) {
            // O limite do servidor vale para LINHAS, não para pedidos.
            // Avança pelo tamanho recebido inclusive quando o servidor reduz a página.
            for (let offset = 0; ; ) {
                let query = client.from(table).select(columns);
                if (batch !== null) query = query.in(column, batch);
                const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + 199);
                if (error) throw error;
                if (!Array.isArray(data)) throw new Error('Resposta incompleta ao carregar modelos.');
                if (!data.length) break;
                rows.push(...data);
                offset += data.length;
            }
        }
        return rows;
    }

    async function loadCatalog(name) {
        const currentState = appState();
        if (currentState && Array.isArray(currentState[name]) && currentState[name].length) {
            return currentState[name];
        }
        if (typeof window.api === 'function') {
            const rows = await window.api('GET', `/${name}`);
            if (Array.isArray(rows)) return rows;
        }
        throw new Error(`Não foi possível carregar o catálogo de ${name}.`);
    }

    async function loadRecords() {
        if (typeof window.loadOrdens !== 'function' || await window.loadOrdens() === false) {
            throw new Error('Não foi possível atualizar os pedidos. Tente atualizar a lista novamente.');
        }
        const currentState = appState();
        const orders = ((currentState && currentState.ordens) || []).slice();
        const modelsClient = typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
        const productsClient = (typeof vibeClient !== 'undefined' && vibeClient)
            ? vibeClient : modelsClient;
        if (!modelsClient || !productsClient) throw new Error('Banco de dados não disponível.');

        // A origem do dropdown são os modelos, não a fila/status do pedido.
        // Percorre todas as páginas visíveis à sessão, inclusive pedidos que
        // não entraram no cache global limitado dos painéis.
        const allModels = await selectInBatches(modelsClient, 'pedidos_modelos',
            'id,id_int,id_produto_proposta_origem,nome_modelo,quantidade,status_impressao,status_producao,status_arte,padrao,amostra_cor_id,amostra_num_id,gabarito_operacional,numeracao_inicio,numeracao_fim,verso_tipo,bloco', null);
        const models = allModels.filter(model => modeloEstaAguardando({
            status: model.status_impressao || model.status_producao || 'Aguardando',
        }));
        const numbers = models.map(model => Number(model.id_int)).filter(Number.isFinite);
        const knownOrders = new Set(orders.map(order => String(orderNumber(order))));
        const missingNumbers = numbers.filter(number => !knownOrders.has(String(number)));
        const [products, colors, numbering, missingOrders] = await Promise.all([
            selectInBatches(productsClient, 'produtos_proposta',
                'id,id_int,id_produto,nome_produto,modelo_descri,amostra_cor_id,amostra_num_id', numbers),
            loadCatalog('cores'),
            loadCatalog('numeracoes'),
            selectInBatches(productsClient, 'propostas', 'id,id_int,cliente,status_interno,id_cliente,id_faturado', missingNumbers),
        ]);

        if (typeof window.aplicarNomesPreferenciaisDasPropostas === 'function') {
            await window.aplicarNomesPreferenciaisDasPropostas(productsClient, missingOrders);
            missingOrders.forEach(order => {
                if (typeof window.nomePreferencialDaProposta === 'function') {
                    order.cliente = window.nomePreferencialDaProposta(order);
                }
            });
        }

        missingOrders.forEach(order => orders.push({ ...order, id: `vibe_${order.id_int}`, numero: order.id_int }));
        // A janela compartilhada precisa encontrar o pedido pelo mesmo id.
        // Só acrescenta metadados realmente retornados, sem inventar pedidos.
        if (currentState) {
            const currentNumbers = new Set((currentState.ordens || []).map(order => String(orderNumber(order))));
            currentState.ordens = (currentState.ordens || []).concat(orders.filter(order => !currentNumbers.has(String(orderNumber(order)))));
        }

        local.colors = colors;
        const orderMap = new Map(orders.map(order => [String(orderNumber(order)), order]));
        const productMap = new Map(products.map(product => [
            `${product.id_int}:${product.id}`,
            product,
        ]));
        // Modelos órfãos podem ter identidade própria. Só eles precisam da
        // linha completa, sem presumir colunas opcionais no schema remoto.
        const orphans = models.filter(model => !productMap.has(`${model.id_int}:${model.id_produto_proposta_origem}`));
        if (orphans.length) {
            const full = await selectInBatches(modelsClient, 'pedidos_modelos', '*',
                orphans.map(model => Number(model.id)).filter(Number.isFinite), 'id');
            const byModel = new Map(full.map(model => [String(model.id), model]));
            orphans.forEach(model => Object.assign(model, byModel.get(String(model.id)) || {}));
        }

        return models.map(model => {
            const order = orderMap.get(String(model.id_int));
            const product = productMap.get(`${model.id_int}:${model.id_produto_proposta_origem}`) || null;
            const productId = (product && product.id_produto) ?? model.id_produto ?? model.produto_id;
            const catalogProduct = ((currentState && currentState.produtosGlobais) || [])
                .find(item => productId != null && String(item.id_produto) === String(productId));
            const productLabel = (product && product.nome_produto)
                || (catalogProduct && (catalogProduct.nome_produto || catalogProduct.nome || catalogProduct.name))
                || (productId != null ? `Produto #${productId}` : `Produto não identificado · pedido #${model.id_int}`);
            const productKey = productId !== null && productId !== undefined && productId !== ''
                ? `id:${productId}` : `origem:${model.id_int}:${model.id_produto_proposta_origem || model.id}`;
            const color = colorInfo(model, colors, product);
            const ids = typeof reconciliarCorNumDoModelo === 'function'
                ? reconciliarCorNumDoModelo(model, colors, numbering) : { numId: model.amostra_num_id };
            const numId = ids.numId || (product && product.amostra_num_id);
            const num = numbering.find(item => String(item.id) === String(numId));
            const back = num && typeof window.isNumeracaoDuplex === 'function'
                ? (window.isNumeracaoDuplex(num) ? 'FxVerso' : 'Frente')
                : (['FxVerso', 'VERSO COMUM', 'VERSO VARIÁVEL', 'VERSO VARIAVEL', 'FRENTE E VERSO'].includes(model.verso_tipo) ? 'FxVerso' : 'Frente');
            return {
                modelId: model.id,
                osId: order ? order.id : `vibe_${model.id_int}`,
                orderNumber: model.id_int,
                client: (order && order.cliente) || '—',
                deadline: order && (order.prazo_entrega || order.prazo),
                productKey,
                productLabel,
                colorKey: color.key,
                colorLabel: color.label,
                colorSwatch: color.swatch,
                modelLabel: model.nome_modelo || (product && product.modelo_descri) || `Modelo ${model.id}`,
                quantity: model.quantidade || 0,
                numbering: [model.numeracao_inicio, model.numeracao_fim].filter(v => v !== null && v !== undefined && v !== '').join(' – ') || (model.gabarito_operacional || '—'),
                back,
                status: model.status_impressao || model.status_producao || 'Aguardando',
                block: model.bloco,
            };
        }).filter(record => record.osId !== null && record.osId !== undefined)
            .filter(modeloEstaAguardando);
    }

    function products() {
        const map = new Map();
        local.records.filter(modeloEstaAguardando).forEach(record => {
            if (!map.has(record.productKey)) map.set(record.productKey, record.productLabel);
        });
        return Array.from(map, ([key, label]) => ({ key, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }

    function colorsForProduct() {
        const map = new Map();
        local.records.filter(record => record.productKey === local.productKey && modeloEstaAguardando(record)).forEach(record => {
            const current = map.get(record.colorKey) || { key: record.colorKey, label: record.colorLabel, swatch: record.colorSwatch, count: 0 };
            current.count += 1;
            map.set(record.colorKey, current);
        });
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }

    function formatDate(value) {
        if (!value) return '—';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? esc(value)
            : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    function safeWindowBeforeRender() {
        const preview = byId('ped-preview-card-container');
        const home = byId('ped-preview-home');
        if (preview && home && !home.contains(preview)) home.appendChild(preview);
    }

    function restoreWindowAfterRender() {
        if (!local.active || !local.openItemId) return;
        const host = document.querySelector(`.ppc-window-host[data-item-id="${CSS.escape(String(local.openItemId))}"]`);
        const preview = byId('ped-preview-card-container');
        if (host && preview) {
            host.appendChild(preview);
            preview.style.display = 'block';
        }
    }

    function renderProducts() {
        const select = byId('ppc-product-select');
        if (!select) return;
        const list = products();
        if (!list.some(product => product.key === local.productKey)) local.productKey = '';
        const placeholder = list.length ? 'Selecione um produto' : 'Nenhum produto aguardando';
        select.innerHTML = `<option value="" ${local.productKey ? '' : 'selected'}>${placeholder}</option>`
            + list.map(product => `<option value="${esc(product.key)}" ${product.key === local.productKey ? 'selected' : ''}>${esc(product.label)}</option>`).join('');
    }

    function renderColors() {
        if (!local.productKey) {
            local.colorKey = '';
            const target = byId('ppc-color-list');
            if (target) target.innerHTML = '<div class="ppc-message">Selecione um produto.</div>';
            return;
        }
        const list = colorsForProduct();
        if (!list.some(color => color.key === local.colorKey)) local.colorKey = '';
        const target = byId('ppc-color-list');
        if (!target) return;
        target.innerHTML = list.length ? list.map(color => `
            <button type="button" class="ppc-color-button ${color.key === local.colorKey ? 'active' : ''}" data-color-key="${esc(color.key)}">
                <span class="ppc-swatch" style="--ppc-swatch:${esc(color.swatch)}"></span>
                <span>${esc(color.label)}</span><span class="ppc-count">${color.count}</span>
            </button>`).join('') : '<div class="ppc-message">Nenhuma cor para este produto.</div>';
    }

    function renderModels() {
        if (!local.active) return;
        safeWindowBeforeRender();
        const filtered = modelosDoFiltro(local.records, local.productKey, local.colorKey)
            .slice().sort((a, b) => {
                const statusRank = status => norm(status) === 'impresso' ? 2 : (norm(status) === 'corrigir arte' ? 1 : 0);
                return statusRank(a.status) - statusRank(b.status)
                    || Number(a.orderNumber) - Number(b.orderNumber)
                    || a.modelLabel.localeCompare(b.modelLabel, 'pt-BR');
            });
        if (local.openItemId && !filtered.some(record => String(record.modelId) === String(local.openItemId))) {
            closeOpenModel();
        }
        const product = products().find(item => item.key === local.productKey);
        const color = colorsForProduct().find(item => item.key === local.colorKey);
        const body = byId('ppc-model-list');
        const wrap = byId('ppc-table-wrap');
        const message = byId('ppc-message');
        const title = byId('ppc-list-title');
        const subtitle = byId('ppc-list-subtitle');
        const summary = byId('ppc-summary');
        if (title) title.textContent = product ? product.label : 'Modelos';
        if (subtitle) subtitle.textContent = color ? `${color.label} · somente modelos aguardando deste produto e desta cor` : 'Selecione uma cor.';
        if (summary) summary.textContent = filtered.length ? `${filtered.length} modelo${filtered.length === 1 ? '' : 's'}` : '';

        if (local.error || local.loading || !filtered.length) {
            if (body) body.innerHTML = '';
            if (wrap) wrap.hidden = true;
            if (message) {
                message.hidden = false;
                message.textContent = local.error || (local.loading ? 'Carregando…'
                    : (!local.productKey ? 'Selecione um produto.'
                        : (!local.colorKey ? 'Selecione uma cor.' : 'Nenhum modelo aguardando para este produto e esta cor.')));
            }
            return;
        }
        if (message) message.hidden = true;
        if (wrap) wrap.hidden = false;
        body.innerHTML = filtered.map(record => {
            const open = String(record.modelId) === String(local.openItemId);
            const normalizedStatus = typeof window.normalizarStatusImpressao === 'function'
                ? window.normalizarStatusImpressao(record.status) : record.status;
            return `
                <tr class="ppc-model-row ${open ? 'open' : ''}" data-item-id="${esc(record.modelId)}" data-os-id="${esc(record.osId)}">
                    <td class="ppc-order">#${esc(record.orderNumber)}</td>
                    <td class="ppc-model-name">${esc(record.modelLabel)}</td>
                    <td class="ppc-muted">${esc(record.client)}</td><td>${esc(record.quantity)}</td>
                    <td>${esc(record.numbering)}</td><td>${esc(record.back)}</td><td>${formatDate(record.deadline)}</td>
                    <td><select class="ppc-status" ${local.statusBusy.has(String(record.modelId)) ? 'disabled' : ''} data-status-item="${esc(record.modelId)}" data-status-os="${esc(record.osId)}">
                        <option value="Aguardando" ${normalizedStatus === 'Aguardando' ? 'selected' : ''}>Aguardando</option>
                        <option value="Impresso" ${normalizedStatus === 'Impresso' ? 'selected' : ''}>Impresso</option>
                        <option value="Corrigir Arte" ${normalizedStatus === 'Corrigir Arte' ? 'selected' : ''}>Corrigir Arte</option>
                    </select></td>
                </tr>
                ${open ? `<tr class="ppc-window-row"><td colspan="8"><div class="ppc-window-host" data-item-id="${esc(record.modelId)}"></div></td></tr>` : ''}`;
        }).join('');
        restoreWindowAfterRender();
    }

    function render() {
        if (!local.active) return;
        renderProducts();
        renderColors();
        renderModels();
    }

    function closeOpenModel() {
        local.opening += 1;
        local.ready = false;
        if (local.openItemId && typeof window.fecharJanelaDoModelo === 'function') {
            window.fecharJanelaDoModelo();
        }
        local.openItemId = null;
        local.openOSId = null;
        safeWindowBeforeRender();
    }

    async function refresh() {
        if (!local.active || local.loading) return;
        if (local.statusBusy.size) { local.refreshPending = true; return; }
        local.refreshPending = false;
        const request = ++local.refreshId;
        closeOpenModel();
        local.loading = true;
        local.error = '';
        renderModels();
        const refreshButton = byId('ppc-refresh');
        if (refreshButton) refreshButton.disabled = true;
        try {
            const records = await loadRecords();
            if (!local.active || request !== local.refreshId) return;
            local.records = records;
        } catch (error) {
            console.error('[Produção por Cor] Falha ao carregar:', error);
            if (!local.active || request !== local.refreshId) return;
            local.records = [];
            local.error = `Não foi possível carregar: ${error.message || error}`;
        } finally {
            if (request === local.refreshId) {
                local.loading = false;
                if (refreshButton) refreshButton.disabled = false;
                render();
            }
        }
    }

    async function waitForItemLoad(osId, timeoutMs = 10000) {
        const started = Date.now();
        const currentState = appState();
        while (currentState && currentState._loadingOSItens && currentState._loadingOSItens[osId]) {
            if (Date.now() - started >= timeoutMs) throw new Error('Tempo excedido ao carregar o modelo.');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    async function loadFullItem(itemId, osId) {
        await waitForItemLoad(osId);
        await window.loadOSItens(osId);
        await waitForItemLoad(osId);
        let items = typeof window.getOSItens === 'function' ? window.getOSItens(osId) : [];
        let item = items.find(candidate => String(candidate.id) === String(itemId));
        if (item && item._dbLoaded === true) return item;

        // Se outra abertura havia deixado apenas a pré-carga global, pede a
        // carga completa novamente e só então permite que a imposição escolha
        // entre a arte do modelo e a cor. É o mesmo item usado pelo Pedido.
        await window.loadOSItens(osId);
        await waitForItemLoad(osId);
        items = typeof window.getOSItens === 'function' ? window.getOSItens(osId) : [];
        item = items.find(candidate => String(candidate.id) === String(itemId));
        return item && item._dbLoaded === true ? item : null;
    }

    async function openModel(itemId, osId) {
        if (!local.active || local.loading || local.error || local.statusBusy.size) return;
        const record = modelosDoFiltro(local.records, local.productKey, local.colorKey)
            .find(item => String(item.modelId) === String(itemId) && String(item.osId) === String(osId));
        if (!record) return;
        if (String(local.openItemId) === String(itemId) && typeof window.fecharJanelaDoModelo === 'function') {
            closeOpenModel();
            return;
        }
        if (typeof window.loadOSItens !== 'function' || typeof window.enviarParaPedido !== 'function') {
            if (typeof window.toast === 'function') window.toast('Janela de Pedido indisponível.', 'error');
            return;
        }
        closeOpenModel();
        const request = local.opening;
        const aindaAtual = () => local.active && request === local.opening && modeloEstaAguardando(record);
        let fullItem = null;
        try {
            fullItem = await loadFullItem(itemId, osId);
        } catch (error) {
            console.error('[Produção por Cor] Falha ao carregar modelo completo:', error);
        }
        if (!aindaAtual()) return;
        if (!fullItem) {
            if (typeof window.toast === 'function') window.toast('Não foi possível carregar a arte completa deste modelo.', 'error');
            return;
        }
        record.status = fullItem.status_impressao || fullItem.impressao || fullItem.status_producao || 'Aguardando';
        if (!modeloEstaAguardando(record)) { render(); return; }
        const shared = appState();
        shared.selectedOSItems = [];
        shared.combinacaoEntrePedidos = false;
        shared.pedArtFile = null;
        shared.pedArtVersoFile = null;
        const fileInput = byId('ped-file');
        if (fileInput) fileInput.value = '';
        local.openItemId = itemId;
        local.openOSId = osId;
        renderModels();
        try {
            await window.enviarParaPedido(itemId, osId, { aindaAtual });
            if (aindaAtual()) local.ready = true;
        } catch (error) {
            if (!aindaAtual()) return;
            closeOpenModel();
            if (typeof window.toast === 'function') window.toast(`Não foi possível abrir o modelo: ${error.message || error}`, 'error');
        }
    }

    async function changeStatus(select) {
        const itemId = select.dataset.statusItem;
        const osId = select.dataset.statusOs;
        if (!local.active || local.loading || local.error || local.statusBusy.has(String(itemId))) return;
        const record = local.records.find(item => String(item.modelId) === String(itemId) && String(item.osId) === String(osId));
        if (!record) return;
        const status = select.value;
        const pageRequest = local.refreshId;
        local.statusBusy.add(String(itemId));
        select.disabled = true;
        try {
            const item = await loadFullItem(itemId, osId);
            if (!item) throw new Error('Modelo não carregado. Atualize a lista e tente novamente.');
            // Sair da página durante a carga não deve disparar uma gravação atrasada.
            if (!local.active || pageRequest !== local.refreshId || !local.records.includes(record)) return;
            const confirmed = await window.updateItemImpressao(itemId, osId, status);
            if (confirmed === true) record.status = printStatus(status);
        } catch (error) {
            if (typeof window.toast === 'function') window.toast(error.message || String(error), 'error');
        } finally {
            local.statusBusy.delete(String(itemId));
            select.disabled = false;
            select.value = printStatus(record.status);
            render();
            if (local.active && local.refreshPending && !local.statusBusy.size) await refresh();
        }
    }

    function bind() {
        const product = byId('ppc-product-select');
        const colors = byId('ppc-color-list');
        const body = byId('ppc-model-list');
        const refreshButton = byId('ppc-refresh');
        if (product && !product.dataset.ppcBound) {
            product.dataset.ppcBound = '1';
            product.addEventListener('change', () => {
                closeOpenModel();
                local.productKey = product.value;
                local.colorKey = '';
                render();
            });
        }
        if (colors && !colors.dataset.ppcBound) {
            colors.dataset.ppcBound = '1';
            colors.addEventListener('click', event => {
                const button = event.target.closest('[data-color-key]');
                if (!button) return;
                closeOpenModel();
                local.colorKey = button.dataset.colorKey;
                renderColors(); renderModels();
            });
        }
        if (body && !body.dataset.ppcBound) {
            body.dataset.ppcBound = '1';
            body.addEventListener('click', event => {
                if (event.target.closest('.ppc-status')) return;
                const row = event.target.closest('.ppc-model-row');
                if (row) openModel(row.dataset.itemId, row.dataset.osId);
            });
            body.addEventListener('change', async event => {
                const select = event.target.closest('.ppc-status');
                if (!select || typeof window.updateItemImpressao !== 'function') return;
                await changeStatus(select);
            });
        }
        if (refreshButton && !refreshButton.dataset.ppcBound) {
            refreshButton.dataset.ppcBound = '1';
            refreshButton.addEventListener('click', refresh);
        }
    }

    function openPage() {
        if (!local.active) {
            const shared = appState();
            local.savedSelection = shared ? {
                selectedOSItems: shared.selectedOSItems,
                combinacaoEntrePedidos: shared.combinacaoEntrePedidos,
                pedidoAberto: shared.pedidoAberto,
            } : null;
            if (typeof window.fecharJanelaDoModelo === 'function') window.fecharJanelaDoModelo();
            if (shared) { shared.selectedOSItems = []; shared.combinacaoEntrePedidos = false; }
        }
        local.active = true;
        closeOpenModel();
        local.productKey = '';
        local.colorKey = '';
        bind();
        return refresh();
    }

    function leavePage() {
        if (!local.active) return;
        closeOpenModel();
        local.active = false;
        local.refreshId += 1;
        local.loading = false;
        const shared = appState();
        if (shared && local.savedSelection) Object.assign(shared, local.savedSelection);
        local.savedSelection = null;
    }

    window.PedidoJanelaExterna = {
        validarGeracao() {
            if (!local.active) return null;
            const request = local.opening;
            return () => local.active && local.ready && request === local.opening
                && !local.loading && !local.error && !local.statusBusy.size
                && String(appState().activeOSItem?.itemId) === String(local.openItemId)
                && String(appState().activeOSItem?.osId) === String(local.openOSId)
                && !(appState().selectedOSItems || []).length;
        },
        obterHost(itemId) {
            if (!local.active || String(local.openItemId) !== String(itemId)) return null;
            return document.querySelector(`.ppc-window-host[data-item-id="${CSS.escape(String(itemId))}"]`);
        },
        manterForaDaCasa() { return local.active && !!local.openItemId; },
        manterViewAtual(itemId, osId) {
            return local.active && String(local.openItemId) === String(itemId) && String(local.openOSId) === String(osId);
        },
        aoFechar() {
            if (!local.active) return;
            local.opening += 1;
            local.ready = false;
            local.openItemId = null;
            local.openOSId = null;
            setTimeout(() => { if (local.active) renderModels(); }, 0);
        },
    };

    window.addEventListener('pedidos-modelo-status-impressao', event => {
        const detail = event.detail || {};
        const record = local.records.find(item => String(item.modelId) === String(detail.itemId)
            && String(item.osId) === String(detail.osId));
        if (record) record.status = detail.status;
        if (local.active) render();
    });

    window.ProducaoPorCorPainel = { abrir: openPage, sair: leavePage, atualizar: refresh };
    window.ProducaoPorCorUtils = { modelosDoFiltro };
}());
