
// --- Exportação de PDF dos Modelos ---
async function exportarPdfModelos() {
    const osId = state.amostrasCurrentOsId;
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
        if (typeof window.jspdf === 'undefined') {
            toast('Carregando biblioteca PDF...', 'info');
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const { jsPDF } = window.jspdf;
        let pdf = null;

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

            const orientation = targetW > targetH ? 'l' : 'p';
            
            if (pdf === null) {
                pdf = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: [targetW, targetH]
                });
            } else {
                pdf.addPage([targetW, targetH], orientation);
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            pdf.addImage(imgData, 'JPEG', 0, 0, targetW, targetH);
        }

        if (pdf !== null) {
            const pedidoNum = os ? os.numero : osId;
            pdf.save('Modelos_Pedido_' + pedidoNum + '.pdf');
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
