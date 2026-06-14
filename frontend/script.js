// ─── VDP Engine — Frontend Script ────────────────────────────────────────────

'use strict';



// ─── Utility — Parse Decimal BR (aceita vírgula como separador) ──────────────

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



// ─── State ───────────────────────────────────────────────────────────────────

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

};



// ─── Utility — fetchPdfBytes ──────────────────────────────────────────────────
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

    // É uma URL — tenta fetch direto primeiro (Supabase tem CORS público)
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
// ─── Utility — getFontCSS ─────────────────────────────────────────────────────
// Converte font_name do elemento para string CSS para renderização no canvas.
// Suporta fontes Base-14 (helv, helv-bold, times...) e fontes do sistema (system:NomeDaFonte).
function getFontCSS(font_name) {
    if (!font_name || font_name === 'helv') return 'Inter, Arial, sans-serif';
    if (font_name === 'helv-bold') return 'bold Inter, Arial, sans-serif';
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

// ─── State — Fontes do Sistema ────────────────────────────────────────────────
const state_fonts = {
    system: [],           // [{ family, fullName, style }]
    loaded: false,        // true quando qualquer lista foi carregada (API ou fallback)
    loadedFromAPI: false, // true SOMENTE quando queryLocalFonts() retornou com sucesso
    loading: false,
    permissionDenied: false,
};

// Fontes Base-14 embutidas no PDF (sem necessidade de arquivo externo)
const BUILTIN_FONTS = [
    { family: 'Sans-Serif (Helvetica)', fullName: 'helv',      style: 'Regular' },
    { family: 'Sans-Serif Bold',        fullName: 'helv-bold', style: 'Bold' },
    { family: 'Serif (Times)',           fullName: 'times',     style: 'Regular' },
    { family: 'Serif Bold',             fullName: 'times-bold', style: 'Bold' },
    { family: 'Mono (Courier)',          fullName: 'cour',      style: 'Regular' },
    { family: 'Mono Bold',              fullName: 'cour-bold', style: 'Bold' },
];

// Carrega fontes do sistema via Local Font Access API (Chrome 103+).
// forceRequest = true → ignora estado anterior e pede permissão novamente.
async function loadSystemFonts(forceRequest = false) {
    if (state_fonts.loading) return;
    // Se já carregou da API real, não precisa recarregar (a menos que forçado)
    if (state_fonts.loadedFromAPI && !forceRequest) return;
    state_fonts.loading = true;
    state_fonts.permissionDenied = false;

    try {
        if ('queryLocalFonts' in window) {
            // Esta chamada dispara o prompt de permissão do Chrome (requer gesto do usuário
            // ou permissão prévia concedida). Lança NotAllowedError se negada.
            const fonts = await window.queryLocalFonts();

            // Deduplica por família + estilo normalizado
            const seen = new Set();
            const systemFonts = [];
            for (const f of fonts) {
                const key = `${f.family}|${f.style}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const isBold   = /bold/i.test(f.style);
                const isItalic = /italic|oblique/i.test(f.style);
                const tags = [isBold && 'bold', isItalic && 'italic'].filter(Boolean);
                const value = `system:${f.family}${tags.length ? '|' + tags.join('|') : ''}`;
                systemFonts.push({ family: f.family, fullName: value, style: f.style });
            }

            // Ordenar por família A→Z, depois por estilo
            systemFonts.sort((a, b) => {
                const fc = a.family.localeCompare(b.family);
                return fc !== 0 ? fc : a.style.localeCompare(b.style);
            });

            state_fonts.system       = [...BUILTIN_FONTS, ...systemFonts];
            state_fonts.loadedFromAPI = true;  // ✅ API real usada com sucesso
            console.info(`[Fonts] ${systemFonts.length} fontes do sistema carregadas via API.`);
        } else {
            throw new Error('queryLocalFonts não disponível neste navegador');
        }
    } catch (e) {
        if (e.name === 'NotAllowedError') {
            state_fonts.permissionDenied = true;
            console.warn('[Fonts] Permissão negada pelo usuário.');
        } else {
            console.info('[Fonts] queryLocalFonts indisponível. Usando lista curada.');
        }

        // Fallback: lista curada de fontes comuns Windows + Mac
        if (!state_fonts.loadedFromAPI) {
            const COMMON = [
                'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
                'Bahnschrift', 'Calibri', 'Calibri Light', 'Cambria', 'Candara',
                'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
                'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi',
                'Garamond', 'Georgia', 'Impact', 'Ink Free', 'Javanese Text',
                'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode',
                'Malgun Gothic', 'Marlett', 'Microsoft Sans Serif', 'Mongolian Baiti',
                'MV Boli', 'Myanmar Text', 'Palatino Linotype', 'Segoe Print',
                'Segoe Script', 'Segoe UI', 'Segoe UI Black', 'Segoe UI Historic',
                'Segoe UI Emoji', 'Sylfaen', 'Symbol', 'Tahoma', 'Times New Roman',
                'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings',
                'Helvetica Neue', 'San Francisco', 'Apple Chancery', 'Futura',
            ];
            const fallback = COMMON.flatMap(f => [
                { family: f, fullName: `system:${f}`,             style: 'Regular' },
                { family: f, fullName: `system:${f}|bold`,        style: 'Bold' },
                { family: f, fullName: `system:${f}|italic`,      style: 'Italic' },
                { family: f, fullName: `system:${f}|bold|italic`, style: 'Bold Italic' },
            ]);
            state_fonts.system = [...BUILTIN_FONTS, ...fallback];
        }
    }

    state_fonts.loaded  = true;
    state_fonts.loading = false;
}

// ⚠️ NÃO pré-carregamos em background:
// queryLocalFonts() sem gesto do usuário pode não mostrar o prompt de permissão
// no Chrome, resultando em NotAllowedError silencioso e bloqueando futuras tentativas.
// O carregamento é feito sob demanda ao abrir o font picker pela primeira vez.




// ─── Font Picker Component ────────────────────────────────────────────────────
// Cria um font picker interativo com busca, preview e suporte a fontes do sistema.
function createFontPicker(elId, currentValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'font-picker-wrap';
    wrap.dataset.elId = elId;

    const BUILTIN_IDS = ['helv','helv-bold','times','times-bold','cour','cour-bold'];

    const getLabelForValue = (v) => {
        if (!v || v === 'helv') return 'Sans-Serif (Helvetica)';
        if (v === 'helv-bold') return 'Sans-Serif Bold';
        if (v === 'times') return 'Serif (Times)';
        if (v === 'times-bold') return 'Serif Bold';
        if (v === 'cour') return 'Mono (Courier)';
        if (v === 'cour-bold') return 'Mono Bold';
        if (v.startsWith('system:')) {
            const parts = v.slice(7).split('|');
            const style = parts.slice(1).join(' ');
            return parts[0] + (style ? ` — ${style}` : '');
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
                <div class="font-picker-loading">Carregando fontes…</div>
            </div>
        </div>
    `;

    const trigger     = wrap.querySelector(`#fpt-${elId}`);
    const dropdown    = wrap.querySelector(`#fpd-${elId}`);
    const searchInput = wrap.querySelector(`#fps-${elId}`);
    const list        = wrap.querySelector(`#fpl-${elId}`);

    let currentFont = currentValue || 'helv';
    let allFonts    = [];

    // Declarado antes de renderList (que o referencia), definido logo após.
    let doReloadFonts;

    const renderList = (filter = '') => {

        const q        = filter.toLowerCase().trim();
        const builtins = allFonts.filter(f =>  BUILTIN_IDS.includes(f.fullName));
        const system   = allFonts.filter(f => !BUILTIN_IDS.includes(f.fullName));
        const match    = f => !q || f.family.toLowerCase().includes(q) || (f.style || '').toLowerCase().includes(q);

        let html = '';

        // ── Fontes embutidas ──
        const bFiltered = builtins.filter(match);
        if (bFiltered.length) {
            html += `<div class="font-picker-group-label">Fontes Embutidas (PDF)</div>`;
            for (const f of bFiltered) {
                const sel = f.fullName === currentFont ? 'selected' : '';
                const css = getFontCSS(f.fullName);
                const fam = css.replace(/^(bold |italic )*/, '');
                html += `<div class="font-picker-opt ${sel}" data-value="${f.fullName}">
                    <span class="fp-sample" style="font-family:${fam};${css.includes('bold')?'font-weight:700;':''}${css.includes('italic')?'font-style:italic;':''}">AaBbCc 123</span>
                    <span class="fp-name">${f.family}</span>
                    <span class="fp-style-tag">${f.style || 'Regular'}</span>
                </div>`;
            }
        }

        // ── Fontes do sistema ──
        const sFiltered = system.filter(match);
        if (sFiltered.length) {
            const apiLabel = ('queryLocalFonts' in window) ? `Fontes do PC (${sFiltered.length})` : `Fontes Comuns (${sFiltered.length})`;
            html += `<div class="font-picker-group-label">${apiLabel}</div>`;
            for (const f of sFiltered) {
                const sel  = f.fullName === currentFont ? 'selected' : '';
                const bld  = /bold/i.test(f.style)    ? 'font-weight:700;'   : '';
                const itl  = /italic/i.test(f.style)  ? 'font-style:italic;' : '';
                html += `<div class="font-picker-opt ${sel}" data-value="${f.fullName}">
                    <span class="fp-sample" style="font-family:'${f.family}',sans-serif;${bld}${itl}">${f.family}</span>
                    <span class="fp-style-tag">${f.style || 'Regular'}</span>
                </div>`;
            }
        }

        // ── Botão para carregar/recarregar fontes do PC ──
        if ('queryLocalFonts' in window && !state_fonts.permissionDenied) {
            const btnLabel = state_fonts.loadedFromAPI
                ? '🔄 Recarregar fontes do PC'
                : '🖥️ Carregar fontes instaladas no PC';
            html += `<div class="fp-permission-row"><button class="fp-reload-btn" data-fp-reload="1">${btnLabel}</button></div>`;
        } else if (!('queryLocalFonts' in window)) {
            html += `<div class="fp-permission-row fp-tip">💡 Use o Chrome para acessar fontes instaladas no PC</div>`;
        } else if (state_fonts.permissionDenied) {
            html += `<div class="fp-permission-row fp-tip">⚠️ Permissão negada. Clique no ícone 🔒 na barra de endereço do Chrome e libere "Fontes locais".</div>`;
        }

        if (!bFiltered.length && !sFiltered.length) {
            html = `<div class="font-picker-loading">Nenhuma fonte encontrada para "${filter}"</div>` + (html || '');
        }

        list.innerHTML = html;

        // Bind do botão de reload (usa o closure doReloadFonts deste picker)
        const reloadBtn = list.querySelector('[data-fp-reload]');
        if (reloadBtn) reloadBtn.addEventListener('mousedown', e => { e.preventDefault(); doReloadFonts(); });


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

    // Reload de fontes: closure por instância (não global sobrescrito)
    // Isso garante que cada picker aponte para seu próprio `list` e `searchInput`.
    doReloadFonts = async () => {
        state_fonts.loadedFromAPI = false; // forçar nova tentativa com a API
        list.innerHTML = `<div class="font-picker-loading">🔄 Solicitando acesso às fontes do PC…</div>`;
        await loadSystemFonts(true);
        allFonts = state_fonts.system;
        renderList(searchInput.value);
    };
    // Expõe no elemento wrap para o onclick inline do botão encontrar o closure certo
    wrap._reloadFonts = doReloadFonts;

    const openDropdown = async () => {
        trigger.classList.add('open');
        dropdown.classList.add('open');
        searchInput.value = '';
        searchInput.focus();

        const needLoad = !state_fonts.loadedFromAPI && ('queryLocalFonts' in window) && !state_fonts.permissionDenied;
        const firstTime = !state_fonts.loaded;

        if (firstTime || needLoad) {
            list.innerHTML = `<div class="font-picker-loading">🔄 Carregando fontes do PC…</div>`;
            await loadSystemFonts();
        }
        allFonts = state_fonts.system;
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



// ─── Utility — Toast ─────────────────────────────────────────────────────────

function toast(msg, type = 'info') {

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };

    const tc = document.getElementById('toast-container');

    const el = document.createElement('div');

    el.className = `toast toast-${type}`;

    el.innerHTML = `<span>${icons[type]}</span> ${msg}`;

    tc.appendChild(el);

    setTimeout(() => el.remove(), 3100);

}



// ─── Navigation ──────────────────────────────────────────────────────────────

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



// ─── API Helpers ──────────────────────────────────────────────────────────────

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

                    return data;

                } else {

                    const { data, error } = await supabaseClient.from(col).select('*');

                    if (error) throw error;

                    if (col === 'modelos_imposicao' && data) {

                        return data.map(item => ({ id: item.id, name: item.name, ...item.config }));

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

                const { data, error } = await supabaseClient.from(col).insert([insertPayload]).select().single();

                if (error) throw error;

                return { id: data.id };

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

                const { error } = await supabaseClient.from(col).update(updateData).eq('id', docId);

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





// ─── Load All Data ────────────────────────────────────────────────────────────

async function loadAll() {

    try {

        const [fmts, nums, sais, cores, modelos] = await Promise.all([

            api('GET', '/formatos'),

            api('GET', '/numeracoes'),

            api('GET', '/saidas'),

            api('GET', '/cores').catch(() => []),

            api('GET', '/modelos_imposicao').catch(() => []),

        ]);

        state.formatos = fmts;

        state.numeracoes = nums;

        state.saidas = sais;

        state.cores = cores || [];

        state.modelosImposicao = modelos || [];

        renderAll();

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



// ─── FORMATOS ─────────────────────────────────────────────────────────────────

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

        rotations: state.fmtRotations,

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

        const clone = JSON.parse(JSON.stringify(f));

        delete clone.id; // Remover ID para o backend gerar um novo UUID

        clone.name = clone.name + ' (cópia)';



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

        await api('DELETE', `/formatos/${id}`);

        toast('Formato excluído.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteFmt = deleteFmt;



// ─── SAÍDAS ───────────────────────────────────────────────────────────────────

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

        await api('DELETE', `/saidas/${id}`);

        toast('Saída excluída.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteSai = deleteSai;



window.setPreset = (w, h) => {

    document.getElementById('sai-w').value = w;

    document.getElementById('sai-h').value = h;

};



// ─── CORES ───────────────────────────────────────────────────────────────────

let corPdfBase64 = "";

let corPdfFilename = "";



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

                            <th>Arquivo PDF</th>

                            <th style="text-align: right; width: 120px;">Ações</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${coresDoFormato.map(c => {

                            const pdfLink = c.pdf_base64 

                                ? `<a href="${c.pdf_base64}" download="${c.pdf_filename || 'referencia.pdf'}" class="badge badge-teal" style="text-decoration:none;" onclick="event.stopPropagation();">📥 Baixar PDF</a>`

                                : '<span style="color:var(--text-faint)">Sem arquivo</span>';

                            

                            return `

                                <tr style="cursor: pointer;" onclick="editCor('${c.id}')" title="Clique para editar/visualizar esta cor">

                                    <td><strong>${c.name}</strong></td>

                                    <td>${c.width_mm} × ${c.height_mm} mm</td>

                                    <td>${pdfLink}</td>

                                    <td class="actions-cell" style="text-align: right;" onclick="event.stopPropagation();">

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



async function saveCor() {

    const id = document.getElementById('cor-id').value;

    const name = document.getElementById('cor-name').value.trim();

    const formatoId = document.getElementById('cor-formato').value;

    const w = parseFloat(document.getElementById('cor-w').value);

    const h = parseFloat(document.getElementById('cor-h').value);



    if (!name) return toast('Informe o nome da cor.', 'error');

    if (!formatoId) return toast('Selecione um formato base.', 'error');

    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return toast('Informe dimensões de tamanho válidas.', 'error');



    const data = {

        name,

        formato_id: formatoId,

        width_mm: w,

        height_mm: h,

        pdf_base64: corPdfBase64 || null,

        pdf_filename: corPdfFilename || ""

    };



    try {

        if (id) {

            await api('PUT', `/cores/${id}`, data);

            toast('Cor atualizada!', 'success');

        } else {

            await api('POST', '/cores', data);

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

    

    if (c.pdf_base64) {

        corPdfBase64 = c.pdf_base64;

        corPdfFilename = c.pdf_filename || "referencia.pdf";

        document.getElementById('cor-pdf-file-name').textContent = "📎 " + corPdfFilename;

        document.getElementById('btn-remove-cor-pdf').style.display = 'inline-flex';

        renderPdfPreview(c.pdf_base64); // Exibir preview do PDF ao editar

    } else {

        clearCorPdfFile();

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

    clearCorPdfFile();

    document.getElementById('cor-form-title').textContent = 'Nova Cor';

    document.getElementById('btn-cor-cancel').style.display = 'none';

    renderPdfPreview(null); // Resetar preview do PDF

}

window.cancelCorEdit = cancelCorEdit;



async function deleteCor(id) {

    if (!confirm('Excluir esta cor?')) return;

    try {

        await api('DELETE', `/cores/${id}`);

        toast('Cor excluída.', 'success');

        await loadAll();

    } catch (e) {

        toast(e.message, 'error');

    }

}

window.deleteCor = deleteCor;



// ─── SELECTS (população) ──────────────────────────────────────────────────────

function populateSelects() {

    // Numeração — select de formatos

    const selNumFmt = document.getElementById('num-formato');

    const curNumFmt = selNumFmt.value;

    selNumFmt.innerHTML = '<option value="">— Selecione um Formato —</option>' +

        state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');

    if (curNumFmt) selNumFmt.value = curNumFmt;



    // Cores - select de formatos

    const selCorFmt = document.getElementById('cor-formato');

    if (selCorFmt) {

        const curCorFmt = selCorFmt.value;

        selCorFmt.innerHTML = '<option value="">— Selecione —</option>' +

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



    // Imposição — formato e saída
    const selImpFmt = document.getElementById('imp-formato');
    if (selImpFmt) {
        const cur = selImpFmt.value;
        selImpFmt.innerHTML = '<option value="">— Selecione —</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
        if (cur) selImpFmt.value = cur;
    }

    const selImpSaida = document.getElementById('imp-saida');
    if (selImpSaida) {
        const cur = selImpSaida.value;
        selImpSaida.innerHTML = '<option value="">— Selecione —</option>' +
            state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (cur) selImpSaida.value = cur;
    }

    // Imposição — numerações (filtradas por tamanho do formato selecionado)
    populateImpNumeracoes();



    // Modelos de Imposição Selector

    const selModelo = document.getElementById('imp-modelo-selector');

    if (selModelo) {

        const curMod = selModelo.value;

        selModelo.innerHTML = '<option value="">— Carregar Modelo —</option>' +

            (state.modelosImposicao || []).map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        if (curMod) selModelo.value = curMod;

    }



    // Amostras

    const selAmCor = document.getElementById('amostra-cor');

    if (selAmCor) {

        const cur = selAmCor.value;

        selAmCor.innerHTML = '<option value="">— Selecione uma Cor —</option>' +

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
            : state.numeracoes;


        selAmNum.innerHTML = '<option value="">— Selecione uma Numeração —</option>' +

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        if (cur && filteredNums.some(n => n.id === cur)) selAmNum.value = cur;

        else selAmNum.value = '';

    }

}


// ─── Popula Numeração 1 e 2 na Imposição, filtradas por TAMANHO do formato ───
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
        filteredNums = state.numeracoes;
    }

    // Popula Numeração 1 e Numeração 2
    ['imp-numeracao', 'imp-numeracao-2'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;

        sel.innerHTML = '<option value="">— Sem numeração —</option>' +
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



// ─── NUMERAÇÃO EDITOR ─────────────────────────────────────────────────────────




function renderNumeracoes() {

    const container = document.getElementById('catalogo-container');

    const empty = document.getElementById('empty-catalogo');



    // Filtros

    const searchVal = (document.getElementById('catalogo-search')?.value || '').toLowerCase();

    const filterFmt = document.getElementById('catalogo-filter-format')?.value || '';



    const filtradas = state.numeracoes.filter(n => {

        if (filterFmt) {
            const ids = n.formato_ids || [n.formato_id];
            if (!ids.some(id => String(id) === String(filterFmt))) return false;
        }

        if (searchVal && !(n.name || '').toLowerCase().includes(searchVal)) return false;

        return true;

    });



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

                    <tr><th>Nome</th><th>Elementos</th><th>Ações</th></tr>

                </thead>

                <tbody>

        `;



        grouped[fmtId].forEach(n => {

            const typeBadges = [...new Set((n.elements || []).map(e => e.type))].map(t =>

                `<span class="badge badge-blue">${t}</span>`

            ).join(' ');

            html += `

                <tr>

                    <td><strong>${n.name}</strong></td>

                    <td>${typeBadges || '—'} <small style="color:var(--text-faint)">(${(n.elements || []).length} itens)</small></td>

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

    const n = state.numeracoes.find(x => x.id === id);

    if (!n) return;



    // Ativar view de numeração

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    document.getElementById('nav-numeracao').classList.add('active');

    document.getElementById('view-numeracao').classList.add('active');



    document.getElementById('num-id').value = n.id;

    document.getElementById('num-name').value = n.name;

    document.getElementById('num-formato').value = n.formato_id;

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

        await api('DELETE', `/numeracoes/${id}`);

        toast('Numeração excluída.', 'success');

        await loadAll();

    } catch (e) { toast(e.message, 'error'); }

}

window.deleteNumeracao = deleteNumeracao;



window.duplicateCatalogNumeracao = async function (id) {

    const n = state.numeracoes.find(x => x.id === id);

    if (!n) return;

    try {

        const clone = JSON.parse(JSON.stringify(n));

        delete clone.id; // Remover ID para o backend gerar um novo UUID

        clone.name = clone.name + ' (cópia)';



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

    // ── Renderizar checkboxes de formatos compatíveis ──
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

    if (clearElements !== false) state.numElements = [];

    document.getElementById('numeracao-editor').style.display = 'grid';

    initCanvas();
    renderElementsList();
    drawCanvas();
};




// ─── CANVAS ──────────────────────────────────────────────────────────────────

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



    document.getElementById('canvas-dim-label').textContent = `${fmt.width_mm} × ${fmt.height_mm} mm`;

    document.getElementById('canvas-scale-label').textContent = `1mm = ${state.canvasScale.toFixed(1)}px`;



    // Mouse events

    canvas.onmousedown = onCanvasMouseDown;

    canvas.onmousemove = onCanvasMouseMove;

    canvas.onmouseup = onCanvasMouseUp;

    canvas.onmouseleave = onCanvasMouseUp;

}



function drawCanvas() {

    const canvas = document.getElementById('numeracao-canvas');

    if (!canvas || !state.numFormato) return;

    const ctx = canvas.getContext('2d');

    const S = state.canvasScale;

    const W = canvas.width;

    const H = canvas.height;



    // Fundo branco

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, W, H);



    // Determinar qual imagem de fundo usar dependendo da view ativa
    let refBg = state.bgImage;
    const viewNumeracao = document.getElementById('view-numeracao');
    if (!refBg && viewNumeracao && viewNumeracao.classList.contains('active')) {
        refBg = state.numPdfImage || state.numSvgImage;
    }

    // Arte de fundo (camada de referência semitransparente em tamanho original e centralizada)
    if (refBg) {
        const MM2PT = 2.8346;
        let originalW_mm = 0;
        let originalH_mm = 0;

        if (refBg.originalPdfWidthPt) {
            // Se for PDF, usar os pontos originais dividindo por MM2PT (72 / 25.4 = 2.8346)
            originalW_mm = refBg.originalPdfWidthPt / MM2PT;
            originalH_mm = refBg.originalPdfHeightPt / MM2PT;
        } else {
            // Se for imagem (JPG/PNG/SVG), obter o DPI lido ou adotar 300 DPI como fallback
            const dpi = refBg.dpiValue || 300;
            originalW_mm = (refBg.width / dpi) * 25.4;
            originalH_mm = (refBg.height / dpi) * 25.4;
        }

        // Fallback: se a largura não for calculada direito (ex: SVG), usar as dimensões do formato base
        if (!originalW_mm || originalW_mm < 1) {
            if (state.numFormato) {
                originalW_mm = state.numFormato.width_mm;
                originalH_mm = state.numFormato.height_mm;
            }
        }

        const drawW = originalW_mm * state.canvasScale;
        const drawH = originalH_mm * state.canvasScale;
        const drawX = (canvas.width - drawW) / 2;
        const drawY = (canvas.height - drawH) / 2;

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



    // Renderizar elementos (com clipping no formato para evitar overflow para fora dos limites)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    state.numElements.forEach(el => drawElement(ctx, el, S));
    ctx.restore();

}



function drawElement(ctx, el, S) {

    const x = el.x_mm * S;

    const y = el.y_mm * S;

    const isSelected = isElSelected(el.id);

    const color = el.color || '#1e293b';

    const rot = (el.rotation || 0) * Math.PI / 180;



    ctx.save();

    ctx.translate(x, y);

    ctx.rotate(rot);



    const SAMPLE = el.type === 'FIXED' ? (el.fixed_value || 'TEXTO') :

        el.type === 'TEXT' ? '0001' :

            el.type === 'QR' ? null :

                el.type === 'BARCODE' ? null : '0001';



    if (el.type === 'TEXT' || el.type === 'FIXED') {

        const fs = (el.font_size || 12) * S / 2.8346;

        const fontStyle = getFontCSS(el.font_name);

        ctx.font = `${fs}px ${fontStyle}`;

        ctx.fillStyle = color;

        let label = '';

        if (el.type === 'FIXED') {

            label = el.fixed_value || 'TEXTO FIXO';

        } else if (el.source === 'database') {

            label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;

        } else {

            const padValue = typeof el.pad !== 'undefined' ? el.pad : 6;

            const dummyNum = String(1).padStart(padValue, '0');

            label = `${el.prefix || ''}${dummyNum}${el.suffix || ''}`;

        }

        ctx.fillText(label, 0, fs);



        // Selection box

        if (isSelected) {

            const mw = ctx.measureText(label).width;

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-3, -3, mw + 6, fs + 6);

            ctx.setLineDash([]);

        }



    } else if (el.type === 'QR') {

        const sz = (el.size_mm || 15) * S;

        ctx.fillStyle = color;

        // Desenhar QR placeholder

        ctx.fillRect(0, 0, sz, sz);

        ctx.fillStyle = '#fff';

        const cell = sz / 7;

        // Cantos do QR

        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {

            ctx.fillStyle = '#fff';

            ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);

            ctx.fillStyle = color;

            ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);

        }

        ctx.font = `${Math.max(6, sz * 0.14)}px Inter`;

        ctx.fillStyle = '#fff';

        ctx.textAlign = 'center';

        ctx.fillText('QR', sz / 2, sz / 2 + sz * 0.05);

        ctx.textAlign = 'left';



        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-2, -2, sz + 4, sz + 4);

            ctx.setLineDash([]);

        }



    } else if (el.type === 'BARCODE') {

        const bw = (el.width_mm || 40) * S;

        const bh = (el.height_mm || 10) * S;

        // Desenhar barras

        ctx.fillStyle = color;

        const barW = bw / 40;

        for (let i = 0; i < 40; i++) {

            if (Math.random() > 0.4 || i % 3 === 0) {

                ctx.fillRect(i * barW, 0, barW * 0.6, bh);

            }

        }

        // Repaint (determinístico baseado no i)

        ctx.clearRect(0, 0, bw, bh);

        ctx.fillStyle = color;

        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];

        for (let i = 0; i < pattern.length; i++) {

            if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);

        }



        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-2, -2, bw + 4, bh + 4);

            ctx.setLineDash([]);

        }



        // Adicionar texto indicando o tipo de código de barras

        ctx.fillStyle = color;

        ctx.font = `${Math.max(6, bh * 0.35)}px Inter, sans-serif`;

        ctx.textAlign = 'center';

        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), bw / 2, bh + Math.max(6, bh * 0.35));

        ctx.textAlign = 'left';

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

        // Aplicar clipping para que a imagem nunca ultrapasse o bounding box do elemento
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();

        if (el.type === 'PDF') {

            // Preferir o canvas renderizado pelo PDF.js (mais fiel ao PDF real)
            const pdfCanvas = el._pdfCanvas || null;
            const imgObj = pdfCanvas || state.numPdfImage;

            if (imgObj) {
                ctx.drawImage(imgObj, 0, 0, w, h);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.fillText('PDF (Sem arquivo)', w / 2, h / 2 + (h * 0.05));
                ctx.textAlign = 'left';
            }

        } else {

            // SVG
            const imgObj = state.numSvgImage;

            if (imgObj) {
                ctx.drawImage(imgObj, 0, 0, w, h);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.fillText('SVG (Sem arquivo)', w / 2, h / 2 + (h * 0.05));
                ctx.textAlign = 'left';
            }

        }

        ctx.restore();

        // Borda do bounding box (desenhada fora do clip para ficar sempre visível)
        ctx.strokeStyle = isSelected ? '#3b82f6' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (isSelected) {
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-2, -2, w + 4, h + 4);
            ctx.setLineDash([]);
        } else {
            ctx.strokeRect(0, 0, w, h);
        }

    }



    // Indicador de posição quando selecionado

    if (isSelected) {

        ctx.fillStyle = '#3b82f6';

        ctx.beginPath();

        ctx.arc(0, 0, 4, 0, Math.PI * 2);

        ctx.fill();

    }



    ctx.restore();

}



// ─── Canvas Mouse Events ──────────────────────────────────────────────────────

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

        // Para o Picote, a colisão ocorre na linha vertical (qualquer Y, mas X próximo de el.x_mm)

        return Math.abs(mx - el.x_mm) <= 2;

    }



    const S = 1;

    const ex = el.x_mm, ey = el.y_mm;

    let w = 20, h = 8;



    if (el.type === 'TEXT' || el.type === 'FIXED') { w = 30; h = (el.font_size || 12) / 2.8346; }

    else if (el.type === 'QR') { w = el.size_mm || 15; h = w; }

    else if (el.type === 'BARCODE') { w = el.width_mm || 40; h = el.height_mm || 10; }

    else if (el.type === 'SVG') { w = el.width_mm || 20; h = el.height_mm || 20; }

    else if (el.type === 'PDF') { w = el.width_mm || 20; h = el.height_mm || 20; }



    return mx >= ex - 2 && mx <= ex + w + 2 && my >= ey - 2 && my <= ey + h + 2;

}



function onCanvasMouseDown(e) {

    const canvas = document.getElementById('numeracao-canvas');

    const { x, y } = getCanvasPos(canvas, e);



    // Verificar hit em sentido inverso (último = mais ao topo)

    let hit = null;

    for (let i = state.numElements.length - 1; i >= 0; i--) {

        if (hitTest(state.numElements[i], x, y)) {

            hit = state.numElements[i];

            break;

        }

    }



    const multi = e.ctrlKey || e.shiftKey;



    if (hit) {

        if (multi) {

            selectElId(hit.id, true);

        } else {

            if (!isElSelected(hit.id)) {

                selectElId(hit.id, false);

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

    const canvas = document.getElementById('numeracao-canvas');

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

    state.dragging = null;

}



// ─── Ferramentas de Alinhamento ──────────────────────────────────────────────

function isElSelected(id) {

    if (!state.selectedElIds) state.selectedElIds = [];

    return state.selectedElIds.includes(id);

}



function selectElId(id, multi = false) {

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

    if (el.type === 'TEXT' || el.type === 'FIXED') {

        const canvas = document.getElementById('numeracao-canvas');

        if (canvas) {

            const ctx = canvas.getContext('2d');

            ctx.save();

            const S = state.canvasScale;

            const fs = (el.font_size || 12) * S / 2.8346;

            const fontStyle = getFontCSS(el.font_name);

            ctx.font = `${fs}px ${fontStyle}`;

            

            let label = '';

            if (el.type === 'FIXED') {

                label = el.fixed_value || 'TEXTO FIXO';

            } else if (el.source === 'database') {

                label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;

            } else {

                label = `${el.prefix || ''}0001${el.suffix || ''}`;

            }

            const mw_px = ctx.measureText(label).width;

            ctx.restore();

            w = mw_px / S;

            h = el.font_size / 2.8346;

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



    state.selectedElIds.forEach(id => {

        const el = state.numElements.find(e => e.id === id);

        if (!el) return;



        const { w, h } = getElementSizeMM(el);



        if (alignment === 'left') {

            el.x_mm = 0;

        } else if (alignment === 'center-h') {

            el.x_mm = Math.max(0, (fmt.width_mm - w) / 2);

        } else if (alignment === 'right') {

            el.x_mm = Math.max(0, fmt.width_mm - w);

        } else if (alignment === 'top') {

            if (el.type === 'PICOTE') return;

            el.y_mm = 0;

        } else if (alignment === 'center-v') {

            if (el.type === 'PICOTE') return;

            el.y_mm = Math.max(0, (fmt.height_mm - h) / 2);

        } else if (alignment === 'bottom') {

            if (el.type === 'PICOTE') return;

            el.y_mm = Math.max(0, fmt.height_mm - h);

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



    drawCanvas();

};





// ─── Arte de Fundo no Canvas (Bug 5) ────────────────────────────────────────────



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



// ─── ELEMENTOS VDP ────────────────────────────────────────────────────────────

window.addElement = function (type) {

    state.numElCounter++;

    const id = `el_${state.numElCounter}`;

    const base = { id, type, x_mm: type === 'PICOTE' ? 25 : 5, y_mm: type === 'PICOTE' ? 0 : 5, rotation: 0, color: type === 'PICOTE' ? '#ef4444' : '#000000', face: 'both' };



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



    state.numElements.push(base);

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



    const typeLabel = { TEXT: '🔤 Numeração', FIXED: '🔠 Texto Fixo', QR: '📱 QR Code', BARCODE: '▌▌ Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote' };

    const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger', PDF: 'badge-gray' };



    container.innerHTML = state.numElements.map(el => {

        const isSelected = isElSelected(el.id);



        if (el.type === 'PICOTE') {

            return `

            <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">

                <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">

                    <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">

                        <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>

                        <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">

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

        }



        return `

        <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">

            <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">

                <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">

                    <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>

                    <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">

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

                        <option value="">— Selecione —</option>

                        ${state.numCsvHeaders.map(col => `<option value="${col}" ${el.csv_column === col ? 'selected' : ''}>${col}</option>`).join('')}

                    </select>

                    ` : `

                    <input class="form-control" type="text" value="${el.csv_column || ''}" placeholder="Ex: nome" onchange="updateEl('${el.id}','csv_column',this.value)">

                    `}

                </div>

                ` : ''}

                ${extraFields}

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



window.removeEl = function (id) {

    state.numElements = state.numElements.filter(e => e.id !== id);

    if (state.selectedElId === id) state.selectedElId = null;

    renderElementsList();

    drawCanvas();

};



window.duplicateEl = function (id) {

    const el = state.numElements.find(e => e.id === id);

    if (!el) return;



    state.numElCounter++;

    const newId = `el_${state.numElCounter}`;



    const clone = JSON.parse(JSON.stringify(el));

    clone.id = newId;

    clone.x_mm += 5; // Desloca levemente para não sobrepor perfeitamente

    if (clone.type === 'PICOTE') {

        clone.y_mm = 0;

    } else {

        clone.y_mm += 5;

    }

    if (clone.name) clone.name += ' (cópia)';



    state.numElements.push(clone);

    renderElementsList();

    drawCanvas();

    selectElId(newId, false);

};





window.selectEl = function (id, event) {

    const multi = event ? (event.ctrlKey || event.shiftKey) : false;

    selectElId(id, multi);

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



// ─── Salvar Numeração ─────────────────────────────────────────────────────────

async function uploadToStorage(content, fileName, path) {
    if (!content) return content;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return content;
    if (typeof content === 'string' && content.startsWith('http')) return content; // Already a URL

    let blob;
    try {
        if (content instanceof File || content instanceof Blob) {
            blob = content;
        } else if (typeof content === 'string' && content.startsWith('data:')) {
            const res = await fetch(content);
            blob = await res.blob();
        } else {
            blob = new Blob([content], { type: 'image/svg+xml' });
        }
    } catch (fetchErr) {
        console.warn("Erro ao converter conteúdo em Blob usando fetch, tentando conversão manual:", fetchErr);
        try {
            if (typeof content === 'string' && content.startsWith('data:')) {
                const parts = content.split(',');
                const mime = parts[0].match(/:(.*?);/)[1];
                const bstr = atob(parts[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                blob = new Blob([u8arr], { type: mime });
            } else {
                throw fetchErr;
            }
        } catch (convErr) {
            console.error("Falha na conversão manual do base64:", convErr);
            return content; // Fallback: retorna o conteúdo original (base64)
        }
    }

    const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'arquivo';
    const finalPath = `${path}/${Date.now()}_${safeName}`;
    
    try {
        const { data, error } = await supabaseClient.storage
            .from('imposicao-storage')
            .upload(finalPath, blob, { upsert: true });

        if (error) {
            console.warn("Erro no upload para o Supabase Storage, salvando como Base64:", error);
            return content; // Fallback: retorna o base64 para salvar diretamente no DB
        }

        const { data: publicUrlData } = supabaseClient.storage
            .from('imposicao-storage')
            .getPublicUrl(finalPath);

        return publicUrlData.publicUrl;
    } catch (uploadErr) {
        console.warn("Falha de rede/exceção ao enviar para o Supabase Storage, salvando como Base64:", uploadErr);
        return content; // Fallback: retorna o base64 para salvar diretamente no DB
    }
}



window.saveNumeracao = async function () {

    const id = document.getElementById('num-id').value;

    const name = document.getElementById('num-name').value.trim();

    const fmtId = document.getElementById('num-formato').value;



    if (!name) return toast('Informe um nome para a numeração.', 'error');

    if (!fmtId) return toast('Selecione um formato.', 'error');



    toast('Fazendo upload e salvando (isso pode demorar alguns segundos)...', 'info');



    try {

        const svgUrl = await uploadToStorage(state.numSvgContent, state.numSvgFilename || 'arquivo.svg', 'uploads_svg');

        const pdfUrl = await uploadToStorage(state.numPdfContent, state.numPdfFilename || 'arquivo.pdf', 'uploads_pdf');



        state.numSvgContent = svgUrl;

        state.numPdfContent = pdfUrl;



        const data = {

            name,

            formato_id: fmtId,

            // Coletar todos os formatos marcados nos checkboxes
            formato_ids: (() => {
                const checks = document.querySelectorAll('#num-formatos-checks input[type="checkbox"]');
                const ids = [];
                checks.forEach(cb => { if (cb.checked || cb.value === fmtId) ids.push(cb.value); });
                // Garantir que o formato base está sempre incluído
                if (!ids.includes(fmtId)) ids.unshift(fmtId);
                return ids;
            })(),

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

            elements: state.numElements.map(el => {

                // Remover propriedades internas do frontend (não serializáveis)
                const { _pdfCanvas, _pdfLoading, _svgImage, _pdfPreview, ...e } = el;

                if (e.type === 'FIXED') e.fixed = true;

                if (e.type === 'SVG') e.svg_content = svgUrl || e.svg_content || "";

                // Para PDF: usar pdfUrl se válido, senão manter o pdf_content original do elemento
                // Isso evita apagar o PDF ao re-editar sem recarregar o arquivo
                if (e.type === 'PDF') e.pdf_content = pdfUrl || e.pdf_content || "";

                return e;

            })

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

        cancelNumEdit();
await loadAll();

if (window.customNumeracaoEditState) {
    const customState = window.customNumeracaoEditState;
    window.customNumeracaoEditState = null;
    
    // Encontrar a numeracao recem criada (pelo nome)
    const newNumName = customState.modelName || customState.modeloName;
    const newNum = state.numeracoes.find(n => n.name === newNumName || n.name === document.getElementById('num-name').value.trim());
    
    if (customState.active || customState.view === 'amostras') {
        if (newNum) {
            // Associar a amostra
            await saveAmostraToDB(customState.itemId, customState.osId, { amostra_num_id: newNum.id });
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
    }
} else {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('nav-catalogo').classList.add('active');
    document.getElementById('view-catalogo').classList.add('active');
}



    } catch (e) { toast(e.message, 'error'); }

};



// ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────

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



// ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────

async function loadImpArtFile(file) {

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

    const canvas = document.getElementById('preview-canvas');

    if (!canvas) return;

    const ctx = canvas.getContext('2d');



    const fmtId = document.getElementById('imp-formato').value;

    const numId = document.getElementById('imp-numeracao').value;

    const saiId = document.getElementById('imp-saida').value;

    const start = parseInt(document.getElementById('imp-start').value) || 1;

    const end = parseInt(document.getElementById('imp-end').value) || 100;

    const schema = document.getElementById('imp-schema').value;



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



    const fmt = state.formatos.find(f => f.id === fmtId);

    const sai = state.saidas.find(s => s.id === saiId);

    if (!fmt || !sai) return;



    const num = state.numeracoes.find(n => n.id === numId) || null;

    const num2Id = document.getElementById('imp-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => n.id === num2Id) || null;



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



    const total_items = Math.max(1, end - start + 1);

    const poses_per_sheet = cols * rows;

    const total_sheets = Math.ceil(total_items / poses_per_sheet);



    document.getElementById('preview-sheet-num').textContent = `Folha 1 de ${total_sheets}`;



    const isBack = state.previewFace === 'back';



    for (let row = 0; row < rows; row++) {

        for (let col = 0; col < cols; col++) {

            const P = row * cols + col;



            let item_index = P;

            if (schema === "cut_stack") {

                item_index = (P * total_sheets);

            } else if (schema === "step_repeat") {

                item_index = 0;

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



            let activePdfDoc = state.impArtPdfDoc;

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

                const offH = fmt_off_h * scale;

                const offV = -fmt_off_v * scale;



                const dw = art_orig_w * scale;

                const dh = art_orig_h * scale;



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

                            pageNum = isBack ? 2 : 1;

                        }



                        if (pageNum <= activePdfDoc.numPages) {

                            let pagesCache = isMultiArtePdf ? multiArteItem.pagesCache : state.impArtPagesCache;

                            let pagesRendering = isMultiArtePdf ? multiArteItem.pagesRendering : state.impArtPagesRendering;

                            if (!pagesCache) {

                                pagesCache = {};

                                if (isMultiArtePdf) multiArteItem.pagesCache = pagesCache;

                                else state.impArtPagesCache = pagesCache;

                            }

                            if (!pagesRendering) {

                                pagesRendering = {};

                                if (isMultiArtePdf) multiArteItem.pagesRendering = pagesRendering;

                                else state.impArtPagesRendering = pagesRendering;

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

                currentNum.elements.forEach(el => {

                    const printMode = document.getElementById('imp-print-mode')?.value || 'front';

                    let effectiveFace = el.face || 'both';

                    if (printMode === 'duplex') {

                        effectiveFace = source_id === 1 ? 'front' : 'back';

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

                        const raw = pad > 0 ? String(val).padStart(pad, '0') : String(val);

                        val_str = `${prefix}${raw}${suffix}`;

                    }



                    ctx.save();

                    ctx.translate(el_x_rel, el_y_rel);

                    ctx.rotate(rotation * Math.PI / 180);



                    if (el.type === 'TEXT' || el.type === 'FIXED') {

                        const fs = (el.font_size || 12) * scale;

                        const fontStyle = getFontCSS(el.font_name);

                        ctx.font = `${fs}px ${fontStyle}`;

                        ctx.fillStyle = color;

                        ctx.textAlign = 'left';

                        ctx.fillText(val_str, 0, fs);

                    } else if (el.type === 'QR') {

                        const sz = (el.size_mm || 15) * MM2PT * scale;

                        ctx.fillStyle = color;

                        ctx.fillRect(0, 0, sz, sz);

                        ctx.fillStyle = '#ffffff';

                        const cell = sz / 7;

                        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);

                            ctx.fillStyle = color;

                            ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);

                        }

                    } else if (el.type === 'BARCODE') {

                        const bw = (el.width_mm || 40) * MM2PT * scale;

                        const bh = (el.height_mm || 10) * MM2PT * scale;

                        ctx.fillStyle = color;

                        const barW = bw / 40;

                        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];

                        for (let i = 0; i < pattern.length; i++) {

                            if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);

                        }



                        ctx.font = `${Math.max(5, bh * 0.3)}px Inter, sans-serif`;

                        ctx.textAlign = 'center';

                        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), bw / 2, bh + Math.max(5, bh * 0.35));

                        ctx.textAlign = 'left';

                    } else if (el.type === 'SVG') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;

                        const svgImg = currentNum && currentNum._svgImage;

                        if (svgImg) {

                            ctx.drawImage(svgImg, 0, 0, sz_w, sz_h);

                        } else {

                            ctx.strokeStyle = color;

                            ctx.lineWidth = 0.5 * scale;

                            ctx.strokeRect(0, 0, sz_w, sz_h);

                            ctx.font = `${Math.max(5, sz_h * 0.15)}px Inter, sans-serif`;

                            ctx.fillStyle = color;

                            ctx.textAlign = 'center';

                            ctx.fillText('SVG', sz_w / 2, sz_h / 2 + (sz_h * 0.05));

                            ctx.textAlign = 'left';

                        }

                    } else if (el.type === 'PDF') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;

                        if (el._pdfCanvas) {

                            // Já carregado: desenhar diretamente

                            ctx.drawImage(el._pdfCanvas, 0, 0, sz_w, sz_h);

                        } else if (el.pdf_content && !el._pdfLoading) {

                            // Carregar assincronamente e cachear no próprio elemento

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

                            ctx.fillRect(0, 0, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(0, 0, sz_w, sz_h);

                            ctx.fillStyle = '#64748b';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('PDF...', sz_w / 2, sz_h / 2);

                            ctx.textAlign = 'left';

                            ctx.textBaseline = 'alphabetic';

                        } else if (!el.pdf_content) {

                            // Sem conteúdo: placeholder vazio

                            ctx.fillStyle = '#f8fafc';

                            ctx.fillRect(0, 0, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(0, 0, sz_w, sz_h);

                            ctx.fillStyle = '#94a3b8';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('📄 PDF', sz_w / 2, sz_h / 2);

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



function updateImpSummary() {

    const fmtSelect = document.getElementById('imp-formato');

    const numSelect = document.getElementById('imp-numeracao');

    const numSelect2 = document.getElementById('imp-numeracao-2');



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

        

        const optionsHtml = '<option value="">— Sem numeração —</option>' + 

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');



        numSelect.innerHTML = optionsHtml;

        if (filteredNums.some(n => n.id === curNumVal)) {

            numSelect.value = curNumVal;

        } else {

            numSelect.value = "";

        }

        numSelect.setAttribute('data-last-fmt', currentFmtId);



        if (numSelect2) {

            numSelect2.innerHTML = optionsHtml;

            if (filteredNums.some(n => n.id === curNumVal2)) {

                numSelect2.value = curNumVal2;

            } else {

                numSelect2.value = "";

            }

        }

    }



    const fmtId = document.getElementById('imp-formato').value;

    const numId = document.getElementById('imp-numeracao').value;

    const saiId = document.getElementById('imp-saida').value;

    const start = parseInt(document.getElementById('imp-start').value) || 1;

    const end = parseInt(document.getElementById('imp-end').value) || 100;

    const box = document.getElementById('imp-summary');



    const num = state.numeracoes.find(n => n.id === numId) || null;

    const num2Id = document.getElementById('imp-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => n.id === num2Id) || null;

    if (num && num.svg_content && !num._svgImage) {

        const img = new Image();

        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(num.svg_content);

        img.onload = () => {

            num._svgImage = img;

            drawPreview();

        };

    }

    // Pré-carregar canvas de cada elemento PDF da numeração selecionada

    function preloadNumPdfElements(numeracao) {

        if (!numeracao || !numeracao.elements) return;

        numeracao.elements.forEach(el => {

            if (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas && !el._pdfLoading) {

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

                    } catch (err) {

                        console.error('[Preview] Erro pré-carregando PDF do elemento:', err);

                        delete el._pdfLoading;

                    }

                })();

            }

        });

    }

    preloadNumPdfElements(num);

    preloadNumPdfElements(num2);

    const schema = document.getElementById('imp-schema').value;

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

        state.csvData = null;

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

            state.csvData = null;

            state.csvFile = null;

        }

        

        const impStart = document.getElementById('imp-start');

        const impEnd = document.getElementById('imp-end');

        if (impStart) impStart.removeAttribute('disabled');

        if (impEnd) impEnd.removeAttribute('disabled');

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

    const perSheet = fmt.cols * fmt.rows;

    const sheets = Math.ceil(total / perSheet);



    box.style.display = 'grid';

    document.getElementById('sum-formato').textContent = `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)`;

    document.getElementById('sum-grade').textContent = `${fmt.cols} × ${fmt.rows} = ${perSheet} itens/folha`;

    document.getElementById('sum-total').textContent = total.toLocaleString('pt-BR');

    document.getElementById('sum-folhas').textContent = sheets.toLocaleString('pt-BR') + ' folha(s)';

    document.getElementById('sum-saida').textContent = `${sai.name} — ${(sai.file_format || 'pdf').toUpperCase()}`;



    // Update steps

    ['step-1', 'step-2', 'step-3', 'step-4'].forEach((s, i) => {

        const el = document.getElementById(s);

        el.classList.remove('done', 'active');

        el.classList.add(i < 3 ? 'done' : 'active');

    });



    drawPreview();

}

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

        document.getElementById('step-4').classList.add('active');

        loadImpArtFile(f);

    }

}



let impositionAbortController = null;



window.runImposition = async function () {

    const fmtId = document.getElementById('imp-formato').value;

    const numId = document.getElementById('imp-numeracao').value;

    const saiId = document.getElementById('imp-saida').value;

    const start = parseInt(document.getElementById('imp-start').value);

    const end = parseInt(document.getElementById('imp-end').value);

    const schema = document.getElementById('imp-schema').value;

    const rotateEl = document.getElementById('imp-rotate-page');

    const rotatePage = rotateEl ? (rotateEl.value === 'true') : false;



    if (!fmtId) return toast('Selecione um Formato.', 'error');

    if (!saiId) return toast('Selecione uma Saída.', 'error');

    

    if (schema === 'multi_artes') {

        // Valida se todas as artes da lista têm PDF carregado

        for (let i = 0; i < state.impMultiArtes.length; i++) {

            if (!state.impMultiArtes[i].pdf_url || (state.impMultiArtes[i].pdf_url === 'local_file' && !state.impMultiArtes[i].rawFile)) {

                return toast(`Arte ${i + 1}: faça o upload do PDF da arte (necessário a cada sessão).`, 'error');

            }

        }

    } else {

        if (!impFile.files.length) return toast('Selecione a arte (PDF/JPG/PNG).', 'error');

    }

    

    if (schema !== 'multi_artes' && schema !== 'pdf_multiple') {

        if (start > end) return toast('Número inicial deve ser menor que o final.', 'error');

    }



    const formato = state.formatos.find(f => f.id === fmtId);

    const saida = state.saidas.find(s => s.id === saiId);



    // 1. SOLICITAR DESTINO DO ARQUIVO IMEDIATAMENTE (dentro do clique do usuário para manter o gesto ativo)

    let fileHandle = null;

    const suffix = schema === "pdf_multiple" ? "Paginado" : `${start}-${end}`;

    const defaultFilename = `VDP_${formato.name.replace(/\s+/g, '_')}_${suffix}.pdf`;



    if (window.showSaveFilePicker) {

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

            // Se o usuário cancelou o diálogo de salvamento, interrompe o processo antes de chamar o servidor

            if (err.name === 'AbortError') {

                return;

            }

            console.error("Erro ao abrir showSaveFilePicker no início:", err);

        }

    }



    const numeracao = numId ? state.numeracoes.find(n => n.id === numId) : null;

    const num2Id = document.getElementById('imp-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => n.id === num2Id) || null;



    let payloadMultiArtes = [];

    if (schema === 'multi_artes') {

        payloadMultiArtes = state.impMultiArtes.map(arte => {

            return {

                qtd: arte.qtd,

                pdf_url: arte.pdf_url,

                pdf_name: arte.pdf_name,

                nome: arte.nome || '',

                nome_color: arte.nome_color || '#000000',

                num1_id: arte.num1_id,

                num2_id: arte.num2_id,

                start: arte.start,

                numeracao: state.numeracoes.find(n => n.id === arte.num1_id) || null,

                numeracao_2: state.numeracoes.find(n => n.id === arte.num2_id) || null,

                has_raw_file: !!arte.rawFile

            };

        });

    }



    const payload = {

        formato_id: fmtId,

        numeracao_id: numId || null,

        numeracao_2_id: num2Id || null,

        saida_id: saiId,

        formato: formato,

        saida: saida,

        numeracao: numeracao,

        numeracao_2: num2,

        seq_start: start,

        seq_end: end,

        seq_increment: 1,

        schema,

        print_mode: state.printMode,

        rotate_page: rotatePage,

        multi_artes: payloadMultiArtes

    };



    const formData = new FormData();

    if (impFile.files && impFile.files.length > 0) {

        formData.append('file', impFile.files[0]);

    }

    if (state.csvFile) {

        formData.append('csv_file', state.csvFile);

    }

    if (schema === 'multi_artes') {

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



    // Instancia o AbortController e associa ao botão de cancelamento

    impositionAbortController = new AbortController();

    const cancelBtn = document.getElementById('btn-cancel-imposition');

    if (cancelBtn) {

        cancelBtn.onclick = () => {

            if (impositionAbortController) {

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



        // 2. Verificar se o Agente Local (porta 9000) está ativo

        let localActive = false;

        if (!localApiActive) {

            try {

                const controller = new AbortController();

                const timeoutId = setTimeout(() => controller.abort(), 300);

                const agentCheck = await fetch("http://localhost:9000/", { 

                    method: "GET",

                    signal: controller.signal 

                }).catch(() => null);

                clearTimeout(timeoutId);

                if (agentCheck && agentCheck.ok) {

                    const checkData = await agentCheck.json().catch(() => ({}));

                    if (checkData.status === "running") {

                        localActive = true;

                    }

                }

            } catch (_) {}

        }



        if (localApiActive) {

            baseUrl = "http://localhost:8080";

            console.log("[Imposition] ✅ Servidor local (porta 8080) detectado — processando localmente para máxima velocidade");

            if (sub) sub.textContent = `Gerando ${total.toLocaleString('pt-BR')} itens... (Servidor Local)`;

        } else if (localActive) {

            baseUrl = "http://localhost:9000";

            console.log("[Imposition] Processando via agente local (porta 9000)");

        } else {

            console.log("[Imposition] Processando na nuvem (Render)");

            if (sub) sub.textContent = `Gerando ${total.toLocaleString('pt-BR')} itens... (Aguardando servidor na nuvem...)`;

        }

        

        const headers = {};

        if (typeof firebase !== 'undefined' && firebase.auth() && firebase.auth().currentUser) {

            try {

                const token = await firebase.auth().currentUser.getIdToken();

                headers['Authorization'] = `Bearer ${token}`;

            } catch (e) {

                console.error("Erro ao obter Firebase ID Token para imposição:", e);

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

        const blob = await res.blob();

        

        // Salvar os dados na pasta e arquivo já escolhidos pelo usuário

        if (fileHandle) {

            try {

                const writable = await fileHandle.createWritable();

                await writable.write(blob);

                await writable.close();

                toast('PDF salvo com sucesso!', 'success');

                // Auto-atualizar status de impressão do item ativo da OS
                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
                }

                return;

            } catch (err) {

                console.error("Falha ao salvar no arquivo escolhido previamente, usando fallback:", err);

            }

        }



        // Fallback: Prompt para nome do arquivo + download convencional

        const filename = prompt('Digite o nome do arquivo para salvar o PDF:', defaultFilename);

        if (filename === null) return; // cancelado pelo usuário

        

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

        // Auto-atualizar status de impressão do item ativo da OS
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
            btn.innerHTML = '⚙️ Gerar PDF de Alta Resolução';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }, 400);
        impositionAbortController = null;

    }

};;



// ─── Init ─────────────────────────────────────────────────────────────────────

loadAll();



// ─── Formato Preview ──────────────────────────────────────────────────────────

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

        let badgeText = `Grade: ${cols}×${rows} · Total: ${cols * rows} itens`;

        if (off_h !== 0 || off_v !== 0) {

            badgeText += ` · Offset: ${off_h.toFixed(1)}×${off_v.toFixed(1)}mm`;

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



// ─── LÓGICA DE BANCO DE DADOS (CSV) ──────────────────────────────────────────

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

        csv_column: colName

    };

    

    state.numElements.push(base);

    state.selectedElId = id;

    renderElementsList();

    drawCanvas();

    selectElementCard(id);

};



// ─── LÓGICA DE AUTENTICAÇÃO E ADMINISTRAÇÃO ───────────────────────────────────

let authMode = 'login'; // 'login' ou 'register'



window.toggleAuthMode = function(e) {

    if (e) e.preventDefault();

    const title = document.querySelector('.auth-header h2');

    const p = document.querySelector('.auth-header p');

    const btnSubmit = document.getElementById('btn-auth-submit');

    const toggleLink = document.getElementById('auth-toggle-link');

    

    if (authMode === 'login') {

        authMode = 'register';

        title.textContent = 'Ideal Imposition — Cadastro';

        p.textContent = 'Crie sua conta para começar';

        btnSubmit.textContent = 'Cadastrar';

        toggleLink.textContent = 'Já tem uma conta? Entrar';

    } else {

        authMode = 'login';

        title.textContent = 'Ideal Imposition';

        p.textContent = 'Faça login para acessar o painel online';

        btnSubmit.textContent = 'Entrar';

        toggleLink.textContent = 'Criar uma nova conta';

    }

};



window.handleAuthSubmit = async function(e) {

    e.preventDefault();

    const email = document.getElementById('auth-email').value.trim();

    const password = document.getElementById('auth-password').value;

    const btnSubmit = document.getElementById('btn-auth-submit');

    

    btnSubmit.disabled = true;

    btnSubmit.textContent = authMode === 'login' ? 'Entrando...' : 'Cadastrando...';

    

    try {

        if (authMode === 'login') {

            await firebase.auth().signInWithEmailAndPassword(email, password);

            toast('Login efetuado com sucesso!', 'success');

        } else {

            await firebase.auth().createUserWithEmailAndPassword(email, password);

            toast('Conta criada com sucesso!', 'success');

        }

        document.getElementById('auth-overlay').classList.remove('active');

        document.body.classList.remove('not-logged-in');

    } catch (err) {

        toast('Erro: ' + err.message, 'error');

    } finally {

        btnSubmit.disabled = false;

        btnSubmit.textContent = authMode === 'login' ? 'Entrar' : 'Cadastrar';

    }

};



window.handleGoogleLogin = async function() {

    const provider = new firebase.auth.GoogleAuthProvider();

    const btnGoogle = document.getElementById('btn-google-login');

    if (btnGoogle) btnGoogle.disabled = true;

    

    try {

        await firebase.auth().signInWithPopup(provider);

        toast('Login com Google efetuado com sucesso!', 'success');

        document.getElementById('auth-overlay').classList.remove('active');

        document.body.classList.remove('not-logged-in');

    } catch (err) {

        toast('Erro ao entrar com Google: ' + err.message, 'error');

    } finally {

        if (btnGoogle) btnGoogle.disabled = false;

    }

};



window.handleSignOut = async function() {

    try {

        await firebase.auth().signOut();

        toast('Logoff efetuado!', 'success');

        location.reload();

    } catch (e) {

        toast('Erro ao sair: ' + e.message, 'error');

    }

};



// Monitora o estado de autenticação do Firebase Auth

document.addEventListener('DOMContentLoaded', () => {

    if (typeof firebase !== 'undefined' && firebase.auth) {

        firebase.auth().onAuthStateChanged(async (user) => {

            if (user) {

                // Logado

                document.getElementById('auth-overlay').classList.remove('active');

                document.body.classList.remove('not-logged-in');

                

                // Mostrar informações do perfil

                const profileBar = document.getElementById('user-profile-bar');

                const emailDisplay = document.getElementById('user-email-display');

                if (profileBar) profileBar.style.display = 'block';

                if (emailDisplay) emailDisplay.textContent = user.email;



                // Obter claims personalizadas (para saber se é admin)

                try {

                    const idTokenResult = await user.getIdTokenResult();

                    const isAdmin = idTokenResult.claims.admin === true;

                    if (isAdmin) {

                        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');

                    } else {

                        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

                    }

                } catch (e) {

                    console.error("Erro ao ler Claims:", e);

                }



                // Carregar dados principais

                loadAll();

            } else {

                // Deslogado

                document.getElementById('auth-overlay').classList.add('active');

                document.body.classList.add('not-logged-in');

                

                const profileBar = document.getElementById('user-profile-bar');

                if (profileBar) profileBar.style.display = 'none';

                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

            }

        });

    }

});



// Lógica do Painel de Administração (Lista usuários e altera permissões)

window.loadAdminUsers = async function() {

    const tbody = document.getElementById('tbody-admin-users');

    if (!tbody) return;

    

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando usuários...</td></tr>';

    

    try {

        const users = await api('GET', '/admin/users');

        if (!users || !users.length) {

            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum usuário retornado.</td></tr>';

            return;

        }

        

        tbody.innerHTML = users.map(u => `

            <tr>

                <td>

                    <strong>${u.display_name}</strong><br>

                    <small style="color: var(--text-dim);">${u.email}</small>

                </td>

                <td><code style="font-size:0.75rem; background:rgba(0,0,0,0.2); padding: 2px 6px; border-radius:4px;">${u.uid}</code></td>

                <td>

                    <span class="badge ${u.role === 'admin' ? 'badge-red' : (u.role === 'editor' ? 'badge-blue' : 'badge-teal')}">${u.role.toUpperCase()}</span>

                </td>

                <td>

                    <select class="form-control" style="width: auto; display: inline-block; padding: 4px 8px; font-size: 0.8rem; height: 30px;" onchange="changeUserRole('${u.uid}', this.value)">

                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User (Visualizador)</option>

                        <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>

                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>

                    </select>

                </td>

            </tr>

        `).join('');

    } catch (e) {

        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--red);">Erro: ${e.message}</td></tr>`;

        toast('Erro ao obter usuários: ' + e.message, 'error');

    }

};



window.changeUserRole = async function(uid, newRole) {

    if (!confirm(`Deseja alterar a função deste usuário para ${newRole.toUpperCase()}?`)) {

        loadAdminUsers();

        return;

    }

    

    try {

        await api('POST', `/admin/users/${uid}/role`, { role: newRole });

        toast('Função de usuário atualizada!', 'success');

        loadAdminUsers();

    } catch (e) {

        toast('Erro ao alterar função: ' + e.message, 'error');

        loadAdminUsers();

    }

};



// Vincula clique na aba de administração para carregar usuários automaticamente

document.getElementById('nav-admin')?.addEventListener('click', () => {

    loadAdminUsers();

});



// ─── LÓGICA DA TELA DE AMOSTRAS ──────────────────────────────────────────────

let amostraArteImage = null;

let amostraArteWidth = 0;

let amostraArteHeight = 0;



// Helper para obter dimensões do formato ativo em Amostras

function getAmostraFormato() {

    const corId = document.getElementById('amostra-cor').value;

    const numId = document.getElementById('amostra-numeracao').value;

    

    if (numId) {

        const num = state.numeracoes.find(n => n.id === numId);

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

    // Para manter a paridade 1:1 física absoluta de escala entre todas as 3 janelas fonte e a combinada,

    // a escala (pixels por milímetro) deve ser uma constante global calculada com base no formato unificado.

    const activeFmt = getAmostraFormato();

    if (!activeFmt) return 3.5;

    

    // Usamos o container da Amostra Combinada ou o container ativo para definir a escala padrão

    const refCanvas = document.getElementById('amostra-comb-canvas') || canvasElement;

    if (!refCanvas) return 3.5;

    

    const parent = refCanvas.parentElement;
    if (!parent) return 3.5;

    const containerW = parent.clientWidth - 30; // compensar padding
    if (containerW <= 0) {
        // Fallback seguro se o container estiver oculto
        return 3.5;
    }

    return containerW / activeFmt.width_mm;

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
            : state.numeracoes;

        numSelect.innerHTML = '<option value="">— Selecione uma Numeração —</option>' +

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        

        if (filteredNums.some(n => n.id === curNumVal)) {

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



    const num = state.numeracoes.find(n => n.id === numId);

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



            if (el.type === 'TEXT' || el.type === 'FIXED') {

                const fs = (el.font_size || 12) * S / 2.8346;

                const fontStyle = getFontCSS(el.font_name);

                ctx.font = `${fs}px ${fontStyle}`;

                ctx.fillStyle = color;

                

                let label = '';

                if (el.type === 'FIXED') {

                    label = el.fixed_value || 'TEXTO';

                } else {

                    const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;

                    label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;

                }

                ctx.fillText(label, 0, fs);

            } else if (el.type === 'QR') {

                const sz = (el.size_mm || 15) * S;

                ctx.fillStyle = color;

                ctx.fillRect(0, 0, sz, sz);

                ctx.fillStyle = '#ffffff';

                const cell = sz / 7;

                for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {

                    ctx.fillStyle = '#ffffff';

                    ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);

                    ctx.fillStyle = color;

                    ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);

                }

            } else if (el.type === 'BARCODE') {

                const bw = (el.width_mm || 40) * S;

                const bh = (el.height_mm || 10) * S;

                ctx.fillStyle = color;

                const barW = bw / 40;

                const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];

                for (let i = 0; i < pattern.length; i++) {

                    if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);

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

                ctx.strokeStyle = color;

                ctx.lineWidth = 1;

                ctx.strokeRect(0, 0, sz_w, sz_h);

                ctx.font = `${Math.max(6, sz_h * 0.15)}px Inter, sans-serif`;

                ctx.fillStyle = color;

                ctx.textAlign = 'center';

                ctx.fillText('SVG', sz_w / 2, sz_h / 2 + (sz_h * 0.05));

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



    const ctx = canvasComb.getContext('2d');

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

        const tempArteCtx = tempArteCanvas.getContext('2d');

        

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

        const tempNumCtx = tempNumCanvas.getContext('2d');

        

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



// ─── MODELOS DE IMPOSIÇÃO E OS ────────────────────────────────────────────────

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

        rotate_page: document.getElementById('imp-rotate-page')?.value === 'true',

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


// ═══════════════════════════════════════════════════════════════════════════════
// ORDENS DE SERVIÇO — Integração com banco de dados compartilhado
// ═══════════════════════════════════════════════════════════════════════════════

// Estado local de OS
if (!state.ordens) state.ordens = [];
if (!state.osItens) state.osItens = {};
if (!state.osExpandedId) state.osExpandedId = null;
if (!state.activeOSItem) state.activeOSItem = null;

/**
 * Carrega todas as OS — Prioridade: Vibecode → Supabase Imposition → API local
 * No Vibecode, cada `id_int` (proposta) = 1 OS. Os produtos_proposta são os itens.
 */
async function loadOrdens() {
    try {
        // Fonte 1: Vibecode (ERP do parceiro)
        if (typeof vibeClient !== 'undefined' && vibeClient) {
            console.log('[OS] Carregando do Vibecode...');
            const loaded = await loadOrdensFromVibecode();
            if (loaded) {
                renderOrdens();
                return;
            }
            console.log('[OS] Vibecode sem dados, tentando fallback...');
        }

        // Fonte 2: Supabase do Imposition (Banco único do Vibecode)
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('producao_ordens_servico')
                .select('*, producao_os_itens(id)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            state.ordens = (data || []).map(os => {
                const vibeStatusOverrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                const savedStatus = vibeStatusOverrides[os.id];
                let dbStatus = os.status;
                if (dbStatus === 'PRODUÇÃO') dbStatus = 'EM IMPRESSÃO';
                else if (dbStatus === 'ARTE' || dbStatus === 'NOVO') dbStatus = 'ARTE_EM_ANDAMENTO';
                return {
                    ...os,
                    status: savedStatus || dbStatus,
                    cliente: os.cliente || getFallbackCliente(os.numero || 0),
                    vendedor: os.vendedor || getFallbackVendedor(os.numero || 0),
                    data_liberacao: os.data_liberacao || os.created_at,
                    prazo_entrega: os.prazo_entrega || getFallbackPrazo(os.created_at, os.numero || 0),
                    _itens_count: os.producao_os_itens ? os.producao_os_itens.length : 0
                };
            });
        } else {
            // Fonte 3: API local (FastAPI)
            const res = await fetch(`${API_BASE_URL}/api/ordens`);
            if (res.ok) {
                state.ordens = await res.json();
            } else {
                state.ordens = [];
            }
        }
        renderOrdens();
    } catch (e) {
        console.error('Erro ao carregar OS:', e);
        toast('Erro ao carregar Ordens de Serviço: ' + e.message, 'error');
    }
}

/**
 * Carrega OS do Vibecode agrupando produtos_proposta por id_int
 * Cada id_int = 1 proposta = 1 OS virtual
 * Retorna true se conseguiu carregar, false se não há dados
 */
async function loadOrdensFromVibecode() {
    try {
        // Buscar todos os produtos_proposta
        const { data: produtos, error } = await vibeClient
            .from('produtos_proposta')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Vibecode] Erro ao ler produtos_proposta:', error);
            return false;
        }

        if (!produtos || produtos.length === 0) return false;

        // Buscar propostas (tabela pai) se existir e for acessível
        let propostas = [];
        try {
            const { data: propData, error: propError } = await vibeClient
                .from('propostas')
                .select('*');
            if (!propError && propData) {
                propostas = propData;
            }
        } catch (pe) {
            console.warn('[Vibecode] Não foi possível ler tabela propostas (usando fallbacks):', pe);
        }

        // Agrupar por id_int (cada id_int = 1 proposta = 1 OS)
        const grouped = {};
        produtos.forEach(p => {
            const key = p.id_int;
            if (!grouped[key]) {
                const vibeStatusOverrides = JSON.parse(localStorage.getItem('vibe_status_overrides') || '{}');
                const osId = `vibe_${key}`;
                const savedStatus = vibeStatusOverrides[osId];

                // Buscar dados reais da proposta
                const propReal = propostas.find(pr => pr.id_int === key || pr.id === key || pr.numero === key);

                // Mapear campos com fallbacks determinísticos
                const cliente = propReal?.cliente || propReal?.cliente_nome || propReal?.dados_cliente || getFallbackCliente(key);
                const vendedor = propReal?.vendedor || propReal?.vendedor_nome || getFallbackVendedor(key);
                const dataLiberacao = propReal?.data_liberacao || propReal?.data_libera || p.created_at;
                const prazoEntrega = propReal?.prazo_entrega || propReal?.prazo || getFallbackPrazo(p.created_at, key);

                grouped[key] = {
                    id: osId,
                    numero: key,
                    status: savedStatus || (key % 2 === 0 ? 'EM IMPRESSÃO' : 'ARTE_EM_ANDAMENTO'),
                    cliente: cliente,
                    vendedor: vendedor,
                    data_liberacao: dataLiberacao,
                    prazo_entrega: prazoEntrega,
                    observacoes: `Proposta #${key} — Vibecode`,
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
    let setor = 'IMPRESS.';
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
        cor: 'STD',
        cor_id: null,
        blocos: 'N',
        verso: false,
        numeracao: 'SEQUENCIAL',
        numeracao_id: null,
        aprovacao: 'APROVADA',
        impressao: 'AGUARD.',
        observacoes: p.modelo_descri || p.nome_produto || '',
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
        
        // --- Campos de Amostra (salvos no BD) ---
        amostra_cor_id: p.amostra_cor_id || null,
        amostra_num_id: p.amostra_num_id || null,
        amostra_arte_base64: p.amostra_arte_base64 || null,
        amostra_status: p.amostra_status || 'PENDENTE',
        amostra_obs: p.amostra_obs || '',

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
        // Se já pré-carregados (Vibecode ou cache), usar direto
        if (state.osItens[osId] && state.osItens[osId].length > 0) {
            renderOSItens(osId);
            return;
        }

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('producao_os_itens')
                .select('*')
                .eq('os_id', osId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            state.osItens[osId] = data || [];
        } else {
            const res = await fetch(`${API_BASE_URL}/api/ordens/${osId}/itens`);
            if (res.ok) {
                state.osItens[osId] = await res.json();
            } else {
                state.osItens[osId] = [];
            }
        }
        renderOSItens(osId);
    } catch (e) {
        console.error('Erro ao carregar itens da OS:', e);
        toast('Erro ao carregar itens: ' + e.message, 'error');
    }
}

/**
 * Formata data para exibição
 */
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna badge HTML para status
 */
function getStatusBadge(status) {
    const map = {
        'ARTE': { icon: '🎨', cls: 'badge-blue' },
        'PRODUÇÃO': { icon: '🏭', cls: 'badge-amber' },
        'FINALIZADA': { icon: '✅', cls: 'badge-teal' },
        'CANCELADA': { icon: '❌', cls: 'badge-red' }
    };
    const s = map[status] || { icon: '❓', cls: '' };
    return `<span class="badge ${s.cls}">${s.icon} ${status}</span>`;
}

/**
 * Retorna badge HTML para aprovação
 */
function getAprovacaoBadge(aprov) {
    const map = {
        'EM ARTE': { cls: 'badge-amber', icon: '🎨' },
        'APROVADA': { cls: 'badge-teal', icon: '✅' },
        'PRONTA': { cls: 'badge-blue', icon: '📋' },
        'REPROVADA': { cls: 'badge-red', icon: '❌' }
    };
    const s = map[aprov] || { cls: '', icon: '' };
    return `<span class="badge ${s.cls}">${s.icon} ${aprov || '—'}</span>`;
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
    return `<span class="badge ${s.cls}">${s.icon} ${imp || '—'}</span>`;
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
 * Obtém o designer atribuído a uma OS (salvo em localStorage)
 */
function getOSDesigner(osId) {
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    return overrides[osId] || '';
}

/**
 * Define o designer responsável por uma OS (salva em localStorage)
 */
function setOSDesigner(osId, designerName) {
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    if (designerName) {
        overrides[osId] = designerName;
    } else {
        delete overrides[osId];
    }
    localStorage.setItem('vibe_designer_overrides', JSON.stringify(overrides));
    renderOrdens();
}

// Expor globalmente
window.setOSDesigner = setOSDesigner;

/**
 * Popula o dropdown de filtro de designers com os nomes disponíveis
 */
function populateDesignerFilter() {
    const filterSelect = document.getElementById('os-filter-designer');
    if (!filterSelect) return;

    const currentValue = filterSelect.value;
    
    // Coletar designers atribuídos + lista fixa
    const allDesigners = new Set(DESIGNERS_LISTA);
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    Object.values(overrides).forEach(d => { if (d) allDesigners.add(d); });

    filterSelect.innerHTML = '<option value="">🎨 Todos os Designers</option>';
    [...allDesigners].sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        filterSelect.appendChild(opt);
    });

    filterSelect.value = currentValue;
}

/**
 * Gera o HTML do select inline de designer para uma OS na tabela
 */
function renderDesignerSelect(osId) {
    const currentDesigner = getOSDesigner(osId);
    const allDesigners = new Set(DESIGNERS_LISTA);
    const overrides = JSON.parse(localStorage.getItem('vibe_designer_overrides') || '{}');
    Object.values(overrides).forEach(d => { if (d) allDesigners.add(d); });

    let options = '<option value="">— Atribuir —</option>';
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
 * Renderiza as tabelas de OS (Fila de Impressão e Fila de Arte) na view
 */
function renderOrdens() {
    const tbodyImpressao = document.getElementById('tbody-impressao');
    const tbodyArte = document.getElementById('tbody-arte');
    if (!tbodyImpressao && !tbodyArte) return;

    // Filtros de busca
    const searchImpressao = (document.getElementById('os-search-impressao')?.value || '').trim().toLowerCase();
    const searchArte = (document.getElementById('os-search-arte')?.value || '').trim().toLowerCase();
    const filterDesigner = (document.getElementById('os-filter-designer')?.value || '');

    // Fila 1: Impressão (Status EM IMPRESSÃO)
    let ordensImpressao = state.ordens.filter(os => os.status === 'EM IMPRESSÃO');
    let filteredImpressao = ordensImpressao.filter(os => {
        if (searchImpressao) {
            const num = String(os.numero || '');
            const cli = (os.cliente || '').toLowerCase();
            const vend = (os.vendedor || '').toLowerCase();
            return num.includes(searchImpressao) || cli.includes(searchImpressao) || vend.includes(searchImpressao);
        }
        return true;
    });

    // Fila 2: Arte (Status ARTE_EM_ANDAMENTO)
    let ordensArte = state.ordens.filter(os => os.status === 'ARTE_EM_ANDAMENTO');
    let filteredArte = ordensArte.filter(os => {
        let matchSearch = true;
        if (searchArte) {
            const num = String(os.numero || '');
            const cli = (os.cliente || '').toLowerCase();
            const vend = (os.vendedor || '').toLowerCase();
            const des = getOSDesigner(os.id).toLowerCase();
            matchSearch = num.includes(searchArte) || cli.includes(searchArte) || vend.includes(searchArte) || des.includes(searchArte);
        }
        let matchDesigner = true;
        if (filterDesigner) {
            matchDesigner = getOSDesigner(os.id) === filterDesigner;
        }
        return matchSearch && matchDesigner;
    });

    // Atualizar badges da navegação lateral
    const badgeImpressao = document.getElementById('badge-impressao');
    if (badgeImpressao) badgeImpressao.textContent = ordensImpressao.length;

    const badgeArte = document.getElementById('badge-arte');
    if (badgeArte) badgeArte.textContent = ordensArte.length;

    // Atualizar badges das tabelas
    const countImpressao = document.getElementById('os-impressao-count-badge');
    if (countImpressao) countImpressao.textContent = `${filteredImpressao.length} ${filteredImpressao.length === 1 ? 'Pedido' : 'Pedidos'}`;

    const countArte = document.getElementById('os-arte-count-badge');
    if (countArte) countArte.textContent = `${filteredArte.length} ${filteredArte.length === 1 ? 'Pedido' : 'Pedidos'}`;

    // Popular filtro de designers
    populateDesignerFilter();

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
                const itensCount = os._itens_count || 0;
                const prazoInfo = formatPrazoDestaque(os.prazo_entrega);
                return `
                    <tr class="os-row ${isExpanded ? 'os-row-expanded' : ''}" onclick="toggleOSDetail('${os.id}')" style="cursor: pointer;">
                        <td style="text-align: center; font-size: 1.1rem;">${isExpanded ? '▼' : '▶'}</td>
                        <td><strong style="font-size: 1.05rem; color: var(--blue);">#${os.numero}</strong></td>
                        <td><strong>${os.cliente || '—'}</strong></td>
                        <td>${os.vendedor || '—'}</td>
                        <td style="font-size: 0.82rem; color: var(--text-dim);">${formatDateTime(os.data_liberacao)}</td>
                        <td style="font-size: 0.82rem; ${prazoInfo.style}">${prazoInfo.text}</td>
                        <td>${getStatusBadge(os.status)}</td>
                        <td><span class="badge">${itensCount} ${itensCount === 1 ? 'item' : 'itens'}</span></td>
                        <td>
                            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); changeOSStatus('${os.id}', 'ARTE_EM_ANDAMENTO')" title="Mover para a Lista de Arte" style="padding: 4px 8px; font-size: 0.75rem;">🎨 Mover p/ Arte</button>
                        </td>
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

            tbodyArte.innerHTML = filteredArte.map(os => {
                const itensCount = os._itens_count || 0;
                const prazoInfo = formatPrazoDestaque(os.prazo_entrega);
                return `
                    <tr class="os-row" onclick="navigateToAmostrasFromOS('${os.id}')" style="cursor: pointer;" title="Abrir Amostras">
                        <td style="text-align: center; font-size: 1.1rem;">▶</td>
                        <td><strong style="font-size: 1.05rem; color: var(--blue); text-decoration: underline; text-decoration-style: dotted;">#${os.numero}</strong></td>
                        <td><strong>${os.cliente || '—'}</strong></td>
                        <td>${os.vendedor || '—'}</td>
                        <td onclick="event.stopPropagation();">${renderDesignerSelect(os.id)}</td>
                        <td style="font-size: 0.82rem; color: var(--text-dim);">${formatDateTime(os.data_liberacao)}</td>
                        <td style="font-size: 0.82rem; ${prazoInfo.style}">${prazoInfo.text}</td>
                        <td>${getStatusBadge(os.status)}</td>
                        <td><span class="badge">${itensCount} ${itensCount === 1 ? 'item' : 'itens'}</span></td>
                        <td>
                            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); gerarLinkCliente('${os.id}', '${os.numero}')" title="Gerar link público para aprovação do cliente" style="padding: 4px 8px; font-size: 0.75rem;">🔗 Link do Cliente</button>
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

    const isImpressao = os.status === 'EM IMPRESSÃO';
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

    const isImpressao = os.status === 'EM IMPRESSÃO';
    const tbody = document.getElementById(isImpressao ? 'tbody-os-itens-impressao' : 'tbody-os-itens-arte');
    if (!tbody) return;

    const itens = state.osItens[osId] || [];

    if (!itens.length) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:var(--text-dim); padding:20px;">Nenhum item encontrado nesta OS.</td></tr>`;
        return;
    }

    tbody.innerHTML = itens.map(item => `
        <tr>
            <td>${item.setor || '—'}</td>
            <td><strong>${item.produto || '—'}</strong></td>
            <td style="font-family: monospace; font-size: 0.85rem;">${item.modelo || '—'}</td>
            <td><span class="badge">${item.formato || '—'}</span></td>
            <td style="text-align: center;"><strong>${item.quantidade || 0}</strong><br><span style="font-size:0.72rem;color:var(--text-dim);">${item.num_inicial}→${item.num_final}</span></td>
            <td>${item.numeracao || '—'}</td>
            <td>${item.cor || 'STD'}</td>
            <td style="text-align: center;">${item.verso ? '✅' : '—'}</td>
            <td style="text-align: center;">${item.blocos || 'N'}</td>
            <td>${getAprovacaoBadge(item.aprovacao)}</td>
            <td>
                <select class="form-control" style="font-size: 0.78rem; padding: 3px 6px; width: 110px;" onchange="updateItemImpressao('${item.id}', '${osId}', this.value)" ${item.aprovacao !== 'APROVADA' && item.aprovacao !== 'PRONTA' ? 'disabled title="Aguardando aprovação"' : ''}>
                    <option value="AGUARD." ${item.impressao === 'AGUARD.' ? 'selected' : ''}>⏳ Aguard.</option>
                    <option value="PARCIAL" ${item.impressao === 'PARCIAL' ? 'selected' : ''}>🔄 Parcial</option>
                    <option value="IMPRESSO" ${item.impressao === 'IMPRESSO' ? 'selected' : ''}>✅ Impresso</option>
                    <option value="ERRO" ${item.impressao === 'ERRO' ? 'selected' : ''}>❌ Erro</option>
                </select>
            </td>
            <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${!isImpressao ? `
                <button class="btn btn-sm btn-secondary" onclick="openArtesModal('${item.id}', '${osId}')" title="Gerenciar Artes do Modelo">
                    🎨 Artes
                </button>
                ` : ''}
                <button class="btn btn-sm btn-primary" onclick="enviarParaImposicao('${item.id}', '${osId}')" title="Enviar para Imposição" ${item.aprovacao !== 'APROVADA' && item.aprovacao !== 'PRONTA' ? 'disabled' : ''}>
                    🖨️ Impor
                </button>
            </td>
        </tr>
    `).join('');
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
    if (!prazoStr) return { text: '—', style: '' };
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
    if (!dateStr) return '—';
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
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient
                .from('producao_os_itens')
                .update({ impressao: novoStatus })
                .eq('id', itemId);
            if (error) throw error;
        } else {
            const res = await fetch(`${API_BASE_URL}/api/os_itens/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ impressao: novoStatus })
            });
            if (!res.ok) throw new Error('Falha ao atualizar');
        }

        // Atualizar estado local
        if (state.osItens[osId]) {
            const item = state.osItens[osId].find(i => i.id === itemId);
            if (item) item.impressao = novoStatus;
        }

        toast(`Impressão atualizada: ${novoStatus}`, 'success');
    } catch (e) {
        console.error('Erro ao atualizar impressão:', e);
        toast('Erro ao atualizar impressão: ' + e.message, 'error');
        // Recarregar para reverter
        await loadOSItens(osId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCHING INTELIGENTE — OS → Catálogo do Imposition
// ═══════════════════════════════════════════════════════════════════════════════

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
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient
                .from('producao_os_itens')
                .update({ [field]: value })
                .eq('id', itemId);
            if (error) console.error(`[OS] Erro ao auto-salvar ${field}:`, error);
        } else {
            await fetch(`${API_BASE_URL}/api/os_itens/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
        }
        if (state.osItens[osId]) {
            const item = state.osItens[osId].find(i => i.id === itemId);
            if (item) item[field] = value;
        }
    } catch (e) {
        console.error(`[OS] Erro ao auto-salvar ${field}:`, e);
    }
}

/**
 * Envia um item da OS para a tela de Imposição, preenchendo os campos automaticamente
 * com matching inteligente de formato, cor e numeração
 */
async function enviarParaImposicao(itemId, osId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => i.id === itemId);
    if (!item) return toast('Item não encontrado.', 'error');

    // Guardar referência ao item ativo para atualização automática pós-imposição
    state.activeOSItem = { itemId, osId };

    // Navegar para a view de Imposição
    const navBtn = document.querySelector('[data-view="view-imposicao"]');
    if (navBtn) navBtn.click();

    // --- MATCHING AUTOMÁTICO DE FORMATO ---
    let formatoId = item.formato_id;
    if (!formatoId && item.formato) {
        formatoId = matchFormato(item.formato);
        if (formatoId) {
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched: "${item.formato}" → ${formatoId}`);
        }
    }
    if (formatoId) {
        const fmtSelect = document.getElementById('imp-formato');
        if (fmtSelect) {
            fmtSelect.value = formatoId;
            fmtSelect.dispatchEvent(new Event('change'));
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

    // --- PREENCHER MODO DE IMPRESSÃO ---
    setTimeout(() => {
        if (item.verso) {
            const printMode = document.getElementById('imp-print-mode');
            if (printMode) {
                printMode.value = 'duplex';
                printMode.dispatchEvent(new Event('change'));
            }
        }
        if (item.blocos && item.blocos !== 'N') {
            const schemaSelect = document.getElementById('imp-schema');
            if (schemaSelect) {
                schemaSelect.value = 'cut_stack';
                schemaSelect.dispatchEvent(new Event('change'));
            }
        }
        updateImpSummary();
    }, 500);

    // --- ATUALIZAR PAINEL DE ITENS OS ---
    setTimeout(() => { renderImpOSQueue(); }, 600);

    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? os.numero : '';
    toast(`Item "${item.produto} — ${item.formato}" da OS #${osNum} carregado na Imposição!`, 'info');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAINEL DE ITENS OS PENDENTES — na view de Imposição
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renderiza a fila de itens pendentes da OS na view de Imposição
 */
function renderImpOSQueue() {
    const container = document.getElementById('imp-os-queue');
    const tbody = document.getElementById('tbody-imp-os-queue');
    const pendingBadge = document.getElementById('imp-os-queue-pending');
    const numeroBadge = document.getElementById('imp-os-queue-numero');
    if (!container || !tbody) return;

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
    const os = state.ordens.find(o => o.id === osId);
    if (numeroBadge) numeroBadge.textContent = os ? `#${os.numero}` : '';

    const pendentes = itens.filter(i => i.impressao !== 'IMPRESSO' && (i.aprovacao === 'APROVADA' || i.aprovacao === 'PRONTA'));
    if (pendingBadge) pendingBadge.textContent = `${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''}`;
    tbody.innerHTML = itens.map(item => {
        const isActive = activeItem.itemId === item.id;
        const isPending = item.impressao !== 'IMPRESSO';
        const isApproved = item.aprovacao === 'APROVADA' || item.aprovacao === 'PRONTA';
        const rowBg = isActive ? 'background: rgba(59,130,246,0.12);' : '';
        return `
            <tr style="${rowBg}">
                <td style="padding: 5px 8px;">
                    ${isActive ? '<strong style="color: var(--blue);">▶</strong> ' : ''}
                    <strong>${item.produto || '—'}</strong>
                </td>
                <td style="padding: 5px 8px;"><span class="badge">${item.formato || '—'}</span></td>
                <td style="padding: 5px 8px; text-align: center;">${item.quantidade || 0}</td>
                <td style="padding: 5px 8px;">${getImpressaoBadge(item.impressao)}</td>
                <td style="padding: 5px 8px; text-align: center;">
                    ${isActive
                        ? '<span style="font-size: 0.72rem; color: var(--blue); font-weight: 600;">ATIVO</span>'
                        : (isApproved && isPending
                            ? '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); enviarParaImposicao(\'' + item.id + '\', \'' + osId + '\')" style="padding: 2px 8px; font-size: 0.72rem;">▶ Carregar</button>'
                            : '<span style="font-size: 0.72rem; color: var(--text-dim);">—</span>')}
                </td>
            </tr>
        `;
    }).join('');
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

// Função global de navegação entre views
window.showView = function(viewId) {
    // Trocar a view ativa
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    // Ativar a view destino
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    // Ativar o nav-btn correspondente
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Hooks: carregar dados ao abrir certas views
    if (viewId === 'view-lista-impressao' || viewId === 'view-lista-arte') {
        loadOrdens();
    }
    if (viewId === 'view-imposicao') {
        renderImpOSQueue();
    }
};

/**
 * Navega da Lista de Arte para a página de Amostras carregando os itens do pedido
 */
async function navigateToAmostrasFromOS(osId) {
    const os = state.ordens.find(o => o.id === osId);
    if (!os) {
        toast('Pedido não encontrado.', 'error');
        return;
    }

    // Garantir que os itens estejam carregados
    if (!state.osItens[osId] || state.osItens[osId].length === 0) {
        await loadOSItens(osId);
    }

    // Garantir que cores e numerações estejam carregados (necessários para os selects)
    if (!state.cores || state.cores.length === 0 || !state.numeracoes || state.numeracoes.length === 0) {
        try {
            await loadAll();
        } catch (e) {
            console.warn('Erro ao carregar dados de cadastro:', e);
        }
    }

    // Salvar o ID do pedido ativo na tela de Amostras
    state.amostrasOSAtivo = osId;

    // Navegar para a view de Amostras (showView cuida de ativar nav + view)
    window.showView('view-amostras');

    // Renderizar os cards de itens
    renderAmostrasOSItens(osId);
}

/**
 * Renderiza os cards de itens do pedido na página de Amostras
 * Cada item gera um card com: Produto, Setor, Quantidade, NI→NF, Verso, Cor, Numeração + Decisão
 */
function renderAmostrasOSItens(osId) {
    const os = state.ordens.find(o => o.id === osId);
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);
    const banner = document.getElementById(containerId === 'amostras-itens-container' ? 'amostras-os-banner' : 'cliente-os-banner');
    const avulsa = document.getElementById('amostra-combinada-avulsa');

    if (!os || !container) return;

    const itens = state.osItens[osId] || [];

    // Mostrar banner, esconder card avulso se for painel interno
    if (banner) {
        banner.style.display = 'block';
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

    container.innerHTML = itens.map((item, idx) => {
        const status = item.amostra_status || 'PENDENTE';
        const obs = item.amostra_obs || '';
        
        let statusBadge = '<span class="badge badge-yellow">⏳ PENDENTE</span>';
        if (status === 'APROVADA') statusBadge = '<span class="badge badge-green">✅ APROVADA</span>';
        else if (status === 'REPROVADA') statusBadge = '<span class="badge badge-red">❌ ALTERAÇÃO</span>';

        // Determinar o formato ID do item da OS
        const itemFormatoId = item.formato_id || (item.formato ? matchFormato(item.formato) : null);

        // Filtrar cores com base no formato do produto
        const filteredCores = itemFormatoId
            ? (state.cores || []).filter(c => String(c.formato_id) === String(itemFormatoId))
            : (state.cores || []);

        const corsOpts = filteredCores.map(c =>
            `<option value="${c.id}" ${c.id === item.amostra_cor_id ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        // Filtrar numerações com base no formato do produto
        const filteredNumeracoes = (state.numeracoes || []).filter(n => {
            // Se for customizada, só exibe se for vinculada a este item específico
            if (n.is_custom && n.id !== item.amostra_num_id && n.os_item_id !== item.id) return false;
            
            // Se tivermos um formato identificado para o produto, verifica compatibilidade
            if (itemFormatoId) {
                const ids = n.formato_ids || (n.formato_id ? [n.formato_id] : []);
                return ids.some(id => String(id) === String(itemFormatoId));
            }
            return true;
        });

        const numOpts = filteredNumeracoes.map(n =>
            `<option value="${n.id}" ${n.id === item.amostra_num_id ? 'selected' : ''}>${n.name}</option>`
        ).join('');

        return `
        <div class="card" style="border: 2px solid var(--blue); margin-bottom: 0;">
            <div class="card-header" style="background: rgba(59, 130, 246, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span class="card-title">🧪 <strong>Modelo ${idx + 1}: ${item.produto || '—'}</strong> — ${item.formato || ''}</span>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <span class="badge" style="font-size: 0.72rem;">📦 Qtd: ${item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem; font-family: monospace;">NI: ${item.num_inicial || 1} → NF: ${item.num_final || item.quantidade || 0}</span>
                    <span class="badge" style="font-size: 0.72rem;">${item.verso ? '✅ Verso' : '— S/ Verso'}</span>
                    <span class="badge" style="font-size: 0.72rem;">🏭 ${item.setor || '—'}</span>
                    ${statusBadge}
                </div>
            </div>
            <div style="padding: 24px;">
                <div class="amostra-mid-row" style="${state.amostrasContainerId === 'cliente-amostras-itens-container' ? 'grid-template-columns: 1fr;' : ''}">
                    <div class="amostra-decisao-panel">
                        <div class="amostra-decisao-title">⚖️ Decisão de Qualidade</div>
                        <div class="amostra-decisao-status-box">
                            <span style="font-size: 0.82rem; color: var(--text-dim);">Status Atual:</span>
                            ${statusBadge}
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label for="amostra-obs-${item.id}" style="font-size: 0.82rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em;">Anotações / Observações de Alteração</label>
                            <textarea id="amostra-obs-${item.id}" class="form-control" rows="3" placeholder="Insira aqui os detalhes das alterações solicitadas..." style="resize: none; background: rgba(0, 0, 0, 0.2); font-size: 0.85rem; padding: 10px;"
                                onchange="saveAmostraItemObs('${item.id}', '${osId}', this.value)">${obs}</textarea>
                        </div>
                        <div class="amostra-decisao-btns">
                            <button class="btn btn-success" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="decisionAmostraItem('${item.id}', '${osId}', 'APROVADA')">
                                ✅ APROVAR
                            </button>
                            <button class="btn btn-danger" style="flex: 1; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="decisionAmostraItem('${item.id}', '${osId}', 'REPROVADA')">
                                ❌ ALTERAR
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
                                    <option value="">— Selecione uma Cor —</option>
                                    ${corsOpts}
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <label style="text-transform: uppercase; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.04em; margin: 0;">Numeração Cadastrada</label>
                                    ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? '' : `<button class="btn btn-sm btn-ghost" style="padding: 0 4px; font-size: 0.9rem;" onclick="editCustomNumeracao(${idx}, '${osId}', '${item.id}')" title="Editar Numeração exclusivamente para este Modelo">✏️</button>`}
                                </div>
                                <select class="form-control" id="amostra-item-num-${idx}" onchange="onItemNumSelect(${idx}, '${osId}', '${item.id}')">
                                    <option value="">— Selecione uma Numeração —</option>
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
                                </div>
                            </div>
                        </div>
                    </div>
                    `}
                </div>
                <div class="amostra-preview-container" style="margin-top: 20px;">
                    <canvas id="amostra-item-canvas-${idx}" style="max-width: 100%; height: auto; display: none; box-shadow: var(--shadow); border: 1px solid var(--border); background: #ffffff; ${state.amostrasContainerId === 'cliente-amostras-itens-container' ? 'cursor: zoom-in;' : ''}"
                        onclick="${state.amostrasContainerId === 'cliente-amostras-itens-container' ? `openClienteLightbox('amostra-item-canvas-${idx}')` : ''}"></canvas>
                    <div id="amostra-item-empty-${idx}" style="text-align: center; color: var(--text-dim); padding: 20px;">
                        <div style="font-size: 3.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div>
                        <p style="font-size: 0.95rem; font-weight: 600;">Selecione Cor/Numeração e carregue uma Arte</p>
                        <p style="font-size: 0.82rem; opacity: 0.7; margin-top: 4px;">A visualização combinada aparecerá em tempo real neste espaço.</p>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    setTimeout(() => {
        itens.forEach((item, idx) => {
            if (item.amostra_cor_id || item.amostra_num_id || item.amostra_arte_base64) {
                renderItemAmostraCombinada(idx, osId);
            }
        });
    }, 50);
}


/**
 * Ao selecionar cor em um card dinâmico, filtrar numerações compatíveis
 * (idêntico ao onAmostraCorSelect do card avulso)
 */
function onItemCorSelect(idx, osId, itemId, isInitialLoad = false) {
    const corSelect = document.getElementById(`amostra-item-cor-${idx}`);
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    if (!corSelect || !numSelect) return;

    const corId = corSelect.value;
    const cor = corId ? state.cores.find(c => c.id === corId) : null;

    // Se no for carga inicial, salva no banco
    if (!isInitialLoad) {
        saveAmostraToDB(itemId, osId, { amostra_cor_id: corId || null });
    }

    // Filtrar numerações pelo formato do produto
    const curNumVal = numSelect.value;
    const item = state.osItens[osId].find(i => i.id === itemId);
    const itemFormatoId = item ? (item.formato_id || (item.formato ? matchFormato(item.formato) : null)) : null;

    const filteredNums = (state.numeracoes || []).filter(n => {
        // Se for customizada, só exibe se for vinculada a este item específico
        if (n.is_custom && (!item || (n.id !== item.amostra_num_id && n.os_item_id !== item.id))) return false;
        
        // Se tivermos um formato identificado para o produto, verifica compatibilidade
        if (itemFormatoId) {
            const ids = n.formato_ids || (n.formato_id ? [n.formato_id] : []);
            return ids.some(id => String(id) === String(itemFormatoId));
        }
        return true;
    });

    numSelect.innerHTML = '<option value="">— Selecione uma Numeração —</option>' +
        filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

    if (filteredNums.some(n => n.id === curNumVal)) {
        numSelect.value = curNumVal;
    }

    if (!isInitialLoad) {
        renderItemAmostraCombinada(idx, osId);
    }
}

function onItemNumSelect(idx, osId, itemId) {
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    if (!numSelect) return;
    
    saveAmostraToDB(itemId, osId, { amostra_num_id: numSelect.value || null });
    renderItemAmostraCombinada(idx, osId);
}

function onItemArteUpload(idx, osId, itemId) {
    const input = document.getElementById(`amostra-item-arte-${idx}`);
    const nameLabel = document.getElementById(`amostra-item-arte-name-${idx}`);
    const removeBtn = document.getElementById(`btn-remove-amostra-arte-${idx}`);
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        nameLabel.textContent = file.name;
        removeBtn.style.display = 'inline-block';
        
        // Ler como Base64
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            // Salvar no banco
            saveAmostraToDB(itemId, osId, { amostra_arte_base64: base64 });
            // Atualizar o state
            const osItems = state.osItens[osId];
            const item = osItems.find(i => i.id === itemId);
            if (item) item.amostra_arte_base64 = base64;
            
            // Renderizar
            renderItemAmostraCombinada(idx, osId);
        };
        reader.readAsDataURL(file);
    }
}

function onItemArteRemove(idx, osId, itemId) {
    const input = document.getElementById(`amostra-item-arte-${idx}`);
    const nameLabel = document.getElementById(`amostra-item-arte-name-${idx}`);
    const removeBtn = document.getElementById(`btn-remove-amostra-arte-${idx}`);
    
    input.value = '';
    nameLabel.textContent = '';
    removeBtn.style.display = 'none';
    
    saveAmostraToDB(itemId, osId, { amostra_arte_base64: null });
    const item = state.osItens[osId].find(i => i.id === itemId);
    if (item) item.amostra_arte_base64 = null;
    
    renderItemAmostraCombinada(idx, osId);
}

async function saveAmostraToDB(itemId, osId, dataToUpdate) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        console.warn('Supabase no configurado, dados salvos apenas em memria.');
        return;
    }
    
    // O itemId do front comea com "vibe_item_". O ID no banco  numrico.
    const vibeIdStr = itemId.replace('vibe_item_', '');
    const vibeId = parseInt(vibeIdStr, 10);
    
    try {
        const { error } = await vibeClient
            .from('produtos_proposta')
            .update(dataToUpdate)
            .eq('id', vibeId);
            
        if (error) throw error;
        
        // Atualizar state local
        const item = state.osItens[osId].find(i => i.id === itemId);
        if (item) {
            Object.assign(item, dataToUpdate);
        }
    } catch (e) {
        console.error('Erro ao salvar no Supabase:', e);
        toast('Falha ao salvar amostra no banco de dados', 'error');
    }
}

/**
 * Renderiza o canvas de preview combinada para um card de item individual.
 * Usa exatamente a mesma lógica do card avulso:
 * - Cor: renderiza PDF via pdf.js em offscreen canvas
 * - Numeração: desenha elements (TEXT, FIXED, QR, BARCODE) em offscreen canvas
 * - Arte: carrega imagem do upload
 * - Compõe tudo no canvas final
 */
async function renderItemAmostraCombinada(idx, osId) {
    const canvas = document.getElementById(`amostra-item-canvas-${idx}`);
    const empty = document.getElementById(`amostra-item-empty-${idx}`);
    const corSelect = document.getElementById(`amostra-item-cor-${idx}`);
    const numSelect = document.getElementById(`amostra-item-num-${idx}`);
    const arteInput = document.getElementById(`amostra-item-arte-${idx}`);
    const arteNameSpan = document.getElementById(`amostra-item-arte-name-${idx}`);
    const removeBtn = document.getElementById(`btn-remove-amostra-arte-${idx}`);

    if (!canvas) return;

    const item = state.osItens[osId] ? state.osItens[osId][idx] : null;
    const corId = corSelect ? corSelect.value : (item ? item.amostra_cor_id : '');
    const numId = numSelect ? numSelect.value : (item ? item.amostra_num_id : '');
    const hasArte = arteInput && arteInput.files && arteInput.files.length > 0;
    const hasSavedArte = !!(item && item.amostra_arte_base64);

    // Mostrar nome do arquivo e botão remover
    if (arteNameSpan) {
        if (hasArte) arteNameSpan.textContent = arteInput.files[0].name;
        else if (hasSavedArte) arteNameSpan.textContent = '(Arte Salva)';
        else arteNameSpan.textContent = '';
    }
    if (removeBtn) removeBtn.style.display = (hasArte || hasSavedArte) ? '' : 'none';

    // Se nada selecionado, esconder canvas
    if (!corId && !numId && !hasArte && !hasSavedArte) {
        canvas.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    // Obter cor e formato
    const cor = corId ? state.cores.find(c => c.id === corId) : null;
    const num = numId ? state.numeracoes.find(n => n.id === numId) : null;

    // Determinar formato base
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
        // Sem formato — fallback básico
        fmt = { width_mm: 180, height_mm: 50 };
    }

    // Calcular escala (150 DPI apenas no link do cliente para nitidez retina/HiDPI, senão usar largura do container)
    const isClientePage = (state.amostrasContainerId === 'cliente-amostras-itens-container');
    let S;
    if (isClientePage) {
        // 150 DPI = 150 pixels por polegada (25.4 mm)
        S = 150 / 25.4;
    } else {
        const containerWidth = canvas.parentElement ? canvas.parentElement.clientWidth - 4 : 600;
        S = containerWidth / fmt.width_mm;
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

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, finalWidth, finalHeight);
    ctx.globalCompositeOperation = 'source-over';

    // ====== CAMADA 1: COR (PDF via pdf.js) ======
    let corRendered = false;
    if (cor && cor.pdf_base64 && typeof pdfjsLib !== 'undefined') {
        try {
            const base64Data = cor.pdf_base64.includes('base64,') ? cor.pdf_base64.split('base64,')[1] : cor.pdf_base64;
            const binStr = atob(base64Data);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 1.0 });
            const pdfScale = (fmt.width_mm * 2.8346) / viewport.width;
            const scaledViewport = page.getViewport({ scale: pdfScale * (S / 2.8346) });

            const offCanvas = document.createElement('canvas');
            offCanvas.width = scaledViewport.width;
            offCanvas.height = scaledViewport.height;
            const offCtx = offCanvas.getContext('2d');
            await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;

            // Centralizar como faz o card avulso
            const dx = (finalWidth - offCanvas.width) / 2;
            const dy = (finalHeight - offCanvas.height) / 2;
            ctx.drawImage(offCanvas, dx, dy, offCanvas.width, offCanvas.height);
            corRendered = true;
        } catch (e) {
            console.warn(`[Item ${idx}] Erro ao renderizar cor PDF:`, e);
        }
    }
    if (!corRendered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalWidth, finalHeight);
    }

    // ====== CAMADA 2: ARTE (imagem do upload ou salva, com multiply) ======
    if (hasArte || hasSavedArte) {
        try {
            let url;
            if (hasArte) {
                const file = arteInput.files[0];
                url = URL.createObjectURL(file);
            } else {
                url = item.amostra_arte_base64;
            }
            const arteImg = new Image();
            await new Promise((resolve, reject) => {
                arteImg.onload = resolve;
                arteImg.onerror = reject;
                arteImg.src = url;
            });
            if (arteImg.width > 0 && arteImg.height > 0) {
                // Criar canvas temporário para arte no tamanho final
                const tempArte = document.createElement('canvas');
                tempArte.width = finalWidth;
                tempArte.height = finalHeight;
                const tempCtx = tempArte.getContext('2d');

                // Centralizar arte mantendo proporção
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

                // Aplicar com multiply (como o card avulso)
                ctx.globalCompositeOperation = 'multiply';
                ctx.drawImage(tempArte, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (hasArte) {
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.warn(`[Item ${idx}] Erro ao renderizar arte:`, e);
        }
    }

    // ====== CAMADA 3: NUMERAÇÃO (desenhar elements como o card avulso) ======
    if (num && num.elements && num.elements.length > 0) {
        const numCanvas = document.createElement('canvas');
        numCanvas.width = Math.round(fmt.width_mm * S);
        numCanvas.height = Math.round(fmt.height_mm * S);
        const numCtx = numCanvas.getContext('2d');

        // Fundo transparente — contorno do formato
        numCtx.strokeStyle = '#64748b';
        numCtx.lineWidth = 1;
        numCtx.strokeRect(0, 0, numCanvas.width, numCanvas.height);

        // Desenhar cada elemento da numeração
        num.elements.forEach(el => {
            const x = el.x_mm * S;
            const y = el.y_mm * S;
            const color = el.color || '#000000';
            const rot = (el.rotation || 0) * Math.PI / 180;

            numCtx.save();
            numCtx.translate(x, y);
            numCtx.rotate(rot);

            if (el.type === 'TEXT' || el.type === 'FIXED') {
                const fs = (el.font_size || 12) * S / 2.8346;
                const fontStyle = typeof getFontCSS === 'function' ? getFontCSS(el.font_name) : (el.font_name || 'monospace');
                numCtx.font = `${fs}px ${fontStyle}`;
                numCtx.fillStyle = color;

                let label = '';
                if (el.type === 'FIXED') {
                    label = el.fixed_value || 'TEXTO';
                } else {
                    const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;
                    label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;
                }
                numCtx.fillText(label, 0, fs);
            } else if (el.type === 'QR') {
                const sz = (el.size_mm || 15) * S;
                numCtx.fillStyle = color;
                numCtx.fillRect(0, 0, sz, sz);
                numCtx.fillStyle = '#ffffff';
                const cell = sz / 7;
                for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {
                    numCtx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);
                    numCtx.fillStyle = color;
                    numCtx.fillRect(cx * cell + cell, cy * cell + cell, cell, cell);
                    numCtx.fillStyle = '#ffffff';
                }
            } else if (el.type === 'BARCODE') {
                const bw = (el.barcode_width_mm || 30) * S;
                const bh = (el.barcode_height_mm || 8) * S;
                numCtx.fillStyle = color;
                for (let i = 0; i < bw; i += 3) {
                    if (Math.random() > 0.3) numCtx.fillRect(i, 0, 1.5, bh);
                }
            }
            numCtx.restore();
        });

        // Compor numeração sobre o canvas final (centralizado)
        const ndx = (finalWidth - numCanvas.width) / 2;
        const ndy = (finalHeight - numCanvas.height) / 2;
        ctx.drawImage(numCanvas, ndx, ndy, numCanvas.width, numCanvas.height);
    }

    // Borda decorativa
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, finalWidth, finalHeight);
}

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
    const baseNum = state.numeracoes.find(n => n.id === baseNumId);
    if (!baseNum) return;
    
    const item = state.osItens[osId].find(i => i.id === itemId);
    const modelName = `${item.produto} (Modelo ${idx + 1})`;
    
    // Set custom state
    window.customNumeracaoEditState = {
        active: true,
        osId,
        itemId,
        idx,
        modelName,
        baseNumId
    };
    
    // Mudar view
    showView('view-numeracoes');
    
    setTimeout(() => {
        // Carrega numerao base
        editNumeracao(baseNumId);
        
        setTimeout(() => {
            // Limpa ID para forcar INSERT e altera o nome
            document.getElementById('num-id').value = '';
            document.getElementById('num-name').value = modelName;
            
            toast(`Editando numeração exclusivamente para o modelo: ${modelName}`, 'info');
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

window.editImposicaoCustomNumeracao = function(fieldId) {
    const numSelect = document.getElementById(fieldId);
    if (!numSelect || !numSelect.value) {
        toast('Selecione uma numeração base primeiro antes de editar!', 'warning');
        return;
    }
    
    const impName = document.getElementById('imp-name').value.trim() || 'Modelo Imposição';
    const numId = numSelect.value;
    const baseNum = state.numeracoes.find(n => n.id === numId);
    if (!baseNum) return;
    
    // Configura o state para que no saveNumeracao volte para Imposição
    window.customNumeracaoEditState = {
        view: 'imposicao',
        fieldId: fieldId,
        modeloName: impName
    };
    
    // Abre a numeração
    editNumeracao(numId);
    
    // Força o nome no editor da numeração
    const suffix = fieldId === 'imp-numeracao' ? ' Num1' : ' Num2';
    document.getElementById('num-name').value = impName + suffix;
    
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
        
        toast(`Item ${status === 'APROVADA' ? 'aprovado' : 'marcado para alteração'}!`, status === 'APROVADA' ? 'success' : 'warning');
        renderAmostrasOSItens(osId);
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
}

// Expor funções globais
window.loadOrdens = loadOrdens;
window.loadOrdensFromVibecode = loadOrdensFromVibecode;
window.mapVibecodeProdutoToOSItem = mapVibecodeProdutoToOSItem;
window.renderOrdens = renderOrdens;
window.toggleOSDetail = toggleOSDetail;
window.changeOSStatus = changeOSStatus;
window.updateItemImpressao = updateItemImpressao;
window.enviarParaImposicao = enviarParaImposicao;
window.autoSaveOSItemField = autoSaveOSItemField;
window.renderImpOSQueue = renderImpOSQueue;
window.toggleImpOSQueue = toggleImpOSQueue;
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
    const item = (state.osItens[osId] || []).find(i => i.id === itemId);
    if (!os || !item) return;
    
    artesModalState.itemId = itemId;
    artesModalState.osId = osId;
    artesModalState.id_int = os.numero || osId.replace('vibe_', '');
    artesModalState.modeloNome = item.modelo || 'Padrão';
    
    document.getElementById('modal-artes-modelo-nome').textContent = artesModalState.modeloNome;
    document.getElementById('modal-artes').style.display = 'flex';
    document.getElementById('modal-artes-file').value = '';
    document.getElementById('modal-artes-comment').value = '';
    
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
            ${arte.url_arquivo ? `<div><a href="${arte.url_arquivo}" target="_blank" class="btn btn-sm btn-secondary" style="font-size: 0.75rem;">👁️ Ver Arquivo</a></div>` : ''}
            ${arte.comentarios_revisao ? `<div style="margin-top: 8px; background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; font-size: 0.85rem;">💬 ${arte.comentarios_revisao}</div>` : ''}
        </div>
        `;
    }).join('');
}

async function submitNovaArte() {
    const fileInput = document.getElementById('modal-artes-file');
    const comment = document.getElementById('modal-artes-comment').value.trim();
    const btn = document.getElementById('btn-submit-arte');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        toast('Selecione um arquivo (PDF ou Imagem) primeiro!', 'warning');
        return;
    }
    
    const file = fileInput.files[0];
    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';
    
    try {
        let proximaVersao = artesModalState.artes.length > 0 ? artesModalState.artes[0].versao + 1 : 1;
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `propostas/${artesModalState.id_int}/artes/${artesModalState.itemId}/${timestamp}_${safeName}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('chat-ideal')
            .upload(storagePath, file, { upsert: true });
            
        if (uploadError) throw new Error('Falha no upload: ' + uploadError.message);
        
        const { data: publicUrlData } = supabaseClient.storage.from('chat-ideal').getPublicUrl(storagePath);
        
        const { error: insertError } = await supabaseClient
            .from('pedidos_artes')
            .insert({
                id_int: artesModalState.id_int,
                id_modelo: artesModalState.itemId,
                versao: proximaVersao,
                nome_arquivo: file.name,
                storage_bucket: 'chat-ideal',
                storage_path: storagePath,
                url_arquivo: publicUrlData.publicUrl,
                tipo_arquivo: file.type.includes('pdf') ? 'PDF' : 'IMAGEM',
                mime_type: file.type,
                tamanho_bytes: file.size,
                status: 'EM_REVISAO_INTERNA',
                enviado_por: 'Usuário do Sistema',
                comentarios_revisao: comment
            });
            
        if (insertError) throw insertError;
        
        await logToChatIdeal(`Arte enviada para o Modelo ${artesModalState.modeloNome} (versão ${proximaVersao}). Aguardando análise.\\nObs: ${comment}`);
        
        toast('Nova versão enviada com sucesso!', 'success');
        fileInput.value = '';
        document.getElementById('modal-artes-comment').value = '';
        await loadArtesDoModelo();
        
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
            .eq('id_item', artesModalState.itemId)
            .catch(e => console.warn('Sem sync modelo:', e));
            
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
// LINK DO CLIENTE — PÁGINA PÚBLICA (FASE 2)
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
async function gerarLinkCliente(osId, numero) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        toast('Supabase não configurado. Não é possível gerar o link.', 'error');
        return;
    }

    try {
        // Verificar se já existe um link para esta OS
        const { data: existing, error: fetchError } = await supabaseClient
            .from('pedidos_links_cliente')
            .select('*')
            .eq('os_id', osId)
            .eq('ativo', true)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            if (fetchError.code === '42P01') {
                toast('Tabela pedidos_links_cliente ainda não existe no banco. Execute o SQL de criação.', 'warning');
                return;
            }
            throw fetchError;
        }

        let token;
        if (existing) {
            token = existing.token;
        } else {
            // Gerar novo token
            token = generateClientToken(6);
            const os = state.ordens.find(o => o.id === osId);
            const { error: insertError } = await supabaseClient
                .from('pedidos_links_cliente')
                .insert({
                    os_id: osId,
                    numero_pedido: String(numero),
                    token: token,
                    id_int: os ? (os.numero || numero) : numero
                });
            if (insertError) throw insertError;
        }

        // Montar URL
        const baseUrl = window.location.origin;
        const linkUrl = `${baseUrl}/cliente/${numero}-${token}`;

        // Copiar para a área de transferência
        try {
            await navigator.clipboard.writeText(linkUrl);
            toast(`Link copiado! 📋\n${linkUrl}`, 'success');
        } catch (clipErr) {
            // Fallback: mostrar em prompt
            prompt('Copie o link abaixo:', linkUrl);
        }

    } catch (e) {
        console.error('Erro ao gerar link do cliente:', e);
        toast('Erro ao gerar o link: ' + e.message, 'error');
    }
}

/**
 * Router SPA — detecta se estamos em /cliente/{numero}-{token}
 * Deve rodar no carregamento da página
 */
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

        // Buscar itens do pedido (tabela produtos_proposta)
        let rawItens = [];
        try {
            const { data: prodData } = await supabaseClient
                .from('produtos_proposta')
                .select('*')
                .eq('id_int', parseInt(numero));
            rawItens = prodData || [];
        } catch (e) { console.warn('Itens não encontrados via produtos_proposta:', e); }

        // Mapear itens como os_itens e salvar no state global
        const osId = clienteState.osId;
        state.osItens[osId] = rawItens.map(p => mapVibecodeProdutoToOSItem(p, osId));

        // Salvar a OS no state.ordens
        const os = {
            id: osId,
            numero: numero,
            cliente: osCliente,
            _itens_raw: rawItens
        };
        state.ordens = [os];
        state.amostrasOSAtivo = osId;

        // Configurar o container de renderização das amostras para o cliente
        state.amostrasContainerId = 'cliente-amostras-itens-container';

        // Renderizar a tela de amostras combinada idêntica à interna
        renderAmostrasOSItens(osId);

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

    } catch (e) {
        console.error('Erro ao inicializar página do cliente:', e);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'block';
    }
}

async function clienteAprovarTudo() {
    const osId = clienteState.osId;
    const itens = state.osItens[osId] || [];
    const btnAprovar = document.getElementById('btn-cliente-aprovar-tudo');

    if (btnAprovar) {
        btnAprovar.disabled = true;
        btnAprovar.textContent = '⏳ Processando aprovação de todos os itens...';
    }

    try {
        // Para cada item, salvar status como APROVADA
        for (const item of itens) {
            await saveAmostraToDB(item.id, osId, { amostra_status: 'APROVADA' });
        }

        // Também atualizar o status em pedidos_artes para manter compatibilidade
        for (const item of itens) {
            try {
                await supabaseClient
                    .from('pedidos_artes')
                    .update({ status: 'APROVADA_CLIENTE', aprovado_por: 'Cliente (via link)', data_aprovacao: new Date().toISOString() })
                    .eq('id_modelo', item.id)
                    .order('versao', { ascending: false })
                    .limit(1);
            } catch (e) { /* silencioso */ }
        }

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

        // Mostrar tela de sucesso
        mostrarResultadoCliente('✅', 'Pedido Aprovado com Sucesso!', 'Obrigado! Sua aprovação foi registrada. A gráfica foi notificada e dará andamento à produção do seu pedido.');
    } catch (e) {
        console.error('Erro ao aprovar tudo:', e);
        toast('Erro ao processar aprovação final: ' + e.message, 'error');
        if (btnAprovar) {
            btnAprovar.disabled = false;
            btnAprovar.textContent = '✅ FINALIZAR E APROVAR PEDIDO COMPLETO';
        }
    }
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
    if (msgEl) msgEl.textContent = msg;
}

function openClienteLightbox(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const overlay = document.getElementById('cliente-lightbox-overlay');
    const img = document.getElementById('cliente-lightbox-img');
    const container = document.getElementById('cliente-lightbox-container');
    if (!overlay || !img) return;
    
    img.src = canvas.toDataURL('image/png');
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

// Exportar funções globais
window.gerarLinkCliente = gerarLinkCliente;
window.clienteAprovarTudo = clienteAprovarTudo;
window.openClienteLightbox = openClienteLightbox;
window.closeClienteLightbox = closeClienteLightbox;

// ─── ROUTER: Verificar rota do cliente no carregamento ───
document.addEventListener('DOMContentLoaded', () => {
    checkClienteRoute();
});
