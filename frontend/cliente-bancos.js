// Banco do pedido no portal: somente leitura, por abertura e por modelo.
(function (escopo) {
    'use strict';
    let geracao = 0;
    let atual = { numero: '', status: 'inativo', modelos: new Map(), cache: new Map() };

    async function carregar(numero, token, buscar) {
        const minhaGeracao = ++geracao;
        atual = { numero: String(numero), status: 'carregando', modelos: new Map(), cache: new Map() };
        let timer;
        try {
            if (!numero || !token) throw new Error('link_invalido');
            const resposta = await Promise.race([
                buscar(numero, token),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tempo_esgotado')), 15000); })
            ]);
            if (minhaGeracao !== geracao) return false;
            if (!resposta || resposta.versao !== 1 || String(resposta.numero_pedido) !== String(numero)
                || !Array.isArray(resposta.modelos)) throw new Error('resposta_invalida');
            const modelos = new Map();
            for (const m of resposta.modelos) {
                if (!m || m.modelo_id === undefined || m.modelo_id === null || modelos.has(String(m.modelo_id))) {
                    throw new Error('modelo_invalido');
                }
                if (!m.erro && (!Object.prototype.hasOwnProperty.call(m, 'banco')
                    || (m.banco !== null && (!Array.isArray(m.banco.csv_data) || !Array.isArray(m.banco.csv_headers)))
                    || (m.csv_mapa != null && (typeof m.csv_mapa !== 'object' || Array.isArray(m.csv_mapa))))) {
                    throw new Error('banco_invalido');
                }
                modelos.set(String(m.modelo_id), m);
            }
            atual.modelos = modelos;
            atual.legadoLocal = resposta.banco_comercial === false && modelos.size === 0;
            atual.status = 'pronto';
            return true;
        } catch (_) {
            if (minhaGeracao === geracao) atual.status = 'erro';
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    function registro(item) { return atual.modelos.get(String(item && item.id)); }
    function resolver(item, num) {
        // A página pode usar as funções de desenho fora do portal; manter o legado.
        if (atual.status === 'inativo') return num;
        if (atual.status !== 'pronto') return null;
        if (atual.legadoLocal) return num;
        const m = registro(item);
        if (!m || m.erro) return null;
        if (!m.banco) return num;
        if (!num || !escopo.BancoDoModelo) return null;
        const chave = String(item.id);
        const cache = atual.cache.get(chave);
        if (cache && cache.num === num) return cache.resolvida;
        const resolvida = escopo.BancoDoModelo.numeracaoResolvida(num, m.banco, m.csv_mapa);
        // Os caches de PDF/SVG e as falhas de preload também pertencem ao modelo.
        resolvida.elements = (resolvida.elements || []).map(el => el && Object.assign({}, el));
        atual.cache.set(chave, { num, resolvida });
        return resolvida;
    }

    function problema(item, num) {
        if (atual.status === 'inativo') return '';
        if (atual.status === 'carregando') return 'Carregando os dados para conferir a arte…';
        if (atual.status !== 'pronto') return 'Não foi possível carregar os dados desta arte. Tente novamente antes de aprovar.';
        if (atual.legadoLocal) return '';
        const m = registro(item);
        if (!m || m.erro) return 'O banco deste modelo não está disponível. Solicite a conferência à gráfica.';
        if (!m.banco) return '';
        if (!num || !escopo.BancoDoModelo) return 'A numeração deste modelo não foi carregada. Tente novamente.';
        if (escopo.BancoDoModelo.elementosSemColunaNoBanco(num, m.banco, m.csv_mapa).length) {
            return 'Há campos desta arte sem coluna correspondente no banco. Solicite a conferência à gráfica.';
        }
        if (!m.banco.csv_data.length) return 'O banco deste modelo está vazio. Solicite a conferência à gráfica.';
        return '';
    }

    escopo.PortalBancos = {
        carregar, resolver, problema,
        numero: () => atual.numero,
        geracao: () => geracao,
        temVinculo: item => !!(registro(item) && registro(item).banco),
        ativo: () => atual.status !== 'inativo'
    };
})(typeof window !== 'undefined' ? window : globalThis);
