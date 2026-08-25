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
 *
 * ## O endereço, desde 25/08/2026
 *
 * Pedido do usuário: *"no link onde mostra e pede confirmação dos dados da nota
 * fiscal, deve mostrar também o endereço relativo ao CNPJ mostrado"*. Ele entra
 * logo DEPOIS do documento, e não no fim do cartão, porque é do documento que
 * ele é — a proximidade é o que diz isso sem precisar de rótulo explicando.
 *
 * Ele vem de `endereco_faturamento`, que a função do banco busca pelo MESMO id
 * que preenche o `cliente` acima (`id_faturado`, e não `id_cliente`). Não é o
 * mesmo endereço da aba de Entrega: quando o pedido fatura em outro cadastro —
 * 6 dos 62 links ativos —, os dois são de pessoas diferentes, e repetir ali o da
 * entrega poria, embaixo de um CNPJ, o endereço de outra empresa.
 *
 * Endereço que falta aparece como pendência em âmbar, e não some. É a mesma
 * regra da aba de Entrega, e pelo mesmo motivo: campo escondido é campo que
 * ninguém corrige — quem descobre é o contador, com a nota já emitida.
 */
function linhasDoFaturamento(cliente, enderecoDaNota) {
    if (!cliente) return [];

    const linhas = [
        { rotulo: 'Nome / Razão social', valor: (cliente.nome || '').trim(), forte: true },
        { rotulo: 'CPF / CNPJ', valor: typeof documentoEmMascara === 'function'
            ? documentoEmMascara(cliente.documento) : (cliente.documento || '').trim() }
    ];

    linhas.push.apply(linhas, linhasDoEnderecoDaNota(enderecoDaNota));

    linhas.push(
        { rotulo: 'Inscrição estadual', valor: (cliente.ins_estadual || '').trim() || 'ISENTO' },
        { rotulo: 'E-mail', valor: (cliente.email || '').trim() },
        { rotulo: 'Telefone', valor: (cliente.telefone || '').trim() }
    );

    return linhas.filter(l => l.valor);
}

/**
 * O endereço do CNPJ, na forma em que a aba de Entrega já mostra endereço.
 *
 * Sem `recebedor` e sem `CPF do recebedor`: aqueles dois são de quem recebe o
 * PACOTE, e não têm o que fazer numa nota fiscal.
 *
 * Sem endereço nenhum, devolve UMA linha em âmbar em vez de nada — ver o
 * cabeçalho de `linhasDoFaturamento`. Linha vazia no meio do cartão, por outro
 * lado, continua sendo omitida: rótulo com nada ao lado é ruído.
 */
function linhasDoEnderecoDaNota(endereco) {
    if (!endereco) {
        return [{ rotulo: 'Endereço', valor: 'Não informado', falta: true }];
    }

    const rua = (endereco.endereco || '').trim();
    const numero = (endereco.numero || '').trim();
    const cidade = (endereco.cidade || '').trim();
    const uf = (endereco.uf || '').trim();

    const linhas = [
        { rotulo: 'Endereço', valor: rua ? rua + ', ' + (numero || 'S/N') : '' },
        { rotulo: 'Complemento', valor: (endereco.complemento || '').trim() },
        { rotulo: 'Bairro', valor: (endereco.bairro || '').trim() },
        { rotulo: 'Cidade/UF', valor: cidade && uf ? cidade + ' - ' + uf : (cidade || uf) },
        { rotulo: 'CEP', valor: typeof cepEmMascara === 'function'
            ? cepEmMascara(endereco.cep) : (endereco.cep || '').trim() }
    ].filter(l => l.valor);

    // O cadastro existe mas está vazio: é o mesmo caso de não haver endereço.
    return linhas.length ? linhas
        : [{ rotulo: 'Endereço', valor: 'Não informado', falta: true }];
}

function desenharSecaoFaturamento() {
    const secao = document.getElementById('secao-faturamento');
    if (!secao) return;

    const dados = window.portalDados;
    const linhas = linhasDoFaturamento(dados && dados.cliente,
                                       dados && dados.endereco_faturamento);

    secao.innerHTML =
        cartaoDeLinhas(tituloDoCartao('nota', 'Dados para a nota fiscal'), linhas,
            'Os dados de faturamento ainda não foram cadastrados neste pedido. '
            + 'Toque em Alterar abaixo e escreva os dados corretos, ou fale com seu atendimento.')
        + cartaoDeDecisao('faturamento')
        + cartaoDeFinalizacao()
        + botaoDeAjuda(dados);
}

registrarSecao('faturamento', desenharSecaoFaturamento);

window.desenharSecaoFaturamento = desenharSecaoFaturamento;
window.linhasDoFaturamento = linhasDoFaturamento;
window.linhasDoEnderecoDaNota = linhasDoEnderecoDaNota;
