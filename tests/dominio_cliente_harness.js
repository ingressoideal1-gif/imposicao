// Regressao: painel local/legado deve compartilhar o dominio publico novo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.indexOf(`async function ${name}(`);
    assert(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const base = source.match(/const CLIENTE_BASE_URL = '[^']+';/)[0];
(async () => {
    for (const origin of ['https://ideal-imposition.vercel.app', 'http://127.0.0.1:9000', 'https://imposition.ai-ideal.com.br']) {
        for (const existing of [true, false]) {
            const row = { id: 1, os_id: 'teste', numero_pedido: '900', token: 'abc123' };
            const query = {
                select() { return this; },
                eq() { return this; },
                update() { return this; },
                insert(value) { assert.equal(value.token, 'abc123'); return this; },
                maybeSingle() { return { data: existing ? row : null }; },
                then(resolve) { resolve({ data: [row] }); },
            };
            const ctx = vm.createContext({
                window: { location: { origin } }, console,
                state: { ordens: [] },
                supabaseClient: { from: () => query },
                temSessaoDoSupabase: async () => true,
                garantirLinhaDePedidoArte: async () => {},
                generateClientToken: () => 'abc123',
            });
            vm.runInContext(base + '\n' + extract('carregarLinksExistentes') + '\n' + extract('getOrCreateLinkCliente'), ctx);
            const expected = 'https://imposition.ai-ideal.com.br/cliente/900-abc123';
            await ctx.carregarLinksExistentes();
            assert.equal(ctx.state.linksCliente.teste, expected);
            assert.equal(await ctx.getOrCreateLinkCliente('teste', '900'), expected);
            ctx.supabaseClient = null;
            assert.equal(await ctx.getOrCreateLinkCliente('teste', '900'), null);
        }
    }
    console.log('OK: dominio publico, tokens existentes/novos e ausencia de conexao');
})().catch(error => { console.error(error); process.exitCode = 1; });
