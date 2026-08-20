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
    const itemIdx = window.editorState.activeItemIdx;

    if (!item) return;

    // Obter Cor, Numeração e Formato consultando DOM selects + item + fuzzy match
    const containerId = state.amostrasContainerId || 'amostras-itens-container';
    const container = document.getElementById(containerId);

    const corSelect = container ? container.querySelector(`#amostra-item-cor-${itemIdx}`) : null;
    const numSelect = container ? container.querySelector(`#amostra-item-num-${itemIdx}`) : null;

    let corId = (corSelect && corSelect.value) ? corSelect.value : ((face === 'verso' && item.amostra_cor_verso_id) ? item.amostra_cor_verso_id : item.amostra_cor_id);
    let numId = (numSelect && numSelect.value) ? numSelect.value : item.amostra_num_id;

    let cor = corId ? (state.cores || []).find(c => String(c.id) === String(corId)) : null;
    if (!cor && item.cor && state.cores) {
        cor = state.cores.find(c => (c.name || '').toLowerCase().trim() === item.cor.toLowerCase().trim() || (typeof globalFuzzyMatch === 'function' && globalFuzzyMatch(c.name, item.cor)));
    }

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
        // A Camada 3 inteira e desenhada com mix-blend-mode: multiply (style.css),
        // para a arte fundir com a cor do papel como funde no card do pedido. Isso
        // atinge tambem as alcas de selecao, e o padrao do Fabric (cantos vazados
        // em azul claro) praticamente some sobre cores fortes. Cantos preenchidos
        // e escuros sobrevivem ao multiply sobre qualquer cor de papel.
        fabric.Object.prototype.transparentCorners = false;
        fabric.Object.prototype.cornerColor = '#0f172a';
        fabric.Object.prototype.cornerStrokeColor = '#f8fafc';
        fabric.Object.prototype.borderColor = '#0f172a';
        fabric.Object.prototype.cornerSize = 10;

        const fc = new fabric.Canvas('editor-canvas-layer3', {
            width: canvasW,
            height: canvasH,
            preserveObjectStacking: true,
            selection: true
        });

        // Eventos de seleção e transformação em tempo real
        fc.on('selection:created', updateInspectorFromSelection);
        fc.on('selection:updated', updateInspectorFromSelection);
        fc.on('selection:cleared', clearInspectorPanel);
        fc.on('object:modified', () => { updateInspectorFromSelection(); saveEditorHistory(); });
        fc.on('object:scaling', updateInspectorFromSelection);
        fc.on('object:rotating', updateInspectorFromSelection);
        fc.on('object:moving', (e) => {
            updateInspectorFromSelection();
            const obj = e.target;
            if (!obj) return;
            // Movimento paralelo travado nos eixos X/Y quando Shift estiver pressionado
            if (e.e && e.e.shiftKey) {
                const startX = obj._dragStartX !== undefined ? obj._dragStartX : obj.left;
                const startY = obj._dragStartY !== undefined ? obj._dragStartY : obj.top;
                const deltaX = Math.abs(obj.left - startX);
                const deltaY = Math.abs(obj.top - startY);
                if (deltaX > deltaY) {
                    obj.set('top', startY);
                } else {
                    obj.set('left', startX);
                }
            }
        });
        fc.on('mouse:down', (e) => {
            if (e.target) {
                e.target._dragStartX = e.target.left;
                e.target._dragStartY = e.target.top;
            }
        });

        window.editorState.fabricCanvas = fc;

        // GRUPO ARTE + NUMERACAO
        //
        // A numeracao nao funde com a arte: ela cobre a arte, e sao as duas JUNTAS que
        // multiplicam sobre a cor (Camada 1). Em CSS isso exige um elemento que envolva
        // as duas -- e a #editor-blend-group, criada aqui. O style.css lhe da
        // 'isolation: isolate' (contexto de fusao proprio, onde a numeracao compoe
        // normalmente sobre a arte) e 'mix-blend-mode: multiply' (o resultado do grupo
        // inteiro multiplicando contra a camada de baixo).
        //
        // A div e movida a cada setup porque o dispose() do Fabric desmonta o container
        // e o recria: o grupo e reaproveitado pelo id e os dois filhos sao reanexados.
        const stackWrapper = document.getElementById('editor-canvas-stack');
        if (stackWrapper) {
            let blendGroup = document.getElementById('editor-blend-group');
            if (!blendGroup) {
                blendGroup = document.createElement('div');
                blendGroup.id = 'editor-blend-group';
                stackWrapper.appendChild(blendGroup);
            }
            blendGroup.style.width = canvasW + 'px';
            blendGroup.style.height = canvasH + 'px';

            const fabricWrapper = stackWrapper.querySelector('.canvas-container');
            if (fabricWrapper) {
                fabricWrapper.style.position = 'absolute';
                fabricWrapper.style.top = '0px';
                fabricWrapper.style.left = '0px';
                fabricWrapper.style.zIndex = '10';
                blendGroup.appendChild(fabricWrapper);
            }
            // A numeracao entra no grupo, por cima da arte (z-index 100 no style.css)
            if (l2) blendGroup.appendChild(l2);
        }

        // O campo amostra_arte_base64 guarda duas coisas diferentes: a arte do
        // modelo e, quando um snapshot e gerado, a URL da PREVIA COMPOSTA
        // (cor + arte + numeracao) no bucket amostras_renderizadas. Essa previa
        // interessa ao portal do cliente, nunca ao editor.
        //
        // Sem esta distincao: ao excluir a arte, o snapshot agendado 2s depois
        // regrava o campo com a previa, e o editor a carregava como se fosse a
        // arte do modelo — a arte "excluida" reaparecia.
        const ehRenderComposto = (v) => typeof v === 'string' && v.includes('/amostras_renderizadas/');
        const arteDoItem = (it, f) => {
            const base64 = f === 'verso' ? it.verso_amostra_arte_base64 : it.amostra_arte_base64;
            return {
                url:  f === 'verso' ? it.verso_arte_url : it.arte_url,
                json: f === 'verso' ? it.verso_arte_json : it.arte_json,
                // so vale como arte se NAO for a previa renderizada
                base64: ehRenderComposto(base64) ? null : base64
            };
        };

        // Tentar recarregar estrutura vetorial JSON salva (memória ou localStorage)
        // CRITICAL: Se a arte do modelo foi removida, NUNCA carregar resíduos do localStorage!
        const _arte = arteDoItem(item, face);
        const hasArteOnItem = !!(_arte.url || _arte.base64 || _arte.json);

        let savedJson = null;
        let rawArteSource = null;

        if (hasArteOnItem) {
            // O arte_json em memoria e sempre da sessao atual (o banco nao guarda
            // essa coluna), entao vale como esta.
            savedJson = face === 'verso' ? item.verso_arte_json : item.arte_json;

            // Ja o JSON do localStorage sobrevive entre sessoes e pode ser de uma
            // edicao que o "Upload de Arte" substituiu depois. O nome do arquivo
            // diz a origem: o editor sobe "arte_criada_*", o upload sobe "arte_*".
            // Se a URL atual nao veio do editor, esse JSON e residuo -- usa-lo
            // reabriria a arte velha e ignoraria o arquivo enviado.
            const urlAtual = _arte.url || '';
            const jsonLocalConfiavel = !urlAtual || urlAtual.includes('arte_criada_');

            if (!savedJson && jsonLocalConfiavel) {
                if (item.id) {
                    savedJson = localStorage.getItem(`ideal_arte_json_${item.id}_${face}`);
                }
                if (!savedJson) {
                    savedJson = localStorage.getItem(`ideal_arte_json_${osId}_${itemIdx}_${face}`);
                }
            }

            rawArteSource = _arte.url || _arte.base64;
        } else {
            // Arte foi excluída — purgar qualquer resíduo legado do localStorage
            if (item.id) {
                localStorage.removeItem(`ideal_arte_json_${item.id}_${face}`);
                localStorage.removeItem(`ideal_arte_url_${item.id}_${face}`);
            }
            localStorage.removeItem(`ideal_arte_json_${osId}_${itemIdx}_${face}`);
            localStorage.removeItem(`ideal_arte_url_${osId}_${itemIdx}_${face}`);
        }

        // Se não tiver fonte salva no objeto item, buscar se há um arquivo selecionado no input file do DOM
        if (!rawArteSource && hasArteOnItem) {
            const inputId = face === 'verso' ? `amostra-item-arte-verso-${itemIdx}` : `amostra-item-arte-${itemIdx}`;
            const containerId = state.amostrasContainerId || 'amostras-itens-container';
            const container = document.getElementById(containerId) || document;
            const input = container.querySelector(`#${inputId}`);
            if (input && input.files && input.files[0]) {
                const file = input.files[0];
                rawArteSource = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                });
            }
        }

        // Os dois carregamentos sao aguardados de proposito. O saveEditorHistory()
        // no fim de setupEditorWorkspace() e o passo 0 do historico; se a arte
        // entrasse depois dele, o passo 0 seria uma prancha vazia e um Ctrl+Z
        // logo apos abrir apagaria a arte que acabou de ser carregada.
        if (savedJson) {
            try {
                await new Promise((resolve) => fc.loadFromJSON(savedJson, resolve));
                fc.renderAll();
            } catch(e) {
                console.warn('[Criador de Arte] Erro ao carregar JSON da arte salva:', e);
            }
        } else if (rawArteSource) {
            // Sem JSON vetorial, mas o modelo tem arte vinda do "Upload de Arte"
            // convencional (ou colada de outro modelo): ela entra como objeto base
            // da Camada 3 para a criacao continuar por cima dela.
            await carregarArteBaseNoCanvas(fc, rawArteSource);
        }
    }

    // Renderizar Camadas 1 e 2
    await renderEditorLayer1Cor(cor, fmt, face);
    renderEditorLayer2Numeracao(num, fmt, face);

    // Ajustar zoom inicial à tela
    editorResetZoom();

    // Carregar anexos do pedido na barra lateral esquerda
    carregarAnexosNoEditor();

    // Salvar snapshot do estado inicial para o historico (passo 0)
    saveEditorHistory();
}

/**
 * Rasteriza a arte que o modelo ja possui (PDF ou imagem, URL publica ou base64)
 * e a insere como objeto base editavel da Camada 3 (Fabric).
 *
 * O enquadramento e o mesmo de drawAmostraFace() no script.js, que copia o
 * engine.py: arte em PDF entra no TAMANHO REAL da pagina, centrada, e o que
 * passar da prancha fica de fora; arte em IMAGEM entra em "contain", cabendo
 * inteira, com proporcao preservada e centralizada nos dois eixos.
 * Divergir daqui faz o editor mostrar a arte num lugar e o card do pedido noutro.
 */
async function carregarArteBaseNoCanvas(fc, rawArteSource) {
    if (!fc || !rawArteSource || typeof fabric === 'undefined') return false;

    try {
        let imgUrl = rawArteSource;

        // A deteccao ignora querystring/hash: a URL publica do Supabase pode vir
        // com ?token=..., e um endsWith('.pdf') cru daria falso negativo -- o PDF
        // seria carregado como <img> e falharia em silencio.
        const semQuery = imgUrl.split('?')[0].split('#')[0].toLowerCase();
        const ehPdf = imgUrl.includes('application/pdf') || semQuery.endsWith('.pdf');

        if (ehPdf) {
            if (typeof pdfjsLib === 'undefined') {
                toast('PDF.js indisponível — não foi possível abrir a arte em PDF.', 'error');
                return false;
            }
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            // fetchPdfBytes (script.js) ja resolve base64, URL e o fallback via
            // /api/proxy quando o CORS bloqueia o fetch direto.
            let bytes;
            if (typeof fetchPdfBytes === 'function') {
                bytes = new Uint8Array(await fetchPdfBytes(imgUrl));
            } else if (imgUrl.startsWith('http') || imgUrl.startsWith('/')) {
                bytes = new Uint8Array(await fetch(imgUrl).then(r => r.arrayBuffer()));
            } else {
                const b64 = imgUrl.includes('base64,') ? imgUrl.split('base64,')[1] : imgUrl;
                const bin = atob(b64);
                bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            }

            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 2.0 });
            const offCanvas = document.createElement('canvas');
            offCanvas.width = vp.width;
            offCanvas.height = vp.height;
            await page.render({ canvasContext: offCanvas.getContext('2d'), viewport: vp }).promise;
            imgUrl = offCanvas.toDataURL('image/png');
        }

        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = 'Anonymous';
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Falha ao carregar a imagem da arte'));
            el.src = imgUrl;
        });

        if (!img.width || !img.height) return false;

        const fImg = new fabric.Image(img);
        // Enquadramento: o MESMO de drawAmostraFace(), que por sua vez copia o
        // engine.py. Sao duas regras, e nao uma:
        //
        //   PDF    -> tamanho REAL da pagina, centrado; o que passar da prancha
        //             fica de fora, como a faca corta. O raster acima saiu a 2.0
        //             (2 px por ponto = 2 x 2,8346 px por mm) e a prancha tem
        //             `scalePxPerMm` px por mm, entao a escala do tamanho real e
        //             scalePxPerMm / (2 x 2,8346).
        //   IMAGEM -> "contain": cabe inteira, proporcao preservada, centrada.
        //             E o que o motor faz com imagem em _load_base_as_pdf().
        //
        // Ate 18/08/2026 as duas caiam no "contain", e a arte em PDF entrava no
        // editor maior do que ela sai no papel sempre que a pagina do PDF nao
        // tinha exatamente o tamanho da peca.
        const escalaPranchaPxPorMm = (window.editorState && window.editorState.scalePxPerMm) || 4.0;
        let scale;
        if (ehPdf) {
            scale = escalaPranchaPxPorMm / (2.0 * 2.8346);
        } else {
            const arteRatio = img.width / img.height;
            const pranchaRatio = fc.width / fc.height;
            scale = arteRatio > pranchaRatio ? (fc.width / img.width) : (fc.height / img.height);
        }

        fImg.set({
            scaleX: scale,
            scaleY: scale,
            left: (fc.width - img.width * scale) / 2,
            top: (fc.height - img.height * scale) / 2,
            // A arte do fluxo convencional E uma camada multiply: drawAmostraFace()
            // sempre a compoe assim sobre a cor (script.js, blocos do PDF e da
            // imagem). Entrar como source-over perderia essa propriedade -- o
            // checkbox "Efeito Multiply" abriria desmarcado e um Salvar gravaria
            // a arte sem a fusao com que ela foi feita para imprimir.
            globalCompositeOperation: 'multiply'
        });

        fc.add(fImg);
        fc.renderAll();
        return true;
    } catch (err) {
        // Antes esse caminho so fazia console.warn: a prancha abria vazia e parecia
        // que o modelo nao tinha arte. Agora o operador e avisado.
        console.warn('[Criador de Arte] Erro ao carregar a arte existente no editor:', err);
        toast('Não foi possível carregar no editor a arte já enviada neste modelo.', 'error');
        return false;
    }
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

    // O catálogo de cores não traz o PDF de referência (18 MB para as 24
    // cores). `garantirPdfDaCor`, do script.js, busca o desta cor.
    if (cor && typeof window.garantirPdfDaCor === 'function') {
        await window.garantirPdfDaCor(cor);
    }

    if (cor) {
        const hasVerso = (face === 'verso');
        const rawData = hasVerso ? 
            (cor.pdf_verso_base64 || cor.pdf_verso_url || cor.verso_pdf_url || cor.pdf_base64 || cor.pdf_url || cor.url || cor.pdf || cor.imagem_verso_base64 || cor.imagem_base64) : 
            (cor.pdf_base64 || cor.pdf_url || cor.url || cor.pdf || cor.imagem_base64 || cor.imagem_url);

        if (rawData && typeof rawData === 'string') {
            const isPdf = rawData.includes('application/pdf') || 
                rawData.toLowerCase().includes('.pdf') || 
                rawData.startsWith('JVBERi') || 
                (!rawData.startsWith('data:image') && !rawData.startsWith('http') && !rawData.endsWith('.png') && !rawData.endsWith('.jpg') && !rawData.endsWith('.jpeg'));

            if (isPdf && typeof pdfjsLib !== 'undefined') {
                try {
                    let bytes;
                    if (rawData.startsWith('http') || rawData.startsWith('/')) {
                        const res = await fetch(rawData);
                        const buf = await res.arrayBuffer();
                        bytes = new Uint8Array(buf);
                    } else {
                        const base64Data = rawData.includes('base64,') ? rawData.split('base64,')[1] : rawData;
                        const binStr = atob(base64Data);
                        bytes = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    }

                    const loadingTask = pdfjsLib.getDocument({ data: bytes });
                    const pdf = await loadingTask.promise;
                    const pageNum = (hasVerso && pdf.numPages >= 2 && !cor.pdf_verso_base64 && !cor.pdf_verso_url) ? 2 : 1;
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
                    console.warn('[Criador de Arte] Erro ao renderizar PDF da cor:', e);
                }
            }

            if (!corRendered) {
                try {
                    let imgUrl = rawData;
                    if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                        imgUrl = 'data:image/png;base64,' + rawData;
                    }
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = imgUrl;
                    });
                    ctx.drawImage(img, 0, 0, l1.width, l1.height);
                    corRendered = true;
                } catch (e) {
                    console.warn('[Criador de Arte] Erro ao renderizar Imagem da cor:', e);
                }
            }
        }

        if (!corRendered && (cor.cor_hex || cor.hex || cor.color_hex)) {
            ctx.fillStyle = cor.cor_hex || cor.hex || cor.color_hex;
            ctx.fillRect(0, 0, l1.width, l1.height);
            corRendered = true;
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
    const item = window.editorState.activeItem;
    ctx.clearRect(0, 0, l2.width, l2.height);

    if (!num || !num.elements) return;

    // Fundo transparente -- contorno guia do formato
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, l2.width, l2.height);

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
                const _lVal = (state.csvData && state.csvData[0]) ? state.csvData[0].Numero || '22' : 'A';
                const fila = `${el.prefix_fila || ''}${_fVal}`;
                const lugar = `${el.prefix_lugar || ''}${_lVal}`;
                label = el.layout === '2lines' ? `${fila}\n${lugar}` : `${fila} - ${lugar}`;
            } else if (el.type === 'CAMAROTE_LOCAL') {
                const _cIni = parseInt(item?.c_ini || item?.C_INI || 1);
                label = `${el.prefix || ''}${_cIni}`;
            } else if (el.type === 'CAMAROTE_PESSOA') {
                label = `${el.prefix || ''}1`;
            } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                const _lCamB = parseInt(item?.l_cam || item?.L_CAM || item?.lotacao_cam || item?.LOTACAO_CAM || item?.lotacao || 5);
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
                    const start = parseInt(item?.numeracao_inicio || item?.num_inicial || item?.NUMERACAO_INICIO || 1) || 1;
                    current_val = start + (pos - 1);
                } else {
                    current_val = parseInt(item?.numeracao_inicio || item?.num_inicial || item?.NUMERACAO_INICIO || 1) || 1;
                }
                label = `${el.prefix || ''}${String(current_val).padStart(padVal, '0')}${el.suffix || ''}`;
            }

            window.desenharTextoAjustado(
                ctx, el, label, fs, scalePx,
                (f) => buildCanvasFont(f, el.font_name)
            );
        } else if (el.type === 'QR') {
            const sz = (el.size_mm || 15) * scalePx;
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
                const start = parseInt(item?.numeracao_inicio || item?.num_inicial || item?.NUMERACAO_INICIO || 1) || 1;
                const raw = padVal > 0 ? String(start).padStart(padVal, '0') : String(start);
                qrText = `${el.prefix || ''}${raw}${el.suffix || ''}`;
            }
            if (typeof renderQRCodeOnCtx === 'function') {
                renderQRCodeOnCtx(ctx, qrText, 0, 0, sz, color);
            }
        } else if (el.type === 'BARCODE') {
            const bw = (el.barcode_width_mm || el.width_mm || 30) * scalePx;
            const bh = (el.barcode_height_mm || el.height_mm || 8) * scalePx;
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
            ctx.lineTo(0, l2.height - y);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (el.type === 'FOTO') {
            // O Criador de Arte reproduz o card do pedido: a janela de foto e
            // desenhada pela mesma funcao que todas as outras janelas usam.
            const csvData = num?.csv_data || item?.csv_data || state.csvData || state.numCsvData || null;
            const linhaFoto = (csvData && csvData[0]) ? csvData[0] : null;
            if (typeof window.desenharElementoFoto === 'function') {
                // Repintor NOMEADO: a camada é desenhada uma vez, então sem este
                // aviso a janela ficaria com o marcador de espera até o operador
                // mexer em alguma coisa. Nomeado porque um lote de fotos chegando
                // tem de repintar a camada UMA vez, não uma vez por foto.
                window.desenharElementoFoto(ctx, el, scalePx, false, linhaFoto,
                    (window.repintor
                        ? window.repintor('criador-arte', function () {
                            renderEditorLayer2Numeracao(num, fmt, face);
                        })
                        : null));
            }
        } else if (el.type === 'SVG' || el.type === 'PDF') {
            const w = (el.width_mm || 20) * scalePx;
            const h = (el.height_mm || 20) * scalePx;
            const hw = w / 2, hh_el = h / 2;

            ctx.save();
            ctx.beginPath();
            ctx.rect(-hw, -hh_el, w, h);
            ctx.clip();

            if (el.type === 'PDF' && el._pdfCanvas) {
                // Tamanho original, escala 100%, sem distorcao: o engine.py impoe PDF e
                // SVG com keep_proportion=True, entao um drawImage cru esticaria na tela
                // o que o papel vai encaixar.
                drawArteDoElemento(ctx, el._pdfCanvas, -hw, -hh_el, w, h, el);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(-hw, -hh_el, w, h);
                ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('PDF', 0, 0);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
            ctx.restore();
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

            const pdfDataUrl = offCanvas.toDataURL();
            const img = new Image();
            img.onload = () => {
                const fImg = new fabric.Image(img);
                const scale = fc.height / fImg.height;
                fImg.set({
                    scaleX: scale,
                    scaleY: scale,
                    left: (fc.width - (fImg.width * scale)) / 2,
                    top: 0
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                setTimeout(() => fc.renderAll(), 50);
                saveEditorHistory();
                toast('PDF adicionado ao editor!', 'success');
            };
            img.src = pdfDataUrl;
        } catch (e) {
            toast('Erro ao carregar PDF: ' + e.message, 'error');
        }
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgDataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
                const fImg = new fabric.Image(img);
                const scale = fc.height / fImg.height;
                fImg.set({
                    scaleX: scale,
                    scaleY: scale,
                    left: (fc.width - (fImg.width * scale)) / 2,
                    top: 0
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                setTimeout(() => fc.renderAll(), 50);
                saveEditorHistory();
                toast('Imagem adicionada ao editor!', 'success');
            };
            img.src = imgDataUrl;
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

    // Rotação (°), Escala (%), Dimensões (mm)
    const scalePx = window.editorState.scalePxPerMm || 4.0;

    const angleIn = document.getElementById('prop-angle');
    if (angleIn) angleIn.value = Math.round((obj.angle || 0) % 360);

    const scaleIn = document.getElementById('prop-scale');
    if (scaleIn) scaleIn.value = Math.round((obj.scaleX || 1) * 100);

    const wMmIn = document.getElementById('prop-width-mm');
    if (wMmIn) wMmIn.value = (obj.getScaledWidth() / scalePx).toFixed(1);

    const hMmIn = document.getElementById('prop-height-mm');
    if (hMmIn) hMmIn.value = (obj.getScaledHeight() / scalePx).toFixed(1);

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
        const isTextObj = obj && (
            obj.type === 'i-text' ||
            obj.type === 'text' ||
            obj.type === 'textbox' ||
            (obj.isType && (obj.isType('text') || obj.isType('i-text') || obj.isType('textbox'))) ||
            obj.text !== undefined
        );

        if (isTextObj) {
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
 * Alterar Dimensão (Largura/Altura em mm)
 */
function editorUpdateDimension(dim, valMm) {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj || isNaN(valMm) || valMm <= 0) return;

    const scalePx = window.editorState.scalePxPerMm || 4.0;
    const valPx = valMm * scalePx;

    if (dim === 'width') {
        obj.scaleToWidth(valPx);
    } else if (dim === 'height') {
        obj.scaleToHeight(valPx);
    }
    fc.renderAll();
    updateInspectorFromSelection();
    saveEditorHistory();
}

/**
 * Alterar Escala (%)
 */
function editorUpdateScale(valPercent) {
    const fc = window.editorState.fabricCanvas;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj || isNaN(valPercent) || valPercent <= 0) return;

    const factor = valPercent / 100;
    obj.set({
        scaleX: factor,
        scaleY: factor
    });
    fc.renderAll();
    updateInspectorFromSelection();
    saveEditorHistory();
}

/**
 * Duplicar objeto selecionado horizontalmente (largura do objeto + 10mm)
 */
function editorDuplicarHorizontalmente() {
    const fc = window.editorState.fabricCanvas;
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (!obj) return;

    const scalePx = window.editorState.scalePxPerMm || 4.0;
    const gapPx = 10 * scalePx; // 10mm em pixels (40px)

    obj.clone((cloned) => {
        const widthPx = obj.getScaledWidth();
        cloned.set({
            left: obj.left + widthPx + gapPx,
            top: obj.top,
            evented: true,
            hasControls: true
        });
        fc.add(cloned);
        fc.setActiveObject(cloned);
        fc.renderAll();
        saveEditorHistory();
        toast('Objeto duplicado horizontalmente (+10mm)!', 'info');
    });
}

// Listener de Atalhos de Teclado (Delete, Backspace, Ctrl+D / Cmd+D)
if (!window._editorKeyboardListenerAdded) {
    window._editorKeyboardListenerAdded = true;
    document.addEventListener('keydown', (e) => {
        const view = document.getElementById('view-criador-arte');
        if (!view || view.style.display === 'none') return;

        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return;
        }

        const fc = window.editorState ? window.editorState.fabricCanvas : null;
        if (!fc) return;
        const activeObj = fc.getActiveObject();
        if (activeObj && activeObj.isEditing) return;

        // Tecla Delete ou Backspace para deletar elemento
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            editorDeletarSelecionado();
        }

        // Atalho Ctrl+D ou Cmd+D para duplicar horizontalmente (largura + 10mm)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            editorDuplicarHorizontalmente();
        }

        // Atalho Ctrl+Z / Cmd+Z (Desfazer) e Ctrl+Shift+Z / Ctrl+Y (Refazer)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            if (e.shiftKey) {
                editorRedo();
            } else {
                editorUndo();
            }
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            editorRedo();
        }
    });
}

/**
 * Histórico Undo / Redo (Até 30 Níveis de Desfazer)
 */
function saveEditorHistory() {
    if (!window.editorState || window.editorState.isRestoringHistory) return;
    const fc = window.editorState.fabricCanvas;
    if (!fc) return;

    const json = JSON.stringify(fc.toJSON());

    // Se o estado não mudou, evita salvar duplicatas
    if (window.editorState.history.length > 0 && window.editorState.history[window.editorState.historyIndex] === json) {
        updateUndoRedoButtonsUI();
        return;
    }

    // Se houver novas ações no meio do histórico, descarta o caminho futuro
    window.editorState.history = window.editorState.history.slice(0, window.editorState.historyIndex + 1);
    window.editorState.history.push(json);

    // Suporte para pelo menos 30 níveis de Undo
    const maxLevels = 30;
    if (window.editorState.history.length > maxLevels) {
        window.editorState.history.shift();
    }

    window.editorState.historyIndex = window.editorState.history.length - 1;
    updateUndoRedoButtonsUI();
}

function editorUndo() {
    if (!window.editorState) return;
    if (window.editorState.historyIndex > 0) {
        window.editorState.historyIndex--;
        restoreEditorHistory();
        toast(`↩ Desfeito (${window.editorState.historyIndex + 1}/${window.editorState.history.length})`, 'info');
    } else {
        toast('Nenhuma alteração anterior para desfazer.', 'warning');
    }
}

function editorRedo() {
    if (!window.editorState) return;
    if (window.editorState.historyIndex < window.editorState.history.length - 1) {
        window.editorState.historyIndex++;
        restoreEditorHistory();
        toast(`↪ Refeito (${window.editorState.historyIndex + 1}/${window.editorState.history.length})`, 'info');
    } else {
        toast('Nenhuma alteração para refazer.', 'warning');
    }
}

function restoreEditorHistory() {
    const fc = window.editorState ? window.editorState.fabricCanvas : null;
    if (!fc) return;
    const json = window.editorState.history[window.editorState.historyIndex];
    if (json) {
        window.editorState.isRestoringHistory = true;
        fc.loadFromJSON(json, () => {
            fc.renderAll();
            window.editorState.isRestoringHistory = false;
            updateInspectorFromSelection();
            updateUndoRedoButtonsUI();
        });
    }
}

function updateUndoRedoButtonsUI() {
    const undoBtn = document.getElementById('btn-editor-undo');
    const redoBtn = document.getElementById('btn-editor-redo');
    if (!window.editorState) return;

    const canUndo = window.editorState.historyIndex > 0;
    const canRedo = window.editorState.historyIndex < window.editorState.history.length - 1;

    if (undoBtn) {
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity = canUndo ? '1' : '0.4';
        undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
    }
    if (redoBtn) {
        redoBtn.disabled = !canRedo;
        redoBtn.style.opacity = canRedo ? '1' : '0.4';
        redoBtn.style.cursor = canRedo ? 'pointer' : 'not-allowed';
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
        toast('Gerando arquivo PDF da arte...', 'info');

        // 1. Exportar JSON de estrutura editável para futuras reedições 2D
        const jsonStructure = JSON.stringify(fc.toJSON());

        if (item.id) {
            localStorage.setItem(`ideal_arte_json_${item.id}_${face}`, jsonStructure);
        }
        localStorage.setItem(`ideal_arte_json_${osId}_${itemIdx}_${face}`, jsonStructure);

        // 2. Exportar imagem PNG de alta resolução da Camada de Arte (Fabric.js)
        const base64PngUrl = fc.toDataURL({
            format: 'png',
            multiplier: 2.0
        });

        // 3. Converter a arte em um documento PDF físico proporcional às dimensões do formato (PDFLib)
        let pdfUrlOrData = base64PngUrl; // fallback inicial se PDFLib falhar
        try {
            const pdfLibObj = window.PDFLib || (typeof PDFLib !== 'undefined' ? PDFLib : null);
            if (pdfLibObj && pdfLibObj.PDFDocument) {
                const fmt = window.editorState.format || { width_mm: 180, height_mm: 50 };
                const widthMm = fmt.width_mm || 180;
                const heightMm = fmt.height_mm || 50;

                // Converter mm em pontos PDF (72 pt por polegada; 1 polegada = 25.4 mm)
                const widthPts = widthMm * (72 / 25.4);
                const heightPts = heightMm * (72 / 25.4);

                const pdfDoc = await pdfLibObj.PDFDocument.create();
                const pngBase64 = base64PngUrl.split(',')[1];
                const pngBytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
                const pngImage = await pdfDoc.embedPng(pngBytes);

                const page = pdfDoc.addPage([widthPts, heightPts]);
                page.drawImage(pngImage, {
                    x: 0,
                    y: 0,
                    width: widthPts,
                    height: heightPts
                });

                const pdfBytes = await pdfDoc.save();
                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                const fileName = `arte_criada_${face}_${osId}_${item.id || itemIdx}_${Date.now()}.pdf`;

                // Fazer upload do arquivo PDF para o Storage do Supabase (para imposição e impressão)
                if (typeof uploadToStorage === 'function') {
                    const uploadedUrl = await uploadToStorage(pdfBlob, fileName, 'artes');
                    if (uploadedUrl && typeof uploadedUrl === 'string' && uploadedUrl.length > 0) {
                        pdfUrlOrData = uploadedUrl;
                    }
                }
            }
        } catch (pdfErr) {
            console.warn('[Criador de Arte] Erro ao gerar/enviar PDF da arte:', pdfErr);
        }

        // 4. Atualizar o objeto local do item
        if (face === 'verso') {
            item.verso_amostra_arte_base64 = base64PngUrl;
            item.verso_arte_url = pdfUrlOrData;
            item.url_arquivo_arte_verso = pdfUrlOrData;
            item.verso_url_arquivo = pdfUrlOrData;
            item.verso_arte_json = jsonStructure;
            if (item.id) localStorage.setItem(`ideal_arte_url_${item.id}_verso`, pdfUrlOrData);
            localStorage.setItem(`ideal_arte_url_${osId}_${itemIdx}_verso`, pdfUrlOrData);
        } else {
            item.amostra_arte_base64 = base64PngUrl;
            item.arte_url = pdfUrlOrData;
            item.url_arquivo_arte = pdfUrlOrData;
            item.url_arquivo = pdfUrlOrData;
            item.arte_json = jsonStructure;
            if (item.id) localStorage.setItem(`ideal_arte_url_${item.id}_frente`, pdfUrlOrData);
            localStorage.setItem(`ideal_arte_url_${osId}_${itemIdx}_frente`, pdfUrlOrData);
        }

        // Limpar o input de arquivo bruto do DOM
        const inputId = face === 'verso' ? `amostra-item-arte-verso-${itemIdx}` : `amostra-item-arte-${itemIdx}`;
        const nameLabelId = face === 'verso' ? `amostra-item-arte-verso-name-${itemIdx}` : `amostra-item-arte-name-${itemIdx}`;
        const removeBtnId = face === 'verso' ? `btn-remove-amostra-arte-verso-${itemIdx}` : `btn-remove-amostra-arte-${itemIdx}`;

        const input = document.getElementById(inputId);
        const nameLabel = document.getElementById(nameLabelId);
        const removeBtn = document.getElementById(removeBtnId);

        if (input) input.value = '';
        if (nameLabel) nameLabel.textContent = 'Arte Criada (PDF)';
        if (removeBtn) removeBtn.style.display = 'inline-block';

        // 5. Salvar no Supabase / Banco de Dados (pedidos_modelos + produtos_proposta)
        const dataToSave = face === 'verso' ? {
            verso_amostra_arte_base64: base64PngUrl,
            verso_arte_url: pdfUrlOrData,
            url_arquivo_arte_verso: pdfUrlOrData,
            verso_url_arquivo: pdfUrlOrData,
            verso_arte_json: jsonStructure
        } : {
            amostra_arte_base64: base64PngUrl,
            arte_url: pdfUrlOrData,
            url_arquivo_arte: pdfUrlOrData,
            url_arquivo: pdfUrlOrData,
            arte_json: jsonStructure
        };

        // CRITICAL: Auto-resolver e preservar amostra_cor_id e amostra_num_id
        const resolvedIds = (typeof resolveItemCorNumIds === 'function') ? resolveItemCorNumIds(item, itemIdx) : { corId: item.amostra_cor_id, numId: item.amostra_num_id };
        if (resolvedIds.corId) dataToSave.amostra_cor_id = resolvedIds.corId;
        if (resolvedIds.numId) dataToSave.amostra_num_id = resolvedIds.numId;

        if (typeof saveAmostraToDB === 'function') {
            await saveAmostraToDB(item.id, osId, dataToSave);
        }

        toast('Arte gerada em PDF e salva no modelo!', 'success');

        // 6. Fechar editor e re-renderizar prévia combinada de 3 camadas
        fecharCriadorDeArte();

        if (typeof renderItemAmostraCombinada === 'function') {
            await renderItemAmostraCombinada(itemIdx, osId);
        }

        // 7. Regenerar snapshots para o link do cliente em segundo plano
        if (typeof forceRegenerateSnapshots === 'function') {
            forceRegenerateSnapshots(osId).catch(snapErr => console.warn('[Criador de Arte] Snapshot error:', snapErr));
        }

    } catch (err) {
        console.error('[Criador de Arte] Erro ao salvar arte:', err);
        toast('Erro ao salvar arte: ' + err.message, 'error');
    }
}

/**
 * 📎 Carregar Anexos do Pedido na barra lateral do Criador de Arte
 */
async function carregarAnexosNoEditor() {
    const listEl = document.getElementById('editor-anexos-list');
    if (!listEl) return;

    const osId = window.editorState ? window.editorState.osId : null;
    if (!osId) {
        listEl.innerHTML = `
            <div style="font-size: 0.75rem; color: #64748b; font-style: italic; text-align: center; padding: 10px;">
                Nenhum pedido ativo.
            </div>`;
        return;
    }

    listEl.innerHTML = `
        <div style="font-size: 0.75rem; color: #38bdf8; font-style: italic; text-align: center; padding: 10px;">
            <i class="fa-solid fa-spinner fa-spin"></i> Buscando anexos...
        </div>`;

    // Descobrir o número da OS para consulta no Supabase
    let osNum = window.editorState ? window.editorState.osNum : null;
    if (!osNum && typeof state !== 'undefined' && state.ordens) {
        const os = state.ordens.find(o => o.id === osId);
        if (os) osNum = os.numero;
    }

    const anexos = await fetchAnexosDoPedido(osId, osNum);

    if (!anexos || anexos.length === 0) {
        listEl.innerHTML = `
            <div style="font-size: 0.75rem; color: #64748b; font-style: italic; text-align: center; padding: 10px; border: 1px dashed #334155; border-radius: 6px;">
                📎 Nenhum anexo encontrado neste pedido.
            </div>`;
        return;
    }

    const itemsHtml = anexos.map((anx) => {
        const ext = (anx.nome.split('.').pop() || '').toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
        const isPdf = ['pdf'].includes(ext);

        let icon = isImage ? '🖼️' : (isPdf ? '📕' : '📄');

        const escapedUrl = anx.url.replace(/'/g, "\\'");
        const escapedName = anx.nome.replace(/'/g, "\\'");

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #0f172a; padding: 6px 8px; border-radius: 6px; border: 1px solid #334155; gap: 6px;" title="${anx.nome}">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                    <span style="font-size: 0.9rem; flex-shrink: 0;">${icon}</span>
                    <span style="font-size: 0.75rem; color: #e2e8f0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${anx.nome}</span>
                </div>
                ${(isImage || isPdf) ? `
                    <button class="btn btn-sm" onclick="adicionarAnexoNaArte('${escapedUrl}', '${escapedName}', '${isPdf ? 'pdf' : 'image'}')" style="padding: 2px 8px; font-size: 0.72rem; font-weight: 700; background: #0284c7; color: white; border: none; border-radius: 4px; flex-shrink: 0; cursor: pointer;" title="Adicionar à arte">
                        ➕ Usar
                    </button>
                ` : `
                    <span style="font-size: 0.68rem; color: #64748b;">(Outro)</span>
                `}
            </div>
        `;
    }).join('');

    listEl.innerHTML = itemsHtml;
}

/**
 * Busca os anexos do pedido no Supabase / State
 */
async function fetchAnexosDoPedido(osId, osNum) {
    if (typeof state !== 'undefined' && state.anexosPedido && state.anexosPedido[osId] && state.anexosPedido[osId].length > 0) {
        return state.anexosPedido[osId];
    }

    const searchNum = osNum || osId;
    const numInt = parseInt(String(searchNum).replace(/\D/g, ''), 10);
    if (isNaN(numInt)) return [];

    let anexosList = [];

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data: artesData } = await supabaseClient
                .from('pedidos_artes')
                .select('arquivos, storage_path, nome_arquivo, storage_bucket, mime_type, created_at')
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
                                    id: arq.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                                    nome: arq.nome_arquivo || arq.nome || arq.name || 'Anexo',
                                    url: fileUrl,
                                    tamanho: arq.tamanho_bytes || arq.tamanho || 0,
                                    tipo: arq.mime_type || arq.tipo || '',
                                    oculto: !!arq.oculto
                                });
                            }
                        });
                    }
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
                                oculto: false
                            });
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[Criador de Arte] Erro ao buscar anexos no Supabase:', err);
        }
    }

    if (typeof state !== 'undefined') {
        if (!state.anexosPedido) state.anexosPedido = {};
        state.anexosPedido[osId] = anexosList;
    }

    return anexosList;
}

/**
 * Adiciona um anexo (Imagem ou PDF) diretamente na Camada 3 (Arte Fabric) do Criador de Arte
 */
async function adicionarAnexoNaArte(url, nome, tipo) {
    if (!url) return;
    const fc = window.editorState ? window.editorState.fabricCanvas : null;
    if (!fc) return;

    try {
        toast(`Carregando anexo "${nome}" na arte...`, 'info');

        if (tipo === 'pdf' || nome.toLowerCase().endsWith('.pdf')) {
            // Processar PDF via PDF.js
            let arrayBuffer;
            try {
                const directResponse = await fetch(url);
                if (directResponse.ok) {
                    arrayBuffer = await directResponse.arrayBuffer();
                } else {
                    throw new Error('Direct fetch failed');
                }
            } catch (err) {
                const proxyUrl = urlDoProxy(url);
                const proxyResponse = await fetch(proxyUrl);
                if (!proxyResponse.ok) throw new Error('Proxy fetch failed');
                arrayBuffer = await proxyResponse.arrayBuffer();
            }

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');

            fabric.Image.fromURL(dataUrl, (fImg) => {
                if (!fImg || !fImg.height) {
                    toast('Erro ao processar página do PDF', 'error');
                    return;
                }
                const imgScale = fc.height / fImg.height;
                fImg.set({
                    scaleX: imgScale,
                    scaleY: imgScale,
                    left: (fc.width - fImg.width * imgScale) / 2,
                    top: 0
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                saveEditorHistory();
                toast(`Anexo PDF "${nome}" inserido na arte!`, 'success');
            });

        } else {
            // Imagem padrão (PNG, JPG, SVG, WebP)
            const tempImg = new Image();
            tempImg.crossOrigin = 'anonymous';
            tempImg.onload = () => {
                const fImg = new fabric.Image(tempImg);
                const scale = fc.height / fImg.height;
                fImg.set({
                    scaleX: scale,
                    scaleY: scale,
                    left: (fc.width - fImg.width * scale) / 2,
                    top: 0
                });
                fc.add(fImg);
                fc.setActiveObject(fImg);
                fc.renderAll();
                saveEditorHistory();
                toast(`Anexo "${nome}" inserido na arte!`, 'success');
            };
            tempImg.onerror = () => {
                // Fallback com proxy local se a imagem falhar por CORS
                const proxyUrl = urlDoProxy(url);
                const proxyImg = new Image();
                proxyImg.onload = () => {
                    const fImg = new fabric.Image(proxyImg);
                    const scale = fc.height / fImg.height;
                    fImg.set({
                        scaleX: scale,
                        scaleY: scale,
                        left: (fc.width - fImg.width * scale) / 2,
                        top: 0
                    });
                    fc.add(fImg);
                    fc.setActiveObject(fImg);
                    fc.renderAll();
                    saveEditorHistory();
                    toast(`Anexo "${nome}" inserido na arte!`, 'success');
                };
                proxyImg.onerror = () => {
                    toast(`Não foi possível carregar o anexo "${nome}"`, 'error');
                };
                proxyImg.src = proxyUrl;
            };
            tempImg.src = url;
        }
    } catch (err) {
        console.error('[Criador de Arte] Erro ao adicionar anexo:', err);
        toast('Erro ao adicionar anexo: ' + err.message, 'error');
    }
}

/**
 * Alinhar objeto ou seleção múltipla em relação ao Canvas (Prancha)
 */
function editorAlinharCanvas(pos) {
    const fc = window.editorState ? window.editorState.fabricCanvas : null;
    if (!fc) return;

    const activeObj = fc.getActiveObject();
    if (!activeObj) {
        toast('Selecione um elemento para alinhar.', 'warning');
        return;
    }

    const canvasW = fc.width;
    const canvasH = fc.height;

    if (activeObj.type === 'activeSelection') {
        const groupRect = activeObj.getBoundingRect();
        let deltaX = 0;
        let deltaY = 0;

        switch (pos) {
            case 'left':
                deltaX = 0 - groupRect.left;
                break;
            case 'centerH':
                deltaX = ((canvasW - groupRect.width) / 2) - groupRect.left;
                break;
            case 'right':
                deltaX = (canvasW - groupRect.width) - groupRect.left;
                break;
            case 'top':
                deltaY = 0 - groupRect.top;
                break;
            case 'centerV':
                deltaY = ((canvasH - groupRect.height) / 2) - groupRect.top;
                break;
            case 'bottom':
                deltaY = (canvasH - groupRect.height) - groupRect.top;
                break;
        }

        activeObj.set({
            left: activeObj.left + deltaX,
            top: activeObj.top + deltaY
        });
        activeObj.setCoords();
    } else {
        const objW = activeObj.getScaledWidth();
        const objH = activeObj.getScaledHeight();

        switch (pos) {
            case 'left':
                activeObj.set('left', 0);
                break;
            case 'centerH':
                fc.centerObjectH(activeObj);
                break;
            case 'right':
                activeObj.set('left', canvasW - objW);
                break;
            case 'top':
                activeObj.set('top', 0);
                break;
            case 'centerV':
                fc.centerObjectV(activeObj);
                break;
            case 'bottom':
                activeObj.set('top', canvasH - objH);
                break;
        }
        activeObj.setCoords();
    }

    fc.renderAll();
    updateInspectorFromSelection();
    saveEditorHistory();
}

/**
 * Atualizar Família da Fonte com suporte a carregamento dinâmico
 */
async function editorUpdateFontFamily(fontFamily) {
    const fc = window.editorState ? window.editorState.fabricCanvas : null;
    const obj = fc ? fc.getActiveObject() : null;
    if (!obj || !fontFamily) return;

    try {
        if (document.fonts && typeof document.fonts.load === 'function') {
            await document.fonts.load(`16px "${fontFamily}"`);
        }
    } catch (e) {
        console.warn(`[Fontes] Não foi possível forçar pré-carregamento da fonte "${fontFamily}":`, e);
    }

    obj.set('fontFamily', fontFamily);
    fc.renderAll();
    saveEditorHistory();
}

/**
 * Preencher o dropdown de fontes preservando a seleção atual (Restrito ao Catálogo Web)
 */
function populateFontFamilySelect() {
    const select = document.getElementById('prop-font-family');
    if (!select) return;

    const currentVal = select.value;
    
    // Obter exclusivamente do catálogo web
    let allFamilies = [];
    if (typeof state_fonts !== 'undefined' && state_fonts.catalogo && state_fonts.catalogo.length > 0) {
        allFamilies = state_fonts.catalogo.map(f => f.font_family);
    } else {
        // Fallback básico caso o catálogo falhe ao carregar
        allFamilies = ['Arial', 'Helvetica', 'Times New Roman'];
    }

    allFamilies.sort((a, b) => a.localeCompare(b));

    select.innerHTML = '';
    allFamilies.forEach(family => {
        const opt = document.createElement('option');
        opt.value = family;
        opt.textContent = family;
        if (family === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
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
window.editorDuplicarHorizontalmente = editorDuplicarHorizontalmente;
window.editorDeletarSelecionado = editorDeletarSelecionado;
window.editorUpdateProperty = editorUpdateProperty;
window.editorUpdateDimension = editorUpdateDimension;
window.editorUpdateScale = editorUpdateScale;
window.editorToggleTextStyle = editorToggleTextStyle;
window.editorToggleMultiply = editorToggleMultiply;
window.editorUndo = editorUndo;
window.editorRedo = editorRedo;
window.salvarArteDoEditor = salvarArteDoEditor;
window.carregarAnexosNoEditor = carregarAnexosNoEditor;
window.fetchAnexosDoPedido = fetchAnexosDoPedido;
window.adicionarAnexoNaArte = adicionarAnexoNaArte;
window.editorAlinharCanvas = editorAlinharCanvas;
window.editorUpdateFontFamily = editorUpdateFontFamily;
window.populateFontFamilySelect = populateFontFamilySelect;
