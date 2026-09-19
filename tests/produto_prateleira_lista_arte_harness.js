const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, mensagem, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + mensagem + (detalhe === undefined ? '' : '\n         ' + detalhe));
}

function recortar(nome) {
    let inicio = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (inicio < 0) inicio = SCRIPT.indexOf('\nasync function ' + nome + '(');
    if (inicio < 0) throw new Error('nao achei ' + nome);
    return SCRIPT.slice(inicio, SCRIPT.indexOf('\n}', inicio) + 2);
}

const state = {
    produtosGlobais: [
        { id_produto: 9000, nomeReal: 'Dseg - Triband', is_estoque: true },
        { id_produto: 401, nomeReal: 'Ingresso MOBI', is_estoque: false },
    ],
    produtosPropostaGlobais: [
        { id: 77, id_produto: 9000 },
        { id: 78, id_produto: 401 },
    ],
    produtoFotosPorId: {
        9000: [
            { foto_id: 2, url: 'https://foto/segunda.jpg', posicao: 2 },
            { foto_id: 1, url: 'https://foto/Dseg.jpg', posicao: 1 },
        ],
    },
    osItens: {}, modelosGlobais: {}, todasArtes: [],
};

const fonteBase = [
    recortar('idProdutoDoItem'),
    recortar('fotoPrincipalDoProduto'),
    recortar('aplicarRegraProdutoPrateleira'),
].join('\n');
const api = new Function('state', 'window', fonteBase
    + '\nreturn { idProdutoDoItem, fotoPrincipalDoProduto, aplicarRegraProdutoPrateleira };')(state, {});

(function regraDePrateleira() {
    const item = {
        id: 1001, id_int: 22001, id_produto_proposta_origem: 77,
        status_arte: 'PENDENTE', amostra_status: 'PENDENTE',
        arte_url: 'https://arte/nao-usar.jpg', amostra_arte_base64: 'data:image/jpeg;base64,xxx',
    };
    ok(api.aplicarRegraProdutoPrateleira(item), 'identifica o Dseg como produto de prateleira');
    ok(item._foto_produto_url === 'https://foto/Dseg.jpg', 'usa a foto de menor posicao');
    ok(item._foto_produto_id === 1, 'conserva o foto_id escolhido');
    ok(item.status_arte === 'APROVADA' && item.amostra_status === 'APROVADA', 'modelo fica aprovado');
    ok(item.arte_url === null, 'produto de prateleira continua sem arte editavel');
    ok(item.amostra_arte_base64 === 'https://foto/Dseg.jpg', 'foto comercial vira a previa persistida');

    const sobDemanda = { id_produto_proposta_origem: 78, status_arte: 'PENDENTE', arte_url: 'arte.jpg' };
    ok(!api.aplicarRegraProdutoPrateleira(sobDemanda), 'produto sob demanda fica fora da regra');
    ok(sobDemanda.status_arte === 'PENDENTE' && sobDemanda.arte_url === 'arte.jpg', 'sob demanda permanece intacto');
})();

(function apresentacaoDaFoto() {
    const bloco = new Function('state', fonteBase + '\n' + recortar('blocoDeArteDoModelo')
        + '\nreturn blocoDeArteDoModelo;')(state);
    const html = bloco({ _produto_prateleira: true, _foto_produto_url: 'https://foto/Dseg.jpg' }, 0, 'os', '', false);
    ok(html.includes('https://foto/Dseg.jpg'), 'card do modelo exibe a foto do produto');
    ok(html.includes('PRODUTO DE PRATELEIRA · APROVADO'), 'card explica a aprovacao automatica');
})();

(async function persistenciaConfirmada() {
    const chamadas = [];
    const consulta = {
        update(payload) { chamadas.push(['update', payload]); return this; },
        eq(campo, valor) { chamadas.push(['eq', campo, valor]); return this; },
        async select(campos) {
            chamadas.push(['select', campos]);
            return { data: [{ id: 1001, id_int: 22001, status_arte: 'APROVADA', amostra_arte_base64: 'https://foto/Dseg.jpg' }], error: null };
        },
    };
    const supabaseClient = { from(tabela) { chamadas.push(['from', tabela]); return consulta; } };
    const sync = new Function('state', 'supabaseClient', 'temSessaoDoSupabase', 'window',
        fonteBase + '\n' + recortar('sincronizarAprovacaoProdutosPrateleira')
        + '\nreturn sincronizarAprovacaoProdutosPrateleira;')(
        state, supabaseClient, async () => true, { console }
    );
    const modelo = { id: 1001, id_int: 22001, id_produto_proposta_origem: 77, status_arte: 'PENDENTE' };
    const resultado = await sync([modelo]);
    ok(resultado.atualizados === 1 && resultado.falhas === 0, 'persistencia aprovada e confirmada');
    ok(chamadas.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === 1001), 'UPDATE filtra pelo id do modelo');
    ok(chamadas.some(c => c[0] === 'eq' && c[1] === 'id_int' && c[2] === 22001), 'UPDATE filtra pelo numero do pedido');
    ok(chamadas.some(c => c[0] === 'update' && c[1].amostra_arte_base64 === 'https://foto/Dseg.jpg'),
        'UPDATE grava a foto em amostra_arte_base64 para o portal');

    ok(SCRIPT.includes("from('vw_produto_fotos')"), 'frontend consulta a view correta');

    if (falhas) process.exit(1);
    console.log('OK: ' + total + ' verificacoes de produto de prateleira passaram.');
})().catch(e => {
    console.error(e);
    process.exit(1);
});
