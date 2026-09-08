// Somente dados sintéticos e serviços simulados. Nenhuma conexão com Supabase.
// Aceita uma cópia anterior de script.js para reproduzir as regressões.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const fonte = fs.readFileSync(process.argv[2] || path.join(__dirname, '../frontend/script.js'), 'utf8');
const OS = 'vibe_987654';
const NUMERO = '987654';
const URL_LINK = 'https://painel.example/cliente/987654-abc123';
const registro = () => ({ id: 'id-sintetico', os_id: OS, numero_pedido: NUMERO,
    token: 'abc123', ativo: true, status_arte: 'Aguard. Aprovação',
    arte_pronta_em: '2026-09-01', cliente_abriu_em: '2026-09-02' });

function extrair(nome) {
    const inicio = fonte.search(new RegExp('(?:async )?function ' + nome + '\\('));
    if (inicio < 0) return '';
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}

function montar(opcoes = {}) {
    const log = { mensagens: [], copias: [], manuais: [], queries: [], preparo: 0,
        snapshots: 0, overrides: [], popup: 0, recargas: 0, erp: 0, removidos: 0 };
    const fila = [...(opcoes.respostas || [])];
    const state = { ordens: [{ id: OS, numero: NUMERO, status: 'Aguard. Aprovação' }],
        linksCliente: { [OS]: URL_LINK }, linksClienteData: { [OS]: registro() } };
    const executar = async (q) => {
        log.queries.push(q);
        const resposta = fila.length ? fila.shift() : { data: registro(), error: null };
        if (typeof resposta === 'function') return resposta(q);
        return resposta;
    };
    const banco = { from(tabela) {
        const q = { tabela, acao: 'select', filtros: [] };
        const builder = {
            select(colunas) { q.colunas = colunas; return this; },
            eq(chave, valor) { q.filtros.push([chave, valor]); return this; },
            insert(dados) { q.acao = 'insert'; q.dados = dados; return this; },
            update(dados) { q.acao = 'update'; q.dados = dados; return this; },
            maybeSingle() { return executar(q); },
            single() { return executar(q); },
            then(resolve, reject) { return executar(q).then(resolve, reject); }
        };
        return builder;
    } };
    const elemento = () => ({ style: {}, value: '', focus() {}, select() {},
        setSelectionRange() {}, remove() { log.removidos++; } });
    const ctx = vm.createContext({
        CLIENTE_BASE_URL: 'https://painel.example', state, supabaseClient: banco, console: { log() {}, warn() {}, error() {} },
        window: { location: { origin: 'https://painel.example' },
            prompt: (_msg, texto) => { log.manuais.push(texto); return null; } },
        navigator: opcoes.semClipboard ? {} : { clipboard: { writeText: async texto => {
            if (opcoes.clipboardFalha) throw new Error('NotAllowedError');
            log.copias.push(texto);
        } } },
        document: { activeElement: { focus() {} }, querySelector: () => null,
            createElement: elemento, body: { appendChild() {}, removeChild() {} },
            getElementById: () => ({ textContent: URL_LINK }),
            execCommand: () => {
                if (opcoes.execLanca) throw new Error('cópia indisponível');
                return opcoes.execCopia === true;
            } },
        toast: (texto, tipo) => log.mensagens.push({ texto, tipo }),
        generateClientToken: () => 'novo123',
        garantirLinhaDePedidoArte: async () => true,
        forceRegenerateSnapshots: async () => { log.snapshots++; return { gerados: 1, falhas: [] }; },
        marcarEstagioDaArteNoErp: async () => { log.erp++; },
        gravarStatusOverride: (...args) => log.overrides.push(args),
        _mostrarIconeEmailNaLinha: () => { log.popup++; },
        loadOrdens: async () => { log.recargas++; },
        linksClienteEmAndamento: new Set()
    });
    for (const nome of ['buscarLinkClienteAtivo', 'memorizarLinkCliente', 'getOrCreateLinkCliente',
        'prepararLinkDaArtePronta', 'copiarTextoDoLinkCliente', 'gerarLinkCliente', 'copiarLinkClienteModal']) {
        vm.runInContext(extrair(nome), ctx);
    }
    if (!opcoes.preparoReal) ctx.prepararLinkDaArtePronta = async () => {
        log.preparo++;
        return opcoes.preparo || { ok: true, link: URL_LINK, falhas: [] };
    };
    return { ctx, log, state };
}

const casos = [];
function teste(nome, fn) { casos.push([nome, fn]); }

teste('copiar link existente preserva aprovação e abertura, sem regenerar nem gravar', async () => {
    const { ctx, log, state } = montar();
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.deepEqual(log.copias, [URL_LINK]);
    assert.equal(log.preparo, 0);
    assert.equal(log.overrides.length, 0);
    assert.equal(state.ordens[0].status, 'Aguard. Aprovação');
    assert.equal(state.linksClienteData[OS].cliente_abriu_em, '2026-09-02');
    assert.ok(log.queries.every(q => q.acao === 'select'));
    assert.equal(log.recargas, 0);
});

teste('nunca copia endereço sem token quando a preparação não confirma o link', async () => {
    const { ctx, log } = montar({ respostas: [{ data: null }], preparo: { ok: true, link: null } });
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.equal(log.copias.length, 0);
    assert.equal(log.overrides.length, 0);
    assert.ok(log.mensagens.some(m => m.tipo === 'error'));
});

teste('execCommand false não anuncia sucesso e oferece cópia manual', async () => {
    const { ctx, log } = montar({ clipboardFalha: true });
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.ok(!log.mensagens.some(m => m.tipo === 'success'));
    assert.equal(log.popup, 0);
    assert.deepEqual(log.manuais, [URL_LINK]);
});

teste('HTTP sem clipboard usa alternativa com confirmação', async () => {
    const { ctx, log } = montar({ semClipboard: true, execCopia: true });
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.ok(log.mensagens.some(m => m.tipo === 'success'));
    assert.equal(log.manuais.length, 0);
    assert.equal(log.removidos, 1);
});

teste('erro nas duas APIs de cópia mantém acesso manual ao link', async () => {
    const { ctx, log } = montar({ semClipboard: true, execLanca: true });
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.deepEqual(log.manuais, [URL_LINK]);
    assert.equal(log.removidos, 1);
});

teste('cópia no modal também trata clipboard negado', async () => {
    const { ctx, log } = montar({ clipboardFalha: true });
    await ctx.copiarLinkClienteModal();
    assert.deepEqual(log.manuais, [URL_LINK]);
    assert.ok(!log.mensagens.some(m => m.tipo === 'success'));
});

teste('clique duplo consulta e copia uma vez, com botão ocupado e restaurado', async () => {
    let liberar;
    const espera = new Promise(resolve => { liberar = resolve; });
    const { ctx, log } = montar({ respostas: [() => espera] });
    const botao = { disabled: false, textContent: 'Copiar Link' };
    const primeira = ctx.gerarLinkCliente(OS, NUMERO, false, botao);
    assert.equal(botao.disabled, true);
    await ctx.gerarLinkCliente(OS, NUMERO);
    liberar({ data: registro() });
    await primeira;
    assert.equal(log.queries.length, 1);
    assert.equal(log.copias.length, 1);
    assert.equal(botao.disabled, false);
    assert.equal(botao.textContent, 'Copiar Link');
});

teste('erro de rede libera botão e permite tentar de novo sem usar cache antigo', async () => {
    const { ctx, log } = montar({ respostas: [{ error: { message: 'rede indisponível' } }] });
    const botao = { textContent: 'Copiar Link', disabled: false };
    await ctx.gerarLinkCliente(OS, NUMERO, false, botao);
    assert.equal(botao.disabled, false);
    assert.equal(log.copias.length, 0);
    assert.equal(log.preparo, 0);
    await ctx.gerarLinkCliente(OS, NUMERO, false, botao);
    assert.deepEqual(log.copias, [URL_LINK]);
});

teste('reenviar explicitamente prepara a nova versão antes de copiar', async () => {
    const { ctx, log } = montar();
    await ctx.gerarLinkCliente(OS, NUMERO, true);
    assert.equal(log.preparo, 1);
    assert.deepEqual(log.copias, [URL_LINK]);
    assert.equal(log.overrides.length, 1);
});

teste('primeira geração espera confirmação da preparação', async () => {
    const { ctx, log } = montar({ respostas: [{ data: null }] });
    await ctx.gerarLinkCliente(OS, NUMERO);
    assert.equal(log.preparo, 1);
    assert.deepEqual(log.copias, [URL_LINK]);
});

teste('falha na nova arte impede cópia e mudança de status', async () => {
    const { ctx, log } = montar({ preparo: { ok: false, link: null, falhas: [{ nome: 'Modelo sintético' }] } });
    await ctx.gerarLinkCliente(OS, NUMERO, true);
    assert.equal(log.copias.length, 0);
    assert.equal(log.overrides.length, 0);
});

teste('recuperar link existente não sobrescreve status confirmado no banco', async () => {
    const { ctx, log } = montar();
    assert.equal(await ctx.getOrCreateLinkCliente(OS, NUMERO), URL_LINK);
    assert.ok(log.queries.every(q => q.acao === 'select'));
});

teste('primeira criação usa apenas token devolvido pelo banco', async () => {
    const { ctx, log, state } = montar({ respostas: [{ data: null }, { data: registro() }] });
    assert.equal(await ctx.getOrCreateLinkCliente(OS, NUMERO), URL_LINK);
    assert.equal(log.queries[1].acao, 'insert');
    assert.equal(state.linksClienteData[OS].token, 'abc123');
});

teste('conflito entre abas reutiliza link vencedor sem trocar token', async () => {
    const { ctx, log } = montar({ respostas: [{ data: null }, { error: { code: '23505' } }, { data: registro() }] });
    assert.equal(await ctx.getOrCreateLinkCliente(OS, NUMERO), URL_LINK);
    assert.deepEqual(log.queries.map(q => q.acao), ['select', 'insert', 'select']);
});

teste('conflito com link inativo não reativa nem copia', async () => {
    const { ctx, log } = montar({ respostas: [{ data: null }, { error: { code: '23505' } }, { data: null }] });
    await assert.rejects(() => ctx.getOrCreateLinkCliente(OS, NUMERO), /inativo/);
    assert.ok(!log.queries.some(q => q.acao === 'update'));
});

teste('erro de criação não se transforma em URL sem token', async () => {
    const { ctx } = montar({ respostas: [{ data: null }, { error: { message: 'sessão expirada', code: '42501' } }] });
    await assert.rejects(() => ctx.getOrCreateLinkCliente(OS, NUMERO));
});

teste('resposta de outro pedido ou sem token não chega à área de transferência', async () => {
    for (const mudanca of [{ numero_pedido: '111' }, { token: '' }, { ativo: false }]) {
        const { ctx, log } = montar({ respostas: [{ data: { ...registro(), ...mudanca } }] });
        await ctx.gerarLinkCliente(OS, NUMERO);
        assert.equal(log.copias.length, 0);
    }
});

teste('falha ao carimbar versão não anuncia preparo concluído nem muda cache', async () => {
    const { ctx, log, state } = montar({ preparoReal: true, respostas: [
        { data: registro() }, { error: { message: 'gravação recusada' } }
    ] });
    const resultado = await ctx.prepararLinkDaArtePronta(OS, NUMERO);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.link, null);
    assert.equal(state.linksClienteData[OS].cliente_abriu_em, '2026-09-02');
    assert.equal(log.erp, 0);
});

teste('preparação bem sucedida preserva token e confirma carimbo', async () => {
    const { ctx, log, state } = montar({ preparoReal: true, respostas: [
        { data: registro() }, { data: { id: 'id-sintetico' }, error: null }
    ] });
    const resultado = await ctx.prepararLinkDaArtePronta(OS, NUMERO);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.link, URL_LINK);
    assert.equal(log.snapshots, 1);
    assert.equal(state.linksClienteData[OS].cliente_abriu_em, null);
    assert.equal(log.erp, 1);
});

(async () => {
    let falhas = 0;
    for (const [nome, fn] of casos) {
        try { await fn(); }
        catch (e) { falhas++; console.error('FALHOU: ' + nome + '\n' + e.message); }
    }
    if (falhas) { console.error(`${falhas}/${casos.length} casos falharam.`); process.exitCode = 1; }
    else console.log(`OK: ${casos.length} casos de geração e cópia do link.`);
})();
