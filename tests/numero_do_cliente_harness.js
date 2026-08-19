// O numero do cliente ao lado do nome: "Patrick Soares Furtado - 28449".
//
// Pedido do usuario em 19/08/2026, com tres exemplos que serviram de prova
// contra o banco: pedido 20951 -> cliente 23860 (USINA MKM1 LTDA), pedido 20925
// -> 59131 (P49 CENTRO DE DISTRIBUICAO DE BEBIDAS), pedido 20928 -> 28449
// (Patrick Soares Furtado). Os tres batem com `propostas.id_cliente`, que e a
// mesma chave da tabela `clientes` (`clientes.id_cliente`).
//
// A armadilha esta na coluna vizinha. O painel ja carregava um `id_cliente`,
// so que montado como `id_faturado || id_cliente` -- serve para buscar dados de
// faturamento e para casar as numeracoes do cliente, e por isso continua como
// esta. Mas quem paga pode ser outro: numa amostra de mil propostas, duas
// divergem -- o pedido 20940 e do cliente 43520 e fatura no 66163. Ao lado de
// um NOME tem de vir o numero de quem esse nome nomeia.
//
// Roda em node: `node tests/numero_do_cliente_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const rotuloDoCliente = new Function(extrairFuncao('rotuloDoCliente') + '\nreturn rotuloDoCliente;')();

// ─── A frase ─────────────────────────────────────────────────────────────────

(function osTresExemplosDoUsuario() {
    ok(rotuloDoCliente({ cliente: 'Patrick Soares Furtado', numero_cliente: 28449 })
        === 'Patrick Soares Furtado - 28449', 'o exemplo do pedido 20928');
    ok(rotuloDoCliente({ cliente: 'USINA MKM1 LTDA', numero_cliente: 23860 })
        === 'USINA MKM1 LTDA - 23860', 'o do 20951');
    ok(rotuloDoCliente({ cliente: 'P49 CENTRO DE DISTRIBUICAO DE BEBIDAS LTDA', numero_cliente: 59131 })
        === 'P49 CENTRO DE DISTRIBUICAO DE BEBIDAS LTDA - 59131', 'e o do 20925');
})();

(function oNumeroPodeChegarComoTexto() {
    // O que vem do banco as vezes passa por JSON e volta string.
    ok(rotuloDoCliente({ cliente: 'Fulano', numero_cliente: '28449' }) === 'Fulano - 28449',
        'numero em texto vale igual');
})();

(function semNumeroNaoSobraTracoSolto() {
    // Um traco no fim faria o operador procurar um numero que nao existe.
    ok(rotuloDoCliente({ cliente: 'Fulano', numero_cliente: null }) === 'Fulano', 'sem numero, so o nome');
    ok(rotuloDoCliente({ cliente: 'Fulano' }) === 'Fulano', 'campo ausente tambem');
    ok(rotuloDoCliente({ cliente: '  Fulano  ', numero_cliente: null }) === 'Fulano', 'e o nome vem aparado');
})();

(function semNomeAindaAssimMostraONumero() {
    ok(rotuloDoCliente({ cliente: '', numero_cliente: 28449 }) === '28449', 'so o numero');
    ok(rotuloDoCliente({ cliente: '', numero_cliente: null }) === '', 'sem os dois, nada');
    ok(rotuloDoCliente(null) === '', 'e pedido nulo nao quebra a tela');
})();

// ─── De onde o numero sai ────────────────────────────────────────────────────

(function oNumeroSaiDoIdClienteENaoDoIdFaturado() {
    // O coracao do caso. `id_faturado` responderia certo em quase todo pedido e
    // errado justamente naquele em que quem paga nao e quem comprou.
    const ocorrencias = SCRIPT.match(/numero_cliente: propReal\?\.id_cliente/g) || [];
    ok(ocorrencias.length === 3, 'os tres carregamentos de pedido trazem o numero', ocorrencias.length);
    ok(!/numero_cliente: propReal\?\.id_faturado/.test(SCRIPT),
        'e nenhum deles usa o id de faturamento');
})();

(function oIdDeFaturamentoContinuaIntocado() {
    // Ele casa as numeracoes do cliente (`Cli_Num`) e busca os dados de
    // faturamento. Trocar o significado dele para arrumar um rotulo quebraria
    // essas duas coisas caladas.
    const ocorrencias = SCRIPT.match(/id_cliente: propReal\?\.id_faturado \|\| propReal\?\.id_cliente/g) || [];
    ok(ocorrencias.length === 3, 'o campo antigo continua como era', ocorrencias.length);
})();

(function asDuasConsultasTrazemAColuna() {
    // Sem a coluna no `select`, `propReal.id_cliente` viria undefined e o numero
    // sumiria da tela sem erro nenhum.
    const selects = SCRIPT.match(/\.select\('[^']*id_cliente[^']*'\)/g) || [];
    ok(selects.length >= 2, 'as consultas de proposta pedem o id_cliente', selects);
})();

// ─── Onde o rotulo aparece ───────────────────────────────────────────────────

(function oRotuloEstaNasCincoTelas() {
    // Lista de Impressao, Lista de Arte, o banner do pedido e os dois cards de
    // detalhe. Um lugar de fora mostraria o mesmo cliente sem numero, e quem
    // conferisse acharia que sao clientes diferentes.
    const usos = SCRIPT.match(/rotuloDoCliente\(os\)/g) || [];
    ok(usos.length >= 7, 'o rotulo e usado nas telas e na busca', usos.length);
    ok(!/escapeHtml\(os\.cliente\) \|\| '--'/.test(SCRIPT),
        'nenhuma tabela mostra mais o nome cru');
    ok(!/\$\{os\.cliente \|\| '--'\}/.test(SCRIPT),
        'nem os cards de detalhe');
})();

(function aBuscaAchaPeloNumeroTambem() {
    // O numero esta na tela; o primeiro reflexo de quem o le e cola-lo na busca.
    const i = SCRIPT.indexOf('function renderOrdens');
    const trecho = SCRIPT.slice(i);
    const usos = (trecho.match(/const cli = rotuloDoCliente\(os\)\.toLowerCase\(\);/g) || []);
    ok(usos.length === 2, 'as duas listas buscam pelo rotulo inteiro', usos.length);
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
