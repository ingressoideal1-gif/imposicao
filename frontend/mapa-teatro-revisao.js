// RFC 8785 para valores JSON já interpretados (config JSONB), sem normalizar Unicode.
// Compartilhado pelo painel e pela Edge Function; não consulta banco nem altera históricos.
(function (root) {
    'use strict';
    function string(v) {
        for (let i = 0; i < v.length; i++) {
            const u = v.charCodeAt(i);
            if (u >= 0xd800 && u <= 0xdbff) {
                const proximo = v.charCodeAt(++i);
                if (!(proximo >= 0xdc00 && proximo <= 0xdfff)) throw Error('Unicode inválido na configuração do mapa.');
            } else if (u >= 0xdc00 && u <= 0xdfff) throw Error('Unicode inválido na configuração do mapa.');
        }
        return JSON.stringify(v);
    }
    function canonicalizar(config) {
        const caminho = new Set();
        function escrever(v) {
            if (v === null) return 'null';
            if (typeof v === 'string') return string(v);
            if (typeof v === 'boolean') return JSON.stringify(v);
            if (typeof v === 'number') {
                if (!Number.isFinite(v)) throw Error('Número não finito na configuração do mapa.');
                return JSON.stringify(v);
            }
            if (typeof v !== 'object' || Object.prototype.toString.call(v) !== (Array.isArray(v) ? '[object Array]' : '[object Object]')) {
                throw Error('A configuração do mapa deve conter somente valores JSON.');
            }
            if (caminho.has(v)) throw Error('Referência circular na configuração do mapa.');
            caminho.add(v);
            // Montar tokens diretamente: JSON.stringify de um objeto reordena chaves numéricas.
            const texto = Array.isArray(v)
                ? '[' + Array.from(v, escrever).join(',') + ']'
                : '{' + Object.keys(v).sort().map(k => string(k) + ':' + escrever(v[k])).join(',') + '}';
            caminho.delete(v);
            return texto;
        }
        return escrever(config);
    }
    async function revisao(config) {
        const bytes = new TextEncoder().encode(canonicalizar(config));
        const hash = await root.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    const api = { canonicalizar, revisao };
    root.MapaTeatroRevisao = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
