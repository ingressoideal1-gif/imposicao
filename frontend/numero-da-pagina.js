/**
 * O NÚMERO QUE CADA PÁGINA DA VISUALIZAÇÃO MOSTRA
 * ============================================================================
 *
 * Numeração com banco de dados não tem "uma" amostra: tem uma por linha de
 * dado, e o card do modelo ganha o seletor `◀ Linha 3 / 5 ▶`. Só que a linha do
 * CSV não é o único dado variável da peça: na folha impressa, a linha N do
 * banco sai no ingresso de número `início + N`, com o QR daquele ingresso e a
 * pessoa N do camarote. Quem folheia a visualização precisa ver a MESMA peça
 * que vai sair no papel — a linha do banco, o número sequencial e o QR juntos.
 *
 * Este arquivo guarda essa conta, uma vez só, porque quem a repete são três
 * janelas que já divergiram antes (o card do pedido no `script.js`, o mesmo
 * card no link do cliente em `cliente.js`, e o visualizador do modo PDF).
 *
 * A conta é a do motor, não uma invenção da tela. Em `engine.py`, o item de
 * índice `i` de um modelo nasce com `val1 = n1 + i` e recebe `csv_row[i]`
 * (procure por `multi_map.append`), e o TICKET com N poses por item recebe
 * `start_base + (local_idx * N) + (pos - 1)`. Página da tela = `local_idx` do
 * motor: é a mesma peça, contada do mesmo jeito.
 *
 * Página 0 devolve exatamente o que as telas mostravam antes deste arquivo
 * existir — nenhuma visualização parada na primeira linha mudou de valor.
 */
(function (raiz) {
    'use strict';

    function inteiro(valor, padrao) {
        var n = parseInt(valor, 10);
        return (isNaN(n) ? padrao : n);
    }

    /**
     * O número sequencial do item que a página `pagina` (0 = primeira) mostra.
     *
     * @param {object} opts
     * @param {number} opts.start      número inicial do modelo (NI)
     * @param {number} opts.pagina     página da visualização, base 0
     * @param {string} opts.tipo       tipo da numeração ("TICKET" muda a conta)
     * @param {number} opts.ticketPos  pose do elemento dentro do ticket (base 1)
     * @param {number} opts.ticketQtd  quantas poses o ticket tem por item
     */
    function sequencial(opts) {
        var o = opts || {};
        var start = inteiro(o.start, 1);
        var pagina = Math.max(0, inteiro(o.pagina, 0));
        if (String(o.tipo || '').toUpperCase() === 'TICKET') {
            var qtd = Math.max(1, inteiro(o.ticketQtd, 1));
            var pos = Math.max(1, inteiro(o.ticketPos, 1));
            return start + (pagina * qtd) + (pos - 1);
        }
        return start + pagina;
    }

    /**
     * Os números de um elemento CAMAROTE_* na página `pagina`.
     *
     * Espelha `_resolve_camarote_val` do `engine.py`: os itens de um mesmo
     * local (mesa, camarote) vêm em sequência, e a lotação diz onde um local
     * termina e o próximo começa.
     *
     * @returns {{local: number, pessoa: number, lotacao: number}}
     */
    function camarote(opts) {
        var o = opts || {};
        var pagina = Math.max(0, inteiro(o.pagina, 0));
        var lotacao = Math.max(1, inteiro(o.lotacao, 1));
        var cIni = inteiro(o.cIni, 1);
        return {
            local: cIni + Math.floor(pagina / lotacao),
            pessoa: (pagina % lotacao) + 1,
            lotacao: lotacao
        };
    }

    raiz.NumeroDaPagina = { sequencial: sequencial, camarote: camarote };
})(typeof window !== 'undefined' ? window : globalThis);
