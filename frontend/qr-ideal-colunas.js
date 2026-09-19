// A coluna do pool do QR Ideal, do lado do navegador.
//
// E a mesma regra do `qr_ideal.py`, e ela existe em dois lugares por um motivo
// concreto: o motor so enxerga os modelos de UMA folha, e o painel do pedido e
// o unico que conhece o pedido inteiro. Nenhum dos dois ve o quadro sozinho.
//
// Se as duas copias divergirem, a tela aprova um trabalho que a impressora
// recusa — ou, pior, deixa passar o choque que a impressora tambem deixaria.
// Mexeu aqui, mexe la.

(function (escopo) {
    'use strict';

    function colunaQrIdeal(pedido, modelo) {
        var u2 = function (n) { return parseInt(String(n).trim().slice(-2), 10); };
        // O `+ 100) % 100` e o mod que nao devolve negativo: em JavaScript
        // (-50 % 100) da -50, e nao 50 como em Python.
        var d = ((u2(pedido) - u2(modelo)) % 100 + 100) % 100;
        return d === 0 ? 100 : d;
    }

    /**
     * Os choques entre os modelos de um pedido: mesma coluna, modelos distintos.
     *
     * Dois modelos cujos `id` diferem em exatamente 100 produzem ingressos com o
     * MESMO codigo dentro do MESMO evento — o unico choque que o numero do
     * pedido gravado no QR nao separa, justamente porque o pedido dos dois e o
     * mesmo.
     *
     * Devolve [{ coluna, modelos: [...] }], ou lista vazia quando esta tudo bem.
     */
    function conferirColunasQrIdeal(pedido, modelos) {
        var porColuna = {};
        (modelos || []).forEach(function (m) {
            if (m === null || typeof m === 'undefined' || m === '') return;
            var c = colunaQrIdeal(pedido, m);
            if (!porColuna[c]) porColuna[c] = [];
            if (porColuna[c].indexOf(String(m)) === -1) porColuna[c].push(String(m));
        });
        var choques = [];
        Object.keys(porColuna).forEach(function (c) {
            if (porColuna[c].length > 1) {
                choques.push({ coluna: parseInt(c, 10), modelos: porColuna[c] });
            }
        });
        return choques;
    }

    /**
     * Separa os modelos que realmente usam QR Ideal dos que nao puderam ser
     * conferidos. Modelo sem numeracao vinculada nao usa QR Ideal; numeracao
     * vinculada que nao chegou ao catalogo (ou chegou corrompida) e desconhecida.
     */
    function classificarModelosQrIdeal(modelos, numeracoes) {
        var porId = {};
        (numeracoes || []).forEach(function (n) {
            if (n && n.id !== null && typeof n.id !== 'undefined') {
                porId[String(n.id)] = n;
            }
        });

        var ativos = [];
        var desconhecidos = [];
        (modelos || []).forEach(function (m) {
            if (!m || m.id === null || typeof m.id === 'undefined') return;
            var numId = m.amostra_num_id || m.numeracao_id;
            // Sem numeracao escolhida nao existe elemento QR Ideal para imprimir.
            if (numId === null || typeof numId === 'undefined' || numId === '') return;

            var num = porId[String(numId)];
            if (!num) {
                desconhecidos.push(String(m.id));
                return;
            }

            var elementos = num.elements;
            if (typeof elementos === 'string') {
                try { elementos = JSON.parse(elementos); }
                catch (_) { elementos = null; }
            }
            if (!Array.isArray(elementos)) {
                desconhecidos.push(String(m.id));
                return;
            }
            if (elementos.some(function (el) { return el && el.type === 'QR_IDEAL'; })) {
                ativos.push(String(m.id));
            }
        });
        return { ativos: ativos, desconhecidos: desconhecidos };
    }

    escopo.colunaQrIdeal = colunaQrIdeal;
    escopo.conferirColunasQrIdeal = conferirColunasQrIdeal;
    escopo.classificarModelosQrIdeal = classificarModelosQrIdeal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            colunaQrIdeal: colunaQrIdeal,
            conferirColunasQrIdeal: conferirColunasQrIdeal,
            classificarModelosQrIdeal: classificarModelosQrIdeal
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
