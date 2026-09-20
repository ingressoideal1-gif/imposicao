const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('frontend/supabase-config.js', 'utf8');
const codigo = fonte.slice(fonte.indexOf('async function requisitarPropostas'), fonte.indexOf('// ─── Toda chamada ao motor'));
function contexto({ token = 'jwt-sintetico', nuvem = true, operador = null, resposta } = {}) {
    const chamadas = [];
    const c = {
        API_PAINEL: 'https://exemplo.invalid/painel', SERVIDA_PELA_NUVEM: nuvem,
        window: { _acessoLocal: operador },
        supabaseClient: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } },
        fetch: async (url, opcoes) => {
            const corpo = JSON.parse(opcoes.body);
            chamadas.push({ url, ...opcoes, corpo });
            return resposta ? resposta(corpo, chamadas.length) : { ok: true, json: async () => [] };
        }
    };
    vm.createContext(c); vm.runInContext(codigo, c);
    return { c, chamadas };
}
async function main() {
    {
        const { c, chamadas } = contexto();
        await c.consultarPropostas({ tipo: 'lista' });
        assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-sintetico');
        assert.equal(chamadas[0].url, 'https://exemplo.invalid/painel/api/propostas/consultar');
        assert.equal(chamadas[0].headers.apikey, undefined);
    }
    {
        const { c, chamadas } = contexto({ token: null });
        const r = await c.consultarPropostas({ tipo: 'lista' });
        assert(r.error); assert.equal(r.data, null); assert.equal(chamadas.length, 0);
    }
    {
        const { c, chamadas } = contexto({ token: null, nuvem: false, operador: { codigo: 'ABC123' } });
        await c.consultarPropostas({ tipo: 'lista' });
        assert.equal(chamadas[0].url, '/api/propostas/consultar');
        assert.equal(chamadas[0].headers['X-Operador-Codigo'], 'ABC123');
        assert.equal(chamadas[0].headers['X-Agente-Segredo'], undefined);
    }
    {
        const { c, chamadas } = contexto({ token: null, nuvem: false });
        await assert.rejects(() => c.definirStatusProposta(11, 'EM PRODUCAO'));
        assert.equal(chamadas.length, 0);
    }
    {
        const { c, chamadas } = contexto({ resposta: corpo => ({ ok: true,
            json: async () => corpo.offset < 5 ? [{ id_int: corpo.offset + 1 }] : [] }) });
        const r = await c.consultarPropostas({ tipo: 'lista' });
        assert.equal(r.data.length, 5); assert.equal(chamadas.length, 6);
        // O servidor pode ter teto menor que a página solicitada: não truncar.
    }
    {
        const { c, chamadas } = contexto({ resposta: corpo => ({ ok: true,
            json: async () => corpo.offset === 0 ? corpo.numeros.map(id_int => ({ id_int })) : [] }) });
        const r = await c.consultarPropostas({ tipo: 'numeros', numeros: Array.from({ length: 401 }, (_, i) => i + 1) });
        assert.equal(r.data.length, 401);
        assert(chamadas.every(x => x.corpo.numeros.length <= 200));
    }
    {
        const { c, chamadas } = contexto({ resposta: (_corpo, n) => n === 1
            ? { ok: true, json: async () => [{ id_int: 11 }] }
            : { ok: false, json: async () => ({ detail: 'sem permissao' }) } });
        const r = await c.consultarPropostas({ tipo: 'lista' });
        assert.equal(r.data, null); assert(r.error); assert.equal(chamadas.length, 2);
    }
    {
        const { c } = contexto({ resposta: () => ({ ok: false, json: async () => ({ detail: 'gravacao nao confirmada' }) }) });
        await assert.rejects(() => c.definirStatusProposta(11, 'EM PRODUCAO'), /gravacao nao confirmada/);
    }
    {
        const { c, chamadas } = contexto();
        await c.requisitarFundo('remover');
        assert.equal(chamadas[0].url, 'https://exemplo.invalid/painel/api/fundo/remover');
        assert.equal(chamadas[0].headers.Authorization, 'Bearer jwt-sintetico');
    }
    {
        const { c, chamadas } = contexto({ token: null, nuvem: false, operador: { codigo: 'ABC123' } });
        await c.requisitarFundo('remover');
        assert.equal(chamadas[0].url, '/api/fundo/remover');
        assert.equal(chamadas[0].headers['X-Operador-Codigo'], 'ABC123');
    }
    {
        const { c, chamadas } = contexto({ token: null });
        await assert.rejects(() => c.requisitarFundo('remover'));
        assert.equal(chamadas.length, 0);
    }
    {
        const { c, chamadas } = contexto({ resposta: () => ({ ok: false, json: async () => ({ detail: 'sem permissao' }) }) });
        await assert.rejects(() => c.requisitarFundo('remover'), /sem permissao/);
        assert.equal(chamadas.length, 1);
    }
    {
        const { c, chamadas } = contexto({ resposta: corpo => ({ ok: true, json: async () =>
            corpo.offset === 0 ? corpo.numeros.map(id_int => ({ id_int, status: 'PAID' })) : [] }) });
        const resultado = await c.consultarPropostas({ tipo: 'numeros', numeros: Array.from({length: 401}, (_,i) => i+1) }, undefined, 'pagamentos');
        assert.equal(resultado.data.length, 401);
        assert(chamadas.every(x => x.url.endsWith('/api/propostas/pagamentos') && !('tipo' in x.corpo)));
        assert.equal(chamadas.length, 6);
    }
    {
        const { c, chamadas } = contexto();
        await c.requisitarPropostas('cadastro', { pedido: 11 });
        assert.equal(chamadas[0].url, 'https://exemplo.invalid/painel/api/propostas/cadastro');
        assert.equal(chamadas[0].corpo.pedido, 11);
    }
    console.log('14 cenarios do navegador passaram');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
