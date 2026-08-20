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
const prazoDeEnvio = carregar('prazoDeEnvio');
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

// ─── 3. Prazo de envio ───────────────────────────────────────────────────────
//
// A data do parceiro vence o prazo do produto: `propostas_os.data_termino` e o
// campo real do Prazo de Entrega, o mesmo que o Painel de Producao usa.

(function aDataDoParceiroVence() {
    ok(prazoDeEnvio({ data_termino: '2026-08-21T00:00:00' }, [{ prazo: '1 dia util' }]) === '21/08/2026',
        'a data ganha do texto do produto',
        prazoDeEnvio({ data_termino: '2026-08-21T00:00:00' }, [{ prazo: '1 dia util' }]));
})();

(function dataPuraNaoAndaUmDiaParaTras() {
    // `2026-08-21` sem hora o JavaScript le como meia-noite UTC -- que no Brasil
    // e 21h do dia 20. O pedido apareceria vencendo um dia antes.
    ok(prazoDeEnvio({ data_termino: '2026-08-21' }, []) === '21/08/2026',
        'data sem hora', prazoDeEnvio({ data_termino: '2026-08-21' }, []));
})();

(function semDataCaiNoPrazoDoProduto() {
    // `propostas_os` e tabela nova do parceiro: 23 linhas em 20/08/2026, para
    // 8.263 propostas. A maioria dos pedidos nao tem data.
    ok(prazoDeEnvio(null, [{ prazo: 'Produção: 1 dia útil + Frete' }]) === 'Produção: 1 dia útil + Frete',
        'sem linha de OS');
    ok(prazoDeEnvio({ data_termino: null }, [{ prazo: '2 dias úteis' }]) === '2 dias úteis',
        'linha de OS sem data');
})();

(function semPrazoNenhumDevolveNulo() {
    // Nulo e o que deixa a tela dizer "combinado com seu atendimento", em vez
    // de imprimir "undefined" na frente do cliente.
    ok(prazoDeEnvio(null, []) === null, 'nada de nada');
    ok(prazoDeEnvio(null, [{ prazo: '' }]) === null, 'prazo vazio nao e prazo');
    ok(prazoDeEnvio({ data_termino: 'nao-e-data' }, []) === null, 'data invalida nao vira NaN/NaN/NaN');
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

(function linhaVaziaNaoAparece() {
    const linhas = enderecoEmLinhas({
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
