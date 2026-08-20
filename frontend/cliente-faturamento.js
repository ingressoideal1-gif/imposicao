// ══════════════════════════════════════════════════════════════════════════
//  🧾 Dados de Faturamento — o que vai na nota fiscal
// ══════════════════════════════════════════════════════════════════════════
//
// Os cinco campos que esta aba mostra são os cinco que a função do banco
// devolve. Antes, para mostrá-los, a página fazia `select('*')` na tabela
// `clientes` com a chave anônima — e trazia junto limite de crédito, risco de
// crédito e total de compras daquele cliente, numa página que abre por um link
// de WhatsApp.

/**
 * As linhas da nota fiscal, pulando o que não existe.
 *
 * A Inscrição Estadual é a exceção: vazia, ela vira `ISENTO`, porque em nota
 * fiscal "sem I.E." e "isento de I.E." são coisas diferentes, e é isento que o
 * cadastro quer dizer quando o campo está em branco.
 */
function linhasDoFaturamento(cliente) {
    if (!cliente) return [];

    const linhas = [
        { rotulo: 'Nome / Razão social', valor: (cliente.nome || '').trim(), forte: true },
        { rotulo: 'CPF / CNPJ', valor: (cliente.documento || '').trim() },
        { rotulo: 'Inscrição estadual', valor: (cliente.ins_estadual || '').trim() || 'ISENTO' },
        { rotulo: 'E-mail', valor: (cliente.email || '').trim() },
        { rotulo: 'Telefone', valor: (cliente.telefone || '').trim() }
    ];

    return linhas.filter(l => l.valor);
}

function desenharSecaoFaturamento() {
    const secao = document.getElementById('secao-faturamento');
    if (!secao) return;

    const dados = window.portalDados;
    const linhas = linhasDoFaturamento(dados && dados.cliente);

    secao.innerHTML =
        cartaoDeLinhas('🧾 Dados para a nota fiscal', linhas,
            'Os dados de faturamento ainda não foram cadastrados neste pedido. '
            + 'Toque em ALTERAR abaixo e escreva os dados corretos, ou fale com seu atendimento.')
        + cartaoDeDecisao('faturamento')
        + cartaoDeFinalizacao();
}

registrarSecao('faturamento', desenharSecaoFaturamento);

window.desenharSecaoFaturamento = desenharSecaoFaturamento;
window.linhasDoFaturamento = linhasDoFaturamento;
