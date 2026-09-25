// Medidas da referência visual. A peça e a impressão continuam no Formato.
(function (raiz) {
    'use strict';
    const campos = ['margem_esquerda_mm', 'margem_direita_mm', 'margem_superior_mm', 'margem_inferior_mm'];
    const lados = ['esquerda', 'direita', 'superior', 'inferior'];
    const arredondar = n => Math.round(n * 1e6) / 1e6;
    function numero(valor) {
        if (valor == null || String(valor).trim() === '') return NaN;
        const texto = String(valor).trim().replace(',', '.');
        return /^\d+(?:\.\d+)?$/.test(texto) ? Number(texto) : NaN;
    }
    function temMargens(cor) { return !!cor && campos.some(c => cor[c] != null); }
    function calcular(formato, cor) {
        const w = Number(formato?.width_mm), h = Number(formato?.height_mm);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw Error('Selecione um formato base válido.');
        const valores = campos.map((campo, i) => {
            const n = numero(cor?.[campo]);
            if (!Number.isFinite(n) || n < 0) throw Error(`Informe uma margem ${lados[i]} válida, maior ou igual a zero.`);
            return n;
        });
        const [esquerda, direita, superior, inferior] = valores;
        const width_mm = arredondar(w + esquerda + direita), height_mm = arredondar(h + superior + inferior);
        if (!Number.isFinite(width_mm) || !Number.isFinite(height_mm)) throw Error('As margens resultam em um tamanho inválido.');
        return { ...Object.fromEntries(campos.map((c, i) => [c, valores[i]])), width_mm, height_mm,
            formato_width_mm: w, formato_height_mm: h };
    }
    function lerFormulario(formato) {
        const cor = Object.fromEntries(campos.map((c, i) => [c, document.getElementById('cor-margem-' + lados[i])?.value]));
        return calcular(formato, cor);
    }
    function atualizarFormulario(formatos) {
        const formato = (formatos || []).find(f => String(f.id) === document.getElementById('cor-formato')?.value);
        const aviso = document.getElementById('cor-formato-calculado');
        const botao = document.getElementById('btn-cor-save');
        try {
            const medidas = lerFormulario(formato);
            document.getElementById('cor-w').value = medidas.width_mm;
            document.getElementById('cor-h').value = medidas.height_mm;
            if (aviso) {
                const mm = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
                aviso.textContent = `Formato da Cor: ${mm(medidas.width_mm)} × ${mm(medidas.height_mm)} mm · Base: ${mm(medidas.formato_width_mm)} × ${mm(medidas.formato_height_mm)} mm`;
                aviso.style.color = '';
            }
            if (botao) botao.disabled = botao.dataset.carregando === 'true';
            return medidas;
        } catch (e) {
            document.getElementById('cor-w').value = '';
            document.getElementById('cor-h').value = '';
            if (aviso) { aviso.textContent = e.message; aviso.style.color = 'var(--red)'; }
            if (botao) botao.disabled = true;
            return null;
        }
    }
    function preencherFormulario(cor, formato) {
        // Cadastros antigos permanecem intactos até salvar. A apresentação antiga
        // era centralizada: distribuir a diferença igualmente preserva esse caso.
        let valores;
        if (temMargens(cor)) valores = campos.map(c => cor[c] ?? '');
        else {
            const dx = Math.max(0, (Number(cor?.width_mm) || Number(formato?.width_mm) || 0) - (Number(formato?.width_mm) || 0)) / 2;
            const dy = Math.max(0, (Number(cor?.height_mm) || Number(formato?.height_mm) || 0) - (Number(formato?.height_mm) || 0)) / 2;
            valores = [dx, dx, dy, dy];
        }
        lados.forEach((lado, i) => { document.getElementById('cor-margem-' + lado).value = valores[i]; });
        const aviso = document.getElementById('cor-margens-legado');
        if (aviso) {
            aviso.hidden = !cor || temMargens(cor);
            aviso.textContent = cor && !temMargens(cor)
                ? `Cadastro anterior: ${cor.width_mm ?? '—'} × ${cor.height_mm ?? '—'} mm. Confira as margens sugeridas; elas serão gravadas somente ao salvar.` : '';
        }
    }
    const api = { campos, lados, numero, temMargens, calcular, lerFormulario, atualizarFormulario, preencherFormulario };
    raiz.CorMargens = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
