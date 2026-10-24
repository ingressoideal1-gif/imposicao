const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fonte = '/* Barreira de novos trabalhos.' + fs.readFileSync('frontend/acesso-estacao.js', 'utf8').split('/* Barreira de novos trabalhos.')[1];
function contexto(versao) {
    const chamadas = [];
    const c = { URL, Response, Request, location: new URL('http://127.0.0.1:9001/app/'),
        fetch: async (url, opcoes) => {
            chamadas.push(String(url));
            return String(url).endsWith('/api/version') ? Response.json({version:versao}) : Response.json({ok:true});
        } };
    vm.createContext(c); vm.runInContext(fonte, c);
    return { c, chamadas };
}
(async () => {
    for (const v of ['NewProd 1.3.35', '', '1.3.999']) {
        const {c,chamadas} = contexto(v);
        for (const rota of ['/api/impose','/api/print/submit','/api/pacotes-locais/abrir-pedido-painel']) {
            const r = await c.fetch(rota,{method:'POST'});
            assert.equal(r.status,426); assert.match((await r.json()).detail,/1.4.0/);
        }
        assert(chamadas.every(x=>x.endsWith('/api/version')));
        assert.equal((await c.fetch('/api/update',{method:'POST'})).status,200);
        assert.equal((await c.fetch('/api/pacotes-locais/confirmar-impressao-painel',{method:'POST'})).status,200);
    }
    for (const v of ['NewProd 1.4.0','1.4.1','2.0.0','1.4.0-piloto-local.30']) {
        const {c,chamadas} = contexto(v);
        assert.equal((await c.fetch('/api/impose',{method:'POST'})).status,200);
        assert.equal(chamadas.length,2);
    }
    const {c,chamadas}=contexto('1.3.9');
    await c.fetch('https://negocio.invalid/api/impose',{method:'POST'});
    await c.fetch('/api/print/submit',{method:'GET'});
    assert.equal(chamadas.length,2);
    console.log('Versao minima: barreira, recuperacao, conclusao e isolamento OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
