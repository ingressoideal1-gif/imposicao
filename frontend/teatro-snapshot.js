// Snapshot Vibe v1: fonte imutável dos lugares de cada modelo; não grava dados.
(function (root) {
    'use strict';
    const campos = ['mapa_teatro_id', 'mapa_teatro_setor_id', 'mapa_teatro_revisao', 'mapa_teatro_snapshot'];
    const tem = item => !!item && campos.some(k => item[k] != null);
    function banco(item) {
        if (!tem(item)) return null;
        const s = item.mapa_teatro_snapshot;
        if (!s || s.versao !== 1 || !s.mapa || !s.setor || !Array.isArray(s.cadeiras)
                || !Array.isArray(s.tiposAssento) || !item.mapa_teatro_id || !item.mapa_teatro_setor_id
                || s.mapa.id !== item.mapa_teatro_id || s.setor.id !== item.mapa_teatro_setor_id
                || !/^[a-f0-9]{64}$/.test(item.mapa_teatro_revisao || '')) {
            throw Error('O vínculo ou snapshot do mapa deste modelo está incompleto. Confira no ERP.');
        }
        const cadeiras = Object.create(null);
        for (const c of s.cadeiras) {
            if (!c || typeof c.chave !== 'string' || Object.hasOwn(cadeiras, c.chave)) throw Error('O snapshot contém posição ausente ou repetida.');
            if (c.tipo !== 'Apagado' && !c.isErased && ![c.prefixo, c.num].every(v => typeof v === 'string' || Number.isSafeInteger(v))) throw Error('O snapshot contém fila ou lugar inválido.');
            cadeiras[c.chave] = { ...c };
        }
        const mapa = { id: s.mapa.id, name: s.mapa.nome, config: { tiposAssento: s.tiposAssento,
            setores: [{ ...s.setor, nomeConjunto: s.setor.nomeConjunto || 'Fila', cadeiras }] } };
        const setor = root.TeatroBanco.preparar(mapa, item.mapa_teatro_revisao).setores[0];
        const quantidade = Number(item.quantidade ?? item.qtd);
        if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade !== setor.rows.length || item.csv_selecao) {
            throw Error('A quantidade do modelo não corresponde aos lugares ativos do snapshot. Confira no ERP.');
        }
        const modelo = { id: item.id, quantidade };
        for (const campo of campos) modelo[campo] = structuredClone(item[campo]);
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
    root.TeatroSnapshot = { tem, banco, conferir };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.TeatroSnapshot;
})(globalThis);
