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
const cepEmMascara = carregar('cepEmMascara');
const enderecoEmLinhas = carregar('enderecoEmLinhas', ['tipoDaPessoa', 'cepEmMascara']);
// `linkDeRastreio` mudou de casa em 25/08/2026: saiu do `cliente-dados.js` e
// foi para o `logo-do-frete.js`, porque duas telas passaram a mostrar o codigo
// -- a aba de Entrega do link do cliente e a coluna Frete do Painel do
// Acabamento -- e aquele e o modulo que as duas ja carregam.
const LOGO = fs.readFileSync(path.join(RAIZ, 'frontend', 'logo-do-frete.js'), 'utf8');

/** Recorta uma funcao de OUTRO arquivo que nao o `cliente-dados.js`. */
function carregarDe(fonte, nome) {
    const marca = '\nfunction ' + nome + '(';
    const i = fonte.indexOf(marca);
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const corpo = fonte.slice(i, fonte.indexOf('\n}', i) + 2);
    return new Function(corpo + '\nreturn ' + nome + ';')();
}

const linkDeRastreio = carregarDe(LOGO, 'linkDeRastreio');
const tipoDaPessoa = carregar('tipoDaPessoa');
const entregaExigeRecebedor = carregar('entregaExigeRecebedor', ['tipoDaPessoa', 'ehRetirada']);
const ehRetirada = carregar('ehRetirada');
const enderecoDeEntrega = carregar('enderecoDeEntrega', ['ehRetirada']);
const linkDoMapa = carregar('linkDoMapa');

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

// ─── 4b. O recebedor herdado da nota fiscal ─────────────────────────────────
//
// Regra do usuario, 20/08/2026: sem recebedor no endereco, valem os dados da
// nota fiscal -- MAS so quando ela e de pessoa fisica. Sendo pessoa juridica, o
// nome e o CPF de quem recebe passam a ser obrigatorios, porque o CNPJ da
// empresa nao serve para a transportadora entregar na mao de alguem.
//
// O tipo sai da contagem de digitos do documento, e nao da coluna
// `tipo_pessoa`: medido no banco em 20/08/2026, `tipo_pessoa` usa dois
// vocabularios ("CPF"/"CNPJ" em 3.153 clientes e "FISICA"/"JURIDICA" em 793),
// enquanto os digitos nunca discordaram -- 11 para CPF, 14 para CNPJ, nos 3.946.

(function oDocumentoDizQuemE() {
    ok(tipoDaPessoa('123.456.789-00') === 'fisica', 'onze digitos e CPF');
    ok(tipoDaPessoa('12.345.678/0001-90') === 'juridica', 'quatorze e CNPJ');
    ok(tipoDaPessoa('12345678900') === 'fisica', 'sem pontuacao tambem');
    ok(tipoDaPessoa('') === null, 'sem documento nao da para saber');
    ok(tipoDaPessoa(null) === null, 'nulo tambem');
    ok(tipoDaPessoa('123') === null, 'numero que nao e nem um nem outro');
})();

(function pessoaFisicaEmprestaONomeEOCpf() {
    const linhas = enderecoEmLinhas(
        { endereco: 'Rua das Flores', numero: '250' },
        { nome: 'Ricardo Emerson', documento: '123.456.789-00' }
    );
    ok(linhas[0].valor === 'Ricardo Emerson', 'o nome vem da nota', linhas[0]);
    ok(linhas[1].valor === '123.456.789-00', 'e o CPF tambem', linhas[1]);
    ok(linhas[0].daNota === true && linhas[1].daNota === true,
        'marcados como herdados, para a tela poder dizer de onde vieram', linhas.slice(0, 2));
    ok(!linhas[0].falta && !linhas[1].falta, 'e nao contam como faltando');
})();

(function oQueEstaNoEnderecoVenceANota() {
    const linhas = enderecoEmLinhas(
        { recebedor: 'Maria Portaria', cpf_recebedor: '999.888.777-66', endereco: 'Rua X', numero: '1' },
        { nome: 'Ricardo Emerson', documento: '123.456.789-00' }
    );
    ok(linhas[0].valor === 'Maria Portaria', 'quem foi cadastrado no endereco manda', linhas[0]);
    ok(linhas[1].valor === '999.888.777-66', 'inclusive no CPF', linhas[1]);
    ok(!linhas[0].daNota, 'e nao e marcado como herdado');
})();

(function pessoaJuridicaNaoEmprestaNada() {
    // O CNPJ da empresa nao serve: a transportadora entrega na mao de uma
    // pessoa, e e o CPF dela que ela pede.
    const linhas = enderecoEmLinhas(
        { endereco: 'Rua das Flores', numero: '250' },
        { nome: 'Ingresso Ideal LTDA', documento: '12.345.678/0001-90' }
    );
    ok(linhas[0].valor === 'Não informado', 'o nome da empresa nao vira recebedor', linhas[0]);
    ok(linhas[1].valor === 'Não informado', 'nem o CNPJ vira CPF', linhas[1]);
    ok(linhas[0].falta === true && linhas[1].falta === true, 'e os dois contam como faltando');
})();

(function semSaberOTipoNaoSeHerdaNada() {
    const linhas = enderecoEmLinhas({ endereco: 'Rua X', numero: '1' }, { nome: 'Fulano', documento: '' });
    ok(linhas[0].falta === true, 'documento vazio nao autoriza herdar', linhas[0]);
    ok(enderecoEmLinhas({ endereco: 'Rua X', numero: '1' }, null)[0].falta === true,
        'sem cadastro nenhum tambem nao');
})();

// ─── 4c. Quando o recebedor vira obrigatorio ────────────────────────────────

(function juridicaComRecebedorVazioExige() {
    ok(entregaExigeRecebedor({ endereco: 'Rua X' }, { documento: '12.345.678/0001-90' }) === true,
        'CNPJ sem recebedor exige');
    ok(entregaExigeRecebedor({ endereco: 'Rua X', recebedor: 'Maria', cpf_recebedor: '111' },
                             { documento: '12.345.678/0001-90' }) === false,
        'CNPJ com recebedor cadastrado nao exige mais nada');
    ok(entregaExigeRecebedor({ endereco: 'Rua X', recebedor: 'Maria' },
                             { documento: '12.345.678/0001-90' }) === true,
        'so o nome, sem o CPF, ainda exige');
})();

(function fisicaNaoExigeNada() {
    ok(entregaExigeRecebedor({ endereco: 'Rua X' }, { nome: 'Fulano', documento: '123.456.789-00' }) === false,
        'CPF na nota resolve sozinho');
})();

(function semDocumentoConhecidoExigeTambem() {
    // Nao dando para saber se e pessoa fisica, nao se herda -- e o que falta,
    // falta. Errar para o lado de perguntar e o certo aqui: um pacote sem
    // recebedor volta.
    ok(entregaExigeRecebedor({ endereco: 'Rua X' }, { documento: '' }) === true, 'documento vazio');
    ok(entregaExigeRecebedor({ endereco: 'Rua X' }, null) === true, 'sem cadastro');
})();

(function semEnderecoNaoSeExigeRecebedor() {
    // Sem endereco cadastrado, o que falta e o endereco: cobrar o CPF do
    // recebedor antes disso seria cobrar a segunda coisa primeiro.
    ok(entregaExigeRecebedor(null, { documento: '12.345.678/0001-90' }) === false, 'sem endereco');
})();

// ─── 4d. Retirada: o endereco e o da grafica ────────────────────────────────
//
// Regra do usuario, 20/08/2026: sendo RETIRA, o endereco de entrega e o da
// GRAFICA, e nao o do cliente -- e a pagina oferece um mapa para ele chegar la.
//
// Ate entao a aba mostrava o endereco do cliente num pedido de retirada, que e
// o contrario do que acontece: e o cliente que vai ate a grafica.

(function asGrafiasDeRetiradaQueOErpEscreve() {
    // `frete_escolhido`: RETIRADA, RETIRAR. `cotacao_frete.servico`: "Retirada
    // Local", "RETIRA BALCAO". Todas comecam por RETIR.
    ok(ehRetirada({ frete_escolhido: 'RETIRADA' }) === true, 'RETIRADA');
    ok(ehRetirada({ frete_escolhido: 'RETIRAR' }) === true, 'RETIRAR');
    ok(ehRetirada({ frete_escolhido: 'Retirada Local' }) === true, 'Retirada Local');
    ok(ehRetirada({ frete_escolhido: 'retirada' }) === true, 'minuscula');
    ok(ehRetirada(null, { servico: 'RETIRA BALCÃO' }) === true, 'pela cotacao tambem');
})();

(function oQueNaoEhRetiradaNaoVira() {
    ok(ehRetirada({ frete_escolhido: 'SEDEX' }) === false, 'sedex');
    ok(ehRetirada({ frete_escolhido: 'MOTOBOY' }) === false, 'motoboy');
    ok(ehRetirada({ frete_escolhido: '' }) === false, 'vazio');
    ok(ehRetirada(null, null) === false, 'nada');
})();

(function naRetiradaOEnderecoEDaGrafica() {
    const r = enderecoDeEntrega({
        pedido: { frete_escolhido: 'RETIRADA' },
        endereco: { endereco: 'Avenida Protásio Alves', numero: '6441', cidade: 'Porto Alegre' },
        grafica: { nome: 'IDEAL GRAFICA', endereco: 'RUA FELIZARDO DE FARIAS', numero: '81',
                   bairro: 'MEDIANEIRA', cidade: 'Porto Alegre', uf: 'RS', cep: '90660130' }
    });
    ok(r.naGrafica === true, 'e retirada', r);
    ok(r.endereco.endereco === 'RUA FELIZARDO DE FARIAS', 'o endereco e o da grafica', r.endereco);
    ok(r.endereco.numero === '81', 'com o numero da grafica', r.endereco);
    ok(r.nome === 'IDEAL GRAFICA', 'e o nome dela', r);
})();

(function fretePagoUsaOEnderecoDoPedido() {
    const r = enderecoDeEntrega({
        pedido: { frete_escolhido: 'SEDEX' },
        endereco: { endereco: 'Avenida Protásio Alves', numero: '6441' },
        grafica: { endereco: 'RUA FELIZARDO DE FARIAS', numero: '81' }
    });
    ok(r.naGrafica === false, 'nao e retirada', r);
    ok(r.endereco.endereco === 'Avenida Protásio Alves', 'o endereco do pedido', r.endereco);
})();

(function retiradaSemCadastroDaGraficaNaoQuebra() {
    const r = enderecoDeEntrega({ pedido: { frete_escolhido: 'RETIRADA' }, endereco: null, grafica: null });
    ok(r.naGrafica === true, 'continua sendo retirada');
    ok(r.endereco === null, 'mas sem endereco para mostrar', r);
})();

// ─── 4e. O mapa ─────────────────────────────────────────────────────────────

(function oMapaLevaDeOndeOClienteEsta() {
    const l = linkDoMapa({ endereco: 'RUA FELIZARDO DE FARIAS', numero: '81',
                           bairro: 'MEDIANEIRA', cidade: 'Porto Alegre', uf: 'RS', cep: '90660130' });
    ok(/^https:\/\/www\.google\.com\/maps\/dir\//.test(l), 'e uma rota, e nao so um ponto no mapa', l);
    ok(/destination=/.test(l), 'com destino', l);
    ok(l.indexOf('FELIZARDO') > 0, 'o endereco vai na URL', l);
    ok(l.indexOf('90660130') > 0, 'e o CEP tambem, que e o que desempata rua repetida', l);
    ok(l.indexOf(' ') < 0, 'sem espaco solto na URL', l);
})();

(function semEnderecoNaoNasceMapa() {
    ok(linkDoMapa(null) === null, 'nulo');
    ok(linkDoMapa({}) === null, 'objeto vazio');
    ok(linkDoMapa({ endereco: '' }) === null, 'rua vazia');
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

// ─── O CEP com hifen ─────────────────────────────────────────────────────────
//
// O ERP grava dos dois jeitos, e o cliente lia `94574110` -- oito digitos
// grudados, que ninguem confere de relance. E ele quem tem de olhar essa linha e
// dizer se esta certa.

(function oCepSaiComoSeEscreveNumEnvelope() {
    ok(cepEmMascara('94574110') === '94574-110', 'oito digitos ganham o hifen', cepEmMascara('94574110'));
    ok(cepEmMascara('94574-110') === '94574-110', 'ja com hifen fica igual', cepEmMascara('94574-110'));
    ok(cepEmMascara('90660130') === '90660-130', 'o da grafica', cepEmMascara('90660130'));
    ok(cepEmMascara(' 91310003 ') === '91310-003', 'espaco em volta nao atrapalha', cepEmMascara(' 91310003 '));
})();

(function oCepIncompletoPassaComoEsta() {
    // Por o hifen no meio de um numero truncado o faria parecer completo -- e a
    // linha ja e pintada em ambar quando o dado falta.
    ok(cepEmMascara('9457') === '9457', 'curto demais fica cru', cepEmMascara('9457'));
    ok(cepEmMascara('945741100') === '945741100', 'longo demais fica cru', cepEmMascara('945741100'));
    ok(cepEmMascara('') === '', 'vazio continua vazio');
    ok(cepEmMascara(null) === '', 'nulo nao vira "null"', cepEmMascara(null));
})();

(function aLinhaDoEnderecoUsaAMascara() {
    const linhas = enderecoEmLinhas({
        endereco: 'Rua Jacarandá', numero: '35580',
        bairro: 'Querência', cidade: 'Viamão', uf: 'RS', cep: '94574110',
        recebedor: 'Anna', cpf_recebedor: '671.490.570-04'
    }, null);
    const cep = linhas.find(l => l.rotulo === 'CEP');
    ok(cep && cep.valor === '94574-110', 'o cliente le o CEP com hifen', cep);
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log(total + ' verificacoes passaram.');
