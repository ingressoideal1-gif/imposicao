// PDFs privados: a chave de serviço fica somente na Edge Function.
(function () {
    const GERADOR = 'a3-v1-20261003';
    const pendentes = new Map();
    function base() {
        if (typeof VIBECODE_SUPABASE_URL === 'undefined') throw Error('O envio dos PDFs precisa de conexão com o banco.');
        return VIBECODE_SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/mapas-teatro-pdfs';
    }
    async function chamar(mapaId, revisao, corpo) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) throw Error('Entre na sua conta para disponibilizar os PDFs ao ERP.');
        const sessao = await supabaseClient.auth.getSession();
        const token = !sessao.error && sessao.data?.session?.access_token;
        if (!token) throw Error('Entre na sua conta para disponibilizar os PDFs ao ERP.');
        const q = new URLSearchParams({ revisao, gerador: GERADOR });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const r = await fetch(base() + '/mapas/' + encodeURIComponent(mapaId) + '/exportacao?' + q, {
                method: corpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token }, body: corpo, signal: controller.signal
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw Error(data.detail || 'O armazenamento dos PDFs está indisponível. Tente novamente depois.');
            if (data.mapa_id !== mapaId || data.revisao_exportacao !== revisao || data.gerador_versao !== GERADOR
                || !['pronto', 'pendente'].includes(data.estado) || !Array.isArray(data.arquivos)) throw Error('Não foi possível conferir os PDFs salvos para o ERP.');
            return data;
        } catch (e) {
            if (e.name === 'AbortError') throw Error('O envio demorou além do esperado. Tente novamente; o mapa salvo foi preservado.');
            throw e;
        } finally { clearTimeout(timeout); }
    }
    function conferir(dados, mapa, pdf) {
        if (dados.revisao_atual === false) throw Error('O mapa foi alterado durante a consulta. Reabra o mapa para gerar a revisão atual.');
        if (dados.estado !== 'pronto') return dados;
        const setores = mapa.config?.setores || [];
        const esperado = [{ setor_id: null, tipo: 'mapa', quantidade_assentos: pdf.total },
            ...setores.map((s, i) => ({ setor_id: s.id, tipo: 'setor', quantidade_assentos: pdf.arquivos[i].quantidade }))];
        if (dados.arquivos.length !== esperado.length || dados.arquivos.some((a, i) => {
            const e = esperado[i];
            return a.tipo !== e.tipo || a.setor_id !== e.setor_id || a.quantidade_assentos !== e.quantidade_assentos
                || !/^[a-f0-9]{64}$/.test(a.sha256_arquivo || '') || typeof a.pdf_recurso !== 'string'
                || !a.pdf_recurso.startsWith(base() + '/mapas/' + encodeURIComponent(mapa.id) + '/arquivo?');
        })) throw Error('Os arquivos registrados não conferem com os setores do mapa.');
        return dados;
    }
    async function consultar(mapa, pdf) {
        return conferir(await chamar(mapa.id, pdf.revisao), mapa, pdf);
    }
    async function enviar(mapa, pdf) {
        const lista = mapa.config?.setores || [], ids = new Set();
        for (const s of lista) {
            if (typeof s.id !== 'string' || !s.id.trim() || ids.has(s.id)) throw Error('Revise os identificadores dos setores antes de salvar os PDFs para o ERP.');
            ids.add(s.id);
        }
        const existente = await consultar(mapa, pdf);
        if (existente.estado === 'pronto') return existente;
        const arquivos = [{ tipo: 'mapa', setor_id: null, quantidade_assentos: pdf.total, bytes: pdf.bytes },
            ...lista.map((s, i) => ({ tipo: 'setor', setor_id: s.id, quantidade_assentos: pdf.arquivos[i].quantidade, bytes: pdf.arquivos[i].bytes }))];
        const form = new FormData(), manifesto = [];
        let total = 0;
        for (let i = 0; i < arquivos.length; i++) {
            const a = arquivos[i];
            total += a.bytes.byteLength;
            if (a.bytes.byteLength > 10 * 1024 * 1024 || total > 29 * 1024 * 1024) throw Error('Os PDFs excedem o limite de envio: 10 MB por arquivo e 29 MB no conjunto.');
            const digest = await crypto.subtle.digest('SHA-256', a.bytes);
            const hash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
            manifesto.push({ tipo: a.tipo, setor_id: a.setor_id, quantidade_assentos: a.quantidade_assentos, sha256_arquivo: hash });
            form.append('pdf_' + i, new Blob([a.bytes], { type: 'application/pdf' }), 'mapa-' + i + '.pdf');
        }
        form.append('revisao_exportacao', pdf.revisao); form.append('gerador_versao', GERADOR);
        form.append('manifesto', JSON.stringify(manifesto));
        const publicado = conferir(await chamar(mapa.id, pdf.revisao, form), mapa, pdf);
        if (publicado.estado !== 'pronto') throw Error('A publicação dos PDFs não foi confirmada. Tente novamente.');
        return publicado;
    }
    async function persistir(mapa, pdf) {
        const chave = mapa.id + ':' + pdf.revisao;
        if (pendentes.has(chave)) return pendentes.get(chave);
        const trabalho = enviar(mapa, pdf); pendentes.set(chave, trabalho);
        try { return await trabalho; } finally { pendentes.delete(chave); }
    }
    window.MapasTeatroPdfStorage = { consultar, persistir, gerador: GERADOR };
})();
