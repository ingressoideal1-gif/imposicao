import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../supabase/functions/idgen-interno/handler.ts';
const origin = 'https://imposicao.pages.dev';
function req(body, headers = {}, method = 'POST') {
    return new Request('https://example.invalid/functions/v1/idgen-interno', {
        method, headers: { origin, authorization: 'Bearer synthetic-token', 'content-type': 'application/json', ...headers },
        ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
}
test('identidade vem da sessão, não do corpo; erros mantêm CORS e no-store', async () => {
    const calls = [];
    const app = handler({ usuario: async () => 'verified-user', operar: async (...args) => { calls.push(args); return []; } });
    const res = await app(req({ acao: 'listar', dados: {}, p_usuario: 'attacker' }));
    assert.equal(res.status, 200); assert.deepEqual(calls, [['verified-user', 'listar', {}]]);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('origem, ausência de sessão, método e formato inválidos não chegam ao RPC', async () => {
    let calls = 0;
    const app = handler({ usuario: async () => 'u', operar: async () => { calls++; } });
    assert.equal((await app(req({}, { origin: 'https://evil.invalid' }))).status, 403);
    assert.equal((await app(req({}, { authorization: '' }))).status, 401);
    assert.equal((await app(req({}, {}, 'GET'))).status, 405);
    assert.equal((await app(req({}, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await app(req('{'))).status, 400);
    assert.equal((await app(req({ acao: 'apagar', dados: {} }))).status, 400);
    assert.equal(calls, 0);
});
test('papel negado, conflito e sessão vencida têm respostas distintas sem detalhes internos', async () => {
    for (const [code, status] of [['42501', 403], ['40001', 409], ['P0002', 404], ['XX000', 502], ['AUTH', 401]]) {
        const app = handler({ usuario: async () => 'u', operar: async () => { throw Object.assign(new Error('SEGREDO-SINTETICO'), { code }); } });
        const res = await app(req({ acao: 'listar', dados: {} }));
        assert.equal(res.status, status); assert.ok(!(await res.text()).includes('SEGREDO-SINTETICO'));
    }
});
test('preflight permite Authorization; corpo grande é recusado antes do RPC', async () => {
    let calls = 0;
    const app = handler({ usuario: async () => 'u', operar: async () => { calls++; } });
    const preflight = await app(req({}, {}, 'OPTIONS'));
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
    const res = await app(req(' '.repeat(16777217)));
    assert.equal(res.status, 413); assert.equal(calls, 0);
});
