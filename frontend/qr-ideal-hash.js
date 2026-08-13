/**
 * O MESMO hash do `qr_ideal.py`, calculado no navegador.
 *
 * A nuvem nunca guarda o codigo do QR Ideal — guarda o hash dele. O celular da
 * portaria confere calculando o hash do que leu e procurando na faixa que
 * baixou, montada pelo agente em Python.
 *
 * Se este arquivo e o `hash_codigo()` do Python divergirem em qualquer detalhe,
 * TODO ingresso do evento e recusado na portaria — e nao ha como perceber isso
 * antes, a nao ser testando de proposito. Quem testa e o
 * `tests/test_qr_ideal_hash.py`, que roda este arquivo dentro de um navegador
 * de verdade e compara com o valor que o Python produz.
 *
 * Portanto: mexeu aqui, roda aquele teste. Mexeu la, roda aquele teste.
 */
(function () {
    'use strict';

    // Tem de ser igual a qr_ideal.ITERACOES. Mudar so de um lado quebra tudo em
    // silencio; mudar dos dois invalida todo hash ja publicado.
    var ITERACOES = 10000;

    function hexParaBytes(hex) {
        var out = new Uint8Array(hex.length / 2);
        for (var i = 0; i < out.length; i++) {
            out[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return out;
    }

    function bytesParaHex(buffer) {
        var b = new Uint8Array(buffer);
        var s = '';
        for (var i = 0; i < b.length; i++) {
            s += b[i].toString(16).padStart(2, '0');
        }
        return s;
    }

    /**
     * @param {string} conteudo O texto INTEIRO do QR: prefixo do pedido mais os
     *                          8 caracteres do pool. Nao so o codigo.
     * @param {string} sal       64 caracteres hexadecimais, vindos do backend.
     * @returns {Promise<string>} 64 caracteres hexadecimais.
     */
    async function qrIdealHash(conteudo, sal) {
        var chave = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(conteudo),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        var bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                // Os BYTES do hexadecimal, nunca o texto dele. E a armadilha
                // desta funcao: passar `sal` cru aqui produz um hash plausivel,
                // diferente do Python, e o erro so aparece na portaria.
                salt: hexParaBytes(sal),
                iterations: ITERACOES,
                hash: 'SHA-256'
            },
            chave,
            256
        );
        return bytesParaHex(bits);
    }

    if (typeof window !== 'undefined') {
        window.qrIdealHash = qrIdealHash;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { qrIdealHash: qrIdealHash, ITERACOES: ITERACOES };
    }
})();
