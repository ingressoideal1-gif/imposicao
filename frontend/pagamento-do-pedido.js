// ══════════════════════════════════════════════════════════════════════════
//  Quando um pedido está PAGO — a resposta, num lugar só
// ══════════════════════════════════════════════════════════════════════════
//
// Duas telas fazem esta pergunta e precisam responder igual:
//
//   • o **Link do cliente**, na aba 💳 Pagar, onde ela vira o status em
//     destaque que o cliente lê;
//   • a **Lista de Arte**, na coluna Pagamento, onde ela decide se o pedido
//     ganha o selo PAGO na frente do atendimento.
//
// Se as duas divergirem, o cliente e a gráfica passam a ver coisas diferentes
// sobre o mesmo dinheiro — e é a gráfica que descobre por último. Por isso a
// regra mora aqui, e as duas telas a importam.
//
// ## A regra
//
// Um pedido pode ter MAIS DE UMA cobrança: medido no banco em 25/08/2026, dos
// 7.130 pedidos com cobrança, 6.494 estão pagos por inteiro, 624 sem nenhuma
// paga e **12 com uma paga e outra em aberto** — entrada mais parcela, com a
// referência indo `20927-A`, `20927-B`.
//
// São esses 12 que definem o desenho: PAGO só quando **todas** as cobranças
// vivas estão pagas. Com uma paga e outra em aberto, dizer "pago" mandaria o
// cliente embora devendo, e poria o selo verde na frente de um atendente que
// ainda tem o que cobrar.
//
// ## O que é uma cobrança "viva"
//
// A cancelada não conta. Ela existe na tabela — 331 delas —, mas é cobrança
// que a gráfica desfez: somá-la ao total impediria para sempre o selo de um
// pedido que foi recotado. Quem chama daqui de dentro do painel filtra as
// canceladas na consulta; para o link do cliente, quem já as deixa de fora é a
// função `link_cliente_pedido`, no banco.
//
// ## O vocabulário do ERP
//
// Quatro valores, contados no banco em 25/08/2026: `PAID` (6.513),
// `A_RECEBER` (368), `CANCELADO` (331) e `A_VENCER` (272). Só `PAID` é pago;
// qualquer valor novo que o parceiro invente cai em "não pago", que é o lado
// seguro do erro — o selo a menos faz alguém conferir, o selo a mais faz
// alguém deixar de cobrar.

(function (escopo) {
    'use strict';

    /** Se ESTA cobrança está paga. */
    function cobrancaPaga(cobranca) {
        return !!cobranca && String(cobranca.status || '').trim().toUpperCase() === 'PAID';
    }

    /** Se ESTA cobrança foi cancelada — ou seja, não conta para nada. */
    function cobrancaCancelada(cobranca) {
        return !!cobranca && String(cobranca.status || '').trim().toUpperCase() === 'CANCELADO';
    }

    /**
     * Quantas cobranças vivas o pedido tem, e quantas delas estão pagas.
     *
     * @param {Array} cobrancas  linhas de `pagamentos_v2` (ou o `pagamentos` do
     *                           JSON do portal), em qualquer ordem
     * @returns {{total: number, pagas: number}}
     */
    function contarCobrancas(cobrancas) {
        const vivas = (cobrancas || []).filter(function (c) {
            return c && !cobrancaCancelada(c);
        });
        return {
            total: vivas.length,
            pagas: vivas.filter(cobrancaPaga).length
        };
    }

    /**
     * Se o pedido está pago POR INTEIRO.
     *
     * Pedido SEM cobrança nenhuma devolve `false`, e não `true`: 350 dos 2.629
     * pedidos hoje na Lista de Arte estão nesse caso, e ali o que houve foi que
     * a cobrança ainda não saiu — não que alguém pagou. Um selo verde em cima
     * disso seria a pior das duas respostas possíveis.
     */
    function pedidoEstaPago(cobrancas) {
        const c = contarCobrancas(cobrancas);
        return c.total > 0 && c.pagas === c.total;
    }

    escopo.cobrancaPaga = cobrancaPaga;
    escopo.cobrancaCancelada = cobrancaCancelada;
    escopo.contarCobrancas = contarCobrancas;
    escopo.pedidoEstaPago = pedidoEstaPago;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { cobrancaPaga, cobrancaCancelada, contarCobrancas, pedidoEstaPago };
    }
})(typeof window !== 'undefined' ? window : globalThis);
