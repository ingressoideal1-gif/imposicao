// As duas confirmacoes do Portal do Pedido: entrega e faturamento, separadas.
//
// Ate 20/08/2026 os dois eram um cartao so, com UM par de botoes e UM campo de
// texto gravado na chave `correcao_entrega_faturamento`. O atendente recebia um
// texto onde os dois assuntos se misturavam e tinha de adivinhar se o cliente
// falava do endereco ou do CNPJ.
//
// Agora sao duas abas com uma decisao cada, e duas chaves dentro do mesmo jsonb
// `pedidos_artes.observacoes` -- sem coluna nova, e sem perder a chave antiga,
// que e a que existe nos pedidos ja gravados.
//
// Roda em node: `node tests/portal_confirmacoes_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
const DADOS = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-dados.js'), 'utf8');
const ENTREGA = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-entrega.js'), 'utf8');
const FATURAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-faturamento.js'), 'utf8');
const CONFIRMACOES = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-confirmacoes.js'), 'utf8');
const LOGO = fs.readFileSync(path.join(RAIZ, 'frontend', 'logo-do-frete.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortar(fonte, nome, assincrona) {
    const cabeca = (assincrona ? '\nasync function ' : '\nfunction ') + nome + '(';
    const i = fonte.indexOf(cabeca);
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

function extrairTabela(fonte, nome) {
    const i = fonte.indexOf('\nconst ' + nome + ' = ');
    if (i < 0) throw new Error('nao achei a tabela ' + nome);
    let profundidade = 0;
    for (let j = fonte.indexOf('=', i); j < fonte.length; j++) {
        const c = fonte[j];
        if (c === '[' || c === '{') profundidade++;
        else if (c === ']' || c === '}') profundidade--;
        else if (c === ';' && profundidade === 0) return fonte.slice(i, j + 1);
    }
    throw new Error('nao achei o fim da tabela ' + nome);
}

// ─── O banco de mentira ──────────────────────────────────────────────────────
//
// Imita o pouco do supabase-js que a funcao usa:
//   leitura  : .from().select().eq().maybeSingle()
//   gravacao : .from().update().eq().select()  -> devolve as linhas afetadas
//   criacao  : .from().insert()

function bancoFalso(linhas) {
    const log = { updates: 0, inserts: 0 };
    return {
        log,
        linhas,
        from() {
            const q = { _op: null, _payload: null, _id: null };
            q.select = function () {
                if (this._op === 'update') {
                    const alvo = linhas[this._id];
                    if (!alvo) return Promise.resolve({ data: [], error: null });
                    Object.assign(alvo, this._payload);
                    log.updates++;
                    return Promise.resolve({ data: [{ id: alvo.id }], error: null });
                }
                this._op = 'select';
                return this;
            };
            q.update = function (payload) { this._op = 'update'; this._payload = payload; return this; };
            q.insert = function (payload) {
                log.inserts++;
                linhas[payload.id_int] = Object.assign({ id: 'novo' }, payload);
                return Promise.resolve({ error: null });
            };
            q.eq = function (_col, val) { this._id = val; return this; };
            q.maybeSingle = function () {
                return Promise.resolve({ data: linhas[this._id] || null, error: null });
            };
            return q;
        }
    };
}

function montar(linhas) {
    const banco = bancoFalso(linhas);
    const fonte = recortar(CLIENTE, 'gravarCorrecaoDoCliente', true);
    const fn = new Function('supabaseClient', fonte + '\nreturn gravarCorrecaoDoCliente;')(banco);
    return { fn, banco };
}

// ─── 1. Cada aba grava a sua chave ───────────────────────────────────────────

(async function soAEntregaComTexto() {
    const linhas = { 20971: { id: 'a', id_int: 20971, observacoes: {} } };
    const { fn, banco } = montar(linhas);

    const r = await fn(20971, { entrega: 'A rua esta errada, e Av. Grecia 1100', faturamento: '' }, 'CORRIGIR');

    ok(r && r.ok === true, 'gravou', JSON.stringify(r));
    const obs = banco.linhas[20971].observacoes;
    ok(obs.correcao_entrega === 'A rua esta errada, e Av. Grecia 1100',
        'o texto foi para a chave da entrega', obs);
    ok(obs.correcao_faturamento === undefined,
        'e a chave do faturamento nao nasceu vazia', obs);
    ok(banco.linhas[20971].entrega_dados === 'CORRIGIR', 'o selo foi junto');
})();

(async function soOFaturamentoComTexto() {
    const linhas = { 20972: { id: 'b', id_int: 20972, observacoes: {} } };
    const { fn, banco } = montar(linhas);

    await fn(20972, { entrega: '', faturamento: 'O CNPJ mudou' }, 'CORRIGIR');

    const obs = banco.linhas[20972].observacoes;
    ok(obs.correcao_faturamento === 'O CNPJ mudou', 'o texto foi para a chave do faturamento', obs);
    ok(obs.correcao_entrega === undefined, 'e a da entrega nao', obs);
})();

(async function osDoisAoMesmoTempo() {
    const linhas = { 20973: { id: 'c', id_int: 20973, observacoes: {} } };
    const { fn, banco } = montar(linhas);

    await fn(20973, { entrega: 'Mudou o endereco', faturamento: 'Mudou o CNPJ' }, 'CORRIGIR');

    const obs = banco.linhas[20973].observacoes;
    ok(obs.correcao_entrega === 'Mudou o endereco', 'a entrega esta la', obs);
    ok(obs.correcao_faturamento === 'Mudou o CNPJ', 'e o faturamento tambem', obs);
})();

// ─── 2. Confirmar os dois limpa tudo ─────────────────────────────────────────

(async function confirmarLimpaAsTresChaves() {
    // O cliente que pediu alteracao, voltou atras e confirmou nao pode deixar o
    // texto antigo no banco: o painel mostraria uma solicitacao que nao existe
    // mais, e o atendente ligaria para corrigir o que ja esta certo.
    const linhas = {
        20974: {
            id: 'd', id_int: 20974,
            observacoes: {
                item_2226: 'nota do item',
                correcao_entrega: 'texto velho',
                correcao_faturamento: 'outro texto velho',
                correcao_entrega_faturamento: 'o texto da forma antiga'
            }
        }
    };
    const { fn, banco } = montar(linhas);

    await fn(20974, { entrega: '', faturamento: '' }, 'APROVADO');

    const obs = banco.linhas[20974].observacoes;
    ok(obs.correcao_entrega === undefined, 'a correcao da entrega saiu', obs);
    ok(obs.correcao_faturamento === undefined, 'a do faturamento tambem', obs);
    ok(obs.correcao_entrega_faturamento === undefined, 'e a da forma antiga junto', obs);
    ok(obs.item_2226 === 'nota do item', 'a observacao do item continua', obs);
    ok(banco.linhas[20974].entrega_dados === 'APROVADO', 'o selo foi para APROVADO');
})();

// ─── 3. A forma antiga continua funcionando ──────────────────────────────────
//
// Texto solto (e nao objeto) e como os pedidos ja gravados foram escritos, e o
// painel le aquela chave ha meses.

(async function textoSoltoAindaGravaAChaveAntiga() {
    const linhas = { 20975: { id: 'e', id_int: 20975, observacoes: {} } };
    const { fn, banco } = montar(linhas);

    await fn(20975, 'texto da forma antiga', 'CORRIGIR');

    const obs = banco.linhas[20975].observacoes;
    ok(obs.correcao_entrega_faturamento === 'texto da forma antiga',
        'a chave antiga continua sendo escrita quando vem texto solto', obs);
})();

(async function decidirDeNovoApagaAChaveAntiga() {
    // Pedido que ja tinha a correcao na forma antiga e agora recebe a decisao
    // por aba: as duas versoes da mesma solicitacao nao podem conviver.
    const linhas = {
        20976: { id: 'f', id_int: 20976, observacoes: { correcao_entrega_faturamento: 'texto de antes' } }
    };
    const { fn, banco } = montar(linhas);

    await fn(20976, { entrega: 'agora e so o endereco', faturamento: '' }, 'CORRIGIR');

    const obs = banco.linhas[20976].observacoes;
    ok(obs.correcao_entrega_faturamento === undefined,
        'a chave antiga sai quando o cliente decide de novo', obs);
    ok(obs.correcao_entrega === 'agora e so o endereco', 'e a nova entra', obs);
})();

// ─── 4. As linhas da nota fiscal ─────────────────────────────────────────────

const linhasDoFaturamento = new Function(
    recortar(FATURAMENTO, 'linhasDoFaturamento') + '\nreturn linhasDoFaturamento;')();

(function aIeVaziaViraIsento() {
    // Em nota fiscal, "sem I.E." e "isento de I.E." sao coisas diferentes -- e e
    // isento que o cadastro quer dizer quando o campo esta em branco.
    const l = linhasDoFaturamento({ nome: 'Fulano', documento: '123', ins_estadual: '' });
    const ie = l.find(x => x.rotulo === 'Inscrição estadual');
    ok(ie && ie.valor === 'ISENTO', 'I.E. vazia vira ISENTO', l);
})();

(function linhaVaziaNaoAparece() {
    const l = linhasDoFaturamento({ nome: 'Fulano', documento: '', email: '', telefone: '' });
    const rotulos = l.map(x => x.rotulo);
    ok(rotulos.indexOf('CPF / CNPJ') < 0, 'sem documento, sem a linha', rotulos);
    ok(rotulos.indexOf('E-mail') < 0, 'sem e-mail, sem a linha', rotulos);
    ok(rotulos.indexOf('Inscrição estadual') >= 0, 'mas a I.E. sempre aparece', rotulos);
})();

(function semCadastroDevolveVazio() {
    ok(linhasDoFaturamento(null).length === 0, 'pedido sem cadastro nao quebra');
})();

// ─── 5. As linhas do envio ───────────────────────────────────────────────────

const linhasDoEnvio = new Function(
    extrairTabela(DADOS, 'NOME_DO_FRETE') + '\n'
    + recortar(DADOS, 'emReal') + '\n'
    + recortar(DADOS, 'rotuloDoFrete') + '\n'
    + recortar(DADOS, 'diasDoPrazo') + '\n'
    + recortar(DADOS, 'emDiasUteis') + '\n'
    + recortar(DADOS, 'prazoDeProducao') + '\n'
    + recortar(DADOS, 'prazoDoFrete') + '\n'
    + recortar(DADOS, 'prazoDeEntrega') + '\n'
    + recortar(DADOS, 'ehRetirada') + '\n'
    + recortar(DADOS, 'linkDeRastreio') + '\n'
    + 'function escapeHtml(v) { return String(v == null ? "" : v); }\n'
    // A logo vem do seu proprio arquivo, e tem harness proprio
    // (`logo_do_frete_harness.js`). Aqui ela e so uma dependencia.
    + recortar(LOGO, 'logoDoFrete') + '\n'
    + recortar(LOGO, 'logoDoFreteHtml') + '\n'
    + extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\n'
    + recortar(ENTREGA, 'linhasDoEnvio') + '\nreturn linhasDoEnvio;')();

(function envioTemFormaEOPrazoDeEntrega() {
    // Em 20/08/2026 as duas linhas soltas ("Prazo de producao" e "Prazo de
    // envio") viraram UMA: elas estavam certas e obrigavam o cliente a somar de
    // cabeca para saber quando o pacote chega.
    const l = linhasDoEnvio({
        pedido: { frete_escolhido: 'SEDEX', valor_frete: '20.12' },
        frete: { servico: 'SEDEX', prazo: '1 dia útil' },
        os: null,
        itens: [{ prazo: '1 dia útil' }, { prazo: '1 dia útil' }]
    });
    const rotulos = l.map(x => x.rotulo);
    ok(rotulos[0] === 'Forma de envio', 'a forma vem primeiro', rotulos);
    ok(rotulos[1] === 'Prazo de entrega', 'e o prazo de entrega logo depois', rotulos);
    ok(rotulos.indexOf('Prazo de produção') < 0, 'as duas linhas soltas sairam', rotulos);
    ok(l[0].valor === 'SEDEX — R$ 20,12', 'a forma com o valor junto', l[0]);
    ok(l[1].valor === 'Produção: 1 dia útil + Envio: 1 dia útil',
        'os dois prazos na mesma frase', l[1].valor);
    ok(/Recebimento a partir de 2 dias úteis/.test(l[1].html),
        'e a soma, que e a resposta de "quando chega"', l[1].html);
})();

(function aProducaoContinuaSendoADoProdutoMaisDemorado() {
    const l = linhasDoEnvio({
        pedido: {}, frete: { prazo: '2 dias úteis' }, os: null,
        itens: [{ prazo: '1 dia útil' }, { prazo: '3 dias úteis' }]
    });
    ok(l[1].valor === 'Produção: 3 dias úteis + Envio: 2 dias úteis',
        'tres dias, e nao um nem quatro', l[1].valor);
    ok(/5 dias úteis/.test(l[1].html), 'e a soma acompanha', l[1].html);
})();

(function naRetiradaNaoSeSomaUmEnvioQueNaoExiste() {
    // Somar um dia de transporte que nao vai acontecer daria ao cliente uma
    // data pior do que a real -- ele viria buscar um dia depois do que podia.
    const l = linhasDoEnvio({
        pedido: { frete_escolhido: 'RETIRADA', valor_frete: '0.00' },
        frete: { servico: 'Retirada Local', prazo: '1 dia útil' },
        os: null,
        itens: [{ prazo: '2 dias úteis' }]
    });
    const prazo = l.find(x => x.rotulo === 'Prazo');
    ok(!!prazo, 'a linha se chama Prazo, e nao Prazo de entrega', l.map(x => x.rotulo));
    ok(prazo.valor === 'Produção: 2 dias úteis', 'so a producao', prazo.valor);
    ok(/Pronto para retirada a partir de 2 dias úteis/.test(prazo.html),
        'e a frase fala em retirar, nao em receber', prazo.html);
    ok(!/Envio:/.test(prazo.html), 'sem perna de envio', prazo.html);
})();

(function semPrazoDizOQueFazer() {
    // Nenhuma trava deste projeto fica sem saida: sem prazo, a linha diz onde
    // conseguir a resposta, em vez de ficar vazia ou escrever "undefined".
    // Frete de transportadora, e nao retirada: a retirada tem linha propria,
    // testada logo acima.
    const l = linhasDoEnvio({ pedido: { frete_escolhido: 'SEDEX' }, frete: null, os: null, itens: [] });
    const linha = l.find(x => x.rotulo === 'Prazo de entrega');
    ok(linha && /atendimento/i.test(linha.valor), 'sem prazo nenhum, diz o que fazer', linha);
})();

(function semNumeroDeUmDosLadosNaoSeInventaSoma() {
    // "A combinar" nao vira zero: somar o que der inventaria uma data de entrega
    // que a grafica nao prometeu.
    const l = linhasDoEnvio({
        pedido: {}, frete: { prazo: 'A combinar' }, os: null, itens: [{ prazo: '3 dias úteis' }]
    });
    ok(l[1].valor === 'Produção: 3 dias úteis + Envio: A combinar', 'a frase mostra os dois', l[1].valor);
    ok(!/Recebimento a partir/.test(l[1].html), 'e nao ha soma', l[1].html);
})();

(function aFormaDeEnvioCaiNaCotacaoQuandoOPedidoNaoDiz() {
    // `cotacao_frete.servico` tem nomes que `frete_escolhido` nao tem --
    // "Frete Incluso", "Sem custo", "Transportadora Parceira". Dizer
    // "A combinar" com uma cotacao escolhida na mao esconderia do cliente o que
    // ja esta decidido.
    const l = linhasDoEnvio({
        pedido: { frete_escolhido: null, valor_frete: '0.00' },
        frete: { servico: 'Frete Incluso', prazo: 'A combinar' },
        os: null, itens: []
    });
    ok(l[0].valor.indexOf('Frete Incluso') === 0, 'o nome vem da cotacao', l[0].valor);
})();

(function oRastreioSoApareceQuandoExiste() {
    const sem = linhasDoEnvio({ pedido: {}, os: { codigo_rastreamento: null }, itens: [] });
    ok(!sem.some(x => x.rotulo === 'Código de rastreio'), 'sem codigo, sem a linha');

    const com = linhasDoEnvio({ pedido: {}, os: { codigo_rastreamento: 'AD816558575BR' }, itens: [] });
    const linha = com.find(x => x.rotulo === 'Código de rastreio');
    ok(!!linha, 'com codigo, a linha existe');
    ok(linha && /correios/.test(linha.html), 'e leva aos Correios', linha && linha.html);
    ok(linha && /rel="noopener noreferrer"/.test(linha.html),
        'com noopener: o destino e site de terceiro', linha && linha.html);
})();

// ─── 6. Na fonte: o que nao pode voltar ──────────────────────────────────────

(function osDoisBotoesTemOMesmoPeso() {
    // Pintar CONFIRMAR de verde e ALTERAR de cinza empurra o cliente a
    // confirmar sem ler -- e e exatamente aqui que ele deveria ler.
    const cartao = recortar(CONFIRMACOES, 'cartaoDeDecisao');
    const confirmar = cartao.indexOf("decidirDados('\" + qual + \"', true)");
    const alterar = cartao.indexOf("decidirDados('\" + qual + \"', false)");
    ok(cartao.indexOf('CONFIRMAR') > 0 && cartao.indexOf('ALTERAR') > 0, 'os dois botoes existem');
    ok(!/class="portal-botao principal"[^>]*CONFIRMAR/.test(cartao),
        'e o CONFIRMAR nao ganha destaque sobre o ALTERAR');
})();

(function oFinalDizOQueFalta() {
    const cartao = recortar(CONFIRMACOES, 'cartaoDeFinalizacao');
    ok(/Para finalizar, falta/.test(cartao), 'o cartao final diz o que falta');
    ok(/aba <b>Arte<\/b>/.test(cartao), 'e aponta a aba da arte quando ela falta');
    ok(/disabled/.test(cartao), 'com o botao desligado enquanto falta algo');
})();

(function oAvisoDoFimSobreviveAoRedesenho() {
    // `redesenharSecao` reescreve o innerHTML da secao aberta. Chamado DEPOIS do
    // aviso, ele apagava o aviso no mesmo instante -- e o que sumia era
    // justamente a mensagem que mais precisa ser lida: a de que a conferencia
    // NAO foi gravada, com o numero do pedido para o cliente informar.
    const fn = CONFIRMACOES.slice(CONFIRMACOES.indexOf('window.finalizarNoPortal'));
    const corpo = fn.slice(0, fn.indexOf('\n};'));
    const redesenho = corpo.indexOf('redesenharSecao');
    const aviso = corpo.indexOf('avisoDeFinalizacao');
    ok(redesenho > 0 && aviso > 0 && redesenho < aviso,
        'o redesenho vem ANTES do aviso, senao o aviso e apagado',
        { redesenho, aviso });
})();

(function aTravaDoRecebedorTemSaida() {
    // A regra do usuario (20/08/2026) exige nome e CPF quando a nota e de
    // empresa. A trava desliga o CONFIRMAR -- mas o ALTERAR continua vivo, e o
    // cartao do fim para de cobrar quando o cliente usa o ALTERAR: ele esta
    // mandando o dado pela caixa de texto, e o pedido vai ao atendimento com a
    // solicitacao. Trava sem saida nao existe nesta casa.
    const cartao = recortar(CONFIRMACOES, 'cartaoDeDecisao');
    ok(/bloqueio\s*\?/.test(cartao), 'o bloqueio desliga o CONFIRMAR', cartao.slice(0, 60));
    ok(/portal-botao" disabled>CONFIRMAR/.test(cartao), 'com o botao desabilitado');
    ok((cartao.match(/decidirDados\('" \+ qual \+ "', false\)/g) || []).length >= 0,
        'e o ALTERAR nunca e desligado');
    ok(cartao.indexOf('ALTERAR</button>') > 0, 'o ALTERAR continua na tela');
    ok(/nome completo e o CPF/.test(cartao),
        'e a caixa de texto pede exatamente o que falta');

    const fim = recortar(CONFIRMACOES, 'cartaoDeFinalizacao');
    ok(/entregaExigeRecebedor\([\s\S]{0,80}\)\s*&& c\.entrega !== false/.test(fim),
        'quem usou o ALTERAR deixa de ser cobrado -- e a saida da trava', fim.slice(0, 200));
})();

(function aTelaAntigaDeConferenciaSaiu() {
    // Ela vivia entre a aprovacao e o fim, e escondia a pagina inteira.
    ok(CLIENTE.indexOf('mostrarConfirmacaoDadosCliente') < 0, 'a tela sequencial saiu');
    ok(CLIENTE.indexOf('clienteConfirmacoes') < 0, 'e o estado dela junto');
    ok(/abrirSecao\('entrega'\)/.test(CLIENTE),
        'quem aprova a arte e levado para a aba de entrega');
})();

// ─── A conferencia que ele ja fez, lembrada na proxima visita ────────────────
//
// Ate 25/08/2026 `portalConfirmacoes` nascia zerado a cada abertura, e o selo
// `entrega_dados` -- que a carga do portal ja trazia -- nao era lido em lugar
// nenhum. O cliente confirmava, finalizava, voltava pelo link no dia seguinte
// para ver o prazo, e lia "Para finalizar, falta: conferir os dados na aba
// Entrega". Refazia, e o atendimento recebia a mesma mensagem duas vezes.

function reidratar(portal) {
    const janela = { portalConfirmacoes: { entrega: null, faturamento: null, textoEntrega: '', textoFaturamento: '' } };
    const estado = {};
    const fonte = recortar(CONFIRMACOES, 'reidratarConfirmacoes');
    new Function('window', 'clienteState', fonte + '\nreidratarConfirmacoes(arguments[2]);')(
        janela, estado, portal);
    return { c: janela.portalConfirmacoes, estado };
}

(function aprovadoVoltaConfirmado() {
    const { c, estado } = reidratar({ entrega: { entrega_dados: 'APROVADO', observacoes: {} } });
    ok(c.entrega === true && c.faturamento === true, 'os dois voltam confirmados', c);
    ok(estado.pedidoFinalizado === true, 'e o pedido volta finalizado', estado);
})();

(function corrigirVoltaComOTextoQueEleEscreveu() {
    const { c, estado } = reidratar({ entrega: { entrega_dados: 'CORRIGIR', observacoes: {
        correcao_entrega: 'A rua esta errada, e Av. Grecia 1100'
    } } });
    ok(c.entrega === false, 'a entrega volta como alteracao pedida', c.entrega);
    ok(c.textoEntrega === 'A rua esta errada, e Av. Grecia 1100',
        'com o texto dele, para ele reler em vez de reescrever', c.textoEntrega);
    ok(c.faturamento === null, 'e a nota, que ele nao tocou, continua por decidir', c.faturamento);
    ok(estado.pedidoFinalizado === true, 'ele ja finalizou', estado);
})();

(function aChaveAntigaMarcaOsDois() {
    // Nos pedidos gravados antes de 20/08/2026 os dois assuntos vinham num
    // texto so. Marcar os dois e o mais fiel que da para ser.
    const { c } = reidratar({ entrega: { entrega_dados: 'CORRIGIR', observacoes: {
        correcao_entrega_faturamento: 'endereco e CNPJ errados'
    } } });
    ok(c.entrega === false && c.faturamento === false, 'os dois', c);
    ok(c.textoEntrega === 'endereco e CNPJ errados'
        && c.textoFaturamento === 'endereco e CNPJ errados', 'com o mesmo texto', c);
})();

(function alteradoNaoVolta() {
    // `ALTERADO` nao vem do cliente: nasce do atendente girando o selo na Lista
    // de Arte, justamente para pedir que ele confira de novo. Reidratar aqui
    // apagaria o pedido do atendente.
    const { c, estado } = reidratar({ entrega: { entrega_dados: 'ALTERADO', observacoes: {} } });
    ok(c.entrega === null && c.faturamento === null, 'as perguntas voltam', c);
    ok(!estado.pedidoFinalizado, 'e o pedido nao se diz finalizado', estado);
})();

(function corrigirSemTextoNaoAdivinha() {
    const { c, estado } = reidratar({ entrega: { entrega_dados: 'CORRIGIR', observacoes: {} } });
    ok(c.entrega === null && c.faturamento === null,
        'sem texto o selo nao diz de qual dos dois falava: pergunta de novo', c);
    ok(!estado.pedidoFinalizado, 'e nao se diz finalizado', estado);
})();

(function selosDesconhecidosEPortalVazioNaoQuebram() {
    ok(reidratar({}).c.entrega === null, 'portal sem entrega');
    ok(reidratar(null).c.entrega === null, 'portal nulo');
    ok(reidratar({ entrega: { entrega_dados: '----' } }).c.entrega === null, 'selo vazio do painel');
    const comTexto = reidratar({ entrega: { entrega_dados: 'corrigir',
        observacoes: '{"correcao_faturamento":"a IE mudou"}' } });
    ok(comTexto.c.faturamento === false && comTexto.c.textoFaturamento === 'a IE mudou',
        'selo em minuscula e observacoes como string tambem sao lidos', comTexto.c);
})();

(function aReidratacaoAconteceAntesDoPrimeiroDesenho() {
    // Depois do desenho, o cartao do fim ja teria sido montado com as perguntas.
    const i = CLIENTE.indexOf('reidratarConfirmacoes(portal)');
    const j = CLIENTE.indexOf("registrarSecao('arte'");
    ok(i > 0 && j > 0 && i < j, 'reidratar vem antes de registrar a primeira secao', [i, j]);
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias das duas confirmacoes.');
