
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

        if (el.type === 'TEXT' || el.type === 'FIXED') {
            const fs = (el.font_size || 12) * S / 2.8346;
            numCtx.font = typeof buildCanvasFont === 'function' ? buildCanvasFont(fs, el.font_name) : `${fs}px ${el.font_name || 'monospace'}`;
            numCtx.fillStyle = color;

            let label = '';
            if (el.type === 'FIXED') {
                label = el.fixed_value || 'TEXTO';
            } else {
                const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;
                label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;
            }
            numCtx.textAlign = 'center';
            numCtx.textBaseline = 'middle';
            numCtx.fillText(label, 0, 0);
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
