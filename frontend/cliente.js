// --- ARQUIVO DO CLIENTE ISOLADO ---

/**
 * Desenha uma imagem (Image ou canvas) encaixada na caixa (x, y, w, h) SEM distorcer,
 * preservando a proporcao original e centralizando a sobra.
 *
 * Copia deliberada da drawImageContain() do script.js: a cliente.html nao carrega o
 * script.js, entao a funcao nao existe aqui. Sao os elementos PDF/SVG da numeracao que
 * dependem dela — o engine.py impoe os dois com keep_proportion=True, e um
 * ctx.drawImage(img, x, y, w, h) cru esticaria na tela o que o papel vai encaixar.
 * A regra do produto e: tamanho original, escala 100%, sem distorcao.
 *
 * Se mexer em uma das duas, mexa na outra.
 */
function drawImageContain(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (!iw || !ih || !(w > 0) || !(h > 0)) return;
    const escala = Math.min(w / iw, h / ih);
    const dw = iw * escala;
    const dh = ih * escala;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

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


/**
 * Gêmea da `escapeHtml()` do `script.js` (~17295). Ela precisa existir aqui
 * porque `cliente.html` não carrega o `script.js` — a página do cliente é
 * autônoma. Nome de modelo vem de texto digitado: um apóstrofo já quebra a
 * linha, e um "<" quebra o bloco inteiro.
 */
function escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * O modelo tem alguma coisa para o cliente ver?
 *
 * Espelha as três saídas do template: o visualizador de PDF quer `arte_url`, o
 * desenho ao vivo em canvas também, e a imagem aprovada quer um
 * `amostra_arte_base64` que seja imagem de verdade. No carregamento do pedido
 * esse campo cai para `arte_url` quando ainda não há snapshot renderizado, e um
 * `.pdf` ali dentro vira um `<img>` quebrado — que na tela é indistinguível de
 * um espaço vazio, sem nenhuma mensagem.
 */
function temArteVisivel(item) {
    if (!item) return false;
    if (item.arte_url) return true;
    const img = item.amostra_arte_base64 || '';
    if (!img) return false;
    return !/\.pdf($|\?)/i.test(img) && !img.toLowerCase().startsWith('data:application/pdf');
}

function renderAmostrasOSItens(osId) {
    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? (os.numero || os.id_int || os.id) : osId;
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const interno = containerId === 'amostras-itens-container';
    // Só o painel interno tem banner; a página do cliente traz o número, o nome
    // e a contagem soltos no cabeçalho do próprio HTML. Enquanto o preenchimento
    // dos três dependia do banner existir, o link do cliente ficava sem contagem
    // nenhuma — e um pedido que exibisse 3 de 8 modelos não tinha como ser
    // percebido, nem pelo cliente nem por quem conferisse a tela.
    const banner = interno ? document.getElementById('amostras-os-banner') : null;
    const avulsa = document.getElementById('amostra-combinada-avulsa');

    if (!os || !container) return;

    const itens = state.osItens[osId] || [];

    if (banner) banner.style.display = 'flex';

    const numEl = document.getElementById(interno ? 'amostras-os-numero' : 'cliente-pedido-numero');
    const cliEl = document.getElementById(interno ? 'amostras-os-cliente' : 'cliente-pedido-cliente');
    const countEl = document.getElementById(interno ? 'amostras-os-itens-count' : 'cliente-os-itens-count');
    if (numEl) numEl.textContent = `#${os.numero}`;
    if (cliEl) cliEl.textContent = os.cliente || '';
    if (countEl) countEl.textContent = `${itens.length} ${itens.length === 1 ? 'modelo' : 'modelos'}`;

    // Modelos que não têm o que mostrar. O cliente enxerga o card, mas a área da
    // arte fica vazia — sem este aviso, "faltou modelo" é indistinguível de
    // "o pedido é menor do que eu lembrava".
    const semArte = itens.filter(it => !temArteVisivel(it));
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

        // Determinar o formato ID do item da OS (via formato_id do banco, via produto ou via nome do formato)
        let itemFormatoId = item.formato_id;
        if (!itemFormatoId && state.produtosGlobais) {
            const prodId = item.id_produto || item.produto_id;
            let produtoObj = null;
            if (prodId) {
                produtoObj = state.produtosGlobais.find(p => String(p.id) === String(prodId) || String(p.id_produto) === String(prodId));
            }
            if (!produtoObj) {
                const prodName = item.nome_produto_real || item.produto;
                if (prodName) {
                    const cleanProdName = prodName.toLowerCase().trim();
                    produtoObj = state.produtosGlobais.find(p => {
                        const nameMatch = (p.nomeReal || '').toLowerCase().trim() === cleanProdName || fuzzyMatch(p.nomeReal, prodName);
                        if (nameMatch) return true;
                        const apelidos = (p.apelidos || '').split(',').map(a => a.trim().toLowerCase());
                        return apelidos.includes(cleanProdName) || apelidos.some(a => fuzzyMatch(a, prodName));
                    });
                }
            }
            if (produtoObj && produtoObj.id_formato) {
                itemFormatoId = produtoObj.id_formato;
            }
        }
        if (!itemFormatoId && item.formato) {
            itemFormatoId = matchFormato(item.formato);
        }

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


        // Numeração com banco de dados: o cliente folheia as linhas DESTE
        // modelo, e a visualização passa a ser desenhada aqui, no navegador
        // dele (canvas), em vez de ser a imagem aprovada (<img>). Uma imagem
        // por linha seria inviável — 3.000 linhas dariam centenas de MB.
        const numDoModelo = resolvedNumId
            ? (state.numeracoes || []).find(n => String(n.id) === String(resolvedNumId))
            : null;
        // Só troca a imagem aprovada pelo desenho ao vivo quando o desenho tem
        // com o que trabalhar. Sem `arte_url` o canvas sairia com a cor e a
        // numeração e SEM a arte — pior do que não paginar. Modo PDF fica de
        // fora porque já tem o seletor de páginas dele.
        const temArteParaDesenhar = !!item.arte_url && (!item.verso || !!item.verso_arte_url);
        const paginaCsv = temCsvVariavel(numDoModelo) && !item.modo_pdf && temArteParaDesenhar;
        // Se há de fato o que mostrar. Testar a verdade de `amostra_arte_base64`
        // não bastava: no carregamento do pedido esse campo cai para `arte_url`
        // quando ainda não há snapshot, então um modelo cuja arte é PDF entrava
        // num `<img>`, não desenhava nada — e ainda escondia o aviso de vazio,
        // por o campo estar preenchido. Sobrava um retângulo branco sem legenda.
        const arteVisivel = temArteVisivel(item);
        const versoVisivel = !!item.verso_amostra_arte_base64
            && !/\.pdf($|\?)/i.test(item.verso_amostra_arte_base64);

        // Filtrar numerações com base no formato da cor selecionada
        const filteredNumeracoes = (state.numeracoes || []).filter(n => {
            // Se for a numeração salva neste item, sempre exibe
            if (String(n.id) === String(resolvedNumId)) return true;

            // Se for customizada
            if (n.is_custom) {
                if (n.Cli_Num) {
                    // Se for vinculada a um cliente, só exibe se for o cliente atual
                    if (String(n.Cli_Num) !== String(clienteState.idCliente)) return false;
                } else {
                    // Fallback legado: se não tiver Cli_Num, só exibe se for vinculada a este item específico
                    if (String(n.os_item_id) !== String(item.id)) return false;
                }
            }
            
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
        <div class="card" style="border: 1px solid #918f8c; margin-bottom: 6pt;">
            <div class="card-header" style="background: rgba(59, 130, 246, 0.08); border-bottom: 1px solid #918f8c; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span class="card-title">🧪 <strong>Produto: ${item.nome_produto_real || item.produto || '--'}</strong></span>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span class="badge" style="font-size: 0.72rem;">📦 Qtd: ${item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem; font-family: monospace;">NI: ${item.num_inicial || 1} → NF: ${item.num_final || item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem;">${item.verso ? '✅ Verso' : '-- S/ Verso'}</span>
                    <span class="badge" style="font-size: 0.72rem;">🏭 ${item.setor || '--'}</span>
                    ${statusBadge}
                </div>
            </div>
            <div class="amostra-card-corpo" style="padding: 24px;">
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
                    <div id="amostra-item-header-${idx}" style="color: #FFD700; font-weight: 800; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 8px; display: block; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                        ${item.nome_modelo || `Modelo ${idx + 1}`}
                    </div>
                    ${state.amostrasContainerId === 'cliente-amostras-itens-container' ?
                        (item.verso ? `
                        <div style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--blue); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">FRENTE</div>
                                ${item.modo_pdf ? `
                                <div id="amostra-pdf-viewer-${idx}" style="text-align: center;">
                                    <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
                                    <div id="amostra-pdf-nav-${idx}" style="display:none; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                                        <button class="btn btn-sm btn-secondary" onclick="pdfViewerPrevPage(${idx})">◀</button>
                                        <span id="amostra-pdf-page-info-${idx}" style="font-weight:700; font-size:0.9rem;">Página 1 / 1</span>
                                        <button class="btn btn-sm btn-secondary" onclick="pdfViewerNextPage(${idx})">▶</button>
                                    </div>
                                    <div id="amostra-item-empty-pdf-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${item.arte_url ? 'none' : 'block'};">
                                         <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">📄</div>
                                         <p style="font-size: 0.85rem; font-weight: 600;">PDF Multi-Página</p>
                                    </div>
                                </div>
                                ` : `
                                ${paginaCsv ? `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>` : `<img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />`}
                                `}
                                <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${paginaCsv || arteVisivel || item.modo_pdf ? 'none' : 'block'};">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Arte da frente ainda não enviada</p>
                                </div>
                            </div>
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--amber); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">VERSO</div>
                                ${paginaCsv ? `<canvas id="amostra-item-canvas-verso-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-verso-${idx}')"></canvas>` : `<img id="amostra-item-img-verso-${idx}" src="${item.verso_amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.verso_amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-verso-${idx}')" />`}
                                <div id="amostra-item-empty-verso-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${paginaCsv || versoVisivel ? 'none' : 'block'};">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Arte do verso ainda não enviada</p>
                                </div>
                            </div>

                            ${!paginaCsv ? '' : `
                            <!-- Seletor de ingressos. Um so comanda as duas
                                 faces: frente e verso mostram sempre a mesma
                                 linha. So existe onde o desenho e ao vivo: sobre
                                 a imagem aprovada nao haveria o que virar. -->
                            <div id="amostra-csv-nav-${idx}" class="amostra-csv-nav" style="display:none;">
                                <div class="rotulo">Confira os ingressos</div>
                                <div class="controles">
                                    <button class="btn btn-sm btn-secondary seta" id="amostra-csv-prev-${idx}" onclick="amostraCsvPagina(${idx}, -1)" title="Ingresso anterior">&#9664;</button>
                                    <span id="amostra-csv-info-${idx}" class="info">Ingresso 1 de 1</span>
                                    <input type="number" id="amostra-csv-goto-${idx}" class="ir" min="1" value="1" title="Ir para o ingresso" onchange="amostraCsvPagina(${idx}, 0, parseInt(this.value))">
                                    <button class="btn btn-sm btn-secondary seta" id="amostra-csv-next-${idx}" onclick="amostraCsvPagina(${idx}, 1)" title="Próximo ingresso">&#9654;</button>
                                </div>
                                <div id="amostra-csv-resumo-${idx}" class="resumo"></div>
                            </div>`}
                        </div>
                        ` : `
                        ${item.modo_pdf ? `
                        <div id="amostra-pdf-viewer-${idx}" style="text-align: center;">
                            <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
                            <div id="amostra-pdf-nav-${idx}" style="display:none; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerPrevPage(${idx})">◀</button>
                                <span id="amostra-pdf-page-info-${idx}" style="font-weight:700; font-size:0.9rem;">Página 1 / 1</span>
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerNextPage(${idx})">▶</button>
                            </div>
                            <div id="amostra-item-empty-pdf-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${item.arte_url ? 'none' : 'block'};">
                                 <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">📄</div>
                                 <p style="font-size: 0.85rem; font-weight: 600;">PDF Multi-Página</p>
                                 <p style="font-size: 0.82rem; opacity: 0.7; margin-top: 4px;">Aguardando upload do PDF.</p>
                            </div>
                        </div>
                        ` : `
                        ${paginaCsv ? `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>` : `<img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />`}
                        `}

                            ${!paginaCsv ? '' : `
                            <!-- Seletor de ingressos. Um so comanda as duas
                                 faces: frente e verso mostram sempre a mesma
                                 linha. So existe onde o desenho e ao vivo: sobre
                                 a imagem aprovada nao haveria o que virar. -->
                            <div id="amostra-csv-nav-${idx}" class="amostra-csv-nav" style="display:none;">
                                <div class="rotulo">Confira os ingressos</div>
                                <div class="controles">
                                    <button class="btn btn-sm btn-secondary seta" id="amostra-csv-prev-${idx}" onclick="amostraCsvPagina(${idx}, -1)" title="Ingresso anterior">&#9664;</button>
                                    <span id="amostra-csv-info-${idx}" class="info">Ingresso 1 de 1</span>
                                    <input type="number" id="amostra-csv-goto-${idx}" class="ir" min="1" value="1" title="Ir para o ingresso" onchange="amostraCsvPagina(${idx}, 0, parseInt(this.value))">
                                    <button class="btn btn-sm btn-secondary seta" id="amostra-csv-next-${idx}" onclick="amostraCsvPagina(${idx}, 1)" title="Próximo ingresso">&#9654;</button>
                                </div>
                                <div id="amostra-csv-resumo-${idx}" class="resumo"></div>
                            </div>`}
                        <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${paginaCsv || arteVisivel || item.modo_pdf ? 'none' : 'block'};">
                             <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                             <p style="font-size: 0.95rem; font-weight: 600;">Arte ainda não enviada pela gráfica</p>
                             <p style="font-size: 0.82rem; opacity: 0.8; margin-top: 4px;">Este modelo faz parte do pedido, mas ainda não há o que visualizar. Fale com o seu atendimento.</p>
                        </div>
                        `)
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

    // Aviso de modelos sem arte — só no link do cliente. No painel interno o
    // canvas desenha cor e numeração mesmo sem arte nenhuma, então lá o operador
    // vê todos os modelos desenhados e nada denuncia a falta; quem sofre a falta
    // é esta tela, e é aqui que ela precisa estar escrita.
    if (!isInternal && semArte.length) {
        const n = semArte.length;
        const nomes = semArte
            .map(it => escapeHtml(it.nome_modelo || `Modelo ${itens.indexOf(it) + 1}`))
            .join(', ');
        finalHtml = `
            <div style="border: 1px solid var(--amber); border-left: 4px solid var(--amber); background: rgba(245,158,11,0.10); border-radius: var(--radius-sm); padding: 16px 18px; margin-bottom: 10px; display: flex; gap: 12px; align-items: flex-start;">
                <div style="font-size: 1.5rem; line-height: 1.1;">⚠️</div>
                <div style="min-width: 0;">
                    <div style="font-weight: 800; color: var(--amber); font-size: 0.95rem; margin-bottom: 5px;">
                        ${n === 1
                            ? '1 modelo ainda está sem arte para você ver'
                            : `${n} dos ${itens.length} modelos ainda estão sem arte para você ver`}
                    </div>
                    <div style="font-size: 0.88rem; color: var(--text-dim); line-height: 1.55;">
                        ${n === 1 ? 'Ele aparece' : 'Eles aparecem'} na lista abaixo com o espaço da arte em branco:
                        <strong style="color: var(--text);">${nomes}</strong>.
                        Fale com o seu atendimento antes de aprovar o pedido.
                    </div>
                </div>
            </div>` + finalHtml;
    }

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
            
            if (item.modo_pdf || item.arte_url || item.verso_arte_url || item.amostra_cor_id || item.amostra_num_id || item.amostra_arte_base64 || item.verso_amostra_arte_base64 || hasSelectValue) {
                renderItemAmostraCombinada(idx, osId);
            }
        });
        // Atualizar a barra final de ações do cliente dinamicamente
        atualizarBarraFinalCliente(osId);
    }, 50);

    // Não inicialize o PDF viewer aqui. Havia um segundo laço, aos 200 ms, que
    // chamava `initPdfViewer` para todo item em modo PDF — sem guarda nenhuma,
    // e para os MESMOS itens que o laço acima já cobre: a condição dele inclui
    // `item.modo_pdf`, e o `drawAmostraFace` inicializa o viewer no ramo de modo
    // PDF. Eram duas inicializações concorrentes desenhando no mesmo canvas.
    //
    // O sintoma: ao abrir o link, a página 1 saía em escala e orientação erradas
    // (metade do tamanho, no quadrante superior esquerdo, espelhada), porque o
    // segundo `renderPdfViewerPage` reatribuía `canvas.width` no meio do desenho
    // do primeiro — o que zera o canvas e a transformação que o pdf.js tinha
    // aplicado. O pdf.js reclamava "Cannot use the same canvas during multiple
    // render() operations", o `catch` engolia num `console.error`, e o cliente
    // ficava com a arte desconfigurada até navegar de página e voltar, que
    // redesenha sozinho e sai certo. O painel interno (`script.js`) nunca teve
    // esse segundo laço.
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
            if (propData) {
                osCliente = propData.cliente_nome || '';
                clienteState.idCliente = propData.id_faturado || propData.id_cliente || null;
            }
        } catch (e) { /* silencioso */ }

        if (clienteEl) clienteEl.textContent = osCliente;



        // Carregar formatos, cores e numerações para o state global do front
        try {
            const [coresRes, numeracoesRes, formatosRes, produtosRes] = await Promise.all([
                supabaseClient.from('producao_cores').select('*').order('name', { ascending: true }),
                // Colunas explicitas, sem `csv_data`. Com `select('*')` o
                // cliente baixava os bancos de TODAS as numeracoes do sistema —
                // 569 KB, dos quais 84% eram CSV de pedidos alheios que ele
                // nunca veria. O banco do proprio pedido vem logo abaixo.
                supabaseClient.from('producao_numeracoes')
                    .select('id, name, tipo, formato_id, formato_ids, elements, print_mode, ticket_qtd, ticket_logica, csv_headers, csv_filename, Cli_Num, is_custom, os_item_id')
                    .order('name', { ascending: true }),
                supabaseClient.from('producao_formatos').select('*').order('name', { ascending: true }),
                supabaseClient.from('produtos').select('*')
            ]);
            state.cores = coresRes.data || [];
            const allNums = numeracoesRes.data || [];
            state.numeracoes = allNums.filter(n => {
                if (!n.Cli_Num) return true;
                return String(n.Cli_Num) === String(clienteState.idCliente);
            });
            state.formatos = formatosRes.data || [];
            state.produtosGlobais = produtosRes.data || [];
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
            
            // Buscar nome do produto original da proposta e id_produto
            const { data: propData } = await supabaseClient
                .from('produtos_proposta')
                .select('id, nome_produto, id_produto')
                .eq('id_int', queryNum);
            
            if (prodItems && prodItems.length > 0) {
                itensCarregados = prodItems.map(item => {
                    const prop = propData?.find(p => p.id === item.id_produto_proposta_origem);
                    
                    // Remapear o status_arte do banco para o amostra_status usado pelo renderAmostrasOSItens
                    let statusFrontend = 'PENDENTE';
                    if (item.status_arte === 'AGUARDANDO_CLIENTE' || item.status_arte === 'PRONTO') statusFrontend = 'PRONTO';
                    else if (item.status_arte === 'APROVADA_CLIENTE' || item.status_arte === 'APROVADA') statusFrontend = 'APROVADA';
                    else if (item.status_arte === 'REPROVADA_CLIENTE' || item.status_arte === 'REPROVADA') statusFrontend = 'REPROVADA';
                    // Mesma conferencia do painel: o parceiro troca cor e numeracao
                    // pelo NOME, e o id gravado antes nao pode continuar mandando.
                    // Sem isto o cliente aprovaria uma amostra na cor errada — e o
                    // painel, ja corrigido, mostraria outra coisa.
                    const idsDoBanco = (typeof reconciliarCorNumDoModelo === 'function')
                        ? reconciliarCorNumDoModelo(item, state.cores, state.numeracoes)
                        : { corId: item.amostra_cor_id, numId: item.amostra_num_id };

                    const resolvedNumId = idsDoBanco.numId || (prop ? prop.amostra_num_id : null);
                    const matchedNum = resolvedNumId ? (state.numeracoes || []).find(n => String(n.id) === String(resolvedNumId)) : null;
                    const numIsDuplex = typeof isNumeracaoDuplex === 'function' ? isNumeracaoDuplex(matchedNum) : !!(matchedNum && (matchedNum.print_mode === 'duplex' || (matchedNum.elements && matchedNum.elements.some(e => e && e.face === 'back'))));
                    // 'Frente' faltava nesta lista: o operador grava exatamente esse
                    // valor ao trocar para uma numeração só frente, e sem ele o
                    // cliente continuava vendo o bloco de verso.
                    const _semVerso = (vt) => {
                        const v = String(vt || '').trim().toUpperCase();
                        return !v || v === 'FRENTE' || v === 'SÓ FRENTE' || v === 'SO FRENTE';
                    };
                    const itemVerso = !_semVerso(item.verso_tipo) || numIsDuplex;
                    return {
                        ...item,
                        produto: item.nome_modelo || 'Modelo',
                        nome_produto_real: prop ? prop.nome_produto : null,
                        id_produto: prop ? prop.id_produto : (item.id_produto || null),
                        os_id: osId,
                        amostra_cor_id: idsDoBanco.corId,
                        amostra_num_id: resolvedNumId,
                        verso: itemVerso,
                        verso_tipo: itemVerso ? (!_semVerso(item.verso_tipo) ? item.verso_tipo : 'FRENTE E VERSO') : (item.verso_tipo || 'SÓ FRENTE'),
                        amostra_obs: item.observacao_arte || item.amostra_obs || '',
                        amostra_status: statusFrontend,
                        // Garantir que a imagem de aprovacao esteja sempre populada
                        amostra_arte_base64: item.amostra_arte_base64 || item.arte_url || '',
                        verso_amostra_arte_base64: item.verso_amostra_arte_base64 || item.verso_arte_url || ''
                    };
                });
            }
        } catch (e) { console.warn('Erro ao buscar pedidos_modelos:', e); }

        state.osItens[osId] = itensCarregados;

        // 2. O banco de dados (CSV) apenas das numeracoes que ESTE pedido usa.
        //    E o que permite folhear os ingressos sem baixar o catalogo inteiro.
        try {
            const numIds = [...new Set(
                itensCarregados.map(it => it.amostra_num_id || it.numeracao_id).filter(Boolean).map(String)
            )];
            if (numIds.length) {
                const { data: bancos } = await supabaseClient
                    .from('producao_numeracoes')
                    .select('id, csv_data')
                    .in('id', numIds);
                (bancos || []).forEach(b => {
                    const n = (state.numeracoes || []).find(x => String(x.id) === String(b.id));
                    if (n) n.csv_data = b.csv_data;
                });
            }
        } catch (e) { console.warn('Erro ao buscar o banco de dados das numeracoes:', e); }

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

        // Buscar entrega_dados da tabela pedidos_artes
        let entregaStatus = '----';
        try {
            const numInt = parseInt(linkData.numero_pedido || linkData.id_int || numero);
            if (!isNaN(numInt)) {
                const { data: paData } = await supabaseClient
                    .from('pedidos_artes')
                    .select('entrega_dados')
                    .eq('id_int', numInt)
                    .maybeSingle();
                if (paData && paData.entrega_dados) {
                    entregaStatus = paData.entrega_dados.toUpperCase();
                    if (!state.todasArtes) state.todasArtes = [];
                    let globalArte = state.todasArtes.find(a => String(a.id_int) === String(numInt));
                    if (globalArte) {
                        globalArte.entrega_dados = paData.entrega_dados;
                    } else {
                        state.todasArtes.push({ id_int: numInt, entrega_dados: paData.entrega_dados });
                    }
                }
            }
        } catch (e) {
            console.warn('[ClienteView] Erro ao carregar entrega_dados:', e);
        }

        // REGRA DE ACESSO DO CLIENTE:
        // Se a entrega/faturamento estiver em 'ALTERADO' OU se a OS estiver em 'Enviar Arte' (ou 'Enviar ARTE'),
        // a página do cliente DEVE ABRIR para que ele faça a conferência e aprovação dos dados!
        const statusUP = osStatus.trim().toUpperCase();
        const isAprovado  = (statusUP === 'APROVADO' || statusUP === 'APROVADA_CLIENTE');
        const isReprovado = (statusUP === 'REPROVADO' || statusUP === 'REPROVADA_CLIENTE');
        const isAguardandoAprovacao = (
            statusUP === 'AGUARD. APROVAÇÃO' ||
            statusUP === 'AGUARD. APROVACAO' ||
            statusUP === 'AGUARDANDO_APROVACAO' ||
            statusUP === 'AGUARDANDO' ||
            statusUP === 'ENVIAR ARTE' ||
            osStatus.trim() === 'Enviar Arte'
        );
        const isEntregaAlterada = (entregaStatus === 'ALTERADO');

        console.log('[ClienteView] Decisão de exibição:', { osStatus, entregaStatus, isEntregaAlterada, isAguardandoAprovacao, isAprovado, isReprovado });

        if (isEntregaAlterada || isAguardandoAprovacao) {

            // Permite acesso direto à aprovação de entrega/faturamento ou artes
            const itensArray = state.osItens[osId] || [];
            const todosAprovados = itensArray.length > 0 && itensArray.every(item => item.amostra_status === 'APROVADA');
            
            if (todosAprovados && !isEntregaAlterada) {
                mostrarConfirmacaoDadosCliente(osId);
            } else {
                renderAmostrasOSItens(osId);
            }
        } else if (isAprovado) {
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
        } else {
            // Em Arte, Pendente Informação, ou qualquer outro status intermediário sem alteração de entrega
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
                            .update({ status_arte: 'Em Alteração' })
                            .eq('os_id', osId);
                        if (error) throw error;
                    } else {
                        const { error } = await supabaseClient
                            .from('producao_ordens_servico')
                            .update({ status: 'Em Alteração' }).eq('id', osId);
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

window.clienteConfirmacoes = { geralOk: null, geralCorrecao: '', cliHtml: '', endHtml: '' };

function checarConclusaoConfirmacoes() {
    const btn = document.getElementById('btn-finalizar-confirmacoes');
    if (!btn) return;
    
    const geralOk = window.clienteConfirmacoes.geralOk;
    const geralCorr = window.clienteConfirmacoes.geralCorrecao;
    const feito = (geralOk === true) || (geralOk === false && geralCorr !== '');

    if (feito) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        
        if (geralOk === false) {
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

window.desfazerConfirmacao = function(tipo = 'geral') {
    window.clienteConfirmacoes.geralOk = null;
    window.clienteConfirmacoes.geralCorrecao = '';
    
    const btnConfirmar = document.getElementById(`btn-confirmar-${tipo}`);
    const btnAlterar = document.getElementById(`btn-alterar-${tipo}`);
    if (btnConfirmar) {
        btnConfirmar.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        btnConfirmar.style.borderColor = 'var(--border-color)';
        btnConfirmar.style.color = 'var(--text)';
    }
    if (btnAlterar) {
        btnAlterar.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        btnAlterar.style.borderColor = 'var(--border-color)';
        btnAlterar.style.color = 'var(--text)';
    }
    
    const acoesEl = document.getElementById(`acoes-${tipo}`);
    const corrEl = document.getElementById(`correcao-${tipo}`);
    const statusEl = document.getElementById(`status-${tipo}`);
    const inputEl = document.getElementById(`input-correcao-${tipo}`);

    if (acoesEl) acoesEl.style.display = 'flex';
    if (corrEl) corrEl.style.display = 'none';
    if (statusEl) statusEl.innerHTML = '';
    if (inputEl) inputEl.value = '';
    
    checarConclusaoConfirmacoes();
};

window.acaoConfirmacaoItem = function(tipo, ok) {
    window.clienteConfirmacoes.geralOk = ok;
    
    const btnConfirmar = document.getElementById(`btn-confirmar-${tipo}`);
    const btnAlterar = document.getElementById(`btn-alterar-${tipo}`);
    const boxCorrecao = document.getElementById(`correcao-${tipo}`);
    const badgeStatus = document.getElementById(`status-${tipo}`);
    
    if (ok) {
        if (btnConfirmar) {
            btnConfirmar.style.backgroundColor = '#22c55e';
            btnConfirmar.style.borderColor = '#22c55e';
            btnConfirmar.style.color = '#fff';
        }
        if (btnAlterar) {
            btnAlterar.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            btnAlterar.style.borderColor = 'var(--border-color)';
            btnAlterar.style.color = 'var(--text)';
        }
        if (boxCorrecao) boxCorrecao.style.display = 'none';
        if (badgeStatus) badgeStatus.innerHTML = '';
    } else {
        if (btnAlterar) {
            btnAlterar.style.backgroundColor = '#f97316';
            btnAlterar.style.borderColor = '#f97316';
            btnAlterar.style.color = '#fff';
        }
        if (btnConfirmar) {
            btnConfirmar.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            btnConfirmar.style.borderColor = 'var(--border-color)';
            btnConfirmar.style.color = 'var(--text)';
        }
        if (boxCorrecao) boxCorrecao.style.display = 'block';
        if (badgeStatus) {
            badgeStatus.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                    <span style="color: #f97316; font-weight: bold;">⚠️ Informe os dados corretos abaixo:</span>
                </div>
            `;
        }
    }
    checarConclusaoConfirmacoes();
};

window.salvarCorrecaoTexto = function(tipo = 'geral') {
    const textarea = document.getElementById(`input-correcao-${tipo}`);
    const texto = textarea ? textarea.value.trim() : '';
    if (!texto) {
        toast('Por favor, informe os dados corretos antes de salvar.', 'warning');
        return;
    }
    
    window.clienteConfirmacoes.geralCorrecao = texto;
    const boxCorrecao = document.getElementById(`correcao-${tipo}`);
    if (boxCorrecao) boxCorrecao.style.display = 'none';
    
    const badgeStatus = document.getElementById(`status-${tipo}`);
    if (badgeStatus) {
        badgeStatus.innerHTML = `
            <div style="background: rgba(249, 115, 22, 0.1); padding: 10px; border-radius: 6px; border: 1px solid #f97316; margin-bottom: 10px;">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <span style="color: #f97316; font-weight: bold;">✅ Correção Registrada</span>
                    <button class="btn btn-sm" onclick="desfazerConfirmacao('${tipo}')" style="background: transparent; border: 1px solid var(--border-color); color: var(--text); padding: 5px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Editar</button>
                </div>
                <small style="color: var(--text-dim); margin-top: 5px; display: inline-block; word-break: break-word;">${texto.substring(0, 150)}${texto.length > 150 ? '...' : ''}</small>
            </div>
        `;
    }
    
    checarConclusaoConfirmacoes();
};

async function mostrarConfirmacaoDadosCliente(osId) {
    window.clienteConfirmacoes = { geralOk: null, geralCorrecao: '', cliHtml: '', endHtml: '' };
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

        // 1. DADOS PARA NOTA FISCAL (PRIMEIRO BLOCO)
        let cliHtml = '<div style="color: var(--text-dim); font-style: italic;">Dados de faturamento não cadastrados.</div>';
        if (clienteFaturamento) {
            const nomeRazao = clienteFaturamento.nome || clienteFaturamento.fantasia || '';
            const documento = clienteFaturamento.documento || '';
            const ie = clienteFaturamento.ins_estadual || 'ISENTO';
            const email = clienteFaturamento.email_financeiro || clienteFaturamento.email_contato || clienteFaturamento.email || '';
            const telefone = clienteFaturamento.whatsapp_1 || clienteFaturamento.telefone_fixo || '';

            cliHtml = `
                <div style="font-size: 0.95rem; line-height: 1.6; color: var(--text);">
                    <b>Nome/Razão Social:</b> ${nomeRazao}<br>
                    <b>CPF/CNPJ:</b> ${documento}<br>
                    <b>I.E.:</b> ${ie}<br>
                    <b>E-mail:</b> ${email}<br>
                    <b>Telefone:</b> ${telefone}
                </div>
            `;
        }
        window.clienteConfirmacoes.cliHtml = cliHtml;

        // 2. ENDEREÇO DE ENTREGA (SEGUNDO BLOCO)
        let endHtml = '<div style="color: var(--text-dim); font-style: italic;">Endereço não cadastrado no pedido.</div>';
        if (enderecoEntrega) {
            let recebedorHtml = '';
            if (enderecoEntrega.recebedor) {
                recebedorHtml = `<b>Recebedor:</b> ${enderecoEntrega.recebedor}<br>`;
            }
            let cpfRecebedorHtml = '';
            if (enderecoEntrega.cpf_recebedor) {
                cpfRecebedorHtml = `<b>CPF:</b> ${enderecoEntrega.cpf_recebedor}<br>`;
            }

            const ruaNumero = `${enderecoEntrega.endereco || enderecoEntrega.rua || enderecoEntrega.logradouro || ''}, ${enderecoEntrega.numero || 'S/N'}`;
            const complemento = enderecoEntrega.complemento ? `<b>Complemento:</b> ${enderecoEntrega.complemento}<br>` : '';
            const bairro = enderecoEntrega.bairro || '';
            const cidadeUf = `${enderecoEntrega.cidade || ''} - ${enderecoEntrega.uf || ''}`;
            const cep = enderecoEntrega.cep || '';

            endHtml = `
                <div style="font-size: 0.95rem; line-height: 1.6; color: var(--text);">
                    ${recebedorHtml}
                    ${cpfRecebedorHtml}
                    <b>Rua:</b> ${ruaNumero}<br>
                    ${complemento}
                    <b>Bairro:</b> ${bairro}<br>
                    <b>Cidade/UF:</b> ${cidadeUf}<br>
                    <b>CEP:</b> ${cep}
                </div>
            `;
        }
        window.clienteConfirmacoes.endHtml = endHtml;

        confirmContainer.innerHTML = `
            <div style="background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 25px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🎉</div>
                    <div style="color: var(--text); font-size: 1.2rem; font-weight: 700; margin-bottom: 5px;">Pedido #${clienteState.numero || ''}</div>
                    <h2 style="color: var(--green); margin: 0; font-size: 1.5rem;">Artes do Pedido APROVADAS</h2>
                    <p style="color: var(--text-dim); margin-top: 5px;">Por favor, confira seus dados de entrega e faturamento antes de finalizar.</p>
                </div>

                <!-- CARD UNIFICADO DE DADOS DE ENTREGA E FATURAMENTO -->
                <div style="background-color: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                    
                    <!-- BLOCO 1: DADOS PARA NOTA FISCAL -->
                    <div style="margin-bottom: 22px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 1.1rem; color: var(--text); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                            🧾 Dados para Nota Fiscal
                        </h3>
                        <div style="margin-bottom: 10px;">${cliHtml}</div>
                    </div>

                    <!-- BLOCO 2: ENDEREÇO DE ENTREGA -->
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 1.1rem; color: var(--text); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                            📦 ENDEREÇO DE ENTREGA
                        </h3>
                        <div style="margin-bottom: 10px;">${endHtml}</div>
                    </div>

                    <div id="status-geral" style="margin-bottom: 10px;"></div>
                    
                    <!-- BOTÕES UNIFICADOS -->
                    <div id="acoes-geral" style="display: flex; gap: 12px; margin-top: 15px;">
                        <button class="btn" id="btn-confirmar-geral" onclick="acaoConfirmacaoItem('geral', true)" style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text); flex: 1; min-height: 46px; font-size: 1rem; font-weight: bold; transition: all 0.2s; cursor: pointer;">CONFIRMAR</button>
                        <button class="btn" id="btn-alterar-geral" onclick="acaoConfirmacaoItem('geral', false)" style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text); flex: 1; min-height: 46px; font-size: 1rem; font-weight: bold; transition: all 0.2s; cursor: pointer;">ALTERAR</button>
                    </div>

                    <div id="correcao-geral" style="display: none; margin-top: 14px;">
                        <textarea id="input-correcao-geral" class="form-control" rows="4" placeholder="Informe aqui quais dados de faturamento e/ou endereço de entrega precisam ser corrigidos..." style="width: 100%; margin-bottom: 10px; background-color: var(--bg-color); border: 1px solid var(--border-color); color: var(--text); padding: 12px; border-radius: 6px; font-size: 0.95rem;"></textarea>
                        <button class="btn" onclick="salvarCorrecaoTexto('geral')" style="background-color: #f97316; border-color: #f97316; color: #fff; width: 100%; min-height: 44px; font-weight: bold; font-size: 0.95rem; border-radius: 6px; cursor: pointer;">💾 Salvar Correção</button>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; position: sticky; bottom: 20px; z-index: 100;">
                    <button id="btn-finalizar-confirmacoes" class="btn btn-lg" onclick="finalizarConfirmacaoCliente()" disabled style="background-color: #22c55e; border-color: #22c55e; color: #fff; font-weight: bold; width: 100%; opacity: 0.5; cursor: not-allowed; min-height: 56px; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);">
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

    const geralOk = window.clienteConfirmacoes.geralOk;
    const geralCorr = window.clienteConfirmacoes.geralCorrecao;

    const precisaAtencao = (geralOk === false && geralCorr !== '');

    let mensagemLog = '';
    if (!precisaAtencao) {
        mensagemLog = `✅ O CLIENTE CONFIRMOU os dados de entrega e faturamento.`;
    } else {
        mensagemLog = `⚠️ O CLIENTE REPORTOU DADOS INCORRETOS:\n\n${geralCorr}`;
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
            const numPedInt = parseInt(clienteState.numero);
            const { data: existing } = await supabaseClient
                .from('pedidos_artes')
                .select('observacoes')
                .eq('id_int', numPedInt)
                .maybeSingle();

            let obsObj = (existing && existing.observacoes) ? existing.observacoes : {};
            if (typeof obsObj === 'string') {
                try { obsObj = JSON.parse(obsObj); } catch(e) {}
            }
            if (typeof obsObj !== 'object' || !obsObj) obsObj = {};

            if (precisaAtencao) {
                obsObj['correcao_entrega_faturamento'] = mensagemLog;
            }

            await supabaseClient.from('pedidos_artes')
                .update({
                    entrega_dados: precisaAtencao ? 'CORRIGIR' : 'APROVADO',
                    observacoes: obsObj
                })
                .eq('id_int', numPedInt);
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
            'Sua aprovação foi concluída e os dados confirmados.<br><br><b style="color: #f97316;">Como você solicitou alteração nos dados de faturamento e/ou entrega, AGUARDE CONTATO DO SEU ATENDENTE PARA CORREÇÃO.</b>');
    } else {
        const sucessoHTML = `
            Sua aprovação foi concluída e os dados confirmados.<br><br>
            <div style="text-align: left; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 15px;">
                <h4 style="margin: 0 0 10px 0; color: var(--text);">🧾 Nota Fiscal Aprovada:</h4>
                ${window.clienteConfirmacoes.cliHtml}
                <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 15px 0;">
                <h4 style="margin: 0 0 10px 0; color: var(--text);">📦 Endereço Aprovado:</h4>
                ${window.clienteConfirmacoes.endHtml}
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


async function decisionAmostraItem(itemId, osId, status) {
    const obsEl = document.getElementById(`amostra-obs-${itemId}`);
    const obs = obsEl ? obsEl.value : '';

    if (status === 'REPROVADA' && (!obs || obs.trim() === '')) {
        toast('Anotar alteração no campo ANOTAÇÕES', 'warning');
        if (obsEl) obsEl.focus();
        return;
    }
    
    try {
        await saveAmostraToDB(itemId, osId, { amostra_status: status, amostra_obs: obs });
        
        // Se for na página do cliente, vamos notificar no chat do pedido!
        const isClientePage = (state.amostrasContainerId === 'cliente-amostras-itens-container');
        if (isClientePage) {
            const item = state.osItens[osId].find(i => i.id === itemId);
            const prodNome = item ? item.produto : 'Produto';
            
            // Enviar mensagem no chat da proposta
            try {
                await supabaseClient.from('propostas_chat').insert({
                    id_int: parseInt(clienteState.numero),
                    tipo: 'PRODUCAO',
                    setor: 'Cliente',
                    visivel_externo: true,
                    mensagem: status === 'APROVADA' 
                        ? `✅ O cliente APROVOU a amostra do item: "${prodNome}".`
                        : `❌ O cliente solicitou ALTERAÇÃO na amostra do item: "${prodNome}".\nObservações: ${obs || '(Sem observações)'}`,
                    remetente_nome: 'Cliente (via link)',
                });
            } catch (chatErr) {
                console.warn('Erro ao inserir mensagem no chat:', chatErr);
            }
            
            // Se for reprovado e for o fluxo do cliente, podemos atualizar a tabela pedidos_artes também
            if (status === 'REPROVADA') {
                try {
                    await supabaseClient
                        .from('pedidos_artes')
                        .update({ status: 'REPROVADA_CLIENTE', comentarios_revisao: obs })
                        .eq('id_modelo', itemId)
                        .order('versao', { ascending: false })
                        .limit(1);
                } catch (e) { /* silencioso */ }
            }
        }
        
        let msg = '';
        let toastType = 'info';
        if (status === 'APROVADA') {
            msg = 'Item aprovado!';
            toastType = 'success';
        } else if (status === 'REPROVADA') {
            msg = 'Item marcado para alteração!';
            toastType = 'warning';
        } else if (status === 'PRONTO') {
            msg = 'Item marcado como Pronto!';
            toastType = 'success';
        } else {
            msg = `Status atualizado para ${status}`;
        }
        toast(msg, toastType);
        renderAmostrasOSItens(osId);

        // AUTO-STATUS: se o designer marcou um item como PRONTO (contexto interno, não cliente),
        // verificar se TODOS os modelos da OS estão PRONTO. Se sim → mudar status para 'Enviar Arte'
        // automaticamente, sem precisar clicar em "Voltar para Atendimento".
        const isInternal = (state.amostrasContainerId !== 'cliente-amostras-itens-container');
        if (status === 'PRONTO' && isInternal) {
            const todosItens = state.osItens[osId] || [];
            const todosProntos = todosItens.length > 0 && todosItens.every(i => i.amostra_status === 'PRONTO' || i.amostra_status === 'APROVADA');
            if (todosProntos) {
                const novoStatusOS = 'Enviar Arte';
                const os = state.ordens.find(o => o.id === osId);
                if (os && os.status !== novoStatusOS) {
                    // Adiantar o status nesta máquina. O formato { status, ts } tem que
                    // bater com o que o lerStatusOverride() do script.js espera: uma
                    // entrada sem hora é tratada lá como vencida e descartada.
                    const ov = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                    ov[osId] = { status: novoStatusOS, ts: Date.now() };
                    localStorage.setItem('vibe_status_overrides', JSON.stringify(ov));
                    // Atualizar memória
                    os.status = novoStatusOS;
                    // Atualizar banco
                    try {
                        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                            if (osId.startsWith('vibe_')) {
                                await supabaseClient.from('pedidos_links_cliente')
                                    .update({ status_arte: novoStatusOS })
                                    .eq('os_id', osId);
                            } else {
                                await supabaseClient.from('producao_ordens_servico')
                                    .update({ status: novoStatusOS })
                                    .eq('id', osId);
                            }
                        }
                    } catch (autoErr) {
                        console.warn('[AUTO-STATUS] Erro ao atualizar status para Enviar Arte:', autoErr);
                    }
                    toast(`🎉 Todos os modelos prontos! Pedido #${os.numero} mudou para "Enviar Arte" automaticamente.`, 'success');
                }
            }
        }
    } catch (err) {
        console.error('Erro na decisão do item:', err);
        toast('Erro ao registrar decisão: ' + err.message, 'error');
    }
}


async function fetchPdfBytes(content) {
    if (!content) return null;

    // base64 direto (com ou sem prefixo data:)
    if (!content.startsWith('http')) {
        const b64 = content.includes('base64,') ? content.split('base64,')[1] : content;
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        return bytes.buffer;
    }

    // É uma URL -- tenta fetch direto primeiro (Supabase tem CORS público)
    try {
        const resp = await fetch(content);
        if (resp.ok) return await resp.arrayBuffer();
        throw new Error(`HTTP ${resp.status}`);
    } catch (directErr) {
        // Fallback: usa proxy se API_BASE_URL estiver disponível (backend local)
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        if (baseUrl) {
            const resp = await fetch(`${baseUrl}/api/proxy?url=${encodeURIComponent(content)}`);
            if (resp.ok) return await resp.arrayBuffer();
            throw new Error(`Proxy falhou: HTTP ${resp.status}`);
        }
        throw new Error(`Não foi possível buscar o PDF: ${directErr.message}`);
    }
}

function getFontCSS(font_name) {
    if (!font_name || font_name === 'helv') return 'Arial, Helvetica, sans-serif';
    if (font_name === 'helv-bold') return 'bold Arial, Helvetica, sans-serif';
    if (font_name === 'times') return '"Times New Roman", Times, serif';
    if (font_name === 'times-bold') return 'bold "Times New Roman", Times, serif';
    if (font_name === 'cour') return '"Courier New", Courier, monospace';
    if (font_name === 'cour-bold') return 'bold "Courier New", Courier, monospace';
    // Fonte do sistema: "system:Arial Bold" → bold "Arial Bold"
    if (font_name.startsWith('system:')) {
        const parts = font_name.slice(7).split('|'); // "NomeFamilia|bold|italic"
        const family = parts[0];
        const bold = parts.includes('bold') ? 'bold ' : '';
        const italic = parts.includes('italic') ? 'italic ' : '';
        return `${italic}${bold}"${family}", sans-serif`;
    }
    return `"${font_name}", sans-serif`;
}



/**
 * Carrega a arte de todos os elementos PDF/SVG de uma lista que ainda não a tenham.
 *
 * Equivalente da `precarregarArtesDosElementos()` do `script.js`, que a cliente.html
 * não carrega. Quem puder esperar deve chamar esta — é o que faz a arte sair certa de
 * primeira, sem o vai-e-volta de carregar e mandar redesenhar.
 */
async function precarregarArtesDosElementos(elementos) {
    for (const el of (elementos || [])) {
        try {
            if (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas) {
                let bytes;
                if (el.pdf_content.startsWith('http') || el.pdf_content.startsWith('/')) {
                    bytes = await fetchPdfBytes(el.pdf_content);
                } else {
                    const base64Data = el.pdf_content.includes('base64,') ? el.pdf_content.split('base64,')[1] : el.pdf_content;
                    const binStr = atob(base64Data);
                    bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                }

                if (!bytes) throw new Error('Falha ao obter os bytes do PDF do elemento');

                const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 2.0 });

                const offCanvas = document.createElement('canvas');
                offCanvas.width = Math.round(vp.width);
                offCanvas.height = Math.round(vp.height);
                const octx = offCanvas.getContext('2d', { colorSpace: 'srgb' });
                await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;

                el._pdfCanvas = offCanvas;
            } else if (el.type === 'SVG' && el.svg_content && !el._svgImage) {
                const img = new Image();
                img.src = el.svg_content.startsWith('http') || el.svg_content.startsWith('data:')
                    ? el.svg_content
                    : 'data:image/svg+xml;utf8,' + encodeURIComponent(el.svg_content);
                await new Promise((res, rej) => {
                    img.onload = res;
                    img.onerror = () => rej(new Error('a imagem do SVG não carregou'));
                });
                el._svgImage = img;
            }
        } catch (err) {
            console.warn('[Amostra Item] Erro pré-carregando a arte do elemento', el && el.id, err);
            // Marca de falha permanente. Sem ela, o redesenho que vem logo
            // depois chama o preload de novo, que tenta de novo, que falha de
            // novo — um laço infinito que trava a aba do cliente. O elemento
            // simplesmente não será desenhado nesta sessão.
            el._preloadFalhou = true;
        } finally {
            delete el._pdfLoading;
            delete el._svgLoading;
        }
    }
}

/**
 * Versão que não pode esperar: dispara o carregamento e manda redesenhar no fim.
 *
 * O objeto do elemento é o MESMO para todos os modelos que compartilham a
 * numeração — ele vem de `state.numeracoes`, não é uma cópia por modelo. Antes,
 * o primeiro modelo marcava `_pdfLoading` e agendava o próprio redesenho; os
 * modelos seguintes encontravam a lista de pendentes vazia, voltavam em
 * silêncio e nunca eram repintados. Ficavam com o retângulo escrito "PDF" no
 * lugar do elemento gráfico, e num pedido em que vários modelos dividem a mesma
 * numeração só o primeiro saía completo. Por isso todo modelo que depende do
 * elemento entra numa lista de espera, e o fim do carregamento repinta todos.
 */
function preloadAmostraItemPdfElements(numeracao, idx, osId) {
    if (!numeracao || !numeracao.elements) return;

    const necessarios = numeracao.elements.filter(el =>
        !el._preloadFalhou && (
            (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas) ||
            (el.type === 'SVG' && el.svg_content && !el._svgImage)
        )
    );
    if (!necessarios.length) return;

    const assinatura = idx + '|' + osId;
    necessarios.forEach(el => {
        (el._assinantes || (el._assinantes = new Set())).add(assinatura);
    });

    // Já há carregamento em voo para estes elementos: basta estar na lista de
    // espera acima, que quem disparou repinta este modelo junto com o dele.
    const pendentes = necessarios.filter(el => !el._pdfLoading && !el._svgLoading);
    if (!pendentes.length) return;

    pendentes.forEach(el => {
        if (el.type === 'PDF') el._pdfLoading = true; else el._svgLoading = true;
    });

    (async () => {
        await precarregarArtesDosElementos(pendentes);
        repintarAssinantesDoPreload(pendentes);
    })();
}

/** Repinta TODO modelo que estava esperando estes elementos, não só o primeiro. */
function repintarAssinantesDoPreload(elementos) {
    const alvos = new Set();
    (elementos || []).forEach(el => {
        if (el._assinantes) el._assinantes.forEach(a => alvos.add(a));
        delete el._assinantes;
    });
    alvos.forEach(a => {
        // Corta na PRIMEIRA barra: o índice é sempre numérico, então o resto da
        // string é o osId inteiro mesmo que um dia ele contenha uma barra.
        const corte = a.indexOf('|');
        const i = parseInt(a.slice(0, corte), 10);
        const os = a.slice(corte + 1);
        if (!isNaN(i)) renderItemAmostraCombinada(i, os);
    });
}

// ===== QR CODE: usa biblioteca CDN qrcode-generator 1.4.4 (window.qrcode) carregada no HTML =====

function renderQRCodeOnCtx(ctx, text, x, y, sz, color, bgColor) {
    try {
        text = String(text || '0001');
        bgColor = bgColor || '#ffffff';
        color = color || '#000000';

        var qr = qrcode(0, 'L');
        qr.addData(text);
        qr.make();

        var moduleCount = qr.getModuleCount();
        var margin = 2; // Margem oficial de Quiet Zone (2 módulos)
        var totalCount = moduleCount + margin * 2;
        var cellSize = sz / totalCount;
        var hsz = sz / 2;

        // Fundo Branco incluindo a Quiet Zone (margem)
        ctx.fillStyle = bgColor;
        ctx.fillRect(x - hsz, y - hsz, sz, sz);

        ctx.fillStyle = color;
        for (var r = 0; r < moduleCount; r++) {
            for (var c = 0; c < moduleCount; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillRect(
                        x - hsz + (c + margin) * cellSize,
                        y - hsz + (r + margin) * cellSize,
                        cellSize + 0.35,
                        cellSize + 0.35
                    );
                }
            }
        }
    } catch (e) {
        console.error('[QR Code] Erro ao gerar QR Code:', e);
        var hsz = sz / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - hsz, y - hsz, sz, sz);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - hsz, y - hsz, sz, sz);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS (CSV) NO LINK DO CLIENTE
//
// Numeracao com elemento de CSV nao tem "uma" amostra: tem uma por linha de
// dado. O cliente folheia as linhas do MODELO dele — a fatia gravada em
// `pedidos_modelos.csv_selecao` — e o desenho e refeito aqui, no navegador
// dele. Nao ha imagem por linha: virar pagina nao custa rede nenhuma.
//
// Estas funcoes espelham as de mesmo nome no script.js. O cliente.js e
// deliberadamente autonomo (nao carrega o csv-editor.js), entao os dois
// utilitarios de fatia estao repetidos aqui, enxutos.
// ─────────────────────────────────────────────────────────────────────────────

/** "1-5" e "7" viram [1,2,3,4,5,7]. Espelha CsvEditor.expandirIds. */
function expandirIdsCsv(ids) {
    const fora = [];
    (ids || []).forEach(t => {
        const p = String(t).split('-');
        if (p.length === 2) {
            const a = parseInt(p[0]), b = parseInt(p[1]);
            if (!isNaN(a) && !isNaN(b)) for (let i = a; i <= b; i++) fora.push(i);
        } else {
            const v = parseInt(t);
            if (!isNaN(v)) fora.push(v);
        }
    });
    return fora;
}

/** So as linhas que serao impressas. `__ativo: false` fica de fora. */
function linhasAtivasCsv(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => !r || r.__ativo !== false);
}

/** A numeracao deste modelo. Em pedidos_modelos o campo e amostra_num_id. */
function numeracaoIdDoItem(item) {
    if (!item) return null;
    return item.numeracao_id || item.amostra_num_id || null;
}

/**
 * As linhas que ESTE modelo imprime, na ordem original — que e a ordem de
 * impressao. Modelo sem `csv_selecao` leva o banco inteiro, que e o
 * comportamento de todo pedido anterior a esta versao.
 */
function fatiaCsvDoItem(item, num) {
    const rows = (num && num.csv_data) || [];
    const sel = item && item.csv_selecao;
    const mesmaNum = item && num && String(numeracaoIdDoItem(item)) === String(num.id);
    if (!sel || !mesmaNum || !sel.ids || !sel.ids.length) return linhasAtivasCsv(rows);
    const querido = new Set(expandirIdsCsv(sel.ids).map(Number));
    return linhasAtivasCsv(rows).filter(r => querido.has(Number(r.__id)));
}

/** A numeracao tem dado variavel vindo de CSV? */
function temCsvVariavel(num) {
    return !!(num && num.csv_data && num.csv_data.length
        && (num.elements || []).some(el => el && el.source === 'database'));
}

/** A numeracao de um item, buscada no catalogo ja carregado. */
function numDoItem(item) {
    const nid = numeracaoIdDoItem(item);
    if (!nid) return null;
    return (state.numeracoes || []).find(n => String(n.id) === String(nid)) || null;
}

/** As linhas que a visualizacao deste modelo pode mostrar. */
function linhasDaAmostra(item, num) {
    if (num && num.csv_data && num.csv_data.length) return fatiaCsvDoItem(item, num);
    if (item && item.csv_data && item.csv_data.length) return linhasAtivasCsv(item.csv_data);
    return [];
}

/** Pagina corrente do modelo, sempre dentro do intervalo. */
function paginaDaAmostra(item, total) {
    if (!total) return 0;
    if (!state.amostraCsvPaginas) state.amostraCsvPaginas = {};
    const p = parseInt(state.amostraCsvPaginas[item ? item.id : '']) || 0;
    return Math.max(0, Math.min(total - 1, p));
}

/** A linha do CSV que a visualizacao deste modelo esta mostrando agora. */
function linhaDaAmostra(item, num) {
    const linhas = linhasDaAmostra(item, num);
    if (!linhas.length) return null;
    return linhas[paginaDaAmostra(item, linhas.length)] || null;
}

/**
 * Move a visualizacao do modelo. `delta` anda; `absoluto` vai direto (1-based,
 * como o cliente le na tela). Redesenhar e local: nao ha ida ao servidor.
 */
window.amostraCsvPagina = function (idx, delta, absoluto) {
    const osId = clienteState.osId;
    const item = state.osItens[osId] ? state.osItens[osId][idx] : null;
    if (!item) return;
    const num = numDoItem(item);
    const total = linhasDaAmostra(item, num).length;
    if (!total) return;
    let nova = (typeof absoluto === 'number' && !isNaN(absoluto))
        ? absoluto - 1
        : paginaDaAmostra(item, total) + (delta || 0);
    if (!state.amostraCsvPaginas) state.amostraCsvPaginas = {};
    state.amostraCsvPaginas[item.id] = Math.max(0, Math.min(total - 1, nova));
    return renderItemAmostraCombinada(idx, osId);
};

/** Mostra e preenche a navegacao de linhas do CSV no card de um modelo. */
function atualizarNavCsvDaAmostra(idx, item, num, container) {
    const nav = container.querySelector(`#amostra-csv-nav-${idx}`);
    if (!nav) return;
    const linhas = linhasDaAmostra(item, num);
    if (!temCsvVariavel(num) || linhas.length <= 1) {
        nav.style.display = 'none';
        return;
    }
    nav.style.display = 'flex';
    const total = linhas.length;
    const pag = paginaDaAmostra(item, total);
    const linha = linhas[pag] || {};
    const info = container.querySelector(`#amostra-csv-info-${idx}`);
    if (info) info.textContent = `Ingresso ${pag + 1} de ${total}`;
    const resumo = container.querySelector(`#amostra-csv-resumo-${idx}`);
    if (resumo) {
        const cols = (num.csv_headers && num.csv_headers.length)
            ? num.csv_headers
            : Object.keys(linha).filter(k => k !== '__ativo' && k !== '__id');
        resumo.textContent = cols.slice(0, 3)
            .map(c => `${c}: ${linha[c] == null ? '' : linha[c]}`)
            .join('  \u00b7  ');
    }
    const goto = container.querySelector(`#amostra-csv-goto-${idx}`);
    if (goto && document.activeElement !== goto) {
        goto.value = pag + 1;
        goto.max = total;
    }
    const bPrev = container.querySelector(`#amostra-csv-prev-${idx}`);
    const bNext = container.querySelector(`#amostra-csv-next-${idx}`);
    if (bPrev) bPrev.disabled = pag <= 0;
    if (bNext) bNext.disabled = pag >= total - 1;
}


async function drawAmostraFace(item, face, canvas, empty, fmt, cor, num, idx, osId, S) {
    // Em modo PDF, o canvas tradicional (#amostra-item-canvas-X) não existe —
    // o viewer usa #amostra-pdf-canvas-X. Permitir passagem para o bloco modo_pdf.
    const itemForPdf = (state.osItens[osId] || [])[idx] || item;
    if (!canvas && !(itemForPdf && itemForPdf.modo_pdf)) return;

    // Se modo PDF ativo, usar PDF viewer dedicado em vez de composição canvas
    if (itemForPdf && itemForPdf.modo_pdf) {
        if (canvas) canvas.style.display = 'none';
        
        const pdfUrl = face === 'back' ? (itemForPdf.verso_arte_url || null) : (itemForPdf.arte_url || null);
        
        if (pdfUrl) {
            if (empty) empty.style.display = 'none';
            // Esconder empty state do PDF também
            const emptyPdf = document.getElementById(`amostra-item-empty-pdf-${idx}`);
            if (emptyPdf) emptyPdf.style.display = 'none';
            
            const isImage = typeof pdfUrl === 'string' && (
                pdfUrl.startsWith('data:image/') || 
                (pdfUrl.includes('amostras_renderizadas') && !pdfUrl.endsWith('.pdf'))
            );
            
            if (isImage) {
                // Fallback: mostrar como imagem
                const imgEl = document.getElementById(`amostra-item-img-${idx}`);
                if (imgEl) {
                    imgEl.src = pdfUrl;
                    imgEl.style.display = 'block';
                }
            } else {
                // Inicializar PDF viewer
                const existing = pdfViewerState[idx];
                if (!existing || existing.pdfUrl !== pdfUrl) {
                    pdfViewerState[idx] = { pdfUrl: pdfUrl, osId: osId };
                    await initPdfViewer(idx, pdfUrl, osId);
                } else {
                    await renderPdfViewerPage(idx, existing.currentPage || 1);
                }
            }
        } else {
            // Sem arte/PDF: além de mostrar o estado vazio, apagar o que ficou
            // desenhado. Espelha o mesmo trecho do script.js — lá a arte excluída
            // continuava na tela porque ninguém escondia o canvas do modo PDF.
            const pdfCanvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
            if (pdfCanvas) {
                try {
                    const pctx = pdfCanvas.getContext('2d');
                    if (pctx) pctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
                } catch (_) { /* canvas sem contexto: esconder já resolve */ }
                pdfCanvas.width = 1;
                pdfCanvas.height = 1;
                pdfCanvas.style.display = 'none';
            }
            const nav = document.getElementById(`amostra-pdf-nav-${idx}`);
            if (nav) nav.style.display = 'none';

            if (empty) empty.style.display = 'none';
            const emptyPdf = document.getElementById(`amostra-item-empty-pdf-${idx}`);
            if (emptyPdf) emptyPdf.style.display = 'block';
        }
        return;
    }

    // Determinar se tem arte selecionada ou salva para esta face
    const inputId = face === 'back' ? `amostra-item-arte-verso-${idx}` : `amostra-item-arte-${idx}`;
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const arteInput = container ? container.querySelector(`#${inputId}`) : null;

    const hasArte = arteInput && arteInput.files && arteInput.files.length > 0;
    const faceArteUrl = face === 'back' ? item.verso_arte_url : item.arte_url;
    const hasSavedArte = !!faceArteUrl;

    // Se nada selecionado (sem cor, sem numeração, sem arte para esta face), esconder canvas e mostrar vazio
    const corId = item.amostra_cor_id || '';
    const numId = item.amostra_num_id || '';
    if (!corId && !numId && !hasArte && !hasSavedArte) {
        canvas.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    let targetW = fmt.width_mm;
    let targetH = fmt.height_mm;
    if (cor && cor.width_mm && cor.height_mm) {
        targetW = cor.width_mm;
        targetH = cor.height_mm;
    }

    const finalWidth = Math.round(targetW * S);
    const finalHeight = Math.round(targetH * S);
    if (finalWidth <= 0 || finalHeight <= 0) return;

    canvas.width = finalWidth;
    canvas.height = finalHeight;
    canvas.style.display = 'block';
    if (empty) empty.style.display = 'none';

    // Dois desenhos podem se cruzar no MESMO canvas: enquanto o primeiro ainda
    // espera a arte chegar do Storage, o carregamento de um elemento PDF/SVG da
    // numeracao dispara outro. Sem controle, os dois chegam ao fim e compoem o
    // grupo com 'multiply' sobre a mesma cor — a amostra sai escura, como se a
    // arte tivesse sido multiplicada duas vezes. Some ao navegar porque ai o
    // elemento ja esta em cache e o desenho fica sozinho.
    //
    // Quem chega depois carimba o canvas; quem estava em voo percebe o carimbo
    // novo e desiste antes de encostar no contexto.
    const _geracao = (canvas.__geracaoDesenho = (canvas.__geracaoDesenho || 0) + 1);
    const _desatualizado = () => canvas.__geracaoDesenho !== _geracao;

    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    ctx.clearRect(0, 0, finalWidth, finalHeight);
    ctx.globalCompositeOperation = 'source-over';

    // ====== CAMADA 1: COR (PDF via pdf.js) ======
    let corRendered = false;
    if (cor && (cor.pdf_base64 || (face === 'back' && cor.pdf_verso_base64)) && typeof pdfjsLib !== 'undefined') {
        try {
            const hasVersoFile = (face === 'back' && cor.pdf_verso_base64);
            const rawPdfData = hasVersoFile ? cor.pdf_verso_base64 : cor.pdf_base64;
            const base64Data = rawPdfData.includes('base64,') ? rawPdfData.split('base64,')[1] : rawPdfData;
            const binStr = atob(base64Data);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            
            // Usar página 2 se for verso e o PDF tiver 2 ou mais páginas e não tivermos arquivo de verso separado
            const pageNum = (face === 'back' && !hasVersoFile && pdf.numPages >= 2) ? 2 : 1;
            const page = await pdf.getPage(pageNum);

            const viewport = page.getViewport({ scale: 1.0 });
            const pdfScale = (fmt.width_mm * 2.8346) / viewport.width;
            const scaledViewport = page.getViewport({ scale: pdfScale * (S / 2.8346) });

            const offCanvas = document.createElement('canvas');
            offCanvas.width = scaledViewport.width;
            offCanvas.height = scaledViewport.height;
            const offCtx = offCanvas.getContext('2d', { colorSpace: 'srgb' });
            await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;

            const dx = (finalWidth - offCanvas.width) / 2;
            const dy = (finalHeight - offCanvas.height) / 2;
            ctx.drawImage(offCanvas, dx, dy, offCanvas.width, offCanvas.height);
            corRendered = true;
        } catch (e) {
            console.warn(`[Item ${idx} - Face ${face}] Erro ao renderizar cor PDF:`, e);
        }
    }
    if (_desatualizado()) return;

    if (!corRendered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    // ====== GRUPO ARTE + NUMERACAO ======
    // A numeracao NAO funde com a arte: ela sobrepoe a arte normalmente, e sao as duas
    // JUNTAS que multiplicam sobre a cor do papel. Por isso as duas camadas sao pintadas
    // antes num canvas transparente proprio (o grupo) e so no fim esse grupo e composto
    // sobre o ctx -- que a esta altura tem so a cor -- com 'multiply'. Compor cada camada
    // direto no ctx faria o multiply em cascata: a numeracao escureceria onde caisse em
    // cima da arte. Espelha drawAmostraFace() do script.js.
    const grupoCanvas = document.createElement('canvas');
    grupoCanvas.width = finalWidth;
    grupoCanvas.height = finalHeight;
    const grupoCtx = grupoCanvas.getContext('2d', { colorSpace: 'srgb' });
    let grupoTemConteudo = false;

    // ====== CAMADA 2: ARTE (imagem ou PDF do upload ou salva) ======
    if (hasArte || hasSavedArte) {
        try {
            let isPdf = false;
            let file = null;
            if (hasArte) {
                file = arteInput.files[0];
                isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
            } else {
                isPdf = faceArteUrl && (faceArteUrl.toLowerCase().endsWith('.pdf') || faceArteUrl.includes('data:application/pdf'));
            }

            if (isPdf && typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                let bytes;
                if (hasArte) {
                    const arrayBuffer = await file.arrayBuffer();
                    bytes = new Uint8Array(arrayBuffer);
                } else {
                    if (faceArteUrl.startsWith('http') || faceArteUrl.startsWith('/')) {
                        const bufferData = await fetchPdfBytes(faceArteUrl);
                        bytes = new Uint8Array(bufferData);
                    } else {
                        const base64Data = faceArteUrl.includes('base64,') ? faceArteUrl.split('base64,')[1] : faceArteUrl;
                        const binStr = atob(base64Data);
                        bytes = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    }
                }

                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);

                const vp = page.getViewport({ scale: 1.0 });
                const artRatio = vp.width / vp.height;
                const canvasRatio = finalWidth / finalHeight;
                
                let pdfScale;
                if (artRatio > canvasRatio) {
                    pdfScale = finalWidth / vp.width;
                } else {
                    pdfScale = finalHeight / vp.height;
                }

                const scaledViewport = page.getViewport({ scale: pdfScale });

                const offCanvas = document.createElement('canvas');
                offCanvas.width = Math.round(scaledViewport.width);
                offCanvas.height = Math.round(scaledViewport.height);
                const offCtx = offCanvas.getContext('2d', { colorSpace: 'srgb' });
                await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;

                const dx = (finalWidth - offCanvas.width) / 2;
                const dy = (finalHeight - offCanvas.height) / 2;

                grupoCtx.drawImage(offCanvas, dx, dy, offCanvas.width, offCanvas.height);
                grupoTemConteudo = true;
            } else {
                let url;
                if (hasArte) {
                    url = URL.createObjectURL(file);
                } else {
                    url = faceArteUrl;
                }
                const arteImg = new Image();
                arteImg.crossOrigin = "Anonymous";
                await new Promise((resolve, reject) => {
                    arteImg.onload = resolve;
                    arteImg.onerror = reject;
                    arteImg.src = url;
                });
                if (arteImg.width > 0 && arteImg.height > 0) {
                    const tempArte = document.createElement('canvas');
                    tempArte.width = finalWidth;
                    tempArte.height = finalHeight;
                    const tempCtx = tempArte.getContext('2d', { colorSpace: 'srgb' });

                    const artRatio = arteImg.width / arteImg.height;
                    const canvasRatio = finalWidth / finalHeight;
                    let dw, dh, ddx, ddy;
                    if (artRatio > canvasRatio) {
                        dw = finalWidth;
                        dh = finalWidth / artRatio;
                        ddx = 0;
                        ddy = (finalHeight - dh) / 2;
                    } else {
                        dh = finalHeight;
                        dw = finalHeight * artRatio;
                        ddx = (finalWidth - dw) / 2;
                        ddy = 0;
                    }
                    tempCtx.drawImage(arteImg, ddx, ddy, dw, dh);

                    grupoCtx.drawImage(tempArte, 0, 0);
                    grupoTemConteudo = true;
                }
                if (hasArte) {
                    URL.revokeObjectURL(url);
                }
            }
        } catch (e) {
            console.warn(`[Item ${idx} - Face ${face}] Erro ao renderizar arte:`, e);
        }
    }

    // ====== CAMADA 3: NUMERAÇÃO ======
    if (num && num.elements && num.elements.length > 0) {
        // A linha do banco que esta face vai mostrar. Resolvida UMA vez: todos
        // os elementos variaveis da face leem a mesma linha, senao o ingresso
        // sairia com a fila de uma linha e o assento de outra.
        const _linhaCsv = linhaDaAmostra(item, num);

        const numCanvas = document.createElement('canvas');
        numCanvas.width = Math.round(fmt.width_mm * S);
        numCanvas.height = Math.round(fmt.height_mm * S);
        const numCtx = numCanvas.getContext('2d', { colorSpace: 'srgb' });

        // Fundo transparente -- contorno do formato
        numCtx.strokeStyle = '#64748b';
        numCtx.lineWidth = 1;
        numCtx.strokeRect(0, 0, numCanvas.width, numCanvas.height);

        // Desenhar cada elemento da numeração
        num.elements.forEach(el => {
            const elFace = el.face || 'both';

            // Filtrar elementos por face
            if (face === 'back') {
                if (el.type !== 'PICOTE' && elFace !== 'back' && elFace !== 'both') return;
            } else {
                if (elFace !== 'front' && elFace !== 'both' && el.type !== 'PICOTE') return;
            }

            let x = el.x_mm * S;
            const y = el.y_mm * S;
            const color = el.color || '#000000';
            const rot = (el.rotation || 0) * Math.PI / 180;

            // PICOTE: espelhamento no verso
            if (face === 'back' && el.type === 'PICOTE') {
                x = (fmt.width_mm - el.x_mm) * S;
            }

            numCtx.save();
            numCtx.translate(x, y);
            numCtx.rotate(rot);

            if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {
                const fs = (el.font_size || 12) * S / 2.8346;
                numCtx.font = typeof buildCanvasFont === 'function' ? buildCanvasFont(fs, el.font_name) : `${fs}px ${el.font_name || 'monospace'}`;
                numCtx.fillStyle = color;

                let label = '';
                if (el.type === 'FIXED') {
                    label = el.fixed_value || 'TEXTO';
                } else if (el.type === 'TEATRO_FILA') {
                    const _fVal = _linhaCsv ? (_linhaCsv.Fila || 'A') : 'A';
                    label = `${el.prefix || ''}${_fVal}`;
                } else if (el.type === 'TEATRO_LUGAR') {
                    const _lVal = _linhaCsv ? (_linhaCsv.Numero || '22') : '22';
                    label = `${el.prefix || ''}${_lVal}`;
                } else if (el.type === 'TEATRO_COMBO') {
                    const _fVal = _linhaCsv ? (_linhaCsv.Fila || 'A') : 'A';
                    const _lVal = _linhaCsv ? (_linhaCsv.Numero || '22') : 'A';
                    const fila = `${el.prefix_fila || ''}${_fVal}`;
                    const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                    label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
                } else if (el.type === 'CAMAROTE_LOCAL') {
                    const _inicio = parseInt(
                        item?.numeracao_inicio || item?.num_inicial ||
                        item?.NUMERACAO_INICIO || 1
                    );
                    label = `${el.prefix || ''}${_inicio}`;
                } else if (el.type === 'CAMAROTE_PESSOA') {
                    label = `${el.prefix || ''}1`;
                } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                    const _lCamB = parseInt(
                        item?.L_CAM || item?.l_cam ||
                        item?.lotacao_cam || item?.LOTACAO_CAM ||
                        item?.lotacao || 5
                    );
                    label = `${el.prefix || ''}1/${_lCamB}`;
                } else if (el.source === 'database') {
                    const colName = el.csv_column || '';
                    const csvRow = _linhaCsv;
                    if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                        label = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                    } else {
                        label = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                    }
                } else {
                    const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;
                    let current_val = 1;
                    if (num && num.tipo === "TICKET") {
                        const pos = parseInt(el.ticket_pos) || 1;
                        const start = parseInt(
                            item?.numeracao_inicio || item?.num_inicial ||
                            item?.NUMERACAO_INICIO || 1
                        ) || 1;
                        current_val = start + (pos - 1);
                    } else {
                        current_val = parseInt(
                            item?.numeracao_inicio || item?.num_inicial ||
                            item?.NUMERACAO_INICIO || 1
                        ) || 1;
                    }
                    label = `${el.prefix || ''}${String(current_val).padStart(padVal, '0')}${el.suffix || ''}`;
                }
                numCtx.textAlign = 'center';
                numCtx.textBaseline = 'middle';
                if (label.includes('\n')) {
                    const lines = label.split('\n');
                    const lineHeight = fs * 1.2;
                    const totalH = lines.length * lineHeight;
                    const blockTop = -totalH / 2;
                    lines.forEach((line, i) => {
                        const lineCenter = blockTop + i * lineHeight + lineHeight / 2;
                        numCtx.fillText(line, 0, lineCenter);
                    });
                } else {
                    numCtx.fillText(label, 0, 0);
                }
                numCtx.textAlign = 'left';
                numCtx.textBaseline = 'alphabetic';
            } else if (el.type === 'QR') {
                const sz = (el.size_mm || 15) * S;
                let qrText = '';
                if (el.fixed) {
                    qrText = el.fixed_value || '';
                } else if (el.source === 'database') {
                    const colName = el.csv_column || '';
                    const csvRow = _linhaCsv;
                    if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                        qrText = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                    } else {
                        qrText = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                    }
                } else {
                    const padVal = typeof el.pad !== 'undefined' ? parseInt(el.pad) : 4;
                    const start = parseInt(
                        item?.numeracao_inicio || item?.num_inicial ||
                        item?.NUMERACAO_INICIO || 1
                    ) || 1;
                    const raw = padVal > 0 ? String(start).padStart(padVal, '0') : String(start);
                    qrText = `${el.prefix || ''}${raw}${el.suffix || ''}`;
                }
                renderQRCodeOnCtx(numCtx, qrText, 0, 0, sz, color);
            } else if (el.type === 'BARCODE') {
                const bw = (el.barcode_width_mm || el.width_mm || 30) * S;
                const bh = (el.barcode_height_mm || el.height_mm || 8) * S;
                const hbw = bw / 2, hbh = bh / 2;
                numCtx.fillStyle = color;
                const barW = bw / 40;
                const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
                for (let i = 0; i < pattern.length; i++) {
                    if (pattern[i]) numCtx.fillRect(-hbw + i * barW, -hbh, barW * 0.7, bh);
                }
            } else if (el.type === 'PICOTE') {
                numCtx.strokeStyle = color;
                numCtx.lineWidth = 2.0;
                numCtx.setLineDash([6, 3]);
                numCtx.beginPath();
                numCtx.moveTo(0, -y);
                numCtx.lineTo(0, numCanvas.height - y);
                numCtx.stroke();
                numCtx.setLineDash([]);
            } else if (el.type === 'SVG' || el.type === 'PDF') {
                const w = (el.width_mm || 20) * S;
                const h = (el.height_mm || 20) * S;
                const hw = w / 2, hh_el = h / 2;

                numCtx.save();
                numCtx.beginPath();
                numCtx.rect(-hw, -hh_el, w, h);
                numCtx.clip();

                if (el.type === 'PDF') {
                    const imgObj = el._pdfCanvas || null;
                    if (imgObj) {
                        drawImageContain(numCtx, imgObj, -hw, -hh_el, w, h);
                    } else {
                        numCtx.strokeStyle = color;
                        numCtx.lineWidth = 1;
                        numCtx.strokeRect(-hw, -hh_el, w, h);
                        numCtx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                        numCtx.fillStyle = color;
                        numCtx.textAlign = 'center';
                        numCtx.textBaseline = 'middle';
                        numCtx.fillText('PDF', 0, 0);
                        numCtx.textAlign = 'left';
                        numCtx.textBaseline = 'alphabetic';
                    }
                } else {
                    if (el.svg_content) {
                        if (!el._svgImage && !el._svgLoading) {
                            el._svgLoading = true;
                            const img = new Image();
                            img.onload = () => {
                                el._svgImage = img;
                                delete el._svgLoading;
                                renderItemAmostraCombinada(idx, osId);
                            };
                            img.onerror = () => {
                                console.error('[Amostra Item] Erro ao carregar SVG');
                                delete el._svgLoading;
                            };
                            if (el.svg_content.startsWith('http') || el.svg_content.startsWith('data:')) {
                                img.src = el.svg_content;
                            } else {
                                img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(el.svg_content);
                            }
                        }
                        if (el._svgImage) {
                            drawImageContain(numCtx, el._svgImage, -hw, -hh_el, w, h);
                        } else {
                            numCtx.strokeStyle = color;
                            numCtx.lineWidth = 1;
                            numCtx.strokeRect(-hw, -hh_el, w, h);
                            numCtx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                            numCtx.fillStyle = color;
                            numCtx.textAlign = 'center';
                            numCtx.textBaseline = 'middle';
                            numCtx.fillText('SVG', 0, 0);
                            numCtx.textAlign = 'left';
                            numCtx.textBaseline = 'alphabetic';
                        }
                    } else {
                        numCtx.strokeStyle = color;
                        numCtx.lineWidth = 1;
                        numCtx.strokeRect(-hw, -hh_el, w, h);
                        numCtx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                        numCtx.fillStyle = color;
                        numCtx.textAlign = 'center';
                        numCtx.textBaseline = 'middle';
                        numCtx.fillText('SVG', 0, 0);
                        numCtx.textAlign = 'left';
                        numCtx.textBaseline = 'alphabetic';
                    }
                }
                numCtx.restore();
            }
            numCtx.restore();
        });

        // A numeracao entra NO GRUPO, por cima da arte e sem multiply: ela cobre a arte.
        const ndx = (finalWidth - numCanvas.width) / 2;
        const ndy = (finalHeight - numCanvas.height) / 2;
        grupoCtx.drawImage(numCanvas, ndx, ndy, numCanvas.width, numCanvas.height);
        grupoTemConteudo = true;
    }

    if (_desatualizado()) return;

    // Agora sim: o grupo (arte + numeracao) multiplica, de uma vez so, sobre a cor.
    if (grupoTemConteudo) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(grupoCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Borda decorativa
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, finalWidth, finalHeight);
}

async function renderItemAmostraCombinada(idx, osId) {
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    if (!container) return;

    const item = state.osItens[osId] ? state.osItens[osId][idx] : null;
    if (!item) return;

    const corSelect = container.querySelector(`#amostra-item-cor-${idx}`);
    const numSelect = container.querySelector(`#amostra-item-num-${idx}`);
    const corId = corSelect ? corSelect.value : item.amostra_cor_id;
    const numId = numSelect ? numSelect.value : item.amostra_num_id;

    // Atualizar labels e remover btns para Frente e Verso
    const hasFrontArte = container.querySelector(`#amostra-item-arte-${idx}`)?.files?.length > 0;
    const hasSavedFrontArte = !!item.arte_url;
    const frontNameSpan = container.querySelector(`#amostra-item-arte-name-${idx}`);
    const removeFrontBtn = container.querySelector(`#btn-remove-amostra-arte-${idx}`);

    if (frontNameSpan) {
        if (hasFrontArte) frontNameSpan.textContent = container.querySelector(`#amostra-item-arte-${idx}`).files[0].name;
        else if (hasSavedFrontArte) frontNameSpan.textContent = '(Arte Salva na Nuvem)';
        else frontNameSpan.textContent = '';
    }
    if (removeFrontBtn) removeFrontBtn.style.display = (hasFrontArte || hasSavedFrontArte) ? '' : 'none';

    if (item.verso) {
        const hasVersoArte = container.querySelector(`#amostra-item-arte-verso-${idx}`)?.files?.length > 0;
        const hasSavedVersoArte = !!item.verso_arte_url;
        const versoNameSpan = container.querySelector(`#amostra-item-arte-verso-name-${idx}`);
        const removeVersoBtn = container.querySelector(`#btn-remove-amostra-arte-verso-${idx}`);

        if (versoNameSpan) {
            if (hasVersoArte) versoNameSpan.textContent = container.querySelector(`#amostra-item-arte-verso-${idx}`).files[0].name;
            else if (hasSavedVersoArte) versoNameSpan.textContent = '(Arte Salva na Nuvem)';
            else versoNameSpan.textContent = '';
        }
        if (removeVersoBtn) removeVersoBtn.style.display = (hasVersoArte || hasSavedVersoArte) ? '' : 'none';
    }

    // Obter cor, formato e numeração
    const cor = corId ? state.cores.find(c => c.id === corId) : null;
    const num = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;

    if (num) {
        preloadAmostraItemPdfElements(num, idx, osId);
    }

    let fmt = null;
    if (cor && cor.formato_id) {
        fmt = state.formatos.find(f => String(f.id) === String(cor.formato_id));
    }
    if (!fmt && num && num.formato_id) {
        fmt = state.formatos.find(f => String(f.id) === String(num.formato_id));
    }
    if (!fmt && state.formatos.length > 0) {
        fmt = state.formatos[0];
    }
    if (!fmt) {
        fmt = { width_mm: 180, height_mm: 50 };
    }

    const S = 150 / 25.4;

    atualizarNavCsvDaAmostra(idx, item, num, container);

    if (item.verso) {
        const canvasFront = container.querySelector(`#amostra-item-canvas-${idx}`);
        const emptyFront = container.querySelector(`#amostra-item-empty-${idx}`);
        const canvasBack = container.querySelector(`#amostra-item-canvas-verso-${idx}`);
        const emptyBack = container.querySelector(`#amostra-item-empty-verso-${idx}`);

        await drawAmostraFace(item, 'front', canvasFront, emptyFront, fmt, cor, num, idx, osId, S);
        await drawAmostraFace(item, 'back', canvasBack, emptyBack, fmt, cor, num, idx, osId, S);
        
        // Snapshot para link do cliente (Frente e Verso)
        if (state.amostrasContainerId !== 'cliente-amostras-itens-container') {
            if (item._snapshotTimer) clearTimeout(item._snapshotTimer);
            item._snapshotTimer = setTimeout(() => {
                snapshotAmostraAndUpload(idx, osId, item, canvasFront, 'frente');
                snapshotAmostraAndUpload(idx, osId, item, canvasBack, 'verso');
            }, 2000);
        }
    } else {
        const canvas = container.querySelector(`#amostra-item-canvas-${idx}`);
        const empty = container.querySelector(`#amostra-item-empty-${idx}`);
        
        await drawAmostraFace(item, 'front', canvas, empty, fmt, cor, num, idx, osId, S);
        
        if (state.amostrasContainerId !== 'cliente-amostras-itens-container') {
            if (item._snapshotTimer) clearTimeout(item._snapshotTimer);
            item._snapshotTimer = setTimeout(() => {
                snapshotAmostraAndUpload(idx, osId, item, canvas);
            }, 2000);
        }
    }
}

function saveAmostraItemObs(itemId, osId, obs) {
    saveAmostraToDB(itemId, osId, { amostra_obs: obs });
}
window.saveAmostraItemObs = saveAmostraItemObs;

// ========== MODO PDF MULTI-PÁGINA (Cliente) ==========
const pdfViewerState = {};

async function initPdfViewer(idx, pdfUrl, osId) {
    if (!pdfUrl) return;
    try {
        let arrayBuffer;
        // Tentar buscar diretamente (Supabase Storage permite CORS para buckets públicos)
        try {
            const directResponse = await fetch(pdfUrl);
            if (directResponse.ok) {
                arrayBuffer = await directResponse.arrayBuffer();
            } else {
                throw new Error('Direct fetch failed: ' + directResponse.status);
            }
        } catch (directErr) {
            console.warn('[PDF Viewer Cliente] Fetch direto falhou, tentando proxy...', directErr);
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(pdfUrl)}`;
            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) throw new Error('Proxy fetch failed: ' + proxyResponse.status);
            arrayBuffer = await proxyResponse.arrayBuffer();
        }
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pdfViewerState[idx] = { pdf, currentPage: 1, totalPages: pdf.numPages, pdfUrl, osId: osId || clienteState.osId };
        await renderPdfViewerPage(idx, 1);
    } catch (err) {
        console.error('[PDF Viewer Cliente] Erro:', err);
    }
}

/**
 * Uma fila de desenho por item. Fica **fora** do `pdfViewerState` de propósito:
 * o `initPdfViewer` substitui `pdfViewerState[idx]` por um objeto novo, então
 * uma fila guardada lá dentro não serializaria justamente as duas chamadas que
 * se atropelam. Dois `page.render()` no mesmo canvas se corrompem — cada um
 * reatribui `canvas.width`, o que zera o canvas e a transformação do outro.
 */
const pdfRenderQueue = {};

function renderPdfViewerPage(idx, pageNum) {
    const anterior = pdfRenderQueue[idx] || Promise.resolve();
    const proxima = anterior
        .catch(() => { /* uma falha anterior não pode travar a fila */ })
        .then(() => desenharPaginaDoPdf(idx, pageNum));
    pdfRenderQueue[idx] = proxima;
    return proxima;
}

async function desenharPaginaDoPdf(idx, pageNum) {
    const vs = pdfViewerState[idx];
    if (!vs || !vs.pdf) return;
    try {
        const page = await vs.pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Estampar numeração sobre a página do PDF (igual ao painel interno)
        const osId = vs.osId || clienteState.osId;
        const items = (osId && state.osItens && state.osItens[osId]) ? state.osItens[osId] : [];
        const item = items[idx] || null;
        let numId = item ? (item.amostra_num_id || item.numeracao_id || item.numeracao || item.gabarito_operacional) : null;
        let num = null;
        if (numId && state.numeracoes) {
            const numIdStr = String(numId).trim().toLowerCase();
            num = state.numeracoes.find(n => 
                String(n.id) === String(numId) || 
                String(n.name).trim().toLowerCase() === numIdStr || 
                String(n.tipo).trim().toLowerCase() === numIdStr
            );
        }
        if (num && num.elements && num.elements.length > 0) {
            // A arte dos elementos SVG/PDF e aguardada antes de desenhar: esta funcao
            // e async, entao sai certo de primeira.
            await precarregarArtesDosElementos(num.elements);
            drawNumeracaoElementsOverCanvas(ctx, num, item, pageNum, viewport.width, viewport.height);
        }

        canvas.style.display = 'block';
        const nav = document.getElementById(`amostra-pdf-nav-${idx}`);
        if (nav) nav.style.display = 'flex';
        const info = document.getElementById(`amostra-pdf-page-info-${idx}`);
        if (info) info.textContent = `Página ${pageNum} / ${vs.totalPages}`;
        const empty = document.getElementById(`amostra-item-empty-${idx}`);
        if (empty) empty.style.display = 'none';
        const emptyPdf = document.getElementById(`amostra-item-empty-pdf-${idx}`);
        if (emptyPdf) emptyPdf.style.display = 'none';
        vs.currentPage = pageNum;
    } catch (err) {
        console.error('[PDF Viewer Cliente] Erro página:', err);
    }
}

function pdfViewerPrevPage(idx) {
    const vs = pdfViewerState[idx];
    if (!vs || vs.currentPage <= 1) return;
    renderPdfViewerPage(idx, vs.currentPage - 1);
}

function pdfViewerNextPage(idx) {
    const vs = pdfViewerState[idx];
    if (!vs || vs.currentPage >= vs.totalPages) return;
    renderPdfViewerPage(idx, vs.currentPage + 1);
}

// ========== NUMERAÇÃO OVERLAY SOBRE PDF (Cliente) ==========
function drawNumeracaoElementsOverCanvas(ctx, num, item, pageNum, canvasWidth, canvasHeight) {
    if (!ctx || !num || !num.elements || !num.elements.length) return;

    let fmt = null;
    if (num.formato_id && state.formatos) {
        fmt = state.formatos.find(f => String(f.id) === String(num.formato_id));
    }
    const width_mm = (fmt && fmt.width_mm) ? fmt.width_mm : 180;
    const height_mm = (fmt && fmt.height_mm) ? fmt.height_mm : 50;

    const Sx = canvasWidth / width_mm;
    const Sy = canvasHeight / height_mm;
    const S = Sx;

    const seqStart = parseInt(
        item?.numeracao_inicio || item?.num_inicial || item?.NUMERACAO_INICIO || 1
    ) || 1;

    num.elements.forEach(el => {
        if (el.face === 'back') return;

        const x = el.x_mm * Sx;
        const y = el.y_mm * Sy;
        const color = el.color || '#000000';
        const rot = (el.rotation || 0) * Math.PI / 180;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);

        if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {
            const fs = (el.font_size || 12) * S / 2.8346;
            ctx.font = typeof buildCanvasFont === 'function' ? buildCanvasFont(fs, el.font_name) : `${fs}px ${el.font_name || 'monospace'}`;
            ctx.fillStyle = color;

            let label = '';
            if (el.type === 'FIXED') {
                label = el.fixed_value || 'TEXTO';
            } else if (el.type === 'TEATRO_FILA') {
                const _fVal = (state.csvData && state.csvData[pageNum - 1]) ? state.csvData[pageNum - 1].Fila || 'A' : 'A';
                label = `${el.prefix || ''}${_fVal}`;
            } else if (el.type === 'TEATRO_LUGAR') {
                const _lVal = (state.csvData && state.csvData[pageNum - 1]) ? state.csvData[pageNum - 1].Numero || String(pageNum) : String(pageNum);
                label = `${el.prefix || ''}${_lVal}`;
            } else if (el.type === 'TEATRO_COMBO') {
                const _fVal = (state.csvData && state.csvData[pageNum - 1]) ? state.csvData[pageNum - 1].Fila || 'A' : 'A';
                const _lVal = (state.csvData && state.csvData[pageNum - 1]) ? state.csvData[pageNum - 1].Numero || String(pageNum) : String(pageNum);
                const fila = `${el.prefix_fila || ''}${_fVal}`;
                const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
            } else if (el.type === 'CAMAROTE_LOCAL') {
                const _cIni = parseInt(item?.c_ini || item?.C_INI || 1);
                label = `${el.prefix || ''}${_cIni}`;
            } else if (el.type === 'CAMAROTE_PESSOA') {
                label = `${el.prefix || ''}${pageNum}`;
            } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                const _lCamB = parseInt(item?.l_cam || item?.L_CAM || 5);
                label = `${el.prefix || ''}${pageNum}/${_lCamB}`;
            } else if (el.source === 'database') {
                const colName = el.csv_column || '';
                // A pagina N do PDF mostra a linha N da FATIA deste modelo. Antes
                // indexava o banco inteiro: um modelo cuja fatia comeca na linha
                // 601 exibia a linha 1 na primeira pagina.
                const csvData = linhasDaAmostra(item, num);
                const csvRow = csvData[pageNum - 1] || null;
                if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                    label = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                } else {
                    label = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                }
            } else {
                const padVal = typeof el.pad !== 'undefined' ? parseInt(el.pad) : 6;
                let current_val = seqStart + (pageNum - 1);
                if (num && num.tipo === "TICKET") {
                    const pos = parseInt(el.ticket_pos) || 1;
                    const ticketQtd = parseInt(num.ticket_qtd) || 1;
                    current_val = seqStart + ((pageNum - 1) * ticketQtd) + (pos - 1);
                }
                label = `${el.prefix || ''}${String(current_val).padStart(padVal, '0')}${el.suffix || ''}`;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (label.includes('\n')) {
                const lines = label.split('\n');
                const lineHeight = fs * 1.2;
                const totalH = lines.length * lineHeight;
                const blockTop = -totalH / 2;
                lines.forEach((line, i) => {
                    const lineCenter = blockTop + i * lineHeight + lineHeight / 2;
                    ctx.fillText(line, 0, lineCenter);
                });
            } else {
                ctx.fillText(label, 0, 0);
            }
        } else if (el.type === 'QR') {
            const sz = (el.size_mm || 15) * S;
            let qrText = '';
            if (el.fixed) {
                qrText = el.fixed_value || '';
            } else if (el.source === 'database') {
                const colName = el.csv_column || '';
                const csvData = linhasDaAmostra(item, num);
                const csvRow = csvData[pageNum - 1] || null;
                if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                    qrText = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                } else {
                    qrText = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                }
            } else {
                const padVal = typeof el.pad !== 'undefined' ? parseInt(el.pad) : 4;
                let current_val = seqStart + (pageNum - 1);
                const raw = padVal > 0 ? String(current_val).padStart(padVal, '0') : String(current_val);
                qrText = `${el.prefix || ''}${raw}${el.suffix || ''}`;
            }
            if (typeof renderQRCodeOnCtx === 'function') {
                renderQRCodeOnCtx(ctx, qrText, 0, 0, sz, color);
            }
        } else if (el.type === 'BARCODE') {
            const bw = (el.barcode_width_mm || el.width_mm || 30) * S;
            const bh = (el.barcode_height_mm || el.height_mm || 8) * S;
            const hbw = bw / 2, hbh = bh / 2;
            ctx.fillStyle = color;
            const barW = bw / 40;
            const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
            for (let i = 0; i < pattern.length; i++) {
                if (pattern[i]) ctx.fillRect(-hbw + i * barW, -hbh, barW * 0.7, bh);
            }
        } else if (el.type === 'PICOTE') {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.0;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            ctx.moveTo(0, -y);
            ctx.lineTo(0, canvasHeight - y);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (el.type === 'SVG' || el.type === 'PDF') {
            // Sem este ramo, o modo PDF (multipaginas) desenhava todos os outros tipos
            // e pulava SVG e PDF. Espelha o mesmo ramo no script.js.
            const w = (el.width_mm || 20) * S;
            const h = (el.height_mm || 20) * S;
            const hw = w / 2, hh_el = h / 2;
            const imgObj = el.type === 'PDF' ? (el._pdfCanvas || null) : (el._svgImage || null);

            ctx.save();
            ctx.beginPath();
            ctx.rect(-hw, -hh_el, w, h);
            ctx.clip();

            if (imgObj) {
                drawImageContain(ctx, imgObj, -hw, -hh_el, w, h);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(-hw, -hh_el, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(el.type, 0, 0);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
            ctx.restore();
        }
        ctx.restore();
    });
}