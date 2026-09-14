// A prévia combinada precisa resolver o banco e a fatia de cada modelo.
const fs = require('fs');
const path = require('path');
const PEDIDO = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? ' -- ' + JSON.stringify(extra) : ''));
}
function extrair(nome) {
    const inicio = PEDIDO.indexOf('\nfunction ' + nome + '(');
    if (inicio < 0) throw new Error('funcao ausente: ' + nome);
    return PEDIDO.slice(inicio, PEDIDO.indexOf('\n}', inicio) + 2);
}

const itens = [
    { id: '1000940', numeracao_id: 'n1', fatia: ['foto-1', 'foto-2'] },
    { id: '1000947', numeracao_id: 'n1', fatia: ['setor-1', 'setor-2', 'setor-3', 'setor-4'] },
];
const state = {
    numeracoes: [{ id: 'n1', elements: [{ source: 'database' }] }],
    osItens: { vibe_21894: itens },
    activeOSItem: { osId: 'vibe_21894', itemId: '1000940' },
};
function resolverNumeracaoParaModelo(num, item) {
    return Object.assign({}, num, { csv_data: item.fatia.map(valor => ({ valor })) });
}
function vinculoDeBancoDoModelo() { return {}; }
function linhasDoModeloNoPayload(item, num) {
    return num.csv_data.slice(0, item.fatia.length);
}

const resolver = new Function(
    'state', 'window', 'resolverNumeracaoParaModelo', 'vinculoDeBancoDoModelo',
    'linhasDoModeloNoPayload',
    extrair('numeracaoDaArteNaPreviaPedido') + '\nreturn numeracaoDaArteNaPreviaPedido;'
)(state, {}, resolverNumeracaoParaModelo, vinculoDeBancoDoModelo, linhasDoModeloNoPayload);

const foto = resolver({ _osId: 'vibe_21894', _itemId: '1000940', num1_id: 'n1' });
const setor = resolver({ _osId: 'vibe_21894', _itemId: '1000947', num1_id: 'n1' });

ok(foto.csv_data.length === 2, 'Foto recebe somente a própria fatia', foto.csv_data);
ok(setor.csv_data.length === 4, 'Setor recebe somente a própria fatia', setor.csv_data);
ok(foto.csv_data[0].valor === 'foto-1', 'Foto não lê os dados de Setor');
ok(setor.csv_data[0].valor === 'setor-1', 'Setor não lê os dados de Foto');

const previa = PEDIDO.slice(PEDIDO.indexOf('\nfunction drawPedPreview('));
ok(/const linhasDaNumeracao = Array\.isArray\(currentNum\.csv_data\)/.test(previa),
    'o desenho lê as linhas da numeração resolvida do modelo');
ok(/const indiceDaLinha = multiArteItem \? multiArteLocalIndex : item_index/.test(previa),
    'o desenho usa o índice local da arte combinada');
ok(/isBack && multiArteItem\.pdfVersoDoc/.test(previa),
    'o verso combinado escolhe o PDF separado do modelo');

if (falhas) process.exit(1);
console.log('OK: prévia combinada por modelo -- ' + total + ' verificações.');
