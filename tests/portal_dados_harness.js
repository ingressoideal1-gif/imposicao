// As contas do Portal do Pedido, executadas de verdade.
//
// A pagina do link do cliente virou o Portal do Pedido em 20/08/2026: cinco
// abas (Arte, Entrega, Faturamento, Orcamento, Pagamento) alimentadas por uma
// funcao so do banco, `link_cliente_pedido`. O que este harness prende sao as
// funcoes PURAS que traduzem aquele JSON para o que o cliente le na tela --
// frete, prazo, endereco, dinheiro e rastreio.
//
// Elas sao recortadas do `cliente-dados.js` e executadas aqui. Copiar a regra
// para dentro do teste faria o teste continuar passando depois de o original
// mudar, que e o defeito que este projeto ja produziu tres vezes clonando o
// `script.js`.
//
// Roda em node: `node tests/portal_dados_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DADOS = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-dados.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome) {
    const i = DADOS.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no cliente-dados.js');
    const fim = DADOS.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return DADOS.slice(i, fim + 2);
}

/** Uma tabela `const NOME = { ... };` do fonte, recortada inteira. */
function extrairTabela(nome) {
    const i = DADOS.indexOf('\nconst ' + nome + ' = {');
    if (i < 0) throw new Error('nao achei a tabela ' + nome + ' no cliente-dados.js');
    const fim = DADOS.indexOf('\n};', i);
    if (fim < 0) throw new Error('nao achei o fim da tabela ' + nome);
    return DADOS.slice(i, fim + 3);
}

function carregar(nome, dependencias) {
    const corpo = (dependencias || [])
        .map(d => (d === d.toUpperCase() ? extrairTabela(d) : extrairFuncao(d)))
        .join('\n') + '\n' + extrairFuncao(nome);
    return new Function(corpo + '\nreturn ' + nome + ';')();
}

const emReal = carregar('emReal');
const rotuloDoFrete = carregar('rotuloDoFrete', ['NOME_DO_FRETE', 'emReal']);
const prazoDeProducao = carregar('prazoDeProducao', ['diasDoPrazo', 'emDiasUteis']);
const prazoDoFrete = carregar('prazoDoFrete', ['emDiasUteis']);
const prazoDeEntrega = carregar('prazoDeEntrega',
    ['diasDoPrazo', 'emDiasUteis', 'prazoDeProducao', 'prazoDoFrete']);
const enderecoEmLinhas = carregar('enderecoEmLinhas');
const linkDeRastreio = carregar('linkDeRastreio');

// ─── 1. Dinheiro ─────────────────────────────────────────────────────────────
//
// A conta e feita a mao, e nao pelo `toLocaleString`: o formato do dinheiro que
// o cliente le nao pode depender de qual ICU o navegador dele embarcou. Num
// aparelho sem a tabela do pt-BR, o `toLocaleString` devolve `71.5` -- e o
// cliente le setenta e um reais e meio como "71 ponto 5".

(function oRealSaiSempreNoMesmoFormato() {
    ok(emReal(71.5) === 'R$ 71,50', 'duas casas sempre', emReal(71.5));
    ok(emReal('1215.57') === 'R$ 1.215,57', 'milhar com ponto', emReal('1215.57'));
    ok(emReal(0) === 'R$ 0,00', 'zero e um valor, nao um vazio', emReal(0));
    ok(emReal(3.599) === 'R$ 3,60', 'arredonda o centavo', emReal(3.599));
    ok(emReal(2600) === 'R$ 2.600,00', 'valor redondo de milhar', emReal(2600));
})();

(function semValorNaoInventaZero() {
    // "R$ 0,00" num orcamento diz que o pedido e de graca. "--" diz que o
    // numero nao chegou -- que e a verdade.
    ok(emReal(null) === '--', 'nulo');
    ok(emReal(undefined) === '--', 'ausente');
    ok(emReal('') === '--', 'texto vazio');
    ok(emReal('abacaxi') === '--', 'texto que nao e numero');
})();

// ─── 2. Forma de envio ───────────────────────────────────────────────────────

(function oFreteSaiComNomeEValor() {
    ok(rotuloDoFrete({ frete_escolhido: 'SEDEX', valor_frete: '20.12' }) === 'SEDEX — R$ 20,12',
        'sedex com valor', rotuloDoFrete({ frete_escolhido: 'SEDEX', valor_frete: '20.12' }));
    ok(rotuloDoFrete({ frete_escolhido: 'MOTOBOY', valor_frete: '22.00' }) === 'Motoboy — R$ 22,00',
        'motoboy vira Motoboy, e nao MOTOBOY gritando');
    ok(rotuloDoFrete({ frete_escolhido: 'VEPPO', valor_frete: '39.30' }) === 'VEPPO — R$ 39,30',
        'o nome do parceiro fica como esta');
})();

(function freteSemCustoNaoMostraZero() {
    ok(rotuloDoFrete({ frete_escolhido: 'RETIRADA', valor_frete: '0.00' }) === 'Retirada no local — sem custo',
        'retirada', rotuloDoFrete({ frete_escolhido: 'RETIRADA', valor_frete: '0.00' }));
    ok(rotuloDoFrete({ frete_escolhido: 'SEDEX', valor_frete: 0 }) === 'SEDEX — sem custo',
        'frete gratis de qualquer transportadora');
})();

(function aModalidadeEntraQuandoExiste() {
    // 36 dos 3.990 pedidos dos ultimos 90 dias tem `modalidade_frete`. Quando
    // ela vem, e ela que diz quem paga.
    ok(rotuloDoFrete({ frete_escolhido: 'SEDEX', valor_frete: '20.12', modalidade_frete: 'CIF' })
        === 'SEDEX (CIF) — R$ 20,12', 'com modalidade');
    ok(rotuloDoFrete({ frete_escolhido: 'SEDEX', valor_frete: '20.12', modalidade_frete: '' })
        === 'SEDEX — R$ 20,12', 'modalidade vazia nao vira parenteses vazio');
})();

(function semFreteEscolhidoNaoMente() {
    ok(rotuloDoFrete({ frete_escolhido: null, valor_frete: null }) === 'A combinar', 'sem escolha');
    ok(rotuloDoFrete({ frete_escolhido: '', valor_frete: '0.00' }) === 'A combinar', 'escolha vazia');
    ok(rotuloDoFrete(null) === 'A combinar', 'sem pedido nenhum nao quebra');
})();

// ─── 3. Os dois prazos ───────────────────────────────────────────────────────
//
// O usuario definiu em 20/08/2026: a aba de entrega mostra PRAZO DE PRODUCAO e
// PRAZO DE ENVIO, e nao um so.
//
// O de producao e independente para cada produto, e o do pedido e o do produto
// de MAIOR prazo -- a grafica so despacha quando o ultimo item fica pronto.
// O de envio e o que a transportadora prometeu na cotacao escolhida.

(function aProducaoSegueOProdutoMaisDemorado() {
    ok(prazoDeProducao([{ prazo: '1 dia útil' }, { prazo: '3 dias úteis' }, { prazo: '2 dias úteis' }])
        === '3 dias úteis', 'o maior manda',
        prazoDeProducao([{ prazo: '1 dia útil' }, { prazo: '3 dias úteis' }]));
    ok(prazoDeProducao([{ prazo: '1 dia útil' }]) === '1 dia útil', 'um produto so');
    ok(prazoDeProducao([{ prazo: '1 dia útil' }, { prazo: '1 dia útil' }]) === '1 dia útil',
        'dois iguais nao viram dois dias');
})();

(function oNumeroEExtraidoDeQualquerRedacao() {
    // As cinco redacoes que existem no catalogo, medidas em 20/08/2026:
    // "3 dias uteis" (50 produtos), "1 dia util" (7), "2 dias uteis" (3),
    // "Prazo de producao 2 dias uteis" (1), "Producao: 1 dia util + Frete" (1).
    ok(prazoDeProducao([{ prazo: 'Produção: 1 dia útil + Frete' }]) === '1 dia útil',
        'a redacao com prefixo e sufixo', prazoDeProducao([{ prazo: 'Produção: 1 dia útil + Frete' }]));
    ok(prazoDeProducao([{ prazo: 'Prazo de produção 2 dias úteis' }]) === '2 dias úteis',
        'a redacao com prefixo');
    ok(prazoDeProducao([{ prazo: 'Produção: 1 dia útil + Frete' }, { prazo: '3 dias úteis' }])
        === '3 dias úteis', 'redacoes diferentes se comparam pelo numero');
})();

(function prazoSemNumeroNaoSeInventa() {
    // Texto que nao traz numero passa inteiro: melhor a frase do catalogo do que
    // um numero que ninguem escreveu.
    ok(prazoDeProducao([{ prazo: 'Sob consulta' }]) === 'Sob consulta', 'texto puro');
    ok(prazoDeProducao([]) === null, 'sem itens');
    ok(prazoDeProducao([{ prazo: '' }]) === null, 'prazo vazio nao e prazo');
    ok(prazoDeProducao(null) === null, 'nulo nao quebra');
})();

(function oEnvioVemDaCotacaoEscolhida() {
    ok(prazoDoFrete({ prazo: '1 dia útil' }) === '1 dia útil', 'o texto da cotacao');
    ok(prazoDoFrete({ prazo: 'Sob consulta' }) === 'Sob consulta', 'e quando nao ha promessa, diz isso');
    ok(prazoDoFrete({ prazo: 'A combinar' }) === 'A combinar', 'o caso mais comum do banco');
    ok(prazoDoFrete({ prazo: 'De 12 até 48hs ( consultar )' }) === 'De 12 até 48hs ( consultar )',
        'a redacao livre da transportadora passa inteira');
})();

(function numeroSoltoGanhaAUnidade() {
    // 30 cotacoes do SEDEX gravam so "1", e outras 227 gravam "1 dia util" --
    // e a mesma coisa com a unidade perdida. Um "1" sozinho na tela do cliente
    // nao diz nada.
    ok(prazoDoFrete({ prazo: '1' }) === '1 dia útil', 'um', prazoDoFrete({ prazo: '1' }));
    ok(prazoDoFrete({ prazo: '4' }) === '4 dias úteis', 'quatro');
    ok(prazoDoFrete({ prazo: ' 2 ' }) === '2 dias úteis', 'com espaco em volta');
})();

(function semCotacaoNaoInventaPrazo() {
    ok(prazoDoFrete(null) === null, 'pedido sem cotacao escolhida');
    ok(prazoDoFrete({ prazo: null }) === null, 'cotacao sem prazo');
    ok(prazoDoFrete({ prazo: '   ' }) === null, 'so espaco');
})();

// ─── 3b. Os dois prazos somados: o Prazo de Entrega ─────────────────────────
//
// Em 20/08/2026 o usuario pediu para deixar mais claro: em vez de duas linhas
// soltas ("Prazo de producao 1 dia util" / "Prazo de envio 1 dia util"), uma so
// que some as duas e diga quando o pacote chega --
//
//     Prazo de Entrega
//     Producao: 1 dia util + Envio: 1 dia util  (recebimento a partir de 2 dias uteis)

(function osDoisAparecemNaMesmaFrase() {
    const p = prazoDeEntrega([{ prazo: '1 dia útil' }], { prazo: '1 dia útil' });
    ok(p.texto === 'Produção: 1 dia útil + Envio: 1 dia útil', 'a frase inteira', p.texto);
    ok(p.recebimento === '2 dias úteis', 'e a soma dos dois', p.recebimento);
})();

(function aSomaEDeVerdade() {
    ok(prazoDeEntrega([{ prazo: '3 dias úteis' }], { prazo: '2 dias úteis' }).recebimento
        === '5 dias úteis', 'tres mais dois', 
        prazoDeEntrega([{ prazo: '3 dias úteis' }], { prazo: '2 dias úteis' }).recebimento);
    // A producao segue sendo a do produto mais demorado, e nao a soma deles.
    ok(prazoDeEntrega([{ prazo: '1 dia útil' }, { prazo: '3 dias úteis' }], { prazo: '1 dia útil' }).recebimento
        === '4 dias úteis', 'o produto mais demorado manda na producao');
})();

(function semNumeroDosDoisLadosNaoSeSoma() {
    // "A combinar" e "Sob consulta" nao viram numero. Somar o que der e inventar
    // uma data de entrega que a grafica nao prometeu.
    const p = prazoDeEntrega([{ prazo: '1 dia útil' }], { prazo: 'A combinar' });
    ok(p.recebimento === null, 'sem soma quando um dos lados nao tem numero', p);
    ok(p.texto === 'Produção: 1 dia útil + Envio: A combinar',
        'mas a frase mostra os dois assim mesmo', p.texto);
})();

(function faltandoUmDosLados() {
    const semEnvio = prazoDeEntrega([{ prazo: '2 dias úteis' }], null);
    ok(semEnvio.texto === 'Produção: 2 dias úteis + Envio: a combinar',
        'sem cotacao, o envio fica a combinar', semEnvio.texto);
    ok(semEnvio.recebimento === null, 'e nao ha o que somar', semEnvio);

    const semProducao = prazoDeEntrega([], { prazo: '1 dia útil' });
    ok(semProducao.texto === 'Produção: a combinar + Envio: 1 dia útil',
        'e o contrario tambem', semProducao.texto);
})();

(function semNadaNaoInventaLinha() {
    const p = prazoDeEntrega([], null);
    ok(p.texto === null, 'sem prazo nenhum, nao ha frase', p);
    ok(p.recebimento === null, 'nem soma');
    ok(prazoDeEntrega(null, undefined).texto === null, 'nulo nao quebra');
})();

(function umDiaNaoViraUmDias() {
    ok(prazoDeEntrega([{ prazo: '1 dia útil' }], { prazo: '0 dias úteis' }).recebimento === '1 dia útil',
        'a soma de um dia so fica no singular',
        prazoDeEntrega([{ prazo: '1 dia útil' }], { prazo: '0 dias úteis' }).recebimento);
})();

// ─── 4. Endereco ─────────────────────────────────────────────────────────────

(function oEnderecoSaiEmLinhasNaOrdemDeLer() {
    const linhas = enderecoEmLinhas({
        recebedor: 'Maria', cpf_recebedor: '111.222.333-44',
        endereco: 'Rua das Flores', numero: '250', complemento: 'sala 3',
        bairro: 'Centro', cidade: 'Porto Alegre', uf: 'RS', cep: '91310003'
    });
    const rotulos = linhas.map(l => l.rotulo);
    ok(rotulos[0] === 'Recebedor', 'quem recebe vem primeiro', rotulos);
    ok(rotulos[rotulos.length - 1] === 'CEP', 'o CEP fecha', rotulos);
    ok(linhas.some(l => l.valor === 'Rua das Flores, 250'), 'rua e numero na mesma linha',
        linhas.map(l => l.valor));
})();

(function oRecebedorEOCpfAparecemSEMPRE() {
    // Medido no banco em 20/08/2026: so 126 dos 1.929 enderecos de pedidos dos
    // ultimos 90 dias tem `recebedor`, e 132 tem `cpf_recebedor`. Escondendo a
    // linha quando o campo esta vazio, 93% dos clientes nunca souberam que
    // faltava esse dado -- e quem descobre e o motoboy, na portaria do predio.
    //
    // Elas aparecem com "Não informado", que e um convite a usar o ALTERAR
    // logo abaixo.
    const linhas = enderecoEmLinhas({
        endereco: 'Rua das Flores', numero: '250', cidade: 'Porto Alegre', uf: 'RS'
    });
    const rotulos = linhas.map(l => l.rotulo);
    ok(rotulos[0] === 'Recebedor', 'quem recebe vem primeiro, mesmo vazio', rotulos);
    ok(rotulos[1] === 'CPF do recebedor', 'e o CPF logo depois', rotulos);
    ok(linhas[0].valor === 'Não informado', 'com o aviso no lugar do nome', linhas[0]);
    ok(linhas[1].valor === 'Não informado', 'e no lugar do CPF', linhas[1]);
    ok(linhas[0].falta === true && linhas[1].falta === true,
        'marcadas como faltando, para a tela poder pinta-las', linhas.slice(0, 2));
})();

(function preenchidosNaoGanhamOAviso() {
    const linhas = enderecoEmLinhas({
        recebedor: 'Maria', cpf_recebedor: '111.222.333-44',
        endereco: 'Rua das Flores', numero: '250'
    });
    ok(linhas[0].valor === 'Maria' && !linhas[0].falta, 'o nome como esta', linhas[0]);
    ok(linhas[1].valor === '111.222.333-44' && !linhas[1].falta, 'e o CPF', linhas[1]);
})();

(function linhaVaziaNaoAparece() {    const linhas = enderecoEmLinhas({
        endereco: 'Rua das Flores', numero: '', complemento: '',
        bairro: '', cidade: 'Porto Alegre', uf: 'RS', cep: ''
    });
    const rotulos = linhas.map(l => l.rotulo);
    ok(rotulos.indexOf('Complemento') < 0, 'sem complemento, sem a linha', rotulos);
    ok(rotulos.indexOf('Bairro') < 0, 'sem bairro, sem a linha', rotulos);
    ok(rotulos.indexOf('CEP') < 0, 'sem CEP, sem a linha', rotulos);
    ok(linhas.some(l => l.valor === 'Rua das Flores, S/N'), 'sem numero vira S/N',
        linhas.map(l => l.valor));
})();

(function semEnderecoNaoQuebra() {
    ok(Array.isArray(enderecoEmLinhas(null)) && enderecoEmLinhas(null).length === 0,
        'pedido sem endereco cadastrado devolve lista vazia');
})();

// ─── 5. Rastreio ─────────────────────────────────────────────────────────────

(function oCodigoViraLinkDosCorreios() {
    const l = linkDeRastreio('AD816558575BR');
    ok(typeof l === 'string' && l.indexOf('AD816558575BR') > 0, 'o codigo vai na URL', l);
    ok(/correios/.test(l), 'e o destino e os Correios', l);
    ok(linkDeRastreio('  ad816558575br  ').indexOf('AD816558575BR') > 0,
        'espaco em volta e minuscula nao atrapalham', linkDeRastreio('  ad816558575br  '));
})();

(function semCodigoNaoNasceLinkMorto() {
    ok(linkDeRastreio(null) === null, 'nulo');
    ok(linkDeRastreio('') === null, 'vazio');
    ok(linkDeRastreio('   ') === null, 'so espaco');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log(total + ' verificacoes passaram.');
