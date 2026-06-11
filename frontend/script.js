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

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

        btn.classList.add('active');

        const view = document.getElementById(btn.dataset.view);

        if (view) view.classList.add('active');

    });

});



// ─── API Helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body = null) {

    if (typeof supabaseClient !== 'undefined' && supabaseClient && (path.startsWith('/formatos') || path.startsWith('/numeracoes') || path.startsWith('/saidas') || path.startsWith('/cores') || path.startsWith('/modelos_imposicao'))) {

        const parts = path.substring(1).split('/');

        const col = parts[0];

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

                let id = body.id || (col.substring(0,3) + '_' + Date.now().toString(36) + Math.random().toString(36).substring(2,6));

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



    // Imposição

    ['imp-formato', 'imp-numeracao', 'imp-numeracao-2', 'imp-saida'].forEach(id => {

        const sel = document.getElementById(id);

        const cur = sel.value;

        if (id === 'imp-formato') {

            sel.innerHTML = '<option value="">— Selecione —</option>' +

                state.formatos.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        } else if (id === 'imp-numeracao' || id === 'imp-numeracao-2') {

            const selectedFmt = document.getElementById('imp-formato')?.value;

            const filteredNums = selectedFmt ? state.numeracoes.filter(n => n.formato_id === selectedFmt) : state.numeracoes;

            sel.innerHTML = '<option value="">— Sem numeração —</option>' +

                filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        } else {

            sel.innerHTML = '<option value="">— Selecione —</option>' +

                state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        }

        if (cur) {

            const optionExists = Array.from(sel.options).some(opt => opt.value === cur);

            if (optionExists) sel.value = cur;

            else sel.value = '';

        }

    });



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

            ? state.numeracoes.filter(n => n.formato_id === selectedCor.formato_id) 

            : state.numeracoes;

        selAmNum.innerHTML = '<option value="">— Selecione uma Numeração —</option>' +

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');

        if (cur && filteredNums.some(n => n.id === cur)) selAmNum.value = cur;

        else selAmNum.value = '';

    }

}



// ─── NUMERAÇÃO EDITOR ─────────────────────────────────────────────────────────



function renderNumeracoes() {

    const container = document.getElementById('catalogo-container');

    const empty = document.getElementById('empty-catalogo');



    // Filtros

    const searchVal = (document.getElementById('catalogo-search')?.value || '').toLowerCase();

    const filterFmt = document.getElementById('catalogo-filter-format')?.value || '';



    const filtradas = state.numeracoes.filter(n => {

        if (filterFmt && n.formato_id !== filterFmt) return false;

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

    if (state.numPdfContent) {

        const btn = document.getElementById('btn-remove-num-pdf');

        const name = document.getElementById('num-pdf-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + state.numPdfFilename;



        if (typeof pdfjsLib !== 'undefined') {

            let pdfSrc = state.numPdfContent;

            if (pdfSrc.startsWith('data:')) {

                const b64 = pdfSrc.split(',')[1];

                const binaryString = atob(b64);

                const bytes = new Uint8Array(binaryString.length);

                for (let i = 0; i < binaryString.length; i++) {

                    bytes[i] = binaryString.charCodeAt(i);

                }

                pdfSrc = bytes;

            }

            if (typeof pdfSrc === 'string' && pdfSrc.startsWith('http')) {

                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

                pdfSrc = `${baseUrl}/api/proxy?url=${encodeURIComponent(pdfSrc)}`;

            }

            const loadArgs = (typeof pdfSrc === 'string') ? { url: pdfSrc } : { data: pdfSrc };

            pdfjsLib.getDocument(loadArgs).promise.then(async pdf => {

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

    renderElementsList();

    drawCanvas();

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



// Quando o formato é selecionado, mostrar editor

window.onFormatoSelect = function (clearElements = true) {

    const fmtId = document.getElementById('num-formato').value;

    if (!fmtId) {

        document.getElementById('numeracao-editor').style.display = 'none';

        return;

    }

    state.numFormato = state.formatos.find(f => f.id === fmtId);

    if (!state.numFormato) return;



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



    // Arte de fundo (camada de referência semitransparente em tamanho original e centralizada)

    if (state.bgImage) {

        const MM2PT = 2.8346;

        let originalW_mm = 0;

        let originalH_mm = 0;



        if (state.bgImage.originalPdfWidthPt) {

            // Se for PDF, usar os pontos originais dividindo por MM2PT (72 / 25.4 = 2.8346)

            originalW_mm = state.bgImage.originalPdfWidthPt / MM2PT;

            originalH_mm = state.bgImage.originalPdfHeightPt / MM2PT;

        } else {

            // Se for imagem (JPG/PNG), obter o DPI lido ou adotar 300 DPI como fallback de alta resolução

            const dpi = state.bgImage.dpiValue || 300;

            // pixels / dpi * 25.4 (conversão para mm)

            originalW_mm = (state.bgImage.width / dpi) * 25.4;

            originalH_mm = (state.bgImage.height / dpi) * 25.4;

        }



        const drawW = originalW_mm * S;

        const drawH = originalH_mm * S;

        const drawX = (W - drawW) / 2;

        const drawY = (H - drawH) / 2;



        ctx.globalAlpha = 0.55;

        ctx.drawImage(state.bgImage, drawX, drawY, drawW, drawH);

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



    // Renderizar elementos

    state.numElements.forEach(el => drawElement(ctx, el, S));

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

        let fontStyle = 'Inter, sans-serif';

        if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';

        else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';

        else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';

        else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';

        else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';



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

        const imgObj = el.type === 'SVG' ? state.numSvgImage : state.numPdfImage;

        const title = el.type === 'SVG' ? 'SVG' : 'PDF';

        if (imgObj) {

            ctx.drawImage(imgObj, 0, 0, w, h);

        } else {

            ctx.strokeStyle = color;

            ctx.lineWidth = 1;

            ctx.strokeRect(0, 0, w, h);

            ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;

            ctx.fillStyle = color;

            ctx.textAlign = 'center';

            ctx.fillText(title + ' (Sem arquivo)', w / 2, h / 2 + (h * 0.05));

            ctx.textAlign = 'left';

        }

        if (isSelected) {

            ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 1.5;

            ctx.setLineDash([4, 2]);

            ctx.strokeRect(-2, -2, w + 4, h + 4);

            ctx.setLineDash([]);

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

            let fontStyle = 'Inter, sans-serif';

            if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';

            else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';

            else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';

            else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';

            else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';

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

    if (type === 'PDF') Object.assign(base, { width_mm: state.numPdfOriginalW || 20, height_mm: state.numPdfOriginalH || 20, pdf_content: state.numPdfContent || '' });

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

                <div class="form-group"><label>Fonte</label>

                    <select class="form-control" onchange="updateEl('${el.id}','font_name',this.value)">

                        <option value="helv" ${el.font_name === 'helv' ? 'selected' : ''}>Sans-Serif (Helvetica)</option>

                        <option value="helv-bold" ${el.font_name === 'helv-bold' ? 'selected' : ''}>Sans-Serif Bold</option>

                        <option value="times" ${el.font_name === 'times' ? 'selected' : ''}>Serif (Times)</option>

                        <option value="times-bold" ${el.font_name === 'times-bold' ? 'selected' : ''}>Serif Bold</option>

                        <option value="cour" ${el.font_name === 'cour' ? 'selected' : ''}>Monospace (Courier)</option>

                        <option value="cour-bold" ${el.font_name === 'cour-bold' ? 'selected' : ''}>Monospace Bold</option>

                    </select>

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

                <div class="form-group"><label>Fonte</label>

                    <select class="form-control" onchange="updateEl('${el.id}','font_name',this.value)">

                        <option value="helv" ${el.font_name === 'helv' ? 'selected' : ''}>Sans-Serif (Helvetica)</option>

                        <option value="helv-bold" ${el.font_name === 'helv-bold' ? 'selected' : ''}>Sans-Serif Bold</option>

                        <option value="times" ${el.font_name === 'times' ? 'selected' : ''}>Serif (Times)</option>

                        <option value="times-bold" ${el.font_name === 'times-bold' ? 'selected' : ''}>Serif Bold</option>

                        <option value="cour" ${el.font_name === 'cour' ? 'selected' : ''}>Monospace (Courier)</option>

                        <option value="cour-bold" ${el.font_name === 'cour-bold' ? 'selected' : ''}>Monospace Bold</option>

                    </select>

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

            csv_filename: state.numCsvFilename || "",

            csv_headers: state.numCsvHeaders || [],

            csv_data: state.numCsvData || null,

            svg_content: svgUrl || "",

            svg_filename: state.numSvgFilename || "",

            pdf_content: pdfUrl || "",

            pdf_filename: state.numPdfFilename || "",

            elements: state.numElements.map(el => {

                const e = { ...el };

                if (e.type === 'FIXED') e.fixed = true;

                if (e.type === 'SVG') e.svg_content = svgUrl || "";

                if (e.type === 'PDF') e.pdf_content = pdfUrl || "";

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



        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

        document.getElementById('nav-catalogo').classList.add('active');

        document.getElementById('view-catalogo').classList.add('active');



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

                        let fontStyle = 'Inter, sans-serif';

                        if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';

                        else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';

                        else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';

                        else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';

                        else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';



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

                                    let pdfData;

                                    const content = el.pdf_content;

                                    if (content.startsWith('http')) {

                                        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

                                        const resp = await fetch(`${baseUrl}/api/proxy?url=${encodeURIComponent(content)}`);

                                        pdfData = await resp.arrayBuffer();

                                    } else {

                                        const b64 = content.includes('base64,') ? content.split('base64,')[1] : content;

                                        const binStr = atob(b64);

                                        const bytes = new Uint8Array(binStr.length);

                                        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

                                        pdfData = bytes.buffer;

                                    }

                                    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                                    const page = await pdf.getPage(1);

                                    const vp = page.getViewport({ scale: 2 });

                                    const offCanvas = document.createElement('canvas');

                                    offCanvas.width = Math.round(vp.width);

                                    offCanvas.height = Math.round(vp.height);

                                    const octx = offCanvas.getContext('2d');

                                    // background: 'rgba(0,0,0,0)' impede o PDF.js de preencher o fundo com branco

                                    await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;

                                    el._pdfCanvas = offCanvas;

                                    delete el._pdfLoading;

                                    drawPreview(); // redesenhar o preview após carregar

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



    // Gerar options das numerações

    const numOptions = `<option value="">- Nenhuma -</option>` + state.numeracoes.map(n => `<option value="${n.id}">${n.name}</option>`).join('');



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

        const filteredNums = currentFmtId ? state.numeracoes.filter(n => n.formato_id === currentFmtId) : state.numeracoes;

        

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

                        let pdfData;

                        const content = el.pdf_content;

                        if (content.startsWith('http')) {

                            const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

                            const resp = await fetch(`${baseUrl}/api/proxy?url=${encodeURIComponent(content)}`);

                            pdfData = await resp.arrayBuffer();

                        } else {

                            const b64 = content.includes('base64,') ? content.split('base64,')[1] : content;

                            const binStr = atob(b64);

                            const bytes = new Uint8Array(binStr.length);

                            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

                            pdfData = bytes.buffer;

                        }

                        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                        const page = await pdf.getPage(1);

                        const vp = page.getViewport({ scale: 2 });

                        const offCanvas = document.createElement('canvas');

                        offCanvas.width = Math.round(vp.width);

                        offCanvas.height = Math.round(vp.height);

                        const octx = offCanvas.getContext('2d');

                        // background: 'rgba(0,0,0,0)' impede o PDF.js de preencher o fundo com branco

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

    

    const containerW = refCanvas.parentElement.clientWidth - 30; // compensar padding

    return containerW / activeFmt.width_mm;

}



window.onAmostraCorSelect = async function() {

    const corId = document.getElementById('amostra-cor').value;

    const canvas = document.getElementById('amostra-cor-canvas');

    const empty = document.getElementById('amostra-cor-empty');

    const badge = document.getElementById('amostra-cor-badge');

    

    // Filtrar as numerações com base no formato associado a esta cor

    const cor = corId ? state.cores.find(c => c.id === corId) : null;

    const numSelect = document.getElementById('amostra-numeracao');

    if (numSelect) {

        const curNumVal = numSelect.value;

        const filteredNums = (cor && cor.formato_id) ? state.numeracoes.filter(n => n.formato_id === cor.formato_id) : state.numeracoes;

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

            

            const context = canvas.getContext('2d');

            canvas.width = scaledViewport.width;

            canvas.height = scaledViewport.height;

            

            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

            

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

};



window.onAmostraNumeracaoSelect = function() {

    const numId = document.getElementById('amostra-numeracao').value;

    const canvas = document.getElementById('amostra-num-canvas');

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

                let fontStyle = 'Inter, sans-serif';

                if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';

                else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';

                else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';

                else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';

                else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';



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

};



window.clearAmostraArteFile = function() {

    amostraArteImage = null;

    amostraArteWidth = 0;

    amostraArteHeight = 0;

    document.getElementById('amostra-arte-file').value = '';

    document.getElementById('amostra-arte-file-name').textContent = '';

    document.getElementById('btn-remove-amostra-arte').style.display = 'none';

    document.getElementById('amostra-arte-badge').textContent = 'Sem Arte';

    

    const canvas = document.getElementById('amostra-arte-canvas');

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

    const canvas = document.getElementById('amostra-arte-canvas');

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

            

            const context = canvas.getContext('2d');

            canvas.width = scaledViewport.width;

            canvas.height = scaledViewport.height;

            

            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

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



    const corCanvas = document.getElementById('amostra-cor-canvas');

    const arteCanvas = document.getElementById('amostra-arte-canvas');

    const numCanvas = document.getElementById('amostra-num-canvas');



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

    if (corId && corCanvas && corCanvas.style.display !== 'none' && corCanvas.width > 0) {

        const dx = (finalWidth - corCanvas.width) / 2;

        const dy = (finalHeight - corCanvas.height) / 2;

        ctx.drawImage(corCanvas, dx, dy, corCanvas.width, corCanvas.height);

    } else {

        // Se não tiver cor selecionada, desenha uma base branca para podermos visualizar as outras camadas

        ctx.fillStyle = '#ffffff';

        ctx.fillRect(0, 0, finalWidth, finalHeight);

    }



    // 2. Desenhar a Camada 2: Arte com efeito similar ao Photoshop Multiply (lendo a dimensão e centralizando em um canvas intermediário do tamanho da Cor)

    if (hasArte && arteCanvas && arteCanvas.style.display !== 'none' && arteCanvas.width > 0) {

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

    if (numId && numCanvas && numCanvas.style.display !== 'none' && numCanvas.width > 0) {

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



