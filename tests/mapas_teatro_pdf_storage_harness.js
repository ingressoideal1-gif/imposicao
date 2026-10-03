// Cliente de persistência real; HTTP e sessão simulados, sem qualquer rede.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fonte = fs.readFileSync(path.join(__dirname, '../frontend/mapas-teatro-pdf-storage.js'), 'utf8');
const rev = 'a'.repeat(64);
const mapa = { id: 'mapa-sintetico', config: { setores: [{ id: 's1', nome: 'Plateia' }] } };
const pdf = { revisao: rev, total: 1, bytes: new Uint8Array([1, 2]), arquivos: [{ quantidade: 1, bytes: new Uint8Array([3, 4]) }] };
function montar() {
    const chamadas = []; let salvo = null, falhar = false, session = true;
    const c = { FormData, Blob, URLSearchParams, AbortController, setTimeout, clearTimeout, crypto: webcrypto,
        VIBECODE_SUPABASE_URL: 'https://projeto.invalid', supabaseClient: { auth: { async getSession() {
            return { data: { session: session ? { access_token: 'token-sintetico' } : null } };
        } } }, async fetch(url, opts) {
            assert.equal(opts.headers.Authorization, 'Bearer token-sintetico'); chamadas.push(opts.method);
            if (falhar && opts.method === 'POST') return Response.json({ detail: 'Upload interrompido' }, { status: 502 });
            if (opts.method === 'POST') {
                const form = opts.body;
                assert.equal(form.get('revisao_exportacao'), rev);
                const arquivos = JSON.parse(form.get('manifesto'));
                assert.equal(arquivos.length, 2);
                assert.equal(form.get('pdf_0').type, 'application/pdf');
                assert.equal(form.get('pdf_1').size, 2);
                for (const a of arquivos) a.pdf_recurso = url.replace('/exportacao?', '/arquivo?') + (a.setor_id ? '&setor=' + a.setor_id : '');
                salvo = { mapa_id: mapa.id, revisao_exportacao: rev, gerador_versao: form.get('gerador_versao'), estado: 'pronto', arquivos };
            }
            return Response.json(salvo || { mapa_id: mapa.id, revisao_exportacao: rev, gerador_versao: 'a3-v1-20261003', estado: 'pendente', arquivos: [] });
        } };
    c.window = c; vm.createContext(c); vm.runInContext(fonte, c);
    return { api: c.MapasTeatroPdfStorage, chamadas, semSessao() { session = false; }, falhar(v) { falhar = v; }, salvo() { return salvo; } };
}
(async () => {
    let n = 0;
    const a = montar(); a.semSessao();
    await assert.rejects(() => a.api.persistir(mapa, pdf), /Entre na sua conta/); assert.deepEqual(a.chamadas, []); n++;
    const b = montar();
    assert.equal((await b.api.consultar(mapa, pdf)).estado, 'pendente'); assert.deepEqual(b.chamadas, ['GET']); n++;
    const c = montar();
    const resultados = await Promise.all([c.api.persistir(mapa, pdf), c.api.persistir(mapa, pdf)]);
    assert.equal(resultados[0].estado, 'pronto'); assert.deepEqual(c.chamadas, ['GET', 'POST']); n++;
    await c.api.persistir(mapa, pdf); assert.deepEqual(c.chamadas, ['GET', 'POST', 'GET']); n++;
    const d = montar(); d.falhar(true);
    await assert.rejects(() => d.api.persistir(mapa, pdf), /Upload interrompido/);
    d.falhar(false); assert.equal((await d.api.persistir(mapa, pdf)).estado, 'pronto'); assert.deepEqual(d.chamadas, ['GET', 'POST', 'GET', 'POST']); n++;
    d.salvo().arquivos[1].setor_id = 'outro-setor';
    await assert.rejects(() => d.api.consultar(mapa, pdf), /não conferem/); n++;
    const e = montar();
    await assert.rejects(() => e.api.persistir({ id: mapa.id, config: { setores: [{ nome: 'Sem ID' }] } }, pdf), /identificadores/);
    assert.deepEqual(e.chamadas, []); n++;
    const f = montar(); await f.api.persistir(mapa, pdf); f.salvo().revisao_atual = false;
    await assert.rejects(() => f.api.persistir(mapa, pdf), /alterado durante a consulta/); assert.equal(f.chamadas.filter(x => x === 'POST').length, 1); n++;
    console.log('OK: ' + n + ' verificações do armazenamento de PDFs, sem rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
