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
            if (Array.from(saidaSel.options).some(opt => String(opt.value) === String(fmt.default_saida_id))) {
                saidaSel.value = fmt.default_saida_id;
            }
        }
    }
    
    // Cut & Stack mode
    if (fmt.default_cut_stack_mode) {
        const modeSel = document.getElementById('ped-cutstack-mode');
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
window.applyPedFormatoDefaults = applyPedFormatoDefaults;

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
window.populatePedNumeracoes = populatePedNumeracoes;

async function loadPedArtFile(file) {
    state.pedArtFile = file;

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
window.loadPedArtFile = loadPedArtFile;

function drawPedPreview() { console.log('drawPedPreview CALLED');

    let fmtId, numId, saiId, start, end, schema = 'strict_assembly';
    const activeItem = state.activeOSItem;
    if (activeItem) {
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
            schema = item.cut_stack_mode || document.getElementById('ped-cutstack-mode')?.value || 'strict_assembly';
        }
    } else {
        fmtId = document.getElementById('ped-formato')?.value;
        numId = document.getElementById('ped-numeracao')?.value;
        saiId = document.getElementById('ped-saida')?.value;
        start = parseInt(document.getElementById('ped-start')?.value) || 1;
        end = parseInt(document.getElementById('ped-end')?.value) || 100;
        schema = document.getElementById('ped-schema')?.value || 'strict_assembly';
    }

    const canvas = document.getElementById('ped-preview-canvas');
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

        document.getElementById('ped-preview-sheet-num').textContent = 'Sem Configuração';

        return;

    }



    const fmt = state.formatos.find(f => String(f.id) === String(fmtId));
    const sai = state.saidas.find(s => String(s.id) === String(saiId));

    if (!fmt || !sai) return;
    
    const previewPartEl = document.getElementById('ped-preview-part-input');
    let previewPart = 'miolo';
    if (previewPartEl) {
        if (fmt.has_cover) {
            previewPartEl.style.display = 'inline-block';
            previewPart = previewPartEl.value;
        } else {
            previewPartEl.style.display = 'none';
            previewPartEl.value = 'miolo';
            previewPart = 'miolo';
        }
    }

    const num = state.numeracoes.find(n => String(n.id) === String(numId)) || null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;



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
        const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
        stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        if (cutstackMode === 'strict') {
            is_strict_mode = true;
            const itemsPerSet = stack_size * poses_per_sheet;
            const sets_needed = Math.ceil(total_items / itemsPerSet);
            total_sheets = sets_needed * stack_size;
        }
    }

    document.getElementById('ped-preview-sheet-num').textContent = `Folha ${window.currentPreviewPage || 1} de ${total_sheets}`;

    const isBack = state.previewFace === 'back';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const P = row * cols + col;

            let S = (window.currentPreviewPage || 1) - 1;
            if (S >= total_sheets) S = total_sheets - 1;
            if (S < 0) S = 0;

            let item_index = (S * poses_per_sheet) + P;
            if (schema === "cut_stack") {
                const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
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



            let activePdfDoc = state.pedArtPdfDoc;

            let activeImage = state.pedArtImage;

            let isMultiArtePdf = false;

            let art_orig_w = state.pedArtWidth;

            let art_orig_h = state.pedArtHeight;



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

                            pageNum = isBack ? 2 : 1;

                        }



                        if (pageNum <= activePdfDoc.numPages) {

                            let pagesCache = isMultiArtePdf ? multiArteItem.pagesCache : state.pedArtPagesCache;

                            let pagesRendering = isMultiArtePdf ? multiArteItem.pagesRendering : state.pedArtPagesRendering;

                            if (!pagesCache) {

                                pagesCache = {};

                                if (isMultiArtePdf) multiArteItem.pagesCache = pagesCache;

                                else state.pedArtPagesCache = pagesCache;

                            }

                            if (!pagesRendering) {

                                pagesRendering = {};

                                if (isMultiArtePdf) multiArteItem.pagesRendering = pagesRendering;

                                else state.pedArtPagesRendering = pagesRendering;

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

                                            drawPedPreview(); // Redesenhar o preview principal

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
                    
                    const blocoNum = String(P + 1).padStart(2, '0');
                    const wBloco = ctx.measureText(`Bloco ${blocoNum}`).width;
                    
                    const textX = -cw/2 + (xPdf * MM2PT * scale);
                    const textY = -ch/2 + (yPdf * MM2PT * scale);
                    
                    ctx.fillText(`Bloco ${blocoNum}`, textX, textY);
                    ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                    
                    const seqStartInput = document.getElementById('ped-start');
                    const seqStart = (seqStartInput && seqStartInput.value) ? parseInt(seqStartInput.value) : 1;
                    const sheetsInput = document.getElementById('ped-sheets-per-block');
                    const sheetsPerBlock = (sheetsInput && sheetsInput.value && sheetsInput.offsetParent !== null) 
                        ? parseInt(sheetsInput.value) 
                        : (parseInt(fmt.default_sheets_per_block) || 50);
                        
                    const iStart = P * sheetsPerBlock;
                    const iEnd = iStart + sheetsPerBlock - 1;
                    const vStartStr = String(seqStart + iStart).padStart(4, '0');
                    const vEndStr = String(seqStart + iEnd).padStart(4, '0');
                    
                    ctx.fillText(` - de ${vStartStr} a ${vEndStr}`, textX + wBloco, textY);
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

                currentNum.elements.forEach(el => {

                    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

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



                    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_')) {

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
                        const hsz = sz / 2;

                        ctx.fillStyle = color;

                        ctx.fillRect(-hsz, -hsz, sz, sz);

                        ctx.fillStyle = '#ffffff';

                        const cell = sz / 7;

                        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(-hsz + cx * cell, -hsz + cy * cell, 3 * cell, 3 * cell);

                            ctx.fillStyle = color;

                            ctx.fillRect(-hsz + cx * cell + cell * 0.5, -hsz + cy * cell + cell * 0.5, 2 * cell, 2 * cell);

                        }

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

                                    drawPedPreview();

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
window.drawPedPreview = drawPedPreview;

function updatePedSummary() { console.log('updatePedSummary CALLED. Num value:', document.getElementById('ped-numeracao')?.value);

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



    const fmtId = document.getElementById('ped-formato').value;

    const numId = document.getElementById('ped-numeracao').value;

    const saiId = document.getElementById('ped-saida').value;

    const start = parseInt(document.getElementById('ped-start').value) || 1;

    const end = parseInt(document.getElementById('ped-end').value) || 100;

    const box = document.getElementById('ped-summary');



    const num = state.numeracoes.find(n => String(n.id) === String(numId)) || null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;

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

    const faceContainer = document.getElementById('ped-preview-face-container');

    if (faceContainer) {

        if (state.printMode === 'duplex') {

            faceContainer.style.display = 'block';

        } else {

            faceContainer.style.display = 'none';

            state.previewFace = 'front';

            const btnFront = document.getElementById('ped-btn-preview-front');

            const btnBack = document.getElementById('ped-btn-preview-back');

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
window.updatePedSummary = updatePedSummary;

function clearPedActiveOS() {

    state.loadedOSName = "";

    state.expectedArteName = "";

    

    const activeOsStatus = document.getElementById('ped-active-os-status');

    const activeOsName = document.getElementById('ped-active-os-name');

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
window.clearPedActiveOS = clearPedActiveOS;

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
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched via Cor "${item.cor}" → ${formatoId}`);
        }
    }

    // Tentar match do formato via Nome da arte
    if (!formatoId && item.formato) {
        formatoId = matchFormato(item.formato);
        if (formatoId) {
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched via Nome: "${item.formato}" → ${formatoId}`);
        }
    }
    
    // Tentar match do formato via Nome da Numeração
    if (!formatoId && item.numeracao) {
        formatoId = matchFormato(item.numeracao);
        if (formatoId) {
            autoSaveOSItemField(itemId, osId, 'formato_id', formatoId);
            console.log(`[OS→Imp] Formato matched via Numeração: "${item.numeracao}" → ${formatoId}`);
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
    setTimeout(() => { renderPedOSQueue(); }, 600);
    
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
            console.warn(`[OS→Imp] Nenhuma arte encontrada para item ${item.id} (cor: ${item.cor || item.padrao || ''})`);
        }
    }, 700);

    const os = state.ordens.find(o => o.id === osId);
    const osNum = os ? os.numero : '';
    const formatoObjToast = state.formatos ? state.formatos.find(f => String(f.id) === String(formatoId)) : null;
    const nomeFmtToast = formatoObjToast ? formatoObjToast.name : (item.formato || 'Formato Não Definido');
    toast(`Item "${item.produto} -- ${nomeFmtToast}" da OS #${osNum} carregado na Imposição!`, 'info');
}
window.enviarParaPedido = enviarParaPedido;

function renderPedOSQueue() {
    const container = document.getElementById( 'ped-os-queue' );
    const wrapper = document.getElementById( 'ped-os-queue-body' );
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
    const inputStyle = 'background:#0f172a; border:1px solid #334155; border-radius:4px; color:#f1f5f9; padding:8px 10px; font-size:1.0rem; width:100%;';
    const selectStyle = 'background:#0f172a; border:1px solid #334155; border-radius:4px; color:#f1f5f9; padding:8px 10px; font-size:1.0rem; width:100%; cursor:pointer;';
    const selectStyleDisabled = 'background:#1e293b; border:1px solid #334155; border-radius:4px; color:#94a3b8; padding:8px 10px; font-size:1.0rem; width:100%; cursor:not-allowed;';
    const btnStyle = 'border:none; border-radius:4px; padding:8px 14px; font-size:0.95rem; cursor:pointer; font-weight:600; transition:opacity 0.2s;';

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

        const setorBadge = setorPcp ? `<span class="badge bg-secondary ms-2" style="font-size:0.7rem; vertical-align:middle;">${setorPcp}</span>` : '';

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
                <span id="box-arrow-${prodId}-renderPedOSQueue" style="color:var(--text-dim); font-size:0.8rem; transition: transform 0.2s; margin-left:5px; cursor:pointer;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">▼</span>
            </div>
        `;

        html += `
        <div class="card mb-3" style="background:#1e293b; border: 2px solid var(--blue); border-radius: 6px; overflow:hidden;" data-setor="${setorPcp}">
            <div class="card-header d-flex justify-content-between align-items-center" style="background:#0f172a; padding: 10px 15px; border-bottom:1px solid var(--blue);">
                <div style="cursor:pointer; display:flex; align-items:center; flex:1;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">
                    <h5 class="mb-0" style="color:var(--warning); font-size:1.1rem; font-weight:bold;">
                        <i class="fas fa-box-open me-2" style="color:var(--blue);"></i>${nomeReal} ${setorBadge}
                    </h5>
                </div>
                ${headerDropdowns}
            </div>
            <div class="table-responsive" id="box-body-${prodId}-renderPedOSQueue">
                <table class="data-table table-dark table-sm mb-0 align-middle" style="font-size:1.0rem; margin:0; width:100%; border:none;">
                    <tbody>
        `;

        html += groupItens.map((item, idx) => {
            const isActive = activeItem.itemId === item.id || String(activeItem.itemId) === String(item.id);
            const rowBg = isActive ? 'background: rgba(249, 115, 22, 0.8); border-left: 5px solid #ea580c;' : 'border-bottom: 1px solid #334155;';

            let itemFmtId = boxFmtSel;

            const coresItem = todasCores.filter(c => !itemFmtId || !c.formato_id || String(c.formato_id) === String(itemFmtId));
            const numsItem  = todasNums.filter(n  => !itemFmtId || !n.formato_id  || String(n.formato_id)  === String(itemFmtId));

            const corIdAtual   = item.amostra_cor_id ? String(item.amostra_cor_id) : null;
            const corNomeAtual = item.cor || item.padrao || '';
            const coresOptions = coresItem.map(c => {
                const sel = (corIdAtual && String(c.id) === corIdAtual) || (!corIdAtual && corNomeAtual && globalFuzzyMatch(c.name, corNomeAtual)) ? 'selected' : '';
                return `<option value="${c.id}" ${sel}>${c.name}</option>`;
            }).join('');

            const numValDisplay = item.gabarito_operacional || item.numeracao || '';
            const numsOptions = numsItem.map(n => {
                const sel = globalFuzzyMatch(n.name || n.tipo || '', numValDisplay) ? 'selected' : '';
                return `<option value="${n.id}" ${sel}>${n.name || n.tipo}</option>`;
            }).join('');

            const niVal = item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || '');
            const nfVal = item.num_final !== undefined && item.num_final !== null ? item.num_final : (item.numeracao_fim || '');
            const qtdVal = item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || '');
            const nomeDoModelo = item.produto || '--';

            const jsItemId = item.id;
            const jsOsId = osId;

            return `
                <tr style="${rowBg} cursor: pointer; transition: background 0.2s;" class="hover-row" id="ped-queue-row-\${item.id}"
                    onclick="enviarParaPedido('\${jsItemId}', '\${jsOsId}')">
                    <td style="padding: 12px; font-family: monospace; font-size: 0.95rem; color:var(--text-dim); min-width:80px;" title="Código do Modelo">
                        \${item.modelo || '--'}
                    </td>
                    <td style="padding: 12px; font-size: 0.95rem; font-weight:600; color:#e2e8f0; min-width:120px;" title="Nome do Modelo">
                        \${nomeDoModelo}
                    </td>
                    
                    <td style="padding: 12px; width: 70px;" title="Quantidade">
                        <input type="number" min="0" value="\${qtdVal}" style="\${inputStyle}" placeholder="QTD"
                            onchange="pedQueueUpdateField('\${item.id}', '\${osId}', 'qtd', this.value)"
                            onclick="event.stopPropagation()" />
                    </td>
                    <td style="padding: 12px; min-width: 120px;" title="Cor">
                        <select style="\${selectStyle}" onchange="pedQueueUpdateCor('\${item.id}', '\${osId}', this.value)" onclick="event.stopPropagation()">
                            <option value="">— Cor —</option>
                            \${coresOptions}
                        </select>
                    </td>
                    <td style="padding: 12px; min-width: 140px;" title="Numeração">
                        <select style="\${selectStyle}" onchange="pedQueueUpdateNum('\${item.id}', '\${osId}', this.value)" onclick="event.stopPropagation()">
                            <option value="">\${numValDisplay || '— Numeração —'}</option>
                            \${numsOptions}
                        </select>
                    </td>
                    <td style="padding: 12px; width: 70px;" title="Num. Inicial">
                        <input type="number" value="\${niVal}" style="\${inputStyle}" placeholder="NI"
                            onchange="pedQueueUpdateField('\${item.id}', '\${osId}', 'num_inicial', this.value)"
                            onclick="event.stopPropagation()" />
                    </td>
                    <td style="padding: 12px; width: 70px;" title="Num. Final">
                        <input type="number" value="\${nfVal}" style="\${inputStyle}" placeholder="NF"
                            onchange="pedQueueUpdateField('\${item.id}', '\${osId}', 'num_final', this.value)"
                            onclick="event.stopPropagation()" />
                    </td>
                    <td style="padding: 12px; text-align: center; width: 50px;" title="Frente e Verso">
                        \${item.verso ? '✅' : '--'}
                    </td>
                    <td style="padding: 12px; width: 90px;" title="Status de Produção">
                        \${getImpressaoBadge(item.impressao)}
                    </td>
                    <td style="padding: 12px; white-space:nowrap; display:flex; gap:6px; align-items:center;">
                        <button style="\${btnStyle} background:#7c3aed; color:#fff;" title="Gerar PDF para este modelo"
                            onclick="event.stopPropagation(); pedQueueGerarPDF('\${jsItemId}', '\${jsOsId}')">
                            📄 PDF
                        </button>
                        <button style="\${btnStyle} background:#16a34a; color:#fff;" title="Imprimir este modelo"
                            onclick="event.stopPropagation(); pedQueueImprimir('\${jsItemId}', '\${jsOsId}')">
                            🖨️ Imp.
                        </button>
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










window.renderPedOSQueue = renderPedOSQueue;

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
window.togglePedOSQueue = togglePedOSQueue;

window.togglePedCutStackOptions = function() {
    const schema = document.getElementById('ped-schema').value;
    const container = document.getElementById('ped-cut-stack-options');
    if (schema === 'cut_stack') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
};

window.togglePedMultiArtes = function() {

    const schema = document.getElementById('ped-schema').value;

    const isMulti = schema === 'multi_artes';

    const container = document.getElementById('ped-multi-artes-container');

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
    const baseNum = state.numeracoes.find(n => String(n.id) === String(numId));
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



    const numeracao = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;



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

    document.getElementById('ped-btn-impose').disabled = true;



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
                    if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
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
                    if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
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
            if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
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
            const btn = document.getElementById('ped-btn-impose');
            btn.disabled = false;
            btn.innerHTML = '🚀 Gerar PDF';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }, 400);
        impositionAbortController = null;

    }

};


window.toggleBox = function(bodyId, arrowId) {
    const body = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
};







// Helpers para gerar PDF e imprimir a partir da fila de itens no menu Pedido
async function pedQueueGerarPDF(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    setTimeout(() => {
        const btnGerar = document.getElementById('btn-impose');
        if (btnGerar) {
            btnGerar.click();
        } else if (typeof runImposition === 'function') {
            runImposition();
        }
    }, 1200);
}

async function pedQueueImprimir(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    setTimeout(() => {
        const btnImprimir = document.getElementById('btn-impose-print');
        if (btnImprimir) {
            btnImprimir.removeAttribute('disabled');
            btnImprimir.style.opacity = '1';
            btnImprimir.click();
        } else if (typeof runImposition === 'function') {
            runImposition('print');
        }
    }, 1200);
}

async function pedQueueUpdateCor(itemId, osId, corId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const cor = (state.cores || []).find(c => String(c.id) === String(corId));
    if (cor) {
        item.cor = cor.name;
        item.padrao = cor.name;
        item.amostra_cor_id = cor.id;
        if (cor.formato_id) {
            const fmtSelect = document.getElementById('ped-formato');
            if (fmtSelect) {
                fmtSelect.value = cor.formato_id;
                fmtSelect.dispatchEvent(new Event('change'));
            }
        }
        autoSaveOSItemField(itemId, osId, 'amostra_cor_id', cor.id);
    }
    enviarParaPedido(itemId, osId);
}

async function pedQueueUpdateNum(itemId, osId, numId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const num = (state.numeracoes || []).find(n => String(n.id) === String(numId));
    if (num) {
        item.numeracao = num.name || num.tipo;
        item.numeracao_id = num.id;
        autoSaveOSItemField(itemId, osId, 'amostra_num_id', num.id);
        const numSelect = document.getElementById('ped-numeracao');
        if (numSelect) {
            numSelect.value = numId;
            numSelect.dispatchEvent(new Event('change'));
        }
    }
    enviarParaPedido(itemId, osId);
}

async function pedQueueUpdateField(itemId, osId, field, value) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    item[field] = value;
    autoSaveOSItemField(itemId, osId, field, value);

    if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
        if (field === 'num_inicial') {
            const el = document.getElementById('ped-start');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'num_final') {
            const el = document.getElementById('ped-end');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'qtd') {
            const el = document.getElementById('ped-qtd');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        }
    }
    enviarParaPedido(itemId, osId);
}

window.pedQueueGerarPDF = pedQueueGerarPDF;
window.pedQueueImprimir = pedQueueImprimir;
window.pedQueueUpdateCor = pedQueueUpdateCor;
window.pedQueueUpdateNum = pedQueueUpdateNum;
window.pedQueueUpdateField = pedQueueUpdateField;
