// Regra unica de exibicao do cliente: fantasia antes da razao social.
// Roda em node: `node tests/nome_fantasia_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const IDEAL = fs.readFileSync(path.join(RAIZ, 'frontend', 'ideal-control.js'), 'utf8');
const CONFERENCIA = fs.readFileSync(path.join(RAIZ, 'frontend', 'conferencia-pedidos.js'), 'utf8');
const PORTAL = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-dados.js'), 'utf8');
const POR_COR = fs.readFileSync(path.join(RAIZ, 'frontend', 'producao-por-cor.js'), 'utf8');
const SQL = fs.readFileSync(path.join(RAIZ, 'sql', 'link_cliente_nome_fantasia_20260920.sql'), 'utf8');

let falhas = 0;
let total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra === undefined ? '' : '\n         ' + JSON.stringify(extra)));
}

function extrairFuncao(fonte, nome) {
    const inicioAsync = fonte.indexOf('async function ' + nome + '(');
    const inicio = inicioAsync >= 0 ? inicioAsync : fonte.indexOf('function ' + nome + '(');
    if (inicio < 0) throw new Error('nao achei a funcao ' + nome);
    const abre = fonte.indexOf('{', inicio);
    let nivel = 0;
    for (let i = abre; i < fonte.length; i++) {
        if (fonte[i] === '{') nivel++;
        if (fonte[i] === '}' && --nivel === 0) return fonte.slice(inicio, i + 1);
    }
    throw new Error('funcao sem fim: ' + nome);
}

global.window = {};
const puras = [
    extrairFuncao(SCRIPT, 'nomePreferencialDoCliente'),
    extrairFuncao(SCRIPT, 'nomePreferencialDaProposta'),
    extrairFuncao(SCRIPT, 'aplicarNomesPreferenciaisDasPropostas')
].join('\n');
const funcoes = new Function(puras + '\nreturn { nomePreferencialDoCliente, nomePreferencialDaProposta, aplicarNomesPreferenciaisDasPropostas };')();

(async function () {
    ok(funcoes.nomePreferencialDoCliente({ fantasia: '  Loja Sol  ', nome: 'SOL COMERCIO LTDA' }) === 'Loja Sol',
        'fantasia vence a razao social');
    ok(funcoes.nomePreferencialDoCliente({ fantasia: ' ', nome: 'SOL COMERCIO LTDA' }) === 'SOL COMERCIO LTDA',
        'razao social aparece quando fantasia nao existe');
    ok(funcoes.nomePreferencialDoCliente({ fantasia: '', nome: '' }, 'Cliente antigo') === 'Cliente antigo',
        'texto antigo e apenas o ultimo fallback');

    const propostas = [
        { id_int: 1, id_cliente: 10, id_faturado: 99, cliente: 'RAZAO UM' },
        { id_int: 2, id_cliente: 20, cliente: 'RAZAO DOIS' },
        { id_int: 3, id_cliente: 30, cliente: 'RAZAO TRES' }
    ];
    propostas[0].cliente_exibicao = 'Fantasia Um';
    const banco = { from() { throw new Error('Consulta anonima proibida'); } };
    await funcoes.aplicarNomesPreferenciaisDasPropostas(banco, propostas);
    ok(funcoes.nomePreferencialDaProposta(propostas[0]) === 'Fantasia Um', 'a lista recebe a fantasia');
    ok(funcoes.nomePreferencialDaProposta(propostas[1]) === 'RAZAO DOIS', 'lista cai na razao sem fantasia');
    ok(funcoes.nomePreferencialDaProposta(propostas[2]) === 'RAZAO TRES', 'cadastro ausente preserva o nome da proposta');

    ok(/c\.fantasia \|\| c\.nome_fantasia/.test(IDEAL), 'Ideal Control aplica fantasia primeiro');
    ok(/c\.fantasia \|\| c\.nome_fantasia \|\| c\.nome/.test(CONFERENCIA), 'Conferencia aplica fantasia primeiro');
    ok(/cliente\.fantasia \|\| cliente\.nome_fantasia/.test(PORTAL), 'portal aplica fantasia primeiro');
    ok(/aplicarNomesPreferenciaisDasPropostas\(productsClient, missingOrders\)/.test(POR_COR),
        'Producao por Cor corrige tambem pedidos fora do cache principal');
    ok(/NULLIF\(btrim\(v_cli_comercial\.fantasia\)/.test(SQL), 'RPC do portal entrega fantasia no cabecalho');

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(e); process.exit(1); });
