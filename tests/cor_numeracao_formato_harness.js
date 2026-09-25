const assert = require('node:assert/strict');
const { reconciliarCorNumDoModelo: resolver } = require('../frontend/cor-numeracao-do-modelo.js');
const cores = [
    { id: 'cordao', name: 'Cordão 85cm', formato_id: 'longo' },
    { id: 'cracha', name: 'Personalizada', formato_id: 'cartao' },
];
const nums = [
    { id: 'base', name: 'Cordão - A', formato_id: 'longo', is_custom: false },
    { id: 'custom', name: 'Modelo cartão', formato_id: 'cartao', is_custom: true, os_item_id: 'cartao' },
];
const linha = { id: 'cordao', padrao: 'Cordão 85cm', gabarito_operacional: 'Cordão - A',
    amostra_cor_id: 'cracha', amostra_num_id: 'custom' };
const original = structuredClone({ linha, cores, nums });
assert.deepEqual(resolver(linha, cores, nums),
    { corId: 'cordao', numId: 'base', corTrocada: true, numTrocada: true });
function preserva(mudancaLinha = {}, mudancaNum = {}, catalogo = nums, coresTeste = cores) {
    const ns = catalogo.map(n => n.id === 'custom' ? { ...n, ...mudancaNum } : n);
    assert.equal(resolver({ ...linha, ...mudancaLinha }, coresTeste, ns).numId, 'custom');
}
preserva({ id: 'cartao' }); // personalização do próprio modelo
preserva({}, { formato_id: 'longo' }); // compartilhada e compatível
preserva({}, { formato_ids: ['cartao', 'longo'] }); // catálogo aceita vários formatos
preserva({}, { os_item_id: null }); // proprietário desconhecido
preserva({}, { formato_id: null }); // formato desconhecido
preserva({}, {}, nums, []); // catálogo de cores indisponível
preserva({}, {}, [nums[1]]); // gabarito ERP indisponível
preserva({}, {}, [...nums, { ...nums[0], id: 'base2' }]); // nome ambíguo
preserva({}, {}, [{ ...nums[0], formato_id: 'terceiro' }, nums[1]]);
preserva({ gabarito_operacional: 'Modelo cartão' }); // escolha explicitamente nomeada
assert.deepEqual({ linha, cores, nums }, original, 'reconciliação é somente em memória');
console.log('OK: conflito entre formatos corrigido; personalizações legítimas e dados originais preservados');

// Reabrir a Lista de Arte usa o carregador real e relê os modelos do ERP.
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    const i = source.search(new RegExp('^(?:async )?function ' + nome + '\\(', 'm'));
    assert.ok(i >= 0, nome);
    return source.slice(i, source.indexOf('\n}', i) + 2);
}
(async () => {
    const ordem = { id: 'os', numero: 99999 };
    const modelos = [
        { ...linha, nome_modelo: 'Cordão', id_produto_proposta_origem: 1, quantidade: 12 },
        { ...linha, id: 'cartao', nome_modelo: 'Crachá', padrao: 'Personalizada',
            gabarito_operacional: 'Modelo cartão', id_produto_proposta_origem: 2, quantidade: 10 },
    ];
    const produtos = [{ id: 1, id_produto: 100, nome_produto: 'Cordão ERP' },
        { id: 2, id_produto: 200, nome_produto: 'Crachá ERP' }];
    const erros = [], leituras = [];
    const box = {
        state: { ordens: [ordem], osItens: {}, cores, numeracoes: nums,
            produtosGlobais: [{ id_produto: 100 }, { id_produto: 200 }] },
        window: { showView() {} }, console: { log() {}, warn() {}, error(e) { erros.push(String(e)); } },
        findOSInState: () => ordem, podeAbrirView: () => true,
        reconciliarCorNumDoModelo: resolver, aplicarRegraProdutoPrateleira() {},
        isNumeracaoDuplex: n => n?.print_mode === 'duplex', normalizarStatusImpressao: x => x,
        resolveItemCorNumIds() {}, renderOSItens() {}, renderAmostrasOSItens() {},
        recarregarNumeracoesDoPedido: async () => {}, setTimeout: fn => fn(),
        toast: (msg, tipo) => { if (tipo === 'error') erros.push(msg); },
        supabaseClient: { from(tabela) {
            const q = { select() { return q; }, eq() { return q; }, order() { return q; },
                then(ok, fail) { leituras.push(tabela); return Promise.resolve({ error: null,
                    data: structuredClone(tabela === 'pedidos_modelos' ? modelos
                        : tabela === 'produtos_proposta' ? produtos : []) }).then(ok, fail); } };
            for (const op of ['insert', 'update', 'delete', 'upsert']) q[op] = () => { throw Error('Escrita proibida'); };
            return q;
        } },
    };
    vm.createContext(box);
    vm.runInContext(extrair('loadOSItens') + '\n' + extrair('navigateToAmostrasFromOS'), box);
    await box.navigateToAmostrasFromOS('os');
    assert.deepEqual(erros, []);
    assert.equal(box.state.osItens.os[0].amostra_num_id, 'base');
    assert.equal(box.state.osItens.os[0].amostra_cor_id, 'cordao');
    assert.equal(box.state.osItens.os[1].amostra_num_id, 'custom');
    assert.equal(box.state.osItens.os[1].qtd, 10);
    assert.equal(box.state.osItens.os[0]._dbLoaded, true);
    modelos[0].nome_modelo = 'Cordão alterado no ERP';
    modelos[0].quantidade = 14;
    await box.navigateToAmostrasFromOS('os');
    assert.deepEqual(erros, []);
    assert.equal(box.state.osItens.os[0].nome_modelo, 'Cordão alterado no ERP');
    assert.equal(box.state.osItens.os[0].qtd, 14);
    assert.equal(leituras.filter(t => t === 'pedidos_modelos').length, 2);
    console.log('OK: reabertura relê modelos do ERP e mantém os vínculos separados, sem gravar');
})().catch(e => { console.error(e); process.exitCode = 1; });
