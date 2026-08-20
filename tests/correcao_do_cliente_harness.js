// A solicitacao de alteracao que o cliente escreve no link do cliente.
//
// Ela ia embora calada. O `finalizarConfirmacaoCliente` gravava com
// `.update()` na tabela `pedidos_artes`, e a linha do pedido quase nunca existe
// ali: ela nasce quando o painel salva o briefing, e em 20/08/2026 havia 38
// linhas para 8.263 propostas. Um UPDATE que nao acha linha nenhuma NAO e erro
// no PostgREST -- responde 200 com `[]` (conferido no banco de producao). O
// supabase-js tambem nao lanca, entao o `try/catch` em volta era enfeite: o
// cliente via "tudo certo" e o texto dele nunca tinha existido.
//
// Agora quem grava e `gravarCorrecaoDoCliente`, que insere a linha quando ela
// falta, pede as linhas afetadas de volta e DEVOLVE o resultado para quem
// chamou olhar.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const CONFIRMACOES = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-confirmacoes.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortarAsync(fonte, nome) {
    const i = fonte.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no cliente.js');
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

// ─── O banco de mentira ──────────────────────────────────────────────────────
//
// Imita o pouco do supabase-js que a funcao usa, e conta o que foi feito:
//   leitura  : .from().select().eq().maybeSingle()
//   gravacao : .from().update().eq().select()   -> devolve as linhas afetadas
//   criacao  : .from().insert()

function bancoFalso(linhas, erros) {
    erros = erros || {};
    const log = { updates: 0, inserts: 0, ultimoUpdate: null, ultimoInsert: null };
    const cliente = {
        log,
        linhas,
        from() {
            const q = { _op: null, _payload: null, _id: null };
            q.select = function () {
                if (this._op === 'update') {
                    if (erros.update) return Promise.resolve({ data: null, error: { message: erros.update } });
                    const alvo = linhas[this._id];
                    // Sem linha, o PostgREST devolve 200 e lista vazia.
                    if (!alvo) return Promise.resolve({ data: [], error: null });
                    Object.assign(alvo, this._payload);
                    log.updates++;
                    log.ultimoUpdate = this._payload;
                    return Promise.resolve({ data: [{ id: alvo.id }], error: null });
                }
                this._op = 'select';
                return this;
            };
            q.eq = function (campo, valor) { this._id = valor; return this; };
            q.maybeSingle = function () {
                if (erros.leitura) return Promise.resolve({ data: null, error: { message: erros.leitura } });
                return Promise.resolve({ data: linhas[this._id] || null, error: null });
            };
            q.update = function (payload) { this._op = 'update'; this._payload = payload; return this; };
            q.insert = function (payload) {
                if (erros.insert) return Promise.resolve({ data: null, error: { message: erros.insert } });
                log.inserts++;
                log.ultimoInsert = payload;
                linhas[payload.id_int] = Object.assign({ id: 'novo-' + payload.id_int }, payload);
                return Promise.resolve({ data: null, error: null });
            };
            return q;
        },
    };
    return cliente;
}

function montar(linhas, erros) {
    const banco = bancoFalso(linhas, erros);
    const fn = new Function('supabaseClient', 'console',
        recortarAsync(CLIENTE, 'gravarCorrecaoDoCliente') + '\nreturn gravarCorrecaoDoCliente;')(
        banco, { warn() {}, error() {} });
    return { fn, banco };
}

// ─── 1. O pedido SEM linha em pedidos_artes (o caso comum) ───────────────────

(async function pedidoSemLinhaGanhaUmaLinha() {
    const { fn, banco } = montar({});           // banco vazio: nenhuma linha

    const r = await fn(20971, 'A rua esta errada, e Av. Grecia 1100', 'CORRIGIR');

    ok(r && r.ok === true, 'grava mesmo sem a linha existir', JSON.stringify(r));
    ok(banco.log.inserts === 1, 'criou a linha (insert)', banco.log.inserts);
    const linha = banco.linhas[20971];
    ok(!!linha, 'a linha existe depois');
    ok(linha && linha.observacoes
        && linha.observacoes.correcao_entrega_faturamento === 'A rua esta errada, e Av. Grecia 1100',
        'o texto do cliente esta gravado',
        linha && JSON.stringify(linha.observacoes));
    ok(linha && linha.entrega_dados === 'CORRIGIR', 'o status foi junto', linha && linha.entrega_dados);
})();

// ─── 2. O pedido COM linha nao perde o que ja estava la ──────────────────────

(async function pedidoComLinhaPreservaAsOutrasChaves() {
    const linhas = {
        20935: { id: 'abc', id_int: 20935, observacoes: { item_2226: 'lembrar da imagem referencia' } },
    };
    const { fn, banco } = montar(linhas);

    const r = await fn(20935, 'Trocar o CNPJ', 'CORRIGIR');

    ok(r && r.ok === true, 'grava na linha que existe', JSON.stringify(r));
    ok(banco.log.updates === 1 && banco.log.inserts === 0, 'atualizou, nao duplicou',
        'updates=' + banco.log.updates + ' inserts=' + banco.log.inserts);
    const obs = banco.linhas[20935].observacoes;
    ok(obs.correcao_entrega_faturamento === 'Trocar o CNPJ', 'o texto novo entrou');
    ok(obs.item_2226 === 'lembrar da imagem referencia', 'a observacao do item nao se perdeu');
})();

// ─── 3. Update que nao pega linha nenhuma NAO pode passar por sucesso ────────

(async function updateQueNaoPegaLinhaDevolveErro() {
    // Linha some entre a leitura e a gravacao: a leitura acha, o update nao.
    const linhas = { 20950: { id: 'x', id_int: 20950, observacoes: {} } };
    const { fn, banco } = montar(linhas);
    const original = banco.from;
    banco.from = function () {
        const q = original.call(banco);
        const selectOriginal = q.select;
        q.select = function () {
            if (this._op === 'update') return Promise.resolve({ data: [], error: null });
            return selectOriginal.call(this);
        };
        return q;
    };

    const r = await fn(20950, 'texto qualquer', 'CORRIGIR');
    ok(r && r.ok === false, 'zero linhas gravadas e falha, nao sucesso', JSON.stringify(r));
    ok(r && typeof r.erro === 'string' && r.erro.length > 0, 'e diz o motivo', r && r.erro);
})();

// ─── 4. Erro do banco chega a quem chamou ────────────────────────────────────

(async function erroDoBancoNaoEEngolido() {
    const r1 = await montar({}, { insert: 'permission denied for table pedidos_artes' }).fn(20971, 'texto', 'CORRIGIR');
    ok(r1 && r1.ok === false, 'erro no insert devolve ok:false', JSON.stringify(r1));
    ok(r1 && /permission denied/.test(r1.erro || ''), 'e repassa a mensagem do banco', r1 && r1.erro);

    const linhas = { 20935: { id: 'a', id_int: 20935, observacoes: {} } };
    const r2 = await montar(linhas, { update: 'coluna inexistente' }).fn(20935, 'texto', 'CORRIGIR');
    ok(r2 && r2.ok === false, 'erro no update devolve ok:false', JSON.stringify(r2));

    const r3 = await montar({}, { leitura: 'sem permissao de leitura' }).fn(20935, 'texto', 'CORRIGIR');
    ok(r3 && r3.ok === false, 'erro na leitura devolve ok:false', JSON.stringify(r3));
})();

// ─── 5. Cliente que confirma limpa a correcao antiga ─────────────────────────

(async function confirmarApagaACorrecaoAnterior() {
    const linhas = {
        20935: {
            id: 'abc', id_int: 20935,
            observacoes: { item_2226: 'nota do item', correcao_entrega_faturamento: 'texto antigo' },
        },
    };
    const { fn, banco } = montar(linhas);

    const r = await fn(20935, '', 'APROVADO');

    ok(r && r.ok === true, 'confirmar grava', JSON.stringify(r));
    const obs = banco.linhas[20935].observacoes;
    ok(obs.correcao_entrega_faturamento === undefined,
        'a correcao antiga sai quando o cliente confirma', JSON.stringify(obs));
    ok(obs.item_2226 === 'nota do item', 'a observacao do item continua');
    ok(banco.linhas[20935].entrega_dados === 'APROVADO', 'status vai para APROVADO');
})();

// ─── 6. Sem status, o entrega_dados nao e tocado ─────────────────────────────
//
// E o que o botao "Salvar Correcao" faz: guarda o texto na hora, mas quem diz
// que o pedido esta em correcao e o botao final.

(async function semStatusNaoMexeNoEntregaDados() {
    const linhas = { 20935: { id: 'abc', id_int: 20935, observacoes: {}, entrega_dados: 'APROVADO' } };
    const { fn, banco } = montar(linhas);

    await fn(20935, 'so o texto', null);

    ok(banco.linhas[20935].entrega_dados === 'APROVADO',
        'sem status pedido, entrega_dados fica como estava', banco.linhas[20935].entrega_dados);
    ok(banco.linhas[20935].observacoes.correcao_entrega_faturamento === 'so o texto', 'mas o texto foi gravado');
})();

// ─── 7. Na fonte: ninguem grava mais com update cego ─────────────────────────

(function naFonteNinguemGravaCego() {
    const fn = recortarAsync(CLIENTE, 'gravarCorrecaoDoCliente');
    ok(/\.insert\(/.test(fn), 'gravarCorrecaoDoCliente sabe inserir a linha que falta');
    ok(/\.select\(/.test(fn), 'e pede as linhas afetadas de volta');

    // O botao "Salvar Correcao" tem de gravar de verdade, e nao so pintar a
    // tela. Ele mora no `cliente-confirmacoes.js` desde 20/08/2026, quando
    // entrega e faturamento viraram duas abas do Portal do Pedido com uma
    // decisao cada.
    const i = CONFIRMACOES.indexOf('window.salvarCorrecaoDeDados');
    const salvar = CONFIRMACOES.slice(i, CONFIRMACOES.indexOf('\n};', i));
    ok(/gravarCorrecaoDoCliente/.test(salvar),
        'o botao "Salvar Correcao" grava no banco, nao so numa variavel da tela');

    // Falhar ao gravar nao pode prender o cliente na tela: ele precisa poder
    // finalizar assim mesmo, sabendo que aquele texto nao entrou.
    ok(salvar.indexOf('return') === salvar.lastIndexOf('return'),
        'falha ao gravar NAO prende o cliente (o unico return e o do campo vazio)');
    ok(/gravacao\.ok\s*$|gravacao\.ok\s*\?/m.test(salvar),
        'e o recibo na tela diz a verdade sobre ter salvo ou nao');

    // O botao final tem de avisar quem nao conseguiu gravar, com a saida.
    const finalizar = CONFIRMACOES.slice(CONFIRMACOES.indexOf('window.finalizarNoPortal'));
    ok(/if \(!gravacao\.ok\)[\s\S]{0,400}avisoDeFinalizacao/.test(finalizar),
        'o botao final avisa o cliente quando a conferencia nao foi gravada');
    ok(/entre em contato[\s\S]{0,200}atendente/i.test(finalizar),
        'e diz o que fazer -- nenhuma trava deste projeto fica sem saida');

    // O chat do parceiro so aceita `autor_nome`; `remetente_nome` nao existe la
    // e derruba a linha inteira.
    ok(!/remetente_nome:/.test(CLIENTE + CONFIRMACOES),
        'a pagina do cliente nao manda mais `remetente_nome` para propostas_chat');
    ok(/error: erroChat/.test(CONFIRMACOES),
        'e olha o erro do chat em vez de engolir (o supabase-js nao lanca)');
})();

// ─── 8. A linha nasce no painel, porque na tela do cliente a RLS nao deixa ───
//
// `anon` LE e ATUALIZA `pedidos_artes`, mas nao CRIA: o insert volta 42501,
// "new row violates row-level security policy" (conferido no banco em
// 20/08/2026). Entao a linha tem de existir antes de o link sair, e quem a cria
// e o painel, logado.

function montarPainel(linhas, erros) {
    const banco = bancoFalso(linhas, erros);
    // `select().eq().limit()` -- a forma que o painel usa.
    const fromOriginal = banco.from;
    banco.from = function () {
        const q = fromOriginal.call(banco);
        q.limit = function () {
            const alvo = linhas[this._id];
            if (erros.leitura) return Promise.resolve({ data: null, error: { message: erros.leitura } });
            return Promise.resolve({ data: alvo ? [{ id: alvo.id }] : [], error: null });
        };
        return q;
    };
    const fn = new Function('supabaseClient', 'console', 'window',
        recortarAsync(SCRIPT, 'garantirLinhaDePedidoArte') + '\nreturn garantirLinhaDePedidoArte;')(
        banco, { warn() {}, log() {} }, {});
    return { fn, banco };
}

(async function oPainelCriaALinhaQueFalta() {
    const { fn, banco } = montarPainel({}, {});
    const r = await fn(20971);
    ok(r === true, 'o painel cria a linha que falta', String(r));
    ok(banco.log.inserts === 1, 'um insert', banco.log.inserts);
    ok(banco.linhas[20971] && banco.linhas[20971].id_int === 20971, 'com o numero do pedido');
})();

(async function oPainelNaoDuplicaALinhaQueExiste() {
    const linhas = { 20935: { id: 'abc', id_int: 20935, observacoes: { item_2226: 'nota' } } };
    const { fn, banco } = montarPainel(linhas, {});
    const r = await fn(20935);
    ok(r === true, 'linha ja existente da certo', String(r));
    ok(banco.log.inserts === 0, 'e NAO duplica', banco.log.inserts);
    ok(banco.linhas[20935].observacoes.item_2226 === 'nota', 'nem apaga o que estava la');
})();

(async function falhaAoCriarNaoDerrubaOLink() {
    const { fn } = montarPainel({}, { insert: 'new row violates row-level security policy' });
    const r = await fn(20971);
    ok(r === false, 'falha devolve false em vez de lancar', String(r));
})();

(function oLinkDoClienteGaranteALinha() {
    const fn = recortarAsync(SCRIPT, 'getOrCreateLinkCliente');
    ok(/garantirLinhaDePedidoArte\(/.test(fn),
        'gerar o link do cliente garante a linha em pedidos_artes');
})();

(function asGravacoesDoPainelGarantemALinha() {
    // As tres acoes do painel que escrevem em `pedidos_artes.entrega_dados`:
    // aprovar os dados, marcar a correcao como concluida, e registrar a
    // solicitacao de correcao. Todas eram UPDATE cego.
    const acoes = [
        'Confirmando aprovação dos dados de entrega e faturamento...',
        'Atualizando status de entrega e faturamento para APROVADO...',
        'Enviando solicitação de correção de entrega e faturamento...',
    ];
    acoes.forEach(msg => {
        const i = SCRIPT.indexOf(msg);
        ok(i > 0, 'achei a acao: ' + msg.slice(0, 40));
        if (i < 0) return;
        // Ate o fim da funcao: uma delas monta as observacoes antes de gravar.
        const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
        const iGarante = trecho.indexOf('garantirLinhaDePedidoArte');
        const iUpdate = trecho.indexOf('entrega_dados:');
        ok(iGarante > 0 && iUpdate > 0 && iGarante < iUpdate,
            'garante a linha ANTES de gravar: ' + msg.slice(0, 40));
    });
})();

(function oPainelNaoMandaMaisRemetenteNome() {
    ok(SCRIPT.indexOf('remetente_nome') < 0 || !/remetente_nome:/.test(SCRIPT),
        'script.js nao manda mais `remetente_nome` para propostas_chat');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

setTimeout(() => {
    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' conferencias falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' conferencias da correcao do cliente.');
}, 50);
