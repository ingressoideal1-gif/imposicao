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
    
    // Aplica a SaÃ­da se houver
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
    const fRot = fmt.rotations || {};
    let rotVal = 0;
    if (fRot.page_rotate !== undefined) {
        rotVal = parseInt(fRot.page_rotate) || 0;
    } else {
        rotVal = fmt.default_rotate_page ? 90 : 0;
    }
    const rotateCb = document.getElementById('ped-rotate-page');
    if (rotateCb) {
        rotateCb.value = String(rotVal);
        state.rotatePage = rotVal;
    }
}
window.applyPedFormatoDefaults = applyPedFormatoDefaults;

function populatePedNumeracoes() {
    const fmtSel = document.getElementById('ped-formato');
    if (!fmtSel) return;

    const selectedFmtId = fmtSel.value;

    const activeOSItem = state.activeOSItem;
    let currentClientId = null;
    let currentItemId = null;
    if (activeOSItem) {
        currentItemId = activeOSItem.itemId;
        const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
        if (os) {
            currentClientId = os.id_cliente;
        }
    }

    // Filtra numerações cujo formato_ids inclui o formato selecionado e respeita o Cli_Num
    let filteredNums = state.numeracoes.filter(n => {
        // Filtro de customizada por cliente / item
        if (n.is_custom) {
            if (n.Cli_Num) {
                if (String(n.Cli_Num) !== String(currentClientId)) return false;
            } else {
                if (String(n.os_item_id) !== String(currentItemId)) return false;
            }
        } else {
            // Se tiver Cli_Num, restringe ao cliente atual
            if (n.Cli_Num && String(n.Cli_Num) !== String(currentClientId)) return false;
        }

        if (selectedFmtId) {
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(selectedFmtId));
        }
        return true;
    });
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

    if (typeof window.togglePedNumEditButtons === 'function') window.togglePedNumEditButtons();
}
window.populatePedNumeracoes = populatePedNumeracoes;

async function loadPedArtFile(file) {
    state.pedArtFile = file;

    const ext = file.name.split('.').pop().toLowerCase();

    try {

        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponÃ­vel. Use JPG/PNG.', 'error');

            }

            pdfjsLib.GlobalWorkerOptions.workerSrc =

                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            

            // Salvar documento PDF e inicializar caches para paginação especial de Pdf MÃºltiplo

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

            

            // Se estiver em Pdf MÃºltiplo, atualiza limites

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

        updatePedSummary(); // Recalcular sumÃ¡rio e forÃ§ar redesenho do preview

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

    let fmtId, numId, saiId, start, end, schema = 'sequential', item_local_index, item_arte_index;
    const activeItem = state.activeOSItem;
    
    // Auto-preencher 'Folhas p/ Bloco' se disponivel na OS, para manter o Preview consistente
    if (state.selectedOSItems && state.selectedOSItems.length > 0) {
        const firstWithBloco = state.selectedOSItems.find(sel => {
            const sItem = state.osItens[sel.osId]?.find(i => String(i.id) === String(sel.itemId));
            return sItem && ((sItem.bloco && parseInt(sItem.bloco) > 0) || (sItem.blocos && sItem.blocos !== 'N'));
        });
        if (firstWithBloco) {
            const blocItem = state.osItens[firstWithBloco.osId]?.find(i => String(i.id) === String(firstWithBloco.itemId));
            const sheetsInp = document.getElementById('ped-sheets-per-block');
            if (sheetsInp && blocItem?.bloco) sheetsInp.value = parseInt(blocItem.bloco);
        }
    } else if (activeItem) {
        const sItem = state.osItens[activeItem.osId]?.find(i => String(i.id) === String(activeItem.itemId));
        if (sItem && sItem.bloco) {
            const sheetsInp = document.getElementById('ped-sheets-per-block');
            if (sheetsInp) sheetsInp.value = parseInt(sItem.bloco);
        }
    }
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
            const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
            schema = fmtObj ? fmtObj.default_schema : 'sequential';
        }
    } else {
        fmtId = document.getElementById('ped-formato')?.value;
        numId = document.getElementById('ped-numeracao')?.value;
        saiId = document.getElementById('ped-saida')?.value;
        start = parseInt(document.getElementById('ped-start')?.value) || 1;
        end = parseInt(document.getElementById('ped-end')?.value) || 100;
        schema = document.getElementById('ped-schema')?.value || 'sequential';
    }

    let isMultiSelected = false;
    let tempMultiArtes = null;

    if (!state.multiArtesPdfCache) state.multiArtesPdfCache = {};
    if (!state.multiArtesPdfLoading) state.multiArtesPdfLoading = {};

    if (state.selectedOSItems && state.selectedOSItems.length > 1) {
        isMultiSelected = true;
        schema = 'multi_artes';
        tempMultiArtes = state.selectedOSItems.map(s => {
            const sItem = state.osItens[s.osId]?.find(i => String(i.id) === String(s.itemId));
            const qt = sItem ? (parseInt(sItem.qtd !== undefined && sItem.qtd !== null ? sItem.qtd : (sItem.quantidade || 0))) : 0;
            
            const corObj = sItem && sItem.amostra_cor_id
                ? (state.cores || []).find(c => String(c.id) === String(sItem.amostra_cor_id))
                : (sItem ? (state.cores || []).find(c => globalFuzzyMatch(c.name, sItem.cor || sItem.padrao || '')) : null);
            const arteViaCor = corObj ? (corObj.pdf_url || null) : null;
            const itemArteUrl = sItem ? sItem.arte_url || arteViaCor : null;
            
            const wantsDuplex = sItem ? !!(sItem.verso_tipo && sItem.verso_tipo !== 'SO FRENTE' && sItem.verso_tipo !== 'SO FRENTE') : false;
            const arteVersoViaCor = corObj ? (corObj.pdf_verso_base64 || corObj.pdf_verso_url || null) : null;
            const itemArteVersoUrl = (sItem && wantsDuplex) ? (sItem.verso_arte_url || sItem.url_arquivo_arte_verso || arteVersoViaCor) : null;

            let pdfDoc = null;
            if (itemArteUrl && state.multiArtesPdfCache[itemArteUrl]) {
                pdfDoc = state.multiArtesPdfCache[itemArteUrl];
            } else if (itemArteUrl && !state.multiArtesPdfLoading[itemArteUrl]) {
                state.multiArtesPdfLoading[itemArteUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteUrl] = doc;
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF for multi arte preview:', e);
                });
            }

            let pdfVersoDoc = null;
            if (itemArteVersoUrl && state.multiArtesPdfCache[itemArteVersoUrl]) {
                pdfVersoDoc = state.multiArtesPdfCache[itemArteVersoUrl];
            } else if (itemArteVersoUrl && !state.multiArtesPdfLoading[itemArteVersoUrl]) {
                state.multiArtesPdfLoading[itemArteVersoUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteVersoUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteVersoUrl] = doc;
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF VERSO for multi arte preview:', e);
                });
            }

            return {
                qtd: qt,
                nome: sItem ? sItem.produto : '',
                num1_id: sItem ? (sItem.numeracao_id || sItem.amostra_num_id || numId) : numId,
                start: sItem ? parseInt(sItem.num_inicial !== undefined && sItem.num_inicial !== null ? sItem.num_inicial : (sItem.numeracao_inicio || 1)) : 1,
                has_raw_file: false,
                is_selected: true,
                amostra_cor_id: sItem ? sItem.amostra_cor_id : null,
                pdfDoc: pdfDoc,
                pdfVersoDoc: pdfVersoDoc,
                bloco: sItem && sItem.bloco ? parseInt(sItem.bloco) : null
            };
        });
    }

    const printModeEl = document.getElementById('ped-print-mode');
    if (printModeEl) {
        state.printMode = printModeEl.value;
    } else if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            const wantsDuplex = !!(item.verso_tipo && item.verso_tipo !== 'SÓ FRENTE' && item.verso_tipo !== 'SO FRENTE');
            state.printMode = wantsDuplex ? 'duplex' : 'front';
        }
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

    // Validação estrita das regras de imposição do formato na visualização
    if (!fmt.default_schema || !fmt.default_saida_id) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.fillStyle = '#ef4444';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Erro: Regras de Imposição ausentes no Formato.', 150, 100);
        document.getElementById('ped-preview-sheet-num').textContent = 'Erro de Regra';
        return;
    }

    if (fmt.default_schema === 'cut_stack') {
        if (!fmt.default_cut_stack_mode || !fmt.default_sheets_per_block) {
            canvas.width = 300;
            canvas.height = 200;
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, 300, 200);
            ctx.fillStyle = '#ef4444';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Erro: ParÃ¢metros Cut & Stack ausentes.', 150, 100);
            document.getElementById('ped-preview-sheet-num').textContent = 'Erro de Regra';
            return;
        }
    }

    // Usar os padrÃµes obrigatórios do formato
    schema = fmt.default_schema;
    saiId = fmt.default_saida_id;


    
    const previewPartEl = document.getElementById('ped-preview-part-input');
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
            
            // SÃ³ atualizar o HTML se as opções mudaram para evitar loops de re-renderização
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



    // Calcular escala baseada no tamanho real do container (70% da área, sem invadir o painel)
    // Usar clientWidth do container pai para limitar dinamicamente
    const canvasContainer = canvas.closest('.ped-preview-canvas-container') || canvas.parentElement;
    // Subtrair padding do container (32px = 16px cada lado)
    const availW = canvasContainer ? Math.max(200, canvasContainer.clientWidth - 32) : 800;
    const availH = canvasContainer ? Math.max(200, canvasContainer.clientHeight - 32) : 600;

    // Escala interna alta (resolução do canvas) — limitada por 1920x1360
    const MAX_W = Math.min(1920, availW * 2);
    const MAX_H = Math.min(1360, availH * 2);

    const scale = Math.min(MAX_W / sheet_w, MAX_H / sheet_h);

    canvas.width = Math.round(sheet_w * scale);
    canvas.height = Math.round(sheet_h * scale);

    // CSS: redimensionar para caber visivelmente no container disponível
    const displayScale = Math.min(availW / (sheet_w * scale), availH / (sheet_h * scale));
    const displayW = Math.round(canvas.width * displayScale);
    const displayH = Math.round(canvas.height * displayScale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;



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
    let raw_items = Math.max(1, end - start + 1);
    if (state.csvData) {
        raw_items = state.csvData.length;
    } else if (schema === 'pdf_multiple') {
        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;
        raw_items = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;
    }

    let total_items = raw_items;
    if (schema === "multi_artes" || isMultiSelected) {
        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        let sum_physical = 0;
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            sum_physical += q;
        }
        total_items = sum_physical;
    } else {
        if (num && num.tipo === "TICKET") {
            total_items = Math.ceil(raw_items / ticket_qtd);
        } else {
            total_items = raw_items;
        }
    }

    const poses_per_sheet = cols * rows;
    let total_sheets = Math.ceil(total_items / poses_per_sheet);

    let is_strict_mode = false;
    let stack_size = 50;
    let sets_needed = 1;
    if (schema === "cut_stack" || schema === "multi_artes") {
        const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
        stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        if (schema === "multi_artes" || cutstackMode === 'strict' || cutstackMode === 'strict_assembly') {
            is_strict_mode = true;
            if (cutstackMode === 'strict_assembly' || schema === "multi_artes") {
                if (typeof buildStrictAssemblySets === 'function') {
                    window.currentAssemblySets = buildStrictAssemblySets(isMultiSelected ? tempMultiArtes : state.impMultiArtes, isMultiSelected, total_items, stack_size, poses_per_sheet);
                    sets_needed = window.currentAssemblySets.length;
                    total_sheets = window.currentAssemblySets.reduce((sum, s) => sum + s.num_sheets, 0);
                } else {
                    const itemsPerSet = stack_size * poses_per_sheet;
                    sets_needed = Math.ceil(total_items / itemsPerSet);
                }
            } else {
                const itemsPerSet = stack_size * poses_per_sheet;
                sets_needed = Math.ceil(total_items / itemsPerSet);
                total_sheets = sets_needed * stack_size;
            }
        }
    }

    const setSelect = document.getElementById('ped-preview-set-input');
    const refazerSetSelect = document.getElementById('ped-refazer-set');
    if (setSelect && refazerSetSelect) {
        if (sets_needed >= 1 && (schema === "cut_stack" || schema === "multi_artes")) {
            setSelect.style.display = 'inline-block';
            refazerSetSelect.style.display = 'inline-block';
            
            if (setSelect.options.length !== sets_needed) {
                const currentVal = setSelect.value;
                const currentRefVal = refazerSetSelect.value;
                setSelect.innerHTML = '';
                refazerSetSelect.innerHTML = '';
                for (let i = 1; i <= sets_needed; i++) {
                    setSelect.add(new Option(`Set ${i}`, i));
                    refazerSetSelect.add(new Option(`Set ${i}`, i));
                }
                setSelect.value = currentVal <= sets_needed ? currentVal : 1;
                refazerSetSelect.value = currentRefVal <= sets_needed ? currentRefVal : 1;
            }
        } else {
            setSelect.style.display = 'none';
            refazerSetSelect.style.display = 'none';
            setSelect.innerHTML = '<option value="1">Set 1</option>';
            refazerSetSelect.innerHTML = '<option value="1">Set 1</option>';
        }
    }

    const currentSet = setSelect && setSelect.style.display !== 'none' ? parseInt(setSelect.value) || 1 : 1;
    
    // Determinar o total de folhas visÃ­veis neste set
    let visible_sheets = total_sheets;
    if (is_strict_mode) {
        if (window.currentAssemblySets) {
            visible_sheets = window.currentAssemblySets[currentSet - 1]?.num_sheets || 0;
        } else {
            if (currentSet < sets_needed) {
                visible_sheets = stack_size;
            } else {
                visible_sheets = total_sheets - ((sets_needed - 1) * stack_size);
            }
        }
    }

    document.getElementById('ped-preview-sheet-num').textContent = sets_needed > 1 ? `Folha ${window.currentPreviewPage || 1} de ${visible_sheets}` : `Folha ${window.currentPreviewPage || 1} de ${total_sheets}`;

    const isBack = state.previewFace === 'back' || previewPart === 'miolo_verso';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const P = row * cols + col;

            let local_S = (window.currentPreviewPage || 1) - 1;
            if (local_S >= visible_sheets) local_S = visible_sheets - 1;
            if (local_S < 0) local_S = 0;
            
            let S = local_S;
            if (is_strict_mode && !window.currentAssemblySets) {
                S = ((currentSet - 1) * stack_size) + local_S;
            }

            let item_index = (S * poses_per_sheet) + P;
            if (schema === "cut_stack" || schema === "multi_artes") {
                const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
                if (cutstackMode === 'strict' && !window.currentAssemblySets) {
                    const full_sets = Math.floor(total_sheets / stack_size);
                    const set_index = Math.floor(S / stack_size);
                    const sheet_within_set = S % stack_size;
                    item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set;
                } else if ((cutstackMode === 'strict_assembly' || schema === "multi_artes") && window.currentAssemblySets) {
                    let set_def = window.currentAssemblySets[currentSet - 1];
                    if (set_def && set_def.cell_allocations[P] && set_def.cell_allocations[P][local_S]) {
                        let item_data = set_def.cell_allocations[P][local_S];
                        item_index = item_data.global_index;
                        item_local_index = item_data.local_index;
                        item_arte_index = item_data.arte_index;
                    } else {
                        item_index = total_items; // skip rendering this cell
                        item_local_index = undefined;
                        item_arte_index = undefined;
                    }
                } else if (schema === "multi_artes") {
                    const P_col_first = col * rows + row;
                    item_index = (P_col_first * total_sheets) + S;
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
            }

            if (item_index >= total_items) continue;

            // Para o verso da folha (tombamento horizontal), espelhamos as colunas fisicamente
            const col_fisico = isBack ? (cols - 1 - col) : col;

            const cell_x0 = start_x + col_fisico * (item_w + gap_h);

            const cell_y0 = start_y + row * (item_h + gap_v);



            const cw = item_w * scale;

            const ch = item_h * scale;



            // Centro da cÃ©lula para rotação

            const centerX = (cell_x0 + item_w / 2) * scale;

            const centerY = (cell_y0 + item_h / 2) * scale;

            

            // Inverter a rotação da cÃ©lula no verso para bater frente/verso

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
            const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;

            if (schema === "multi_artes" || (artesList && artesList.length > 0)) {
                if (typeof item_arte_index !== 'undefined' && item_arte_index !== null) {
                    multiArteItem = artesList[item_arte_index];
                } else {
                    let accumulated = 0;
                    for (let i = 0; i < artesList.length; i++) {
                        let q = parseInt(artesList[i].qtd) || 0;
                        if (item_index >= accumulated && item_index < accumulated + q) {
                            multiArteItem = artesList[i];
                            break;
                        }
                        accumulated += q;
                    }
                }
            }

            // ─── CAMADA BASE DA COR (AMOSTRA) ──────────────────────────────────
            // Se o checkbox "AMOSTRA" (#ped-preview-toggle-amostra) estiver marcado,
            // desenhamos a camada base da Cor (amostra_cor_id / Cor da OS) abaixo
            // de todas as demais camadas. (Apenas visualização, NUNCA é impressa).
            const showAmostraCor = document.getElementById('ped-preview-toggle-amostra')?.checked === true;
            if (showAmostraCor) {
                const sItem = state.activeOSItem ? (state.osItens[state.activeOSItem.osId]?.find(i => String(i.id) === String(state.activeOSItem.itemId))) : null;
                const corId = (multiArteItem && multiArteItem.amostra_cor_id)
                    ? multiArteItem.amostra_cor_id
                    : (sItem ? sItem.amostra_cor_id : (document.getElementById('ped-cor')?.value || ''));
                
                const corObj = corId
                    ? (state.cores || []).find(c => String(c.id) === String(corId))
                    : (state.cores || []).find(c => globalFuzzyMatch(c.name, (sItem ? (sItem.cor || sItem.padrao || '') : '')));

                if (corObj) {
                    // 1. Desenhar cor de fundo / hex de referência se cadastrada
                    const hexColor = corObj.cor_referencia || corObj.hex || corObj.color || '';
                    if (hexColor) {
                        ctx.fillStyle = hexColor;
                        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
                    }

                    // 2. Se a cor possuir arquivo PDF ou imagem de amostra (Frente/Verso)
                    const corPdfUrl = isBack ? (corObj.pdf_verso_url || corObj.pdf_verso_base64) : (corObj.pdf_url || corObj.pdf_base64);
                    if (corPdfUrl) {
                        if (!corObj._pdfCache) corObj._pdfCache = {};
                        const cKey = isBack ? 'verso' : 'frente';
                        const corPdfDoc = corObj._pdfCache[cKey];

                        if (corPdfDoc) {
                            if (corPdfDoc.pagesCache && corPdfDoc.pagesCache['page_1']) {
                                const cachedCorCanvas = corPdfDoc.pagesCache['page_1'];
                                ctx.drawImage(cachedCorCanvas, -cw / 2, -ch / 2, cw, ch);
                            } else if (!corPdfDoc.rendering) {
                                corPdfDoc.rendering = true;
                                (async () => {
                                    try {
                                        const p = await corPdfDoc.getPage(1);
                                        const vp = p.getViewport({ scale: 1.5 });
                                        const off = document.createElement('canvas');
                                        off.width = vp.width;
                                        off.height = vp.height;
                                        const octx = off.getContext('2d');
                                        octx.fillStyle = '#ffffff';
                                        octx.fillRect(0, 0, off.width, off.height);
                                        await p.render({ canvasContext: octx, viewport: vp }).promise;
                                        if (!corPdfDoc.pagesCache) corPdfDoc.pagesCache = {};
                                        corPdfDoc.pagesCache['page_1'] = off;
                                        if (typeof drawPedPreview === 'function') drawPedPreview();
                                    } catch (e) {
                                        console.error('Erro ao renderizar pág da Cor base:', e);
                                    } finally {
                                        delete corPdfDoc.rendering;
                                    }
                                })();
                            }
                        } else if (!corObj._pdfLoading) {
                            corObj._pdfLoading = true;
                            if (typeof pdfjsLib !== 'undefined') {
                                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                                }
                                const fetchPromise = corPdfUrl.startsWith('data:')
                                    ? pdfjsLib.getDocument({ data: atob(corPdfUrl.split('base64,')[1] || corPdfUrl) }).promise
                                    : fetch(corPdfUrl).then(r => r.arrayBuffer()).then(buf => pdfjsLib.getDocument({ data: buf }).promise);

                                fetchPromise.then(doc => {
                                    corObj._pdfCache[cKey] = doc;
                                    delete corObj._pdfLoading;
                                    if (typeof drawPedPreview === 'function') drawPedPreview();
                                }).catch(e => {
                                    console.error('Erro ao carregar PDF da cor da amostra:', e);
                                    delete corObj._pdfLoading;
                                });
                            }
                        }
                    }
                }
            }



            let activePdfDoc = state.pedArtPdfDoc;

            let activeImage = state.pedArtImage;

            let isMultiArtePdf = false;

            let art_orig_w = state.pedArtWidth;

            let art_orig_h = state.pedArtHeight;



             if (multiArteItem) {

                if (multiArteItem.pdfDoc) {

                    activePdfDoc = multiArteItem.pdfDoc;

                    isMultiArtePdf = true;

                    art_orig_w = multiArteItem.artWidth || item_w;

                    art_orig_h = multiArteItem.artHeight || item_h;

                }

                activeImage = null; 

            }



            if (activeImage || activePdfDoc) {
                // Centralizar a arte na cÃ©lula + aplicar offset do formato (em relação ao centro da cÃ©lula que Ã© 0,0)
                // (positivo H = direita, positivo V = para cima â†’ negar Y)
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

                            // Imagem Ãºnica não tem verso de arte

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

                ctx.fillText(`PosiÃ§Ã£o ${P + 1}`, 0, 0);

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
                    
                    // Obter bloco e ticket_qtd do modelo ativo nesta pose
                    const item_bloco = (multiArteItem && multiArteItem.bloco) ? parseInt(multiArteItem.bloco) : null;
                    
                    const sheetsInput = document.getElementById('ped-sheets-per-block');
                    const sheetsPerBlock = item_bloco || ((sheetsInput && sheetsInput.value) 
                        ? parseInt(sheetsInput.value) 
                        : (parseInt(fmt.default_sheets_per_block) || 50));
                        
                    let item_ticket_qtd = 1;
                    if (multiArteItem) {
                        if (multiArteItem.num1_id) {
                            const itemNum = state.numeracoes.find(n => String(n.id) === String(multiArteItem.num1_id));
                            if (itemNum && itemNum.tipo === "TICKET") {
                                item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                            }
                        }
                    } else {
                        item_ticket_qtd = ticket_qtd;
                    }

                    const local_idx = (typeof item_local_index !== 'undefined') ? item_local_index : item_index;
                    const cell_stack_size = sheetsPerBlock;
                    const bloco_num = Math.floor(local_idx / cell_stack_size) + 1;
                    const blocoNum = String(bloco_num).padStart(2, '0');
                    const wBloco = ctx.measureText(`Bloco ${blocoNum}`).width;
                    
                    const textX = -cw/2 + (xPdf * MM2PT * scale);
                    const textY = -ch/2 + (yPdf * MM2PT * scale);
                    
                    ctx.fillText(`Bloco ${blocoNum}`, textX, textY);
                    ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                    
                    const seqStartInput = document.getElementById('ped-start');
                    const seqStart = multiArteItem ? multiArteItem.start : ((seqStartInput && seqStartInput.value) ? parseInt(seqStartInput.value) : 1);
                    
                    const start_idx = (bloco_num - 1) * cell_stack_size;
                    const end_idx = start_idx + cell_stack_size - 1;
                    const v_start = seqStart + start_idx * item_ticket_qtd;
                    const v_end = seqStart + end_idx * item_ticket_qtd;
                    
                    const vStartStr = String(v_start).padStart(4, '0');
                    const vEndStr = String(v_end).padStart(4, '0');
                    
                    ctx.fillText(` - de ${vStartStr} a ${vEndStr}`, textX + wBloco, textY);
                }
                ctx.restore();
                continue;
            }

            if (multiArteItem && multiArteItem.nome) {
                ctx.save();
                const nomeTxt = String(multiArteItem.nome).padStart(6, '0');
                const nomeColor = multiArteItem.nome_color || '#000000';
                // Fonte: 17pt em pontos PDF, convertido para pixels do canvas
                const nomeFontSizePx = 14 * scale;
                ctx.font = `${nomeFontSizePx}px Impact, Arial, sans-serif`;
                ctx.fillStyle = nomeColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // PosiÃ§Ã£o X: 0mm da lateral esquerda da cÃ©lula
                // ApÃ³s rotação -90Â°, textBaseline='middle' centraliza horizontalmente,
                // entÃ£o o ponto de translate Ã© o CENTRO do texto rotacionado.
                // Para a borda esquerda do texto ficar a 0mm: center_x = -cw/2 + fontSize/2
                ctx.translate(-cw / 2 + nomeFontSizePx / 2, 0);
                ctx.rotate(-Math.PI / 2);
                // textAlign='center' centraliza o texto verticalmente (eixo X pré-rotação = eixo Y pÃ³s-rotação)
                ctx.fillText(nomeTxt, 0, 0);
                ctx.restore();
            }

            // Elementos variáveis (VDP) - Suporte a 2 numerações sobrepostas

        const drawVdpElements = (currentNum, source_id) => {

            if (currentNum && currentNum.elements) {

                let effectiveStart = start;
                let val_index = item_index;
                if (schema === "multi_artes" || isMultiSelected) {
                    if (multiArteItem) {
                        effectiveStart = multiArteItem.start !== undefined ? multiArteItem.start : start;
                        if (typeof item_local_index !== 'undefined') {
                            val_index = item_local_index;
                        }
                    }
                }
                const val = effectiveStart + val_index;

                let numPrintMode = currentNum.print_mode;
                if (!numPrintMode && currentNum.elements) {
                    const metaEl = currentNum.elements.find(x => x.type === 'METADATA');
                    if (metaEl) {
                        numPrintMode = metaEl.print_mode;
                    }
                }

                currentNum.elements.forEach(el => {

                    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

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

                    // PosiÃ§Ã£o do elemento relativa ao canto superior esquerdo da cÃ©lula

                    const el_x = el.x_mm * MM2PT * scale;

                    const el_y = el.y_mm * MM2PT * scale;



                    // Converter para coordenadas relativas ao centro da cÃ©lula (0,0)

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
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
                        const _cIni = parseInt(document.getElementById('ped-c-ini')?.value) || 1;
                        const _localNum = _cIni + Math.floor(item_index / _lCam);
                        val_str = `${el.prefix || ''}${_localNum}`;

                    } else if (el.type === 'CAMAROTE_PESSOA') {
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
                        val_str = `${el.prefix || ''}${(item_index % _lCam) + 1}`;

                    } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
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
                            current_val = effectiveStart + (val_index * N) + (pos - 1);
                        } else if (currentNum && currentNum.tipo === "TICKET" && source_id === 2) {
                            const pos = parseInt(el.ticket_pos) || 1;
                            const N = parseInt(currentNum.ticket_qtd) || 1;
                            current_val = effectiveStart + (val_index * N) + (pos - 1);
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

        // Para multi_artes ou imposição combinada, usar a numeração especÃ­fica de cada arte se disponÃ­vel
        const artNum1 = multiArteItem ? (multiArteItem.numeracao || state.numeracoes.find(n => String(n.id) === String(multiArteItem.num1_id))) : null;
        const artNum2 = multiArteItem ? (multiArteItem.numeracao_2 || state.numeracoes.find(n => String(n.id) === String(multiArteItem.num2_id))) : null;
        if (multiArteItem) {
            drawVdpElements(artNum1, 1);
            drawVdpElements(artNum2, 2);
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

window.setPedPreviewFace = function (face) {
    state.previewFace = face;
    const btnFront = document.getElementById('ped-btn-preview-front');
    const btnBack = document.getElementById('ped-btn-preview-back');
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
    drawPedPreview();
};

window.changePedPreviewPage = function() {
    const input = document.getElementById('ped-preview-page-input');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    window.currentPreviewPage = val;
    drawPedPreview();
};

window.prevPedPreviewPage = function() {
    if ((window.currentPreviewPage || 1) > 1) {
        window.currentPreviewPage = (window.currentPreviewPage || 1) - 1;
        const input = document.getElementById('ped-preview-page-input');
        if (input) input.value = window.currentPreviewPage;
        drawPedPreview();
    }
};

window.nextPedPreviewPage = function() {
    window.currentPreviewPage = (window.currentPreviewPage || 1) + 1;
    const input = document.getElementById('ped-preview-page-input');
    if (input) input.value = window.currentPreviewPage;
    drawPedPreview();
};

function updatePedSummary() {

    const fmtSelect = document.getElementById('ped-formato');

    const numSelect = document.getElementById('ped-numeracao');

    const numSelect2 = document.getElementById('ped-numeracao-2');



    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

    const lblNum1Text = document.getElementById('lbl-ped-num-1-text');

    const lblNum2Text = document.getElementById('lbl-ped-num-2-text');

    if (lblNum1Text && lblNum2Text) {

        if (printMode === 'duplex') {

            lblNum1Text.innerHTML = '2. Numeração <b style="color:var(--blue)">FRENTE</b> (opcional)';

            lblNum2Text.innerHTML = '3. Numeração <b style="color:var(--blue)">VERSO</b> (opcional)';

        } else {

            lblNum1Text.innerHTML = '2. Numeração 1 (opcional)';

            lblNum2Text.innerHTML = '3. Numeração 2 (opcional)';

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

    // Mostrar/esconder painel CAMAROTE conforme tipo da numeração
    const camarotePanel = document.getElementById('ped-camarote-panel');
    const isCamarote = num && (num.tipo === 'CAMAROTE' || num.type === 'CAMAROTE');
    if (camarotePanel) camarotePanel.style.display = isCamarote ? 'block' : 'none';

    if (num && num.svg_content && !num._svgImage) {

        const img = new Image();

        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(num.svg_content);

        img.onload = () => {

            num._svgImage = img;

            drawPedPreview();

        };

    }

    // PrÃ©-carregar canvas de cada elemento PDF da numeração selecionada

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
    const total_impressions = (num && num.tipo === "TICKET") ? Math.ceil(total / ticket_qtd) : total;
    let sheets = Math.ceil(total_impressions / perSheet);

    const cutstackMode = document.getElementById('ped-cutstack-mode')?.value;
    if (schema === 'cut_stack' || schema === 'multi_artes') {
        const stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        if (schema === 'multi_artes' || cutstackMode === 'strict_assembly') {
            if (typeof buildStrictAssemblySets === 'function') {
                const artesList = schema === 'multi_artes' ? state.impMultiArtes : [];
                const assSets = buildStrictAssemblySets(artesList, schema === 'multi_artes', total_impressions, stack_size, perSheet);
                sheets = assSets.reduce((sum, s) => sum + s.num_sheets, 0);
            } else {
                const itemsPerSet = stack_size * perSheet;
                const sets_needed = Math.ceil(total_impressions / itemsPerSet);
                sheets = sets_needed * stack_size;
            }
        } else if (cutstackMode === 'strict') {
            const itemsPerSet = stack_size * perSheet;
            const sets_needed = Math.ceil(total_impressions / itemsPerSet);
            sheets = sets_needed * stack_size;
        }
    }



    box.style.display = 'grid';

    document.getElementById('ped-sum-formato').textContent = `${fmt.name} (${fmt.width_mm}Ã—${fmt.height_mm}mm)`;

    document.getElementById('ped-sum-grade').textContent = `${fmt.cols} Ã— ${fmt.rows} = ${perSheet} itens/folha`;

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



    if (typeof window.togglePedNumEditButtons === 'function') window.togglePedNumEditButtons();

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
        const fileInput = document.getElementById('ped-file');
    if (fileInput) {
        fileInput.value = '';
    }

    toast('OS desvinculada. Validações de arquivo liberadas.', 'info');
}
window.clearPedActiveOS = clearPedActiveOS;

async function enviarParaPedido(itemId, osId) {
    const itens = typeof getOSItens === 'function' ? getOSItens(osId) : (state.osItens[osId] || []);
    const item = itens.find(i => String(i.id) === String(itemId)) || itens[0];
    if (!item) return toast('Item não encontrado.', 'error');

    // Guardar referência ao item ativo para atualização automática pós-imposição
    state.activeOSItem = { itemId: item.id, osId };

    // Atualizar o título do cabeçalho da página de Pedido
    const activeOS = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId) : null);
    let nomeEvento = '';
    if (state.todasArtes) {
        const arteObj = state.todasArtes.find(a => String(a.id_int) === String(osId).replace('vibe_', ''));
        if (arteObj) nomeEvento = arteObj.nome_evento || '';
    }
    const pedViewTitle = document.getElementById('ped-view-title');
    const pedViewSubtitle = document.getElementById('ped-view-subtitle');
    if (pedViewTitle) {
        const orderNum = activeOS ? (activeOS.numero || '') : '';
        const displayTitle = nomeEvento ? `${orderNum} - ${nomeEvento}` : `${orderNum}`;
        pedViewTitle.textContent = displayTitle;
        pedViewTitle.style.fontSize = 'calc(2.2rem + 5pt)';
        pedViewTitle.style.fontWeight = 'bold';
    }
    if (pedViewSubtitle) {
        pedViewSubtitle.style.display = 'none';
    }

    const previewContainer = document.getElementById('ped-preview-card-container');
    if (previewContainer) {
        previewContainer.style.display = 'block';
        // Inicializar painel lateral de driver de impressão
        if (typeof initPedPrintPanel === 'function') {
            initPedPrintPanel().then(() => {
                const prodId = item._vibe_id_produto || item.id_produto || item.produto_id;
                if (prodId && typeof loadPrintConfigForProduct === 'function') {
                    loadPrintConfigForProduct(prodId);
                }
                if (typeof _updateSaveButtonLabel === 'function') {
                    _updateSaveButtonLabel();
                }
            }).catch(e => console.warn('[PedPrintPanel] init error:', e));
        }
    }

    // Navegar para a view de Pedido (sem mudar para Imposição)
    const navBtn = document.querySelector('[data-view="view-pedido"]');
    if (navBtn) navBtn.click();

    // ====================================================================
    // DELEGAR resolução de Formato / Saída / Numeração / Arte
    // para enviarParaImposicao (código comprovadamente funcional no script.js)
    // switchTab=false para não mudar a aba
    // ====================================================================
    if (typeof enviarParaImposicao === 'function') {
        await enviarParaImposicao(item.id, osId, false);
    }

    // --- PREENCHER FAIXA DE NUMERAÇÃO (ped-start / ped-end) ---
    setTimeout(() => {
        const numStart = document.getElementById('ped-start');
        const numEnd = document.getElementById('ped-end');
        if (numStart && item.num_inicial) numStart.value = item.num_inicial;
        if (numEnd && item.num_final) numEnd.value = item.num_final;

        // --- CAMAROTE: preencher C_INI, Q_CAM e L_CAM ---
        const cIniHidden = document.getElementById('ped-c-ini');
        const qCamHidden = document.getElementById('ped-q-cam');
        const lCamHidden = document.getElementById('ped-l-cam');
        const cIniVal = item.C_INI || item.c_ini || 1;
        const qCamVal = item.Q_CAM || item.q_cam || item.qtd_locais || item.qtd_cam || 0;
        const lCamVal = item.L_CAM || item.l_cam || item.lotacao_cam || item.lotacao || item.lotacao_por_local || 1;
        if (cIniHidden) cIniHidden.value = cIniVal;
        if (qCamHidden) qCamHidden.value = qCamVal;
        if (lCamHidden) lCamHidden.value = lCamVal;
    }, 400);

    // --- PREENCHER MODO DE IMPRESSÃO + BLOCOS ---
    setTimeout(() => {
        const printMode = document.getElementById('ped-print-mode');
        if (printMode) {
            const wantsDuplex = !!(item.verso_tipo && item.verso_tipo !== 'SÓ FRENTE' && item.verso_tipo !== 'SO FRENTE');
            printMode.value = wantsDuplex ? 'duplex' : 'front';
            if (typeof updatePedSummary === 'function') {
                updatePedSummary();
            }
        }
        if (item.blocos && item.blocos !== 'N') {
            const schemaSelect = document.getElementById('ped-schema');
            if (schemaSelect) {
                schemaSelect.value = 'cut_stack';
                schemaSelect.dispatchEvent(new Event('change'));
            }
            const modeSelect = document.getElementById('ped-cutstack-mode');
            if (modeSelect) {
                modeSelect.value = 'strict_assembly';
                modeSelect.dispatchEvent(new Event('change'));
            }
        }
        updatePedSummary();
        if (typeof drawPedPreview === 'function') drawPedPreview();
    }, 800);

    // --- ATUALIZAR PAINEL DE ITENS OS ---
    setTimeout(() => { renderPedOSQueue(); }, 600);

    // --- TOAST ---
    const os = state.ordens ? state.ordens.find(o => o.id === osId) : null;
    const osNum = os ? os.numero : '';
    const fmtSelect = document.getElementById('ped-formato');
    const currentFmtId = fmtSelect ? fmtSelect.value : '';
    const formatoObjToast = state.formatos ? state.formatos.find(f => String(f.id) === String(currentFmtId || item.formato_id)) : null;
    const nomeFmtToast = formatoObjToast ? formatoObjToast.name : (item.formato || 'Formato Não Definido');
    toast(`Item "${item.produto} -- ${nomeFmtToast}" da OS #${osNum} carregado na Imposição!`, 'info');
}
window.enviarParaPedido = enviarParaPedido;

window.togglePedItemSelection = function(itemId, osId) {
    if (!state.selectedOSItems) state.selectedOSItems = [];
    
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;

    const idx = state.selectedOSItems.findIndex(s => String(s.itemId) === String(itemId));
    
    if (idx !== -1) {
        state.selectedOSItems.splice(idx, 1);
    } else {
        // Validação de mesma cor
        if (state.selectedOSItems.length > 0) {
            const firstSelectedId = state.selectedOSItems[0].itemId;
            const firstSelectedItem = itens.find(i => String(i.id) === String(firstSelectedId));
            const firstColor = firstSelectedItem ? (firstSelectedItem.cor || firstSelectedItem.padrao || '').toLowerCase().trim() : '';
            const thisColor = (item.cor || item.padrao || '').toLowerCase().trim();
            
            if (firstColor !== thisColor) {
                toast('SÃ³ Ã© possível selecionar modelos que compartilhem da mesma COR.', 'warning');
                return;
            }
        }
        state.selectedOSItems.push({ itemId, osId });
    }
    
    renderPedOSQueue();
    drawPedPreview();
};

window.pedQueueGerarPDFMulti = async function(isPrint = false) {
    if (!state.selectedOSItems || state.selectedOSItems.length === 0) {
        return toast('Selecione pelo menos um modelo.', 'warning');
    }
    
    const overlay = document.getElementById('loading-overlay');
    const sub = document.getElementById('loading-sub');
    if (overlay) overlay.classList.add('active');
    if (sub) sub.textContent = `Gerando ${state.selectedOSItems.length} modelos selecionados...`;

    const originalActive = state.activeOSItem; 
    const blobs = [];
    
    try {
        if (state.selectedOSItems.length > 1) {
            if (sub) sub.textContent = `Processando modelos combinados...`;
            
            // Verificar se algum item tem blocagem definida e configurar os dropdowns antes de chamar runImposition
            // item.blocos = flag 'S'/'N', item.bloco = valor numÃ©rico do tamanho do bloco
            const anyHasBloco = state.selectedOSItems.some(sel => {
                const sItem = state.osItens[sel.osId]?.find(i => String(i.id) === String(sel.itemId));
                console.log('[pedQueueGerarPDFMulti] Item check:', sItem?.modelo, 'bloco=', sItem?.bloco, 'blocos=', sItem?.blocos, 'qtd=', sItem?.qtd);
                const hasBlocoNum = sItem && sItem.bloco && parseInt(sItem.bloco) > 0;
                const hasBlocosFlag = sItem && sItem.blocos && sItem.blocos !== 'N' && sItem.blocos !== 'n';
                return hasBlocoNum || hasBlocosFlag;
            });
            // Sempre forÃ§ar cut_stack + strict_assembly para multi-seleção com modelos combinados
            // pois Ã© a regra padrão quando se combinam modelos
            const forceStrictAssembly = anyHasBloco || state.selectedOSItems.length > 1;
            if (forceStrictAssembly) {
                const schemaSel = document.getElementById('ped-schema');
                if (schemaSel) schemaSel.value = 'cut_stack';
                const modeSel = document.getElementById('ped-cutstack-mode');
                if (modeSel) modeSel.value = 'strict_assembly';
                // Aplicar bloco do primeiro item selecionado que tem bloco
                const firstWithBloco = state.selectedOSItems.find(sel => {
                    const sItem = state.osItens[sel.osId]?.find(i => String(i.id) === String(sel.itemId));
                    return sItem && ((sItem.bloco && parseInt(sItem.bloco) > 0) || (sItem.blocos && sItem.blocos !== 'N'));
                });
                if (firstWithBloco) {
                    const blocItem = state.osItens[firstWithBloco.osId]?.find(i => String(i.id) === String(firstWithBloco.itemId));
                    const sheetsInp = document.getElementById('ped-sheets-per-block');
                    if (sheetsInp && blocItem?.bloco) sheetsInp.value = parseInt(blocItem.bloco);
                }
                console.log('[pedQueueGerarPDFMulti] ForÃ§ando schema=cut_stack, mode=strict_assembly, anyHasBloco=', anyHasBloco);
            }
            
            const blob = await runImposition('', true);
            if (blob) {
                blobs.push(blob);
                for (const sel of state.selectedOSItems) {
                    if (typeof pedQueueUpdateField === 'function') {
                        pedQueueUpdateField(sel.itemId, sel.osId, 'status_impressao', 'IMPRESSO');
                    }
                }
            }
        } else {
            const sel = state.selectedOSItems[0];
            state.activeOSItem = { osId: sel.osId, itemId: sel.itemId };
            if (sub) sub.textContent = `Processando modelo 1 de 1...`;
            const blob = await runImposition('', true);
            if (blob) {
                blobs.push(blob);
                if (typeof pedQueueUpdateField === 'function') {
                    pedQueueUpdateField(sel.itemId, sel.osId, 'status_impressao', 'IMPRESSO');
                }
            }
        }
        
        state.activeOSItem = originalActive;
        
        if (blobs.length > 0) {
            if (sub) sub.textContent = `Mesclando ${blobs.length} PDFs...`;
            
            let finalBlob = blobs[0];
            
            if (blobs.length > 1 && typeof PDFLib !== 'undefined') {
                const { PDFDocument } = PDFLib;
                const mergedPdf = await PDFDocument.create();
                
                for (const blob of blobs) {
                    try {
                        const arrayBuffer = await blob.arrayBuffer();
                        const pdf = await PDFDocument.load(arrayBuffer);
                        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                        copiedPages.forEach((page) => mergedPdf.addPage(page));
                    } catch(mergeErr) {
                        console.error("Erro mesclando parte do PDF", mergeErr);
                    }
                }
                const mergedPdfBytes = await mergedPdf.save();
                finalBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
            }

            if (isPrint) {
                if (sub) sub.textContent = "Enviando para impressão...";
                // Abrir o modal de impressão com o blob final
                if (typeof openPrintModal === 'function') {
                    if (overlay) overlay.classList.remove('active');
                    openPrintModal(finalBlob);
                    toast('PDFs gerados! Configure e envie para a impressora.', 'success');
                } else {
                    // Fallback: enviar para API local diretamente
                    const formData = new FormData();
                    formData.append('file', finalBlob, 'impressao_multipla.pdf');
                    const sel = document.getElementById('print-direct-printer');
                    const printerName = sel ? sel.value : '';
                    const options = {};
                    try {
                        const res = await fetch(`http://localhost:9000/api/print/submit`, {
                            method: "POST",
                            body: formData
                        });
                        if (res.ok) {
                            toast('Enviado para a impressora local!', 'success');
                        } else {
                            throw new Error('Falha na API local');
                        }
                    } catch (err) {
                        toast('Erro na impressão local. Verifique se o NewProd Agent está rodando.', 'error');
                    }
                }
            } else {
                let fileHandle = null;
                if (window.showSaveFilePicker) {
                    const options = {
                        suggestedName: `Selecionados_OS_${state.selectedOSItems[0].osId}.pdf`,
                        types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }]
                    };
                    fileHandle = await window.showSaveFilePicker(options).catch(()=>null);
                }
                
                if (fileHandle) {
                    const writable = await fileHandle.createWritable();
                    await writable.write(finalBlob);
                    await writable.close();
                    toast('PDFs selecionados mesclados e salvos!', 'success');
                } else {
                    const url = window.URL.createObjectURL(finalBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Selecionados_OS_${state.selectedOSItems[0].osId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    toast('PDFs selecionados mesclados com sucesso!', 'success');
                }
            }
        }
    } catch (e) {
        console.error("Erro no processo de PDF mÃºltiplo:", e);
        toast("Erro ao gerar PDFs mÃºltiplos: " + e.message, 'error');
    } finally {
        if (overlay) overlay.classList.remove('active');
        state.activeOSItem = originalActive;
        if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
    }
};

window.pedQueueImprimirMulti = async function() {
    return window.pedQueueGerarPDFMulti(true);
};

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
    const itens = typeof getOSItens === 'function' ? getOSItens(osId) : (state.osItens[osId] || []);
    if (!itens.length) {
        container.style.display = 'none';
        return;
    }

    // Se o item ativo não tem itemId definido, seleciona o primeiro item automaticamente
    if (!activeItem.itemId && itens.length > 0) {
        activeItem.itemId = itens[0].id;
    }

    container.style.display = 'block';

    const groups = {};
    itens.forEach(item => {
        const prodId = item._vibe_id_produto || 'sem_produto';
        if (!groups[prodId]) groups[prodId] = [];
        groups[prodId].push(item);
    });

    console.log('[renderPedOSQueue] state.produtosGlobais:', state.produtosGlobais);
    console.log('[renderPedOSQueue] groups keys:', Object.keys(groups));

    const todasCores = state.cores || [];
    const todasNums = state.numeracoes || [];
    const inputStyle = 'background:#030a00; border:1px solid #334155; border-radius:4px; color:#ffffff; padding:8px 10px; font-size:1.2rem; width:100%;';
    const selectStyle = 'appearance: none; -webkit-appearance: none; -moz-appearance: none; background: #030a00; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 1.15rem; width: 100%; max-width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; cursor: pointer; text-align: center; text-align-last: center; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: all 0.2s ease;';
    const selectStyleDisabled = 'appearance: none; -webkit-appearance: none; -moz-appearance: none; background: #030a00; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: rgba(255, 255, 255, 0.5); padding: 8px 12px; font-size: 1.15rem; width: 100%; cursor: not-allowed; text-align: center; text-align-last: center; font-weight: 600; opacity: 0.6;';
    const btnStyle = 'border:none; border-radius:6px; padding:10px 18px; font-size:1.05rem; cursor:pointer; font-weight:700; transition:all 0.2s ease; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);';

    const selectHeaderStyle = 'background:#1e293b; border:1px solid #918f8c; border-radius:4px; color:#f1f5f9; padding:4px 8px; font-size:0.85rem; cursor:pointer;';
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

        const allGroupImpresso = groupItens.length > 0 && groupItens.every(i => String(i.status_impressao || i.impressao || '').toUpperCase().includes('IMPRESSO'));
        const btnImpSelDisplay = allGroupImpresso ? 'display:none;' : 'display:inline-flex;';

        const headerDropdowns = `
            <div style="display:flex; gap:10px; align-items:center;" onclick="event.stopPropagation()">
                <button style="${btnStyle} background: linear-gradient(135deg, #a78bfa, #7c3aed); color:#fff; padding:6px 12px; font-size:0.9rem;" title="Gerar PDF dos modelos selecionados"
                    onclick="pedQueueGerarPDFMulti()">
                    📄 PDF Sel.
                </button>
                <button style="${btnStyle} background: linear-gradient(135deg, #34d399, #059669); color:#fff; padding:6px 12px; font-size:0.9rem; ${btnImpSelDisplay}" title="Imprimir modelos selecionados"
                    onclick="pedQueueImprimirMulti()">
                    🖨️  Imp. Sel.
                </button>
                <select style="${fmtHeaderStyle}" ${dropdownFmtDisabled} onchange="updateBoxFormato('${osId}', '${prodId}', this.value)" title="Formato PadrÃ£o do Produto">
                    <option value="">— Formato —</option>
                    ${formatosOptions}
                </select>
                <select style="${selectHeaderStyle}" onchange="updateBoxSaida('${osId}', '${prodId}', this.value)" title="SaÃ­da PadrÃ£o do Produto">
                    <option value="">— SaÃ­da —</option>
                    ${saidasOptions}
                </select>
                <span id="box-arrow-${prodId}-renderPedOSQueue" style="color:var(--text-dim); font-size:0.8rem; transition: transform 0.2s; margin-left:5px; cursor:pointer;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">â–¼</span>
            </div>
        `;

        html += `
        <div class="card mb-3" style="background:#1e293b; border: 1px solid #918f8c; border-radius: 6px; overflow:hidden; margin-bottom: 6pt;" data-setor="${setorPcp}">
            <div class="card-header d-flex justify-content-between align-items-center" style="background:#0f172a; padding: 10px 15px; border-bottom:1px solid #918f8c;">
                <div style="cursor:pointer; display:flex; align-items:center; flex:1;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">
                    <h5 class="mb-0" style="color: #facc15; font-size: calc(1.1rem + 3pt); font-weight:bold;">
                        <i class="fas fa-box-open me-2" style="color:#918f8c;"></i>${nomeReal} ${setorBadge}
                    </h5>
                </div>
                ${headerDropdowns}
            </div>
            <div class="table-responsive" id="box-body-${prodId}-renderPedOSQueue" style="padding: 0 3pt;">
                <table class="data-table table-dark table-sm mb-0 align-middle" style="font-size:1.0rem; margin:0; width:100%; border-collapse: separate; border-spacing: 0 6pt;">
                    <tbody>
        `;

        html += groupItens.map((item, idx) => {
            const isActive = activeItem.itemId === item.id || String(activeItem.itemId) === String(item.id);
            const isSelected = state.selectedOSItems && state.selectedOSItems.find(s => String(s.itemId) === String(item.id));
            const rawStatus = String(item.status_impressao || item.impressao || 'Aguardando').toUpperCase();
            
            let statusBg = '#65625e'; // Aguardando
            if (rawStatus.includes('IMPRESSO')) {
                statusBg = '#162037'; // Impresso
            } else if (rawStatus.includes('PARCIAL')) {
                statusBg = '#32352e'; // Parcial
            } else if (rawStatus.includes('AGUARD') || rawStatus === 'AGUARDANDO') {
                statusBg = '#65625e'; // Aguardando
            }

            const isCurrentSelected = isSelected || isActive;
            const rowStroke = isCurrentSelected ? 'outline: 2pt solid #f97316;' : 'outline: 1px solid #918f8c;';
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
            const blocoVal = item.bloco !== undefined && item.bloco !== null ? item.bloco : '';
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

            const jsItemId = item.id;
            const jsOsId = osId;

            return `
                <tr style="${rowBg} cursor: pointer; transition: background 0.2s;" class="hover-row" id="ped-queue-row-${item.id}"
                    onclick="enviarParaPedido('${jsItemId}', '${jsOsId}')">
                    <td style="padding: 12px; width: 40px; text-align: center;">
                        <input type="checkbox" style="width: 20px; height: 20px; cursor: pointer;"
                               onclick="event.stopPropagation(); togglePedItemSelection('${jsItemId}', '${jsOsId}')"
                               ${isSelected ? 'checked' : ''} />
                    </td>
                    <td style="padding: 12px; font-size: 1.15rem; font-weight:600; color:#ffffff; min-width:100px;" title="Código do Modelo">
                        ${item.modelo || '--'}
                    </td>
                    <td style="padding: 12px; font-size: 1.15rem; font-weight:600; color:#ffffff; min-width:140px;" title="Nome do Modelo">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 22px; height: 22px; min-width: 22px; min-height: 22px; border-radius: 50%; background-color: ${corRefHex || 'transparent'}; border: ${corRefHex ? '2px solid rgba(255, 255, 255, 0.8)' : '2px dashed #918f8c'}; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.4);" title="Cor de referência: ${corRefHex || 'Nenhuma'}"></span>
                            <span>${nomeDoModelo}</span>
                        </div>
                    </td>
                    
                    <td style="padding: 12px; width: 165px; min-width: 165px; max-width: 165px;" title="Quantidade">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">QTD</span>
                            <input type="number" min="0" value="${qtdVal}" style="${inputStyle}" placeholder="QTD"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'qtd', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 155px; min-width: 155px; max-width: 155px;" title="Num. Inicial">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">NI</span>
                            <input type="number" value="${niVal}" style="${inputStyle}" placeholder="NI"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'num_inicial', this.value)"
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
                    <td style="padding: 12px; width: 165px; min-width: 165px; max-width: 165px;" title="Ingressos por Bloco">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Bloco</span>
                            <input type="number" value="${blocoVal}" style="${inputStyle}" placeholder="Bloco"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'bloco', this.value)"
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 12px; width: 250px; min-width: 250px; max-width: 250px;" title="Cor">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">COR</span>
                            <select style="${corSelectStyle}" onchange="pedQueueUpdateCor('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()">
                                <option value="">— Cor —</option>
                                ${coresOptions}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px; width: 260px; min-width: 260px; max-width: 260px;" title="Numeração">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Núm.</span>
                            <select style="${selectStyle}" onchange="pedQueueUpdateNum('${item.id}', '${osId}', this.value)" onclick="event.stopPropagation()">
                                <option value="">— Numeração —</option>
                                ${numsOptions}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px; width: 165px; min-width: 165px; max-width: 165px;" title="Frente e Verso/Tipo de Verso">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Verso</span>
                            <select style="${selectStyle}" onchange="pedQueueUpdateField('${item.id}', '${osId}', 'verso_tipo', this.value)" onclick="event.stopPropagation()">
                                <option value="SÓ FRENTE" ${item.verso_tipo === 'SÓ FRENTE' || !item.verso_tipo ? 'selected' : ''}>SÓ FRENTE</option>
                                <option value="VERSO COMUM" ${item.verso_tipo === 'VERSO COMUM' ? 'selected' : ''}>VERSO COMUM</option>
                                <option value="VERSO VARIÃ VEL" ${item.verso_tipo === 'VERSO VARIÃ VEL' || item.verso_tipo === 'VERSO VARIAVEL' ? 'selected' : ''}>VERSO VARIÃ VEL</option>
                            </select>
                        </div>
                    </td>
                    <td style="padding: 12px; width: 270px; min-width: 270px; max-width: 270px;" title="Status de Produção">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1.05rem; font-weight: bold; color: #ffffff; white-space: nowrap;">Status</span>
                            <select style="${selectStyle}" onchange="pedQueueUpdateField('${item.id}', '${osId}', 'status_impressao', this.value)" onclick="event.stopPropagation()">
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
    updatePedImprimirButtonsVisibility();
}

function updatePedImprimirButtonsVisibility() {
    let activeIsImpresso = false;
    if (state.activeOSItem) {
        const itens = state.osItens[state.activeOSItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(state.activeOSItem.itemId));
        if (item) {
            const st = String(item.status_impressao || item.impressao || '').toUpperCase();
            if (st.includes('IMPRESSO')) {
                activeIsImpresso = true;
            }
        }
    }

    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    const btnPreviewPrint = document.getElementById('ped-preview-btn-print');
    const btnRefazerPrint = document.getElementById('ped-refazer-btn-print');

    if (btnImposePrint) {
        btnImposePrint.style.display = activeIsImpresso ? 'none' : 'flex';
    }
    if (btnPreviewPrint) {
        btnPreviewPrint.style.display = activeIsImpresso ? 'none' : 'flex';
    }
    if (btnRefazerPrint) {
        btnRefazerPrint.style.display = activeIsImpresso ? 'none' : 'inline-block';
    }
}
window.updatePedImprimirButtonsVisibility = updatePedImprimirButtonsVisibility;






























window.renderPedOSQueue = renderPedOSQueue;

function togglePedOSQueue() {
    const body = document.getElementById('ped-os-queue-body');
    const arrow = document.getElementById('ped-os-queue-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = 'â–¼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = 'â–¶';
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
    
    const activeOSItem = state.activeOSItem;
    console.log('[editPedidoCustomNumeracao] activeOSItem:', activeOSItem);
    let cliNum = null;
    if (activeOSItem) {
        const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
        console.log('[editPedidoCustomNumeracao] Found OS:', os);
        if (os) cliNum = os.id_cliente;
    }
    console.log('[editPedidoCustomNumeracao] resolved cliNum:', cliNum);

    // Configura o state para que no saveNumeracao volte para Pedido
    window.customNumeracaoEditState = {
        view: 'pedido',
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

window.runPedImposition = async function (mode) {
    if (window.isImposing) return;
    window.isImposing = true;
    window._printCancelRequested = false;

    const btnCancelPed = document.getElementById('ped-btn-cancel-print');
    if (btnCancelPed) btnCancelPed.style.display = 'inline-flex';
    const btnImpose = document.getElementById('ped-btn-impose');
    if (btnImpose) btnImpose.style.display = 'none';
    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    if (btnImposePrint) btnImposePrint.style.display = 'none';


    let fmtId = document.getElementById('ped-formato').value;

    let numId = document.getElementById('ped-numeracao').value;

    let saiId = document.getElementById('ped-saida').value;

    let start = parseInt(document.getElementById('ped-start').value);

    let end = parseInt(document.getElementById('ped-end').value);

    let schema = document.getElementById('ped-schema').value;

    let isMultiSelected = false;
    let tempMultiArtes = null;

    if (!state.multiArtesPdfCache) state.multiArtesPdfCache = {};
    if (!state.multiArtesPdfLoading) state.multiArtesPdfLoading = {};

    if (state.selectedOSItems && state.selectedOSItems.length > 1) {
        isMultiSelected = true;
        schema = 'multi_artes';
        tempMultiArtes = state.selectedOSItems.map(s => {
            const sItem = state.osItens[s.osId]?.find(i => String(i.id) === String(s.itemId));
            const qt = sItem ? (parseInt(sItem.qtd !== undefined && sItem.qtd !== null ? sItem.qtd : (sItem.quantidade || 0))) : 0;
            
            const corObj = sItem && sItem.amostra_cor_id
                ? (state.cores || []).find(c => String(c.id) === String(sItem.amostra_cor_id))
                : (sItem ? (state.cores || []).find(c => globalFuzzyMatch(c.name, sItem.cor || sItem.padrao || '')) : null);
            const arteViaCor = corObj ? (corObj.pdf_url || null) : null;
            const itemArteUrl = sItem ? sItem.arte_url || arteViaCor : null;
            
            const wantsDuplex = sItem ? !!(sItem.verso_tipo && sItem.verso_tipo !== 'SO FRENTE' && sItem.verso_tipo !== 'SO FRENTE') : false;
            const arteVersoViaCor = corObj ? (corObj.pdf_verso_base64 || corObj.pdf_verso_url || null) : null;
            const itemArteVersoUrl = (sItem && wantsDuplex) ? (sItem.verso_arte_url || sItem.url_arquivo_arte_verso || arteVersoViaCor) : null;

            let pdfDoc = null;
            if (itemArteUrl && state.multiArtesPdfCache[itemArteUrl]) {
                pdfDoc = state.multiArtesPdfCache[itemArteUrl];
            } else if (itemArteUrl && !state.multiArtesPdfLoading[itemArteUrl]) {
                state.multiArtesPdfLoading[itemArteUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteUrl] = doc;
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF for multi arte preview:', e);
                });
            }

            let pdfVersoDoc = null;
            if (itemArteVersoUrl && state.multiArtesPdfCache[itemArteVersoUrl]) {
                pdfVersoDoc = state.multiArtesPdfCache[itemArteVersoUrl];
            } else if (itemArteVersoUrl && !state.multiArtesPdfLoading[itemArteVersoUrl]) {
                state.multiArtesPdfLoading[itemArteVersoUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteVersoUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteVersoUrl] = doc;
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF VERSO for multi arte preview:', e);
                });
            }

            return {
                qtd: qt,
                nome: sItem ? sItem.modelo : '',
                num1_id: sItem ? (sItem.numeracao_id || sItem.amostra_num_id || numId) : numId,
                start: sItem ? parseInt(sItem.num_inicial !== undefined && sItem.num_inicial !== null ? sItem.num_inicial : (sItem.numeracao_inicio || 1)) : 1,
                has_raw_file: false,
                is_selected: true,
                amostra_cor_id: sItem ? sItem.amostra_cor_id : null,
                pdfDoc: pdfDoc,
                pdfVersoDoc: pdfVersoDoc,
                bloco: sItem && sItem.bloco ? parseInt(sItem.bloco) : null
            };
        });
    }

    const rotateEl = document.getElementById('ped-rotate-page');
    const rotatePage = rotateEl ? (parseInt(rotateEl.value) || 0) : 0;



    if (!fmtId) return toast('Selecione um Formato.', 'error');

    if (!saiId) return toast('Selecione uma SaÃ­da.', 'error');

    

    if (schema === 'multi_artes' || isMultiSelected) {

        // Valida se todas as artes da lista tÃªm PDF carregado, caso não seja multi seleção virtual

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        if (!isMultiSelected) {
            for (let i = 0; i < artesList.length; i++) {

                if (!artesList[i].pdf_url || (artesList[i].pdf_url === 'local_file' && !artesList[i].rawFile)) {

                    return toast(`Arte ${i + 1}: faÃ§a o upload do PDF da arte (necessário a cada sessão).`, 'error');

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
        // NÃ£o exige arte, permite gerar apenas com a numeração
    }

    

    if (schema !== 'multi_artes' && schema !== 'pdf_multiple') {

        if (start > end) return toast('Número inicial deve ser menor que o final.', 'error');

    }



    const formato = state.formatos.find(f => f.id === fmtId);

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

    if (window.showDirectoryPicker && mode !== 'print') {
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
    if (!directoryHandle && window.showSaveFilePicker && mode !== 'print') {
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

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

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

                has_raw_file: !!arte.rawFile,

                q_cam: arte.q_cam || 0,

                l_cam: arte.l_cam || 1

            };

        });

    }



    let payloadNumeracao = numeracao ? JSON.parse(JSON.stringify(numeracao)) : null;
    if (payloadNumeracao && state.csvData) {
        payloadNumeracao.csv_data = state.csvData;
    }

    const payload = {

        formato_id: fmtId,

        suggested_filename: defaultFilename,

        stream: true,

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

        block_depth: document.getElementById('ped-block-depth') ? parseInt(document.getElementById('ped-block-depth').value) || 1 : 1,

        // CAMAROTE: C_INI, Q_CAM e L_CAM do item da OS (lidos automaticamente via campos hidden ou fallback do item ativo)
        c_ini: (state.activeOSItem ? parseInt(state.activeOSItem.c_ini) : null) || parseInt(document.getElementById('ped-c-ini')?.value || 1) || 1,
        q_cam: (state.activeOSItem ? parseInt(state.activeOSItem.q_cam) : null) || parseInt(document.getElementById('ped-q-cam')?.value || 0) || 0,
        l_cam: (state.activeOSItem ? parseInt(state.activeOSItem.l_cam) : null) || parseInt(document.getElementById('ped-l-cam')?.value || 1) || 1,

        refazer_de: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-de')?.value) || 0) : 0,
        refazer_ate: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-ate')?.value) || 0) : 0,
        refazer_set: document.getElementById('ped-refazer-checkbox')?.checked ? (parseInt(document.getElementById('ped-refazer-set')?.value) || 1) : 1
    };



    const formData = new FormData();
    const isPedTab = document.getElementById('view-pedido')?.classList.contains('active');
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

        // Filtrar propriedades internas do frontend (não-serializÃ¡veis ou irrelevantes ao backend)

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

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        total = artesList.reduce((acc, a) => acc + (parseInt(a.qtd) || 0), 0);

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
        if (contentType && contentType.includes("text/event-stream")) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let currentEvent = null;
            // Acumular blobs no modo print para envio sequencial à impressora
            const printBlobQueue = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
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

                                if (mode === 'print') {
                                    printBlobQueue.push({ name: fileObj.name, blob: fBlob });
                                    toast(`Arquivo gerado: ${fileObj.name}`, 'info');
                                } else if (directoryHandle) {
                                    toast(`Salvando: ${fileObj.name}...`, 'info');
                                    const fh = await directoryHandle.getFileHandle(fileObj.name, { create: true });
                                    const writable = await fh.createWritable();
                                    await writable.write(fBlob);
                                    await writable.close();
                                } else {
                                    toast(`Salvando: ${fileObj.name}...`, 'info');
                                    const url = window.URL.createObjectURL(fBlob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = fileObj.name;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    window.URL.revokeObjectURL(url);
                                    await new Promise(r => setTimeout(r, 200));
                                }
                            } catch (e) {
                                console.error("Erro ao processar arquivo do stream:", e);
                                toast(`Erro ao salvar arquivo do lote: ${e.message}`, 'error');
                            }
                        } else if (currentEvent === "error" && dataStr) {
                            try {
                                const errObj = JSON.parse(dataStr);
                                throw new Error(errObj.message || "Erro desconhecido no processamento");
                            } catch (e) { throw e; }
                        }
                    }
                }
            }

            if (mode === 'print' && printBlobQueue.length > 0) {
                if (overlay) overlay.classList.remove('active');
                toast(`Imposição concluída. Enviando ${printBlobQueue.length} arquivo(s) para a impressora...`, 'info');
                if (typeof sendPrintJobDirect === 'function') {
                    const ok = await sendPrintJobDirect(printBlobQueue);
                    if (ok && state.activeOSItem && state.activeOSItem.itemId) {
                        await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                        if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
                    }
                } else {
                    await openPrintModalQueue(printBlobQueue);
                }
                return;
            }

            toast('Processo de imposição concluído e arquivos salvos!', 'success');
            if (state.activeOSItem && state.activeOSItem.itemId) {
                await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
            }
            return;
        }

        // Fallbacks caso não venha como stream (JSON ou blob de arquivo único direto)
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.type === "multi_file") {
                // Converter todos em blobs
                const multiBlobs = data.files.map(f => {
                    const binStr = atob(f.data);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    return { name: f.name, blob: new Blob([bytes], {type: "application/pdf"}) };
                });

                if (mode === 'print') {
                    if (overlay) overlay.classList.remove('active');
                    toast(`Imposição concluída. Enviando ${multiBlobs.length} arquivo(s) para a impressora...`, 'info');
                    if (typeof sendPrintJobDirect === 'function') {
                        const ok = await sendPrintJobDirect(multiBlobs);
                        if (ok && state.activeOSItem && state.activeOSItem.itemId) {
                            await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                            if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
                        }
                    } else {
                        await openPrintModalQueue(multiBlobs);
                    }
                    return;
                }

                toast(`Salvando ${multiBlobs.length} arquivos...`, 'info');
                for (const item of multiBlobs) {
                    if (directoryHandle) {
                        try {
                            const fh = await directoryHandle.getFileHandle(item.name, { create: true });
                            const writable = await fh.createWritable();
                            await writable.write(item.blob);
                            await writable.close();
                        } catch (errSave) {
                            console.error(`Erro ao salvar ${item.name} na pasta:`, errSave);
                        }
                    } else {
                        const url = window.URL.createObjectURL(item.blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = item.name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
                toast('Arquivos de imposição salvos com sucesso!', 'success');
                if (state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
                }
                return;
            }
        }

        const blob = await res.blob();

        // Modo impressão direta: usar painel lateral sem abrir modal
        if (mode === 'print') {
            if (overlay) overlay.classList.remove('active');
            if (typeof sendPrintJobDirect === 'function') {
                const queue = [{ name: defaultFilename, blob }];
                const ok = await sendPrintJobDirect(queue);
                if (ok && state.activeOSItem && state.activeOSItem.itemId) {
                    await updateItemImpressao(state.activeOSItem.itemId, state.activeOSItem.osId, 'IMPRESSO');
                    if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
                }
            } else {
                await openPrintModal(blob);
            }
            return;
        }

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
                    if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
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
                    if (typeof renderImpOSQueue === 'function') renderPedOSQueue();
                }
                return;
            } catch (err) {
                console.error("Falha ao salvar no arquivo escolhido previamente, usando fallback:", err);
            }
        }




        // Modo impressao direta: abrir modal de seleção de impressora
        if (mode === 'print') {
            if (_printerAgentActive) {
                // Modo Cloud Relay: abrir modal do agente
                openPrintModal(blob);
                toast('PDF gerado! Selecione a impressora.', 'success');
            } else {
                // Modo Local Direto: abrir modal nativo de impressão
                openPrintModal(blob);
                toast('PDF gerado! Configure e envie para a impressora local.', 'success');
            }
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
        window.isImposing = false;
        if (progressInterval) clearInterval(progressInterval);

        if (pBar) pBar.style.width = '100%';

        if (pText) pText.textContent = 'Concluído! (100%)';

        setTimeout(() => {
            if (overlay) overlay.classList.remove('active');
            const btnCancelPed = document.getElementById('ped-btn-cancel-print');
            if (btnCancelPed) btnCancelPed.style.display = 'none';
            const btn = document.getElementById('ped-btn-impose');
            if (btn) {
                btn.style.display = 'inline-flex';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
            const btnPrint = document.getElementById('ped-btn-impose-print');
            if (btnPrint) btnPrint.style.display = 'inline-flex';
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
        if (arrow) arrow.textContent = 'â–¼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = 'â–¶';
    }
};







// Helpers para gerar PDF e imprimir a partir da fila de itens no menu Pedido
async function pedQueueGerarPDF(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    // Definir status como IMPRESSO
    pedQueueUpdateField(itemId, osId, 'status_impressao', 'IMPRESSO');
    setTimeout(() => {
        // Clicar no botão da aba Pedido (ped-btn-impose)
        const btnGerar = document.getElementById('ped-btn-impose');
        if (btnGerar) {
            btnGerar.click();
        } else if (typeof runPedImposition === 'function') {
            runPedImposition();
        }
    }, 1200);
}

async function pedQueueImprimir(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    // Definir status como IMPRESSO
    pedQueueUpdateField(itemId, osId, 'status_impressao', 'IMPRESSO');
    setTimeout(() => {
        // Clicar no botão de Imprimir da aba Pedido (ped-btn-impose-print)
        const btnImprimir = document.getElementById('ped-btn-impose-print');
        if (btnImprimir) {
            btnImprimir.removeAttribute('disabled');
            btnImprimir.style.opacity = '1';
            btnImprimir.click();
        } else if (typeof runPedImposition === 'function') {
            runPedImposition('print');
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
    renderPedOSQueue();
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
        autoSaveOSItemField(itemId, osId, 'num_final', nf);

        // Atualizar input de NF no DOM
        const row = document.getElementById(`ped-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
        }

        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('ped-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }

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
        autoSaveOSItemField(itemId, osId, 'num_final', nf);
        
        // Atualizar input de NF no DOM
        const row = document.getElementById(`ped-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
        }
        
        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('ped-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }
    }

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
        } else if (field === 'verso_tipo') {
            item.verso = !!(value && value !== 'SÓ FRENTE' && value !== 'SO FRENTE');
            const printMode = document.getElementById('ped-print-mode');
            if (printMode) {
                const wantsDuplex = (value !== 'SÓ FRENTE' && value !== 'SO FRENTE');
                printMode.value = wantsDuplex ? 'duplex' : 'front';
                if (typeof updatePedSummary === 'function') {
                    updatePedSummary();
                }
            }
        }
    }
    enviarParaPedido(itemId, osId);

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
        renderPedOSQueue();
        updatePedImprimirButtonsVisibility();
    }
}

window.pedQueueGerarPDF = pedQueueGerarPDF;
window.pedQueueImprimir = pedQueueImprimir;

// Botões do preview — atuam sobre o modelo em visualização
window.pedPreviewGerarPDF = function() {
    if (!state.activeOSItem) {
        toast('Nenhum modelo selecionado para gerar PDF.', 'warning');
        return;
    }
    if (typeof runPedImposition === 'function') {
        runPedImposition('pdf');
    }
};

window.pedPreviewImprimir = function() {
    if (!state.activeOSItem) {
        toast('Nenhum modelo selecionado para imprimir.', 'warning');
        return;
    }
    if (typeof runPedImposition === 'function') {
        runPedImposition('print');
    }
};

window.pedQueueUpdateCor = pedQueueUpdateCor;
window.pedQueueUpdateNum = pedQueueUpdateNum;
window.pedQueueUpdateField = pedQueueUpdateField;
function buildStrictAssemblySets(artesList, isMulti, totItems, stackSize, posesPerSheet) {
    let multiMap = [];
    let curr_idx = 0;
    let hasArtes = artesList && artesList.length > 0;
    if (hasArtes) {
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            
            // Resolve ticket_qtd
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            let physical_q = q;
            
            for (let j = 0; j < physical_q; j++) {
                multiMap.push({ global_index: curr_idx + j, arte_index: i, local_index: j });
            }
            curr_idx += physical_q;
        }
    } else {
        for (let j = 0; j < totItems; j++) {
            multiMap.push({ global_index: j, arte_index: 0, local_index: j });
        }
    }
    let models_items = [];
    if (hasArtes) {
        let start = 0;
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            let physical_q = q;
            models_items.push(multiMap.slice(start, start + physical_q));
            start += physical_q;
        }
    } else {
        models_items.push(multiMap);
    }
    let complete_blocks = [];
    let leftovers_by_model = models_items.map(() => []);
    for (let j = 0; j < models_items.length; j++) {
        let items = models_items[j];
        let num_blocks = Math.floor(items.length / stackSize);
        for (let b = 0; b < num_blocks; b++) {
            complete_blocks.push({ model_idx: j, block: items.slice(b * stackSize, (b + 1) * stackSize) });
        }
        leftovers_by_model[j] = items.slice(num_blocks * stackSize);
    }
    let total_blocks = complete_blocks.length;
    let set_definitions = [];
    let blocks_used = 0;
    if (total_blocks >= posesPerSheet) {
        let blocks_remaining = total_blocks - blocks_used;
        let depth = Math.floor(blocks_remaining / posesPerSheet);
        if (depth >= 1) {
            let num_blocks_in_set = depth * posesPerSheet;
            let set_blocks = complete_blocks.slice(blocks_used, blocks_used + num_blocks_in_set);
            
            for (let d = 0; d < depth; d++) {
                let layer_allocations = [];
                for (let P = 0; P < posesPerSheet; P++) {
                    let block_idx = P * depth + d;
                    if (block_idx < set_blocks.length) {
                        layer_allocations.push(set_blocks[block_idx].block);
                    } else {
                        layer_allocations.push([]);
                    }
                }
                set_definitions.push({ type: "strict", num_sheets: stackSize, cell_allocations: layer_allocations, depth: 1 });
            }
            blocks_used += num_blocks_in_set;
        }
    }
    let remaining_blocks = complete_blocks.slice(blocks_used);
    for (let i = 0; i < remaining_blocks.length; i++) {
        leftovers_by_model[remaining_blocks[i].model_idx] = leftovers_by_model[remaining_blocks[i].model_idx].concat(remaining_blocks[i].block);
    }
    for (let j = 0; j < leftovers_by_model.length; j++) {
        leftovers_by_model[j].sort((a, b) => a.local_index - b.local_index);
    }
    for (let j = 0; j < leftovers_by_model.length; j++) {
        let leftovers = leftovers_by_model[j];
        if (leftovers.length > 0) {
            let num_sheets = Math.ceil(leftovers.length / posesPerSheet);
            let cell_allocations = [];
            for (let P = 0; P < posesPerSheet; P++) {
                let cell_items = leftovers.slice(P * num_sheets, (P + 1) * num_sheets);
                if (cell_items.length < num_sheets) {
                    let diff = num_sheets - cell_items.length;
                    for (let k = 0; k < diff; k++) cell_items.push(null);
                }
                cell_allocations.push(cell_items);
            }
            set_definitions.push({ type: "assembly", num_sheets: num_sheets, cell_allocations: cell_allocations, depth: 1 });
        }
    }
    return set_definitions;
}
window.buildStrictAssemblySets = buildStrictAssemblySets;
