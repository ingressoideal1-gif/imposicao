// ══════════════════════════════════════════════════════════════════════════
//  Os dados do Portal do Pedido — uma ida ao banco, e as contas da tela
// ══════════════════════════════════════════════════════════════════════════
//
// Quem abre esta página é o CLIENTE da gráfica, no meio do dia, pelo navegador
// embutido do WhatsApp, no 4G. Isso decide as duas escolhas deste arquivo.
//
// ## Uma consulta, e não seis
//
// Até 20/08/2026 a página montava a tela com seis consultas diretas — a
// proposta, o cadastro do cliente, o endereço, a linha de arte e os catálogos —,
// cada uma um ida-e-volta antes do primeiro pixel. E todas com a chave anônima,
// que está no código-fonte da página: a de `clientes` era `select('*')`, e
// trazia `limite_credito`, `risco_credito` e `total_compras` junto do nome e do
// CNPJ que a tela mostra.
//
// Agora é uma chamada só, `link_cliente_pedido`, que exige o par número+token e
// devolve só os campos que as cinco abas mostram. O porquê inteiro está no
// cabeçalho de `sql/link_cliente_pedido.sql`.
//
// ## As contas são feitas aqui, e não pelo navegador
//
// `emReal` não usa `toLocaleString`. O formato do dinheiro que o cliente lê não
// pode depender de qual tabela de idiomas o aparelho dele embarcou: num
// navegador sem o pt-BR, `toLocaleString` devolve `71.5`, e o cliente lê setenta
// e um reais e meio como "71 ponto 5". Aqui a conta é a mesma em toda máquina.
//
// As funções puras deste arquivo são recortadas e executadas por
// `tests/portal_dados_harness.js`.

/** O JSON que a função do banco devolveu, guardado para as cinco abas. */
window.portalDados = null;

/**
 * Busca no banco tudo o que o Portal do Pedido mostra.
 *
 * Devolve o objeto e o guarda em `window.portalDados`. Devolve `null` quando o
 * par número+token não confere, quando o link foi revogado, ou quando o banco
 * recusou — e quem chama trata os três do mesmo jeito, porque para o cliente
 * são a mesma coisa: a página não abriu.
 */
async function carregarPortal(numero, token) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return null;

    const { data, error } = await supabaseClient.rpc('link_cliente_pedido', {
        p_numero: String(numero),
        p_token: String(token)
    });

    if (error) {
        console.error('[portal] o banco recusou a carga do pedido:', error.message || error);
        return null;
    }
    if (!data) return null;

    window.portalDados = data;
    return data;
}

/**
 * Um valor em reais, sempre no mesmo formato.
 *
 * Sem valor devolve `--`, e não `R$ 0,00`: zero num orçamento diz que o pedido é
 * de graça, e `--` diz que o número não chegou — que é a verdade.
 */
function emReal(valor) {
    if (valor === null || valor === undefined || valor === '') return '--';
    const n = Number(valor);
    if (!isFinite(n)) return '--';

    const centavos = Math.round(Math.abs(n) * 100);
    const inteiro = String(Math.floor(centavos / 100));
    const resto = String(centavos % 100).padStart(2, '0');
    // O ponto de milhar, sem depender do idioma do aparelho.
    const comPonto = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-R$ ' : 'R$ ') + comPonto + ',' + resto;
}

/**
 * Os nomes de frete do ERP, escritos como se lê.
 *
 * `MOTOBOY` em caixa alta é vocabulário de banco de dados; na tela do cliente
 * ele lê "Motoboy". Os que já são sigla ou marca — SEDEX, PAC, VEPPO — ficam
 * como estão, porque é assim que ele os conhece.
 */
const NOME_DO_FRETE = {
    RETIRADA: 'Retirada no local',
    MOTOBOY: 'Motoboy',
    SEDEX: 'SEDEX',
    PAC: 'PAC',
    VEPPO: 'VEPPO'
};

/**
 * A forma de envio, com o valor: "SEDEX — R$ 20,12".
 *
 * Frete grátis vira "sem custo", e não "R$ 0,00" — um zero ao lado do nome da
 * transportadora se lê como erro de sistema.
 */
function rotuloDoFrete(pedido) {
    const escolhido = pedido && pedido.frete_escolhido ? String(pedido.frete_escolhido).trim() : '';
    if (!escolhido) return 'A combinar';

    const nome = NOME_DO_FRETE[escolhido.toUpperCase()] || escolhido;
    const modalidade = pedido.modalidade_frete ? String(pedido.modalidade_frete).trim() : '';
    const comModalidade = modalidade ? nome + ' (' + modalidade + ')' : nome;

    const valor = Number(pedido.valor_frete);
    if (!isFinite(valor) || valor <= 0) return comModalidade + ' — sem custo';
    return comModalidade + ' — ' + emReal(valor);
}

/**
 * O prazo, com a data do parceiro na frente do texto do produto.
 *
 * `propostas_os.data_termino` é o campo real do Prazo de Entrega — o mesmo que o
 * Painel de Produção usa. Ela vence porque é a data daquele pedido; o
 * `produtos.prazo` ("Produção: 1 dia útil + Frete") é a regra geral do produto,
 * e serve de reserva enquanto a tabela nova do parceiro não cobre todo pedido:
 * eram 23 linhas para 8.263 propostas em 20/08/2026.
 *
 * Devolve `null` quando não há nem um nem outro, para a tela poder dizer
 * "combinado com seu atendimento" em vez de imprimir `undefined`.
 */
function prazoDeEnvio(os, itens) {
    const bruto = os && os.data_termino ? String(os.data_termino) : '';
    if (bruto) {
        // Data pura (`2026-08-21`) o JavaScript lê como meia-noite UTC, e no
        // Brasil isso vira 21h do dia anterior: o prazo apareceria um dia antes.
        const texto = /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto + 'T00:00:00' : bruto;
        const data = new Date(texto);
        if (!isNaN(data.getTime())) {
            const dd = String(data.getDate()).padStart(2, '0');
            const mm = String(data.getMonth() + 1).padStart(2, '0');
            return dd + '/' + mm + '/' + data.getFullYear();
        }
    }

    const comPrazo = (itens || []).find(i => i && i.prazo && String(i.prazo).trim());
    return comPrazo ? String(comPrazo.prazo).trim() : null;
}

/**
 * O endereço como uma lista de linhas prontas, na ordem em que se lê um
 * envelope. Linha sem valor não entra: rótulo com vazio ao lado é ruído.
 */
function enderecoEmLinhas(endereco) {
    if (!endereco) return [];

    const rua = (endereco.endereco || endereco.rua || endereco.logradouro || '').trim();
    const numero = (endereco.numero || '').trim();
    const cidade = (endereco.cidade || '').trim();
    const uf = (endereco.uf || '').trim();

    const linhas = [
        { rotulo: 'Recebedor', valor: (endereco.recebedor || '').trim() },
        { rotulo: 'CPF do recebedor', valor: (endereco.cpf_recebedor || '').trim() },
        { rotulo: 'Endereço', valor: rua ? rua + ', ' + (numero || 'S/N') : '' },
        { rotulo: 'Complemento', valor: (endereco.complemento || '').trim() },
        { rotulo: 'Bairro', valor: (endereco.bairro || '').trim() },
        { rotulo: 'Cidade/UF', valor: cidade && uf ? cidade + ' - ' + uf : (cidade || uf) },
        { rotulo: 'CEP', valor: (endereco.cep || '').trim() }
    ];

    return linhas.filter(l => l.valor);
}

/**
 * O rastreio nos Correios, ou `null` — que é o que impede um botão morto de
 * nascer na tela para os pedidos que ainda não postaram.
 */
function linkDeRastreio(codigo) {
    const limpo = codigo ? String(codigo).trim().toUpperCase() : '';
    if (!limpo) return null;
    return 'https://rastreamento.correios.com.br/app/index.php?objeto=' + encodeURIComponent(limpo);
}

window.carregarPortal = carregarPortal;
window.emReal = emReal;
window.rotuloDoFrete = rotuloDoFrete;
window.prazoDeEnvio = prazoDeEnvio;
window.enderecoEmLinhas = enderecoEmLinhas;
window.linkDeRastreio = linkDeRastreio;
