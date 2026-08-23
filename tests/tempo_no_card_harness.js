// O relogio da coluna "Tempo" da Lista de Arte.
//
// Pedido do usuario em 19/08/2026: a coluna "Data Liberacao" vira "Tempo" e
// mostra ha quanto tempo o pedido esta no card em que esta -- verde ate 1h, azul
// ate 2h, laranja ate 3h, vermelho depois. O de maior tempo assume o topo.
//
// A regra que exige teste de verdade e a dos 60 minutos: no card "Em Arte" o
// tempo NAO se perde numa ida rapida a outro card. Saiu e voltou em ate 60
// minutos, a contagem segue de onde parou; passou disso, volta ao zero. Nos
// demais cards a contagem zera a cada troca.
//
// As funcoes sao recortadas do script.js e executadas com um relogio de mentira,
// para o teste poder adiantar as horas sem esperar por elas.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

function recortarLinha(prefixo) {
    const i = SCRIPT.indexOf(prefixo);
    if (i < 0) throw new Error('nao achei a linha ' + prefixo);
    return SCRIPT.slice(i, SCRIPT.indexOf(';', i) + 1);
}

const CONSTANTES = [
    recortarLinha('const TEMPO_AZUL_SEG'),
    recortarLinha('const TEMPO_LARANJA_SEG'),
    recortarLinha('const TEMPO_VERMELHO_SEG'),
    recortarLinha('const TEMPO_VOLTA_SEM_PERDER_SEG'),
].join('\n');

/** Um `Date` que acha que agora e o instante que o teste mandar. */
function relogioFalso(agoraMs) {
    return class extends Date {
        constructor(...a) { super(...(a.length ? a : [agoraMs])); }
        static now() { return agoraMs; }
    };
}

/** As funcoes reais, com o state e o relogio do caso. */
function montar(state, agoraMs, gravadas) {
    const fonte = [
        CONSTANTES,
        recortar('anotarTempoNoCard'),
        recortar('inicioDoTempoNoCard'),
        recortar('formatarTempoNoCard'),
        recortar('corDoTempoNoCard'),
    ].join('\n');
    return new Function('state', 'Date', 'gravarTemposNoCard',
        fonte + '\nreturn { anotarTempoNoCard, inicioDoTempoNoCard, formatarTempoNoCard, corDoTempoNoCard };')(
        state, relogioFalso(agoraMs), linhas => gravadas.push.apply(gravadas, linhas));
}

const T0 = Date.parse('2026-08-19T08:00:00.000Z');
const MIN = 60 * 1000;
const H = 60 * MIN;

function estadoLimpo() {
    return { temposNoCard: {}, temposNoCardAtivo: true };
}

const VERDE = '#22c55e', AZUL = '#3b82f6', LARANJA = '#f97316', VERMELHO = '#ef4444';

// ─── O primeiro encontro ─────────────────────────────────────────────────────

(function pedidoNuncaVistoComecaAgora() {
    // Nao ha historico de onde tirar um comeco melhor: todos os pedidos que ja
    // existem hoje comecam do zero no dia em que isto for publicado.
    const state = estadoLimpo();
    const gravadas = [];
    montar(state, T0, gravadas).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    const reg = state.temposNoCard[20951];
    ok(!!reg, 'o pedido novo ganha um relogio');
    ok(reg.card === 'fila', 'no card em que ele esta', reg && reg.card);
    ok(Date.parse(reg.desde) === T0, 'contando a partir de agora');
    ok(reg.credito_segundos === 0, 'sem credito nenhum');
    ok(gravadas.length === 1, 'e isso vai para o banco', gravadas.length);
})();

(function pedidoQueNaoMudouNaoEscreveNada() {
    // Escrever a cada desenho encheria a tabela de escrita inutil -- o
    // renderOrdens roda muitas vezes por minuto.
    const state = estadoLimpo();
    const gravadas = [];
    const api = montar(state, T0, gravadas);
    api.anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);
    gravadas.length = 0;

    montar(state, T0 + 5 * MIN, gravadas).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);
    ok(gravadas.length === 0, 'mesmo card, nenhuma escrita', gravadas.length);
    ok(Date.parse(state.temposNoCard[20951].desde) === T0, 'e o relogio nao foi reiniciado');
})();

(function semATabelaNadaAcontece() {
    // Enquanto o SQL nao for rodado no Supabase, a coluna mostra "--" e a lista
    // continua funcionando -- e nao ha tentativa de escrita a cada desenho.
    const state = { temposNoCard: {}, temposNoCardAtivo: false };
    const gravadas = [];
    montar(state, T0, gravadas).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);
    ok(gravadas.length === 0, 'sem a tabela, nao se tenta gravar');
    ok(Object.keys(state.temposNoCard).length === 0, 'e nada e inventado na memoria');
})();

// ─── A regra dos 60 minutos ──────────────────────────────────────────────────

function comPedidoEmArteDesde(state, quando) {
    montar(state, quando, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);
}

(function sairDaArtePausaOCronometro() {
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);

    // 40 minutos depois, o pedido vai para a Fila de Aprovacao.
    montar(state, T0 + 40 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);

    const reg = state.temposNoCard[20951];
    ok(reg.card === 'aprovacao', 'o card mudou');
    ok(reg.credito_segundos === 40 * 60, 'os 40 minutos de arte ficam guardados', reg.credito_segundos);
    ok(Date.parse(reg.saiu_da_fila_em) === T0 + 40 * MIN, 'com a hora da saida anotada');
    ok(Date.parse(reg.desde) === T0 + 40 * MIN, 'e o relogio do card novo comeca do zero');
})();

(function voltarEmAte60MinutosDevolveOTempo() {
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);
    montar(state, T0 + 40 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);

    // Volta 30 minutos depois: dentro do limite.
    const volta = T0 + 70 * MIN;
    const api = montar(state, volta, []);
    api.anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    const reg = state.temposNoCard[20951];
    ok(reg.credito_segundos === 40 * 60, 'o credito volta inteiro', reg.credito_segundos);

    const seg = (volta - api.inicioDoTempoNoCard({ numero: '20951' })) / 1000;
    ok(seg === 40 * 60, 'e a contagem segue de onde parou: 40 minutos', seg);
    ok(api.formatarTempoNoCard(seg) === '00:40', 'mostrando 00:40', api.formatarTempoNoCard(seg));
})();

(function exatamente60MinutosForaAindaDevolve() {
    // O limite e "em ate 60 minutos": os 60 cravados contam como dentro.
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);
    montar(state, T0 + 40 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);
    montar(state, T0 + 100 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    ok(state.temposNoCard[20951].credito_segundos === 40 * 60,
        'com 60 minutos exatos fora, o credito volta', state.temposNoCard[20951].credito_segundos);
})();

(function maisDe60MinutosForaZeraAContagem() {
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);
    montar(state, T0 + 40 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);

    // Volta 61 minutos depois: passou do limite.
    const volta = T0 + 101 * MIN;
    const api = montar(state, volta, []);
    api.anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    const reg = state.temposNoCard[20951];
    ok(reg.credito_segundos === 0, 'o credito e descartado', reg.credito_segundos);

    const seg = (volta - api.inicioDoTempoNoCard({ numero: '20951' })) / 1000;
    ok(seg === 0, 'a contagem recomeca do zero', seg);
    ok(api.corDoTempoNoCard(seg) === VERDE, 'e volta a ser verde', api.corDoTempoNoCard(seg));
})();

(function oTempoForaContaDesdeQueSaiuDaArteEnaoDoUltimoCard() {
    // O pedido pode passear por dois cards antes de voltar. O que decide e ha
    // quanto tempo ele saiu DA ARTE, e nao do card anterior.
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);
    montar(state, T0 + 30 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);
    // 50 minutos depois vai para Aprovados -- ainda fora da arte.
    montar(state, T0 + 80 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovados' }]);
    // e 10 minutos depois volta: 60 min fora da arte no total, dentro do limite.
    montar(state, T0 + 90 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    ok(state.temposNoCard[20951].credito_segundos === 30 * 60,
        'o credito sobrevive a duas trocas em menos de 60 min', state.temposNoCard[20951].credito_segundos);

    // Mesmo passeio, mas demorado: 61 minutos fora da arte.
    const outro = estadoLimpo();
    comPedidoEmArteDesde(outro, T0);
    montar(outro, T0 + 30 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);
    montar(outro, T0 + 80 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovados' }]);
    montar(outro, T0 + 91 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'fila' }]);

    ok(outro.temposNoCard[20951].credito_segundos === 0,
        'mas nao a 61 minutos fora, ainda que repartidos', outro.temposNoCard[20951].credito_segundos);
})();

(function nosOutrosCardsAContagemZeraACadaTroca() {
    const state = estadoLimpo();
    montar(state, T0, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);
    montar(state, T0 + 90 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovados' }]);

    const reg = state.temposNoCard[20951];
    ok(reg.credito_segundos === 0, 'nada e guardado fora da arte', reg.credito_segundos);
    ok(Date.parse(reg.desde) === T0 + 90 * MIN, 'e o relogio recomeca na troca');

    // Volta para a aprovacao 5 minutos depois: zera de novo, sem credito.
    montar(state, T0 + 95 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);
    const api = montar(state, T0 + 95 * MIN, []);
    ok(api.inicioDoTempoNoCard({ numero: '20951' }) === T0 + 95 * MIN,
        'a volta rapida nao devolve tempo fora da arte');
})();

(function oCreditoSoValeNoCardDaArte() {
    // O credito fica gravado na linha enquanto o pedido esta fora. Se ele fosse
    // somado la tambem, o tempo na Fila de Aprovacao apareceria inflado.
    const state = estadoLimpo();
    comPedidoEmArteDesde(state, T0);
    montar(state, T0 + 40 * MIN, []).anotarTempoNoCard([{ numero: '20951', _fila_arte: 'aprovacao' }]);

    const api = montar(state, T0 + 50 * MIN, []);
    const seg = (T0 + 50 * MIN - api.inicioDoTempoNoCard({ numero: '20951' })) / 1000;
    ok(seg === 10 * 60, 'na Fila de Aprovacao ele mostra 10 minutos, e nao 50', seg);
})();

// ─── O que aparece na tela ───────────────────────────────────────────────────

(function oFormatoDoRelogio() {
    const api = montar(estadoLimpo(), T0, []);
    ok(api.formatarTempoNoCard(0) === '00:00', 'comeca em 00:00');
    ok(api.formatarTempoNoCard(65 * 60) === '01:05', '3900 segundos viram 01:05');
    ok(api.formatarTempoNoCard(59) === '00:00', 'menos de um minuto ainda e 00:00');
    ok(api.formatarTempoNoCard(-5) === '00:00', 'relogio negativo nao existe');

    // Passando de um dia continua em horas: "2d 2h" obrigaria a converter de
    // cabeca para comparar com o vizinho da lista.
    ok(api.formatarTempoNoCard(26 * 3600 + 30 * 60) === '26:30', 'mais de um dia continua em horas');
})();

(function asQuatroCores() {
    const api = montar(estadoLimpo(), T0, []);
    ok(api.corDoTempoNoCard(0) === VERDE, 'zero e verde');
    ok(api.corDoTempoNoCard(3599) === VERDE, 'ate 59:59 continua verde');
    ok(api.corDoTempoNoCard(3600) === AZUL, 'em 01:00 vira azul');
    ok(api.corDoTempoNoCard(7199) === AZUL, 'ate 01:59 continua azul');
    ok(api.corDoTempoNoCard(7200) === LARANJA, 'em 02:00 vira laranja');
    ok(api.corDoTempoNoCard(10799) === LARANJA, 'ate 02:59 continua laranja');
    ok(api.corDoTempoNoCard(10800) === VERMELHO, 'em 03:00 vira vermelho');
    ok(api.corDoTempoNoCard(100 * 3600) === VERMELHO, 'e nao ha nada depois do vermelho');
})();

(function aEscalaValeEmTodosOsCards() {
    // Decisao do usuario em 19/08/2026, contra a alternativa de deixar os outros
    // cards em cinza: a mesma escala pinta os cards de trabalho.
    const i = SCRIPT.indexOf('function celulaDeTempoHtml');
    ok(i > 0, 'a celula do tempo mora numa funcao');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(!/_fila_arte|card === 'fila'|card === 'aprova/.test(corpo),
        'e ela nao separa uma fila de trabalho da outra', corpo.slice(0, 200));
    // A cor sai de uma conta so, a dos segundos -- nao de um if por card.
    const cores = corpo.match(/corDoTempoNoCard\(/g) || [];
    ok(cores.length === 1, 'a cor vem de uma chamada so, pelos segundos', cores.length + ' chamada(s)');
})();

// --- Menos o card dos CONCLUIDOS, que nao tem relogio -----------------------
//
// Pedido do usuario em 23/08/2026: "no Card Pedidos Concluidos retirar a
// marcacao de TEMPO, deixar fixo a data hora em que pedido entrou em Producao".
// Ali o trabalho de arte acabou -- um numero que so cresce nao mede nada.

(function osConcluidosMostramOCarimboEmVezDoRelogio() {
    const i = SCRIPT.indexOf('function celulaDeTempoHtml');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(/card === 'concluidos'/.test(corpo),
        'a celula reconhece o pedido que ja esta nos concluidos');
    ok(/celulaDeEntradaEmProducaoHtml\(/.test(corpo),
        'e entrega a ele a celula do carimbo, em vez do relogio');

    const j = SCRIPT.indexOf('function celulaDeEntradaEmProducaoHtml');
    ok(j > 0, 'o carimbo mora numa funcao propria');
    const carimbo = SCRIPT.slice(j, SCRIPT.indexOf('\n}', j));
    ok(carimbo.indexOf('class="celula-tempo"') < 0,
        'a celula do carimbo NAO leva a classe do relogio -- e o que a mantem parada');
    ok(carimbo.indexOf('data-tempo-inicio') < 0,
        'nem o atributo que o tique procura');
    ok(carimbo.indexOf('corDoTempoNoCard') < 0 && carimbo.indexOf('formatarTempoNoCard') < 0,
        'e nao usa nem a cor nem o formato do relogio');
    ok(/formatDateTime\(reg\.desde\)/.test(carimbo),
        'o que ela mostra e a data e a hora guardadas no relogio do card');
})();

(function oTiqueNaoAlcancaOCarimbo() {
    // O tique de meio minuto so procura td.celula-tempo. Se um dia ele passar a
    // varrer a coluna inteira, o carimbo comecaria a andar -- e este teste cai.
    const i = SCRIPT.indexOf('function atualizarRelogiosDaLista');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(/querySelectorAll\('td\.celula-tempo\[data-tempo-inicio\]'\)/.test(corpo),
        'o tique so mexe nas celulas que sao relogio', corpo.slice(0, 200));
})();

(function oTituloDaColunaAcompanha() {
    ['index.html', 'producao.html'].forEach(arq => {
        const html = fs.readFileSync(path.join(RAIZ, 'frontend', arq), 'utf8');
        ok(html.indexOf('id="th-tempo-arte"') > 0,
            arq + ': o titulo da coluna tem nome para ser trocado');
    });
    ok(/thTempoEl\.textContent = listaEhDosConcluidos \? 'Entrou em Produ/.test(SCRIPT),
        'e na lista dos concluidos ele deixa de dizer Tempo');
    // Pelo mesmo sinalizador que escolhe a base da lista: com um filtro de
    // estagio ligado o card continua aceso, mas as linhas ja sao de outra base.
    const iTh = SCRIPT.indexOf("getElementById('th-tempo-arte')");
    const iBase = SCRIPT.indexOf('listaEhDosConcluidos = true;');
    ok(iBase > 0 && iBase < iTh,
        'e esse sinalizador e o mesmo que escolheu a base da lista, decidido antes');
})();

// ─── A lista ─────────────────────────────────────────────────────────────────

(function oDeMaiorTempoFicaNoTopo() {
    const i = SCRIPT.indexOf('filteredArte = filteredArte.slice().sort(');
    ok(i > 0, 'a lista da arte e ordenada pelo tempo');
    const trecho = SCRIPT.slice(i, i + 700);
    ok(trecho.indexOf('inicioDoTempoNoCard(a)') > 0 && trecho.indexOf('inicioDoTempoNoCard(b)') > 0,
        'pelo instante em que o relogio comecou');
    ok(/if \(ia !== ib\) return ia - ib;/.test(trecho),
        'do mais antigo para o mais novo -- ou seja, do maior tempo para o menor');
    ok(/if \(ia === null\) return 1;/.test(trecho),
        'e quem ainda nao tem relogio vai para o fim, em vez de para o topo');
})();

// ─── Menos o card dos CONCLUIDOS, que e historico ────────────────────────────
//
// Pedido do usuario em 23/08/2026: "Na lista de arte, no card Pedidos
// concluidos, listar os pedidos do mais novo ao mais antigo". Nas filas o topo e
// do pedido mais parado, porque e ele que precisa de atencao; ali nao ha nada a
// fazer, e quem abre quer ver o que acabou de sair.

(function osConcluidosSaemDoMaisNovo() {
    const i = SCRIPT.indexOf('\nfunction ordenarConcluidosDoMaisNovo(');
    ok(i > 0, 'a ordem dos concluidos mora numa funcao propria');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
    const ordenar = new Function(corpo + '\nreturn ordenarConcluidosDoMaisNovo;')();

    const lista = [{ numero: '20951' }, { numero: '21085' }, { numero: '20872' }];
    ok(ordenar(lista).map(o => o.numero).join(',') === '21085,20951,20872',
        'o pedido de numero maior -- o mais novo -- abre a lista',
        ordenar(lista).map(o => o.numero));

    ok(lista.map(o => o.numero).join(',') === '20951,21085,20872',
        'e a lista de origem nao e reordenada');

    const comBuraco = ordenar([{ numero: '5' }, { numero: '' }, { numero: '9' }, {}]);
    ok(comBuraco.map(o => o.numero || '-').join(',') === '9,5,-,-',
        'pedido sem numero vai para o fim, em vez de virar zero e encabecar', comBuraco);

    ok(ordenar(null).length === 0 && ordenar([]).length === 0, 'lista vazia nao quebra');

    // De proposito NAO usa o relogio dos cards: ele so existe desde 19/08/2026 e
    // carimba `desde = agora` na primeira vez que ve um pedido, entao todo o
    // historico anterior nasceu com a mesma data e sairia empatado.
    ok(corpo.indexOf('inicioDoTempoNoCard') < 0, 'a ordem dos concluidos nao depende do relogio');

    // E a regra esta presa a BASE dos concluidos, nao ao card aceso: com um
    // filtro de estagio ligado o card continua aceso e a base ja e outra.
    ok(/listaEhDosConcluidos = true;/.test(SCRIPT) && /if \(listaEhDosConcluidos\) \{/.test(SCRIPT),
        'a lista dos concluidos e marcada onde a base e escolhida');
})();

(function oRelogioAndaSemRedesenharATabela() {
    // Redesenhar a lista a cada meio minuto fecharia menu aberto e perderia a
    // rolagem de quem estivesse lendo.
    ok(/setInterval\(atualizarRelogiosDaLista, 30000\)/.test(SCRIPT), 'o relogio anda sozinho');
    const i = SCRIPT.indexOf('function atualizarRelogiosDaLista');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(corpo.indexOf('renderOrdens') < 0, 'e nao chama o desenho da lista');
    ok(corpo.indexOf('data-tempo-inicio') > 0, 'ele so mexe nas celulas de tempo');
    ok(corpo.indexOf('el.style.color') > 0, 'trocando tambem a cor, e nao so o numero');
})();

// ─── A tabela do banco ───────────────────────────────────────────────────────

(function oSqlEstaPronoParaColar() {
    const SQL = fs.readFileSync(path.join(RAIZ, 'sql', 'tempo_no_card.sql'), 'utf8');
    ok(/CREATE TABLE IF NOT EXISTS public\.imposition_tempo_no_card/.test(SQL), 'o SQL cria a tabela');
    ['id_int', 'card', 'desde', 'credito_segundos', 'saiu_da_fila_em'].forEach(col => {
        ok(SQL.indexOf(col) > 0, 'com a coluna ' + col);
    });

    // Sem RLS, a chave publica do painel leria e apagaria a tabela inteira.
    ok(/ENABLE ROW LEVEL SECURITY/.test(SQL), 'com RLS ligado');
    ok(/REVOKE ALL ON public\.imposition_tempo_no_card FROM anon/.test(SQL), 'e o anon de fora');
    ok(/GRANT SELECT, INSERT, UPDATE ON public\.imposition_tempo_no_card TO authenticated/.test(SQL),
        'so o painel logado escreve');

    // O REVOKE do authenticated NAO e redundante, e a conferencia da primeira
    // execucao provou: o Supabase da GRANT ALL a ele em toda tabela nova, por
    // privilegio padrao do esquema. Sem tirar antes, o GRANT acima nao restringe
    // nada e o painel logado fica podendo TRUNCATE a tabela.
    const iRevoke = SQL.indexOf('REVOKE ALL ON public.imposition_tempo_no_card FROM authenticated');
    const iGrant = SQL.indexOf('GRANT SELECT, INSERT, UPDATE ON public.imposition_tempo_no_card TO authenticated');
    ok(iRevoke > 0, 'o privilegio padrao do Supabase e tirado antes');
    ok(iRevoke < iGrant, 'e tirado ANTES do grant, senao o grant e que seria desfeito');

    // O CHECK impede que um card novo do painel entre aqui calado.
    ok(/CHECK \(card IN \('fila', 'aprovacao', 'aprovados', 'concluidos'\)\)/.test(SQL),
        'e os quatro cards sao os mesmos da classificacao');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
