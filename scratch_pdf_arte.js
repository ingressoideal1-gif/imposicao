
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

            if (item.amostra_arte_base64) {
                try {
                    const isPdf = item.amostra_arte_base64.startsWith('data:application/pdf') || item.amostra_arte_base64.includes('JVBERi');
                    const base64Data = item.amostra_arte_base64.includes('base64,') ? item.amostra_arte_base64.split('base64,')[1] : item.amostra_arte_base64;

                    if (isPdf) {
                        const originalDoc = await PDFDocument.load(base64Data);
                        const [copiedPage] = await pdfDoc.copyPages(originalDoc, [0]);
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
                        
                        // Scale image to fit exactly on page
                        page.drawImage(image, { x: 0, y: 0, width: ptW, height: ptH });
                        pageAdded = true;
                    }
                } catch (e) {
                    console.warn(`Falha ao embutir arte do modelo ${idx}:`, e);
                }
            }

            if (!pageAdded) {
                pdfDoc.addPage([ptW, ptH]);
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
