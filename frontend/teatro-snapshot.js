// Snapshot Vibe v1: fonte imutável dos lugares de cada modelo; não grava dados.
(function (root) {
    'use strict';
    const campos = ['mapa_teatro_id', 'mapa_teatro_setor_id', 'mapa_teatro_revisao', 'mapa_teatro_snapshot'];
    const tem = item => !!item && campos.some(k => item[k] != null);
    function banco(item) {
        if (!tem(item)) return null;
        let s = item.mapa_teatro_snapshot;
        if (typeof s === 'string') {
            try { s = JSON.parse(s); } catch { throw Error('O snapshot do mapa enviado pelo ERP não é um JSON válido.'); }
        }
        if (!s || s.versao !== 1 || !s.mapa || !s.setor || !Array.isArray(s.cadeiras)
                || !Array.isArray(s.tiposAssento) || !s.mapa.nome || !s.setor.nome || !item.mapa_teatro_id || !item.mapa_teatro_setor_id
                || s.mapa.id !== item.mapa_teatro_id || s.setor.id !== item.mapa_teatro_setor_id
                || !/^[a-f0-9]{64}$/.test(item.mapa_teatro_revisao || '')) {
            throw Error('O vínculo ou snapshot do mapa deste modelo está incompleto. Confira no ERP.');
        }
        const cadeiras = Object.create(null);
        for (const c of s.cadeiras) {
            if (!c || typeof c.chave !== 'string' || Object.hasOwn(cadeiras, c.chave)) throw Error('O snapshot contém posição ausente ou repetida.');
            const xy = c.chave.split(',');
            if (xy.length !== 2 || xy.some(v => !v.trim() || !Number.isFinite(Number(v)))
                    || (c.isErased !== undefined && typeof c.isErased !== 'boolean')) throw Error('O snapshot contém posição ou marca de exclusão inválida.');
            if (c.tipo !== 'Apagado' && !c.isErased && ![c.prefixo, c.num].every(v => (typeof v === 'string' && v.trim()) || Number.isSafeInteger(v))) throw Error('O snapshot contém fila ou lugar inválido.');
            cadeiras[c.chave] = { ...c };
        }
        const mapa = { id: s.mapa.id, name: s.mapa.nome, config: { tiposAssento: s.tiposAssento,
            setores: [{ ...s.setor, nomeConjunto: s.setor.nomeConjunto || 'Fila', cadeiras }] } };
        const setor = root.TeatroBanco.preparar(mapa, item.mapa_teatro_revisao).setores[0];
        const quantidade = Number(item.qtd ?? item.quantidade);
        if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade !== setor.rows.length || item.csv_selecao) {
            throw Error('A quantidade do modelo não corresponde aos lugares ativos do snapshot. Confira no ERP.');
        }
        const modelo = { id: item.id, quantidade };
        for (const campo of campos) modelo[campo] = structuredClone(item[campo]);
        modelo.mapa_teatro_snapshot = structuredClone(s);
        return { id: 'snapshot:' + item.id, csv_data: setor.rows, csv_headers: setor.headers,
            teatro_modelo: modelo, origem_snapshot: true };
    }
    async function conferir(num, lerMapa) {
        if (!num?.teatro_modelo) return null;
        const m = num.teatro_modelo, fonte = banco(m);
        if (JSON.stringify(num.csv_data) !== JSON.stringify(fonte.csv_data)) throw Error('Os lugares enviados não correspondem ao snapshot do modelo.');
        const atual = await lerMapa(m.mapa_teatro_id);
        if (!atual || atual.id !== m.mapa_teatro_id || !(atual.config?.setores || []).some(s => s.id === m.mapa_teatro_setor_id)) {
            throw Error('O setor do modelo não pertence ao mapa consultado. Confira o vínculo no ERP.');
        }
        m.config_canonica_atual = root.MapaTeatroRevisao.canonicalizar(atual.config);
        m.revisao_atual = await root.MapaTeatroRevisao.revisao(atual.config);
        return m.revisao_atual !== m.mapa_teatro_revisao
            ? 'O mapa foi alterado. O modelo ' + m.id + ' será gerado com seu snapshot histórico, sem trocar a revisão.' : null;
    }
    function resolver(num, item) {
        if (!tem(item) || !num) return num;
        try {
            const dados = banco(item, num);
            return { ...num, tipo: 'TEATRO', csv_data: dados.csv_data, csv_headers: dados.csv_headers,
                csv_filename: dados.csv_filename, csv_url: '', mapa_teatro_snapshot_erp: true,
                mapa_teatro_quantidade: dados.csv_data.length, teatro_modelo: dados.teatro_modelo };
        } catch (e) {
            // Nunca cair no CSV de outro pedido ou na numeração sequencial em erro.
            return { ...num, tipo: 'TEATRO', csv_data: [], csv_headers: [], csv_url: '',
                mapa_teatro_snapshot_erp: true, erro_mapa_teatro: e.message, teatro_snapshot_erro: e.message };
        }
    }

    function problema(item, num) {
        if (!tem(item)) return '';
        try {
            banco(item, num);
            if (!num || !(num.elements || []).some(el => /^TEATRO_(FILA|LUGAR|COMBO)$/.test(el.type))) {
                throw Error('Escolha uma numeração com elementos de teatro para o setor enviado pelo ERP.');
            }
            if (item.csv_selecao) throw Error('O mapa do ERP deve usar todos os lugares do snapshot, sem seleção parcial de linhas.');
            return '';
        } catch (e) { return e.message; }
    }

    async function conferirRevisao(item, mapa) {
        if (!tem(item)) return '';
        if (!mapa || mapa.id !== item.mapa_teatro_id) return 'Não foi possível conferir o mapa atual. Os lugares continuam vindo da versão salva no pedido.';
        const atual = await root.TeatroBanco.revisao(mapa);
        if (atual !== item.mapa_teatro_revisao) return 'O mapa cadastrado tem outra revisão. Este modelo usa a versão salva pelo ERP no pedido.';
        if (!(mapa.config?.setores || []).some(s => s.id === item.mapa_teatro_setor_id)) return 'O setor não está no mapa atual. Este modelo usa o setor salvo no pedido.';
        return '';
    }

    async function conferirPedido(itens, cliente) {
        const modelos = (itens || []).filter(tem);
        if (!modelos.length) return;
        const ids = [...new Set(modelos.map(item => item.mapa_teatro_id).filter(Boolean))];
        let timer;
        const controle = new AbortController();
        try {
            if (!ids.length || !cliente) throw Error('Mapa atual indisponível.');
            const consulta = cliente.from('producao_mapas_teatro').select('id,config').in('id', ids);
            const { data, error } = await Promise.race([
                consulta.abortSignal ? consulta.abortSignal(controle.signal) : consulta,
                new Promise((_, reject) => { timer = setTimeout(() => {
                    controle.abort(); reject(Error('A consulta da revisão demorou.'));
                }, 8000); })
            ]);
            if (error || !Array.isArray(data)) throw error || Error('Mapa atual indisponível.');
            await Promise.all(modelos.map(async item => {
                item._mapa_teatro_aviso = await conferirRevisao(item, data.find(mapa => mapa.id === item.mapa_teatro_id));
            }));
        } catch {
            modelos.forEach(item => { item._mapa_teatro_aviso = 'Não foi possível conferir a revisão atual do mapa. Os lugares vêm da versão salva no pedido.'; });
        } finally { clearTimeout(timer); }
    }

    root.TeatroSnapshot = { tem, banco, conferir, resolver, problema, conferirRevisao, conferirPedido };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.TeatroSnapshot;
})(globalThis);
