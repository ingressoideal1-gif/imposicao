
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

            // pdf-lib usa pontos (1/72 polegada). Precisamos converter mm para pontos.
            // 1 mm = 72 / 25.4 pontos
            const ptW = targetW * (72 / 25.4);
            const ptH = targetH * (72 / 25.4);

            const page = pdfDoc.addPage([ptW, ptH]);

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const jpgImage = await pdfDoc.embedJpg(imgData);
            
            page.drawImage(jpgImage, {
                x: 0,
                y: 0,
                width: ptW,
                height: ptH
            });

            // Configurar PageLabels
            const numModelo = item.id ? String(item.id) : `Modelo ${idx + 1}`;
            nums.push(PDFNumber.of(addedPages));
            nums.push(pdfDoc.context.obj({
                Type: 'PageLabel',
                P: PDFString.of(numModelo)
            }));

            addedPages++;
        }

        if (addedPages > 0) {
            // Injetar PageLabels no Catalog do PDF
            const numTree = pdfDoc.context.obj({
                Nums: nums
            });
            pdfDoc.catalog.set(PDFName.of('PageLabels'), numTree);

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            const pedidoNum = os ? os.numero : osId;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Modelos_Pedido_${pedidoNum}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);

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
