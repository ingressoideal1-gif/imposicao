// PEDIDO.JS - GERADO AUTOMATICAMENTE POR CLONAGEM DE SCRIPT.JS

function applyPedFormatoDefaults() {
    const fmtSel = document.getElementById('ped-formato');
    if (!fmtSel) return;
    
    const selectedFmtId = fmtSel.value;
    if (!selectedFmtId) return;
    
    const fmt = state.formatos.find(f => String(f.id) === String(selectedFmtId));
    if (!fmt) return;
    
    // Aplica a Regra de Paginação se houver
    if (fmt.default_schema) {
        const schemaSel = document.getElementById('ped-schema');
        if (schemaSel) {
            schemaSel.value = fmt.default_schema;
            schemaSel.dispatchEvent(new Event('change'));
        }
    }
    
    // Aplica a Saída se houver
    if (fmt.default_saida_id) {
        const saidaSel = document.getElementById('ped-saida');
        if (saidaSel) {
            // Verifica se a opção existe
            if (Array.from(saidaSel.options).some(opt => opt.value === fmt.default_saida_id)) {
                saidaSel.value = fmt.default_saida_id;
            }
        }
    }
    
    // Cut & Stack mode
    if (fmt.default_cut_stack_mode) {
        const modeSel = document.getElementById('ped-cut-stack-mode');
        if (modeSel) modeSel.value = fmt.default_cut_stack_mode;
    }
    
    // Sheets per block
    if (fmt.default_sheets_per_block) {
        const sheetsInp = document.getElementById('ped-sheets-per-block');
        if (sheetsInp) sheetsInp.value = fmt.default_sheets_per_block;
    }
    
    // Block depth
    if (fmt.default_block_depth) {
        const depthInp = document.getElementById('ped-block-depth');
        if (depthInp) depthInp.value = fmt.default_block_depth;
    }
    
    // Rotate
    if (fmt.default_rotate_page !== undefined) {
        const rotateCb = document.getElementById('ped-rotate-page');
        if (rotateCb) {
            rotateCb.checked = !!fmt.default_rotate_page;
            // update local state
            state.rotatePage = rotateCb.checked;
        }
    }
}

function populatePedNumeracoes() {
    const fmtSel = document.getElementById('ped-formato');
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
    ['ped-numeracao', 'ped-numeracao-2'].forEach(id => {
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

async function loadPedArtFile(file) {

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

            state.pedArtPdfDoc = pdf;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



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



            state.pedArtImage = off;

            state.pedArtWidth = vp.width; // em pt

            state.pedArtHeight = vp.height; // em pt

            

            // Se estiver em Pdf Múltiplo, atualiza limites

            const schema = document.getElementById('ped-schema').value;

            if (schema === "pdf_multiple") {

                const impStart = document.getElementById('ped-start');

                const impEnd = document.getElementById('ped-end');

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

            state.pedArtPdfDoc = null;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



            const img = new Image();

            img.src = URL.createObjectURL(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

            

            // Obter o DPI da imagem a partir dos metadados

            const dpi = await getDpi(file);

            

            state.pedArtImage = img;

            // Converter pixels para pontos PDF (1pt = 1/72 polegada, logo: px / DPI * 72)

            state.pedArtWidth = img.width * (72 / dpi);

            state.pedArtHeight = img.height * (72 / dpi);

        }

        toast('Arte carregada para preview!', 'success');

        updatePedSummary(); // Recalcular sumário e forçar redesenho do preview

    } catch (e) {

        toast('Erro ao carregar arte: ' + e.message, 'error');

        state.pedArtImage = null;

        state.pedArtPdfDoc = null;

        state.pedArtPagesCache = {};

        state.pedArtPagesRendering = {};

        updatePedSummary();

    }

}

t -

'use strict';



// - Utility -- Parse Decimal BR (aceita vírgula como separador) -

function drawPedPreview(value) {

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
};

// - Variáveis globais de usuários -
let usuariosSupabase = [];

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




// - Font Picker Component -
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
            return parts[0] + (style ? ` -- ${style}` : '');
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

        // - Fontes embutidas -
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

        // - Fontes do sistema -
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

        // - Botão para carregar/recarregar fontes do PC -
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
        list.innerHTML = `<div class="font-picker-loading">🔄 Solicitando acesso às fontes do PC...</div>`;
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
            list.innerHTML = `<div class="font-picker-loading">🔄 Carregando fontes do PC...</div>`;
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





// - Load All Data -

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

        rotations: state.fmtRotations,

        default_schema: document.getElementById('fmt-def-schema').value,

        default_saida_id: document.getElementById('fmt-def-saida').value || null,

        default_cut_stack_mode: document.getElementById('fmt-def-cut-stack-mode').value,

        default_sheets_per_block: parseInt(document.getElementById('fmt-def-sheets').value) || 50,

        default_block_depth: parseInt(document.getElementById('fmt-def-depth').value) || 1,

        default_rotate_page: document.getElementById('fmt-def-rotate').checked,

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
    
    document.getElementById('fmt-def-rotate').checked = !!f.default_rotate_page;

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
    document.getElementById('fmt-def-rotate').checked = false;
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

async function duplicateCor(id) {
    const c = state.cores.find(x => x.id === id);
    if (!c) return;

    try {
        const clone = {
            name: c.name + ' (cópia)',
            formato_id: c.formato_id,
            width_mm: parseFloat(c.width_mm),
            height_mm: parseFloat(c.height_mm),
            pdf_base64: c.pdf_base64 || null,
            pdf_filename: c.pdf_filename || "",
        };

        await api('POST', '/cores', clone);
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
    const selImpFmt = document.getElementById('ped-formato');
    if (selImpFmt) {
        const cur = selImpFmt.value;
        selImpFmt.innerHTML = '<option value="">-- Selecione --</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
        if (cur) selImpFmt.value = cur;
    }

    const selImpSaida = document.getElementById('ped-saida');
    const selFmtDefSaida = document.getElementById('fmt-def-saida');
    if (selImpSaida) {
        const cur = selImpSaida.value;
        const curDef = selFmtDefSaida ? selFmtDefSaida.value : '';
        const optionsHtml = '<option value="">-- Selecione --</option>' +
            state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        selImpSaida.innerHTML = optionsHtml;
        if (cur) selImpSaida.value = cur;
        
        if (selFmtDefSaida) {
            selFmtDefSaida.innerHTML = '<option value="">-- Nenhuma (Livre) --</option>' +
                state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            if (curDef) selFmtDefSaida.value = curDef;
        }
    }

    // Imposição -- numerações (filtradas por tamanho do formato selecionado)
    populatePedNumeracoes();



    // Modelos de Imposição Selector

    const selModelo = document.getElementById('ped-modelo-selector');

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
function applyPedFormatoDefaults() {
    const fmtSel = document.getElementById('ped-formato');
    if (!fmtSel) return;
    
    const selectedFmtId = fmtSel.value;
    if (!selectedFmtId) return;
    
    const fmt = state.formatos.find(f => String(f.id) === String(selectedFmtId));
    if (!fmt) return;
    
    // Aplica a Regra de Paginação se houver
    if (fmt.default_schema) {
        const schemaSel = document.getElementById('ped-schema');
        if (schemaSel) {
            schemaSel.value = fmt.default_schema;
            schemaSel.dispatchEvent(new Event('change'));
        }
    }
    
    // Aplica a Saída se houver
    if (fmt.default_saida_id) {
        const saidaSel = document.getElementById('ped-saida');
        if (saidaSel) {
            // Verifica se a opção existe
            if (Array.from(saidaSel.options).some(opt => opt.value === fmt.default_saida_id)) {
                saidaSel.value = fmt.default_saida_id;
            }
        }
    }
    
    // Cut & Stack mode
    if (fmt.default_cut_stack_mode) {
        const modeSel = document.getElementById('ped-cut-stack-mode');
        if (modeSel) modeSel.value = fmt.default_cut_stack_mode;
    }
    
    // Sheets per block
    if (fmt.default_sheets_per_block) {
        const sheetsInp = document.getElementById('ped-sheets-per-block');
        if (sheetsInp) sheetsInp.value = fmt.default_sheets_per_block;
    }
    
    // Block depth
    if (fmt.default_block_depth) {
        const depthInp = document.getElementById('ped-block-depth');
        if (depthInp) depthInp.value = fmt.default_block_depth;
    }
    
    // Rotate
    if (fmt.default_rotate_page !== undefined) {
        const rotateCb = document.getElementById('ped-rotate-page');
        if (rotateCb) {
            rotateCb.checked = !!fmt.default_rotate_page;
            // update local state
            state.rotatePage = rotateCb.checked;
        }
    }
}

// - Popula Numeração 1 e 2 na Imposição, filtradas por TAMANHO do formato -
function populatePedNumeracoes() {
    const fmtSel = document.getElementById('ped-formato');
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
    ['ped-numeracao', 'ped-numeracao-2'].forEach(id => {
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

    const filtradas = state.numeracoes.filter(n => {

        if (filterFmt) {
            const ids = n.formato_ids || [n.formato_id];
            if (!ids.some(id => String(id) === String(filterFmt))) return false;
        }

        if (filterType) {
            const tipo = n.tipo || 'SEQUENCIAL';
            if (tipo !== filterType) return false;
        }

        if (searchVal && !(n.name || '').toLowerCase().includes(searchVal)) return false;

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
        el.type === 'TEXT' ? String(el.ticket_pos || 1).padStart(el.pad || 6, '0') :
            el.type === 'QR' ? null :
                el.type === 'BARCODE' ? null : String(el.ticket_pos || 1).padStart(el.pad || 6, '0');



    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_')) {

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
        } else if (el.source === 'database') {
            label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;
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
        const hsz = sz / 2; // half-size para ancoragem central

        ctx.fillStyle = color;

        // Desenhar QR placeholder centrado no ponto de ancoragem

        ctx.fillRect(-hsz, -hsz, sz, sz);

        ctx.fillStyle = '#fff';

        const cell = sz / 7;

        // Cantos do QR

        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {

            ctx.fillStyle = '#fff';

            ctx.fillRect(-hsz + cx * cell, -hsz + cy * cell, 3 * cell, 3 * cell);

            ctx.fillStyle = color;

            ctx.fillRect(-hsz + cx * cell + cell * 0.5, -hsz + cy * cell + cell * 0.5, 2 * cell, 2 * cell);

        }

        ctx.font = `${Math.max(6, sz * 0.14)}px Inter`;

        ctx.fillStyle = '#fff';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillText('QR', 0, 0);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';



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



    ctx.restore();

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

    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_')) {

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
        face: 'both', 
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



    const typeLabel = { TEXT: '🔤 Numeração', FIXED: '🔠 Texto Fixo', QR: '📱 QR Code', BARCODE: '▌▌ Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote', TEATRO_FILA: '🎭 Fila', TEATRO_LUGAR: '🎭 Lugar', TEATRO_COMBO: '🎭 Fila & Lugar' };

    const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger', PDF: 'badge-gray', TEATRO_FILA: 'badge-purple', TEATRO_LUGAR: 'badge-purple', TEATRO_COMBO: 'badge-purple' };



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
    state.selectedElIds.forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (el) el.group_id = groupId;
    });
    
    saveNumHistory();
    
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
                
                if (typeof updateImpSummary === 'function') {
                    updatePedSummary();
                }
                if (typeof toggleImpNumEditButtons === 'function') {
                    togglePedNumEditButtons();
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

async function loadPedArtFile(file) {

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

            state.pedArtPdfDoc = pdf;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



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



            state.pedArtImage = off;

            state.pedArtWidth = vp.width; // em pt

            state.pedArtHeight = vp.height; // em pt

            

            // Se estiver em Pdf Múltiplo, atualiza limites

            const schema = document.getElementById('ped-schema').value;

            if (schema === "pdf_multiple") {

                const impStart = document.getElementById('ped-start');

                const impEnd = document.getElementById('ped-end');

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

            state.pedArtPdfDoc = null;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



            const img = new Image();

            img.src = URL.createObjectURL(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

            

            // Obter o DPI da imagem a partir dos metadados

            const dpi = await getDpi(file);

            

            state.pedArtImage = img;

            // Converter pixels para pontos PDF (1pt = 1/72 polegada, logo: px / DPI * 72)

            state.pedArtWidth = img.width * (72 / dpi);

            state.pedArtHeight = img.height * (72 / dpi);

        }

        toast('Arte carregada para preview!', 'success');

        updatePedSummary(); // Recalcular sumário e forçar redesenho do preview

    } catch (e) {

        toast('Erro ao carregar arte: ' + e.message, 'error');

        state.pedArtImage = null;

        state.pedArtPdfDoc = null;

        state.pedArtPagesCache = {};

        state.pedArtPagesRendering = {};

        updatePedSummary();

    }

}





function updatePedSummary() {

    const fmtSelect = document.getElementById('ped-formato');

    const numSelect = document.getElementById('ped-numeracao');

    const numSelect2 = document.getElementById('ped-numeracao-2');



    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

    const lblNum1 = document.getElementById('lbl-ped-num-1');

    const lblNum2 = document.getElementById('lbl-ped-num-2');

    if (lblNum1 && lblNum2) {

        if (printMode === 'duplex') {

            lblNum1.innerHTML = '2. Numeração <b style="color:var(--blue)">FRENTE</b> (opcional)';

            lblNum2.innerHTML = '3. Numeração <b style="color:var(--blue)">VERSO</b> (opcional)';

        } else {

            lblNum1.innerHTML = '2. Numeração 1 (opcional)';

            lblNum2.innerHTML = '3. Numeração 2 (opcional)';

        }

    }



    if (document.getElementById('ped-schema')?.value === 'multi_artes') {

        
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



    const fmtId = document.getElementById('ped-formato').value;

    const numId = document.getElementById('ped-numeracao').value;

    const saiId = document.getElementById('ped-saida').value;

    const start = parseInt(document.getElementById('ped-start').value) || 1;

    const end = parseInt(document.getElementById('ped-end').value) || 100;

    const box = document.getElementById('ped-summary');



    const num = state.numeracoes.find(n => n.id === numId) || null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => n.id === num2Id) || null;

    if (num && num.svg_content && !num._svgImage) {

        const img = new Image();

        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(num.svg_content);

        img.onload = () => {

            num._svgImage = img;

            drawPedPreview();

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

                        drawPedPreview();

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

    const schema = document.getElementById('ped-schema').value;

    const isPdfMultiple = (schema === "pdf_multiple");



    // Atualizar modo de impressão no estado global

    const printModeEl = document.getElementById('ped-print-mode');

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

        const ms = document.getElementById('ped-mapa-teatro');
        if (!ms || !ms.value) {
            state.csvData = null;
        }

        state.csvFile = null;

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

        const finalItems = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

        

        // Travar e preencher campos

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

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

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

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

            const ms = document.getElementById('ped-mapa-teatro');
            if (!ms || !ms.value) {
                state.csvData = null;
            }

            state.csvFile = null;

        }

        

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

        if (impStart) impStart.removeAttribute('disabled');

        if (impEnd) impEnd.removeAttribute('disabled');

    }

    const impMapaTeatroGroup = document.getElementById('ped-mapa-teatro-group');
    const impStartGroup = document.getElementById('ped-start-group');
    const impEndGroup = document.getElementById('ped-end-group');
    
    if ((num && num.tipo === 'TEATRO') || (num2 && num2.tipo === 'TEATRO')) {
        if (impMapaTeatroGroup) impMapaTeatroGroup.style.display = 'block';
        if (impStartGroup) impStartGroup.style.display = 'none';
        if (impEndGroup) impEndGroup.style.display = 'none';
        populateImpMapasTeatro();
        // Carregar dados do mapa de teatro selecionado
        const mapaTeatro = document.getElementById('ped-mapa-teatro');
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

        drawPedPreview();

        return;

    }



    const fmt = state.formatos.find(f => f.id === fmtId);

    const sai = state.saidas.find(s => s.id === saiId);

    if (!fmt || !sai) {

        box.style.display = 'none';

        drawPedPreview();

        return;

    }



    let total = 1;

    if (isPdfMultiple) {

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

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
    const total_impressions = Math.ceil(total / ticket_qtd);
    let sheets = Math.ceil(total_impressions / perSheet);

    const cutstackMode = document.getElementById('ped-cutstack-mode')?.value;
    if (schema === 'cut_stack') {
        const stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        if (cutstackMode === 'strict') {
            const itemsPerSet = stack_size * perSheet;
            const sets_needed = Math.ceil(total_impressions / itemsPerSet);
            sheets = sets_needed * stack_size;
        }
    }



    box.style.display = 'grid';

    document.getElementById('ped-sum-formato').textContent = `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)`;

    document.getElementById('ped-sum-grade').textContent = `${fmt.cols} × ${fmt.rows} = ${perSheet} itens/folha`;

    document.getElementById('ped-sum-total').textContent = total.toLocaleString('pt-BR');

    document.getElementById('ped-sum-folhas').textContent = sheets.toLocaleString('pt-BR') + ' folha(s)';

    document.getElementById('ped-sum-saida').textContent = `${sai.name} -- ${(sai.file_format || 'pdf').toUpperCase()}`;



    // Update steps

    ['step-1', 'step-2', 'step-3', 'step-4'].forEach((s, i) => {
        const el = document.getElementById(s);
        if (!el) return;
        el.classList.remove('done', 'active');
        el.classList.add(i < 3 ? 'done' : 'active');
    });



    drawPedPreview();

}

function clearPedActiveOS() {

    state.loadedOSName = "";

    state.expectedArteName = "";

    

    const activeOsStatus = document.getElementById('active-os-status');

    const activeOsName = document.getElementById('active-os-name');

    if (activeOsStatus && activeOsName) {

        activeOsName.textContent = "Nenhuma";

        activeOsStatus.style.display = 'none';

    }



    const infoEl = document.getElementById('ped-file-info');

    if (infoEl) {

        infoEl.style.display = 'none';

        infoEl.textContent = '';

    }



    const fileInput = document.getElementById('ped-file');

    if (fileInput) {

        fileInput.value = '';

    }



    toast('OS desvinculada. Validações de arquivo liberadas.', 'info');

}

async function enviarParaPedido(itemId, osId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return toast('Item não encontrado.', 'error');

    // Guardar referência ao item ativo para atualização automática pós-imposição
    state.activeOSItem = { itemId, osId };

    // Navegar para a view de Imposição
    const navBtn = document.querySelector('[data-view="view-pedido"]');
    if (navBtn) navBtn.click();

    // --- MATCHING AUTOMÁTICO DE FORMATO (VIA COR OU NOME) E SAÍDA ---
    let formatoId = item.formato_id;
    
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
    
    if (formatoId) {
        const fmtSelect = document.getElementById('ped-formato');
        if (fmtSelect) {
            fmtSelect.value = formatoId;
            fmtSelect.dispatchEvent(new Event('change'));
        }

        // Tentar match da Saída via Formato
        const formatoObj = state.formatos ? state.formatos.find(f => f.id == formatoId) : null;
        if (formatoObj && formatoObj.default_saida_id) {
            setTimeout(() => {
                const saidaSelect = document.getElementById('ped-saida');
                if (saidaSelect) {
                    saidaSelect.value = formatoObj.default_saida_id;
                    saidaSelect.dispatchEvent(new Event('change'));
                    console.log(`[OS→Imp] Saída matched via Formato "${formatoObj.name}" → ${formatoObj.default_saida_id}`);
                }
            }, 100); // pequeno delay para garantir que o formato populou as saídas
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
            const numSelect = document.getElementById('ped-numeracao');
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
        const numStart = document.getElementById('ped-start');
        const numEnd = document.getElementById('ped-end');
        if (numStart && item.num_inicial) numStart.value = item.num_inicial;
        if (numEnd && item.num_final) numEnd.value = item.num_final;
    }, 400);

    // --- PREENCHER MODO DE IMPRESSÃO ---
    // Aguardar a navegação de aba + preenchimento dos selects antes de desenhar
    setTimeout(() => {
        if (item.verso) {
            const printMode = document.getElementById('ped-print-mode');
            if (printMode) {
                printMode.value = 'duplex';
                printMode.dispatchEvent(new Event('change'));
            }
        }
        if (item.blocos && item.blocos !== 'N') {
            const schemaSelect = document.getElementById('ped-schema');
            if (schemaSelect) {
                schemaSelect.value = 'cut_stack';
                schemaSelect.dispatchEvent(new Event('change'));
            }
        }
        updatePedSummary();
        if (typeof drawPreview === 'function') drawPedPreview();
    }, 800);

    // --- ATUALIZAR PAINEL DE ITENS OS ---
    setTimeout(() => { renderImpOSQueue(); }, 600);
    
    // --- CARREGAR ARTE (PDF/IMAGEM) ---
    setTimeout(() => {
        // Prioridade 1: arte_url do próprio item
        // Prioridade 2: pdf_url da cor correspondente
        const arteUrl = item.arte_url || null;
        
        // Tentar encontrar a arte via cor — prioridade: amostra_cor_id > fuzzy match
        const corObj = item.amostra_cor_id
            ? (state.cores || []).find(c => String(c.id) === String(item.amostra_cor_id))
            : (state.cores || []).find(c => globalFuzzyMatch(c.name, item.cor || item.padrao || ''));
        const arteViaCor = corObj ? (corObj.pdf_url || null) : null;
        
        const arteSource = arteUrl || arteViaCor;
        
        if (arteSource) {
            // Extrair o nome do arquivo da URL para preservar a extensão correta (.jpg, .pdf, etc.)
            const filenameFromUrl = arteSource.startsWith('http')
                ? decodeURIComponent(arteSource.split('/').pop().split('?')[0])
                : null;
            const filename = filenameFromUrl || item.nome_arquivo_arte || (corObj ? `${corObj.name}.pdf` : `Arte_${item.modelo || 'Modelo'}.pdf`);
            
            const loadArte = (src) => {
                if (!src || !src.startsWith('http')) {
                    console.warn('[OS→Imp] Fonte de arte inválida (não é URL HTTP):', src);
                    return;
                }
                fetch(src)
                    .then(res => {
                        const ct = res.headers.get('content-type') || '';
                        return res.blob().then(blob => ({ blob, ct }));
                    })
                    .then(({ blob, ct }) => {
                        // Validar que é PDF ou imagem antes de carregar
                        const isPdf = ct.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
                        const isImg = ct.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(filename);
                        if (!isPdf && !isImg) {
                            console.warn('[OS→Imp] Conteúdo retornado não é PDF nem imagem. Content-Type:', ct);
                            return;
                        }
                        const file = new File([blob], filename, { type: ct || (isPdf ? 'application/pdf' : 'image/png') });
                        state.expectedArteName = filename;
                        loadPedArtFile(file);
                        const impInfo = document.getElementById('ped-file-info');
                        if (impInfo) {
                            impInfo.textContent = `✅ ${filename} (Carregado do Pedido)`;
                            impInfo.style.display = 'block';
                        }
                        setTimeout(() => { if (typeof drawPreview === 'function') drawPedPreview(); }, 600);
                    })
                    .catch(err => console.warn('[OS→Imp] Erro ao baixar arte via URL:', err));
            };
            
            loadArte(arteSource);
            if (corObj) console.log(`[OS→Imp] Arte carregada via Cor "${corObj.name}"`);
        } else {
            console.warn(`[OS→Imp] Nenhuma arte encontrada para item ${item.id} (cor: ${corNome})`);
        }
    }, 700);

    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? os.numero : '';
    const formatoObjToast = state.formatos ? state.formatos.find(f => String(f.id) === String(formatoId)) : null;
    const nomeFmtToast = formatoObjToast ? formatoObjToast.name : (item.formato || 'Formato Não Definido');
    toast(`Item "${item.produto} -- ${nomeFmtToast}" da OS #${osNum} carregado na Imposição!`, 'info');
}

function renderPedOSQueue() {
    const container = document.getElementById('ped-os-queue');
    const tbody = document.getElementById('tbody-ped-os-queue');
    const pendingBadge = document.getElementById('ped-os-queue-pending');
    const numeroBadge = document.getElementById('ped-os-queue-numero');
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

    const pendentes = itens.filter(i => i.impressao !== 'IMPRESSO');
    if (pendingBadge) pendingBadge.textContent = `${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''}`;

    // Garantir cabeçalho correto (via JS para evitar problema de cache do HTML)
    const table = tbody.closest('table');
    if (table) {
        let thead = table.querySelector('thead');
        if (!thead) { thead = document.createElement('thead'); table.insertBefore(thead, tbody); }
        thead.innerHTML = `<tr>
            <th style="padding:4px 6px; width:32px; text-align:center;">M</th>
            <th style="padding:4px 6px; width:80px;">Modelo</th>
            <th style="padding:4px 6px;">Nome</th>
            <th style="padding:4px 6px; width:60px;">QTD</th>
            <th style="padding:4px 6px; min-width:110px;">COR</th>
            <th style="padding:4px 6px; min-width:140px;">Numera\u00e7\u00e3o</th>
            <th style="padding:4px 6px; width:60px;">NI</th>
            <th style="padding:4px 6px; width:60px;">NF</th>
            <th style="padding:4px 6px; width:44px; text-align:center;">Verso</th>
            <th style="padding:4px 6px;">Status</th>
        </tr>`;
    }


    // Todas as cores e numerações (filtro por formato feito por item abaixo)
    const todasCores = state.cores || [];
    const todasNums = state.numeracoes || [];

    const inputStyle = 'background:#1e293b; border:1px solid #334155; border-radius:4px; color:#f1f5f9; padding:2px 5px; font-size:0.75rem; width:100%;';
    const selectStyle = 'background:#1e293b; border:1px solid #334155; border-radius:4px; color:#f1f5f9; padding:2px 5px; font-size:0.75rem; width:100%; cursor:pointer;';
    const btnStyle = 'border:none; border-radius:4px; padding:3px 8px; font-size:0.72rem; cursor:pointer; font-weight:600; transition:opacity 0.2s;';

    tbody.innerHTML = itens.map((item, idx) => {
        const isActive = activeItem.itemId === item.id || String(activeItem.itemId) === String(item.id);
        const rowBg = isActive ? 'background: rgba(59,130,246,0.15); border-left: 2px solid var(--blue);' : '';
        const indexModelo = idx + 1;

        // Filtrar cores e numerações pelo formato_id do próprio item
        const itemFmtId = item.formato_id ? String(item.formato_id) : null;
        const coresItem = todasCores.filter(c => !itemFmtId || !c.formato_id || String(c.formato_id) === String(itemFmtId));
        const numsItem  = todasNums.filter(n  => !itemFmtId || !n.formato_id  || String(n.formato_id)  === String(itemFmtId));

        // Opções de Cor — prioridade: amostra_cor_id > fuzzy match no nome
        const corIdAtual   = item.amostra_cor_id ? String(item.amostra_cor_id) : null;
        const corNomeAtual = item.cor || item.padrao || '';
        const coresOptions = coresItem.map(c => {
            let sel = '';
            if (corIdAtual && String(c.id) === corIdAtual) {
                sel = 'selected';
            } else if (!corIdAtual && corNomeAtual && globalFuzzyMatch(c.name, corNomeAtual)) {
                sel = 'selected';
            }
            return `<option value="${c.id}" ${sel}>${c.name}</option>`;
        }).join('');

        // Numeração: usar gabarito_operacional como valor principal (texto livre)
        const numValDisplay = item.gabarito_operacional || item.numeracao || '';

        // Opções de Numeração — pré-selecionar pelo gabarito_operacional via fuzzy
        const numsOptions = numsItem.map(n => {
            const sel = globalFuzzyMatch(n.name || n.tipo || '', numValDisplay) ? 'selected' : '';
            return `<option value="${n.id}" ${sel}>${n.name || n.tipo}</option>`;
        }).join('');

        const niVal = item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || '');
        const nfVal = item.num_final !== undefined && item.num_final !== null ? item.num_final : (item.numeracao_fim || '');
        const qtdVal = item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || '');

        return `
            <tr style="${rowBg} transition: background 0.2s;" class="hover-row" id="ped-queue-row-${item.id}">
                <td style="padding: 5px 8px; text-align: center;">
                    ${isActive ? '<strong style="color: var(--blue);">▶</strong> ' : ''}
                    <strong style="cursor:pointer;" onclick="enviarParaPedido('${item.id}', '${osId}')" title="Carregar este modelo">${indexModelo}</strong>
                </td>
                <td style="padding: 5px 8px; font-family: monospace; font-size: 0.72rem; color:var(--text-dim);">${item.modelo || '--'}</td>
                <td style="padding: 5px 8px;"><strong style="cursor:pointer;" onclick="enviarParaPedido('${item.id}', '${osId}')">${item.produto || '--'}</strong></td>
                <td style="padding: 5px 4px;">
                    <input type="number" min="0" value="${qtdVal}" style="${inputStyle}" placeholder="QTD"
                        onchange="impQueueUpdateField('${item.id}', '${osId}', 'qtd', this.value)"
                        onclick="event.stopPropagation()" />
                </td>
                <td style="padding: 5px 4px;">
                    <select style="${selectStyle}" onchange="impQueueUpdateCor('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()">
                        <option value="">— Cor —</option>
                        ${coresOptions}
                    </select>
                </td>
                <td style="padding: 5px 4px;">
                    <select style="${selectStyle}" onchange="impQueueUpdateNum('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()" title="${numValDisplay}">
                        <option value="">${numValDisplay || '— Numeração —'}</option>
                        ${numsOptions}
                    </select>
                </td>
                <td style="padding: 5px 4px;">
                    <input type="number" value="${niVal}" style="${inputStyle}" placeholder="NI"
                        onchange="impQueueUpdateField('${item.id}', '${osId}', 'num_inicial', this.value)"
                        onclick="event.stopPropagation()" />
                </td>
                <td style="padding: 5px 4px;">
                    <input type="number" value="${nfVal}" style="${inputStyle}" placeholder="NF"
                        onchange="impQueueUpdateField('${item.id}', '${osId}', 'num_final', this.value)"
                        onclick="event.stopPropagation()" />
                </td>
                <td style="padding: 5px 8px; text-align: center;">${item.verso ? '✅' : '--'}</td>
                <td style="padding: 5px 8px;">${getImpressaoBadge(item.impressao)}</td>
                <td style="padding: 5px 4px; white-space:nowrap; display:flex; gap:4px; align-items:center;">
                    <button style="${btnStyle} background:#7c3aed; color:#fff;" title="Gerar PDF para este modelo"
                        onclick="event.stopPropagation(); impQueueGerarPDF('${item.id}', '${osId}')">
                        📄 PDF
                    </button>
                    <button style="${btnStyle} background:#16a34a; color:#fff;" title="Imprimir este modelo"
                        onclick="event.stopPropagation(); impQueueImprimir('${item.id}', '${osId}')">
                        🖨️ Imprimir
                    </button>
                </td>
            </tr>
        `;
    }).join('');

}

function togglePedOSQueue() {
    const body = document.getElementById('ped-os-queue-body');
    const arrow = document.getElementById('ped-os-queue-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
}

window.togglePedCutStackOptions = function() {
    const schema = document.getElementById('ped-schema').value;
    const container = document.getElementById('cut-stack-options');
    if (schema === 'cut_stack') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
};

window.togglePedMultiArtes = function() {

    const schema = document.getElementById('ped-schema').value;

    const isMulti = schema === 'multi_artes';

    const container = document.getElementById('multi-artes-container');

    const startInput = document.getElementById('ped-start');

    const endInput = document.getElementById('ped-end');

    const dropArea = document.getElementById('ped-drop-area');

    const num1Select = document.getElementById('ped-numeracao');

    const num2Select = document.getElementById('ped-numeracao-2');



    if (isMulti) {

        container.style.display = 'block';

        if (startInput) startInput.parentElement.style.display = 'none';

        if (endInput) endInput.parentElement.style.display = 'none';

        if (dropArea) dropArea.style.display = 'none';

        const impInfo = document.getElementById('ped-file-info');

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

        const impInfo = document.getElementById('ped-file-info');

        if (impInfo && impFile.files.length) impInfo.style.display = 'block';

        if (num1Select) num1Select.parentElement.style.display = 'block';

        if (num2Select) num2Select.parentElement.style.display = 'block';

    }

};

window.editPedidoCustomNumeracao = function(fieldId) {
    const numSelect = document.getElementById(fieldId);
    if (!numSelect || !numSelect.value) {
        toast('Selecione uma numeração base primeiro antes de editar!', 'warning');
        return;
    }
    
    const impName = document.getElementById('ped-name').value.trim() || 'Modelo Imposição';
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
    const suffix = fieldId === 'ped-numeracao' ? ' Num1' : ' Num2';
    document.getElementById('num-name').value = impName + suffix;
    
    // Marca como um novo cadastro (clone)
    document.getElementById('num-id').value = '';
    toast(`Clonando base "${baseNum.name}" para edição customizada.`, 'info');
};

window.runPedImposition = async function (mode) {

    const fmtId = document.getElementById('ped-formato').value;

    const numId = document.getElementById('ped-numeracao').value;

    const saiId = document.getElementById('ped-saida').value;

    const start = parseInt(document.getElementById('ped-start').value);

    const end = parseInt(document.getElementById('ped-end').value);

    const schema = document.getElementById('ped-schema').value;

    const rotateEl = document.getElementById('ped-rotate-page');

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
        // Não exige arte, permite gerar apenas com a numeração
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



    if (window.showSaveFilePicker && mode !== 'print') {

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

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

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



    let payloadNumeracao = numeracao ? JSON.parse(JSON.stringify(numeracao)) : null;
    if (payloadNumeracao && state.csvData) {
        payloadNumeracao.csv_data = state.csvData;
    }

    const payload = {

        formato_id: fmtId,

        numeracao_id: numId || null,

        numeracao_2_id: num2Id || null,
        
        mapa_teatro_id: document.getElementById('ped-mapa-teatro')?.value || null,

        saida_id: saiId,

        formato: formato,

        saida: saida,

        numeracao: payloadNumeracao,

        numeracao_2: num2,

        seq_start: start,

        seq_end: end,

        seq_increment: 1,

        schema,

        print_mode: state.printMode,

        rotate_page: rotatePage,

        multi_artes: payloadMultiArtes,

        cut_stack_mode: document.getElementById('ped-cutstack-mode') ? document.getElementById('ped-cutstack-mode').value : 'independent',

        sheets_per_block: document.getElementById('ped-sheets-per-block') ? parseInt(document.getElementById('ped-sheets-per-block').value) || 50 : 50,

        block_depth: document.getElementById('ped-block-depth') ? parseInt(document.getElementById('ped-block-depth').value) || 1 : 1

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

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

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



        // 2. Verificar se o Agente Local (porta 9000) esta ativo
        // Tenta 127.0.0.1 e localhost (HTTPS->HTTP mixed content e tratado como excecao para loopback)
        let localActive = false;
        let agentBaseUrl = "";

        if (!localApiActive) {
            // Testa / e /api/status para compatibilidade com todas as versoes do exe
            const agentBases = ["http://127.0.0.1:9000", "http://localhost:9000"];
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

        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.type === "multi_file") {
                toast(`Baixando ${data.files.length} arquivos...`, 'info');
                for (const f of data.files) {
                    const binStr = atob(f.data);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) {
                        bytes[i] = binStr.charCodeAt(i);
                    }
                    const fBlob = new Blob([bytes], {type: "application/pdf"});
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
                
                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderImpOSQueue();
                }
                return;
            }
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

};

