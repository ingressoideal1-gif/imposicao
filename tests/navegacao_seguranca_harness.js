// Funções reais com DOM, relógio e persistência simulados. Sem acesso à rede.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', 'frontend', nome), 'utf8');
const script = ler('script.js'), pedido = ler('pedido.js');
function extrair(fonte, nome) {
    const inicio = fonte.indexOf('function ' + nome + '(');
    assert(inicio >= 0);
    return (fonte.slice(inicio - 6, inicio) === 'async ' ? 'async ' : '')
        + fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
function montar() {
    const tarefas = [], escritas = [], filas = [], mensagens = [];
    const item = { id: 'm1', produto: 'Sintético', formato_id: 'f', numeracao: 'N' };
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} },
        state: { osItens: { os: [item] }, formatos: [{ id: 'f', default_saida_id: 's' }],
            numeracoes: [{ id: 'n', name: 'N' }], cores: [], produtosGlobais: [], saidas: [] },
        document: { getElementById: () => null },
        window: { addEventListener() {}, location: { pathname: '/', search: '' }, history: {} },
        Event: class { constructor(type) { this.type = type; } },
        setTimeout(fn, ms) { tarefas.push({ fn, ms }); return setTimeout(fn, 0); },
        matchFormato: () => 'f', matchNumeracao: () => 'n',
        recarregarNumeracoesDoPedido: async () => {},
        updateImpSummary() {}, agendarRedesenhoDasFilas() {},
        renderImpOSQueue: opcoes => filas.push(opcoes),
        autoSaveOSItemField: (...args) => { escritas.push(args); },
        toast: t => mensagens.push(t), podeAbrirView: () => true
    });
    vm.runInContext(ler('navegacao-painel.js'), ctx);
    vm.runInContext(extrair(script, 'saveActiveOSItemField') + '\n'
        + extrair(script, 'formatoDoProduto') + '\n' + extrair(script, 'formatoDoModelo') + '\n'
        + extrair(script, 'enviarParaImposicao') + '\n' + extrair(script, 'carregarModeloParaImposicao') + '\n'
        + extrair(pedido, 'enviarParaPedido') + '\n' + extrair(pedido, 'carregarModeloParaPedido'), ctx);
    ctx.document.getElementById = nome => {
        const campo = { 'imp-formato': 'formato_id', 'imp-saida': 'saida_id', 'imp-numeracao': 'numeracao_id' }[nome];
        if (!campo) return null;
        return { value: '', querySelector: () => ({}),
            dispatchEvent() { ctx.saveActiveOSItemField(campo, this.value); } };
    };
    return { ctx, tarefas, escritas, filas, mensagens, item };
}
(async () => {
    let total = 0;
    {
        const { ctx, tarefas, escritas, filas, item } = montar();
        const antes = JSON.stringify(item);
        await ctx.enviarParaImposicao('m1', 'os', false, { aindaAtual: () => true, restaurandoNavegacao: true });
        assert.equal(escritas.length, 0, 'restaurar não salva por matching nem por onchange');
        assert.equal(JSON.stringify(item), antes, 'restaurar não altera dados do modelo');
        assert(filas.every(o => o.somenteLeitura === true));
        total++;
    }
    {
        const { ctx, tarefas, escritas } = montar();
        await ctx.enviarParaImposicao('m1', 'os', false, { aindaAtual: () => true });
        assert(escritas.some(e => e[2] === 'formato_id'));
        assert(escritas.some(e => e[2] === 'numeracao_id'));
        total++;
    }
    {
        const { ctx, tarefas, escritas } = montar();
        let atual = true;
        ctx.recarregarNumeracoesDoPedido = async () => { atual = false; };
        await ctx.enviarParaImposicao('m1', 'os', false, { aindaAtual: () => atual });
        assert.equal(tarefas.length, 0);
        assert.equal(escritas.length, 0);
        total++;
    }
    {
        const { ctx, tarefas, mensagens } = montar();
        await ctx.enviarParaPedido('modelo-removido', 'os', { aindaAtual: () => true, restaurandoNavegacao: true });
        assert.equal(ctx.state.activeOSItem, undefined, 'não seleciona o primeiro item');
        assert.equal(tarefas.length, 0);
        assert(mensagens.some(m => m.includes('não encontrado')));
        total++;
    }
    {
        const { ctx } = montar();
        assert.throws(() => ctx.window.NavegacaoPainel.semGravacao(() => { throw Error('simulado'); }));
        assert.equal(ctx.window.NavegacaoPainel.restaurando(), false, 'erro não bloqueia edições futuras');
        total++;
    }
    console.log('OK: ' + total + ' regressões de segurança da restauração.');
})().catch(e => { console.error(e); process.exitCode = 1; });
