const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/montagem.js'), 'utf8');
const start = src.indexOf('async function _mtgEstacao()');
const fn = src.slice(start, src.indexOf('\n}', start) + 2);
async function check(url, replies, expected, calls) {
    const seen = [];
    const ctx = { window: { location: new URL(url) }, AbortSignal,
        fetch: async url => {
            seen.push(url);
            const reply = replies[url];
            if (!reply) throw Error('unavailable');
            return { ok: reply.ok !== false, json: async () => reply };
        } };
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);
    assert.equal(await ctx._mtgEstacao(), expected);
    assert.deepEqual(seen, calls);
}
(async () => {
    const pilot = 'http://127.0.0.1:9001';
    const old = 'http://127.0.0.1:9000';
    const online = 'https://example.test/app';
    const good = {version:'NewProd 1.2.397', onde:'local'};
    await check(pilot+'/app/', {[pilot+'/api/status']:good}, pilot, [pilot+'/api/status']);
    await check(pilot+'/app/', {[old+'/api/status']:good}, null, [pilot+'/api/status']);
    await check(old+'/app/', {[old+'/api/status']:good}, old, [old+'/api/status']);
    await check(online, {[pilot+'/api/status']:good}, pilot, [pilot+'/api/status']);
    await check(online, {[pilot+'/api/status']:{version:'cloud',onde:'nuvem'},[old+'/api/status']:good}, old,
        [pilot+'/api/status','http://localhost:8080/api/status',old+'/api/status']);
    await check(pilot+'/app/', {[pilot+'/api/status']:{status:'running'}}, null, [pilot+'/api/status']);
    console.log('OK: 6 cenarios da deteccao de estacao na Montagem.');
})().catch(e => {console.error(e);process.exitCode=1;});
