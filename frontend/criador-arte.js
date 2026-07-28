/**
 * 🎨 Criador de Arte Interativo (Editor 2D para Ideal Imposition)
 * Baseado em Fabric.js v5.3.1
 */

window.editorState = {
    activeItemIdx: null,
    activeItem: null,
    osId: null,
    currentFace: 'frente', // 'frente' | 'verso'
    fabricCanvas: null,
    layer1Canvas: null,
    layer2Canvas: null,
    format: { width_mm: 180, height_mm: 50 },
    scalePxPerMm: 4.0, // Escala de visualização no editor (4px por mm para alta nitidez)
    zoom: 1.0,
    history: [],
    historyIndex: -1,
    isRestoringHistory: false
};

/**
 * Inicializa e abre o Criador de Arte para um modelo específico
 */
async function abrirCriadorDeArte(itemIdx, osId, face = 'frente') {
    const itens = state.osItens[osId] || [];
    const item = itens[itemIdx];
    if (!item) {
        toast('Modelo não encontrado.', 'error');
        return;
    }

    window.editorState.activeItemIdx = itemIdx;
    window.editorState.activeItem = item;
    window.editorState.osId = osId;
    window.editorState.currentFace = face;
    window.editorState.history = [];
    window.editorState.historyIndex = -1;

    // Atualizar UI de título e dimensões
    const nomeEl = document.getElementById('editor-modelo-nome');
    if (nomeEl) nomeEl.textContent = item.nome_produto_real || item.produto || `Modelo ${itemIdx + 1}`;

    // Configurar abas Frente/Verso
    const tabsEl = document.getElementById('editor-face-tabs');
    const tabFrente = document.getElementById('tab-editor-frente');
    const tabVerso = document.getElementById('tab-editor-verso');
    if (tabsEl) {
        tabsEl.style.display = item.verso ? 'flex' : 'none';
        if (tabFrente) tabFrente.className = face === 'frente' ? 'btn btn-sm active' : 'btn btn-sm';
        if (tabVerso) tabVerso.className = face === 'verso' ? 'btn btn-sm active' : 'btn btn-sm';
    }

    // Exibir view do editor
    const editorView = document.getElementById('view-criador-arte');
    if (editorView) {
        editorView.style.display = 'flex';
    }

    // Aguardar DOM renderizar o container
    setTimeout(() => {
        setupEditorWorkspace();
    }, 50);
}

/**
 * Fecha o Criador de Arte e retorna ao pedido
 */
function fecharCriadorDeArte() {
    const editorView = document.getElementById('view-criador-arte');
    if (editorView) {
        editorView.style.display = 'none';
    }
}

/**
 * Configura os 3 Canvases (Camada 1 Cor, Camada 3 Arte Fabric, Camada 2 Numeração)
 */
async function setupEditorWorkspace() {
    const item = window.editorState.activeItem;
    const osId = window.editorState.osId;
    const face = window.editorState.currentFace;

    if (!item) return;

    // Obter Cor, Numeração e Formato
    const corId = (face === 'verso' && item.amostra_cor_verso_id) ? item.amostra_cor_verso_id : item.amostra_cor_id;
    const numId = item.amostra_num_id;

    const cor = corId ? (state.cores || []).find(c => String(c.id) === String(corId)) : null;
    const num = numId ? (state.numeracoes || []).find(n => String(n.id) === String(numId)) : null;

    let fmt = null;
    if (cor && cor.formato_id) fmt = (state.formatos || []).find(f => String(f.id) === String(cor.formato_id));
    if (!fmt && num && num.formato_id) fmt = (state.formatos || []).find(f => String(f.id) === String(num.formato_id));
    if (!fmt && state.formatos && state.formatos.length > 0) fmt = state.formatos[0];
    if (!fmt) fmt = { width_mm: 180, height_mm: 50 };

    window.editorState.format = fmt;
    const dimEl = document.getElementById('editor-modelo-dimensoes');
    if (dimEl) dimEl.textContent = `${fmt.width_mm} x ${fmt.height_mm} mm`;

    // Resolução do Canvas (4 px por mm no editor para nitidez perfeita)
    const scalePx = 4.0;
    window.editorState.scalePxPerMm = scalePx;
    const canvasW = Math.round(fmt.width_mm * scalePx);
    const canvasH = Math.round(fmt.height_mm * scalePx);

    const stackWrapper = document.getElementById('editor-canvas-stack');
    if (stackWrapper) {
        stackWrapper.style.width = canvasW + 'px';
        stackWrapper.style.height = canvasH + 'px';
    }

    // 1. Camada 1: Canvas de Cor (Background)
    const l1 = document.getElementById('editor-canvas-layer1');
    if (l1) {
        l1.width = canvasW;
        l1.height = canvasH;
        l1.style.width = canvasW + 'px';
        l1.style.height = canvasH + 'px';
    }
    window.editorState.layer1Canvas = l1;

    // 2. Camada 2: Canvas de Numeração (Overlay)
    const l2 = document.getElementById('editor-canvas-layer2');
    if (l2) {
        l2.width = canvasW;
        l2.height = canvasH;
        l2.style.width = canvasW + 'px';
        l2.style.height = canvasH + 'px';
    }
    window.editorState.layer2Canvas = l2;

    // 3. Camada 3: Fabric.js Canvas (Arte Editável)
    const l3 = document.getElementById('editor-canvas-layer3');
    if (l3) {
        l3.width = canvasW;
        l3.height = canvasH;
    }

    // Destruir instância anterior do Fabric se existir
    if (window.editorState.fabricCanvas) {
        try { window.editorState.fabricCanvas.dispose(); } catch(e){}
    }

    if (typeof fabric !== 'undefined') {
        const fc = new fabric.Canvas('editor-canvas-layer3', {
            width: canvasW,
            height: canvasH,
            preserveObjectStacking: true,
            selection: true
        });

        // Eventos de seleção
        fc.on('selection:created', updateInspectorFromSelection);
        fc.on('selection:updated', updateInspectorFromSelection);
        fc.on('selection:cleared', clearInspectorPanel);
        fc.on('object:modified', saveEditorHistory);
        fc.on('object:added', saveEditorHistory);

        window.editorState.fabricCanvas = fc;

        // Se houver JSON salvo da arte, recarregar os objetos editáveis!
        const savedJson = face === 'verso' ? item.verso_arte_json : item.arte_json;
        if (savedJson) {
            try {
                fc.loadFromJSON(savedJson, () => {
                    fc.renderAll();
                    saveEditorHistory();
                });
            } catch(e) {
                console.warn('[Criador de Arte] Erro ao carregar JSON da arte salva:', e);
            }
        }
    }

    // Renderizar Camadas 1 e 2
    renderEditorLayer1Cor(cor, fmt, face);
    renderEditorLayer2Numeracao(num, fmt, face);

    // Ajustar zoom inicial à tela
    editorResetZoom();
}

/**
 * Renderiza a Camada 1 (Cor) no Canvas de Fundo
 */
async function renderEditorLayer1Cor(cor, fmt, face) {
    const l1 = window.editorState.layer1Canvas;
    if (!l1) return;
    const ctx = l1.getContext('2d');
    const scalePx = window.editorState.scalePxPerMm;
    ctx.clearRect(0, 0, l1.width, l1.height);

    let corRendered = false;
    if (cor && (cor.pdf_base64 || (face === 'verso' && cor.pdf_verso_base64)) && typeof pdfjsLib !== 'undefined') {
        try {
            const hasVersoFile = (face === 'verso' && cor.pdf_verso_base64);
            const rawPdfData = hasVersoFile ? cor.pdf_verso_base64 : cor.pdf_base64;
            const base64Data = rawPdfData.includes('base64,') ? rawPdfData.split('base64,')[1] : rawPdfData;
            const binStr = atob(base64Data);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const pageNum = (face === 'verso' && !hasVersoFile && pdf.numPages >= 2) ? 2 : 1;
            const page = await pdf.getPage(pageNum);

            const viewport = page.getViewport({ scale: 1.0 });
            const pdfScale = (fmt.width_mm * 2.8346) / viewport.width;
            const scaledViewport = page.getViewport({ scale: pdfScale * (scalePx / 2.8346) });

            const offCanvas = document.createElement('canvas');
            offCanvas.width = scaledViewport.width;
            offCanvas.height = scaledViewport.height;
            const offCtx = offCanvas.getContext('2d');
            await page.render({ canvasContext: offCtx, viewport: scaledViewport }).promise;

            const dx = (l1.width - offCanvas.width) / 2;
            const dy = (l1.height - offCanvas.height) / 2;
            ctx.drawImage(offCanvas, dx, dy, offCanvas.width, offCanvas.height);
            corRendered = true;
        } catch (e) {
            console.warn('[Criador de Arte] Erro ao renderizar camada 1:', e);
        }
    }

    if (!corRendered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, l1.width, l1.height);
    }
}

/**
 * Renderiza a Camada 2 (Numeração/Picote) no Canvas de Sobreposição
 */
function renderEditorLayer2Numeracao(num, fmt, face) {
    const l2 = window.editorState.layer2Canvas;
    if (!l2) return;
    const ctx = l2.getContext('2d');
    const scalePx = window.editorState.scalePxPerMm;
    ctx.clearRect(0, 0, l2.width, l2.height);

    if (!num || !num.elements) return;

    // Desenhar elementos de numeração e picote
    num.elements.forEach(el => {
        const elFace = el.face || 'both';
        if (face === 'verso') {
            if (el.type !== 'PICOTE' && elFace !== 'back' && elFace !== 'both') return;
        } else {
            if (elFace !== 'front' && elFace !== 'both' && el.type !== 'PICOTE') return;
        }

        let x = el.x_mm * scalePx;
        const y = el.y_mm * scalePx;
        const color = el.color || '#000000';
        const rot = (el.rotation || 0) * Math.PI / 180;

        if (face === 'verso' && el.type === 'PICOTE') {
            x = (fmt.width_mm - el.x_mm) * scalePx;
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);

        if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {
            const fs = (el.font_size || 12) * scalePx / 2.8346;
            ctx.font = typeof buildCanvasFont === 'function' ? buildCanvasFont(fs, el.font_name) : `${fs}px ${el.font_name || 'monospace'}`;
            ctx.fillStyle = color;
            ctx.fillText(el.text || '00001', 0, 0);
        } else if (el.type === 'PICOTE') {
            ctx.strokeStyle = '#ef4444';
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -1000);
            ctx.lineTo(0, 1000);
            ctx.stroke();
        }

        ctx.restore();
    });
}

/**
 * Alterna visibilidade de Camadas (Cor ou Numeração)
 */
function toggleEditorLayer(layer, visible) {
    if (layer === 'cor' && window.editorState.layer1Canvas) {
        window.editorState.layer1Canvas.style.display = visible ? 'block' : 'none';
    } else if (layer === 'num' && window.editorState.layer2Canvas) {
        window.editorState.layer2Canvas.style.display = visible ? 'block' : 'none';
    }
}

/**
 * Alterna entre abas Frente e Verso no editor
 */
function switchEditorFace(face) {
    if (window.editorState.currentFace === face) return;
    window.editorState.currentFace = face;

    const tabFrente = document.getElementById('tab-editor-frente');
    const tabVerso = document.getElementById('tab-editor-verso');
    if (tabFrente) tabFrente.className = face === 'frente' ? 'btn btn-sm active' : 'btn btn-sm';
    if (tabVerso) tabVerso.className = face === 'verso' ? 'btn btn-sm active' : 'btn btn-sm';

    setupEditorWorkspace();
}

/**
 * Controles de Zoom
 */
function editorZoomIn() {
    window.editorState.zoom *= 1.25;
    applyEditorZoom();
}
function editorZoomOut() {
    window.editorState.zoom /= 1.25;
    applyEditorZoom();
}
function editorResetZoom() {
    const container = document.getElementById('editor-workspace-container');
    const stack = document.getElementById('editor-canvas-stack');
    if (!container || !stack) return;

    const availableW = container.clientWidth - 80;
    const availableH = container.clientHeight - 80;
    const stackW = parseFloat(stack.style.width) || 800;
    const stackH = parseFloat(stack.style.height) || 400;

    const scaleX = availableW / stackW;
    const scaleY = availableH / stackH;
    window.editorState.zoom = Math.min(scaleX, scaleY, 1.5);
    applyEditorZoom();
}
function applyEditorZoom() {
    const stack = document.getElementById('editor-canvas-stack');
    const zoomText = document.getElementById('editor-zoom-level');
    const z = window.editorState.zoom;
    if (stack) {
        stack.style.transform = `scale(${z})`;
        stack.style.transformOrigin = 'center center';
    }
    if (zoomText) zoomText.textContent = Math.round(z * 100) + '%';
}

/**
 * Adicionar Texto
 */
function editorAdicionarTexto() {
    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    const text = new fabric.IText('Novo Texto', {
        left: fc.width / 2 - 60,
        top: fc.height / 2 - 20,
        fontSize: 28,
        fill: '#000000',
        fontFamily: 'Arial'
    });
    fc.add(text);
    fc.setActiveObject(text);
    fc.renderAll();
    saveEditorHistory();
}

/**
 * Adicionar Formas (Retângulo, Círculo, Linha)
 */
function editorAdicionarForma(tipo) {
    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    let shape;
    if (tipo === 'retangulo') {
        shape = new fabric.Rect({
            left: fc.width / 2 - 50,
            top: fc.height / 2 - 50,
            width: 100,
            height: 100,
            fill: '#0284c7',
            stroke: '#000000',
            strokeWidth: 1
        });
    } else if (tipo === 'circulo') {
        shape = new fabric.Circle({
            left: fc.width / 2 - 50,
            top: fc.height / 2 - 50,
            radius: 50,
            fill: '#10b981',
            stroke: '#000000',
            strokeWidth: 1
        });
    } else if (tipo === 'linha') {
        shape = new fabric.Line([50, 50, 200, 50], {
            left: fc.width / 2 - 75,
            top: fc.height / 2,
            stroke: '#000000',
            strokeWidth: 3
        });
    }

    if (shape) {
        fc.add(shape);
        fc.setActiveObject(shape);
        fc.renderAll();
        saveEditorHistory();
    }
}

/**
 * Gerar e Adicionar QR Code
 */
function editorAdicionarQRCodePrompt() {
    const conteudo = prompt('Digite a URL ou texto para o QR Code:', 'https://ingressoideal.com.br');
    if (!conteudo) return;

    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    // Gerar QR Code temporário
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    if (typeof QRCode !== 'undefined') {
        new QRCode(tempDiv, {
            text: conteudo,
            width: 256,
            height: 256
        });

        setTimeout(() => {
            const imgEl = tempDiv.querySelector('img') || tempDiv.querySelector('canvas');
            if (imgEl) {
                const src = imgEl.src || imgEl.toDataURL();
                fabric.Image.fromURL(src, (fImg) => {
                    fImg.scaleToWidth(120);
                    fImg.set({
                        left: fc.width / 2 - 60,
                        top: fc.height / 2 - 60
                    });
                    fc.add(fImg);
                    fc.setActiveObject(fImg);
                    fc.renderAll();
                    saveEditorHistory();
                });
            }
            document.body.removeChild(tempDiv);
        }, 100);
    }
}

/**
 * Upload de Imagem ou PDF
 */
function triggerEditorUploadImagem() {
    const input = document.getElementById('editor-file-input');
    if (input) input.click();
}

async function handleEditorFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
            toast('Carregando PDF no editor...', 'info');
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 2.0 });

            const offCanvas = document.createElement('canvas');
            offCanvas.width = vp.width;
            offCanvas.height = vp.height;
            const octx = offCanvas.getContext('2d');
            await page.render({ canvasContext: octx, viewport: vp }).promise;

            fabric.Image.fromURL(offCanvas.toDataURL(), (fImg) => {
                fImg.scaleToWidth(fc.width * 0.8);
                fImg.set({
                    left: (fc.width - fImg.scaledWidth) / 2,
                    top: (fc.height - fImg.scaledHeight) / 2
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                saveEditorHistory();
            });
        } catch (e) {
            toast('Erro ao carregar PDF: ' + e.message, 'error');
        }
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            fabric.Image.fromURL(e.target.result, (fImg) => {
                fImg.scaleToWidth(Math.min(fc.width * 0.7, fImg.width));
                fImg.set({
                    left: (fc.width - fImg.scaledWidth) / 2,
                    top: (fc.height - fImg.scaledHeight) / 2
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                saveEditorHistory();
            });
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

/**
 * Ações de Camadas Z-Index
 */
function editorMoverParaFrente() {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (obj) { fc.bringToFront(obj); fc.renderAll(); saveEditorHistory(); }
}
function editorEnviarParaTras() {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (obj) { fc.sendToBack(obj); fc.renderAll(); saveEditorHistory(); }
}
function editorDuplicarSelecionado() {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (obj) {
        obj.clone((cloned) => {
            cloned.set({
                left: obj.left + 15,
                top: obj.top + 15
            });
            fc.add(cloned);
            fc.setActiveObject(cloned);
            fc.renderAll();
            saveEditorHistory();
        });
    }
}
function editorDeletarSelecionado() {
    const fc = window.editorState.fabricCanvas;
    const active = fc ? fc.getActiveObjects() : [];
    if (active.length > 0) {
        active.forEach(o => fc.remove(o));
        fc.discardActiveObject();
        fc.renderAll();
        saveEditorHistory();
    }
}

/**
 * Painel de Propriedades (Inspector)
 */
function updateInspectorFromSelection() {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    const noSel = document.getElementById('editor-no-selection');
    const controls = document.getElementById('editor-controls-active');
    const textControls = document.getElementById('editor-text-controls');

    if (!obj) {
        clearInspectorPanel();
        return;
    }

    if (noSel) noSel.style.display = 'none';
    if (controls) controls.style.display = 'flex';

    // Opacidade
    const opInput = document.getElementById('prop-opacity');
    const opVal = document.getElementById('prop-opacity-val');
    if (opInput) opInput.value = obj.opacity !== undefined ? obj.opacity : 1;
    if (opVal) opVal.textContent = Math.round((obj.opacity !== undefined ? obj.opacity : 1) * 100) + '%';

    // Cores
    const fillInput = document.getElementById('prop-fill-color');
    if (fillInput && typeof obj.fill === 'string') fillInput.value = obj.fill;

    const strokeInput = document.getElementById('prop-stroke-color');
    if (strokeInput && typeof obj.stroke === 'string') strokeInput.value = obj.stroke;

    // Multiply
    const multCheck = document.getElementById('prop-multiply-blend');
    if (multCheck) multCheck.checked = obj.globalCompositeOperation === 'multiply';

    // Controles de Texto
    if (textControls) {
        if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
            textControls.style.display = 'flex';
            const fontSel = document.getElementById('prop-font-family');
            if (fontSel) fontSel.value = obj.fontFamily || 'Arial';

            const sizeIn = document.getElementById('prop-font-size');
            if (sizeIn) sizeIn.value = obj.fontSize || 24;
        } else {
            textControls.style.display = 'none';
        }
    }
}

function clearInspectorPanel() {
    const noSel = document.getElementById('editor-no-selection');
    const controls = document.getElementById('editor-controls-active');
    if (noSel) noSel.style.display = 'block';
    if (controls) controls.style.display = 'none';
}

function editorUpdateProperty(prop, value) {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj) return;

    obj.set(prop, value);
    fc.renderAll();
    saveEditorHistory();
}

function editorToggleTextStyle(style) {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj) return;

    if (style === 'bold') {
        obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold');
    } else if (style === 'italic') {
        obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic');
    } else if (style === 'underline') {
        obj.set('underline', !obj.underline);
    }
    fc.renderAll();
    saveEditorHistory();
}

function editorToggleMultiply(checked) {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj) return;

    obj.set('globalCompositeOperation', checked ? 'multiply' : 'source-over');
    fc.renderAll();
    saveEditorHistory();
}

/**
 * Histórico Undo / Redo
 */
function saveEditorHistory() {
    if (window.editorState.isRestoringHistory) return;
    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    const json = JSON.stringify(fc.toJSON());
    window.editorState.history = window.editorState.history.slice(0, window.editorState.historyIndex + 1);
    window.editorState.history.push(json);
    window.editorState.historyIndex++;
}

function editorUndo() {
    if (window.editorState.historyIndex > 0) {
        window.editorState.historyIndex--;
        restoreEditorHistory();
    }
}
function editorRedo() {
    if (window.editorState.historyIndex < window.editorState.history.length - 1) {
        window.editorState.historyIndex++;
        restoreEditorHistory();
    }
}
function restoreEditorHistory() {
    const fc = window.editorState.fabricCanvas;
    const json = window.editorState.history[window.editorState.historyIndex];
    if (fc && json) {
        window.editorState.isRestoringHistory = true;
        fc.loadFromJSON(json, () => {
            fc.renderAll();
            window.editorState.isRestoringHistory = false;
        });
    }
}

/**
 * 💾 Salvar Arte no Modelo
 */
async function salvarArteDoEditor() {
    const item = window.editorState.activeItem;
    const itemIdx = window.editorState.activeItemIdx;
    const osId = window.editorState.osId;
    const face = window.editorState.currentFace;
    const fc = window.editorState.fabricCanvas;

    if (!item || !fc) return;

    try {
        toast('Salvando arte no modelo...', 'info');

        // 1. Exportar JSON de estrutura editável
        const jsonStructure = JSON.stringify(fc.toJSON());

        // 2. Exportar imagem PNG de alta resolução da Camada 3 (sem fundo nem numeração)
        const base64DataUrl = fc.toDataURL({
            format: 'png',
            multiplier: 2.0
        });

        // 3. Atualizar o objeto local do item
        if (face === 'verso') {
            item.verso_amostra_arte_base64 = base64DataUrl;
            item.verso_arte_url = base64DataUrl;
            item.verso_arte_json = jsonStructure;
        } else {
            item.amostra_arte_base64 = base64DataUrl;
            item.arte_url = base64DataUrl;
            item.arte_json = jsonStructure;
        }

        // 4. Salvar no Supabase / Banco
        const numInt = parseInt(osId);
        const dataToSave = face === 'verso' ? {
            verso_amostra_arte_base64: base64DataUrl,
            verso_arte_url: base64DataUrl,
            verso_arte_json: jsonStructure
        } : {
            amostra_arte_base64: base64DataUrl,
            arte_url: base64DataUrl,
            arte_json: jsonStructure
        };

        if (!isNaN(numInt) && typeof saveAmostraToDB === 'function') {
            await saveAmostraToDB(item.id, osId, dataToSave);
        }

        toast('Arte salva com sucesso no modelo!', 'success');

        // 5. Fechar editor e re-renderizar prévia combinada de 3 camadas
        fecharCriadorDeArte();

        if (typeof renderItemAmostraCombinada === 'function') {
            await renderItemAmostraCombinada(itemIdx, osId);
        }

    } catch (err) {
        console.error('[Criador de Arte] Erro ao salvar arte:', err);
        toast('Erro ao salvar arte: ' + err.message, 'error');
    }
}

// Expor funções globais para HTML
window.abrirCriadorDeArte = abrirCriadorDeArte;
window.fecharCriadorDeArte = fecharCriadorDeArte;
window.switchEditorFace = switchEditorFace;
window.toggleEditorLayer = toggleEditorLayer;
window.editorZoomIn = editorZoomIn;
window.editorZoomOut = editorZoomOut;
window.editorResetZoom = editorResetZoom;
window.editorAdicionarTexto = editorAdicionarTexto;
window.editorAdicionarForma = editorAdicionarForma;
window.editorAdicionarQRCodePrompt = editorAdicionarQRCodePrompt;
window.triggerEditorUploadImagem = triggerEditorUploadImagem;
window.handleEditorFileUpload = handleEditorFileUpload;
window.editorMoverParaFrente = editorMoverParaFrente;
window.editorEnviarParaTras = editorEnviarParaTras;
window.editorDuplicarSelecionado = editorDuplicarSelecionado;
window.editorDeletarSelecionado = editorDeletarSelecionado;
window.editorUpdateProperty = editorUpdateProperty;
window.editorToggleTextStyle = editorToggleTextStyle;
window.editorToggleMultiply = editorToggleMultiply;
window.editorUndo = editorUndo;
window.editorRedo = editorRedo;
window.salvarArteDoEditor = salvarArteDoEditor;
