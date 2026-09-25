// Exporta o multipart preparado pelo frontend real para o validador Python.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto').webcrypto;
const ctx = vm.createContext({ Blob, File, FormData, TextDecoder, crypto,
    structuredClone, AbortController, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/arte-de-impressao.js'), 'utf8'), ctx);
(async () => {
    const arte = new Blob(['%PDF-1.4\narte sintetica'], { type: 'application/pdf' });
    const modelos = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, id_int: 123,
        quantidade: 3, bloco: '1', arte_url: i === 1 ? null : 'https://synthetic.test/front',
        verso_arte_url: i === 2 ? null : 'https://synthetic.test/back', amostra_num_id: null }));
    const estado = { selectedOSItems: modelos.map(m => ({ osId: 'os', itemId: m.id })),
        osItens: { os: modelos.map(m => ({ ...m, qtd: 3 })) }, numeracoes: [],
        cores: [], bancosDoPedido: [], vinculosDeBanco: {} };
    const dados = { formato: {}, saida: {}, schema: 'multi_artes',
        multi_artes: modelos.map(m => ({ modelo: m.id, numeracao: null })) };
    const fd = new FormData(); fd.set('payload', JSON.stringify(dados));
    // Residuos da arte individual e alias antigo da montagem manual.
    fd.append('file', arte, 'individual.pdf');
    fd.append('file_verso', arte, 'individual-verso.pdf');
    fd.append('multi_artes_files', arte, 'alias.pdf');
    fd.append('ma_file_0', arte, 'modelo-1.pdf');
    ctx.fetch = async url => url.endsWith('/api/version')
        ? { ok: true, json: async () => ({ capabilities: ['integridade_impressao_v1'] }) }
        : { ok: true, blob: async () => arte };
    ctx.chamarBancosPedido = async () => ({ bancos: [], vinculos: [] });
    const cliente = { from() { return { select() { return this; }, in() { return this; },
        abortSignal: async () => ({ data: structuredClone(modelos), error: null }) }; } };
    await ctx.confirmarIntegridadeDoTrabalho(fd, 'http://localhost', estado, cliente);
    const arquivos = {};
    for (const [key, value] of fd) if (value instanceof Blob) {
        arquivos[key] = Buffer.from(await value.arrayBuffer()).toString('base64');
    }
    const resultado = { payload: JSON.parse(fd.get('payload')), arquivos };
    if (process.argv.includes('--json')) console.log(JSON.stringify(resultado));
    else {
        const enviadas = Object.keys(arquivos).sort();
        const declaradas = Object.keys(resultado.payload.integridade.arquivos).sort();
        if (JSON.stringify(enviadas) !== JSON.stringify(declaradas)) throw Error('Uploads diferem do manifesto');
        if (enviadas.includes('ma_file_1') || enviadas.includes('ma_verso_2')) throw Error('Face vazia recebeu arte');
        console.log('OK: cinco modelos, oito faces declaradas e nenhum upload residual');
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
