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
 * O CEP com o hífen, como se escreve num envelope: `94574-110`.
 *
 * O ERP grava dos dois jeitos, e o cliente lia `94574110` — oito dígitos
 * grudados, que ninguém confere de relance. Como é ele quem tem de olhar essa
 * linha e dizer se está certa, a leitura importa.
 *
 * Só formata o que TEM oito dígitos. Um CEP incompleto passa como está: pôr
 * hífen no meio de um número truncado o faria parecer completo, e a linha de
 * cima já pinta em âmbar o que falta.
 */
/**
 * O CPF ou o CNPJ com os pontos, como se lê num documento.
 *
 * `14302058000102` são catorze dígitos grudados; `14.302.058/0001-02` é o mesmo
 * número numa forma que alguém consegue conferir olhando. E conferir é
 * exatamente o que a aba de Nota pede ao cliente — o cartão inteiro existe para
 * ele dizer se aquilo está certo.
 *
 * Só formata 11 ou 14 dígitos, que é o que `tipoDaPessoa` reconhece. Documento
 * incompleto passa como está: pôr máscara num número truncado o faria parecer
 * completo.
 */
function documentoEmMascara(documento) {
    const bruto = String(documento || '').trim();
    const d = bruto.replace(/\D/g, '');
    if (d.length === 11) {
        return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    }
    if (d.length === 14) {
        return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8)
             + '/' + d.slice(8, 12) + '-' + d.slice(12);
    }
    return bruto;
}

function cepEmMascara(cep) {
    const bruto = String(cep || '').trim();
    const digitos = bruto.replace(/\D/g, '');
    if (digitos.length !== 8) return bruto;
    return digitos.slice(0, 5) + '-' + digitos.slice(5);
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
        { rotulo: 'CEP', valor: cepEmMascara(endereco.cep) }
    ];

    return linhas.filter(l => l.valor);
}

/**
 * Se o pedido é de RETIRADA na gráfica.
 *
 * O ERP escreve isso de várias formas, em dois campos: `frete_escolhido` traz
 * `RETIRADA` e `RETIRAR`; `cotacao_frete.servico` traz "Retirada Local" e
 * "RETIRA BALCÃO". Todas começam por RETIR, e é por aí que se pergunta — em vez
 * de manter uma lista que a próxima grafia do parceiro deixaria desatualizada.
 */
function ehRetirada(pedido, frete) {
    const nome = ((pedido && pedido.frete_escolhido) || (frete && frete.servico) || '')
        .toString().trim().toUpperCase();
    return nome.indexOf('RETIR') === 0;
}

/**
 * O endereço que a aba de Entrega deve mostrar.
 *
 * Na RETIRADA é o da GRÁFICA, e não o do cliente — regra do usuário em
 * 20/08/2026. Até então a aba mostrava o endereço do cliente num pedido de
 * retirada, que é o contrário do que acontece: é o cliente que vai até lá.
 *
 * Nos demais, é o endereço escolhido NO PEDIDO (`propostas.id_endereco_ent`,
 * resolvido pela função do banco) — um cliente pode ter vários, e o do pedido é
 * o que vale.
 */
function enderecoDeEntrega(dados) {
    const pedido = (dados && dados.pedido) || null;
    const frete = (dados && dados.frete) || null;

    if (ehRetirada(pedido, frete)) {
        const g = (dados && dados.grafica) || null;
        return { naGrafica: true, endereco: g, nome: g ? g.nome : null };
    }
    return { naGrafica: false, endereco: (dados && dados.endereco) || null, nome: null };
}

/**
 * A rota até um endereço, no mapa — saindo de onde o cliente estiver.
 *
 * `maps/dir/` e não `maps/search/`: o usuário pediu "um mapa para localização
 * atual", e é a rota que usa o GPS do aparelho. O endereço universal do Google
 * Maps funciona no iPhone, no Android e no computador sem app instalado.
 *
 * O CEP entra no destino de propósito: é ele que desempata rua de mesmo nome em
 * cidades diferentes.
 */
function linkDoMapa(endereco) {
    if (!endereco) return null;
    const rua = (endereco.endereco || '').trim();
    if (!rua) return null;

    const partes = [
        rua + (endereco.numero ? ', ' + String(endereco.numero).trim() : ''),
        (endereco.bairro || '').trim(),
        (endereco.cidade || '').trim(),
        (endereco.uf || '').trim(),
        (endereco.cep || '').trim()
    ].filter(Boolean);

    return 'https://www.google.com/maps/dir/?api=1&destination='
         + encodeURIComponent(partes.join(', '));
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
function entregaExigeRecebedor(endereco, cliente, pedido, frete) {
    // Retirada não tem recebedor a informar: quem busca é o próprio cliente, no
    // balcão, e ali ele se identifica em pessoa.
    if (ehRetirada(pedido, frete)) return false;
    if (!endereco) return false;
    if (tipoDaPessoa(cliente && cliente.documento) === 'fisica') return false;

    const temNome = !!(endereco.recebedor || '').trim();
    const temCpf = !!(endereco.cpf_recebedor || '').trim();
    return !(temNome && temCpf);
}

// `linkDeRastreio` mudou de casa em 25/08/2026: foi para `logo-do-frete.js`.
//
// Ele nasceu aqui porque so a aba de Entrega do link do cliente o usava. Agora
// o Painel do Acabamento tambem mostra o codigo de rastreio, e o `logo-do-frete`
// e o modulo que as duas telas ja carregam -- e o lugar tematico: e ali que
// mora tudo o que sabe de transportadora.

window.carregarPortal = carregarPortal;
window.emReal = emReal;
window.rotuloDoFrete = rotuloDoFrete;
window.prazoDeProducao = prazoDeProducao;
window.prazoDoFrete = prazoDoFrete;
window.prazoDeEntrega = prazoDeEntrega;
window.enderecoEmLinhas = enderecoEmLinhas;
window.tipoDaPessoa = tipoDaPessoa;
window.cepEmMascara = cepEmMascara;
window.documentoEmMascara = documentoEmMascara;
window.entregaExigeRecebedor = entregaExigeRecebedor;
window.ehRetirada = ehRetirada;
window.enderecoDeEntrega = enderecoDeEntrega;
window.linkDoMapa = linkDoMapa;
