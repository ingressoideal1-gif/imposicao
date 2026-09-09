// Modelos existentes usam a propria arte; produto comum e cache nao preenchem vazios.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extrair(nome) {
    const m = new RegExp('^(?:async )?function ' + nome + '\\(', 'm').exec(SCRIPT);
    assert.ok(m, nome);
    return SCRIPT.slice(m.index, SCRIPT.indexOf('\n}', m.index) + 2);
}
const campos = ['arte_url', 'amostra_arte_base64', 'verso_arte_url',
    'verso_amostra_arte_base64', 'url_arquivo_arte', 'url_arquivo_arte_verso'];
const arteA = 'https://example.invalid/arte_frente_12345_501_1780000000001.pdf';
const arteB = 'https://example.invalid/arte_frente_12345_502_1780000000002.pdf';
const modelos = [501, 502, 503, 504].map((id, idx) => ({
    id, id_int: 12345, id_produto_proposta_origem: 99, ordem: idx + 1,
    quantidade: idx < 2 ? 200 : 150, nome_modelo: 'Sintetico ' + id,
    arte_url: idx === 0 ? arteA : idx === 1 ? arteB : null,
    amostra_arte_base64: idx < 2 ? 'previa-' + id : null,
    verso_arte_url: null, verso_amostra_arte_base64: null,
}));
const produtos = [{id: 99, id_int: 12345, nome_produto: 'Produto sintetico',
    arte_url: arteB, amostra_arte_base64: 'previa-502',
    verso_arte_url: 'https://example.invalid/verso-produto.pdf', verso_amostra_arte_base64: 'previa-verso'}];

async function carregar(linhas = modelos, produto = produtos, artes = []) {
    const state = {ordens: [{id: 'vibe_12345', numero: 12345}], osItens: {},
        cores: [], numeracoes: [], produtosGlobais: [], todasArtes: artes};
    const errors = [], mutations = [], cache = new Map();
    const dados = {pedidos_modelos: linhas, produtos_proposta: produto, pedidos_artes: artes};
    const supabaseClient = {from(tabela) {
        assert.ok(tabela in dados);
        const q = {
            select() { return q; }, eq() { return q; }, order() { return q; },
            then(ok, fail) { return Promise.resolve({data: structuredClone(dados[tabela]), error: null}).then(ok, fail); },
        };
        for (const op of ['insert', 'update', 'delete', 'upsert']) q[op] = () => {
            mutations.push(op); throw new Error('Escrita inesperada');
        };
        return q;
    }};
    const api = new Function('state', 'supabaseClient', 'isNumeracaoDuplex',
        'normalizarStatusImpressao', 'resolveItemCorNumIds', 'renderOSItens',
        'toast', 'console', 'localStorage', 'document', `
        ${['loadOSItens', 'getPdfUrlForItem', 'donoDaArteNaUrl', 'origemDaArteDoModelo', 'cardTemOqueDesenhar'].map(extrair).join('\n')}
        return {loadOSItens, getPdfUrlForItem, origemDaArteDoModelo, cardTemOqueDesenhar};
    `)(state, supabaseClient, () => false, v => v || 'AGUARD.', () => {}, () => {},
        m => errors.push(m), {log() {}, warn() {}, error: m => errors.push(m)},
        {getItem: k => cache.get(k) || null}, {getElementById: () => null});
    await api.loadOSItens('vibe_12345');
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    return {itens: state.osItens.vibe_12345, api, cache};
}

(async () => {
    const {itens, api, cache} = await carregar();
    assert.equal(itens[0].arte_url, arteA);
    assert.equal(itens[1].arte_url, arteB);
    assert.equal(itens[0].amostra_arte_base64, 'previa-501');
    assert.equal(itens[1].amostra_arte_base64, 'previa-502');
    for (const novo of itens.slice(2)) {
        for (const campo of campos) assert.equal(novo[campo], null, 'Modelo novo: ' + campo);
        assert.equal(api.getPdfUrlForItem(novo, 'front', 'vibe_12345', 2), null);
        assert.equal(api.origemDaArteDoModelo(novo, 'frente', itens, 'vibe_12345'), null);
    }
    // Cache por indice de um modelo anterior e cache por ID nao vencem o banco.
    for (const face of ['frente', 'verso']) {
        cache.set('ideal_arte_url_vibe_12345_2_' + face, arteB);
        cache.set('ideal_arte_url_503_' + face, arteB);
        cache.set('ideal_arte_json_503_' + face, '{}');
    }
    assert.equal(api.getPdfUrlForItem(itens[2], 'front', 'vibe_12345', 2), null);
    assert.equal(api.getPdfUrlForItem(itens[2], 'back', 'vibe_12345', 2), null);
    assert.equal(api.cardTemOqueDesenhar(itens[2], 2, 'vibe_12345'), false);
    assert.equal(api.getPdfUrlForItem({id: 503}, 'front', 'vibe_12345', 2), arteB, 'Cache legado continua disponivel antes da carga do banco');
    assert.equal(api.getPdfUrlForItem(itens[0], 'front', 'vibe_12345', 0), arteA);

    const comCopia = structuredClone(modelos);
    comCopia[2].arte_url = arteA;
    comCopia[0].verso_arte_url = 'https://example.invalid/verso-proprio.pdf';
    const copia = await carregar(comCopia);
    assert.equal(copia.itens[2].arte_url, arteA, 'Colagem gravada preservada');
    assert.equal(copia.itens[0].verso_arte_url, comCopia[0].verso_arte_url);
    assert.equal(copia.itens[3].verso_arte_url, null);
    const aliases = structuredClone(modelos);
    aliases[2].url_arquivo = arteA;
    aliases[2].verso_url_arquivo = 'https://example.invalid/verso-legado.pdf';
    const legado = await carregar(aliases);
    assert.equal(legado.itens[2].arte_url, arteA, 'Alias proprio do modelo preservado');
    assert.equal(legado.itens[2].verso_arte_url, aliases[2].verso_url_arquivo);
    const vinculada = await carregar(modelos, produtos, [
        {id_int: 12345, id_modelo: 503, versao: 1, url_arquivo: 'https://example.invalid/arte-vinculada.pdf'},
    ]);
    assert.equal(vinculada.itens[2].arte_url, 'https://example.invalid/arte-vinculada.pdf');
    assert.equal(vinculada.itens[3].arte_url, null, 'Vinculo de um modelo nao vaza para outro');
    console.log('OK: novos vazios; originais, colagens, aliases e vinculos individuais preservados; cache antigo ignorado; zero escritas.');
})().catch(e => { console.error(e); process.exitCode = 1; });
