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
function rotuloDoFrete(pedido, frete) {
    // O nome vem do pedido; a cotação escolhida é a reserva. Os dois quase
    // sempre coincidem, mas `cotacao_frete.servico` tem nomes que
    // `frete_escolhido` não tem -- "Frete Incluso", "Sem custo",
    // "Transportadora Parceira" --, e dizer "A combinar" com uma cotação
    // escolhida na mão seria esconder do cliente o que já está decidido.
    const doPedido = pedido && pedido.frete_escolhido ? String(pedido.frete_escolhido).trim() : '';
    const daCotacao = frete && frete.servico ? String(frete.servico).trim() : '';
    const escolhido = doPedido || daCotacao;
    if (!escolhido) return 'A combinar';

    const nome = NOME_DO_FRETE[escolhido.toUpperCase()] || escolhido;
    const modalidade = pedido.modalidade_frete ? String(pedido.modalidade_frete).trim() : '';
    const comModalidade = modalidade ? nome + ' (' + modalidade + ')' : nome;

    const valor = Number(pedido.valor_frete);
    if (!isFinite(valor) || valor <= 0) return comModalidade + ' — sem custo';
    return comModalidade + ' — ' + emReal(valor);
}

// ── Os dois prazos ────────────────────────────────────────────────────────
//
// O usuário definiu em 20/08/2026: a aba de entrega mostra **prazo de produção**
// e **prazo de envio**, e não um só. São duas coisas diferentes, com duas
// origens diferentes, e somá-las num número só esconderia qual das duas está
// atrasando quando o pedido atrasa.

/** O número de dias escrito num prazo, ou `null` quando não há número. */
function diasDoPrazo(texto) {
    const achado = String(texto || '').match(/\d+/);
    return achado ? parseInt(achado[0], 10) : null;
}

function emDiasUteis(dias) {
    return dias === 1 ? '1 dia útil' : dias + ' dias úteis';
}

/**
 * O prazo de PRODUÇÃO do pedido: o do produto que demora mais.
 *
 * Cada produto tem o seu prazo, independente dos outros (`produtos.prazo`), mas
 * o pedido só sai da gráfica quando o ÚLTIMO item fica pronto — por isso o do
 * pedido é o maior deles, e não a soma nem a média.
 *
 * A comparação é feita pelo NÚMERO, e não pelo texto, porque o catálogo tem
 * cinco redações para a mesma coisa (medidas em 20/08/2026): "3 dias úteis" em
 * 50 produtos, "1 dia útil" em 7, "2 dias úteis" em 3, "Prazo de produção 2 dias
 * úteis" e "Produção: 1 dia útil + Frete" em um cada.
 *
 * Prazo sem número nenhum passa como está: a frase do catálogo é melhor do que
 * um número que ninguém escreveu.
 */
function prazoDeProducao(itens) {
    const comTexto = (itens || []).filter(i => i && i.prazo && String(i.prazo).trim());
    if (!comTexto.length) return null;

    let maior = null;
    comTexto.forEach(i => {
        const dias = diasDoPrazo(i.prazo);
        if (dias !== null && (maior === null || dias > maior)) maior = dias;
    });

    return maior !== null ? emDiasUteis(maior) : String(comTexto[0].prazo).trim();
}

/**
 * O prazo de ENVIO: o que a transportadora prometeu na cotação escolhida.
 *
 * Ele vem de `cotacao_frete.prazo` — `propostas` guarda o nome e o valor do
 * frete, mas não o prazo. O texto é livre, escrito pelo ERP, e passa inteiro:
 * "1 dia útil", "A combinar", "Sob consulta", "De 12 até 48hs ( consultar )",
 * "dia seguinte a conclusão". Reescrever qualquer uma dessas seria inventar uma
 * promessa de entrega que a gráfica não fez.
 *
 * A única correção é o número solto: 30 cotações do SEDEX gravam só "1", e
 * outras 227 gravam "1 dia útil" — é a mesma coisa com a unidade perdida, e um
 * "1" sozinho na tela do cliente não diz nada.
 */
function prazoDoFrete(frete) {
    const texto = frete && frete.prazo ? String(frete.prazo).trim() : '';
    if (!texto) return null;
    if (/^\d+$/.test(texto)) return emDiasUteis(parseInt(texto, 10));
    return texto;
}

/**
 * O Prazo de Entrega: os dois prazos numa frase só, com a conta feita.
 *
 * O usuário pediu isto em 20/08/2026, olhando para as duas linhas soltas que
 * havia antes — "Prazo de produção: 1 dia útil" e "Prazo de envio: 1 dia útil".
 * Elas estavam certas e não respondiam a pergunta: **quando chega?** Duas linhas
 * com o mesmo número obrigam o cliente a somar de cabeça.
 *
 * Devolve `{ producao, envio, texto, recebimento }`:
 *
 *     texto        "Produção: 1 dia útil + Envio: 1 dia útil"
 *     recebimento  "2 dias úteis"
 *
 * A soma só sai quando OS DOIS lados trazem número. "A combinar" e "Sob
 * consulta" não viram zero: somar o que der inventaria uma data de entrega que a
 * gráfica não prometeu, e é da data prometida que o cliente cobra depois.
 */
function prazoDeEntrega(itens, frete) {
    const producao = prazoDeProducao(itens);
    const envio = prazoDoFrete(frete);

    if (!producao && !envio) {
        return { producao: null, envio: null, texto: null, recebimento: null };
    }

    const texto = 'Produção: ' + (producao || 'a combinar')
                + ' + Envio: ' + (envio || 'a combinar');

    const diasProducao = diasDoPrazo(producao);
    const diasEnvio = diasDoPrazo(envio);
    const recebimento = (diasProducao !== null && diasEnvio !== null)
        ? emDiasUteis(diasProducao + diasEnvio)
        : null;

    return { producao, envio, texto, recebimento };
}

/**
 * Se o documento é de pessoa física ou jurídica: `'fisica'`, `'juridica'` ou
 * `null` quando não dá para saber.
 *
 * A conta é feita pelos DÍGITOS do documento, e não pela coluna `tipo_pessoa`.
 * Medido no banco em 20/08/2026, nos 3.946 clientes com pedido nos últimos 90
 * dias: `tipo_pessoa` usa dois vocabulários — "CPF"/"CNPJ" em 3.153 e
 * "FISICA"/"JURIDICA" em 793 —, enquanto a contagem de dígitos nunca discordou
 * dela: 11 para CPF, 14 para CNPJ, sem uma exceção.
 *
 * Documento que não é nem um nem outro devolve `null`, e `null` nunca autoriza
 * herdar nada: não sabendo quem é, pergunta-se.
 */
function tipoDaPessoa(documento) {
    const digitos = String(documento || '').replace(/\D/g, '');
    if (digitos.length === 11) return 'fisica';
    if (digitos.length === 14) return 'juridica';
    return null;
}

/**
 * O endereço como uma lista de linhas prontas, na ordem em que se lê um
 * envelope. Linha sem valor não entra: rótulo com vazio ao lado é ruído.
 *
 * `cliente` são os dados da nota fiscal, e servem à regra do recebedor — ver o
 * bloco dentro da função.
 */
function enderecoEmLinhas(endereco, cliente) {
    if (!endereco) return [];

    const rua = (endereco.endereco || endereco.rua || endereco.logradouro || '').trim();
    const numero = (endereco.numero || '').trim();
    const cidade = (endereco.cidade || '').trim();
    const uf = (endereco.uf || '').trim();

    // Recebedor e CPF aparecem SEMPRE, mesmo vazios.
    //
    // Medido no banco em 20/08/2026: só 126 dos 1.929 endereços de pedidos dos
    // últimos 90 dias têm `recebedor`, e 132 têm `cpf_recebedor`. Escondendo a
    // linha quando o campo está vazio — que era o comportamento —, 93% dos
    // clientes nunca ficaram sabendo que faltava esse dado. Quem descobre é o
    // motoboy, na portaria do prédio, com o pacote na mão.
    //
    // Com "Não informado" na tela, logo acima do botão ALTERAR, a falta vira um
    // convite a preencher.
    let recebedor = (endereco.recebedor || '').trim();
    let cpf = (endereco.cpf_recebedor || '').trim();
    let herdado = false;

    // Faltando o recebedor, valem os dados da NOTA FISCAL — mas só quando ela é
    // de pessoa física. Regra do usuário, 20/08/2026.
    //
    // O porquê está na entrega: a transportadora põe o pacote na mão de uma
    // pessoa e pede o CPF dela. Numa nota de pessoa física, essa pessoa é o
    // próprio cliente, e o dado já está no cadastro. Numa nota de empresa não
    // há a quem herdar: o CNPJ não é o CPF de ninguém, e o nome da razão social
    // não recebe pacote. Aí o dado passa a ser obrigatório — ver
    // `entregaExigeRecebedor`.
    //
    // O que está escrito no endereço vence sempre: quem cadastrou "Maria, da
    // portaria" sabe mais do que esta regra.
    if ((!recebedor || !cpf) && cliente && tipoDaPessoa(cliente.documento) === 'fisica') {
        if (!recebedor) { recebedor = (cliente.nome || '').trim(); herdado = !!recebedor; }
        if (!cpf) { cpf = (cliente.documento || '').trim(); herdado = herdado || !!cpf; }
    }

    const linhas = [
        { rotulo: 'Recebedor', valor: recebedor || 'Não informado',
          falta: !recebedor, daNota: herdado && !(endereco.recebedor || '').trim() },
        { rotulo: 'CPF do recebedor', valor: cpf || 'Não informado',
          falta: !cpf, daNota: herdado && !(endereco.cpf_recebedor || '').trim() },
        { rotulo: 'Endereço', valor: rua ? rua + ', ' + (numero || 'S/N') : '' },
        { rotulo: 'Complemento', valor: (endereco.complemento || '').trim() },
        { rotulo: 'Bairro', valor: (endereco.bairro || '').trim() },
        { rotulo: 'Cidade/UF', valor: cidade && uf ? cidade + ' - ' + uf : (cidade || uf) },
        { rotulo: 'CEP', valor: (endereco.cep || '').trim() }
    ];

    return linhas.filter(l => l.valor);
}

/**
 * Se a aba de Entrega precisa EXIGIR o nome e o CPF de quem vai receber.
 *
 * É a outra metade da regra do usuário: nota de pessoa jurídica não empresta
 * recebedor, então sem esse dado a entrega não fecha. Nota de pessoa física
 * resolve sozinha (ver `enderecoEmLinhas`), e não exige nada.
 *
 * Documento desconhecido também exige. Errar para o lado de perguntar é o certo
 * aqui: um pacote que chega sem recebedor volta, e volta com frete.
 *
 * Pedido sem endereço nenhum NÃO exige: ali o que falta é o endereço, e cobrar o
 * CPF antes disso seria cobrar a segunda coisa primeiro.
 */
function entregaExigeRecebedor(endereco, cliente) {
    if (!endereco) return false;
    if (tipoDaPessoa(cliente && cliente.documento) === 'fisica') return false;

    const temNome = !!(endereco.recebedor || '').trim();
    const temCpf = !!(endereco.cpf_recebedor || '').trim();
    return !(temNome && temCpf);
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
window.prazoDeProducao = prazoDeProducao;
window.prazoDoFrete = prazoDoFrete;
window.prazoDeEntrega = prazoDeEntrega;
window.enderecoEmLinhas = enderecoEmLinhas;
window.tipoDaPessoa = tipoDaPessoa;
window.entregaExigeRecebedor = entregaExigeRecebedor;
window.linkDeRastreio = linkDeRastreio;
