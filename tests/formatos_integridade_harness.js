'use strict';
// Dados sintéticos; nenhuma dependência externa, banco, agente ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const read = file => (baseline ? execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    : fs.readFileSync(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
const source = read('frontend/script.js');
function extract(source, name) {
    const m = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    assert(m, name);
    return source.slice(m.index, source.indexOf('\n}', m.index) + 2);
}
const plain = value => JSON.parse(JSON.stringify(value));
function context(names, values = {}, text = source) {
    const ctx = { console: { error() {}, warn() {}, log() {} }, ...values };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(names.map(n => extract(text, n)).join('\n'), ctx);
    return ctx;
}
const format = {
    id: 'f1', id_formato_num: 77, created_at: '2026-01-01', name: 'Sintético',
    width_mm: 100, height_mm: 50, cols: 2, rows: 5, gap_h_mm: 3, gap_v_mm: 2,
    offset_h_mm: -2, offset_v_mm: 0, rotations: { 0: 180, page_rotate: 270 },
    default_schema: 'cut_stack', default_saida_id: 's1', default_cut_stack_mode: 'strict_assembly',
    default_sheets_per_block: 25, default_block_depth: 3, default_rotate_page: true,
    has_cover: true, cover_scale: 70, cover_offset_x: -3, cover_offset_y: 0,
    cover_font_size: 18, cover_font_color: '#123456', cover_font_x: 0, cover_font_y: 0,
};
let count = 0;
async function test(name, run) { await run(); count++; console.log('OK:', name); }
function apiContext(options = {}) {
    const calls = [];
    let row = { ...format };
    const client = { from(table) {
        let action = 'read', payload, id;
        return {
            insert(rows) { action = 'insert'; payload = rows[0]; return this; },
            update(value) { action = 'update'; payload = value; return this; },
            select() { return this; }, eq(field, value) { id = value; return this; },
            async single() {
                calls.push({ action, table, id, payload });
                if (action === 'read') {
                    if (options.readError) throw Error('releitura indisponível');
                    return { data: options.readRow ? options.readRow(row) : row, error: null };
                }
                if (options.writeError) return { data: null, error: { message: options.writeError } };
                if (options.empty) return { data: null, error: null };
                row = { ...row, ...payload, id: id || payload.id };
                return { data: options.wrongId ? { ...row, id: 'outra' } : row, error: null };
            },
        };
    } };
    const ctx = context(['api', 'apiSemConfirmacao', 'valorDoFormatoConfere'], {
        supabaseClient: client, crypto: { randomUUID: () => 'new-id' },
        fetch: async () => { throw Error('Rede proibida'); },
    });
    return { ctx, calls };
}
(async () => {
    await test('duplicar preserva toda a configuração, inclusive zeros, sem copiar identidade ERP', async () => {
        let clone;
        const ctx = context(['duplicateFmt'], { state: { formatos: [format] },
            api: async (method, url, value) => { clone = plain(value); }, toast() {}, loadAll: async () => {} });
        await ctx.duplicateFmt('f1');
        const { id, id_formato_num, created_at, ...expected } = format;
        assert.deepEqual(clone, { ...expected, name: format.name + ' (cópia)' });
    });
    await test('criar e editar confirmam retorno e releitura, tolerando decimal serializado como texto', async () => {
        for (const method of ['POST', 'PUT']) {
            const { ctx, calls } = apiContext({ readRow: row => ({ ...row, width_mm: String(row.width_mm), rotations: { page_rotate: 270, 0: 180 } }) });
            const payload = { width_mm: 110, rotations: { 0: 180, page_rotate: 270 }, cover_font_x: 0 };
            await ctx.api(method, method === 'POST' ? '/formatos' : '/formatos/f1', payload);
            assert.equal(calls.length, 2);
            assert.equal(calls[1].action, 'read');
        }
    });
    for (const method of ['POST', 'PUT']) {
        await test(method + ': resposta vazia ou de outra linha nunca confirma salvamento', async () => {
            for (const options of [{ empty: true }, { wrongId: true }]) {
                const { ctx, calls } = apiContext(options);
                await assert.rejects(() => ctx.api(method, method === 'POST' ? '/formatos' : '/formatos/f1', { name: 'Novo' }), /Nenhum cadastro/);
                assert.equal(calls.length, 1);
            }
        });
        await test(method + ': coluna ausente falha sem repetir escrita descartando o campo', async () => {
            const { ctx, calls } = apiContext({ writeError: "Could not find the 'has_cover' column" });
            await assert.rejects(() => ctx.api(method, method === 'POST' ? '/formatos' : '/formatos/f1', { has_cover: true }), /has_cover/);
            assert.equal(calls.length, 1);
        });
    }
    await test('releitura divergente ou indisponível impede confirmação', async () => {
        for (const options of [{ readRow: r => ({ ...r, name: 'antigo' }) }, { readRow: () => null }, { readError: true }]) {
            const { ctx } = apiContext(options);
            await assert.rejects(() => ctx.api('PUT', '/formatos/f1', { name: 'Novo' }));
        }
    });
    await test('API local também exige releitura do conteúdo', async () => {
        const calls = [];
        const ctx = context(['api', 'apiSemConfirmacao', 'valorDoFormatoConfere'], {
            fetch: async (url, opts) => { calls.push([url, opts.method]); return { ok: true, json: async () => opts.method === 'POST' ? { id: 'f1' } : { ...format, name: 'Novo' } }; },
        });
        await ctx.api('POST', '/formatos', { name: 'Novo' });
        assert.deepEqual(calls, [['/api/formatos', 'POST'], ['/api/formatos/f1', 'GET']]);
        await assert.rejects(() => ctx.api('PUT', '/formatos/f1', { name: 'Diferente' }), /name/);
    });
    const state = { formatos: [format, { ...format, id: 'f2', id_formato_num: 88, default_saida_id: 's2' }],
        produtosGlobais: [{ id_produto: 9, id_formato: 77 }], cores: [] };
    const resolver = context(['formatoDoProduto', 'formatoDoModelo', 'prepararFormatosDaFila'], { state });
    await test('redesenhar fila preserva escolha, completa ausentes com a saída do próprio formato e é idempotente', () => {
        const itens = [{ formato_id: 'f2', saida_id: 'manual' }, { formato_id: 'f2' }, {}];
        assert.equal(resolver.prepararFormatosDaFila(itens, 'f1', false), '');
        assert.deepEqual(itens, [{ formato_id: 'f2', saida_id: 'manual' }, { formato_id: 'f2', saida_id: 's2' }, { formato_id: 'f1', saida_id: 's1' }]);
        const before = structuredClone(itens);
        resolver.prepararFormatosDaFila(itens, 'f1', false);
        assert.deepEqual(itens, before);
        const readonly = [{}]; resolver.prepararFormatosDaFila(readonly, 'f1', true);
        assert.deepEqual(readonly, [{}]);
    });
    await test('formato por cor, numeração, modelo e ERP; vínculo inválido nunca usa primeiro catálogo', () => {
        assert.equal(resolver.formatoDoModelo({ formato_id: 'f1' }, { formato_id: 'f2' }, { formato_id: 'f1' }).id, 'f2');
        assert.equal(resolver.formatoDoModelo({ formato_id: 'f1' }, null, { formato_id: 'f2' }).id, 'f2');
        assert.equal(resolver.formatoDoModelo({ formato_id: 'f2', _vibe_id_produto: 9 }).id, 'f2');
        assert.equal(resolver.formatoDoModelo({ _vibe_id_produto: 9 }).id, 'f1');
        for (const item of [{}, { formato_id: 'ausente', _vibe_id_produto: 9 }]) assert.equal(resolver.formatoDoModelo(item), null);
        assert.equal(resolver.formatoDoModelo({ formato_id: 'f1' }, { formato_id: 'ausente' }), null);
    });
    await test('portal usa a mesma prioridade e não inventa dimensões', () => {
        const portal = context(['formatoDaAmostraPdfNoPortal'], { state }, read('frontend/cliente.js'));
        for (const [item, cor, num] of [[{}, null, null], [{ _vibe_id_produto: 9 }, null, null],
            [{ formato_id: 'f1' }, { formato_id: 'f2' }, { formato_id: 'f1' }],
            [{ formato_id: 'f1' }, { formato_id: 'ausente' }, null]]) {
            assert.equal(portal.formatoDaAmostraPdfNoPortal(item, num, cor)?.id, resolver.formatoDoModelo(item, cor, num)?.id);
        }
    });
    await test('abrir modelo sem formato limpa controles anteriores e marca erro antes de agendar a impressão', async () => {
        const fields = Object.fromEntries(['imp', 'ped'].flatMap(p => ['formato', 'saida', 'numeracao', 'numeracao-2'].map(k => [p + '-' + k, { value: 'anterior' }])));
        const ctx = context(['enviarParaImposicao', 'carregarModeloParaImposicao', 'formatoDoModelo', 'formatoDoProduto'], {
            state: { ...state, osItens: { os: [{ id: 1 }] } },
            document: { getElementById: id => fields[id] || null },
            recarregarNumeracoesDoPedido: async () => {}, limparPreviaEnquantoCarrega() {},
            setTimeout() { throw Error('Não pode agendar trabalho sem formato'); },
        });
        await assert.rejects(() => ctx.enviarParaImposicao(1, 'os', false), /sem formato válido/);
        assert.match(ctx.state.imposicaoSelecaoErro, /sem formato válido/);
        assert.equal(ctx.state.imposicaoSelecaoCarregando, null);
        for (const value of Object.values(fields)) assert.equal(value.value, '');
    });
    await test('todos os caminhos corrigidos recusam o primeiro formato e a medida arbitrária', () => {
        for (const file of ['frontend/script.js', 'frontend/cliente.js', 'frontend/criador-arte.js']) {
            assert(!read(file).includes('state.formatos[0]'), file);
            assert(!read(file).includes('{ width_mm: 180, height_mm: 50 }'), file);
        }
    });
    await test('as três exportações interrompem o PDF e liberam o botão quando falta formato', async () => {
        for (const name of ['exportarPdfModelos', 'exportarPdfSomenteArte', 'exportarPdfGabarito']) {
            const messages = [], button = { innerHTML: 'Exportar', disabled: false };
            const ctx = context([name, 'formatoDoModelo', 'formatoDoProduto'], {
                state: { ...state, amostrasOSAtivo: 'os', ordens: [], osItens: { os: [{ id: 1 }] } },
                document: { getElementById: id => id.startsWith('btn-export') ? button : id === 'amostra-item-canvas-0' ? { style: {} } : null,
                    createElement() { throw Error('Não pode iniciar download'); } },
                prepararTelaParaOPdfProva: async () => [],
                PDFLib: { PDFDocument: { create: async () => ({}) } }, jspdf: {},
                toast: (message, type) => messages.push({ message, type }),
            });
            await ctx[name]();
            assert(messages.some(m => m.type === 'error' && m.message.includes('sem formato válido')), name);
            assert.equal(button.disabled, false);
            assert.equal(button.innerHTML, 'Exportar');
        }
    });
    await test('amostra composta sem formato falha antes de desenhar ou salvar uma imagem', async () => {
        const ctx = context(['regenerarAmostraDoModelo', 'formatoDoModelo', 'formatoDoProduto'], {
            state: { ...state, cores: [{ id: 'c', formato_id: 'ausente' }] },
            aplicarRegraProdutoPrateleira: () => false, resolveItemCorNumIds() {},
            resolverNumeracaoParaModelo: n => n,
            document: { createElement() { throw Error('Não pode desenhar com formato arbitrário'); } },
        });
        await assert.rejects(() => ctx.regenerarAmostraDoModelo('os', { id: 1, amostra_cor_id: 'c' }, 0, 1), /sem formato válido/);
    });
    console.log(`${count} cenários passaram.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
