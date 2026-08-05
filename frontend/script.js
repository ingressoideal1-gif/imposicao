// - VDP Engine -- Frontend Script -

'use strict';



// - Utility -- Parse Decimal BR (aceita vírgula como separador) -

function parseDecimalBR(value) {

    if (typeof value !== 'string') value = String(value);

    value = value.trim().replace(/\s*mm\s*$/i, '').trim();

    // Aceitar vírgula como separador decimal (padrão brasileiro)

    value = value.replace(',', '.');

    const num = parseFloat(value);

    return isNaN(num) ? null : num;

}



function validateOffsetField(inputEl) {

    const val = parseDecimalBR(inputEl.value);

    if (val === null && inputEl.value.trim() !== '' && inputEl.value.trim() !== '0') {

        inputEl.classList.add('invalid');

        return null;

    }

    inputEl.classList.remove('invalid');

    return val !== null ? val : 0;

}



// - State -

const state = {

    formatos: [],

    numeracoes: [],

    saidas: [],

    cores: [],

    modelosImposicao: [],

    fmtRotations: {}, // mapeia índice de célula -> ângulo (0, 90, 180, 270)

    fmtSelectedCellIndex: null, // índice da célula selecionada no preview

    printMode: "front",

    previewFace: "front",



    // Editor de Numeração

    numFormato: null,       // formato selecionado no editor

    numElements: [],        // array de elementos no editor

    numHistory: [],         // historico de undo/redo
    
    numHistoryIndex: -1,    // indice atual do historico

    numElCounter: 0,        // contador de IDs locais (sempre cresce, nunca reseta)

    selectedElId: null,     // elemento selecionado no canvas

    selectedElIds: [],      // IDs dos elementos selecionados no editor

    dragging: null,         // { targets, downX, downY }

    canvasScale: 3,         // px por mm (default)

    bgImage: null,          // HTMLImageElement | null (arte de fundo no canvas)

    impMultiArtes: [],      // array of arts for multi_artes pagination



    // Preview de Imposição

    impArtImage: null,

    impArtWidth: 0,

    impArtHeight: 0,

    csvFile: null,

    csvData: null,

    

    // Banco de Dados no Editor

    numCsvHeaders: [],

    numCsvData: null,

    numCsvFilename: "",

    loadedOSName: "",

    expectedArteName: "",
    filtroSetor: "",
    filtroStatus: "",
    filtroSetorArte: "",
    filtroStatusArte: "",
    filtroFilaTipo: "fila",
};


// - Variáveis globais de usuários -
let usuariosSupabase = [];
let designersSupabase = [];
let atendentesSupabase = [];
let designersObjetosSupabase = [];

const VENDEDORES_LISTA = [
    'L. Martins',
    'Comercial',
];


// - Utility -- fetchPdfBytes -
// Busca os bytes de um PDF a partir de uma URL ou string base64.
// Para URLs: tenta fetch DIRETO primeiro (funciona para URLs do Supabase que têm CORS público).
// Só usa o proxy como fallback quando API_BASE_URL está disponível (backend local).
// Isso evita o erro 404 no Vercel onde não há rota /api/proxy.
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
// - Utility -- getFontCSS -
// Converte font_name do elemento para string CSS para renderização no canvas.
// IMPORTANTE: usar Arial (não Inter) como fallback de Helvetica — Arial tem métricas
// mais próximas da Helvetica Base-14 usada pelo engine Python (PyMuPDF).
// Isso garante que a visualização em canvas seja fiel ao PDF gerado.
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

// Fração do ascender por família de fonte (ascender / em-size).
// Deve espelhar ASCENDER_FRACTIONS do engine.py para que a posição vertical
// do texto no canvas seja idêntica à do PDF gerado.
// No canvas, textBaseline='middle' centraliza pelo centro visual (mean line),
// mas precisamos deste mapa para o cálculo do line_height multilinha.
const ASCENDER_CANVAS = {
    'helv': 0.718, 'helv-bold': 0.718,
    'times': 0.683, 'times-bold': 0.683,
    'cour': 0.626, 'cour-bold': 0.626,
};
const _ASCENDER_CANVAS_DEFAULT = 0.72;


// Monta a string de font para ctx.font no Canvas 2D.
// O canvas exige a ordem: [font-style] [font-weight] size family
// getFontCSS pode retornar "bold Inter" ou "italic bold 'Montserrat'",
// com weight/style misturados antes da family. Esta funcao reorganiza corretamente.
function buildCanvasFont(fontSizePx, fontName) {
    const css = getFontCSS(fontName);
    let weight = '';
    let style = '';
    let family = css;
    if (family.startsWith('italic ')) { style = 'italic '; family = family.slice(7); }
    if (family.startsWith('bold '))   { weight = 'bold '; family = family.slice(5); }
    return `${style}${weight}${fontSizePx}px ${family}`;
}

// - State -- Fontes do Sistema -
const state_fonts = {
    system: [],           // [{ family, fullName, style }]
    loaded: false,        // true quando qualquer lista foi carregada (API ou fallback)
    loadedFromAPI: false, // true SOMENTE quando queryLocalFonts() retornou com sucesso
    loading: false,
    permissionDenied: false,
    catalogo: [],
};

async function loadCatalogoFontes() {
    try {
        const apiBase = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        const res = await fetch(`${apiBase}/api/fontes`);
        if (res.ok) {
            const list = await res.json();
            state_fonts.catalogo = list || [];
            
            let styleEl = document.getElementById('catalogo-fontes-css');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'catalogo-fontes-css';
                document.head.appendChild(styleEl);
            }
            
            let cssText = '';
            for (const f of state_fonts.catalogo) {
                if (f.arquivo_url && f.font_family) {
                    cssText += `
                    @font-face {
                        font-family: '${f.font_family}';
                        src: url('${f.arquivo_url}');
                        font-display: swap;
                    }\n`;
                }
            }
            styleEl.textContent = cssText;
            console.log(`[Fonts] Catálogo de fontes web carregado: ${state_fonts.catalogo.length} fonte(s)`);
            
            // Atualiza a tabela na UI caso esteja renderizada
            if (typeof renderCatFontesUI === 'function') {
                renderCatFontesUI();
            }
            // Atualiza o badge no menu lateral
            const badge = document.getElementById('badge-fontes');
            if (badge) {
                badge.textContent = state_fonts.catalogo.length;
            }
            // Popula o <select> de fontes do editor de arte (Criar Arte)
            const fontSelect = document.getElementById('prop-font-family');
            if (fontSelect) {
                fontSelect.innerHTML = '';
                for (const f of state_fonts.catalogo) {
                    const opt = document.createElement('option');
                    opt.value = f.font_family || f.nome;
                    opt.textContent = f.nome;
                    opt.style.fontFamily = `'${f.font_family}', sans-serif`;
                    fontSelect.appendChild(opt);
                }
            }
        }
    } catch (e) {
        console.warn('[Fonts] Não foi possível carregar o catálogo de fontes web:', e);
    }
}
// --- Fontes Web Manager ---
async function renderCatFontesUI() {
    const tbody = document.getElementById('tbody-fontes');
    const empty = document.getElementById('empty-fontes');
    if (!tbody || !empty) return;
    
    if (!state_fonts.catalogo || state_fonts.catalogo.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    let html = '';
    state_fonts.catalogo.forEach(f => {
        html += `
            <tr>
                <td style="font-family: '${f.font_family}', sans-serif; font-size: 1.2rem;">${f.nome}</td>
                <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${f.font_family}</code></td>
                <td><span class="badge" style="background: var(--gray-lighter); color: var(--text-dim);">${f.categoria || 'Geral'}</span></td>
                <td><span style="color: #10b981;">●</span> Ativo</td>
                <td class="text-right">
                    <button class="btn btn-sm" onclick="deletarFonteWeb('${f.id}')" style="color: var(--danger); background: #fee2e2; border: 1px solid #fca5a5;">🗑️ Excluir</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}
window.renderCatFontesUI = renderCatFontesUI;

async function salvarNovaFonteWeb() {
    const nome = document.getElementById('fonte-name').value.trim();
    const family = document.getElementById('fonte-family').value.trim();
    const categoria = document.getElementById('fonte-categoria').value.trim() || 'Geral';
    const fileInput = document.getElementById('fonte-file');
    
    if (!nome || !family || !fileInput.files || fileInput.files.length === 0) {
        alert('Por favor, preencha o Nome, a Família CSS e selecione um arquivo de fonte (.ttf, .otf, .woff).');
        return;
    }
    
    const file = fileInput.files[0];
    const btn = document.getElementById('btn-salvar-fonte');
    btn.disabled = true;
    btn.innerText = '⏳ Enviando...';
    
    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = Date.now();
        const storagePath = `fontes/${timestamp}_${safeName}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('chat-ideal')
            .upload(storagePath, file, { upsert: true });
            
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabaseClient.storage
            .from('chat-ideal')
            .getPublicUrl(storagePath);
            
        const arquivo_url = publicUrlData.publicUrl;
        
        const payload = {
            nome: nome,
            font_family: family,
            categoria: categoria,
            arquivo_url: arquivo_url,
            ativo: true
        };
        
        const apiBase = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        const res = await fetch(`${apiBase}/api/fontes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error('Erro ao salvar no banco');
        
        document.getElementById('fonte-name').value = '';
        document.getElementById('fonte-family').value = '';
        document.getElementById('fonte-file').value = '';
        
        await loadCatalogoFontes();
        renderCatFontesUI();
        
        alert('Fonte cadastrada com sucesso!');
        
    } catch (e) {
        console.error('[Fontes] Erro no upload:', e);
        alert('Erro ao fazer upload da fonte: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = '📤 Fazer Upload';
    }
}
window.salvarNovaFonteWeb = salvarNovaFonteWeb;

async function deletarFonteWeb(id) {
    if (!confirm('Deseja realmente remover esta fonte do catálogo?')) return;
    
    try {
        const apiBase = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        const res = await fetch(`${apiBase}/api/fontes?id=${id}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) throw new Error('Erro ao remover do banco');
        
        await loadCatalogoFontes();
        renderCatFontesUI();
        
    } catch (e) {
        console.error('[Fontes] Erro ao deletar:', e);
        alert('Erro ao excluir fonte: ' + e.message);
    }
}
window.deletarFonteWeb = deletarFonteWeb;
// Fontes Base-14 embutidas no PDF foram removidas conforme regra do catálogo estrito





// - Font Picker Component -
// Cria um font picker interativo com busca, preview e suporte a fontes do sistema.
function createFontPicker(elId, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'font-picker-wrap';
    wrap.dataset.elId = elId;

    const BUILTIN_IDS = ['helv','helv-bold','times','times-bold','cour','cour-bold'];

    const getLabelForValue = (v) => {
        if (!v) return 'Selecione uma fonte...';
        // Traduzir IDs internos para nomes legíveis
        const builtinNames = {
            'helv': 'Helvetica', 'hebo': 'Helvetica Bold',
            'helv-bold': 'Helvetica Bold',
            'times': 'Times New Roman', 'times-bold': 'Times New Roman Bold',
            'cour': 'Courier', 'cour-bold': 'Courier Bold'
        };
        if (builtinNames[v]) return builtinNames[v];
        if (v.startsWith('system:')) {
            const parts = v.slice(7).split('|');
            return parts[0] || v;
        }
        // Tentar encontrar no catálogo pelo font_family
        if (state_fonts.catalogo && state_fonts.catalogo.length) {
            const cat = state_fonts.catalogo.find(f => f.font_family === v || f.nome === v);
            if (cat) return cat.nome;
        }
        return v;
    };

    const buildTriggerHTML = (v) => {
        const label = getLabelForValue(v);
        const css   = getFontCSS(v);
        const fam   = css.replace(/^(bold |italic )*/, '');
        return `<span class="fp-preview" style="font-family:${fam}">${label}</span><span class="fp-arrow">▾</span>`;
    };

    wrap.innerHTML = `
        <button type="button" class="font-picker-trigger" id="fpt-${elId}">
            ${buildTriggerHTML(currentValue)}
        </button>
        <div class="font-picker-dropdown" id="fpd-${elId}">
            <div class="font-picker-search">
                <input type="text" placeholder="🔍 Buscar fonte..." id="fps-${elId}" autocomplete="off">
            </div>
            <div class="font-picker-list" id="fpl-${elId}">
                <div class="font-picker-loading">Carregando fontes...</div>
            </div>
        </div>
    `;

    const trigger     = wrap.querySelector(`#fpt-${elId}`);
    const dropdown    = wrap.querySelector(`#fpd-${elId}`);
    const searchInput = wrap.querySelector(`#fps-${elId}`);
    const list        = wrap.querySelector(`#fpl-${elId}`);

    let currentFont = currentValue || '';

    const renderList = (filter = '') => {

        const q = filter.toLowerCase().trim();
        let html = '';

        // - Fontes do Catálogo Web (Gráfica) -
        if (state_fonts.catalogo && state_fonts.catalogo.length) {
            const catFiltered = state_fonts.catalogo.filter(f => !q || (f.nome || '').toLowerCase().includes(q) || (f.font_family || '').toLowerCase().includes(q));
            if (catFiltered.length) {
                html += `<div class="font-picker-group-label" style="color:#38bdf8; font-weight:700;">🌐 Fontes Oficiais da Gráfica (${catFiltered.length})</div>`;
                for (const f of catFiltered) {
                    const fullName = f.nome;
                    const sel = fullName === currentFont ? 'selected' : '';
                    html += `<div class="font-picker-opt ${sel}" data-value="${fullName}">
                        <span class="fp-name" style="flex:1; font-size:0.85rem; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.nome}</span>
                        <span class="fp-sample" style="font-family:'${f.font_family}',sans-serif; font-size:0.75rem; color:#64748b; flex-shrink:0;">Aa</span>
                    </div>`;
                }
            } else {
                html = `<div class="font-picker-loading">Nenhuma fonte encontrada para "${filter}"</div>`;
            }
        } else {
            html = `<div class="font-picker-loading">Catálogo de fontes vazio. Cadastre em Configurações > Fontes.</div>`;
        }

        list.innerHTML = html;


        list.querySelectorAll('.font-picker-opt').forEach(opt => {
            opt.addEventListener('mousedown', e => {
                e.preventDefault();
                const val = opt.dataset.value;
                currentFont = val;
                trigger.innerHTML = buildTriggerHTML(val);
                closeDropdown();
                if (onChange) onChange(val);
            });
        });

        const sel = list.querySelector('.font-picker-opt.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    };

    const openDropdown = async () => {
        trigger.classList.add('open');
        dropdown.classList.add('open');
        searchInput.value = '';
        searchInput.focus();

        renderList('');
    };

    const closeDropdown = () => {
        trigger.classList.remove('open');
        dropdown.classList.remove('open');
    };

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        if (dropdown.classList.contains('open')) {
            closeDropdown();
        } else {
            document.querySelectorAll('.font-picker-dropdown.open').forEach(d => d.classList.remove('open'));
            document.querySelectorAll('.font-picker-trigger.open').forEach(t => t.classList.remove('open'));
            openDropdown();
        }
    });

    searchInput.addEventListener('input', () => renderList(searchInput.value));

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) closeDropdown();
    }, { capture: true, passive: true });

    return wrap;
}

// Gera o HTML do grupo de Fonte para uso em template strings de elementos
// (será montado depois via JS, não inline HTML, pois precisa do DOM)
function fontPickerHTML(elId, currentValue) {
    // Retorna um placeholder que será substituído após inserção no DOM
    return `<div class="font-picker-mount" data-el-id="${elId}" data-current="${currentValue || 'helv'}"></div>`;
}

// Monta todos os font pickers pendentes no DOM
function mountFontPickers() {
    document.querySelectorAll('.font-picker-mount').forEach(mount => {
        if (mount.dataset.mounted) return;
        mount.dataset.mounted = '1';
        const elId = mount.dataset.elId;
        const currentValue = mount.dataset.current || 'helv';
        const picker = createFontPicker(elId, currentValue, (val) => {
            updateEl(elId, 'font_name', val);
        });
        mount.replaceWith(picker);
    });
}



// - Utility -- Toast -

function toast(msg, type = 'info') {

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    const tc = document.getElementById('toast-container');

    const el = document.createElement('div');

    el.className = `toast toast-${type}`;

    el.innerHTML = `<span>${icons[type]}</span> ${msg}`;

    tc.appendChild(el);

    setTimeout(() => el.remove(), 3100);

}



// - Navigation -

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const viewId = btn.dataset.view;
        if (typeof window.showView === 'function') {
            window.showView(viewId);
        } else {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            const view = document.getElementById(viewId);
            if (view) view.classList.add('active');
        }
    });
});



// - API Helpers -

async function api(method, path, body = null) {

    if (typeof supabaseClient !== 'undefined' && supabaseClient && (path.startsWith('/formatos') || path.startsWith('/numeracoes') || path.startsWith('/saidas') || path.startsWith('/cores') || path.startsWith('/modelos_imposicao'))) {

        const parts = path.substring(1).split('/');

        let col = parts[0];
        // Adicionar o prefixo producao_ exigido pelo parceiro Vibecode
        if (col === 'modelos_imposicao') {
            col = 'producao_modelos_imposicao';
        } else {
            col = 'producao_' + col;
        }

        const docId = parts[1] || null;



        try {

            if (method === 'GET') {

                if (docId) {

                    const { data, error } = await supabaseClient.from(col).select('*').eq('id', docId).single();

                    if (error) throw error;

                    if (col === 'modelos_imposicao' && data) {

                        return { id: data.id, name: data.name, ...data.config };

                    }

                    if (col === 'producao_numeracoes' && data) {
                        // Sempre filtrar METADATA dos elements
                        if (data.elements && Array.isArray(data.elements)) {
                            const metadataEl = data.elements.find(el => el.type === 'METADATA');
                            if (metadataEl) {
                                // Se a coluna não tem print_mode, extrair do METADATA
                                if (!data.print_mode || data.print_mode === 'front') {
                                    if (metadataEl.print_mode) data.print_mode = metadataEl.print_mode;
                                }
                                data.elements = data.elements.filter(el => el.type !== 'METADATA');
                            }
                        }
                        if (!data.print_mode) data.print_mode = 'front';
                    }

                    return data;

                } else {

                    const { data, error } = await supabaseClient.from(col).select('*');

                    if (error) throw error;

                    if (col === 'modelos_imposicao' && data) {

                        return data.map(item => ({ id: item.id, name: item.name, ...item.config }));

                    }

                    if (col === 'producao_numeracoes' && data) {
                        data.forEach(n => {
                            // Sempre filtrar METADATA dos elements
                            if (n.elements && Array.isArray(n.elements)) {
                                const metadataEl = n.elements.find(el => el.type === 'METADATA');
                                if (metadataEl) {
                                    // Se a coluna não tem print_mode, extrair do METADATA
                                    if (!n.print_mode || n.print_mode === 'front') {
                                        if (metadataEl.print_mode) n.print_mode = metadataEl.print_mode;
                                    }
                                    n.elements = n.elements.filter(el => el.type !== 'METADATA');
                                }
                            }
                            if (!n.print_mode) n.print_mode = 'front';
                        });
                    }

                    return data;

                }

            } else if (method === 'POST') {

                let id = body.id;
                if (!id) {
                    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                        id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                    } else {
                        id = col.substring(0,3) + '_' + Date.now().toString(36) + Math.random().toString(36).substring(2,6);
                    }
                }

                let insertPayload;

                if (col === 'modelos_imposicao') {

                    const { name, ...configData } = body;

                    insertPayload = { id, name, config: configData };

                } else {

                    insertPayload = { id, ...body };

                }

                let { data, error } = await supabaseClient.from(col).insert([insertPayload]).select().single();

                if (error && (error.message || '').includes("Could not find the '")) {
                    const match = (error.message || '').match(/Could not find the '(.*?)' column/);
                    if (match && match[1]) {
                        const missingCol = match[1];
                        console.warn(`[api] Coluna '${missingCol}' ausente na tabela '${col}'. Tratando graciosamente...`);
                        delete insertPayload[missingCol];
                        const retryRes = await supabaseClient.from(col).insert([insertPayload]).select().single();
                        data = retryRes.data;
                        error = retryRes.error;
                    }
                }

                if (error) throw error;

                return { id: data ? data.id : id };

            } else if (method === 'PUT') {

                if (!docId) throw new Error('ID ausente para atualização');

                let updateData;

                if (col === 'modelos_imposicao') {

                    const { name, ...configData } = body;

                    updateData = { name, config: configData };

                } else {

                    updateData = { ...body };

                    delete updateData.id;

                }

                let { error } = await supabaseClient.from(col).update(updateData).eq('id', docId);

                if (error && (error.message || '').includes("Could not find the '")) {
                    const match = (error.message || '').match(/Could not find the '(.*?)' column/);
                    if (match && match[1]) {
                        const missingCol = match[1];
                        console.warn(`[api] Coluna '${missingCol}' ausente na tabela '${col}'. Tratando graciosamente...`);
                        delete updateData[missingCol];
                        const retryRes = await supabaseClient.from(col).update(updateData).eq('id', docId);
                        error = retryRes.error;
                    }
                }

                if (error) throw error;

                return { status: 'success' };

            } else if (method === 'DELETE') {

                if (!docId) throw new Error('ID ausente para exclusão');

                const { error } = await supabaseClient.from(col).delete().eq('id', docId);

                if (error) throw error;

                return { status: 'success' };

            }

        } catch (e) {

            console.error(`Erro no Supabase (${method} ${path}):`, e);

            throw new Error(`Erro no Banco de Dados: ${e.message}`);

        }

    }



    const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

    const opts = { method, headers: {} };

    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

    

    const res = await fetch(`${baseUrl}/api${path}`, opts);

    if (!res.ok) {

        const err = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));

        throw new Error(err.detail || `HTTP ${res.status}`);

    }

    return res.json().catch(() => ({}));

}





// - Load All Data -

async function loadAll() {

    try {

        const [fmts, nums, sais, cores, modelos, vibeProdutos] = await Promise.all([
            api('GET', '/formatos'),
            api('GET', '/numeracoes'),
            api('GET', '/saidas'),
            api('GET', '/cores').catch(() => []),
            api('GET', '/modelos_imposicao').catch(() => []),
            (typeof vibeClient !== 'undefined' && vibeClient ? vibeClient.from('produtos').select('*') : Promise.resolve({data:[]}))
                .then(r => {
                    if (r && r.error) {
                        console.error('[loadAll] Erro ao buscar produtos:', r.error);
                    }
                    console.log('[loadAll] vibeProdutos carregados:', r ? (r.data ? r.data.length : 0) : 0);
                    return r ? r.data : [];
                })
                .catch(err => {
                    console.error('[loadAll] Exception ao buscar produtos:', err);
                    return [];
                })
        ]);

        state.formatos = fmts;

        state.numeracoes = nums;

        state.saidas = sais;

        state.cores = cores || [];
        try {
            const localRefMap = JSON.parse(localStorage.getItem('ideal_cores_referencia_map') || '{}');
            state.cores.forEach(c => {
                if (localRefMap[c.id]) {
                    c.cor_referencia = localRefMap[c.id];
                }
            });
        } catch(e) {}

        state.modelosImposicao = modelos || [];
        state.produtosGlobais = vibeProdutos || [];

        renderAll();
        if (typeof renderPedOSQueue === 'function') {
            console.log('[loadAll] Re-renderizando fila de pedidos após carregar produtos...');
            renderPedOSQueue();
        }

    } catch (e) {

        toast('Erro ao carregar dados: ' + e.message, 'error');

    }

}



function renderAll() {

    renderFormatos();

    renderNumeracoes();

    renderSaidas();

    renderCores();

    renderModelosImposicao();

    updateBadges();

    populateSelects();

}



function updateBadges() {

    document.getElementById('badge-formatos').textContent = state.formatos.length;

    document.getElementById('badge-numeracao').textContent = state.numeracoes.length;

    document.getElementById('badge-saidas').textContent = state.saidas.length;

    const badgeCores = document.getElementById('badge-cores');

    if (badgeCores) badgeCores.textContent = state.cores.length;

}



// - FORMATOS -

function renderFormatos() {

    const tbody = document.getElementById('tbody-formatos');

    const empty = document.getElementById('empty-formatos');

    if (!state.formatos.length) {

        tbody.innerHTML = '';

        empty.style.display = 'block';

        return;

    }

    empty.style.display = 'none';

    tbody.innerHTML = state.formatos.map(f => `

        <tr>

            <td>${f.name}</td>

            <td>${f.width_mm} × ${f.height_mm} mm</td>

            <td><span class="badge badge-blue">${f.cols} × ${f.rows}</span></td>

            <td>${f.gap_h_mm} × ${f.gap_v_mm} mm</td>

            <td class="actions-cell">

                <button class="btn btn-secondary btn-sm" onclick="duplicateFmt('${f.id}')" title="Duplicar Formato">⧉</button>

                <button class="btn btn-sm btn-ghost" onclick="editFmt('${f.id}')">✏️ Editar</button>

                <button class="btn btn-danger btn-sm" onclick="deleteFmt('${f.id}')">🗑️</button>

            </td>

        </tr>

    `).join('');

}



async function saveFmt() {

    const id = document.getElementById('fmt-id').value;



    // Validar campos de offset (aceita vírgula como separador decimal)

    const offhEl = document.getElementById('fmt-offh');

    const offvEl = document.getElementById('fmt-offv');

    const offH = validateOffsetField(offhEl);

    const offV = validateOffsetField(offvEl);

    if (offH === null || offV === null) return toast('Valor de offset inválido. Use números decimais (ex: 10,2).', 'error');



    const data = {

        name: document.getElementById('fmt-name').value.trim(),

        width_mm: parseFloat(document.getElementById('fmt-w').value),

        height_mm: parseFloat(document.getElementById('fmt-h').value),

        cols: parseInt(document.getElementById('fmt-cols').value),

        rows: parseInt(document.getElementById('fmt-rows').value),

        gap_h_mm: parseFloat(document.getElementById('fmt-gaph').value),

        gap_v_mm: parseFloat(document.getElementById('fmt-gapv').value),

        offset_h_mm: offH,

        offset_v_mm: offV,

        rotations: (() => {
            const r = { ...(state.fmtRotations || {}) };
            r.page_rotate = parseInt(document.getElementById('fmt-def-rotate').value) || 0;
            return r;
        })(),

        default_schema: document.getElementById('fmt-def-schema').value,

        default_saida_id: document.getElementById('fmt-def-saida').value || null,

        default_cut_stack_mode: document.getElementById('fmt-def-cut-stack-mode').value,

        default_sheets_per_block: parseInt(document.getElementById('fmt-def-sheets').value) || 50,

        default_block_depth: parseInt(document.getElementById('fmt-def-depth').value) || 1,

        default_rotate_page: (parseInt(document.getElementById('fmt-def-rotate').value) || 0) > 0,

        has_cover: document.getElementById('fmt-has-cover').checked,

        cover_scale: parseFloat(document.getElementById('fmt-cover-scale').value) || 80.0,

        cover_offset_x: parseFloat(document.getElementById('fmt-cover-offx').value) || 0,

        cover_offset_y: parseFloat(document.getElementById('fmt-cover-offy').value) || 0,

        cover_font_size: parseInt(document.getElementById('fmt-cover-font-size').value) || 12,

        cover_font_color: document.getElementById('fmt-cover-font-color').value || '#000000',

        cover_font_x: parseFloat(document.getElementById('fmt-cover-font-x').value) || 10.0,

        cover_font_y: parseFloat(document.getElementById('fmt-cover-font-y').value) || 10.0,

    };

    if (!data.name) return toast('Informe um nome para o formato.', 'error');

    try {

        if (id) {

            await api('PUT', `/formatos/${id}`, data);

            toast('Formato atualizado!', 'success');

        } else {

            await api('POST', '/formatos', data);

            toast('Formato salvo!', 'success');

        }

        cancelFmtEdit();

        await loadAll();

        // Redirecionar para Lista Formatos

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

        document.getElementById('nav-lista-formatos').classList.add('active');

        document.getElementById('view-lista-formatos').classList.add('active');

    } catch (e) { toast(e.message, 'error'); }

}



function editFmt(id) {

    const f = state.formatos.find(x => x.id === id);

    if (!f) return;



    // Ativar view de formatos para edição

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    document.getElementById('nav-formatos').classList.add('active');

    document.getElementById('view-formatos').classList.add('active');



    document.getElementById('fmt-id').value = f.id;

    document.getElementById('fmt-name').value = f.name;

    document.getElementById('fmt-w').value = f.width_mm;

    document.getElementById('fmt-h').value = f.height_mm;

    document.getElementById('fmt-cols').value = f.cols;

    document.getElementById('fmt-rows').value = f.rows;

    document.getElementById('fmt-gaph').value = f.gap_h_mm;

    document.getElementById('fmt-gapv').value = f.gap_v_mm;

    document.getElementById('fmt-offh').value = (f.offset_h_mm || 0).toString().replace('.', ',');

    document.getElementById('fmt-offv').value = (f.offset_v_mm || 0).toString().replace('.', ',');

    document.getElementById('fmt-def-schema').value = f.default_schema || 'sequential';
    
    document.getElementById('fmt-def-saida').value = f.default_saida_id || '';
    
    document.getElementById('fmt-def-cut-stack-mode').value = f.default_cut_stack_mode || 'independent';
    
    document.getElementById('fmt-def-sheets').value = f.default_sheets_per_block || 50;
    
    document.getElementById('fmt-def-depth').value = f.default_block_depth || 1;
    
    (() => {
        const fRot = f.rotations || {};
        let rotVal = 0;
        if (fRot.page_rotate !== undefined) {
            rotVal = parseInt(fRot.page_rotate) || 0;
        } else {
            rotVal = f.default_rotate_page ? 90 : 0;
        }
        document.getElementById('fmt-def-rotate').value = String(rotVal);
    })();

    document.getElementById('fmt-has-cover').checked = !!f.has_cover;
    document.getElementById('fmt-cover-scale').value = f.cover_scale !== undefined ? f.cover_scale : 80;
    document.getElementById('fmt-cover-offx').value = f.cover_offset_x || 0;
    document.getElementById('fmt-cover-offy').value = f.cover_offset_y || 0;
    document.getElementById('fmt-cover-font-size').value = f.cover_font_size || 12;
    document.getElementById('fmt-cover-font-color').value = f.cover_font_color || '#000000';
    document.getElementById('fmt-cover-font-x').value = f.cover_font_x !== undefined ? f.cover_font_x : 10;
    document.getElementById('fmt-cover-font-y').value = f.cover_font_y !== undefined ? f.cover_font_y : 10;

    const cutStackOpts = document.getElementById('fmt-def-cut-stack-options');
    if (cutStackOpts) cutStackOpts.style.display = (f.default_schema === 'cut_stack') ? 'block' : 'none';
    
    const coverOpts = document.getElementById('fmt-cover-options');
    if (coverOpts) coverOpts.style.display = f.has_cover ? 'block' : 'none';

    state.fmtRotations = f.rotations || {};

    state.fmtSelectedCellIndex = null;

    updateRotationButtons();

    document.getElementById('fmt-form-title').textContent = 'Editar Formato';

    document.getElementById('btn-fmt-cancel').style.display = 'inline-flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    drawFormatPreview();

}



function cancelFmtEdit() {

    document.getElementById('fmt-id').value = '';

    document.getElementById('fmt-name').value = '';

    document.getElementById('fmt-w').value = '100';

    document.getElementById('fmt-h').value = '50';

    document.getElementById('fmt-cols').value = '2';

    document.getElementById('fmt-rows').value = '5';

    document.getElementById('fmt-gaph').value = '3';

    document.getElementById('fmt-gapv').value = '2';

    document.getElementById('fmt-offh').value = '0';

    document.getElementById('fmt-offv').value = '0';

    document.getElementById('fmt-def-schema').value = 'sequential';
    document.getElementById('fmt-def-saida').value = '';
    document.getElementById('fmt-def-cut-stack-mode').value = 'independent';
    document.getElementById('fmt-def-sheets').value = '50';
    document.getElementById('fmt-def-depth').value = '1';
    document.getElementById('fmt-def-rotate').value = '0';
    const cutStackOpts = document.getElementById('fmt-def-cut-stack-options');
    if (cutStackOpts) cutStackOpts.style.display = 'none';
    
    document.getElementById('fmt-has-cover').checked = false;
    document.getElementById('fmt-cover-scale').value = '80';
    document.getElementById('fmt-cover-offx').value = '0';
    document.getElementById('fmt-cover-offy').value = '0';
    document.getElementById('fmt-cover-font-size').value = '12';
    document.getElementById('fmt-cover-font-color').value = '#000000';
    document.getElementById('fmt-cover-font-x').value = '10';
    document.getElementById('fmt-cover-font-y').value = '10';
    const coverOpts = document.getElementById('fmt-cover-options');
    if (coverOpts) coverOpts.style.display = 'none';

    // Remover classes de validação

    document.getElementById('fmt-offh').classList.remove('invalid');

    document.getElementById('fmt-offv').classList.remove('invalid');

    document.getElementById('fmt-form-title').textContent = 'Novo Formato';

    document.getElementById('btn-fmt-cancel').style.display = 'none';

    

    // Limpar estados de rotação

    state.fmtRotations = {};

    state.fmtSelectedCellIndex = null;

    updateRotationButtons();



    drawFormatPreview();

}



window.cancelFmtEdit = cancelFmtEdit;

window.editFmt = editFmt;



async function duplicateFmt(id) {
    const f = state.formatos.find(x => x.id === id);
    if (!f) return;

    try {
        const clone = {
            name: f.name + ' (cópia)',
            width_mm: parseFloat(f.width_mm),
            height_mm: parseFloat(f.height_mm),
            cols: parseInt(f.cols),
            rows: parseInt(f.rows),
            gap_h_mm: parseFloat(f.gap_h_mm || 0),
            gap_v_mm: parseFloat(f.gap_v_mm || 0),
            offset_h_mm: parseFloat(f.offset_h_mm || 0),
            offset_v_mm: parseFloat(f.offset_v_mm || 0),
            rotations: f.rotations || {},
        };

        await api('POST', '/formatos', clone);
        toast('Formato duplicado!', 'success');
        await loadAll();
    } catch (e) {
        toast('Erro ao duplicar: ' + e.message, 'error');
    }
}

window.duplicateFmt = duplicateFmt;



async function deleteFmt(id) {

    if (!confirm('Excluir este formato?')) return;

    try {

        if (typeof supabaseClient !== 'undefined') {
            const { error } = await supabaseClient.from('producao_formatos').delete().eq('id', id);
            if (error) throw error;
        } else {
            await api('DELETE', `/formatos/${id}`);
        }

        toast('Formato excluído.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteFmt = deleteFmt;



// - SAÍDAS -

function renderSaidas() {

    const tbody = document.getElementById('tbody-saidas');

    const empty = document.getElementById('empty-saidas');

    if (!state.saidas.length) {

        tbody.innerHTML = '';

        empty.style.display = 'block';

        return;

    }

    empty.style.display = 'none';

    tbody.innerHTML = state.saidas.map(s => `

        <tr>

            <td>${s.name}</td>

            <td>${s.width_mm} × ${s.height_mm} mm</td>

            <td><span class="badge badge-teal">${(s.file_format || 'pdf').toUpperCase()}</span></td>

            <td class="actions-cell">

                <button class="btn btn-sm btn-ghost" onclick="editSai('${s.id}')">✏️ Editar</button>

                <button class="btn btn-danger btn-sm" onclick="deleteSai('${s.id}')">🗑️</button>

            </td>

        </tr>

    `).join('');

}



async function saveSaida() {

    const id = document.getElementById('sai-id').value;

    const data = {

        name: document.getElementById('sai-name').value.trim(),

        width_mm: parseFloat(document.getElementById('sai-w').value),

        height_mm: parseFloat(document.getElementById('sai-h').value),

        file_format: document.getElementById('sai-format').value,

    };

    if (!data.name) return toast('Informe um nome para a saída.', 'error');

    try {

        if (id) {

            await api('PUT', `/saidas/${id}`, data);

            toast('Saída atualizada!', 'success');

        } else {

            await api('POST', '/saidas', data);

            toast('Saída salva!', 'success');

        }

        cancelSaiEdit();

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}



window.saveSaida = saveSaida;

window.cancelSaiEdit = cancelSaiEdit;



function editSai(id) {

    const s = state.saidas.find(x => x.id === id);

    if (!s) return;

    document.getElementById('sai-id').value = s.id;

    document.getElementById('sai-name').value = s.name;

    document.getElementById('sai-w').value = s.width_mm;

    document.getElementById('sai-h').value = s.height_mm;

    document.getElementById('sai-format').value = s.file_format || 'pdf';

    document.getElementById('sai-form-title').textContent = 'Editar Saída';

    document.getElementById('btn-sai-cancel').style.display = 'inline-flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });

}

window.editSai = editSai;



function cancelSaiEdit() {

    document.getElementById('sai-id').value = '';

    document.getElementById('sai-name').value = '';

    document.getElementById('sai-w').value = '450';

    document.getElementById('sai-h').value = '320';

    document.getElementById('sai-format').value = 'pdf';

    document.getElementById('sai-form-title').textContent = 'Nova Saída';

    document.getElementById('btn-sai-cancel').style.display = 'none';

}



async function deleteSai(id) {

    if (!confirm('Excluir esta saída?')) return;

    try {

        if (typeof supabaseClient !== 'undefined') {
            const { error } = await supabaseClient.from('producao_saidas').delete().eq('id', id);
            if (error) throw error;
        } else {
            await api('DELETE', `/saidas/${id}`);
        }

        toast('Saída excluída.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteSai = deleteSai;



window.setPreset = (w, h) => {

    document.getElementById('sai-w').value = w;

    document.getElementById('sai-h').value = h;

};



// - CORES -

let corPdfBase64 = "";

let corPdfFilename = "";

let corPdfVersoBase64 = "";

let corPdfVersoFilename = "";



// Função para renderizar a primeira página do PDF de referência no Canvas

async function renderPdfPreview(pdfBase64) {

    const canvas = document.getElementById('cor-pdf-preview-canvas');

    const emptyEl = document.getElementById('cor-pdf-preview-empty');

    if (!canvas) return;



    if (!pdfBase64) {

        canvas.style.display = 'none';

        if (emptyEl) {

            emptyEl.style.display = 'block';

            emptyEl.innerHTML = `

                <div style="font-size: 3rem; margin-bottom: 12px; opacity: 0.7;">📄</div>

                <p style="font-size: 0.9rem; font-weight: 500;">Selecione uma cor para editar ou faça upload de um PDF para visualizar.</p>

            `;

        }

        return;

    }



    try {

        if (emptyEl) {

            emptyEl.style.display = 'block';

            emptyEl.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.88rem; font-weight:500;">Carregando PDF...</p>';

        }

        

        const base64Data = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;

        const binStr = atob(base64Data);

        const len = binStr.length;

        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {

            bytes[i] = binStr.charCodeAt(i);

        }



        const loadingTask = pdfjsLib.getDocument({ data: bytes });

        const pdf = await loadingTask.promise;

        const page = await pdf.getPage(1);

        

        // Renderizar com escala adequada baseada no container

        const viewport = page.getViewport({ scale: 1.0 });

        const containerW = canvas.parentElement.clientWidth - 30; // compensar paddings

        const scale = containerW / viewport.width;

        const scaledViewport = page.getViewport({ scale: Math.min(scale, 1.5) });

        

        const context = canvas.getContext('2d');

        canvas.width = scaledViewport.width;

        canvas.height = scaledViewport.height;

        

        const renderContext = {

            canvasContext: context,

            viewport: scaledViewport

        };

        await page.render(renderContext).promise;

        

        if (emptyEl) emptyEl.style.display = 'none';

        canvas.style.display = 'block';

    } catch (e) {

        console.error("Erro ao renderizar preview do PDF:", e);

        if (emptyEl) {

            emptyEl.style.display = 'block';

            emptyEl.innerHTML = '<div style="font-size: 2rem; color: var(--red); margin-bottom:10px;">✕</div><p style="font-size:0.88rem; font-weight:500;">Falha ao carregar visualização do PDF.</p>';

        }

        canvas.style.display = 'none';

    }

}

window.renderPdfPreview = renderPdfPreview;

async function renderPdfVersoPreview(pdfBase64) {
    const canvas = document.getElementById('cor-pdf-preview-verso-canvas');
    const emptyEl = document.getElementById('cor-pdf-preview-verso-empty');
    if (!canvas) return;

    if (!pdfBase64) {
        canvas.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = `
                <div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">📄</div>
                <p style="font-size: 0.85rem; font-weight: 500;">Faça upload de um PDF de Verso para visualizar.</p>
            `;
        }
        return;
    }

    try {
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.88rem; font-weight:500;">Carregando PDF...</p>';
        }
        
        const base64Data = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;
        const binStr = atob(base64Data);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 1.0 });
        const containerW = canvas.parentElement.clientWidth - 30; // compensar paddings
        const scale = containerW / viewport.width;
        const scaledViewport = page.getViewport({ scale: Math.min(scale, 1.5) });
        
        const context = canvas.getContext('2d');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        await page.render(renderContext).promise;
        
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = 'block';
    } catch (e) {
        console.error("Erro ao renderizar preview do PDF do verso:", e);
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = '<div style="font-size: 2rem; color: var(--red); margin-bottom:10px;">✕</div><p style="font-size:0.88rem; font-weight:500;">Falha ao carregar visualização do PDF.</p>';
        }
        canvas.style.display = 'none';
    }
}
window.renderPdfVersoPreview = renderPdfVersoPreview;

function toggleCorVersoFields() {
    const checkbox = document.getElementById('cor-frente-verso');
    const isChecked = checkbox ? checkbox.checked : false;
    
    // Mostra/oculta campos de upload do verso
    const versoGroup = document.getElementById('cor-pdf-verso-group');
    if (versoGroup) {
        versoGroup.style.display = isChecked ? 'block' : 'none';
    }
    
    // Ajusta a grid de preview
    const previewGrid = document.getElementById('cor-pdf-preview-container-grid');
    const frontLabel = document.getElementById('cor-pdf-front-label');
    const frontEmptyText = document.getElementById('cor-pdf-preview-front-empty-text');
    const backBlock = document.getElementById('cor-pdf-preview-back-block');
    
    if (isChecked) {
        if (previewGrid) previewGrid.style.gridTemplateColumns = '1fr 1fr';
        if (frontLabel) frontLabel.textContent = 'Arquivo PDF de Referência - FRENTE';
        if (frontEmptyText) frontEmptyText.textContent = 'Faça upload de um PDF de Frente para visualizar.';
        if (backBlock) {
            backBlock.style.display = 'flex';
            backBlock.style.flexDirection = 'column';
        }
        renderPdfVersoPreview(corPdfVersoBase64);
    } else {
        if (previewGrid) previewGrid.style.gridTemplateColumns = '1fr';
        if (frontLabel) frontLabel.textContent = 'Arquivo PDF de Referência';
        if (frontEmptyText) frontEmptyText.textContent = 'Faça upload de um PDF para visualizar.';
        if (backBlock) backBlock.style.display = 'none';
    }
}
window.toggleCorVersoFields = toggleCorVersoFields;

// Event Listener para ler o arquivo PDF do verso em Base64
document.getElementById('cor-pdf-verso-file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast('Selecione apenas arquivos PDF.', 'error');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
        corPdfVersoBase64 = evt.target.result;
        corPdfVersoFilename = file.name;
        document.getElementById('cor-pdf-verso-file-name').textContent = "📎 " + file.name;
        document.getElementById('btn-remove-cor-pdf-verso').style.display = 'inline-flex';
        renderPdfVersoPreview(corPdfVersoBase64);
    };
    reader.readAsDataURL(file);
});

function clearCorPdfVersoFile() {
    corPdfVersoBase64 = "";
    corPdfVersoFilename = "";
    const fileEl = document.getElementById('cor-pdf-verso-file');
    if (fileEl) fileEl.value = "";
    const labelEl = document.getElementById('cor-pdf-verso-file-name');
    if (labelEl) labelEl.textContent = "";
    const btnRemove = document.getElementById('btn-remove-cor-pdf-verso');
    if (btnRemove) btnRemove.style.display = 'none';
    renderPdfVersoPreview(null);
}
window.clearCorPdfVersoFile = clearCorPdfVersoFile;




// Event Listener para ler o arquivo PDF em Base64

document.getElementById('cor-pdf-file')?.addEventListener('change', function(e) {

    const file = e.target.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {

        toast('Selecione apenas arquivos PDF.', 'error');

        e.target.value = '';

        return;

    }

    const reader = new FileReader();

    reader.onload = function(evt) {

        corPdfBase64 = evt.target.result;

        corPdfFilename = file.name;

        document.getElementById('cor-pdf-file-name').textContent = "📎 " + file.name;

        document.getElementById('btn-remove-cor-pdf').style.display = 'inline-flex';

        renderPdfPreview(corPdfBase64); // Exibir preview do PDF recém-carregado

    };

    reader.readAsDataURL(file);

});



function clearCorPdfFile() {

    corPdfBase64 = "";

    corPdfFilename = "";

    const fileEl = document.getElementById('cor-pdf-file');

    if (fileEl) fileEl.value = "";

    const labelEl = document.getElementById('cor-pdf-file-name');

    if (labelEl) labelEl.textContent = "";

    const btnRemove = document.getElementById('btn-remove-cor-pdf');

    if (btnRemove) btnRemove.style.display = 'none';

    renderPdfPreview(null); // Limpar visualização

}

window.clearCorPdfFile = clearCorPdfFile;



function onCorFormatoSelect() {

    const fmtId = document.getElementById('cor-formato').value;

    if (!fmtId) return;

    const fmt = state.formatos.find(f => f.id === fmtId);

    if (fmt) {

        document.getElementById('cor-w').value = fmt.width_mm;

        document.getElementById('cor-h').value = fmt.height_mm;

    }

}

window.onCorFormatoSelect = onCorFormatoSelect;



function renderCores() {

    const container = document.getElementById('cores-grouped-container');

    const empty = document.getElementById('empty-cores');

    if (!container) return;

    

    if (!state.cores || !state.cores.length) {

        container.innerHTML = '';

        if (empty) empty.style.display = 'block';

        return;

    }

    if (empty) empty.style.display = 'none';



    // Agrupar cores por formato_id

    const grouped = {};

    state.cores.forEach(c => {

        if (!grouped[c.formato_id]) {

            grouped[c.formato_id] = [];

        }

        grouped[c.formato_id].push(c);

    });



    let html = '';

    

    // Obter todos os formatos que possuem cores

    Object.keys(grouped).forEach(formatoId => {

        const fmt = state.formatos.find(f => f.id === formatoId);

        const fmtName = fmt ? fmt.name : 'Formato Excluído/Não Identificado';

        const coresDoFormato = grouped[formatoId];



        html += `

            <div class="card" style="margin-bottom: 24px;">

                <div class="card-header" style="background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);">

                    <span class="card-title">📐 ${fmtName}</span>

                    <span class="badge badge-teal">${coresDoFormato.length} ${coresDoFormato.length === 1 ? 'cor' : 'cores'}</span>

                </div>

                <table class="data-table">

                    <thead>
                        <tr>
                            <th>Nome da Cor</th>
                            <th>Tamanho</th>
                            <th>Referência de Cor</th>
                            <th>Arquivo PDF</th>
                            <th style="text-align: right; width: 120px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${coresDoFormato.map(c => {
                            let pdfLinkFront = c.pdf_base64 
                                ? `<a href="${c.pdf_base64}" download="${c.pdf_filename || 'referencia_frente.pdf'}" class="badge badge-teal" style="text-decoration:none;" onclick="event.stopPropagation();">📥 Frente</a>`
                                : '<span style="color:var(--text-faint)">Sem arquivo (Frente)</span>';
                            
                            let pdfLinkBack = '';
                            if (c.frente_verso) {
                                pdfLinkBack = c.pdf_verso_base64
                                    ? ` <a href="${c.pdf_verso_base64}" download="${c.name_verso || 'referencia_verso.pdf'}" class="badge badge-amber" style="text-decoration:none;" onclick="event.stopPropagation();">📥 Verso</a>`
                                    : ' <span style="color:var(--text-faint)">(Verso pendente)</span>';
                            }
                            
                            const pdfLinks = pdfLinkFront + pdfLinkBack;
                            const refCorHex = c.cor_referencia || c.hex || '';
                            const refCorBadge = refCorHex
                                ? `<div style="display:inline-flex; align-items:center; gap:6px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.15);">
                                    <span style="display:inline-block; width:16px; height:16px; border-radius:3px; background:${refCorHex}; border:1px solid #ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.5);"></span>
                                    <span style="font-family:monospace; font-weight:600; font-size:0.85rem; color:#ffffff;">${refCorHex}</span>
                                   </div>`
                                : '<span style="color:var(--text-faint)">— Sem Cor —</span>';
                            
                            return `
                                <tr style="cursor: pointer;" onclick="editCor('${c.id}')" title="Clique para editar/visualizar esta cor">
                                    <td><strong>${c.name}</strong></td>
                                    <td>${c.width_mm} × ${c.height_mm} mm</td>
                                    <td>${refCorBadge}</td>
                                    <td>${pdfLinks}</td>

                                    <td class="actions-cell" style="text-align: right;" onclick="event.stopPropagation();">
                                        <button class="btn btn-secondary btn-sm" onclick="duplicateCor('${c.id}')" title="Duplicar Cor">⧉</button>
                                        <button class="btn btn-sm btn-ghost" onclick="editCor('${c.id}')">✏️ Editar</button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteCor('${c.id}')">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>

                </table>

            </div>

        `;

    });



    container.innerHTML = html;

}

window.renderCores = renderCores;

async function pipetaCorReferencia() {
    if (!('EyeDropper' in window)) {
        const picker = document.getElementById('cor-hex-picker');
        if (picker) picker.click();
        if (typeof toast === 'function') toast('Navegador sem suporte à pipeta nativa. Seletor de cor aberto.', 'info');
        return;
    }
    try {
        const eyeDropper = new EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
            const hex = result.sRGBHex.toUpperCase();
            const inputRef = document.getElementById('cor-referencia');
            const inputPicker = document.getElementById('cor-hex-picker');
            if (inputRef) inputRef.value = hex;
            if (inputPicker) inputPicker.value = hex;
            if (typeof toast === 'function') toast(`Cor capturada com sucesso: ${hex}`, 'success');
        }
    } catch (err) {
        console.log('[Pipeta] Captura de cor cancelada ou encerrada pelo usuário');
    }
}
window.pipetaCorReferencia = pipetaCorReferencia;

function onCorHexPickerInput(val) {
    const refInput = document.getElementById('cor-referencia');
    if (refInput) refInput.value = (val || '').toUpperCase();
}
window.onCorHexPickerInput = onCorHexPickerInput;

function onCorReferenciaInput(val) {
    const pickerInput = document.getElementById('cor-hex-picker');
    if (pickerInput && /^#[0-9A-F]{6}$/i.test((val || '').trim())) {
        pickerInput.value = val.trim();
    }
}
window.onCorReferenciaInput = onCorReferenciaInput;

function saveLocalCorReferencia(id, val) {
    if (!id) return;
    try {
        const map = JSON.parse(localStorage.getItem('ideal_cores_referencia_map') || '{}');
        if (val) {
            map[id] = val;
        } else {
            delete map[id];
        }
        localStorage.setItem('ideal_cores_referencia_map', JSON.stringify(map));
    } catch(e){}
}

async function duplicateCor(id) {
    const c = state.cores.find(x => x.id === id);
    if (!c) return;

    try {
        const clone = {
            name: c.name + ' (cópia)',
            formato_id: c.formato_id,
            width_mm: parseFloat(c.width_mm),
            height_mm: parseFloat(c.height_mm),
            cor_referencia: c.cor_referencia || c.hex || "",
            pdf_base64: c.pdf_base64 || null,
            pdf_filename: c.pdf_filename || "",
            frente_verso: c.frente_verso || false,
            name_verso: c.name_verso || "",
            pdf_verso_base64: c.pdf_verso_base64 || null
        };

        const res = await api('POST', '/cores', clone);
        if (res && res.id && clone.cor_referencia) {
            saveLocalCorReferencia(res.id, clone.cor_referencia);
        }
        toast('Cor duplicada!', 'success');
        await loadAll();
    } catch (e) {
        toast('Erro ao duplicar cor: ' + e.message, 'error');
    }
}

window.duplicateCor = duplicateCor;


async function saveCor() {

    const id = document.getElementById('cor-id').value;

    const name = document.getElementById('cor-name').value.trim();

    const formatoId = document.getElementById('cor-formato').value;

    const w = parseFloat(document.getElementById('cor-w').value);

    const h = parseFloat(document.getElementById('cor-h').value);

    const corReferencia = document.getElementById('cor-referencia')?.value.trim() || '';

    if (!name) return toast('Informe o nome da cor.', 'error');

    if (!formatoId) return toast('Selecione um formato base.', 'error');

    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return toast('Informe dimensões de tamanho válidas.', 'error');

    const frenteVerso = document.getElementById('cor-frente-verso')?.checked || false;
    if (frenteVerso && !corPdfVersoBase64) {
        return toast('Para cores frente e verso, faça o upload do PDF de referência do Verso.', 'error');
    }

    const data = {
        name,
        formato_id: formatoId,
        width_mm: w,
        height_mm: h,
        cor_referencia: corReferencia,
        pdf_base64: corPdfBase64 || null,
        pdf_filename: corPdfFilename || "",
        frente_verso: frenteVerso,
        name_verso: frenteVerso ? (corPdfVersoFilename || "") : "",
        pdf_verso_base64: frenteVerso ? (corPdfVersoBase64 || null) : null
    };

    try {

        if (id) {

            await api('PUT', `/cores/${id}`, data);
            saveLocalCorReferencia(id, corReferencia);
            toast('Cor atualizada!', 'success');

        } else {

            const res = await api('POST', '/cores', data);
            if (res && res.id) {
                saveLocalCorReferencia(res.id, corReferencia);
            }
            toast('Cor cadastrada!', 'success');

        }

        cancelCorEdit();

        await loadAll();

        // Redirecionar para a página Listar Cores após salvar

        const navListaCores = document.getElementById('nav-lista-cores');

        if (navListaCores) navListaCores.click();

    } catch (e) {

        toast(e.message, 'error');

    }

}

window.saveCor = saveCor;



function editCor(id) {

    const c = state.cores.find(x => x.id === id);

    if (!c) return;

    

    // Redirecionar para a página Cores (de cadastro) ao editar

    const navCores = document.getElementById('nav-cores');

    if (navCores) navCores.click();



    document.getElementById('cor-id').value = c.id;

    document.getElementById('cor-name').value = c.name;

    document.getElementById('cor-formato').value = c.formato_id;

    document.getElementById('cor-w').value = c.width_mm;

    document.getElementById('cor-h').value = c.height_mm;

    const refVal = c.cor_referencia || c.hex || '';
    const refInput = document.getElementById('cor-referencia');
    const pickerInput = document.getElementById('cor-hex-picker');
    if (refInput) refInput.value = refVal;
    if (pickerInput && /^#[0-9A-F]{6}$/i.test(refVal)) pickerInput.value = refVal;

    const chkFrenteVerso = document.getElementById('cor-frente-verso');
    if (chkFrenteVerso) chkFrenteVerso.checked = c.frente_verso || false;
    
    toggleCorVersoFields();

    if (c.pdf_base64) {
        corPdfBase64 = c.pdf_base64;
        corPdfFilename = c.pdf_filename || "referencia.pdf";
        document.getElementById('cor-pdf-file-name').textContent = "📎 " + corPdfFilename;
        document.getElementById('btn-remove-cor-pdf').style.display = 'inline-flex';
        renderPdfPreview(c.pdf_base64);
    } else {
        clearCorPdfFile();
    }

    if (c.frente_verso && c.pdf_verso_base64) {
        corPdfVersoBase64 = c.pdf_verso_base64;
        corPdfVersoFilename = c.name_verso || "referencia_verso.pdf";
        document.getElementById('cor-pdf-verso-file-name').textContent = "📎 " + corPdfVersoFilename;
        document.getElementById('btn-remove-cor-pdf-verso').style.display = 'inline-flex';
        renderPdfVersoPreview(c.pdf_verso_base64);
    } else {
        clearCorPdfVersoFile();
    }
    
    document.getElementById('cor-form-title').textContent = 'Editar Cor';
    document.getElementById('btn-cor-cancel').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });

}

window.editCor = editCor;



function cancelCorEdit() {
    document.getElementById('cor-id').value = '';
    document.getElementById('cor-name').value = '';
    document.getElementById('cor-formato').value = '';
    document.getElementById('cor-w').value = '';
    document.getElementById('cor-h').value = '';
    
    const refInput = document.getElementById('cor-referencia');
    const pickerInput = document.getElementById('cor-hex-picker');
    if (refInput) refInput.value = '';
    if (pickerInput) pickerInput.value = '#3b82f6';
    
    const chkFrenteVerso = document.getElementById('cor-frente-verso');
    if (chkFrenteVerso) chkFrenteVerso.checked = false;
    
    clearCorPdfFile();
    clearCorPdfVersoFile();
    toggleCorVersoFields();

    document.getElementById('cor-form-title').textContent = 'Nova Cor';
    document.getElementById('btn-cor-cancel').style.display = 'none';
    renderPdfPreview(null); // Resetar preview do PDF
    renderPdfVersoPreview(null); // Resetar preview do PDF do verso
}

window.cancelCorEdit = cancelCorEdit;



async function deleteCor(id) {

    if (!confirm('Excluir esta cor?')) return;

    try {

        if (typeof supabaseClient !== 'undefined') {
            const { error } = await supabaseClient.from('producao_cores').delete().eq('id', id);
            if (error) throw error;
        } else {
            await api('DELETE', `/cores/${id}`);
        }

        toast('Cor excluída.', 'success');

        await loadAll();

    } catch (e) {

        toast(e.message, 'error');

    }

}

window.deleteCor = deleteCor;



// - SELECTS (população) -

function populateSelects() {

    // Numeração -- select de formatos

    const selNumFmt = document.getElementById('num-formato');

    const curNumFmt = selNumFmt.value;

    selNumFmt.innerHTML = '<option value="">-- Selecione um Formato --</option>' +

        state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');

    if (curNumFmt) selNumFmt.value = curNumFmt;



    // Cores - select de formatos

    const selCorFmt = document.getElementById('cor-formato');

    if (selCorFmt) {

        const curCorFmt = selCorFmt.value;

        selCorFmt.innerHTML = '<option value="">-- Selecione --</option>' +

            state.formatos.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        if (curCorFmt) selCorFmt.value = curCorFmt;

    }



    // Catálogo - filtro de formato

    const selCatFmt = document.getElementById('catalogo-filter-format');

    if (selCatFmt) {

        const curCatFmt = selCatFmt.value;

        selCatFmt.innerHTML = '<option value="">Todos os Formatos</option>' +

            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');

        if (curCatFmt) selCatFmt.value = curCatFmt;

    }



    // Imposição -- formato e saída
    const selImpFmt = document.getElementById('imp-formato');
    const selPedFmt = document.getElementById('ped-formato');
    if (selPedFmt) {
        const cur = selPedFmt.value;
        selPedFmt.innerHTML = '<option value="">-- Selecione --</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
        if (cur) selPedFmt.value = cur;
    }
    if (selImpFmt) {
        const cur = selImpFmt.value;
        selImpFmt.innerHTML = '<option value="">-- Selecione --</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
        if (cur) selImpFmt.value = cur;
    }

    const selImpSaida = document.getElementById('imp-saida');
    const selPedSaida = document.getElementById('ped-saida');
    const selFmtDefSaida = document.getElementById('fmt-def-saida');
    if (selImpSaida) {
        const cur = selImpSaida.value;
        const optionsHtml = '<option value="">-- Selecione --</option>' +
            state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        selImpSaida.innerHTML = optionsHtml;
        if (cur) selImpSaida.value = cur;
    }
    if (selPedSaida) {
        const cur = selPedSaida.value;
        const optionsHtml = '<option value="">-- Selecione --</option>' +
            state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        selPedSaida.innerHTML = optionsHtml;
        if (cur) selPedSaida.value = cur;
    }
    if (selFmtDefSaida) {
        const curDef = selFmtDefSaida.value;
        selFmtDefSaida.innerHTML = '<option value="">-- Nenhuma (Livre) --</option>' +
            state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (curDef) selFmtDefSaida.value = curDef;
    }
    // Imposição -- numerações (filtradas por tamanho do formato selecionado)
    populateImpNumeracoes();



    // Modelos de Imposição Selector

    const selModelo = document.getElementById('imp-modelo-selector');

    if (selModelo) {

        const curMod = selModelo.value;

        selModelo.innerHTML = '<option value="">-- Carregar Modelo --</option>' +

            (state.modelosImposicao || []).map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        if (curMod) selModelo.value = curMod;

    }



    // Amostras

    const selAmCor = document.getElementById('amostra-cor');

    if (selAmCor) {

        const cur = selAmCor.value;

        selAmCor.innerHTML = '<option value="">-- Selecione uma Cor --</option>' +

            state.cores.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        if (cur) selAmCor.value = cur;

    }



    const selAmNum = document.getElementById('amostra-numeracao');

    if (selAmNum) {

        const cur = selAmNum.value;

        const selectedCorId = document.getElementById('amostra-cor')?.value;

        const selectedCor = state.cores.find(c => c.id === selectedCorId);

        const filteredNums = (selectedCor && selectedCor.formato_id)
            ? state.numeracoes.filter(n => {
                // formato_ids é o array de formatos compatíveis (novo campo)
                // fallback: se não existir, usa [formato_id] (dados antigos)
                const ids = n.formato_ids || [n.formato_id];
                return ids.some(id => String(id) === String(selectedCor.formato_id));
            })
            : [];


        selAmNum.innerHTML = '<option value="">-- Selecione uma Numeração --</option>' +

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        if (cur && filteredNums.some(n => n.id === cur)) selAmNum.value = cur;

        else selAmNum.value = '';

    }

}


// - Aplica os padrões do formato na tela de imposição -
function applyFormatoDefaults() {
    const fmtSel = document.getElementById('imp-formato');
    if (!fmtSel) return;
    
    const selectedFmtId = fmtSel.value;
    if (!selectedFmtId) return;
    
    const fmt = state.formatos.find(f => String(f.id) === String(selectedFmtId));
    if (!fmt) return;
    
    // Aplica a Regra de Paginação se houver
    if (fmt.default_schema) {
        const schemaSel = document.getElementById('imp-schema');
        if (schemaSel) {
            schemaSel.value = fmt.default_schema;
            schemaSel.dispatchEvent(new Event('change'));
        }
    }
    
    // Aplica a Saída se houver
    if (fmt.default_saida_id) {
        const saidaSel = document.getElementById('imp-saida');
        if (saidaSel) {
            // Verifica se a opção existe
            if (Array.from(saidaSel.options).some(opt => String(opt.value) === String(fmt.default_saida_id))) {
                saidaSel.value = fmt.default_saida_id;
            }
        }
    }
    
    // Cut & Stack mode
    if (fmt.default_cut_stack_mode) {
        const modeSel = document.getElementById('imp-cutstack-mode');
        if (modeSel) modeSel.value = fmt.default_cut_stack_mode;
    }
    
    // Sheets per block
    if (fmt.default_sheets_per_block) {
        const sheetsInp = document.getElementById('imp-sheets-per-block');
        if (sheetsInp) sheetsInp.value = fmt.default_sheets_per_block;
    }
    
    // Block depth
    if (fmt.default_block_depth) {
        const depthInp = document.getElementById('imp-block-depth');
        if (depthInp) depthInp.value = fmt.default_block_depth;
    }
    
    // Rotate
    const fRot = fmt.rotations || {};
    let rotVal = 0;
    if (fRot.page_rotate !== undefined) {
        rotVal = parseInt(fRot.page_rotate) || 0;
    } else {
        rotVal = fmt.default_rotate_page ? 90 : 0;
    }
    const rotateCb = document.getElementById('imp-rotate-page');
    if (rotateCb) {
        rotateCb.value = String(rotVal);
        state.rotatePage = rotVal;
    }
}

// - Popula Numeração 1 e 2 na Imposição, filtradas por TAMANHO do formato -
function populateImpNumeracoes() {
    const fmtSel = document.getElementById('imp-formato');
    if (!fmtSel) return;

    const selectedFmtId = fmtSel.value;

    // Filtra numerações cujo formato_ids inclui o formato selecionado
    let filteredNums;
    if (selectedFmtId) {
        filteredNums = state.numeracoes.filter(n => {
            // formato_ids é o array de formatos compatíveis (novo campo)
            // fallback: se não existir, usa [formato_id] (dados antigos)
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(selectedFmtId));
        });
    } else {
        filteredNums = [...state.numeracoes];
    }
    filteredNums.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

    // Popula Numeração 1 e Numeração 2
    ['imp-numeracao', 'imp-numeracao-2'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;

        sel.innerHTML = '<option value="">-- Sem numeração --</option>' +
            filteredNums.map(n => {
                const nFmt = state.formatos.find(f => String(f.id) === String(n.formato_id));
                const label = nFmt ? ` (${nFmt.name})` : '';
                return `<option value="${n.id}">${n.name}${label}</option>`;
            }).join('');

        // Restaurar seleção anterior se ainda existir na lista filtrada
        if (cur && filteredNums.some(n => String(n.id) === String(cur))) {
            sel.value = cur;
        } else {
            sel.value = '';
        }
    });
}



// - NUMERAÇÃO EDITOR -




function renderNumeracoes() {

    const container = document.getElementById('catalogo-container');

    const empty = document.getElementById('empty-catalogo');



    // Filtros

    const searchVal = (document.getElementById('catalogo-search')?.value || '').toLowerCase();

    const filterFmt = document.getElementById('catalogo-filter-format')?.value || '';

    const filterType = document.getElementById('catalogo-filter-type')?.value || '';

    const searchValClean = (document.getElementById('catalogo-search')?.value || '').trim().toLowerCase();
    const isSearchNum = /^\d+$/.test(searchValClean);

    const filtradas = state.numeracoes.filter(n => {
        // Se a busca for um número de cliente:
        if (isSearchNum) {
            // Mostra APENAS as numerações exclusivas desse cliente. Oculta todas as outras.
            return String(n.Cli_Num || '') === searchValClean;
        } else {
            // Se NÃO for busca por número de cliente (busca de texto ou vazia):
            // Oculta todas as numerações exclusivas de qualquer cliente.
            if (n.Cli_Num) {
                return false;
            }
        }

        if (filterFmt) {
            const ids = n.formato_ids || [n.formato_id];
            if (!ids.some(id => String(id) === String(filterFmt))) return false;
        }

        if (filterType) {
            const tipo = n.tipo || 'SEQUENCIAL';
            if (tipo !== filterType) return false;
        }

        if (searchValClean && !(n.name || '').toLowerCase().includes(searchValClean)) return false;

        return true;
    });

    filtradas.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));


    if (!filtradas.length) {

        container.innerHTML = '';

        empty.style.display = 'block';

        return;

    }

    empty.style.display = 'none';



    // Agrupar por formato

    const grouped = {};

    filtradas.forEach(n => {

        const fmtId = n.formato_id;

        if (!grouped[fmtId]) grouped[fmtId] = [];

        grouped[fmtId].push(n);

    });



    let html = '';

    for (const fmtId of Object.keys(grouped)) {

        const fmt = state.formatos.find(f => f.id === fmtId);

        const fmtName = fmt ? `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)` : 'Formato Excluído';



        html += `

        <div class="card" style="margin-bottom: 20px;">

            <div class="card-header" style="background: var(--bg-body); border-bottom: 1px solid var(--border);">

                <span class="card-title"><span class="icon">📐</span> ${fmtName}</span>

                <span class="badge badge-purple">${grouped[fmtId].length} numerações</span>

            </div>

            <table class="data-table">
                <thead>

                    <tr><th>Nome</th><th>Tipo</th><th>Elementos</th><th width="150" class="actions-cell">Ações</th></tr>

                </thead>

                <tbody>

        `;



        grouped[fmtId].forEach(n => {

            const typeBadges = [...new Set((n.elements || []).map(e => e.type))].map(t =>

                `<span class="badge badge-blue">${t}</span>`

            ).join(' ');

            const tipoBadge = `<span class="badge badge-gray">${n.tipo || 'SEQUENCIAL'}</span>`;

            html += `
                <tr>
                    <td><strong>${n.name}</strong></td>
                    <td>${tipoBadge}</td>
                    <td>${typeBadges || '--'} <small style="color:var(--text-faint)">(${(n.elements || []).length} itens)</small></td>

                    <td class="actions-cell">

                        <button class="btn btn-secondary btn-sm" onclick="duplicateCatalogNumeracao('${n.id}')" title="Duplicar Numeração Completa">⧉</button>

                        <button class="btn btn-sm btn-ghost" onclick="editNumeracao('${n.id}')">✏️ Editar</button>

                        <button class="btn btn-danger btn-sm" onclick="deleteNumeracao('${n.id}')">🗑️</button>

                    </td>

                </tr>`;

        });



        html += `

                </tbody>

            </table>

        </div>`;

    }



    container.innerHTML = html;

}



window.novaNumeracao = function () {

    cancelNumEdit();

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    document.getElementById('nav-numeracao').classList.add('active');

    document.getElementById('view-numeracao').classList.add('active');

};



function editNumeracao(id) {

    const n = state.numeracoes.find(x => String(x.id) === String(id));

    if (!n) {
        toast('Numeração não encontrada. Recarregue a página e tente novamente.', 'warning');
        return;
    }



    // Ativar view de numeração

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    document.getElementById('nav-numeracao').classList.add('active');

    document.getElementById('view-numeracao').classList.add('active');



    document.getElementById('num-id').value = n.id;

    document.getElementById('num-name').value = n.name;

    document.getElementById('num-formato').value = n.formato_id;

    document.getElementById('num-print-mode').value = n.print_mode || 'front';
    if (window.onNumPrintModeChange) window.onNumPrintModeChange();
    
    document.getElementById('num-tipo').value = n.tipo || 'SEQUENCIAL';
    document.getElementById('num-ticket-qtd').value = n.ticket_qtd || 1;
    document.getElementById('num-ticket-logica').value = n.ticket_logica || 'HORIZONTAL';
    if(window.onTipoSelect) window.onTipoSelect();

    document.getElementById('btn-num-cancel').style.display = 'inline-flex';

    // Restaurar checkboxes de formatos compatíveis
    // onFormatoSelect(false) renderiza os checkboxes com auto-marcação por tamanho;
    // depois sobrescrevemos com os formato_ids salvos.
    // (chamado mais abaixo via onFormatoSelect(false))

    // Carregar elementos e recalcular contador para evitar colisões de ID (Bug 3)


    state.numElements = (n.elements || []).map(e => ({ ...e }));

    const maxId = state.numElements.reduce((max, el) => {
        const num = parseInt((el.id || '').replace('el_', '')) || 0;
        return Math.max(max, num);
    }, 0);

    state.numElCounter = maxId;

    state.numHistory = [];
    state.numHistoryIndex = -1;
    saveNumHistory();



    state.numCsvFilename = n.csv_filename || "";

    state.numCsvHeaders = n.csv_headers || [];

    state.numCsvData = n.csv_data || null;



    if (state.numCsvHeaders && state.numCsvHeaders.length) {

        renderNumCsvInterface();

    } else {

        clearNumCsvFile();

    }



    state.numSvgFilename = n.svg_filename || "";

    state.numSvgContent = n.svg_content || "";

    if (state.numSvgContent) {

        const img = new Image();

        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(state.numSvgContent);

        img.onload = () => {

            state.numSvgImage = img;

            drawCanvas();

        };

        const btn = document.getElementById('btn-remove-num-svg');

        const name = document.getElementById('num-svg-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + state.numSvgFilename;

    } else {

        window.clearNumSvgFile();

    }



    state.numPdfFilename = n.pdf_filename || "";

    state.numPdfContent = n.pdf_content || "";

    // Fallback: se o pdf_content da numeração estiver vazio mas algum elemento PDF tiver conteúdo,
    // usar o pdf_content desse elemento como source (evita perder o PDF ao re-salvar sem recarregar)
    if (!state.numPdfContent) {
        const pdfEl = (state.numElements || []).find(el => el.type === 'PDF' && el.pdf_content);
        if (pdfEl) {
            state.numPdfContent = pdfEl.pdf_content;
            console.info('[edit] numPdfContent recuperado do elemento PDF:', state.numPdfContent.substring(0, 60));
        }
    }

    if (state.numPdfContent) {

        const btn = document.getElementById('btn-remove-num-pdf');

        const name = document.getElementById('num-pdf-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + state.numPdfFilename;



        if (typeof pdfjsLib !== 'undefined') {

            fetchPdfBytes(state.numPdfContent).then(async pdfData => {

                if (!pdfData) return;

                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                const page = await pdf.getPage(1);

                const vpRender = page.getViewport({ scale: 2 });

                const off = document.createElement('canvas');

                off.width = Math.round(vpRender.width);

                off.height = Math.round(vpRender.height);

                await page.render({ canvasContext: off.getContext('2d'), viewport: vpRender }).promise;

                

                const img = new Image();

                img.src = off.toDataURL('image/png');

                img.onload = () => {

                    state.numPdfImage = img;

                    drawCanvas();

                };

            }).catch(e => {

                console.error('Erro preview PDF carregado:', e);

            });

        }

    } else {

        if (window.clearNumPdfFile) window.clearNumPdfFile();

    }



    onFormatoSelect(false);

    // Restaurar checkboxes de formatos compatíveis a partir dos formato_ids salvos
    if (n.formato_ids && n.formato_ids.length) {
        const savedIds = new Set(n.formato_ids);
        document.querySelectorAll('#num-formatos-checks input[type="checkbox"]').forEach(cb => {
            if (cb.value === n.formato_id) {
                cb.checked = true; // formato base sempre marcado
            } else {
                cb.checked = savedIds.has(cb.value);
            }
        });
    }

    renderElementsList();


    drawCanvas();

    // Pré-carregar _pdfCanvas para cada elemento PDF presente na numeração
    // para garantir renderização correta (respeitando width_mm x height_mm do elemento)
    (async () => {
        for (const el of state.numElements) {
            if (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas && !el._pdfLoading) {
                el._pdfLoading = true;
                try {
                    const pdfData = await fetchPdfBytes(el.pdf_content);
                    if (pdfData && typeof pdfjsLib !== 'undefined') {
                        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                        const page = await pdf.getPage(1);
                        const vp = page.getViewport({ scale: 2 });
                        const offCanvas = document.createElement('canvas');
                        offCanvas.width = Math.round(vp.width);
                        offCanvas.height = Math.round(vp.height);
                        const octx = offCanvas.getContext('2d');
                        await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
                        el._pdfCanvas = offCanvas;

                        // Atualizar originalW/H se ainda não definidos
                        if (!state.numPdfOriginalW) {
                            const vpOrig = page.getViewport({ scale: 1 });
                            state.numPdfOriginalW = vpOrig.width * (25.4 / 72);
                            state.numPdfOriginalH = vpOrig.height * (25.4 / 72);
                        }
                    }
                } catch (err) {
                    console.warn('[Editor] Erro pré-carregando _pdfCanvas do elemento:', err);
                } finally {
                    delete el._pdfLoading;
                }
            }
        }
        drawCanvas();
    })();

}

window.editNumeracao = editNumeracao;



async function deleteNumeracao(id) {

    if (!confirm('Excluir esta numeração?')) return;

    try {

        if (typeof supabaseClient !== 'undefined') {
            const { error } = await supabaseClient.from('producao_numeracoes').delete().eq('id', id);
            if (error) throw error;
        } else {
            await api('DELETE', `/numeracoes/${id}`);
        }

        toast('Numeração excluída.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteNumeracao = deleteNumeracao;



window.duplicateCatalogNumeracao = async function (id) {
    const n = state.numeracoes.find(x => x.id === id);
    if (!n) return;

    try {
        const clone = {
            name: n.name + ' (cópia)',
            formato_id: n.formato_id,
            formato_ids: n.formato_ids || [n.formato_id],
            tipo: n.tipo || 'SEQUENCIAL',
            csv_filename: n.csv_filename || "",
            csv_headers: n.csv_headers || [],
            csv_data: n.csv_data || null,
            svg_content: n.svg_content || "",
            svg_filename: n.svg_filename || "",
            pdf_content: n.pdf_content || "",
            pdf_filename: n.pdf_filename || "",
            is_custom: n.is_custom ? true : false,
            os_item_id: n.os_item_id || null,
            elements: (n.elements || []).map(el => {
                const { _pdfCanvas, _pdfLoading, _svgImage, _pdfPreview, ...e } = el;
                return e;
            })
        };

        await api('POST', '/numeracoes', clone);
        toast('Numeração duplicada!', 'success');
        await loadAll();
    } catch (e) {
        toast('Erro ao duplicar: ' + e.message, 'error');
    }
};




function cancelNumEdit() {
    document.getElementById('num-id').value = '';

    document.getElementById('num-name').value = '';

    document.getElementById('num-formato').value = '';
    
    document.getElementById('num-tipo').value = 'SEQUENCIAL';
    document.getElementById('num-ticket-qtd').value = 1;
    document.getElementById('num-ticket-logica').value = 'HORIZONTAL';
    if(window.onTipoSelect) window.onTipoSelect();

    document.getElementById('btn-num-cancel').style.display = 'none';

    // Esconder checkboxes de formatos compatíveis
    const compatContainer = document.getElementById('num-formatos-compat');
    if (compatContainer) compatContainer.style.display = 'none';

    state.numElements = [];

    state.numFormato = null;

    state.bgImage = null;


    const btnRemove = document.getElementById('btn-remove-bg');

    const bgName = document.getElementById('bg-file-name');

    const bgFile = document.getElementById('canvas-bg-file');

    if (btnRemove) btnRemove.style.display = 'none';

    if (bgName) bgName.textContent = '';

    if (bgFile) bgFile.value = '';

    document.getElementById('numeracao-editor').style.display = 'none';

    clearNumCsvFile();

    window.clearNumSvgFile();

    if (window.clearNumPdfFile) window.clearNumPdfFile();

}

window.cancelNumEdit = cancelNumEdit;



window.onTipoSelect = function() {
    const tipo = document.getElementById('num-tipo').value;
    const ticketSettings = document.getElementById('num-ticket-settings');
    const teatroSettings = document.getElementById('num-teatro-elements-container');
    const camaroteSettings = document.getElementById('num-camarote-elements-container');
    
    if (tipo === 'TICKET') {
        ticketSettings.style.display = 'block';
    } else {
        ticketSettings.style.display = 'none';
    }

    if (tipo === 'TEATRO') {
        if(teatroSettings) teatroSettings.style.display = 'block';
    } else {
        if(teatroSettings) teatroSettings.style.display = 'none';
    }

    if (tipo === 'CAMAROTE') {
        if(camaroteSettings) camaroteSettings.style.display = 'block';
    } else {
        if(camaroteSettings) camaroteSettings.style.display = 'none';
    }
    
    // Re-render elements so any ticket_pos dropdowns are created/removed
    renderElementsList();
};

window.onTicketQtdChange = function() {
    renderElementsList();
};

// Quando o formato é selecionado, mostrar editor e checkboxes de formatos compatíveis

window.onFormatoSelect = function (clearElements = true) {

    const fmtId = document.getElementById('num-formato').value;
    const compatContainer = document.getElementById('num-formatos-compat');
    const checksDiv = document.getElementById('num-formatos-checks');

    if (!fmtId) {
        document.getElementById('numeracao-editor').style.display = 'none';
        if (compatContainer) compatContainer.style.display = 'none';
        return;
    }

    state.numFormato = state.formatos.find(f => f.id === fmtId);
    if (!state.numFormato) return;

    // - Renderizar checkboxes de formatos compatíveis -
    if (compatContainer && checksDiv) {
        const selectedFmt = state.numFormato;
        const selW = parseFloat(selectedFmt.width_mm);
        const selH = parseFloat(selectedFmt.height_mm);

        // Coletar formatos já marcados manualmente (para preservar ao trocar formato)
        const previouslyChecked = new Set();
        checksDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            previouslyChecked.add(cb.value);
        });

        checksDiv.innerHTML = state.formatos.map(f => {
            const fW = parseFloat(f.width_mm);
            const fH = parseFloat(f.height_mm);
            const sameSize = (fW === selW && fH === selH);
            // Auto-marcar: formato base + mesmo tamanho + previamente marcados
            const checked = (f.id === fmtId || sameSize || previouslyChecked.has(f.id)) ? 'checked' : '';
            const isBase = f.id === fmtId ? ' style="font-weight:700;color:var(--blue);"' : '';
            return `<label style="display:flex;align-items:center;gap:4px;font-size:0.82rem;cursor:pointer;padding:4px 0;"${isBase}>
                <input type="checkbox" value="${f.id}" ${checked} ${f.id === fmtId ? 'disabled' : ''}>
                ${f.name} <span style="color:var(--text-dim);font-size:0.75rem;">(${f.width_mm}×${f.height_mm}mm)</span>
            </label>`;
        }).join('');

        compatContainer.style.display = 'block';
    }

    if (clearElements !== false) {
        state.numElements = [];
        state.numHistory = [];
        state.numHistoryIndex = -1;
    }
    
    if (clearElements !== false || state.numHistory.length === 0) {
        saveNumHistory();
    }

    document.getElementById('numeracao-editor').style.display = 'grid';

    initCanvas();
    renderElementsList();
    drawCanvas();
};




window.onNumPrintModeChange = function() {
    const printMode = document.getElementById('num-print-mode')?.value || 'front';
    const containerVerso = document.getElementById('num-canvas-container-verso');
    const titleFrente = document.getElementById('num-canvas-title-frente');

    if (printMode === 'duplex') {
        if (containerVerso) containerVerso.style.display = 'flex';
        if (titleFrente) titleFrente.style.display = 'inline-block';
    } else {
        if (containerVerso) containerVerso.style.display = 'none';
        if (titleFrente) titleFrente.style.display = 'none';
    }

    initCanvas();
    drawCanvas();
};




// - CANVAS -

const CANVAS_MAX_W = 2000;

const CANVAS_MAX_H = 1400;





function initCanvas() {

    const fmt = state.numFormato;

    if (!fmt) return;



    // Calcular escala para caber no espaço

    const scaleX = CANVAS_MAX_W / fmt.width_mm;

    const scaleY = CANVAS_MAX_H / fmt.height_mm;

    state.canvasScale = Math.min(scaleX, scaleY, 17.0);



    const canvas = document.getElementById('numeracao-canvas');

    canvas.width = Math.round(fmt.width_mm * state.canvasScale);

    canvas.height = Math.round(fmt.height_mm * state.canvasScale);


    const canvasVerso = document.getElementById('numeracao-canvas-verso');
    if (canvasVerso) {
        canvasVerso.width = canvas.width;
        canvasVerso.height = canvas.height;
    }


    document.getElementById('canvas-dim-label').textContent = `${fmt.width_mm} × ${fmt.height_mm} mm`;

    document.getElementById('canvas-scale-label').textContent = `1mm = ${state.canvasScale.toFixed(1)}px`;



    // Mouse events

    canvas.onmousedown = onCanvasMouseDown;

    canvas.onmousemove = onCanvasMouseMove;

    canvas.onmouseup = onCanvasMouseUp;

    canvas.onmouseleave = onCanvasMouseUp;


    if (canvasVerso) {
        canvasVerso.onmousedown = onCanvasMouseDown;
        canvasVerso.onmousemove = onCanvasMouseMove;
        canvasVerso.onmouseup = onCanvasMouseUp;
        canvasVerso.onmouseleave = onCanvasMouseUp;
    }

}



function isNumeracaoDuplex(numObj) {
    if (!numObj) return false;
    if (numObj.print_mode === 'duplex') return true;
    if (Array.isArray(numObj.elements) && numObj.elements.some(el => el && el.face === 'back')) return true;
    const name = (numObj.name || numObj.tipo || '').toLowerCase();
    return name.includes('verso') || name.includes('duplex') || name.includes('frente e verso');
}
window.isNumeracaoDuplex = isNumeracaoDuplex;

function drawCanvasFace(canvas, face) {

    const ctx = canvas.getContext('2d');

    const S = state.canvasScale;

    const W = canvas.width;

    const H = canvas.height;



    // Fundo branco

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, W, H);



    // Determinar qual imagem de fundo usar dependendo da view ativa e face
    let refBg = null;
    if (face === 'back') {
        refBg = state.bgImageVerso || state.numPdfImageVerso;
    } else {
        refBg = state.bgImage;
        const viewNumeracao = document.getElementById('view-numeracao');
        if (!refBg && viewNumeracao && viewNumeracao.classList.contains('active')) {
            refBg = state.numPdfImage || state.numSvgImage;
        }
    }



    // Arte de fundo (camada de referência semitransparente em tamanho original e centralizada)

    if (refBg) {

        // Para garantir escala 100% (tamanho máximo no canvas) sem distorção, usamos o aspect ratio

        const imgW = refBg.originalPdfWidthPt || refBg.width;

        const imgH = refBg.originalPdfHeightPt || refBg.height;

        

        const imgAspect = imgW / imgH;

        const canvasAspect = W / H;



        let drawW, drawH;



        // Ajusta (contain) a imagem ao tamanho exato do formato/canvas sem distorcer

        if (imgAspect > canvasAspect) {

            drawW = W;

            drawH = W / imgAspect;

        } else {

            drawH = H;

            drawW = H * imgAspect;

        }



        const drawX = (W - drawW) / 2;

        const drawY = (H - drawH) / 2;



        ctx.globalAlpha = 0.55;

        ctx.drawImage(refBg, drawX, drawY, drawW, drawH);

        ctx.globalAlpha = 1.0;

    }



    // Grid de milímetros (cada 5mm)

    ctx.strokeStyle = '#e8eef8';

    ctx.lineWidth = 0.5;

    for (let x = 0; x <= state.numFormato.width_mm; x += 5) {

        ctx.beginPath();

        ctx.moveTo(x * S, 0);

        ctx.lineTo(x * S, H);

        ctx.stroke();

    }

    for (let y = 0; y <= state.numFormato.height_mm; y += 5) {

        ctx.beginPath();

        ctx.moveTo(0, y * S);

        ctx.lineTo(W, y * S);

        ctx.stroke();

    }



    // Grid forte a cada 10mm

    ctx.strokeStyle = '#d0d8ec';

    ctx.lineWidth = 0.8;

    for (let x = 0; x <= state.numFormato.width_mm; x += 10) {

        ctx.beginPath();

        ctx.moveTo(x * S, 0);

        ctx.lineTo(x * S, H);

        ctx.stroke();

    }

    for (let y = 0; y <= state.numFormato.height_mm; y += 10) {

        ctx.beginPath();

        ctx.moveTo(0, y * S);

        ctx.lineTo(W, y * S);

        ctx.stroke();

    }



    // Borda do formato

    ctx.strokeStyle = '#334155';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);




    // Garantia de segurança: se algum elemento ainda não tem _centerAnchor (legado),
    // a migração já deve ter sido feita por normalizarElementosCenterAnchor() no carregamento.
    // Aqui apenas marcamos para evitar qualquer problema residual sem alterar posições.
    state.numElements.forEach(el => {
        if (el.type !== 'PICOTE' && !el._centerAnchor) {
            // Elemento legado carregado sem migração prévia — aplicar uma vez
            const { w, h } = getElementSizeMM(el);
            el.x_mm += w / 2;
            el.y_mm += h / 2;
            el._centerAnchor = true;
        }
    });

    // Renderizar elementos (com clipping no formato para evitar overflow para fora dos limites)

    ctx.save();

    ctx.beginPath();

    ctx.rect(0, 0, W, H);

    ctx.clip();

    state.numElements.forEach(el => {
        const elFace = el.face || 'both';
        if (face === 'back') {
            if (el.type === 'PICOTE') {
                // Refletir coordenada X do picote no verso
                const reflectedEl = {
                    ...el,
                    x_mm: state.numFormato.width_mm - el.x_mm
                };
                drawElement(ctx, reflectedEl, S);
            } else if (elFace === 'back' || elFace === 'both') {
                drawElement(ctx, el, S);
            }
        } else {
            if (elFace === 'front' || elFace === 'both' || el.type === 'PICOTE') {
                drawElement(ctx, el, S);
            }
        }
    });

    ctx.restore();

}

function drawCanvas() {
    const canvasFront = document.getElementById('numeracao-canvas');
    if (!canvasFront || !state.numFormato) return;

    // Desenhar Frente
    drawCanvasFace(canvasFront, 'front');

    // Desenhar Verso (se modo duplex ativo)
    const canvasBack = document.getElementById('numeracao-canvas-verso');
    const printMode = document.getElementById('num-print-mode')?.value || 'front';
    if (printMode === 'duplex' && canvasBack) {
        drawCanvasFace(canvasBack, 'back');
    }
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
        var margin = 2;
        var totalCount = moduleCount + margin * 2;
        var cellSize = sz / totalCount;
        var hsz = sz / 2;

        // Fundo branco incluindo a Quiet Zone (margem)
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
        ctx.lineWidth = 2;
        ctx.strokeRect(x - hsz + 1, y - hsz + 1, sz - 2, sz - 2);
        // Escrever mensagem de erro visível
        ctx.fillStyle = '#ef4444';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('QR ERR', x, y);
    }
}

function drawElement(ctx, el, S) {

    const x = el.x_mm * S;

    const y = el.y_mm * S;

    const isSelected = isElSelected(el.id);

    const color = el.color || '#1e293b';

    const rot = (el.rotation || 0) * Math.PI / 180;



    ctx.save();
    try {
        ctx.translate(x, y);
        ctx.rotate(rot);



    const SAMPLE = el.type === 'FIXED' ? (el.fixed_value || 'TEXTO') :
        el.type === 'TEXT' ? String(el.ticket_pos || 1).padStart(el.pad || 6, '0') :
            el.type === 'QR' ? null :
                el.type === 'BARCODE' ? null : String(el.ticket_pos || 1).padStart(el.pad || 6, '0');



    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {

        const fs = (el.font_size || 12) * S / 2.8346;

        ctx.font = buildCanvasFont(fs, el.font_name);

        ctx.fillStyle = color;

        let label = '';

        if (el.type === 'FIXED') {
            label = el.fixed_value || 'TEXTO FIXO';
        } else if (el.type === 'TEATRO_FILA') {
            const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
            label = `${el.prefix || ''}${_fVal}`;
        } else if (el.type === 'TEATRO_LUGAR') {
            const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
            label = `${el.prefix || ''}${_lVal}`;
        } else if (el.type === 'TEATRO_COMBO') {
            const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
            const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
            const fila = `${el.prefix_fila || ''}${_fVal}`;
            const lugar = `${el.prefix_lugar || ''}${_lVal}`;
            label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
        } else if (el.type === 'CAMAROTE_LOCAL') {
            label = `${el.prefix || ''}7`;
        } else if (el.type === 'CAMAROTE_PESSOA') {
            label = `${el.prefix || ''}1`;
        } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
            label = `${el.prefix || ''}1/5`;
        } else if (el.source === 'database') {
            const colName = el.csv_column || '';
            const csvData = state.csvData || state.numCsvData || null;
            const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
            if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                label = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
            } else {
                label = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
            }
        } else {
            const padValue = typeof el.pad !== 'undefined' ? el.pad : 6;
            const dummyNum = String(el.ticket_pos || 1).padStart(padValue, '0');
            label = `${el.prefix || ''}${dummyNum}${el.suffix || ''}`;
        }

        // Desenhar texto centralizado no ponto de ancoragem (centro real do elemento).
        // Para linha simples: textBaseline='middle' centraliza automaticamente (correto).
        // Para multilinha: usar line_height = 1.2 × fs (igual ao engine.py) e
        // posicionar cada linha manualmente a partir do topo do bloco.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let mw = 0;
        if (label.includes('\n')) {
            const lines = label.split('\n');
            const lineHeight = fs * 1.2;  // igual ao engine: font_size * 1.2
            const totalH = lines.length * lineHeight;
            // topo do bloco centrado em y=0 (ancoragem central)
            const blockTop = -totalH / 2;
            lines.forEach((line, i) => {
                // centro visual da linha i: topo_da_linha + lineHeight/2
                const lineCenter = blockTop + i * lineHeight + lineHeight / 2;
                ctx.fillText(line, 0, lineCenter);
                const lw = ctx.measureText(line).width;
                if (lw > mw) mw = lw;
            });
        } else {
            ctx.fillText(label, 0, 0);
            mw = ctx.measureText(label).width;
        }

        // Indicador de seleção: underline sutil (sem box tracejado)
        if (isSelected) {
            const halfH = label.includes('\n') ? fs * 1.2 : fs / 2;
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-mw / 2, halfH + 3);
            ctx.lineTo(mw / 2, halfH + 3);
            ctx.stroke();
        }

        // Restaurar defaults do canvas
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';



    } else if (el.type === 'QR') {
        const sz = (el.size_mm || 15) * S;
        const hsz = sz / 2;
        let qrText = '';
        if (el.fixed) {
            qrText = el.fixed_value || '';
        } else if (el.source === 'database') {
            const colName = el.csv_column || '';
            const csvData = state.csvData || state.numCsvData || null;
            const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
            if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                qrText = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
            } else {
                qrText = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
            }
        } else {
            const padVal = typeof el.pad !== 'undefined' ? parseInt(el.pad) : 4;
            const raw = padVal > 0 ? String(1).padStart(padVal, '0') : '1';
            qrText = `${el.prefix || ''}${raw}${el.suffix || ''}`;
        }
        renderQRCodeOnCtx(ctx, qrText, 0, 0, sz, color);



        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-hsz - 2, -hsz - 2, sz + 4, sz + 4);

            ctx.setLineDash([]);

        }



    } else if (el.type === 'BARCODE') {

        const bw = (el.width_mm || 40) * S;

        const bh = (el.height_mm || 10) * S;
        const hbw = bw / 2, hbh = bh / 2; // half-sizes para ancoragem central

        // Desenhar barras (deterministico)

        ctx.fillStyle = color;

        const barW = bw / 40;

        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];

        for (let i = 0; i < pattern.length; i++) {

            if (pattern[i]) ctx.fillRect(-hbw + i * barW, -hbh, barW * 0.7, bh);

        }



        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-hbw - 2, -hbh - 2, bw + 4, bh + 4);

            ctx.setLineDash([]);

        }



        // Texto indicando o tipo de codigo de barras

        ctx.fillStyle = color;

        ctx.font = `${Math.max(6, bh * 0.35)}px Inter, sans-serif`;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), 0, hbh + 2);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

    } else if (el.type === 'PICOTE') {

        const fmt = state.numFormato;

        const h_px = fmt ? fmt.height_mm * S : 100 * S;

        ctx.strokeStyle = color;

        ctx.lineWidth = 5.0; // Aumentado para 5px

        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 7.0;

        }

        ctx.setLineDash([10, 5]);

        ctx.beginPath();

        // A linha é vertical e cruza o formato inteiro.

        // Como o contexto foi transladado para (x, y), a coordenada local Y vai de -y até (h_px - y)

        ctx.moveTo(0, -y);

        ctx.lineTo(0, h_px - y);

        ctx.stroke();

        ctx.setLineDash([]);

    } else if (el.type === 'SVG' || el.type === 'PDF') {

        const w = (el.width_mm || 20) * S;

        const h = (el.height_mm || 20) * S;
        const hw = w / 2, hh = h / 2; // half-sizes para ancoragem central

        // Aplicar clipping centrado no ponto de ancoragem
        ctx.save();
        ctx.beginPath();
        ctx.rect(-hw, -hh, w, h);
        ctx.clip();

        if (el.type === 'PDF') {

            // Preferir o canvas renderizado pelo PDF.js (mais fiel ao PDF real)
            const pdfCanvas = el._pdfCanvas || null;
            const imgObj = pdfCanvas || state.numPdfImage;

            if (imgObj) {
                ctx.drawImage(imgObj, -hw, -hh, w, h);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(-hw, -hh, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('PDF (Sem arquivo)', 0, 0);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }

        } else {

            // SVG
            const imgObj = state.numSvgImage;

            if (imgObj) {
                ctx.drawImage(imgObj, -hw, -hh, w, h);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(-hw, -hh, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('SVG (Sem arquivo)', 0, 0);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }

        }

        ctx.restore();

        // Borda do bounding box (desenhada fora do clip para ficar sempre visivel)
        ctx.strokeStyle = isSelected ? '#3b82f6' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (isSelected) {
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-hw - 2, -hh - 2, w + 4, h + 4);
            ctx.setLineDash([]);
        } else {
            ctx.strokeRect(-hw, -hh, w, h);
        }

    }



    // Indicador de posição quando selecionado

    if (isSelected) {

        ctx.fillStyle = '#3b82f6';

        ctx.beginPath();

        ctx.arc(0, 0, 4, 0, Math.PI * 2);

        ctx.fill();

    }



    } finally {
        ctx.restore();
    }

}



// - Canvas Mouse Events -

function getCanvasPos(canvas, e) {

    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;

    const scaleY = canvas.height / rect.height;

    return {

        x: ((e.clientX - rect.left) * scaleX) / state.canvasScale,

        y: ((e.clientY - rect.top) * scaleY) / state.canvasScale

    };

}



function hitTest(el, mx, my) {

    if (el.type === 'PICOTE') {

        // Para o Picote, a colisao ocorre na linha vertical (qualquer Y, mas X proximo de el.x_mm)

        return Math.abs(mx - el.x_mm) <= 2;

    }

    const { w, h } = getElementSizeMM(el);

    // Ancoragem central para todos os tipos: (x_mm, y_mm) e o centro do elemento
    const cx = el.x_mm, cy = el.y_mm;
    const hw = w / 2, hh = h / 2;
    const rot = -(el.rotation || 0) * Math.PI / 180; // rotacao inversa

    // Transformar ponto do mouse para espaco local do elemento
    const dx = mx - cx, dy = my - cy;
    const lx = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ly = dx * Math.sin(rot) + dy * Math.cos(rot);

    const margin = 3; // margem de tolerancia em mm
    return lx >= -hw - margin && lx <= hw + margin && ly >= -hh - margin && ly <= hh + margin;

}



function onCanvasMouseDown(e) {

    const canvas = e.currentTarget;

    const { x, y } = getCanvasPos(canvas, e);

    const face = canvas.id === 'numeracao-canvas-verso' ? 'back' : 'front';
    state.lastActiveFace = face;


    // Verificar hit em sentido inverso (último = mais ao topo)

    let hit = null;

    for (let i = state.numElements.length - 1; i >= 0; i--) {

        const el = state.numElements[i];
        
        // Picote no verso não é interativo/selecionável
        if (face === 'back' && el.type === 'PICOTE') continue;

        const elFace = el.face || 'both';
        const isVisibleOnFace = (face === 'back') ? (elFace === 'back' || elFace === 'both') : (elFace === 'front' || elFace === 'both');

        if (isVisibleOnFace && hitTest(el, x, y)) {

            hit = el;

            break;

        }

    }



    const multi = e.ctrlKey || e.shiftKey;



    if (hit) {
        // Se pertencer a um grupo, seleciona o grupo inteiro
        let idsToSelect = [hit.id];
        if (hit.group_id) {
            idsToSelect = state.numElements.filter(e => e.group_id === hit.group_id).map(e => e.id);
        }

        if (multi) {
            idsToSelect.forEach(id => selectElId(id, true, true));
        } else {
            // Se nenhum dos itens do grupo já está selecionado
            const isGroupAlreadySelected = idsToSelect.every(id => isElSelected(id)) && idsToSelect.length === state.selectedElIds.length;
            if (!isGroupAlreadySelected) {
                // Limpa selecao atual e adiciona todos
                state.selectedElIds = [];
                idsToSelect.forEach(id => selectElId(id, true, true));
            } else {
                // Já estão selecionados, apenas atualiza interação
                selectElId(hit.id, false, true);
            }
        }

        // Configurar o arraste para todos os elementos atualmente selecionados
        state.dragging = {
            targets: state.selectedElIds.map(id => {
                const el = state.numElements.find(item => item.id === id);
                return el ? {
                    elId: id,
                    startX: el.x_mm,
                    startY: el.y_mm
                } : null;
            }).filter(Boolean),
            downX: x,
            downY: y
        };

    } else {

        if (!multi) {

            state.selectedElIds = [];

            state.selectedElId = null;

            document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));

        }

    }

    drawCanvas();

}



function onCanvasMouseMove(e) {

    if (!state.dragging) return;

    const canvas = e.currentTarget;

    const { x, y } = getCanvasPos(canvas, e);

    const fmt = state.numFormato;



    const dx = x - state.dragging.downX;

    const dy = y - state.dragging.downY;



    state.dragging.targets.forEach(target => {

        const el = state.numElements.find(item => item.id === target.elId);

        if (!el) return;



        let newX = target.startX + dx;

        let newY = target.startY + dy;



        if (e.shiftKey) {

            const absDx = Math.abs(dx);

            const absDy = Math.abs(dy);

            if (absDx > absDy) {

                newY = target.startY; // Lock vertical

            } else {

                newX = target.startX; // Lock horizontal

            }

        }



        newX = Math.max(0, Math.min(fmt.width_mm - 1, newX));

        newY = Math.max(0, Math.min(fmt.height_mm - 1, newY));



        el.x_mm = newX;

        if (el.type === 'PICOTE') {

            el.y_mm = 0;

        } else {

            el.y_mm = newY;

        }



        // Sync com campos numéricos

        const card = document.getElementById(`elcard-${el.id}`);

        if (card) {

            const fx = card.querySelector('.el-x');

            const fy = card.querySelector('.el-y');

            if (fx) fx.value = el.x_mm.toFixed(1);

            if (fy && el.type !== 'PICOTE') fy.value = el.y_mm.toFixed(1);

        }

    });



    drawCanvas();

}



function onCanvasMouseUp() {
    if (state.dragging) {
        let moved = false;
        state.dragging.targets.forEach(t => {
            const el = state.numElements.find(e => e.id === t.elId);
            if (el && (el.x_mm !== t.startX || el.y_mm !== t.startY)) {
                moved = true;
            }
        });
        if (moved) {
            saveNumHistory();
        }
    }
    state.dragging = null;
}



// - Ferramentas de Alinhamento -

function isElSelected(id) {

    if (!state.selectedElIds) state.selectedElIds = [];

    return state.selectedElIds.includes(id);

}



function selectElId(id, multi = false, updateInteraction = false) {

    if (!state.selectedElIds) state.selectedElIds = [];

    if (multi) {

        const idx = state.selectedElIds.indexOf(id);

        if (idx > -1) {

            state.selectedElIds.splice(idx, 1);

        } else {

            state.selectedElIds.push(id);

        }

    } else {

        state.selectedElIds = [id];

    }

    // Sincronizar selectedElId com o último selecionado

    state.selectedElId = state.selectedElIds.length > 0 ? state.selectedElIds[state.selectedElIds.length - 1] : null;



    // Atualizar UI de seleção nos cards

    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));

    state.selectedElIds.forEach(selectedId => {

        const card = document.getElementById(`elcard-${selectedId}`);

        if (card) card.classList.add('selected');

    });



    // Rolar até o último selecionado

    if (state.selectedElId) {

        if (updateInteraction) {
            state.selectedElIds.forEach(selectedId => {
                const el = state.numElements.find(e => e.id === selectedId);
                if (el) el.last_interaction = Date.now();
            });
            renderElementsList();
        }

        const card = document.getElementById(`elcard-${state.selectedElId}`);

        if (card) {

            // Desativado scrollIntoView automático para evitar rolagem incômoda da página inteira

            // card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        }

    }

}



function getElementSizeMM(el) {

    if (el.type === 'PICOTE') {

        return { w: 0, h: state.numFormato ? state.numFormato.height_mm : 0 };

    }

    let w = 20, h = 8;

    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {

        const canvas = document.getElementById('numeracao-canvas');

        if (canvas) {

            const ctx = canvas.getContext('2d');

            ctx.save();

            const S = state.canvasScale;

            const fs = (el.font_size || 12) * S / 2.8346;

            ctx.font = buildCanvasFont(fs, el.font_name);

            

            let label = '';

            if (el.type === 'FIXED') {
                label = el.fixed_value || 'TEXTO FIXO';
            } else if (el.type === 'TEATRO_FILA') {
                const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                label = `${el.prefix || ''}${_fVal}`;
            } else if (el.type === 'TEATRO_LUGAR') {
                const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                label = `${el.prefix || ''}${_lVal}`;
            } else if (el.type === 'TEATRO_COMBO') {
                const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                const fila = `${el.prefix_fila || ''}${_fVal}`;
                const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                label = el.layout === '2lines' ? fila : `${fila} - ${lugar}`;
            } else if (el.type === 'CAMAROTE_LOCAL') {
                label = `${el.prefix || ''}7`;
            } else if (el.type === 'CAMAROTE_PESSOA') {
                label = `${el.prefix || ''}1`;
            } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                label = `${el.prefix || ''}1/5`;
            } else if (el.source === 'database') {
                label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;
            } else {
                label = `${el.prefix || ''}0001${el.suffix || ''}`;
            }

            const mw_px = ctx.measureText(label).width;

            ctx.restore();

            w = mw_px / S;

            h = el.font_size / 2.8346;
            
            // TEATRO_COMBO em 2lines: dobrar a altura
            if (el.type === 'TEATRO_COMBO' && el.layout === '2lines') {
                h *= 2.2;
            }

        } else {

            w = 30;

            h = (el.font_size || 12) / 2.8346;

        }

    }

    else if (el.type === 'QR') { w = el.size_mm || 15; h = w; }

    else if (el.type === 'BARCODE') { w = el.width_mm || 40; h = el.height_mm || 10; }

    else if (el.type === 'SVG') { w = el.width_mm || 20; h = el.height_mm || 20; }

    else if (el.type === 'PDF') { w = el.width_mm || 20; h = el.height_mm || 20; }

    return { w, h };

}



window.alignSelectedElement = function (alignment) {
    if (!state.selectedElIds || !state.selectedElIds.length || !state.numFormato) {
        toast('Selecione um ou mais elementos para alinhar', 'error');
        return;
    }
    const fmt = state.numFormato;
    let mutated = false;
    state.selectedElIds.forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (!el) return;
        mutated = true;



        const { w, h } = getElementSizeMM(el);

        // Todos os tipos usam ancoragem central (exceto PICOTE)
        if (alignment === 'left') {
            el.x_mm = w / 2;
        } else if (alignment === 'center-h') {
            el.x_mm = fmt.width_mm / 2;
        } else if (alignment === 'right') {
            el.x_mm = fmt.width_mm - w / 2;
        } else if (alignment === 'top') {
            if (el.type === 'PICOTE') return;
            el.y_mm = h / 2;
        } else if (alignment === 'center-v') {
            if (el.type === 'PICOTE') return;
            el.y_mm = fmt.height_mm / 2;
        } else if (alignment === 'bottom') {
            if (el.type === 'PICOTE') return;
            el.y_mm = fmt.height_mm - h / 2;
        }



        // Arredondar para 1 casa decimal

        el.x_mm = Math.round(el.x_mm * 10) / 10;

        el.y_mm = Math.round(el.y_mm * 10) / 10;



        // Sincronizar com os inputs do card correspondente

        const card = document.getElementById(`elcard-${el.id}`);

        if (card) {

            const fx = card.querySelector('.el-x');

            const fy = card.querySelector('.el-y');

            if (fx) fx.value = el.x_mm.toFixed(1);

            if (fy && el.type !== 'PICOTE') fy.value = el.y_mm.toFixed(1);

        }
    });

    if (mutated) saveNumHistory();

    drawCanvas();

};





// - Arte de Fundo no Canvas (Bug 5) -



window.clearBgImage = function () {

    state.bgImage = null;

    const btn = document.getElementById('btn-remove-bg');

    const name = document.getElementById('bg-file-name');

    const inp = document.getElementById('canvas-bg-file');

    if (btn) btn.style.display = 'none';

    if (name) name.textContent = '';

    if (inp) inp.value = '';

    drawCanvas();

};



async function loadBgImage(file) {

    if (!state.numFormato) return;

    const ext = file.name.split('.').pop().toLowerCase();

    try {

        const img = new Image();

        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');

            }

            pdfjsLib.GlobalWorkerOptions.workerSrc =

                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            const page = await pdf.getPage(1);

            

            // Renderizar em alta qualidade (escala 2) sem redimensionar ao tamanho do formato aqui

            const vp = page.getViewport({ scale: 2 });

            const off = document.createElement('canvas');

            const octx = off.getContext('2d');

            off.width = Math.round(vp.width);

            off.height = Math.round(vp.height);

            octx.fillStyle = '#ffffff';

            octx.fillRect(0, 0, off.width, off.height);

            await page.render({ canvasContext: octx, viewport: vp }).promise;

            img.src = off.toDataURL('image/png');

            

            // Guardar dimensões originais do PDF (em pontos / scale=1) para que drawCanvas possa escalar corretamente

            const vpOrig = page.getViewport({ scale: 1 });

            img.originalPdfWidthPt = vpOrig.width;

            img.originalPdfHeightPt = vpOrig.height;

        } else {

            img.src = URL.createObjectURL(file);

            // Obter o DPI da imagem a partir dos metadados e salvar na img

            const dpi = await getDpi(file);

            img.dpiValue = dpi;

        }

        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        state.bgImage = img;

        const btn = document.getElementById('btn-remove-bg');

        const name = document.getElementById('bg-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + file.name;

        drawCanvas();

        toast('Arte de fundo carregada!', 'success');

    } catch (e) {

        toast('Erro ao carregar fundo: ' + e.message, 'error');

    }

}



window.clearNumSvgFile = function () {

    state.numSvgContent = null;

    state.numSvgFilename = "";

    state.numSvgImage = null;

    state.numSvgOriginalW = null;

    state.numSvgOriginalH = null;

    const btn = document.getElementById('btn-remove-num-svg');

    const name = document.getElementById('num-svg-file-name');

    const inp = document.getElementById('num-svg-file');

    if (btn) btn.style.display = 'none';

    if (name) name.textContent = '';

    if (inp) inp.value = '';



    drawCanvas();

};



async function loadNumSvgFile(file) {

    try {

        const url = URL.createObjectURL(file);

        const img = new Image();

        img.src = url;

        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });



        state.numSvgImage = img;

        state.numSvgFilename = file.name;

        // SVG resolution in browsers defaults to 96 DPI. Convert pixels to mm.

        state.numSvgOriginalW = (img.width / 96) * 25.4;

        state.numSvgOriginalH = (img.height / 96) * 25.4;



        const reader = new FileReader();

        reader.onload = e => {

            state.numSvgContent = e.target.result;

            drawCanvas();

        };

        reader.readAsText(file);



        const btn = document.getElementById('btn-remove-num-svg');

        const name = document.getElementById('num-svg-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + file.name;



        toast('Arquivo SVG carregado com sucesso!', 'success');

    } catch (err) {

        toast('Erro ao processar SVG: ' + err.message, 'error');

    }

}



window.clearNumPdfFile = function () {

    state.numPdfContent = null;

    state.numPdfFilename = "";

    state.numPdfImage = null;

    state.numPdfOriginalW = null;

    state.numPdfOriginalH = null;

    const btn = document.getElementById('btn-remove-num-pdf');

    const name = document.getElementById('num-pdf-file-name');

    const inp = document.getElementById('num-pdf-file');

    if (btn) btn.style.display = 'none';

    if (name) name.textContent = '';

    if (inp) inp.value = '';

    drawCanvas();

};



async function loadNumPdfFile(file) {

    try {

        state.numPdfFilename = file.name;

        

        if (typeof pdfjsLib !== 'undefined') {

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            const page = await pdf.getPage(1);

            

            const vpRender = page.getViewport({ scale: 2 });

            const off = document.createElement('canvas');

            const octx = off.getContext('2d');

            off.width = Math.round(vpRender.width);

            off.height = Math.round(vpRender.height);

            // background: 'rgba(0,0,0,0)' garante que o PDF.js não preencha o canvas com branco

            await page.render({ canvasContext: octx, viewport: vpRender, background: 'rgba(0,0,0,0)' }).promise;

            

            const img = new Image();

            img.src = off.toDataURL('image/png');

            await new Promise(r => img.onload = r);

            state.numPdfImage = img;

            // Guardar o canvas renderizado para uso direto nos elementos PDF
            state.numPdfOffCanvas = off;

            // Atualizar o _pdfCanvas de qualquer elemento PDF já existente (ex: ao trocar arquivo)
            state.numElements.forEach(el => {
                if (el.type === 'PDF') el._pdfCanvas = off;
            });

            

            const vpOrig = page.getViewport({ scale: 1 });

            const ptToMm = 25.4 / 72;

            state.numPdfOriginalW = vpOrig.width * ptToMm;

            state.numPdfOriginalH = vpOrig.height * ptToMm;

        }



        const reader = new FileReader();

        reader.onload = e => {

            state.numPdfContent = e.target.result;

            drawCanvas();

        };

        reader.readAsDataURL(file);



        const btn = document.getElementById('btn-remove-num-pdf');

        const name = document.getElementById('num-pdf-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + file.name;



        toast('Arquivo PDF carregado com sucesso!', 'success');

    } catch (err) {

        toast('Erro ao processar PDF: ' + err.message, 'error');

    }

}



// Listeners dos inputs de arquivo (configurados uma única vez após DOM pronto)

document.addEventListener('DOMContentLoaded', () => {

    const bgInp = document.getElementById('canvas-bg-file');

    if (bgInp) bgInp.addEventListener('change', e => {

        if (e.target.files[0]) loadBgImage(e.target.files[0]);

    });



    const svgInp = document.getElementById('num-svg-file');

    if (svgInp) svgInp.addEventListener('change', e => {

        if (e.target.files[0]) loadNumSvgFile(e.target.files[0]);

    });



    const pdfInp = document.getElementById('num-pdf-file');

    if (pdfInp) pdfInp.addEventListener('change', e => {

        if (e.target.files[0]) loadNumPdfFile(e.target.files[0]);

    });

});



// Fallback: se DOMContentLoaded já passou, configura imediatamente

(function () {

    const bgInp = document.getElementById('canvas-bg-file');

    if (bgInp && !bgInp._listenerSet) {

        bgInp.addEventListener('change', e => {

            if (e.target.files[0]) loadBgImage(e.target.files[0]);

        });

        bgInp._listenerSet = true;

    }



    const svgInp = document.getElementById('num-svg-file');

    if (svgInp && !svgInp._listenerSet) {

        svgInp.addEventListener('change', e => {

            if (e.target.files[0]) loadNumSvgFile(e.target.files[0]);

        });

        svgInp._listenerSet = true;

    }



    const pdfInp = document.getElementById('num-pdf-file');

    if (pdfInp && !pdfInp._listenerSet) {

        pdfInp.addEventListener('change', e => {

            if (e.target.files[0]) loadNumPdfFile(e.target.files[0]);

        });

        pdfInp._listenerSet = true;

    }

})();



// - ELEMENTOS VDP -

window.addElement = function (type) {

    state.numElCounter++;

    const id = `el_${state.numElCounter}`;

    let startX = 5;
    let startY = 5;
    if (state.numFormato) {
        startX = state.numFormato.width_mm / 2;
        startY = state.numFormato.height_mm / 2;
    }

    const base = { 

        id, 

        type, 

        x_mm: type === 'PICOTE' ? 25 : startX, 

        y_mm: type === 'PICOTE' ? 0 : startY, 

        rotation: 0, 

        color: type === 'PICOTE' ? '#ef4444' : '#000000', 

        face: document.getElementById('num-print-mode')?.value === 'duplex' ? (state.lastActiveFace || 'front') : 'both', 

        _centerAnchor: type !== 'PICOTE',

        last_interaction: Date.now()

    };



    if (type === 'TEXT') Object.assign(base, { font_size: 12, font_name: 'helv', pad: 6, prefix: '', suffix: '' });

    if (type === 'FIXED') Object.assign(base, { font_size: 12, font_name: 'helv', fixed: true, fixed_value: 'Texto' });

    if (type === 'QR') Object.assign(base, { size_mm: 15, pad: 4, prefix: '', suffix: '' });

    if (type === 'BARCODE') Object.assign(base, { width_mm: 40, height_mm: 10, barcode_format: 'code128', pad: 4, prefix: '', suffix: '' });

    if (type === 'SVG') Object.assign(base, { width_mm: state.numSvgOriginalW || 20, height_mm: state.numSvgOriginalH || 20, svg_content: state.numSvgContent || '' });

    if (type === 'PDF') Object.assign(base, {
        width_mm: state.numPdfOriginalW || 20,
        height_mm: state.numPdfOriginalH || 20,
        pdf_content: state.numPdfContent || '',
        _pdfCanvas: state.numPdfOffCanvas || undefined
    });

    if (type === 'PICOTE') Object.assign(base, { name: 'Picote' });
    
    if (type === 'TEATRO_FILA') Object.assign(base, { font_size: 12, font_name: 'helv', prefix: 'Fileira: ' });
    if (type === 'TEATRO_LUGAR') Object.assign(base, { font_size: 12, font_name: 'helv', prefix: 'Poltrona: ' });
    if (type === 'TEATRO_COMBO') Object.assign(base, { font_size: 12, font_name: 'helv', prefix_fila: 'Fila: ', prefix_lugar: 'Lugar: ', layout: '1line' });

    if (type === 'CAMAROTE_LOCAL') Object.assign(base, { font_size: 12, font_name: 'helv', prefix: 'Mesa ' });
    if (type === 'CAMAROTE_PESSOA') Object.assign(base, { font_size: 12, font_name: 'helv', prefix: 'Cadeira ' });
    if (type === 'CAMAROTE_PESSOA_TOTAL') Object.assign(base, { font_size: 12, font_name: 'helv', prefix: 'Cadeira ' });



    state.numElements.push(base);
    saveNumHistory();

    renderElementsList();

    drawCanvas();

    selectElId(id, false);

};



function renderElementsList() {

    const container = document.getElementById('elements-list');

    let empty = document.getElementById('empty-elements');



    if (!empty) {

        empty = document.createElement('div');

        empty.className = 'empty-state';

        empty.id = 'empty-elements';

        empty.innerHTML = '<div class="empty-state-icon">🎯</div><p>Adicione elementos acima</p>';

    }



    if (!state.numElements.length) {

        container.innerHTML = '';

        container.appendChild(empty);

        empty.style.display = 'block';

        return;

    }



    const typeLabel = { TEXT: '🔤 Numeração', FIXED: '🔠 Texto Fixo', QR: '📱 QR Code', BARCODE: '▌▌ Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote', TEATRO_FILA: '🎭 Fila', TEATRO_LUGAR: '🎭 Lugar', TEATRO_COMBO: '🎭 Fila & Lugar', CAMAROTE_LOCAL: '🏛️ Local', CAMAROTE_PESSOA: '👤 Pessoas', CAMAROTE_PESSOA_TOTAL: '👥 Pessoas 1/Total' };

    const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger', PDF: 'badge-gray', TEATRO_FILA: 'badge-purple', TEATRO_LUGAR: 'badge-purple', TEATRO_COMBO: 'badge-purple', CAMAROTE_LOCAL: 'badge-amber', CAMAROTE_PESSOA: 'badge-amber', CAMAROTE_PESSOA_TOTAL: 'badge-amber' };



    const elementsToRender = [...state.numElements].sort((a, b) => {
        if (a.type === 'PICOTE' && b.type !== 'PICOTE') return 1;
        if (b.type === 'PICOTE' && a.type !== 'PICOTE') return -1;
        const timeA = a.last_interaction || 0;
        const timeB = b.last_interaction || 0;
        return timeB - timeA;
    });

    container.innerHTML = elementsToRender.map(el => {

        const isSelected = isElSelected(el.id);

        if (el.type === 'PICOTE') {

            return `

            <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">

                <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">

                    <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">

                        <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>

                        <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.95rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">

                    </span>

                    <div style="display:flex; gap:4px;">

                        <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 1rem;" onclick="duplicateEl('${el.id}');event.stopPropagation()" title="Duplicar">⧉</button>

                        <button class="btn btn-danger btn-sm" style="padding: 2px 8px;" onclick="removeEl('${el.id}');event.stopPropagation()" title="Excluir">✕</button>

                    </div>

                </div>

                <div class="element-card-fields" style="grid-template-columns: 1fr 1fr;">

                    <div class="form-group"><label>X (mm)</label><input class="form-control el-x" type="number" value="${el.x_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','x_mm',+this.value)"></div>

                    <div class="form-group"><label>Cor</label><input class="form-control" type="color" value="${el.color || '#ef4444'}" onchange="updateEl('${el.id}','color',this.value)"></div>

                    <div class="form-group"><label>Face</label>

                        <select class="form-control" onchange="updateEl('${el.id}','face',this.value)">

                            <option value="both" ${el.face === 'both' || !el.face ? 'selected' : ''}>Frente e Verso</option>

                            <option value="front" ${el.face === 'front' ? 'selected' : ''}>Apenas Frente</option>

                            <option value="back" ${el.face === 'back' ? 'selected' : ''}>Apenas Verso</option>

                        </select>

                    </div>

                </div>

            </div>`;

        }



        let extraFields = '';



        if (el.type === 'TEXT') {

            extraFields = `

                <div class="form-group el-full"><label>Fonte</label>
                    ${fontPickerHTML(el.id, el.font_name)}
                </div>

                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control el-font" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>

                <div class="form-group">

                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${el.pad} dígitos = ${el.pad > 0 ? '0'.repeat(el.pad - 1) + '1' : '1'})</span></label>

                    <input class="form-control" type="number" value="${el.pad}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">

                </div>

                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>

                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;

        } else if (el.type === 'FIXED') {

            extraFields = `

                <div class="form-group el-full"><label>Texto Fixo</label><input class="form-control" type="text" value="${el.fixed_value || ''}" onchange="updateEl('${el.id}','fixed_value',this.value)"></div>

                <div class="form-group el-full"><label>Fonte</label>
                    ${fontPickerHTML(el.id, el.font_name)}
                </div>

                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>`;

        } else if (el.type === 'QR') {

            extraFields = `

                <div class="form-group el-full"><label>Tamanho (mm)</label><input class="form-control" type="number" value="${el.size_mm}" min="5" max="100" step="0.5" onchange="updateEl('${el.id}','size_mm',+this.value)"></div>

                <div class="form-group">

                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${(el.pad || 0)} dígitos = ${(el.pad || 0) > 0 ? '0'.repeat((el.pad || 0) - 1) + '1' : '1'})</span></label>

                    <input class="form-control" type="number" value="${el.pad || 0}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">

                </div>

                <div class="form-group"><label>Prefixo URL</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>

                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;

        } else if (el.type === 'BARCODE') {

            extraFields = `

                <div class="form-group"><label>Tipo de Código</label>

                    <select class="form-control" onchange="updateEl('${el.id}','barcode_format',this.value)">

                        <option value="code128" ${el.barcode_format === 'code128' ? 'selected' : ''}>Code 128</option>

                        <option value="ean13" ${el.barcode_format === 'ean13' ? 'selected' : ''}>EAN-13</option>

                        <option value="ean8" ${el.barcode_format === 'ean8' ? 'selected' : ''}>EAN-8</option>

                        <option value="upca" ${el.barcode_format === 'upca' ? 'selected' : ''}>UPC-A</option>

                        <option value="code39" ${el.barcode_format === 'code39' ? 'selected' : ''}>Code 39</option>

                        <option value="itf" ${el.barcode_format === 'itf' ? 'selected' : ''}>Interleaved 2 of 5 (ITF)</option>

                        <option value="codabar" ${el.barcode_format === 'codabar' ? 'selected' : ''}>Codabar</option>

                    </select>

                </div>

                <div class="form-group"><label>Largura (mm)</label><input class="form-control" type="number" value="${el.width_mm}" min="10" max="200" step="0.5" onchange="updateEl('${el.id}','width_mm',+this.value)"></div>

                <div class="form-group"><label>Altura (mm)</label><input class="form-control" type="number" value="${el.height_mm}" min="4" max="50" step="0.5" onchange="updateEl('${el.id}','height_mm',+this.value)"></div>

                <div class="form-group">

                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${(el.pad || 0)} dígitos = ${(el.pad || 0) > 0 ? '0'.repeat((el.pad || 0) - 1) + '1' : '1'})</span></label>

                    <input class="form-control" type="number" value="${el.pad || 0}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">

                </div>

                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>

                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;

        } else if (el.type === 'SVG') {

            extraFields = `

                <div class="form-group"><label>Largura (mm)</label><input class="form-control" type="number" value="${el.width_mm || 20}" min="5" max="200" step="0.5" onchange="updateEl('${el.id}','width_mm',+this.value)"></div>

                <div class="form-group"><label>Altura (mm)</label><input class="form-control" type="number" value="${el.height_mm || 20}" min="5" max="200" step="0.5" onchange="updateEl('${el.id}','height_mm',+this.value)"></div>`;

        } else if (el.type === 'TEATRO_FILA' || el.type === 'TEATRO_LUGAR') {
            extraFields = `
                <div class="form-group el-full"><label>Fonte</label>
                    ${fontPickerHTML(el.id, el.font_name)}
                </div>
                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control el-font" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>
                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>
            `;
        } else if (el.type === 'TEATRO_COMBO') {
            extraFields = `
                <div class="form-group el-full"><label>Fonte</label>
                    ${fontPickerHTML(el.id, el.font_name)}
                </div>
                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control el-font" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>
                <div class="form-group"><label>Disposição</label>
                    <select class="form-control" onchange="updateEl('${el.id}','layout',this.value)">
                        <option value="1line" ${el.layout === '1line' ? 'selected' : ''}>Em 1 Linha</option>
                        <option value="2lines" ${el.layout === '2lines' ? 'selected' : ''}>Em 2 Linhas</option>
                    </select>
                </div>
                <div class="form-group"><label>Prefixo Fila</label><input class="form-control" type="text" value="${el.prefix_fila || ''}" onchange="updateEl('${el.id}','prefix_fila',this.value)"></div>
                <div class="form-group"><label>Prefixo Lugar</label><input class="form-control" type="text" value="${el.prefix_lugar || ''}" onchange="updateEl('${el.id}','prefix_lugar',this.value)"></div>
            `;
        } else if (el.type === 'CAMAROTE_LOCAL' || el.type === 'CAMAROTE_PESSOA' || el.type === 'CAMAROTE_PESSOA_TOTAL') {
            const camLabel = el.type === 'CAMAROTE_LOCAL' ? 'Local (Mesa, Camarote…)' : el.type === 'CAMAROTE_PESSOA' ? 'Pessoas (Cadeira, Lugar…)' : 'Pessoas 1/Total';
            extraFields = `
                <div class="form-group el-full" style="background:rgba(255,160,0,0.06); border-radius:6px; padding:8px; margin-bottom:4px;">
                    <label style="color: var(--amber, #f59e0b); font-size:0.78rem;">🏛️ ${camLabel}</label>
                </div>
                <div class="form-group el-full"><label>Fonte</label>
                    ${fontPickerHTML(el.id, el.font_name)}
                </div>
                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control el-font" type="number" value="${el.font_size || 12}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>
                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" placeholder="ex: Mesa , Cadeira …" onchange="updateEl('${el.id}','prefix',this.value)"></div>
            `;
        }
        
        let ticketPosHTML = '';
        const numTipoSelect = document.getElementById('num-tipo');
        if (numTipoSelect && numTipoSelect.value === 'TICKET' && ['TEXT', 'QR', 'BARCODE'].includes(el.type)) {
            const ticketQtd = parseInt(document.getElementById('num-ticket-qtd').value) || 1;
            let options = '';
            for (let i = 1; i <= ticketQtd; i++) {
                options += `<option value="${i}" ${(el.ticket_pos || 1) == i ? 'selected' : ''}>Ticket ${i}</option>`;
            }
            ticketPosHTML = `
                <div class="form-group el-full">
                    <label style="color:var(--blue); font-weight: 600;">Posição do Ticket</label>
                    <select class="form-control" style="background: rgba(0, 168, 255, 0.1);" onchange="updateEl('${el.id}','ticket_pos', parseInt(this.value))">
                        ${options}
                    </select>
                </div>
            `;
        }

        return `

        <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">

            <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">

                <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">

                    <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>

                    <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.95rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">

                </span>

                <div style="display:flex; gap:4px;">

                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 1rem;" onclick="duplicateEl('${el.id}');event.stopPropagation()" title="Duplicar">⧉</button>

                    <button class="btn btn-danger btn-sm" style="padding: 2px 8px;" onclick="removeEl('${el.id}');event.stopPropagation()" title="Excluir">✕</button>

                </div>

            </div>

            <div class="element-card-fields">

                <div class="form-group"><label>X (mm)</label><input class="form-control el-x" type="number" value="${el.x_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','x_mm',+this.value)"></div>

                <div class="form-group"><label>Y (mm)</label><input class="form-control el-y" type="number" value="${el.y_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','y_mm',+this.value)"></div>

                <div class="form-group"><label>Rotação (°)</label>

                    <select class="form-control" onchange="updateEl('${el.id}','rotation',+this.value)">

                        <option value="0" ${el.rotation === 0 ? 'selected' : ''}>0°</option>

                        <option value="90" ${el.rotation === 90 ? 'selected' : ''}>90°</option>

                        <option value="180" ${el.rotation === 180 ? 'selected' : ''}>180°</option>

                        <option value="270" ${el.rotation === 270 ? 'selected' : ''}>270°</option>

                    </select>

                </div>

                ${el.type !== 'SVG' ? `

                <div class="form-group"><label>Cor</label><input class="form-control" type="color" value="${el.color || '#000000'}" onchange="updateEl('${el.id}','color',this.value)"></div>

                ` : ''}

                <div class="form-group"><label>Face</label>

                    <select class="form-control" onchange="updateEl('${el.id}','face',this.value)">

                        <option value="both" ${el.face === 'both' || !el.face ? 'selected' : ''}>Frente e Verso</option>

                        <option value="front" ${el.face === 'front' ? 'selected' : ''}>Apenas Frente</option>

                        <option value="back" ${el.face === 'back' ? 'selected' : ''}>Apenas Verso</option>

                    </select>

                </div>

                ${(el.type !== 'FIXED' && el.type !== 'SVG') ? `

                <div class="form-group">

                    <label>Origem</label>

                    <select class="form-control" onchange="updateElSource('${el.id}', this.value)">

                        <option value="sequential" ${el.source !== 'database' ? 'selected' : ''}>Sequencial</option>

                        <option value="database" ${el.source === 'database' ? 'selected' : ''}>Banco de Dados</option>

                    </select>

                </div>

                <div class="form-group" style="${el.source === 'database' ? '' : 'display:none;'}">

                    <label>Coluna do CSV</label>

                    ${state.numCsvHeaders && state.numCsvHeaders.length ? `

                    <select class="form-control" onchange="updateEl('${el.id}','csv_column',this.value)">

                        <option value="">-- Selecione --</option>

                        ${state.numCsvHeaders.map(col => `<option value="${col}" ${el.csv_column === col ? 'selected' : ''}>${col}</option>`).join('')}

                    </select>

                    ` : `

                    <input class="form-control" type="text" value="${el.csv_column || ''}" placeholder="Ex: nome" onchange="updateEl('${el.id}','csv_column',this.value)">

                    `}

                </div>

                ` : ''}

                ${extraFields}
                ${ticketPosHTML}

            </div>

        </div>`;

    }).join('');

    // Montar os Font Pickers (substitui os placeholders .font-picker-mount por componentes reais)
    requestAnimationFrame(() => mountFontPickers());

}





window.updateEl = function (id, field, value) {
    const el = state.numElements.find(e => e.id === id);
    if (!el) return;

    el[field] = value;
    saveNumHistory();

    drawCanvas();

};



window.updateElSource = function (id, value) {

    const el = state.numElements.find(e => e.id === id);

    if (!el) return;

    el.source = value;

    if (value !== 'database') {

        delete el.csv_column;

    } else {

        el.csv_column = el.csv_column || '';

    }

    renderElementsList();

    drawCanvas();

};



window.deleteSelectedElements = function () {
    if (!state.selectedElIds || state.selectedElIds.length === 0) return;
    
    let idsToDelete = new Set(state.selectedElIds);
    state.numElements.forEach(el => {
        if (el.group_id) {
            const selectedInGroup = state.selectedElIds.some(sid => {
                const selObj = state.numElements.find(e => e.id === sid);
                return selObj && selObj.group_id === el.group_id;
            });
            if (selectedInGroup) idsToDelete.add(el.id);
        }
    });

    state.numElements = state.numElements.filter(e => !idsToDelete.has(e.id));
    state.selectedElIds = [];
    state.selectedElId = null;
    
    saveNumHistory();
    
    renderElementsList();
    drawCanvas();
};

window.duplicateSelectedElements = function () {
    if (!state.selectedElIds || state.selectedElIds.length === 0) return;
    
    let idsToDupe = new Set(state.selectedElIds);
    state.numElements.forEach(el => {
        if (el.group_id) {
            const selectedInGroup = state.selectedElIds.some(sid => {
                const selObj = state.numElements.find(e => e.id === sid);
                return selObj && selObj.group_id === el.group_id;
            });
            if (selectedInGroup) idsToDupe.add(el.id);
        }
    });

    saveNumHistory();
    
    const groupMap = {};
    const newSelectedIds = [];
    const timeNow = Date.now();

    Array.from(idsToDupe).forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (!el) return;
        
        state.numElCounter++;
        const newId = `el_${state.numElCounter}`;
        
        const clone = JSON.parse(JSON.stringify(el));
        clone.id = newId;
        
        if (state.numFormato && clone.type !== 'PICOTE') {
            clone.x_mm = state.numFormato.width_mm / 2;
        } else if (clone.type !== 'PICOTE') {
            clone.x_mm += 5;
        }
        
        clone.last_interaction = timeNow;

        if (clone.group_id) {
            if (!groupMap[clone.group_id]) {
                groupMap[clone.group_id] = 'g_' + Math.random().toString(36).substr(2, 9);
            }
            clone.group_id = groupMap[clone.group_id];
        }

        state.numElements.push(clone);
        newSelectedIds.push(newId);
    });

    state.selectedElIds = newSelectedIds;
    state.selectedElId = newSelectedIds.length > 0 ? newSelectedIds[newSelectedIds.length - 1] : null;
    
    saveNumHistory();
    
    renderElementsList();
    drawCanvas();
};

window.removeEl = function (id) {
    if (!state.selectedElIds.includes(id)) {
        selectElId(id, false, false);
    }
    deleteSelectedElements();
};



window.duplicateEl = function (id) {
    if (!state.selectedElIds.includes(id)) {
        selectElId(id, false, false);
    }
    duplicateSelectedElements();
};

window.groupSelectedElements = function () {
    if (!state.selectedElIds || state.selectedElIds.length < 2) {
        toast('Selecione pelo menos 2 elementos para agrupar.', 'warning');
        return;
    }
    const groupId = 'g_' + Math.random().toString(36).substr(2, 9);
    state.selectedElIds.forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (el) el.group_id = groupId;
    });
    
    saveNumHistory();
    renderElementsList();
    drawCanvas();
    
    toast('Elementos agrupados!', 'success');
};

window.saveNumHistory = function () {
    if (state.numHistoryIndex < state.numHistory.length - 1) {
        state.numHistory = state.numHistory.slice(0, state.numHistoryIndex + 1);
    }
    state.numHistory.push({
        numElements: JSON.parse(JSON.stringify(state.numElements)),
        numElCounter: state.numElCounter,
        selectedElIds: [...(state.selectedElIds || [])]
    });
    state.numHistoryIndex++;
};

window.undoNumHistory = function () {
    if (state.numHistoryIndex > 0) {
        state.numHistoryIndex--;
        const snapshot = state.numHistory[state.numHistoryIndex];
        state.numElements = JSON.parse(JSON.stringify(snapshot.numElements));
        state.numElCounter = snapshot.numElCounter;
        state.selectedElIds = [...snapshot.selectedElIds];
        state.selectedElId = state.selectedElIds.length > 0 ? state.selectedElIds[state.selectedElIds.length - 1] : null;
        renderElementsList();
        drawCanvas();
    }
};

window.redoNumHistory = function () {
    if (state.numHistoryIndex < state.numHistory.length - 1) {
        state.numHistoryIndex++;
        const snapshot = state.numHistory[state.numHistoryIndex];
        state.numElements = JSON.parse(JSON.stringify(snapshot.numElements));
        state.numElCounter = snapshot.numElCounter;
        state.selectedElIds = [...snapshot.selectedElIds];
        state.selectedElId = state.selectedElIds.length > 0 ? state.selectedElIds[state.selectedElIds.length - 1] : null;
        renderElementsList();
        drawCanvas();
    }
};

window.ungroupSelectedElements = function () {
    if (!state.selectedElIds || state.selectedElIds.length === 0) return;
    
    state.selectedElIds.forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (el) delete el.group_id;
    });
    
    saveNumHistory();
    renderElementsList();
    drawCanvas();
    
    toast('Elementos desagrupados!', 'info');
};





window.selectEl = function (id, event) {

    const isInputClick = event && event.target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL'].includes(event.target.tagName);
    const multi = event ? (event.ctrlKey || event.shiftKey) : false;

    selectElId(id, multi, !isInputClick);

    drawCanvas();

};



function selectElementCard(id) {

    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));

    const card = document.getElementById(`elcard-${id}`);

    if (card) {

        card.classList.add('selected');

        // Desativado scrollIntoView automático para evitar rolagem incômoda da página inteira

        // card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    }

}



function deselectAllCards() {

    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));

}



// - Salvar Numeração -

async function uploadToStorage(content, fileName, path) {
    if (!content) return '';
    if (typeof content === 'string' && content.startsWith('http')) return content; // Já é uma URL HTTP pública

    let mimeType = 'application/octet-stream';
    const nameLower = (fileName || '').toLowerCase();
    if (nameLower.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (nameLower.endsWith('.png')) mimeType = 'image/png';
    else if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (nameLower.endsWith('.svg')) mimeType = 'image/svg+xml';

    let blob;
    try {
        if (content instanceof File || content instanceof Blob) {
            blob = content;
        } else if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
            blob = new Blob([content], { type: mimeType });
        } else if (typeof content === 'string' && content.startsWith('data:')) {
            const parts = content.split(',');
            const mime = parts[0].match(/:(.*?);/)?.[1] || mimeType;
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            blob = new Blob([u8arr], { type: mime });
        } else {
            blob = new Blob([content], { type: mimeType });
        }
    } catch (convErr) {
        console.warn("[Storage] Erro ao converter conteúdo em Blob:", convErr);
        if (typeof content === 'string') return content;
        return '';
    }

    // Se supabaseClient não estiver configurado, converter blob para Base64 Data URL string
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    }

    const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'arquivo';
    const finalPath = `${path || 'uploads'}/${Date.now()}_${safeName}`;
    const bucketsToTry = ['artes', 'imposicao-storage'];

    for (const bucketName of bucketsToTry) {
        try {
            const { data, error } = await supabaseClient.storage
                .from(bucketName)
                .upload(finalPath, blob, { upsert: true, cacheControl: '3600' });

            if (!error && data) {
                const { data: publicUrlData } = supabaseClient.storage
                    .from(bucketName)
                    .getPublicUrl(finalPath);

                if (publicUrlData && publicUrlData.publicUrl) {
                    console.log(`[Storage] Upload OK bucket '${bucketName}':`, publicUrlData.publicUrl);
                    return publicUrlData.publicUrl;
                }
            } else {
                console.warn(`[Storage] Bucket '${bucketName}' retornou erro:`, error?.message || error);
            }
        } catch (e) {
            console.warn(`[Storage] Exceção no bucket '${bucketName}':`, e);
        }
    }

    // Fallback Final: Se o upload de rede nos buckets falhar, converter para Data URL (Base64)
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
    });
}



window.saveNumeracao = async function () {

    const id = document.getElementById('num-id').value;

    const name = document.getElementById('num-name').value.trim();

    const fmtId = document.getElementById('num-formato').value;
    
    const tipo = document.getElementById('num-tipo').value || 'SEQUENCIAL';



    if (!name) return toast('Informe um nome para a numeração.', 'error');

    if (!fmtId) return toast('Selecione um formato.', 'error');



    toast('Fazendo upload e salvando (isso pode demorar alguns segundos)...', 'info');



    try {
        // - GERAR PREVIEW JPG 100 DPI -
        let previewJpgBase64 = "";
        const fmt = state.formatos.find(f => String(f.id) === String(fmtId));
        if (fmt) {
            const S_100 = 100 / 25.4; // 100 DPI
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = Math.round(fmt.width_mm * S_100);
            previewCanvas.height = Math.round(fmt.height_mm * S_100);
            const pctx = previewCanvas.getContext('2d', { colorSpace: 'srgb' });

            // 1. Fundo branco
            pctx.fillStyle = '#ffffff';
            pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

            // 2. Imagem de fundo (PDF ou SVG se houver)
            let refBg = state.bgImage || state.numPdfImage || state.numSvgImage;
            if (refBg) {
                const MM2PT = 2.8346;
                let originalW_mm = 0;
                let originalH_mm = 0;

                if (refBg.originalPdfWidthPt) {
                    originalW_mm = refBg.originalPdfWidthPt / MM2PT;
                    originalH_mm = refBg.originalPdfHeightPt / MM2PT;
                } else {
                    const dpi = refBg.dpiValue || 300;
                    originalW_mm = (refBg.width / dpi) * 25.4;
                    originalH_mm = (refBg.height / dpi) * 25.4;
                }

                if (!originalW_mm || originalW_mm < 1) {
                    originalW_mm = fmt.width_mm;
                    originalH_mm = fmt.height_mm;
                }

                const drawW = originalW_mm * S_100;
                const drawH = originalH_mm * S_100;
                const drawX = (previewCanvas.width - drawW) / 2;
                const drawY = (previewCanvas.height - drawH) / 2;

                pctx.drawImage(refBg, drawX, drawY, drawW, drawH);
            }

            // 3. Desenhar elementos de numeração sem a borda de seleção azul
            pctx.save();
            pctx.beginPath();
            pctx.rect(0, 0, previewCanvas.width, previewCanvas.height);
            pctx.clip();

            const oldSelected = state.selectedElId;
            state.selectedElId = null;

            state.numElements.forEach(el => {
                if (typeof drawElement === 'function') {
                    drawElement(pctx, el, S_100);
                }
            });

            state.selectedElId = oldSelected;
            pctx.restore();

            // 4. Exportar como JPEG
            previewJpgBase64 = previewCanvas.toDataURL('image/jpeg', 0.85);
        }

        const svgUrl = await uploadToStorage(state.numSvgContent, state.numSvgFilename || 'arquivo.svg', 'uploads_svg');

        const pdfUrl = await uploadToStorage(state.numPdfContent, state.numPdfFilename || 'arquivo.pdf', 'uploads_pdf');



        state.numSvgContent = svgUrl;

        state.numPdfContent = pdfUrl;



        const data = {

            name,

            formato_id: fmtId,
            
            tipo,

            preview_jpg: previewJpgBase64,

            // Coletar todos os formatos marcados nos checkboxes
            formato_ids: (() => {
                const checks = document.querySelectorAll('#num-formatos-checks input[type="checkbox"]');
                const ids = [];
                checks.forEach(cb => { if (cb.checked || cb.value === fmtId) ids.push(cb.value); });
                // Garantir que o formato base está sempre incluído
                if (!ids.includes(fmtId)) ids.unshift(fmtId);
                return ids;
            })(),

            ticket_qtd: parseInt(document.getElementById('num-ticket-qtd').value) || 1,
            ticket_logica: document.getElementById('num-ticket-logica').value || 'HORIZONTAL',

            csv_filename: state.numCsvFilename || "",

            csv_headers: state.numCsvHeaders || [],

            csv_data: state.numCsvData || null,

            svg_content: svgUrl || "",

            svg_filename: state.numSvgFilename || "",

            // pdf_content da numeração: usar pdfUrl se válido, senão manter o conteúdo anterior de state
            // (que pode ter sido recuperado de um elemento PDF no editNumeracao como fallback)
            pdf_content: pdfUrl || state.numPdfContent || "",

            pdf_filename: state.numPdfFilename || "",
            is_custom: window.customNumeracaoEditState ? true : false,
            os_item_id: window.customNumeracaoEditState ? window.customNumeracaoEditState.itemId : null,
            Cli_Num: window.customNumeracaoEditState ? window.customNumeracaoEditState.cliNum : (id ? (state.numeracoes.find(n => String(n.id) === String(id))?.Cli_Num || null) : null),
            print_mode: document.getElementById('num-print-mode')?.value || 'front',

            elements: [
                ...state.numElements.map(el => {
                    // Remover propriedades internas do frontend (não serializáveis)
                    const { _pdfCanvas, _pdfLoading, _svgImage, _pdfPreview, ...e } = el;
                    if (e.type === 'FIXED') e.fixed = true;
                    if (e.type === 'SVG') e.svg_content = svgUrl || e.svg_content || "";
                    // Para PDF: usar pdfUrl se válido, senão manter o pdf_content original do elemento
                    // Isso evita apagar o PDF ao re-editar sem recarregar o arquivo
                    if (e.type === 'PDF') e.pdf_content = pdfUrl || e.pdf_content || "";
                    return e;
                }),
                { id: 'metadata', type: 'METADATA', print_mode: document.getElementById('num-print-mode')?.value || 'front' }
            ]

        };



        if (id) {

            await api('PUT', `/numeracoes/${id}`, data);

            toast('Numeração atualizada!', 'success');

        } else {

            const existing = state.numeracoes.find(

                n => n.name.trim().toLowerCase() === name.toLowerCase()

            );

            if (existing) {

                await api('PUT', `/numeracoes/${existing.id}`, data);

                toast('Numeração substituída!', 'success');

            } else {

                await api('POST', '/numeracoes', data);

                toast('Numeração salva!', 'success');

            }

        }

        // Guardar o nome da numeração ANTES de limpar o formulário
        const savedNumName = document.getElementById('num-name').value.trim();
        
        cancelNumEdit();
await loadAll();

if (window.customNumeracaoEditState) {
    const customState = window.customNumeracaoEditState;
    window.customNumeracaoEditState = null;
    
    // Encontrar a numeracao recem criada (pelo nome salvo antes do cancel)
    const newNumName = savedNumName || customState.modelName || customState.modeloName;
    const newNum = state.numeracoes.find(n => n.name === newNumName);
    
    if (customState.active || customState.view === 'amostras') {
        if (newNum) {
            // Associar a amostra
            await saveAmostraToDB(customState.itemId, customState.osId, { amostra_num_id: newNum.id });
        } else {
            toast('Numeração "' + newNumName + '" NÃO encontrada após salvar!', 'error');
        }
        showView('view-amostras');
        if (typeof renderAmostrasOSItens === 'function') {
            renderAmostrasOSItens(customState.osId);
        }
        toast('Numeração customizada salva e aplicada à amostra!', 'success');
    } else if (customState.view === 'imposicao') {
        showView('view-imposicao');
        if (newNum) {
            const numSelect = document.getElementById(customState.fieldId);
            if (numSelect) {
                // Atualizar as opções do select caso a numeração seja nova
                if (!Array.from(numSelect.options).some(o => o.value === newNum.id)) {
                    const opt = document.createElement('option');
                    opt.value = newNum.id;
                    opt.textContent = newNum.name;
                    numSelect.appendChild(opt);
                }
                numSelect.value = newNum.id;
                
                if (typeof updateImpSummary === 'function') {
                    updateImpSummary();
                }
                if (typeof toggleImpNumEditButtons === 'function') {
                    toggleImpNumEditButtons();
                }
            }
        }
        toast('Numeração customizada salva e aplicada ao modelo de imposição!', 'success');
    } else if (customState.view === 'pedido') {
        showView('view-pedido');
        if (newNum) {
            const numSelect = document.getElementById(customState.fieldId);
            if (numSelect) {
                // Atualizar as opções do select caso a numeração seja nova
                if (!Array.from(numSelect.options).some(o => o.value === newNum.id)) {
                    const opt = document.createElement('option');
                    opt.value = newNum.id;
                    opt.textContent = newNum.name;
                    numSelect.appendChild(opt);
                }
                numSelect.value = newNum.id;
                
                if (typeof updatePedSummary === 'function') {
                    updatePedSummary();
                }
            }
        }
        toast('Numeração customizada salva e aplicada ao pedido!', 'success');
    }
} else {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('nav-catalogo').classList.add('active');
    document.getElementById('view-catalogo').classList.add('active');
}



    } catch (e) { toast(e.message, 'error'); }

};



// - IMPOSIÇÃO -

// Detecta o DPI real de um arquivo de imagem (JPEG ou PNG) a partir dos seus metadados binários

async function getDpi(file) {

    try {

        const buffer = await file.arrayBuffer();

        const view = new DataView(buffer);

        

        // Verifica se é JPEG (começa com FF D8)

        if (view.byteLength > 4 && view.getUint16(0) === 0xFFD8) {

            let offset = 2;

            while (offset < view.byteLength - 4) {

                const marker = view.getUint16(offset);

                if (marker === 0xFFE0) { // APP0 (JFIF)

                    const units = view.getUint8(offset + 11);

                    const xDensity = view.getUint16(offset + 12);

                    if (units === 1 && xDensity > 0) { // 1 = dots per inch (DPI)

                        return xDensity;

                    }

                    if (units === 2 && xDensity > 0) { // 2 = dots per cm

                        return Math.round(xDensity * 2.54);

                    }

                    break;

                }

                // Pular o segmento

                const len = view.getUint16(offset + 2);

                offset += 2 + len;

            }

        }

        

        // Verifica se é PNG (começa com 89 50 4E 47)

        if (view.byteLength > 8 && view.getUint32(0) === 0x89504E47) {

            let offset = 8;

            while (offset < view.byteLength - 12) {

                const length = view.getUint32(offset);

                const type = view.getUint32(offset + 4);

                if (type === 0x70485973) { // pHYs chunk (physical pixel dimensions)

                    const xPixelsPerMeter = view.getUint32(offset + 8);

                    const unitSpecifier = view.getUint8(offset + 16);

                    if (unitSpecifier === 1 && xPixelsPerMeter > 0) {

                        return Math.round(xPixelsPerMeter * 0.0254); // Converter pixels por metro para DPI

                    }

                    break;

                }

                offset += 12 + length;

            }

        }

    } catch (e) {

        console.warn("Erro ao ler metadados de DPI:", e);

    }

    return 300; // Padrão de 300 DPI para artes gráficas profissionais

}



// - IMPOSIÇÃO -

async function loadImpArtFile(file) {
    state.impArtFile = file;

    const ext = file.name.split('.').pop().toLowerCase();

    try {

        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');

            }

            pdfjsLib.GlobalWorkerOptions.workerSrc =

                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            

            // Salvar documento PDF e inicializar caches para paginação especial de Pdf Múltiplo

            state.impArtPdfDoc = pdf;

            state.impArtPagesCache = {};

            state.impArtPagesRendering = {};



            const page = await pdf.getPage(1);

            const vp = page.getViewport({ scale: 1 });



            const scale = 2; // Renderizar em maior resolução para melhor qualidade de preview

            const off = document.createElement('canvas');

            const octx = off.getContext('2d');

            off.width = vp.width * scale;

            off.height = vp.height * scale;

            octx.fillStyle = '#ffffff';

            octx.fillRect(0, 0, off.width, off.height);

            await page.render({ canvasContext: octx, viewport: page.getViewport({ scale }) }).promise;



            state.impArtImage = off;

            state.impArtWidth = vp.width; // em pt

            state.impArtHeight = vp.height; // em pt

            

            // Se estiver em Pdf Múltiplo, atualiza limites

            const schema = document.getElementById('imp-schema').value;

            if (schema === "pdf_multiple") {

                const impStart = document.getElementById('imp-start');

                const impEnd = document.getElementById('imp-end');

                if (impStart) {

                    impStart.value = 1;

                    impStart.setAttribute('disabled', 'true');

                }

                if (impEnd) {

                    impEnd.value = pdf.numPages;

                    impEnd.setAttribute('disabled', 'true');

                }

            }

        } else {

            // Se for imagem normal, limpa referências de PDF

            state.impArtPdfDoc = null;

            state.impArtPagesCache = {};

            state.impArtPagesRendering = {};



            const img = new Image();

            img.src = URL.createObjectURL(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

            

            // Obter o DPI da imagem a partir dos metadados

            const dpi = await getDpi(file);

            

            state.impArtImage = img;

            // Converter pixels para pontos PDF (1pt = 1/72 polegada, logo: px / DPI * 72)

            state.impArtWidth = img.width * (72 / dpi);

            state.impArtHeight = img.height * (72 / dpi);

        }

        toast('Arte carregada para preview!', 'success');

        updateImpSummary(); // Recalcular sumário e forçar redesenho do preview

    } catch (e) {

        toast('Erro ao carregar arte: ' + e.message, 'error');

        state.impArtImage = null;

        state.impArtPdfDoc = null;

        state.impArtPagesCache = {};

        state.impArtPagesRendering = {};

        updateImpSummary();

    }

}



function drawPreview() {

    let fmtId = document.getElementById('imp-formato')?.value || '';
    let numId = document.getElementById('imp-numeracao')?.value || document.getElementById('ped-numeracao')?.value || '';
    let saiId = document.getElementById('imp-saida')?.value || '';
    let start = parseInt(document.getElementById('imp-start')?.value, 10) || 1;
    let end = parseInt(document.getElementById('imp-end')?.value, 10) || 100;
    let schema = document.getElementById('imp-schema')?.value || 'sequential';

    const activeItem = state.activeOSItem;
    
    const printModeEl = document.getElementById('imp-print-mode');
    if (printModeEl) {
        state.printMode = printModeEl.value;
    } else if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            const wantsDuplex = !!(item.verso_tipo && item.verso_tipo !== 'Frente');
            state.printMode = wantsDuplex ? 'duplex' : 'front';
        }
    }

    if (activeItem && (!fmtId || !saiId)) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            if (!fmtId) fmtId = item.formato_id;
            if (!numId) numId = item.numeracao_id;
            if (!saiId) {
                saiId = item.saida_id;
                if (!saiId && fmtId) {
                    const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
                    if (fmtObj) saiId = fmtObj.default_saida_id;
                }
            }
            if (isNaN(parseInt(document.getElementById('imp-start')?.value, 10))) {
                start = item.num_inicial !== undefined && item.num_inicial !== null ? parseInt(item.num_inicial, 10) : (parseInt(item.numeracao_inicio, 10) || 1);
            }
            if (isNaN(parseInt(document.getElementById('imp-end')?.value, 10))) {
                end = item.num_final !== undefined && item.num_final !== null ? parseInt(item.num_final, 10) : (parseInt(item.numeracao_fim, 10) || 100);
            }
            if (!document.getElementById('imp-schema')?.value) {
                const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
                schema = fmtObj ? fmtObj.default_schema : 'sequential';
            }
        }
    }

    // Resolver numId do item ativo independente de fmtId/saiId
    if (!numId && activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) numId = item.numeracao_id || item.amostra_num_id || '';
    }

    const canvas = document.getElementById('preview-canvas');

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!fmtId || !saiId) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';

        ctx.textAlign = 'center';

        ctx.fillText('Aguardando formato e saída...', 150, 100);

        document.getElementById('preview-sheet-num').textContent = 'Sem Configuração';

        return;

    }



    const fmt = state.formatos.find(f => String(f.id) === String(fmtId));
    const sai = state.saidas.find(s => String(s.id) === String(saiId));

    if (!fmt || !sai) return;

    // Se estivermos em modo OS ativo, priorizamos os valores padrões do formato (se existirem)
    if (state.activeOSItem) {
        if (fmt.default_schema) schema = fmt.default_schema;
        if (fmt.default_saida_id) saiId = fmt.default_saida_id;
    } else {
        // Modo manual: usar os valores selecionados no DOM
        schema = document.getElementById('imp-schema')?.value || fmt.default_schema || 'sequential';
        saiId = document.getElementById('imp-saida')?.value || fmt.default_saida_id || saiId;
    }
    
    const previewPartEl = document.getElementById('preview-part-input');
    let previewPart = 'miolo';
    if (previewPartEl) {
        const isDuplex = state.printMode === 'duplex';
        if (fmt.has_cover || isDuplex) {
            previewPartEl.style.display = 'inline-block';
            
            const currentVal = previewPartEl.value;
            
            let optionsHtml = '';
            optionsHtml += '<option value="miolo">Miolo</option>';
            if (isDuplex) {
                optionsHtml += '<option value="miolo_verso">Miolo (Verso)</option>';
            }
            if (fmt.has_cover) {
                optionsHtml += '<option value="capa">Capa</option>';
                optionsHtml += '<option value="contracapa">Contracapa</option>';
            }
            
            // Só atualizar o HTML se as opções mudaram para evitar loops de re-renderização
            const existingOptions = Array.from(previewPartEl.options).map(o => o.value).join(',');
            const newOptions = isDuplex 
                ? (fmt.has_cover ? 'miolo,miolo_verso,capa,contracapa' : 'miolo,miolo_verso')
                : (fmt.has_cover ? 'miolo,capa,contracapa' : 'miolo');
                
            if (existingOptions !== newOptions) {
                previewPartEl.innerHTML = optionsHtml;
                if (optionsHtml.includes(`value="${currentVal}"`)) {
                    previewPartEl.value = currentVal;
                } else {
                    previewPartEl.value = 'miolo';
                }
            }
            
            previewPart = previewPartEl.value;
        } else {
            previewPartEl.style.display = 'none';
            previewPartEl.value = 'miolo';
            previewPart = 'miolo';
        }
    }

    const num = state.numeracoes.find(n => String(n.id) === String(numId)) || null;

    const num2Id = document.getElementById('imp-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;

    // Detectar CAMAROTE: igual ao engine.py — checar .tipo OU svg_content contendo "CAMAROTE"
    const camPanel = document.getElementById('ped-camarote-panel');
    function _isCamarote(n) {
        if (!n) return false;
        if (n.tipo === 'CAMAROTE' || n.type === 'CAMAROTE') return true;
        if (n.svg_content && String(n.svg_content).includes('CAMAROTE')) return true;
        if (Array.isArray(n.elements) && n.elements.some(e => e && String(e.type || '').startsWith('CAMAROTE_'))) return true;
        return false;
    }
    let isNumCamarote = _isCamarote(num);
    // Fallback: verificar numeração do item ativo
    if (!isNumCamarote && activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            // Verificar via numeracao_id/amostra_num_id
            const fallbackNumId = item.numeracao_id || item.amostra_num_id;
            if (fallbackNumId) {
                const fallbackNum = (state.numeracoes || []).find(n => String(n.id) === String(fallbackNumId));
                if (_isCamarote(fallbackNum)) isNumCamarote = true;
            }
            // Fallback direto: tipo_numeracao ou numeracao string do item
            if (!isNumCamarote) {
                const tipoStr = String(item.tipo_numeracao || item.numeracao || item.gabarito_operacional || '').toUpperCase();
                if (tipoStr === 'CAMAROTE' || tipoStr.includes('CAMAROTE')) isNumCamarote = true;
            }
        }
    }
    if (camPanel) camPanel.style.display = isNumCamarote ? 'block' : 'none';
    // === DEBUG CAMAROTE (remover após correção) ===
    console.log('[CAPA-DEBUG] numId=', numId, '| num=', num, '| isNumCamarote=', isNumCamarote, '| activeItem=', activeItem);
    if (activeItem) {
        const _di = state.osItens[activeItem.osId] || [];
        const _it = _di.find(i => String(i.id) === String(activeItem.itemId));
        console.log('[CAPA-DEBUG] item=', _it, '| numeracao_id=', _it?.numeracao_id, '| amostra_num_id=', _it?.amostra_num_id);
        const _nid = _it?.numeracao_id || _it?.amostra_num_id;
        const _fn = (state.numeracoes||[]).find(n => String(n.id) === String(_nid));
        console.log('[CAPA-DEBUG] fallbackNum=', _fn, '| keys=', _fn ? Object.keys(_fn) : null);
    }


    const MM2PT = 2.8346;

    const sheet_w = sai.width_mm * MM2PT;

    const sheet_h = sai.height_mm * MM2PT;

    const item_w = fmt.width_mm * MM2PT;

    const item_h = fmt.height_mm * MM2PT;

    const gap_h = (fmt.gap_h_mm || 0) * MM2PT;

    const gap_v = (fmt.gap_v_mm || 0) * MM2PT;

    const fmt_off_h = (fmt.offset_h_mm || 0) * MM2PT;

    const fmt_off_v = (fmt.offset_v_mm || 0) * MM2PT;



    const MAX_W = 1920;

    const MAX_H = 1360;

    const scale = Math.min(MAX_W / sheet_w, MAX_H / sheet_h);



    canvas.width = Math.round(sheet_w * scale);

    canvas.height = Math.round(sheet_h * scale);

    canvas.style.width = `${canvas.width}px`;

    canvas.style.height = `${canvas.height}px`;



    // Fundo branco do papel

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);



    const cols = fmt.cols;

    const rows = fmt.rows;

    const used_w = cols * item_w + (cols - 1) * gap_h;

    const used_h = rows * item_h + (rows - 1) * gap_v;



    const start_x = (sheet_w - used_w) / 2;
    const start_y = (sheet_h - used_h) / 2;

    let ticket_qtd = 1;
    if (num && num.tipo === "TICKET") {
        ticket_qtd = parseInt(num.ticket_qtd) || 1;
    }
    const raw_items = Math.max(1, end - start + 1);
    const total_items = (num && num.tipo === "TICKET") ? Math.ceil(raw_items / ticket_qtd) : raw_items;

    const poses_per_sheet = cols * rows;
    let total_sheets = Math.ceil(total_items / poses_per_sheet);

    let is_strict_mode = false;
    let stack_size = 50;
    if (schema === "cut_stack") {
        const cutstackMode = document.getElementById('imp-cutstack-mode')?.value || 'independent';
        stack_size = (parseInt(document.getElementById('imp-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('imp-block-depth')?.value) || 1);
        if (cutstackMode === 'strict') {
            is_strict_mode = true;
            const itemsPerSet = stack_size * poses_per_sheet;
            const sets_needed = Math.ceil(total_items / itemsPerSet);
            total_sheets = sets_needed * stack_size;
        }
    }

    document.getElementById('preview-sheet-num').textContent = `Folha ${window.currentPreviewPage || 1} de ${total_sheets}`;

    const isBack = state.previewFace === 'back' || previewPart === 'miolo_verso';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const P = row * cols + col;

            let S = (window.currentPreviewPage || 1) - 1;
            if (S >= total_sheets) S = total_sheets - 1;
            if (S < 0) S = 0;

            let item_index = (S * poses_per_sheet) + P;
            if (schema === "cut_stack") {
                const cutstackMode = document.getElementById('imp-cutstack-mode')?.value || 'independent';
                if (cutstackMode === 'strict') {
                    const full_sets = Math.floor(total_sheets / stack_size);
                    const set_index = Math.floor(S / stack_size);
                    const sheet_within_set = S % stack_size;
                    item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set;
                } else if (cutstackMode === 'strict_assembly') {
                    const full_sets = Math.floor(total_sheets / stack_size);
                    if (S < full_sets * stack_size) {
                        const set_index = Math.floor(S / stack_size);
                        const sheet_within_set = S % stack_size;
                        item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set;
                    } else {
                        const S_asm = S - (full_sets * stack_size);
                        const asm_sheets = total_sheets - (full_sets * stack_size);
                        const base_index = full_sets * stack_size * poses_per_sheet;
                        item_index = base_index + (P * asm_sheets) + S_asm;
                    }
                } else {
                    item_index = (P * total_sheets) + S;
                }
            } else if (schema === "step_repeat") {
                item_index = S;
            } else if (schema === "multi_artes") {
                const P_col_first = col * rows + row;
                item_index = (P_col_first * total_sheets) + S;
            }

            if (item_index >= total_items) continue;



            // Para o verso da folha (tombamento horizontal), espelhamos as colunas fisicamente

            const col_fisico = isBack ? (cols - 1 - col) : col;

            const cell_x0 = start_x + col_fisico * (item_w + gap_h);

            const cell_y0 = start_y + row * (item_h + gap_v);



            const cw = item_w * scale;

            const ch = item_h * scale;



            // Centro da célula para rotação

            const centerX = (cell_x0 + item_w / 2) * scale;

            const centerY = (cell_y0 + item_h / 2) * scale;

            

            // Inverter a rotação da célula no verso para bater frente/verso

            const cellRotationFrente = fmt.rotations ? (parseInt(fmt.rotations[P]) || 0) : 0;

            const cellRotation = isBack ? ((360 - cellRotationFrente) % 360) : cellRotationFrente;



            ctx.save();

            ctx.translate(centerX, centerY);

            if (cellRotation !== 0) {

                ctx.rotate((cellRotation * Math.PI) / 180);

            }



            // Borda do item (desenhada em torno do centro 0,0)

            ctx.strokeStyle = '#cbd5e1';

            ctx.lineWidth = 0.5;

            ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);



            // Clipping restrito à célula (impede que artes com sangria vazem)

            ctx.beginPath();

            ctx.rect(-cw / 2, -ch / 2, cw, ch);

            ctx.clip();



            let multiArteItem = null;

            if (schema === "multi_artes") {

                let accumulated = 0;

                for (let i = 0; i < state.impMultiArtes.length; i++) {

                    let q = parseInt(state.impMultiArtes[i].qtd) || 0;

                    if (item_index >= accumulated && item_index < accumulated + q) {

                        multiArteItem = state.impMultiArtes[i];

                        break;

                    }

                    accumulated += q;

                }

            }



            let activePdfDoc = (isBack && state.impArtVersoPdfDoc) ? state.impArtVersoPdfDoc : state.impArtPdfDoc;

            let activeImage = state.impArtImage;

            let isMultiArtePdf = false;

            let art_orig_w = state.impArtWidth;

            let art_orig_h = state.impArtHeight;



            if (schema === "multi_artes" && multiArteItem) {

                if (multiArteItem.pdfDoc) {

                    activePdfDoc = multiArteItem.pdfDoc;

                    isMultiArtePdf = true;

                    art_orig_w = multiArteItem.artWidth || item_w;

                    art_orig_h = multiArteItem.artHeight || item_h;

                }

                activeImage = null; 

            }



            if (activeImage || activePdfDoc) {
                // Centralizar a arte na célula + aplicar offset do formato (em relação ao centro da célula que é 0,0)
                // (positivo H = direita, positivo V = para cima → negar Y)
                let offH = fmt_off_h * scale;
                let offV = -fmt_off_v * scale;
                
                // O backend (engine.py) sempre ajusta proporcionalmente a arte base (JPG ou PDF) 
                // para caber na caixa de dimensões item_w x item_h. Replicamos o mesmo comportamento aqui:
                const fitScale = Math.min(item_w / art_orig_w, item_h / art_orig_h);
                let dw = art_orig_w * fitScale * scale;
                let dh = art_orig_h * fitScale * scale;


                
                if (previewPart === 'capa' || previewPart === 'contracapa') {
                    const cScale = (parseFloat(fmt.cover_scale) || 100) / 100.0;
                    dw *= cScale;
                    dh *= cScale;
                    offH = (parseFloat(fmt.cover_offset_x) || 0) * MM2PT * scale;
                    offV = -(parseFloat(fmt.cover_offset_y) || 0) * MM2PT * scale;
                }



                if (dw > 0 && dh > 0) {

                    if (activePdfDoc) {

                        // Determinar qual página física real do PDF base exibir

                        let pageNum = 1;

                        if (schema === "pdf_multiple") {

                            if (state.printMode === "duplex") {

                                pageNum = isBack ? (item_index * 2 + 2) : (item_index * 2 + 1);

                            } else {

                                pageNum = item_index + 1;

                            }

                        } else {

                            pageNum = (isBack && !state.impArtVersoPdfDoc) ? 2 : 1;

                        }



                        if (pageNum <= activePdfDoc.numPages) {

                            let pagesCache = activePdfDoc.pagesCache;

                            let pagesRendering = activePdfDoc.pagesRendering;

                            if (!pagesCache) {

                                pagesCache = {};

                                activePdfDoc.pagesCache = pagesCache;

                            }

                            if (!pagesRendering) {

                                pagesRendering = {};

                                activePdfDoc.pagesRendering = pagesRendering;

                            }



                            const cacheKey = `page_${pageNum}`;

                            const cachedPage = pagesCache[cacheKey];

                            if (cachedPage) {

                                ctx.drawImage(cachedPage, offH - dw / 2, offV - dh / 2, dw, dh);

                            } else {

                                if (!pagesRendering[cacheKey]) {

                                    pagesRendering[cacheKey] = true;

                                    (async () => {

                                        try {

                                            const page = await activePdfDoc.getPage(pageNum);

                                            const vp = page.getViewport({ scale: 1.5 });

                                            const off = document.createElement('canvas');

                                            off.width = vp.width;

                                            off.height = vp.height;

                                            const octx = off.getContext('2d');

                                            octx.fillStyle = '#ffffff';

                                            octx.fillRect(0, 0, off.width, off.height);

                                            await page.render({ canvasContext: octx, viewport: vp }).promise;

                                            

                                            pagesCache[cacheKey] = off;

                                            drawPreview(); // Redesenhar o preview principal

                                        } catch (err) {

                                            console.error(`Erro ao renderizar pág. ${pageNum}:`, err);

                                        } finally {

                                            delete pagesRendering[cacheKey];

                                        }

                                    })();

                                }

                                

                                // Placeholder enquanto carrega a página

                                ctx.fillStyle = '#f1f5f9';

                                ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                                ctx.strokeStyle = '#cbd5e1';

                                ctx.lineWidth = 0.5;

                                ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                                ctx.fillStyle = '#94a3b8';

                                ctx.font = `${Math.max(6, Math.round(ch * 0.08))}px Inter`;

                                ctx.textAlign = 'center';

                                ctx.textBaseline = 'middle';

                                ctx.fillText(`Carregando Pág. ${pageNum}...`, offH, offV);

                            }

                        } else {

                            // Página excedente ou sem verso, desenha vazio

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                            ctx.strokeStyle = '#cbd5e1';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                        }

                    } else if (activeImage) {

                        if (isBack) {

                            // Imagem única não tem verso de arte

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                            ctx.strokeStyle = '#cbd5e1';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                        } else {

                            ctx.drawImage(activeImage, 0, 0, activeImage.width, activeImage.height, offH - dw / 2, offV - dh / 2, dw, dh);

                        }

                    }

                }

            } else {

                ctx.fillStyle = '#f8fafc';

                ctx.fillRect(-cw / 2, -ch / 2, cw, ch);

                ctx.strokeStyle = '#e2e8f0';

                ctx.setLineDash([3, 3]);

                ctx.strokeRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4);

                ctx.setLineDash([]);



                ctx.fillStyle = '#94a3b8';

                ctx.font = `${Math.max(7, Math.round(ch * 0.12))}px Inter`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'middle';

                ctx.fillText(`Posição ${P + 1}`, 0, 0);

            }



            // Desenhar Nome da Arte (Multi-Artes)
            
            if (previewPart === 'capa' || previewPart === 'contracapa') {
                if (previewPart === 'capa' && !isBack) {
                    const color = fmt.cover_font_color || '#000000';
                    const fsPdf = parseInt(fmt.cover_font_size) || 12;
                    const xPdf = parseFloat(fmt.cover_font_x) || 10;
                    const yPdf = parseFloat(fmt.cover_font_y) || 10;
                    
                    ctx.fillStyle = color;
                    ctx.font = `bold ${fsPdf * scale}px Helvetica, sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    
                    const sheetsInput = document.getElementById('imp-sheets-per-block');
                    const sheetsPerBlock = (sheetsInput && sheetsInput.value) 
                        ? parseInt(sheetsInput.value) 
                        : (parseInt(fmt.default_sheets_per_block) || 50);
                        
                    const local_idx = (typeof item_local_index !== 'undefined') ? item_local_index : item_index;
                    const cell_stack_size = sheetsPerBlock;
                    const bloco_num = Math.floor(local_idx / cell_stack_size) + 1;
                    
                    const textX = -cw/2 + (xPdf * MM2PT * scale);
                    const textY = -ch/2 + (yPdf * MM2PT * scale);
                    
                    // CAMAROTE: usar "Camarote XX - de 1 a L_CAM" com C_INI como início
                    if (isNumCamarote) {
                        // Pegar c_ini e l_cam do item ativo (pedidos_modelos)
                        let cIni = 1, lCam = 1;
                        if (activeItem) {
                            const _itens = state.osItens[activeItem.osId] || [];
                            const _item = _itens.find(i => String(i.id) === String(activeItem.itemId));
                            if (_item) {
                                cIni = parseInt(_item.c_ini || _item.C_INI) || 1;
                                lCam = parseInt(_item.l_cam || _item.L_CAM) || 1;
                            }
                        }
                        // Fallback para inputs do painel
                        if (cIni <= 1) cIni = parseInt(document.getElementById('ped-c-ini')?.value) || parseInt(document.getElementById('imp-c-ini')?.value) || 1;
                        if (lCam <= 1) lCam = parseInt(document.getElementById('ped-l-cam')?.value) || parseInt(document.getElementById('imp-l-cam')?.value) || 1;
                        
                        const camaroteNum = String(cIni + (bloco_num - 1)).padStart(2, '0');
                        const wCamarote = ctx.measureText(`Camarote ${camaroteNum}`).width;
                        
                        ctx.fillText(`Camarote ${camaroteNum}`, textX, textY);
                        ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                        ctx.fillText(` - de 1 a ${lCam}`, textX + wCamarote, textY);
                    } else {
                        const blocoNum = String(bloco_num).padStart(2, '0');
                        const wBloco = ctx.measureText(`Bloco ${blocoNum}`).width;
                        
                        ctx.fillText(`Bloco ${blocoNum}`, textX, textY);
                        ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                        
                        const seqStartInput = document.getElementById('imp-start');
                        const seqStart = (seqStartInput && seqStartInput.value) ? parseInt(seqStartInput.value) : 1;
                        
                        const start_idx = (bloco_num - 1) * cell_stack_size;
                        const end_idx = start_idx + cell_stack_size - 1;
                        const v_start = seqStart + start_idx * ticket_qtd;
                        const v_end = seqStart + (end_idx + 1) * ticket_qtd - 1;
                        
                        const vStartStr = String(v_start).padStart(4, '0');
                        const vEndStr = String(v_end).padStart(4, '0');
                        
                        ctx.fillText(` - de ${vStartStr} a ${vEndStr}`, textX + wBloco, textY);
                    }
                }
                ctx.restore();
                continue;
            }

            if (schema === 'multi_artes' && multiArteItem && multiArteItem.nome) {
                ctx.save();
                const nomeTxt = String(multiArteItem.nome).padStart(6, '0');
                const nomeColor = multiArteItem.nome_color || '#000000';
                // Fonte: 17pt em pontos PDF, convertido para pixels do canvas
                const nomeFontSizePx = 14 * scale;
                ctx.font = `${nomeFontSizePx}px Impact, Arial, sans-serif`;
                ctx.fillStyle = nomeColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Posição X: 0mm da lateral esquerda da célula
                // Após rotação -90°, textBaseline='middle' centraliza horizontalmente,
                // então o ponto de translate é o CENTRO do texto rotacionado.
                // Para a borda esquerda do texto ficar a 0mm: center_x = -cw/2 + fontSize/2
                ctx.translate(-cw / 2 + nomeFontSizePx / 2, 0);
                ctx.rotate(-Math.PI / 2);
                // textAlign='center' centraliza o texto verticalmente (eixo X pré-rotação = eixo Y pós-rotação)
                ctx.fillText(nomeTxt, 0, 0);
                ctx.restore();
            }

            // Elementos variáveis (VDP) - Suporte a 2 numerações sobrepostas

        const drawVdpElements = (currentNum, source_id) => {

            if (currentNum && currentNum.elements) {

                const val = start + item_index;

                let numPrintMode = currentNum.print_mode;
                if (!numPrintMode && currentNum.elements) {
                    const metaEl = currentNum.elements.find(x => x.type === 'METADATA');
                    if (metaEl) {
                        numPrintMode = metaEl.print_mode;
                    }
                }

                currentNum.elements.forEach(el => {

                    const printMode = document.getElementById('imp-print-mode')?.value || 'front';

                    let effectiveFace = el.face || 'both';

                    if (printMode === 'duplex') {
                        if (numPrintMode === 'duplex') {
                            effectiveFace = el.face || 'both';
                        } else {
                            effectiveFace = source_id === 1 ? 'front' : 'back';
                        }
                    }



                    // Pular elementos que não são da face ativa

                    if (isBack && effectiveFace === 'front') return;

                    if (!isBack && effectiveFace === 'back') return;

                    // Posição do elemento relativa ao canto superior esquerdo da célula

                    const el_x = el.x_mm * MM2PT * scale;

                    const el_y = el.y_mm * MM2PT * scale;



                    // Converter para coordenadas relativas ao centro da célula (0,0)

                    const el_x_rel = el_x - cw / 2;

                    const el_y_rel = el_y - ch / 2;



                    const color = el.color || '#000000';

                    const rotation = el.rotation || 0;



                    let val_str = "";

                    if (el.fixed) {

                        val_str = el.fixed_value || "";

                    } else if (el.type === 'TEATRO_FILA') {
                        const filaVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Fila || 'A' : 'A';
                        val_str = `${el.prefix || ''}${filaVal}`;

                    } else if (el.type === 'TEATRO_LUGAR') {
                        const lugarVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Numero || '22' : '22';
                        val_str = `${el.prefix || ''}${lugarVal}`;

                    } else if (el.type === 'TEATRO_COMBO') {
                        const filaVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Fila || 'A' : 'A';
                        const lugarVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Numero || '22' : '22';
                        const filaT = `${el.prefix_fila || ''}${filaVal}`;
                        const lugarT = `${el.prefix_lugar || ''}${lugarVal}`;
                        val_str = el.layout === '2lines' ? `${filaT}\n${lugarT}` : `${filaT} - ${lugarT}`;

                    } else if (el.type === 'CAMAROTE_LOCAL') {
                        // local_num = seq_start + floor(item_index / l_cam)
                        const _lCam = (currentNum && currentNum.l_cam) ? parseInt(currentNum.l_cam) : 1;
                        const _qStart = start || 1;
                        const _localNum = _qStart + Math.floor(item_index / _lCam);
                        val_str = `${el.prefix || ''}${_localNum}`;

                    } else if (el.type === 'CAMAROTE_PESSOA') {
                        const _lCam = (currentNum && currentNum.l_cam) ? parseInt(currentNum.l_cam) : 1;
                        val_str = `${el.prefix || ''}${(item_index % _lCam) + 1}`;

                    } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                        const _lCam = (currentNum && currentNum.l_cam) ? parseInt(currentNum.l_cam) : 1;
                        val_str = `${el.prefix || ''}${(item_index % _lCam) + 1}/${_lCam}`;

                    } else if (el.source === 'database') {

                        if (state.csvData && state.csvData[item_index]) {

                            const colName = el.csv_column || '';

                            val_str = String(state.csvData[item_index][colName] || '');

                        } else {

                            val_str = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;

                        }

                    } else {

                        const pad = parseInt(el.pad) || 0;

                        const prefix = el.prefix || "";

                        const suffix = el.suffix || "";

                        let current_val = val;
                        if (currentNum && currentNum.tipo === "TICKET" && source_id === 1) {
                            const pos = parseInt(el.ticket_pos) || 1;
                            const N = parseInt(currentNum.ticket_qtd) || 1;
                            current_val = start + (item_index * N) + (pos - 1);
                        } else if (currentNum && currentNum.tipo === "TICKET" && source_id === 2) {
                            const pos = parseInt(el.ticket_pos) || 1;
                            const N = parseInt(currentNum.ticket_qtd) || 1;
                            current_val = start + (item_index * N) + (pos - 1);
                        }

                        const raw = pad > 0 ? String(current_val).padStart(pad, '0') : String(current_val);

                        val_str = `${prefix}${raw}${suffix}`;

                    }



                    ctx.save();

                    ctx.translate(el_x_rel, el_y_rel);

                    ctx.rotate(rotation * Math.PI / 180);



                    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {

                        const fs = (el.font_size || 12) * scale;

                        ctx.font = buildCanvasFont(fs, el.font_name);

                        ctx.fillStyle = color;

                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        if (val_str.includes('\n')) {
                            const lines = val_str.split('\n');
                            ctx.fillText(lines[0], 0, -fs / 2);
                            ctx.fillText(lines[1], 0, fs / 2);
                        } else {
                            ctx.fillText(val_str, 0, 0);
                        }
                        
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'alphabetic';

                    } else if (el.type === 'QR') {

                        const sz = (el.size_mm || 15) * MM2PT * scale;

                        renderQRCodeOnCtx(ctx, val_str, 0, 0, sz, color);

                    } else if (el.type === 'BARCODE') {

                        const bw = (el.width_mm || 40) * MM2PT * scale;

                        const bh = (el.height_mm || 10) * MM2PT * scale;
                        const hbw = bw / 2, hbh = bh / 2;

                        ctx.fillStyle = color;

                        const barW = bw / 40;

                        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];

                        for (let i = 0; i < pattern.length; i++) {

                            if (pattern[i]) ctx.fillRect(-hbw + i * barW, -hbh, barW * 0.7, bh);

                        }



                        ctx.font = `${Math.max(5, bh * 0.3)}px Inter, sans-serif`;

                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';

                        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), 0, hbh + 2);

                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'alphabetic';

                    } else if (el.type === 'SVG') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const hw = sz_w / 2, hh = sz_h / 2;

                        const svgImg = currentNum && currentNum._svgImage;

                        if (svgImg) {

                            ctx.drawImage(svgImg, -hw, -hh, sz_w, sz_h);

                        } else {

                            ctx.strokeStyle = color;

                            ctx.lineWidth = 0.5 * scale;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.font = `${Math.max(5, sz_h * 0.15)}px Inter, sans-serif`;

                            ctx.fillStyle = color;

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            ctx.fillText('SVG', 0, 0);

                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';

                        }

                    } else if (el.type === 'PDF') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const hw = sz_w / 2, hh = sz_h / 2;

                        if (el._pdfCanvas) {

                            ctx.drawImage(el._pdfCanvas, -hw, -hh, sz_w, sz_h);

                        } else if (el.pdf_content && !el._pdfLoading) {

                            el._pdfLoading = true;

                            (async () => {

                                try {

                                    const pdfData = await fetchPdfBytes(el.pdf_content);

                                    if (!pdfData) throw new Error('fetchPdfBytes retornou null');

                                    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                                    const page = await pdf.getPage(1);

                                    const vp = page.getViewport({ scale: 2 });

                                    const offCanvas = document.createElement('canvas');

                                    offCanvas.width = Math.round(vp.width);

                                    offCanvas.height = Math.round(vp.height);

                                    const octx = offCanvas.getContext('2d');

                                    await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;

                                    el._pdfCanvas = offCanvas;

                                    delete el._pdfLoading;

                                    drawPreview();

                                } catch (errPdf) {

                                    console.error('[Preview] Erro ao renderizar PDF do elemento VDP:', errPdf);

                                    delete el._pdfLoading;

                                }

                            })();

                            // Placeholder enquanto carrega

                            ctx.fillStyle = '#f1f5f9';

                            ctx.fillRect(-hw, -hh, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.fillStyle = '#64748b';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('PDF...', 0, 0);

                            ctx.textAlign = 'left';

                            ctx.textBaseline = 'alphabetic';

                        } else if (!el.pdf_content) {

                            ctx.fillStyle = '#f8fafc';

                            ctx.fillRect(-hw, -hh, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.fillStyle = '#94a3b8';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('PDF', 0, 0);

                            ctx.textAlign = 'left';

                            ctx.textBaseline = 'alphabetic';

                        }

                    }

                    ctx.restore();

                });

            }

        };

        // Para multi_artes, usar a numeração específica de cada arte
        if (schema === 'multi_artes' && multiArteItem) {
            drawVdpElements(multiArteItem.numeracao, 1);
            drawVdpElements(multiArteItem.numeracao_2, 2);
        } else {
            drawVdpElements(num, 1);
            drawVdpElements(num2, 2);
        }



            ctx.restore();

        }

    }



    // Borda da folha

    ctx.strokeStyle = '#1e293b';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(0, 0, canvas.width, canvas.height);

}



window.toggleCutStackOptions = function() {
    const schema = document.getElementById('imp-schema').value;
    const container = document.getElementById('cut-stack-options');
    if (schema === 'cut_stack') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
};

window.toggleMultiArtes = function() {

    const schema = document.getElementById('imp-schema').value;

    const isMulti = schema === 'multi_artes';

    const container = document.getElementById('multi-artes-container');

    const startInput = document.getElementById('imp-start');

    const endInput = document.getElementById('imp-end');

    const dropArea = document.getElementById('imp-drop-area');

    const num1Select = document.getElementById('imp-numeracao');

    const num2Select = document.getElementById('imp-numeracao-2');



    if (isMulti) {

        container.style.display = 'block';

        if (startInput) startInput.parentElement.style.display = 'none';

        if (endInput) endInput.parentElement.style.display = 'none';

        if (dropArea) dropArea.style.display = 'none';

        const impInfo = document.getElementById('imp-file-info');

        if (impInfo) impInfo.style.display = 'none';

        if (num1Select) num1Select.parentElement.style.display = 'none';

        if (num2Select) num2Select.parentElement.style.display = 'none';

        

        if (state.impMultiArtes.length === 0) {

            addMultiArte(); // Add initial

        }

        renderMultiArtes();

    } else {

        container.style.display = 'none';

        if (startInput) startInput.parentElement.style.display = 'block';

        if (endInput) endInput.parentElement.style.display = 'block';

        if (dropArea) dropArea.style.display = 'flex'; // it's a flex container

        const impInfo = document.getElementById('imp-file-info');

        if (impInfo && impFile.files.length) impInfo.style.display = 'block';

        if (num1Select) num1Select.parentElement.style.display = 'block';

        if (num2Select) num2Select.parentElement.style.display = 'block';

    }

};



window.addMultiArte = function() {

    state.impMultiArtes.push({

        pdf_url: null,

        pdf_name: '',

        qtd: 1,

        nome: '',

        nome_color: '#000000',

        num1_id: '',

        num2_id: ''

    });

    renderMultiArtes();

    updateImpSummary();

};



window.removeMultiArte = function(index) {

    if (state.impMultiArtes.length <= 1) return toast('Precisa de pelo menos 1 arte.', 'error');

    state.impMultiArtes.splice(index, 1);

    renderMultiArtes();

    updateImpSummary();

};



window.updateMultiArte = function(index, field, value) {

    if (field === 'qtd') value = parseInt(value) || 0;

    state.impMultiArtes[index][field] = value;

    if (field === 'qtd') updateImpSummary();

    // Redesenhar preview quando campos visuais mudam
    if (field === 'nome' || field === 'nome_color' || field === 'qtd') drawPreview();

};



window.uploadMultiArtePdf = async function(index, fileInput) {

    if (!fileInput.files || !fileInput.files[0]) return;

    const file = fileInput.files[0];

    if (file.type !== "application/pdf") {

        toast("Por favor, selecione um arquivo PDF.", "error");

        fileInput.value = "";

        return;

    }

    

    // Mostra feedback de carregamento

    const btnId = `btn-upload-multi-${index}`;

    const btn = document.getElementById(btnId);

    if(btn) {

        btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;

        btn.disabled = true;

    }



    try {

        // Agora nós guardamos o arquivo cru na memória em vez de fazer upload para o Supabase

        state.impMultiArtes[index].rawFile = file;

        state.impMultiArtes[index].pdf_name = file.name;

        // Definimos uma url falsa apenas para controle interno e para evitar erros com lógicas legadas que verificam se pdf_url existe

        state.impMultiArtes[index].pdf_url = "local_file"; 



        if (typeof pdfjsLib !== 'undefined') {

            try {

                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const arrayBuffer = await file.arrayBuffer();

                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                state.impMultiArtes[index].pdfDoc = pdf;

                state.impMultiArtes[index].pagesCache = {};

                state.impMultiArtes[index].pagesRendering = {};

                

                const page = await pdf.getPage(1);

                const vp = page.getViewport({ scale: 1 });

                state.impMultiArtes[index].artWidth = vp.width;

                state.impMultiArtes[index].artHeight = vp.height;

            } catch (errPdf) {

                console.error("Erro ao carregar PDF local para preview Multi-Artes:", errPdf);

            }

        }



        toast(`PDF da Arte ${index + 1} carregado!`, "success");

    } catch (e) {

        console.error("Erro upload PDF Multi:", e);

        toast("Erro ao fazer upload do PDF.", "error");

    }

    renderMultiArtes();

    drawPreview();

};



window.renderMultiArtes = function() {

    const list = document.getElementById('multi-artes-list');

    if (!list) return;



    // Gerar options das numerações filtradas pelo formato da imposição
    const fmtSelect = document.getElementById('imp-formato');
    const selectedFmtId = fmtSelect ? fmtSelect.value : '';
    let filteredNums = state.numeracoes;
    if (selectedFmtId) {
        filteredNums = state.numeracoes.filter(n => {
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(selectedFmtId));
        });
    }
    const numOptions = `<option value="">- Nenhuma -</option>` + filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');



    list.innerHTML = state.impMultiArtes.map((a, i) => `

        <div style="display:flex; gap:10px; align-items:center; background:var(--bg-color); padding:10px; border-radius:6px; border:1px solid var(--border-color);">

            <div style="flex:2; display:flex; flex-direction:column; gap:4px;">

                <label style="font-size:0.75rem; color:var(--text-dim);">Arte (PDF Base)</label>

                <div style="display:flex; gap:5px; align-items:center;">

                    <button class="btn btn-sm ${(a.pdf_url && (a.pdf_url !== 'local_file' || a.rawFile)) ? 'btn-outline' : 'btn-primary'}" id="btn-upload-multi-${i}" onclick="document.getElementById('file-multi-${i}').click()" style="width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${a.pdf_name || 'Upload PDF'}">

                        ${a.rawFile ? '📄 ' + a.pdf_name : (a.pdf_url === 'local_file' ? '⚠️ Reenviar: ' + a.pdf_name : '📁 Escolher PDF')}

                    </button>


                    ${a.pdf_url === 'local_file' && !a.rawFile ? `<span style="color:#f59e0b;font-size:0.7rem;">⚠️ Faça o upload novamente</span>` : ''}
                    <input type="file" id="file-multi-${i}" accept=".pdf" style="display:none" onchange="uploadMultiArtePdf(${i}, this)">

                </div>

            </div>

            <div style="flex:1">

                <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px;">Qtd (un)</label>

                <input type="number" class="form-control" value="${a.qtd}" min="1" oninput="updateMultiArte(${i}, 'qtd', this.value)" style="height:32px; border-color:var(--blue);">

            </div>

            <div style="flex:1.5">

                <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px;">Nome (6 dígitos)</label>

                <div style="display:flex; gap:4px; align-items:center;">

                    <input type="text" class="form-control" value="${a.nome || ''}" maxlength="6" placeholder="000000" oninput="updateMultiArte(${i}, 'nome', this.value)" style="height:32px; font-weight:bold; font-size:14px; letter-spacing:1px; text-align:center;">

                    <input type="color" value="${a.nome_color || '#000000'}" onchange="updateMultiArte(${i}, 'nome_color', this.value)" title="Cor do nome" style="width:32px; height:32px; padding:0; border:1px solid var(--border-color); border-radius:4px; cursor:pointer;">

                </div>

            </div>

            <div style="flex:2">

                <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px;">${document.getElementById('imp-print-mode')?.value === 'duplex' ? 'Numeração FRENTE' : 'Numeração 1'}</label>

                <select class="form-control" style="height:32px; padding:0 5px;" onchange="updateMultiArte(${i}, 'num1_id', this.value)">

                    ${numOptions.replace(`value="${a.num1_id}"`, `value="${a.num1_id}" selected`)}

                </select>

            </div>

            <div style="flex:2">

                <label style="font-size:0.75rem; color:var(--text-dim); display:block; margin-bottom:4px;">${document.getElementById('imp-print-mode')?.value === 'duplex' ? 'Numeração VERSO' : 'Numeração 2'}</label>

                <select class="form-control" style="height:32px; padding:0 5px;" onchange="updateMultiArte(${i}, 'num2_id', this.value)">

                    ${numOptions.replace(`value="${a.num2_id}"`, `value="${a.num2_id}" selected`)}

                </select>

            </div>

            <button class="btn btn-outline" style="color:var(--red); border-color:var(--red); height:32px; padding:0 10px; margin-top:20px;" onclick="removeMultiArte(${i})" title="Remover">X</button>

        </div>

    `).join('');

};



window.changePreviewPage = function() {
    const input = document.getElementById('preview-page-input');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    window.currentPreviewPage = val;
    drawPreview();
};

window.prevPreviewPage = function() {
    if ((window.currentPreviewPage || 1) > 1) {
        window.currentPreviewPage = (window.currentPreviewPage || 1) - 1;
        const input = document.getElementById('preview-page-input');
        if (input) input.value = window.currentPreviewPage;
        drawPreview();
    }
};

window.nextPreviewPage = function() {
    window.currentPreviewPage = (window.currentPreviewPage || 1) + 1;
    const input = document.getElementById('preview-page-input');
    if (input) input.value = window.currentPreviewPage;
    drawPreview();
};

async function populateImpMapasTeatro() {
    const sel = document.getElementById('imp-mapa-teatro');
    if (!sel || sel.options.length > 1) return; // already populated

    let mapas = window.state.mapas || [];
    if (mapas.length === 0 && typeof supabaseClient !== 'undefined' && supabaseClient) {
        const { data } = await supabaseClient.from('producao_mapas_teatro').select('id, name').order('name', { ascending: true });
        if (data) mapas = data;
    }

    const current = sel.value;
    sel.innerHTML = '<option value="">-- Selecione um mapa --</option>' + mapas.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    if (current && mapas.some(m => String(m.id) === String(current))) {
        sel.value = current;
    }
}

let _lastLoadedMapaTeatro = null;
async function loadMapaTeatroData(mapaId) {
    if (!mapaId) {
        state.csvData = null;
        _lastLoadedMapaTeatro = null;
        drawPreview();
        return;
    }
    if (_lastLoadedMapaTeatro === String(mapaId)) return; // já carregado
    _lastLoadedMapaTeatro = String(mapaId);
    try {
        let mapa = null;
        if (window.state && window.state.mapas) {
            mapa = window.state.mapas.find(x => String(x.id) === String(mapaId));
        }
        
        if (!mapa) {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data, error } = await supabaseClient.from('producao_mapas_teatro').select('*').eq('id', mapaId).single();
                if (!error && data) mapa = data;
            } else {
                mapa = await api('GET', `/mapas_teatro/${mapaId}`);
            }
        }
        
        if (mapa && mapa.config && mapa.config.setores) {
            const tiposSufixos = {};
            if (mapa.config.tiposAssento) {
                for (const t of mapa.config.tiposAssento) {
                    tiposSufixos[t.id] = (t.sufixo || '').trim();
                }
            }

            const csvData = [];
            for (const setor of mapa.config.setores) {
                const cadeiras = setor.cadeiras || {};
                const assentos = Object.values(cadeiras);
                assentos.sort((a, b) => {
                    // Evita falha se y/x for nulo ou invalido
                    if (a.y != null && b.y != null && a.x != null && b.x != null) {
                        const ya = parseFloat(a.y), yb = parseFloat(b.y);
                        const xa = parseFloat(a.x), xb = parseFloat(b.x);
                        if (!isNaN(ya) && !isNaN(yb) && !isNaN(xa) && !isNaN(xb)) {
                            return (ya - yb) || (xa - xb);
                        }
                    }
                    const pa = String(a.prefixo || a.row_label || '');
                    const pb = String(b.prefixo || b.row_label || '');
                    if (pa !== pb) return pa.localeCompare(pb);
                    const na = parseInt(a.num || a.col_label) || 0;
                    const nb = parseInt(b.num || b.col_label) || 0;
                    return na - nb;
                });
                for (const a of assentos) {
                    if (a.tipo === 'Apagado' || a.isErased) continue;
                    let numStr = String(a.num || a.col_label || '');
                    const sufixo = tiposSufixos[a.tipo];
                    if (sufixo && sufixo !== "") {
                        numStr += " " + sufixo;
                    }
                    csvData.push({
                        Fila: String(a.prefixo || a.row_label || ''),
                        Numero: numStr,
                        Setor: String(setor.nome || '')
                    });
                }
            }
            state.csvData = csvData;
            console.log(`[Teatro] Mapa carregado: ${csvData.length} assentos`);
        } else {
            state.csvData = null;
        }
    } catch (err) {
        console.error('[Teatro] Erro ao carregar mapa:', err);
        state.csvData = null;
    }
    updateImpSummary();
    drawPreview();
}

function onImpNumeracaoSelect() {
    const numId = document.getElementById('imp-numeracao')?.value;
    if (numId && state.numeracoes) {
        const num = state.numeracoes.find(n => String(n.id) === String(numId));
        if (num && num.print_mode) {
            const printModeSelect = document.getElementById('imp-print-mode');
            if (printModeSelect) {
                printModeSelect.value = num.print_mode;
                if (typeof onImposicaoPrintModeChange === 'function') {
                    onImposicaoPrintModeChange(num.print_mode);
                }
            }
        }
    }
    updateImpSummary();
    if (typeof toggleImpNumEditButtons === 'function') toggleImpNumEditButtons();
}

function updateImpSummary() {
    const schema = document.getElementById('imp-schema')?.value || 'strict_assembly';
    const fmtSelect = document.getElementById('imp-formato');
    const numSelect = document.getElementById('imp-numeracao');
    const numSelect2 = document.getElementById('imp-numeracao-2');

    const fmtId = fmtSelect ? fmtSelect.value : '';
    const numId = numSelect ? numSelect.value : '';
    const num2Id = numSelect2 ? numSelect2.value : '';
    const saiId = document.getElementById('imp-saida')?.value || '';
    
    const num = (state.numeracoes && numId) ? (state.numeracoes.find(n => String(n.id) === String(numId)) || null) : null;
    const num2 = (state.numeracoes && num2Id) ? (state.numeracoes.find(n => String(n.id) === String(num2Id)) || null) : null;

    const start = parseInt(document.getElementById('imp-start')?.value, 10) || 1;
    const end = parseInt(document.getElementById('imp-end')?.value, 10) || 100;

    const box = document.getElementById('imp-summary');
    if (!box) return;



    const printMode = document.getElementById('imp-print-mode')?.value || 'front';

    const lblNum1 = document.getElementById('lbl-imp-num-1');

    const lblNum2 = document.getElementById('lbl-imp-num-2');

    if (lblNum1 && lblNum2) {

        if (printMode === 'duplex') {

            lblNum1.innerHTML = '2. Numeração <b style="color:var(--blue)">FRENTE</b> (opcional)';

            lblNum2.innerHTML = '3. Numeração <b style="color:var(--blue)">VERSO</b> (opcional)';

        } else {

            lblNum1.innerHTML = '2. Numeração 1 (opcional)';

            lblNum2.innerHTML = '3. Numeração 2 (opcional)';

        }

    }



    if (document.getElementById('imp-schema')?.value === 'multi_artes') {

        
        renderMultiArtes();

    }



    const lastFmtId = numSelect.getAttribute('data-last-fmt') || '';

    const currentFmtId = fmtSelect ? fmtSelect.value : '';



    if (currentFmtId !== lastFmtId) {

        const curNumVal = numSelect.value;

        const curNumVal2 = numSelect2 ? numSelect2.value : '';

        const filteredNums = currentFmtId ? state.numeracoes.filter(n => {
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(currentFmtId));
        }) : state.numeracoes;

        

        const optionsHtml = '<option value="">-- Sem numeração --</option>' + 

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');



        numSelect.innerHTML = optionsHtml;

        if (filteredNums.some(n => String(n.id) === String(curNumVal))) {

            numSelect.value = curNumVal;

        } else {

            numSelect.value = "";

        }

        numSelect.setAttribute('data-last-fmt', currentFmtId);



        if (numSelect2) {

            numSelect2.innerHTML = optionsHtml;

            if (filteredNums.some(n => String(n.id) === String(curNumVal2))) {

                numSelect2.value = curNumVal2;

            } else {

                numSelect2.value = "";

            }

        }

    }



    

    const isPdfMultiple = (schema === "pdf_multiple");



    // Atualizar modo de impressão no estado global

    const printModeEl = document.getElementById('imp-print-mode');

    state.printMode = printModeEl ? printModeEl.value : 'front';

    

    // Exibir/ocultar alternador de face para o preview

    const faceContainer = document.getElementById('preview-face-container');

    if (faceContainer) {

        if (state.printMode === 'duplex') {

            faceContainer.style.display = 'block';

        } else {

            faceContainer.style.display = 'none';

            state.previewFace = 'front';

            const btnFront = document.getElementById('btn-preview-front');

            const btnBack = document.getElementById('btn-preview-back');

            if (btnFront) {

                btnFront.style.background = 'var(--blue)';

                btnFront.style.color = 'white';

            }

            if (btnBack) {

                btnBack.style.background = 'rgba(255,255,255,0.06)';

                btnBack.style.color = 'var(--text-dim)';

            }

        }

    }



    if (isPdfMultiple) {

        const ms = document.getElementById('imp-mapa-teatro');
        if (!ms || !ms.value) {
            state.csvData = null;
        }

        state.csvFile = null;

        const totalPages = state.impArtPdfDoc ? state.impArtPdfDoc.numPages : 1;

        const finalItems = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

        

        // Travar e preencher campos

        const impStart = document.getElementById('imp-start');

        const impEnd = document.getElementById('imp-end');

        if (impStart) {

            impStart.value = 1;

            impStart.setAttribute('disabled', 'true');

        }

        if (impEnd) {

            impEnd.value = finalItems;

            impEnd.setAttribute('disabled', 'true');

        }

    } else if (num && num.csv_data && num.csv_data.length) {

        state.csvData = num.csv_data;

        state.csvFile = null; // Banco embutido

        

        // Travar e preencher campos

        const impStart = document.getElementById('imp-start');

        const impEnd = document.getElementById('imp-end');

        if (impStart) {

            impStart.value = 1;

            impStart.setAttribute('disabled', 'true');

        }

        if (impEnd) {

            impEnd.value = num.csv_data.length;

            impEnd.setAttribute('disabled', 'true');

        }

    } else {

        const csvFileEl = document.getElementById('csv-file');

        if (!csvFileEl || !csvFileEl.files.length) {

            const ms = document.getElementById('imp-mapa-teatro');
            if (!ms || !ms.value) {
                state.csvData = null;
            }

            state.csvFile = null;

        }

        

        const impStart = document.getElementById('imp-start');

        const impEnd = document.getElementById('imp-end');

        if (impStart) impStart.removeAttribute('disabled');

        if (impEnd) impEnd.removeAttribute('disabled');

    }

    const impMapaTeatroGroup = document.getElementById('imp-mapa-teatro-group');
    const impStartGroup = document.getElementById('imp-start-group');
    const impEndGroup = document.getElementById('imp-end-group');
    
    if ((num && num.tipo === 'TEATRO') || (num2 && num2.tipo === 'TEATRO')) {
        if (impMapaTeatroGroup) impMapaTeatroGroup.style.display = 'block';
        if (impStartGroup) impStartGroup.style.display = 'none';
        if (impEndGroup) impEndGroup.style.display = 'none';
        populateImpMapasTeatro();
        // Carregar dados do mapa de teatro selecionado
        const mapaTeatro = document.getElementById('imp-mapa-teatro');
        if (mapaTeatro && mapaTeatro.value) {
            loadMapaTeatroData(mapaTeatro.value);
        }
    } else {
        if (impMapaTeatroGroup) impMapaTeatroGroup.style.display = 'none';
        if (impStartGroup) impStartGroup.style.display = 'block';
        if (impEndGroup) impEndGroup.style.display = 'block';
    }




    if (!fmtId || !saiId) {

        box.style.display = 'none';

        drawPreview();

        return;

    }



    const fmt = state.formatos.find(f => f.id === fmtId);

    const sai = state.saidas.find(s => s.id === saiId);

    if (!fmt || !sai) {

        box.style.display = 'none';

        drawPreview();

        return;

    }



    let total = 1;

    if (isPdfMultiple) {

        const totalPages = state.impArtPdfDoc ? state.impArtPdfDoc.numPages : 1;

        total = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

    } else if (schema === 'multi_artes') {

        total = state.impMultiArtes.reduce((acc, a) => acc + (parseInt(a.qtd) || 0), 0);

        if (total < 1) total = 1;

    } else if (state.csvData) {

        total = state.csvData.length;

    } else {

        total = end - start + 1;

    }

    let ticket_qtd = 1;
    if (num && num.tipo === "TICKET") {
        ticket_qtd = parseInt(num.ticket_qtd) || 1;
    }

    const perSheet = fmt.cols * fmt.rows;
    const total_impressions = (num && num.tipo === "TICKET") ? Math.ceil(total / ticket_qtd) : total;
    let sheets = Math.ceil(total_impressions / perSheet);

    const cutstackMode = document.getElementById('imp-cutstack-mode')?.value;
    if (schema === 'cut_stack') {
        const stack_size = (parseInt(document.getElementById('imp-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('imp-block-depth')?.value) || 1);
        if (cutstackMode === 'strict') {
            const itemsPerSet = stack_size * perSheet;
            const sets_needed = Math.ceil(total_impressions / itemsPerSet);
            sheets = sets_needed * stack_size;
        }
    }



    box.style.display = 'grid';

    document.getElementById('sum-formato').textContent = `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)`;

    document.getElementById('sum-grade').textContent = `${fmt.cols} × ${fmt.rows} = ${perSheet} itens/folha`;

    document.getElementById('sum-total').textContent = total.toLocaleString('pt-BR');

    document.getElementById('sum-folhas').textContent = sheets.toLocaleString('pt-BR') + ' folha(s)';

    document.getElementById('sum-saida').textContent = `${sai.name} -- ${(sai.file_format || 'pdf').toUpperCase()}`;



    // Update steps

    ['step-1', 'step-2', 'step-3', 'step-4'].forEach((s, i) => {
        const el = document.getElementById(s);
        if (!el) return;
        el.classList.remove('done', 'active');
        el.classList.add(i < 3 ? 'done' : 'active');
    });



    drawPreview();

}

window.onImpNumeracaoSelect = onImpNumeracaoSelect;
window.updateImpSummary = updateImpSummary;

window.drawPreview = drawPreview;



// File drop

const impDrop = document.getElementById('imp-drop-area');

const impFile = document.getElementById('imp-file');

const impInfo = document.getElementById('imp-file-info');



impDrop.addEventListener('click', () => impFile.click());

impDrop.addEventListener('dragover', e => { e.preventDefault(); impDrop.classList.add('dragover'); });

impDrop.addEventListener('dragleave', () => impDrop.classList.remove('dragover'));

impDrop.addEventListener('drop', e => {

    e.preventDefault();

    impDrop.classList.remove('dragover');

    if (e.dataTransfer.files.length) {

        impFile.files = e.dataTransfer.files;

        showFileInfo();

    }

});

impFile.addEventListener('change', showFileInfo);



function showFileInfo() {

    if (impFile.files.length) {

        const f = impFile.files[0];



        // Validação da OS Ativa

        if (state.expectedArteName && f.name !== state.expectedArteName) {

            toast(`Erro: O arquivo selecionado "${f.name}" não coincide com a arte esperada pela OS ("${state.expectedArteName}").`, 'error');

            impFile.value = ''; // Reseta input

            

            // Restaura o aviso

            if (impInfo) {

                impInfo.innerHTML = `<span style="color: var(--blue); font-weight: bold;">⚠️ Selecione o arquivo novamente:</span> "${state.expectedArteName}"`;

                impInfo.style.display = 'block';

            }

            return;

        }



        const kb = (f.size / 1024).toFixed(0);

        impInfo.textContent = `✅ ${f.name} (${kb} KB)`;

        impInfo.style.display = 'block';

        // Mark step 4 as active

        document.getElementById('step-4')?.classList.add('active');

        loadImpArtFile(f);

    }

}



window._printCancelRequested = false;

function cancelarImpressaoOuGeracao() {
    console.warn('[Cancelamento] Cancelamento de impressão/geração acionado.');
    window._printCancelRequested = true;

    if (window.impositionAbortController) {
        try { window.impositionAbortController.abort(); } catch (_) {}
    }

    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');

    const btnCancelPed = document.getElementById('ped-btn-cancel-print');
    if (btnCancelPed) btnCancelPed.style.display = 'none';

    const btnImpose = document.getElementById('ped-btn-impose');
    if (btnImpose) btnImpose.style.display = 'inline-flex';
    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    if (btnImposePrint) btnImposePrint.style.display = 'inline-flex';

    window.isImposing = false;
    window.isPrinting = false;

    if (typeof toast === 'function') toast('🛑 Impressão / Geração cancelada imediatamente!', 'warning');
}
window.cancelarImpressaoOuGeracao = cancelarImpressaoOuGeracao;

let impositionAbortController = null;
window.isImposing = false;
window.runImposition = async function (mode, returnBlob = false) {
    if (window.isImposing) return;
    window.isImposing = true;
    try {

    let fmtId, numId, saiId, start, end, schema = 'sequential';
    const activeItem = state.activeOSItem;
    let isMultiSelected = false;
    let tempMultiArtes = null;

    if (state.selectedOSItems && state.selectedOSItems.length > 1) {
        isMultiSelected = true;
        const firstId = state.selectedOSItems[0].itemId;
        const firstOs = state.selectedOSItems[0].osId;
        const firstItem = state.osItens[firstOs]?.find(i => String(i.id) === String(firstId));
        if (firstItem) {
            fmtId = firstItem.formato_id;
            saiId = firstItem.saida_id;
            numId = firstItem.numeracao_id;
            // Para multi-seleção de modelos combinados, SEMPRE usar cut_stack
            schema = 'cut_stack';
        } else {
            schema = 'cut_stack';
        }

        tempMultiArtes = state.selectedOSItems.map(s => {
            const sItem = state.osItens[s.osId]?.find(i => String(i.id) === String(s.itemId));
            const qt = sItem ? parseInt(sItem.qtd !== undefined && sItem.qtd !== null ? sItem.qtd : (sItem.quantidade || 0)) : 0;
            
            const corObj = sItem && sItem.amostra_cor_id
                ? (state.cores || []).find(c => String(c.id) === String(sItem.amostra_cor_id))
                : (sItem ? (state.cores || []).find(c => globalFuzzyMatch(c.name, sItem.cor || sItem.padrao || '')) : null);
            const arteViaCor = corObj ? (corObj.pdf_url || null) : null;
            const itemArteUrl = sItem ? sItem.arte_url || arteViaCor : null;
            
            const wantsDuplex = sItem ? !!(sItem.verso_tipo && sItem.verso_tipo !== 'Frente') : false;
            const arteVersoViaCor = corObj ? (corObj.pdf_verso_base64 || corObj.pdf_verso_url || null) : null;
            const itemArteVersoUrl = (sItem && wantsDuplex) ? (sItem.verso_arte_url || sItem.url_arquivo_arte_verso || arteVersoViaCor) : null;
            
            const filenameFromUrl = itemArteUrl && itemArteUrl.startsWith('http')
                ? decodeURIComponent(itemArteUrl.split('/').pop().split('?')[0])
                : null;
            const itemPdfName = filenameFromUrl || (sItem ? sItem.nome_arquivo_arte : null) || (corObj ? `${corObj.name}.pdf` : `Arte_${sItem ? sItem.modelo : 'Modelo'}.pdf`);

            return {
                qtd: qt,
                nome: sItem ? sItem.modelo : '',
                num1_id: sItem ? (sItem.numeracao_id || sItem.amostra_num_id || numId) : numId,
                num2_id: null,
                start: sItem ? parseInt(sItem.num_inicial !== undefined && sItem.num_inicial !== null ? sItem.num_inicial : (sItem.numeracao_inicio || 1)) : 1,
                has_raw_file: false,
                is_selected: true,
                amostra_cor_id: sItem ? sItem.amostra_cor_id : null,
                pdf_url: itemArteUrl,
                pdf_verso_url: itemArteVersoUrl,
                pdf_name: itemPdfName,
                rawFile: null,
                nome_color: '#000000'
            };
        });
    } else if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            fmtId = item.formato_id;
            numId = item.numeracao_id;
            saiId = item.saida_id;
            if (!saiId && fmtId) {
                const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
                if (fmtObj) saiId = fmtObj.default_saida_id;
            }
            start = item.num_inicial !== undefined && item.num_inicial !== null ? parseInt(item.num_inicial) : (parseInt(item.numeracao_inicio) || 1);
            end = item.num_final !== undefined && item.num_final !== null ? parseInt(item.num_final) : (parseInt(item.numeracao_fim) || 100);
            const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
            schema = fmtObj ? fmtObj.default_schema : 'sequential';
        }
    } else {
        fmtId = document.getElementById('imp-formato')?.value;
        numId = document.getElementById('imp-numeracao')?.value;
        saiId = document.getElementById('imp-saida')?.value;
        start = parseInt(document.getElementById('imp-start')?.value) || 1;
        end = parseInt(document.getElementById('imp-end')?.value) || 100;
        schema = document.getElementById('imp-schema')?.value || 'sequential';
    }

    const isPedTab = document.getElementById('view-pedido')?.classList.contains('active');
    const rotateEl = isPedTab ? document.getElementById('ped-rotate-page') : document.getElementById('imp-rotate-page');
    const rotatePage = rotateEl ? (parseInt(rotateEl.value) || 0) : 0;

    if (!fmtId) return toast('Selecione um Formato.', 'error');

    const formato = state.formatos.find(f => String(f.id) === String(fmtId));
    if (!formato) return toast('Formato não encontrado no sistema.', 'error');

    if (isMultiSelected) {
        // Multi-seleção: schema e cut_stack_mode já foram definidos acima como hardcode
        // Apenas pegar saiId do formato se não existir
        if (!saiId) saiId = formato.default_saida_id;
        if (!saiId) {
            saiId = document.getElementById('ped-saida')?.value || document.getElementById('imp-saida')?.value;
        }
    } else if (state.activeOSItem) {
        if (formato.default_schema) schema = formato.default_schema;
        if (formato.default_saida_id) saiId = formato.default_saida_id;
        
        if (!schema) {
            return toast(`O formato "${formato.name}" não possui uma Regra de Paginação configurada.`, 'error');
        }
        if (!saiId) {
            return toast(`O formato "${formato.name}" não possui uma Saída Padrão configurada.`, 'error');
        }
    } else {
        // Modo manual: ler os valores selecionados nos dropdowns da tela
        schema = document.getElementById('imp-schema')?.value || formato.default_schema || 'sequential';
        saiId = document.getElementById('imp-saida')?.value || formato.default_saida_id || saiId;
        
        if (!schema) return toast('Selecione uma Regra de Paginação.', 'error');
        if (!saiId) return toast('Selecione uma Saída.', 'error');
    }

    

    if (schema === 'multi_artes' || isMultiSelected) {

        // Valida se todas as artes da lista têm PDF carregado, caso não seja multi seleção virtual

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        if (!isMultiSelected) {
            for (let i = 0; i < artesList.length; i++) {

                if (!artesList[i].pdf_url || (artesList[i].pdf_url === 'local_file' && !artesList[i].rawFile)) {

                    return toast(`Arte ${i + 1}: faça o upload do PDF da arte (necessário a cada sessão).`, 'error');

                }

            }
        } else {
            for (let i = 0; i < artesList.length; i++) {
                if (!artesList[i].pdf_url) {
                    return toast(`O modelo "${artesList[i].nome}" não possui arte cadastrada nem cor vinculada.`, 'error');
                }
            }
        }

    } else {
        // Não exige arte, permite gerar apenas com a numeração
    }

    

    if (schema !== 'multi_artes' && schema !== 'pdf_multiple') {

        if (start > end) return toast('Número inicial deve ser menor que o final.', 'error');

    }



    const saida = state.saidas.find(s => s.id === saiId);



    // 1. SOLICITAR DESTINO DO ARQUIVO IMEDIATAMENTE (dentro do clique do usuário para manter o gesto ativo)

    let directoryHandle = null;
    let fileHandle = null;

    // Obter o código do modelo para usar no nome do arquivo
    let modeloNum = '';
    if (isMultiSelected && state.selectedOSItems && state.selectedOSItems.length > 0) {
        const firstSel = state.selectedOSItems[0];
        const firstItem = state.osItens[firstSel.osId]?.find(i => String(i.id) === String(firstSel.itemId));
        if (firstItem && firstItem.modelo) {
            modeloNum = firstItem.modelo;
        }
    } else if (state.activeOSItem) {
        const itens = state.osItens[state.activeOSItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(state.activeOSItem.itemId));
        if (item && item.modelo) {
            modeloNum = item.modelo;
        }
    }

    const suffix = schema === "pdf_multiple" ? "Paginado" : `${start}-${end}`;
    const defaultFilename = modeloNum ? `${modeloNum}.pdf` : `VDP_${formato.name.replace(/\s+/g, '_')}_${suffix}.pdf`;

    if (window.showDirectoryPicker && mode !== 'print' && !returnBlob) {
        try {
            directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                return;
            }
            console.error("Erro ao abrir showDirectoryPicker:", err);
        }
    }

    // Fallback se showDirectoryPicker não estiver disponível
    if (!directoryHandle && window.showSaveFilePicker && mode !== 'print' && !returnBlob) {
        try {
            const options = {
                suggestedName: defaultFilename,
                types: [{
                    description: 'PDF Document',
                    accept: {
                        'application/pdf': ['.pdf'],
                    },
                }],
            };
            fileHandle = await window.showSaveFilePicker(options);
        } catch (err) {
            if (err.name === 'AbortError') {
                return;
            }
            console.error("Erro ao abrir showSaveFilePicker no início:", err);
        }
    }



    const numeracao = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;

    const num2Id = document.getElementById('imp-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;



    let payloadMultiArtes = [];

    if (schema === 'multi_artes' || isMultiSelected) {

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;

        payloadMultiArtes = artesList.map(arte => {

            return {

                qtd: arte.qtd,

                pdf_url: arte.pdf_url,
                
                pdf_verso_url: arte.pdf_verso_url || null,

                pdf_name: arte.pdf_name,

                nome: arte.nome || '',

                nome_color: arte.nome_color || '#000000',

                num1_id: arte.num1_id,

                num2_id: arte.num2_id,

                start: arte.start,

                numeracao: state.numeracoes.find(n => String(n.id) === String(arte.num1_id)) || null,

                numeracao_2: state.numeracoes.find(n => String(n.id) === String(arte.num2_id)) || null,

                has_raw_file: !!arte.rawFile

            };

        });

    }



    let payloadNumeracao = numeracao ? JSON.parse(JSON.stringify(numeracao)) : null;
    if (payloadNumeracao && state.csvData) {
        payloadNumeracao.csv_data = state.csvData;
    }

    // Injetar arquivo_url (URL TTF) nos elementos de numeração para que o engine
    // Python possa baixar fontes web mesmo sem acesso à tabela catalogo_fontes.
    function _injectFontUrls(numObj) {
        if (!numObj || !numObj.elements || !state_fonts.catalogo) return;
        const catMap = {};
        for (const f of state_fonts.catalogo) {
            if (f.arquivo_url && f.font_family) {
                catMap[f.font_family.toLowerCase().trim()] = f.arquivo_url;
                if (f.nome) catMap[f.nome.toLowerCase().trim()] = f.arquivo_url;
            }
        }
        for (const el of numObj.elements) {
            if (el.arquivo_url || el.font_url || el._font_data) continue; // já tem
            const fn = (el.font_name || '').trim().toLowerCase();
            if (fn && catMap[fn]) {
                el.arquivo_url = catMap[fn];
            }
        }
    }
    _injectFontUrls(payloadNumeracao);
    // Injetar arquivo_url nas numerações de multi-artes para fontes web
    for (const ma of payloadMultiArtes) {
        if (ma.numeracao) _injectFontUrls(ma.numeracao);
        if (ma.numeracao_2) _injectFontUrls(ma.numeracao_2);
    }

    const payload = {

        formato_id: fmtId,

        suggested_filename: defaultFilename,

        stream: true,

        numeracao_id: numId || null,

        numeracao_2_id: num2Id || null,
        
        mapa_teatro_id: document.getElementById('imp-mapa-teatro')?.value || null,

        saida_id: saiId,

        formato: formato,

        saida: saida,

        numeracao: payloadNumeracao,

        numeracao_2: (() => {
            if (!num2) return null;
            const copy = JSON.parse(JSON.stringify(num2));
            _injectFontUrls(copy);
            return copy;
        })(),

        seq_start: start,

        seq_end: end,

        seq_increment: 1,

        schema,
        // DIAG: remover após validar
        _diag_schema: schema,
        _diag_cut_stack_mode: (isMultiSelected || state.activeOSItem) ? (document.getElementById('ped-cutstack-mode')?.value || 'independent') : (document.getElementById('imp-cutstack-mode')?.value || 'independent'),

        print_mode: state.printMode,

        rotate_page: rotatePage,

        multi_artes: payloadMultiArtes,

        cut_stack_mode: isMultiSelected ? 'strict_assembly' : ((state.activeOSItem) ? (document.getElementById('ped-cutstack-mode')?.value || 'independent') : (document.getElementById('imp-cutstack-mode')?.value || 'independent')),

        sheets_per_block: isMultiSelected ? (() => {
            const firstSel = state.selectedOSItems.find(sel => {
                const si = state.osItens[sel.osId]?.find(i => String(i.id) === String(sel.itemId));
                return si && si.bloco && parseInt(si.bloco) > 0;
            });
            if (firstSel) {
                const si = state.osItens[firstSel.osId]?.find(i => String(i.id) === String(firstSel.itemId));
                return parseInt(si.bloco);
            }
            return parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50;
        })() : ((state.activeOSItem && state.osItens[state.activeOSItem.osId] && state.osItens[state.activeOSItem.osId].find(i => String(i.id) === String(state.activeOSItem.itemId))?.bloco) ? parseInt(state.osItens[state.activeOSItem.osId].find(i => String(i.id) === String(state.activeOSItem.itemId)).bloco) : ((state.activeOSItem) ? (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) : (parseInt(document.getElementById('imp-sheets-per-block')?.value) || 50))),

        block_depth: (isMultiSelected || state.activeOSItem) ? (parseInt(document.getElementById('ped-block-depth')?.value) || 1) : (parseInt(document.getElementById('imp-block-depth')?.value) || 1),

        cor_id: (state.activeOSItem && state.osItens[state.activeOSItem.osId]) ? (state.osItens[state.activeOSItem.osId].find(i => String(i.id) === String(state.activeOSItem.itemId))?.amostra_cor_id || null) : null,

        c_ini: isMultiSelected ? 1 : (parseInt(document.getElementById('ped-c-ini')?.value) || parseInt(document.getElementById('imp-c-ini')?.value) || 1),

        q_cam: isMultiSelected ? 0 : (parseInt(document.getElementById('ped-q-cam')?.value) || parseInt(document.getElementById('imp-q-cam')?.value) || 0),

        l_cam: isMultiSelected ? 1 : (parseInt(document.getElementById('ped-l-cam')?.value) || parseInt(document.getElementById('imp-l-cam')?.value) || 1),

        refazer_de: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-de')?.value) || 0) : 0,
        refazer_ate: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-ate')?.value) || 0) : 0,
        refazer_set: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-set')?.value) || 1) : 1,

        is_color_template: state.isColorTemplate || false

    };

    console.log('[DIAG runImposition] schema=', payload.schema, 'cut_stack_mode=', payload.cut_stack_mode, 'sheets_per_block=', payload.sheets_per_block, 'multi_artes_count=', payload.multi_artes?.length, 'isMultiSelected=', isMultiSelected);

    const formData = new FormData();
    let selectedFile = null;
    if (isPedTab) {
        if (state.pedArtFile) {
            selectedFile = state.pedArtFile;
        } else {
            const pedFile = document.getElementById('ped-file');
            if (pedFile && pedFile.files.length > 0) {
                selectedFile = pedFile.files[0];
            }
        }
    } else {
        if (state.impArtFile) {
            selectedFile = state.impArtFile;
        } else {
            const impFile = document.getElementById('imp-file');
            if (impFile && impFile.files.length > 0) {
                selectedFile = impFile.files[0];
            }
        }
    }
    if (selectedFile) {
        formData.append('file', selectedFile);
    }

    if (state.csvFile) {

        formData.append('csv_file', state.csvFile);

    }

    if (schema === 'multi_artes' && !isMultiSelected) {

        state.impMultiArtes.forEach((arte, i) => { if (arte.rawFile) { formData.append('multi_artes_files', arte.rawFile); formData.append('ma_file_' + i, arte.rawFile); } });

    }



    formData.append('payload', JSON.stringify(payload, (key, value) => {

        // Filtrar propriedades internas do frontend (não-serializáveis ou irrelevantes ao backend)

        if (key === '_svgImage' || key === '_pdfPreview' || key === '_pdfCanvas' || key === '_pdfLoading' ||

            key === 'pdfDoc' || key === 'pagesCache' || key === 'pagesRendering' || key === 'rawFile') {

            return undefined;

        }

        return value;

    }));



    const overlay = document.getElementById('loading-overlay');

    const sub = document.getElementById('loading-sub');

    const pBar = document.getElementById('loading-progress-bar');

    const pText = document.getElementById('loading-progress-text');



    // Calcular o total correto de itens baseando-se no esquema

    const isPdfMultiple = schema === "pdf_multiple";

    let total = 1;

    if (isPdfMultiple) {

        const totalPages = state.impArtPdfDoc ? state.impArtPdfDoc.numPages : 1;

        total = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

    } else if (schema === 'multi_artes') {

        total = state.impMultiArtes.reduce((acc, a) => acc + (parseInt(a.qtd) || 0), 0);

    } else if (state.csvData) {

        total = state.csvData.length;

    } else {

        total = end - start + 1;

    }



    overlay.classList.add('active');

    sub.textContent = `Gerando ${total.toLocaleString('pt-BR')} itens...`;

    if (pBar) pBar.style.width = '0%';

    if (pText) pText.textContent = 'Iniciando... (0%)';

    document.getElementById('btn-impose').disabled = true;



    window._printCancelRequested = false;

    // Instancia o AbortController e associa ao botão de cancelamento
    impositionAbortController = new AbortController();
    window.impositionAbortController = impositionAbortController;

    const cancelBtn = document.getElementById('btn-cancel-imposition');
    if (cancelBtn) {
        cancelBtn.innerHTML = '🛑 Cancelar Impressão / Geração';
        cancelBtn.onclick = () => {
            if (typeof window.cancelarImpressaoOuGeracao === 'function') {
                window.cancelarImpressaoOuGeracao();
            } else if (impositionAbortController) {
                impositionAbortController.abort();
            }
        };
    }



    let progress = 0;

    let progressInterval = setInterval(() => {

        if (progress < 90) {

            const increment = Math.max(1, Math.floor((90 - progress) * 0.1));

            progress += increment;

        } else if (progress < 98) {

            progress += 0.5;

        }

        if (pBar) pBar.style.width = `${progress}%`;

        if (pText) pText.textContent = `Processando... (${Math.floor(progress)}%)`;

    }, 300);



    try {

        let baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

        

        // 1. Verificar primeiro se o servidor FastAPI principal está rodando localmente (porta 8080)

        let localApiActive = false;

        try {

            const controller8080 = new AbortController();

            const timeoutId8080 = setTimeout(() => controller8080.abort(), 500);

            const apiCheck = await fetch("http://localhost:8080/api/formatos", { 

                method: "GET",

                signal: controller8080.signal 

            }).catch(() => null);

            clearTimeout(timeoutId8080);

            if (apiCheck && (apiCheck.ok || apiCheck.status === 401 || apiCheck.status === 403)) {

                localApiActive = true;

            }

        } catch (_) {}



        // 2. Verificar se o Agente Local (porta 9000) esta ativo
        // Tenta 127.0.0.1 e localhost (HTTPS->HTTP mixed content e tratado como excecao para loopback)
        let localActive = false;
        let agentBaseUrl = "";

        if (!localApiActive) {
            // Testa / e /api/status para compatibilidade com todas as versoes do exe
            const agentBases = ["http://127.0.0.1:9000", "http://localhost:9000"];
            if (window._activeAgentData && window._activeAgentData.printers_json && window._activeAgentData.printers_json.local_ip) {
                const rip = `http://${window._activeAgentData.printers_json.local_ip}:9000`;
                if (!agentBases.includes(rip)) {
                    agentBases.push(rip);
                }
            }
            outerLoop:
            for (const base of agentBases) {
                for (const path of ["/api/status", "/"]) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2000);
                        const agentCheck = await fetch(`${base}${path}`, {
                            method: "GET",
                            mode: "cors",
                            signal: controller.signal
                        }).catch(() => null);
                        clearTimeout(timeoutId);
                        if (agentCheck && agentCheck.ok) {
                            const ct = agentCheck.headers.get("content-type") || "";
                            if (ct.includes("application/json")) {
                                const checkData = await agentCheck.json().catch(() => ({}));
                                if (checkData.status === "running") {
                                    localActive = true;
                                    agentBaseUrl = base;
                                    
                                    // Verificar se o agente está desatualizado em relação à nuvem
                                    const localVer = checkData.version;
                                    if (localVer) {
                                        const verEl = document.getElementById('newprod-version-display');
                                        if (verEl) verEl.textContent = localVer;
                                        fetch('/api/version')
                                            .then(r => r.ok ? r.json() : null)
                                            .then(cloudData => {
                                                if (cloudData && cloudData.version && cloudData.version !== localVer) {
                                                    console.warn(`[Agent Update] Agente Local desatualizado: ${localVer} -> ${cloudData.version}`);
                                                    if (typeof showAgentUpdateWarning === 'function') {
                                                        showAgentUpdateWarning(base, cloudData.version);
                                                    }
                                                }
                                            })
                                            .catch(err => console.warn('Erro ao verificar versão cloud:', err));
                                    }
                                    
                                    break outerLoop;
                                }
                            }
                        }
                    } catch (_) {}
                }
            }
        }



        if (localApiActive) {

            baseUrl = "http://localhost:8080";

            console.log("[Imposition] Servidor local (porta 8080) detectado -- processando localmente para maxima velocidade");

            if (sub) sub.innerHTML = `Gerando ${total.toLocaleString('pt-BR')} itens... <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 2px 8px rgba(34,197,94,0.35);vertical-align:middle;">&#9889; SERVIDOR LOCAL</span>`;

        } else if (localActive) {

            baseUrl = agentBaseUrl;

            console.log("[Imposition] Processando via agente local (porta 9000)");

            if (sub) sub.innerHTML = `Gerando ${total.toLocaleString('pt-BR')} itens... <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 2px 8px rgba(34,197,94,0.35);vertical-align:middle;">&#9889; AGENTE LOCAL</span>`;

        } else {

            console.log("[Imposition] Processando na nuvem (Render)");

            if (sub) sub.innerHTML = `Gerando ${total.toLocaleString('pt-BR')} itens... <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.35);vertical-align:middle;">&#9729; NUVEM</span>`;

        }

        function updateAgentStatusFooterBadge(localActive, version) {
            const dot = document.getElementById('agent-status-dot');
            const text = document.getElementById('agent-version-text');
            if (!dot || !text) return;

            if (localActive) {
                const verName = version || "NewProd 1.1";
                text.textContent = verName.includes("NewProd") ? verName : `NewProd 1.1 (${verName})`;
                dot.style.background = "#22c55e";
                dot.style.boxShadow = "0 0 8px #22c55e";
            } else {
                text.textContent = "NewProd 1.1 (Offline)";
                dot.style.background = "#f43f5e";
                dot.style.boxShadow = "0 0 8px #f43f5e";
            }
        }
        window.updateAgentStatusFooterBadge = updateAgentStatusFooterBadge;

        

        const headers = {};

        // Usar token de sessão do Supabase Auth (se disponível)
        if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {

            try {

                const { data: { session } } = await supabaseClient.auth.getSession();

                if (session && session.access_token) {

                    headers['Authorization'] = `Bearer ${session.access_token}`;

                }

            } catch (e) {

                console.error("Erro ao obter Supabase Auth Token:", e);

            }

        }



        const res = await fetch(`${baseUrl}/api/impose`, { 

            method: 'POST', 

            headers: headers,

            body: formData,

            signal: impositionAbortController.signal

        });

        if (!res.ok) {

            const err = await res.json();

            throw new Error(err.detail || 'Erro no servidor');

        }

        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/event-stream")) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            let currentEvent = null;
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                // Manter a última linha (incompleta) no buffer
                buffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;

                    if (cleanLine.startsWith("event:")) {
                        currentEvent = cleanLine.substring(6).trim();
                    } else if (cleanLine.startsWith("data:")) {
                        const dataStr = cleanLine.substring(5).trim();
                        if (currentEvent === "file" && dataStr) {
                            try {
                                const fileObj = JSON.parse(dataStr);
                                const binStr = atob(fileObj.data);
                                const bytes = new Uint8Array(binStr.length);
                                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                                const fBlob = new Blob([bytes], {type: "application/pdf"});

                                const fallbackDownload = async () => {
                                    toast(`Baixando: ${fileObj.name}...`, 'info');
                                    const url = window.URL.createObjectURL(fBlob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = fileObj.name;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    window.URL.revokeObjectURL(url);
                                    await new Promise(r => setTimeout(r, 200));
                                };

                                if (directoryHandle) {
                                    try {
                                        toast(`Salvando: ${fileObj.name}...`, 'info');
                                        const fh = await directoryHandle.getFileHandle(fileObj.name, { create: true });
                                        const writable = await fh.createWritable();
                                        await writable.write(fBlob);
                                        await writable.close();
                                    } catch (saveErr) {
                                        console.warn(`[Fallback] Erro ao salvar "${fileObj.name}" na pasta. Tentando download normal...`, saveErr);
                                        await fallbackDownload();
                                    }
                                } else {
                                    await fallbackDownload();
                                }
                            } catch (e) {
                                console.error("Erro ao processar arquivo do stream:", e);
                                toast(`Erro ao salvar arquivo do lote: ${e.message}`, 'error');
                            }
                        } else if (currentEvent === "error" && dataStr) {
                            try {
                                const errObj = JSON.parse(dataStr);
                                throw new Error(errObj.message || "Erro desconhecido no processamento");
                            } catch (e) {
                                throw e;
                            }
                        }
                    }
                }
            }

            toast('Processo de imposição concluído e arquivos salvos!', 'success');
            if (state.activeOSItem && state.activeOSItem.itemId) {
                await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
            }
            return;
        }

        // Fallbacks caso não venha como stream (JSON ou blob de arquivo único direto)
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.type === "multi_file") {
                toast(`Salvando ${data.files.length} arquivos...`, 'info');
                for (const f of data.files) {
                    const binStr = atob(f.data);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) {
                        bytes[i] = binStr.charCodeAt(i);
                    }
                    const fBlob = new Blob([bytes], {type: "application/pdf"});
                    
                    if (directoryHandle) {
                        try {
                            const fh = await directoryHandle.getFileHandle(f.name, { create: true });
                            const writable = await fh.createWritable();
                            await writable.write(fBlob);
                            await writable.close();
                        } catch (errSave) {
                            console.error(`Erro ao salvar ${f.name} na pasta:`, errSave);
                        }
                    } else {
                        const url = window.URL.createObjectURL(fBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = f.name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
                
                toast('Arquivos de imposição salvos na pasta com sucesso!', 'success');
                
                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
                }
                return;
            }
        }

        const blob = await res.blob();

        if (directoryHandle) {
            try {
                const finalFilename = defaultFilename;
                const fh = await directoryHandle.getFileHandle(finalFilename, { create: true });
                const writable = await fh.createWritable();
                await writable.write(blob);
                await writable.close();

                toast('PDF salvo com sucesso!', 'success');

                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
                }
                return;
            } catch (errSave) {
                console.error("Falha ao salvar PDF na pasta escolhida, usando fallback:", errSave);
            }
        }

        // Salvar os dados no fileHandle já escolhido pelo usuário
        if (fileHandle) {
            try {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                toast('PDF salvo com sucesso!', 'success');
                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
                }
                return;
            } catch (err) {
                console.error("Falha ao salvar no arquivo escolhido previamente, usando fallback:", err);
            }
        }




        // Modo impressao direta: abrir modal em vez de download
        if (mode === 'print' && _printerAgentActive) {
            openPrintModal(blob);
            toast('PDF gerado! Selecione a impressora.', 'success');
            return;
        }

        // Fallback: Prompt para nome do arquivo + download convencional

        const filename = prompt('Digite o nome do arquivo para salvar o PDF:', defaultFilename);

        if (filename === null) return; // cancelado pelo usuario

        

        const finalFilename = filename.trim() || defaultFilename;

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        a.download = finalFilename.endsWith('.pdf') ? finalFilename : finalFilename + '.pdf';

        document.body.appendChild(a);

        a.click();

        URL.revokeObjectURL(url);

        document.body.removeChild(a);

        toast('PDF baixado com sucesso!', 'success');

        // Auto-atualizar status de impressao do item ativo da OS
        if (state.activeOSItem && state.activeOSItem.itemId) {
            await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
            if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
        }

    } catch (err) {

        if (err.name === 'AbortError') {

            toast('Geração do PDF cancelada pelo usuário.', 'info');

        } else {

            toast(`Erro: ${err.message}`, 'error');

        }

    } finally {

        if (progressInterval) clearInterval(progressInterval);

        if (pBar) pBar.style.width = '100%';

        if (pText) pText.textContent = 'Concluído! (100%)';

        setTimeout(() => {
            overlay.classList.remove('active');
            const btn = document.getElementById('btn-impose');
            btn.disabled = false;
            btn.innerHTML = '🚀 Gerar PDF';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }, 400);
        impositionAbortController = null;

    }

    } finally {
        window.isImposing = false;
    }

};;



// - Init -

loadAll();



// - Formato Preview -

function drawFormatPreview() {

    const canvas = document.getElementById('fmt-preview-canvas');

    if (!canvas) return;



    const width_mm = Math.max(1, parseFloat(document.getElementById('fmt-w').value) || 0);

    const height_mm = Math.max(1, parseFloat(document.getElementById('fmt-h').value) || 0);

    const cols = Math.max(1, parseInt(document.getElementById('fmt-cols').value) || 0);

    const rows = Math.max(1, parseInt(document.getElementById('fmt-rows').value) || 0);

    const gap_h = Math.max(0, parseFloat(document.getElementById('fmt-gaph').value) || 0);

    const gap_v = Math.max(0, parseFloat(document.getElementById('fmt-gapv').value) || 0);

    const off_h = parseDecimalBR(document.getElementById('fmt-offh').value) || 0;

    const off_v = parseDecimalBR(document.getElementById('fmt-offv').value) || 0;



    // Validação visual inline enquanto digita

    const offhEl = document.getElementById('fmt-offh');

    const offvEl = document.getElementById('fmt-offv');

    if (offhEl) validateOffsetField(offhEl);

    if (offvEl) validateOffsetField(offvEl);



    // Atualizar texto do badge

    const badge = document.getElementById('fmt-preview-info');

    if (badge) {

        let badgeText = `Grade: ${cols}×${rows} * Total: ${cols * rows} itens`;

        if (off_h !== 0 || off_v !== 0) {

            badgeText += ` * Offset: ${off_h.toFixed(1)}×${off_v.toFixed(1)}mm`;

        }

        badge.textContent = badgeText;

    }



    const ctx = canvas.getContext('2d');



    // Calcular tamanho total em mm

    const total_w_mm = (cols * width_mm) + ((cols - 1) * gap_h);

    const total_h_mm = (rows * height_mm) + ((rows - 1) * gap_v);



    // Ajustar tamanho do canvas

    const max_w = 400;

    const max_h = 280;

    const padding = 20;



    // Escala para caber no canvas com padding

    const scale = Math.min((max_w - padding * 2) / total_w_mm, (max_h - padding * 2) / total_h_mm);



    canvas.width = max_w;

    canvas.height = max_h;



    // Limpar

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, max_w, max_h);



    // Centralizar o desenho no canvas

    const offset_x = (max_w - (total_w_mm * scale)) / 2;

    const offset_y = (max_h - (total_h_mm * scale)) / 2;



    // Desenhar fundo da "folha" ou área da grade

    ctx.strokeStyle = 'rgba(99, 120, 180, 0.2)';

    ctx.lineWidth = 1;

    ctx.setLineDash([4, 4]);

    ctx.strokeRect(offset_x, offset_y, total_w_mm * scale, total_h_mm * scale);

    ctx.setLineDash([]);



    // Desenhar itens

    for (let r = 0; r < rows; r++) {

        for (let c = 0; c < cols; c++) {

            const item_x = offset_x + c * (width_mm + gap_h) * scale;

            const item_y = offset_y + r * (height_mm + gap_v) * scale;

            const item_w = width_mm * scale;

            const item_h = height_mm * scale;



            const cellIdx = r * cols + c;

            const isSelected = (state.fmtSelectedCellIndex === cellIdx);



            // Retângulo do item (célula)

            ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.08)';

            ctx.strokeStyle = isSelected ? '#ef4444' : '#3b82f6';

            ctx.lineWidth = isSelected ? 3 : 1.5;

            ctx.fillRect(item_x, item_y, item_w, item_h);

            ctx.strokeRect(item_x, item_y, item_w, item_h);



            // Indicador de offset (se houver offset, desenhar seta do centro)

            if (off_h !== 0 || off_v !== 0) {

                const cx = item_x + item_w / 2;

                const cy = item_y + item_h / 2;

                const dx = off_h * scale;

                const dy = -off_v * scale; // positivo V = para cima → negativo no canvas

                const tx = cx + dx;

                const ty = cy + dy;



                // Linha de deslocamento

                ctx.strokeStyle = '#ef4444';

                ctx.lineWidth = 1.2;

                ctx.setLineDash([3, 2]);

                ctx.beginPath();

                ctx.moveTo(cx, cy);

                ctx.lineTo(tx, ty);

                ctx.stroke();

                ctx.setLineDash([]);



                // Ponto de destino

                ctx.fillStyle = '#ef4444';

                ctx.beginPath();

                ctx.arc(tx, ty, 3, 0, Math.PI * 2);

                ctx.fill();



                // Crosshair no centro (referência)

                ctx.strokeStyle = 'rgba(99, 120, 180, 0.4)';

                ctx.lineWidth = 0.6;

                ctx.beginPath();

                ctx.moveTo(cx - 6, cy);

                ctx.lineTo(cx + 6, cy);

                ctx.moveTo(cx, cy - 6);

                ctx.lineTo(cx, cy + 6);

                ctx.stroke();

            }



            // Conteúdo fictício simples (ex: "#1", "#2", ...) com rotação individual

            const rotationDeg = state.fmtRotations[cellIdx] || 0;

            ctx.save();

            ctx.translate(item_x + item_w / 2, item_y + item_h / 2);

            ctx.rotate((rotationDeg * Math.PI) / 180);



            // Desenhar pequena seta indicando o topo da página se houver rotação (ou sempre para ajudar visualmente)

            ctx.strokeStyle = '#94a3b8';

            ctx.lineWidth = 1;

            ctx.beginPath();

            ctx.moveTo(-6, -item_h * 0.35);

            ctx.lineTo(0, -item_h * 0.42);

            ctx.lineTo(6, -item_h * 0.35);

            ctx.stroke();



            ctx.fillStyle = rotationDeg !== 0 ? '#ef4444' : '#475569';

            ctx.font = `bold ${Math.max(8, Math.min(12, item_h * 0.25))}px Inter, sans-serif`;

            ctx.textAlign = 'center';

            ctx.textBaseline = 'middle';

            const num = cellIdx + 1;

            ctx.fillText(`#${num} (${rotationDeg}°)`, 0, 0);

            ctx.restore();

        }

    }



    // Desenhar marcações de Gap se houver mais de 1 col/row

    ctx.fillStyle = '#8b5cf6';

    ctx.font = '9px monospace';

    ctx.textAlign = 'center';



    if (cols > 1 && gap_h > 0) {

        // Mostrar linha do gap horizontal

        const first_x = offset_x + width_mm * scale;

        const gap_w = gap_h * scale;

        const mid_y = offset_y + (total_h_mm * scale) / 2;



        ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';

        ctx.fillRect(first_x, offset_y, gap_w, total_h_mm * scale);



        // Indicador de tamanho

        ctx.strokeStyle = '#8b5cf6';

        ctx.lineWidth = 0.8;

        ctx.beginPath();

        ctx.moveTo(first_x, mid_y);

        ctx.lineTo(first_x + gap_w, mid_y);

        ctx.stroke();



        ctx.fillStyle = '#8b5cf6';

        ctx.fillText(`${gap_h}mm`, first_x + gap_w / 2, mid_y - 4);

    }



    if (rows > 1 && gap_v > 0) {

        // Mostrar linha do gap vertical

        const first_y = offset_y + height_mm * scale;

        const gap_h_px = gap_v * scale;

        const mid_x = offset_x + (total_w_mm * scale) / 2;



        ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';

        ctx.fillRect(offset_x, first_y, total_w_mm * scale, gap_h_px);



        // Indicador de tamanho

        ctx.strokeStyle = '#8b5cf6';

        ctx.lineWidth = 0.8;

        ctx.beginPath();

        ctx.moveTo(mid_x, first_y);

        ctx.lineTo(mid_x, first_y + gap_h_px);

        ctx.stroke();



        ctx.fillStyle = '#8b5cf6';

        ctx.fillText(`${gap_v}mm`, mid_x + 18, first_y + gap_h_px / 2 + 3);

    }



    // Exibir área total em mm na parte inferior do canvas

    ctx.fillStyle = '#94a3b8';

    ctx.font = '9px Inter, sans-serif';

    ctx.textAlign = 'right';

    ctx.fillText(`${total_w_mm.toFixed(1)} × ${total_h_mm.toFixed(1)} mm`, max_w - 8, max_h - 8);

}



// Bind events for live preview (incluindo campos de offset)

['fmt-w', 'fmt-h', 'fmt-cols', 'fmt-rows', 'fmt-gaph', 'fmt-gapv', 'fmt-offh', 'fmt-offv'].forEach(id => {

    const el = document.getElementById(id);

    if (el) {

        el.addEventListener('input', () => {

            // Se mudar a quantidade de linhas ou colunas, reseta as rotações que ficarem órfãs

            const cols = Math.max(1, parseInt(document.getElementById('fmt-cols').value) || 0);

            const rows = Math.max(1, parseInt(document.getElementById('fmt-rows').value) || 0);

            const maxIdx = cols * rows;

            for (let key in state.fmtRotations) {

                if (parseInt(key) >= maxIdx) {

                    delete state.fmtRotations[key];

                }

            }

            if (state.fmtSelectedCellIndex !== null && state.fmtSelectedCellIndex >= maxIdx) {

                state.fmtSelectedCellIndex = null;

                updateRotationButtons();

            }

            drawFormatPreview();

        });

    }

});



// Funções para controle de rotação individual de páginas/células do formato

function updateRotationButtons() {

    const label = document.getElementById('rotation-selected-label');

    const buttons = [0, 90, 180, 270].map(angle => document.getElementById(`btn-rot-${angle}`));



    if (state.fmtSelectedCellIndex === null) {

        if (label) label.textContent = 'Nenhuma célula selecionada (clique em uma página acima)';

        buttons.forEach(btn => { if (btn) btn.disabled = true; });

    } else {

        const pageNum = state.fmtSelectedCellIndex + 1;

        const currentRot = state.fmtRotations[state.fmtSelectedCellIndex] || 0;

        if (label) label.textContent = `Página #${pageNum} selecionada (Rotação atual: ${currentRot}°)`;

        

        buttons.forEach(btn => {

            if (btn) {

                btn.disabled = false;

                // Destacar botão da rotação ativa

                const angle = parseInt(btn.id.replace('btn-rot-', ''));

                if (angle === currentRot) {

                    btn.classList.add('btn-primary');

                    btn.classList.remove('btn-secondary');

                } else {

                    btn.classList.add('btn-secondary');

                    btn.classList.remove('btn-primary');

                }

            }

        });

    }

}

window.updateRotationButtons = updateRotationButtons;



function setCellRotation(angle) {

    if (state.fmtSelectedCellIndex === null) return;

    if (angle === 0) {

        // 0° é o padrão, removemos a chave para limpar o dicionário

        delete state.fmtRotations[state.fmtSelectedCellIndex];

    } else {

        state.fmtRotations[state.fmtSelectedCellIndex] = angle;

    }

    updateRotationButtons();

    drawFormatPreview();

}

window.setCellRotation = setCellRotation;



// Registrar clique no canvas do formato para selecionar a célula

const fmtCanvas = document.getElementById('fmt-preview-canvas');

if (fmtCanvas) {

    fmtCanvas.addEventListener('click', function(e) {

        const rect = fmtCanvas.getBoundingClientRect();

        const mouseX = e.clientX - rect.left;

        const mouseY = e.clientY - rect.top;



        const width_mm = Math.max(1, parseFloat(document.getElementById('fmt-w').value) || 0);

        const height_mm = Math.max(1, parseFloat(document.getElementById('fmt-h').value) || 0);

        const cols = Math.max(1, parseInt(document.getElementById('fmt-cols').value) || 0);

        const rows = Math.max(1, parseInt(document.getElementById('fmt-rows').value) || 0);

        const gap_h = Math.max(0, parseFloat(document.getElementById('fmt-gaph').value) || 0);

        const gap_v = Math.max(0, parseFloat(document.getElementById('fmt-gapv').value) || 0);



        const total_w_mm = (cols * width_mm) + ((cols - 1) * gap_h);

        const total_h_mm = (rows * height_mm) + ((rows - 1) * gap_v);



        const max_w = 400;

        const max_h = 280;

        const padding = 20;

        const scale = Math.min((max_w - padding * 2) / total_w_mm, (max_h - padding * 2) / total_h_mm);



        const offset_x = (max_w - (total_w_mm * scale)) / 2;

        const offset_y = (max_h - (total_h_mm * scale)) / 2;



        // Verificar em qual célula o clique caiu

        let clickedIndex = null;

        for (let r = 0; r < rows; r++) {

            for (let c = 0; c < cols; c++) {

                const item_x = offset_x + c * (width_mm + gap_h) * scale;

                const item_y = offset_y + r * (height_mm + gap_v) * scale;

                const item_w = width_mm * scale;

                const item_h = height_mm * scale;



                if (mouseX >= item_x && mouseX <= item_x + item_w &&

                    mouseY >= item_y && mouseY <= item_y + item_h) {

                    clickedIndex = r * cols + c;

                    break;

                }

            }

            if (clickedIndex !== null) break;

        }



        if (clickedIndex !== null) {

            state.fmtSelectedCellIndex = clickedIndex;

        } else {

            state.fmtSelectedCellIndex = null;

        }



        updateRotationButtons();

        drawFormatPreview();

    });

}



// Render initial preview

drawFormatPreview();

window.drawFormatPreview = drawFormatPreview;



// - LÓGICA DE BANCO DE DADOS (CSV) -

window.clearCsvFile = function() {

    state.csvFile = null;

    state.csvData = null;

    const csvFileEl = document.getElementById('csv-file');

    const csvInfoEl = document.getElementById('csv-file-info');

    if (csvFileEl) csvFileEl.value = '';

    if (csvInfoEl) {

        csvInfoEl.textContent = '';

        csvInfoEl.style.display = 'none';

    }

    

    const impStart = document.getElementById('imp-start');

    const impEnd = document.getElementById('imp-end');

    if (impStart) impStart.removeAttribute('disabled');

    if (impEnd) impEnd.removeAttribute('disabled');

    

    drawPreview();

};



function initCsvUploadEvents() {

    const csvDrop = document.getElementById('csv-drop-area');

    const csvFile = document.getElementById('csv-file');

    if (!csvDrop || !csvFile || csvDrop._listenerSet) return;

    

    csvDrop.addEventListener('click', () => csvFile.click());

    csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.classList.add('dragover'); });

    csvDrop.addEventListener('dragleave', () => csvDrop.classList.remove('dragover'));

    csvDrop.addEventListener('drop', e => {

        e.preventDefault();

        csvDrop.classList.remove('dragover');

        if (e.dataTransfer.files.length) {

            csvFile.files = e.dataTransfer.files;

            handleCsvSelected();

        }

    });

    csvFile.addEventListener('change', handleCsvSelected);

    csvDrop._listenerSet = true;

}



async function handleCsvSelected() {

    const csvFileEl = document.getElementById('csv-file');

    if (csvFileEl.files.length) {

        const file = csvFileEl.files[0];

        state.csvFile = file;

        

        try {

            const text = await new Promise((resolve, reject) => {

                const reader = new FileReader();

                reader.onload = e => resolve(e.target.result);

                reader.onerror = e => reject(e.target.error);

                reader.readAsText(file);

            });

            

            state.csvData = parseCSVRows(text);

            

            const infoEl = document.getElementById('csv-file-info');

            infoEl.textContent = `✅ CSV carregado: ${file.name} (${state.csvData.length} registros)`;

            infoEl.style.display = 'block';

            

            const impStart = document.getElementById('imp-start');

            const impEnd = document.getElementById('imp-end');

            if (impStart) {

                impStart.value = 1;

                impStart.setAttribute('disabled', 'true');

            }

            if (impEnd) {

                impEnd.value = state.csvData.length;

                impEnd.setAttribute('disabled', 'true');

            }

            

            toast('Banco de dados carregado com sucesso!', 'success');

            updateImpSummary();

        } catch (err) {

            toast('Erro ao processar CSV: ' + err.message, 'error');

            clearCsvFile();

        }

    }

}



function parseCSVRows(text) {

    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length <= 1) return [];

    

    let delimiter = ',';

    if (lines[0].includes(';')) {

        delimiter = ';';

    }

    

    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

    const rows = [];

    for (let i = 1; i < lines.length; i++) {

        const currentline = lines[i].split(delimiter);

        const obj = {};

        for (let j = 0; j < headers.length; j++) {

            obj[headers[j]] = (currentline[j] || '').trim().replace(/^["']|["']$/g, '');

        }

        rows.push(obj);

    }

    return rows;

}



// Inicializar listeners do CSV do Editor

document.addEventListener('DOMContentLoaded', () => {

    initNumCsvEvents();

});

(function() {

    initNumCsvEvents();

})();



function initNumCsvEvents() {

    const fileEl = document.getElementById('num-csv-file');

    if (fileEl && !fileEl._listenerSet) {

        fileEl.addEventListener('change', handleNumCsvSelected);

        fileEl._listenerSet = true;

    }

}



async function handleNumCsvSelected() {

    const fileEl = document.getElementById('num-csv-file');

    if (fileEl && fileEl.files.length) {

        const file = fileEl.files[0];

        try {

            const text = await new Promise((resolve, reject) => {

                const reader = new FileReader();

                reader.onload = e => resolve(e.target.result);

                reader.onerror = e => reject(e.target.error);

                reader.readAsText(file);

            });

            

            const rows = parseCSVRows(text);

            if (!rows.length) {

                throw new Error("O arquivo CSV está vazio ou é inválido.");

            }

            

            let delimiter = ',';

            if (text.split('\n')[0].includes(';')) {

                delimiter = ';';

            }

            const headers = text.split('\n')[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

            

            state.numCsvHeaders = headers;

            state.numCsvData = rows;

            state.numCsvFilename = file.name;

            

            renderNumCsvInterface();

            toast('CSV carregado no editor!', 'success');

        } catch (e) {

            toast('Erro ao ler CSV: ' + e.message, 'error');

            clearNumCsvFile();

        }

    }

}



window.clearNumCsvFile = function() {

    state.numCsvHeaders = [];

    state.numCsvData = null;

    state.numCsvFilename = "";

    

    const fileEl = document.getElementById('num-csv-file');

    const nameEl = document.getElementById('num-csv-file-name');

    const btnRemove = document.getElementById('btn-remove-num-csv');

    

    if (fileEl) {

        // Clonar o input file para limpar completamente o estado do navegador e forçar o reset

        const newFileEl = fileEl.cloneNode(true);

        newFileEl.value = '';

        fileEl.parentNode.replaceChild(newFileEl, fileEl);

        // Registrar novamente o listener no novo elemento clonado

        newFileEl.addEventListener('change', handleNumCsvSelected);

        newFileEl._listenerSet = true;

    }

    if (nameEl) nameEl.textContent = '';

    if (btnRemove) btnRemove.style.display = 'none';

    

    const colContainer = document.getElementById('num-csv-columns-container');

    if (colContainer) colContainer.style.display = 'none';

    

    renderElementsList();

    drawCanvas();

};



function renderNumCsvInterface() {

    const nameEl = document.getElementById('num-csv-file-name');

    const btnRemove = document.getElementById('btn-remove-num-csv');

    const container = document.getElementById('num-csv-columns-container');

    const bar = document.getElementById('num-csv-columns-bar');

    

    if (nameEl) nameEl.textContent = `📎 ${state.numCsvFilename} (${state.numCsvData ? state.numCsvData.length : 0} linhas)`;

    if (btnRemove) btnRemove.style.display = 'inline-flex';

    

    if (container && bar && state.numCsvHeaders && state.numCsvHeaders.length) {

        container.style.display = 'block';

        bar.innerHTML = state.numCsvHeaders.map(col => `

            <button class="btn btn-sm btn-secondary" onclick="addCsvColumnElement('${col}')" title="Adicionar como texto variável">📊 ${col}</button>

        `).join('');

    } else if (container) {

        container.style.display = 'none';

    }

    

    renderElementsList();

    drawCanvas();

}



window.addCsvColumnElement = function(colName) {

    state.numElCounter++;

    const id = `el_${state.numElCounter}`;

    const base = { 

        id, 

        type: 'TEXT', 

        name: colName,

        x_mm: 5, 

        y_mm: 5, 

        rotation: 0, 

        color: '#000000',

        font_size: 12,

        font_name: 'helv',

        pad: 0,

        prefix: '',

        suffix: '',

        source: 'database',

        csv_column: colName,

        _centerAnchor: true

    };

    

    state.numElements.push(base);

    state.selectedElId = id;

    renderElementsList();

    drawCanvas();

    selectElementCard(id);

};



// ────────────────────────────────────────────────────────────────────────────
// LÓGICA DE AUTENTICAÇÃO (SUPABASE AUTH) E PERMISSÕES DO IMPOSITION
// O login é feito pelo sistema parceiro. O Imposition apenas lê a sessão.
// Em modo localhost/EXE → bypass total, sem login.
// ────────────────────────────────────────────────────────────────────────────

// Estado global do usuário logado e suas permissões
window._currentUser = null;
window._currentPerms = null;

const PARTNER_LOGIN_URL = 'https://vibe.ai-ideal.com.br/login';

// ──── Permissões padrão por perfil ──────────────────────────────────────────
// Cada módulo tem _view (visualizar) e _edit (editar/criar/excluir)
// Ações especiais: perm_gerar_pdf, perm_imprimir
const ROLE_DEFAULTS = {
    admin: {
        perm_imposicao_view:true, perm_imposicao_edit:true,
        perm_pedidos_view:true, perm_pedidos_edit:true,
        perm_formatos_view:true, perm_formatos_edit:true,
        perm_numeracao_view:true, perm_numeracao_edit:true,
        perm_saidas_view:true, perm_saidas_edit:true,
        perm_cores_view:true, perm_cores_edit:true,
        perm_mapas_view:true, perm_mapas_edit:true,
        perm_amostras_view:true, perm_amostras_edit:true,
        perm_impressoras_view:true, perm_impressoras_edit:true,
        perm_producao_view:true, perm_producao_edit:true,
        perm_lista_arte_view:true, perm_lista_arte_edit:true,
        perm_gerar_pdf:true, perm_imprimir:true,
        perm_admin_view:true, perm_admin_edit:true,
    },
    atendimento: {
        perm_imposicao_view:false, perm_imposicao_edit:false,
        perm_pedidos_view:true, perm_pedidos_edit:true,
        perm_formatos_view:true, perm_formatos_edit:false,
        perm_numeracao_view:true, perm_numeracao_edit:false,
        perm_saidas_view:false, perm_saidas_edit:false,
        perm_cores_view:true, perm_cores_edit:false,
        perm_mapas_view:false, perm_mapas_edit:false,
        perm_amostras_view:true, perm_amostras_edit:false,
        perm_impressoras_view:false, perm_impressoras_edit:false,
        perm_producao_view:true, perm_producao_edit:false,
        perm_lista_arte_view:true, perm_lista_arte_edit:false,
        perm_fontes_view:true, perm_fontes_edit:true,
        perm_gerar_pdf:false, perm_imprimir:false,
        perm_admin_view:false, perm_admin_edit:false,
    },
    designer: {
        perm_imposicao_view:true, perm_imposicao_edit:false,
        perm_pedidos_view:true, perm_pedidos_edit:false,
        perm_formatos_view:true, perm_formatos_edit:true,
        perm_numeracao_view:true, perm_numeracao_edit:true,
        perm_saidas_view:true, perm_saidas_edit:true,
        perm_cores_view:true, perm_cores_edit:true,
        perm_mapas_view:true, perm_mapas_edit:true,
        perm_amostras_view:true, perm_amostras_edit:true,
        perm_impressoras_view:false, perm_impressoras_edit:false,
        perm_producao_view:true, perm_producao_edit:false,
        perm_lista_arte_view:true, perm_lista_arte_edit:true,
        perm_fontes_view:true, perm_fontes_edit:true,
        perm_gerar_pdf:false, perm_imprimir:false,
        perm_admin_view:false, perm_admin_edit:false,
    },
    impressor: {
        perm_imposicao_view:true, perm_imposicao_edit:true,
        perm_pedidos_view:true, perm_pedidos_edit:false,
        perm_formatos_view:true, perm_formatos_edit:false,
        perm_numeracao_view:true, perm_numeracao_edit:false,
        perm_saidas_view:true, perm_saidas_edit:false,
        perm_cores_view:true, perm_cores_edit:false,
        perm_mapas_view:false, perm_mapas_edit:false,
        perm_amostras_view:true, perm_amostras_edit:false,
        perm_impressoras_view:true, perm_impressoras_edit:true,
        perm_producao_view:true, perm_producao_edit:true,
        perm_lista_arte_view:false, perm_lista_arte_edit:false,
        perm_fontes_view:false, perm_fontes_edit:false,
        perm_gerar_pdf:true, perm_imprimir:true,
        perm_admin_view:false, perm_admin_edit:false,
    },
    financeiro: {
        perm_imposicao_view:false, perm_imposicao_edit:false,
        perm_pedidos_view:true, perm_pedidos_edit:false,
        perm_formatos_view:false, perm_formatos_edit:false,
        perm_numeracao_view:false, perm_numeracao_edit:false,
        perm_saidas_view:false, perm_saidas_edit:false,
        perm_cores_view:false, perm_cores_edit:false,
        perm_mapas_view:false, perm_mapas_edit:false,
        perm_amostras_view:false, perm_amostras_edit:false,
        perm_impressoras_view:false, perm_impressoras_edit:false,
        perm_producao_view:true, perm_producao_edit:false,
        perm_lista_arte_view:false, perm_lista_arte_edit:false,
        perm_fontes_view:false, perm_fontes_edit:false,
        perm_gerar_pdf:false, perm_imprimir:false,
        perm_admin_view:false, perm_admin_edit:false,
    },
    gerente: {
        perm_imposicao_view:true, perm_imposicao_edit:true,
        perm_pedidos_view:true, perm_pedidos_edit:true,
        perm_formatos_view:true, perm_formatos_edit:true,
        perm_numeracao_view:true, perm_numeracao_edit:true,
        perm_saidas_view:true, perm_saidas_edit:true,
        perm_cores_view:true, perm_cores_edit:true,
        perm_mapas_view:true, perm_mapas_edit:true,
        perm_amostras_view:true, perm_amostras_edit:true,
        perm_impressoras_view:true, perm_impressoras_edit:false,
        perm_producao_view:true, perm_producao_edit:true,
        perm_lista_arte_view:true, perm_lista_arte_edit:true,
        perm_fontes_view:true, perm_fontes_edit:true,
        perm_gerar_pdf:true, perm_imprimir:true,
        perm_admin_view:true, perm_admin_edit:false,
    },
    visualizador: {
        perm_imposicao_view:true, perm_imposicao_edit:false,
        perm_pedidos_view:true, perm_pedidos_edit:false,
        perm_formatos_view:true, perm_formatos_edit:false,
        perm_numeracao_view:true, perm_numeracao_edit:false,
        perm_saidas_view:true, perm_saidas_edit:false,
        perm_cores_view:true, perm_cores_edit:false,
        perm_mapas_view:true, perm_mapas_edit:false,
        perm_amostras_view:true, perm_amostras_edit:false,
        perm_impressoras_view:false, perm_impressoras_edit:false,
        perm_producao_view:true, perm_producao_edit:false,
        perm_lista_arte_view:true, perm_lista_arte_edit:false,
        perm_fontes_view:true, perm_fontes_edit:false,
        perm_gerar_pdf:false, perm_imprimir:false,
        perm_admin_view:false, perm_admin_edit:false,
    },
};

// Nomes dos perfis para UI
const ROLE_LABELS = {
    admin: { label: 'Administrador', icon: '👑', color: '#ef4444' },
    atendimento: { label: 'Atendimento', icon: '🎧', color: '#3b82f6' },
    designer: { label: 'Designer', icon: '🎨', color: '#a855f7' },
    impressor: { label: 'Impressor', icon: '🖨️', color: '#10b981' },
    financeiro: { label: 'Financeiro', icon: '💰', color: '#f59e0b' },
    gerente: { label: 'Gerente', icon: '📊', color: '#06b6d4' },
    visualizador: { label: 'Visualizador', icon: '👁️', color: '#6b7280' },
};

// Mapeamento: permissão _view → IDs de nav-btn na sidebar
const PERM_NAV_MAP = {
    perm_formatos_view:    ['nav-formatos', 'nav-lista-formatos'],
    perm_numeracao_view:   ['nav-numeracao', 'nav-catalogo'],
    perm_mapas_view:       ['nav-mapas'],
    perm_saidas_view:      ['nav-saidas'],
    perm_cores_view:       ['nav-cores', 'nav-lista-cores'],
    perm_fontes_view:      ['nav-fontes'],
    perm_imposicao_view:   ['nav-imposicao'],
    perm_pedidos_view:     ['nav-pedido'],
    perm_amostras_view:    ['nav-amostras'],
    perm_producao_view:    ['nav-lista-impressao'],
    perm_lista_arte_view:  ['nav-lista-arte'],
    perm_impressoras_view: ['nav-impressoras'],
    perm_admin_view:       ['nav-admin', 'nav-adm'],
};

// Definição dos módulos para renderizar permissões no painel admin
const PERM_MODULES = [
    { key: 'imposicao',   icon: '🖨️', label: 'Imposição' },
    { key: 'pedidos',     icon: '📦', label: 'Pedidos' },
    { key: 'formatos',    icon: '📐', label: 'Formatos' },
    { key: 'numeracao',   icon: '🔢', label: 'Numeração' },
    { key: 'saidas',      icon: '📄', label: 'Saídas' },
    { key: 'cores',       icon: '🎨', label: 'Cores' },
    { key: 'fontes',      icon: '🔤', label: 'Fontes' },
    { key: 'mapas',       icon: '🗺️', label: 'Mapas' },
    { key: 'amostras',    icon: '🧪', label: 'Amostras' },
    { key: 'impressoras', icon: '🖨️', label: 'Impressoras' },
    { key: 'producao',    icon: '📋', label: 'Produção' },
    { key: 'lista_arte',  icon: '🎨', label: 'Lista Arte' },
    { key: 'admin',       icon: '🛡️', label: 'Admin' },
];
const PERM_ACTIONS = [
    { key: 'gerar_pdf', icon: '📥', label: 'Gerar PDF' },
    { key: 'imprimir',  icon: '🖨️', label: 'Imprimir' },
];

// ──── Aplicar permissões na sidebar ────────────────────────────────────────
function applyPermissions(perms) {
    if (!perms) return;
    window._currentPerms = perms;

    for (const [permKey, navIds] of Object.entries(PERM_NAV_MAP)) {
        const allowed = perms[permKey] === true;
        for (const navId of navIds) {
            const el = document.getElementById(navId);
            if (el) el.style.display = allowed ? '' : 'none';
        }
    }

    // Labels de grupo: esconder "Configuração" se nenhum módulo config visível
    const configPerms = ['perm_formatos_view', 'perm_numeracao_view', 'perm_mapas_view', 'perm_saidas_view', 'perm_cores_view'];
    const hasConfig = configPerms.some(p => perms[p] === true);
    const configLabels = document.querySelectorAll('.nav-group-label');
    if (configLabels[0]) configLabels[0].style.display = hasConfig ? '' : 'none';

    // Admin label + buttons
    const adminLabel = document.querySelector('.nav-group-label.admin-only');
    if (adminLabel) adminLabel.style.display = perms.perm_admin_view ? '' : 'none';
    document.querySelectorAll('.nav-btn.admin-only').forEach(btn => {
        btn.style.display = perms.perm_admin_view ? '' : 'none';
    });
}


// ──── Carregar permissões do backend ───────────────────────────────────────
async function loadUserPermissions(userId) {
    try {
        const resp = await fetch(`${API_BASE_URL}/api/user/permissions/${userId}`);
        const data = await resp.json();
        if (data.ok && data.permissions) {
            return data.permissions;
        }
    } catch (e) {
        console.warn('[auth] Erro ao carregar permissões:', e);
    }
    return null;
}

// ──── Auto-criar permissões para primeiro acesso ──────────────────────────
async function ensureUserPermissions(userId, email) {
    let perms = await loadUserPermissions(userId);
    if (perms) return perms;

    // Primeiro acesso — verificar se existem outros usuários
    try {
        const resp = await fetch(`${API_BASE_URL}/api/user/permissions`);
        const data = await resp.json();
        const existingUsers = (data.ok && data.permissions) ? data.permissions : [];

        // Se não tem ninguém, este é o primeiro → admin
        const role = existingUsers.length === 0 ? 'admin' : 'operador';
        const defaults = ROLE_DEFAULTS[role];

        const newPerms = {
            user_id: userId,
            role: role,
            ...defaults
        };

        await fetch(`${API_BASE_URL}/api/user/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPerms)
        });

        console.log(`[auth] Permissões criadas para ${email}: role=${role}`);
        return { ...newPerms };
    } catch (e) {
        console.warn('[auth] Erro ao criar permissões:', e);
        return { ...ROLE_DEFAULTS.operador, role: 'operador', user_id: userId };
    }
}

// ──── Atualizar UI do perfil logado ───────────────────────────────────────
function updateProfileUI(user, perms) {
    const profileBar = document.getElementById('user-profile-bar');
    const emailDisplay = document.getElementById('user-email-display');

    if (profileBar) profileBar.style.display = 'block';
    if (emailDisplay) {
        const roleBadge = perms ? `<span style="font-size:0.65rem;background:${perms.role === 'admin' ? 'rgba(239,68,68,0.2);color:#f87171' : 'rgba(59,130,246,0.2);color:#60a5fa'};padding:1px 6px;border-radius:10px;margin-left:4px;">${(perms.role || '').toUpperCase()}</span>` : '';
        emailDisplay.innerHTML = (user.email || '—') + roleBadge;
    }
}

// ──── Sign Out ────────────────────────────────────────────────────────────
window.handleSignOut = async function() {
    try {
        if (supabaseClient && supabaseClient.auth) {
            await supabaseClient.auth.signOut();
        }
        toast('Logoff efetuado!', 'success');
        location.reload();
    } catch (e) {
        toast('Erro ao sair: ' + e.message, 'error');
    }
};

// ──── Mostrar login overlay ───────────────────────────────────────────────
function showLoginOverlay() {
    // Criar overlay dinâmico se não existir
    let overlay = document.getElementById('auth-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.className = 'auth-overlay active';
        overlay.innerHTML = `
            <div class="auth-card">
                <div class="auth-header">
                    <h2>🎫 Ideal Imposition</h2>
                    <p>Use suas credenciais do sistema para acessar</p>
                </div>
                <form onsubmit="handleLoginSubmit(event)">
                    <div class="form-group" style="margin-bottom:14px;">
                        <label class="form-label">📧 Email</label>
                        <input type="email" id="auth-email" class="form-control" placeholder="seu@email.com" required autocomplete="email">
                    </div>
                    <div class="form-group" style="margin-bottom:20px;">
                        <label class="form-label">🔒 Senha</label>
                        <input type="password" id="auth-password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
                    </div>
                    <div class="auth-actions">
                        <button type="submit" id="btn-auth-submit" class="btn btn-primary btn-full" style="height:42px;font-size:0.95rem;">🚀 Entrar</button>
                    </div>
                </form>
                <div class="auth-divider">ou</div>
                <button id="btn-google-login" class="btn btn-google btn-full" onclick="handleGoogleLogin()" style="height:40px;">
                    <svg class="google-icon" width="18" height="18" viewBox="0 0 48 48" style="margin-right:8px;">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Login com Google
                </button>
                <div style="text-align:center;margin-top:14px;">
                    <a href="${PARTNER_LOGIN_URL}" target="_blank" style="color:var(--text-dim);font-size:0.78rem;text-decoration:none;">Não tem conta? Cadastre-se no sistema parceiro →</a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.classList.add('active');
    }
    document.body.classList.add('not-logged-in');
}

// ──── Handlers de login ───────────────────────────────────────────────────
window.handleLoginSubmit = async function(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('btn-auth-submit');

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        toast('Login efetuado com sucesso!', 'success');
        document.getElementById('auth-overlay').classList.remove('active');
        document.body.classList.remove('not-logged-in');

        // Carregar permissões e UI
        const user = data.user;
        window._currentUser = user;
        const perms = await ensureUserPermissions(user.id, user.email);
        applyPermissions(perms);
        updateProfileUI(user, perms);
        loadAll();
    } catch (err) {
        toast('Erro: ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Entrar';
    }
};

window.handleGoogleLogin = async function() {
    const btn = document.getElementById('btn-google-login');
    if (btn) btn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
    } catch (err) {
        toast('Erro ao entrar com Google: ' + (err.message || err), 'error');
        if (btn) btn.disabled = false;
    }
};

// ──── Inicialização de auth (DOMContentLoaded) ────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

    if (isLocal) {
        // ── Modo local/EXE → bypass total ──
        console.log('[auth] Modo local — bypass de autenticação');
        const profileBar = document.getElementById('user-profile-bar');
        if (profileBar) profileBar.style.display = 'none';

        // Admin total em modo local
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
        document.querySelectorAll('.nav-btn').forEach(el => el.style.display = '');
        document.querySelectorAll('.nav-group-label').forEach(el => el.style.display = '');

        loadAll();
        return;
    }

    // ── Modo online → verificar sessão Supabase Auth ──
    if (!supabaseClient || !supabaseClient.auth) {
        console.warn('[auth] Supabase não disponível — sem autenticação');
        loadAll();
        return;
    }

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error || !session || !session.user) {
            // Sem sessão → mostrar tela de login
            console.log('[auth] Sem sessão — exibindo login');
            showLoginOverlay();
            return;
        }

        // Logado! 
        const user = session.user;
        window._currentUser = user;
        console.log('[auth] Logado como:', user.email);

        // Carregar/criar permissões
        const perms = await ensureUserPermissions(user.id, user.email);
        window._currentPerms = perms;

        // Aplicar permissões na UI
        applyPermissions(perms);
        updateProfileUI(user, perms);

        // Carregar dados
        loadAll();

    } catch (e) {
        console.error('[auth] Erro na verificação de sessão:', e);
        loadAll();
    }

    // Listener para mudança de sessão (logout externo, expiração etc)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            showLoginOverlay();
        }
    });

});


// ──────────────────────────────────────────────────────────────────────────

window.loadAdminUsers = async function() {
    const tbody = document.getElementById('tbody-admin-users');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';

    try {
        // 1) Buscar TODOS os usuários do sistema parceiro
        let allUsers = [];
        try {
            if (supabaseClient) {
                const { data: profiles, error } = await supabaseClient
                    .from('usuarios')
                    .select('user_id, email, setor, avatar, is_admin, telefone')
                    .order('email', { ascending: true });
                if (!error && profiles) allUsers = profiles;
            }
        } catch (e) {
            console.warn('[admin] Erro ao buscar usuarios:', e);
        }

        // 2) Buscar permissões do Imposition
        let permsMap = {};
        try {
            const resp = await fetch(`${API_BASE_URL}/api/user/permissions`);
            const data = await resp.json();
            if (data.ok && data.permissions) {
                data.permissions.forEach(p => permsMap[p.user_id] = p);
            }
        } catch (e) {
            console.warn('[admin] Erro ao buscar permissões:', e);
        }

        if (!allUsers.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-dim);">Nenhum usuário encontrado no sistema.</td></tr>';
            return;
        }

        tbody.innerHTML = allUsers.map(u => {
            const userId = u.user_id;
            const email = u.email || '—';
            const setor = u.setor || '';
            const perms = permsMap[userId];
            const hasAccess = !!perms;
            const role = perms ? perms.role : null;
            const rl = ROLE_LABELS[role] || {};

            // Status badge com cor do perfil
            const statusBadge = hasAccess
                ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;padding:2px 8px;border-radius:12px;background:${rl.color || '#6b7280'}22;color:${rl.color || '#6b7280'};font-weight:600;">${rl.icon || ''} ${rl.label || role}</span>`
                : `<span style="font-size:0.72rem;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.05);color:var(--text-dim);">SEM ACESSO</span>`;

            // Role select com os 7 perfis
            const roleOptions = Object.entries(ROLE_LABELS).map(([k, v]) =>
                `<option value="${k}" ${role === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
            ).join('');

            const roleSelect = hasAccess ? `
                <select class="form-control" style="width:auto;display:inline-block;padding:3px 6px;font-size:0.78rem;height:28px;margin-top:4px;" onchange="changeUserRole('${userId}', this.value)">
                    ${roleOptions}
                </select>` : `
                <button class="btn btn-sm btn-secondary" onclick="grantUserAccess('${userId}', '${email}')" style="font-size:0.75rem;padding:3px 10px;margin-top:4px;">
                    ➕ Conceder Acesso
                </button>`;

            // Grid de permissões View/Edit por módulo
            let permGrid = '—';
            if (hasAccess) {
                const moduleRows = PERM_MODULES.map(m => {
                    const vKey = `perm_${m.key}_view`;
                    const eKey = `perm_${m.key}_edit`;
                    const vChecked = perms[vKey] === true ? 'checked' : '';
                    const eChecked = perms[eKey] === true ? 'checked' : '';
                    return `<div style="display:contents;">
                        <span style="font-size:0.7rem;white-space:nowrap;color:var(--text-dim);">${m.icon} ${m.label}</span>
                        <label style="text-align:center;cursor:pointer;"><input type="checkbox" ${vChecked} onchange="toggleUserPerm('${userId}','${vKey}',this.checked)" style="cursor:pointer;width:13px;height:13px;"></label>
                        <label style="text-align:center;cursor:pointer;"><input type="checkbox" ${eChecked} onchange="toggleUserPerm('${userId}','${eKey}',this.checked)" style="cursor:pointer;width:13px;height:13px;"></label>
                    </div>`;
                }).join('');

                const actionRows = PERM_ACTIONS.map(a => {
                    const aKey = `perm_${a.key}`;
                    const aChecked = perms[aKey] === true ? 'checked' : '';
                    return `<div style="display:contents;">
                        <span style="font-size:0.7rem;white-space:nowrap;color:var(--text-dim);">${a.icon} ${a.label}</span>
                        <label style="text-align:center;cursor:pointer;grid-column:span 2;"><input type="checkbox" ${aChecked} onchange="toggleUserPerm('${userId}','${aKey}',this.checked)" style="cursor:pointer;width:13px;height:13px;"> Sim</label>
                    </div>`;
                }).join('');

                permGrid = `
                    <div style="display:grid;grid-template-columns:auto 30px 30px;gap:2px 6px;align-items:center;">
                        <span style="font-size:0.62rem;font-weight:700;color:var(--blue);text-transform:uppercase;">Módulo</span>
                        <span style="font-size:0.62rem;font-weight:700;color:var(--blue);text-align:center;" title="Visualizar">👁️</span>
                        <span style="font-size:0.62rem;font-weight:700;color:var(--blue);text-align:center;" title="Editar">✏️</span>
                        ${moduleRows}
                    </div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 6px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);">
                        <span style="font-size:0.62rem;font-weight:700;color:#f59e0b;text-transform:uppercase;grid-column:span 2;">Ações</span>
                        ${actionRows}
                    </div>`;
            }

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);${!hasAccess ? 'opacity:0.55;' : ''}">
                    <td style="padding:10px 12px;vertical-align:top;">
                        <strong style="color:#fff;font-size:0.85rem;">${email}</strong>
                        ${setor ? `<br><small style="color:var(--text-dim);font-size:0.72rem;">${setor}</small>` : ''}
                    </td>
                    <td style="padding:10px 12px;vertical-align:top;">
                        ${statusBadge}<br>
                        ${roleSelect}
                    </td>
                    <td style="padding:10px 12px;vertical-align:top;">
                        ${permGrid}
                    </td>
                </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--red);">Erro: ${e.message}</td></tr>`;
    }
};

// Conceder acesso a um usuário (cria com role visualizador)
window.grantUserAccess = async function(userId, email) {
    try {
        const defaults = ROLE_DEFAULTS.visualizador;
        await fetch(`${API_BASE_URL}/api/user/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, role: 'visualizador', ...defaults })
        });
        toast(`Acesso concedido para ${email}!`, 'success');
        loadAdminUsers();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
};

window.changeUserRole = async function(userId, newRole) {
    const rl = ROLE_LABELS[newRole] || {};
    if (!confirm(`Alterar perfil para ${rl.icon || ''} ${rl.label || newRole}?`)) {
        loadAdminUsers();
        return;
    }
    try {
        const defaults = ROLE_DEFAULTS[newRole] || ROLE_DEFAULTS.visualizador;
        await fetch(`${API_BASE_URL}/api/user/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, role: newRole, ...defaults })
        });
        toast(`Perfil alterado para ${rl.icon || ''} ${rl.label || newRole}!`, 'success');
        loadAdminUsers();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
        loadAdminUsers();
    }
};

window.toggleUserPerm = async function(userId, permKey, value) {
    try {
        await fetch(`${API_BASE_URL}/api/user/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, [permKey]: value })
        });
        const label = permKey.replace('perm_', '').replace(/_/g, ' ');
        toast(`${label} ${value ? '✅ ativada' : '❌ desativada'}`, 'success');
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
};

// Carregar admin ao clicar na aba
document.getElementById('nav-admin')?.addEventListener('click', () => {
    loadAdminUsers();

});









// - LÓGICA DA TELA DE AMOSTRAS -

let amostraArteImage = null;

let amostraArteWidth = 0;

let amostraArteHeight = 0;



// Helper para obter dimensões do formato ativo em Amostras

function getAmostraFormato() {

    const corId = document.getElementById('amostra-cor').value;

    const numId = document.getElementById('amostra-numeracao').value;

    

    if (numId) {

        const num = state.numeracoes.find(n => String(n.id) === String(numId));

        if (num) {

            const fmt = state.formatos.find(f => f.id === num.formato_id);

            if (fmt) return fmt;

        }

    }

    if (corId) {

        const cor = state.cores.find(c => c.id === corId);

        if (cor) {

            // Retorna dimensões do formato correspondentes à cor

            return {

                width_mm: cor.width_mm,

                height_mm: cor.height_mm

            };

        }

    }

    return null;

}



// Helper para calcular a escala (px/mm) ideal para que todos os canvas tenham o mesmo tamanho e mantenham paridade 1:1 física

function getAmostraScale(fmt, canvasElement) {

    // Escala fixa em 150 DPI para alta nitidez em todas as janelas de amostra
    // O canvas e renderizado em alta resolucao e exibido via CSS (max-width: 100%)
    return 150 / 25.4;

}



window.onAmostraCorSelect = async function() {

    const corId = document.getElementById('amostra-cor').value;

    const canvas = document.getElementById('amostra-cor-canvas') || (window._amostraCorCanvas = window._amostraCorCanvas || document.createElement('canvas'));

    const empty = document.getElementById('amostra-cor-empty');

    const badge = document.getElementById('amostra-cor-badge');

    

    // Filtrar as numerações com base no formato associado a esta cor

    const cor = corId ? state.cores.find(c => c.id === corId) : null;

    const numSelect = document.getElementById('amostra-numeracao');

    if (numSelect) {

        const curNumVal = numSelect.value;

        const filteredNums = (cor && cor.formato_id)
            ? state.numeracoes.filter(n => {
                const ids = n.formato_ids || [n.formato_id];
                return ids.some(id => String(id) === String(cor.formato_id));
            })
            : [];

        numSelect.innerHTML = '<option value="">-- Selecione uma Numeração --</option>' +

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        

        if (filteredNums.some(n => String(n.id) === String(curNumVal))) {

            numSelect.value = curNumVal;

        } else {

            numSelect.value = "";

            // Disparar atualização visual se limpou a numeração

            window.onAmostraNumeracaoSelect();

        }

    }

    

    if (!corId) {

        if (canvas) canvas.style.display = 'none';

        if (empty) {

            empty.style.display = 'block';

            empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div><p style="font-size: 0.85rem; font-weight: 500;">Selecione uma cor para visualizar.</p>`;

        }

        if (badge) badge.textContent = 'Sem Cor';

        return;

    }



    if (!cor) return;



    if (badge) badge.textContent = cor.name;



    if (cor.pdf_base64) {

        if (empty) {

            empty.style.display = 'block';

            empty.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.82rem; font-weight:500;">Carregando PDF da Cor...</p>';

        }

        try {

            const base64Data = cor.pdf_base64.includes('base64,') ? cor.pdf_base64.split('base64,')[1] : cor.pdf_base64;

            const binStr = atob(base64Data);

            const bytes = new Uint8Array(binStr.length);

            for (let i = 0; i < binStr.length; i++) {

                bytes[i] = binStr.charCodeAt(i);

            }



            const loadingTask = pdfjsLib.getDocument({ data: bytes });

            const pdf = await loadingTask.promise;

            const page = await pdf.getPage(1);

            

            // Usar escala proporcional unificada baseada no formato da cor

            const fmt = getAmostraFormato();

            const scalePxMm = getAmostraScale(fmt, canvas);

            

            const viewport = page.getViewport({ scale: 1.0 });

            // Converter mm para pontos PDF (72 / 25.4 = 2.8346) para saber a escala certa do renderizador

            const pdfScale = (fmt.width_mm * 2.8346) / viewport.width;

            

            // Escala final de renderização

            const scaledViewport = page.getViewport({ scale: pdfScale * (scalePxMm / 2.8346) });

            

            const offCanvas = document.createElement('canvas');
            offCanvas.width = scaledViewport.width;
            offCanvas.height = scaledViewport.height;
            const offCtx = offCanvas.getContext('2d');
            await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;
            canvas.width = offCanvas.width;
            canvas.height = offCanvas.height;
            const context = canvas.getContext('2d');
            context.drawImage(offCanvas, 0, 0);

            

            if (empty) empty.style.display = 'none';

            canvas.style.display = 'block';

            

            // Renderiza amostra combinada

            renderAmostraCombinada();

        } catch (e) {

            console.error("Erro ao renderizar cor na amostra:", e);

            if (empty) {

                empty.style.display = 'block';

                empty.innerHTML = '<div style="font-size: 2rem; color: var(--red); margin-bottom:10px;">✕</div><p style="font-size:0.85rem; font-weight:500;">Erro ao carregar PDF de referência da cor.</p>';

            }

            canvas.style.display = 'none';

            renderAmostraCombinada();

        }

    } else {

        if (canvas) canvas.style.display = 'none';

        if (empty) {

            empty.style.display = 'block';

            empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div><p style="font-size: 0.85rem; font-weight: 500;">Esta cor não possui PDF de referência cadastrado.</p>`;

        }

        renderAmostraCombinada();

    }

    if (typeof updateAmostraDecisaoUI === 'function') updateAmostraDecisaoUI();

};



window.onAmostraNumeracaoSelect = function() {

    const numId = document.getElementById('amostra-numeracao').value;

    const canvas = document.getElementById('amostra-num-canvas') || (window._amostraNumCanvas = window._amostraNumCanvas || document.createElement('canvas'));

    const empty = document.getElementById('amostra-num-empty');

    const badge = document.getElementById('amostra-num-badge');



    if (!numId) {

        if (canvas) canvas.style.display = 'none';

        if (empty) empty.style.display = 'block';

        if (badge) badge.textContent = 'Sem Numeração';

        renderAmostraCombinada();

        return;

    }



    const num = state.numeracoes.find(n => String(n.id) === String(numId));

    if (!num) return;



    if (badge) badge.textContent = num.name;



    const fmt = state.formatos.find(f => f.id === num.formato_id);

    if (!fmt) {

        if (canvas) canvas.style.display = 'none';

        if (empty) {

            empty.style.display = 'block';

            empty.innerHTML = `<p style="font-size:0.85rem; color:var(--red);">Formato base desta numeração foi excluído.</p>`;

        }

        renderAmostraCombinada();

        return;

    }



    // Desenhar a numeração fictícia no Canvas de Amostras

    if (empty) empty.style.display = 'none';

    canvas.style.display = 'block';



    // Obter escala unificada proporcional

    const S = getAmostraScale(fmt, canvas);

    canvas.width = Math.round(fmt.width_mm * S);

    canvas.height = Math.round(fmt.height_mm * S);

    const ctx = canvas.getContext('2d');



    // Fundo branco limpo

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);



    // Contorno do formato

    ctx.strokeStyle = '#64748b';

    ctx.lineWidth = 1;

    ctx.strokeRect(0, 0, canvas.width, canvas.height);



    // Desenhar elementos cadastrados

    const MM2PT = 2.8346;

    if (num.elements) {

        num.elements.forEach(el => {

            const x = el.x_mm * S;

            const y = el.y_mm * S;

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
                    const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                    label = `${el.prefix || ''}${_fVal}`;
                } else if (el.type === 'TEATRO_LUGAR') {
                    const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                    label = `${el.prefix || ''}${_lVal}`;
                } else if (el.type === 'TEATRO_COMBO') {
                    const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                    const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                    const fila = `${el.prefix_fila || ''}${_fVal}`;
                    const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                    label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
                } else if (el.type === 'CAMAROTE_LOCAL') {
                    label = `${el.prefix || ''}7`;
                } else if (el.type === 'CAMAROTE_PESSOA') {
                    label = `${el.prefix || ''}1`;
                } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                    label = `${el.prefix || ''}1/5`;
                } else if (el.source === 'database') {
                    const colName = el.csv_column || '';
                    const csvData = state.csvData || state.numCsvData || null;
                    const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
                    if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                        label = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                    } else {
                        label = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                    }
                } else {

                    const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;

                    label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;

                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (label.includes('\n')) {
                    const lines = label.split('\n');
                    ctx.fillText(lines[0], 0, -fs/2);
                    ctx.fillText(lines[1], 0, fs/2);
                } else {
                    ctx.fillText(label, 0, 0);
                }
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';

            } else if (el.type === 'QR') {

                const sz = (el.size_mm || 15) * S;
                let qrText = '';
                if (el.fixed) {
                    qrText = el.fixed_value || '';
                } else if (el.source === 'database') {
                    const colName = el.csv_column || '';
                    const csvData = state.csvData || state.numCsvData || null;
                    const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
                    if (csvRow && typeof csvRow[colName] !== 'undefined' && csvRow[colName] !== '') {
                        qrText = `${el.prefix || ''}${csvRow[colName]}${el.suffix || ''}`;
                    } else {
                        qrText = `${el.prefix || ''}[${colName || 'coluna'}]${el.suffix || ''}`;
                    }
                } else {
                    const padVal = typeof el.pad !== 'undefined' ? parseInt(el.pad) : 4;
                    const raw = padVal > 0 ? String(1).padStart(padVal, '0') : '1';
                    qrText = `${el.prefix || ''}${raw}${el.suffix || ''}`;
                }
                renderQRCodeOnCtx(ctx, qrText, 0, 0, sz, color);

            } else if (el.type === 'BARCODE') {

                const bw = (el.width_mm || 40) * S;

                const bh = (el.height_mm || 10) * S;
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

                ctx.lineTo(0, canvas.height - y);

                ctx.stroke();

            } else if (el.type === 'SVG') {

                const sz_w = (el.width_mm || 20) * S;

                const sz_h = (el.height_mm || 20) * S;
                const hw = sz_w / 2, hh = sz_h / 2;

                ctx.strokeStyle = color;

                ctx.lineWidth = 1;

                ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                ctx.font = `${Math.max(6, sz_h * 0.15)}px Inter, sans-serif`;

                ctx.fillStyle = color;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText('SVG', 0, 0);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';

            }

            ctx.restore();

        });

    }



    renderAmostraCombinada();

    if (typeof updateAmostraDecisaoUI === 'function') updateAmostraDecisaoUI();

};



window.clearAmostraArteFile = function() {

    amostraArteImage = null;

    amostraArteWidth = 0;

    amostraArteHeight = 0;

    document.getElementById('amostra-arte-file').value = '';

    document.getElementById('amostra-arte-file-name').textContent = '';

    document.getElementById('btn-remove-amostra-arte').style.display = 'none';

    const badge = document.getElementById('amostra-arte-badge');
    if (badge) badge.textContent = 'Sem Arte';

    

    const canvas = document.getElementById('amostra-arte-canvas') || (window._amostraArteCanvas = window._amostraArteCanvas || document.createElement('canvas'));

    const empty = document.getElementById('amostra-arte-empty');

    if (canvas) canvas.style.display = 'none';

    if (empty) {

        empty.style.display = 'block';

        empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🖼️</div><p style="font-size: 0.85rem; font-weight: 500;">Carregue uma arte em PDF ou imagem para visualizar.</p>`;

    }

    renderAmostraCombinada();

};



async function loadAmostraArteFile(file) {

    const ext = file.name.split('.').pop().toLowerCase();

    const canvas = document.getElementById('amostra-arte-canvas') || (window._amostraArteCanvas = window._amostraArteCanvas || document.createElement('canvas'));

    const empty = document.getElementById('amostra-arte-empty');

    const badge = document.getElementById('amostra-arte-badge');



    if (badge) badge.textContent = file.name;

    if (empty) {

        empty.style.display = 'block';

        empty.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.82rem; font-weight:500;">Processando Arte...</p>';

    }



    try {

        const fmt = getAmostraFormato();

        const S = getAmostraScale(fmt, canvas);



        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');

            }

            pdfjsLib.GlobalWorkerOptions.workerSrc =

                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            const page = await pdf.getPage(1);

            

            const vp = page.getViewport({ scale: 1.0 });

            

            // Se tivermos um formato ativo, escala a arte para o mesmo tamanho proporcional

            let pdfScale = 1.0;

            if (fmt) {

                pdfScale = (fmt.width_mm * 2.8346) / vp.width;

            }

            

            const scaledViewport = page.getViewport({ scale: pdfScale * (S / 2.8346) });

            

            const offCanvas = document.createElement('canvas');
            offCanvas.width = scaledViewport.width;
            offCanvas.height = scaledViewport.height;
            const offCtx = offCanvas.getContext('2d');
            await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;
            canvas.width = offCanvas.width;
            canvas.height = offCanvas.height;
            const context = canvas.getContext('2d');
            context.drawImage(offCanvas, 0, 0);

        } else {

            const img = new Image();

            img.src = URL.createObjectURL(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

            

            // Adotar 300 DPI se não conseguirmos ler

            const dpi = 300;

            const originalW_mm = (img.width / dpi) * 25.4;

            const originalH_mm = (img.height / dpi) * 25.4;

            

            // Usar o tamanho do formato (se houver) ou o tamanho físico da imagem na mesma escala S

            const targetW = fmt ? fmt.width_mm : originalW_mm;

            const targetH = fmt ? fmt.height_mm : originalH_mm;

            

            canvas.width = Math.round(targetW * S);

            canvas.height = Math.round(targetH * S);

            const context = canvas.getContext('2d');

            

            // Desenhar a imagem preenchendo/centralizando proporcionalmente se as dimensões diferirem do formato

            context.drawImage(img, 0, 0, canvas.width, canvas.height);

        }



        if (empty) empty.style.display = 'none';

        if (canvas) canvas.style.display = 'block';

        

        document.getElementById('btn-remove-amostra-arte').style.display = 'inline-flex';

        document.getElementById('amostra-arte-file-name').textContent = '📎 ' + file.name;

        toast('Arte de amostra carregada!', 'success');

        renderAmostraCombinada();

    } catch (e) {

        toast('Erro ao carregar arte: ' + e.message, 'error');

        clearAmostraArteFile();

    }

}



// Função para renderizar a Amostra Combinada (Cor + Arte + Numeração) com Multiply

function renderAmostraCombinada() {

    const canvasComb = document.getElementById('amostra-comb-canvas');

    const emptyComb = document.getElementById('amostra-comb-empty');

    if (!canvasComb) return;



    const corCanvas = document.getElementById('amostra-cor-canvas') || (window._amostraCorCanvas = window._amostraCorCanvas || document.createElement('canvas'));

    const arteCanvas = document.getElementById('amostra-arte-canvas') || (window._amostraArteCanvas = window._amostraArteCanvas || document.createElement('canvas'));

    const numCanvas = document.getElementById('amostra-num-canvas') || (window._amostraNumCanvas = window._amostraNumCanvas || document.createElement('canvas'));



    const corId = document.getElementById('amostra-cor').value;

    const numId = document.getElementById('amostra-numeracao').value;

    const hasArte = document.getElementById('amostra-arte-file').files.length > 0;



    // Se nenhuma camada estiver selecionada/carregada, esconde o canvas e mostra o estado vazio

    if (!corId && !numId && !hasArte) {

        canvasComb.style.display = 'none';

        if (emptyComb) emptyComb.style.display = 'block';

        return;

    }



    const fmt = getAmostraFormato();

    if (!fmt) {

        canvasComb.style.display = 'none';

        if (emptyComb) emptyComb.style.display = 'block';

        return;

    }



    // A escala global unificada que mantém a paridade física 1:1 absoluta

    const S = getAmostraScale(fmt, canvasComb);



    // O canvas de Amostra Combinada deve possuir o tamanho físico estrito da Cor

    const cor = state.cores.find(c => c.id === corId);

    let targetW = fmt.width_mm;

    let targetH = fmt.height_mm;

    if (cor) {

        targetW = cor.width_mm;

        targetH = cor.height_mm;

    }



    if (emptyComb) emptyComb.style.display = 'none';

    canvasComb.style.display = 'block';



    const finalWidth = Math.round(targetW * S);

    const finalHeight = Math.round(targetH * S);



    canvasComb.width = finalWidth;

    canvasComb.height = finalHeight;



    const ctx = canvasComb.getContext('2d', { colorSpace: 'srgb' });

    ctx.clearRect(0, 0, finalWidth, finalHeight);



    // Resetar composite operation

    ctx.globalCompositeOperation = 'source-over';



    // 1. Desenhar a Camada 1: Cor (se estiver disponível, centralizada no canvasComb caso divirjam)

    if (corId && corCanvas && corCanvas.width > 0) {

        const dx = (finalWidth - corCanvas.width) / 2;

        const dy = (finalHeight - corCanvas.height) / 2;

        ctx.drawImage(corCanvas, dx, dy, corCanvas.width, corCanvas.height);

    } else {

        // Se não tiver cor selecionada, desenha uma base branca para podermos visualizar as outras camadas

        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, finalWidth, finalHeight);

    }



    // 2. Desenhar a Camada 2: Arte com efeito similar ao Photoshop Multiply (lendo a dimensão e centralizando em um canvas intermediário do tamanho da Cor)

    if (hasArte && arteCanvas && arteCanvas.width > 0) {

        // Obter valores de ajuste da interface

        const satVal = document.getElementById('amostra-sat') ? document.getElementById('amostra-sat').value : 100;

        const conVal = document.getElementById('amostra-con') ? document.getElementById('amostra-con').value : 100;

        const briVal = document.getElementById('amostra-bri') ? document.getElementById('amostra-bri').value : 100;

        const shpVal = document.getElementById('amostra-shp') ? document.getElementById('amostra-shp').value : 0;



        // Criar um canvas temporário do tamanho exato da Cor

        const tempArteCanvas = document.createElement('canvas');

        tempArteCanvas.width = finalWidth;

        tempArteCanvas.height = finalHeight;

        const tempArteCtx = tempArteCanvas.getContext('2d', { colorSpace: 'srgb' });

        

        // Aplicar filtros de cores nativos via Canvas context filter (Saturação, Contraste, Brilho)

        tempArteCtx.filter = `saturate(${satVal}%) contrast(${conVal}%) brightness(${briVal}%)`;



        // Desenha a arte original centralizada no canvas temporário

        const dx = (finalWidth - arteCanvas.width) / 2;

        const dy = (finalHeight - arteCanvas.height) / 2;

        tempArteCtx.drawImage(arteCanvas, dx, dy, arteCanvas.width, arteCanvas.height);

        

        // Resetar o filtro para futuras operações

        tempArteCtx.filter = 'none';

        

        // Aplicar efeito Sharpen (Nitidez) usando convolução proporcional ao valor (0% a 100%)

        if (shpVal > 0) {

            try {

                const imgData = tempArteCtx.getImageData(0, 0, finalWidth, finalHeight);

                const data = imgData.data;

                const width = imgData.width;

                const height = imgData.height;

                

                // Criar cópia para ler os valores originais

                const copy = new Uint8ClampedArray(data);

                

                // Fator de nitidez proporcional ao controle (máximo 1.8 de atenuação negativa)

                const factor = (shpVal / 100) * 1.8;

                const centerWeight = 1 + (4 * factor);

                

                // Matriz de convolução dinâmica:

                //  0     -factor      0

                // -factor centerWeight -factor

                //  0     -factor      0

                const weights = [

                     0,      -factor,  0,

                  -factor, centerWeight, -factor,

                     0,      -factor,  0

                ];

                

                const side = Math.round(Math.sqrt(weights.length));

                const halfSide = Math.floor(side / 2);

                

                // Convolução de pixel por pixel

                for (let y = 1; y < height - 1; y++) {

                    for (let x = 1; x < width - 1; x++) {

                        const sy = y;

                        const sx = x;

                        const dstOff = (y * width + x) * 4;

                        

                        let r = 0, g = 0, b = 0;

                        for (let cy = 0; cy < side; cy++) {

                            for (let cx = 0; cx < side; cx++) {

                                const scy = sy + cy - halfSide;

                                const scx = sx + cx - halfSide;

                                const srcOff = (scy * width + scx) * 4;

                                const wt = weights[cy * side + cx];

                                

                                r += copy[srcOff] * wt;

                                g += copy[srcOff + 1] * wt;

                                b += copy[srcOff + 2] * wt;

                            }

                        }

                        

                        data[dstOff] = Math.min(255, Math.max(0, r));

                        data[dstOff + 1] = Math.min(255, Math.max(0, g));

                        data[dstOff + 2] = Math.min(255, Math.max(0, b));

                    }

                }

                tempArteCtx.putImageData(imgData, 0, 0);

            } catch (e) {

                console.error("Erro ao aplicar filtro de nitidez (sharpen):", e);

            }

        }

        

        // Aplica o canvas temporário com multiply

        ctx.save();

        ctx.globalCompositeOperation = 'multiply';

        ctx.drawImage(tempArteCanvas, 0, 0);

        ctx.restore();

    }



    // 3. Desenhar a Camada 3: Numeração com efeito similar ao Photoshop Multiply (lendo a dimensão e centralizando em um canvas intermediário do tamanho da Cor)

    if (numId && numCanvas && numCanvas.width > 0) {

        // Criar um canvas temporário do tamanho exato da Cor

        const tempNumCanvas = document.createElement('canvas');

        tempNumCanvas.width = finalWidth;

        tempNumCanvas.height = finalHeight;

        const tempNumCtx = tempNumCanvas.getContext('2d', { colorSpace: 'srgb' });

        

        // Desenha a numeração original centralizada no canvas temporário

        const dx = (finalWidth - numCanvas.width) / 2;

        const dy = (finalHeight - numCanvas.height) / 2;

        tempNumCtx.drawImage(numCanvas, dx, dy, numCanvas.width, numCanvas.height);

        

        // Aplica o canvas temporário com multiply

        ctx.save();

        ctx.globalCompositeOperation = 'multiply';

        ctx.drawImage(tempNumCanvas, 0, 0);

        ctx.restore();

    }



    // Borda final da amostra

    ctx.save();

    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = '#1e293b';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(0, 0, canvasComb.width, canvasComb.height);

    ctx.restore();

}

window.renderAmostraCombinada = renderAmostraCombinada;

// LÓGICA DE DECISÕES DA AMOSTRA COMBINADA (APROVAR/ALTERAR)
function updateAmostraDecisaoUI() {
    const corId = document.getElementById('amostra-cor')?.value;
    const numId = document.getElementById('amostra-numeracao')?.value;
    const badge = document.getElementById('amostra-status-badge');
    const obsText = document.getElementById('amostra-obs-alteracao');

    if (!badge) return;

    if (!corId || !numId) {
        badge.className = 'badge';
        badge.textContent = '⏳ Sem Seleção';
        badge.style.background = 'rgba(255,255,255,0.05)';
        badge.style.color = 'var(--text-dim)';
        if (obsText) {
            obsText.value = '';
            obsText.disabled = true;
        }
        return;
    }

    if (obsText) obsText.disabled = false;

    const key = `amostra_decisao_${corId}_${numId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const decisao = JSON.parse(saved);
            if (obsText) obsText.value = decisao.obs || '';
            if (decisao.status === 'APROVADA') {
                badge.className = 'badge badge-teal';
                badge.textContent = '✅ Aprovada';
                badge.style.background = 'rgba(20, 184, 166, 0.15)';
                badge.style.color = 'var(--teal)';
            } else if (decisao.status === 'REPROVADA') {
                badge.className = 'badge badge-red';
                badge.textContent = '❌ Alteração Solicitada';
                badge.style.background = 'rgba(239, 68, 68, 0.15)';
                badge.style.color = 'var(--red)';
            } else {
                badge.className = 'badge';
                badge.textContent = '⏳ Pendente';
                badge.style.background = 'rgba(245, 158, 11, 0.15)';
                badge.style.color = 'var(--amber)';
            }
        } catch (e) {
            badge.className = 'badge';
            badge.textContent = '⏳ Pendente';
            badge.style.background = 'rgba(245, 158, 11, 0.15)';
            badge.style.color = 'var(--amber)';
            if (obsText) obsText.value = '';
        }
    } else {
        badge.className = 'badge';
        badge.textContent = '⏳ Pendente';
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
        badge.style.color = 'var(--amber)';
        if (obsText) obsText.value = '';
    }
}

window.updateAmostraDecisaoUI = updateAmostraDecisaoUI;

window.decisionAmostra = function(status) {
    const corId = document.getElementById('amostra-cor')?.value;
    const numId = document.getElementById('amostra-numeracao')?.value;
    const obsText = document.getElementById('amostra-obs-alteracao');
    const obs = obsText ? obsText.value.trim() : '';

    if (!corId || !numId) {
        return toast('Selecione uma Cor e uma Numeração antes de salvar a decisão.', 'error');
    }

    if (status === 'REPROVADA' && !obs) {
        return toast('Por favor, descreva as observações da alteração solicitada.', 'warning');
    }

    const key = `amostra_decisao_${corId}_${numId}`;
    const decisao = {
        status,
        obs,
        date: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(decisao));
    updateAmostraDecisaoUI();

    if (status === 'APROVADA') {
        toast('Amostra Aprovada com sucesso!', 'success');
    } else {
        toast('Solicitação de alteração registrada!', 'warning');
    }
};

// Configuração de listeners para Amostras

document.addEventListener('DOMContentLoaded', () => {

    const amArteInp = document.getElementById('amostra-arte-file');

    if (amArteInp) {

        amArteInp.addEventListener('change', e => {

            if (e.target.files[0]) loadAmostraArteFile(e.target.files[0]);

        });

    }

});



(function () {

    const amArteInp = document.getElementById('amostra-arte-file');

    if (amArteInp && !amArteInp._listenerSet) {

        amArteInp.addEventListener('change', e => {

            if (e.target.files[0]) loadAmostraArteFile(e.target.files[0]);

        });

        amArteInp._listenerSet = true;

    }

})();



window.setPreviewFace = function (face) {

    state.previewFace = face;

    const btnFront = document.getElementById('btn-preview-front');

    const btnBack = document.getElementById('btn-preview-back');

    if (face === 'front') {

        if (btnFront) {

            btnFront.style.background = 'var(--blue)';

            btnFront.style.color = 'white';

        }

        if (btnBack) {

            btnBack.style.background = 'rgba(255,255,255,0.06)';

            btnBack.style.color = 'var(--text-dim)';

        }

    } else {

        if (btnFront) {

            btnFront.style.background = 'rgba(255,255,255,0.06)';

            btnFront.style.color = 'var(--text-dim)';

        }

        if (btnBack) {

            btnBack.style.background = 'var(--blue)';

            btnBack.style.color = 'white';

        }

    }

    drawPreview();

};



// - MODELOS DE IMPOSIÇÃO E OS -

async function renderModelosImposicao() {

    const tbody = document.getElementById('tbody-modelos-imposicao');

    const empty = document.getElementById('empty-modelos-imposicao');

    if (!tbody) return;



    if (!state.modelosImposicao || !state.modelosImposicao.length) {

        tbody.innerHTML = '';

        if (empty) empty.style.display = 'block';

        return;

    }

    if (empty) empty.style.display = 'none';



    tbody.innerHTML = state.modelosImposicao.map(m => {

        const fmt = state.formatos.find(f => f.id === m.formato_id);

        const fmtName = fmt ? fmt.name : 'Não selecionado';

        const sai = state.saidas.find(s => s.id === m.saida_id);

        const saiName = sai ? sai.name : 'Não selecionado';

        

        let schemaName = m.schema || 'sequential';

        if (schemaName === 'sequential') schemaName = 'Sequencial';

        else if (schemaName === 'cut_stack') schemaName = 'Cut & Stack';

        else if (schemaName === 'step_repeat') schemaName = 'Step & Repeat';

        else if (schemaName === 'pdf_multiple') schemaName = 'Pdf Paginado';

        else if (schemaName === 'multi_artes') schemaName = 'Multi-Artes';



        return `

            <tr>

                <td><strong>${m.name || 'Sem nome'}</strong></td>

                <td>${fmtName}</td>

                <td>${saiName}</td>

                <td><span class="badge badge-blue">${schemaName}</span></td>

                <td class="actions-cell">

                    <button class="btn btn-sm btn-ghost" onclick="loadSelectedModelo('${m.id}')" title="Carregar este modelo no painel">📂 Carregar</button>

                    <button class="btn btn-danger btn-sm" onclick="deleteModeloImposicao('${m.id}')" title="Excluir este modelo">🗑️</button>

                </td>

            </tr>

        `;

    }).join('');

}

window.renderModelosImposicao = renderModelosImposicao;



async function deleteModeloImposicao(modId) {

    if (!confirm('Excluir este modelo de imposição?')) return;

    try {

        await api('DELETE', `/modelos_imposicao/${modId}`);

        toast('Modelo excluído com sucesso!', 'success');

        await loadAll();

    } catch (e) {

        toast('Erro ao excluir modelo: ' + e.message, 'error');

    }

}

window.deleteModeloImposicao = deleteModeloImposicao;



async function promptSaveModelo() {

    const name = prompt('Digite o nome do novo modelo de imposição:');

    if (!name || !name.trim()) return;



    const config = getImposicaoConfigData();

    if (!config.formato_id) {

        return toast('Selecione ao menos um Formato antes de salvar o modelo.', 'error');

    }



    const payload = {

        name: name.trim(),

        ...config

    };



    try {

        const res = await api('POST', '/modelos_imposicao', payload);

        toast('Modelo de imposição criado com sucesso!', 'success');

        await loadAll();

        // Atualizar o seletor para o novo modelo

        const selector = document.getElementById('imp-modelo-selector');

        if (selector) selector.value = res.id;

    } catch (e) {

        toast('Erro ao salvar modelo: ' + e.message, 'error');

    }

}

window.promptSaveModelo = promptSaveModelo;



async function loadSelectedModelo(modId) {

    if (!modId) return;

    const m = state.modelosImposicao.find(x => x.id === modId);

    if (!m) return toast('Modelo não encontrado.', 'error');



    // Preencher campos

    const setSelectVal = (id, val) => {

        const el = document.getElementById(id);

        if (el) {

            el.value = val || '';

            el.dispatchEvent(new Event('change'));

        }

    };



    setSelectVal('imp-formato', m.formato_id);

    

    populateSelects();



    setSelectVal('imp-numeracao', m.numeracao_id);

    setSelectVal('imp-numeracao-2', m.numeracao_2_id);

    setSelectVal('imp-saida', m.saida_id);



    if (document.getElementById('imp-start')) document.getElementById('imp-start').value = m.start_num || 1;

    if (document.getElementById('imp-end')) document.getElementById('imp-end').value = m.end_num || 100;

    

    setSelectVal('imp-schema', m.schema);

    setSelectVal('imp-print-mode', m.print_mode);

    setSelectVal('imp-rotate-page', m.rotate_page ? 'true' : 'false');



    if (m.schema === 'multi_artes' && m.multi_artes) {

        state.impMultiArtes = JSON.parse(JSON.stringify(m.multi_artes));

        if (window.renderMultiArtes) window.renderMultiArtes();

        if (window.toggleMultiArtes) window.toggleMultiArtes();
        if (window.toggleCutStackOptions) window.toggleCutStackOptions();

    }



    updateImpSummary();

    toast(`Modelo "${m.name}" carregado com sucesso!`, 'success');

}

window.loadSelectedModelo = loadSelectedModelo;



function getImposicaoConfigData() {

    const fileInput = document.getElementById('imp-file');

    const filename = fileInput && fileInput.files && fileInput.files.length > 0 ? fileInput.files[0].name : '';

    return {

        formato_id: document.getElementById('imp-formato')?.value || '',

        numeracao_id: document.getElementById('imp-numeracao')?.value || '',

        numeracao_2_id: document.getElementById('imp-numeracao-2')?.value || '',

        saida_id: document.getElementById('imp-saida')?.value || '',

        start_num: parseInt(document.getElementById('imp-start')?.value) || 1,

        end_num: parseInt(document.getElementById('imp-end')?.value) || 100,

        schema: document.getElementById('imp-schema')?.value || 'sequential',

        print_mode: document.getElementById('imp-print-mode')?.value || 'front',

        rotate_page: parseInt(document.getElementById('imp-rotate-page')?.value || 0) || 0,

        multi_artes: (document.getElementById('imp-schema')?.value === 'multi_artes') ? state.impMultiArtes : [],

        arte_filename: filename

    };

}



async function exportOS() {

    const config = getImposicaoConfigData();

    if (!config.formato_id) {

        return toast('Selecione um formato para exportar a OS.', 'error');

    }



    const defaultFilename = `os_imposicao_${config.formato_id}.json`;

    const jsonString = JSON.stringify(config, null, 2);



    // Tenta usar a API File System Access se disponível (permite escolher pasta e renomear)

    if (window.showSaveFilePicker) {

        try {

            const options = {

                suggestedName: defaultFilename,

                types: [{

                    description: 'JSON Files',

                    accept: {

                        'application/json': ['.json'],

                    },

                }],

            };

            const handle = await window.showSaveFilePicker(options);

            const writable = await handle.createWritable();

            await writable.write(jsonString);

            await writable.close();

            toast('Ordem de Serviço (OS) salva com sucesso!', 'success');

            return;

        } catch (err) {

            // Se o usuário cancelou o diálogo, não faz nada

            if (err.name === 'AbortError') {

                return;

            }

            console.error("Falha ao usar showSaveFilePicker, usando fallback:", err);

        }

    }



    // Fallback: Prompt para nome do arquivo + download convencional

    const filename = prompt('Digite o nome do arquivo para salvar a OS:', defaultFilename);

    if (filename === null) return; // cancelado pelo usuário

    

    const finalFilename = filename.trim() || defaultFilename;

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);

    const downloadAnchor = document.createElement('a');

    downloadAnchor.setAttribute("href", dataStr);

    downloadAnchor.setAttribute("download", finalFilename.endsWith('.json') ? finalFilename : finalFilename + '.json');

    document.body.appendChild(downloadAnchor);

    downloadAnchor.click();

    downloadAnchor.remove();

    toast('Ordem de Serviço (OS) exportada localmente!', 'success');

}

window.exportOS = exportOS;



function importOS(input) {

    const file = input.files[0];

    if (!file) return;



    const reader = new FileReader();

    reader.onload = function(e) {

        try {

            const config = JSON.parse(e.target.result);

            if (!config.formato_id) {

                throw new Error('Arquivo JSON inválido. Campo formato_id obrigatório.');

            }



            const setSelectVal = (id, val) => {

                const el = document.getElementById(id);

                if (el) {

                    el.value = val || '';

                    el.dispatchEvent(new Event('change'));

                }

            };



            setSelectVal('imp-formato', config.formato_id);

            populateSelects();



            setSelectVal('imp-numeracao', config.numeracao_id);

            setSelectVal('imp-numeracao-2', config.numeracao_2_id);

            setSelectVal('imp-saida', config.saida_id);



            if (document.getElementById('imp-start')) document.getElementById('imp-start').value = config.start_num || 1;

            if (document.getElementById('imp-end')) document.getElementById('imp-end').value = config.end_num || 100;

            

            setSelectVal('imp-schema', config.schema);

            setSelectVal('imp-print-mode', config.print_mode);

            setSelectVal('imp-rotate-page', config.rotate_page ? 'true' : 'false');



            if (config.schema === 'multi_artes' && config.multi_artes) {

                state.impMultiArtes = JSON.parse(JSON.stringify(config.multi_artes));

                if (window.renderMultiArtes) window.renderMultiArtes();

                if (window.toggleMultiArtes) window.toggleMultiArtes();
                if (window.toggleCutStackOptions) window.toggleCutStackOptions();

            }



            updateImpSummary();



            // Gravar o estado da OS ativa

            state.loadedOSName = file.name;

            state.expectedArteName = config.arte_filename || '';



            // Atualizar o elemento visual

            const activeOsStatus = document.getElementById('active-os-status');

            const activeOsName = document.getElementById('active-os-name');

            if (activeOsStatus && activeOsName) {

                activeOsName.textContent = file.name;

                activeOsStatus.style.display = 'flex';

            }



            const fileInput = document.getElementById('imp-file');

            if (fileInput) {

                fileInput.value = ''; // Limpa arquivo antigo

            }

            

            const infoEl = document.getElementById('imp-file-info');

            if (config.arte_filename) {

                if (infoEl) {

                    infoEl.innerHTML = `<span style="color: var(--blue); font-weight: bold;">⚠️ Selecione o arquivo novamente:</span> "${config.arte_filename}"`;

                    infoEl.style.display = 'block';

                }

                // Marcar o passo 4 como ativo para guiar o usuário

                document.getElementById('step-4')?.classList.add('active');

                toast(`OS "${file.name}" carregada! Lembre-se de selecionar o arquivo de arte: "${config.arte_filename}"`, 'info');

            } else {

                if (infoEl) {

                    infoEl.style.display = 'none';

                    infoEl.textContent = '';

                }

                toast(`OS "${file.name}" carregada com sucesso!`, 'success');

            }

        } catch (err) {

            toast('Erro ao importar OS: ' + err.message, 'error');

        } finally {

            input.value = '';

        }

    };

    reader.readAsText(file);

}

window.importOS = importOS;



function clearActiveOS() {

    state.loadedOSName = "";

    state.expectedArteName = "";

    

    const activeOsStatus = document.getElementById('active-os-status');

    const activeOsName = document.getElementById('active-os-name');

    if (activeOsStatus && activeOsName) {

        activeOsName.textContent = "Nenhuma";

        activeOsStatus.style.display = 'none';

    }



    const infoEl = document.getElementById('imp-file-info');

    if (infoEl) {

        infoEl.style.display = 'none';

        infoEl.textContent = '';

    }



    const fileInput = document.getElementById('imp-file');

    if (fileInput) {

        fileInput.value = '';

    }



    toast('OS desvinculada. Validações de arquivo liberadas.', 'info');

}

window.clearActiveOS = clearActiveOS;


// -------------------------------------------------------------------------------
// ORDENS DE SERVIÇO -- Integração com banco de dados compartilhado
// -------------------------------------------------------------------------------

// Estado local de OS
if (!state.ordens) state.ordens = [];
if (!state.osItens) state.osItens = {};
if (!state.osExpandedId) state.osExpandedId = null;
if (!state.activeOSItem) state.activeOSItem = null;

/**
 * Sincroniza dinamicamente o status da OS em memória e no banco com base nas decisões de amostra do cliente
 */
async function sincronizarStatusOrdensDinamico() {
    // Apenas rodar no painel interno (não na página do cliente)
    if (state.amostrasContainerId === 'cliente-amostras-itens-container') return;

    for (const os of state.ordens) {
        const osId = os.id;
        const itens = state.osItens[osId] || [];
        if (itens.length === 0) continue;

        // Se o status da OS já estiver finalizado em termos de produção, não fazemos override
        if (os.status === 'FINALIZADA' || os.status === 'CANCELADA' || os.status === 'PRODUÇÃO' || os.status === 'EM IMPRESSÃO') {
            continue;
        }

        // Verificar o status de todas as amostras/itens
        const todosAprovados = itens.every(item => item.amostra_status === 'APROVADA');
        const algumReprovado = itens.some(item => item.amostra_status === 'REPROVADA');

        let novoStatus = null;
        if (todosAprovados) {
            novoStatus = 'APROVADO';
        } else if (algumReprovado) {
            novoStatus = 'REPROVADO';
        }

        if (novoStatus && os.status !== novoStatus) {
            console.log(`[Sync] Ajustando status da OS #${os.numero} de ${os.status} para ${novoStatus} com base nas amostras.`);
            
            // 1. Atualizar em memória
            os.status = novoStatus;

            // 2. Atualizar no localstorage overrides (comum para ordens Vibecode e Supabase no front)
            const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
            overrides[osId] = novoStatus;
            localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

            // 3. Atualizar no banco Supabase (somente se for OS local e não for mock/vibe virtual)
            if (typeof supabaseClient !== 'undefined' && supabaseClient && !osId.startsWith('vibe_')) {
                try {
                    await supabaseClient
                        .from('producao_ordens_servico')
                        .update({ status: novoStatus })
                        .eq('id', osId);
                } catch (err) {
                    console.warn(`[Sync] Falha ao gravar status no Supabase para OS #${os.numero}:`, err);
                }
            }
        }
    }

    // AUTO-SYNC v145: buscar do banco os pedidos onde todos os modelos sao PRONTO mas status nao e Enviar Arte
    // Faz uma unica query em pedidos_modelos para todas as OS da lista de arte
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const osParaVerificar = state.ordens.filter(os => {
                const s = (os.status || '').trim().toUpperCase();
                const ignorar = [
                    'ENVIAR ARTE', 'FINALIZADA', 'CANCELADA', 'EM IMPRESSAO', 'PRODUÇÃO',
                    'APROVADO', 'APROVADA_CLIENTE', 'AGUARD. APROVAÇÃO', 'AGUARDANDO_APROVACAO'
                ];


                return !ignorar.includes(s);
            });
            if (osParaVerificar.length > 0) {
                const numerosParaVerificar = osParaVerificar.map(os => parseInt(os.numero)).filter(n => !isNaN(n));
                if (numerosParaVerificar.length > 0) {
                    const { data: modelos } = await supabaseClient
                        .from('pedidos_modelos')
                        .select('id_int, status_arte')
                        .in('id_int', numerosParaVerificar);
                    if (modelos && modelos.length > 0) {
                        // Agrupar por id_int
                        const modelosPorPedido = {};
                        modelos.forEach(function(m) {
                            if (!modelosPorPedido[m.id_int]) modelosPorPedido[m.id_int] = [];
                            modelosPorPedido[m.id_int].push(m.status_arte || '');
                        });
                        // Verificar cada OS
                        for (const os of osParaVerificar) {
                            const num = parseInt(os.numero);
                            const statusItens = modelosPorPedido[num] || [];
                            if (statusItens.length === 0) continue;
                            // Status do banco que significam PRONTO para o designer
                            const prontos = ['PRONTO', 'AGUARDANDO_CLIENTE'];
                            const todosProntos = statusItens.every(function(s) { return prontos.indexOf((s || '').toUpperCase()) !== -1; });
                            if (!todosProntos) continue;
                            // Corrigir para Enviar Arte
                            console.log('[AUTO-SYNC-DB] Pedido #' + os.numero + ': todos modelos PRONTO no banco -> Enviar Arte');
                            os.status = 'Enviar Arte';
                            const ov = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                            ov[os.id] = 'Enviar Arte';
                            localStorage.setItem('vibe_status_overrides', JSON.stringify(ov));
                            // Atualizar banco em background
                            if (os.id.startsWith('vibe_')) {
                                supabaseClient.from('pedidos_links_cliente').update({ status_arte: 'Enviar Arte' }).eq('os_id', os.id).then(function(){});
                            } else {
                                supabaseClient.from('producao_ordens_servico').update({ status: 'Enviar Arte' }).eq('id', os.id).then(function(){});
                            }
                        }
                    }
                }
            }
        }
    } catch (syncErr) {
        console.warn('[AUTO-SYNC-DB] Erro na verificacao de status:', syncErr);
    }
}

/**
 * Carrega todas as OS -- Prioridade: Vibecode → Supabase Imposition → API local
 * No Vibecode, cada `id_int` (proposta) = 1 OS. Os produtos_proposta são os itens.
 */
async function loadOrdens() {
    try {
        // Deixar pedidosComerciais fixo vazio já que a tabela 'pedidos' não existe no banco.
        // Isso economiza uma consulta lenta que sempre falharia.
        const pedidosComerciais = [];
        state.hasPedidosComerciais = false;

        // Disparar buscas iniciais em paralelo (incluindo loadUsuarios para não bloquear o início)
        const promises = [
            carregarArtesGlobais(),
            carregarLinksExistentes(),
            loadUsuarios()
        ];
        
        // Se o Vibecode estiver ativo, carregamos os produtos em paralelo (excluindo campos de imagem base64 pesados que causavam travamentos)
        let vibeProdutosPromise = null;
        if (typeof vibeClient !== 'undefined' && vibeClient) {
            vibeProdutosPromise = vibeClient
                .from('produtos_proposta')
                .select('id, id_int, id_produto, nome_produto, modelo_descri, qtd, created_at, updated_at, amostra_cor_id, amostra_num_id, amostra_status, amostra_obs, amostra_arte_base64, arte_url')
                .order('created_at', { ascending: false });
            promises.push(vibeProdutosPromise);
        }
        
        const results = await Promise.all(promises);
        
        // Se o Vibecode estiver ativo, a resposta de produtos está na lista de resultados
        if (typeof vibeClient !== 'undefined' && vibeClient && vibeProdutosPromise) {
            const produtosResult = results[results.length - 1] || { data: [] };
            const produtos = produtosResult.data || [];
            
            if (produtos.length > 0) {
                console.log('[OS] Carregando do Vibecode...');
                // Passamos os produtos já carregados em paralelo para o loadOrdensFromVibecode
                const loaded = await loadOrdensFromVibecode(pedidosComerciais, produtos);
                if (loaded) {
                    await carregarModelosGlobais().catch(e => console.warn('Erro ao carregar modelos globais:', e));
                    renderOrdens();
                    
                    sincronizarStatusOrdensDinamico().then(() => {
                        renderOrdens();
                    }).catch(e => console.warn('Erro ao sincronizar status:', e));
                    
                    return;
                }
            }
            console.log('[OS] Vibecode sem dados, tentando fallback...');
        }

        // Buscar propostas para o fluxo de fallback apenas se necessário
        let propostasComerciais = [];
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data: propData, error: propError } = await supabaseClient
                    .from('propostas')
                    .select('id_int, cliente, vendedor, status_interno, id_cliente, id_faturado')
                    .order('id_int', { ascending: false })
                    .limit(2000);
                if (!propError && propData) {
                    propostasComerciais = propData;
                }
            } catch (err) {
                console.warn('[Supabase] Falha ao carregar tabela propostas:', err);
            }
        }

        // Fonte 2: Supabase do Imposition (Banco único do Vibecode)
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('producao_ordens_servico')
                .select('*, producao_os_itens(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;

            let ordensFiltradas = data || [];
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
            if (!isDev || (pedidosComerciais && pedidosComerciais.length > 0)) {
                ordensFiltradas = ordensFiltradas.filter(os => {
                    const osNumeroInt = parseInt(os.numero);
                    const temNoComercial = pedidosComerciais.some(ped => String(ped.id_int) === String(osNumeroInt));
                    const temNasArtes = (state.todasArtes || []).some(a => String(a.id_int) === String(osNumeroInt));
                    return temNoComercial || temNasArtes;
                });
            }

            state.ordens = ordensFiltradas.map(os => {
                const vibeStatusOverrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                const savedStatus = vibeStatusOverrides[os.id];
                let dbStatus = os.status;
                if (dbStatus === 'PRODUÇÃO') dbStatus = 'EM IMPRESSÃO';
                else if (dbStatus === 'ARTE' || dbStatus === 'NOVO') dbStatus = 'ARTE_EM_ANDAMENTO';
                
                // Pré-carrega no estado local os itens buscados para agilizar o collapse e as estatísticas
                // COMENTADO: O cache via producao_os_itens foi removido, pois agora usamos pedidos_modelos em loadOSItens
                // if (os.producao_os_itens) {
                //     state.osItens[os.id] = os.producao_os_itens;
                // }
                
                // Mapear o status_arte comercial
                const osNumeroInt = parseInt(os.numero);
                const pedidoReal = pedidosComerciais.find(ped => String(ped.id_int) === String(osNumeroInt));
                
                // Sobrescrever cliente e vendedor usando a tabela propostas
                const propReal = propostasComerciais.find(pr => String(pr.id_int) === String(osNumeroInt));
                const clienteProposta = propReal?.cliente || propReal?.cliente_nome || propReal?.dados_cliente || os.cliente || getFallbackCliente(osNumeroInt);
                const vendedorProposta = propReal?.vendedor || propReal?.vendedor_nome || os.vendedor || getFallbackVendedor(osNumeroInt);
                
                return {
                    ...os,
                    status: savedStatus || dbStatus,
                    status_arte: pedidoReal?.status_arte || null,
                    status_interno: propReal?.status_interno || null,
                    cliente: clienteProposta,
                    vendedor: vendedorProposta,
                    id_cliente: propReal?.id_faturado || propReal?.id_cliente || null,
                    data_liberacao: os.data_liberacao || os.created_at,
                    prazo_entrega: os.prazo_entrega || getFallbackPrazo(os.created_at, os.numero || 0),
                    _itens_count: os.producao_os_itens ? os.producao_os_itens.length : 0
                };
            });
        } else {
            // Fonte 3: API local (FastAPI)
            const res = await fetch(`${API_BASE_URL}/api/ordens`);
            if (res.ok) {
                const localData = await res.json();
                const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
                
                const mappedLocalData = localData.map(os => {
                    const osNumeroInt = parseInt(os.numero);
                    const pedidoReal = pedidosComerciais.find(ped => String(ped.id_int) === String(osNumeroInt));
                    
                    const propReal = propostasComerciais.find(pr => String(pr.id_int) === String(osNumeroInt));
                    const clienteProposta = propReal?.cliente || propReal?.cliente_nome || propReal?.dados_cliente || os.cliente || getFallbackCliente(osNumeroInt);
                    const vendedorProposta = propReal?.vendedor || propReal?.vendedor_nome || os.vendedor || getFallbackVendedor(osNumeroInt);
                    
                    return {
                        ...os,
                        cliente: clienteProposta,
                        vendedor: vendedorProposta,
                        id_cliente: propReal?.id_faturado || propReal?.id_cliente || null,
                        status_arte: pedidoReal?.status_arte || os.status_arte || null,
                        status_interno: propReal?.status_interno || os.status_interno || null
                    };
                });

                // AUTO-SYNC local: popular state.todasArtes no modo local
                if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                    state.todasArtes = mappedLocalData.map(os => ({
                        id_int: parseInt(os.numero),
                        status: os.status_arte || 'Em Arte',
                        nome_evento: 'Show Local',
                        designer_nome: 'Designer Local',
                        designer_uid: 'local-designer',
                        entrega_dados: ''
                    }));
                }

                if (!isDev || (pedidosComerciais && pedidosComerciais.length > 0)) {
                    state.ordens = mappedLocalData.filter(os => {
                        const osNumeroInt = parseInt(os.numero);
                        const temNoComercial = pedidosComerciais.some(ped => String(ped.id_int) === String(osNumeroInt));
                        const temNasArtes = (state.todasArtes || []).some(a => String(a.id_int) === String(osNumeroInt));
                        return temNoComercial || temNasArtes;
                    });
                } else {
                    state.ordens = mappedLocalData;
                }
            } else {
                state.ordens = [];
            }
        }
        await sincronizarStatusOrdensDinamico();
        carregarModelosGlobais().then(() => renderOrdens()).catch(e => console.warn('Erro modelos globais:', e));
        renderOrdens();
    } catch (e) {
        console.error('Erro ao carregar OS:', e);
        toast('Erro ao carregar Ordens de Serviço: ' + e.message, 'error');
    }
}

/**
 * Busca todos os links ativos no banco e popula state.linksCliente
 * para que a Fila de Arte exiba os links já existentes ao carregar.
 */
async function carregarLinksExistentes() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('pedidos_links_cliente')
            .select('os_id, numero_pedido, token, status_arte')
            .eq('ativo', true);
        if (error) {
            if (error.code === '42P01') return; // tabela ainda não existe
            throw error;
        }
        if (!state.linksCliente) state.linksCliente = {};
        if (!state.linksClienteData) state.linksClienteData = {};
        const base = window.location.origin;
        (data || []).forEach(row => {
            state.linksCliente[row.os_id] = `${base}/cliente/${row.numero_pedido}-${row.token}`;
            state.linksClienteData[row.os_id] = row;
        });
        console.log(`[Links] ${(data || []).length} link(s) de cliente carregado(s).`);
    } catch (e) {
        console.warn('[Links] Erro ao carregar links existentes:', e.message);
    }
}

/**
 * Busca a tabela pedidos_artes de forma global (simplificada) para 
 * montar as estatísticas reais na Lista de Arte sem depender de cliques individuais.
 */
async function carregarArtesGlobais() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('pedidos_artes')
            .select('id_int, status, nome_evento, designer_nome, designer_uid, entrega_dados')
            .order('created_at', { ascending: false });
        if (error) {
            if (error.code === '42P01') return; // tabela não existe
            throw error;
        }
        state.todasArtes = data || [];
        console.log(`[Artes] ${state.todasArtes.length} registros de arte carregados globalmente.`);
    } catch (e) {
        console.warn('[Artes] Erro ao carregar artes globais:', e.message);
    }
}

async function carregarModelosGlobais() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    if (!state.ordens || state.ordens.length === 0) return;

    try {
        const todosNumeros = state.ordens.map(os => parseInt(os.numero)).filter(n => !isNaN(n));
        const chunkSize = 200;
        let todosModelos = [];
        
        for (let i = 0; i < todosNumeros.length; i += chunkSize) {
            const chunk = todosNumeros.slice(i, i + chunkSize);
            const { data, error } = await supabaseClient
                .from('pedidos_modelos')
                .select('id, id_int, status_arte, status_impressao, status_producao, quantidade, ordem, nome_modelo, amostra_arte_base64, arte_url')
                .in('id_int', chunk);
                
            if (error) throw error;
            if (data) todosModelos = todosModelos.concat(data);
        }
        
        state.modelosGlobais = {};
        todosModelos.forEach(m => {
            if (!state.modelosGlobais[m.id_int]) state.modelosGlobais[m.id_int] = [];
            m.impressao = normalizarStatusImpressao(m.status_impressao || m.status_producao);
            m.quantidade = parseInt(m.quantidade || 0);
            m.amostra_status = m.status_arte || m.amostra_status || '';
            m.amostra_arte_base64 = m.amostra_arte_base64 || '';
            m.arte_url = m.arte_url || '';
            m.ordem = m.ordem !== undefined ? m.ordem : null;
            m.modelo = m.nome_modelo || '';
            state.modelosGlobais[m.id_int].push(m);
        });
        console.log(`[Modelos] ${todosModelos.length} modelos carregados globalmente para contagem.`);
    } catch (e) {
        console.warn('[Modelos] Erro ao carregar modelos globais:', e.message);
    }
}



/**
 * Carrega OS do Vibecode agrupando produtos_proposta por id_int
 * Cada id_int = 1 proposta = 1 OS virtual
 * Retorna true se conseguiu carregar, false se não há dados
 */
async function loadOrdensFromVibecode(pedidosComerciais = [], produtosPreloaded = null) {
    try {
        let produtos = produtosPreloaded;
        if (!produtos) {
            const { data, error } = await vibeClient
                .from('produtos_proposta')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[Vibecode] Erro ao ler produtos_proposta:', error);
                return false;
            }
            produtos = data;
        }

        if (!produtos || produtos.length === 0) return false;

        // Buscar propostas (tabela pai) se existir e for acessível
        let propostas = [];
        try {
            const uniqueIdInts = [...new Set(produtos.map(p => p.id_int).filter(Boolean))];
            if (uniqueIdInts.length > 0) {
                const { data: propData, error: propError } = await vibeClient
                    .from('propostas')
                    .select('id, id_int, cliente, vendedor, status_interno, created_at, id_cliente, id_faturado, frete_escolhido')
                    .in('id_int', uniqueIdInts);
                if (!propError && propData) {
                    propostas = propData;
                }
            }
        } catch (pe) {
            console.warn('[Vibecode] Não foi possível ler tabela propostas (usando fallbacks):', pe);
        }

        // pedidosComerciais ignorado/tabela 'pedidos' inexistente

        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

        // Agrupar por id_int (cada id_int = 1 proposta = 1 OS)
        const grouped = {};
        produtos.forEach(p => {
            const key = p.id_int;

            // FILTRAR: Se for produção (não-dev) ou se tiver pedidosComerciais populada, filtra
            if (!isDev || (pedidosComerciais && pedidosComerciais.length > 0)) {
                const existeComercial = pedidosComerciais.some(ped => String(ped.id_int) === String(key));
                const existeArtes = (state.todasArtes || []).some(a => String(a.id_int) === String(key));
                if (!existeComercial && !existeArtes) {
                    return; // ignora este produto e não cria a OS
                }
            }

            if (!grouped[key]) {
                const vibeStatusOverrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                const osId = `vibe_${key}`;
                const dbStatusArte = state.linksClienteData && state.linksClienteData[osId] && state.linksClienteData[osId].status_arte;
                const savedStatus = vibeStatusOverrides[osId] || dbStatusArte;


                // Buscar dados reais da proposta
                const propReal = propostas.find(pr => pr.id_int === key || pr.id === key || pr.numero === key);
                
                // Buscar dados do pedido comercial
                const pedidoReal = pedidosComerciais.find(ped => String(ped.id_int) === String(key));

                // Mapear campos com fallbacks determinísticos
                const cliente = propReal?.cliente || propReal?.cliente_nome || propReal?.dados_cliente || getFallbackCliente(key);
                const vendedor = propReal?.vendedor || propReal?.vendedor_nome || getFallbackVendedor(key);
                const dataLiberacao = propReal?.data_liberacao || propReal?.data_libera || p.created_at;
                const prazoEntrega = propReal?.prazo_entrega || propReal?.prazo || getFallbackPrazo(p.created_at, key);

                // Dados comerciais reais
                const dataPedido = pedidoReal?.data_pedido || null;
                const valorTotal = pedidoReal?.valor_total || null;

                grouped[key] = {
                    id: osId,
                    numero: key,
                    status: savedStatus || 'Em Arte',
                    status_arte: pedidoReal?.status_arte || null,
                    status_interno: propReal?.status_interno || null,
                    cliente: cliente,
                    vendedor: vendedor,
                    id_cliente: propReal?.id_faturado || propReal?.id_cliente || null,
                    data_liberacao: dataLiberacao,
                    data_pedido: dataPedido,
                    valor_total: valorTotal,
                    prazo_entrega: prazoEntrega,
                    frete_escolhido: propReal?.frete_escolhido || null,
                    observacoes: `Proposta #${key} -- Vibecode`,
                    criado_por: null,
                    created_at: p.created_at,
                    updated_at: p.updated_at || p.created_at,
                    _itens_count: 0,
                    _source: 'vibecode',
                    _itens_raw: []
                };
            }
            grouped[key]._itens_count++;
            grouped[key]._itens_raw.push(p);

            // Usar a data mais recente
            if (p.updated_at && p.updated_at > grouped[key].updated_at) {
                grouped[key].updated_at = p.updated_at;
            }
        });

        // Converter para array ordenado por número (desc)
        state.ordens = Object.values(grouped).sort((a, b) => b.numero - a.numero);

        // Pré-carregar itens no formato esperado pelo Imposition
        state.ordens.forEach(os => {
            state.osItens[os.id] = (os._itens_raw || []).map(p => mapVibecodeProdutoToOSItem(p, os.id));
            delete os._itens_raw; // limpar dados brutos
        });

        console.log(`[Vibecode] ${state.ordens.length} OS carregadas, ${produtos.length} itens totais`);
        return true;
    } catch (e) {
        console.error('[Vibecode] Erro na leitura:', e);
        return false;
    }
}

/**
 * Transforma um produto_proposta do Vibecode → formato os_itens do Imposition
 */
function mapVibecodeProdutoToOSItem(p, osId) {
    // Detectar tipo de produto pelo nome
    const nomeProd = (p.nome_produto || '').toUpperCase();
    
    // Buscar o setor real do produto globalmente cadastrado
    const prodObj = (state.produtosGlobais || []).find(pg => String(pg.id_produto) === String(p.id_produto));
    let setor = prodObj && prodObj.setor_pcp ? prodObj.setor_pcp : 'PVC';
    
    let produto = nomeProd;
    
    // Mapear nomes conhecidos
    if (nomeProd.includes('TRIBAND')) produto = 'TRIBAND';
    else if (nomeProd.includes('MOBI')) produto = 'MOBI';
    else if (nomeProd.includes('BRACELETE')) produto = 'TEX PLUS';
    else if (nomeProd.includes('CORD')) produto = 'CORDÃO';
    else if (nomeProd.includes('TEX')) produto = 'TEX';
    else if (nomeProd.includes('PULSEIRA')) produto = 'TEX';

    // Extrair formato da descrição (ex: "25×2cm" → "Mobi")
    const formato = p.modelo_descri || 'Mobi';

    return {
        id: `vibe_item_${p.id}`,
        os_id: osId,
        setor: setor,
        produto: produto,
        modelo: `VIBE-${p.id_int}-${p.id}`,
        formato: formato,
        formato_id: null, // matching automático vai preencher
        quantidade: p.qtd || 0,
        num_inicial: 1,
        num_final: p.qtd || 0,
        cor_id: null,
        blocos: 'N',
        verso: false,
        numeracao: 'SEQUENCIAL',
        numeracao_id: null,
        aprovacao: 'APROVADA',
        impressao: (() => {
            const impOverrides = JSON.parse(localStorage.getItem('vibe_item_impressao_overrides') || '{}');
            return impOverrides[`vibe_item_${p.id}`] || 'AGUARD.';
        })(),
        sheets_per_block: p.bloco && parseInt(p.bloco) > 0 ? parseInt(p.bloco) : (() => {
            const format = state.formatos.find(f => String(f.id) === String(p.formato_id));
            return format ? (parseInt(format.default_sheets_per_block) || 50) : 50;
        })(),
        
        c_ini: p.C_INI || p.c_ini || 1,
        q_cam: p.Q_CAM || p.q_cam || p.qtd_locais || p.qtd_cam || 0,
        l_cam: p.L_CAM || p.l_cam || p.lotacao_cam || p.lotacao || p.lotacao_por_local || 1,
        observacoes: p.modelo_descri || p.nome_produto || '',
        amostra_arte_base64: p.amostra_arte_base64 || p.arte_url || '',
        arte_url: p.arte_url || p.amostra_arte_base64 || '',
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
        
        // --- Campos de Amostra (salvos no BD) ---
        amostra_cor_id: p.amostra_cor_id || null,
        amostra_num_id: p.amostra_num_id || null,
        amostra_arte_base64: p.amostra_arte_base64 || null,
        amostra_status: (() => {
            const overrides = JSON.parse(localStorage.getItem('vibe_item_amostra_overrides') || '{}');
            return (overrides[`vibe_item_${p.id}`] && overrides[`vibe_item_${p.id}`].amostra_status) || p.amostra_status || 'PENDENTE';
        })(),
        amostra_obs: (() => {
            const overrides = JSON.parse(localStorage.getItem('vibe_item_amostra_overrides') || '{}');
            return (overrides[`vibe_item_${p.id}`] && overrides[`vibe_item_${p.id}`].amostra_obs) || p.amostra_obs || '';
        })(),
        
        _source: 'vibecode',
        _vibe_produto_id: p.id,
        _vibe_id_produto: p.id_produto,
        _nome_original: p.nome_produto
    };
}

/**
 * Carrega os itens de uma OS específica
 */
async function loadOSItens(osId) {
    try {
        if (!state._loadingOSItens) state._loadingOSItens = {};
        if (state._loadingOSItens[osId]) return;
        state._loadingOSItens[osId] = true;

        const os = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId || String(o.id) === String(osId) || String(o.numero) === String(osId)) : null);
        if (!os) {
            state._loadingOSItens[osId] = false;
            return;
        }
        const targetId = os.id || osId;

        // Se não carregado ainda, ou se tem apenas o cache básico do Vibecode, busca a fonte de dados principal
        const needsFullLoad = !state.osItens[osId] || state.osItens[osId].length === 0 || state.osItens[osId].some(i => i._dbLoaded !== true);
        if (needsFullLoad) {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const queryNum = parseInt(os.numero);
                const { data, error } = await supabaseClient
                    .from('pedidos_modelos')
                    .select('*')
                    .eq('id_int', queryNum)
                    .order('ordem', { ascending: true });
                if (error) throw error;
                
                // Buscar nome do produto original da proposta e os IDs de cor/numeração salvos pelo parceiro
                const { data: propData } = await supabaseClient
                    .from('produtos_proposta')
                    .select('*')
                    .eq('id_int', queryNum);
                
                if (data && data.length > 0) {
                    // Usar pedidos_modelos como fonte principal
                    state.osItens[osId] = data.map(item => {
                        const prop = propData?.find(p => p.id === item.id_produto_proposta_origem);
                        
                        // Remapear o status_arte do banco para o amostra_status usado pela UI
                        let statusFrontend = 'PENDENTE';
                        if (item.status_arte === 'AGUARDANDO_CLIENTE' || item.status_arte === 'PRONTO') statusFrontend = 'PRONTO';
                        else if (item.status_arte === 'APROVADA_CLIENTE' || item.status_arte === 'APROVADA') statusFrontend = 'APROVADA';
                        else if (item.status_arte === 'REPROVADA_CLIENTE' || item.status_arte === 'REPROVADA') statusFrontend = 'REPROVADA';

                        const resolvedNumId = item.amostra_num_id || (prop ? prop.amostra_num_id : null);
                        const matchedNum = resolvedNumId ? (state.numeracoes || []).find(n => String(n.id) === String(resolvedNumId)) : null;
                        const numIsDuplex = isNumeracaoDuplex(matchedNum);
                        // Fonte de verdade: print_mode da numeração em producao_numeracoes
                        let resolvedVersoTipo;
                        if (matchedNum) {
                            // Numeração encontrada: usar print_mode da numeração
                            resolvedVersoTipo = numIsDuplex ? 'FxVerso' : 'Frente';
                        } else {
                            // Sem numeração: usar verso_tipo salvo no pedido, convertendo valores legados
                            const vt = item.verso_tipo;
                            if (vt === 'FxVerso' || vt === 'VERSO COMUM' || vt === 'VERSO VARIÁVEL' || vt === 'VERSO VARIAVEL' || vt === 'FRENTE E VERSO') {
                                resolvedVersoTipo = 'FxVerso';
                            } else {
                                resolvedVersoTipo = 'Frente';
                            }
                        }
                        const itemVerso = (resolvedVersoTipo === 'FxVerso');

                        const resolvedNumeracao = matchedNum ? (matchedNum.name || matchedNum.tipo) : (item.gabarito_operacional || item.tipo_numeracao || item.numeracao);
                        const resolvedGabarito = matchedNum ? (matchedNum.name || matchedNum.tipo) : (item.gabarito_operacional || null);

                        return {
                            ...item,
                            produto: item.nome_modelo || 'Modelo',
                            nome_produto_real: prop ? prop.nome_produto : null,
                            id_produto: prop ? prop.id_produto : (item.id_produto || null),
                            modelo: item.id ? item.id.toString() : '--',
                            cor: item.padrao || item.cor || 'STD',
                            numeracao: resolvedNumeracao,
                            gabarito_operacional: resolvedGabarito,
                            numeracao_id: resolvedNumId || null,
                            tipo_numeracao: item.tipo_numeracao || item.gabarito_operacional || null,
                            qtd: item.quantidade || item.qtd || 0,
                            num_inicial: item.numeracao_inicio || item.num_inicial,
                            num_final: item.numeracao_fim || item.num_final,
                            verso: itemVerso,
                            verso_tipo: resolvedVersoTipo,
                            impressao: normalizarStatusImpressao(item.status_impressao || item.status_producao || item.impressao),
                            nome_produto_real: prop ? prop.nome_produto : null,
                            amostra_cor_id: item.amostra_cor_id || item.id_cor || item.cor_id || (prop ? (prop.amostra_cor_id || prop.id_cor) : null),
                            amostra_num_id: resolvedNumId || null,
                            amostra_arte_base64: item.amostra_arte_base64 || (prop ? prop.amostra_arte_base64 : null),
                            verso_amostra_arte_base64: item.verso_amostra_arte_base64 || (prop ? prop.verso_amostra_arte_base64 : null),
                            arte_url: item.arte_url || item.url_arquivo_arte || item.url_arquivo || (prop ? (prop.arte_url || prop.url_arquivo_arte || prop.url_arquivo) : null),
                            verso_arte_url: item.verso_arte_url || item.url_arquivo_arte_verso || item.verso_url_arquivo || (prop ? (prop.verso_arte_url || prop.url_arquivo_arte_verso || prop.verso_url_arquivo) : null),
                            url_arquivo_arte: item.url_arquivo_arte || item.arte_url || (prop ? (prop.url_arquivo_arte || prop.arte_url) : null),
                            url_arquivo_arte_verso: item.url_arquivo_arte_verso || item.verso_arte_url || (prop ? (prop.url_arquivo_arte_verso || prop.verso_arte_url) : null),
                            amostra_obs: item.observacao_arte || item.amostra_obs || (prop ? prop.observacao_arte : null) || '',
                            os_id: osId,
                            _pedidoModeloId: item.id,
                            amostra_status: statusFrontend,
                            _vibe_id_produto: prop ? prop.id_produto : null,
                            setor: (() => {
                                const vibeProdId = prop ? prop.id_produto : null;
                                const prodObj = vibeProdId ? (state.produtosGlobais || []).find(pg => String(pg.id_produto) === String(vibeProdId)) : null;
                                return prodObj ? (prodObj.setor_pcp || '') : '';
                            })() || item.setor || 'PVC',
                            _dbLoaded: true
                        };
                    });
                    // DEBUG: mostrar campos de cor de cada item
                    state.osItens[osId].forEach(it => {
                        console.log(`[COR DEBUG] id=${it.id} padrao=${it.padrao} cor=${it.cor} amostra_cor_id=${it.amostra_cor_id} id_cor=${it.id_cor} cor_raw=${it._rawCor}`);
                    });
                } else if (propData && propData.length > 0) {
                    // Fallback: usar produtos_proposta diretamente quando pedidos_modelos está vazio
                    console.log('[loadOSItens] Fallback: usando produtos_proposta para id_int=' + queryNum);
                    const mappedItems = propData.map((pp, idx) => {
                        const resolvedNumId = pp.amostra_num_id || null;
                        const matchedNum = resolvedNumId ? (state.numeracoes || []).find(n => String(n.id) === String(resolvedNumId)) : null;
                        
                        const resolvedNumeracao = matchedNum ? (matchedNum.name || matchedNum.tipo) : (pp.tipo_numeracao || null);
                        const resolvedGabarito = matchedNum ? (matchedNum.name || matchedNum.tipo) : (pp.gabarito_operacional || null);

                        return {
                            id: pp.id,
                            id_int: pp.id_int,
                            nome_modelo: pp.nome_produto || `Modelo ${idx + 1}`,
                            produto: pp.nome_produto || `Modelo ${idx + 1}`,
                            modelo: pp.id ? pp.id.toString() : '--',
                            cor: pp.padrao || 'STD',
                            numeracao: resolvedNumeracao,
                            gabarito_operacional: resolvedGabarito,
                            numeracao_id: resolvedNumId || null,
                            num_inicial: pp.numeracao_inicio || null,
                            num_final: pp.numeracao_fim || null,
                            verso: pp.frente_verso || false,
                            impressao: 'AGUARD.',
                            nome_produto_real: pp.nome_produto,
                            padrao: pp.padrao || null,
                            largura: pp.largura || null,
                            altura: pp.altura || null,
                            qtd: pp.qtd || null,
                            amostra_cor_id: pp.amostra_cor_id || null,
                            amostra_num_id: resolvedNumId || null,
                            amostra_arte_base64: pp.amostra_arte_base64 || null,
                            arte_url: pp.arte_url || null,
                            ordem: idx + 1,
                            os_id: osId,
                            id_produto_proposta_origem: pp.id,
                            created_at: pp.created_at,
                            updated_at: pp.updated_at,
                            setor: (() => {
                                const vibeProdId = pp.id_produto || null;
                                const prodObj = vibeProdId ? (state.produtosGlobais || []).find(pg => String(pg.id_produto) === String(vibeProdId)) : null;
                                return prodObj ? (prodObj.setor_pcp || '') : '';
                            })() || 'PVC',
                            _dbLoaded: true
                        };
                    });

                    // Auto-criar registros em pedidos_modelos para que salvamentos futuros funcionem
                    try {
                        const insertPayloads = propData.map((pp, idx) => ({
                            id_int: pp.id_int,
                            id_produto_proposta_origem: pp.id,
                            nome_modelo: pp.nome_produto || `Modelo ${idx + 1}`,
                            quantidade: pp.qtd || 0,
                            ordem: idx + 1,
                            status_arte: 'PENDENTE',
                            status_producao: 'PENDENTE',
                            amostra_cor_id: pp.amostra_cor_id || null,
                            amostra_num_id: pp.amostra_num_id || null,
                            amostra_arte_base64: pp.amostra_arte_base64 || null,
                            arte_url: pp.arte_url || null,
                            gabarito_operacional: pp.gabarito_operacional || null
                        }));

                        const { data: insertedModelos, error: insertError } = await supabaseClient
                            .from('pedidos_modelos')
                            .insert(insertPayloads)
                            .select('id, id_produto_proposta_origem');

                        if (!insertError && insertedModelos) {
                            // Atualizar itens no state com _pedidoModeloId dos registros criados
                            mappedItems.forEach(item => {
                                const modelo = insertedModelos.find(m => String(m.id_produto_proposta_origem) === String(item.id_produto_proposta_origem));
                                if (modelo) {
                                    item._pedidoModeloId = modelo.id;
                                    item.id = modelo.id; // Usar o ID real de pedidos_modelos
                                }
                            });
                            console.log(`[loadOSItens] Auto-criou ${insertedModelos.length} registros em pedidos_modelos para id_int=${queryNum}`);
                        } else if (insertError) {
                            console.warn('[loadOSItens] Erro ao auto-criar pedidos_modelos:', insertError);
                        }
                    } catch (autoCreateErr) {
                        console.warn('[loadOSItens] Falha no auto-create de pedidos_modelos:', autoCreateErr);
                    }

                    state.osItens[osId] = mappedItems;
                } else {
                    state.osItens[osId] = [];
                }
            } else {
                const res = await fetch(`${API_BASE_URL}/api/ordens/${osId}/itens`);
                if (res.ok) {
                    state.osItens[osId] = await res.json();
                } else {
                    state.osItens[osId] = [];
                }
            }
        }

        // Buscar dados dinâmicos da arte (pedidos_artes) e mesclar nos itens
        if (typeof supabaseClient !== 'undefined' && supabaseClient && os.numero) {
            try {
                const queryNum = parseInt(os.numero);
                if (!isNaN(queryNum)) {
                    const { data: artes, error: artesError } = await supabaseClient
                        .from('pedidos_artes')
                        .select('*')
                        .eq('id_int', queryNum);
                    
                    if (!artesError && artes && artes.length > 0) {
                        state.osItens[osId].forEach(item => {
                            // Encontrar artes vinculadas a este item
                            const artesDoItem = artes.filter(a => 
                                String(a.id_modelo) === String(item.id) || 
                                (item._pedidoModeloId && String(a.id_modelo) === String(item._pedidoModeloId))
                            );
                            if (artesDoItem.length > 0) {
                                // Ordenar por versão decrescente para pegar a mais recente
                                artesDoItem.sort((a, b) => b.versao - a.versao);
                                const ultimaArte = artesDoItem[0];
                                
                                // Atualizar metadados de visualização
                                item.aprovacao = ultimaArte.status;
                                item.nome_arquivo_arte = ultimaArte.nome_arquivo;
                                item.versao_arte = ultimaArte.versao;
                                item.url_arquivo_arte = ultimaArte.url_arquivo;
                                item.url_arquivo_arte_verso = ultimaArte.verso_url_arquivo || null;
                                item.nome_arquivo_arte_verso = ultimaArte.verso_nome_arquivo || null;
                                if (ultimaArte.url_arquivo) {
                                    item.arte_url = ultimaArte.url_arquivo;
                                }
                                if (ultimaArte.verso_url_arquivo) {
                                    item.verso_arte_url = ultimaArte.verso_url_arquivo;
                                }
                                if (ultimaArte.comentarios_revisao && !item.amostra_obs) {
                                    item.amostra_obs = ultimaArte.comentarios_revisao;
                                }
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn('[Supabase] Erro ao integrar dados de pedidos_artes:', err);
            }
        }

        renderOSItens(osId);
        // Não chamar renderOrdens() aqui para evitar re-renderizar a tabela durante a navegação para amostras
    } catch (e) {
        console.error('Erro ao carregar itens da OS:', e);
        toast('Erro ao carregar itens: ' + e.message, 'error');
    } finally {
        if (state._loadingOSItens) state._loadingOSItens[osId] = false;
    }
}


/**
 * Formata data para exibição
 */
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna badge HTML para status
 */
function getStatusBadge(status) {
    const map = {
        // ── Status oficiais do fluxo de arte ──────────────────────
        'Em Arte':             { icon: '🎨', bg: '#3b82f6', label: 'Em Arte' },
        'Em Alteração':        { icon: '⚠️', bg: '#f97316', label: 'Em Alteração' },
        'Arte Pronta':         { icon: '✅', bg: '#8b5cf6', label: 'Arte Pronta' },
        'Enviar Arte':         { icon: '📤', bg: '#f59e0b', label: 'Enviar Arte' },
        'Aguard. Aprovação':   { icon: '⏳', bg: '#8b5cf6', label: 'Aguard. Aprovação' },
        'Aguardando':          { icon: '⏳', bg: '#8b5cf6', label: 'Aguard. Aprovação' },
        'Aprovada':            { icon: '✅', bg: '#22c55e', label: 'Aprovada' },


        // ── Status de produção / outros ─────────────────────────────
        'ARTE':                { icon: '🎨', bg: '#3b82f6', label: 'Arte' },
        'PRODUÇÃO':            { icon: '🏭', bg: '#f59e0b', label: 'Produção' },
        'FINALIZADA':          { icon: '✅', bg: '#22c55e', label: 'Finalizada' },
        'CANCELADA':           { icon: '❌', bg: '#ef4444', label: 'Cancelada' },
        'EM IMPRESSÃO':        { icon: '🖨️', bg: '#a855f7', label: 'Em Impressão' },
        'Pendente Informação': { icon: '⚠️', bg: '#ef4444', label: 'Pendente Info' },

        // ── Mapeamento e Legados ────────────────────────────────────
        'Em Fila':             { icon: '🎨', bg: '#3b82f6', label: 'Em Arte' },
        'NOVO':                { icon: '🎨', bg: '#3b82f6', label: 'Em Arte' },
        'EM FILA':             { icon: '🎨', bg: '#3b82f6', label: 'Em Arte' },
        'ARTE_EM_ANDAMENTO':   { icon: '🎨', bg: '#3b82f6', label: 'Em Arte' },
        'ARTE_EM_CORRECAO':    { icon: '⚠️', bg: '#f97316', label: 'Em Alteração' },
        'REPROVADO':           { icon: '⚠️', bg: '#f97316', label: 'Em Alteração' },
        'REPROVADA':           { icon: '⚠️', bg: '#f97316', label: 'Em Alteração' },
        'REPROVADA_CLIENTE':   { icon: '⚠️', bg: '#f97316', label: 'Em Alteração' },
        'APROVADO':            { icon: '✅', bg: '#22c55e', label: 'Aprovada' },
        'APROVADA_CLIENTE':    { icon: '✅', bg: '#22c55e', label: 'Aprovada' },
        'LIBERADA':            { icon: '✅', bg: '#22c55e', label: 'Aprovada' },
        'Arte APROVADA':       { icon: '✅', bg: '#22c55e', label: 'Aprovada' },
        'ARTE_APROVADA':       { icon: '✅', bg: '#22c55e', label: 'Aprovada' },
        'Enviar ARTE':         { icon: '📤', bg: '#f59e0b', label: 'Enviar Arte' },
        'AGUARDANDO_APROVACAO':{ icon: '⏳', bg: '#f97316', label: 'Aguard. Aprovação' },
    };
    const s = map[status] || { icon: '❓', bg: '#6b7280', label: status || '—' };
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;padding:3px 10px;border-radius:12px;background:${s.bg}22;color:${s.bg};font-weight:600;border:1px solid ${s.bg}44;">${s.icon} ${s.label}</span>`;
}


/**
 * Normaliza o status de impressão para as novas opções: Aguardando, Impresso, Parcial, Revisão
 */
function normalizarStatusImpressao(status) {
    if (!status) return 'Aguardando';
    const s = status.toString().trim().toUpperCase();
    if (s === 'AGUARD.' || s === 'AGUARDANDO') return 'Aguardando';
    if (s === 'PARCIAL') return 'Parcial';
    if (s === 'IMPRESSO') return 'Impresso';
    if (s === 'ERRO' || s === 'REVISAO' || s === 'REVISÃO') return 'Revisão';
    
    const lower = status.toString().trim().toLowerCase();
    if (lower === 'impresso') return 'Impresso';
    if (lower === 'parcial') return 'Parcial';
    if (lower === 'aguardando') return 'Aguardando';
    if (lower === 'revisao' || lower === 'revisão') return 'Revisão';
    
    return status;
}

/**
 * Calcula o status de impressão do pedido a partir de seus modelos
 */
function calcularStatusImpressaoPedido(modelos) {
    if (!modelos || modelos.length === 0) return 'Aguardando';

    // 1. Se qualquer modelo for 'Revisão', o status do pedido é 'Revisão'
    const temRevisao = modelos.some(m => {
        const st = normalizarStatusImpressao(m.impressao || m.status_impressao);
        return st === 'Revisão';
    });
    if (temRevisao) return 'Revisão';

    // Contar modelos impressos
    const impressosCount = modelos.filter(m => {
        const st = normalizarStatusImpressao(m.impressao || m.status_impressao);
        return st === 'Impresso';
    }).length;

    // 2. Se todos os modelos estão impressos
    if (impressosCount === modelos.length) {
        return 'Impresso';
    }

    // 3. Se ao menos um está impresso (e nem todos, pois a condição acima falhou)
    if (impressosCount > 0) {
        return 'Parcial';
    }

    // 4. Se nenhum está impresso
    return 'Aguardando';
}

/**
 * Retorna badge HTML para o status da impressão do pedido
 */
function getStatusImpressaoBadge(status) {
    const map = {
        'Aguardando': { icon: '⏳', cls: 'badge-blue', label: 'Aguardando' },
        'Impresso': { icon: '✅', cls: 'badge-green', label: 'Impresso' },
        'Parcial': { icon: '🔄', cls: 'badge-amber', label: 'Parcial' },
        'Revisão': { icon: '⚠️', cls: 'badge-red', label: 'Revisão' }
    };
    const s = map[status] || { icon: '❓', cls: '', label: status };
    return `<span class="badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

/**
 * Retorna badge HTML para aprovação
 */
function getAprovacaoBadge(aprov) {
    const map = {
        'EM ARTE': { cls: 'badge-amber', icon: '🎨', text: 'EM ARTE' },
        'APROVADA': { cls: 'badge-teal', icon: '✅', text: 'APROVADA' },
        'PRONTA': { cls: 'badge-blue', icon: '📋', text: 'PRONTA' },
        'REPROVADA': { cls: 'badge-red', icon: '❌', text: 'REPROVADA' },
        
        // Novos status da tabela pedidos_artes
        'EM_REVISAO_INTERNA': { cls: 'badge-amber', icon: '🎨', text: 'Rev. Interna' },
        'AGUARDANDO_APROVACAO': { cls: 'badge-yellow', icon: '⏳', text: 'Aguard. Cliente' },
        'APROVADA_CLIENTE': { cls: 'badge-teal', icon: '✅', text: 'Aprov. Cliente' },
        'REPROVADA_CLIENTE': { cls: 'badge-red', icon: '❌', text: 'Reprov. Cliente' },
        'LIBERADA': { cls: 'badge-teal', icon: '📋', text: 'Liberada' }
    };
    const key = aprov ? aprov.toUpperCase() : '';
    const s = map[key] || map[aprov] || { cls: '', icon: '', text: aprov || '--' };
    return `<span class="badge ${s.cls}">${s.icon} ${s.text}</span>`;
}

/**
 * Retorna badge HTML para impressão
 */
function getImpressaoBadge(imp) {
    const map = {
        'AGUARD.': { cls: 'badge-amber', icon: '⏳' },
        'PARCIAL': { cls: 'badge-blue', icon: '🔄' },
        'IMPRESSO': { cls: 'badge-teal', icon: '✅' },
        'ERRO': { cls: 'badge-red', icon: '❌' }
    };
    const s = map[imp] || { cls: '', icon: '' };
    return `<span class="badge ${s.cls}">${s.icon} ${imp || '--'}</span>`;
}

/**
 * Renderiza a tabela de OS na view
 */
/**
/**
 * Lista de designers cadastrados (fonte local até integração com E-deal)
 */
const DESIGNERS_LISTA = [
    'Amanda Souza',
    'Junior',
];

/**
 * Carrega a lista de usuários da tabela usuarios do Supabase e separa por setor (Designer vs Atendente)
 */
async function loadUsuarios() {
    try {
        if (!supabaseClient) {
            console.log("SupabaseClient não inicializado. Usando fallbacks locais para usuários.");
            return;
        }
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('user_id, nome_usuario, email, setor');

        if (error) {
            console.error("Erro ao carregar usuários da tabela usuarios:", error);
            // Fallback para producao_usuarios caso usuarios falhe
            const { data: fallbackData } = await supabaseClient
                .from('producao_usuarios')
                .select('nome')
                .eq('ativo', true);
            if (fallbackData && fallbackData.length > 0) {
                usuariosSupabase = fallbackData.map(u => u.nome).filter(Boolean);
            }
            return;
        }

        if (data && data.length > 0) {
            designersSupabase = [];
            atendentesSupabase = [];
            usuariosSupabase = [];
            designersObjetosSupabase = [];

            data.forEach(u => {
                const nome = (u.nome_usuario || '').trim();
                if (!nome) return;
                usuariosSupabase.push(nome);

                const setor = (u.setor || '').toLowerCase();
                if (setor.includes('designer')) {
                    designersSupabase.push(nome);
                    designersObjetosSupabase.push({
                        user_id: u.user_id || u.nome_usuario,
                        nome_usuario: nome,
                        email: u.email || ''
                    });
                } else if (setor.includes('atend') || setor === 'atendente' || setor === 'atendimento') {
                    atendentesSupabase.push(nome);
                }
            });

            console.log("Designers carregados da tabela usuarios:", designersSupabase);
            console.log("Atendentes carregados da tabela usuarios:", atendentesSupabase);
            
            populateDesignerFilter();
            populateAtendenteFilter();
        }
    } catch (err) {
        console.error("Exceção ao carregar usuários:", err);
    }
}

/**
 * Obtém o designer atribuído a uma OS (salvo em localStorage)
 */
/**
 * Obtém o designer atribuído a uma OS (salvo em localStorage)
 */
function getOSDesigner(osId, osNumero) {
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    if (osId && overrides[osId]) return overrides[osId];
    if (osNumero && overrides[osNumero]) return overrides[osNumero];

    const os = state.ordens ? state.ordens.find(o => o.id === osId || String(o.id_int) === String(osId) || String(o.numero) === String(osId) || String(o.numero) === String(osNumero)) : null;
    const numToUse = osNumero || (os ? os.numero : null) || osId;
    const osNumeroInt = parseInt(numToUse);

    if (osNumeroInt && overrides[osNumeroInt]) return overrides[osNumeroInt];
    if (os && os.id && overrides[os.id]) return overrides[os.id];
    if (os && os.numero && overrides[os.numero]) return overrides[os.numero];

    if (osNumeroInt) {
        // 1. Checar em state.pedidosArtesData
        if (state.pedidosArtesData && state.pedidosArtesData[osNumeroInt] && state.pedidosArtesData[osNumeroInt].designer_nome) {
            return state.pedidosArtesData[osNumeroInt].designer_nome;
        }

        // 2. Checar em state.todasArtes
        if (state.todasArtes) {
            const artes = state.todasArtes.filter(a => a.id_int === osNumeroInt);
            const arteComDesigner = artes.find(a => a.designer_nome);
            if (arteComDesigner && arteComDesigner.designer_nome) {
                return arteComDesigner.designer_nome;
            }
        }
    }

    // 3. Checar se a própria OS possui a propriedade designer ou designer_nome
    if (os) {
        if (os.designer_nome) return os.designer_nome;
        if (os.designer) return os.designer;
    }

    return '';
}

/**
 * Define o designer responsável por uma OS (salva em localStorage)
 */
function setOSDesigner(osId, designerName, osNumero) {
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    if (designerName) {
        if (osId) overrides[osId] = designerName;
        if (osNumero) overrides[osNumero] = designerName;
        const osInt = parseInt(osNumero || osId);
        if (osInt) overrides[osInt] = designerName;

        const os = state.ordens ? state.ordens.find(o => o.id === osId || String(o.id_int) === String(osId) || String(o.numero) === String(osId) || String(o.numero) === String(osNumero)) : null;
        if (os) {
            if (os.id) overrides[os.id] = designerName;
            if (os.numero) overrides[os.numero] = designerName;
            if (os.id_int) overrides[os.id_int] = designerName;
            os.designer_nome = designerName;
            os.designer = designerName;
        }
    } else {
        delete overrides[osId];
        if (osNumero) delete overrides[osNumero];
    }
    localStorage.setItem('vibe_designer_overrides', JSON.stringify(overrides));
    renderOrdens();
}

// Expor globalmente
window.setOSDesigner = setOSDesigner;

let _hasUserChangedDesignerFilter = false;

function onDesignerFilterChange() {
    _hasUserChangedDesignerFilter = true;
    renderOrdens();
}
window.onDesignerFilterChange = onDesignerFilterChange;

function getLoggedInDesignerName() {
    let userEmail = null;
    let userId = null;

    if (window._currentUser) {
        userEmail = window._currentUser.email;
        userId = window._currentUser.id;
    }

    if (!userEmail && typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('auth-token')) {
                    const val = JSON.parse(localStorage.getItem(key) || '{}');
                    if (val && val.user && val.user.email) {
                        userEmail = val.user.email;
                        userId = val.user.id;
                        break;
                    }
                }
            }
        } catch (e) {}
    }

    if (!userEmail) {
        userEmail = localStorage.getItem('vibe_user_email') || 
                    localStorage.getItem('user_email') || 
                    localStorage.getItem('loggedInUserEmail');
    }

    if (designersObjetosSupabase && designersObjetosSupabase.length > 0) {
        if (userEmail) {
            const match = designersObjetosSupabase.find(d => 
                (d.email && d.email.toLowerCase().trim() === userEmail.toLowerCase().trim()) ||
                (d.user_id && String(d.user_id) === String(userId))
            );
            if (match) return match.nome_usuario;
        }

        if (window._currentUser && window._currentUser.user_metadata) {
            const metaName = window._currentUser.user_metadata.name || window._currentUser.user_metadata.nome_usuario || window._currentUser.user_metadata.full_name;
            if (metaName) {
                const match = designersObjetosSupabase.find(d => d.nome_usuario.toLowerCase().trim() === metaName.toLowerCase().trim());
                if (match) return match.nome_usuario;
            }
        }
    }

    return null;
}
window.getLoggedInDesignerName = getLoggedInDesignerName;

function populateDesignerFilter(forceDefault = false) {
    const filterSelect = document.getElementById('os-filter-designer');
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    
    // Mostrar APENAS os designers encontrados na tabela usuarios cuja coluna setor contenha "designer"
    const allDesigners = new Set(designersSupabase || []);

    filterSelect.innerHTML = '<option value="">🎨 Todos os Designers</option>';
    [...allDesigners].sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        filterSelect.appendChild(opt);
    });

    const loggedInDesigner = getLoggedInDesignerName();

    // Com forceDefault=true (chamada explícita de reset), auto-selecionar o designer logado.
    // Sem forceDefault: SEMPRE preservar o valor atual do select — incluindo '' (Todos os Designers) —
    // para garantir que o filtro seja consistente entre F5 e cliques de card sem sumiço silencioso.
    if (forceDefault && loggedInDesigner && designersSupabase && designersSupabase.includes(loggedInDesigner)) {
        filterSelect.value = loggedInDesigner;
    } else if (currentValue && [...allDesigners].includes(currentValue)) {
        filterSelect.value = currentValue; // Restaurar a seleção anterior
    } else {
        filterSelect.value = ''; // Padrão: Todos os Designers
    }
}

function populateAtendenteFilter() {
    const filterSelect = document.getElementById('os-filter-atendente');
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    
    // Lista exclusiva de atendentes da tabela usuarios (ou vendedores como fallback)
    const baseList = (atendentesSupabase && atendentesSupabase.length > 0)
        ? atendentesSupabase
        : (state.ordens ? [...new Set(state.ordens.map(o => o.vendedor).filter(Boolean))] : []);
    const allAtendentes = new Set(baseList);

    filterSelect.innerHTML = '<option value="">🎧 Todos os Atendentes</option>';
    [...allAtendentes].sort().forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        filterSelect.appendChild(opt);
    });

    filterSelect.value = currentValue;
}
window.populateAtendenteFilter = populateAtendenteFilter;

/**
 * Gera o HTML dos cards de designers no box "Designers Ideal"
 */
function renderDesignersBoxHTML(osId, osNum) {
    let list = [];
    if (designersObjetosSupabase && designersObjetosSupabase.length > 0) {
        list = designersObjetosSupabase.map(d => ({
            uid: d.user_id || d.nome_usuario,
            nome: d.nome_usuario,
            email: d.email || '',
            init: (d.nome_usuario || 'D').charAt(0).toUpperCase()
        }));
    } else if (designersSupabase && designersSupabase.length > 0) {
        list = designersSupabase.map(nome => ({
            uid: nome,
            nome: nome,
            email: '',
            init: nome.charAt(0).toUpperCase()
        }));
    } else {
        const fallbacks = (usuariosSupabase && usuariosSupabase.length > 0) ? usuariosSupabase : DESIGNERS_LISTA;
        list = fallbacks.map(nome => ({
            uid: nome,
            nome: nome,
            email: '',
            init: nome.charAt(0).toUpperCase()
        }));
    }

    const currentAssignedDesigner = getOSDesigner(osId, osNum);
    const allOrdens = state.ordens || [];

    return list.map(d => {
        const pedidosSet = new Set();
        let modelosCount = 0;

        allOrdens.forEach(o => {
            const desOS = getOSDesigner(o.id, o.numero);
            if (desOS && desOS.toLowerCase() === d.nome.toLowerCase()) {
                pedidosSet.add(o.numero || o.id);
                const itensOS = state.osItens[o.id] || [];
                modelosCount += (itensOS.length > 0 ? itensOS.length : (o._itens_count || 1));
            }
        });

        const pedidosCount = pedidosSet.size;
        const isSelected = currentAssignedDesigner && currentAssignedDesigner.toLowerCase() === d.nome.toLowerCase();

        const borderStyle = isSelected 
            ? '2px solid #3b82f6' 
            : '1px solid var(--border)';
        const bgStyle = isSelected 
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(37, 99, 235, 0.26))' 
            : 'rgba(0,0,0,0.02)';
        const boxShadowStyle = isSelected 
            ? '0 4px 14px rgba(59, 130, 246, 0.35)' 
            : 'none';

        const safeNome = d.nome.replace(/'/g, "\\'");

        return `
            <div class="designer-card ${isSelected ? 'selected' : ''}" 
                 data-uid="${d.uid}" 
                 data-nome="${d.nome}"
                 onclick="confirmAndSelectDesigner('${osId}', '${osNum}', '${d.uid}', '${safeNome}')" 
                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: ${borderStyle}; border-radius: 10px; cursor: pointer; transition: all 0.25s ease; background: ${bgStyle}; box-shadow: ${boxShadowStyle};">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: ${isSelected ? '#3b82f6' : '#a7f3d0'}; color: ${isSelected ? '#ffffff' : '#065f46'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; transition: all 0.2s;">
                        ${d.init}
                    </div>
                    <div>
                        <div style="font-weight: 700; color: var(--text); font-size: 0.92rem;">
                            ${d.nome}
                        </div>
                        ${d.email ? `<div style="font-size: 0.82rem; color: var(--text-dim); margin-top: 2px;">${d.email}</div>` : ''}
                    </div>
                </div>
                <div style="text-align: right; font-size: 0.78rem; color: var(--text-dim); line-height: 1.4;">
                    Pedidos: <strong style="color: ${isSelected ? '#3b82f6' : 'var(--text)'}; font-size: 0.88rem;">${pedidosCount}</strong><br>
                    Modelos: <strong style="color: ${isSelected ? '#3b82f6' : 'var(--text)'}; font-size: 0.88rem;">${modelosCount}</strong>
                </div>
            </div>
        `;
    }).join('');
}

async function confirmAndSelectDesigner(osId, osNum, uid, nome) {
    const currentAssigned = getOSDesigner(osId, osNum);
    
    if (currentAssigned && currentAssigned.toLowerCase() === nome.toLowerCase()) {
        return;
    }

    const confirmText = currentAssigned 
        ? `Tem certeza que deseja atribuir este pedido a outro Designer (${nome})?`
        : `Tem certeza que deseja atribuir este pedido ao Designer (${nome})?`;

    if (!confirm(confirmText)) {
        return;
    }

    const osIntId = parseInt(osNum || osId);

    // 1. Salva override local
    setOSDesigner(osId, nome, osNum);

    if (!state.pedidosArtesData) state.pedidosArtesData = {};
    if (!state.pedidosArtesData[osIntId]) state.pedidosArtesData[osIntId] = {};
    state.pedidosArtesData[osIntId].designer_uid = uid;
    state.pedidosArtesData[osIntId].designer_nome = nome;

    if (state.todasArtes) {
        const arteObj = state.todasArtes.find(a => a.id_int === osIntId);
        if (arteObj) {
            arteObj.designer_nome = nome;
            arteObj.designer_uid = uid;
        }
    }

    // 2. Atualizar todos os containers DOM imediatamente para alteração instantânea de UI
    const containerIds = [
        `designers-box-container-${osId}`,
        `designers-box-container-${osNum}`,
        `designers-box-container-${osIntId}`
    ];
    containerIds.forEach(id => {
        const c = document.getElementById(id);
        if (c) c.innerHTML = renderDesignersBoxHTML(osId, osNum);
    });

    // 3. Persiste no Supabase
    await selectDesigner(osIntId, uid, nome);

    // 4. Re-garante atualização do container
    containerIds.forEach(id => {
        const c = document.getElementById(id);
        if (c) c.innerHTML = renderDesignersBoxHTML(osId, osNum);
    });

    // 5. Atualizar as tabelas principais para refletir o designer imediatamente
    renderOrdens();
}

window.renderDesignersBoxHTML = renderDesignersBoxHTML;
window.confirmAndSelectDesigner = confirmAndSelectDesigner;

/**
 * Gera o HTML do select inline de designer para uma OS na tabela
 */
function renderDesignerSelect(osId, osNumero) {
    const currentDesigner = getOSDesigner(osId, osNumero);
    const baseList = (usuariosSupabase && usuariosSupabase.length > 0) ? usuariosSupabase : DESIGNERS_LISTA;
    const allDesigners = new Set(baseList);
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    Object.values(overrides).forEach(d => { if (d) allDesigners.add(d); });

    let options = '<option value="">-- Atribuir --</option>';
    [...allDesigners].sort().forEach(d => {
        const selected = d === currentDesigner ? 'selected' : '';
        const escaped = d.replace(/'/g, "\\'");
        options += `<option value="${escaped}" ${selected}>${d}</option>`;
    });

    return `<select class="form-control" style="font-size: 0.78rem; padding: 4px 6px; min-width: 140px; background: rgba(30,41,59,0.5);" 
                onclick="event.stopPropagation()" 
                onchange="event.stopPropagation(); setOSDesigner('${osId}', this.value)">${options}</select>`;
}

/**
 * Obtém o vendedor atribuído a uma OS (salvo em localStorage ou nativo da OS)
 */
function getOSVendedor(osId) {
    const overrides = JSON.parse(localStorage.getItem('vibe_vendedor_overrides') || '{}');
    if (overrides[osId]) {
        return overrides[osId];
    }
    const os = state.ordens.find(o => o.id === osId);
    return os ? (os.vendedor || '') : '';
}

/**
 * Define o vendedor responsável por uma OS (salva em localStorage)
 */
function setOSVendedor(osId, vendedorName) {
    const overrides = JSON.parse(localStorage.getItem('vibe_vendedor_overrides') || '{}');
    if (vendedorName) {
        overrides[osId] = vendedorName;
    } else {
        delete overrides[osId];
    }
    localStorage.setItem('vibe_vendedor_overrides', JSON.stringify(overrides));
    renderOrdens();
}

// Expor globalmente
window.setOSVendedor = setOSVendedor;

/**
 * Gera o HTML do select inline de vendedor para uma OS na tabela
 */
function renderVendedorSelect(osId) {
    const currentVendedor = getOSVendedor(osId);
    const baseList = (usuariosSupabase && usuariosSupabase.length > 0) ? usuariosSupabase : VENDEDORES_LISTA;
    const allVendedores = new Set(baseList);
    
    if (currentVendedor) {
        allVendedores.add(currentVendedor);
    }
    
    // Garantir que o vendedor nativo esteja na lista
    const os = state.ordens.find(o => o.id === osId);
    if (os && os.vendedor) {
        allVendedores.add(os.vendedor);
    }

    const overrides = JSON.parse(localStorage.getItem('vibe_vendedor_overrides') || '{}');
    Object.values(overrides).forEach(v => { if (v) allVendedores.add(v); });

    let options = '<option value="">-- Atribuir --</option>';
    [...allVendedores].sort().forEach(v => {
        const selected = v === currentVendedor ? 'selected' : '';
        const escaped = v.replace(/'/g, "\\'");
        options += `<option value="${escaped}" ${selected}>${v}</option>`;
    });

    return `<select class="form-control" style="font-size: 0.78rem; padding: 4px 6px; min-width: 140px; background: rgba(30,41,59,0.5);" 
                onclick="event.stopPropagation()" 
                onchange="event.stopPropagation(); setOSVendedor('${osId}', this.value)">${options}</select>`;
}

/**
 * Altera o filtro do card KPI da Fila de Arte ('todos', 'fila', 'aprovacao', 'aprovados')
 */
function setFiltroFilaArte(tipo) {
    console.log('[Lista Arte] Filtrar por card:', tipo);
    state.filtroFilaTipo = tipo;
    state.filtroStatusArte = '';
    renderOrdens();
}
window.setFiltroFilaArte = setFiltroFilaArte;

/**
 * Renderiza as tabelas de OS (Fila de Impressão e Fila de Arte) na view
 */
function renderOrdens() {
    const tbodyImpressao = document.getElementById('tbody-impressao');
    const tbodyArte = document.getElementById('tbody-arte');
    if (!tbodyImpressao && !tbodyArte) return;

    // Filtros de busca — guard contra autocomplete do browser (Chrome ignora autocomplete=off)
    const _searchArteEl = document.getElementById('os-search-arte');
    const _searchImpEl = document.getElementById('os-search-impressao');
    if (_searchArteEl && _searchArteEl.value.includes('@')) _searchArteEl.value = '';
    if (_searchImpEl && _searchImpEl.value.includes('@')) _searchImpEl.value = '';
    const searchImpressao = (_searchImpEl?.value || '').trim().toLowerCase();
    const searchArte = (_searchArteEl?.value || '').trim().toLowerCase();

    // IMPORTANTE: popular filtros ANTES de ler os valores do DOM para garantir
    // consistência entre a 1ª renderização (F5) e as subsequentes (clique de card).
    // Sem isso, filterDesigner seria '' no F5 (select vazio) e 'Designer X' nos renders
    // seguintes (após populateDesignerFilter ter setado o select), causando sumiço dos pedidos.
    populateDesignerFilter();
    populateAtendenteFilter();

    const filterDesigner = (document.getElementById('os-filter-designer')?.value || '');

    // Fila 1: Impressão (status_interno === 'EM PRODUCAO' ou 'EM IMPRESSAO')
    let ordensImpressao = state.ordens.filter(os => {
        const st = (os.status_interno || '').toUpperCase();
        return st === 'EM PRODUCAO' || st === 'EM PRODUÇÃO' || st === 'EM IMPRESSAO' || st === 'EM IMPRESSÃO';
    });

    // --- Calcular Estatísticas Dinâmicas ---
    let totalItensImpressao = 0;
    let totalItensAprovados = 0;
    let totalPedidosConcluidos = 0;

    ordensImpressao.forEach(os => {
        const itens = state.osItens[os.id] || [];
        
        itens.forEach(item => {
            const impStatus = item.impressao || 'AGUARD.';
            if (impStatus === 'IMPRESSO' || impStatus === 'PARCIAL') {
                totalItensImpressao++;
            }
            
            const ap = (item.aprovacao || '').toUpperCase();
            if (ap === 'APROVADA' || ap === 'PRONTA' || ap === 'LIBERADA' || ap === 'APROVADA_CLIENTE') {
                totalItensAprovados++;
            }
        });

        if (itens.length > 0 && itens.every(item => item.impressao === 'IMPRESSO')) {
            totalPedidosConcluidos++;
        }
    });

    const statPedidosFilaEl = document.getElementById('stat-pedidos-fila');
    if (statPedidosFilaEl) statPedidosFilaEl.textContent = ordensImpressao.length;

    const statItensImpressaoEl = document.getElementById('stat-itens-impressao');
    if (statItensImpressaoEl) statItensImpressaoEl.textContent = totalItensImpressao;

    const statItensAprovadosEl = document.getElementById('stat-itens-aprovados');
    if (statItensAprovadosEl) statItensAprovadosEl.textContent = totalItensAprovados;

    const statPedidosConcluidosEl = document.getElementById('stat-pedidos-concluidos');
    if (statPedidosConcluidosEl) statPedidosConcluidosEl.textContent = totalPedidosConcluidos;

    // --- Aplicar Filtros (Busca, Setor e Status) ---
    let filteredImpressao = ordensImpressao.filter(os => {
        const itens = state.osItens[os.id] || [];

        // 1. Busca textual
        if (searchImpressao) {
            const num = String(os.numero || '');
            const cli = (os.cliente || '').toLowerCase();
            const vend = getOSVendedor(os.id).toLowerCase();
            const des = getOSDesigner(os.id).toLowerCase();
            
            const osNumeroInt = parseInt(os.numero);
            const artesDaOS = (state.todasArtes || []).filter(a => a.id_int === osNumeroInt);
            const arteComEvento = artesDaOS.find(a => a.nome_evento);
            const evento = arteComEvento && arteComEvento.nome_evento ? arteComEvento.nome_evento.toLowerCase() : '';

            const matchSearch = num.includes(searchImpressao) || cli.includes(searchImpressao) || evento.includes(searchImpressao) || vend.includes(searchImpressao) || des.includes(searchImpressao);
            if (!matchSearch) return false;
        }

        // 2. Filtro de Setor
        if (state.filtroSetor) {
            const matchSetor = itens.some(item => {
                const itemS = item.setor || '';
                const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                return norm(itemS) === norm(state.filtroSetor);
            });
            if (!matchSetor) return false;
        }

        // 3. Filtro de Estágio de Impressão
        if (state.filtroStatus) {
            const matchStatus = itens.some(item => (item.impressao || 'AGUARD.').toUpperCase() === state.filtroStatus.toUpperCase());
            if (!matchStatus) return false;
        }

        return true;
    });

    // Fila 2: Arte vs Fila de Aprovação vs Fila de Aprovados
    let ordensFilaArte = [];
    let ordensAprovacao = [];
    let ordensAprovados = [];

    const validReprovadoList = ['REPROVADO', 'REPROVADA', 'REPROVADA_CLIENTE', 'EM ALTERAÇÃO', 'EM ALTERACAO', 'ARTE_EM_CORRECAO'];
    const validApprovedList = ['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'];
    const validAprovacaoList = ['ENVIAR ARTE', 'ARTE PRONTA', 'ENVIAR ARTE', 'AGUARD. APROVAÇÃO', 'AGUARD. APROVACAO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO', 'AGUARD. APROVAÇAO'];


    state.ordens.forEach(os => {
        const osNumeroInt = parseInt(os.numero);
        const artesDaOS = (state.todasArtes || []).filter(a => a.id_int === osNumeroInt);
        const modelosGlobaisOS = (state.modelosGlobais && state.modelosGlobais[osNumeroInt]) ? state.modelosGlobais[osNumeroInt] : (state.osItens[os.id] || []);
        
        // Status da OS / Registro Global de Artes
        const osStatus = (os.status || '').trim().toUpperCase();
        const arteGlobal = artesDaOS[0] || {};
        const globalStatus = (arteGlobal.status || '').trim().toUpperCase();

        // Checar se a OS, a tabela global de artes ou QUALQUER modelo/item tem alteração/reprovação
        let temItemReprovado = modelosGlobaisOS.some(m => {
            const sAm = (m.amostra_status || '').trim().toUpperCase();
            const sArt = (m.status_arte || '').trim().toUpperCase();
            return validReprovadoList.includes(sAm) || validReprovadoList.includes(sArt);
        });

        let todosModelosAprovados = modelosGlobaisOS.length > 0 && modelosGlobaisOS.every(m => {
            const sAm = (m.amostra_status || '').trim().toUpperCase();
            const sArt = (m.status_arte || '').trim().toUpperCase();
            return validApprovedList.includes(sAm) || validApprovedList.includes(sArt);
        });

        const isApprovedCalculado = validApprovedList.includes(osStatus) || validApprovedList.includes(globalStatus) || todosModelosAprovados;
        const isEmAlteracaoCalculado = (validReprovadoList.includes(osStatus) || validReprovadoList.includes(globalStatus) || temItemReprovado) && !todosModelosAprovados;
        const isEnviarArteCalculado = osStatus === 'ENVIAR ARTE' || osStatus === 'ARTE PRONTA' || globalStatus === 'ENVIAR ARTE' || globalStatus === 'ARTE PRONTA';
        const temLinkGerado = !!(state.linksCliente && state.linksCliente[os.id]);

        if (isApprovedCalculado) {
            os.status_calculado = 'Aprovada';
        } else if (isEmAlteracaoCalculado) {
            os.status_calculado = 'Em Alteração';
        } else if (isEnviarArteCalculado) {
            os.status_calculado = 'Enviar Arte';
        } else if (osStatus === 'AGUARD. APROVAÇÃO' || osStatus === 'AGUARDANDO_APROVACAO' || globalStatus === 'AGUARD. APROVAÇÃO' || globalStatus === 'AGUARDANDO_APROVACAO' || temLinkGerado || validAprovacaoList.includes(osStatus) || validAprovacaoList.includes(globalStatus)) {
            os.status_calculado = 'Aguard. Aprovação';
        } else {
            os.status_calculado = os.status || 'Em Arte';
        }





        // Status dos Dados de Entrega / Faturamento
        const entregaStatus = (arteGlobal.entrega_dados || '').trim().toUpperCase();
        const isEntregaAprovada = (entregaStatus === 'APROVADO');
        const isArteAprovada = (os.status_calculado === 'Aprovada');

        const isTotalmenteAprovado = isArteAprovada && isEntregaAprovada;
        const isEmAprovacaoFila = (os.status_calculado === 'Enviar Arte' || os.status_calculado === 'Aguard. Aprovação' || os.status_calculado === 'Arte Pronta' || os.status_calculado === 'Aprovada');

        if (isTotalmenteAprovado) {
            ordensAprovados.push(os);
        } else if (isEmAprovacaoFila) {
            ordensAprovacao.push(os);
        } else {
            ordensFilaArte.push(os);
        }

    });

    // --- Calcular Estatísticas dos Cards KPI ---
    const ordensTodos = [...ordensFilaArte, ...ordensAprovacao];

    const statPedidosTodosArteEl = document.getElementById('stat-pedidos-todos-arte');
    if (statPedidosTodosArteEl) statPedidosTodosArteEl.textContent = ordensTodos.length;

    const statPedidosFilaArteEl = document.getElementById('stat-pedidos-fila-arte');
    if (statPedidosFilaArteEl) statPedidosFilaArteEl.textContent = ordensFilaArte.length;

    const statPedidosAprovacaoArteEl = document.getElementById('stat-pedidos-aprovacao-arte');
    if (statPedidosAprovacaoArteEl) statPedidosAprovacaoArteEl.textContent = ordensAprovacao.length;

    const statItensAprovadosArteEl = document.getElementById('stat-itens-aprovados-arte');
    if (statItensAprovadosArteEl) statItensAprovadosArteEl.textContent = ordensAprovados.length;

    const statPedidosConcluidosArteEl = document.getElementById('stat-pedidos-concluidos-arte');
    if (statPedidosConcluidosArteEl) statPedidosConcluidosArteEl.textContent = ordensAprovados.length;

    // Seleção da fila ativa ('fila', 'todos', 'aprovacao' ou 'aprovados')
    const activeFilaTipo = state.filtroFilaTipo || 'fila';
    let baseOrdensArte = ordensFilaArte;


    if (state.filtroStatusArte === 'Aprovada') {
        baseOrdensArte = ordensAprovados;
    } else if (state.filtroStatusArte) {
        baseOrdensArte = state.ordens;
    } else if (activeFilaTipo === 'aprovados') {
        baseOrdensArte = ordensAprovados;
    } else if (activeFilaTipo === 'aprovacao') {
        baseOrdensArte = ordensAprovacao;
    } else if (activeFilaTipo === 'todos') {
        baseOrdensArte = ordensTodos;
    } else if (activeFilaTipo === 'fila') {
        baseOrdensArte = ordensFilaArte;
    }



    // Atualizar título da tabela e destaque nos cards
    const tituloTabelaArteEl = document.getElementById('titulo-tabela-arte');
    if (tituloTabelaArteEl) {
        if (activeFilaTipo === 'aprovados') {
            tituloTabelaArteEl.innerHTML = `<span class="icon">✅</span> Fila de Aprovados`;
        } else if (activeFilaTipo === 'aprovacao') {
            tituloTabelaArteEl.innerHTML = `<span class="icon">⏳</span> Fila de Aprovação`;
        } else if (activeFilaTipo === 'fila') {
            tituloTabelaArteEl.innerHTML = `<span class="icon">🎨</span> Em Arte`;
        } else {
            tituloTabelaArteEl.innerHTML = `<span class="icon">🌐</span> Todos os Pedidos Pendentes`;
        }
    }

    const cardTodosEl = document.getElementById('card-stat-pedidos-todos');
    const cardFilaEl = document.getElementById('card-stat-pedidos-fila');
    const cardAprovacaoEl = document.getElementById('card-stat-pedidos-aprovacao');
    const cardAprovadosEl = document.getElementById('card-stat-pedidos-aprovados');

    [cardTodosEl, cardFilaEl, cardAprovacaoEl, cardAprovadosEl].forEach(c => {
        if (c) {
            c.style.border = '1px solid var(--border)';
            c.style.boxShadow = 'none';
        }
    });

    if (activeFilaTipo === 'aprovados' && cardAprovadosEl) {
        cardAprovadosEl.style.border = '2px solid var(--teal)';
        cardAprovadosEl.style.boxShadow = '0 0 12px rgba(20, 184, 166, 0.3)';
    } else if (activeFilaTipo === 'aprovacao' && cardAprovacaoEl) {
        cardAprovacaoEl.style.border = '2px solid #8b5cf6';
        cardAprovacaoEl.style.boxShadow = '0 0 12px rgba(139, 92, 246, 0.3)';
    } else if (activeFilaTipo === 'fila' && cardFilaEl) {
        cardFilaEl.style.border = '2px solid var(--blue)';
        cardFilaEl.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.3)';
    } else if (cardTodosEl) {
        cardTodosEl.style.border = '2px solid #06b6d4';
        cardTodosEl.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.3)';
    }

    // --- Aplicar Filtros (Busca, Designer, Setor e Status) ---
    let filteredArte = baseOrdensArte.filter(os => {
        const itens = state.osItens[os.id] || [];

        // 1. Busca textual
        if (searchArte) {
            const num = String(os.numero || '');
            const cli = (os.cliente || '').toLowerCase();
            const vend = getOSVendedor(os.id).toLowerCase();
            const des = getOSDesigner(os.id).toLowerCase();
            
            const osNumeroInt = parseInt(os.numero);
            const artesDaOS = (state.todasArtes || []).filter(a => a.id_int === osNumeroInt);
            const arteComEvento = artesDaOS.find(a => a.nome_evento);
            const evento = arteComEvento && arteComEvento.nome_evento ? arteComEvento.nome_evento.toLowerCase() : '';

            const matchSearch = num.includes(searchArte) || cli.includes(searchArte) || evento.includes(searchArte) || vend.includes(searchArte) || des.includes(searchArte);
            if (!matchSearch) return false;
        }

        // 2. Filtro de Designer
        if (filterDesigner) {
            const matchDesigner = getOSDesigner(os.id, os.numero) === filterDesigner;
            if (!matchDesigner) return false;
        }

        // 2b. Filtro de Atendente
        const filterAtendente = (document.getElementById('os-filter-atendente')?.value || '');
        if (filterAtendente) {
            const osVend = getOSVendedor(os.id);
            const matchAtendente = (osVend === filterAtendente) || (os.vendedor === filterAtendente);
            if (!matchAtendente) return false;
        }

        // 3. Filtro de Setor
        if (state.filtroSetorArte) {
            const matchSetor = itens.some(item => {
                const itemS = item.setor || '';
                const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
                return norm(itemS) === norm(state.filtroSetorArte);
            });
            if (!matchSetor) return false;
        }

        // 4. Filtro de Status de Arte (compara pelo status calculado da OS)
        if (state.filtroStatusArte) {
            const osStatusCalculado = (os.status_calculado || os.status || '').trim();
            const filtro = state.filtroStatusArte.trim();
            const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

            const statusNormMap = {
                'EM ARTE': 'Em Arte',
                'EM ALTERACAO': 'Em Alteração',
                'ARTE_EM_CORRECAO': 'Em Alteração',
                'REPROVADO': 'Em Alteração',
                'REPROVADA': 'Em Alteração',
                'REPROVADA_CLIENTE': 'Em Alteração',
                'ENVIAR ARTE': 'Enviar Arte',
                'ARTE PRONTA': 'Enviar Arte',
                'AGUARD. APROVACAO': 'Aguard. Aprovação',
                'AGUARDANDO': 'Aguard. Aprovação',
                'AGUARDANDO_APROVACAO': 'Aguard. Aprovação',
                'APROVADA': 'Aprovada',
                'APROVADO': 'Aprovada'
            };

            const stNormCalculado = statusNormMap[norm(osStatusCalculado)] || osStatusCalculado;
            if (norm(stNormCalculado) !== norm(filtro)) return false;
        }


        return true;
    });

    // Atualizar badges da navegação lateral
    const badgeImpressao = document.getElementById('badge-impressao');
    if (badgeImpressao) badgeImpressao.textContent = ordensImpressao.length;

    const badgeArte = document.getElementById('badge-arte');
    if (badgeArte) badgeArte.textContent = ordensFilaArte.length;

    // Atualizar badges das tabelas
    const countImpressao = document.getElementById('os-impressao-count-badge');
    if (countImpressao) countImpressao.textContent = `${filteredImpressao.length} ${filteredImpressao.length === 1 ? 'Pedido' : 'Pedidos'}`;

    const countArte = document.getElementById('os-arte-count-badge');
    if (countArte) countArte.textContent = `${filteredArte.length} ${filteredArte.length === 1 ? 'Pedido' : 'Pedidos'}`;

    // Filtros já foram populados no início de renderOrdens() para consistência do filterDesigner.


    // Renderizar Fila de Impressão
    if (tbodyImpressao) {
        const emptyImpressao = document.getElementById('empty-impressao');
        const tableImpressao = document.getElementById('table-impressao');

        if (!filteredImpressao.length) {
            tbodyImpressao.innerHTML = '';
            if (emptyImpressao) emptyImpressao.style.display = 'block';
            if (tableImpressao) tableImpressao.style.display = 'none';
        } else {
            if (emptyImpressao) emptyImpressao.style.display = 'none';
            if (tableImpressao) tableImpressao.style.display = '';

            tbodyImpressao.innerHTML = filteredImpressao.map(os => {
                const isExpanded = state.osExpandedId === os.id;
                const osItensList = state.osItens[os.id] || [];
                const numOs = parseInt(os.numero);
                const modelosGlobais = state.modelosGlobais && state.modelosGlobais[numOs] ? state.modelosGlobais[numOs] : [];
                const totalItens = modelosGlobais.length > 0 ? modelosGlobais.length : (osItensList.length || 1);
                
                // Na view de impressão, queremos contar os impressos
                const impressosCount = modelosGlobais.length > 0 
                    ? modelosGlobais.filter(m => normalizarStatusImpressao(m.impressao) === 'Impresso').length 
                    : osItensList.filter(item => normalizarStatusImpressao(item.impressao) === 'Impresso').length;
                    
                const pct = totalItens > 0 ? Math.round((impressosCount / totalItens) * 100) : 0;
                
                // Calcular status de impressão do pedido de acordo com os modelos
                const modelosParaStatus = modelosGlobais.length > 0 ? modelosGlobais : osItensList;
                const statusImpressaoPedido = calcularStatusImpressaoPedido(modelosParaStatus);

                // Barra de progresso do status de impressão
                const progressBarHtml = `
                    <div style="width: 100%; min-width: 110px;">
                        <div style="font-size: 0.72rem; margin-bottom: 3px; color: var(--text-dim); display: flex; justify-content: space-between; font-family: monospace;">
                            <span>${impressosCount}/${totalItens} mod.</span>
                            <strong>${pct}%</strong>
                        </div>
                        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="width: ${pct}%; height: 100%; background: var(--green); border-radius: 3px; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;

                // Preview da arte do modelo de número mais baixo
                const numOsPreview = parseInt(os.numero);
                const modelosGlobaisPreview = (state.modelosGlobais && state.modelosGlobais[numOsPreview]) ? state.modelosGlobais[numOsPreview] : [];
                const todosCandidatos = [...modelosGlobaisPreview, ...osItensList];
                
                const getModeloNumSort = (item) => {
                    if (item && typeof item.ordem === 'number' && !isNaN(item.ordem)) return item.ordem;
                    if (item && typeof item.modelo === 'number' && !isNaN(item.modelo)) return item.modelo;
                    const str = String(item ? (item.modelo || item.modelo_nome || item.modelo_descri || item.nome || item.id || '') : '');
                    const m = str.match(/\d+/);
                    return m ? parseInt(m[0], 10) : 999999;
                };

                const candidatosComImagem = todosCandidatos.filter(m => m && (m.amostra_arte_base64 || m.arte_url || m.pdf_url));
                candidatosComImagem.sort((a, b) => getModeloNumSort(a) - getModeloNumSort(b));

                const modeloPreviewItem = candidatosComImagem[0];
                let previewSrc = modeloPreviewItem ? (modeloPreviewItem.amostra_arte_base64 || modeloPreviewItem.arte_url || modeloPreviewItem.pdf_url || '') : '';
                if (!previewSrc && state.todasArtes) {
                    const arteGlobal = state.todasArtes.find(a => String(a.id_int) === String(numOsPreview));
                    if (arteGlobal && (arteGlobal.url_arquivo || arteGlobal.url || arteGlobal.amostra_arte_base64)) {
                        previewSrc = arteGlobal.url_arquivo || arteGlobal.url || arteGlobal.amostra_arte_base64;
                    }
                }

                let previewHtml = `
                    <div style="width: 126px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); font-size: 1.1rem; margin: 0 auto;" title="Sem arte cadastrada">
                        🖼️
                    </div>
                `;
                if (previewSrc) {
                    const isPdf = previewSrc.startsWith('data:application/pdf') || previewSrc.includes('JVBERi') || previewSrc.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        previewHtml = `
                            <div style="width: 126px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(59,130,246,0.1); border-radius: 6px; border: 1px solid rgba(59,130,246,0.3); color: var(--blue); font-size: 1.2rem; cursor: pointer; margin: 0 auto;" title="Arte em PDF (clique para abrir)" onclick="event.stopPropagation(); window.open('${previewSrc}', '_blank')">
                                📄
                            </div>
                        `;
                    } else {
                        previewHtml = `
                            <img src="${previewSrc}" 
                                 style="width: 126px; height: 42px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); cursor: zoom-in; display: block; margin: 0 auto;" 
                                 onclick="event.stopPropagation(); openClienteLightbox('${previewSrc}')" 
                                 title="Clique para ampliar a arte" />
                        `;
                    }
                }

                // Soma das quantidades de todos os modelos
                const totalQtd = modelosGlobais.length > 0 
                    ? modelosGlobais.reduce((acc, m) => acc + (m.quantidade || 0), 0)
                    : osItensList.reduce((acc, item) => acc + (parseInt(item.quantidade || item.qtd || 0)), 0);

                // Frete (forma de envio) — lido direto do campo frete_escolhido da proposta
                const freteRaw = (os.frete_escolhido || '').trim() || 'Retirada Local';
                // Normalizar: comparação case-insensitive
                const freteNorm = freteRaw.toUpperCase();
                const FRETE_IMGS = {
                    'SEDEX':                     'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293785_Sedex.png',
                    'TRANSPORTADORA S\u00c3O MIGUEL': 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293565_Sao-Miguel.png',
                    'MOTOBOY':                   'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293109_Motoboy.png',
                    'RETIRADA LOCAL':             'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
                    'RETIRAR':                   'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
                    'RETIRADA':                  'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678293377_Retira.png',
                };
                // Busca por correspondência parcial também (ex: "SAO MIGUEL" ↔ "TRANSPORTADORA SÃO MIGUEL")
                let freteImgUrl = FRETE_IMGS[freteNorm];
                if (!freteImgUrl) {
                    const key = Object.keys(FRETE_IMGS).find(k => freteNorm.includes(k) || k.includes(freteNorm));
                    if (key) freteImgUrl = FRETE_IMGS[key];
                }
                const freteHtml = freteImgUrl
                    ? `<img src="${freteImgUrl}" alt="${freteRaw}" title="${freteRaw}" style="height:28px; max-width:80px; object-fit:contain; display:block; margin:0 auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='';">
                       <span style="display:none; font-size:0.78rem; color:var(--text-dim);">${freteRaw}</span>`
                    : `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text); border:1px solid rgba(255,255,255,0.1); font-size:0.75rem;">${freteRaw}</span>`;

                const prazoInfo = formatPrazoDestaque(os.prazo_entrega);
                let nomeEventoHtml = '';
                const osNumeroInt = parseInt(os.numero);
                const artesDaOS = (state.todasArtes || []).filter(a => a.id_int === osNumeroInt);
                const arteComEvento = artesDaOS.find(a => a.nome_evento);
                if (arteComEvento) {
                    nomeEventoHtml = `<br><span style="font-size: 0.82rem; color: #f97316;">${arteComEvento.nome_evento}</span>`;
                }

                return `
                    <tr class="os-row ${isExpanded ? 'os-row-expanded' : ''}" onclick="abrirImposicaoDoPedido('${os.id}', '${os.numero}')" style="cursor: pointer;">
                        <td>
                            <span style="font-size: 1.35rem; font-weight: 900; color: #ffffff; background: linear-gradient(135deg, var(--blue), #2563eb); padding: 4px 12px; border-radius: 6px; display: inline-block; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${os.numero}</span>
                        </td>

                        <td>
                            <strong>${os.cliente || '--'}</strong>
                            ${nomeEventoHtml}
                        </td>
                        <td>${progressBarHtml}</td>
                        <td style="text-align: center; vertical-align: middle;">${previewHtml}</td>
                        <td style="font-size: 0.82rem; ${prazoInfo.style}">${prazoInfo.text}</td>
                        <td><span class="badge">${totalItens} ${totalItens === 1 ? 'modelo' : 'modelos'}</span></td>
                        <td><strong>${totalQtd.toLocaleString('pt-BR')}</strong></td>
                        <td style="text-align:center; vertical-align:middle;">${freteHtml}</td>
                        <td>${getStatusImpressaoBadge(statusImpressaoPedido)}</td>
                    </tr>
                `;

            }).join('');
        }
    }

    // Renderizar Fila de Arte
    if (tbodyArte) {
        const emptyArte = document.getElementById('empty-arte');
        const tableArte = document.getElementById('table-arte');

        if (!filteredArte.length) {
            tbodyArte.innerHTML = '';
            if (emptyArte) emptyArte.style.display = 'block';
            if (tableArte) tableArte.style.display = 'none';
        } else {
            if (emptyArte) emptyArte.style.display = 'none';
            if (tableArte) tableArte.style.display = '';


            // AUTO-SYNC v144: corrigir OS onde todos os modelos estao PRONTO mas status nao e Enviar Arte
            filteredArte.forEach(function(autoOs) {
                var autoItens = state.osItens[autoOs.id] || [];
                if (autoItens.length === 0) return;
                var autoStatus = (autoOs.status || '').trim().toUpperCase();
                // Não sobrescrever se o status já for Enviar Arte, ou se for um status avançado/ação do cliente
                const ignorar = [
                    'ENVIAR ARTE', 'FINALIZADA', 'CANCELADA', 'EM IMPRESSAO', 'PRODUÇÃO',
                    'APROVADO', 'APROVADA_CLIENTE', 'AGUARD. APROVAÇÃO', 'AGUARDANDO_APROVACAO'
                ];


                if (ignorar.includes(autoStatus)) return;
                var autoTodos = autoItens.every(function(i) { return (i.amostra_status || '').toUpperCase() === 'PRONTO'; });
                if (!autoTodos) return;
                autoOs.status = 'Enviar Arte';
                var autoOv = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                autoOv[autoOs.id] = 'Enviar Arte';
                localStorage.setItem('vibe_status_overrides', JSON.stringify(autoOv));
                console.log('[AUTO-SYNC] Pedido #' + autoOs.numero + ': todos PRONTO -> Enviar Arte');
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    if (autoOs.id.startsWith('vibe_')) {
                        supabaseClient.from('pedidos_links_cliente').update({ status_arte: 'Enviar Arte' }).eq('os_id', autoOs.id).then(function(){});
                    } else {
                        supabaseClient.from('producao_ordens_servico').update({ status: 'Enviar Arte' }).eq('id', autoOs.id).then(function(){});
                    }
                }
            });
            tbodyArte.innerHTML = filteredArte.map(os => {
                const itensReais = (state.modelosGlobais && state.modelosGlobais[os.numero]) ? state.modelosGlobais[os.numero] : [];
                // Se ainda não houver modelos criados no bd para essa OS, ele cai para o número de produtos
                const itensCount = itensReais.length > 0 ? itensReais.length : (os._itens_count || 0);
                
                // Entrega / Faturamento
                const arteGlobal = (state.todasArtes || []).find(a => String(a.id_int) === String(os.numero));
                const entregaStatus = (arteGlobal && arteGlobal.entrega_dados) ? arteGlobal.entrega_dados.toUpperCase() : '----';
                let entregaHtml = `<span onclick="event.stopPropagation(); alterarEntregaDadosStatus('${os.numero}', '${entregaStatus}')" style="cursor: pointer; color: var(--text-dim);" title="Clique para alternar status">----</span>`;
                if (entregaStatus === 'APROVADO') {
                    entregaHtml = `<span class="badge badge-teal" onclick="event.stopPropagation(); alterarEntregaDadosStatus('${os.numero}', '${entregaStatus}')" style="font-size: 0.72rem; cursor: pointer;" title="Clique para alternar status">✅ APROVADO</span>`;
                } else if (entregaStatus === 'CORRIGIR') {
                    entregaHtml = `<span class="badge badge-red" onclick="event.stopPropagation(); alterarEntregaDadosStatus('${os.numero}', '${entregaStatus}')" style="font-size: 0.72rem; cursor: pointer;" title="Clique para alternar status">❌ CORRIGIR</span>`;
                } else if (entregaStatus === 'ALTERADO') {
                    entregaHtml = `<span class="badge" onclick="event.stopPropagation(); alterarEntregaDadosStatus('${os.numero}', '${entregaStatus}')" style="font-size: 0.72rem; background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.3); font-weight: 700; cursor: pointer;" title="Clique para alternar status">⚠️ ALTERADO</span>`;
                }


                const dataPedFormatada = os.data_pedido ? `<br><span style="font-size: 0.72rem; color: var(--text-dim);" title="Data de Criação do Pedido">Ped: ${formatDateTime(os.data_pedido)}</span>` : '';
                
                // Progresso das artes
                const osNumeroInt = parseInt(os.numero);
                const artesDaOS = (state.todasArtes || []).filter(a => a.id_int === osNumeroInt);
                const itensList = state.osItens[os.id] || [];
                
                let isAllApproved = false;
                const validApproved = ['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'];
                
                if (validApproved.includes((os.status_calculado || '').trim().toUpperCase())) {
                    isAllApproved = true;
                } else if (artesDaOS.length > 0) {
                    if (validApproved.includes((artesDaOS[0].status || '').trim().toUpperCase())) {
                        isAllApproved = true;
                    }
                }
                
                let qtdAprovadas = 0;
                const totalItensOS = itensCount; // Usa a mesma contagem da coluna "Itens" (modelos)

                // Usamos os modelos globais se existirem, senão tentamos o cache local
                const modelosParaChecar = itensReais.length > 0 ? itensReais : (state.osItens[os.id] || []);

                if (modelosParaChecar.length > 0) {
                    qtdAprovadas = modelosParaChecar.filter(i => {
                        const sAmostra = (i.amostra_status || '').trim().toUpperCase();
                        const sArte = (i.status_arte || '').trim().toUpperCase();
                        return validApproved.includes(sAmostra) || validApproved.includes(sArte);
                    }).length;
                    
                    if (isAllApproved) {
                        qtdAprovadas = Math.max(qtdAprovadas, totalItensOS);
                    } else if (qtdAprovadas === totalItensOS && totalItensOS > 0) {
                        isAllApproved = true;
                    }
                } else if (isAllApproved) {
                    qtdAprovadas = totalItensOS > 0 ? totalItensOS : 1;
                }
                
                const artProgressHtml = totalItensOS > 0 
                    ? `<div style="font-size: 0.72rem; margin-top: 5px; font-weight: ${isAllApproved ? 'bold' : 'normal'}; color: ${isAllApproved ? 'var(--green)' : 'var(--text-dim)'};">${qtdAprovadas}/${totalItensOS} Aprovadas</div>`
                    : '';
                    
                let nomeEventoHtml = '';
                const arteComEvento = artesDaOS.find(a => a.nome_evento);
                if (arteComEvento) {
                    nomeEventoHtml = `<br><span style="font-size: 0.82rem; color: #f97316;">${arteComEvento.nome_evento}</span>`;
                }

                let nomeDesignerHtml = '';
                const desigDaOS = getOSDesigner(os.id, os.numero);
                if (desigDaOS) {
                    nomeDesignerHtml = `<br><span style="font-size: 0.82rem; color: #3b82f6;">${desigDaOS}</span>`;
                }

                const osStUp = (os.status_calculado || os.status || '').trim().toUpperCase();
                const isEmAlteracao = (osStUp === 'EM ALTERAÇÃO' || osStUp === 'EM ALTERACAO' || osStUp === 'REPROVADA' || osStUp === 'REPROVADO' || osStUp === 'REPROVADA_CLIENTE' || osStUp === 'ARTE_EM_CORRECAO');

                let badgeBoxBg = '#3b82f6'; // Azul por padrão para "Em Arte"

                if (isEmAlteracao || entregaStatus === 'ALTERADO') {
                    badgeBoxBg = '#f97316'; // Laranja para Em Alteração ou Entrega Alterada
                } else if (entregaStatus === 'CORRIGIR') {
                    badgeBoxBg = '#ef4444';
                } else if (isAllApproved && entregaStatus === 'APROVADO') {
                    badgeBoxBg = '#22c55e';
                }


                return `
                    <tr class="os-row" onclick="navigateToAmostrasFromOS('${os.id}')" style="cursor: pointer; ${isAllApproved ? 'background: rgba(34,197,94,0.05); border-left: 3px solid var(--green);' : ''}" title="Abrir Amostras">
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 1.35rem; font-weight: 900; color: #ffffff; background-color: ${badgeBoxBg}; padding: 4px 12px; border-radius: 6px; display: inline-block; cursor: pointer;" title="Abrir Amostras do Pedido #${os.numero}">${os.numero}</span>
                                <a href="https://vibe.ai-ideal.com.br/orcamentos/${os.numero}/editar?tab=produtos" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; text-decoration: none; transition: transform 0.2s, background-color 0.2s; cursor: pointer;" title="Abrir Pedido #${os.numero} no Vibe Ideal (Sistema Parceiro)" onclick="event.stopPropagation();">
                                    <img src="icon-vibe.png" alt="Vibe" style="height: 22px; width: auto; display: block; object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));" />
                                </a>
                            </div>
                        </td>

                        <td>
                            <strong style="color: white;">${os.cliente || '--'}</strong>${nomeEventoHtml}
                        </td>
                        <td>
                            <strong style="color: white;">${os.vendedor || '--'}</strong>${nomeDesignerHtml}
                        </td>
                        <td style="font-size: 0.82rem; color: var(--text-dim);">
                            ${formatDateTime(os.data_liberacao)}
                            ${dataPedFormatada}
                        </td>
                        <td style="text-align: center; vertical-align: middle;">${entregaHtml}</td>
                        <td style="text-align: center;">
                            ${getStatusBadge(os.status_calculado || os.status)}
                            ${artProgressHtml}
                        </td>
                        <td><span class="badge">${itensCount} ${itensCount === 1 ? 'item' : 'itens'}</span></td>
                        <td onclick="event.stopPropagation();">
                            ${(() => {
                                const perms = window._currentPerms || {};
                                const canEdit = perms.perm_lista_arte_edit !== false;
                                const linkSalvo = state.linksCliente && state.linksCliente[os.id];
                                const st = (os.status_calculado || os.status || '').trim();
                                const stUp = st.toUpperCase();

                                let btns = [];

                                const isEntregaAlterada = entregaStatus === 'ALTERADO' || entregaStatus === 'CORRIGIR';

                                // ── Botões por status ──
                                const isReprovada = stUp === 'REPROVADA' || stUp === 'REPROVADO' || stUp === 'REPROVADA_CLIENTE';
                                const isAprovada = stUp === 'APROVADA' || stUp === 'APROVADO' || stUp === 'APROVADA_CLIENTE' || stUp === 'LIBERADA' || stUp === 'ARTE_APROVADA' || stUp === 'ARTE APROVADA';
                                const isArtePronta = st === 'Arte Pronta' || st === 'Enviar Arte' || st === 'Enviar ARTE';
                                const isAguardando = st === 'Aguard. Aprovação' || stUp === 'AGUARDANDO_APROVACAO';
                                const isAlterado = stUp === 'EM ALTERAÇÃO' || stUp === 'EM ALTERACAO' || st === 'Em Alteração';

                                // 1) Botão de link
                                if (isArtePronta) {
                                    // Arte pronta para envio: Gerar (1ª vez) ou Reenviar (se já tem link)
                                    const labelLink = linkSalvo ? '🔗 Enviar Link' : '🔗 Gerar Link';
                                    btns.push(`<button class="btn btn-sm" onclick="gerarLinkCliente('${os.id}', '${os.numero}')" style="padding:4px 8px;font-size:0.73rem;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);border-radius:6px;cursor:pointer;">${labelLink}</button>`);
                                } else if (isAlterado) {
                                    // Arte alterada/corrigida: sempre mostrar opção de reenviar com nova imagem
                                    btns.push(`<button class="btn btn-sm" onclick="gerarLinkCliente('${os.id}', '${os.numero}')" style="padding:4px 8px;font-size:0.73rem;background:rgba(249,115,22,0.15);color:#f97316;border:1px solid rgba(249,115,22,0.3);border-radius:6px;cursor:pointer;" title="Regenerar imagem e reenviar link com arte corrigida">⚠️ Reenviar Link</button>`);
                                } else if (linkSalvo) {
                                    btns.push(`<div style="display:flex;gap:4px;">
                                        <button onclick="window.open('${linkSalvo}','_blank')" class="btn btn-sm" style="padding:3px 7px;font-size:0.8rem;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);border-radius:6px;cursor:pointer;" title="Abrir link do cliente">🔗</button>
                                        <button class="btn btn-sm" onclick="gerarLinkCliente('${os.id}', '${os.numero}')" title="Copiar link" style="padding:3px 7px;font-size:0.8rem;background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);border-radius:6px;cursor:pointer;">📋</button>
                                        <button class="btn btn-sm" onclick="abrirModalEnviarEmailCliente('${os.id}', '${os.numero}', '${linkSalvo}')" title="Enviar por e-mail" style="padding:3px 7px;font-size:0.8rem;background:rgba(99,102,241,0.12);color:#818cf8;border:1px solid rgba(99,102,241,0.35);border-radius:6px;cursor:pointer;">✉️</button>
                                    </div>`);
                                } else if (isAguardando || isEntregaAlterada) {
                                    const btnColor = isEntregaAlterada ? 'background:rgba(249,115,22,0.15);color:#f97316;border:1px solid rgba(249,115,22,0.3);' : 'background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);';
                                    btns.push(`<button class="btn btn-sm" onclick="gerarLinkCliente('${os.id}', '${os.numero}')" style="padding:4px 8px;font-size:0.73rem;${btnColor}border-radius:6px;cursor:pointer;">🔗 Gerar Link</button>`);
                                }



                                // 2) Reprovar (quando status permite e usuário tem edit)
                                if (!isReprovada && !isAprovada && st !== 'Em Fila') {
                                    btns.push(`<button class="btn btn-sm" onclick="reprovarArteAdmin('${os.id}')" ${canEdit ? '' : 'disabled title="Sem permissão"'} style="padding:3px 7px;font-size:0.73rem;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:6px;${!canEdit ? 'opacity:0.4;cursor:not-allowed;' : ''}" title="Reprovar Arte">❌</button>`);
                                }

                                // 3) Voltar p/ Arte (quando reprovada ou entrega alterada)
                                if (isReprovada || isEntregaAlterada) {
                                    btns.push(`<button class="btn btn-sm" onclick="voltarParaArteFromLista('${os.id}')" ${canEdit ? '' : 'disabled'} style="padding:4px 8px;font-size:0.73rem;background:rgba(59,130,246,0.1);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);border-radius:6px;${!canEdit ? 'opacity:0.4;cursor:not-allowed;' : ''}">↩️ Voltar p/ Arte</button>`);
                                }

                                // 4) Liberar p/ Produção (quando aprovada e entrega não está alterada/corrigir)
                                if (isAprovada && !isEntregaAlterada) {
                                    btns.push(`<button class="btn btn-sm" onclick="liberarParaProducao('${os.id}')" ${canEdit ? '' : 'disabled'} style="padding:4px 8px;font-size:0.73rem;background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);border-radius:6px;${!canEdit ? 'opacity:0.4;cursor:not-allowed;' : ''}">🖨️ Produção</button>`);
                                }

                                return btns.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;">${btns.join('')}</div>` : '<span style="color:var(--text-dim);font-size:0.75rem;">—</span>';
                            })()}
                        </td>

                    </tr>

                `;
            }).join('');
        }
    }
}

/**
 * Expande/colapsa os detalhes de uma OS na fila correspondente
 */
async function toggleOSDetail(osId) {
    const os = state.ordens.find(o => o.id === osId);
    if (!os) return;

    // OSs na fila de impressão têm status_interno === 'EM PRODUCAO' ou 'EM IMPRESSAO' (vindo do Vibecode)
    const siUpper = (os.status_interno || '').toUpperCase();
    const isImpressao = siUpper === 'EM PRODUCAO' || siUpper === 'EM PRODUÇÃO' || siUpper === 'EM IMPRESSAO' || siUpper === 'EM IMPRESSÃO' || os.status === 'EM IMPRESSÃO';
    const activeCard = document.getElementById(isImpressao ? 'os-detail-card-impressao' : 'os-detail-card-arte');
    const inactiveCard = document.getElementById(isImpressao ? 'os-detail-card-arte' : 'os-detail-card-impressao');

    if (inactiveCard) inactiveCard.style.display = 'none';

    if (!activeCard) return;

    if (state.osExpandedId === osId) {
        // Colapsar
        state.osExpandedId = null;
        activeCard.style.display = 'none';
        renderOrdens();
        return;
    }

    // Expandir
    state.osExpandedId = osId;
    activeCard.style.display = 'block';

    const numEl = document.getElementById(isImpressao ? 'os-detail-numero-impressao' : 'os-detail-numero-arte');
    const badgeEl = document.getElementById(isImpressao ? 'os-detail-status-badge-impressao' : 'os-detail-status-badge-arte');
    const obsEl = document.getElementById(isImpressao ? 'os-detail-obs-impressao' : 'os-detail-obs-arte');

    if (numEl) numEl.textContent = `#${os.numero}`;
    if (badgeEl) badgeEl.innerHTML = getStatusBadge(os.status);
    if (obsEl) obsEl.textContent = os.observacoes || '';

    renderOrdens();
    await loadOSItens(osId);

    // Scroll suave até o card de detalhes
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Renderiza os itens de uma OS no card de detalhes correspondente
 */
function renderOSItens(osId) {
    const os = state.ordens.find(o => o.id === osId);
    if (!os) return;

    // OSs na fila de impressão têm status_interno === 'EM PRODUCAO' ou 'EM IMPRESSAO' (vindo do Vibecode)
    const siUpperR = (os.status_interno || '').toUpperCase();
    const isImpressao = siUpperR === 'EM PRODUCAO' || siUpperR === 'EM PRODUÇÃO' || siUpperR === 'EM IMPRESSAO' || siUpperR === 'EM IMPRESSÃO' || os.status === 'EM IMPRESSÃO';
    const tbody = document.getElementById(isImpressao ? 'tbody-os-itens-impressao' : 'tbody-os-itens-arte');
    if (!tbody) return;

    const itens = state.osItens[osId] || [];

    if (!itens.length) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:var(--text-dim); padding:20px;">Nenhum item encontrado nesta OS.</td></tr>`;
        return;
    }

    tbody.innerHTML = itens.map((item, index) => {
        const indexModelo = index + 1;
        
        if (isImpressao) {
            return `
            <tr class="hover-row" style="transition: all 0.2s; cursor: pointer;" id="row-item-${item.id}" onclick="typeof enviarParaPedido === 'function' ? enviarParaPedido('${item.id}', '${osId}') : enviarParaImposicao('${item.id}', '${osId}')">
                <td style="text-align: center; font-weight: bold; color: var(--text-dim);">${indexModelo}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${item.modelo || '--'}</td>
                <td><strong>${item.produto || '--'}</strong></td>
                <td>${item.cor || 'STD'}</td>
                <td>${item.numeracao || '--'}</td>
                <td style="text-align: center;">${item.num_inicial || '--'}</td>
                <td style="text-align: center;">${item.num_final || '--'}</td>
                <td style="text-align: center;">${item.verso ? '✅' : '--'}</td>
                <td style="text-align: center;" onclick="event.stopPropagation()">
                    <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; width: 110px;" onchange="updateItemImpressao('${item.id}', '${osId}', this.value)" ${item.aprovacao !== 'APROVADA' && item.aprovacao !== 'PRONTA' && item.aprovacao !== 'LIBERADA' && item.aprovacao !== 'APROVADA_CLIENTE' ? 'disabled title="Aguardando aprovação"' : ''}>
                        <option value="Aguardando" ${normalizarStatusImpressao(item.impressao) === 'Aguardando' ? 'selected' : ''}>⏳ Aguardando</option>
                        <option value="Parcial" ${normalizarStatusImpressao(item.impressao) === 'Parcial' ? 'selected' : ''}>🔄 Parcial</option>
                        <option value="Impresso" ${normalizarStatusImpressao(item.impressao) === 'Impresso' ? 'selected' : ''}>✅ Impresso</option>
                        <option value="Revisão" ${normalizarStatusImpressao(item.impressao) === 'Revisão' ? 'selected' : ''}>⚠️ Revisão</option>
                    </select>
                </td>
            </tr>
            `;
        }
        
        return `
        <tr>
            <td>${item.setor || '--'}</td>
            <td><strong>${item.produto || '--'}</strong></td>
            <td style="font-family: monospace; font-size: 0.85rem;">${item.modelo || '--'}</td>
            <td><span class="badge">${item.formato || '--'}</span></td>
            <td style="text-align: center;"><strong>${item.quantidade || 0}</strong><br><span style="font-size:0.72rem;color:var(--text-dim);">${item.num_inicial}→${item.num_final}</span></td>
            <td>${item.numeracao || '--'}</td>
            <td>${item.cor || 'STD'}</td>
            <td style="text-align: center;">${item.verso ? '✅' : '--'}</td>
            <td style="text-align: center;">${item.blocos || 'N'}</td>
            <td>
                ${getAprovacaoBadge(item.aprovacao)}
                ${item.nome_arquivo_arte ? `
                    <div style="font-size: 0.72rem; margin-top: 4px; color: var(--text-dim); display: flex; flex-direction: column; gap: 2px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span title="${item.nome_arquivo_arte}">
                            📄 v${item.versao_arte || 1}: ${item.nome_arquivo_arte}
                        </span>
                        ${item.url_arquivo_arte ? `
                            <a href="${item.url_arquivo_arte}" target="_blank" style="color: var(--blue); text-decoration: underline; font-size: 0.68rem;" onclick="event.stopPropagation()">Download</a>
                        ` : ''}
                    </div>
                ` : ''}
            </td>
            <td>
                <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; width: 110px;" onchange="updateItemImpressao('${item.id}', '${osId}', this.value)" ${item.aprovacao !== 'APROVADA' && item.aprovacao !== 'PRONTA' && item.aprovacao !== 'LIBERADA' && item.aprovacao !== 'APROVADA_CLIENTE' ? 'disabled title="Aguardando aprovação"' : ''}>
                    <option value="Aguardando" ${normalizarStatusImpressao(item.impressao) === 'Aguardando' ? 'selected' : ''}>⏳ Aguardando</option>
                    <option value="Parcial" ${normalizarStatusImpressao(item.impressao) === 'Parcial' ? 'selected' : ''}>🔄 Parcial</option>
                    <option value="Impresso" ${normalizarStatusImpressao(item.impressao) === 'Impresso' ? 'selected' : ''}>✅ Impresso</option>
                    <option value="Revisão" ${normalizarStatusImpressao(item.impressao) === 'Revisão' ? 'selected' : ''}>⚠️ Revisão</option>
                </select>
            </td>
            <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${!isImpressao ? `
                <button class="btn btn-sm btn-secondary" onclick="openArtesModal('${item.id}', '${osId}')" title="Gerenciar Artes do Modelo">
                    🎨 Artes
                </button>
                ` : ''}
                <button class="btn btn-sm btn-primary" onclick="typeof enviarParaPedido === 'function' ? enviarParaPedido('${item.id}', '${osId}') : enviarParaImposicao('${item.id}', '${osId}')" title="Enviar para Imposição" ${item.aprovacao !== 'APROVADA' && item.aprovacao !== 'PRONTA' ? 'disabled' : ''}>
                    🖨️ Impor
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

/**
 * Altera o status simulado de uma OS no localStorage
 */
function changeOSStatus(osId, newStatus) {
    const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
    overrides[osId] = newStatus;
    localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

    // Atualizar no estado local em memória
    const os = state.ordens.find(o => o.id === osId);
    if (os) {
        os.status = newStatus;
    }

    // Sincronizar com Supabase para que a página do cliente veja o status atualizado
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        if (osId.startsWith('vibe_')) {
            // Pedidos Vibecode: salvar status em pedidos_links_cliente.status_arte (texto)
            supabaseClient
                .from('pedidos_links_cliente')
                .update({ status_arte: newStatus })
                .eq('os_id', osId)
                .then(({error}) => { if(error) console.warn('Erro ao sync status_arte em links:', error) });
        } else {
            supabaseClient
                .from('producao_ordens_servico')
                .update({ status: newStatus })
                .eq('id', osId)
                .then(({error}) => { if(error) console.warn('Erro ao sync status:', error) });
        }
    }

    // Se o card de detalhes da OS estiver aberto, fechar
    if (state.osExpandedId === osId) {
        state.osExpandedId = null;
        const cardImp = document.getElementById('os-detail-card-impressao');
        const cardArt = document.getElementById('os-detail-card-arte');
        if (cardImp) cardImp.style.display = 'none';
        if (cardArt) cardArt.style.display = 'none';
    }

    renderOrdens();
    toast(`Pedido #${os ? os.numero : ''} atualizado para ${newStatus === 'EM IMPRESSÃO' ? 'Impressão' : 'Arte'}!`, 'success');
}

/**
 * Funções auxiliares para dados de propostas e prazos do E-deal (Vibecode)
 */
function getFallbackCliente(numero) {
    const clientes = [
        "Art & Show Eventos Ltda",
        "Hospital Metropolitano",
        "Clube Atlético Ideal",
        "Arena de Show Brasil",
        "Prefeitura Municipal",
        "Cervejaria Artesanal Express",
        "Associação Atlética Acadêmica"
    ];
    return clientes[numero % clientes.length];
}

function getFallbackVendedor(numero) {
    const vendedores = [
        "Carlos Souza",
        "Ana Júlia Silva",
        "Marcos Oliveira",
        "Juliana Ribeiro",
        "Fernanda Costa"
    ];
    return vendedores[numero % vendedores.length];
}

function getFallbackPrazo(createdAtStr, numero) {
    try {
        const date = new Date(createdAtStr);
        const diasExtras = 3 + (numero % 5);
        date.setDate(date.getDate() + diasExtras);
        return date.toISOString();
    } catch (e) {
        return new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    }
}

function formatPrazoDestaque(prazoStr) {
    if (!prazoStr) return { text: '--', style: '' };
    try {
        const date = new Date(prazoStr);
        const now = new Date();

        // Zerar horas para cálculo de dias
        const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const diffTime = d1.getTime() - d2.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const text = date.toLocaleDateString('pt-BR');

        if (diffDays < 0) {
            return { text: `${text} (Atrasado)`, style: 'color: var(--red); font-weight: 600;' };
        } else if (diffDays <= 2) {
            return { text: `${text} (Urgente)`, style: 'color: var(--amber); font-weight: 600;' };
        } else {
            return { text: text, style: 'color: var(--text-dim);' };
        }
    } catch (e) {
        return { text: prazoStr, style: '' };
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', '');
    } catch (e) {
        return dateStr;
    }
}

/**
 * Atualiza status de impressão de um item
 */
async function updateItemImpressao(itemId, osId, novoStatus) {
    try {
        if (itemId && itemId.toString().startsWith('vibe_item_')) {
            const impOverrides = JSON.parse(localStorage.getItem('vibe_item_impressao_overrides') || '{}');
            impOverrides[itemId] = novoStatus;
            localStorage.setItem('vibe_item_impressao_overrides', JSON.stringify(impOverrides));
        }

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const isNumericId = /^\d+$/.test(String(itemId).trim());
            let query = supabaseClient.from('pedidos_modelos').update({ status_impressao: novoStatus });
            if (isNumericId) {
                query = query.eq('id', parseInt(itemId, 10));
            } else {
                query = query.eq('id', itemId);
            }
            const { error } = await query;
            if (error) throw error;
        } else {
            const res = await fetch(`${API_BASE_URL}/api/os_itens/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status_impressao: novoStatus })
            });
            if (!res.ok) throw new Error('Falha ao atualizar');
        }

        // Atualizar estado local
        if (state.osItens[osId]) {
            const item = state.osItens[osId].find(i => String(i.id) === String(itemId));
            if (item) {
                item.impressao = novoStatus;
                item.status_impressao = novoStatus;
            }
        }

        // Atualizar também no state.modelosGlobais
        const numOs = parseInt(osId.toString().replace('vibe_', ''));
        if (state.modelosGlobais && state.modelosGlobais[numOs]) {
            const mod = state.modelosGlobais[numOs].find(m => String(m.id) === String(itemId));
            if (mod) {
                mod.impressao = novoStatus;
                mod.status_impressao = novoStatus;
            }
        }

        toast(`Impressão atualizada: ${novoStatus}`, 'success');
        renderOrdens();
    } catch (e) {
        console.error('Erro ao atualizar impressão:', e);
        const errMessage = e.message || e.details || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        toast('Erro ao atualizar impressão: ' + errMessage, 'error');
        // Recarregar para reverter
        await loadOSItens(osId);
    }
}

// -------------------------------------------------------------------------------
// MATCHING INTELIGENTE -- OS → Catálogo do Imposition
// -------------------------------------------------------------------------------

/**
 * Matching inteligente: texto do formato da OS → formato_id do catálogo
 * Ex: "35X2" → busca formato com width_mm=35 e (cols=2 ou nome contém "35X2")
 */
function matchFormato(formatoText) {
    if (!formatoText || !state.formatos.length) return null;
    const text = formatoText.trim().toUpperCase();
    // 1. Match exato por nome
    let match = state.formatos.find(f => f.name.toUpperCase() === text);
    if (match) return match.id;
    // 2. Match parcial por nome (contém)
    match = state.formatos.find(f => f.name.toUpperCase().includes(text) || text.includes(f.name.toUpperCase()));
    if (match) return match.id;
    // 3. Parse "NNxM" → width_mm=NN
    const parts = text.match(/^(\d+)[Xx×](\d+)$/);
    if (parts) {
        const w = parseInt(parts[1]);
        match = state.formatos.find(f => Math.round(f.width_mm) === w);
        if (match) return match.id;
    }
    return null;
}

/**
 * Matching inteligente: nome da cor da OS → cor_id do catálogo
 */
function matchCor(corText, formatoId) {
    if (!corText || !state.cores || !state.cores.length) return null;
    const text = corText.trim().toUpperCase();
    if (text === 'STD') return null;
    let pool = formatoId ? state.cores.filter(c => !c.formato_id || c.formato_id === formatoId) : state.cores;
    let match = pool.find(c => c.name.toUpperCase() === text);
    if (match) return match.id;
    match = pool.find(c => c.name.toUpperCase().includes(text) || text.includes(c.name.toUpperCase()));
    if (match) return match.id;
    return null;
}

/**
 * Matching inteligente: tipo de numeração da OS → numeracao_id do catálogo
 */
function matchNumeracao(numText, formatoId) {
    if (!numText || !state.numeracoes.length) return null;
    const text = numText.trim().toUpperCase();
    let pool = formatoId
        ? state.numeracoes.filter(n => {
            if (n.formato_ids && Array.isArray(n.formato_ids)) return n.formato_ids.includes(formatoId);
            if (n.formato_id) return n.formato_id === formatoId;
            return true;
        })
        : state.numeracoes;
    let match = pool.find(n => n.name.toUpperCase() === text);
    if (match) return match.id;
    match = pool.find(n => n.name.toUpperCase().includes(text) || text.includes(n.name.toUpperCase()));
    if (match) return match.id;
    const typeMap = { 'QR': 'QR', 'BARRAS': 'BARR', 'SEQUENCIAL': 'SEQ', 'PADRÃO': 'PADR', 'BANCO D.': 'BANC', 'TICKET': 'TICK', 'TEATRO': 'TEAT' };
    const keyword = typeMap[text];
    if (keyword) {
        match = pool.find(n => n.name.toUpperCase().includes(keyword));
        if (match) return match.id;
    }
    return null;
}

/**
 * Auto-salva um campo do item da OS (formato_id, cor_id, numeracao_id)
 */
async function autoSaveOSItemField(itemId, osId, field, value) {
    try {
        if (state.osItens[osId]) {
            const item = state.osItens[osId].find(i => String(i.id) === String(itemId));
            if (item) {
                item[field] = value;
                if (field === 'verso_tipo') {
                    item.verso = !!(value && value !== 'Frente');
                }
            }
        }
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const dbFieldMap = {
                'num_inicial':      'numeracao_inicio',
                'num_final':        'numeracao_fim',
                'qtd':              'quantidade',
                'numeracao_id':     'amostra_num_id',
                'verso_tipo':       'verso_tipo',
                'status_impressao': 'status_impressao',
                'c_ini':            'C_INI',
                'q_cam':            'Q_CAM',
                'l_cam':            'L_CAM'
            };

            // Campos locais que não existem no banco de dados
            if (field === 'formato_id' || field === 'saida_id') {
                return;
            }
            const dbField = dbFieldMap[field] || field;
            const dbValue = (field === 'num_inicial' || field === 'num_final' || field === 'qtd' || field === 'c_ini' || field === 'q_cam' || field === 'l_cam')
                ? (parseInt(value, 10) || 0)
                : value;
            
            const updatePayload = { [dbField]: dbValue };
            if (dbField === 'verso_tipo') {
                updatePayload.frente_verso = (value !== 'Frente');
            }
            
            const isNumericId = /^\d+$/.test(String(itemId).trim());
            
            let query = supabaseClient.from('pedidos_modelos').update(updatePayload);
            if (isNumericId) {
                query = query.eq('id', parseInt(itemId, 10));
            } else {
                query = query.eq('id', itemId);
            }
            
            const { error } = await query;
            if (error) console.error(`[OS] Erro ao auto-salvar pedidos_modelos ${dbField}:`, error);
        } else {
            await fetch(`${API_BASE_URL}/api/os_itens/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
        }
    } catch (e) {
        console.error(`[OS] Erro ao auto-salvar ${field}:`, e);
    }
}

/**
 * Salva um campo do item ativo atualmente selecionado na imposição
 */
async function saveActiveOSItemField(field, value) {
    if (state.activeOSItem) {
        const { itemId, osId } = state.activeOSItem;
        const itens = state.osItens[osId] || [];
        const item = itens.find(i => String(i.id) === String(itemId));
        if (item) {
            item[field] = value;
            if (field === 'verso_tipo') {
                item.verso = !!(value && value !== 'Frente');
            }
            
            // Mapear campo local → coluna no banco (pedidos_modelos)
            const dbFieldMap = {
                'num_inicial':   'numeracao_inicio',
                'num_final':     'numeracao_fim',
                'qtd':           'quantidade',
                'numeracao':     'gabarito_operacional',
                'formato_id':    'formato_id',
                'saida_id':      'saida_id',
                'numeracao_id':  'amostra_num_id',
                'verso_tipo':    'verso_tipo'
            };
            const dbField = dbFieldMap[field] || field;
            const dbValue = (field === 'num_inicial' || field === 'num_final' || field === 'qtd')
                ? (parseInt(value) || 0)
                : value;
                
            await autoSaveOSItemField(itemId, osId, dbField, dbValue);
            
            // Re-renderizar filas para manter sincronizadas as tabelas de OS
            if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
            if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
        }
    }
}
window.saveActiveOSItemField = saveActiveOSItemField;

function onImposicaoFormatoChange(value) {
    populateImpNumeracoes();
    applyFormatoDefaults();
    updateImpSummary();
    saveActiveOSItemField('formato_id', value);
    const fmtObj = state.formatos.find(f => String(f.id) === String(value));
    if (fmtObj && fmtObj.default_saida_id) {
        saveActiveOSItemField('saida_id', fmtObj.default_saida_id);
    }
}
window.onImposicaoFormatoChange = onImposicaoFormatoChange;

function onImposicaoNumeracaoChange(value) {
    updateImpSummary();
    toggleImpNumEditButtons();
    saveActiveOSItemField('numeracao_id', value);
    const numObj = state.numeracoes.find(n => String(n.id) === String(value));
    saveActiveOSItemField('numeracao', numObj ? (numObj.name || numObj.tipo) : null);
    
    // Se a numeração contém verso, mudar automaticamente para duplex (frente e verso)
    if (numObj) {
        const hasVerso = (numObj.name && numObj.name.toLowerCase().includes('verso')) || 
                         (numObj.elements && numObj.elements.some(el => el.face === 'back'));
        if (hasVerso) {
            const printMode = document.getElementById('imp-print-mode');
            if (printMode && printMode.value !== 'duplex') {
                printMode.value = 'duplex';
                if (typeof onImposicaoPrintModeChange === 'function') {
                    onImposicaoPrintModeChange('duplex');
                }
            }
        }
    }
}
window.onImposicaoNumeracaoChange = onImposicaoNumeracaoChange;

function onImposicaoSaidaChange(value) {
    updateImpSummary();
    saveActiveOSItemField('saida_id', value);
}
window.onImposicaoSaidaChange = onImposicaoSaidaChange;

function onImposicaoStartInput(value) {
    updateImpSummary();
    saveActiveOSItemField('num_inicial', value);
}
window.onImposicaoStartInput = onImposicaoStartInput;

function onImposicaoEndInput(value) {
    updateImpSummary();
    saveActiveOSItemField('num_final', value);
}
window.onImposicaoEndInput = onImposicaoEndInput;

function onImposicaoPrintModeChange(value) {
    updateImpSummary();
    const isDuplex = value === 'duplex';
    
    // Evitar sobrescrever opções de verso duplex como VERSO VARIÁVEL com VERSO COMUM/FRENTE E VERSO
    const activeItem = state.activeOSItem;
    if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            if (isDuplex) {
                const currentIsVerso = item.verso_tipo && item.verso_tipo !== 'Frente';
                if (!currentIsVerso) {
                    saveActiveOSItemField('verso_tipo', 'FxVerso');
                }
            } else {
                saveActiveOSItemField('verso_tipo', 'Frente');
            }
            return;
        }
    }
    saveActiveOSItemField('verso_tipo', isDuplex ? 'FxVerso' : 'Frente');
}
window.onImposicaoPrintModeChange = onImposicaoPrintModeChange;

// Função simples para normalizar strings para busca (ignora acentos, cedilha, maiúsculas)
const globalNormStr = (s) => s ? String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '') : '';
const globalFuzzyMatch = (a, b) => {
    const na = globalNormStr(a), nb = globalNormStr(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * Envia um item da OS para a tela de Imposição, preenchendo os campos automaticamente
 * com matching inteligente de formato, cor e numeração
 */
async function enviarParaImposicao(itemId, osId, switchTab = true) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return toast('Item não encontrado.', 'error');

    // Guardar referência ao item ativo para atualização automática pós-imposição
    state.activeOSItem = { itemId, osId };

    const impPreview = document.getElementById('imp-preview-card-container');
    if (impPreview) impPreview.style.display = 'block';
    const pedPreview = document.getElementById('ped-preview-card-container');
    if (pedPreview) pedPreview.style.display = 'block';

    // Navegar para a view de Imposição condicionalmente
    if (switchTab) {
        const navBtn = document.querySelector('[data-view="view-imposicao"]');
        if (navBtn) navBtn.click();
    }

    // --- MATCHING AUTOMÁTICO DE FORMATO (VIA COR OU NOME) E SAÍDA ---
    let formatoId = item.formato_id;

    // Tentar encontrar o formato atrelado ao produto no banco de dados (via ID ou Nome)
    if (!formatoId && state.produtosGlobais) {
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
                    const nameMatch = (p.nomeReal || '').toLowerCase().trim() === cleanProdName || globalFuzzyMatch(p.nomeReal, prodName);
                    if (nameMatch) return true;
                    const apelidos = (p.apelidos || '').split(',').map(a => a.trim().toLowerCase());
                    return apelidos.includes(cleanProdName) || apelidos.some(a => globalFuzzyMatch(a, prodName));
                });
            }
        }
        if (produtoObj && produtoObj.id_formato) {
            formatoId = produtoObj.id_formato;
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched via Produto "${produtoObj.nomeReal}" → ${formatoId}`);
        }
    }
    
    // Tentar match do formato via Cor
    if (!formatoId && item.cor) {
        const corMatched = state.cores ? state.cores.find(c => (c.name || '').toLowerCase().trim() === item.cor.toLowerCase().trim() || globalFuzzyMatch(c.name, item.cor)) : null;
        if (corMatched && corMatched.formato_id) {
            formatoId = corMatched.formato_id;
            console.log(`[OS→Imp] Formato matched via Cor "${item.cor}" → ${formatoId}`);
        }
    }

    if (!formatoId && item.formato) {
        formatoId = matchFormato(item.formato);
        if (formatoId) {
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched via Nome: "${item.formato}" → ${formatoId}`);
        }
    }
    
    // Fallback: Se o formato não foi definido ou não bateu com nenhum produto, seleciona o 1º formato padrão do sistema
    if (!formatoId && state.formatos && state.formatos.length > 0) {
        formatoId = state.formatos[0].id;
        console.log(`[OS→Imp] Fallback de Formato ativado: ${formatoId}`);
    }
    
    if (formatoId) {
        const fmtSelect = document.getElementById('imp-formato');
        if (fmtSelect) {
            fmtSelect.value = formatoId;
            fmtSelect.dispatchEvent(new Event('change'));
        }
        const pedFmtSelect = document.getElementById('ped-formato');
        if (pedFmtSelect) {
            if (typeof populatePedNumeracoes === 'function') populatePedNumeracoes();
            pedFmtSelect.value = formatoId;
            pedFmtSelect.dispatchEvent(new Event('change'));
        }

        // Tentar match da Saída via Formato ou primeiro registro disponível
        const formatoObj = state.formatos ? state.formatos.find(f => String(f.id) === String(formatoId)) : null;
        const resolvedSaidaId = item.saida_id || (formatoObj ? formatoObj.default_saida_id : null) || (state.saidas && state.saidas[0] ? state.saidas[0].id : null);

        if (resolvedSaidaId) {
            setTimeout(() => {
                const saidaSelect = document.getElementById('imp-saida');
                if (saidaSelect) {
                    saidaSelect.value = resolvedSaidaId;
                    saidaSelect.dispatchEvent(new Event('change'));
                }
                const pedSaidaSelect = document.getElementById('ped-saida');
                if (pedSaidaSelect) {
                    pedSaidaSelect.value = resolvedSaidaId;
                    pedSaidaSelect.dispatchEvent(new Event('change'));
                }
            }, 100);
        }
    }

    // --- MATCHING AUTOMÁTICO DE NUMERAÇÃO ---
    setTimeout(() => {
        let numId = item.numeracao_id;
        if (!numId && item.numeracao) {
            numId = matchNumeracao(item.numeracao, formatoId);
            if (numId) {
                autoSaveOSItemField(itemId, osId, 'numeracao_id', numId);
                console.log(`[OS→Imp] Numeração matched: "${item.numeracao}" → ${numId}`);
            }
        }
        if (numId) {
            const numSelect = document.getElementById('imp-numeracao');
            if (numSelect) {
                const opt = numSelect.querySelector(`option[value="${numId}"]`);
                if (opt) {
                    numSelect.value = numId;
                    numSelect.dispatchEvent(new Event('change'));
                }
            }
        }
    }, 300);

    // --- PREENCHER FAIXA DE NUMERAÇÃO ---
    setTimeout(() => {
        const numStart = document.getElementById('imp-start');
        const numEnd = document.getElementById('imp-end');
        if (numStart && item.num_inicial) numStart.value = item.num_inicial;
        if (numEnd && item.num_final) numEnd.value = item.num_final;
    }, 400);

    setTimeout(() => {
        const printMode = document.getElementById('imp-print-mode');
        if (printMode) {
            printMode.value = item.verso ? 'duplex' : 'front';
            printMode.dispatchEvent(new Event('change'));
        }
        if (item.blocos && item.blocos !== 'N') {
            const schemaSelect = document.getElementById('imp-schema');
            if (schemaSelect) {
                schemaSelect.value = 'cut_stack';
                schemaSelect.dispatchEvent(new Event('change'));
            }
        }
        updateImpSummary();
        if (typeof drawPreview === 'function') drawPreview();
    }, 800);

    // --- ATUALIZAR PAINEL DE ITENS OS ---
    setTimeout(() => { renderImpOSQueue(); }, 600);
    
    // --- CARREGAR ARTE (PDF/IMAGEM) ---
    setTimeout(() => {
        // Prioridade 1: arte_url do próprio item
        // Prioridade 2: pdf_base64 da cor correspondente
        const arteUrl = item.arte_url || null;
        
        // Tentar encontrar a arte via cor — prioridade: amostra_cor_id > fuzzy match
        const corObj = item.amostra_cor_id
            ? (state.cores || []).find(c => String(c.id) === String(item.amostra_cor_id))
            : (state.cores || []).find(c => globalFuzzyMatch(c.name, item.cor || item.padrao || ''));
        
        if (arteUrl) {
            state.isColorTemplate = false;
            // Extrair o nome do arquivo da URL para preservar a extensão correta (.jpg, .pdf, etc.)
            const filenameFromUrl = decodeURIComponent(arteUrl.split('/').pop().split('?')[0]);
            const filename = filenameFromUrl || item.nome_arquivo_arte || `Arte_${item.modelo || 'Modelo'}.pdf`;
            
            fetch(arteUrl)
                .then(res => {
                    const ct = res.headers.get('content-type') || '';
                    return res.blob().then(blob => ({ blob, ct }));
                })
                .then(({ blob, ct }) => {
                    const isPdf = ct.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
                    const isImg = ct.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(filename);
                    if (!isPdf && !isImg) {
                        console.warn('[OS→Imp] Conteúdo retornado não é PDF nem imagem. Content-Type:', ct);
                        return;
                    }
                    const file = new File([blob], filename, { type: ct || (isPdf ? 'application/pdf' : 'image/png') });
                    state.expectedArteName = filename;
                    loadImpArtFile(file);
                    const impInfo = document.getElementById('imp-file-info');
                    if (impInfo) {
                        impInfo.textContent = `✅ ${filename} (Carregado do Pedido)`;
                        impInfo.style.display = 'block';
                    }
                    setTimeout(() => { if (typeof drawPreview === 'function') drawPreview(); }, 600);
                })
                .catch(err => console.warn('[OS→Imp] Erro ao baixar arte via URL:', err));
                
            // Carregar Verso se houver
            state.impArtVersoPdfDoc = null;
            if (item.verso_arte_url) {
                const filenameV = item.nome_arquivo_arte_verso || `Arte_verso_${item.modelo || 'Modelo'}.pdf`;
                fetch(item.verso_arte_url)
                    .then(res => {
                        const ct = res.headers.get('content-type') || '';
                        return res.blob().then(blob => ({ blob, ct }));
                    })
                    .then(({ blob, ct }) => {
                        const isPdf = ct.includes('pdf') || filenameV.toLowerCase().endsWith('.pdf');
                        if (isPdf && typeof pdfjsLib !== 'undefined') {
                            blob.arrayBuffer().then(arrayBuffer => {
                                pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(pdfV => {
                                    state.impArtVersoPdfDoc = pdfV;
                                    setTimeout(() => { if (typeof drawPreview === 'function') drawPreview(); }, 300);
                                }).catch(e => console.error('[OS→Imp] Erro ao carregar PDF de verso da arte:', e));
                            });
                        }
                    })
                    .catch(err => console.warn('[OS→Imp] Erro ao baixar arte de verso via URL:', err));
            }
        } else if (corObj && corObj.pdf_base64) {
            state.isColorTemplate = true;
            try {
                const base64Data = corObj.pdf_base64.includes('base64,') ? corObj.pdf_base64.split('base64,')[1] : corObj.pdf_base64;
                const binStr = atob(base64Data);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) {
                    bytes[i] = binStr.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const filename = corObj.pdf_filename || `${corObj.name}.pdf`;
                const file = new File([blob], filename, { type: 'application/pdf' });
                state.expectedArteName = filename;
                loadImpArtFile(file);
                
                // Carregar Verso da Cor se for Duplex
                state.impArtVersoPdfDoc = null;
                if (corObj.frente_verso && corObj.pdf_verso_base64) {
                    const base64DataV = corObj.pdf_verso_base64.includes('base64,') ? corObj.pdf_verso_base64.split('base64,')[1] : corObj.pdf_verso_base64;
                    const binStrV = atob(base64DataV);
                    const bytesV = new Uint8Array(binStrV.length);
                    for (let i = 0; i < binStrV.length; i++) {
                        bytesV[i] = binStrV.charCodeAt(i);
                    }
                    pdfjsLib.getDocument({ data: bytesV }).promise.then(pdfV => {
                        state.impArtVersoPdfDoc = pdfV;
                        setTimeout(() => { if (typeof drawPreview === 'function') drawPreview(); }, 300);
                    }).catch(e => console.error('[OS→Imp] Erro ao carregar PDF de verso da cor:', e));
                }
                
                const impInfo = document.getElementById('imp-file-info');
                if (impInfo) {
                    impInfo.textContent = `✅ ${filename} (Carregado da Cor)`;
                    impInfo.style.display = 'block';
                }
                setTimeout(() => { if (typeof drawPreview === 'function') drawPreview(); }, 600);
                console.log(`[OS→Imp] Arte base64 carregada via Cor "${corObj.name}"`);
            } catch (e) {
                console.error('[OS→Imp] Erro ao carregar PDF base64 da cor:', e);
            }
        } else {
            state.isColorTemplate = false;
            // Limpar arte de imposição anterior se não houver arte definida neste item
            state.impArtFile = null;
            state.impArtPdfDoc = null;
            state.impArtVersoPdfDoc = null;
            state.impArtImage = null;
            const impInfo = document.getElementById('imp-file-info');
            if (impInfo) {
                impInfo.style.display = 'none';
            }
            setTimeout(() => { if (typeof drawPreview === 'function') drawPreview(); }, 600);
            console.warn(`[OS→Imp] Nenhuma arte ou gabarito de cor encontrado para item ${item.id}`);
        }
    }, 700);

    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? os.numero : '';
    const formatoObjToast = state.formatos ? state.formatos.find(f => String(f.id) === String(formatoId)) : null;
    const nomeFmtToast = formatoObjToast ? formatoObjToast.name : (item.formato || 'Formato Não Definido');
    toast(`Item "${item.produto} -- ${nomeFmtToast}" da OS #${osNum} carregado na Imposição!`, 'info');
}

// -------------------------------------------------------------------------------
// ABRIR OS INTEIRA NA IMPOSIÇÃO
// -------------------------------------------------------------------------------
async function abrirImposicaoDoPedido(osId, numeroOS) {
    // Garante que todos os itens reais (pedidos_modelos) da OS sejam carregados antes de abrir
    await loadOSItens(osId);

    const osObj = typeof findOSInState === 'function' ? findOSInState(osId) : null;
    const realOsId = osObj ? osObj.id : osId;

    const itens = state.osItens[realOsId] || state.osItens[osId] || [];
    if (!itens.length) {
        return toast('Esta OS não possui itens.', 'error');
    }

    // Não selecionar modelo/item por padrão
    state.activeOSItem = { itemId: null, osId: realOsId };

    // Ocultar as janelas de visualização do pedido por padrão até que um modelo seja clicado
    const pedPreview = document.getElementById('ped-preview-card-container');
    if (pedPreview) pedPreview.style.display = 'none';
    const impPreview = document.getElementById('imp-preview-card-container');
    if (impPreview) impPreview.style.display = 'none';

    // Limpar seleções múltiplas de artes anteriores, e variáveis de arte
    if (state.selectedOSItems) state.selectedOSItems = [];
    state.pedArtFile = null;
    state.pedArtPdfDoc = null;
    state.impArtFile = null;
    state.impArtPdfDoc = null;

    // Renderizar a fila de modelos do pedido (agora abrirá sem nenhum selecionado)
    if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();

    // Navegar para a view de Pedido
    const navBtn = document.querySelector('[data-view="view-pedido"]');
    if (navBtn) navBtn.click();
}

// -------------------------------------------------------------------------------
// PAINEL DE ITENS OS PENDENTES -- na view de Imposição
// -------------------------------------------------------------------------------

/**
 * Renderiza a fila de itens pendentes da OS na view de Imposição
 */
function renderImpOSQueue() {
    const container = document.getElementById( 'imp-os-queue' );
    const wrapper = document.getElementById( 'imp-os-queue-body' );
    if (!container || !wrapper) return;

    const activeItem = state.activeOSItem;
    if (!activeItem || !activeItem.osId) {
        container.style.display = 'none';
        return;
    }

    const osId = activeItem.osId;
    const itens = state.osItens[osId] || [];
    if (!itens.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const groups = {};
    itens.forEach(item => {
        const prodId = item._vibe_id_produto || 'sem_produto';
        if (!groups[prodId]) groups[prodId] = [];
        groups[prodId].push(item);
    });

    const todasCores = state.cores || [];
    const todasNums = state.numeracoes || [];
    const inputStyle = 'background:#030a00; border:1px solid #334155; border-radius:4px; color:#ffffff; padding:8px 10px; font-size:1.2rem; width:100%;';
    const selectStyle = 'appearance: none; -webkit-appearance: none; -moz-appearance: none; background: #030a00; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 1.15rem; width: 100%; max-width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; cursor: pointer; text-align: center; text-align-last: center; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: all 0.2s ease;';
    const selectStyleDisabled = 'appearance: none; -webkit-appearance: none; -moz-appearance: none; background: #030a00; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: rgba(255, 255, 255, 0.5); padding: 8px 12px; font-size: 1.15rem; width: 100%; cursor: not-allowed; text-align: center; text-align-last: center; font-weight: 600; opacity: 0.6;';
    const btnStyle = 'border:none; border-radius:6px; padding:10px 18px; font-size:1.05rem; cursor:pointer; font-weight:700; transition:all 0.2s ease; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);';

    const selectHeaderStyle = 'background:#1e293b; border:1px solid #3b82f6; border-radius:4px; color:#f1f5f9; padding:4px 8px; font-size:0.85rem; cursor:pointer;';
    const selectHeaderStyleDisabled = 'background:#0f172a; border:1px solid #334155; border-radius:4px; color:#94a3b8; padding:4px 8px; font-size:0.85rem; cursor:not-allowed;';

    let html = '';

    for (const prodId of Object.keys(groups)) {
        const groupItens = groups[prodId];
        let nomeReal = 'Produto Desconhecido';
        let setorPcp = '';
        let formatoPadraoId = null;
        
        if (prodId !== 'sem_produto') {
            const prodObj = (state.produtosGlobais || []).find(p => String(p.id_produto) === String(prodId));
            if (prodObj) {
                nomeReal = prodObj.nomeReal || `Produto #${prodId}`;
                setorPcp = prodObj.setor_pcp || '';
                if (prodObj.id_formato) {
                    const fmtObj = (state.formatos || []).find(f => String(f.id_formato_num) === String(prodObj.id_formato));
                    if (fmtObj) formatoPadraoId = fmtObj.id;
                }
            } else {
                nomeReal = `Produto #${prodId}`;
            }
        }

        const setorBadge = setorPcp ? `<span class="badge bg-secondary ms-2" style="font-size:0.7rem; vertical-align:middle; color: #ffffff;">${setorPcp}</span>` : '';

        // Box level Formato & Saida calculation
        let boxFmtSel = formatoPadraoId || (groupItens[0].formato_id || '');
        let boxSaiSel = groupItens[0].saida_id || '';
        
        // If there's a forced formato, auto-apply it to all items if missing
        if (formatoPadraoId) {
            groupItens.forEach(item => {
                if (String(item.formato_id) !== String(formatoPadraoId)) {
                    item.formato_id = formatoPadraoId;
                    setTimeout(() => autoSaveOSItemField(item.id, osId, 'formato_id', formatoPadraoId), 10);
                }
                if (!item.saida_id) {
                    const fObj = (state.formatos || []).find(f => String(f.id) === String(formatoPadraoId));
                    if (fObj && fObj.default_saida_id) {
                        item.saida_id = fObj.default_saida_id;
                        boxSaiSel = fObj.default_saida_id; // Set header saídas as well
                        setTimeout(() => autoSaveOSItemField(item.id, osId, 'saida_id', fObj.default_saida_id), 10);
                    }
                }
            });
        }

        const dropdownFmtDisabled = formatoPadraoId ? 'disabled' : '';
        const fmtHeaderStyle = formatoPadraoId ? selectHeaderStyleDisabled : selectHeaderStyle;
        
        const formatosOptions = (state.formatos || []).map(f => {
            const sel = String(f.id) === String(boxFmtSel) ? 'selected' : '';
            return `<option value="${f.id}" ${sel}>${f.name}</option>`;
        }).join('');
        
        const saidasOptions = (state.saidas || []).map(s => {
            const sel = String(s.id) === String(boxSaiSel) ? 'selected' : '';
            return `<option value="${s.id}" ${sel}>${s.name}</option>`;
        }).join('');

        const headerDropdowns = `
            <div style="display:flex; gap:10px; align-items:center;" onclick="event.stopPropagation()">
                <select style="${fmtHeaderStyle}" ${dropdownFmtDisabled} onchange="updateBoxFormato('${osId}', '${prodId}', this.value)" title="Formato Padrão do Produto">
                    <option value="">— Formato —</option>
                    ${formatosOptions}
                </select>
                <select style="${selectHeaderStyle}" onchange="updateBoxSaida('${osId}', '${prodId}', this.value)" title="Saída Padrão do Produto">
                    <option value="">— Saída —</option>
                    ${saidasOptions}
                </select>
                <span id="box-arrow-${prodId}-renderImpOSQueue" style="color:var(--text-dim); font-size:0.8rem; transition: transform 0.2s; margin-left:5px; cursor:pointer;" onclick="toggleBox('box-body-${prodId}-renderImpOSQueue', 'box-arrow-${prodId}-renderImpOSQueue')">▼</span>
            </div>
        `;

        html += `
        <div class="card mb-1" style="background:#1e293b; border: 1px solid #918f8c; border-radius: 6px; overflow:hidden; margin-bottom: 6pt;" data-setor="${setorPcp}">
            <div class="card-header d-flex justify-content-between align-items-center" style="background:#0f172a; padding: 10px 15px; border-bottom:1px solid #918f8c;">
                <div style="cursor:pointer; display:flex; align-items:center; flex:1;" onclick="toggleBox('box-body-${prodId}-renderImpOSQueue', 'box-arrow-${prodId}-renderImpOSQueue')">
                    <h5 class="mb-0" style="color:var(--warning); font-size:1.1rem; font-weight:bold;">
                        <i class="fas fa-box-open me-2" style="color:#918f8c;"></i>${nomeReal} ${setorBadge}
                    </h5>
                </div>
                ${headerDropdowns}
            </div>
            <div class="table-responsive" id="box-body-${prodId}-renderImpOSQueue" style="padding: 0 3pt;">
                <table class="data-table table-dark table-sm mb-0 align-middle" style="font-size:1.0rem; margin:0; width:100%; border-collapse: separate; border-spacing: 0 6pt;">
                    <tbody>
        `;

        html += groupItens.map((item, idx) => {
            const isActive = activeItem.itemId === item.id || String(activeItem.itemId) === String(item.id);
            const rawStatus = String(item.status_impressao || item.impressao || 'Aguardando').toUpperCase();
            
            let statusBg = '#65625e'; // Aguardando
            if (rawStatus.includes('IMPRESSO')) {
                statusBg = '#162037'; // Impresso
            } else if (rawStatus.includes('PARCIAL')) {
                statusBg = '#32352e'; // Parcial
            } else if (rawStatus.includes('AGUARD') || rawStatus === 'AGUARDANDO') {
                statusBg = '#65625e'; // Aguardando
            }

            const rowStroke = isActive ? 'outline: 2pt solid #f97316;' : 'outline: 1px solid #918f8c;';
            const rowBg = `background: ${statusBg}; ${rowStroke}`;

            let itemFmtId = boxFmtSel;

            const coresItem = todasCores.filter(c => !itemFmtId || !c.formato_id || String(c.formato_id) === String(itemFmtId));
            const numsItem  = todasNums.filter(n  => !itemFmtId || !n.formato_id  || String(n.formato_id)  === String(itemFmtId));

            let selectedCorId = null;
            const corIdAtual   = item.amostra_cor_id ? String(item.amostra_cor_id) : null;
            const corNomeAtual = item.cor || item.padrao || '';
            if (corIdAtual) {
                const found = coresItem.find(c => String(c.id) === corIdAtual);
                if (found) selectedCorId = String(found.id);
            }
            if (!selectedCorId && corNomeAtual) {
                const exactMatch = coresItem.find(c => globalNormStr(c.name) === globalNormStr(corNomeAtual));
                if (exactMatch) {
                    selectedCorId = String(exactMatch.id);
                } else {
                    const fuzzyMatch = coresItem.find(c => globalFuzzyMatch(c.name, corNomeAtual));
                    if (fuzzyMatch) {
                        selectedCorId = String(fuzzyMatch.id);
                    }
                }
            }
            let selectedCorObj = null;
            if (selectedCorId) {
                selectedCorObj = coresItem.find(c => String(c.id) === String(selectedCorId));
            }
            if (!selectedCorObj && corIdAtual) {
                selectedCorObj = (state.cores || []).find(c => String(c.id) === String(corIdAtual));
            }
            if (!selectedCorObj && corNomeAtual) {
                selectedCorObj = (state.cores || []).find(c => globalNormStr(c.name) === globalNormStr(corNomeAtual) || globalFuzzyMatch(c.name, corNomeAtual));
            }
            const corRefHex = selectedCorObj ? (selectedCorObj.cor_referencia || selectedCorObj.hex || '') : '';

            const coresOptions = coresItem.map(c => {
                const sel = selectedCorId && String(c.id) === selectedCorId ? 'selected' : '';
                const refHex = c.cor_referencia || c.hex || '';
                const optStyle = refHex ? `background-color: ${refHex}; color: #000000; font-weight: bold;` : '';
                return `<option value="${c.id}" ${sel} style="${optStyle}">${c.name}</option>`;
            }).join('');

            const corSelectBg = corRefHex || '#1e293b';
            const corSelectStyle = `${selectStyle}; background-color: ${corSelectBg} !important; color: #000000 !important; font-weight: bold;`;

            let selectedNumId = null;
            const numIdAtual = item.numeracao_id ? String(item.numeracao_id) : (item.amostra_num_id ? String(item.amostra_num_id) : null);
            const numValDisplay = item.gabarito_operacional || item.numeracao || '';
            if (numIdAtual) {
                const found = numsItem.find(n => String(n.id) === numIdAtual);
                if (found) selectedNumId = String(found.id);
            }
            if (!selectedNumId && numValDisplay) {
                const exactMatch = numsItem.find(n => globalNormStr(n.name || n.tipo || '') === globalNormStr(numValDisplay));
                if (exactMatch) {
                    selectedNumId = String(exactMatch.id);
                } else {
                    const fuzzyMatch = numsItem.find(n => globalFuzzyMatch(n.name || n.tipo || '', numValDisplay));
                    if (fuzzyMatch) {
                        selectedNumId = String(fuzzyMatch.id);
                    }
                }
            }
            const numsOptions = numsItem.map(n => {
                const sel = selectedNumId && String(n.id) === selectedNumId ? 'selected' : '';
                return `<option value="${n.id}" ${sel}>${n.name || n.tipo}</option>`;
            }).join('');

            const niVal = item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || '');
            const qtdVal = item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || '');
            const nomeDoModelo = item.produto || '--';

            // Obter a numeração selecionada e resolver se é TICKET
            const selectedNum = (state.numeracoes || []).find(n => String(n.id) === String(selectedNumId));
            let ticket_qtd = 1;
            if (selectedNum && selectedNum.tipo === 'TICKET') {
                ticket_qtd = parseInt(selectedNum.ticket_qtd) || 1;
            }

            const niValNum = parseInt(niVal) || 1;
            const qtdValNum = parseInt(qtdVal) || 0;
            const nfCalculado = qtdValNum > 0 ? (niValNum + (qtdValNum * ticket_qtd) - 1) : '';

            // Detectar CAMAROTE
            const isCamarote = selectedNum && (selectedNum.tipo === 'CAMAROTE' || selectedNum.type === 'CAMAROTE');
            const qCamVal = item.q_cam || item.Q_CAM || item.qtd_locais || item.qtd_cam || '';
            const lCamVal = item.l_cam || item.L_CAM || item.lotacao_cam || item.lotacao || item.lotacao_por_local || '';
            const cIniVal = item.c_ini || item.C_INI || 1;

            const jsItemId = item.id;
            const jsOsId = osId;

            return `
                <tr style="${rowBg} cursor: pointer; transition: background 0.2s;" class="hover-row" id="imp-queue-row-${item.id}"
                    onclick="enviarParaImposicao('${jsItemId}', '${jsOsId}')">
                    <td style="padding: 12px; font-size: 1.15rem; font-weight:600; color:#ffffff; min-width:100px;" title="Código do Modelo">
                        ${item.modelo || '--'}
                    </td>
                    <td style="padding: 12px; font-size: 1.15rem; font-weight:600; color:#ffffff; min-width:140px;" title="Nome do Modelo">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 22px; height: 22px; min-width: 22px; min-height: 22px; border-radius: 50%; background-color: ${corRefHex || 'transparent'}; border: ${corRefHex ? '2px solid rgba(255, 255, 255, 0.8)' : '2px dashed #918f8c'}; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.4);" title="Cor de referência: ${corRefHex || 'Nenhuma'}"></span>
                            <span>${nomeDoModelo}</span>
                        </div>
                    </td>
                    
                    ${isCamarote ? `
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Qtd. Locais (Q_CAM)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #f59e0b; white-space: nowrap;">Q_CAM</span>
                            <input type="number" min="0" value="${qCamVal}" style="${inputStyle}" placeholder="Q_CAM"
                                onchange="impQueueUpdateField('${item.id}', '${osId}', 'q_cam', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Lotação por Local (L_CAM)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #f59e0b; white-space: nowrap;">L_CAM</span>
                            <input type="number" min="1" value="${lCamVal}" style="${inputStyle}" placeholder="L_CAM"
                                onchange="impQueueUpdateField('${item.id}', '${osId}', 'l_cam', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Início do Local (C_INI)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #f59e0b; white-space: nowrap;">C_INI</span>
                            <input type="number" min="1" value="${cIniVal}" style="${inputStyle}" placeholder="C_INI"
                                onchange="impQueueUpdateField('${item.id}', '${osId}', 'c_ini', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    ` : `
                    <td style="padding: 12px; width: 165px; min-width: 165px; max-width: 165px;" title="Quantidade">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">QTD</span>
                            <input type="number" min="0" value="${qtdVal}" style="${inputStyle}" placeholder="QTD"
                                onchange="impQueueUpdateField('${item.id}', '${osId}', 'qtd', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Num. Inicial">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">NI</span>
                            <input type="number" value="${niVal}" style="${inputStyle}" placeholder="NI"
                                onchange="impQueueUpdateField('${item.id}', '${osId}', 'num_inicial', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Num. Final">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">NF</span>
                            <input type="number" value="${nfCalculado}" style="${inputStyle}; opacity: 0.85;" placeholder="NF"
                                readonly
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    `}
                    <td style="padding: 12px; width: 250px; min-width: 250px; max-width: 250px;" title="Cor">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">COR</span>
                            <select style="${corSelectStyle}" onchange="impQueueUpdateCor('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()">
                                <option value="">— Cor —</option>
                                ${coresOptions}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px; width: 260px; min-width: 260px; max-width: 260px;" title="Numeração">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Núm.</span>
                            <select style="${selectStyle}" onchange="impQueueUpdateNum('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()">
                                <option value="">— Numeração —</option>
                                ${numsOptions}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px; width: 165px; min-width: 165px; max-width: 165px;" title="Frente e Verso/Tipo de Verso">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Verso</span>
                            <select style="${selectStyle}" onchange="impQueueUpdateField('${item.id}', '${osId}', 'verso_tipo', this.value)" onclick="event.stopPropagation()">
                                <option value="Frente" ${item.verso_tipo === 'Frente' || item.verso_tipo === 'SÓ FRENTE' || item.verso_tipo === 'SO FRENTE' || !item.verso_tipo ? 'selected' : ''}>Frente</option>
                                <option value="FxVerso" ${item.verso_tipo === 'FxVerso' || item.verso_tipo === 'VERSO COMUM' || item.verso_tipo === 'VERSO VARIÁVEL' || item.verso_tipo === 'VERSO VARIAVEL' ? 'selected' : ''}>FxVerso</option>
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px 12px 12px 100px; white-space:nowrap; display:flex; gap:6px; align-items:center;">
                        <button style="${btnStyle} background: linear-gradient(135deg, #a78bfa, #7c3aed); color:#fff;" title="Gerar PDF para este modelo"
                            onclick="event.stopPropagation(); impQueueGerarPDF('${jsItemId}', '${jsOsId}')">
                            📄 PDF
                        </button>
                        <button style="${btnStyle} background: linear-gradient(135deg, #34d399, #059669); color:#fff; ${rawStatus.includes('IMPRESSO') ? 'display:none;' : ''}" title="Imprimir este modelo"
                            onclick="event.stopPropagation(); impQueueImprimir('${jsItemId}', '${jsOsId}')">
                            🖨️ Imp.
                        </button>
                    </td>
                    <td style="padding: 12px; width: 270px; min-width: 270px; max-width: 270px;" title="Status de Produção">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Status</span>
                            <select style="${selectStyle}" onchange="impQueueUpdateField('${item.id}', '${osId}', 'status_impressao', this.value)" onclick="event.stopPropagation()">
                                <option value="Aguardando" ${normalizarStatusImpressao(item.status_impressao) === 'Aguardando' ? 'selected' : ''}>Aguardando</option>
                                <option value="Parcial" ${normalizarStatusImpressao(item.status_impressao) === 'Parcial' ? 'selected' : ''}>Parcial</option>
                                <option value="Impresso" ${normalizarStatusImpressao(item.status_impressao) === 'Impresso' ? 'selected' : ''}>Impresso</option>
                                <option value="Revisão" ${normalizarStatusImpressao(item.status_impressao) === 'Revisão' ? 'selected' : ''}>Revisão</option>
                            </select>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    wrapper.innerHTML = html;
}


























// -----------------------------------------------------------------------
// Funções auxiliares da fila de itens interativa (imp-os-queue)
// -----------------------------------------------------------------------

/** Atualiza a cor do item na fila e dispara enviarParaImposicao com a nova cor */
function impQueueUpdateCor(itemId, osId, corId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const cor = (state.cores || []).find(c => String(c.id) === String(corId));
    if (cor) {
        item.cor = cor.name;
        item.padrao = cor.name;
        item.amostra_cor_id = cor.id;
        // Se tiver formato_id na cor, aplicar ao select de formato
        if (cor.formato_id) {
            const fmtSelect = document.getElementById('imp-formato');
            if (fmtSelect) {
                fmtSelect.value = cor.formato_id;
                fmtSelect.dispatchEvent(new Event('change'));
            }
        }
        autoSaveOSItemField(itemId, osId, 'amostra_cor_id', cor.id);
    }
    enviarParaImposicao(itemId, osId);
}

/** Atualiza a numeração do item na fila */
function impQueueUpdateNum(itemId, osId, numId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const num = (state.numeracoes || []).find(n => String(n.id) === String(numId));
    if (num) {
        item.numeracao = num.name || num.tipo;
        item.numeracao_id = num.id;
        autoSaveOSItemField(itemId, osId, 'amostra_num_id', num.id);

        // Atualizar modo de verso baseado na numeração
        const isDuplex = typeof isNumeracaoDuplex === 'function' ? isNumeracaoDuplex(num) : false;
        // Se a numeração é FxVerso, mudamos para FxVerso
        // Se for Frente, mudamos para Frente
        let novoVersoTipo = isDuplex ? 'FxVerso' : 'Frente';
        
        item.verso_tipo = novoVersoTipo;
        item.verso = isDuplex;
        autoSaveOSItemField(itemId, osId, 'verso_tipo', novoVersoTipo);

        // Recalcular num_final
        let ticket_qtd = 1;
        if (num.tipo === 'TICKET') {
            ticket_qtd = parseInt(num.ticket_qtd) || 1;
        }
        const ni = parseInt(item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || 1)) || 1;
        const qtd = parseInt(item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0)) || 0;
        const nf = qtd > 0 ? (ni + (qtd * ticket_qtd) - 1) : '';

        item.num_final = nf;
        item.numeracao_fim = nf;
        autoSaveOSItemField(itemId, osId, 'numeracao_fim', nf);

        // Atualizar input de NF no DOM
        const row = document.getElementById(`imp-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
            const versoSelect = row.querySelector('td[title="Frente e Verso/Tipo de Verso"] select');
            if (versoSelect) {
                versoSelect.value = novoVersoTipo;
            }
        }

        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('imp-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }

        // Aplicar ao select de numeração na Imposição
        const numSelect = document.getElementById('imp-numeracao');
        if (numSelect) {
            numSelect.value = numId;
            numSelect.dispatchEvent(new Event('change'));
        }
    }
}

/** Atualiza um campo genérico (NI, NF, QTD ou Numeração) do item */
function impQueueUpdateField(itemId, osId, field, value) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    item[field] = value;

    // Recalcular num_final se qtd ou num_inicial mudar
    if (field === 'qtd' || field === 'num_inicial') {
        let ticket_qtd = 1;
        const numId = item.numeracao_id || item.amostra_num_id;
        if (numId) {
            const selectedNum = (state.numeracoes || []).find(n => String(n.id) === String(numId));
            if (selectedNum && selectedNum.tipo === 'TICKET') {
                ticket_qtd = parseInt(selectedNum.ticket_qtd) || 1;
            }
        }
        
        // Obter valores atualizados do item
        const ni = parseInt(item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || 1)) || 1;
        const qtd = parseInt(item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0)) || 0;
        const nf = qtd > 0 ? (ni + (qtd * ticket_qtd) - 1) : '';
        
        // Atualizar no estado local
        item.num_final = nf;
        item.numeracao_fim = nf;
        
        // Salvar no Supabase
        autoSaveOSItemField(itemId, osId, 'numeracao_fim', nf);
        
        // Atualizar input de NF no DOM
        const row = document.getElementById(`imp-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
        }
        
        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('imp-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }
    }

    // Espelhar nos campos da Imposição se for o item ativo
    if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
        if (field === 'num_inicial') {
            const el = document.getElementById('imp-start');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'num_final') {
            const el = document.getElementById('imp-end');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'verso_tipo') {
            const printMode = document.getElementById('imp-print-mode');
            if (printMode) {
                const wantsDuplex = (value !== 'Frente');
                printMode.value = wantsDuplex ? 'duplex' : 'front';
                printMode.dispatchEvent(new Event('change'));
            }
        }
        updateImpSummary();
        if (typeof drawPreview === 'function') drawPreview();
    }

    // Mapear campo local → coluna no banco (pedidos_modelos)
    const dbFieldMap = {
        'num_inicial': 'numeracao_inicio',
        'num_final':   'numeracao_fim',
        'qtd':         'quantidade',
        'numeracao':   'gabarito_operacional',
        'c_ini':       'C_INI',
        'q_cam':       'Q_CAM',
        'l_cam':       'L_CAM'
    };
    const dbField = dbFieldMap[field] || field;
    const dbValue = (field === 'num_inicial' || field === 'num_final' || field === 'qtd')
        ? (parseInt(value) || 0)
        : value;
    autoSaveOSItemField(itemId, osId, dbField, dbValue);

    if (field === 'status_impressao') {
        item.impressao = value;
        // Atualizar também no state.modelosGlobais
        const numOs = parseInt(osId.toString().replace('vibe_', ''));
        if (state.modelosGlobais && state.modelosGlobais[numOs]) {
            const mod = state.modelosGlobais[numOs].find(m => String(m.id) === String(itemId));
            if (mod) {
                mod.impressao = value;
                mod.status_impressao = value;
            }
        }
        renderImpOSQueue();
    }
}

/** Gerar PDF para o item específico */
async function impQueueGerarPDF(itemId, osId) {
    // Carregar o item na imposição primeiro
    await enviarParaImposicao(itemId, osId);
    // Definir status como IMPRESSO
    impQueueUpdateField(itemId, osId, 'status_impressao', 'IMPRESSO');
    // Aguardar renderização e então acionar o botão de gerar PDF
    setTimeout(() => {
        const btnGerar = document.getElementById('btn-gerar-pdf') || document.querySelector('[onclick*="gerarPDF"]') || document.querySelector('[onclick*="generatePDF"]');
        if (btnGerar) {
            btnGerar.click();
        } else if (typeof gerarPDF === 'function') {
            gerarPDF();
        } else if (typeof generatePDF === 'function') {
            generatePDF();
        } else {
            toast('Use o botão "Gerar PDF" no painel de Imposição.', 'info');
        }
    }, 1200);
}

/** Imprimir o item específico */
async function impQueueImprimir(itemId, osId) {
    await enviarParaImposicao(itemId, osId);
    // Definir status como IMPRESSO
    impQueueUpdateField(itemId, osId, 'status_impressao', 'IMPRESSO');
    setTimeout(() => {
        const btnImprimir = document.getElementById('btn-imprimir') || document.querySelector('[onclick*="imprimir"]') || document.querySelector('[onclick*="print"]');
        if (btnImprimir) {
            btnImprimir.click();
        } else if (typeof imprimirDireto === 'function') {
            imprimirDireto();
        } else {
            window.print();
        }
    }, 1200);
}

/**
 * Toggle (expandir/colapsar) o corpo da fila de itens OS
 */
function toggleImpOSQueue() {
    const body = document.getElementById('imp-os-queue-body');
    const arrow = document.getElementById('imp-os-queue-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
}

// Controla abertura e fechamento do Drawer Menu (menu lateral deslizante)
window.toggleDrawer = function(show) {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('drawer-backdrop');
    if (!sidebar || !backdrop) return;
    
    const shouldShow = show !== undefined ? !!show : !sidebar.classList.contains('active');
    
    if (shouldShow) {
        sidebar.classList.add('active');
        backdrop.classList.add('active');
    } else {
        sidebar.classList.remove('active');
        backdrop.classList.remove('active');
    }
};

// Função global de navegação entre views
window.showView = function(viewId) {
    // Fechar o Drawer Menu ao mudar de tela
    if (typeof window.toggleDrawer === 'function') {
        window.toggleDrawer(false);
    }

    // Salvar no localStorage para persistir após F5
    localStorage.setItem('activeView', viewId);

    // Trocar a view ativa
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    // Ativar a view destino
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');
    
    // Se estiver voltando para a aba de Imposição, garante que o canvas volte para lá
    if (viewId === 'view-imposicao') {
        const origin = document.getElementById('imposicao-preview-card-origin');
        const canvasContainer = document.querySelector('.preview-canvas-container');
        if (origin && canvasContainer && !origin.contains(canvasContainer)) {
            origin.appendChild(canvasContainer);
        }
    }

    // Ativar o nav-btn correspondente
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Hooks: carregar dados ao abrir certas views
    if (viewId === 'view-lista-arte') {
        state.todasArtes = null;
        state.modelosGlobais = null;
        if (!state.filtroFilaTipo) state.filtroFilaTipo = 'fila';
        loadOrdens();
    }
 else if (viewId === 'view-lista-impressao') {
        loadOrdens();
    }

    if (viewId === 'view-imposicao') {
        renderImpOSQueue();
        const impPreview = document.getElementById('imp-preview-card-container');
        if (impPreview) impPreview.style.display = 'block';
    }
    if (viewId === 'view-fontes') {
        loadCatalogoFontes().then(() => renderCatFontesUI());
    }
    if (viewId === 'view-pedido') {
        if (state.activeOSItem) {
            const { osId, itemId } = state.activeOSItem;
            const os = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId) : null);
            let nomeEvento = '';
            if (state.todasArtes) {
                const arteObj = state.todasArtes.find(a => String(a.id_int) === String(osId).replace('vibe_', ''));
                if (arteObj) nomeEvento = arteObj.nome_evento || '';
            }
            const pedViewTitle = document.getElementById('ped-view-title');
            const pedViewSubtitle = document.getElementById('ped-view-subtitle');
            if (pedViewTitle) {
                const orderNum = os ? (os.numero || '') : '';
                const displayTitle = nomeEvento ? `${orderNum} - ${nomeEvento}` : `${orderNum}`;
                pedViewTitle.textContent = displayTitle;
                pedViewTitle.style.fontSize = 'calc(2.2rem + 5pt)';
                pedViewTitle.style.fontWeight = 'bold';
            }
            if (pedViewSubtitle) {
                pedViewSubtitle.style.display = 'none';
            }
            const pedPreview = document.getElementById('ped-preview-card-container');
            if (pedPreview) pedPreview.style.display = 'block';

            if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
            if (typeof drawPedPreview === 'function') drawPedPreview();
        }
    }
};

/**
 * Helper resiliente para encontrar uma OS no state.ordens por id, id_int ou numero
 */
function findOSInState(osId) {
    if (!state.ordens || !state.ordens.length) return null;
    if (!osId && osId !== 0) return null;
    const osIdStr = String(osId).trim();
    return state.ordens.find(o => 
        o.id === osId || 
        String(o.id) === osIdStr || 
        String(o.id_int) === osIdStr || 
        String(o.numero) === osIdStr
    ) || null;
}
window.findOSInState = findOSInState;

/**
 * Helper resiliente para obter os itens de uma OS do state.osItens por qualquer variação da chave de ID
 */
function getOSItens(osId) {
    if (!osId && osId !== 0) return [];
    if (state.osItens[osId] && state.osItens[osId].length > 0) return state.osItens[osId];

    const os = typeof findOSInState === 'function' ? findOSInState(osId) : null;
    if (os) {
        if (state.osItens[os.id] && state.osItens[os.id].length > 0) return state.osItens[os.id];
        if (os.numero && state.osItens[os.numero] && state.osItens[os.numero].length > 0) return state.osItens[os.numero];
        if (os.id_int && state.osItens[os.id_int] && state.osItens[os.id_int].length > 0) return state.osItens[os.id_int];
        if (state.osItens[`vibe_${os.numero}`] && state.osItens[`vibe_${os.numero}`].length > 0) return state.osItens[`vibe_${os.numero}`];
        if (state.osItens[`vibe_${os.id_int}`] && state.osItens[`vibe_${os.id_int}`].length > 0) return state.osItens[`vibe_${os.id_int}`];
    }
    const cleanId = String(osId).replace('vibe_', '');
    for (const k of Object.keys(state.osItens || {})) {
        if (k.replace('vibe_', '') === cleanId && state.osItens[k] && state.osItens[k].length > 0) {
            return state.osItens[k];
        }
    }
    return [];
}
window.getOSItens = getOSItens;

/**
 * Navega da Lista de Arte para a página de Amostras carregando os itens do pedido
 */
async function navigateToAmostrasFromOS(osId) {
    try {
        console.log('[Nav] navigateToAmostrasFromOS chamado com osId:', osId);

        let os = findOSInState(osId);
        console.log('[Nav] OS encontrada no state:', os ? `#${os.numero} id=${os.id}` : 'NÃO ENCONTRADA');

        if (!os) {
            toast('Carregando pedido...', 'info');
            try {
                await loadOrdens();
                os = findOSInState(osId);
                console.log('[Nav] OS após reload:', os ? `#${os.numero}` : 'ainda não encontrada');
            } catch (e) {
                console.warn('[Nav] Erro ao recarregar ordens:', e);
            }
        }

        if (!os) {
            toast('Pedido não encontrado (ID: ' + osId + ')', 'error');
            return;
        }

        const realOSId = os.id || osId;
        console.log('[Nav] Usando realOSId:', realOSId, '| numero:', os.numero);

        // Garantir que os itens estejam carregados com todos os dados
        const needsFullLoad = !state.osItens[realOSId] || state.osItens[realOSId].length === 0 || state.osItens[realOSId].some(i => i._dbLoaded !== true);
        if (needsFullLoad) {
            console.log('[Nav] Carregando itens da OS...');
            try {
                await loadOSItens(realOSId);
            } catch (e) {
                console.warn('[Nav] Erro ao carregar itens:', e);
            }
        }
        console.log('[Nav] Itens carregados:', (state.osItens[realOSId] || []).length);

        // Garantir que cores e numerações estejam carregados
        if (!state.cores || state.cores.length === 0 || !state.numeracoes || state.numeracoes.length === 0) {
            try {
                await loadAll();
            } catch (e) {
                console.warn('[Nav] Erro ao carregar dados de cadastro:', e);
            }
        }

        // Salvar o ID do pedido ativo na tela de Amostras
        state.amostrasOSAtivo = realOSId;

        // Navegar para a view de Amostras
        console.log('[Nav] Navegando para view-amostras...');
        if (typeof window.showView === 'function') {
            window.showView('view-amostras');
        } else if (typeof showView === 'function') {
            showView('view-amostras');
        } else {
            // fallback manual
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            const view = document.getElementById('view-amostras');
            if (view) view.classList.add('active');
            localStorage.setItem('activeView', 'view-amostras');
        }

        console.log('[Nav] Renderizando itens da OS...');
        // Renderizar os cards de itens com pequeno delay para garantir que o DOM está ativo
        setTimeout(() => {
            try {
                renderAmostrasOSItens(realOSId);
                console.log('[Nav] renderAmostrasOSItens concluído.');
            } catch (e) {
                console.error('[Nav] Erro em renderAmostrasOSItens:', e);
                toast('Erro ao renderizar itens: ' + e.message, 'error');
            }
        }, 50);

    } catch (e) {
        console.error('[Nav] Erro fatal em navigateToAmostrasFromOS:', e);
        toast('Erro ao abrir pedido: ' + (e.message || e), 'error');
    }
}

/**
 * Aprova os dados de entrega e faturamento pelo cliente no Link Público
 */
async function clienteAprovarEntregaDados(osId, osNum) {
    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    try {
        toast('Confirmando aprovação dos dados de entrega e faturamento...', 'info');

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            await supabaseClient
                .from('pedidos_artes')
                .update({ entrega_dados: 'APROVADO' })
                .eq('id_int', numInt);
        }

        const arteGlobal = state.todasArtes?.find(a => a.id_int === numInt);
        if (arteGlobal) arteGlobal.entrega_dados = 'APROVADO';

        toast('✅ Dados de Entrega e Faturamento Aprovados com Sucesso!', 'success');

        if (typeof renderOrdens === 'function') renderOrdens();
        renderAmostrasOSItens(osId);
    } catch (e) {
        console.error('Erro ao aprovar entrega_dados pelo cliente:', e);
        toast('Erro ao aprovar dados: ' + e.message, 'error');
    }
}

/**
 * Solicita correção nos dados de entrega e faturamento pelo cliente no Link Público
 */
async function clienteSolicitarCorrecaoEntregaDados(osId, osNum) {
    const box = document.getElementById(`box-obs-entrega-cliente-${osId}`);
    const txt = document.getElementById(`txt-obs-entrega-cliente-${osId}`);

    if (box && box.style.display === 'none') {
        box.style.display = 'block';
        if (txt) txt.focus();
        return;
    }

    const obsText = txt ? txt.value.trim() : '';

    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    try {
        toast('Enviando solicitação de correção de entrega e faturamento...', 'info');

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            // Se houver observações, append no campo de observações de pedidos_artes
            const { data: existing } = await supabaseClient
                .from('pedidos_artes')
                .select('observacoes')
                .eq('id_int', numInt)
                .maybeSingle();

            let obsObj = (existing && existing.observacoes) ? existing.observacoes : {};
            if (typeof obsObj === 'string') {
                try { obsObj = JSON.parse(obsObj); } catch(e) {}
            }
            if (typeof obsObj !== 'object' || !obsObj) obsObj = {};

            if (obsText) {
                const obsMsg = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}: ${obsText}`;
                obsObj['correcao_entrega_faturamento'] = obsMsg;

                try {
                    await supabaseClient.from('propostas_chat').insert({
                        id_int: numInt,
                        tipo: 'PRODUCAO',
                        setor: 'Cliente',
                        visivel_externo: true,
                        mensagem: `⚠️ SOLICITAÇÃO DE ALTERAÇÃO PELO CLIENTE:\n${obsText}`,
                        remetente_nome: 'Cliente (aprovação online)'
                    });
                } catch (cErr) {}
            }

            await supabaseClient
                .from('pedidos_artes')
                .update({
                    entrega_dados: 'CORRIGIR',
                    observacoes: obsObj
                })
                .eq('id_int', numInt);
        }

        const arteGlobal = state.todasArtes?.find(a => a.id_int === numInt);
        if (arteGlobal) arteGlobal.entrega_dados = 'CORRIGIR';

        toast('❌ Solicitação de correção de entrega/faturamento enviada para a equipe!', 'warning');

        if (typeof renderOrdens === 'function') renderOrdens();
        renderAmostrasOSItens(osId);
    } catch (e) {
        console.error('Erro ao solicitar correção de entrega_dados pelo cliente:', e);
        toast('Erro ao solicitar correção: ' + e.message, 'error');
    }
}

/**
 * Conclui a correção de entrega/faturamento internamente e define status como APROVADO
 */
async function marcarEntregaDadosCorrigido(osId, osNum) {
    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    try {
        toast('Atualizando status de entrega e faturamento para APROVADO...', 'info');

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            await supabaseClient
                .from('pedidos_artes')
                .update({ entrega_dados: 'APROVADO' })
                .eq('id_int', numInt);
        }

        const arteGlobal = state.todasArtes?.find(a => a.id_int === numInt);
        if (arteGlobal) arteGlobal.entrega_dados = 'APROVADO';

        toast('✅ Correção dos dados concluída! Status de entrega atualizado para APROVADO.', 'success');

        if (typeof renderOrdens === 'function') renderOrdens();
        renderAmostrasOSItens(osId);
    } catch (e) {
        console.error('Erro ao marcar entrega_dados como corrigido:', e);
        toast('Erro ao concluir correção: ' + e.message, 'error');
    }
}

/**
 * Carrega e exibe os dados atuais de entrega, faturamento e solicitação do cliente no box de alerta interno
 */
async function loadDadosEntregaInterno(osId, osNum) {
    const container = document.getElementById(`detalhes-entrega-faturamento-${osId}`);
    const obsContainer = document.getElementById(`solicitacao-cliente-texto-${osId}`);
    const numInt = parseInt(String(osNum || osId).replace(/\D/g, ''));
    if (isNaN(numInt) || typeof supabaseClient === 'undefined' || !supabaseClient) return;

    try {
        // 1. Buscar dados da proposta, clientes e enderecos
        const { data: propData } = await supabaseClient
            .from('propostas')
            .select('id_faturado, id_cliente, id_endereco_ent')
            .eq('id_int', numInt)
            .limit(1);

        let cli = null;
        let end = null;

        if (propData && propData.length > 0) {
            const prop = propData[0];
            const idCli = prop.id_faturado || prop.id_cliente;
            const idEnd = prop.id_endereco_ent;

            if (idCli) {
                const { data: cliData } = await supabaseClient.from('clientes').select('*').eq('id_cliente', idCli).limit(1);
                if (cliData && cliData.length > 0) cli = cliData[0];
            }
            if (idEnd) {
                const { data: endData } = await supabaseClient.from('enderecos').select('*').eq('id', idEnd).limit(1);
                if (endData && endData.length > 0) end = endData[0];
            }
        }

        // 2. Buscar observações / solicitação de alteração do cliente em pedidos_artes
        const { data: paData } = await supabaseClient
            .from('pedidos_artes')
            .select('observacoes, entrega_dados')
            .eq('id_int', numInt)
            .maybeSingle();

        let correcaoTexto = '';
        if (paData && paData.observacoes) {
            let obs = paData.observacoes;
            if (typeof obs === 'string') {
                try { obs = JSON.parse(obs); } catch(e) {}
            }
            if (typeof obs === 'object' && obs) {
                correcaoTexto = obs.correcao_entrega_faturamento || obs.correcao_endereco || obs.correcao_nf || obs.correcao_cliente || '';
                if (correcaoTexto && typeof correcaoTexto === 'string' && (correcaoTexto.includes('Engine') || correcaoTexto.includes('Motivo Técnico'))) {
                    correcaoTexto = '';
                }
            }
        }

        // Se ainda não achou o texto em pedidos_artes, buscar mensagens enviadas EXCLUSIVAMENTE pelo cliente em propostas_chat
        if (!correcaoTexto) {
            try {
                const { data: chatData } = await supabaseClient
                    .from('propostas_chat')
                    .select('*')
                    .eq('id_int', numInt)
                    .order('id', { ascending: false })
                    .limit(10);

                if (chatData && chatData.length > 0) {
                    const msgCliente = chatData.find(c => {
                        const rNome = String(c.remetente_nome || c.setor || c.tipo || '').toLowerCase();
                        const m = c.mensagem || '';
                        const isEngineLog = m.toLowerCase().includes('engine') || m.toLowerCase().includes('motivo técnico') || m.toLowerCase().includes('status alterado pela');
                        return !isEngineLog && (rNome.includes('cliente') || m.includes('REPORTOU') || m.includes('SOLICITAÇÃO') || m.includes('Novo Endereço') || m.includes('Dados Faturamento') || m.includes('ALTERAÇÃO') || m.length > 5);
                    });
                    if (msgCliente && msgCliente.mensagem) {
                        correcaoTexto = msgCliente.mensagem;
                    }
                }
            } catch (chatErr) {
                console.warn('[loadDadosEntregaInterno] Erro ao buscar propostas_chat:', chatErr);
            }
        }




        // 3. Renderizar Dados de Faturamento e Entrega
        if (container) {
            let cliHtml = cli ? `
                <div style="font-size: 0.86rem; line-height: 1.5; color: var(--text);">
                    <strong>Razão Social/Nome:</strong> ${cli.nome || cli.fantasia || '--'}<br>
                    <strong>CPF/CNPJ:</strong> ${cli.documento || '--'}<br>
                    ${cli.ins_estadual ? `<strong>I.E.:</strong> ${cli.ins_estadual}<br>` : ''}
                    <strong>E-mail:</strong> ${cli.email_financeiro || cli.email_contato || cli.email || '--'}<br>
                    <strong>Telefone:</strong> ${cli.whatsapp_1 || cli.telefone_fixo || '--'}
                </div>
            ` : '<div style="font-size: 0.85rem; color: var(--text-dim); font-style: italic;">Dados de faturamento não cadastrados.</div>';

            let endHtml = end ? `
                <div style="font-size: 0.86rem; line-height: 1.5; color: var(--text);">
                    ${end.recebedor ? `<strong>Recebedor:</strong> ${end.recebedor} ${end.cpf_recebedor ? `(CPF: ${end.cpf_recebedor})` : ''}<br>` : ''}
                    <strong>Rua:</strong> ${end.endereco || end.rua || end.logradouro || '--'}, ${end.numero || 'S/N'}<br>
                    ${end.complemento ? `<strong>Compl.:</strong> ${end.complemento}<br>` : ''}
                    <strong>Bairro:</strong> ${end.bairro || '--'}<br>
                    <strong>Cidade/UF:</strong> ${end.cidade || '--'} - ${end.uf || ''}<br>
                    <strong>CEP:</strong> ${end.cep || '--'}
                </div>
            ` : '<div style="font-size: 0.85rem; color: var(--text-dim); font-style: italic;">Endereço de entrega não cadastrado.</div>';

            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; background: rgba(0,0,0,0.03); padding: 14px; border: 1px solid var(--border); border-radius: 8px;">
                    <div>
                        <div style="font-size: 0.78rem; color: var(--blue); text-transform: uppercase; font-weight: 800; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-file-invoice"></i> Dados de Faturamento Atuais:
                        </div>
                        ${cliHtml}
                    </div>
                    <div>
                        <div style="font-size: 0.78rem; color: var(--teal); text-transform: uppercase; font-weight: 800; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-truck-fast"></i> Endereço de Entrega Atual:
                        </div>
                        ${endHtml}
                    </div>
                </div>
            `;
        }

        // 4. Renderizar Texto da Solicitação do Cliente
        if (obsContainer && correcaoTexto) {
            obsContainer.innerHTML = `
                <div style="margin-top: 10px;">
                    <div style="font-size: 0.85rem; font-weight: 800; color: #ef4444; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-comment-dots"></i> Solicitação de Alteração enviada pelo Cliente:
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(239,68,68,0.4); border-radius: 8px; padding: 12px 14px; color: #fca5a5; font-size: 0.92rem; font-family: monospace; white-space: pre-wrap; line-height: 1.5;">${correcaoTexto}</div>
                </div>
            `;
        } else if (obsContainer && !correcaoTexto) {
            obsContainer.innerHTML = `
                <div style="margin-top: 10px;">
                    <div style="font-size: 0.85rem; font-weight: 800; color: #f97316; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-comment-dots"></i> Solicitação de Alteração pelo Cliente:
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 12px; color: var(--text-dim); font-size: 0.85rem; font-style: italic;">
                        O cliente solicitou revisão nos dados de entrega e faturamento.
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('Erro ao carregar detalhes de entrega interno:', e);
    }
}

/**
 * Alterna a visibilidade do box de entrega e faturamento no painel interno do pedido
 */
function toggleBoxEntregaDados(osId) {
    const activeOs = osId || state.amostrasOSAtivo;
    if (!activeOs) return;
    const box = document.getElementById(`box-correcao-entrega-interno-${activeOs}`);
    if (box) {
        if (box.style.display === 'none' || !box.style.display) {
            box.style.display = 'block';
            box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            box.style.display = 'none';
        }
    }
}

window.toggleBoxEntregaDados = toggleBoxEntregaDados;
window.marcarEntregaDadosCorrigido = marcarEntregaDadosCorrigido;
window.clienteAprovarEntregaDados = clienteAprovarEntregaDados;
window.clienteSolicitarCorrecaoEntregaDados = clienteSolicitarCorrecaoEntregaDados;




/**
 * Renderiza os cards de itens do pedido na página de Amostras
 * Cada item gera um card com: Produto, Setor, Quantidade, NI→NF, Verso, Cor, Numeração + Decisão
 */
function renderAmostrasOSItens(osId) {
    const os = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId || String(o.id) === String(osId) || String(o.numero) === String(osId)) : null);
    const targetOSId = os ? os.id : osId;
    const osNum = os ? (os.numero || os.id_int || os.id) : osId;
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const idCliente = os ? os.id_cliente : null;

    const banner = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-banner' : 'cliente-os-banner');
    const avulsa = document.getElementById('amostra-combinada-avulsa');

    if (!os || !container) return;

    if (state.osItens[targetOSId]) {
        state.osItens[targetOSId].sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
    }
    const itens = state.osItens[targetOSId] || state.osItens[osId] || [];

    if (typeof pdfViewerState !== 'undefined') {
        Object.keys(pdfViewerState).forEach(k => {
            if (k.startsWith(`${targetOSId}_`) || k.startsWith(`${osId}_`)) delete pdfViewerState[k];
        });
    }

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

        // Usa a globalFuzzyMatch (declarada acima) para os matches flexíveis

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
                        const nameMatch = (p.nomeReal || '').toLowerCase().trim() === cleanProdName || globalFuzzyMatch(p.nomeReal, prodName);
                        if (nameMatch) return true;
                        const apelidos = (p.apelidos || '').split(',').map(a => a.trim().toLowerCase());
                        return apelidos.includes(cleanProdName) || apelidos.some(a => globalFuzzyMatch(a, prodName));
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
        if (itemFormatoId) {
            const formatObj = (state.formatos || []).find(f => String(f.id) === String(itemFormatoId) || String(f.id_formato_num) === String(itemFormatoId));
            if (formatObj) {
                itemFormatoId = formatObj.id;
            }
        }


        // Filtrar cores com base no formato do produto
        const filteredCores = itemFormatoId
            ? (state.cores || []).filter(c => !c.formato_id || String(c.formato_id) === String(itemFormatoId))
            : (state.cores || []);

        // Tentar descobrir a cor selecionada (pelo banco, ou pelo padrao escrito)
        let resolvedCorId = item.amostra_cor_id;
        if (!resolvedCorId && item.padrao) {
            const matchedCor = filteredCores.find(c => globalFuzzyMatch(c.name, item.padrao));
            if (matchedCor) resolvedCorId = matchedCor.id;
        }

        const corsOpts = filteredCores.map(c =>
            `<option value="${c.id}" ${String(c.id) === String(resolvedCorId) ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        // Determinar o formato ID da cor selecionada
        const selectedCor = resolvedCorId ? (state.cores || []).find(c => String(c.id) === String(resolvedCorId)) : null;
        const corFormatoId = selectedCor ? selectedCor.formato_id : null;

        // Tentar descobrir a numeracao selecionada
        let resolvedNumId = item.amostra_num_id;
        if (!resolvedNumId && item.gabarito_operacional) {
            const matchedNum = (state.numeracoes || []).find(n => globalFuzzyMatch(n.name, item.gabarito_operacional));
            if (matchedNum) resolvedNumId = matchedNum.id;
        }


        // Filtrar numerações com base no formato da cor selecionada
        const filteredNumeracoes = (state.numeracoes || []).filter(n => {
            // Se for a numeração salva neste item, sempre exibe
            if (String(n.id) === String(resolvedNumId)) return true;

            // Se for customizada
            if (n.is_custom) {
                if (n.Cli_Num) {
                    // Se for vinculada a um cliente, só exibe se for o cliente desta OS
                    if (String(n.Cli_Num) !== String(idCliente)) return false;
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
        <div class="card" style="border: 1px solid #918f8c; margin-bottom: 3pt;">
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
                            <div style="display: flex; flex-direction: column; gap: 14px;">
                                <div class="form-group" id="amostra-item-config-cor-${idx}" style="margin-bottom: 0; display: ${item.modo_pdf ? 'none' : 'block'};">
                                    <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em;">Cor Cadastrada</label>
                                    <select class="form-control" id="amostra-item-cor-${idx}" onchange="onItemCorSelect(${idx}, '${osId}', '${item.id}')">
                                        <option value="">-- Selecione uma Cor --</option>
                                        ${corsOpts}
                                    </select>
                                </div>
                                <div class="form-group" id="amostra-item-config-num-${idx}" style="margin-bottom: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                        <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em; margin: 0;">Numeração Cadastrada</label>
                                        ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? '' : `
                                            <div style="display: flex; gap: 4px; align-items: center;">
                                                <button class="btn btn-sm btn-ghost" style="padding: 0 4px; font-size: 0.9rem;" onclick="window.showClienteNumeracoesModal('amostra-item-num-${idx}', ${idCliente})" title="Selecionar numeração existente deste cliente">📋</button>
                                                <button class="btn btn-sm btn-ghost" style="padding: 0 4px; font-size: 0.9rem;" onclick="editCustomNumeracao(${idx}, '${osId}', '${item.id}')" title="Editar Numeração exclusivamente para este Modelo">✏️</button>
                                            </div>
                                        `}
                                    </div>
                                    <select class="form-control" id="amostra-item-num-${idx}" onchange="onItemNumSelect(${idx}, '${osId}', '${item.id}')">
                                        <option value="">-- Selecione uma Numeração --</option>
                                        ${numOpts}
                                    </select>
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em;">Arte de Amostra (PDF, JPG, PNG)</label>
                                ${item.verso ? `
                                <div style="display:flex; flex-direction: column; gap:10px; margin-top: 4px;">
                                    <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap;">
                                        <span class="badge badge-blue" style="font-size: 0.7rem; font-weight: 700; width: 60px; text-align: center;">FRENTE</span>
                                        <button class="btn btn-sm" onclick="abrirCriadorDeArte(${idx}, '${osId}', 'frente')" style="font-weight:700; background: linear-gradient(135deg, #a855f7, #6366f1); border: none; color: #fff;" title="Abrir Criador de Arte 2D para este modelo">🎨 Criar Arte</button>
                                        <label class="btn btn-sm btn-secondary" for="amostra-item-arte-${idx}" style="margin: 0; cursor: pointer;">
                                            🖼️ Upload Arte
                                        </label>
                                        <input type="file" id="amostra-item-arte-${idx}" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
                                            onchange="onItemArteUpload(${idx}, '${osId}', '${item.id}', 'frente')">
                                        <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-amostra-arte-${idx}" style="${item.arte_url || item.amostra_arte_base64 ? '' : 'display:none;'}" onclick="onItemArteRemove(${idx}, '${osId}', '${item.id}', 'frente')">✕ Remover</button>
                                        <button class="btn btn-sm btn-secondary" id="btn-copy-amostra-arte-${idx}" style="${item.arte_url || item.amostra_arte_base64 ? '' : 'display:none;'}" onclick="copiarArte('${item.arte_url || ''}', 'frente')" title="Copiar Link da Arte"><i class="fa-regular fa-copy"></i> Copiar</button>
                                        <button class="btn btn-sm btn-secondary" onclick="colarArte(${idx}, '${osId}', '${item.id}', 'frente')" title="Colar Link da Arte"><i class="fa-regular fa-paste"></i> Colar</button>
                                        <button class="btn btn-sm ${item.modo_pdf ? 'btn-pdf-active' : 'btn-secondary'}" id="btn-modo-pdf-${idx}" onclick="toggleModoPdf(${idx}, '${osId}', '${item.id}')" title="Modo PDF Multi-Página">📄 PDF</button>
                                        <span id="amostra-item-arte-name-${idx}" style="font-size:0.82rem; color:var(--text-dim)">${item.arte_url || item.amostra_arte_base64 ? '(Salva)' : ''}</span>
                                    </div>
                                    <div style="display:${item.modo_pdf ? 'none' : 'flex'}; gap:10px; align-items: center; flex-wrap: wrap;">
                                        <span class="badge badge-amber" style="font-size: 0.7rem; font-weight: 700; width: 60px; text-align: center;">VERSO</span>
                                        <button class="btn btn-sm" onclick="abrirCriadorDeArte(${idx}, '${osId}', 'verso')" style="font-weight:700; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; color: #fff;" title="Abrir Criador de Arte 2D para o Verso">🎨 Criar Verso</button>
                                        <label class="btn btn-sm btn-secondary" for="amostra-item-arte-verso-${idx}" style="margin: 0; cursor: pointer;">
                                            🖼️ Upload Verso
                                        </label>
                                        <input type="file" id="amostra-item-arte-verso-${idx}" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
                                            onchange="onItemArteUpload(${idx}, '${osId}', '${item.id}', 'verso')">
                                        <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-amostra-arte-verso-${idx}" style="${item.verso_arte_url || item.verso_amostra_arte_base64 ? '' : 'display:none;'}" onclick="onItemArteRemove(${idx}, '${osId}', '${item.id}', 'verso')">✕ Remover</button>
                                        <button class="btn btn-sm btn-secondary" id="btn-copy-amostra-arte-verso-${idx}" style="${item.verso_arte_url || item.verso_amostra_arte_base64 ? '' : 'display:none;'}" onclick="copiarArte('${item.verso_arte_url || ''}', 'verso')" title="Copiar Link da Arte Verso"><i class="fa-regular fa-copy"></i> Copiar</button>
                                        <button class="btn btn-sm btn-secondary" onclick="colarArte(${idx}, '${osId}', '${item.id}', 'verso')" title="Colar Link da Arte Verso"><i class="fa-regular fa-paste"></i> Colar</button>
                                        <span id="amostra-item-arte-verso-name-${idx}" style="font-size:0.82rem; color:var(--text-dim)">${item.verso_arte_url || item.verso_amostra_arte_base64 ? '(Salva)' : ''}</span>
                                    </div>
                                    <div style="display: flex; justify-content: flex-end;">
                                        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.95rem; color: var(--text-dim); background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; user-select: all;" onclick="navigator.clipboard.writeText('${item.id}').then(() => toast('ID ${item.id} copiado!', 'success'))" title="Copiar ID do Modelo">
                                            <i class="fa-regular fa-copy" style="font-size: 0.7rem;"></i>
                                            <span style="font-weight: 600; font-family: monospace;">ID: ${item.id}</span>
                                        </span>
                                    </div>
                                </div>
                                ` : `
                                <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
                                    <button class="btn btn-sm" onclick="abrirCriadorDeArte(${idx}, '${osId}', 'frente')" style="font-weight:700; background: linear-gradient(135deg, #a855f7, #6366f1); border: none; color: #fff;" title="Abrir Criador de Arte 2D para este modelo">🎨 Criar Arte</button>
                                    <label class="btn btn-sm btn-secondary" for="amostra-item-arte-${idx}" style="margin: 0; cursor: pointer;">
                                        🖼️ Upload Arte
                                    </label>
                                    <input type="file" id="amostra-item-arte-${idx}" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
                                        onchange="onItemArteUpload(${idx}, '${osId}', '${item.id}', 'frente')">
                                    <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-amostra-arte-${idx}" style="${item.arte_url || item.amostra_arte_base64 ? '' : 'display:none;'}" onclick="onItemArteRemove(${idx}, '${osId}', '${item.id}', 'frente')">✕ Remover</button>
                                    <button class="btn btn-sm btn-secondary" id="btn-copy-amostra-arte-${idx}" style="${item.arte_url || item.amostra_arte_base64 ? '' : 'display:none;'}" onclick="copiarArte('${item.arte_url || ''}', 'frente')" title="Copiar Link da Arte"><i class="fa-regular fa-copy"></i> Copiar</button>
                                    <button class="btn btn-sm btn-secondary" onclick="colarArte(${idx}, '${osId}', '${item.id}', 'frente')" title="Colar Link da Arte"><i class="fa-regular fa-paste"></i> Colar</button>
                                    <button class="btn btn-sm ${item.modo_pdf ? 'btn-pdf-active' : 'btn-secondary'}" id="btn-modo-pdf-${idx}" onclick="toggleModoPdf(${idx}, '${osId}', '${item.id}')" title="Modo PDF Multi-Página">📄 PDF</button>
                                    <span id="amostra-item-arte-name-${idx}" style="font-size:0.82rem; color:var(--text-dim)">${item.arte_url || item.amostra_arte_base64 ? '(Arte Salva)' : ''}</span>
                                    <span style="display: inline-flex; align-items: center; gap: 4px; margin-left: auto; font-size: 0.95rem; color: var(--text-dim); background: rgba(255,255,255,0.06); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; user-select: all;" onclick="navigator.clipboard.writeText('${item.id}').then(() => toast('ID ${item.id} copiado!', 'success'))" title="Copiar ID do Modelo">
                                        <i class="fa-regular fa-copy" style="font-size: 0.7rem;"></i>
                                        <span style="font-weight: 600; font-family: monospace;">ID: ${item.id}</span>
                                    </span>
                                </div>
                                `}
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
                                <img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />
                                <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${item.amostra_arte_base64 ? 'none' : 'block'};">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Sem Frente</p>
                                </div>
                            </div>
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--amber); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">VERSO</div>
                                <img id="amostra-item-img-verso-${idx}" src="${item.verso_amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: ${item.verso_amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-verso-${idx}')" />
                                <div id="amostra-item-empty-verso-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${item.verso_amostra_arte_base64 ? 'none' : 'block'};">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Sem Verso</p>
                                </div>
                            </div>
                        </div>
                        ` : `
                        ${item.modo_pdf && item.arte_url ? `
                        <div id="amostra-pdf-viewer-${idx}" style="text-align: center;">
                            <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
                            <div id="amostra-pdf-nav-${idx}" style="display:none; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerPrevPage(${idx})">◀</button>
                                <span id="amostra-pdf-page-info-${idx}" style="font-weight:700; font-size:0.9rem;">Página 1 / 1</span>
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerNextPage(${idx})">▶</button>
                            </div>
                            <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: none;">
                                 <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">📄</div>
                                 <p style="font-size: 0.85rem; font-weight: 600;">PDF Multi-Página</p>
                            </div>
                        </div>
                        ` : `
                        <img id="amostra-item-img-${idx}" src="${item.amostra_arte_base64 || ''}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: ${item.amostra_arte_base64 ? 'block' : 'none'}; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-img-${idx}')" />
                        <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px; display: ${item.amostra_arte_base64 ? 'none' : 'block'};">
                             <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                             <p style="font-size: 0.95rem; font-weight: 600;">Aguardando visualização da Arte...</p>
                        </div>
                        `}
                        `)
                    :
                        (item.verso ? `
                        <div style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--blue); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">FRENTE</div>
                                <canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>
                                <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Sem Frente</p>
                                </div>
                            </div>
                            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; width: 100%;">
                                <div style="font-size: 0.85rem; font-weight: 800; color: var(--amber); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">VERSO</div>
                                <canvas id="amostra-item-canvas-verso-${idx}" style="max-width: 100%; max-height: 450px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-verso-${idx}')"></canvas>
                                <div id="amostra-item-empty-verso-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                                     <div style="font-size: 2.5rem; margin-bottom: 8px; opacity: 0.7;">🎨</div>
                                     <p style="font-size: 0.85rem; font-weight: 600;">Sem Verso</p>
                                </div>
                            </div>
                        </div>
                        ` : `
                        ${item.modo_pdf ? `
                        <div id="amostra-pdf-viewer-${idx}" style="text-align: center;">
                            <canvas id="amostra-pdf-canvas-${idx}" style="max-width: 100%; max-height: 400px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-pdf-canvas-${idx}')"></canvas>
                            <div id="amostra-pdf-nav-${idx}" style="display:none; align-items:center; justify-content:center; gap:12px; margin-top:10px;">
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerPrevPage(${idx})">◀</button>
                                <span id="amostra-pdf-page-info-${idx}" style="font-weight:700; font-size:0.9rem; color:var(--text);">Página 1 / 1</span>
                                <button class="btn btn-sm btn-secondary" onclick="pdfViewerNextPage(${idx})">▶</button>
                            </div>
                            <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                                 <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">📄</div>
                                 <p style="font-size: 0.95rem; font-weight: 600;">Modo PDF Multi-Página</p>
                                 <p style="font-size: 0.82rem; opacity: 0.7; margin-top: 4px;">Faça upload de um PDF e navegue pelas páginas.</p>
                            </div>
                        </div>
                        ` : `
                        <canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; max-height: 250px; object-fit: contain; margin: 0 auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; cursor: zoom-in;" onclick="openClienteLightbox('amostra-item-canvas-${idx}')"></canvas>
                        <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                             <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                             <p style="font-size: 0.95rem; font-weight: 600;">Selecione Cor/Numeração e carregue uma Arte</p>
                             <p style="font-size: 0.82rem; opacity: 0.7; margin-top: 4px;">A visualização combinada aparecerá em tempo real neste espaço.</p>
                        </div>
                        `}
                        `)
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
                            <div style="font-size: 0.95rem; color: var(--text-dim); margin-top: 4px;">
                                Dados preenchidos pelo comercial para guiar a criação da arte.
                            </div>
                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.95rem; color: var(--text-dim); font-weight: 600;"><i class="fa-regular fa-file-lines" style="margin-right: 4px;"></i> Nome do Evento / Tema</label>
                                <input type="text" id="briefing-nome-${osId}" class="form-control" oninput="saveBriefingField('${osNum}', 'nome_evento', this.value)" style="background: rgba(0,0,0,0.02); margin-top: 4px; color: #f59e0b;" placeholder="Nome do Evento">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 0.95rem; color: var(--text-dim); font-weight: 600;"><i class="fa-regular fa-calendar" style="margin-right: 4px;"></i> Data do Evento</label>
                                    <input type="text" id="briefing-data-${osId}" class="form-control" oninput="saveBriefingField('${osNum}', 'data_evento', this.value)" style="background: rgba(0,0,0,0.02); margin-top: 4px; color: #f59e0b;" placeholder="DD/MM/AAAA">
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label style="font-size: 0.95rem; color: var(--text-dim); font-weight: 600;"><i class="fa-solid fa-location-dot" style="margin-right: 4px;"></i> Local da Festa/Evento</label>
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

                    <!-- Anexos do Pedido -->
                    <div class="card" style="border: 1px solid var(--border); box-shadow: var(--shadow);">
                        <div class="card-header" style="background: transparent; border-bottom: 0; padding: 16px 16px 4px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <div style="font-weight: 800; color: var(--text); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                    📎 Anexos do Pedido
                                </div>
                                <div style="font-size: 0.95rem; color: var(--text-dim); margin-top: 4px;">
                                    Arquivos e anexos vinculados a este pedido.
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                                <button id="btn-download-zip-${osId}" class="btn btn-sm btn-primary" onclick="downloadAnexosSelecionadosZip('${osId}', '${osNum}')" style="font-size: 0.78rem; font-weight: 700; padding: 5px 12px; display: flex; align-items: center; gap: 6px; background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);" title="Baixar os anexos selecionados em um arquivo ZIP">
                                    📦 Baixar Todos (ZIP)
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="uploadAnexoPedido('${osId}', '${osNum}')" style="font-size: 0.78rem; font-weight: 700; padding: 5px 12px; display: flex; align-items: center; gap: 6px;">
                                    📤 Upload Anexo
                                </button>
                            </div>

                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;" id="anexos-pedido-container-${osId}">
                            <div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Buscando anexos...</div>
                        </div>
                    </div>


                    <!-- Designers Ideal -->

                    <div class="card" style="border: 1px solid var(--border); box-shadow: var(--shadow);">
                        <div class="card-header" style="background: transparent; border-bottom: 0; padding: 16px 16px 4px 16px;">
                            <div style="font-weight: 800; color: var(--text); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                                Designers Ideal
                            </div>
                            <div style="font-size: 0.95rem; color: var(--text-dim); margin-top: 4px;">
                                Equipe de design responsável pela criação de artes.
                            </div>
                        </div>
                        <div class="card-body" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;" id="designers-box-container-${osId}">
                            ${renderDesignersBoxHTML(osId, osNum)}
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

    const arteGlobal = state.todasArtes?.find(a => String(a.id_int) === String(os.numero));
    const entregaStatus = (arteGlobal && arteGlobal.entrega_dados) ? arteGlobal.entrega_dados.toUpperCase() : '----';
    const isClienteView = (containerId === 'cliente-amostras-itens-container');

    let entregaCardHtml = '';


    // No painel interno (isInternal), gerar box de entrega e faturamento
    if (isInternal) {
        const isCorrigir = (entregaStatus === 'CORRIGIR');
        const isAlterado = (entregaStatus === 'ALTERADO');
        const isAprovado = (entregaStatus === 'APROVADO');

        const initialDisplay = (isCorrigir || isAlterado) ? 'block' : 'none';

        let alertBorder = '1px solid var(--border)';
        let alertBg = 'rgba(255,255,255,0.02)';
        let headerBg = 'rgba(255,255,255,0.05)';
        let titleColor = 'var(--text)';
        let badgeTag = '<span class="badge badge-teal" style="font-size:0.8rem;font-weight:700;padding:4px 10px;">✅ APROVADO</span>';
        let titleLabel = '📦 Dados de Entrega e Faturamento do Pedido';

        if (isCorrigir) {
            alertBorder = '2px solid #ef4444';
            alertBg = 'rgba(239,68,68,0.05)';
            headerBg = 'rgba(239,68,68,0.15)';
            titleColor = '#ef4444';
            badgeTag = '<span class="badge badge-red" style="font-size:0.8rem;font-weight:700;padding:4px 10px;">❌ CORRIGIR</span>';
            titleLabel = '🚨 Solicitação de Alteração de Entrega / Faturamento pelo Cliente';
        } else if (isAlterado) {
            alertBorder = '2px solid #f97316';
            alertBg = 'rgba(249,115,22,0.05)';
            headerBg = 'rgba(249,115,22,0.15)';
            titleColor = '#f97316';
            badgeTag = '<span class="badge" style="background:#f97316;color:white;font-weight:700;font-size:0.8rem;padding:4px 10px;">⚠️ ALTERADO</span>';
            titleLabel = '⚠️ Dados de Entrega / Faturamento Alterados';
        }

        entregaCardHtml += `
            <div class="card" id="box-correcao-entrega-interno-${osId}" style="display: ${initialDisplay}; border: ${alertBorder}; background: ${alertBg}; margin-bottom: 20px; box-shadow: var(--shadow);">
                <div class="card-header" style="background: ${headerBg}; border-bottom: 1px solid var(--border); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="font-weight: 800; color: ${titleColor}; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        ${titleLabel}
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${badgeTag}
                        <button class="btn btn-sm btn-ghost" onclick="toggleBoxEntregaDados('${osId}')" style="font-size: 0.78rem; padding: 4px 8px; color: var(--text-dim);" title="Minimizar / Fechar Box">
                            ✕ Fechar
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
                    <!-- Dados Básicos da OS -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; background: rgba(0,0,0,0.03); padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px;">
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Cliente / Razão Social:</span>
                            <div style="font-weight: 700; color: var(--text); font-size: 0.95rem;">${os.cliente || '--'}</div>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Pedido Nº:</span>
                            <div style="font-weight: 700; color: var(--text); font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                                <span>#${os.numero || '--'}</span>
                                <a href="https://vibe.ai-ideal.com.br/orcamentos/${os.numero}/editar?tab=produtos" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 7px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; text-decoration: none; font-size: 0.78rem; color: #38bdf8;" title="Abrir Pedido #${os.numero} no Vibe Ideal">
                                    <img src="icon-vibe.png" alt="Vibe" style="height: 17px; width: auto; display: block; object-fit: contain;" />
                                    <span style="font-weight: 700;">Vibe</span>
                                </a>
                            </div>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Status de Entrega/Faturam.:</span>
                            <div style="font-weight: 700; color: ${titleColor}; font-size: 0.95rem;">${entregaStatus}</div>
                        </div>
                    </div>

                    <!-- Container Dinâmico: Dados Atuais de Faturamento e Entrega (Supabase) -->
                    <div id="detalhes-entrega-faturamento-${osId}">
                        <div style="font-size: 0.8rem; color: var(--text-dim); padding: 8px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Carregando dados cadastrais de faturamento e entrega...</div>
                    </div>

                    <!-- Container Dinâmico: Texto da Solicitação do Cliente -->
                    <div id="solicitacao-cliente-texto-${osId}"></div>

                    <!-- Ação para Concluir/Aprovar -->
                    ${(isCorrigir || isAlterado) ? `
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; justify-content: flex-end;">
                        <button class="btn btn-sm btn-teal" onclick="marcarEntregaDadosCorrigido('${osId}', '${osNum}')" style="font-weight: 700; padding: 8px 16px; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; background: rgba(16,185,129,0.2); color: #10b981; border: 1px solid rgba(16,185,129,0.4);">
                            ✅ Marcar Correção/Alteração como Concluída (Aprovado)
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Atualizar o botão do topo da OS no banner
        const btnToggle = document.getElementById('btn-toggle-entrega-dados');
        if (btnToggle) {
            btnToggle.style.display = 'inline-flex';
            if (isCorrigir) {
                btnToggle.className = 'btn btn-danger btn-sm';
                btnToggle.innerHTML = '📦 Entrega/Faturam. <span class="badge badge-red" style="background:#b91c1c;color:white;margin-left:4px;">❌ CORRIGIR</span>';
            } else if (isAlterado) {
                btnToggle.className = 'btn btn-warning btn-sm';
                btnToggle.innerHTML = '📦 Entrega/Faturam. <span class="badge" style="background:#ea580c;color:white;margin-left:4px;">⚠️ ALTERADO</span>';
            } else if (isAprovado) {
                btnToggle.className = 'btn btn-secondary btn-sm';
                btnToggle.innerHTML = '📦 Entrega/Faturam. <span class="badge badge-teal" style="margin-left:4px;">✅ APROVADO</span>';
            } else {
                btnToggle.className = 'btn btn-secondary btn-sm';
                btnToggle.innerHTML = '📦 Dados de Entrega / Faturamento';
            }
            btnToggle.onclick = () => toggleBoxEntregaDados(osId);
        }
    }


    if (isClienteView && (entregaStatus === 'ALTERADO' || entregaStatus !== 'APROVADO')) {
        let badgeHeader = '<span class="badge" style="background: #f97316; color: white; font-weight: 700;">⚠️ REVISÃO SOLICITADA</span>';
        let descText = 'Os dados de <strong>Entrega e Faturamento</strong> deste pedido sofreram alterações. Por favor, confira as informações abaixo e confirme a sua aprovação ou solicite as correções necessárias:';
        let cardBg = 'rgba(249,115,22,0.03)';
        let cardBorder = '2px solid #f97316';
        let headerBg = 'rgba(249,115,22,0.12)';

        if (entregaStatus === 'APROVADO') {
            badgeHeader = '<span class="badge badge-teal">✅ APROVADO</span>';
            descText = 'Os dados de <strong>Entrega e Faturamento</strong> deste pedido foram conferidos e aprovados.';
            cardBg = 'rgba(16,185,129,0.03)';
            cardBorder = '1px solid rgba(16,185,129,0.3)';
            headerBg = 'rgba(16,185,129,0.1)';
        } else if (entregaStatus === 'CORRIGIR') {
            badgeHeader = '<span class="badge badge-red">❌ CORREÇÃO SOLICITADA</span>';
            descText = 'Foi solicitada uma <strong>correção</strong> nos dados de Entrega e Faturamento. A equipe está revisando.';
            cardBg = 'rgba(239,68,68,0.03)';
            cardBorder = '1px solid rgba(239,68,68,0.3)';
            headerBg = 'rgba(239,68,68,0.1)';
        }

        entregaCardHtml += `
            <div class="card" style="border: ${cardBorder}; background: ${cardBg}; margin-bottom: 20px; box-shadow: var(--shadow);">
                <div class="card-header" style="background: ${headerBg}; border-bottom: 1px solid var(--border); padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="font-weight: 800; color: var(--text); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        📦 Conferência de Dados de Entrega e Faturamento
                    </div>
                    ${badgeHeader}
                </div>
                <div class="card-body" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
                    <p style="font-size: 0.9rem; color: var(--text); margin: 0; line-height: 1.5;">
                        ${descText}
                    </p>

                    <!-- Informações do Cliente/Pedido -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; background: rgba(0,0,0,0.02); padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px;">
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Cliente / Razão Social:</span>
                            <div style="font-weight: 700; color: var(--text); font-size: 0.92rem;">${os.cliente || '--'}</div>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Número do Pedido:</span>
                            <div style="font-weight: 700; color: var(--text); font-size: 0.92rem;">#${os.numero || '--'}</div>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Status Atual:</span>
                            <div style="font-weight: 700; color: var(--text); font-size: 0.92rem;">${entregaStatus}</div>
                        </div>
                    </div>

                    <!-- Campo para Obs / Correções se necessário -->
                    <div id="box-obs-entrega-cliente-${osId}" style="display: none; margin-top: 4px;">
                        <label style="font-size: 0.82rem; font-weight: 700; color: #ef4444; margin-bottom: 6px; display: block;">
                            Descreva o que precisa ser corrigido nos dados de entrega/faturamento:
                        </label>
                        <textarea id="txt-obs-entrega-cliente-${osId}" class="form-control" rows="3" placeholder="Insira os detalhes da correção (ex: novo endereço, CEP, CNPJ, faturamento...)" style="resize: vertical; border-color: rgba(239,68,68,0.4);"></textarea>
                    </div>

                    <!-- Botões de Ação do Cliente -->
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px;">
                        <button class="btn btn-success" onclick="clienteAprovarEntregaDados('${osId}', '${osNum}')" style="font-weight: 700; padding: 10px 20px; font-size: 0.88rem; display: flex; align-items: center; gap: 8px;">
                            ✅ Aprovar Dados de Entrega e Faturamento
                        </button>
                        <button class="btn btn-outline-danger" onclick="clienteSolicitarCorrecaoEntregaDados('${osId}', '${osNum}')" style="font-weight: 700; padding: 10px 18px; font-size: 0.88rem; display: flex; align-items: center; gap: 8px; border: 1px solid #ef4444; color: #ef4444; background: transparent;">
                            ❌ Solicitar Correção nos Dados
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = entregaCardHtml + finalHtml;


    
    if (isInternal) {
        loadBriefingBase(osId, osNum);
        loadAnexosPedido(osId, osNum);
        loadUltimosPedidos(osId, os.cliente);
        loadDadosEntregaInterno(osId, osNum);
    }



    setTimeout(async () => {
        for (let idx = 0; idx < itens.length; idx++) {
            const item = itens[idx];
            const corSelect = document.getElementById(`amostra-item-cor-${idx}`);
            const numSelect = document.getElementById(`amostra-item-num-${idx}`);
            const hasSelectValue = (corSelect && corSelect.value) || (numSelect && numSelect.value);
            
            const hasSavedLocal = (item.id && (localStorage.getItem(`ideal_arte_url_${item.id}_frente`) || localStorage.getItem(`ideal_arte_url_${item.id}_verso`) || localStorage.getItem(`ideal_arte_json_${item.id}_frente`) || localStorage.getItem(`ideal_arte_json_${item.id}_verso`))) ||
                                  localStorage.getItem(`ideal_arte_url_${osId}_${idx}_frente`) || localStorage.getItem(`ideal_arte_url_${osId}_${idx}_verso`) ||
                                  localStorage.getItem(`ideal_arte_json_${osId}_${idx}_frente`) || localStorage.getItem(`ideal_arte_json_${osId}_${idx}_verso`);

            if (item.amostra_cor_id || item.amostra_num_id || item.amostra_arte_base64 || item.arte_url || item.verso_arte_url || item.arte_json || item.verso_arte_json || hasSavedLocal || hasSelectValue) {
                await renderItemAmostraCombinada(idx, osId);
                // Pequena pausa para permitir renderização fluida da UI sem travar o browser
                await new Promise(r => setTimeout(r, 20));
            }
        }
        // Atualizar a barra final de ações do cliente dinamicamente
        atualizarBarraFinalCliente(osId);
    }, 50);

}

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

/**
 * Atualiza o status global do pedido ao clicar em "Voltar para Atendimento".
 * - Se TODOS os modelos estiverem PRONTO → 'Enviar Arte' (mas normalmente isso
 *   já foi feito automaticamente por decisionAmostraItem)
 * - Se parcial ou nenhum → 'Pendente Informação'
 * Não gera link automaticamente — link é gerado manualmente pelo botão na lista.
 */
async function voltarParaAtendimento() {
    const osId = state.amostrasOSAtivo;
    if (!osId) {
        toast('Nenhum pedido ativo na tela de Amostras.', 'warning');
        return;
    }

    const itens = state.osItens[osId] || [];
    if (itens.length === 0) {
        toast('Nenhum modelo de item encontrado neste pedido.', 'warning');
        return;
    }

    // Verificar se todos os itens possuem amostra_status === 'PRONTO' ou 'APROVADA'
    const todasProntas = itens.every(item => item.amostra_status === 'PRONTO' || item.amostra_status === 'APROVADA');
    const novoStatus = todasProntas ? 'Enviar Arte' : 'Pendente Informação';

    try {
        const os = state.ordens.find(o => o.id === osId);

        // 1. Atualizar localStorage
        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        // 2. Atualizar estado em memória
        if (os) os.status = novoStatus;

        // 3. Atualizar no banco Supabase
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                const { error } = await supabaseClient
                    .from('pedidos_links_cliente')
                    .update({ status_arte: novoStatus })
                    .eq('os_id', osId);
                if (error) console.warn('Erro ao atualizar status_arte em links:', error);
            } else {
                const { error } = await supabaseClient
                    .from('producao_ordens_servico')
                    .update({ status: novoStatus })
                    .eq('id', osId);
                if (error) console.warn('Erro ao atualizar status no Supabase:', error);
            }

            // A atualização do status_arte de pedidos_modelos já ocorre de forma individual e automática 
            // através da função saveAmostraToDB quando o designer marca como "PRONTO" ou o cliente "APROVA".
            // Portanto, não reescrevemos o status dos modelos aqui para evitar sobrescrever modelos Aprovados.
        }

        if (todasProntas) {
            toast(`Pedido #${os ? os.numero : ''} marcado como "Enviar Arte". Use o botão de link na lista para compartilhar com o cliente.`, 'success');
        } else {
            toast(`Pedido #${os ? os.numero : ''} retornado com pendências — status: "Pendente Informação".`, 'warning');
        }

        clearAmostrasOS();
        showView('view-lista-arte');
    } catch (err) {
        console.error('Erro ao voltar para atendimento:', err);
        toast('Erro ao atualizar status do pedido: ' + err.message, 'error');
    }
}

// Expor globalmente
window.voltarParaAtendimento = voltarParaAtendimento;

/**
 * Retorna o pedido para o designer (status 'Em Arte').
 * Usado quando o admin reprovador ou clica em "Voltar para Arte" após reprovação do cliente.
 * NÃO é 'REPROVADO' — 'REPROVADO' é o status gravado pelo CLIENTE. 'Em Arte' é o status de trabalho do designer.
 */
async function voltarParaArte() {
    const osId = state.amostrasOSAtivo;
    if (!osId) {
        toast('Nenhum pedido ativo na tela de Amostras.', 'warning');
        return;
    }

    const novoStatus = 'Em Arte';

    try {
        const os = state.ordens.find(o => o.id === osId);

        // 1. Atualizar localStorage
        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        // 2. Atualizar estado em memória
        if (os) os.status = novoStatus;

        // 3. Atualizar no banco Supabase
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                const { error } = await supabaseClient
                    .from('pedidos_links_cliente')
                    .update({ status_arte: novoStatus })
                    .eq('os_id', osId);
                if (error) throw error;
            } else {
                const { error } = await supabaseClient
                    .from('producao_ordens_servico')
                    .update({ status: novoStatus })
                    .eq('id', osId);
                if (error) throw error;
            }
        }

        toast(`Pedido #${os ? os.numero : ''} retornado para "Em Arte" — o designer pode corrigir.`, 'info');
        clearAmostrasOS();
        showView('view-lista-arte');
    } catch (err) {
        console.error('Erro ao voltar para arte:', err);
        toast('Erro ao atualizar status do pedido: ' + err.message, 'error');
    }
}

// Expor globalmente
window.voltarParaArte = voltarParaArte;

// ────────────────────────────────────────────────────────────────────────────
// NOVAS AÇÕES DO FLUXO DE ARTE (v2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reprovar arte pelo Atendimento/Admin (direto da lista, sem ser via link do cliente).
 * Muda o status para 'Reprovada'.
 */
window.reprovarArteAdmin = async function(osId) {
    if (!confirm('Tem certeza que deseja solicitar ALTERAÇÃO para a arte deste pedido?')) return;

    const novoStatus = 'Em Alteração';
    try {
        const os = state.ordens.find(o => o.id === osId);

        // 1. Atualizar localStorage
        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        // 2. Atualizar estado em memória
        if (os) os.status = novoStatus;

        // 3. Atualizar no banco Supabase
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                await supabaseClient.from('pedidos_links_cliente').update({ status_arte: novoStatus }).eq('os_id', osId);
            } else {
                await supabaseClient.from('producao_ordens_servico').update({ status: novoStatus }).eq('id', osId);
            }
        }

        toast(`Pedido #${os ? os.numero : ''} alterado para "Em Alteração".`, 'warning');
        renderOrdens();
    } catch (err) {
        console.error('Erro ao colocar em alteração:', err);
        toast('Erro ao atualizar: ' + err.message, 'error');
    }
};


/**
 * Voltar pedido para 'Em Arte' direto da lista (quando está Reprovada).
 * Diferente de voltarParaArte() que funciona da tela de Amostras.
 */
window.voltarParaArteFromLista = async function(osId) {
    if (!confirm('Retornar pedido para "Em Arte"? O designer poderá corrigir.')) return;

    const novoStatus = 'Em Arte';
    try {
        const os = state.ordens.find(o => o.id === osId);

        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        if (os) os.status = novoStatus;

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                await supabaseClient.from('pedidos_links_cliente').update({ status_arte: novoStatus }).eq('os_id', osId);
            } else {
                await supabaseClient.from('producao_ordens_servico').update({ status: novoStatus }).eq('id', osId);
            }
        }

        toast(`Pedido #${os ? os.numero : ''} retornado para "Em Arte".`, 'info');
        renderOrdens();
    } catch (err) {
        console.error('Erro ao voltar para arte:', err);
        toast('Erro: ' + err.message, 'error');
    }
};

/**
 * Alterna manualmente o status de Entrega/Faturamento (APROVADO -> ALTERADO -> CORRIGIR -> ----)
 */
window.alterarEntregaDadosStatus = async function(osIntNum, currentStatus) {
    const perms = window._currentPerms || {};
    if (perms.perm_lista_arte_edit !== true) {
        toast('Você não tem permissão para alterar o status de Entrega/Faturamento.', 'warning');
        return;
    }

    const numInt = parseInt(osIntNum);
    if (isNaN(numInt)) return;

    const statusOptions = ['APROVADO', 'ALTERADO', 'CORRIGIR', '----'];
    const currUpper = (currentStatus || '----').toUpperCase();
    const currIdx = statusOptions.indexOf(currUpper);
    const nextStatus = statusOptions[(currIdx + 1) % statusOptions.length];
    const valToSave = nextStatus === '----' ? null : nextStatus;

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            await supabaseClient.from('pedidos_artes')
                .update({ entrega_dados: valToSave })
                .eq('id_int', numInt);
        }

        const arteGlobal = state.todasArtes?.find(a => a.id_int === numInt);
        if (arteGlobal) arteGlobal.entrega_dados = valToSave;

        toast(`Status Entrega/Faturam. do Pedido #${numInt} alterado para "${nextStatus}"`, 'info');
        renderOrdens();
    } catch (e) {
        console.error('Erro ao alterar entrega_dados:', e);
        toast('Erro ao alterar status: ' + e.message, 'error');
    }
};

/**
 * Liberar pedido para Produção (muda status_interno para 'EM PRODUCAO').

 * Usado quando a arte foi aprovada e o pedido pode ir para impressão.
 */
window.liberarParaProducao = async function(osId) {
    if (!confirm('Liberar este pedido para PRODUÇÃO / IMPRESSÃO?')) return;

    try {
        const os = state.ordens.find(o => o.id === osId);

        // Mudar status_interno para EM PRODUCAO (aparece na Lista de Impressão)
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            // Atualizar na proposta o status_interno
            const numInt = os ? parseInt(os.numero) : null;
            if (numInt) {
                await supabaseClient.from('propostas')
                    .update({ status_interno: 'EM PRODUCAO' })
                    .eq('id_int', numInt);
            }

            // Atualizar status da OS de arte
            if (osId.startsWith('vibe_')) {
                await supabaseClient.from('pedidos_links_cliente')
                    .update({ status_arte: 'EM PRODUCAO' })
                    .eq('os_id', osId);
            } else {
                await supabaseClient.from('producao_ordens_servico')
                    .update({ status: 'EM PRODUCAO' })
                    .eq('id', osId);
            }
        }

        // Atualizar estado local
        if (os) {
            os.status = 'EM PRODUCAO';
            os.status_interno = 'EM PRODUCAO';
        }

        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = 'EM PRODUCAO';
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        toast(`Pedido #${os ? os.numero : ''} liberado para PRODUÇÃO! 🖨️`, 'success');
        renderOrdens();
    } catch (err) {
        console.error('Erro ao liberar para produção:', err);
        toast('Erro: ' + err.message, 'error');
    }
};


/**
 * Ao selecionar cor em um card dinâmico, filtrar numerações compatíveis
 * (idêntico ao onAmostraCorSelect do card avulso)
 */
function onItemCorSelect(idx, osId, itemId, isInitialLoad = false) {
    const corSelect = document.getElementById(`amostra-item-cor-${idx}`);
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    if (!corSelect || !numSelect) return;

    const corId = corSelect.value;
    const cor = corId ? (state.cores || []).find(c => String(c.id) === String(corId)) : null;
    const selectedText = corSelect.selectedIndex >= 0 ? corSelect.options[corSelect.selectedIndex].text : '';
    const corNome = cor ? (cor.name || cor.padrao || cor.cor || cor.nome) : (selectedText && !selectedText.startsWith('--') ? selectedText : null);

    const item = state.osItens[osId]?.find(i => String(i.id) === String(itemId));

    if (item) {
        item.amostra_cor_id = corId || null;
        if (corNome) {
            item.cor = corNome;
            item.padrao = corNome;
        }
        if (!isInitialLoad) item._needsSnapshot = true;
    }

    // Se não for carga inicial, salva no banco
    if (!isInitialLoad) {
        saveAmostraToDB(itemId, osId, { 
            amostra_cor_id: corId || null,
            padrao: corNome || null,
            cor: corNome || null
        }).then(() => {
            toast(`Cor "${corNome || 'Padrão'}" atualizada no banco e no Vibe!`, 'success');
        }).catch(err => {
            console.error('Erro ao salvar cor:', err);
            toast('Erro ao salvar cor no banco: ' + (err.message || err), 'error');
        });
    }

    // Filtrar numerações pelo formato da COR selecionada
    const curNumVal = numSelect.value;
    const corFormatoId = cor ? cor.formato_id : null;
    const os = typeof findOSInState === 'function' ? findOSInState(osId) : state.ordens.find(o => o.id === osId);
    const idCliente = os ? os.id_cliente : null;

    const filteredNums = (state.numeracoes || []).filter(n => {
        // Sempre exibe a numeração atualmente selecionada (para não sumir do select)
        if (curNumVal && n.id === curNumVal) return true;

        // Se for customizada
        if (n.is_custom) {
            if (n.Cli_Num) {
                // Se for vinculada a um cliente, só exibe se for o cliente desta OS
                if (String(n.Cli_Num) !== String(idCliente)) return false;
            } else {
                // Fallback legado: se não tiver Cli_Num, só exibe se for vinculada a este item específico
                if (!item || String(n.os_item_id) !== String(item.id)) return false;
            }
        }
        
        // Se tivermos cor selecionada com formato_id, filtra por ele
        if (corFormatoId) {
            const ids = n.formato_ids || (n.formato_id ? [n.formato_id] : []);
            return ids.some(id => String(id) === String(corFormatoId));
        }
        return false;
    });

    numSelect.innerHTML = '<option value="">-- Selecione uma Numeração --</option>' +
        filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

    if (filteredNums.some(n => String(n.id) === String(curNumVal))) {
        numSelect.value = curNumVal;
    } else {
        numSelect.value = '';
    }

    if (!isInitialLoad) {
        renderItemAmostraCombinada(idx, osId);
    }
}

function onItemNumSelect(idx, osId, itemId) {
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    if (!numSelect) return;
    
    const numId = numSelect.value;
    const numObj = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;
    const numNome = numObj ? numObj.name : null;
    const item = state.osItens[osId]?.find(i => String(i.id) === String(itemId));
    
    let versoStateChanged = false;
    if (item) {
        item.amostra_num_id = numId || null;
        item.gabarito_operacional = numNome || null;
        item.numeracao = numNome || null;
        item.tipo_numeracao = numNome || null;
        item._needsSnapshot = true;

        const isDuplexNum = isNumeracaoDuplex(numObj);
        const oldVerso = !!item.verso;

        if (isDuplexNum) {
            item.verso = true;
            if (!item.verso_tipo || item.verso_tipo === 'Frente' || item.verso_tipo === 'SÓ FRENTE' || item.verso_tipo === 'SO FRENTE') {
                item.verso_tipo = 'FxVerso';
            }
        } else {
            if (item.verso_tipo === 'FxVerso' || item.verso_tipo === 'VERSO COMUM') {
                item.verso_tipo = 'Frente';
                item.verso = false;
            } else {
                item.verso = !!(item.verso_tipo && item.verso_tipo !== 'Frente');
            }
        }
        if (oldVerso !== item.verso) {
            versoStateChanged = true;
        }
    }
    
    const dataToSave = { 
        amostra_num_id: numId || null,
        gabarito_operacional: numNome || null,
        tipo_numeracao: numNome || null
    };
    if (item && item.verso_tipo) {
        dataToSave.verso_tipo = item.verso_tipo;
    }

    saveAmostraToDB(itemId, osId, dataToSave).then(() => {
        toast(`Numeração "${numNome || 'Nenhuma'}" atualizada no banco e no Vibe!`, 'success');
    }).catch(err => {
        console.error('Erro ao salvar numeração:', err);
        toast('Erro ao salvar numeração no banco: ' + (err.message || err), 'error');
    });

    if (versoStateChanged) {
        const containerId = state.amostrasContainerId || 'amostras-itens-container';
        if (containerId === 'cliente-amostras-itens-container' && typeof renderClienteAmostrasItens === 'function') {
            renderClienteAmostrasItens(osId);
        } else if (typeof renderAmostrasOSItens === 'function') {
            renderAmostrasOSItens(osId);
        } else {
            renderItemAmostraCombinada(idx, osId);
        }
    } else {
        renderItemAmostraCombinada(idx, osId);
    }

    if (item && item.modo_pdf && pdfViewerState[idx]) {
        renderPdfViewerPage(idx, pdfViewerState[idx].currentPage || 1);
    }
}

async function onItemArteUpload(idx, osId, itemId, face = 'frente') {
    const inputId = face === 'verso' ? `amostra-item-arte-verso-${idx}` : `amostra-item-arte-${idx}`;
    const nameLabelId = face === 'verso' ? `amostra-item-arte-verso-name-${idx}` : `amostra-item-arte-name-${idx}`;
    const removeBtnId = face === 'verso' ? `btn-remove-amostra-arte-verso-${idx}` : `btn-remove-amostra-arte-${idx}`;

    const input = document.getElementById(inputId);
    const nameLabel = document.getElementById(nameLabelId);
    const removeBtn = document.getElementById(removeBtnId);
    
    if (input && input.files && input.files[0]) {
        const file = input.files[0];
        if (nameLabel) nameLabel.textContent = file.name;
        if (removeBtn) removeBtn.style.display = 'inline-block';
        
        try {
            toast('Enviando arte original para o servidor...', 'info');
            const fileExt = file.name.split('.').pop();
            const fileName = `arte_${face}_${osId}_${itemId}_${Date.now()}.${fileExt}`;
            
            const { data, error } = await supabaseClient
                .storage
                .from('artes')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });
                
            if (error) throw error;
            
            const { data: urlData } = supabaseClient
                .storage
                .from('artes')
                .getPublicUrl(fileName);
                
            const publicUrl = urlData.publicUrl;

            // Atualizar o state PRIMEIRO
            const osItems = state.osItens[osId];
            const item = osItems?.find(i => String(i.id) === String(itemId));
            if (item) {
                item._needsSnapshot = true;
                const faceKey = face === 'verso' ? 'verso' : 'frente';
                if (face === 'verso') {
                    item.verso_arte_url = publicUrl;
                } else {
                    item.arte_url = publicUrl;
                }
                if (item.id) localStorage.setItem(`ideal_arte_url_${item.id}_${faceKey}`, publicUrl);
                localStorage.setItem(`ideal_arte_url_${osId}_${idx}_${faceKey}`, publicUrl);
            }

            // Se modo PDF, gerar snapshot da primeira página e inicializar viewer
            if (item && item.modo_pdf && file.type === 'application/pdf') {
                try {
                    const arrayBuf = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
                    const page = await pdf.getPage(1);
                    const vp = page.getViewport({ scale: 2.0 });
                    const offCanvas = document.createElement('canvas');
                    offCanvas.width = vp.width;
                    offCanvas.height = vp.height;
                    const octx = offCanvas.getContext('2d');
                    await page.render({ canvasContext: octx, viewport: vp }).promise;
                    const snapshotBase64 = offCanvas.toDataURL('image/png');
                    item.amostra_arte_base64 = snapshotBase64;
                    await saveAmostraToDB(itemId, osId, { amostra_arte_base64: snapshotBase64 });
                } catch (snapErr) {
                    console.warn('[PDF MODE] Erro ao gerar snapshot da página 1:', snapErr);
                }
                // Salvar URL no banco
                const dbField = face === 'verso' ? 'verso_arte_url' : 'arte_url';
                await saveAmostraToDB(itemId, osId, { [dbField]: publicUrl });
                // Limpar viewer state antigo e re-renderizar
                delete pdfViewerState[idx];
                renderAmostrasOSItens(osId);
                setTimeout(() => initPdfViewer(idx, publicUrl), 100);
            } else {
                // Renderizar IMEDIATAMENTE a arte (modo padrão)
                renderItemAmostraCombinada(idx, osId);

                // Salvar no banco
                const dbField = face === 'verso' ? 'verso_arte_url' : 'arte_url';
                await saveAmostraToDB(itemId, osId, { [dbField]: publicUrl });
            }
            toast('Arte enviada com sucesso!', 'success');
        } catch(e) {
            console.error('Upload falhou:', e);
            toast('Falha ao enviar arte: ' + e.message, 'error');
        }
    }
}

function onItemArteRemove(idx, osId, itemId, face = 'frente') {
    const inputId = face === 'verso' ? `amostra-item-arte-verso-${idx}` : `amostra-item-arte-${idx}`;
    const nameLabelId = face === 'verso' ? `amostra-item-arte-verso-name-${idx}` : `amostra-item-arte-name-${idx}`;
    const removeBtnId = face === 'verso' ? `btn-remove-amostra-arte-verso-${idx}` : `btn-remove-amostra-arte-${idx}`;

    const input = document.getElementById(inputId);
    const nameLabel = document.getElementById(nameLabelId);
    const removeBtn = document.getElementById(removeBtnId);
    
    if (input) input.value = '';
    if (nameLabel) nameLabel.textContent = '';
    if (removeBtn) removeBtn.style.display = 'none';
    
    const item = state.osItens[osId].find(i => String(i.id) === String(itemId));
    if (item) {
        if (face === 'verso') {
            item.verso_arte_url = null;
        } else {
            item.arte_url = null;
        }
    }
    renderItemAmostraCombinada(idx, osId);

    const dbField = face === 'verso' ? 'verso_arte_url' : 'arte_url';
    saveAmostraToDB(itemId, osId, { [dbField]: null, _isExplicitRemove: true })
        .then(() => toast('Arte removida do banco!', 'success'))
        .catch(() => toast('Falha ao remover arte.', 'error'));
}

// Funções globais de Copiar/Colar links de arte entre modelos
window.copiarArte = function(url, face) {
    if (!url) {
        toast('Nenhum link de arte para copiar.', 'warning');
        return;
    }
    if (!state.copiedArte) state.copiedArte = {};
    state.copiedArte = { url, face };
    localStorage.setItem('imposicao_copied_arte', JSON.stringify({ url, face }));
    
    navigator.clipboard.writeText(url)
        .then(() => {
            toast(`Link da arte (${face.toUpperCase()}) copiado!`, 'success');
        })
        .catch(err => {
            toast(`Link da arte (${face.toUpperCase()}) copiado na memória!`, 'success');
        });
};

window.colarArte = async function(idx, osId, itemId, face = 'frente') {
    let sourceUrl = state.copiedArte ? state.copiedArte.url : null;
    
    if (!sourceUrl) {
        const stored = localStorage.getItem('imposicao_copied_arte');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed && parsed.url) {
                    sourceUrl = parsed.url;
                    state.copiedArte = parsed;
                }
            } catch(e) {}
        }
    }
    
    if (!sourceUrl) {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText && (clipboardText.startsWith('http://') || clipboardText.startsWith('https://'))) {
                sourceUrl = clipboardText.trim();
            }
        } catch (err) {
            console.log('Clipboard read blocked or empty:', err);
        }
    }
    
    if (!sourceUrl) {
        toast('Nenhuma arte copiada na memória. Copie a arte de outro modelo primeiro!', 'warning');
        return;
    }
    
    try {
        toast('Colando link da arte...', 'info');
        
        // Limpar inputs de arquivo locais correspondentes
        const inputId = face === 'verso' ? `amostra-item-arte-verso-${idx}` : `amostra-item-arte-${idx}`;
        const input = document.getElementById(inputId);
        if (input) input.value = '';
        
        const osItems = state.osItens[osId];
        const item = osItems ? osItems.find(i => String(i.id) === String(itemId)) : null;
        if (item) {
            if (face === 'verso') {
                item.verso_arte_url = sourceUrl;
            } else {
                item.arte_url = sourceUrl;
            }
        }
        
        // CRITICAL: Montar payload preservando explicitamente cor e numeração já cadastradas.
        // Uma colagem de arte NUNCA deve zerar amostra_cor_id/amostra_num_id —
        // apenas a URL da arte é alterada; cor e num permanecem intactos.
        const dbField = face === 'verso' ? 'verso_arte_url' : 'arte_url';
        const payload = { [dbField]: sourceUrl };
        if (item && item.amostra_cor_id) payload.amostra_cor_id = item.amostra_cor_id;
        if (item && item.amostra_num_id) payload.amostra_num_id = item.amostra_num_id;

        await saveAmostraToDB(itemId, osId, payload);

        // Só re-renderizar a janela combinada se os canvases estiverem no DOM
        // (evita renderAmostrasOSItens fora do editor, que dispara onItemCorSelect
        // e pode salvar amostra_cor_id/amostra_num_id = null por engano)
        const containerId = state.amostrasContainerId || 'amostras-itens-container';
        const hasCanvas = !!(document.getElementById(`amostra-item-canvas-${idx}`) ||
                             document.querySelector(`#${containerId} canvas[id*="amostra-item-canvas-${idx}"]`));
        if (hasCanvas) {
            renderItemAmostraCombinada(idx, osId);
        }

        toast('Arte vinculada com sucesso!', 'success');
    } catch (e) {
        console.error('Falha ao colar arte:', e);
        toast('Falha ao colar arte: ' + e.message, 'error');
    }
};

async function saveAmostraToDB(itemId, osId, dataToUpdate) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;

    const itemLocal = state.osItens[osId]?.find(i => String(i.id) === String(itemId));
    if (!itemLocal) {
        console.warn('[SAVE] Item não encontrado no state. itemId=', itemId, '| osId=', osId);
        return;
    }

    const modeloId = itemLocal._pedidoModeloId || itemLocal.id;

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

        // Mapear observação
        if ('amostra_obs' in dbData) {
            dbData.observacao_arte = dbData.amostra_obs;
        }

        // Garantir que padrao e gabarito_operacional estão preenchidos para pedidos_modelos
        if (!dbData.padrao && dbData.cor) {
            dbData.padrao = dbData.cor;
        }
        if (!dbData.gabarito_operacional && (dbData.numeracao || dbData.tipo_numeracao)) {
            dbData.gabarito_operacional = dbData.numeracao || dbData.tipo_numeracao;
        }

        // Remover campos virtuais ou não existentes na tabela pedidos_modelos
        delete dbData.amostra_obs;
        delete dbData.amostra_status;
        delete dbData.cor;
        delete dbData.numeracao;
        delete dbData.tipo_numeracao;
        delete dbData.url_arquivo_arte;
        delete dbData.url_arquivo;
        delete dbData.url_arquivo_arte_verso;
        delete dbData.verso_url_arquivo;
        delete dbData.arte_json;
        delete dbData.verso_arte_json;

        // GUARD: Nunca zerar arte_url/verso_arte_url se já existir no item local, a menos que seja uma remoção explícita
        if ('arte_url' in dbData && dbData.arte_url === null && itemLocal.arte_url && !dataToUpdate._isExplicitRemove) {
            delete dbData.arte_url;
        }
        if ('verso_arte_url' in dbData && dbData.verso_arte_url === null && itemLocal.verso_arte_url && !dataToUpdate._isExplicitRemove) {
            delete dbData.verso_arte_url;
        }

        // GUARD: Quando salvando arte (arte_url, amostra_arte_base64), SEMPRE preservar
        // amostra_cor_id e amostra_num_id se já existirem no item local.
        // Isso previne que qualquer save de arte zere a associação de cor/numeração.
        const isArteSave = ('arte_url' in dbData || 'amostra_arte_base64' in dbData || 
                            'verso_arte_url' in dbData || 'verso_amostra_arte_base64' in dbData);
        if (isArteSave) {
            if (!('amostra_cor_id' in dbData) && itemLocal.amostra_cor_id) {
                dbData.amostra_cor_id = itemLocal.amostra_cor_id;
            }
            if (!('amostra_num_id' in dbData) && itemLocal.amostra_num_id) {
                dbData.amostra_num_id = itemLocal.amostra_num_id;
            }
        }

        // Se não sobrou nenhum campo para atualizar, evita fazer a requisição
        if (Object.keys(dbData).length === 0) {
            return;
        }

        // 1. Atualizar em pedidos_modelos (se não for item virtual não carregado)
        if (itemLocal._source === 'vibecode' && !itemLocal._dbLoaded) {
            console.log('[SAVE] Item virtual Vibecode: salvando overrides locais:', itemLocal.id);
            Object.assign(itemLocal, dataToUpdate);
            const overrides = JSON.parse(localStorage.getItem('vibe_item_amostra_overrides') || '{}');
            const cacheKey = itemLocal.id;
            if (!overrides[cacheKey]) overrides[cacheKey] = {};
            Object.assign(overrides[cacheKey], dataToUpdate);
            localStorage.setItem('vibe_item_amostra_overrides', JSON.stringify(overrides));
        }
        
        let updatedCount = 0;

        // A) Tentar update por _pedidoModeloId ou ID do item
        if (modeloId && modeloId !== '') {
            const queryModeloId = (!isNaN(parseInt(modeloId)) && !String(modeloId).includes('vibe')) ? parseInt(modeloId) : modeloId;
            const { data: updateResult, error } = await vibeClient
                .from('pedidos_modelos')
                .update(dbData)
                .eq('id', queryModeloId)
                .select('id');

            if (!error && updateResult && updateResult.length > 0) {
                updatedCount = updateResult.length;
                console.log('[SAVE] OK por ID -> pedidos_modelos id=', queryModeloId, dbData);
            } else if (error) {
                console.error('[SAVE] Erro pedidos_modelos por ID:', error.message);
            }
        }

        // B) Tentar update por id_produto_proposta_origem
        if (updatedCount === 0 && itemId && !isNaN(parseInt(itemId))) {
            const propOrigemId = parseInt(itemId);
            const { data: res, error: err } = await vibeClient
                .from('pedidos_modelos')
                .update(dbData)
                .eq('id_produto_proposta_origem', propOrigemId)
                .select('id');
            if (!err && res && res.length > 0) {
                updatedCount = res.length;
                itemLocal._pedidoModeloId = res[0].id;
                console.log('[SAVE] OK por id_produto_proposta_origem=', propOrigemId, dbData);
            }
        }

        // C) Tentar update por id_int (número da OS) + ordem
        const osObj = typeof findOSInState === 'function' ? findOSInState(osId) : null;
        const osNum = osObj ? parseInt(osObj.numero) : parseInt(String(osId).replace('vibe_', ''));

        if (updatedCount === 0 && !isNaN(osNum)) {
            const itemOrdem = itemLocal ? (itemLocal.ordem || 1) : 1;
            const { data: res, error: err } = await vibeClient
                .from('pedidos_modelos')
                .update(dbData)
                .eq('id_int', osNum)
                .eq('ordem', itemOrdem)
                .select('id');
            if (!err && res && res.length > 0) {
                updatedCount = res.length;
                itemLocal._pedidoModeloId = res[0].id;
                console.log('[SAVE] OK por id_int + ordem=', osNum, itemOrdem, dbData);
            }
        }

        // D) Tentar update por id_int (qualquer linha da OS)
        if (updatedCount === 0 && !isNaN(osNum)) {
            const { data: res, error: err } = await vibeClient
                .from('pedidos_modelos')
                .update(dbData)
                .eq('id_int', osNum)
                .select('id');
            if (!err && res && res.length > 0) {
                updatedCount = res.length;
                itemLocal._pedidoModeloId = res[0].id;
                console.log('[SAVE] OK por id_int=', osNum, dbData);
            }
        }

        // E) Se NENHUMA linha existia em pedidos_modelos, AUTO-CRIAR (INSERT) a linha agora!
        if (updatedCount === 0 && !isNaN(osNum)) {
            const insertPayload = {
                id_int: osNum,
                id_produto_proposta_origem: (!isNaN(parseInt(itemId))) ? parseInt(itemId) : null,
                nome_modelo: itemLocal ? (itemLocal.nome_modelo || itemLocal.produto || 'Modelo') : 'Modelo',
                quantidade: itemLocal ? (itemLocal.qtd || itemLocal.quantidade || 0) : 0,
                ordem: itemLocal ? (itemLocal.ordem || 1) : 1,
                status_arte: 'PENDENTE',
                status_producao: 'PENDENTE',
                ...dbData
            };
            const { data: insData, error: insErr } = await vibeClient
                .from('pedidos_modelos')
                .insert([insertPayload])
                .select('id');
            if (!insErr && insData && insData.length > 0) {
                updatedCount = insData.length;
                if (itemLocal) itemLocal._pedidoModeloId = insData[0].id;
                console.log('[SAVE] INSERT OK em pedidos_modelos id=', insData[0].id, insertPayload);
            } else if (insErr) {
                console.error('[SAVE] Erro INSERT em pedidos_modelos:', insErr.message);
            }
        }

        // 2. ATUALIZAR PRODUTOS_PROPOSTA NO SUPABASE (SISTEMA VIBE)
        const propData = {};
        if ('amostra_cor_id' in dataToUpdate) propData.amostra_cor_id = dataToUpdate.amostra_cor_id;
        if ('amostra_num_id' in dataToUpdate) propData.amostra_num_id = dataToUpdate.amostra_num_id;
        if ('arte_url' in dataToUpdate) {
            propData.arte_url = dataToUpdate.arte_url;
        }
        if ('amostra_arte_base64' in dataToUpdate) propData.amostra_arte_base64 = dataToUpdate.amostra_arte_base64;

        const valCor = dataToUpdate.padrao || dataToUpdate.cor;
        if (valCor) {
            propData.padrao = valCor;
        }
        const valNum = dataToUpdate.gabarito_operacional || dataToUpdate.numeracao || dataToUpdate.tipo_numeracao;
        if (valNum) {
            propData.gabarito_operacional = valNum;
        }

        if (Object.keys(propData).length > 0) {
            const propId = itemLocal.id_produto_proposta_origem || (typeof itemLocal.id === 'number' || (!isNaN(parseInt(itemLocal.id)) && !String(itemLocal.id).includes('vibe')) ? parseInt(itemLocal.id) : null);
            let propUpdated = false;

            if (propId) {
                const { error: propErr } = await vibeClient
                    .from('produtos_proposta')
                    .update(propData)
                    .eq('id', propId);
                if (!propErr) {
                    propUpdated = true;
                    console.log('[SAVE VIBE] OK -> produtos_proposta por ID=', propId, propData);
                } else {
                    console.warn('[SAVE VIBE] Erro ao atualizar produtos_proposta por ID:', propErr.message);
                }
            }

            if (!propUpdated && osId) {
                const osObj = typeof findOSInState === 'function' ? findOSInState(osId) : null;
                const osNum = osObj ? parseInt(osObj.numero) : parseInt(String(osId).replace('vibe_', ''));
                if (!isNaN(osNum)) {
                    let query = vibeClient.from('produtos_proposta').update(propData).eq('id_int', osNum);
                    if (itemLocal.nome_modelo || itemLocal.produto) {
                        query = query.eq('nome_produto', itemLocal.nome_modelo || itemLocal.produto);
                    }
                    const { error: propErr2 } = await query;
                    if (!propErr2) {
                        console.log('[SAVE VIBE] OK -> produtos_proposta por id_int=', osNum, propData);
                    } else {
                        console.warn('[SAVE VIBE] Erro ao atualizar produtos_proposta por id_int:', propErr2.message);
                    }
                }
            }
        }

        Object.assign(itemLocal, dataToUpdate);
        if (dataToUpdate.arte_url) {
            itemLocal.url_arquivo_arte = dataToUpdate.arte_url;
            itemLocal.url_arquivo = dataToUpdate.arte_url;
        }
        if (dataToUpdate.verso_arte_url) {
            itemLocal.url_arquivo_arte_verso = dataToUpdate.verso_arte_url;
            itemLocal.verso_url_arquivo = dataToUpdate.verso_arte_url;
        }

        Object.assign(itemLocal, dataToUpdate);
    } catch (e) {
        console.error('[SAVE] Erro em saveAmostraToDB:', e);
        throw e;
    }
}

// ========== MODO PDF MULTI-PÁGINA ==========
const pdfViewerState = {};

async function toggleModoPdf(idx, osId, itemId) {
    const items = state.osItens[osId] || [];
    const item = items.find(i => String(i.id) === String(itemId));
    if (!item) return;
    
    item.modo_pdf = !item.modo_pdf;
    
    // Persiste no banco
    try {
        await saveAmostraToDB(itemId, osId, { modo_pdf: item.modo_pdf });
    } catch (e) {
        console.error('[PDF MODE] Erro ao salvar modo_pdf:', e);
    }
    
    // Re-renderiza o card completo
    renderAmostrasOSItens(osId);
    toast(item.modo_pdf ? '📄 Modo PDF ativado — numeração mantida' : '🎨 Modo padrão restaurado', 'info');
}

function getPdfUrlForItem(item, face, osId, idx) {
    if (!item) return null;
    const faceKey = face === 'back' ? 'verso' : 'frente';
    
    // 1. Procurar em campos diretos de URL de PDF do item
    let candidate = face === 'back'
        ? (item.verso_arte_url || item.url_arquivo_arte_verso || item.verso_url_arquivo)
        : (item.arte_url || item.url_arquivo_arte || item.url_arquivo);
        
    // 2. Se não achou no item, procurar no localStorage local da máquina
    if (!candidate) {
        candidate = (item.id ? localStorage.getItem(`ideal_arte_url_${item.id}_${faceKey}`) : null) ||
                    localStorage.getItem(`ideal_arte_url_${osId}_${idx}_${faceKey}`);
    }
    
    // 3. Se ainda não achou, procurar em pedidos_artes no state global
    if (!candidate && typeof state !== 'undefined' && state.todasArtes && state.todasArtes.length > 0) {
        const queryNum = parseInt(String(osId).replace('vibe_', ''));
        if (!isNaN(queryNum)) {
            const artesDoItem = state.todasArtes.filter(a => 
                (a.id_int === queryNum || String(a.id_int) === String(queryNum)) && 
                (String(a.id_modelo) === String(item.id) || (item._pedidoModeloId && String(a.id_modelo) === String(item._pedidoModeloId)))
            );
            if (artesDoItem.length > 0) {
                artesDoItem.sort((a, b) => (b.versao || 0) - (a.versao || 0));
                candidate = face === 'back' ? artesDoItem[0].verso_url_arquivo : artesDoItem[0].url_arquivo;
            }
        }
    }

    // 4. Fallback de imagem snapshot se não houver PDF
    if (!candidate) {
        candidate = face === 'back' ? item.verso_amostra_arte_base64 : item.amostra_arte_base64;
    }
    
    return candidate || null;
}

async function renderImageModeInPdfViewer(idx, imgUrl, item, osId) {
    const canvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
    if (!canvas) return;
    
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = imgUrl;
    });
    
    if (img.width > 0 && img.height > 0) {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // Estampar numeração sobre a imagem
        const containerId = state.amostrasContainerId || 'amostras-itens-container';
        const container = document.getElementById(containerId);
        const numSelect = container ? container.querySelector(`#amostra-item-num-${idx}`) : null;
        const numId = (numSelect && numSelect.value) ? numSelect.value : (item ? (item.amostra_num_id || item.numeracao_id || item.numeracao || item.gabarito_operacional) : null);
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
            drawNumeracaoElementsOverCanvas(ctx, num, item, 1, canvas.width, canvas.height);
        }
        
        canvas.style.display = 'block';
        
        const nav = document.getElementById(`amostra-pdf-nav-${idx}`);
        if (nav) nav.style.display = 'none';
        
        const empty = document.getElementById(`amostra-item-empty-${idx}`);
        if (empty) empty.style.display = 'none';
    }
}

async function initPdfViewer(key, pdfUrl, osId = null, idx = 0) {
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
            console.warn('[PDF Viewer] Fetch direto falhou, tentando proxy...', directErr);
            // Fallback: usar proxy local (quando rodando com backend Python)
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(pdfUrl)}`;
            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) throw new Error('Proxy fetch failed: ' + proxyResponse.status);
            arrayBuffer = await proxyResponse.arrayBuffer();
        }
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const stateObj = {
            pdf: pdf,
            pdfUrl: pdfUrl,
            currentPage: 1,
            totalPages: pdf.numPages,
            osId: osId,
            idx: idx
        };
        pdfViewerState[key] = stateObj;
        pdfViewerState[idx] = stateObj;
        
        await renderPdfViewerPage(key, 1, idx);
    } catch (err) {
        console.error('[PDF Viewer] Erro ao carregar PDF:', err);
        delete pdfViewerState[key];
        delete pdfViewerState[idx];

        // Fallback: se houver imagem (amostra_arte_base64), renderizar como imagem
        const item = (osId && state.osItens && state.osItens[osId]) ? state.osItens[osId][idx] : null;
        if (item && item.amostra_arte_base64) {
            renderImageModeInPdfViewer(idx, item.amostra_arte_base64, item, osId);
        }
    }
}

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
                const csvData = num?.csv_data || item?.csv_data || state.csvData || state.numCsvData || null;
                const csvRow = (csvData && csvData[pageNum - 1]) ? csvData[pageNum - 1] : null;
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
                const csvData = num?.csv_data || item?.csv_data || state.csvData || state.numCsvData || null;
                const csvRow = (csvData && csvData[pageNum - 1]) ? csvData[pageNum - 1] : null;
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
        }
        ctx.restore();
    });
}

async function renderPdfViewerPage(keyOrIdx, pageNum, idxParam = null) {
    const viewerState = pdfViewerState[keyOrIdx] || pdfViewerState[idxParam];
    if (!viewerState || !viewerState.pdf) return;
    
    // Extrair SEMPRE o índice numérico real do card na DOM (0, 1, 2...)
    let idx = (idxParam !== null && idxParam !== undefined) ? idxParam : viewerState.idx;
    if (idx === undefined || idx === null || isNaN(parseInt(idx))) {
        if (typeof keyOrIdx === 'string' && keyOrIdx.includes('_')) {
            const parts = keyOrIdx.split('_');
            idx = parseInt(parts[parts.length - 1]);
            if (isNaN(idx)) idx = 0;
        } else {
            idx = parseInt(keyOrIdx);
            if (isNaN(idx)) idx = 0;
        }
    }
    
    try {
        const page = await viewerState.pdf.getPage(pageNum);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
        if (!canvas) {
            console.warn(`[PDF Viewer] Canvas #amostra-pdf-canvas-${idx} não encontrado no DOM (keyOrIdx=${keyOrIdx}).`);
            return;
        }
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Estampar numeração cadastrada sobre a página do PDF se houver numeração selecionada
        const containerId = state.amostrasContainerId || 'amostras-itens-container';
        const container = document.getElementById(containerId);
        const numSelect = container ? container.querySelector(`#amostra-item-num-${idx}`) : null;
        const osId = viewerState.osId;
        const items = (osId && state.osItens && state.osItens[osId]) ? state.osItens[osId] : [];
        const item = items[idx] || (state.activeOSItem ? state.activeOSItem : null);

        let numId = (numSelect && numSelect.value) ? numSelect.value : (item ? (item.amostra_num_id || item.numeracao_id || item.numeracao || item.gabarito_operacional) : null);
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
            drawNumeracaoElementsOverCanvas(ctx, num, item, pageNum, viewport.width, viewport.height);
        }
        
        canvas.style.display = 'block';
        
        // Update navigation
        const nav = document.getElementById(`amostra-pdf-nav-${idx}`);
        if (nav) nav.style.display = 'flex';
        
        const pageInfo = document.getElementById(`amostra-pdf-page-info-${idx}`);
        if (pageInfo) pageInfo.textContent = `Página ${pageNum} / ${viewerState.totalPages}`;
        
        // Hide empty state
        const empty = document.getElementById(`amostra-item-empty-${idx}`);
        if (empty) empty.style.display = 'none';
        
        viewerState.currentPage = pageNum;
    } catch (err) {
        console.error('[PDF Viewer] Erro ao renderizar página:', err);
    }
}

function pdfViewerPrevPage(idx) {
    const key = (state.activeOSId ? `${state.activeOSId}_${idx}` : idx);
    const viewerState = pdfViewerState[key] || pdfViewerState[idx];
    if (!viewerState || viewerState.currentPage <= 1) return;
    renderPdfViewerPage(key in pdfViewerState ? key : idx, viewerState.currentPage - 1, idx);
}

function pdfViewerNextPage(idx) {
    const key = (state.activeOSId ? `${state.activeOSId}_${idx}` : idx);
    const viewerState = pdfViewerState[key] || pdfViewerState[idx];
    if (!viewerState || viewerState.currentPage >= viewerState.totalPages) return;
    renderPdfViewerPage(key in pdfViewerState ? key : idx, viewerState.currentPage + 1, idx);
}

/**
 * Renderiza o canvas de preview combinada para um card de item individual.
 * Usa exatamente a mesma lógica do card avulso:
 * - Cor: renderiza PDF via pdf.js em offscreen canvas
 * - Numeração: desenha elements (TEXT, FIXED, QR, BARCODE) em offscreen canvas
 * - Arte: carrega imagem do upload
 * - Compõe tudo no canvas final
 */
function preloadAmostraItemPdfElements(numeracao, idx, osId) {
    if (!numeracao || !numeracao.elements) return;

    numeracao.elements.forEach(el => {
        if (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas && !el._pdfLoading) {
            el._pdfLoading = true;
            (async () => {
                try {
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
                    delete el._pdfLoading;

                    renderItemAmostraCombinada(idx, osId);
                } catch (err) {
                    console.error('[Amostra Item] Erro pré-carregando PDF do elemento:', err);
                    delete el._pdfLoading;
                }
            })();
        }
    });
}

async function drawAmostraFace(item, face, canvas, empty, fmt, cor, num, idx, osId, S) {
    if (!canvas) return;

    // Se modo PDF ativo, não compor multicamada — usar PDF viewer dedicado
    const itemForPdf = (state.osItens[osId] || [])[idx] || item;
    if (itemForPdf && itemForPdf.modo_pdf) {
        if (canvas) canvas.style.display = 'none';
        
        // Pega a URL do PDF (com busca em 4 níveis)
        const pdfUrl = getPdfUrlForItem(itemForPdf, face, osId, idx);
            
        if (pdfUrl) {
            if (empty) empty.style.display = 'none';
            const key = `${osId}_${idx}`;
            
            const isImage = typeof pdfUrl === 'string' && (
                pdfUrl.startsWith('data:image/') || 
                (pdfUrl.includes('amostras_renderizadas') && !pdfUrl.endsWith('.pdf'))
            );
            
            if (isImage) {
                renderImageModeInPdfViewer(idx, pdfUrl, itemForPdf, osId);
            } else {
                const existing = pdfViewerState[key] || pdfViewerState[idx];
                if (!existing || existing.pdfUrl !== pdfUrl) {
                    initPdfViewer(key, pdfUrl, osId, idx);
                } else {
                    pdfViewerState[key] = existing;
                    pdfViewerState[key].osId = osId;
                    pdfViewerState[key].idx = idx;
                    renderPdfViewerPage(key, existing.currentPage || 1, idx);
                }
            }
        } else {
            // Sem arte/PDF enviado ainda: mostra o estado vazio do modo PDF
            if (empty) empty.style.display = 'block';
        }
        return;
    }

    // Determinar se tem arte selecionada ou salva para esta face
    const inputId = face === 'back' ? `amostra-item-arte-verso-${idx}` : `amostra-item-arte-${idx}`;
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const arteInput = container ? container.querySelector(`#${inputId}`) : null;

    const hasArte = arteInput && arteInput.files && arteInput.files.length > 0;
    let faceArteUrl = face === 'back' ? item.verso_arte_url : item.arte_url;
    if (!faceArteUrl && item) {
        const faceKey = face === 'back' ? 'verso' : 'frente';
        faceArteUrl = (item.id ? localStorage.getItem(`ideal_arte_url_${item.id}_${faceKey}`) : null) ||
                      localStorage.getItem(`ideal_arte_url_${osId}_${idx}_${faceKey}`);
        if (faceArteUrl) {
            if (face === 'back') item.verso_arte_url = faceArteUrl;
            else item.arte_url = faceArteUrl;
        }
    }
    const hasSavedArte = !!faceArteUrl;

    // Se nada selecionado (sem cor, sem numeração, sem arte para esta face), esconder canvas e mostrar vazio
    const corId = (cor ? cor.id : '') || item.amostra_cor_id || '';
    const numId = (num ? num.id : '') || item.amostra_num_id || '';
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
    if (!corRendered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    // ====== CAMADA 2: ARTE (imagem ou PDF do upload ou salva, com multiply) ======
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

                ctx.globalCompositeOperation = 'multiply';
                ctx.drawImage(offCanvas, dx, dy, offCanvas.width, offCanvas.height);
                ctx.globalCompositeOperation = 'source-over';
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

                    ctx.globalCompositeOperation = 'multiply';
                    ctx.drawImage(tempArte, 0, 0);
                    ctx.globalCompositeOperation = 'source-over';
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
                    const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                    label = `${el.prefix || ''}${_fVal}`;
                } else if (el.type === 'TEATRO_LUGAR') {
                    const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                    label = `${el.prefix || ''}${_lVal}`;
                } else if (el.type === 'TEATRO_COMBO') {
                    const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                    const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : 'A';
                    const fila = `${el.prefix_fila || ''}${_fVal}`;
                    const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                    label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
                } else if (el.type === 'CAMAROTE_LOCAL') {
                    // C_INI = Início do local (mesa/camarote) — NÃO confundir com NI (num_inicial)
                    const _cIni = parseInt(
                        item?.c_ini || item?.C_INI || 1
                    );
                    label = `${el.prefix || ''}${_cIni}`;
                } else if (el.type === 'CAMAROTE_PESSOA') {
                    label = `${el.prefix || ''}1`;
                } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                    const _lCamB = parseInt(
                        item?.l_cam || item?.L_CAM ||
                        item?.lotacao_cam || item?.LOTACAO_CAM ||
                        item?.lotacao || 5
                    );
                    label = `${el.prefix || ''}1/${_lCamB}`;

                } else if (el.source === 'database') {
                    const colName = el.csv_column || '';
                    const csvData = num?.csv_data || item?.csv_data || state.csvData || state.numCsvData || null;
                    const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
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
                    const csvData = num?.csv_data || item?.csv_data || state.csvData || state.numCsvData || null;
                    const csvRow = (csvData && csvData[0]) ? csvData[0] : null;
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
                        numCtx.drawImage(imgObj, -hw, -hh_el, w, h);
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
                            numCtx.drawImage(el._svgImage, -hw, -hh_el, w, h);
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

        // Compor numeração sobre o canvas final (centralizado) em modo multiply
        const ndx = (finalWidth - numCanvas.width) / 2;
        const ndy = (finalHeight - numCanvas.height) / 2;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(numCanvas, ndx, ndy, numCanvas.width, numCanvas.height);
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
    const copyFrontBtn = container.querySelector(`#btn-copy-amostra-arte-${idx}`);

    if (frontNameSpan) {
        if (hasFrontArte) frontNameSpan.textContent = container.querySelector(`#amostra-item-arte-${idx}`).files[0].name;
        else if (hasSavedFrontArte) frontNameSpan.textContent = '(Arte Salva na Nuvem)';
        else frontNameSpan.textContent = '';
    }
    if (removeFrontBtn) removeFrontBtn.style.display = (hasFrontArte || hasSavedFrontArte) ? '' : 'none';
    if (copyFrontBtn) {
        copyFrontBtn.style.display = (hasFrontArte || hasSavedFrontArte) ? '' : 'none';
        if (hasSavedFrontArte) {
            copyFrontBtn.setAttribute('onclick', `copiarArte('${item.arte_url}', 'frente')`);
        }
    }

    if (item.verso) {
        const hasVersoArte = container.querySelector(`#amostra-item-arte-verso-${idx}`)?.files?.length > 0;
        const hasSavedVersoArte = !!item.verso_arte_url;
        const versoNameSpan = container.querySelector(`#amostra-item-arte-verso-name-${idx}`);
        const removeVersoBtn = container.querySelector(`#btn-remove-amostra-arte-verso-${idx}`);
        const copyVersoBtn = container.querySelector(`#btn-copy-amostra-arte-verso-${idx}`);

        if (versoNameSpan) {
            if (hasVersoArte) versoNameSpan.textContent = container.querySelector(`#amostra-item-arte-verso-${idx}`).files[0].name;
            else if (hasSavedVersoArte) versoNameSpan.textContent = '(Arte Salva na Nuvem)';
            else versoNameSpan.textContent = '';
        }
        if (removeVersoBtn) removeVersoBtn.style.display = (hasVersoArte || hasSavedVersoArte) ? '' : 'none';
        if (copyVersoBtn) {
            copyVersoBtn.style.display = (hasVersoArte || hasSavedVersoArte) ? '' : 'none';
            if (hasSavedVersoArte) {
                copyVersoBtn.setAttribute('onclick', `copiarArte('${item.verso_arte_url}', 'verso')`);
            }
        }
    }

    // Obter cor, formato e numeração
    const cor = corId ? state.cores.find(c => c.id === corId) : null;
    const num = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;

    const numIsDuplex = isNumeracaoDuplex(num);
    const oldVersoInCanvas = !!item.verso;

    if (numIsDuplex) {
        if (!item.verso) {
            item.verso = true;
            if (!item.verso_tipo || item.verso_tipo === 'Frente' || item.verso_tipo === 'SÓ FRENTE' || item.verso_tipo === 'SO FRENTE') {
                item.verso_tipo = 'FxVerso';
            }
        }
    } else {
        if (item.verso_tipo === 'FxVerso' || item.verso_tipo === 'VERSO COMUM') {
            item.verso_tipo = 'Frente';
            item.verso = false;
        } else {
            item.verso = !!(item.verso_tipo && item.verso_tipo !== 'Frente');
        }
    }

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

    const canvasBackInDOM = container.querySelector(`#amostra-item-canvas-verso-${idx}`);
    if (oldVersoInCanvas !== item.verso || (item.verso && !canvasBackInDOM) || (!item.verso && canvasBackInDOM)) {
        const containerId = state.amostrasContainerId || 'amostras-itens-container';
        if (containerId === 'cliente-amostras-itens-container' && typeof renderClienteAmostrasItens === 'function') {
            renderClienteAmostrasItens(osId);
            return;
        } else if (typeof renderAmostrasOSItens === 'function') {
            renderAmostrasOSItens(osId);
            return;
        }
    }

    if (item.verso) {
        const canvasFront = container.querySelector(`#amostra-item-canvas-${idx}`);
        const emptyFront = container.querySelector(`#amostra-item-empty-${idx}`);
        const canvasBack = container.querySelector(`#amostra-item-canvas-verso-${idx}`);
        const emptyBack = container.querySelector(`#amostra-item-empty-verso-${idx}`);

        await drawAmostraFace(item, 'front', canvasFront, emptyFront, fmt, cor, num, idx, osId, S);
        await drawAmostraFace(item, 'back', canvasBack, emptyBack, fmt, cor, num, idx, osId, S);
        
        // Snapshot para link do cliente (Frente e Verso) - somente se editado
        if (state.amostrasContainerId !== 'cliente-amostras-itens-container' && item._needsSnapshot) {
            delete item._needsSnapshot;
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
        
        if (state.amostrasContainerId !== 'cliente-amostras-itens-container' && item._needsSnapshot) {
            delete item._needsSnapshot;
            if (item._snapshotTimer) clearTimeout(item._snapshotTimer);
            item._snapshotTimer = setTimeout(() => {
                snapshotAmostraAndUpload(idx, osId, item, canvas);
            }, 2000);
        }

    }
}

async function snapshotAmostraAndUpload(idx, osId, item, canvas, face = 'frente') {
    if (!supabaseClient) return;
    if (!canvas || typeof canvas.toBlob !== 'function') {
        const pdfCanvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
        if (pdfCanvas && typeof pdfCanvas.toBlob === 'function' && pdfCanvas.width > 0) {
            canvas = pdfCanvas;
        } else {
            return;
        }
    }
    try {
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const fileName = `amostra_${face}_${osId}_${item.id}_${Date.now()}.jpg`;
            const { error } = await supabaseClient
                .storage
                .from('amostras_renderizadas')
                .upload(fileName, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });
            
            if (error) {
                console.warn('[Snapshot] Não pôde enviar render final (bucket existe?):', error);
                return;
            }

            const { data: urlData } = supabaseClient.storage.from('amostras_renderizadas').getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;
            
            const dbField = face === 'verso' ? 'verso_amostra_arte_base64' : 'amostra_arte_base64';
            await saveAmostraToDB(item.id, osId, { [dbField]: publicUrl });
            if (face === 'verso') {
                item.verso_amostra_arte_base64 = publicUrl;
            } else {
                item.amostra_arte_base64 = publicUrl;
            }
        }, 'image/jpeg', 0.85);
    } catch(e) {
        console.warn('[Snapshot] Erro ao gerar snapshot:', e);
    }
}

// Versão promisificada do snapshot — aguarda upload completar antes de resolver
function snapshotAmostraSync(idx, osId, item, canvas, face) {
    return new Promise((resolve) => {
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            const pdfCanvas = document.getElementById(`amostra-pdf-canvas-${idx}`);
            if (pdfCanvas && pdfCanvas.width > 0) {
                canvas = pdfCanvas;
            } else {
                resolve();
                return;
            }
        }
        if (!supabaseClient) {
            resolve();
            return;
        }
        try {
            canvas.toBlob(async (blob) => {
                if (!blob) { resolve(); return; }
                try {
                    const fileName = `amostra_${face}_${osId}_${item.id}_${Date.now()}.jpg`;
                    const { error } = await supabaseClient
                        .storage
                        .from('amostras_renderizadas')
                        .upload(fileName, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });

                    if (!error) {
                        const { data: urlData } = supabaseClient.storage.from('amostras_renderizadas').getPublicUrl(fileName);
                        const publicUrl = urlData.publicUrl;
                        const dbField = face === 'verso' ? 'verso_amostra_arte_base64' : 'amostra_arte_base64';
                        await saveAmostraToDB(item.id, osId, { [dbField]: publicUrl });
                        if (face === 'verso') {
                            item.verso_amostra_arte_base64 = publicUrl;
                        } else {
                            item.amostra_arte_base64 = publicUrl;
                        }
                    } else {
                        console.warn('[Snapshot Sync] Upload error:', error);
                    }
                } catch(e) {
                    console.warn('[Snapshot Sync] Erro no upload:', e);
                }
                resolve();
            }, 'image/jpeg', 0.85);
        } catch(e) {
            console.warn('[Snapshot Sync] toBlob error:', e);
            resolve();
        }
    });
}

// Força a regeneração de TODOS os snapshots de uma OS usando canvas offscreen
// Garante que a imagem do link do cliente seja idêntica à janela combinada do editor
async function forceRegenerateSnapshots(osId) {
    // SEMPRE recarregar do banco para pegar a arte mais recente (após alterações)
    if (typeof loadOSItens === 'function') {
        try { await loadOSItens(osId); } catch (e) { console.warn('[Snapshot] Erro ao carregar itens:', e); }
    }
    const itens = state.osItens[osId] || [];
    if (!itens.length) { console.log('[Snapshot] Nenhum item para OS', osId); return; }

    // Garantir lookup tables carregadas (necessário quando chamado fora do editor)
    if (!state.cores  || !state.cores.length)         try { const { data } = await supabaseClient.from('producao_cores').select('*');       if (data) state.cores = data;       } catch(e) {}
    if (!state.numeracoes || !state.numeracoes.length) try { const { data } = await supabaseClient.from('producao_numeracoes').select('*'); if (data) state.numeracoes = data; } catch(e) {}
    if (!state.formatos || !state.formatos.length)     try { const { data } = await supabaseClient.from('producao_formatos').select('*');   if (data) state.formatos = data;   } catch(e) {}

    const S = 150 / 25.4; // 150 DPI — escala idêntica à janela combinada do editor

    for (let idx = 0; idx < itens.length; idx++) {
        const item = itens[idx];
        if (item.modo_pdf) continue;

        const corId      = item.amostra_cor_id || '';
        const numId      = item.amostra_num_id || '';
        const hasArteUrl  = !!(item.arte_url);
        const hasVersoUrl = !!(item.verso_arte_url);

        if (!corId && !numId && !hasArteUrl && !hasVersoUrl) {
            console.log(`[Snapshot] Item ${idx} sem camadas, pulando.`);
            continue;
        }

        console.log(`[Snapshot] Item ${idx} — cor:${corId||'—'} num:${numId||'—'} arte:${hasArteUrl} verso:${hasVersoUrl}`);

        // ════════════════════════════════════════════════════════════════
        // CAMINHO RÁPIDO: só tem arte_url — sem cor nem numeração
        // Copia a URL diretamente para amostra_arte_base64 no banco
        // (evita falha silenciosa de preload de elementos do DOM)
        // ════════════════════════════════════════════════════════════════
        if (!corId && !numId) {
            try {
                const updates = {};
                if (hasArteUrl)  { updates.amostra_arte_base64       = item.arte_url;       item.amostra_arte_base64       = item.arte_url; }
                if (hasVersoUrl) { updates.verso_amostra_arte_base64 = item.verso_arte_url; item.verso_amostra_arte_base64 = item.verso_arte_url; }
                if (Object.keys(updates).length > 0 && typeof saveAmostraToDB === 'function') {
                    await saveAmostraToDB(item.id, osId, updates);
                    console.log(`[Snapshot] Item ${idx} — URL da arte copiada diretamente (sem canvas).`);
                }
            } catch(e) { console.warn(`[Snapshot] Item ${idx} fast-path erro:`, e); }
            continue;
        }

        // ════════════════════════════════════════════════════════════════
        // CAMINHO COMPOSTO: tem cor e/ou numeração — compor as camadas via canvas
        // ════════════════════════════════════════════════════════════════
        const cor = corId ? (state.cores || []).find(c => c.id === corId) : null;
        const num = numId ? (state.numeracoes || []).find(n => String(n.id) === String(numId)) : null;

        // Preload SVG/PDF e aguardar carregamento real dos elementos
        if (num && num.elements && num.elements.length > 0 && typeof preloadAmostraItemPdfElements === 'function') {
            preloadAmostraItemPdfElements(num, idx, osId);
            const svgEls = num.elements.filter(e => e && (e.type === 'SVG' || e.type === 'PDF'));
            if (svgEls.length > 0) {
                await new Promise(resolve => {
                    let waited = 0;
                    const check = setInterval(() => {
                        waited += 100;
                        const allReady = svgEls.every(e => e._svgImage || e._pdfCanvas || waited >= 3000);
                        if (allReady) { clearInterval(check); resolve(); }
                    }, 100);
                });
            } else {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Resolver formato: cor > num > primeiro do state > fallback
        let fmt = null;
        if (cor && cor.formato_id)  fmt = (state.formatos || []).find(f => String(f.id) === String(cor.formato_id));
        if (!fmt && num && num.formato_id) fmt = (state.formatos || []).find(f => String(f.id) === String(num.formato_id));
        if (!fmt && state.formatos && state.formatos.length > 0) fmt = state.formatos[0];
        if (!fmt) fmt = { width_mm: 180, height_mm: 50 };

        try {
            // ── FRENTE ──
            const canvasFront = document.createElement('canvas');
            await drawAmostraFace(item, 'front', canvasFront, null, fmt, cor, num, idx, osId, S);
            if (canvasFront.width > 0 && canvasFront.height > 0) {
                await snapshotAmostraSync(idx, osId, item, canvasFront, 'frente');
                console.log(`[Snapshot] Item ${idx} FRENTE composto e salvo.`);
            }
            // ── VERSO ──
            if (item.verso || hasVersoUrl) {
                const canvasBack = document.createElement('canvas');
                await drawAmostraFace(item, 'back', canvasBack, null, fmt, cor, num, idx, osId, S);
                if (canvasBack.width > 0 && canvasBack.height > 0) {
                    await snapshotAmostraSync(idx, osId, item, canvasBack, 'verso');
                    console.log(`[Snapshot] Item ${idx} VERSO composto e salvo.`);
                }
            }
        } catch (e) { console.warn(`[Snapshot] Item ${idx} composite erro:`, e); }
    }
    console.log(`[Snapshot] Regeneração concluída para OS ${osId}`);
}
window.forceRegenerateSnapshots = forceRegenerateSnapshots;

// Expor globalmente
window.renderItemAmostraCombinada = renderItemAmostraCombinada;

window.customNumeracaoEditState = null;

function editCustomNumeracao(idx, osId, itemId) {
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    if (!numSelect || !numSelect.value) {
        toast('Selecione uma numeração base primeiro antes de editar!', 'warning');
        return;
    }
    
    const baseNumId = numSelect.value;
    const baseNum = state.numeracoes.find(n => String(n.id) === String(baseNumId));
    if (!baseNum) {
        toast('Numeração ID ' + baseNumId + ' não encontrada. IDs disponíveis: ' + state.numeracoes.slice(0,5).map(n => n.id).join(', '), 'warning');
        return;
    }
    
    const osItens = state.osItens[osId];
    if (!osItens) {
        toast('Itens da OS não carregados. Tente recarregar.', 'error');
        return;
    }
    
    const item = osItens.find(i => String(i.id) === String(itemId));
    if (!item) {
        toast('Item não encontrado nos itens da OS.', 'error');
        return;
    }
    
    const modelName = `${item.produto} (Modelo ${idx + 1})`;
    
    const os = (state.ordens || []).find(o => String(o.id) === String(osId) || String(o.id_int) === String(osId));
    const cliNum = os ? os.id_cliente : null;

    // Set custom state
    window.customNumeracaoEditState = {
        active: true,
        osId,
        itemId,
        idx,
        modelName,
        baseNumId,
        cliNum
    };
    
    // Mudar view
    showView('view-numeracao');
    
    setTimeout(() => {
        // Carrega numerao base
        editNumeracao(baseNumId);
        
        setTimeout(() => {
            // Limpa ID para forcar INSERT e altera o nome
            document.getElementById('num-id').value = '';
            document.getElementById('num-name').value = String(itemId);
            
            toast(`Editando numeração para o modelo: ${itemId}`, 'info');
        }, 150);
    }, 100);
}
window.onItemCorSelect = onItemCorSelect;
window.onItemNumSelect = onItemNumSelect;
window.onItemArteUpload = onItemArteUpload;
window.onItemArteRemove = onItemArteRemove;
window.saveAmostraToDB = saveAmostraToDB;
window.editCustomNumeracao = editCustomNumeracao;

window.toggleImpNumEditButtons = function() {
    const num1 = document.getElementById('imp-numeracao');
    const btn1 = document.getElementById('btn-edit-imp-num-1');
    if (num1 && btn1) {
        btn1.style.display = num1.value ? 'inline-flex' : 'none';
    }
    
    const num2 = document.getElementById('imp-numeracao-2');
    const btn2 = document.getElementById('btn-edit-imp-num-2');
    if (num2 && btn2) {
        btn2.style.display = num2.value ? 'inline-flex' : 'none';
    }
};

window.togglePedNumEditButtons = function() {
    const num1 = document.getElementById('ped-numeracao');
    const btnEdit1 = document.getElementById('btn-edit-ped-num-1');
    const btnSelect1 = document.getElementById('btn-select-ped-num-1');
    const activeOSItem = state.activeOSItem;
    const hasClient = activeOSItem ? true : false;

    if (num1 && btnEdit1) {
        btnEdit1.style.display = num1.value ? 'inline-flex' : 'none';
    }
    if (btnSelect1) {
        btnSelect1.style.display = hasClient ? 'inline-flex' : 'none';
    }
    
    const num2 = document.getElementById('ped-numeracao-2');
    const btnEdit2 = document.getElementById('btn-edit-ped-num-2');
    const btnSelect2 = document.getElementById('btn-select-ped-num-2');
    if (num2 && btnEdit2) {
        btnEdit2.style.display = num2.value ? 'inline-flex' : 'none';
    }
    if (btnSelect2) {
        btnSelect2.style.display = hasClient ? 'inline-flex' : 'none';
    }
};

window.showClienteNumeracoesModal = function(fieldId, forceIdCliente = null) {
    console.log('[showClienteNumeracoesModal] started. fieldId:', fieldId, 'forceIdCliente:', forceIdCliente);
    let idCliente = forceIdCliente;
    if (!idCliente) {
        const activeOSItem = state.activeOSItem;
        console.log('[showClienteNumeracoesModal] activeOSItem:', activeOSItem);
        if (activeOSItem) {
            const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
            console.log('[showClienteNumeracoesModal] Found OS:', os);
            if (os) idCliente = os.id_cliente;
        }
    }
    
    console.log('[showClienteNumeracoesModal] idCliente resolved to:', idCliente);
    if (!idCliente) {
        toast('Este pedido não está associado a um cliente válido! (Cliente ID: ' + idCliente + ')', 'warning');
        return;
    }

    const modal = document.getElementById('modal-cliente-numeracoes');
    const list = document.getElementById('cliente-numeracoes-list');
    if (!modal || !list) return;

    // Filtrar numerações que tenham Cli_Num igual ao idCliente
    const filtered = (state.numeracoes || []).filter(n => String(n.Cli_Num || '') === String(idCliente));

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align: center; color: var(--text-dim); padding: 20px;">Nenhuma numeração customizada encontrada para este cliente.</p>`;
    } else {
        list.innerHTML = filtered.map(n => `
            <div class="cliente-num-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px;">
                <div style="flex: 1; padding-right: 12px;">
                    <strong style="color: #fff; font-size: 0.9rem;">${n.name}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
                        Tipo: ${n.tipo || 'SEQUENCIAL'} | Formatos: ${(n.formato_ids || [n.formato_id]).map(id => state.formatos.find(f => String(f.id) === String(id))?.name || id).join(', ')}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="selectClienteNumeracaoForField('${fieldId}', '${n.id}')">Selecionar</button>
            </div>
        `).join('');
    }

    modal.style.display = 'flex';
};

window.closeClienteNumeracoesModal = function() {
    const modal = document.getElementById('modal-cliente-numeracoes');
    if (modal) modal.style.display = 'none';
};

window.selectClienteNumeracaoForField = function(fieldId, numId) {
    const numSelect = document.getElementById(fieldId);
    if (numSelect) {
        const newNum = state.numeracoes.find(n => String(n.id) === String(numId));
        if (newNum) {
            if (!Array.from(numSelect.options).some(o => o.value === newNum.id)) {
                const opt = document.createElement('option');
                opt.value = newNum.id;
                opt.textContent = newNum.name;
                numSelect.appendChild(opt);
            }
            numSelect.value = newNum.id;
            numSelect.dispatchEvent(new Event('change'));
        }
    }
    window.closeClienteNumeracoesModal();
};

window.editImposicaoCustomNumeracao = function(fieldId) {
    const numSelect = document.getElementById(fieldId);
    if (!numSelect || !numSelect.value) {
        toast('Selecione uma numeração base primeiro antes de editar!', 'warning');
        return;
    }
    
    const impName = document.getElementById('imp-name').value.trim() || 'Modelo Imposição';
    const numId = numSelect.value;
    const baseNum = state.numeracoes.find(n => String(n.id) === String(numId));
    if (!baseNum) return;
    
    const activeOSItem = state.activeOSItem;
    let cliNum = null;
    if (activeOSItem) {
        const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
        if (os) cliNum = os.id_cliente;
    }

    // Configura o state para que no saveNumeracao volte para Imposição
    window.customNumeracaoEditState = {
        view: 'imposicao',
        fieldId: fieldId,
        modeloName: impName,
        cliNum: cliNum
    };
    
    // Abre a numeração
    editNumeracao(numId);
    
    // Força o nome no editor da numeração a ser o ID do modelo atual
    document.getElementById('num-name').value = String(activeOSItem.itemId);
    
    // Marca como um novo cadastro (clone)
    document.getElementById('num-id').value = '';
    toast(`Clonando base "${baseNum.name}" para edição customizada.`, 'info');
};

/**
 * Salva a decisão (APROVADA/REPROVADA) de um item de amostra
 */
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
            const item = state.osItens[osId].find(i => String(i.id) === String(itemId));
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
                    // Atualizar localStorage
                    const ov = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                    ov[osId] = novoStatusOS;
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

/**
 * Salva a observação de um item de amostra
 */
function saveAmostraItemObs(itemId, osId, obs) {
    saveAmostraToDB(itemId, osId, { amostra_obs: obs });
}

/**
 * Limpa o pedido ativo da tela de Amostras, voltando ao modo avulso
 */
function clearAmostrasOS() {
    state.amostrasOSAtivo = null;
    const container = document.getElementById('amostras-itens-container');
    const banner = document.getElementById('amostras-os-banner');
    const avulsa = document.getElementById('amostra-combinada-avulsa');
    
    if (container) container.innerHTML = '';
    if (banner) banner.style.display = 'none';
    if (avulsa) avulsa.style.display = '';

    if (typeof window.showView === 'function') {
        window.showView('view-lista-arte');
    } else if (typeof showView === 'function') {
        showView('view-lista-arte');
    }
}


// --- Funções de Briefing e Designers (Tabela: pedidos_artes) ---

async function loadBriefingBase(osId, osIntId) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('pedidos_artes')
            .select('*')
            .eq('id_int', osIntId);
            
        if (error) {
            if (error.code !== '42P01') throw error;
            console.warn("Tabela pedidos_artes não existe.");
            return;
        }
        
        let mergedData = null;
        if (data && data.length > 0) {
             console.log("loadBriefingBase: encontrou dados em pedidos_artes", data);
             mergedData = { observacoes: {} };
             data.forEach(row => {
                  if (row.nome_evento) mergedData.nome_evento = row.nome_evento;
                  if (row.data_evento) mergedData.data_evento = row.data_evento;
                  if (row.local_evento) mergedData.local_evento = row.local_evento;
                  if (row.designer_uid) mergedData.designer_uid = row.designer_uid;
                  if (row.designer_nome) mergedData.designer_nome = row.designer_nome;
                  if (row.observacoes && Object.keys(row.observacoes).length > 0) {
                      mergedData.observacoes = Object.assign(mergedData.observacoes, row.observacoes);
                  }
             });
        }
        
        if (!state.pedidosArtesData) state.pedidosArtesData = {};
        state.pedidosArtesData[osIntId] = mergedData;
        updateBriefingUI(osId, osIntId);
    } catch (e) {
        console.error("Erro ao carregar briefing:", e);
    }
}

/**
 * Lightbox para pré-visualização de imagem/PDF do anexo
 */
function openAnexoLightbox(url, name) {
    let modal = document.getElementById('anexo-lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'anexo-lightbox-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(5px);';
        document.body.appendChild(modal);
    }

    const isPdf = url.toLowerCase().includes('.pdf');

    modal.innerHTML = `
        <div style="position:absolute;top:20px;right:25px;display:flex;gap:12px;align-items:center;z-index:100000;">
            <a href="${url}" download="${name}" target="_blank" class="btn btn-primary btn-sm" style="font-weight:700;padding:6px 14px;background:#3b82f6;color:white;border-radius:6px;text-decoration:none;">📥 Download</a>
            <button onclick="document.getElementById('anexo-lightbox-modal').style.display='none'" class="btn btn-secondary btn-sm" style="font-size:1.2rem;padding:4px 12px;cursor:pointer;color:white;background:rgba(255,255,255,0.2);border:none;border-radius:6px;">✕ Fechar</button>
        </div>
        <div style="max-width:90vw;max-height:82vh;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${isPdf 
                ? `<iframe src="${url}" style="width:85vw;height:80vh;border:none;border-radius:8px;background:white;"></iframe>`
                : `<img src="${url}" alt="${name}" style="max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" />`
            }
        </div>
        <div style="color:white;font-weight:600;margin-top:14px;font-size:0.95rem;text-shadow:0 1px 3px rgba(0,0,0,0.8);">${name}</div>
    `;
    modal.style.display = 'flex';
}

/**
 * Alterna a seleção de todos os checkboxes de anexos do pedido
 */
function toggleSelectAllAnexos(osId, checked) {
    const checkboxes = document.querySelectorAll(`.anexo-checkbox-${osId}`);
    checkboxes.forEach(cb => {
        cb.checked = checked;
    });
    updateAnexoSelectionCount(osId);
}

/**
 * Atualiza o contador e rótulo do botão de download em lote/ZIP e exibição de botões de ocultar em lote
 */
function updateAnexoSelectionCount(osId, osNum) {
    const checkboxes = Array.from(document.querySelectorAll(`.anexo-checkbox-${osId}`));
    const selectedCount = checkboxes.filter(cb => cb.checked).length;
    const btn = document.getElementById(`btn-download-zip-${osId}`);
    const btnOcultar = document.getElementById(`btn-ocultar-lote-${osId}`);
    const selectAllCb = document.getElementById(`select-all-anexos-${osId}`);

    if (selectAllCb) {
        selectAllCb.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
    }

    if (btn) {
        if (selectedCount > 0) {
            btn.innerHTML = `📦 Baixar Selecionados (${selectedCount})`;
            btn.style.background = 'rgba(59,130,246,0.25)';
            btn.style.borderColor = '#3b82f6';
        } else {
            btn.innerHTML = `📦 Baixar Todos (ZIP)`;
            btn.style.background = 'rgba(59,130,246,0.15)';
            btn.style.borderColor = 'rgba(59,130,246,0.3)';
        }
    }

    if (btnOcultar) {
        if (selectedCount > 0) {
            btnOcultar.style.display = 'inline-flex';
            btnOcultar.innerHTML = `🙈 Ocultar (${selectedCount})`;
        } else {
            btnOcultar.style.display = 'none';
        }
    }
}

/**
 * Alterna a visibilidade (oculto: true/false) de anexos específicos e persiste no Supabase
 */
async function toggleOcultarAnexos(osId, osNum, targetIds, novoStatusOculto) {
    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    try {
        const { data: existing, error: selectErr } = await supabaseClient
            .from('pedidos_artes')
            .select('id, arquivos')
            .eq('id_int', numInt);

        if (selectErr) throw selectErr;
        if (!existing || existing.length === 0) return;

        let curArquivos = existing[0].arquivos;
        if (typeof curArquivos === 'string') {
            try { curArquivos = JSON.parse(curArquivos); } catch(e) {}
        }
        if (!Array.isArray(curArquivos)) return;

        let alterado = false;
        curArquivos.forEach(arq => {
            const arqId = arq.id || arq.url || arq.storage_path || arq.nome_arquivo || arq.nome;
            if (targetIds.includes(arqId) || targetIds.includes(arq.nome_arquivo) || targetIds.includes(arq.nome) || targetIds.includes(arq.url)) {
                arq.oculto = novoStatusOculto;
                alterado = true;
            }
        });

        if (alterado) {
            const { error: updateErr } = await supabaseClient
                .from('pedidos_artes')
                .update({ arquivos: curArquivos })
                .eq('id_int', numInt);

            if (updateErr) throw updateErr;

            toast(novoStatusOculto ? 'Anexo(s) ocultado(s) com sucesso!' : 'Anexo(s) reexibido(s) com sucesso!', 'success');
        }

        loadAnexosPedido(osId, osNum);
    } catch (err) {
        console.error('Erro ao alterar visibilidade de anexos:', err);
        toast('Erro ao atualizar anexo: ' + err.message, 'error');
    }
}

/**
 * Oculta em lote os anexos selecionados via checkbox
 */
async function toggleOcultarAnexosSelecionados(osId, osNum, novoStatusOculto = true) {
    const checkboxes = Array.from(document.querySelectorAll(`.anexo-checkbox-${osId}`));
    const selectedCbs = checkboxes.filter(cb => cb.checked);
    if (selectedCbs.length === 0) {
        toast('Selecione ao menos um anexo para ocultar.', 'warning');
        return;
    }
    const targetIds = selectedCbs.map(cb => cb.dataset.id || cb.dataset.name || cb.dataset.url);
    await toggleOcultarAnexos(osId, osNum, targetIds, novoStatusOculto);
}

/**
 * Baixa apenas os anexos selecionados (ou todos se nenhum estiver marcado) num arquivo ZIP
 */
async function downloadAnexosSelecionadosZip(osId, osNum) {
    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    const checkboxes = Array.from(document.querySelectorAll(`.anexo-checkbox-${osId}`));
    let selectedCbs = checkboxes.filter(cb => cb.checked);

    if (selectedCbs.length === 0) {
        selectedCbs = checkboxes;
    }

    if (selectedCbs.length === 0) {
        toast('Nenhum anexo disponível para download.', 'warning');
        return;
    }

    if (typeof JSZip === 'undefined') {
        toast('Carregando biblioteca de ZIP...', 'info');
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    try {
        toast(`Compactando ${selectedCbs.length} anexo(s) em ZIP...`, 'info');
        const zip = new JSZip();

        for (let i = 0; i < selectedCbs.length; i++) {
            const cb = selectedCbs[i];
            const url = cb.dataset.url;
            const name = cb.dataset.name || `anexo_${i + 1}`;
            
            try {
                const resp = await fetch(url);
                const blob = await resp.blob();
                zip.file(name, blob);
            } catch (err) {
                console.warn(`Erro ao baixar ${name} para o ZIP:`, err);
            }
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Anexos_Selecionados_Pedido_${numInt}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        toast(`Download ZIP (${selectedCbs.length} arquivo(s)) concluído com sucesso!`, 'success');
    } catch (e) {
        console.error('Erro ao gerar ZIP dos anexos:', e);
        toast('Erro ao gerar ZIP: ' + e.message, 'error');
    }
}

/**
 * Carrega e exibe os anexos vinculados ao pedido da coluna 'arquivos' (jsonb) na tabela 'pedidos_artes'
 */
async function loadAnexosPedido(osId, osNum) {
    const container = document.getElementById(`anexos-pedido-container-${osId}`);
    if (!container || !osNum) return;

    const numInt = parseInt(osNum);
    if (isNaN(numInt)) return;

    // Verificar se o toggle 'Mostrar Ocultados' está ativado
    const showHiddenCb = document.getElementById(`show-hidden-anexos-${osId}`);
    const showHidden = showHiddenCb ? showHiddenCb.checked : false;

    let anexosList = [];

    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            // Buscar exclusivamente da coluna 'arquivos' (jsonb) na tabela 'pedidos_artes'
            const { data: artesData } = await supabaseClient
                .from('pedidos_artes')
                .select('arquivos, storage_path, nome_arquivo, storage_bucket, mime_type, created_at, updated_at')
                .eq('id_int', numInt);

            if (artesData && artesData.length > 0) {
                artesData.forEach(pa => {
                    let arqs = pa.arquivos;
                    if (typeof arqs === 'string') {
                        try { arqs = JSON.parse(arqs); } catch(e) {}
                    }
                    if (arqs && Array.isArray(arqs)) {
                        arqs.forEach(arq => {
                            let fileUrl = arq.url || arq.public_url || arq.publicUrl;
                            const bucket = arq.storage_bucket || pa.storage_bucket || 'chat-ideal';
                            
                            if (!fileUrl && arq.storage_path) {
                                const { data: pUrl } = supabaseClient.storage.from(bucket).getPublicUrl(arq.storage_path);
                                fileUrl = pUrl?.publicUrl;
                            }
                            if (!fileUrl && arq.path) {
                                const { data: pUrl } = supabaseClient.storage.from(bucket).getPublicUrl(arq.path);
                                fileUrl = pUrl?.publicUrl;
                            }

                            if (fileUrl) {
                                anexosList.push({
                                    id: arq.id || crypto.randomUUID(),
                                    nome: arq.nome_arquivo || arq.nome || arq.name || arq.filename || 'Anexo',
                                    url: fileUrl,
                                    tamanho: arq.tamanho_bytes || arq.tamanho || arq.size || 0,
                                    tipo: arq.mime_type || arq.tipo || arq.type || '',
                                    origem: arq.enviado_por || 'Arte/Comercial',
                                    data: arq.created_at || arq.uploaded_at || arq.data || pa.created_at,
                                    oculto: !!arq.oculto
                                });
                            }
                        });
                    }

                    // Fallback se houver arquivo raiz individual salvo na pedidos_artes
                    if (pa.storage_path && pa.nome_arquivo && anexosList.length === 0) {
                        const bucket = pa.storage_bucket || 'chat-ideal';
                        const { data: pUrl } = supabaseClient.storage.from(bucket).getPublicUrl(pa.storage_path);
                        if (pUrl?.publicUrl) {
                            anexosList.push({
                                id: pa.id || pa.storage_path,
                                nome: pa.nome_arquivo,
                                url: pUrl.publicUrl,
                                tamanho: 0,
                                tipo: pa.mime_type || '',
                                origem: 'Arte Principal',
                                data: pa.created_at,
                                oculto: false
                            });
                        }
                    }
                });
            }
        }

        if (anexosList.length === 0) {
            container.innerHTML = `
                <div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 16px; background: rgba(0,0,0,0.02); border: 1px dashed var(--border); border-radius: 8px;">
                    📎 Nenhum anexo cadastrado neste pedido.
                </div>
            `;
            return;
        }

        const hiddenCount = anexosList.filter(a => a.oculto).length;
        const visibleList = showHidden ? anexosList : anexosList.filter(a => !a.oculto);

        const selectAllBar = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 10px 8px; font-size: 0.78rem; color: var(--text-dim); border-bottom: 1px solid var(--border); margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; margin: 0; color: var(--text);">
                        <input type="checkbox" id="select-all-anexos-${osId}" onchange="toggleSelectAllAnexos('${osId}', this.checked)" style="accent-color: #3b82f6; width: 15px; height: 15px; cursor: pointer;" />
                        Selecionar Todos
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; margin: 0; color: ${hiddenCount > 0 ? '#8b5cf6' : 'var(--text-dim)'}; font-size: 0.76rem;" title="Exibir anexos que foram ocultados">
                        <input type="checkbox" id="show-hidden-anexos-${osId}" ${showHidden ? 'checked' : ''} onchange="loadAnexosPedido('${osId}', '${osNum}')" style="accent-color: #8b5cf6; width: 14px; height: 14px; cursor: pointer;" />
                        👁️ Mostrar Ocultados ${hiddenCount > 0 ? `(${hiddenCount})` : ''}
                    </label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="btn-ocultar-lote-${osId}" onclick="toggleOcultarAnexosSelecionados('${osId}', '${osNum}', true)" class="btn btn-sm" style="display: none; padding: 3px 10px; font-size: 0.75rem; font-weight: 700; background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; align-items: center; gap: 4px;" title="Ocultar anexos selecionados">
                        🙈 Ocultar Selecionados
                    </button>
                    <span style="font-size: 0.72rem; color: var(--text-dim);">${visibleList.length} de ${anexosList.length} arquivo(s)</span>
                </div>
            </div>
        `;

        if (visibleList.length === 0) {
            container.innerHTML = selectAllBar + `
                <div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 16px; background: rgba(0,0,0,0.02); border: 1px dashed var(--border); border-radius: 8px;">
                    🙈 Todos os anexos deste pedido estão ocultados. Marque "Mostrar Ocultados" para visualizá-los.
                </div>
            `;
            return;
        }

        const itemsHtml = visibleList.map(anx => {
            const ext = (anx.nome.split('.').pop() || '').toLowerCase();
            const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
            const isPdf = ['pdf'].includes(ext);

            let thumbHtml = '';
            if (isImage) {
                thumbHtml = `
                    <img src="${anx.url}" alt="${anx.nome}" onclick="openAnexoLightbox('${anx.url}', '${anx.nome}')" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; cursor: zoom-in; border: 1px solid var(--border); flex-shrink: 0; background: #000;" title="Clique para ampliar preview" />
                `;
            } else {
                let icon = '📄';
                let iconBg = 'rgba(59,130,246,0.15)';
                let iconColor = '#3b82f6';
                if (isPdf) {
                    icon = '📕';
                    iconBg = 'rgba(239,68,68,0.15)';
                    iconColor = '#ef4444';
                } else if (['zip', 'rar', '7z', 'gz'].includes(ext)) {
                    icon = '📦';
                    iconBg = 'rgba(245,158,11,0.15)';
                    iconColor = '#f59e0b';
                }
                thumbHtml = `
                    <div onclick="${isPdf ? `openAnexoLightbox('${anx.url}', '${anx.nome}')` : ''}" style="width: 44px; height: 44px; border-radius: 8px; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; ${isPdf ? 'cursor: pointer;' : ''}">
                        ${icon}
                    </div>
                `;
            }

            const sizeMb = anx.tamanho > 0 ? (anx.tamanho > 1048576 ? `${(anx.tamanho / 1048576).toFixed(1)} MB` : `${Math.round(anx.tamanho / 1024)} KB`) : '';
            const dataFmt = anx.data ? formatDateTime(anx.data) : '';

            const isOculto = anx.oculto;
            const containerStyle = isOculto
                ? 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px dashed rgba(239,68,68,0.4); border-radius: 8px; background: rgba(239,68,68,0.03); gap: 12px; transition: all 0.2s; opacity: 0.7;'
                : 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.015); gap: 12px; transition: all 0.2s;';

            return `
                <div style="${containerStyle}">
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                        <input type="checkbox" class="anexo-checkbox-${osId}" data-id="${anx.id}" data-url="${anx.url}" data-name="${anx.nome}" onchange="updateAnexoSelectionCount('${osId}', '${osNum}')" style="accent-color: #3b82f6; width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;" />
                        ${thumbHtml}
                        <div style="min-width: 0;">
                            <div style="font-weight: 700; color: var(--text); font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; display: flex; align-items: center; gap: 6px;" onclick="openAnexoLightbox('${anx.url}', '${anx.nome}')" title="Clique para abrir preview de ${anx.nome}">
                                <span>${anx.nome}</span>
                                ${isOculto ? `<span style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">🙈 Oculto</span>` : ''}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px;">
                                ${sizeMb ? `<span>${sizeMb}</span>` : ''}
                                ${dataFmt ? `<span title="Data de Upload">📅 ${dataFmt}</span>` : ''}
                                ${anx.origem ? `<span>Por: ${anx.origem}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0; align-items: center;">
                        ${isOculto ? `
                            <button onclick="toggleOcultarAnexos('${osId}', '${osNum}', ['${anx.id}'], false)" class="btn btn-sm" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3); border-radius: 6px;" title="Reexibir / Desocultar anexo">
                                👁️ Reexibir
                            </button>
                        ` : `
                            <button onclick="toggleOcultarAnexos('${osId}', '${osNum}', ['${anx.id}'], true)" class="btn btn-sm" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(0,0,0,0.03); color: var(--text-dim); border: 1px solid var(--border); border-radius: 6px;" title="Ocultar anexo da listagem">
                                🙈 Ocultar
                            </button>
                        `}
                        <button onclick="openAnexoLightbox('${anx.url}', '${anx.nome}')" class="btn btn-sm" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(255,255,255,0.05); color: var(--text); border: 1px solid var(--border); border-radius: 6px;" title="Visualizar Preview">
                            👁️ Preview
                        </button>
                        <a href="${anx.url}" target="_blank" download="${anx.nome}" rel="noopener" class="btn btn-sm" style="padding: 4px 10px; font-size: 0.75rem; font-weight: 700; background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            📥 Download
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = selectAllBar + itemsHtml;
        updateAnexoSelectionCount(osId, osNum);

    } catch (e) {
        console.error('Erro ao carregar anexos do pedido:', e);
        container.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 12px;">Erro ao carregar anexos.</div>`;
    }
}




async function uploadAnexoPedido(osId, osNum) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
        if (!input.files || input.files.length === 0) return;
        const files = Array.from(input.files);
        const numInt = parseInt(osNum);
        if (isNaN(numInt)) return;

        try {
            toast(`Enviando ${files.length} anexo(s)...`, 'info');

            for (const file of files) {
                const fileName = `anexo_${numInt}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const storagePath = `pedidos-artes/${numInt}/${fileName}`;
                
                const { error: uploadErr } = await supabaseClient.storage
                    .from('chat-ideal')
                    .upload(storagePath, file, { upsert: true });

                if (uploadErr) throw uploadErr;

                const { data: urlData } = supabaseClient.storage.from('chat-ideal').getPublicUrl(storagePath);
                const publicUrl = urlData?.publicUrl;

                const { data: existing } = await supabaseClient
                    .from('pedidos_artes')
                    .select('id, arquivos')
                    .eq('id_int', numInt);

                let curArquivos = [];
                if (existing && existing.length > 0 && Array.isArray(existing[0].arquivos)) {
                    curArquivos = [...existing[0].arquivos];
                }

                curArquivos.push({
                    id: crypto.randomUUID(),
                    nome_arquivo: file.name,
                    storage_path: storagePath,
                    storage_bucket: 'chat-ideal',
                    url: publicUrl,
                    tamanho_bytes: file.size,
                    mime_type: file.type,
                    created_at: new Date().toISOString(),
                    enviado_por: 'Arte / Imposição',
                    oculto: false
                });

                if (existing && existing.length > 0) {
                    await supabaseClient.from('pedidos_artes')
                        .update({ arquivos: curArquivos })
                        .eq('id_int', numInt);
                } else {
                    await supabaseClient.from('pedidos_artes')
                        .insert({ id_int: numInt, arquivos: curArquivos });
                }
            }

            toast('Anexo(s) enviado(s) com sucesso!', 'success');
            loadAnexosPedido(osId, osNum);
        } catch (err) {
            console.error('Erro ao enviar anexo:', err);
            toast('Erro ao enviar anexo: ' + err.message, 'error');
        }
    };
    input.click();
}

window.openAnexoLightbox = openAnexoLightbox;
window.toggleSelectAllAnexos = toggleSelectAllAnexos;
window.updateAnexoSelectionCount = updateAnexoSelectionCount;
window.downloadAnexosSelecionadosZip = downloadAnexosSelecionadosZip;
window.loadAnexosPedido = loadAnexosPedido;
window.uploadAnexoPedido = uploadAnexoPedido;
window.toggleOcultarAnexos = toggleOcultarAnexos;
window.toggleOcultarAnexosSelecionados = toggleOcultarAnexosSelecionados;



async function selecionarPedidoDoCliente(targetNum, clienteNome) {
    if (!targetNum) return;
    const targetNumStr = String(targetNum);
    const targetNumInt = parseInt(targetNum);

    let os = state.ordens ? state.ordens.find(o => String(o.numero) === targetNumStr || String(o.id_int) === targetNumStr || o.id === targetNumStr) : null;
    
    if (!os) {
        os = {
            id: targetNumStr,
            id_int: targetNumInt,
            numero: targetNumInt,
            cliente: clienteNome || 'Cliente',
            vendedor: ''
        };
        if (!state.ordens) state.ordens = [];
        state.ordens.push(os);
    }

    if (clienteNome && (!os.cliente || os.cliente === 'Cliente')) {
        os.cliente = clienteNome;
    }

    await navigateToAmostrasFromOS(os.id);
}
window.selecionarPedidoDoCliente = selecionarPedidoDoCliente;

async function loadUltimosPedidos(osId, clienteNome) {
    const currentOS = state.ordens ? state.ordens.find(o => o.id === osId || String(o.numero) === String(osId) || String(o.id_int) === String(osId)) : null;
    const currentNumInt = currentOS ? parseInt(currentOS.numero || currentOS.id_int || osId) : parseInt(osId);

    // Se clienteNome estiver ausente ou for 'Cliente', buscar nome real na tabela de propostas no banco
    if ((!clienteNome || clienteNome.trim().toLowerCase() === 'cliente') && currentNumInt && typeof supabaseClient !== 'undefined') {
        try {
            const { data: pProp } = await supabaseClient
                .from('propostas')
                .select('cliente')
                .eq('id_int', currentNumInt)
                .maybeSingle();
            if (pProp && pProp.cliente) {
                clienteNome = pProp.cliente;
                if (currentOS) currentOS.cliente = pProp.cliente;
            }
        } catch (e) {}
    }

    if (!clienteNome || typeof supabaseClient === 'undefined') return;
    
    try {
        console.log("Buscando histórico para o cliente:", clienteNome);

        // 1. Buscar os últimos pedidos em propostas para este cliente
        const { data: propostasData, error: errProp } = await supabaseClient
            .from('propostas')
            .select('id_int, created_at')
            .ilike('cliente', `%${clienteNome.trim()}%`)
            .order('created_at', { ascending: false })
            .limit(6);
            
        if (errProp) throw errProp;
        let propostas = propostasData || [];

        // Garantir que o pedido atual esteja presente na listagem para permitir retornar a ele
        if (currentNumInt && !isNaN(currentNumInt) && !propostas.some(p => p.id_int === currentNumInt)) {
            propostas.unshift({
                id_int: currentNumInt,
                created_at: currentOS?.created_at || new Date().toISOString()
            });
        }
        
        if (!propostas || propostas.length === 0) {
            const container = document.getElementById(`ultimos-pedidos-container-${osId}`);
            if (container) container.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 16px; background: rgba(0,0,0,0.02); border-radius: 8px;">Nenhum pedido anterior encontrado para<br><strong>${clienteNome}</strong></div>`;
            return;
        }
        
        const idInts = propostas.map(p => p.id_int);
        
        // 2. Buscar dados dos eventos na tabela pedidos_artes
        const { data: artes, error: errArtes } = await supabaseClient
            .from('pedidos_artes')
            .select('id_int, nome_evento, data_evento')
            .in('id_int', idInts);
            
        if (errArtes && errArtes.code !== '42P01') throw errArtes;
        
        const eventoMap = {};
        if (artes) {
            artes.forEach(a => {
                if (a.nome_evento || a.data_evento) {
                    if (!eventoMap[a.id_int]) eventoMap[a.id_int] = a;
                }
            });
        }
        
        const safeClienteName = clienteNome.replace(/'/g, "\\'");

        // 3. Montar HTML de exibição interativo com clique e destaque do pedido atual
        const html = propostas.map(p => {
            const ev = eventoMap[p.id_int] || {};
            const nome = ev.nome_evento ? ev.nome_evento : 'Evento não informado no Briefing';
            const dataEv = ev.data_evento ? `<div style="margin-top: 4px; font-size: 0.82rem; color: var(--text-dim)"><i class="fa-regular fa-calendar"></i> Evento: ${ev.data_evento}</div>` : '';
            let dataCriacao = '';
            if (p.created_at) {
                const d = new Date(p.created_at);
                dataCriacao = d.toLocaleDateString('pt-BR');
            }

            const isCurrent = (p.id_int === currentNumInt || String(p.id_int) === String(osId));

            const borderStyle = isCurrent 
                ? '2px solid #14b8a6' 
                : '1px solid var(--border)';
            const bgStyle = isCurrent 
                ? 'linear-gradient(135deg, rgba(20, 184, 166, 0.14), rgba(6, 182, 212, 0.2))' 
                : 'rgba(0,0,0,0.015)';
            const shadowStyle = isCurrent 
                ? '0 2px 10px rgba(20, 184, 166, 0.25)' 
                : 'none';

            return `
                <div onclick="selecionarPedidoDoCliente(${p.id_int}, '${safeClienteName}')" 
                     title="${isCurrent ? 'Pedido Atual Exibido' : 'Clique para alternar para o Pedido #' + p.id_int}"
                     style="padding: 12px; border: ${borderStyle}; border-radius: 8px; background: ${bgStyle}; box-shadow: ${shadowStyle}; cursor: pointer; transition: all 0.2s ease;"
                     onmouseover="${!isCurrent ? "this.style.borderColor='#14b8a6'; this.style.transform='translateY(-2px)';" : ''}"
                     onmouseout="${!isCurrent ? "this.style.borderColor='var(--border)'; this.style.transform='none';" : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 800; font-size: 0.95rem; color: ${isCurrent ? '#14b8a6' : 'var(--primary)'};">
                            #${p.id_int}
                            ${isCurrent ? `<span style="font-size: 0.65rem; background: #14b8a6; color: white; padding: 2px 6px; border-radius: 10px; font-weight: 800; margin-left: 6px;">📍 ATUAL</span>` : ''}
                        </span>
                        <span style="font-size: 0.8rem; color: var(--text-dim); background: rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 12px;">${dataCriacao}</span>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text);">
                        ${nome}
                    </div>
                    ${dataEv}
                </div>
            `;
        }).join('');
        
        const container = document.getElementById(`ultimos-pedidos-container-${osId}`);
        if (container) container.innerHTML = html;
        
    } catch (e) {
        console.error("Erro ao carregar últimos pedidos:", e);
        const container = document.getElementById(`ultimos-pedidos-container-${osId}`);
        if (container) container.innerHTML = `<div style="font-size: 0.8rem; color: var(--red); text-align: center;">Erro ao carregar histórico.</div>`;
    }
}

function updateBriefingUI(osId, osIntId) {
    if (!state.pedidosArtesData) state.pedidosArtesData = {};
    const data = state.pedidosArtesData[osIntId] || {};
    
    // Atualiza campos do Briefing
    const nomeEl = document.getElementById(`briefing-nome-${osId}`);
    const dataEl = document.getElementById(`briefing-data-${osId}`);
    const localEl = document.getElementById(`briefing-local-${osId}`);
    
    if (nomeEl) nomeEl.value = data.nome_evento || '';
    if (dataEl) dataEl.value = data.data_evento ? data.data_evento.split('T')[0].split('-').reverse().join('/') : '';
    if (localEl) localEl.value = data.local_evento || '';
    
    
    console.log("updateBriefingUI executado para osId:", osId, "Dados recebidos:", data);
    
    // Atualiza observações por produto (accordion) agrupando pelo produto pai
    const obsObj = data.observacoes || {};
    const itens = state.osItens[osId] || [];
    let uniqueProductsSet = new Set();
    
    itens.forEach(item => {
        let prodId = item.id_produto_proposta_origem || item.nome_produto_real || item.produto || item.id;
        if (!uniqueProductsSet.has(prodId)) {
            uniqueProductsSet.add(prodId);
            const obsEl = document.getElementById(`briefing-obs-item-${prodId}`);
            if (obsEl) {
                let val = '';
                if (prodId in obsObj) val = obsObj[prodId];
                else if (`item_${prodId}` in obsObj) val = obsObj[`item_${prodId}`];
                else val = item.observacoes || '';
                
                if (typeof val === 'string' && val.includes('<')) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = val;
                    val = tmp.textContent || tmp.innerText || '';
                }
                
                obsEl.value = val.trim();
            }
        }
    });

    // Atualiza Designer Ideal Selecionado no container
    const desContainer = document.getElementById(`designers-box-container-${osId}`);
    if (desContainer) {
        desContainer.innerHTML = renderDesignersBoxHTML(osId, osIntId);
    }
}

let briefingSaveTimeout = null;
async function saveBriefingField(osIntId, field, value, isObs = false, itemId = null) {
    if (!osIntId || typeof supabaseClient === 'undefined') return;
    
    if (!state.pedidosArtesData) state.pedidosArtesData = {};
    
    if (isObs) {
        if (!state.pedidosArtesData[osIntId]) state.pedidosArtesData[osIntId] = { observacoes: {} };
        if (!state.pedidosArtesData[osIntId].observacoes) state.pedidosArtesData[osIntId].observacoes = {};
        state.pedidosArtesData[osIntId].observacoes[itemId] = value;
    } else {
        if (!state.pedidosArtesData[osIntId]) state.pedidosArtesData[osIntId] = {};
        state.pedidosArtesData[osIntId][field] = value;
    }

    clearTimeout(briefingSaveTimeout);
    briefingSaveTimeout = setTimeout(async () => {
        try {
            const current = state.pedidosArtesData[osIntId] || {};
            const payload = {

                id_int: osIntId,
                nome_evento: current.nome_evento || null,
                data_evento: current.data_evento || null,
                local_evento: current.local_evento || null,
                observacoes: current.observacoes || {},
                designer_uid: current.designer_uid || null,
                designer_nome: current.designer_nome || null
            };



            const { data: existingData } = await supabaseClient
                .from('pedidos_artes')
                .select('id')
                .eq('id_int', osIntId)
                .limit(1);
                
            let opError;
            if (existingData && existingData.length > 0) {
                const res = await supabaseClient
                    .from('pedidos_artes')
                    .update(payload)
                    .eq('id_int', osIntId);
                opError = res.error;
            } else {
                const res = await supabaseClient
                    .from('pedidos_artes')
                    .insert(payload);
                opError = res.error;
            }

            if (opError) throw opError;
            console.log("Briefing salvo via debounced update/insert.");
        } catch (e) {
            console.error("Erro ao salvar briefing:", e);
        }
    }, 1000); // 1 segundo de debounce
}

async function selectDesigner(osIntId, uid, nome) {
    if (!state.pedidosArtesData) state.pedidosArtesData = {};
    if (!state.pedidosArtesData[osIntId]) state.pedidosArtesData[osIntId] = {};
    state.pedidosArtesData[osIntId].designer_uid = uid;
    state.pedidosArtesData[osIntId].designer_nome = nome;
    
    // Atualiza a UI imediatamente para sensação de resposta instantânea
    const activeOs = document.getElementById('active-os-name') ? document.getElementById('active-os-name').dataset.osId : null;
    if (activeOs) updateBriefingUI(activeOs, osIntId);

    // Salva direto no banco
    if (!osIntId || typeof supabaseClient === 'undefined') return;
    try {
        const payload = {
            id_int: osIntId,
            designer_uid: uid,
            designer_nome: nome
        };

        const { data: existingData } = await supabaseClient
            .from('pedidos_artes')
            .select('id')
            .eq('id_int', osIntId)
            .limit(1);

        let opError;
        if (existingData && existingData.length > 0) {
            const res = await supabaseClient
                .from('pedidos_artes')
                .update({ designer_uid: uid, designer_nome: nome })
                .eq('id_int', osIntId);
            opError = res.error;
        } else {
            const res = await supabaseClient
                .from('pedidos_artes')
                .insert(payload);
            opError = res.error;
        }

        if (opError) throw opError;
        showToast("Designer atribuído com sucesso!", "success");
    } catch (e) {
        console.error("Erro ao salvar designer:", e);
        showToast("Erro ao atribuir designer.", "error");
    }
}

// Expõe para o window
window.loadBriefingBase = loadBriefingBase;
window.saveBriefingField = saveBriefingField;
window.selectDesigner = selectDesigner;

// Expor funções globais
window.loadOrdens = loadOrdens;
window.loadOrdensFromVibecode = loadOrdensFromVibecode;
window.mapVibecodeProdutoToOSItem = mapVibecodeProdutoToOSItem;
window.renderOrdens = renderOrdens;
window.toggleOSDetail = toggleOSDetail;
window.abrirImposicaoDoPedido = abrirImposicaoDoPedido;
window.changeOSStatus = changeOSStatus;
window.updateItemImpressao = updateItemImpressao;
window.enviarParaImposicao = enviarParaImposicao;
window.autoSaveOSItemField = autoSaveOSItemField;
window.renderImpOSQueue = renderImpOSQueue;
window.toggleImpOSQueue = toggleImpOSQueue;
window.impQueueUpdateCor = impQueueUpdateCor;
window.impQueueUpdateNum = impQueueUpdateNum;
window.impQueueUpdateField = impQueueUpdateField;
window.impQueueGerarPDF = impQueueGerarPDF;
window.impQueueImprimir = impQueueImprimir;
window.matchFormato = matchFormato;
window.matchCor = matchCor;
window.matchNumeracao = matchNumeracao;
window.navigateToAmostrasFromOS = navigateToAmostrasFromOS;
window.clearAmostrasOS = clearAmostrasOS;
window.decisionAmostraItem = decisionAmostraItem;
window.saveAmostraItemObs = saveAmostraItemObs;

// ==========================================
// GERENCIAMENTO DE ARTES E MODELOS (FASE 1)
// ==========================================

let artesModalState = {
    itemId: null,
    osId: null,
    id_int: null,
    modeloNome: null,
    artes: []
};

async function openArtesModal(itemId, osId) {
    const os = state.ordens.find(o => o.id === osId);
    const item = (state.osItens[osId] || []).find(i => String(i.id) === String(itemId));
    if (!os || !item) return;
    
    artesModalState.itemId = itemId;
    artesModalState.osId = osId;
    artesModalState.id_int = os.numero || osId.replace('vibe_', '');
    artesModalState.modeloNome = item.modelo || 'Padrão';
    artesModalState.versoTipo = item.verso_tipo || 'Frente';
    
    document.getElementById('modal-artes-modelo-nome').textContent = artesModalState.modeloNome;
    document.getElementById('modal-artes').style.display = 'flex';
    document.getElementById('modal-artes-file').value = '';
    
    const fileVersoInput = document.getElementById('modal-artes-file-verso');
    if (fileVersoInput) fileVersoInput.value = '';
    
    document.getElementById('modal-artes-comment').value = '';
    
    const fileLabel = document.getElementById('modal-artes-file-label');
    const fileVersoGroup = document.getElementById('modal-artes-file-verso-group');
    
    if (artesModalState.versoTipo === 'FRENTE E VERSO') {
        if (fileLabel) fileLabel.textContent = 'Arquivo Frente (PDF/Imagem)';
        if (fileVersoGroup) fileVersoGroup.style.display = 'block';
    } else {
        if (fileLabel) fileLabel.textContent = 'Arquivo (PDF/Imagem)';
        if (fileVersoGroup) fileVersoGroup.style.display = 'none';
    }
    
    await loadArtesDoModelo();
}

function closeArtesModal() {
    document.getElementById('modal-artes').style.display = 'none';
}

async function loadArtesDoModelo() {
    const container = document.getElementById('modal-artes-timeline');
    container.innerHTML = '<div style="text-align: center; color: var(--text-dim);">Carregando histórico...</div>';
    
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-dim);">Supabase não configurado.</div>';
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('pedidos_artes')
            .select('*')
            .eq('id_modelo', artesModalState.itemId)
            .order('versao', { ascending: false });
            
        if (error) {
            if (error.code === '42P01') { 
                container.innerHTML = '<div style="text-align: center; color: var(--text-dim);">Tabela pedidos_artes não existe no banco.</div>'; 
                return; 
            }
            throw error;
        }
        
        artesModalState.artes = data || [];
        renderArtesTimeline();
    } catch (e) {
        console.error('Erro ao buscar artes:', e);
        container.innerHTML = '<div style="text-align: center; color: red;">Erro ao carregar artes.</div>';
    }
}

function renderArtesTimeline() {
    const container = document.getElementById('modal-artes-timeline');
    if (artesModalState.artes.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 20px;">Nenhuma arte enviada ainda.</div>';
        return;
    }
    
    container.innerHTML = artesModalState.artes.map((arte, i) => {
        const isLatest = i === 0;
        let badgeClass = 'badge-yellow';
        if (arte.status.includes('APROVADA') || arte.status === 'LIBERADA') badgeClass = 'badge-teal';
        else if (arte.status.includes('REPROVADA')) badgeClass = 'badge-red';
        
        let previewHtml = '';
        const isPdf = arte.url_arquivo && arte.url_arquivo.toLowerCase().endsWith('.pdf');
        const isVersoPdf = arte.verso_url_arquivo && arte.verso_url_arquivo.toLowerCase().endsWith('.pdf');

        if (artesModalState.versoTipo === 'FRENTE E VERSO') {
            previewHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
                <div style="border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; position: relative;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--blue); position: absolute; top: 4px; left: 8px; text-transform: uppercase;">Frente</span>
                    ${arte.url_arquivo ? (isPdf 
                        ? `<iframe src="${arte.url_arquivo}" style="width: 100%; height: 80px; border: none; border-radius: 4px;"></iframe>`
                        : `<img src="${arte.url_arquivo}" style="max-width: 100%; max-height: 80px; object-fit: contain; border-radius: 4px;">`
                    ) : '<span style="color: var(--text-dim); font-size: 0.8rem;">Sem arquivo</span>'}
                    ${arte.url_arquivo ? `<a href="${arte.url_arquivo}" target="_blank" class="btn btn-sm btn-ghost" style="margin-top: 6px; font-size: 0.68rem; padding: 2px 6px;">👁️ Ver Frente</a>` : ''}
                </div>
                <div style="border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; position: relative;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: var(--amber); position: absolute; top: 4px; left: 8px; text-transform: uppercase;">Verso</span>
                    ${arte.verso_url_arquivo ? (isVersoPdf 
                        ? `<iframe src="${arte.verso_url_arquivo}" style="width: 100%; height: 80px; border: none; border-radius: 4px;"></iframe>`
                        : `<img src="${arte.verso_url_arquivo}" style="max-width: 100%; max-height: 80px; object-fit: contain; border-radius: 4px;">`
                    ) : '<span style="color: var(--text-dim); font-size: 0.8rem;">Sem arquivo</span>'}
                    ${arte.verso_url_arquivo ? `<a href="${arte.verso_url_arquivo}" target="_blank" class="btn btn-sm btn-ghost" style="margin-top: 6px; font-size: 0.68rem; padding: 2px 6px;">👁️ Ver Verso</a>` : ''}
                </div>
            </div>
            `;
        } else {
            previewHtml = `
            <div style="margin-top: 10px; border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; position: relative;">
                <span style="font-size: 0.65rem; font-weight: 700; color: var(--blue); position: absolute; top: 4px; left: 8px; text-transform: uppercase;">Frente</span>
                ${arte.url_arquivo ? (isPdf 
                    ? `<iframe src="${arte.url_arquivo}" style="width: 100%; height: 80px; border: none; border-radius: 4px;"></iframe>`
                    : `<img src="${arte.url_arquivo}" style="max-width: 100%; max-height: 80px; object-fit: contain; border-radius: 4px;">`
                ) : '<span style="color: var(--text-dim); font-size: 0.8rem;">Sem arquivo</span>'}
                ${arte.url_arquivo ? `<a href="${arte.url_arquivo}" target="_blank" class="btn btn-sm btn-ghost" style="margin-top: 6px; font-size: 0.68rem; padding: 2px 6px;">👁️ Ver Arquivo</a>` : ''}
            </div>
            `;
        }
        
        return `
        <div style="border: 1px solid ${isLatest ? 'var(--blue)' : 'var(--border)'}; border-radius: 6px; padding: 12px; background: var(--bg-card); opacity: ${isLatest ? '1' : '0.8'};">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>Versão ${arte.versao} ${isLatest ? ' (Atual)' : ''}</strong>
                <span class="badge ${badgeClass}">${arte.status}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 8px;">
                📅 ${new Date(arte.created_at).toLocaleString('pt-BR')} <br>
                👤 Enviado por: ${arte.enviado_por || 'Sistema'}
            </div>
            ${previewHtml}
            ${arte.comentarios_revisao ? `<div style="margin-top: 8px; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; font-size: 0.85rem;">💬 ${arte.comentarios_revisao}</div>` : ''}
        </div>
        `;
    }).join('');
}

async function submitNovaArte() {
    const fileInput = document.getElementById('modal-artes-file');
    const fileVersoInput = document.getElementById('modal-artes-file-verso');
    const comment = document.getElementById('modal-artes-comment').value.trim();
    const btn = document.getElementById('btn-submit-arte');
    
    const hasFront = fileInput.files && fileInput.files.length > 0;
    const hasVerso = fileVersoInput && fileVersoInput.files && fileVersoInput.files.length > 0;
    
    if (!hasFront && !hasVerso) {
        toast('Selecione pelo menos um arquivo (PDF ou Imagem) primeiro!', 'warning');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';
    
    try {
        let proximaVersao = artesModalState.artes.length > 0 ? artesModalState.artes[0].versao + 1 : 1;
        const timestamp = Date.now();
        
        let frontUrl = null;
        let frontStoragePath = null;
        let frontNome = null;
        let frontMime = null;
        let frontSize = null;
        
        if (hasFront) {
            const file = fileInput.files[0];
            frontNome = file.name;
            frontMime = file.type;
            frontSize = file.size;
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            frontStoragePath = `propostas/${artesModalState.id_int}/artes/${artesModalState.itemId}/${timestamp}_${safeName}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('chat-ideal')
                .upload(frontStoragePath, file, { upsert: true });
                
            if (uploadError) throw new Error('Falha no upload da frente: ' + uploadError.message);
            
            const { data: publicUrlData } = supabaseClient.storage.from('chat-ideal').getPublicUrl(frontStoragePath);
            frontUrl = publicUrlData.publicUrl;
        }
        
        let versoUrl = null;
        let versoStoragePath = null;
        let versoNome = null;
        let versoMime = null;
        let versoSize = null;
        
        if (hasVerso) {
            const fileVerso = fileVersoInput.files[0];
            versoNome = fileVerso.name;
            versoMime = fileVerso.type;
            versoSize = fileVerso.size;
            const safeNameVerso = fileVerso.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            versoStoragePath = `propostas/${artesModalState.id_int}/artes/${artesModalState.itemId}/${timestamp}_verso_${safeNameVerso}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('chat-ideal')
                .upload(versoStoragePath, fileVerso, { upsert: true });
                
            if (uploadError) throw new Error('Falha no upload do verso: ' + uploadError.message);
            
            const { data: publicUrlData } = supabaseClient.storage.from('chat-ideal').getPublicUrl(versoStoragePath);
            versoUrl = publicUrlData.publicUrl;
        }
        
        // Obter arte anterior para preservar arquivos caso só um tenha sido enviado agora
        const ultimaArte = artesModalState.artes.length > 0 ? artesModalState.artes[0] : null;
        
        const insertPayload = {
            id_int: artesModalState.id_int,
            id_modelo: artesModalState.itemId,
            versao: proximaVersao,
            nome_arquivo: frontNome || (ultimaArte ? ultimaArte.nome_arquivo : (versoNome || 'verso')),
            storage_bucket: 'chat-ideal',
            storage_path: frontStoragePath || (ultimaArte ? ultimaArte.storage_path : null),
            url_arquivo: frontUrl || (ultimaArte ? ultimaArte.url_arquivo : null),
            tipo_arquivo: frontMime ? (frontMime.includes('pdf') ? 'PDF' : 'IMAGEM') : (ultimaArte ? ultimaArte.tipo_arquivo : null),
            mime_type: frontMime || (ultimaArte ? ultimaArte.mime_type : null),
            tamanho_bytes: frontSize || (ultimaArte ? ultimaArte.tamanho_bytes : 0),
            status: 'EM_REVISAO_INTERNA',
            enviado_por: 'Usuário do Sistema',
            comentarios_revisao: comment,
            // Colunas de verso
            verso_nome_arquivo: versoNome || (ultimaArte ? ultimaArte.verso_nome_arquivo : null),
            verso_storage_path: versoStoragePath || (ultimaArte ? ultimaArte.verso_storage_path : null),
            verso_url_arquivo: versoUrl || (ultimaArte ? ultimaArte.verso_url_arquivo : null),
            verso_tipo_arquivo: versoMime ? (versoMime.includes('pdf') ? 'PDF' : 'IMAGEM') : (ultimaArte ? ultimaArte.verso_tipo_arquivo : null),
            verso_mime_type: versoMime || (ultimaArte ? ultimaArte.verso_mime_type : null),
            verso_tamanho_bytes: versoSize || (ultimaArte ? ultimaArte.verso_tamanho_bytes : 0)
        };
        
        const { error: insertError } = await supabaseClient
            .from('pedidos_artes')
            .insert(insertPayload);
            
        if (insertError) throw insertError;
        
        // Atualizar pedidos_modelos com o novo status e URLs
        const updatePayload = {
            status_arte: 'EM_REVISAO_INTERNA'
        };
        if (frontUrl) {
            updatePayload.arte_url = frontUrl;
        }
        if (versoUrl) {
            updatePayload.verso_arte_url = versoUrl;
        }
        
        await supabaseClient.from('pedidos_modelos')
            .update(updatePayload)
            .eq('id', artesModalState.itemId)
            .catch(err => console.error('[submitNovaArte] Erro ao sincronizar pedidos_modelos:', err));
            
        // Atualizar estado local
        const item = (state.osItens[artesModalState.osId] || []).find(i => String(i.id) === String(artesModalState.itemId));
        if (item) {
            item.aprovacao = 'EM_REVISAO_INTERNA';
            if (frontUrl) {
                item.arte_url = frontUrl;
                item.url_arquivo_arte = frontUrl;
                item.nome_arquivo_arte = frontNome;
                item.versao_arte = proximaVersao;
            }
            if (versoUrl) {
                item.verso_arte_url = versoUrl;
                item.url_arquivo_arte_verso = versoUrl;
                item.nome_arquivo_arte_verso = versoNome;
                item.versao_arte = proximaVersao;
            }
        }
        
        await logToChatIdeal(`Nova arte enviada para o Modelo ${artesModalState.modeloNome} (versão ${proximaVersao}).\\nObs: ${comment}`);
        
        toast('Nova versão enviada com sucesso!', 'success');
        fileInput.value = '';
        if (fileVersoInput) fileVersoInput.value = '';
        document.getElementById('modal-artes-comment').value = '';
        
        await loadArtesDoModelo();
        renderOSItens(artesModalState.osId);
        
    } catch (e) {
        console.error('Erro no submit:', e);
        toast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Enviar Nova Versão';
    }
}

async function logToChatIdeal(mensagem) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        await supabaseClient.from('propostas_chat').insert({
            id_int: artesModalState.id_int,
            tipo: 'PRODUCAO',
            setor: 'Pre-impressao',
            visivel_externo: false,
            mensagem: mensagem,
            remetente_nome: 'Ideal Imposition',
        });
    } catch (e) {
        console.error('Erro ao logar no chat:', e);
    }
}

async function setStatusArteAtual(novoStatus) {
    if (artesModalState.artes.length === 0) {
        toast('Não há arte atual.', 'warning');
        return;
    }
    const arteAtual = artesModalState.artes[0];
    const comment = document.getElementById('modal-artes-comment').value.trim();
    
    try {
        const { error } = await supabaseClient
            .from('pedidos_artes')
            .update({ 
                status: novoStatus,
                comentarios_revisao: comment || arteAtual.comentarios_revisao,
                aprovado_por: novoStatus.includes('APROVADA') || novoStatus === 'LIBERADA' ? 'Avaliador' : null,
                data_aprovacao: novoStatus.includes('APROVADA') || novoStatus === 'LIBERADA' ? new Date().toISOString() : null
            })
            .eq('id', arteAtual.id);
            
        if (error) throw error;
        
        await supabaseClient.from('pedidos_modelos')
            .update({ status_arte: novoStatus })
            .eq('id', artesModalState.itemId)
            .catch(e => console.warn('Sem sync modelo:', e));
            
        // Atualizar estado local
        const item = (state.osItens[artesModalState.osId] || []).find(i => String(i.id) === String(artesModalState.itemId));
        if (item) {
            item.aprovacao = novoStatus;
        }
            
        const statusTexto = novoStatus === 'LIBERADA' ? 'LIBERADA PARA IMPRESSÃO' : novoStatus;
        await logToChatIdeal(`Arte do Modelo ${artesModalState.modeloNome} (versão ${arteAtual.versao}) alterada para: ${statusTexto}.\\n${comment ? 'Obs: '+comment : ''}`);
        
        toast(`Arte atualizada para ${statusTexto}`, 'success');
        document.getElementById('modal-artes-comment').value = '';
        await loadArtesDoModelo();
    } catch (e) {
        console.error('Erro ao atualizar status:', e);
        toast('Erro ao atualizar arte', 'error');
    }
}

window.openArtesModal = openArtesModal;
window.closeArtesModal = closeArtesModal;
window.submitNovaArte = submitNovaArte;
window.aprovarArteAtual = () => setStatusArteAtual('APROVADA_CLIENTE');
window.liberarArteAtual = () => setStatusArteAtual('LIBERADA');
window.reprovarArteAtual = () => setStatusArteAtual('REPROVADA_CLIENTE');

// ==========================================
// LINK DO CLIENTE -- PÁGINA PÚBLICA (FASE 2)
// ==========================================

/**
 * Gera token alfanumérico aleatório de 6 caracteres
 */
function generateClientToken(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

/**
 * Gera ou recupera o link público do cliente para uma OS
 */
/**
 * Cria ou recupera o link do cliente para uma OS.
 * Retorna a URL completa, ou null em caso de erro.
 * Uso interno — não copia nem exibe toast.
 */
async function getOrCreateLinkCliente(osId, numero) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return null;
    try {
        const { data: existing, error: fetchError } = await supabaseClient
            .from('pedidos_links_cliente')
            .select('*')
            .eq('os_id', osId)
            .eq('ativo', true)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            if (fetchError.code === '42P01') return null; // tabela não existe ainda
            throw fetchError;
        }

        let token;
        const os = state.ordens.find(o => o.id === osId);
        const currentStatus = os ? (os.status || 'Enviar Arte') : 'Enviar Arte';
        
        if (existing) {
            token = existing.token;
            await supabaseClient
                .from('pedidos_links_cliente')
                .update({ status_arte: currentStatus })
                .eq('id', existing.id);
            if (!state.linksClienteData) state.linksClienteData = {};
            state.linksClienteData[osId] = { ...existing, status_arte: currentStatus };
        }
 else {
            token = generateClientToken(6);
            const { error: insertError } = await supabaseClient
                .from('pedidos_links_cliente')
                .insert({
                    os_id: osId,
                    numero_pedido: String(numero),
                    token: token,
                    id_int: os ? (os.numero || numero) : numero,
                    status_arte: currentStatus
                });
            if (insertError) throw insertError;
        }

        return `${window.location.origin}/cliente/${numero}-${token}`;
    } catch (e) {
        console.error('Erro ao obter/criar link do cliente:', e);
        return null;
    }
}

async function abrirLinkClienteEAtualizarStatus(osId, numero, linkUrl) {
    const novoStatus = 'Aguard. Aprovação';
    const host = window.location.origin;
    const finalUrl = linkUrl || `${host}/cliente.html?os=${osId}`;

    // Apenas abre o link na nova aba — modal de email é aberto SOMENTE quando o
    // usuário clicar no ícone ✉️ separado na linha do pedido (não automaticamente)
    window.open(finalUrl, '_blank');

    // 2. Atualizar status e recarregar em segundo plano
    const os = state.ordens ? state.ordens.find(o => o.id === osId) : null;
    if (os && os.status !== 'Aprovada' && os.status !== 'APROVADO') {
        os.status = novoStatus;
        os.status_calculado = novoStatus;
        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                await supabaseClient.from('pedidos_links_cliente').update({ status_arte: novoStatus }).eq('os_id', osId);
            } else {
                await supabaseClient.from('producao_ordens_servico').update({ status: novoStatus }).eq('id', osId);
            }
        }
        loadOrdens();
    }
}
window.abrirLinkClienteEAtualizarStatus = abrirLinkClienteEAtualizarStatus;
window.enviar_link = function(osId, numero) { return gerarLinkCliente(osId, numero); };
window.enviarLink = window.enviar_link;
window.enviarLinkCliente = window.enviar_link;

function gerarLinkClienteBanner() {
    const activeOSId = state.activeOSId || localStorage.getItem('activeOSId');
    console.log('[LinkDebug] gerarLinkClienteBanner: activeOSId=', activeOSId);
    if (!activeOSId) {
        toast('Nenhum pedido ativo selecionado.', 'warning');
        return;
    }
    const os = typeof findOSInState === 'function' ? findOSInState(activeOSId) : (state.ordens ? state.ordens.find(o => o.id === activeOSId) : null);
    const osNum = os ? (os.numero || os.id_int || os.id) : activeOSId;
    console.log('[LinkDebug] Chamando gerarLinkCliente com osId=', activeOSId, 'num=', osNum);
    gerarLinkCliente(activeOSId, osNum);
}
window.gerarLinkClienteBanner = gerarLinkClienteBanner;

/**
 * Gera (ou recupera) o link do cliente, copia para a área de transferência
 * e exibe o modal de e-mail instantaneamente.
 */
async function gerarLinkCliente(osId, numero) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        toast('Supabase não configurado. Não é possível gerar o link.', 'error');
        return;
    }
    try {
        const novoStatus = 'Aguard. Aprovação';

        // 1. Atualizar overrides e estado local primeiro
        const overrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
        overrides[osId] = novoStatus;
        localStorage.setItem('vibe_status_overrides', JSON.stringify(overrides));

        const os = state.ordens ? state.ordens.find(o => o.id === osId) : null;
        if (os) {
            os.status = novoStatus;
            os.status_calculado = novoStatus;
        }

        // 2. Obter/Criar o link oficial registrado no banco
        toast('⏳ Gerando link...', 'info');
        const linkUrl = await getOrCreateLinkCliente(osId, numero);
        const host = window.location.origin;
        const finalUrl = linkUrl || `${host}/cliente/${numero}`;

        // 3. Atualizar no Supabase em segundo plano
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            if (osId.startsWith('vibe_')) {
                supabaseClient.from('pedidos_links_cliente').update({ status_arte: novoStatus }).eq('os_id', osId).then(() => {});
            } else {
                supabaseClient.from('producao_ordens_servico').update({ status: novoStatus }).eq('id', osId).then(() => {});
            }
        }

        // 4. Copiar link para clipboard
        try {
            await navigator.clipboard.writeText(finalUrl);
            toast(`✅ Link copiado! ${finalUrl}`, 'success');
        } catch (clipErr) {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = finalUrl; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            toast(`✅ Link gerado e copiado!`, 'success');
        }

        // 5. Mostrar ícone de email na linha do pedido (sem abrir modal)
        _mostrarIconeEmailNaLinha(osId, numero, finalUrl);

        // 6. Recarregar lista
        loadOrdens();

        // 7. Regenerar snapshots/imagens em segundo plano
        forceRegenerateSnapshots(osId).catch(snapErr => {
            console.warn('[Gerar Link] Erro ao regenerar snapshots:', snapErr);
        });

    } catch (e) {
        console.error('Erro ao gerar link do cliente:', e);
        toast('Erro ao gerar o link: ' + e.message, 'error');
    }
}

// Exibe o ícone de email flutuante próximo ao botão do pedido clicado
function _mostrarIconeEmailNaLinha(osId, numero, linkUrl) {
    // Remover qualquer ícone email anterior
    const anterior = document.getElementById('email-icon-popup-' + osId);
    if (anterior) anterior.remove();

    const popup = document.createElement('div');
    popup.id = 'email-icon-popup-' + osId;
    popup.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        background: linear-gradient(135deg, #1e293b, #0f172a);
        border: 1px solid rgba(59,130,246,0.4);
        border-radius: 14px; padding: 14px 18px;
        display: flex; align-items: center; gap: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        animation: slideInRight 0.3s ease;
        max-width: 360px;
    `;
    popup.innerHTML = `
        <style>
            @keyframes slideInRight {
                from { transform: translateX(120%); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
            }
        </style>
        <div style="font-size:1.8rem; flex-shrink:0;">📋</div>
        <div style="flex:1; min-width:0;">
            <div style="font-size:0.82rem; font-weight:700; color:#e2e8f0; margin-bottom:4px;">Link copiado — Pedido #${numero}</div>
            <div style="font-size:0.73rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${linkUrl}</div>
        </div>
        <button onclick="abrirModalEnviarEmailCliente('${osId}', '${numero}', '${linkUrl.replace(/'/g, "\\'")}')"
                title="Enviar por e-mail"
                style="flex-shrink:0; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.4);
                       color:#60a5fa; border-radius:8px; width:38px; height:38px; cursor:pointer;
                       font-size:1.2rem; display:flex; align-items:center; justify-content:center;
                       transition:all .2s;"
                onmouseenter="this.style.background='rgba(59,130,246,0.3)'"
                onmouseleave="this.style.background='rgba(59,130,246,0.15)'">
            ✉️
        </button>
        <button onclick="document.getElementById('email-icon-popup-${osId}').remove()"
                style="flex-shrink:0; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
                       color:#64748b; border-radius:8px; width:28px; height:28px; cursor:pointer;
                       font-size:0.85rem; display:flex; align-items:center; justify-content:center;">
            ✕
        </button>
    `;
    document.body.appendChild(popup);
    // Auto-fechar após 8 segundos
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 8000);
}

function ensureModalEmailElement() {
    let modal = document.getElementById('modal-envio-email-cliente');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-envio-email-cliente';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:999999;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;';
        modal.innerHTML = `
            <div style="background:var(--card-bg, #1e293b);border:1px solid var(--border-color, rgba(255,255,255,0.15));width:100%;max-width:780px;max-height:92vh;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;">
                <!-- Header -->
                <div style="padding:16px 20px;border-bottom:1px solid var(--border-color, rgba(255,255,255,0.1));display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;box-shadow:0 4px 12px rgba(245,158,11,0.3);">
                            ✉️
                        </div>
                        <div>
                            <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#fff;">Enviar Notificação ao Cliente</h3>
                            <p style="margin:0;font-size:0.78rem;color:var(--text-dim, #94a3b8);" id="modal-email-subtitle">Pedido #<span id="modal-email-os-numero"></span> — Notificação Pronta para Disparo</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <button class="btn btn-secondary btn-sm" id="btn-abrir-config-email" onclick="abrirModalConfigEmail()" style="font-size:0.78rem;font-weight:700;padding:5px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" title="Configurar Servidor SMTP e E-mail Remetente">
                            ⚙️ Configurar Remetente
                        </button>
                        <button onclick="fecharModalEnviarEmailCliente()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">✕</button>
                    </div>
                </div>

                <!-- Body -->
                <div style="padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;">
                    
                    <!-- Box Link Copiado -->
                    <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85rem;">
                            <span style="font-weight:700;color:#60a5fa;">🔗 Link de Aprovação:</span>
                            <span id="modal-email-link-display" style="color:#e2e8f0;font-family:monospace;margin-left:6px;"></span>
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="copiarLinkClienteModal()" style="font-size:0.78rem;font-weight:700;white-space:nowrap;padding:6px 12px;">📋 Copiar Link</button>
                    </div>

                    <!-- Campos de E-mail -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Destinatário (E-mail do Cliente)</label>
                            <input type="email" id="modal-email-to" class="form-control" placeholder="cliente@email.com" style="width:100%;font-size:0.88rem;">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Assunto do E-mail</label>
                            <input type="text" id="modal-email-subject" class="form-control" style="width:100%;font-size:0.88rem;">
                        </div>
                    </div>

                    <!-- Prévia do E-mail / Corpo -->
                    <div class="form-group" style="margin:0;display:flex;flex-direction:column;gap:6px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin:0;">Corpo da Mensagem / Modelos do Pedido</label>
                            <span style="font-size:0.75rem;color:var(--text-dim, #94a3b8);">Inclui detalhes e artes de cada modelo</span>
                        </div>
                        <textarea id="modal-email-body" class="form-control" rows="9" style="width:100%;font-family:monospace;font-size:0.82rem;line-height:1.45;resize:vertical;"></textarea>
                    </div>

                    <!-- Prévia dos Modelos (Cards com Foto) -->
                    <div id="modal-email-modelos-preview" style="display:flex;flex-direction:column;gap:10px;">
                        <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin:0;">🖼️ Amostras Incluídas no Envio:</label>
                        <div id="modal-email-modelos-container" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:10px;"></div>
                    </div>

                </div>

                <!-- Footer / Ações -->
                <div style="padding:14px 20px;border-top:1px solid var(--border-color, rgba(255,255,255,0.1));display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(0,0,0,0.25);flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="fecharModalEnviarEmailCliente()" style="font-size:0.82rem;font-weight:600;">Fechar</button>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="copiarTextoEmailModal()" style="font-size:0.82rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fa-regular fa-copy"></i> Copiar E-mail</button>
                        <button class="btn btn-secondary btn-sm" onclick="copiarWhatsAppModal()" style="font-size:0.82rem;font-weight:700;color:#22c55e;border-color:rgba(34,197,94,0.4);display:inline-flex;align-items:center;gap:6px;"><i class="fa-brands fa-whatsapp"></i> Copiar WhatsApp</button>
                        <button class="btn btn-secondary btn-sm" onclick="dispararMailtoCliente()" style="font-size:0.82rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;" title="Abrir software de e-mail do sistema (Outlook/Mail)"><i class="fa-solid fa-envelope-open-text"></i> Abrir Outlook</button>
                        <button class="btn btn-primary btn-sm" id="btn-disparar-email-direto" onclick="dispararEmailDiretoCliente()" style="font-size:0.88rem;font-weight:800;background:linear-gradient(135deg,#10b981,#059669);border:none;padding:7px 16px;box-shadow:0 4px 14px rgba(16,185,129,0.35);display:inline-flex;align-items:center;gap:7px;">
                            <i class="fa-solid fa-paper-plane"></i> 🚀 Disparar E-mail pela Aplicação
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('btn-abrir-config-email').addEventListener('click', abrirModalConfigEmail);
    }
    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }
    modal.style.zIndex = '999999';
    return modal;
}

function ensureModalConfigEmailElement() {
    let modal = document.getElementById('modal-config-email-remetente');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-config-email-remetente';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999999;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;';
        modal.innerHTML = `
            <div style="background:var(--card-bg, #1e293b);border:1px solid var(--border-color, rgba(255,255,255,0.15));width:100%;max-width:560px;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;">
                <!-- Header -->
                <div style="padding:16px 20px;border-bottom:1px solid var(--border-color, rgba(255,255,255,0.1));display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.03);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;box-shadow:0 4px 12px rgba(59,130,246,0.3);">
                            ⚙️
                        </div>
                        <div>
                            <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#fff;">Configurações de E-mail Remetente</h3>
                            <p style="margin:0;font-size:0.78rem;color:var(--text-dim, #94a3b8);">Cadastre o servidor SMTP da gráfica para envio direto</p>
                        </div>
                    </div>
                    <button onclick="fecharModalConfigEmail()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">✕</button>
                </div>

                <!-- Body -->
                <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">E-mail Remetente (De:)</label>
                            <input type="email" id="config-email-remetente" class="form-control" placeholder="atendimento@ingressoideal.com.br" style="width:100%;font-size:0.85rem;">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Nome de Exibição</label>
                            <input type="text" id="config-email-nome" class="form-control" placeholder="Ingresso Ideal — Atendimento" style="width:100%;font-size:0.85rem;">
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Servidor SMTP (Host)</label>
                            <input type="text" id="config-email-host" class="form-control" placeholder="smtp.gmail.com / mail.ingressoideal.com.br" style="width:100%;font-size:0.85rem;">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Porta</label>
                            <input type="number" id="config-email-port" class="form-control" placeholder="587" value="587" style="width:100%;font-size:0.85rem;">
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Usuário Autenticação</label>
                            <input type="text" id="config-email-user" class="form-control" placeholder="usuario@ingressoideal.com.br" style="width:100%;font-size:0.85rem;">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="text-transform:uppercase;font-weight:700;font-size:0.75rem;color:var(--text-dim, #94a3b8);margin-bottom:4px;display:block;">Senha / Token de App</label>
                            <input type="password" id="config-email-password" class="form-control" placeholder="••••••••••••" style="width:100%;font-size:0.85rem;">
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                        <input type="checkbox" id="config-email-tls" checked style="width:16px;height:16px;cursor:pointer;">
                        <label for="config-email-tls" style="font-size:0.82rem;color:#cbd5e1;cursor:pointer;">Usar Conexão Segura (TLS/SSL)</label>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding:14px 20px;border-top:1px solid var(--border-color, rgba(255,255,255,0.1));display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.25);">
                    <button class="btn btn-secondary btn-sm" onclick="fecharModalConfigEmail()" style="font-size:0.82rem;">Cancelar</button>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="testarEnvioEmailConfig()" style="font-size:0.82rem;font-weight:700;">🧪 Envio Teste</button>
                        <button class="btn btn-primary btn-sm" onclick="salvarConfigEmailRemetente()" style="font-size:0.85rem;font-weight:800;background:linear-gradient(135deg,#3b82f6,#2563eb);padding:6px 16px;">💾 Salvar Configurações</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }
    return modal;
}

function abrirModalConfigEmail() {
    console.log('[Email Config] abrirModalConfigEmail acionado!');
    toast('Abrindo configurações de remetente...', 'info');
    const modal = ensureModalConfigEmailElement();
    if (modal) {
        modal.style.display = 'flex';
        modal.style.zIndex = '9999999';
        carregarConfigEmailRemetente();
    }
}
window.abrirModalConfigEmail = abrirModalConfigEmail;

/**
 * Abre o modal de notificação/e-mail do cliente após a geração do link
 */
async function abrirModalEnviarEmailCliente(osId, numero, linkUrl) {
    console.log('[LinkDebug] abrirModalEnviarEmailCliente ENTRY osId=', osId, 'numero=', numero);
    const modal = ensureModalEmailElement();
    console.log('[LinkDebug] modal element:', modal, 'display antes:', modal?.style?.display);
    modal.style.display = 'flex'; // Exibir imediatamente!
    modal.style.zIndex = '999999';
    console.log('[LinkDebug] modal display SETADO para flex, zIndex=999999');

    // Garantir listeners dos botões do modal
    const btnCfg = document.getElementById('btn-abrir-config-email');
    if (btnCfg) {
        btnCfg.onclick = function(e) {
            if (e) e.stopPropagation();
            abrirModalConfigEmail();
        };
    }
    const btnSendDirect = document.getElementById('btn-disparar-email-direto');
    if (btnSendDirect) {
        btnSendDirect.onclick = function(e) {
            if (e) e.stopPropagation();
            dispararEmailDiretoCliente();
        };
    }

    // Preencher dados iniciais de feedback visual
    const elNum = document.getElementById('modal-email-os-numero');
    if (elNum) elNum.textContent = numero || osId;
    const elLink = document.getElementById('modal-email-link-display');
    if (elLink) elLink.textContent = linkUrl || 'Carregando...';
    const elBody = document.getElementById('modal-email-body');
    if (elBody && !elBody.value) elBody.value = 'Carregando informações do pedido e modelos...';

    try {
        toast('Preparando modelo de e-mail...', 'info');

        const os = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId || String(o.numero) === String(numero)) : null);
        const numInt = parseInt(String(numero || osId).replace(/\D/g, ''));

        // 1. Buscar dados do cliente
        let clienteNome = os ? (os.cliente || '') : '';
        let clienteEmail = '';
        let nomeEvento = '';

        if (state.todasArtes) {
            const arteObj = state.todasArtes.find(a => String(a.id_int) === String(numInt));
            if (arteObj && arteObj.nome_evento) nomeEvento = arteObj.nome_evento;
        }

        if (typeof supabaseClient !== 'undefined' && supabaseClient && !isNaN(numInt)) {
            try {
                const { data: propData } = await supabaseClient
                    .from('propostas')
                    .select('*')
                    .eq('id_int', numInt)
                    .limit(1);

                if (propData && propData.length > 0) {
                    const prop = propData[0];
                    if (!clienteNome) clienteNome = prop.cliente || prop.cliente_nome || prop.dados_cliente || '';
                    const idCli = prop.id_faturado || prop.id_cliente;
                    if (idCli) {
                        const { data: cliData } = await supabaseClient.from('clientes').select('*').eq('id_cliente', idCli).limit(1);
                        if (cliData && cliData.length > 0) {
                            const cli = cliData[0];
                            clienteEmail = cli.email_financeiro || cli.email_contato || cli.email || '';
                            if (!clienteNome) clienteNome = cli.nome || cli.fantasia || '';
                        }
                    }
                }
            } catch (errCli) {
                console.warn('[Email Modal] Erro ao buscar dados do cliente:', errCli);
            }
        }

        if (!clienteNome) clienteNome = 'Cliente';

        // 2. Carregar itens da OS se não estiverem no state
        if (!state.osItens[osId] || state.osItens[osId].length === 0) {
            try {
                await loadOSItens(osId);
            } catch (eItens) {
                console.warn('[Email Modal] Erro ao carregar itens:', eItens);
            }
        }

        const itens = state.osItens[osId] || [];

        // 3. Montar preenchimento da UI do Modal
        document.getElementById('modal-email-os-numero').textContent = numero || (os ? os.numero : '');
        document.getElementById('modal-email-link-display').textContent = linkUrl || '';
        document.getElementById('modal-email-to').value = clienteEmail;

        const assuntoStr = `Aprovação de Arte - Pedido #${numero} - ${clienteNome}${nomeEvento ? ` (${nomeEvento})` : ''}`;
        document.getElementById('modal-email-subject').value = assuntoStr;

        // 4. Construir texto da mensagem (E-mail / WhatsApp)
        let bodyLines = [];
        bodyLines.push(`Olá, ${clienteNome}!`);
        bodyLines.push(``);
        bodyLines.push(`Suas artes relativas ao Pedido #${numero}${nomeEvento ? ` (${nomeEvento})` : ''} já estão prontas para sua conferência e aprovação.`);
        bodyLines.push(``);
        bodyLines.push(`--------------------------------------------------`);
        bodyLines.push(`RESUMO DOS MODELOS DO PEDIDO:`);
        bodyLines.push(`--------------------------------------------------`);

        let modelosContainer = document.getElementById('modal-email-modelos-container');
        if (modelosContainer) modelosContainer.innerHTML = '';

        itens.forEach((item, i) => {
            const idxStr = (i + 1).toString().padStart(2, '0');
            const modNome = item.produto || item.nome_modelo || `Modelo ${i + 1}`;
            const qtdStr = item.qtd || item.quantidade || '0';
            const corStr = item.cor || item.padrao || 'Padrão';
            const numStr = item.gabarito_operacional || item.numeracao || item.tipo_numeracao || 'Padrão';
            const imgUrl = item.arte_url || item.amostra_arte_base64 || '';
            const versoUrl = item.verso_arte_url || item.verso_amostra_arte_base64 || '';

            bodyLines.push(`[${idxStr}] ${modNome}`);
            bodyLines.push(`     • Quantidade: ${qtdStr}`);
            bodyLines.push(`     • Cor: ${corStr}`);
            bodyLines.push(`     • Numeração: ${numStr}`);
            if (imgUrl) bodyLines.push(`     • Imagem da Arte (Frente): ${imgUrl.startsWith('data:') ? '[Arte Gerada no Sistema]' : imgUrl}`);
            if (versoUrl) bodyLines.push(`     • Imagem da Arte (Verso): ${versoUrl.startsWith('data:') ? '[Arte Gerada no Sistema]' : versoUrl}`);
            bodyLines.push(``);

            // Thumbnail do modelo no modal
            if (modelosContainer) {
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid var(--border-color, rgba(255,255,255,0.1));border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;';
                card.innerHTML = `
                    <div style="font-weight:700;font-size:0.8rem;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#${idxStr} - ${modNome}</div>
                    <div style="font-size:0.73rem;color:var(--text-dim, #94a3b8);">Qtd: ${qtdStr} | Cor: ${corStr}</div>
                    ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100px;object-fit:contain;border-radius:4px;background:#000;margin-top:4px;" alt="${modNome}" />` : '<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--text-dim);">Sem Amostra</div>'}
                `;
                modelosContainer.appendChild(card);
            }
        });

        bodyLines.push(`--------------------------------------------------`);
        bodyLines.push(`LINK DE APROVAÇÃO INTERATIVA:`);
        bodyLines.push(linkUrl);
        bodyLines.push(`--------------------------------------------------`);
        bodyLines.push(``);
        bodyLines.push(`Por favor, acesse o link acima para conferir o visual final, aprovar ou indicar alterações necessárias.`);
        bodyLines.push(``);
        bodyLines.push(`Atenciosamente,`);
        bodyLines.push(`Equipe Ideal Imposition / Atendimento`);

        document.getElementById('modal-email-body').value = bodyLines.join('\n');

        // 5. Exibir modal
        modal.style.display = 'flex';
        window._activeEmailModalData = { osId, numero, linkUrl, clienteEmail, clienteNome, bodyText: bodyLines.join('\n') };

    } catch (e) {
        console.error('[Email Modal] Erro ao abrir modal de e-mail:', e);
        toast('Erro ao carregar dados para o e-mail: ' + e.message, 'error');
    }
}

function fecharModalEnviarEmailCliente() {
    const modal = document.getElementById('modal-envio-email-cliente');
    if (modal) modal.style.display = 'none';
}

function copiarLinkClienteModal() {
    const linkStr = document.getElementById('modal-email-link-display')?.textContent || '';
    if (linkStr) {
        navigator.clipboard.writeText(linkStr).then(() => {
            toast('Link de aprovação copiado!', 'success');
        });
    }
}

function copiarTextoEmailModal() {
    const bodyStr = document.getElementById('modal-email-body')?.value || '';
    if (bodyStr) {
        navigator.clipboard.writeText(bodyStr).then(() => {
            toast('Texto do e-mail copiado!', 'success');
        });
    }
}

function copiarWhatsAppModal() {
    const bodyStr = document.getElementById('modal-email-body')?.value || '';
    if (bodyStr) {
        let waText = bodyStr.replace(/--------------------------------------------------/g, '----------------------------');
        navigator.clipboard.writeText(waText).then(() => {
            toast('Texto formatado para WhatsApp copiado!', 'success');
        });
    }
}

function dispararMailtoCliente() {
    const to = document.getElementById('modal-email-to')?.value || '';
    const subject = document.getElementById('modal-email-subject')?.value || '';
    const body = document.getElementById('modal-email-body')?.value || '';

    if (!to) {
        toast('Por favor, informe o e-mail do destinatário!', 'warning');
        return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    toast('Disparando cliente de e-mail...', 'info');
}

window.abrirModalEnviarEmailCliente = abrirModalEnviarEmailCliente;
window.fecharModalEnviarEmailCliente = fecharModalEnviarEmailCliente;
window.copiarLinkClienteModal = copiarLinkClienteModal;
window.copiarTextoEmailModal = copiarTextoEmailModal;
window.copiarWhatsAppModal = copiarWhatsAppModal;
window.dispararMailtoCliente = dispararMailtoCliente;

// ─── CONFIGURAÇÕES E DISPARO DIRETO DE E-MAIL (SMTP / API) ───────────────────

function carregarConfigEmailRemetente() {
    const config = JSON.parse(localStorage.getItem('ideal_email_remetente_config') || '{}');
    const elRemetente = document.getElementById('config-email-remetente');
    const elNome = document.getElementById('config-email-nome');
    const elHost = document.getElementById('config-email-host');
    const elPort = document.getElementById('config-email-port');
    const elUser = document.getElementById('config-email-user');
    const elPass = document.getElementById('config-email-password');
    const elTls = document.getElementById('config-email-tls');

    if (elRemetente) elRemetente.value = config.email_remetente || 'atendimento@ingressoideal.com.br';
    if (elNome) elNome.value = config.nome_remetente || 'Ingresso Ideal — Atendimento';
    if (elHost) elHost.value = config.host || '';
    if (elPort) elPort.value = config.port || '587';
    if (elUser) elUser.value = config.user || '';
    if (elPass) elPass.value = config.has_password ? '******' : (config.password || '');
    if (elTls) elTls.checked = config.use_tls !== false;
}


function fecharModalConfigEmail() {
    const modal = document.getElementById('modal-config-email-remetente');
    if (modal) modal.style.display = 'none';
}

async function salvarConfigEmailRemetente() {
    const config = {
        email_remetente: document.getElementById('config-email-remetente')?.value || '',
        nome_remetente: document.getElementById('config-email-nome')?.value || '',
        host: document.getElementById('config-email-host')?.value || '',
        port: parseInt(document.getElementById('config-email-port')?.value || '587'),
        user: document.getElementById('config-email-user')?.value || '',
        password: document.getElementById('config-email-password')?.value || '',
        use_tls: document.getElementById('config-email-tls')?.checked !== false
    };

    if (!config.email_remetente) {
        toast('Por favor, informe o e-mail remetente!', 'warning');
        return;
    }

    localStorage.setItem('ideal_email_remetente_config', JSON.stringify(config));

    toast('Configurações de e-mail salvas com sucesso! ⚙️', 'success');
    fecharModalConfigEmail();
}

async function testarEnvioEmailConfig() {
    toast('⚠️ Envio direto de e-mail requer servidor SMTP (backend). Use "Abrir Outlook" ou copie o texto por enquanto.', 'warning');
}

async function dispararEmailDiretoCliente() {
    const to = document.getElementById('modal-email-to')?.value || '';
    const subject = document.getElementById('modal-email-subject')?.value || '';
    const body = document.getElementById('modal-email-body')?.value || '';

    if (!to) {
        toast('Por favor, informe o e-mail do cliente (Destinatário)!', 'warning');
        return;
    }
    if (!subject) {
        toast('Por favor, informe o assunto do e-mail!', 'warning');
        return;
    }

    // Sem backend SMTP, redirecionar para mailto como fallback
    toast('Abrindo cliente de e-mail com os dados preenchidos...', 'info');
    const mailtoLink = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
}

window.abrirModalConfigEmail = abrirModalConfigEmail;
window.fecharModalConfigEmail = fecharModalConfigEmail;
window.salvarConfigEmailRemetente = salvarConfigEmailRemetente;
window.testarEnvioEmailConfig = testarEnvioEmailConfig;
window.dispararEmailDiretoCliente = dispararEmailDiretoCliente;



function setFiltroSetor(setor) {
    state.filtroSetor = setor;
    
    // Atualizar botão "Todos os Setores"
    const btnTodos = document.getElementById('btn-filtro-todos-setores');
    if (btnTodos) {
        if (setor === '') {
            btnTodos.classList.add('active');
        } else {
            btnTodos.classList.remove('active');
        }
    }
    
    // Atualizar botões de setor no HTML
    const container = document.getElementById('filter-container-setor');
    if (container) {
        const btns = container.querySelectorAll('.filter-btn-pill');
        btns.forEach(btn => {
            const clickAttr = btn.getAttribute('onclick') || '';
            if (clickAttr.includes(`'${setor}'`) && setor !== '') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    renderOrdens();
}


// setFiltroFilaArte está definida na linha ~14183 com limpeza de filtroStatusArte.
// Não redefinir aqui para não sobrescrever a versão correta.

function setFiltroStatus(status) {


    state.filtroStatus = status;
    
    // Atualizar botões de status no HTML
    const container = document.getElementById('filter-container-status');
    if (container) {
        const btns = container.querySelectorAll('.filter-btn-pill');
        btns.forEach(btn => {
            const clickAttr = btn.getAttribute('onclick') || '';
            if (clickAttr.includes(`'${status}'`)) {
                btn.classList.add('active');
                if (status === '') btn.classList.add('teal');
                else btn.classList.remove('teal');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('teal');
            }
        });
    }
    renderOrdens();
}

function setFiltroSetorArte(setor) {
    state.filtroSetorArte = setor;
    
    // Atualizar botões de setor no HTML
    const container = document.getElementById('filter-container-setor-arte');
    if (container) {
        const btns = container.querySelectorAll('.filter-btn-pill');
        btns.forEach(btn => {
            const clickAttr = btn.getAttribute('onclick') || '';
            if (clickAttr.includes(`'${setor}'`)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    renderOrdens();
}

function setFiltroStatusArte(status) {
    state.filtroStatusArte = status;
    
    // Atualizar botões de status no HTML
    const container = document.getElementById('filter-container-status-arte');
    if (container) {
        const btns = container.querySelectorAll('.filter-btn-pill');
        btns.forEach(btn => {
            const clickAttr = btn.getAttribute('onclick') || '';
            if (clickAttr.includes(`'${status}'`)) {
                btn.classList.add('active');
                if (status === '') btn.classList.add('teal');
                else btn.classList.remove('teal');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('teal');
            }
        });
    }
    renderOrdens();
}

// ============================================================================
// MODULO: IMPRESSORAS E PPDs (Agente Local)
// ============================================================================

// Estado do modulo de impressoras
let _printerAgentUrl = '';
let _printerAgentActive = false;
let _printerList = [];
let _ppdList = [];
let _ppdMap = {};
let _lastImposedBlob = null; // blob do ultimo PDF imposto para impressao direta

// Detectar e verificar agente local
async function checkPrinterAgent() {
    const indicator = document.getElementById('printer-agent-indicator');
    const label = document.getElementById('printer-agent-label');
    const detail = document.getElementById('printer-agent-detail');
    const printerCard = document.getElementById('printer-list-card');
    const ppdCard = document.getElementById('ppd-list-card');
    const navBtn = document.getElementById('nav-impressoras');
    const badge = document.getElementById('badge-impressoras');

    _printerAgentActive = false;
    _printerAgentUrl = ''; // Não usamos mais URL direta
    window._activeAgentData = null;

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            // Considerar online quem deu heartbeat nos ultimos 2 minutos
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            const { data } = await supabaseClient
                .from('print_agents')
                .select('*')
                .eq('status', 'online')
                .gte('last_seen', twoMinutesAgo)
                .order('last_seen', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                _printerAgentActive = true;
                window._activeAgentData = data[0];
            }
        } catch (e) {
            console.error('Erro ao checar print_agents no Supabase:', e);
        }
    }

    if (_printerAgentActive) {
        if (indicator) indicator.style.background = '#22c55e';
        if (label) label.textContent = 'Agente Local Ativo';
        if (detail) detail.textContent = `Conectado via Nuvem (${window._activeAgentData.name})`;
        if (printerCard) { printerCard.style.opacity = '1'; printerCard.style.pointerEvents = 'auto'; }
        if (ppdCard) { ppdCard.style.opacity = '0.5'; ppdCard.style.pointerEvents = 'none'; ppdCard.style.display = 'none'; }
        if (navBtn) navBtn.style.display = '';
        if (badge) { badge.style.display = 'inline-block'; }
        
        const btnPrint = document.getElementById('btn-impose-print');
        if (btnPrint) { btnPrint.disabled = false; btnPrint.style.opacity = '1'; }
        
        // Habilitar botão de imprimir da aba Pedido também
        const pedBtnPrint = document.getElementById('ped-btn-impose-print');
        if (pedBtnPrint) { pedBtnPrint.disabled = false; pedBtnPrint.style.opacity = '1'; }
        
        await loadPrinters();
    } else {
        if (indicator) indicator.style.background = '#ef4444';
        if (label) label.textContent = 'Agente Local Inativo';
        if (detail) detail.textContent = 'Inicie o NewProd.exe no computador da impressora.';
        if (printerCard) { printerCard.style.opacity = '0.5'; printerCard.style.pointerEvents = 'none'; }
        if (ppdCard) { ppdCard.style.opacity = '0.5'; ppdCard.style.pointerEvents = 'none'; ppdCard.style.display = 'none'; }
        if (badge) badge.style.display = 'none';
        
        const btnPrint = document.getElementById('btn-impose-print');
        if (btnPrint) { btnPrint.disabled = true; btnPrint.style.opacity = '0.5'; }
        
        // Botão de imprimir do Pedido permanece ativo mesmo sem agente cloud
        // pois pode usar impressão local direta
        const pedBtnPrint = document.getElementById('ped-btn-impose-print');
        if (pedBtnPrint) { pedBtnPrint.disabled = false; pedBtnPrint.style.opacity = '1'; }
    }
    return _printerAgentActive;
}

async function loadPrinters() {
    if (!_printerAgentActive || !window._activeAgentData) return;
    const body = document.getElementById('printer-list-body');
    try {
        const json = window._activeAgentData.printers_json || {};
        const printers = json.printers || [];
        _printerList = printers.map(p => typeof p === 'object' ? p.name : p);
        renderPrinterList();
    } catch (e) {
        if (body) body.innerHTML = `<p style="color:#ef4444;font-size:0.85rem;">Erro ao carregar impressoras: ${e.message}</p>`;
    }
}

// Renderizar lista de impressoras e suas capacidades nativas
function renderPrinterList() {
    const body = document.getElementById('printer-list-body');
    if (!body) return;
    if (!_printerList.length) {
        body.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Nenhuma impressora encontrada.</p>';
        return;
    }
    
    const capabilities = window._activeAgentData?.printers_json?.capabilities || {};

    body.innerHTML = _printerList.map(name => {
        const caps = capabilities[name] || {};
        const papersCount = caps.papers ? caps.papers.length : 0;
        const traysCount = caps.trays ? caps.trays.length : 0;
        const duplexSupport = caps.duplex_supported ? 'Sim' : 'Não';
        return `
        <div style="display:flex;flex-direction:column;gap:4px;padding:12px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:0.95rem;font-weight:600;color:var(--text-primary);">${name}</span>
            <span style="font-size:0.75rem;color:var(--text-dim);">
                Gavetas/Bandejas: <strong>${traysCount}</strong> | 
                Formatos de Papel: <strong>${papersCount}</strong> | 
                Frente e Verso: <strong>${duplexSupport}</strong>
            </span>
        </div>`;
    }).join('');
}

// Stubs para compatibilidade legado
function onPPDMapChange() {}
async function loadPPDs() {}
function renderPPDList() {}
async function uploadPPD(input) { input.value = ''; }
async function loadPPDMap() {}
async function savePrinterPPDMap() {}

// ═══════════════════════════════════════════════════════════
// MÓDULO: IMPRESSÃO DIRETA COM DRIVER WINDOWS
// ═══════════════════════════════════════════════════════════

// Estado da fila de impressão
let _printBlobQueue = [];   // [{name, blob}]
let _printQueueIndex = 0;   // índice atual na fila

// Carrega impressoras do servidor local ou do agente cloud
async function _loadPrinterListIfEmpty() {
    if (_printerList && _printerList.length > 0) return;
    try {
        // Sempre usar o hostname atual na porta 9000 (servidor local)
        const apiBase = `http://${window.location.hostname}:9000`;
        const res = await fetch(`${apiBase}/api/printers`);
        if (res.ok) {
            const data = await res.json();
            _printerList = (data.printers || data || []).map(p => typeof p === 'object' ? p.name : p);
        }
    } catch (e) {
        console.warn('[PrintModal] Servidor local não disponível.');
    }
}

// Popula o select de impressoras no modal
function _populatePrinterSelect() {
    const sel = document.getElementById('print-direct-printer');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Selecione a impressora...</option>';
    if (_printerList && _printerList.length > 0) {
        _printerList.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === current) opt.selected = true;
            sel.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.textContent = '— Nenhuma impressora detectada —';
        sel.appendChild(opt);
    }
}

// Abre o modal para um único blob
async function openPrintModal(blob) {
    _printBlobQueue = [{ name: 'imposicao.pdf', blob }];
    _printQueueIndex = 0;
    _lastImposedBlob = blob;
    await _openModalUI();
}

// Abre o modal para uma fila de blobs (impressão sequencial)
async function openPrintModalQueue(queue) {
    _printBlobQueue = queue || [];
    _printQueueIndex = 0;
    _lastImposedBlob = _printBlobQueue.length > 0 ? _printBlobQueue[0].blob : null;
    await _openModalUI();
}

// Exibe a UI do modal
async function _openModalUI() {
    const modal = document.getElementById('modal-print-direct');
    if (!modal) return;
    modal.style.display = 'flex';

    // Resetar estado
    const optDiv = document.getElementById('print-direct-options');
    const loadDiv = document.getElementById('print-options-loading');
    const statusDiv = document.getElementById('print-send-status');
    const btnSend = document.getElementById('btn-send-print');
    const driverStatus = document.getElementById('print-driver-status');

    if (optDiv) optDiv.style.display = 'none';
    if (loadDiv) loadDiv.style.display = 'none';
    if (statusDiv) statusDiv.style.display = 'none';
    if (driverStatus) driverStatus.style.display = 'none';
    if (btnSend) { btnSend.disabled = true; btnSend.style.opacity = '0.5'; }

    // Exibir indicador de fila se múltiplos arquivos
    const queueIndicator = document.getElementById('print-queue-indicator');
    const queueList = document.getElementById('print-queue-list');
    const queueCounter = document.getElementById('print-queue-counter');
    if (queueIndicator && _printBlobQueue.length > 1) {
        queueIndicator.style.display = 'block';
        if (queueCounter) queueCounter.textContent = `${_printBlobQueue.length} arquivo(s)`;
        if (queueList) {
            queueList.innerHTML = _printBlobQueue.map((item, i) =>
                `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(255,255,255,0.04);border-radius:6px;" id="print-queue-item-${i}">
                    <span style="width:20px;height:20px;background:rgba(99,102,241,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#a5b4fc;flex-shrink:0;">${i+1}</span>
                    <span style="font-size:0.78rem;color:${i === 0 ? '#f1f5f9' : 'var(--text-dim)'};">${item.name}</span>
                    <span id="print-queue-status-${i}" style="margin-left:auto;font-size:0.72rem;color:${i === 0 ? '#fbbf24' : 'var(--text-dim)'};">${i === 0 ? '⏳ Atual' : '⌛ Aguardando'}</span>
                </div>`
            ).join('');
        }
    } else if (queueIndicator) {
        queueIndicator.style.display = 'none';
    }

    // Atualizar subtítulo
    const subtitle = document.getElementById('print-modal-subtitle');
    if (subtitle) {
        if (_printBlobQueue.length > 1) {
            subtitle.textContent = `${_printBlobQueue.length} arquivo(s) — impressão sequencial`;
        } else {
            subtitle.textContent = _printBlobQueue[0]?.name || 'Configurar opções do driver';
        }
    }

    // Carregar impressoras
    await _loadPrinterListIfEmpty();
    _populatePrinterSelect();
}

function closePrintModal() {
    const modal = document.getElementById('modal-print-direct');
    if (modal) modal.style.display = 'none';
    _printBlobQueue = [];
    _printQueueIndex = 0;
}

// Recarregar lista de impressoras manualmente
async function reloadPrinterList() {
    _printerList = [];
    const btn = event?.currentTarget;
    if (btn) btn.style.animation = 'spin 0.6s linear';
    await _loadPrinterListIfEmpty();
    _populatePrinterSelect();
    if (btn) btn.style.animation = '';
    
    const driverStatus = document.getElementById('print-driver-status');
    const driverStatusText = document.getElementById('print-driver-status-text');
    if (driverStatus && driverStatusText) {
        driverStatusText.textContent = `✓ ${_printerList.length} impressora(s) detectada(s) no sistema`;
        driverStatus.style.display = 'block';
        setTimeout(() => { if (driverStatus) driverStatus.style.display = 'none'; }, 3000);
    }
}

// Ao mudar impressora no modal, carregar opções do driver
async function onPrintPrinterChange() {
    const sel = document.getElementById('print-direct-printer');
    const optDiv = document.getElementById('print-direct-options');
    const loadDiv = document.getElementById('print-options-loading');
    const btnSend = document.getElementById('btn-send-print');

    const printerName = sel ? sel.value : '';
    if (btnSend) { btnSend.disabled = !printerName; btnSend.style.opacity = printerName ? '1' : '0.5'; }

    if (!optDiv) return;
    if (!printerName) {
        optDiv.style.display = 'none';
        return;
    }

    // Mostrar loading
    if (loadDiv) loadDiv.style.display = 'block';
    if (optDiv) optDiv.style.display = 'none';

    // Buscar capacidades do driver
    let caps = null;

    // 1. Tentar via agente cloud (já carregado no heartbeat)
    if (window._activeAgentData?.printers_json?.capabilities) {
        caps = window._activeAgentData.printers_json.capabilities[printerName];
    }

    // 2. Tentar via API local (porta 9000 no mesmo servidor)
    if (!caps) {
        try {
            const apiBase = `http://${window.location.hostname}:9000`;
            const res = await fetch(`${apiBase}/api/printers/${encodeURIComponent(printerName)}/capabilities`);
            if (res.ok) caps = await res.json();
        } catch (e) {
            console.warn('[PrintModal] Não foi possível ler capacidades do driver:', e.message);
        }
    }

    // 3. Fallback padrão
    if (!caps) {
        caps = {
            duplex_supported: true,
            papers: [{id: 9, name: 'A4'}, {id: 8, name: 'A3'}],
            trays: [{id: 7, name: 'Auto'}],
            defaults: { duplex: 1, paper_size: 9, tray: 7, color: 2, copies: 1 }
        };
    }

    // Esconder loading
    if (loadDiv) loadDiv.style.display = 'none';
    if (optDiv) optDiv.style.display = 'block';

    // Preencher selects com os dados do driver
    const defaultTray = caps.defaults?.tray ?? 7;
    const defaultPaper = caps.defaults?.paper_size ?? 9;
    const defaultDuplex = caps.defaults?.duplex ?? 1;
    const defaultColor = caps.defaults?.color ?? 2;
    const defaultCopies = caps.defaults?.copies ?? 1;

    const traySel = document.getElementById('print-option-tray');
    if (traySel) {
        traySel.innerHTML = (caps.trays?.length
            ? caps.trays.map(t => `<option value="${t.id}" ${t.id === defaultTray ? 'selected' : ''}>${t.name}</option>`)
            : [`<option value="7" selected>Auto</option>`]
        ).join('');
    }

    const paperSel = document.getElementById('print-option-paper-size');
    if (paperSel) {
        paperSel.innerHTML = (caps.papers?.length
            ? caps.papers.map(p => `<option value="${p.id}" ${p.id === defaultPaper ? 'selected' : ''}>${p.name}</option>`)
            : [`<option value="9" selected>A4</option>`, `<option value="8">A3</option>`]
        ).join('');
    }

    const duplexSel = document.getElementById('print-option-duplex');
    if (duplexSel) {
        duplexSel.disabled = false;
        const isJobDuplex = state.printMode === 'duplex' || (state.activeOSItem && !!state.activeOSItem.verso);
        const targetDuplex = isJobDuplex ? 2 : (defaultDuplex || 1);
        duplexSel.value = String(targetDuplex);
    }

    const colorSel = document.getElementById('print-option-color');
    if (colorSel) {
        colorSel.querySelectorAll('option').forEach(opt => {
            opt.selected = parseInt(opt.value) === defaultColor;
        });
    }

    const copiesInput = document.getElementById('print-option-copies');
    if (copiesInput) copiesInput.value = defaultCopies;

    // Exibir status do driver
    const driverStatus = document.getElementById('print-driver-status');
    const driverStatusText = document.getElementById('print-driver-status-text');
    if (driverStatus && driverStatusText) {
        const hasRealData = caps.papers?.length > 0 || caps.trays?.length > 0;
        if (hasRealData) {
            driverStatusText.textContent = `✓ Driver detectado — ${caps.papers?.length || 0} papel(is), ${caps.trays?.length || 0} bandeja(s)`;
            driverStatus.style.background = 'rgba(34,197,94,0.1)';
            driverStatus.style.borderColor = 'rgba(34,197,94,0.2)';
            driverStatusText.style.color = '#4ade80';
        } else {
            driverStatusText.textContent = '⚠ Capacidades padrão (driver não respondeu)';
            driverStatus.style.background = 'rgba(251,191,36,0.1)';
            driverStatus.style.borderColor = 'rgba(251,191,36,0.2)';
            driverStatusText.style.color = '#fbbf24';
        }
        driverStatus.style.display = 'block';
    }
}

// Enviar job de impressão (suporta modo Local direto e Cloud Relay)
// Quando há fila, processa sequencialmente
async function sendPrintJob() {
    const sel = document.getElementById('print-direct-printer');
    const printerName = sel ? sel.value : '';
    if (!printerName) { toast('Selecione uma impressora.', 'error'); return; }

    const orientation = document.querySelector('input[name="print-orientation"]:checked')?.value || '1';
    const options = {
        paper_size: parseInt(document.getElementById('print-option-paper-size')?.value) || 9,
        tray: parseInt(document.getElementById('print-option-tray')?.value) || 7,
        duplex: parseInt(document.getElementById('print-option-duplex')?.value) || 1,
        color: parseInt(document.getElementById('print-option-color')?.value) || 2,
        copies: parseInt(document.getElementById('print-option-copies')?.value) || 1,
        orientation: parseInt(orientation)
    };

    const btnSend = document.getElementById('btn-send-print');
    const statusDiv = document.getElementById('print-send-status');
    const statusText = document.getElementById('print-status-text');
    const statusBar = document.getElementById('print-status-bar');

    if (btnSend) { btnSend.disabled = true; btnSend.style.opacity = '0.5'; }
    if (statusDiv) statusDiv.style.display = 'block';

    const isLocalMode = !window._activeAgentData ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    const queue = _printBlobQueue.length > 0 ? _printBlobQueue : [{ name: 'imposicao.pdf', blob: _lastImposedBlob }];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const progress = Math.round((i / queue.length) * 100);

        if (statusText) statusText.textContent = `Enviando ${i + 1}/${queue.length}: ${item.name}...`;
        if (statusBar) statusBar.style.width = `${progress}%`;

        // Atualizar indicador de fila
        const queueStatusEl = document.getElementById(`print-queue-status-${i}`);
        if (queueStatusEl) { queueStatusEl.textContent = '⏳ Enviando...'; queueStatusEl.style.color = '#fbbf24'; }

        try {
            if (isLocalMode) {
                const formData = new FormData();
                formData.append('file', item.blob, item.name);
                formData.append('printer_name', printerName);
                formData.append('options', JSON.stringify(options));

                const res = await fetch('/api/print/submit', { method: 'POST', body: formData });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(errText || 'Falha ao enviar para impressora local.');
                }
            } else {
                // Cloud Relay via Supabase
                if (!_printerAgentActive || !window._activeAgentData) {
                    throw new Error('Agente de Impressão inativo. Inicie o NewProd.exe.');
                }
                const fileName = `print_job_${Date.now()}_${i}.pdf`;
                const filePath = `${window._activeAgentData.id}/${fileName}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from('print_jobs')
                    .upload(filePath, item.blob, { contentType: 'application/pdf', upsert: false });
                if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);

                const { data: urlData } = supabaseClient.storage.from('print_jobs').getPublicUrl(filePath);
                const { error: dbError } = await supabaseClient.from('print_queue').insert({
                    agent_id: window._activeAgentData.id,
                    file_url: urlData.publicUrl,
                    printer_name: printerName,
                    ppd_options: options,
                    status: 'pending'
                });
                if (dbError) throw new Error(`Falha ao registrar job: ${dbError.message}`);
            }

            successCount++;
            if (queueStatusEl) { queueStatusEl.textContent = '✓ Enviado'; queueStatusEl.style.color = '#4ade80'; }
        } catch (e) {
            failCount++;
            if (queueStatusEl) { queueStatusEl.textContent = '✗ Erro'; queueStatusEl.style.color = '#ef4444'; }
            console.error(`[PrintModal] Erro ao enviar ${item.name}:`, e);
            toast(`Erro ao imprimir "${item.name}": ${e.message}`, 'error');
        }
    }

    if (statusBar) statusBar.style.width = '100%';

    if (failCount === 0) {
        if (statusText) statusText.textContent = `✓ Todos os ${successCount} arquivo(s) enviados para "${printerName}"!`;
        toast(`${successCount} arquivo(s) enviado(s) para "${printerName}" com sucesso!`, 'success');
        setTimeout(() => closePrintModal(), 1500);
    } else {
        if (statusText) statusText.textContent = `${successCount} enviado(s), ${failCount} com erro.`;
        if (btnSend) { btnSend.disabled = false; btnSend.style.opacity = '1'; }
    }
}

// Verificar agente ao abrir aba de impressoras
const _origSwitchView = window.switchView || null;
function switchViewWithPrinterCheck(viewId) {
    if (_origSwitchView) _origSwitchView(viewId);
    if (viewId === 'view-impressoras') checkPrinterAgent();
}

// Inicializar: verificar agente silenciosamente ao carregar
(async function initPrinterModule() {
    try {
        await checkPrinterAgent();
    } catch (_) {}
})();

// Exportar funções globais
window.checkPrinterAgent = checkPrinterAgent;
window.loadPrinters = loadPrinters;
window.loadPPDs = loadPPDs;
window.uploadPPD = uploadPPD;
window.savePrinterPPDMap = savePrinterPPDMap;
window.openPrintModal = openPrintModal;
window.openPrintModalQueue = openPrintModalQueue;
window.closePrintModal = closePrintModal;
window.reloadPrinterList = reloadPrinterList;
window.onPrintPrinterChange = onPrintPrinterChange;
window.sendPrintJob = sendPrintJob;
window.onPPDMapChange = onPPDMapChange;

// ═══════════════════════════════════════════════════════════
// PAINEL LATERAL DE DRIVER — na área de preview do pedido
// ═══════════════════════════════════════════════════════════

// Inicializa o painel de impressão lateral quando um item é selecionado
async function initPedPrintPanel() {
    const panel = document.getElementById('ped-print-driver-panel');
    if (!panel) return;

    // Popular select de impressoras
    await _loadPrinterListIfEmpty();
    const sel = document.getElementById('ped-print-printer');
    if (!sel) return;

    const current = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>';
    if (_printerList && _printerList.length > 0) {
        _printerList.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === current) opt.selected = true;
            sel.appendChild(opt);
        });
        // Se só há uma impressora, selecionar automaticamente
        if (_printerList.length === 1 && !current) {
            sel.value = _printerList[0];
            await onPedPrinterChange();
        }
        // Se havia uma seleção anterior, manter e recarregar opções
        else if (current && _printerList.includes(current)) {
            await onPedPrinterChange();
        }
    }
}

// Recarregar lista de impressoras no painel lateral
async function reloadPedPrinterList() {
    _printerList = [];
    const btn = document.getElementById('ped-print-reload-btn');
    if (btn) btn.style.animation = 'spin 0.6s linear';
    await _loadPrinterListIfEmpty();
    await initPedPrintPanel();
    if (btn) btn.style.animation = '';

    const statusEl = document.getElementById('ped-driver-status');
    if (statusEl) {
        statusEl.textContent = `✓ ${_printerList.length} impressora(s) detectada(s)`;
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(34,197,94,0.1)';
        statusEl.style.border = '1px solid rgba(34,197,94,0.2)';
        statusEl.style.color = '#4ade80';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    }
}

// Ao mudar impressora no painel lateral → carregar opções do driver
async function onPedPrinterChange() {
    const sel = document.getElementById('ped-print-printer');
    const optDiv = document.getElementById('ped-driver-options');
    const loadDiv = document.getElementById('ped-driver-loading');
    const hintDiv = document.getElementById('ped-driver-hint');
    const statusEl = document.getElementById('ped-driver-status');

    const printerName = sel ? sel.value : '';

    if (!printerName) {
        if (optDiv) optDiv.style.display = 'none';
        if (hintDiv) hintDiv.style.display = 'flex';
        if (statusEl) statusEl.style.display = 'none';
        return;
    }

    if (hintDiv) hintDiv.style.display = 'none';
    if (loadDiv) loadDiv.style.display = 'block';
    if (optDiv) optDiv.style.display = 'none';

    // Buscar capacidades
    let caps = null;
    if (window._activeAgentData?.printers_json?.capabilities) {
        caps = window._activeAgentData.printers_json.capabilities[printerName];
    }
    if (!caps) {
        try {
            // Sempre usar o hostname atual na porta 9000
            const apiBase = `http://${window.location.hostname}:9000`;
            const url = `${apiBase}/api/printers/${encodeURIComponent(printerName)}/capabilities`;
            console.log('[PedDriverPanel] Buscando capacidades:', url);
            const res = await fetch(url);
            if (res.ok) {
                caps = await res.json();
                console.log('[PedDriverPanel] Capacidades recebidas:', caps);
            } else {
                console.warn('[PedDriverPanel] Resposta não-OK:', res.status, res.statusText);
            }
        } catch (e) {
            console.warn('[PedDriverPanel] Erro ao buscar capacidades do driver:', e.message);
        }
    }
    if (!caps) {
        caps = {
            duplex_supported: true,
            papers: [{id: 9, name: 'A4'}, {id: 8, name: 'A3'}],
            trays: [{id: 7, name: 'Auto'}],
            defaults: { duplex: 1, paper_size: 9, tray: 7, color: 2, copies: 1 }
        };
    }

    if (loadDiv) loadDiv.style.display = 'none';
    if (optDiv) optDiv.style.display = 'flex';

    const defaultTray = caps.defaults?.tray ?? 7;
    const defaultPaper = caps.defaults?.paper_size ?? 9;
    const defaultDuplex = caps.defaults?.duplex ?? 1;
    const defaultColor = caps.defaults?.color ?? 2;
    const defaultCopies = caps.defaults?.copies ?? 1;

    // Detectar se o formato ativo tem "Gerar Capa e Contracapa"
    const fmtId = document.getElementById('ped-formato')?.value;
    const fmtObj = fmtId ? (state.formatos || []).find(f => String(f.id) === String(fmtId)) : null;
    const hasCover = fmtObj?.has_cover === true;

    const traySingle = document.getElementById('ped-tray-single');
    const trayDual = document.getElementById('ped-tray-dual');
    if (traySingle) traySingle.style.display = hasCover ? 'none' : 'block';
    if (trayDual) trayDual.style.display = hasCover ? 'block' : 'none';

    const trayOptionsHtml = (caps.trays?.length
        ? caps.trays.map(t => `<option value="${t.id}" ${t.id === defaultTray ? 'selected' : ''}>${t.name}</option>`)
        : ['<option value="7" selected>Auto</option>']
    ).join('');

    const traySel = document.getElementById('ped-print-tray');
    if (traySel) traySel.innerHTML = trayOptionsHtml;

    // Popular bandejas duplas com as mesmas opções
    const trayCapaSel = document.getElementById('ped-print-tray-capa');
    const trayMioloSel = document.getElementById('ped-print-tray-miolo');
    if (trayCapaSel) trayCapaSel.innerHTML = trayOptionsHtml;
    if (trayMioloSel) trayMioloSel.innerHTML = trayOptionsHtml;

    const paperSel = document.getElementById('ped-print-paper');
    if (paperSel) {
        paperSel.innerHTML = (caps.papers?.length
            ? caps.papers.map(p => `<option value="${p.id}" ${p.id === defaultPaper ? 'selected' : ''}>${p.name}</option>`)
            : ['<option value="9" selected>A4</option>', '<option value="8">A3</option>']
        ).join('');
    }

    const duplexSel = document.getElementById('ped-print-duplex');
    if (duplexSel) {
        duplexSel.disabled = false;
        const isJobDuplex = state.printMode === 'duplex' || (state.activeOSItem && !!state.activeOSItem.verso);
        const targetDuplex = isJobDuplex ? 2 : (defaultDuplex || 1);
        duplexSel.value = String(targetDuplex);
    }

    const colorSel = document.getElementById('ped-print-color');
    if (colorSel) {
        colorSel.querySelectorAll('option').forEach(opt => {
            opt.selected = parseInt(opt.value) === defaultColor;
        });
    }

    const copiesInput = document.getElementById('ped-print-copies');
    if (copiesInput) copiesInput.value = defaultCopies;

    // Status do driver
    if (statusEl) {
        const hasRealData = caps.papers?.length > 0 || caps.trays?.length > 0;
        if (hasRealData) {
            statusEl.textContent = `✓ ${caps.papers?.length || 0} papel(is), ${caps.trays?.length || 0} bandeja(s)`;
            statusEl.style.background = 'rgba(34,197,94,0.1)';
            statusEl.style.border = '1px solid rgba(34,197,94,0.2)';
            statusEl.style.color = '#4ade80';
        } else {
            statusEl.textContent = '⚠ Opções padrão';
            statusEl.style.background = 'rgba(251,191,36,0.1)';
            statusEl.style.border = '1px solid rgba(251,191,36,0.2)';
            statusEl.style.color = '#fbbf24';
        }
        statusEl.style.display = 'block';
    }
}

// Retorna as opções configuradas no painel lateral para uso direto no sendPrintJob
function getPedPrintOptions() {
    const printerName = document.getElementById('ped-print-printer')?.value || '';
    const trayDual = document.getElementById('ped-tray-dual');
    const isDualTray = trayDual && trayDual.style.display !== 'none';
    const options = {
        paper_size: parseInt(document.getElementById('ped-print-paper')?.value) || 9,
        tray: parseInt(document.getElementById('ped-print-tray')?.value) || 7,
        duplex: parseInt(document.getElementById('ped-print-duplex')?.value) || 1,
        color: parseInt(document.getElementById('ped-print-color')?.value) || 2,
        copies: parseInt(document.getElementById('ped-print-copies')?.value) || 1,
        orientation: parseInt(document.getElementById('ped-print-orientation')?.value) || 1,
        impressao_reversa: document.getElementById('ped-print-reverse')?.checked === true,
        folha_a_folha: document.getElementById('ped-print-sheet-by-sheet')?.checked === true
    };
    if (isDualTray) {
        options.tray_capa = parseInt(document.getElementById('ped-print-tray-capa')?.value) || options.tray;
        options.tray_miolo = parseInt(document.getElementById('ped-print-tray-miolo')?.value) || options.tray;
    }
    return { printerName, options };
}

// Processa a fila de PDFs aplicando Impressão Reversa e/ou Folha a Folha se ativados
async function processPrintQueueOptions(queue, options) {
    if (!options || (!options.impressao_reversa && !options.folha_a_folha)) {
        return queue;
    }

    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) {
        console.warn('[processPrintQueueOptions] window.PDFLib.PDFDocument não disponível.');
        return queue;
    }

    const newQueue = [];

    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            const arrayBuffer = await item.blob.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const totalPages = pdfDoc.getPageCount();

            // Determinar a ordem das páginas (reversa: N -> 1, normal: 1 -> N)
            const pageIndices = [];
            if (options.impressao_reversa) {
                for (let p = totalPages - 1; p >= 0; p--) pageIndices.push(p);
            } else {
                for (let p = 0; p < totalPages; p++) pageIndices.push(p);
            }

            if (options.folha_a_folha) {
                // Gerar 1 arquivo PDF para cada página individualmente na ordem calculada
                const baseName = (item.name || 'documento.pdf').replace(/\.pdf$/i, '');
                for (let k = 0; k < pageIndices.length; k++) {
                    const pageIdx = pageIndices[k];
                    const singleDoc = await PDFDocument.create();
                    const [copiedPage] = await singleDoc.copyPages(pdfDoc, [pageIdx]);
                    singleDoc.addPage(copiedPage);
                    const singleBytes = await singleDoc.save();
                    const singleBlob = new Blob([singleBytes], { type: 'application/pdf' });
                    const pageNumStr = String(pageIdx + 1).padStart(3, '0');
                    newQueue.push({
                        name: `${baseName}_pag_${pageNumStr}.pdf`,
                        blob: singleBlob
                    });
                }
            } else if (options.impressao_reversa) {
                // Arquivo único contendo todas as páginas em ordem invertida
                const reverseDoc = await PDFDocument.create();
                const copiedPages = await reverseDoc.copyPages(pdfDoc, pageIndices);
                copiedPages.forEach(p => reverseDoc.addPage(p));
                const reverseBytes = await reverseDoc.save();
                const reverseBlob = new Blob([reverseBytes], { type: 'application/pdf' });
                newQueue.push({ name: item.name, blob: reverseBlob });
            } else {
                newQueue.push(item);
            }
        } catch (err) {
            console.error(`[processPrintQueueOptions] Erro ao reordenar PDF "${item.name}":`, err);
            newQueue.push(item);
        }
    }
    return newQueue;
}

// Envia os blobs gerados diretamente para a impressora configurada no painel lateral
// sem abrir o modal (modo "print sem modal")
async function sendPrintJobDirect(queue) {
    const { printerName, options } = getPedPrintOptions();

    if (!printerName) {
        toast('Selecione uma impressora no painel de configuração de impressão.', 'error');
        return false;
    }

    const btnCancelPed = document.getElementById('ped-btn-cancel-print');
    if (btnCancelPed) btnCancelPed.style.display = 'inline-flex';
    const btnImpose = document.getElementById('ped-btn-impose');
    if (btnImpose) btnImpose.style.display = 'none';
    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    if (btnImposePrint) btnImposePrint.style.display = 'none';

    try {
        window.isPrinting = true;

        // Aplicar transformações de Impressão Reversa / Folha a Folha se selecionados
        if (options.impressao_reversa || options.folha_a_folha) {
            const modoDesc = options.impressao_reversa && options.folha_a_folha
                ? 'Reversa + Folha a Folha'
                : (options.impressao_reversa ? 'Impressão Reversa' : 'Folha a Folha');
            toast(`Processando páginas (${modoDesc})...`, 'info');
            queue = await processPrintQueueOptions(queue, options);
        }

        const isLocalMode = !window._activeAgentData ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < queue.length; i++) {
            if (window._printCancelRequested) {
                console.warn('[sendPrintJobDirect] Interrompido por solicitação de cancelamento.');
                toast('🛑 Envio para a impressora cancelado!', 'warning');
                window._printCancelRequested = false;
                return false;
            }

            const item = queue[i];
            toast(`Enviando ${i + 1}/${queue.length}: ${item.name}...`, 'info');

            // Determinar bandeja correta baseado no tipo de arquivo (capa/miolo)
            let itemOptions = { ...options };
            if (options.tray_capa && options.tray_miolo) {
                const nameLower = (item.name || '').toLowerCase();
                if (nameLower.includes('_capa') || nameLower.includes('_contracapa')) {
                    itemOptions.tray = options.tray_capa;
                } else {
                    itemOptions.tray = options.tray_miolo;
                }
            }

            try {
                if (isLocalMode) {
                    const formData = new FormData();
                    formData.append('file', item.blob, item.name);
                    formData.append('printer_name', printerName);
                    formData.append('options', JSON.stringify(itemOptions));
                    const res = await fetch('/api/print/submit', { method: 'POST', body: formData });
                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(errText || 'Falha ao enviar para impressora local.');
                    }
                } else {
                    if (!_printerAgentActive || !window._activeAgentData) {
                        throw new Error('Agente de Impressão inativo. Inicie o NewProd.exe.');
                    }
                    const fileName = `print_job_${Date.now()}_${i}.pdf`;
                    const filePath = `${window._activeAgentData.id}/${fileName}`;
                    const { error: uploadError } = await supabaseClient.storage
                        .from('print_jobs')
                        .upload(filePath, item.blob, { contentType: 'application/pdf', upsert: false });
                    if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);
                    const { data: urlData } = supabaseClient.storage.from('print_jobs').getPublicUrl(filePath);
                    const { error: dbError } = await supabaseClient.from('print_queue').insert({
                        agent_id: window._activeAgentData.id,
                        file_url: urlData.publicUrl,
                        printer_name: printerName,
                        ppd_options: options,
                        status: 'pending'
                    });
                    if (dbError) throw new Error(`Falha ao registrar job: ${dbError.message}`);
                }
                successCount++;
            } catch (e) {
                failCount++;
                console.error(`[PrintDirect] Erro ao enviar ${item.name}:`, e);
                toast(`Erro ao imprimir "${item.name}": ${e.message}`, 'error');
            }
        }

        if (failCount === 0) {
            toast(`✓ ${successCount} arquivo(s) enviado(s) para "${printerName}"!`, 'success');
            return true;
        }
        return false;
    } finally {
        window.isPrinting = false;
        if (btnCancelPed) btnCancelPed.style.display = 'none';
        if (btnImpose) btnImpose.style.display = 'inline-flex';
        if (btnImposePrint) btnImposePrint.style.display = 'inline-flex';
    }
}


// ═══════════════════════════════════════════════════════════════════════
// MEMÓRIA DE CONFIGURAÇÃO DE IMPRESSORA POR PRODUTO
// ═══════════════════════════════════════════════════════════════════════

// Cache local para evitar requisicoes repetidas
const _printConfigCache = {};

function _getActiveProductInfo() {
    const activeItem = state.activeOSItem;
    if (!activeItem) return null;
    const itens = state.osItens[activeItem.osId] || [];
    const item = itens.find(i => String(i.id) === String(activeItem.itemId));
    if (!item) return null;
    const prodId = item._vibe_id_produto || item.id_produto || item.produto_id || null;
    if (!prodId) return null;
    const prodObj = (state.produtosGlobais || []).find(p => String(p.id_produto) === String(prodId));
    const prodNome = prodObj ? (prodObj.nomeReal || `Produto #${prodId}`) : (item.nome_produto_real || item.produto || 'Produto');
    return { prodId: String(prodId), prodNome };
}

function _updateSaveButtonLabel() {
    const info = _getActiveProductInfo();
    const label = document.getElementById('ped-print-save-label');
    const section = document.getElementById('ped-print-save-section');
    if (!info || !label) {
        if (section) section.style.display = 'none';
        return;
    }
    // Truncar nome do produto se muito longo
    const shortName = info.prodNome.length > 25 ? info.prodNome.substring(0, 22) + '...' : info.prodNome;
    label.textContent = `Salvar para "${shortName}"`;
    if (section) section.style.display = 'block';
}

async function savePrintConfigForProduct() {
    const info = _getActiveProductInfo();
    if (!info) return toast('Nenhum produto ativo para salvar.', 'warning');

    const printerSel = document.getElementById('ped-print-printer');
    if (!printerSel || !printerSel.value) return toast('Selecione uma impressora primeiro.', 'warning');

    const config = {
        produto_id: String(info.prodId),
        produto_nome: info.prodNome,
        printer_name: printerSel.value,
        tray: parseInt(document.getElementById('ped-print-tray')?.value) || null,
        tray_capa: parseInt(document.getElementById('ped-print-tray-capa')?.value) || null,
        tray_miolo: parseInt(document.getElementById('ped-print-tray-miolo')?.value) || null,
        paper_size: parseInt(document.getElementById('ped-print-paper')?.value) || null,
        duplex: parseInt(document.getElementById('ped-print-duplex')?.value) || 1,
        color: parseInt(document.getElementById('ped-print-color')?.value) || 2,
        copies: parseInt(document.getElementById('ped-print-copies')?.value) || 1,
        orientation: parseInt(document.getElementById('ped-print-orientation')?.value) || 1,
        impressao_reversa: document.getElementById('ped-print-reverse')?.checked === true,
        folha_a_folha: document.getElementById('ped-print-sheet-by-sheet')?.checked === true,
        updated_at: new Date().toISOString()
    };

    // 1. Salvar no cache local
    _printConfigCache[info.prodId] = config;

    // 2. Salvar no localStorage (fallback offline)
    try { localStorage.setItem(`printConfig_${info.prodId}`, JSON.stringify(config)); } catch(e) {}

    // 3. Salvar no Supabase (tabela producao_print_config)
    const btn = document.getElementById('ped-print-save-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    try {
        const sb = typeof getSupabase === 'function' ? getSupabase() : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        let savedInSupabase = false;

        if (sb) {
            const { error } = await sb.from('producao_print_config').upsert(config, { onConflict: 'produto_id' });
            if (!error) {
                savedInSupabase = true;
                toast(`✅ Config de impressão salva no banco para "${info.prodNome}"`, 'success');
            } else {
                console.warn('[printConfig] Aviso/Erro ao salvar no Supabase (producao_print_config):', error);
            }
        }

        if (!savedInSupabase) {
            // Tentar endpoint API se houver backend
            try {
                const resp = await fetch(`${API_BASE_URL}/api/print-config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await resp.json();
                if (data.ok) {
                    savedInSupabase = true;
                    toast(`✅ Config de impressão salva no backend para "${info.prodNome}"`, 'success');
                }
            } catch (e) {}
        }

        if (!savedInSupabase) {
            toast(`Config salva localmente para "${info.prodNome}"`, 'info');
        }
    } catch (e) {
        console.warn('[printConfig] save error (usando localStorage):', e);
        toast(`Config salva localmente para "${info.prodNome}"`, 'info');
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
}

async function loadPrintConfigForProduct(produtoId) {
    if (!produtoId) return;
    const prodId = String(produtoId);

    // 1. Verificar cache em memória
    if (_printConfigCache[prodId]) {
        await _applyPrintConfig(_printConfigCache[prodId]);
        return;
    }

    // 2. Tentar carregar do Supabase (producao_print_config)
    const sb = typeof getSupabase === 'function' ? getSupabase() : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (sb) {
        try {
            const { data, error } = await sb.from('producao_print_config').select('*').eq('produto_id', prodId).maybeSingle();
            if (data && !error) {
                _printConfigCache[prodId] = data;
                try { localStorage.setItem(`printConfig_${prodId}`, JSON.stringify(data)); } catch(e) {}
                await _applyPrintConfig(data);
                return;
            }
        } catch (e) {
            console.warn('[printConfig] Erro ao carregar do Supabase:', e);
        }
    }

    // 3. Tentar backend API
    try {
        const resp = await fetch(`${API_BASE_URL}/api/print-config/${encodeURIComponent(prodId)}`);
        const data = await resp.json();
        if (data.ok && data.config) {
            _printConfigCache[prodId] = data.config;
            try { localStorage.setItem(`printConfig_${prodId}`, JSON.stringify(data.config)); } catch(e) {}
            await _applyPrintConfig(data.config);
            return;
        }
    } catch (e) {
        console.warn('[printConfig] load from backend error:', e);
    }

    // 4. Fallback localStorage
    try {
        const stored = localStorage.getItem(`printConfig_${prodId}`);
        if (stored) {
            const config = JSON.parse(stored);
            _printConfigCache[prodId] = config;
            await _applyPrintConfig(config);
            return;
        }
    } catch (e) {}

    // Sem config salva — esconder indicador
    const indicator = document.getElementById('ped-print-saved-indicator');
    if (indicator) indicator.style.display = 'none';
}

async function _applyPrintConfig(config) {
    if (!config) return;

    // Selecionar impressora
    const printerSel = document.getElementById('ped-print-printer');
    if (printerSel && config.printer_name) {
        // Verificar se a impressora esta na lista
        const exists = Array.from(printerSel.options).some(o => o.value === config.printer_name);
        if (exists) {
            printerSel.value = config.printer_name;
            // Trigger change para carregar capabilities do driver
            if (typeof onPedPrinterChange === 'function') {
                await onPedPrinterChange();
            }

            // Aguardar driver options carregarem e depois aplicar os valores
            setTimeout(() => {
                if (config.tray != null) {
                    const traySel = document.getElementById('ped-print-tray');
                    if (traySel) traySel.value = String(config.tray);
                }
                if (config.tray_capa != null) {
                    const trayCapaSel = document.getElementById('ped-print-tray-capa');
                    if (trayCapaSel) trayCapaSel.value = String(config.tray_capa);
                }
                if (config.tray_miolo != null) {
                    const trayMioloSel = document.getElementById('ped-print-tray-miolo');
                    if (trayMioloSel) trayMioloSel.value = String(config.tray_miolo);
                }
                if (config.paper_size != null) {
                    const paperSel = document.getElementById('ped-print-paper');
                    if (paperSel) paperSel.value = String(config.paper_size);
                }
                if (config.duplex != null) {
                    const duplexSel = document.getElementById('ped-print-duplex');
                    if (duplexSel) duplexSel.value = String(config.duplex);
                }
                if (config.color != null) {
                    const colorSel = document.getElementById('ped-print-color');
                    if (colorSel) colorSel.value = String(config.color);
                }
                if (config.copies != null) {
                    const copiesInput = document.getElementById('ped-print-copies');
                    if (copiesInput) copiesInput.value = String(config.copies);
                }
                if (config.orientation != null) {
                    const orientSel = document.getElementById('ped-print-orientation');
                    if (orientSel) orientSel.value = String(config.orientation);
                }
                const chkReverse = document.getElementById('ped-print-reverse');
                if (chkReverse) chkReverse.checked = !!(config.impressao_reversa || config.reverse_print);

                const chkSheet = document.getElementById('ped-print-sheet-by-sheet');
                if (chkSheet) chkSheet.checked = !!(config.folha_a_folha || config.sheet_by_sheet);

                // Mostrar indicador visual
                const indicator = document.getElementById('ped-print-saved-indicator');
                if (indicator) {
                    indicator.style.display = 'block';
                    // Auto-esconder após 5 segundos
                    setTimeout(() => { if (indicator) indicator.style.display = 'none'; }, 5000);
                }
            }, 800);
        }
    }
}

window.savePrintConfigForProduct = savePrintConfigForProduct;
window.loadPrintConfigForProduct = loadPrintConfigForProduct;
window._updateSaveButtonLabel = _updateSaveButtonLabel;

window.initPedPrintPanel = initPedPrintPanel;
window.reloadPedPrinterList = reloadPedPrinterList;
window.onPedPrinterChange = onPedPrinterChange;
window.getPedPrintOptions = getPedPrintOptions;
window.processPrintQueueOptions = processPrintQueueOptions;
window.sendPrintJobDirect = sendPrintJobDirect;


// Exportar funcoes globais (existentes)
window.gerarLinkCliente = gerarLinkCliente;




window.setFiltroSetor = setFiltroSetor;
window.setFiltroStatus = setFiltroStatus;
window.setFiltroSetorArte = setFiltroSetorArte;
window.setFiltroStatusArte = setFiltroStatusArte;

// - ROUTER: Garantir que a página principal da aplicação seja o Painel de Produção (ao entrar e no F5) -
document.addEventListener('DOMContentLoaded', () => {
    // Carregar catálogo de fontes no boot da aplicação para que esteja disponível
    // em todas as views (Criar Arte, Numerações, etc)
    loadCatalogoFontes();
    if (typeof window.showView === 'function') {
        setTimeout(() => window.showView('view-lista-impressao'), 50);
    }
});


// - PRE-AQUECIMENTO DO SERVIDOR CLOUD (evita cold start do Render) -
// Dispara um ping silencioso logo ao carregar a pagina.
// Somente quando o frontend esta na nuvem (nao em localhost).
(function _prewarmRenderServer() {
    var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) return;
    fetch('https://imposicao.onrender.com/api/health', { method: 'GET', mode: 'cors', cache: 'no-store' })
        .then(function(r) { if (r.ok) console.log('[Render] Servidor cloud pre-aquecido'); })
        .catch(function() {});
})();

// --- Exportação de PDF dos Modelos ---
async function exportarPdfModelos() {
    const osId = state.amostrasOSAtivo;
    if (!osId) return;
    const os = state.ordens.find(o => o.id === osId);
    const itens = state.osItens[osId] || [];
    if (itens.length === 0) {
        toast('Nenhum modelo para exportar.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-export-pdf');
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF...';
    btn.disabled = true;

    try {
        if (typeof window.jspdf === 'undefined') {
            toast('Carregando biblioteca PDF...', 'info');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const { jsPDF } = window.jspdf;
        let pdf = null;

        for (let idx = 0; idx < itens.length; idx++) {
            const item = itens[idx];
            const canvas = document.getElementById('amostra-item-canvas-' + idx);
            if (!canvas || canvas.style.display === 'none') {
                continue;
            }

            const corId = document.getElementById('amostra-item-cor-' + idx)?.value || item.amostra_cor_id;
            const numId = document.getElementById('amostra-item-num-' + idx)?.value || item.amostra_num_id;
            const cor = corId ? state.cores.find(c => String(c.id) === String(corId)) : null;
            const num = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;
            
            let fmt = null;
            if (cor && cor.formato_id) fmt = state.formatos.find(f => String(f.id) === String(cor.formato_id));
            if (!fmt && num && num.formato_id) fmt = state.formatos.find(f => String(f.id) === String(num.formato_id));
            if (!fmt && state.formatos.length > 0) fmt = state.formatos[0];
            if (!fmt) fmt = { width_mm: 180, height_mm: 50 };

            let targetW = fmt.width_mm;
            let targetH = fmt.height_mm;
            if (cor && cor.width_mm && cor.height_mm) {
                targetW = cor.width_mm;
                targetH = cor.height_mm;
            }

            const orientation = targetW > targetH ? 'l' : 'p';
            
            if (pdf === null) {
                pdf = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: [targetW, targetH]
                });
            } else {
                pdf.addPage([targetW, targetH], orientation);
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            pdf.addImage(imgData, 'JPEG', 0, 0, targetW, targetH);
            
            // Adiciona o modelo ao índice (Outline/Bookmark) do PDF com seu número (id)
            try {
                const numModelo = item.id ? String(item.id) : `Modelo ${idx + 1}`;
                pdf.outline.add(null, numModelo, { pageNumber: idx + 1 });
            } catch(e) { console.warn("Erro ao adicionar bookmark", e); }
        }

        if (pdf !== null) {
            const pedidoNum = os ? os.numero : osId;
            pdf.save('Modelos_Pedido_' + pedidoNum + '.pdf');
            toast('PDF gerado com sucesso!', 'success');
        } else {
            toast('Nenhuma amostra renderizada para gerar PDF.', 'warning');
        }
    } catch (e) {
        console.error("Erro ao exportar PDF:", e);
        toast('Erro ao gerar o PDF.', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function arrayBufferHeaderIsPdf(buffer) {
    if (!buffer || buffer.byteLength < 4) return false;
    const bytes = new Uint8Array(buffer.slice(0, 4));
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

// --- Exportação de PDF Somente Arte ---
async function exportarPdfSomenteArte() {
    const osId = state.amostrasOSAtivo;
    if (!osId) return;
    const os = state.ordens.find(o => o.id === osId);
    const itens = state.osItens[osId] || [];
    if (itens.length === 0) {
        toast('Nenhum modelo para exportar.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-export-pdf-arte');
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
    btn.disabled = true;

    try {
        if (typeof window.PDFLib === 'undefined') {
            toast('Carregando biblioteca PDF...', 'info');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const { PDFDocument, PDFName, PDFString, PDFNumber } = window.PDFLib;
        const pdfDoc = await PDFDocument.create();
        const nums = [];
        let addedPages = 0;

        for (let idx = 0; idx < itens.length; idx++) {
            const item = itens[idx];
            
            const corId = document.getElementById(`amostra-item-cor-${idx}`)?.value || item.amostra_cor_id;
            const numId = document.getElementById(`amostra-item-num-${idx}`)?.value || item.amostra_num_id;
            const cor = corId ? state.cores.find(c => String(c.id) === String(corId)) : null;
            const num = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;
            
            let fmt = null;
            if (cor && cor.formato_id) fmt = state.formatos.find(f => String(f.id) === String(cor.formato_id));
            if (!fmt && num && num.formato_id) fmt = state.formatos.find(f => String(f.id) === String(num.formato_id));
            if (!fmt && state.formatos.length > 0) fmt = state.formatos[0];
            if (!fmt) fmt = { width_mm: 180, height_mm: 50 };

            let targetW = fmt.width_mm;
            let targetH = fmt.height_mm;
            if (cor && cor.width_mm && cor.height_mm) {
                targetW = cor.width_mm;
                targetH = cor.height_mm;
            }

            const ptW = targetW * (72 / 25.4);
            const ptH = targetH * (72 / 25.4);

            let pageAdded = false;

            // 1. Tentar carregar a arte original limpa da frente
            if (item.arte_url) {
                try {
                    const response = await fetch(item.arte_url);
                    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                    const arrayBuffer = await response.arrayBuffer();
                    const isPdf = arrayBufferHeaderIsPdf(arrayBuffer);
                    
                    if (isPdf) {
                        const originalDoc = await PDFDocument.load(arrayBuffer);
                        const pages = await pdfDoc.copyPages(originalDoc, [0]);
                        if (pages.length > 0) {
                            const copiedPage = pages[0];
                            copiedPage.setSize(ptW, ptH);
                            pdfDoc.addPage(copiedPage);
                            pageAdded = true;
                        }
                    } else {
                        const page = pdfDoc.addPage([ptW, ptH]);
                        let image;
                        if (item.arte_url.toLowerCase().endsWith('.png')) {
                            image = await pdfDoc.embedPng(arrayBuffer);
                        } else {
                            image = await pdfDoc.embedJpg(arrayBuffer);
                        }
                        page.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                        pageAdded = true;
                    }
                } catch (e) {
                    console.warn(`Falha ao carregar arte original frente para o modelo ${idx}, tentando fallback:`, e);
                }
            }

            // Fallback para amostra_arte_base64 se falhar ou se não tiver arte_url
            if (!pageAdded && item.amostra_arte_base64) {
                try {
                    const isPdf = item.amostra_arte_base64.startsWith('data:application/pdf') || item.amostra_arte_base64.includes('JVBERi');
                    const base64Data = item.amostra_arte_base64.includes('base64,') ? item.amostra_arte_base64.split('base64,')[1] : item.amostra_arte_base64;

                    if (isPdf) {
                        const originalDoc = await PDFDocument.load(base64Data);
                        const [copiedPage] = await pdfDoc.copyPages(originalDoc, [0]);
                        copiedPage.setSize(ptW, ptH);
                        pdfDoc.addPage(copiedPage);
                        pageAdded = true;
                    } else {
                        const page = pdfDoc.addPage([ptW, ptH]);
                        let image;
                        if (item.amostra_arte_base64.startsWith('data:image/png')) {
                            image = await pdfDoc.embedPng(base64Data);
                        } else {
                            image = await pdfDoc.embedJpg(base64Data);
                        }
                        page.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                        pageAdded = true;
                    }
                } catch (e) {
                    console.warn(`Falha ao carregar fallback base64 do modelo ${idx}:`, e);
                }
            }

            // Se ainda não adicionou nenhuma página da frente, adiciona uma em branco
            if (!pageAdded) {
                pdfDoc.addPage([ptW, ptH]);
                pageAdded = true;
            }

            // Mapear labels de página
            const numModelo = item.id ? String(item.id) : `Modelo ${idx + 1}`;
            nums.push(PDFNumber.of(addedPages));
            nums.push(pdfDoc.context.obj({
                Type: 'PageLabel',
                P: PDFString.of(numModelo)
            }));
            addedPages++;

            // 2. Se for frente e verso, tratar arte do verso
            if (item.verso) {
                let versoPageAdded = false;
                if (item.verso_arte_url) {
                    try {
                        const response = await fetch(item.verso_arte_url);
                        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                        const arrayBuffer = await response.arrayBuffer();
                        const isPdf = arrayBufferHeaderIsPdf(arrayBuffer);
                        
                        if (isPdf) {
                            const originalDoc = await PDFDocument.load(arrayBuffer);
                            const pages = await pdfDoc.copyPages(originalDoc, [0]);
                            if (pages.length > 0) {
                                const copiedPage = pages[0];
                                copiedPage.setSize(ptW, ptH);
                                pdfDoc.addPage(copiedPage);
                                versoPageAdded = true;
                            }
                        } else {
                            const page = pdfDoc.addPage([ptW, ptH]);
                            let image;
                            if (item.verso_arte_url.toLowerCase().endsWith('.png')) {
                                image = await pdfDoc.embedPng(arrayBuffer);
                            } else {
                                image = await pdfDoc.embedJpg(arrayBuffer);
                            }
                            page.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                            versoPageAdded = true;
                        }
                    } catch (e) {
                        console.warn(`Falha ao carregar arte original verso para o modelo ${idx}, tentando fallback:`, e);
                    }
                }

                // Fallback para verso_amostra_arte_base64
                if (!versoPageAdded && item.verso_amostra_arte_base64) {
                    try {
                        const isPdf = item.verso_amostra_arte_base64.startsWith('data:application/pdf') || item.verso_amostra_arte_base64.includes('JVBERi');
                        const base64Data = item.verso_amostra_arte_base64.includes('base64,') ? item.verso_amostra_arte_base64.split('base64,')[1] : item.verso_amostra_arte_base64;

                        if (isPdf) {
                            const originalDoc = await PDFDocument.load(base64Data);
                            const [copiedPage] = await pdfDoc.copyPages(originalDoc, [0]);
                            copiedPage.setSize(ptW, ptH);
                            pdfDoc.addPage(copiedPage);
                            versoPageAdded = true;
                        } else {
                            const page = pdfDoc.addPage([ptW, ptH]);
                            let image;
                            if (item.verso_amostra_arte_base64.startsWith('data:image/png')) {
                                image = await pdfDoc.embedPng(base64Data);
                            } else {
                                image = await pdfDoc.embedJpg(base64Data);
                            }
                            page.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                            versoPageAdded = true;
                        }
                    } catch (e) {
                        console.warn(`Falha ao carregar fallback verso base64 do modelo ${idx}:`, e);
                    }
                }

                if (!versoPageAdded) {
                    pdfDoc.addPage([ptW, ptH]);
                    versoPageAdded = true;
                }

                nums.push(PDFNumber.of(addedPages));
                nums.push(pdfDoc.context.obj({
                    Type: 'PageLabel',
                    P: PDFString.of(`${numModelo} Verso`)
                }));
                addedPages++;
            }
        }

        if (addedPages > 0) {
            const numTree = pdfDoc.context.obj({ Nums: nums });
            pdfDoc.catalog.set(PDFName.of('PageLabels'), numTree);

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            const pedidoNum = os ? os.numero : osId;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Artes_Pedido_${pedidoNum}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);

            toast('PDF de Artes gerado com sucesso!', 'success');
        } else {
            toast('Nenhuma página pôde ser gerada.', 'warning');
        }
    } catch (e) {
        console.error("Erro ao exportar PDF Arte:", e);
        toast('Erro ao gerar o PDF de Artes.', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

async function importarPdfMultipage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Limpar o input para permitir re-upload do mesmo arquivo
    event.target.value = '';
    
    const osId = state.amostrasOSAtivo;
    if (!osId) {
        toast('Nenhum pedido ativo.', 'warning');
        return;
    }
    const os = state.ordens.find(o => o.id === osId);
    const itens = state.osItens[osId] || [];
    if (itens.length === 0) {
        toast('Nenhum modelo cadastrado para este pedido.', 'warning');
        return;
    }

    try {
        if (typeof window.PDFLib === 'undefined') {
            toast('Carregando biblioteca PDF...', 'info');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const { PDFDocument } = window.PDFLib;
        const arrayBuffer = await file.arrayBuffer();
        const uploadedDoc = await PDFDocument.load(arrayBuffer);
        const totalPages = uploadedDoc.getPageCount();

        // Calcular páginas necessárias
        let requiredPages = 0;
        itens.forEach(item => {
            requiredPages++; // Frente
            if (item.verso) requiredPages++; // Verso
        });

        if (totalPages !== requiredPages) {
            if (!confirm(`Atenção: O PDF enviado possui ${totalPages} páginas, mas a soma de frentes e versos dos modelos do pedido requer exatamente ${requiredPages} páginas.\n\nDeseja continuar mesmo assim e fatiar apenas até onde for possível?`)) {
                return;
            }
        } else {
            if (!confirm(`Confirmar fatiamento de PDF de ${totalPages} páginas para os ${itens.length} modelos deste pedido?`)) {
                return;
            }
        }

        const btn = document.getElementById('btn-import-pdf-arte');
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
        btn.disabled = true;

        toast('Processando e fatiando PDF. Por favor, aguarde...', 'info');

        let currentPageIndex = 0;
        for (let idx = 0; idx < itens.length; idx++) {
            const item = itens[idx];
            
            // FRENTE
            if (currentPageIndex < totalPages) {
                const singlePageDoc = await PDFDocument.create();
                const [copiedPage] = await singlePageDoc.copyPages(uploadedDoc, [currentPageIndex]);
                singlePageDoc.addPage(copiedPage);
                const pdfBytes = await singlePageDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                
                const fileName = `arte_frente_${osId}_${item.id}_${Date.now()}.pdf`;
                const { data, error } = await supabaseClient
                    .storage
                    .from('artes')
                    .upload(fileName, blob, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
                
                if (!error) {
                    const { data: urlData } = supabaseClient.storage.from('artes').getPublicUrl(fileName);
                    item.arte_url = urlData.publicUrl;
                    
                    // Limpar input de arquivo local na interface
                    const input = document.getElementById(`amostra-item-arte-${idx}`);
                    if (input) input.value = '';
                    
                    await saveAmostraToDB(item.id, osId, { arte_url: urlData.publicUrl });
                } else {
                    console.error('Erro ao subir frente:', error);
                }
                currentPageIndex++;
            }

            // VERSO
            if (item.verso) {
                if (currentPageIndex < totalPages) {
                    const singlePageDoc = await PDFDocument.create();
                    const [copiedPage] = await singlePageDoc.copyPages(uploadedDoc, [currentPageIndex]);
                    singlePageDoc.addPage(copiedPage);
                    const pdfBytes = await singlePageDoc.save();
                    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                    
                    const fileName = `arte_verso_${osId}_${item.id}_${Date.now()}.pdf`;
                    const { data, error } = await supabaseClient
                        .storage
                        .from('artes')
                        .upload(fileName, blob, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
                    
                    if (!error) {
                        const { data: urlData } = supabaseClient.storage.from('artes').getPublicUrl(fileName);
                        item.verso_arte_url = urlData.publicUrl;
                        
                        // Limpar input de arquivo local na interface
                        const input = document.getElementById(`amostra-item-arte-verso-${idx}`);
                        if (input) input.value = '';
                        
                        await saveAmostraToDB(item.id, osId, { verso_arte_url: urlData.publicUrl });
                    } else {
                        console.error('Erro ao subir verso:', error);
                    }
                    currentPageIndex++;
                }
            }
        }

        // Forçar renderização de todas as amostras
        renderAmostrasOSItens(osId);
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        toast('PDF fatiado e importado com sucesso!', 'success');

    } catch (e) {
        console.error('Erro ao processar PDF multi-páginas:', e);
        toast('Erro ao fatiar o PDF: ' + e.message, 'error');
        const btn = document.getElementById('btn-import-pdf-arte');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-file-import" style="color: #34d399;"></i> Importar PDF Artes';
            btn.disabled = false;
        }
    }
}

// Expor globalmente
window.importarPdfMultipage = importarPdfMultipage;




async function criarCanvasNumeracaoRasterizada(num, fmt) {
    if (!num || !num.elements || num.elements.length === 0) return null;
    
    // Configurações base (S=8.0 para alta resolução: ~200 DPI)
    const S = 8.0; 
    
    const numCanvas = document.createElement('canvas');
    numCanvas.width = Math.round(fmt.width_mm * S);
    numCanvas.height = Math.round(fmt.height_mm * S);
    const numCtx = numCanvas.getContext('2d', { colorSpace: 'srgb' });

    // Fundo transparente -- vamos desenhar contorno leve pra saber o limite, se quiser?
    // Melhor não, para manter apenas a arte pura. Mas o gabarito original tinha um rect cinza.
    // Opcional: desenhar apenas elementos.

    // Desenhar cada elemento da numeração (transparente por padrão)
    num.elements.forEach(el => {
        const x = el.x_mm * S;
        const y = el.y_mm * S;
        const color = el.color || '#000000';
        const rot = (el.rotation || 0) * Math.PI / 180;

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
                const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                label = `${el.prefix || ''}${_fVal}`;
            } else if (el.type === 'TEATRO_LUGAR') {
                const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                label = `${el.prefix || ''}${_lVal}`;
            } else if (el.type === 'TEATRO_COMBO') {
                const _fVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Fila || 'A' : 'A';
                const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : '22';
                const fila = `${el.prefix_fila || ''}${_fVal}`;
                const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
            } else if (el.type === 'CAMAROTE_LOCAL') {
                label = `${el.prefix || ''}7`;
            } else if (el.type === 'CAMAROTE_PESSOA') {
                label = `${el.prefix || ''}1`;
            } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                label = `${el.prefix || ''}1/5`;
            } else {
                const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;
                label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;
            }
            numCtx.textAlign = 'center';
            numCtx.textBaseline = 'middle';
            if (label.includes('\n')) {
                const lines = label.split('\n');
                const lineHeight = fs * 1.2;  // igual ao engine.py e drawElement
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
            const hsz = sz / 2;
            numCtx.fillStyle = color;
            numCtx.fillRect(-hsz, -hsz, sz, sz);
            numCtx.fillStyle = '#ffffff';
            const cell = sz / 7;
            for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {
                numCtx.fillRect(-hsz + cx * cell, -hsz + cy * cell, 3 * cell, 3 * cell);
                numCtx.fillStyle = color;
                numCtx.fillRect(-hsz + cx * cell + cell, -hsz + cy * cell + cell, cell, cell);
                numCtx.fillStyle = '#ffffff';
            }
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
                    numCtx.drawImage(imgObj, -hw, -hh_el, w, h);
                }
            } else {
                if (el._svgImage) {
                    numCtx.drawImage(el._svgImage, -hw, -hh_el, w, h);
                }
            }
            numCtx.restore();
        }
        numCtx.restore();
    });

    return numCanvas.toDataURL('image/png', 1.0);
}

// --- Exportação de PDF Somente Gabarito (Numeração) ---
async function exportarPdfGabarito() {
    const osId = state.amostrasOSAtivo;
    if (!osId) return;
    const os = state.ordens.find(o => o.id === osId);
    const itens = state.osItens[osId] || [];
    if (itens.length === 0) {
        toast('Nenhum modelo para exportar.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-export-pdf-gabarito');
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
    btn.disabled = true;

    try {
        if (typeof window.PDFLib === 'undefined') {
            toast('Carregando biblioteca PDF...', 'info');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const { PDFDocument, PDFName, PDFString, PDFNumber } = window.PDFLib;
        const pdfDoc = await PDFDocument.create();
        const nums = [];
        let addedPages = 0;

        for (let idx = 0; idx < itens.length; idx++) {
            const item = itens[idx];
            
            const corId = document.getElementById(`amostra-item-cor-${idx}`)?.value || item.amostra_cor_id;
            const numId = document.getElementById(`amostra-item-num-${idx}`)?.value || item.amostra_num_id;
            const cor = corId ? state.cores.find(c => String(c.id) === String(corId)) : null;
            const num = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;
            
            let fmt = null;
            if (cor && cor.formato_id) fmt = state.formatos.find(f => String(f.id) === String(cor.formato_id));
            if (!fmt && num && num.formato_id) fmt = state.formatos.find(f => String(f.id) === String(num.formato_id));
            if (!fmt && state.formatos.length > 0) fmt = state.formatos[0];
            if (!fmt) fmt = { width_mm: 180, height_mm: 50 };

            let targetW = fmt.width_mm;
            let targetH = fmt.height_mm;
            if (cor && cor.width_mm && cor.height_mm) {
                targetW = cor.width_mm;
                targetH = cor.height_mm;
            }

            const ptW = targetW * (72 / 25.4);
            const ptH = targetH * (72 / 25.4);

            let pageAdded = false;

            if (num) {
                // 1. Tentar localizar um PDF de fundo original na numeração (vector)
                let rawPdfContent = num.pdf_content;
                if (!rawPdfContent && num.elements) {
                    const pdfEl = num.elements.find(e => e.type === 'PDF' && e.pdf_content);
                    if (pdfEl) rawPdfContent = pdfEl.pdf_content;
                }

                if (rawPdfContent) {
                    try {
                        const pdfData = await fetchPdfBytes(rawPdfContent);
                        if (pdfData) {
                            const originalDoc = await PDFDocument.load(pdfData);
                            const [copiedPage] = await pdfDoc.copyPages(originalDoc, [0]);
                            pdfDoc.addPage(copiedPage);
                            pageAdded = true;
                        }
                    } catch (e) {
                        console.warn(`Falha ao embutir background vetorial do gabarito ${idx}:`, e);
                    }
                }
            }

            if (!pageAdded) {
                // 2. Adiciona página em branco no tamanho do formato
                pdfDoc.addPage([ptW, ptH]);
                pageAdded = true;
            }

            // 3. Obter a página corrente recém adicionada (ou copiada do vetor)
            const pages = pdfDoc.getPages();
            const currentPage = pages[pages.length - 1];

            // 4. Se a numeração tiver elementos de texto/código de barras, rasteriza em PNG e sobrepõe
            if (num && num.elements && num.elements.length > 0) {
                try {
                    const pngDataUrl = await criarCanvasNumeracaoRasterizada(num, fmt);
                    if (pngDataUrl) {
                        const base64Data = pngDataUrl.split(',')[1];
                        const image = await pdfDoc.embedPng(base64Data);
                        currentPage.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                    }
                } catch (e) {
                    console.warn(`Falha ao rasterizar e embutir máscara visual do modelo ${idx}:`, e);
                }
            }

            const numModelo = item.id ? String(item.id) : `Modelo ${idx + 1}`;
            nums.push(PDFNumber.of(addedPages));
            nums.push(pdfDoc.context.obj({
                Type: 'PageLabel',
                P: PDFString.of(numModelo)
            }));

            addedPages++;
        }

        if (addedPages > 0) {
            const numTree = pdfDoc.context.obj({ Nums: nums });
            pdfDoc.catalog.set(PDFName.of('PageLabels'), numTree);

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            const pedidoNum = os ? os.numero : osId;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Gabaritos_Pedido_${pedidoNum}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);

            toast('PDF de Gabaritos gerado com sucesso!', 'success');
        } else {
            toast('Nenhuma página pôde ser gerada.', 'warning');
        }
    } catch (e) {
        console.error("Erro ao exportar PDF Gabarito:", e);
        toast('Erro ao gerar o PDF de Gabaritos.', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}





document.addEventListener('keydown', (e) => {
    const viewNum = document.getElementById('view-numeracao');
    if (!viewNum || viewNum.style.display === 'none') return;

    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.key === 'Delete') {
        if (typeof deleteSelectedElements === 'function') deleteSelectedElements();
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            if (typeof redoNumHistory === 'function') redoNumHistory();
        } else {
            if (typeof undoNumHistory === 'function') undoNumHistory();
        }
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (typeof redoNumHistory === 'function') redoNumHistory();
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (typeof duplicateSelectedElements === 'function') duplicateSelectedElements();
    }
});




window.impQueueUpdateFormato = function(itemId, osId, value) {
    autoSaveOSItemField(itemId, osId, 'formato_id', value);
    
    // Auto-update saida se o formato tiver saida default
    const fmtObj = state.formatos ? state.formatos.find(f => String(f.id) === String(value)) : null;
    if (fmtObj && fmtObj.default_saida_id) {
        autoSaveOSItemField(itemId, osId, 'saida_id', fmtObj.default_saida_id);
    }
    
    // Atualizar UI
    if(typeof renderPedOSQueue === 'function') renderPedOSQueue();
    
    if(state.activeOSItem && state.activeOSItem.itemId === itemId) {
        if(typeof updatePedSummary === 'function') updatePedSummary();
        if(typeof drawPedPreview === 'function') drawPedPreview();
    }
};

window.impQueueUpdateSaida = function(itemId, osId, value) {
    autoSaveOSItemField(itemId, osId, 'saida_id', value);
    if(state.activeOSItem && state.activeOSItem.itemId === itemId) {
        if(typeof updatePedSummary === 'function') updatePedSummary();
        if(typeof drawPedPreview === 'function') drawPedPreview();
    }
};

window.updateBoxFormato = async function(osId, prodId, formatoId) {
    if (!state.osItens[osId]) return;
    const items = state.osItens[osId].filter(i => String(i._vibe_id_produto || 'sem_produto') === String(prodId));
    let fObj = (state.formatos || []).find(f => String(f.id) === String(formatoId));
    let defaultSaida = fObj ? fObj.default_saida_id : '';
    
    for (const item of items) {
        item.formato_id = formatoId;
        autoSaveOSItemField(item.id, osId, 'formato_id', formatoId);
        if (defaultSaida && String(item.saida_id) !== String(defaultSaida)) {
            item.saida_id = defaultSaida;
            autoSaveOSItemField(item.id, osId, 'saida_id', defaultSaida);
        }
    }
    
    if (window.renderPedOSQueue) window.renderPedOSQueue();
    if (window.renderImpOSQueue) window.renderImpOSQueue();
    if (window.updatePedSummary) window.updatePedSummary();
    if (window.updateImpSummary) window.updateImpSummary();
};

window.updateBoxSaida = async function(osId, prodId, saidaId) {
    if (!state.osItens[osId]) return;
    const items = state.osItens[osId].filter(i => String(i._vibe_id_produto || 'sem_produto') === String(prodId));
    for (const item of items) {
        item.saida_id = saidaId;
        autoSaveOSItemField(item.id, osId, 'saida_id', saidaId);
    }
    
    if (window.renderPedOSQueue) window.renderPedOSQueue();
    if (window.renderImpOSQueue) window.renderImpOSQueue();
    if (window.updatePedSummary) window.updatePedSummary();
    if (window.updateImpSummary) window.updateImpSummary();
};

function showAgentUpdateWarning(baseUrl, latestVersion) {
    // Evitar múltiplos banners
    if (document.getElementById('agent-update-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'agent-update-banner';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.backgroundColor = '#f59e0b'; // Amber yellow
    banner.style.color = '#000000';
    banner.style.textAlign = 'center';
    banner.style.padding = '8px 16px';
    banner.style.fontWeight = '700';
    banner.style.fontSize = '0.85rem';
    banner.style.zIndex = '99999';
    banner.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'center';
    banner.style.alignItems = 'center';
    banner.style.gap = '12px';
    
    banner.innerHTML = `
        <span>⚡ Uma nova versão do Agente Local está disponível (${latestVersion}).</span>
        <button id="btn-update-agent-now" style="background-color: #000000; color: #ffffff; border: none; padding: 4px 12px; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 0.78rem;">Atualizar Agora</button>
        <span id="btn-close-update-banner" style="cursor: pointer; opacity: 0.7; font-weight: 800; font-size: 0.95rem; margin-left: 10px;">✕</span>
    `;
    
    document.body.appendChild(banner);
    // Empurrar o body para baixo
    document.body.style.marginTop = '36px';
    
    document.getElementById('btn-close-update-banner').onclick = () => {
        banner.remove();
        document.body.style.marginTop = '0';
    };
    
    document.getElementById('btn-update-agent-now').onclick = async () => {
        const btn = document.getElementById('btn-update-agent-now');
        btn.disabled = true;
        btn.textContent = 'Atualizando...';
        
        try {
            const updateUrl = `https://ideal-imposition.vercel.app/app/ideal-imposition-agent.exe`;
            const response = await fetch(`${baseUrl}/api/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ download_url: updateUrl })
            });
            
            if (response.ok) {
                toast('Atualização iniciada! O Agente Local irá reiniciar.', 'success');
                setTimeout(() => {
                    banner.remove();
                    document.body.style.marginTop = '0';
                }, 3000);
            } else {
                const errData = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
                throw new Error(errData.detail || 'Erro na requisição');
            }
        } catch (err) {
            console.error('Falha ao atualizar agente local:', err);
            toast('Erro ao atualizar agente: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Atualizar Agora';
        }
    };
}

window.showAgentUpdateWarning = showAgentUpdateWarning;

// ══════════════════════════════════════════════════════════════════════════════
// VIEW ADM — Configurações Gerais
// ══════════════════════════════════════════════════════════════════════════════

const ADM_IMG_BUCKET = 'app-imagens';
let _admImages = []; // cache de imagens carregadas

// ── Troca de aba horizontal ────────────────────────────────────────────────
window.switchAdmTab = function(tabId) {
    // Esconder todos os conteúdos de aba
    document.querySelectorAll('.adm-tab-content').forEach(el => el.style.display = 'none');
    // Desativar todos os botões
    document.querySelectorAll('.adm-tab-btn').forEach(btn => {
        btn.style.color = 'var(--text-dim)';
        btn.style.borderBottom = '2.5px solid transparent';
    });
    // Mostrar aba selecionada
    const tab = document.getElementById('adm-tab-' + tabId);
    if (tab) tab.style.display = '';
    // Ativar botão da aba
    const btn = document.querySelector(`.adm-tab-btn[data-adm-tab="${tabId}"]`);
    if (btn) {
        btn.style.color = 'var(--blue)';
        btn.style.borderBottom = '2.5px solid var(--blue)';
    }
    // Carregar dados se necessário
    if (tabId === 'imagens') loadAdmImages();
};

// Inicializa a view ADM ao entrar nela (hook no showView)
const _origShowViewForAdm = window.showView;
window.showView = function(viewId) {
    if (_origShowViewForAdm) _origShowViewForAdm(viewId);
    if (viewId === 'view-adm') {
        // Garantir que a aba imagens esteja ativa
        document.querySelectorAll('.adm-tab-content').forEach(el => el.style.display = 'none');
        const tabImg = document.getElementById('adm-tab-imagens');
        if (tabImg) tabImg.style.display = '';
        loadAdmImages();
    }
};

// ── Upload via input (seleção de arquivo) ─────────────────────────────────
window.handleAdmImgSelect = async function(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    await uploadAdmImages(files);
    event.target.value = '';
};

// ── Upload via drag-and-drop ───────────────────────────────────────────────
window.handleAdmImgDrop = async function(event) {
    event.preventDefault();
    const dz = document.getElementById('adm-img-dropzone');
    if (dz) { dz.style.background = 'rgba(59,130,246,0.05)'; dz.style.borderColor = 'var(--blue)'; }
    const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) { toast('Apenas imagens são aceitas.', 'warning'); return; }
    await uploadAdmImages(files);
};

// ── Lógica de upload central ───────────────────────────────────────────────
async function uploadAdmImages(files) {
    if (!supabaseClient) { toast('Supabase não disponível.', 'error'); return; }

    const progressWrap = document.getElementById('adm-img-upload-progress');
    const progressBar  = document.getElementById('adm-img-progress-bar');
    const progressPct  = document.getElementById('adm-img-progress-pct');
    const progressLbl  = document.getElementById('adm-img-progress-label');

    const maxSize = 5 * 1024 * 1024;
    const validFiles = files.filter(f => {
        if (f.size > maxSize) { toast(`${f.name} excede 5 MB — ignorado.`, 'warning'); return false; }
        return true;
    });
    if (!validFiles.length) return;

    if (progressWrap) progressWrap.style.display = '';
    let done = 0;

    for (const file of validFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${Date.now()}_${safeName}`;
        if (progressLbl) progressLbl.textContent = `Enviando: ${file.name}`;

        try {
            const { error } = await supabaseClient.storage
                .from(ADM_IMG_BUCKET)
                .upload(path, file, { upsert: true, contentType: file.type });

            if (error) throw error;
            done++;
            const pct = Math.round((done / validFiles.length) * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressPct) progressPct.textContent = pct + '%';
            toast(`✅ ${file.name} enviada com sucesso!`, 'success');
        } catch (err) {
            toast(`Erro ao enviar ${file.name}: ${err.message}`, 'error');
        }
    }

    setTimeout(() => {
        if (progressWrap) progressWrap.style.display = 'none';
        if (progressBar)  progressBar.style.width = '0%';
    }, 1500);

    await loadAdmImages();
}

// ── Listar imagens do bucket ───────────────────────────────────────────────
window.loadAdmImages = async function() {
    const loading = document.getElementById('adm-img-loading');
    const empty   = document.getElementById('adm-img-empty');
    const gallery = document.getElementById('adm-img-gallery');
    if (!gallery) return;

    if (loading) loading.style.display = '';
    if (empty)   empty.style.display   = 'none';
    gallery.innerHTML = '';

    if (!supabaseClient) {
        if (loading) loading.style.display = 'none';
        if (empty)   empty.style.display = '';
        return;
    }

    try {
        const { data, error } = await supabaseClient.storage
            .from(ADM_IMG_BUCKET)
            .list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

        if (error) throw error;

        const files = (data || []).filter(f => f.name && !f.name.startsWith('.'));
        _admImages = files;

        if (loading) loading.style.display = 'none';

        if (!files.length) {
            if (empty) empty.style.display = '';
            return;
        }

        renderAdmGallery(files);
    } catch (err) {
        if (loading) loading.style.display = 'none';
        toast('Erro ao carregar imagens: ' + err.message, 'error');
    }
};

// ── Renderizar grade de imagens ────────────────────────────────────────────
function renderAdmGallery(files) {
    const gallery = document.getElementById('adm-img-gallery');
    if (!gallery) return;

    gallery.innerHTML = files.map(file => {
        const { data } = supabaseClient.storage.from(ADM_IMG_BUCKET).getPublicUrl(file.name);
        const url = data?.publicUrl || '';
        const sizeKB = file.metadata?.size ? (file.metadata.size / 1024).toFixed(0) + ' KB' : '';
        const nameSafe = file.name.replace(/'/g, "\\'");
        const urlSafe  = url.replace(/'/g, "\\'");

        return `
        <div class="adm-img-card" style="
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: box-shadow .2s, transform .2s;
            cursor: pointer;
        "
        onmouseenter="this.style.boxShadow='0 4px 20px rgba(59,130,246,0.2)'; this.style.transform='translateY(-2px)'"
        onmouseleave="this.style.boxShadow=''; this.style.transform=''">
            <!-- Preview da imagem -->
            <div style="width:100%; aspect-ratio:16/10; overflow:hidden; background:rgba(0,0,0,0.2);"
                 onclick="openClienteLightbox('${urlSafe}')">
                <img src="${url}" alt="${file.name}"
                     loading="lazy"
                     style="width:100%; height:100%; object-fit:cover; transition: transform .3s;"
                     onmouseenter="this.style.transform='scale(1.05)'"
                     onmouseleave="this.style.transform=''"
                     onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:20px; text-align:center; color:var(--text-dim);\\'>🖼️</div>'">
            </div>
            <!-- Info e ações -->
            <div style="padding: 10px 12px; flex:1; display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.78rem; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${file.name}">${file.name}</div>
                ${sizeKB ? `<div style="font-size:0.72rem; color:var(--text-dim);">${sizeKB}</div>` : ''}
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <button onclick="event.stopPropagation(); admCopyUrl('${urlSafe}')"
                            style="flex:1; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); color:var(--blue); border-radius:6px; padding:4px 0; font-size:0.75rem; cursor:pointer; transition:all .2s;"
                            title="Copiar URL">🔗 URL</button>
                    <button onclick="event.stopPropagation(); admDeleteImage('${nameSafe}', this)"
                            style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171; border-radius:6px; padding:4px 8px; font-size:0.75rem; cursor:pointer; transition:all .2s;"
                            title="Excluir imagem">🗑️</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Filtrar galeria por nome ───────────────────────────────────────────────
window.filterAdmImages = function() {
    const q = (document.getElementById('adm-img-search')?.value || '').toLowerCase().trim();
    const filtered = q ? _admImages.filter(f => f.name.toLowerCase().includes(q)) : _admImages;
    const empty = document.getElementById('adm-img-empty');
    if (!filtered.length && q) {
        const gallery = document.getElementById('adm-img-gallery');
        if (gallery) gallery.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-dim); padding:30px;">Nenhuma imagem encontrada para "<strong>${q}</strong>"</div>`;
        if (empty) empty.style.display = 'none';
    } else {
        if (empty) empty.style.display = filtered.length ? 'none' : '';
        renderAdmGallery(filtered);
    }
};

// ── Copiar URL da imagem ───────────────────────────────────────────────────
window.admCopyUrl = function(url) {
    navigator.clipboard.writeText(url).then(() => toast('URL copiada!', 'success')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        toast('URL copiada!', 'success');
    });
};

// ── Excluir imagem ────────────────────────────────────────────────────────
window.admDeleteImage = async function(name, btnEl) {
    if (!confirm(`Excluir a imagem "${name}"? Esta ação não pode ser desfeita.`)) return;
    if (!supabaseClient) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳'; }
    try {
        const { error } = await supabaseClient.storage.from(ADM_IMG_BUCKET).remove([name]);
        if (error) throw error;
        toast('Imagem excluída.', 'success');
        await loadAdmImages();
    } catch (err) {
        toast('Erro ao excluir: ' + err.message, 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🗑️'; }
    }
};
