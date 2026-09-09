// Dados sintéticos. Não consulta Supabase nem grava pedidos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'frontend', name), 'utf8');
function contexto() {
    const ctx = { console, setTimeout, clearTimeout, Map, Promise };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('banco-do-modelo.js'), ctx);
    vm.runInContext(read('cliente-bancos.js'), ctx);
    return ctx;
}
const banco = { id: 'b1', csv_headers: ['nome', 'setor'], csv_data:
    Array.from({ length: 6 }, (_, i) => ({ __id: i + 1, nome: 'Pessoa ' + i, setor: i < 4 ? 'A' : '' })) };
const resposta = () => ({ versao: 1, numero_pedido: '123', modelos: [
    { modelo_id: '501', banco, csv_mapa: { 'el:texto': 'nome' } },
    { modelo_id: '502', banco, csv_mapa: { 'el:texto': 'setor' } },
    { modelo_id: '503', banco: null, csv_mapa: null }
] });
const num = { id: 'n1', csv_data: null, elements: [{ id: 'texto', type: 'TEXT', source: 'database' }] };
const a = { id: 501 }, b = { id: 502 };
(async () => {
    const c = contexto(), p = c.PortalBancos;
    await p.carregar('123', 'sintetico', async () => resposta());
    const na = p.resolver(a, num), nb = p.resolver(b, num);
    assert.equal(na.csv_data.length, 6);
    assert.equal(na.elements[0].csv_column, 'nome');
    assert.equal(nb.elements[0].csv_column, 'setor');
    assert.equal(num.csv_data, null, 'catálogo preservado');
    assert.equal(num.elements[0].csv_column, undefined);
    assert.equal(p.resolver(a, num), na, 'referência estável por modelo');
    assert.notEqual(na, nb, 'modelos isolados');
    assert.equal(p.resolver({ id: 503 }, num), num, 'legado conserva referência');
    assert.equal(p.problema(a, num), '');
    assert.ok(p.problema({ id: 999 }, num), 'modelo não autorizado');
    const semColuna = { ...num, elements: [{ id: 'desconhecido', source: 'database' }] };
    assert.ok(p.problema(a, semColuna), 'mapa incompleto bloqueia conferência');
    await p.carregar('123', 'sintetico', async () => { throw Error('rede'); });
    assert.ok(p.problema(a, num), 'erro não vira ausência de vínculo');
    assert.equal(p.resolver(a, num), null);
    await p.carregar('123', 'sintetico', async () => resposta());
    assert.equal(p.problema(a, num), '', 'nova tentativa recupera');
    let resolverAntiga;
    const antiga = p.carregar('123', 'sintetico', () => new Promise(r => { resolverAntiga = r; }));
    await p.carregar('456', 'sintetico', async () => ({ ...resposta(), numero_pedido: '456' }));
    resolverAntiga(resposta()); await antiga;
    assert.equal(p.numero(), '456', 'resposta atrasada não troca o pedido');
    await p.carregar('123', 'sintetico', async () => ({ ...resposta(), numero_pedido: '999' }));
    assert.ok(p.problema(a, num), 'resposta de outro pedido recusada');
    await p.carregar('123', 'sintetico', async () => ({ ...resposta(), modelos: [resposta().modelos[0], resposta().modelos[0]] }));
    assert.ok(p.problema(a, num), 'identidade duplicada recusada');
    await p.carregar('123', 'sintetico', async () => ({ ...resposta(), modelos: [{ modelo_id: '501', erro: 'vinculo_invalido' }] }));
    assert.ok(p.problema(a, num));
    await p.carregar('123', 'sintetico', async () => ({ ...resposta(), modelos: [{ modelo_id: '501', banco: { ...banco, csv_data: [] }, csv_mapa: { 'el:texto': 'nome' } }] }));
    assert.ok(p.problema(a, num), 'banco vazio explícito');
    await p.carregar('123', 'sintetico', async () => ({ ...resposta(), banco_comercial: false, modelos: [] }));
    assert.equal(p.resolver(a, num), num, 'OS local não recebe banco comercial');
    assert.equal(p.problema(a, num), '');
    let chamadas = 0;
    await p.carregar('123', '', async () => { chamadas++; return resposta(); });
    assert.equal(chamadas, 0, 'token vazio não consulta');
    assert.ok(p.problema(a, num));
    vm.runInContext(read('cliente-dados.js'), c);
    c.supabaseClient = { rpc: async (nome, params) => {
        assert.equal(nome, 'link_cliente_bancos_modelos');
        assert.equal(params.p_numero, '123'); assert.equal(params.p_token, 'sintetico');
        return { data: resposta() };
    } };
    assert.equal((await c.carregarBancosDoPortal(123, 'sintetico')).versao, 1);
    c.supabaseClient.rpc = async () => ({ error: { message: 'rede' } });
    await assert.rejects(c.carregarBancosDoPortal('123', 'sintetico'));
    console.log('OK: bancos por modelo, legado, mapa, erro, nova tentativa, identidade e concorrência.');
})().catch(e => { console.error(e); process.exitCode = 1; });
