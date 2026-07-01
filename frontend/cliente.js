// --- ARQUIVO DO CLIENTE ISOLADO ---
let state = {
    osItens: {},
    ordens: [],
    amostrasOSAtivo: null,
    cores: [],
    numeracoes: [],
    formatos: []
};


function toast(msg, type = 'info') {

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    const tc = document.getElementById('toast-container');

    const el = document.createElement('div');

    el.className = `toast toast-${type}`;

    el.innerHTML = `<span>${icons[type]}</span> ${msg}`;

    tc.appendChild(el);

    setTimeout(() => el.remove(), 3100);

}

async function saveAmostraToDB(itemId, osId, dataToUpdate) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

    const itemLocal = state.osItens[osId]?.find(i => String(i.id) === String(itemId));
    if (!itemLocal) {
        console.warn('[SAVE] Item nao encontrado no state. itemId=', itemId, '| osId=', osId);
        return;
    }

    const modeloId = itemLocal._pedidoModeloId || itemLocal.id;

    if (!modeloId || modeloId === '') {
        console.warn('[SAVE] modeloId esta vazio, ignorando update no banco');
        return;
    }

    try {
        const dbData = { ...dataToUpdate };
        
        // Mapear amostra_status para status_arte (coluna oficial do Supabase)
        if (dbData.amostra_status) {
            if (dbData.amostra_status === 'PRONTO') {
                dbData.status_arte = 'AGUARDANDO_CLIENTE';
            } else if (dbData.amostra_status === 'APROVADA') {
                dbData.status_arte = 'APROVADA_CLIENTE';
            } else if (dbData.amostra_status === 'REPROVADA') {
                dbData.status_arte = 'REPROVADA_CLIENTE';
            }
        }

        // Remove campos virtuais (frontend-only) que no existem na tabela pedidos_modelos
        if ('amostra_obs' in dbData) {
            dbData.observacao_arte = dbData.amostra_obs;
            delete dbData.amostra_obs;
        }
        if ('amostra_status' in dbData) {
            delete dbData.amostra_status;
        }

        // Se no sobrou nenhum campo para atualizar, evita fazer a requisicao que pode causar erro
        if (Object.keys(dbData).length === 0) {
            return;
        }

        // SE O ID FOR UM ITEM VIRTUAL (Vibecode Fallback), no salvar em pedidos_modelos!
        // Itens virtuais so gerados pelo carregarVibeOrders e no tm _dbLoaded = true
        if (itemLocal._source === 'vibecode' && !itemLocal._dbLoaded) {
            console.log('[SAVE] Ignorando pedidos_modelos para ID virtual:', modeloId);
            Object.assign(itemLocal, dataToUpdate);
            // Salvar tambm no localStorage para persistncia na sesso
            const overrides = JSON.parse(localStorage.getItem('vibe_item_amostra_overrides') || '{}');
            const cacheKey = itemLocal.id; // Ex: vibe_item_1224
            if (!overrides[cacheKey]) overrides[cacheKey] = {};
            Object.assign(overrides[cacheKey], dataToUpdate);
            localStorage.setItem('vibe_item_amostra_overrides', JSON.stringify(overrides));
            return;
        }

        const { data: updateResult, error } = await vibeClient
            .from('pedidos_modelos')
            .update(dbData)
            .eq('id', modeloId)
            .select('id');
        
        if (error) {
            console.error('[SAVE] Erro pedidos_modelos:', error.message, '| code:', error.code);
            throw error;
        }

        const rowsUpdated = updateResult ? updateResult.length : 0;
        if (rowsUpdated === 0) {
            console.warn('[SAVE] 0 linhas atualizadas! id=', modeloId);
        } else {
            console.log('[SAVE] OK -> pedidos_modelos id=', modeloId);
        }

        Object.assign(itemLocal, dataToUpdate);
    } catch (e) {
        console.error('[SAVE] Erro:', e);
        throw e;
    }
}


function renderAmostrasOSItens(osId) {
    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? (os.numero || os.id_int || os.id) : osId;
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const banner = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-banner' : 'cliente-os-banner');
    const avulsa = document.getElementById('amostra-combinada-avulsa');

    if (!os || !container) return;

    const itens = state.osItens[osId] || [];

    // Mostrar banner, esconder card avulso se for painel interno
    if (banner) {
        banner.style.display = 'flex';
        const numEl = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-numero' : 'cliente-pedido-numero');
        const cliEl = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-cliente' : 'cliente-pedido-cliente');
        const countEl = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-itens-count' : 'cliente-os-itens-count');
        if (numEl) numEl.textContent = `#${os.numero}`;
        if (cliEl) cliEl.textContent = os.cliente || '';
        if (countEl) countEl.textContent = `${itens.length} ${itens.length === 1 ? 'modelo' : 'modelos'}`;
    }
    if (containerId === 'amostras-itens-container' && avulsa) {
        avulsa.style.display = 'none';
    }

    if (!itens.length) {
        container.innerHTML = `
            <div class="card" style="border: 1px dashed var(--border);">
                <div style="padding: 40px; text-align: center; color: var(--text-dim);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px;">📦</div>
                    <p>Nenhum modelo encontrado neste pedido.</p>
                </div>
            </div>`;
        return;
    }

    const itemsHtml = itens.map((item, idx) => {
        const status = item.amostra_status || 'PENDENTE';
        const obs = item.amostra_obs || '';
        
        let statusBadge = '<span class="badge badge-amber">⏳ PENDENTE</span>';
        if (status === 'APROVADA') statusBadge = '<span class="badge badge-green">✅ APROVADO</span>';
        else if (status === 'REPROVADA') statusBadge = '<span class="badge badge-red">❌ ALTERAÇÃO</span>';
        else if (status === 'PRONTO') statusBadge = '<span class="badge badge-blue">🎨 PRONTO</span>';

        // Função simples para normalizar strings para busca (ignora acentos, cedilha, maiúsculas)
        const normStr = (s) => s ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const fuzzyMatch = (a, b) => {
            const na = normStr(a), nb = normStr(b);
            if (!na || !nb) return false;
            return na === nb || na.includes(nb) || nb.includes(na);
        };

        // Determinar o formato ID do item da OS
        const itemFormatoId = item.formato_id || (item.formato ? matchFormato(item.formato) : null);

        // Filtrar cores com base no formato do produto
        const filteredCores = itemFormatoId
            ? (state.cores || []).filter(c => String(c.formato_id) === String(itemFormatoId))
            : (state.cores || []);

        // Tentar descobrir a cor selecionada (pelo banco, ou pelo padrao escrito)
        let resolvedCorId = item.amostra_cor_id;
        if (!resolvedCorId && item.padrao) {
            const matchedCor = filteredCores.find(c => fuzzyMatch(c.name, item.padrao));
            if (matchedCor) resolvedCorId = matchedCor.id;
        }

        const corsOpts = filteredCores.map(c =>
            `<option value="${c.id}" ${c.id === resolvedCorId ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        // Determinar o formato ID da cor selecionada
        const selectedCor = resolvedCorId ? (state.cores || []).find(c => c.id === resolvedCorId) : null;
        const corFormatoId = selectedCor ? selectedCor.formato_id : null;

        // Tentar descobrir a numeracao selecionada
        let resolvedNumId = item.amostra_num_id;
        if (!resolvedNumId && item.gabarito_operacional) {
            const matchedNum = (state.numeracoes || []).find(n => fuzzyMatch(n.name, item.gabarito_operacional));
            if (matchedNum) resolvedNumId = matchedNum.id;
        }


        // Filtrar numerações com base no formato da cor selecionada
        const filteredNumeracoes = (state.numeracoes || []).filter(n => {
            // Se for a numeração salva neste item, sempre exibe
            if (String(n.id) === String(resolvedNumId)) return true;

            // Se for customizada, só exibe se for vinculada a este item específico
            if (n.is_custom && String(n.os_item_id) !== String(item.id)) return false;
            
            // Se tivermos cor selecionada com formato_id, filtra por ele
            if (corFormatoId) {
                const ids = n.formato_ids || (n.formato_id ? [n.formato_id] : []);
                return ids.some(id => String(id) === String(corFormatoId));
            }
            return true; // Se não tiver cor selecionada, mostra todas as numerações
        });

        const numOpts = filteredNumeracoes.map(n =>
            `<option value="${n.id}" ${String(n.id) === String(resolvedNumId) ? 'selected' : ''}>${n.name}</option>`
        ).join('');
        return `
        <div class="card" style="border: 2px solid var(--blue); margin-bottom: 0;">
            <div class="card-header" style="background: rgba(59, 130, 246, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span class="card-title">🧪 <strong>Modelo: ${item.nome_produto_real || item.produto || '--'}</strong></span>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span class="badge" style="font-size: 0.72rem;">📦 Qtd: ${item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem; font-family: monospace;">NI: ${item.num_inicial || 1} → NF: ${item.num_final || item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem;">${item.verso ? '✅ Verso' : '-- S/ Verso'}</span>
                    <span class="badge" style="font-size: 0.72rem;">🏭 ${item.setor || '--'}</span>
                    ${statusBadge}
                </div>
            </div>
            <div style="padding: 24px;">
                <div class="amostra-mid-row" style="${state.amostrasContainerId === 'cliente-amostras-itens-container' ? 'grid-template-columns: 1fr;' : ''}">
                    <div class="amostra-decisao-panel">
                        ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? '' : `
                        <div class="amostra-decisao-title">⚖️ Decisão de Qualidade</div>
                        <div class="amostra-decisao-status-box">
                            <span style="font-size: 0.82rem; color: var(--text-dim);">Status Atual:</span>
                            ${statusBadge}
                        </div>
                        `}
                        <div class="form-group" style="margin-bottom: 0;">
                            <label for="amostra-obs-${item.id}" style="font-size: 0.82rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em;">Anotações / Observações de Alteração</label>
                            <textarea id="amostra-obs-${item.id}" class="form-control" rows="3" placeholder="Insira aqui os detalhes das alterações solicitadas..." style="resize: none; background: rgba(0, 0, 0, 0.2); font-size: 0.85rem; padding: 10px;"
                                onchange="saveAmostraItemObs('${item.id}', '${osId}', this.value)">${obs}</textarea>
                        </div>
                        <div class="amostra-decisao-btns">
                            ${state.amostrasContainerId === 'cliente-amostras-itens-container' 
                                ? `
                                <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; ${status === 'APROVADA' ? 'background-color: #22c55e; border-color: #22c55e; color: #fff; box-shadow: 0 0 10px #22c55e;' : 'background-color: transparent; border-color: var(--border-color); color: var(--text);'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'APROVADA')">
                                    ${status === 'APROVADA' ? '✅ APROVADO' : 'APROVAR'}
                                </button>
                                ` 
                                : `
                                <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; ${status === 'PRONTO' || status === 'APROVADA' ? 'background-color: #3b82f6; border-color: #3b82f6; color: #fff;' : 'background-color: transparent; border-color: var(--border-color); color: var(--text);'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'PRONTO')" ${status === 'APROVADA' ? 'disabled' : ''}>
                                    ${status === 'APROVADA' ? '✅ APROVADO (CLIENTE)' : (status === 'PRONTO' ? '🎨 PRONTO' : 'MARCAR PRONTO')}
                                </button>
                                `
                            }
                            <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; ${status === 'REPROVADA' ? 'background-color: #ef4444; border-color: #ef4444; color: #fff;' : 'background-color: transparent; border-color: var(--border-color); color: var(--text);'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'REPROVADA')">
                                ${status === 'REPROVADA' ? '❌ EM ALTERAÇÃO' : 'ALTERAR'}
                            </button>
                        </div>
                    </div>
                    ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? '' : `
                    <div class="amostra-config-panel">
                        <h3 style="font-size: 0.85rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            ⚙️ Configurações da Amostra
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 14px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em;">Cor Cadastrada</label>
                                <select class="form-control" id="amostra-item-cor-${idx}" onchange="onItemCorSelect(${idx}, '${osId}', '${item.id}')">
                                    <option value="">-- Selecione uma Cor --</option>
                                    ${corsOpts}
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em; margin: 0;">Numeração Cadastrada</label>
                                    ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? '' : `<button class="btn btn-sm btn-ghost" style="padding: 0 4px; font-size: 0.9rem;" onclick="editCustomNumeracao(${idx}, '${osId}', '${item.id}')" title="Editar Numeração exclusivamente para este Modelo">✏️</button>`}
                                </div>
                                <select class="form-control" id="amostra-item-num-${idx}" onchange="onItemNumSelect(${idx}, '${osId}', '${item.id}')">
                                    <option value="">-- Selecione uma Numeração --</option>
                                    ${numOpts}
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em;">Arte de Amostra (PDF, JPG, PNG)</label>
                                <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
                                    <label class="btn btn-sm btn-secondary" for="amostra-item-arte-${idx}" style="margin: 0; cursor: pointer;">
                                        🖼️ Upload Arte
                                    </label>
                                    <input type="file" id="amostra-item-arte-${idx}" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
                                        onchange="onItemArteUpload(${idx}, '${osId}', '${item.id}')">
                                    <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-amostra-arte-${idx}" style="${item.amostra_arte_base64 ? '' : 'display:none;'}" onclick="onItemArteRemove(${idx}, '${osId}', '${item.id}')">✕ Remover</button>
                                    <span id="amostra-item-arte-name-${idx}" style="font-size:0.82rem; color:var(--text-dim)">${item.amostra_arte_base64 ? '(Arte Salva)' : ''}</span>
                                    <span style="display: inline-flex; align-items: center; gap: 4px; margin-left: auto; font-size: 0.75rem; color: var(--text-dim); background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; user-select: all;" onclick="navigator.clipboard.writeText('${item.id}').then(() => toast('ID ${item.id} copiado!', 'success'))" title="Copiar ID do Modelo">
                                        <i class="fa-regular fa-copy" style="font-size: 0.7rem;"></i>
                                        <span style="font-weight: 600; font-family: monospace;">ID: ${item.id}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    `}
                </div>
                <div class="amostra-preview-container" style="margin-top: 20px;">
                    <div id="amostra-item-header-${idx}" style="color: #FFD700; font-weight: 800; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 8px; display: ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? 'block' : 'none'}; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                        ${item.nome_modelo || `Modelo ${idx + 1}`}
                    </div>
                    ${state.amostrasContainerId === 'cliente-amostras-itens-container' ?
                        `<img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />`
                    :
                        `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>
                         <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                             <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                             <p style="font-size: 0.95rem; font-weight: 600;">Selecione Cor/Numeração e carregue uma Arte</p>
                             <p style="font-size: 0.82rem; opacity: 0.7; margin-top: 4px;">A visualização combinada aparecerá em tempo real neste espaço.</p>
                         </div>`
                    }
                </div>
            </div>
        </div>`;
    }).join('');

    const isInternal = containerId === 'amostras-itens-container';
    
    let finalHtml = itemsHtml;
    
    if (isInternal) {
        let uniqueProductsMap = new Map();
        itens.forEach(item => {
            let prodId = item.id_produto_proposta_origem || item.nome_produto_real || item.produto || item.id;
            if (!uniqueProductsMap.has(prodId)) {
                uniqueProductsMap.set(prodId, {
                    id: prodId,
                    nome: item.nome_produto_real || item.produto || 'Item',
                    quantidade: parseInt(item.quantidade) || 0
                });
            } else {
                let existing = uniqueProductsMap.get(prodId);
                existing.quantidade += (parseInt(item.quantidade) || 0);
            }
        });
        
        let uniqueProducts = Array.from(uniqueProductsMap.values());

        let obsAccordionHtml = uniqueProducts.map((prod) => {
            return `
                <div style="border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px;">
                    <div style="padding: 10px; background: rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-dim);"><i class="fa-solid fa-cube" style="margin-right: 6px;"></i> Ref: ${prod.quantidade || 0} un. - ${prod.nome}</span>
                    </div>
                    <div style="padding: 8px;">
                        <textarea id="briefing-obs-item-${prod.id}" oninput="saveBriefingField('${osNum}', null, this.value, true, '${prod.id}')" rows="3" style="width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 0.85rem; resize: vertical; background: rgba(0,0,0,0.05); color: var(--text);" placeholder="Observações específicas para este produto..."></textarea>
                    </div>
                </div>
            `;
        }).join('');

        finalHtml = `
            <div style="display: grid; grid-template-columns: 55fr 45fr; gap: 24px; align-items: start;">
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    ${itemsHtml}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 16px; position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; padding-right: 8px;">
                    <!-- Briefing Base -->
                    <div class="card" style="border: 1px solid var(--border); box-shadow: var(--shadow);">
                        <div class="card-header" style="background: transparent; border-bottom: 0; padding: 16px 16px 4px 16px;">
                            <div style="font-weight: 800; color: var(--text); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                Briefing Base do Evento
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">
                                Dados preenchidos pelo comercial para guiar a criação da arte.
                            </div>
                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.75rem; color: var(--text-dim); font-weight: 600;"><i class="fa-regular fa-file-lines" style="margin-right: 4px;"></i> Nome do Evento / Tema</label>
                                <input type="text" id="briefing-nome-${osId}" class="form-control" oninput="saveBriefingField('${osNum}', 'nome_evento', this.value)" style="background: rgba(0,0,0,0.02); margin-top: 4px; color: #f59e0b;" placeholder="Nome do Evento">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 0.75rem; color: var(--text-dim); font-weight: 600;"><i class="fa-regular fa-calendar" style="margin-right: 4px;"></i> Data do Evento</label>
                                    <input type="text" id="briefing-data-${osId}" class="form-control" oninput="saveBriefingField('${osNum}', 'data_evento', this.value)" style="background: rgba(0,0,0,0.02); margin-top: 4px; color: #f59e0b;" placeholder="DD/MM/AAAA">
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 0.75rem; color: var(--text-dim); font-weight: 600;"><i class="fa-solid fa-location-dot" style="margin-right: 4px;"></i> Local da Festa/Evento</label>
                                    <input type="text" id="briefing-local-${osId}" class="form-control" oninput="saveBriefingField('${osNum}', 'local_evento', this.value)" style="background: rgba(0,0,0,0.02); margin-top: 4px; color: #f59e0b;" placeholder="Local">
                                </div>
                            </div>

                            <div style="margin-top: 8px;">
                                <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-list-check"></i> Observações por produto
                                </div>
                                ${obsAccordionHtml}
                            </div>
                        </div>
                    </div>

                    <!-- Designers Ideal -->
                    <div class="card" style="border: 1px solid var(--border); box-shadow: var(--shadow);">
                        <div class="card-header" style="background: transparent; border-bottom: 0; padding: 16px 16px 4px 16px;">
                            <div style="font-weight: 800; color: var(--text); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                Designers Ideal
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">
                                Equipe de design responsável pela criação de artes.
                            </div>
                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
                            ${(() => {
                                const designers = [
                                    {uid: 'edison-uid', nome: 'Edison Jr', email: 'ingressoideal1@gmail.com', init: 'E'},
                                    {uid: 'emily-uid', nome: 'Emily Boeira', email: 'emilyboeira51@gmail.com', init: 'E'},
                                    {uid: 'vitoria-uid', nome: 'Vitória Colbeich', email: 'vitoria.dseg@gmail.com', init: 'V'}
                                ];
                                // Contar pedidos e modelos por designer
                                const artes = state.todasArtes || [];
                                const allOrdens = state.ordens || [];
                                return designers.map(d => {
                                    // Pedidos: quantos pedidos únicos têm este designer atribuído
                                    const pedidosSet = new Set();
                                    artes.forEach(a => {
                                        if (a.designer_uid === d.uid || a.designer_nome === d.nome) {
                                            pedidosSet.add(a.id_int);
                                        }
                                    });
                                    const pedidosCount = pedidosSet.size;
                                    // Modelos: soma de modelos de todos os pedidos designados
                                    let modelosCount = 0;
                                    pedidosSet.forEach(idInt => {
                                        const os = allOrdens.find(o => String(o.numero) === String(idInt));
                                        if (os && state.osItens[os.id]) {
                                            modelosCount += state.osItens[os.id].length;
                                        }
                                    });
                                    return `
                                <div class="designer-card" data-uid="${d.uid}" onclick="selectDesigner('${osNum}', '${d.uid}', '${d.nome}')" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: rgba(0,0,0,0.01);">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 36px; height: 36px; border-radius: 50%; background: #a7f3d0; color: #065f46; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem;">
                                            ${d.init}
                                        </div>
                                        <div>
                                            <div style="font-weight: 700; color: var(--text); font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
                                                ${d.nome} <span class="designer-badge badge badge-teal" style="display: none; font-size: 0.6rem; padding: 2px 6px;">Selecionado</span>
                                            </div>
                                            <div style="font-size: 0.75rem; color: var(--text-dim);">${d.email}</div>
                                        </div>
                                    </div>
                                    <div style="text-align: right; font-size: 0.7rem; color: var(--text-dim);">
                                        Pedidos: <strong>${pedidosCount}</strong><br>
                                        Modelos: <strong>${modelosCount}</strong>
                                    </div>
                                </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    </div>

                    <!-- Ultimos Pedidos -->
                    <div class="card" style="border: 1px solid var(--border); box-shadow: var(--shadow);">
                        <div class="card-header" style="background: rgba(16, 185, 129, 0.1); border-bottom: 1px solid var(--border); padding: 12px 16px;">
                            <span style="font-weight: 700; color: var(--teal); display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-clock-rotate-left"></i> Últimos Pedidos do Cliente
                            </span>
                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;" id="ultimos-pedidos-container-${osId}">
                            <div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Buscando histórico...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Media query hack for responsiveness inline if needed, but flex-wrap handles smaller screens if we used flex. 
    // Com display grid, podemos precisar de css. Para o painel principal, vamos assumir que o CSS do painel é robusto.

    container.innerHTML = finalHtml;
    
    if (isInternal) {
        loadBriefingBase(osId, osNum);
        loadUltimosPedidos(osId, os.cliente);
    }

    setTimeout(() => {
        itens.forEach((item, idx) => {
            const corSelect = document.getElementById(`amostra-item-cor-${idx}`);
            const numSelect = document.getElementById(`amostra-item-num-${idx}`);
            const hasSelectValue = (corSelect && corSelect.value) || (numSelect && numSelect.value);
            
            if (item.amostra_cor_id || item.amostra_num_id || item.amostra_arte_base64 || hasSelectValue) {
                renderItemAmostraCombinada(idx, osId);
            }
        });
        // Atualizar a barra final de ações do cliente dinamicamente
        atualizarBarraFinalCliente(osId);
    }, 50);
}


function checkClienteRoute() {
    const path = window.location.pathname;
    const match = path.match(/^\/cliente\/(\d+)-([a-z0-9]+)$/i);

    if (match) {
        const numero = match[1];
        const token = match[2];

        // Esconder o app principal e mostrar a página do cliente
        const appShell = document.querySelector('.app-shell');
        const clientePage = document.getElementById('cliente-page');

        if (appShell) appShell.style.display = 'none';
        if (clientePage) clientePage.style.display = 'block';

        // Iniciar carregamento dos dados
        initClientePage(numero, token);
        return true;
    }
    return false;
}

let clienteState = {
    numero: null,
    token: null,
    osId: null,
    linkId: null,
    itens: []
};

/**
 * Inicializa a página do cliente com validação de token
 */
async function initClientePage(numero, token) {
    clienteState.numero = numero;
    clienteState.token = token;

    const loadingEl = document.getElementById('cliente-loading');
    const errorEl = document.getElementById('cliente-error');
    const contentEl = document.getElementById('cliente-content');
    const numeroEl = document.getElementById('cliente-pedido-numero');
    const clienteEl = document.getElementById('cliente-pedido-cliente');

    if (numeroEl) numeroEl.textContent = `#${numero}`;

    // Esperar o Supabase carregar
    let attempts = 0;
    while ((typeof supabaseClient === 'undefined' || !supabaseClient) && attempts < 20) {
        await new Promise(r => setTimeout(r, 250));
        attempts++;
    }

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'block';
        return;
    }

    try {
        // Validar token
        const { data: linkData, error: linkError } = await supabaseClient
            .from('pedidos_links_cliente')
            .select('*')
            .eq('numero_pedido', numero)
            .eq('token', token)
            .eq('ativo', true)
            .maybeSingle();

        if (linkError || !linkData) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
            return;
        }

        clienteState.osId = linkData.os_id;
        clienteState.linkId = linkData.id;

        // Incrementar acessos
        await supabaseClient
            .from('pedidos_links_cliente')
            .update({ acessos: (linkData.acessos || 0) + 1, ultimo_acesso: new Date().toISOString() })
            .eq('id', linkData.id);

        // Buscar dados da OS (tentar Vibecode primeiro)
        let osCliente = '';
        let propData = null;
        try {
            const { data } = await supabaseClient
                .from('propostas')
                .select('*')
                .eq('id_int', numero)
                .maybeSingle();
            propData = data;
            if (propData) osCliente = propData.cliente_nome || '';
        } catch (e) { /* silencioso */ }

        if (clienteEl) clienteEl.textContent = osCliente;



        // Carregar formatos, cores e numerações para o state global do front
        try {
            const [coresRes, numeracoesRes, formatosRes] = await Promise.all([
                supabaseClient.from('producao_cores').select('*').order('name', { ascending: true }),
                supabaseClient.from('producao_numeracoes').select('*').order('name', { ascending: true }),
                supabaseClient.from('producao_formatos').select('*').order('name', { ascending: true })
            ]);
            state.cores = coresRes.data || [];
            state.numeracoes = numeracoesRes.data || [];
            state.formatos = formatosRes.data || [];
        } catch (err) {
            console.error('Erro ao carregar dados auxiliares do Supabase:', err);
        }

        const osId = clienteState.osId;
        let itensCarregados = [];

        // 1. Carregar itens do pedido via pedidos_modelos
        try {
            const queryNum = parseInt(numero);
            const { data: prodItems } = await supabaseClient
                .from('pedidos_modelos')
                .select('*')
                .eq('id_int', queryNum)
                .order('ordem', { ascending: true });
            
            // Buscar nome do produto original da proposta
            const { data: propData } = await supabaseClient
                .from('produtos_proposta')
                .select('id, nome_produto')
                .eq('id_int', queryNum);
            
            if (prodItems && prodItems.length > 0) {
                itensCarregados = prodItems.map(item => {
                    const prop = propData?.find(p => p.id === item.id_produto_proposta_origem);
                    
                    // Remapear o status_arte do banco para o amostra_status usado pelo renderAmostrasOSItens
                    let statusFrontend = 'PENDENTE';
                    if (item.status_arte === 'AGUARDANDO_CLIENTE' || item.status_arte === 'PRONTO') statusFrontend = 'PRONTO';
                    else if (item.status_arte === 'APROVADA_CLIENTE' || item.status_arte === 'APROVADA') statusFrontend = 'APROVADA';
                    else if (item.status_arte === 'REPROVADA_CLIENTE' || item.status_arte === 'REPROVADA') statusFrontend = 'REPROVADA';
                    return {
                        ...item,
                        produto: item.nome_modelo || 'Modelo',
                        nome_produto_real: prop ? prop.nome_produto : null,
                        os_id: osId,
                        amostra_obs: item.observacao_arte || item.amostra_obs || '',
                        amostra_status: statusFrontend
                    };
                });
            }
        } catch (e) { console.warn('Erro ao buscar pedidos_modelos:', e); }

        state.osItens[osId] = itensCarregados;

        // 3. Mesclar dados de pedidos_artes (arquivos PDF, revisões e urls)
        try {
            const queryNum = parseInt(numero);
            if (!isNaN(queryNum)) {
                const { data: artes } = await supabaseClient
                    .from('pedidos_artes')
                    .select('*')
                    .eq('id_int', queryNum);
                
                if (artes && artes.length > 0) {
                    state.osItens[osId].forEach(item => {
                        const artesDoItem = artes.filter(a => a.id_modelo === item.id);
                        if (artesDoItem.length > 0) {
                            artesDoItem.sort((a, b) => b.versao - a.versao);
                            const ultimaArte = artesDoItem[0];
                            
                            item.aprovacao = ultimaArte.status;
                            item.nome_arquivo_arte = ultimaArte.nome_arquivo;
                            item.versao_arte = ultimaArte.versao;
                            item.url_arquivo_arte = ultimaArte.url_arquivo;
                            if (ultimaArte.comentarios_revisao && !item.amostra_obs) {
                                item.amostra_obs = ultimaArte.comentarios_revisao;
                            }
                        }
                    });
                }
            }
        } catch (err) { console.warn('Erro ao mesclar pedidos_artes:', err); }


        // Salvar a OS no state.ordens
        const os = {
            id: osId,
            numero: numero,
            cliente: osCliente,
            _itens_raw: itensCarregados
        };
        state.ordens = [os];
        state.amostrasOSAtivo = osId;

        const isVibeOS = osId.startsWith('vibe_');

        // Buscar status da OS
        // REGRA: linkData.status_arte é sempre a fonte primaria (sincronizado ao gerar link)
        // Para OS locais, tentar producao_ordens_servico como fonte complementar
        // NUNCA usar pedidos_artes.status (isso é status por ITEM, nao da OS)
        let osStatus = linkData.status_arte ? linkData.status_arte.trim() : 'ARTE_EM_ANDAMENTO';
        console.log('[ClienteView] osStatus inicial (linkData.status_arte):', osStatus, '| isVibeOS:', isVibeOS);

        if (!isVibeOS) {
            // FIX-2: Para OS locais, producao_ordens_servico SÓ complementa se o status
            // do link ainda estiver em estado inicial (não-final). Isso evita sobrescrever
            // o que o cliente gravou (APROVADO/REPROVADO) com o status interno da OS.
            const statusFinaisLink = ['APROVADO', 'REPROVADO', 'APROVADA_CLIENTE', 'REPROVADA_CLIENTE'];
            const osStatusUpper = osStatus.toUpperCase();
            const linkEstaEmEstadoFinal = statusFinaisLink.some(sf => osStatusUpper.includes(sf));

            if (!linkEstaEmEstadoFinal) {
                try {
                    const { data: osData } = await supabaseClient
                        .from('producao_ordens_servico')
                        .select('status')
                        .eq('id', osId)
                        .maybeSingle();
                    if (osData && osData.status && osData.status.trim() !== '') {
                        osStatus = osData.status.trim();
                        console.log('[ClienteView] osStatus via producao_ordens_servico:', osStatus);
                    } else {
                        console.log('[ClienteView] producao_ordens_servico sem resultado, mantendo linkData.status_arte');
                    }
                } catch (e) {
                    console.warn('Erro ao buscar status global da OS:', e);
                }
            } else {
                console.log('[ClienteView] Status final no link protegido — ignorando producao_ordens_servico:', osStatus);
            }
        }

        // Configurar o container de renderização das amostras para o cliente
        state.amostrasContainerId = 'cliente-amostras-itens-container';

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        // REGRA DE ACESSO DO CLIENTE:
        // Somente 'Enviar Arte' (e legado 'Enviar ARTE') abre as janelas de aprovação.
        // 'APROVADO' → tela de sucesso.
        // 'REPROVADO' → tela de reprovação (aguardando correção).
        // QUALQUER outro status ('Em Arte', 'Pendente Informação', null, etc.) → mensagem de aguarde.
        const statusUP = osStatus.trim().toUpperCase();
        const isAprovado  = (statusUP === 'APROVADO' || statusUP === 'APROVADA_CLIENTE');
        const isReprovado = (statusUP === 'REPROVADO' || statusUP === 'REPROVADA_CLIENTE');
        const isEnviarArte = (osStatus.trim() === 'Enviar Arte' || osStatus.trim() === 'Enviar ARTE');

        console.log('[ClienteView] Status final para decisão de exibição:', osStatus, '| isEnviarArte:', isEnviarArte, '| isAprovado:', isAprovado, '| isReprovado:', isReprovado);

        if (isAprovado) {
            mostrarResultadoCliente(
                '✅',
                'Artes Aprovadas!',
                'Suas artes já foram APROVADAS. Em breve seu pedido entrará em produção. Para qualquer dúvida, entre em contato com seu ATENDIMENTO.'
            );
        } else if (isReprovado) {
            mostrarResultadoCliente(
                '❌',
                'Artes Reprovadas',
                'Recebemos sua solicitação de alteração e nossa equipe está realizando as correções. Em breve você receberá um novo link para aprovação.'
            );
        } else if (isEnviarArte) {
            // Único status onde o cliente vê as artes e pode aprovar/reprovar
            const itensArray = state.osItens[osId] || [];
            const todosAprovados = itensArray.length > 0 && itensArray.every(item => item.amostra_status === 'APROVADA');
            
            if (todosAprovados) {
                // Se as artes já foram todas aprovadas mas o status da OS ainda é Enviar Arte,
                // significa que ele fechou na etapa de Endereço/NF. Continua de onde parou.
                mostrarConfirmacaoDadosCliente(osId);
            } else {
                renderAmostrasOSItens(osId);
            }
        } else {
            // Em Arte, Pendente Informação, ou qualquer outro status intermediário
            // → cliente não deve ver as artes ainda
            mostrarResultadoCliente(
                '🕐',
                'Artes em Preparação',
                'Sua arte ainda está sendo preparada pela nossa equipe. Assim que estiver pronta para aprovação, você receberá um novo link. Qualquer dúvida, entre em contato com seu ATENDIMENTO.'
            );
        }


    } catch (e) {
        console.error('Erro ao inicializar página do cliente:', e);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'block';
    }
}

async function clienteFinalizarFluxo(fluxoTipo) {
    const osId = clienteState.osId;
    const itens = state.osItens[osId] || [];
    const btnAprovar = document.getElementById('btn-cliente-aprovar-tudo');

    if (btnAprovar) {
        btnAprovar.disabled = true;
        btnAprovar.textContent = '⏳ Processando...';
    }

    try {
        if (fluxoTipo === 'APROVAR_TUDO') {
            // NOTA: Não mudamos o status da OS para APROVADO aqui.
            // O status só vai para APROVADO quando o cliente terminar a confirmação de endereço/NF.

            // Para cada item, salvar status como APROVADA no banco (Execução paralela)
            const savePromises = itens.map(item => saveAmostraToDB(item.id, osId, { amostra_status: 'APROVADA' }));
            await Promise.all(savePromises);

            // Também atualizar o status em pedidos_artes para manter compatibilidade (Execução paralela)
            const artesPromises = itens.map(async (item) => {
                try {
                    await supabaseClient
                        .from('pedidos_artes')
                        .update({ status: 'APROVADA_CLIENTE', aprovado_por: 'Cliente (via link)', data_aprovacao: new Date().toISOString() })
                        .eq('id_modelo', item.id)
                        .order('versao', { ascending: false })
                        .limit(1);
                } catch (e) { /* silencioso */ }
            });
            await Promise.all(artesPromises);

            // Log no chat da proposta
            try {
                await supabaseClient.from('propostas_chat').insert({
                    id_int: parseInt(clienteState.numero),
                    tipo: 'PRODUCAO',
                    setor: 'Cliente',
                    visivel_externo: true,
                    mensagem: `✅ PEDIDO COMPLETO APROVADO PELO CLIENTE via link de aprovação online.`,
                    remetente_nome: 'Cliente (aprovação online)',
                });
            } catch (e) { console.error('Erro log chat:', e); }

            // Mostrar tela de confirmacao de dados de entrega/nf
            mostrarConfirmacaoDadosCliente(osId);
        } 
        else if (fluxoTipo === 'SOLICITAR_ALTERACAO') {
            // Salvar status global da OS no Supabase para REPROVADO (Laranja, rótulo "Arte em Andamento")
            // Protegido por try-catch para evitar que restrições RLS em producao_ordens_servico quebrem a finalização do cliente
            try {
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    if (osId.startsWith('vibe_')) {
                        const { error } = await supabaseClient
                            .from('pedidos_links_cliente')
                            .update({ status_arte: 'REPROVADO' })
                            .eq('os_id', osId);
                        if (error) throw error;
                    } else {
                        const { error } = await supabaseClient
                            .from('producao_ordens_servico')
                            .update({ status: 'REPROVADO' }).eq('id', osId);
                        if (error) throw error;
                    }
                }
            } catch (osErr) {
                console.warn('Erro ao atualizar status global da OS para correcao (pode ser restricao de RLS):', osErr);
            }

            // Coletar observações das alterações de cada item reprovado
            let observacoesTexto = '';
            itens.forEach((item, idx) => {
                if (item.amostra_status === 'REPROVADA') {
                    observacoesTexto += `\n- Modelo ${idx + 1} (${item.produto}): ${item.amostra_obs || '(Sem observações)'}`;
                }
            });

            // Log no chat da proposta
            try {
                await supabaseClient.from('propostas_chat').insert({
                    id_int: parseInt(clienteState.numero),
                    tipo: 'PRODUCAO',
                    setor: 'Cliente',
                    visivel_externo: true,
                    mensagem: `❌ O CLIENTE SOLICITOU ALTERAÇÃO DE ARTES via link online.${observacoesTexto}`,
                    remetente_nome: 'Cliente (alteração online)',
                });
            } catch (e) { console.error('Erro log chat:', e); }

            // Mostrar tela de sucesso de alteração solicitada
            mostrarResultadoCliente('⚠️', 'Alteração Solicitada!', 'Artes em ALTERAÇÃO. Para qualquer alteração entre em contato com seu ATENDIMENTO.');
        }
    } catch (e) {
        console.error('Erro ao finalizar fluxo do cliente:', e);
        toast('Erro ao finalizar pedido: ' + e.message, 'error');
        if (btnAprovar) {
            btnAprovar.disabled = false;
            btnAprovar.textContent = fluxoTipo === 'APROVAR_TUDO' ? '✅ FINALIZAR E APROVAR PEDIDO COMPLETO' : '⚠️ SOLICITAR ALTERAÇÃO DE ARTE';
        }
    }
}

async function clienteAprovarTudo() {
    return clienteFinalizarFluxo('APROVAR_TUDO');
}

window.clienteConfirmacoes = { enderecoOk: null, nfOk: null, enderecoCorrecao: '', nfCorrecao: '' };

function checarConclusaoConfirmacoes() {
    const btn = document.getElementById('btn-finalizar-confirmacoes');
    if (!btn) return;
    
    const endFeito = window.clienteConfirmacoes.enderecoOk === true || (window.clienteConfirmacoes.enderecoOk === false && window.clienteConfirmacoes.enderecoCorrecao !== '');
    const nfFeito = window.clienteConfirmacoes.nfOk === true || (window.clienteConfirmacoes.nfOk === false && window.clienteConfirmacoes.nfCorrecao !== '');

    if (endFeito && nfFeito) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        
        const precisaAtencao = window.clienteConfirmacoes.enderecoOk === false || window.clienteConfirmacoes.nfOk === false;
        
        if (precisaAtencao) {
            btn.innerHTML = '⚠️ Solicitar correção do Atendimento';
            btn.style.backgroundColor = '#f97316'; // Laranja
            btn.style.borderColor = '#f97316';
            btn.style.color = '#fff';
        } else {
            btn.innerHTML = '✅ Finalizar Aprovação do Pedido';
            btn.style.backgroundColor = '#22c55e'; // Verde
            btn.style.borderColor = '#22c55e';
            btn.style.color = '#fff';
        }
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = 'Verifique os dados acima para Finalizar';
        btn.style.backgroundColor = '#22c55e'; // default
        btn.style.borderColor = '#22c55e';
    }
}

window.desfazerConfirmacao = function(tipo) {
    window.clienteConfirmacoes[`${tipo}Ok`] = null;
    window.clienteConfirmacoes[`${tipo}Correcao`] = '';
    
    document.getElementById(`acoes-${tipo}`).style.display = 'flex';
    document.getElementById(`correcao-${tipo}`).style.display = 'none';
    document.getElementById(`status-${tipo}`).innerHTML = '';
    document.getElementById(`input-correcao-${tipo}`).value = '';
    
    checarConclusaoConfirmacoes();
};

window.acaoConfirmacaoItem = function(tipo, ok) {
    window.clienteConfirmacoes[`${tipo}Ok`] = ok;
    
    const botoesAcao = document.getElementById(`acoes-${tipo}`);
    const boxCorrecao = document.getElementById(`correcao-${tipo}`);
    const badgeStatus = document.getElementById(`status-${tipo}`);
    
    if (ok) {
        botoesAcao.style.display = 'none';
        boxCorrecao.style.display = 'none';
        badgeStatus.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; background: rgba(34, 197, 94, 0.1); padding: 10px; border-radius: 6px; border: 1px solid #22c55e;">
                <span style="color: #22c55e; font-weight: bold;">✅ Confirmado</span>
                <button class="btn btn-sm" onclick="desfazerConfirmacao('${tipo}')" style="background: transparent; border: 1px solid var(--border-color); color: var(--text); padding: 5px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Desfazer</button>
            </div>
        `;
    } else {
        botoesAcao.style.display = 'none';
        boxCorrecao.style.display = 'block';
        badgeStatus.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <span style="color: #f97316; font-weight: bold;">⚠️ Incorreto - Por favor informe abaixo:</span>
                <button class="btn btn-sm" onclick="desfazerConfirmacao('${tipo}')" style="background: transparent; border: 1px solid var(--border-color); color: var(--text); padding: 5px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Voltar</button>
            </div>
        `;
    }
    checarConclusaoConfirmacoes();
};

window.salvarCorrecaoTexto = function(tipo) {
    const textarea = document.getElementById(`input-correcao-${tipo}`);
    const texto = textarea.value.trim();
    if (!texto) {
        toast('Por favor, informe os dados corretos antes de salvar.', 'warning');
        return;
    }
    
    window.clienteConfirmacoes[`${tipo}Correcao`] = texto;
    document.getElementById(`correcao-${tipo}`).style.display = 'none';
    
    const badgeStatus = document.getElementById(`status-${tipo}`);
    badgeStatus.innerHTML = `
        <div style="background: rgba(249, 115, 22, 0.1); padding: 10px; border-radius: 6px; border: 1px solid #f97316;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="color: #f97316; font-weight: bold;">✅ Correção Registrada</span>
                <button class="btn btn-sm" onclick="desfazerConfirmacao('${tipo}')" style="background: transparent; border: 1px solid var(--border-color); color: var(--text); padding: 5px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Editar</button>
            </div>
            <small style="color: var(--text-dim); margin-top: 5px; display: inline-block; word-break: break-word;">${texto.substring(0, 150)}${texto.length > 150 ? '...' : ''}</small>
        </div>
    `;
    
    checarConclusaoConfirmacoes();
};

async function mostrarConfirmacaoDadosCliente(osId) {
    window.clienteConfirmacoes = { enderecoOk: null, nfOk: null, enderecoCorrecao: '', nfCorrecao: '' };
    const contentEl = document.getElementById('cliente-content');
    
    const container = document.getElementById('cliente-amostras-itens-container');
    const actions = document.querySelector('.cliente-actions');
    if (container) container.style.display = 'none';
    if (actions) actions.style.display = 'none';

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        mostrarResultadoCliente('✅', 'Pedido Aprovado com Sucesso!', 'Artes já foram APROVADAS. Para qualquer alteração entre em contato com seu ATENDIMENTO.');
        return;
    }

    const numPed = parseInt(clienteState.numero);

    let confirmContainer = document.getElementById('cliente-confirmacao-container');
    if (!confirmContainer) {
        confirmContainer = document.createElement('div');
        confirmContainer.id = 'cliente-confirmacao-container';
        confirmContainer.style.marginTop = '20px';
        contentEl.appendChild(confirmContainer);
    }
    confirmContainer.style.display = 'block';
    confirmContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-dim);">⏳ Buscando dados do pedido...</div>';

    try {
        const { data: propData, error: propErr } = await supabaseClient
            .from('propostas')
            .select('id_faturado, id_cliente, id_endereco_ent')
            .eq('id_int', numPed)
            .limit(1);
            
        if (propErr || !propData || propData.length === 0) throw new Error('Proposta não encontrada');
        const proposta = propData[0];

        const idClienteBase = proposta.id_faturado || proposta.id_cliente;
        const idEndereco = proposta.id_endereco_ent;

        let clienteFaturamento = null;
        let enderecoEntrega = null;

        if (idClienteBase) {
            const { data: cliData } = await supabaseClient.from('clientes').select('*').eq('id_cliente', idClienteBase).limit(1);
            if (cliData && cliData.length > 0) clienteFaturamento = cliData[0];
        }
        if (idEndereco) {
            const { data: endData } = await supabaseClient.from('enderecos').select('*').eq('id', idEndereco).limit(1);
            if (endData && endData.length > 0) enderecoEntrega = endData[0];
        }

        let endHtml = '<div style="color: var(--text-dim); font-style: italic;">Endereço não cadastrado no pedido.</div>';
        if (enderecoEntrega) {
            let recebedorHtml = '';
            if (enderecoEntrega.recebedor) {
                recebedorHtml = `<b>Recebedor:</b> ${enderecoEntrega.recebedor} ${enderecoEntrega.cpf_recebedor ? `(CPF: ${enderecoEntrega.cpf_recebedor})` : ''}<br>`;
            }
            
            endHtml = `
                <div style="font-size: 0.95rem; line-height: 1.5; color: var(--text);">
                    ${recebedorHtml}
                    <b>Rua:</b> ${enderecoEntrega.endereco || enderecoEntrega.rua || enderecoEntrega.logradouro || ''}, ${enderecoEntrega.numero || 'S/N'}<br>
                    ${enderecoEntrega.complemento ? `<b>Complemento:</b> ${enderecoEntrega.complemento}<br>` : ''}
                    <b>Bairro:</b> ${enderecoEntrega.bairro || ''}<br>
                    <b>Cidade/UF:</b> ${enderecoEntrega.cidade || ''} - ${enderecoEntrega.uf || ''}<br>
                    <b>CEP:</b> ${enderecoEntrega.cep || ''}
                </div>
            `;
        }
        window.clienteConfirmacoes.endHtml = endHtml;

        let cliHtml = '<div style="color: var(--text-dim); font-style: italic;">Dados de faturamento não cadastrados.</div>';
        if (clienteFaturamento) {
            const nomeRazao = clienteFaturamento.nome || clienteFaturamento.fantasia || '';
            cliHtml = `
                <div style="font-size: 0.95rem; line-height: 1.5; color: var(--text);">
                    <b>Nome/Razão Social:</b> ${nomeRazao}<br>
                    <b>CPF/CNPJ:</b> ${clienteFaturamento.documento || ''}<br>
                    ${clienteFaturamento.ins_estadual ? `<b>I.E.:</b> ${clienteFaturamento.ins_estadual}<br>` : ''}
                    <b>E-mail:</b> ${clienteFaturamento.email_financeiro || clienteFaturamento.email_contato || clienteFaturamento.email || ''}<br>
                    <b>Telefone:</b> ${clienteFaturamento.whatsapp_1 || clienteFaturamento.telefone_fixo || ''}
                </div>
            `;
        }
        window.clienteConfirmacoes.cliHtml = cliHtml;

        confirmContainer.innerHTML = `
            <div style="background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 25px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🎉</div>
                    <div style="color: var(--text); font-size: 1.2rem; font-weight: 700; margin-bottom: 5px;">Pedido #${clienteState.numero || ''}</div>
                    <h2 style="color: var(--green); margin: 0; font-size: 1.5rem;">Artes do Pedido APROVADAS</h2>
                    <p style="color: var(--text-dim); margin-top: 5px;">Por favor, confira seus dados de entrega e faturamento antes de finalizar.</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 25px;">
                    <!-- CARD ENDEREÇO -->
                    <div style="background-color: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">
                            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text);">📦 Endereço de Entrega</h3>
                        </div>
                        <div style="margin-bottom: 15px;">${endHtml}</div>
                        
                        <div id="status-endereco" style="margin-bottom: 10px;"></div>
                        
                        <div id="acoes-endereco" style="display: flex; gap: 10px;">
                            <button class="btn" onclick="acaoConfirmacaoItem('endereco', true)" style="background-color: transparent; border: 1px solid var(--border-color); color: var(--text); flex: 1; min-height: 40px;">Correto</button>
                            <button class="btn" onclick="acaoConfirmacaoItem('endereco', false)" style="background-color: transparent; border: 1px solid var(--border-color); color: var(--text); flex: 1; min-height: 40px;">Incorreto</button>
                        </div>

                        <div id="correcao-endereco" style="display: none; margin-top: 10px;">
                            <textarea id="input-correcao-endereco" class="form-control" rows="3" placeholder="Digite o CEP e Número do local de entrega correto aqui..." style="width: 100%; margin-bottom: 10px; background-color: var(--bg-color); border: 1px solid var(--border-color); color: var(--text); padding: 10px; border-radius: 4px;"></textarea>
                            <button class="btn" onclick="salvarCorrecaoTexto('endereco')" style="background-color: #f97316; border-color: #f97316; color: #fff; width: 100%; min-height: 40px;">💾 Salvar Correção</button>
                        </div>
                    </div>
                    
                    <!-- CARD NOTA FISCAL -->
                    <div style="background-color: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">
                            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text);">🧾 Dados para Nota Fiscal</h3>
                        </div>
                        <div style="margin-bottom: 15px;">${cliHtml}</div>
                        
                        <div id="status-nf" style="margin-bottom: 10px;"></div>
                        
                        <div id="acoes-nf" style="display: flex; gap: 10px;">
                            <button class="btn" onclick="acaoConfirmacaoItem('nf', true)" style="background-color: transparent; border: 1px solid var(--border-color); color: var(--text); flex: 1; min-height: 40px;">Correto</button>
                            <button class="btn" onclick="acaoConfirmacaoItem('nf', false)" style="background-color: transparent; border: 1px solid var(--border-color); color: var(--text); flex: 1; min-height: 40px;">Incorreto</button>
                        </div>

                        <div id="correcao-nf" style="display: none; margin-top: 10px;">
                            <textarea id="input-correcao-nf" class="form-control" rows="3" placeholder="Digite o CPF ou CNPJ correto aqui..." style="width: 100%; margin-bottom: 10px; background-color: var(--bg-color); border: 1px solid var(--border-color); color: var(--text); padding: 10px; border-radius: 4px;"></textarea>
                            <button class="btn" onclick="salvarCorrecaoTexto('nf')" style="background-color: #f97316; border-color: #f97316; color: #fff; width: 100%; min-height: 40px;">💾 Salvar Correção</button>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center;">
                    <button id="btn-finalizar-confirmacoes" class="btn btn-lg" onclick="finalizarConfirmacaoCliente()" disabled style="background-color: #22c55e; border-color: #22c55e; color: #fff; font-weight: bold; width: 100%; opacity: 0.5; cursor: not-allowed; min-height: 50px;">
                        Verifique os dados acima para Finalizar
                    </button>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('Erro ao buscar dados do cliente/endereco:', err);
        confirmContainer.style.display = 'none';
        mostrarResultadoCliente('✅', 'Pedido Aprovado com Sucesso!', 'Artes já foram APROVADAS. Para qualquer alteração entre em contato com seu ATENDIMENTO.');
    }
}

window.finalizarConfirmacaoCliente = async function() {
    const confirmContainer = document.getElementById('cliente-confirmacao-container');
    if (confirmContainer) confirmContainer.style.display = 'none';

    const endOk = window.clienteConfirmacoes.enderecoOk;
    const endCorr = window.clienteConfirmacoes.enderecoCorrecao;
    const nfOk = window.clienteConfirmacoes.nfOk;
    const nfCorr = window.clienteConfirmacoes.nfCorrecao;

    const precisaAtencao = (!endOk && endCorr) || (!nfOk && nfCorr);

    let mensagemLog = '';
    if (!precisaAtencao) {
        mensagemLog = `✅ O CLIENTE CONFIRMOU os dados de entrega e faturamento.`;
    } else {
        mensagemLog = `⚠️ O CLIENTE REPORTOU DADOS INCORRETOS:\n\n`;
        if (!endOk && endCorr) mensagemLog += `📍 Novo Endereço:\n${endCorr}\n\n`;
        if (!nfOk && nfCorr) mensagemLog += `🧾 Novos Dados Faturamento:\n${nfCorr}`;
    }

    try {
        await supabaseClient.from('propostas_chat').insert({
            id_int: parseInt(clienteState.numero),
            tipo: 'PRODUCAO',
            setor: 'Cliente',
            visivel_externo: true,
            mensagem: mensagemLog,
            remetente_nome: 'Cliente (aprovação online)'
        });
    } catch(e) {}

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            await supabaseClient.from('pedidos_artes')
                .update({ entrega_dados: precisaAtencao ? 'CORRIGIR' : 'APROVADO' })
                .eq('id_int', parseInt(clienteState.numero));
        }
    } catch(e) {
        console.warn('Erro ao atualizar entrega_dados em pedidos_artes:', e);
    }

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const osId = clienteState.osId;
            if (osId.startsWith('vibe_')) {
                await supabaseClient.from('pedidos_links_cliente').update({ status_arte: 'APROVADO' }).eq('os_id', osId);
            } else {
                await supabaseClient.from('producao_ordens_servico').update({ status: 'APROVADO' }).eq('id', osId);
            }
        }
    } catch (osErr) {
        console.warn('Erro ao atualizar status global da OS para APROVADO:', osErr);
    }

    if (precisaAtencao) {
        mostrarResultadoCliente('✅', 'Pedido Aprovado com Sucesso!', 
            'Sua aprovação foi concluída e os dados confirmados.<br><br><b style="color: #f97316;">Como você não aprovou o local de entrega e/ou dados para Nota Fiscal, AGUARDE CONTATO DO SEU ATENDENTE PARA CORREÇÃO.</b>');
    } else {
        const sucessoHTML = `
            Sua aprovação foi concluída e os dados confirmados.<br><br>
            <div style="text-align: left; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 15px;">
                <h4 style="margin: 0 0 10px 0; color: var(--text);">📦 Endereço Aprovado:</h4>
                ${window.clienteConfirmacoes.endHtml}
                <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 15px 0;">
                <h4 style="margin: 0 0 10px 0; color: var(--text);">🧾 Nota Fiscal Aprovada:</h4>
                ${window.clienteConfirmacoes.cliHtml}
            </div>
        `;
        mostrarResultadoCliente('✅', 'Pedido Aprovado com Sucesso!', sucessoHTML);
    }
};

function mostrarResultadoCliente(icon, titulo, msg) {
    const contentEl = document.getElementById('cliente-content');
    const resultadoEl = document.getElementById('cliente-resultado');
    const iconEl = document.getElementById('cliente-resultado-icon');
    const tituloEl = document.getElementById('cliente-resultado-titulo');
    const msgEl = document.getElementById('cliente-resultado-msg');

    // Esconder o container de itens e o botão de aprovação, mostrar resultado
    const container = document.getElementById('cliente-amostras-itens-container');
    const actions = document.querySelector('.cliente-actions');
    if (container) container.style.display = 'none';
    if (actions) actions.style.display = 'none';
    
    if (resultadoEl) resultadoEl.style.display = 'block';
    if (iconEl) iconEl.textContent = icon;
    if (tituloEl) tituloEl.textContent = titulo;
    if (msgEl) msgEl.innerHTML = msg;
}

function openClienteLightbox(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const overlay = document.getElementById('cliente-lightbox-overlay');
    const img = document.getElementById('cliente-lightbox-img');
    const container = document.getElementById('cliente-lightbox-container');
    if (!overlay || !img) return;
    
    if (el.tagName === 'CANVAS') {
        img.src = el.toDataURL('image/png');
    } else if (el.tagName === 'IMG') {
        img.src = el.src;
    } else if (typeof el === 'string' && el.startsWith('http')) {
        img.src = el; // Fallback se passar a URL direta
    }
    
    overlay.style.display = 'flex';
    
    // Resetar transformações
    let scale = 1.0;
    let posX = 0;
    let posY = 0;
    img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    
    // Configurar interações de arrastar (pan) e zoom
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    // Multi-touch pinch-to-zoom
    let initialDist = 0;
    
    // Eventos de mouse/touch para arrastar (pan)
    const onStart = (e) => {
        const touches = e.touches || [];
        if (touches.length === 2) {
            isDragging = false;
            initialDist = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
        } else {
            isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX - posX;
            startY = clientY - posY;
            img.style.cursor = 'grabbing';
            img.style.transition = 'none'; // Desativar transição durante drag
        }
    };
    
    const onMove = (e) => {
        const touches = e.touches || [];
        if (touches.length === 2 && initialDist > 0) {
            const dist = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            const factor = dist / initialDist;
            scale = Math.max(0.8, Math.min(5, scale * factor));
            initialDist = dist;
            img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        } else if (isDragging) {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            posX = clientX - startX;
            posY = clientY - startY;
            img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        }
    };
    
    const onEnd = () => {
        isDragging = false;
        initialDist = 0;
        img.style.cursor = 'grab';
        img.style.transition = 'transform 0.1s ease'; // Reativar transição suave
    };
    
    // Duplo toque/clique para alternar zoom (1.0x <-> 2.5x)
    let lastTap = 0;
    const onDoubleTap = (e) => {
        const now = new Date().getTime();
        const timesince = now - lastTap;
        if (timesince < 300 && timesince > 0) {
            img.style.transition = 'transform 0.2s ease';
            if (scale > 1.2) {
                scale = 1.0;
                posX = 0;
                posY = 0;
            } else {
                scale = 2.5;
                posX = 0;
                posY = 0;
            }
            img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        }
        lastTap = now;
    };
    
    img.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    
    img.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    
    img.addEventListener('click', onDoubleTap);
    
    // Clique no overlay/container fecha o lightbox
    const onOverlayClick = (e) => {
        if (e.target === overlay || e.target === container) {
            closeClienteLightbox();
        }
    };
    overlay.addEventListener('click', onOverlayClick);
    
    // Salvar referências para remover eventos ao fechar
    window.clienteLightboxCleanup = () => {
        img.removeEventListener('mousedown', onStart);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        
        img.removeEventListener('touchstart', onStart);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        img.removeEventListener('click', onDoubleTap);
        overlay.removeEventListener('click', onOverlayClick);
    };
}

function closeClienteLightbox() {
    const overlay = document.getElementById('cliente-lightbox-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof window.clienteLightboxCleanup === 'function') {
        window.clienteLightboxCleanup();
    }
}


document.addEventListener('DOMContentLoaded', () => {
    checkClienteRoute();
});

/**
 * Atualiza a barra final dinamicamente no link do cliente
 */
function atualizarBarraFinalCliente(osId) {
    if (state.amostrasContainerId !== 'cliente-amostras-itens-container') return;

    const containerActions = document.querySelector('.cliente-actions');
    if (!containerActions) return;

    const itens = state.osItens[osId] || [];
    if (itens.length === 0) return;

    // Verificar se todos os modelos estão aprovados
    const todosAprovados = itens.every(item => item.amostra_status === 'APROVADA');

    // Verificar se pelo menos um modelo está reprovado (alteração)
    const algumReprovado = itens.some(item => item.amostra_status === 'REPROVADA');

    let html = '';
    if (todosAprovados) {
        // Verde, ativo, Finalizar e Aprovar Pedido Completo
        html = `
            <button class="btn btn-lg" onclick="clienteFinalizarFluxo('APROVAR_TUDO')" id="btn-cliente-aprovar-tudo" style="width: 100%; font-weight: 700; height: 48px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 10px; background-color: #22c55e; border-color: #22c55e; color: #ffffff; cursor: pointer;">
                ✅ FINALIZAR E APROVAR PEDIDO COMPLETO
            </button>
        `;
    } else if (algumReprovado) {
        // Tons de laranja e vermelho, ativo, Solicitar Alteração de Arte
        html = `
            <button class="btn btn-lg" onclick="clienteFinalizarFluxo('SOLICITAR_ALTERACAO')" id="btn-cliente-aprovar-tudo" style="width: 100%; font-weight: 700; height: 48px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 10px; background-color: #ef4444; color: #ffffff; border: none; cursor: pointer;">
                ⚠️ SOLICITAR ALTERAÇÃO DE ARTE
            </button>
        `;
    } else {
        // Inativo, cinza desabilitado, escrito Finalizar e Aprovar Pedido Completo
        html = `
            <button class="btn btn-lg" id="btn-cliente-aprovar-tudo" disabled style="width: 100%; font-weight: 700; height: 48px; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 10px; background-color: #374151; color: #9ca3af; border: 1px solid #374151; cursor: not-allowed; opacity: 0.6;">
                ✅ FINALIZAR E APROVAR PEDIDO COMPLETO
            </button>
        `;
    }

    containerActions.innerHTML = html;
}

