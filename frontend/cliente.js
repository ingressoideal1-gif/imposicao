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

/**
 * Opacidade de um elemento PDF/SVG, de 0 a 1. Campo ausente vale 1 (opaco).
 *
 * Copia deliberada de opacidadeDoElemento()/drawArteDoElemento() do script.js,
 * pela mesma razao da drawImageContain() acima: a cliente.html nao carrega o
 * script.js. Se mexer em uma das duas, mexa na outra.
 */
function opacidadeDoElemento(el) {
    const v = el && el.opacity;
    if (v === undefined || v === null || v === '') return 1;
    const n = Number(v);
    if (!isFinite(n)) return 1;
    return Math.min(1, Math.max(0, n));
}

/** Arte de um elemento PDF/SVG: sem distorcao e com a opacidade do elemento. */
function drawArteDoElemento(ctx, img, x, y, w, h, el) {
    const op = opacidadeDoElemento(el);
    if (op >= 1) { drawImageContain(ctx, img, x, y, w, h); return; }
    if (op <= 0) return;
    const antes = ctx.globalAlpha;
    ctx.globalAlpha = antes * op;
    drawImageContain(ctx, img, x, y, w, h);
    ctx.globalAlpha = antes;
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
function ehArquivoPdf(v) {
    const s = String(v || '');
    if (!s) return false;
    return /\.pdf($|\?)/i.test(s) || s.toLowerCase().startsWith('data:application/pdf');
}

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

        // A imagem aprovada (o snapshot composto que o painel salva) é o caminho
        // normal. Quando ela não existe, o carregamento faz `amostra_arte_base64`
        // cair para `arte_url` — e uma arte em PDF ali dentro vira um `<img>`
        // quebrado: um ícone minúsculo, sem legenda, que o cliente lê como "o
        // pedido não tem arte". Foi o que o 20927 mostrou em 19/08/2026.
        //
        // Nesses casos desenhamos ao vivo no canvas, que já compõe cor + arte +
        // numeração e já sabe ler PDF pelo pdfjsLib — é o MESMO desenho que o
        // painel mostra ao atendente. Assim a tela do cliente deixa de depender
        // de o snapshot ter sido gerado na hora certa.
        const previaUtil = !!item.amostra_arte_base64 && !ehArquivoPdf(item.amostra_arte_base64);
        const desenhoAoVivo = temArteParaDesenhar && !item.modo_pdf
                           && (temCsvVariavel(numDoModelo) || !previaUtil);
        // Se há de fato o que mostrar. Testar a verdade de `amostra_arte_base64`
        // não bastava: no carregamento do pedido esse campo cai para `arte_url`
        // quando ainda não há snapshot, então um modelo cuja arte é PDF entrava
        // num `<img>`, não desenhava nada — e ainda escondia o aviso de vazio,
        // por o campo estar preenchido. Sobrava um retângulo branco sem legenda.
        // Só leitura: o pedido já foi decidido, e a aba da arte agora existe
        // também depois da aprovação (antes ela sumia da tela). Aqui o cliente
        // volta para VER a arte que aprovou -- com o lightbox e o folheador de
        // páginas funcionando --, e por isso os botões de decisão e a caixa de
        // observação saem. Botão que não decide mais nada, numa tela em que
        // ninguém explica isso, é convite para o cliente achar que dá para
        // desaprovar.
        const somenteLeitura = state.arteSomenteLeitura === true;

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
                        ${somenteLeitura ? '' : `
                        <div class="form-group" style="margin-bottom: 0;">
                            <label for="amostra-obs-${item.id}" style="font-size: 0.82rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em;">Anotações / Observações de Alteração</label>
                            <textarea id="amostra-obs-${item.id}" class="form-control" rows="3" placeholder="Insira aqui os detalhes das alterações solicitadas..." style="resize: none; background: rgba(0, 0, 0, 0.2); font-size: 0.85rem; padding: 10px;"
                                onchange="saveAmostraItemObs('${item.id}', '${osId}', this.value)">${obs}</textarea>
                        </div>
                        `}
                        <div class="amostra-decisao-btns" ${somenteLeitura ? 'hidden' : ''}>
                            ${state.amostrasContainerId === 'cliente-amostras-itens-container' 
                                ? `
                                <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid; ${status === 'APROVADA' ? 'background-color: #22c55e; border-color: #22c55e; color: #fff; box-shadow: 0 0 10px rgba(34,197,94,0.6);' : 'background-color: rgba(34,197,94,0.10); border-color: rgba(34,197,94,0.45); color: #4ade80;'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'APROVADA')">
                                    ${status === 'APROVADA' ? '✅ APROVADO' : '✅ APROVAR'}
                                </button>
                                ` 
                                : `
                                <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; ${status === 'PRONTO' || status === 'APROVADA' ? 'background-color: #3b82f6; border-color: #3b82f6; color: #fff;' : 'background-color: transparent; border-color: var(--border-color); color: var(--text);'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'PRONTO')" ${status === 'APROVADA' ? 'disabled' : ''}>
                                    ${status === 'APROVADA' ? '✅ APROVADO (CLIENTE)' : (status === 'PRONTO' ? '🎨 PRONTO' : 'MARCAR PRONTO')}
                                </button>
                                `
                            }
                            <button class="btn" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid; ${status === 'REPROVADA' ? 'background-color: #ef4444; border-color: #ef4444; color: #fff; box-shadow: 0 0 10px rgba(239,68,68,0.55);' : 'background-color: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.45); color: #f87171;'}" onclick="decisionAmostraItem('${item.id}', '${osId}', 'REPROVADA')">
                                ${status === 'REPROVADA' ? '❌ EM ALTERAÇÃO' : '❌ ALTERAR'}
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
                                    <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
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
                                ${desenhoAoVivo ? `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>` : `<img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />`}
                                `}
                                <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${desenhoAoVivo || arteVisivel || item.modo_pdf ? 'none' : 'block'};">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Arte da frente ainda não enviada</p>
                                </div>
                            </div>
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--amber); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">VERSO</div>
                                ${desenhoAoVivo ? `<canvas id="amostra-item-canvas-verso-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-verso-${idx}')"></canvas>` : `<img id="amostra-item-img-verso-${idx}" src="${item.verso_amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.verso_amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-verso-${idx}')" />`}
                                <div id="amostra-item-empty-verso-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${desenhoAoVivo || versoVisivel ? 'none' : 'block'};">
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
                            <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
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
                        ${desenhoAoVivo ? `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>` : `<img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />`}
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
                        <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${desenhoAoVivo || arteVisivel || item.modo_pdf ? 'none' : 'block'};">
                             <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                             <p style="font-size: 0.95rem; font-weight: 600;">Arte ainda não enviada pela gráfica</p>
                             <p style="font-size: 0.82rem; opacity: 0.8; margin-top: 4px;">Este modelo faz parte do pedido, mas ainda não há o que visualizar. Fale com o seu atendimento.</p>
                        </div>
                        `)
                    :
                        `<canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>
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
 * Grava o status da arte pelo par número+token, e não por `os_id`.
 *
 * ## Por que existe
 *
 * As três telas que mudam status daqui — aprovar, pedir alteração e o
 * automático — escreviam direto em `pedidos_links_cliente` com a chave anônima,
 * filtrando por `os_id`. Quer dizer: quem tivesse a chave (ela está no
 * código-fonte de toda página) escrevia o status de QUALQUER pedido, sem token
 * nenhum. E marcar uma arte como APROVADO é autorizar a impressão.
 *
 * A função do banco exige o par, aceita só os três valores que esta página
 * escreve, e devolve `false` quando o par não confere.
 *
 * ## Por que a falha é silenciosa
 *
 * Do mesmo jeito que era antes: os três pontos de chamada já engoliam o erro de
 * propósito, para que uma recusa do banco não trave o cliente no meio da
 * aprovação. O que ele fez continua gravado nas outras tabelas; o status é
 * espelho, e o painel o recalcula.
 */
async function gravarStatusDoLink(status) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
    const { data, error } = await supabaseClient.rpc('link_cliente_status', {
        p_numero: clienteState.numero,
        p_token: clienteState.token,
        p_status: status
    });
    if (error) throw error;
    return data === true;
}

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
        // Validar token — pela função do banco, e não pela tabela.
        //
        // Até 16/08/2026 esta consulta saía com a chave anônima, que está no
        // código-fonte de toda página e qualquer um lê com Ctrl+U. Medido naquele
        // dia: a mesma chave, sem filtro nenhum, LISTAVA os 42 links de aprovação
        // com os tokens dentro. O token é a única coisa que separa a arte do
        // cliente do resto da internet.
        //
        // `link_cliente_abrir` exige o par número+token, devolve uma linha só,
        // não devolve o token de volta (o navegador já o tem na URL) e conta o
        // acesso ela mesma — o UPDATE de `acessos` que ficava logo abaixo saiu
        // junto, e com ele mais um motivo de a chave anônima precisar escrever
        // nesta tabela.
        const { data: linhasDoLink, error: linkError } = await supabaseClient
            .rpc('link_cliente_abrir', { p_numero: numero, p_token: token });

        // A função devolve TABLE, então o retorno é uma lista de zero ou uma.
        const linkData = Array.isArray(linhasDoLink) ? linhasDoLink[0] : linhasDoLink;

        if (linkError || !linkData) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'block';
            return;
        }

        clienteState.osId = linkData.os_id;
        clienteState.linkId = linkData.id;

        // Os dados do pedido, numa chamada só, pela função que exige o token.
        //
        // Isto substitui um `select('*')` em `propostas` feito com a chave
        // anônima. E conserta um defeito que estava aqui desde o começo: a
        // linha lia a coluna `cliente_nome`, que NÃO EXISTE em
        // `propostas` -- a coluna é `cliente`. O nome do cliente nunca apareceu
        // no cabeçalho desta página; o `<p>` ficava vazio, e ninguém percebeu
        // porque campo vazio não parece defeito, parece pedido sem nome.
        const portal = await carregarPortal(numero, token);
        const osCliente = (portal && portal.pedido && portal.pedido.cliente) || '';
        clienteState.idCliente = (portal && portal.pedido && portal.pedido.id_cliente) || null;

        if (clienteEl) clienteEl.textContent = osCliente;



        // Carregar formatos, cores e numerações para o state global do front
        try {
            const [coresRes, numeracoesRes, formatosRes, produtosRes] = await Promise.all([
                // Colunas explicitas, sem `pdf_base64`/`pdf_verso_base64`/
                // `preview_base64`. Com `select('*')` o cliente baixava 18 MB
                // — o PDF de referência de TODAS as cores do sistema — antes de
                // a página de aprovação aparecer. O da cor do pedido dele vem
                // por `garantirPdfDaCor`, na hora de desenhar. Mesmo remédio do
                // `csv_data` logo abaixo.
                supabaseClient.from('producao_cores')
                    .select('id, empresa_id, name, hex, pdf_url, pdf_filename, created_at, updated_at, formato_id, width_mm, height_mm, id_modelo_cor_num, name_verso, frente_verso, cor_referencia')
                    .order('name', { ascending: true }),
                // Colunas explicitas, sem `csv_data`. Com `select('*')` o
                // cliente baixava os bancos de TODAS as numeracoes do sistema —
                // 569 KB, dos quais 84% eram CSV de pedidos alheios que ele
                // nunca veria. O banco do proprio pedido vem logo abaixo.
                supabaseClient.from('producao_numeracoes')
                    .select('id, name, tipo, formato_id, formato_ids, elements, print_mode, ticket_qtd, ticket_logica, csv_headers, csv_filename, Cli_Num, is_custom, os_item_id')
                    .order('name', { ascending: true }),
                supabaseClient.from('producao_formatos').select('*').order('name', { ascending: true }),
                // Colunas explicitas, sem os textos fiscais.
                //
                // Estas cinco sao TODAS as que esta pagina consulta: `id` e
                // `id_produto` para achar o produto do item, `nomeReal` e
                // `apelidos` para o casamento por nome quando o id nao bate, e
                // `id_formato`, que e o motivo de a busca existir. Com
                // `select('*')` vinham 44 colunas -- descricao, frase de
                // conservacao, personalizacao, informacoes fiscais, CFOP,
                // NCM --, nenhuma delas usada aqui: 80 kB para entregar 12 kB.
                //
                // Filtrar as LINHAS seria o passo seguinte, e nao foi dado de
                // proposito: quando o item nao traz `id_produto`, esta pagina
                // acha o produto pelo NOME e pelos apelidos, e uma lista
                // filtrada por id deixaria de fora justamente o produto que so
                // o nome encontraria. Mesmo motivo pelo qual o catalogo de
                // cores tambem continua vindo inteiro.
                supabaseClient.from('produtos')
                    .select('id, id_produto, nomeReal, apelidos, id_formato')
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

        // O selo da entrega vem junto na carga do portal -- era mais uma
        // consulta direta a `pedidos_artes` com a chave anônima.
        let entregaStatus = '----';
        const numInt = parseInt(linkData.numero_pedido || linkData.id_int || numero);
        const seloEntrega = portal && portal.entrega && portal.entrega.entrega_dados;
        if (seloEntrega) {
            entregaStatus = String(seloEntrega).toUpperCase();
            if (!state.todasArtes) state.todasArtes = [];
            const globalArte = state.todasArtes.find(a => String(a.id_int) === String(numInt));
            if (globalArte) {
                globalArte.entrega_dados = seloEntrega;
            } else {
                state.todasArtes.push({ id_int: numInt, entrega_dados: seloEntrega });
            }
        }

        // ── O Portal ────────────────────────────────────────────────────
        //
        // Antes daqui saía a decisão de MOSTRAR OU NÃO a página: só
        // `Enviar Arte`, `Aguard. Aprovação` ou entrega `ALTERADO` abriam
        // alguma coisa; o resto via uma frase e acabava. Medido em 20/08/2026:
        // 36 dos 50 links estavam nesse "resto".
        //
        // Agora as cinco seções abrem sempre, e o status decide apenas a CARA
        // da aba da arte. O selo `ALTERADO` da entrega deixou de precisar
        // destrancar a página: a aba de entrega já está lá.
        clienteState.statusArte = osStatus;
        clienteState.entregaStatus = entregaStatus;

        registrarSecao('arte', () => desenharSecaoArte(osId));
        montarPortal(osStatus);

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
                    autor_nome: 'Cliente (aprovação online)',
                });
            } catch (e) { console.error('Erro log chat:', e); }

            // Arte aprovada. Falta conferir os dados -- que agora não são uma
            // tela sequencial, e sim duas abas que já estavam ali o tempo todo.
            // A página leva o cliente até a primeira delas, para ele não ter de
            // adivinhar que ainda há um passo.
            clienteState.statusArte = 'APROVADO';
            state.arteSomenteLeitura = true;
            pintarSeloDoStatus('APROVADO');
            redesenharSecao('arte');
            redesenharSecao('entrega');
            redesenharSecao('faturamento');
            abrirSecao('entrega');
        } 
        else if (fluxoTipo === 'SOLICITAR_ALTERACAO') {
            // Salvar status global da OS no Supabase para REPROVADO (Laranja, rótulo "Arte em Andamento")
            // Protegido por try-catch para evitar que restrições RLS em producao_ordens_servico quebrem a finalização do cliente
            try {
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    if (osId.startsWith('vibe_')) {
                        await gravarStatusDoLink('Em Alteração');
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
                    autor_nome: 'Cliente (alteração online)',
                });
            } catch (e) { console.error('Erro log chat:', e); }

            // A aba da arte passa a mostrar o que ele pediu, em vez de sumir.
            clienteState.statusArte = 'Em Alteração';
            state.arteSomenteLeitura = true;
            pintarSeloDoStatus('Em Alteração');
            redesenharSecao('arte');
            abrirSecao('arte');
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

/**
 * Grava a solicitação de alteração do cliente em `pedidos_artes`.
 *
 * Antes isto era um `.update()` solto, e a solicitação ia embora calada. A
 * linha do pedido nesta tabela quase nunca existe: ela nasce quando o painel
 * salva o briefing, e em 20/08/2026 havia 38 linhas para 8.263 propostas. Um
 * UPDATE que não acha linha nenhuma **não é erro** no PostgREST -- responde 200
 * com `[]`. O supabase-js também não lança, então o `try/catch` em volta era
 * enfeite: o cliente via "tudo certo" e o texto dele nunca tinha existido.
 *
 * Aqui as linhas afetadas voltam do banco (`.select('id')` depois do update) e o
 * resultado é DEVOLVIDO para quem chamou olhar. Ninguém mais pode dizer ao
 * cliente que gravou sem ter gravado.
 *
 * O `insert` do fim é tentativa de última hora, e normalmente NÃO passa: esta
 * página roda como `anon` e a RLS de `pedidos_artes` recusa criação vindo daqui
 * (`42501`). Quem cria a linha é o painel, no momento em que gera o link
 * (`garantirLinhaDePedidoArte`, no `script.js`), com usuário logado. O `insert`
 * fica porque é o certo a tentar, e porque o erro dele agora chega à tela.
 *
 * `texto` vazio apaga a correcao anterior -- é o cliente que voltou atrás e
 * confirmou os dados. `statusEntrega` nulo deixa `entrega_dados` como está.
 *
 * @returns {Promise<{ok: boolean, erro?: string}>}
 */
async function gravarCorrecaoDoCliente(numPedInt, texto, statusEntrega) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        return { ok: false, erro: 'sem conexao com o banco' };
    }
    if (!numPedInt || isNaN(numPedInt)) {
        return { ok: false, erro: 'numero do pedido invalido' };
    }

    const { data: existente, error: erroLeitura } = await supabaseClient
        .from('pedidos_artes')
        .select('id, observacoes')
        .eq('id_int', numPedInt)
        .maybeSingle();

    if (erroLeitura) return { ok: false, erro: erroLeitura.message || String(erroLeitura) };

    let obs = (existente && existente.observacoes) ? existente.observacoes : {};
    if (typeof obs === 'string') {
        try { obs = JSON.parse(obs); } catch (e) { obs = {}; }
    }
    if (typeof obs !== 'object' || !obs) obs = {};

    // `texto` aceita duas formas, e as duas continuam valendo.
    //
    // TEXTO SOLTO e a forma antiga, de quando entrega e faturamento eram um
    // cartao so com um par de botoes: ela grava a chave
    // `correcao_entrega_faturamento`, que e a que existe nos pedidos ja
    // gravados e a que o painel sempre leu.
    //
    // OBJETO `{entrega, faturamento}` e a forma do Portal do Pedido, em que
    // cada aba tem a sua decisao. Ela grava duas chaves separadas -- assim o
    // atendente ve QUAL dos dois o cliente pediu para corrigir, em vez de um
    // texto so onde os dois assuntos se misturam. Nao precisou coluna nova:
    // `observacoes` e jsonb.
    const porAba = (texto && typeof texto === 'object') ? texto : null;
    if (porAba) {
        // A chave antiga sai quando o cliente decide de novo: e a mesma
        // informacao na forma de antes, e deixa-la para tras faria o painel
        // mostrar duas versoes da mesma solicitacao.
        delete obs['correcao_entrega_faturamento'];
        if (porAba.entrega) obs['correcao_entrega'] = porAba.entrega;
        else delete obs['correcao_entrega'];
        if (porAba.faturamento) obs['correcao_faturamento'] = porAba.faturamento;
        else delete obs['correcao_faturamento'];
    } else if (texto) {
        obs['correcao_entrega_faturamento'] = texto;
    } else {
        delete obs['correcao_entrega_faturamento'];
        delete obs['correcao_entrega'];
        delete obs['correcao_faturamento'];
    }

    const campos = { observacoes: obs };
    if (statusEntrega) campos.entrega_dados = statusEntrega;

    if (existente) {
        const { data, error } = await supabaseClient
            .from('pedidos_artes')
            .update(campos)
            .eq('id_int', numPedInt)
            .select('id');
        if (error) return { ok: false, erro: error.message || String(error) };
        if (!data || data.length === 0) return { ok: false, erro: 'nenhuma linha foi gravada' };
        return { ok: true };
    }

    const { error } = await supabaseClient
        .from('pedidos_artes')
        .insert(Object.assign({ id_int: numPedInt }, campos));
    if (error) return { ok: false, erro: error.message || String(error) };
    return { ok: true };
}

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
    // Dispara já: o catálogo de fontes é um JSON pequeno e a busca corre em
    // paralelo com a do pedido, então na hora de desenhar ele normalmente já
    // chegou. Quem desenha espera por ele de qualquer forma.
    carregarCatalogoFontesWeb();
    checkClienteRoute();
});

/**
 * Atualiza a barra final dinamicamente no link do cliente
 */
function atualizarBarraFinalCliente(osId) {
    if (state.amostrasContainerId !== 'cliente-amostras-itens-container') return;

    const containerActions = document.querySelector('.cliente-actions');
    if (!containerActions) return;

    // Pedido já decidido: a aba da arte agora continua existindo depois da
    // aprovação, e sem esta guarda o botão de finalizar reapareceria embaixo
    // das artes que o cliente só voltou para conferir.
    if (state.arteSomenteLeitura === true) {
        containerActions.style.display = 'none';
        return;
    }
    containerActions.style.display = '';

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
                    autor_nome: 'Cliente (via link)',
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
        // Fallback pelo proxy — o agente na estação, a Edge Function na nuvem.
        // `urlDoProxy` decide (`supabase-config.js`).
        const resp = await fetch(urlDoProxy(content));
        if (resp.ok) return await resp.arrayBuffer();
        throw new Error(`Proxy falhou: HTTP ${resp.status}`);
    }
}

// `getFontCSS` e `buildCanvasFont` vêm do `fonte-canvas.js`, carregado pelo
// `cliente.html` antes deste arquivo. Esta página tinha uma cópia só do
// `getFontCSS` — e a falta do `buildCanvasFont`, que ninguém notava porque as
// chamadas de desenho tinham um ramo de emergência, era o motivo de a
// numeração sair com outra fonte só aqui.



/**
 * Carrega a arte de todos os elementos PDF/SVG de uma lista que ainda não a tenham.
 *
 * Equivalente da `precarregarArtesDosElementos()` do `script.js`, que a cliente.html
 * não carrega. Quem puder esperar deve chamar esta — é o que faz a arte sair certa de
 * primeira, sem o vai-e-volta de carregar e mandar redesenhar.
 */
async function precarregarArtesDosElementos(elementos, linhas) {
    // As fotos entram junto com a arte. Sem isto, a página 2 em diante do link
    // do cliente saía SEM a foto: cada página mostra a linha daquela página, e
    // quem desenha aqui desenha uma vez só — a foto que chegasse depois do
    // traço não teria como aparecer. A página 1 funcionava por acidente, porque
    // o card do pedido já tinha carregado a foto da primeira linha.
    if (typeof window.precarregarFotosDosElementos === 'function') {
        try { await window.precarregarFotosDosElementos(elementos, linhas); } catch (e) { }
    }
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
function preloadAmostraItemPdfElements(numeracao, idx, osId, item) {
    if (!numeracao || !numeracao.elements) return;

    // As FOTOS primeiro, e por fora do filtro de PDF/SVG.
    //
    // Era aqui que a foto do cliente se perdia: sem nenhum elemento PDF ou SVG
    // pendente, esta função saía na linha seguinte e as fotos nunca chegavam a
    // ser pedidas. Como o desenho do card não tem repinte próprio, a janela
    // ficava vazia para sempre.
    if (typeof window.fotosPendentes === 'function') {
        const linha = (typeof linhaDaAmostra === 'function') ? linhaDaAmostra(item, numeracao, osId) : null;
        const linhas = [linha].filter(Boolean);
        // Perguntar antes o que falta é o que impede o laço: no repinte não
        // falta mais nada, e ele não pede repinte de novo.
        if (window.fotosPendentes(numeracao.elements, linhas).length) {
            window.precarregarFotosDosElementos(numeracao.elements, linhas)
                .then(() => renderItemAmostraCombinada(idx, osId))
                .catch(() => { });
        }
    }

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

// `renderQRCodeOnCtx` vive agora em frontend/qr-canvas.js — a mesma funcao que
// o editor, o card do pedido e a previa de imposicao usam. Havia TRES copias
// dela neste projeto, e copia que divergiu ja custou dois defeitos de producao
// nesta semana.
//
// Rede de seguranca para a janela de sincronizacao do painel: se o modulo nao
// tiver chegado a estacao, o QR nao desenha — mas a pagina do cliente continua
// de pe, em vez de morrer com ReferenceError na frente dele.
if (typeof window.renderQRCodeOnCtx !== 'function') {
    console.error('[QR] qr-canvas.js nao carregou. O QR nao sera desenhado.');
    window.renderQRCodeOnCtx = function (ctx, text, x, y, sz) {
        var h = sz / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - h, y - h, sz, sz);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - h, y - h, sz, sz);
    };
    window.desenharQRIdeal = function (ctx, el, sz, color) {
        window.renderQRCodeOnCtx(ctx, '', 0, 0, sz, color);
    };
}

// Rede de seguranca do `numero-da-pagina.js`, no mesmo espirito do guarda acima
// e pelo mesmo motivo: entre o site subir e a estacao atualizar o agente, uma
// maquina com agente antigo baixa a pagina nova e NAO baixa este arquivo — ele
// so entra na lista de sincronismo do agente a partir desta versao. Sem esta
// rede, a numeracao inteira pararia de desenhar naquela estacao. Com ela, a
// visualizacao volta ao que era antes de paginar: a primeira peca.
if (!window.NumeroDaPagina) {
    console.error('[Amostra] numero-da-pagina.js nao carregou. A visualizacao nao vai paginar o numero.');
    window.NumeroDaPagina = {
        sequencial: function (o) {
            var start = parseInt((o || {}).start, 10) || 1;
            if (String((o || {}).tipo || '').toUpperCase() === 'TICKET') {
                return start + (Math.max(1, parseInt(o.ticketPos, 10) || 1) - 1);
            }
            return start;
        },
        camarote: function (o) {
            return {
                local: parseInt((o || {}).cIni, 10) || 1,
                pessoa: 1,
                lotacao: Math.max(1, parseInt((o || {}).lotacao, 10) || 1)
            };
        }
    };
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
 * comportamento de todo pedido anterior a esta versao. Lista de ids VAZIA e
 * outra coisa: houve distribuicao e este modelo nao ficou com nenhuma linha,
 * entao ele folheia zero ingressos. Espelha CsvEditor.fatiaDoModelo.
 */
function fatiaCsvDoItem(item, num) {
    const rows = (num && num.csv_data) || [];
    const sel = item && item.csv_selecao;
    const mesmaNum = item && num && String(numeracaoIdDoItem(item)) === String(num.id);
    if (!sel || !mesmaNum || !sel.ids) return linhasAtivasCsv(rows);
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


/**
 * Busca o PDF de referência de UMA cor, sob demanda.
 *
 * O catálogo carregado no início da página não traz as colunas base64: elas
 * somam 18 MB para as 24 cores do sistema, e o cliente costuma ver uma. Aqui
 * chega só a cor que vai ser desenhada. Gêmeo de `garantirPdfDaCor` do
 * `script.js` — mexeu num, confira o outro.
 */
const _pdfDeCorEmVoo = new Map();
async function garantirPdfDaCor(cor) {
    if (!cor || !cor.id) return cor;
    // `undefined` = veio da lista enxuta. `null` = já buscado, cor sem arquivo.
    if (cor.pdf_base64 !== undefined) return cor;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return cor;

    const chave = String(cor.id);
    if (!_pdfDeCorEmVoo.has(chave)) {
        _pdfDeCorEmVoo.set(chave, supabaseClient
            .from('producao_cores')
            .select('pdf_base64,pdf_verso_base64')
            .eq('id', cor.id)
            .maybeSingle()
            .then(({ data, error }) => {
                if (error) throw error;
                return data || { pdf_base64: null, pdf_verso_base64: null };
            }));
    }

    try {
        const linha = await _pdfDeCorEmVoo.get(chave);
        cor.pdf_base64 = linha.pdf_base64 || null;
        cor.pdf_verso_base64 = linha.pdf_verso_base64 || null;
        const noEstado = (state.cores || []).find(c => String(c.id) === chave);
        if (noEstado && noEstado !== cor) {
            noEstado.pdf_base64 = cor.pdf_base64;
            noEstado.pdf_verso_base64 = cor.pdf_verso_base64;
        }
    } catch (e) {
        _pdfDeCorEmVoo.delete(chave);
        console.warn('[cores] Nao foi possivel baixar o PDF da cor ' + cor.id, e);
    }
    return cor;
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
    // O PDF da cor não vem no catálogo (ver garantirPdfDaCor). Sem esta
    // linha a amostra sairia sem a camada da cor, calada.
    if (cor) await garantirPdfDaCor(cor);
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

                // A arte em PDF entra no TAMANHO REAL dela, centrada na peca, e o
                // que passar da peca fica de fora. E o que a impressora faz:
                // engine.py abre a arte em PDF e a coloca na celula com o rect
                // do tamanho da PROPRIA PAGINA (`base_w`/`base_h`), nunca
                // reduzida para caber. Encolher aqui fazia a tela mostrar a arte
                // menor do que ela sai no papel, com uma faixa branca em volta
                // que o papel nao tem -- foi o que o usuario viu em 18/08/2026
                // comparando a janela com a impressao.
                //
                // A pagina do PDF vem em PONTOS (2,8346 pt = 1 mm) e o canvas
                // tem S pixels por milimetro: a escala do tamanho real e
                // S / 2,8346. Arte em IMAGEM continua encaixando proporcional-
                // mente (ramo abaixo), porque e isso que o motor faz com ela em
                // `_load_base_as_pdf`.
                const escalaTamanhoReal = S / 2.8346;
                const scaledViewport = page.getViewport({ scale: escalaTamanhoReal });

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
        // E a PAGINA, pelo mesmo motivo: folhear os ingressos folheia a peca
        // inteira, e nao so os campos que vem do banco. O ingresso 3 do cliente
        // tem a linha 3 do banco E o numero 3 -- e assim que sai no papel.
        const _pagAmostra = paginaDaAmostra(item, linhasDaAmostra(item, num).length);
        const _niAmostra = parseInt(
            item?.numeracao_inicio || item?.num_inicial ||
            item?.NUMERACAO_INICIO || 1
        ) || 1;
        const _ticketQtdAmostra = parseInt(num?.ticket_qtd || item?.ticket_qtd || 1) || 1;

        // Canvas não reflui: uma fonte que chegue depois do traço não aparece
        // mais. Esperar aqui é o que faz a numeração sair certa de primeira no
        // navegador do cliente, que nunca tem as fontes da gráfica instaladas.
        await garantirFontesCarregadas(fontesDosElementos(num.elements));

        const numCanvas = document.createElement('canvas');
        numCanvas.width = Math.round(fmt.width_mm * S);
        numCanvas.height = Math.round(fmt.height_mm * S);
        const numCtx = numCanvas.getContext('2d', { colorSpace: 'srgb' });

        // Fundo transparente. NAO desenhar contorno do formato aqui: este canvas
        // e composto POR CIMA da arte, entao um strokeRect na borda cobria a
        // fileira de pixels da beirada do desenho -- a arte aparecia cortada em
        // cima e embaixo na tela, e so na tela, porque o motor redesenha a
        // numeracao do zero e nunca pinta esta moldura. Quem mostra ate onde vai
        // o ingresso e a propria borda do canvas, com a sombra do CSS.

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
                numCtx.font = buildCanvasFont(fs, el.font_name);
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
                } else if (el.type.startsWith('CAMAROTE_')) {
                    // A pagina anda pessoa a pessoa e vira o local quando a
                    // lotacao fecha, como o _resolve_camarote_val do engine.py.
                    const _cam = window.NumeroDaPagina.camarote({
                        pagina: _pagAmostra,
                        lotacao: item?.L_CAM || item?.l_cam ||
                                 item?.lotacao_cam || item?.LOTACAO_CAM ||
                                 item?.lotacao || 5,
                        // O local inicial e o C_INI. O painel usa o mesmo campo;
                        // aqui a tela lia o NI, que e outra coisa.
                        cIni: item?.c_ini || item?.C_INI || 1
                    });
                    if (el.type === 'CAMAROTE_LOCAL') {
                        label = `${el.prefix || ''}${_cam.local}`;
                    } else if (el.type === 'CAMAROTE_PESSOA') {
                        label = `${el.prefix || ''}${_cam.pessoa}`;
                    } else {
                        label = `${el.prefix || ''}${_cam.pessoa}/${_cam.lotacao}`;
                    }
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
                    // Folhear os ingressos folheia o NUMERO tambem: o ingresso
                    // N do cliente e o `NI + N` que o motor imprime.
                    const current_val = window.NumeroDaPagina.sequencial({
                        start: _niAmostra, pagina: _pagAmostra,
                        tipo: num && num.tipo, ticketPos: el.ticket_pos,
                        ticketQtd: _ticketQtdAmostra
                    });
                    label = `${el.prefix || ''}${String(current_val).padStart(padVal, '0')}${el.suffix || ''}`;
                }
                window.desenharTextoAjustado(
                    numCtx, el, label, fs, S,
                    (f) => buildCanvasFont(f, el.font_name)
                );
            } else if (el.type === 'QR_IDEAL') {
                // O cliente precisa VER o elemento que vai no ingresso dele.
                // Ate 14/08/2026 esta tela descartava o QR Ideal em silencio:
                // a arte era aprovada sem ele, e ele saia impresso.
                //
                // O codigo sai do pool, que so existe na estacao — aqui o
                // desenho e um exemplo, e a logo por cima ja impede extrair
                // um codigo legivel da imagem de aprovacao.
                window.desenharQRIdeal(numCtx, el, (el.size_mm || 15) * S,
                                       el.color || '#000000', null, null, 1);
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
                    // Mesma conta do texto sequencial: o QR do ingresso N
                    // carrega o numero do ingresso N.
                    const val = window.NumeroDaPagina.sequencial({
                        start: _niAmostra, pagina: _pagAmostra
                    });
                    const raw = padVal > 0 ? String(val).padStart(padVal, '0') : String(val);
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
            } else if (el.type === 'FOTO') {
                // Gêmeo do ramo do script.js: o cliente vê a mesma janela de foto,
                // com o mesmo enquadramento, que vai ao papel.
                if (typeof window.desenharElementoFoto === 'function') {
                    window.desenharElementoFoto(numCtx, el, S, false, _linhaCsv, null);
                }
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
                        drawArteDoElemento(numCtx, imgObj, -hw, -hh_el, w, h, el);
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
                            drawArteDoElemento(numCtx, el._svgImage, -hw, -hh_el, w, h, el);
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

    // Sem borda decorativa: ela era desenhada DENTRO do bitmap, na ultima
    // fileira de pixels, entao cobria a beirada da arte e viajava junto para
    // todo lugar que copia este canvas -- a janela ampliada, o link do cliente
    // e o JPEG de aprovacao. Enfeite de tela nao entra na imagem (ver
    // docs/editor_de_arte.md).
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
        preloadAmostraItemPdfElements(num, idx, osId, item);
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
            const proxyUrl = urlDoProxy(pdfUrl);
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
            // e async, entao sai certo de primeira. A foto vai junto, e e a foto
            // DESTA pagina — baixar o lote inteiro para mostrar uma pagina seria
            // fazer o cliente esperar por 499 fotos que ele nao esta vendo.
            const _linhasPg = (typeof linhasDaAmostra === 'function')
                ? linhasDaAmostra(item, num)
                : (num.csv_data || item.csv_data || []);
            await precarregarArtesDosElementos(num.elements, [_linhasPg[pageNum - 1]].filter(Boolean));
            // Pelo mesmo motivo da face montada em canvas: a fonte tem de estar
            // na máquina antes do traço, senão a página do PDF sai carimbada
            // com uma genérica e assim fica.
            await garantirFontesCarregadas(fontesDosElementos(num.elements));
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
            ctx.font = buildCanvasFont(fs, el.font_name);
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

            window.desenharTextoAjustado(
                ctx, el, label, fs, Sx,
                (f) => buildCanvasFont(f, el.font_name)
            );
        } else if (el.type === 'QR_IDEAL') {
                // O cliente precisa VER o elemento que vai no ingresso dele.
                // Ate 14/08/2026 esta tela descartava o QR Ideal em silencio:
                // a arte era aprovada sem ele, e ele saia impresso.
                //
                // O codigo sai do pool, que so existe na estacao — aqui o
                // desenho e um exemplo, e a logo por cima ja impede extrair
                // um codigo legivel da imagem de aprovacao.
                window.desenharQRIdeal(ctx, el, (el.size_mm || 15) * S,
                                       el.color || '#000000', null, null, 1);
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
        } else if (el.type === 'FOTO') {
            // Modo PDF (multipaginas): a pagina N mostra a linha N da FATIA deste
            // modelo, como o texto variavel logo acima.
            const _linhasFoto = (typeof linhasDaAmostra === 'function')
                ? linhasDaAmostra(item, num)
                : (num?.csv_data || item?.csv_data || []);
            if (typeof window.desenharElementoFoto === 'function') {
                window.desenharElementoFoto(ctx, el, S, false, _linhasFoto[pageNum - 1] || null, null);
            }
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
                drawArteDoElemento(ctx, imgObj, -hw, -hh_el, w, h, el);
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

// ══════════════════════════════════════════════════════════════════════════
//  A aba da arte — uma cara para cada status do pedido
// ══════════════════════════════════════════════════════════════════════════
//
// Até 20/08/2026 esta página só mostrava a arte enquanto o pedido esperava
// aprovação. Aprovou, a arte sumia da tela: o link ficava com uma frase, e o
// cliente não tinha mais como olhar o que aprovou nem conferir a numeração de
// um ingresso. Medido no banco naquele dia, 36 dos 50 links estavam num status
// em que esta página não mostrava nada.
//
// Agora a aba existe em todos os status. O que muda é o modo: com decisão
// (`aprovar`) ou só leitura, e sempre com um aviso em cima dizendo em que pé
// está o pedido.

/**
 * O aviso no topo da aba da arte.
 *
 * `manterArtes` decide o essencial: `false` esconde as artes e deixa só a
 * mensagem (é o caso de quando ainda não há arte pronta); `true` põe a mensagem
 * ACIMA das artes, que continuam visíveis e com lightbox.
 */
function avisoDaArte(icone, titulo, texto, manterArtes) {
    const secao = document.getElementById('secao-arte');
    if (!secao) return;

    let aviso = document.getElementById('portal-aviso-arte');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'portal-aviso-arte';
        aviso.className = 'portal-cartao';
        secao.insertBefore(aviso, secao.firstChild);
    }

    aviso.innerHTML = '<div style="text-align: center; padding: 6px 0 2px;">'
        + '<div style="font-size: 2.6rem; line-height: 1.1;">' + icone + '</div>'
        + '<h2 style="justify-content: center; border: 0; padding: 0; margin: 10px 0 6px;">'
        + escapeHtml(titulo) + '</h2>'
        + '<p class="portal-vazio" style="margin: 0;">' + texto + '</p>'
        + '</div>';

    const container = document.getElementById('cliente-amostras-itens-container');
    if (container) container.style.display = manterArtes ? 'flex' : 'none';
    const acoes = document.querySelector('.cliente-actions');
    if (acoes) acoes.style.display = 'none';
}

/**
 * O que o cliente pediu para alterar, modelo a modelo — lido dos itens, que é
 * onde a observação dele foi gravada.
 *
 * Sem isto, quem pede alteração e volta ao link não vê o que escreveu, e acaba
 * escrevendo de novo pelo WhatsApp. É a mesma informação, devolvida a ele.
 */
function pedidosDeAlteracaoDoCliente(osId) {
    const itens = (state.osItens && state.osItens[osId]) || [];
    return itens
        .filter(i => i.amostra_status === 'REPROVADA' && i.amostra_obs && String(i.amostra_obs).trim())
        .map(i => ({
            modelo: i.nome_produto || i.modelo_descri || 'Modelo',
            texto: String(i.amostra_obs).trim()
        }));
}

/**
 * Desenha a aba da arte conforme o status do pedido.
 *
 * A chave vem de `seloDoStatus`, no `cliente-shell.js`, que é o único lugar que
 * entende as seis grafias de status que convivem na coluna `status_arte`.
 */
function desenharSecaoArte(osId) {
    const chave = seloDoStatus(clienteState.statusArte).chave;

    if (chave === 'aprovar') {
        state.arteSomenteLeitura = false;
        const aviso = document.getElementById('portal-aviso-arte');
        if (aviso) aviso.remove();
        const container = document.getElementById('cliente-amostras-itens-container');
        if (container) container.style.display = 'flex';
        const acoes = document.querySelector('.cliente-actions');
        if (acoes) acoes.style.display = '';
        renderAmostrasOSItens(osId);
        return;
    }

    state.arteSomenteLeitura = true;

    if (chave === 'aprovado') {
        renderAmostrasOSItens(osId);
        avisoDaArte('✅', 'Artes aprovadas',
            'Você já aprovou estas artes. Elas estão abaixo, como foram aprovadas — '
            + 'toque em qualquer uma para ampliar. Em breve seu pedido entra em produção.', true);
        return;
    }

    if (chave === 'producao') {
        renderAmostrasOSItens(osId);
        avisoDaArte('🖨️', 'Pedido em produção',
            'Suas artes já estão na impressora. Confira o prazo e o endereço na aba '
            + '<b>Entrega</b>.', true);
        return;
    }

    if (chave === 'correcao') {
        renderAmostrasOSItens(osId);
        const pedidos = pedidosDeAlteracaoDoCliente(osId);
        let texto = 'Recebemos seu pedido de alteração e nossa equipe está refazendo a arte. '
                  + 'Assim que estiver pronta, ela aparece aqui.';
        if (pedidos.length) {
            texto += '<br><br><b>O que você pediu:</b>';
            pedidos.forEach(p => {
                texto += '<br>• <b>' + escapeHtml(p.modelo) + ':</b> ' + escapeHtml(p.texto);
            });
        }
        avisoDaArte('🔧', 'Alteração solicitada', texto, true);
        return;
    }

    // `preparando`, e qualquer status que o ERP invente amanhã.
    avisoDaArte('🎨', 'Arte em preparação',
        'Nossa equipe está preparando sua arte. Quando ela estiver pronta, você recebe '
        + 'um aviso e ela aparece aqui, nesta mesma página. Enquanto isso, confira seus '
        + 'dados nas outras abas.', false);
}

window.desenharSecaoArte = desenharSecaoArte;
