const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
    const elements = new Map();
    const requests = [];
    const context = { console, API_BASE_URL: 'http://localhost:9000',
        window: { addEventListener: () => {} }, sessionStorage: { getItem: () => null, removeItem: () => {} },
        document: { getElementById: name => elements.get(name) },
        fetch: async (url, options = {}) => {
            requests.push({ url, options });
            return { ok: true, json: async () => ({ version: 'NewProd 1.2.351' }) };
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('frontend/acesso-estacao.js', 'utf8'), context);
    context.mostrarLoginLocal = () => {
        elements.set('auth-erro-local', { style: {} });
        elements.set('btn-auth-local', {});
    };
    let unlocked = false;
    await context.iniciarAcessoLocal(() => { unlocked = true; });
    assert.equal(unlocked, false);
    assert.equal(elements.get('btn-auth-local').type, 'button');
    await elements.get('btn-auth-local').onclick();
    assert.ok(requests.some(r => r.url.endsWith('/api/update') && r.options.method === 'POST'));
    assert.ok(!requests.some(r => r.url.endsWith('/api/local/login')));
    assert.equal(unlocked, false);
    context.fetch = async () => ({ ok: false });
    await elements.get('btn-auth-local').onclick();
    assert.equal(elements.get('btn-auth-local').disabled, false);
    assert.match(elements.get('auth-erro-local').textContent, /ociosa/);
    console.log('Upgrade da estacao: login antigo bloqueado, atualizacao acionavel e erro recuperavel.');
})().catch(e => { console.error(e); process.exitCode = 1; });
