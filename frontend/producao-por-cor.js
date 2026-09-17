/*
 * Produção por Cor
 *
 * Módulo independente. Ele só lê os modelos ao abrir a view e delega toda
 * imposição e toda gravação de status às funções já usadas pelo Pedido.
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

    function colorInfo(model, catalog) {
        let resolved = null;
        if (typeof reconciliarCorNumDoModelo === 'function') {
            try { resolved = reconciliarCorNumDoModelo(model, catalog || [], []); } catch (_) {}
        }
        const colorId = (resolved && resolved.corId) || model.amostra_cor_id || null;
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

    async function selectInBatches(client, table, columns, values) {
        const rows = [];
        const unique = Array.from(new Set(values.filter(Number.isFinite)));
        for (let start = 0; start < unique.length; start += 100) {
            const batch = unique.slice(start, start + 100);
            const { data, error } = await client.from(table).select(columns).in('id_int', batch);
            if (error) throw error;
            rows.push(...(data || []));
        }
        return rows;
    }

    async function loadCatalogColors() {
        const currentState = appState();
        if (currentState && Array.isArray(currentState.cores) && currentState.cores.length) {
            return currentState.cores;
        }
        if (typeof window.api === 'function') {
            try { return (await window.api('GET', '/cores')) || []; } catch (_) {}
        }
        return [];
    }

    async function loadRecords() {
        if (typeof window.loadOrdens === 'function') await window.loadOrdens();
        const currentState = appState();
        const orders = ((currentState && currentState.ordens) || []).filter(order => {
            const ignored = typeof window.pedidoIgnoradoNosPaineis === 'function'
                && window.pedidoIgnoradoNosPaineis(order);
            const inFactory = typeof window.pedidoNaGrafica === 'function' && window.pedidoNaGrafica(order);
            const alreadyLeft = typeof window.pedidoJaPassouDaGrafica === 'function' && window.pedidoJaPassouDaGrafica(order);
            return !ignored && inFactory && !alreadyLeft;
        });
        const numbers = orders.map(orderNumber).filter(Number.isFinite);
        const modelsClient = typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
        const productsClient = (typeof vibeClient !== 'undefined' && vibeClient)
            ? vibeClient : modelsClient;
        if (!modelsClient || !productsClient) throw new Error('Banco de dados não disponível.');

        const [models, products, colors] = await Promise.all([
            selectInBatches(modelsClient, 'pedidos_modelos',
                'id,id_int,id_produto_proposta_origem,nome_modelo,quantidade,status_impressao,status_producao,status_arte,padrao,amostra_cor_id,gabarito_operacional,numeracao_inicio,numeracao_fim,verso_tipo,bloco', numbers),
            selectInBatches(productsClient, 'produtos_proposta',
                'id,id_int,id_produto,nome_produto,modelo_descri,amostra_cor_id', numbers),
            loadCatalogColors(),
        ]);

        local.colors = colors;
        const orderMap = new Map(orders.map(order => [String(orderNumber(order)), order]));
        const productMap = new Map(products.map(product => [
            `${product.id_int}:${product.id}`,
            product,
        ]));

        return models.map(model => {
            const order = orderMap.get(String(model.id_int));
            const product = productMap.get(`${model.id_int}:${model.id_produto_proposta_origem}`) || null;
            const productLabel = (product && product.nome_produto) || model.nome_modelo || 'Produto sem nome';
            const productId = product && product.id_produto;
            const productKey = productId !== null && productId !== undefined && productId !== ''
                ? `id:${productId}` : `nome:${norm(productLabel)}`;
            const color = colorInfo({ ...model, amostra_cor_id: model.amostra_cor_id || (product && product.amostra_cor_id) }, colors);
            return {
                modelId: model.id,
                osId: order && order.id,
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
                back: model.verso_tipo || 'Frente',
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
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString('pt-BR');
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
        safeWindowBeforeRender();
        const filtered = modelosDoFiltro(local.records, local.productKey, local.colorKey)
            .slice().sort((a, b) => {
                const statusRank = status => norm(status) === 'impresso' ? 2 : (norm(status) === 'corrigir arte' ? 1 : 0);
                return statusRank(a.status) - statusRank(b.status)
                    || Number(a.orderNumber) - Number(b.orderNumber)
                    || a.modelLabel.localeCompare(b.modelLabel, 'pt-BR');
            });
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

        if (!filtered.length) {
            if (body) body.innerHTML = '';
            if (wrap) wrap.hidden = true;
            if (message) {
                message.hidden = false;
                message.textContent = local.loading ? 'Carregando…'
                    : (!local.productKey ? 'Selecione um produto.'
                        : (!local.colorKey ? 'Selecione uma cor.' : 'Nenhum modelo aguardando para este produto e esta cor.'));
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
                    <td><select class="ppc-status" data-status-item="${esc(record.modelId)}" data-status-os="${esc(record.osId)}">
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
        renderProducts();
        renderColors();
        renderModels();
    }

    function closeOpenModel() {
        if (local.openItemId && typeof window.fecharJanelaDoModelo === 'function') {
            window.fecharJanelaDoModelo();
        }
    }

    async function refresh() {
        if (local.loading) return;
        local.loading = true;
        renderModels();
        const refreshButton = byId('ppc-refresh');
        if (refreshButton) refreshButton.disabled = true;
        try {
            local.records = await loadRecords();
            render();
        } catch (error) {
            console.error('[Produção por Cor] Falha ao carregar:', error);
            const message = byId('ppc-message');
            const wrap = byId('ppc-table-wrap');
            if (wrap) wrap.hidden = true;
            if (message) { message.hidden = false; message.textContent = `Não foi possível carregar: ${error.message || error}`; }
        } finally {
            local.loading = false;
            if (refreshButton) refreshButton.disabled = false;
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
        if (String(local.openItemId) === String(itemId) && typeof window.fecharJanelaDoModelo === 'function') {
            window.fecharJanelaDoModelo();
            return;
        }
        if (typeof window.loadOSItens !== 'function' || typeof window.enviarParaPedido !== 'function') {
            if (typeof window.toast === 'function') window.toast('Janela de Pedido indisponível.', 'error');
            return;
        }
        let fullItem = null;
        try {
            fullItem = await loadFullItem(itemId, osId);
        } catch (error) {
            console.error('[Produção por Cor] Falha ao carregar modelo completo:', error);
        }
        if (!fullItem) {
            if (typeof window.toast === 'function') window.toast('Não foi possível carregar a arte completa deste modelo.', 'error');
            return;
        }
        local.openItemId = itemId;
        local.openOSId = osId;
        renderModels();
        await window.enviarParaPedido(itemId, osId);
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
                select.disabled = true;
                await window.updateItemImpressao(select.dataset.statusItem, select.dataset.statusOs, select.value);
                select.disabled = false;
                const items = typeof window.getOSItens === 'function' ? window.getOSItens(select.dataset.statusOs) : [];
                const sharedItem = items.find(item => String(item.id) === String(select.dataset.statusItem));
                const record = local.records.find(item => String(item.modelId) === String(select.dataset.statusItem));
                if (record && sharedItem) record.status = sharedItem.status_impressao || sharedItem.impressao || record.status;
                render();
            });
        }
        if (refreshButton && !refreshButton.dataset.ppcBound) {
            refreshButton.dataset.ppcBound = '1';
            refreshButton.addEventListener('click', refresh);
        }
    }

    function openPage() {
        local.active = true;
        closeOpenModel();
        local.productKey = '';
        local.colorKey = '';
        bind();
        refresh();
    }

    function leavePage() {
        if (!local.active) return;
        local.active = false;
        if (local.openItemId && typeof window.fecharJanelaDoModelo === 'function') window.fecharJanelaDoModelo();
        local.openItemId = null;
        local.openOSId = null;
    }

    window.PedidoJanelaExterna = {
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
            local.openItemId = null;
            local.openOSId = null;
            setTimeout(renderModels, 0);
        },
    };

    window.addEventListener('pedidos-modelo-status-impressao', event => {
        const detail = event.detail || {};
        const record = local.records.find(item => String(item.modelId) === String(detail.itemId));
        if (record) record.status = detail.status;
        if (local.active) render();
    });

    window.ProducaoPorCorPainel = { abrir: openPage, sair: leavePage, atualizar: refresh };
    window.ProducaoPorCorUtils = { modelosDoFiltro };
}());
