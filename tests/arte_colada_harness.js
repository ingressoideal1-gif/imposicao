// A marca de "esta arte veio de outro modelo", na lista de arte do pedido.
//
// Pedido do usuario em 04/09/2026: quando o operador usa o botao COLAR (o
// 📥) para trazer a arte de outro modelo, o icone tem de ficar com um fio
// verde, para que se enxergue que a arte dali nao e propria. Ele aprovou
// marcar TAMBEM o lado que cedeu (o 🔗) e por um selo em texto no cabecalho
// do card.
//
// Nada disso e gravado no banco. A descoberta e feita na hora de desenhar a
// tela, a partir de dois fatos que o dado ja carrega:
//
//   1. o nome do arquivo guarda a origem -- todo upload vira
//      `arte_<face>_<pedido>_<modelo>_<timestamp>.<ext>`;
//   2. dois modelos com a MESMA url so podem ter chegado ali por colagem,
//      porque cada upload gera um nome unico (tem o timestamp dentro).
//
// A vantagem sobre uma coluna nova: vale retroativamente para os pedidos que
// ja foram colados, e a marca SOME sozinha quando o operador envia uma arte
// nova por cima -- uma coluna salva continuaria mentindo.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. o nome do arquivo e lido certo, inclusive com pedido/uuid com hifen,
//      e um nome que nao segue o padrao nao inventa dono;
//   2. modelo que colou aparece como 'colada', com o nome de quem cedeu;
//   3. modelo que cedeu aparece como 'cedida', listando quem recebeu;
//   4. modelo com arte propria e sozinha nao ganha marca nenhuma -- falso
//      positivo aqui poluiria todo card do sistema;
//   5. frente e verso sao contados separado;
//   6. arte vinda de outro pedido e reconhecida mesmo sem o modelo na lista;
//   7. arte antiga, sem o padrao no nome, ainda e pega pela url repetida;
//   8. os tres botoes COLAR e os dois COPIAR da tela usam a marca, e o
//      cabecalho ganha o selo.
//
// Roda em node, sem navegador: `node tests/arte_colada_harness.js`.
// Os trechos sao LIDOS do codigo vivo, nao copiados.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const CODIGO = [
    extrairFuncao(SCRIPT, 'donoDaArteNaUrl'),
    extrairFuncao(SCRIPT, 'origemDaArteDoModelo'),
    extrairFuncao(SCRIPT, 'textoDaOrigemDaArte'),
    'module.exports = { donoDaArteNaUrl, origemDaArteDoModelo, textoDaOrigemDaArte };',
].join('\n');

const modulo = { exports: {} };
new Function('module', 'exports', 'window', CODIGO)(modulo, modulo.exports, {});
const { donoDaArteNaUrl, origemDaArteDoModelo, textoDaOrigemDaArte } = modulo.exports;

const BASE = 'https://xyz.supabase.co/storage/v1/object/public/artes/';
const urlDe = (face, pedido, modelo, ts) => BASE + 'arte_' + face + '_' + pedido + '_' + modelo + '_' + ts + '.pdf';

// --- 1. O nome do arquivo diz de quem a arte e -------------------------------

(function oNomeDoArquivoGuardaAOrigem() {
    const d = donoDaArteNaUrl(urlDe('frente', '8123', '4501', 1756900000000));
    ok(d && d.pedido === '8123', 'o pedido sai do nome do arquivo', d);
    ok(d && d.modelo === '4501', 'o modelo sai do nome do arquivo', d);

    // O id do pedido pode ser um uuid com hifens: o pedaco do meio e o que
    // "sobra", entao ele nao pode comer o id do modelo.
    const uuid = donoDaArteNaUrl(urlDe('verso', 'a1b2-c3d4-e5f6', '77', 1756900000001));
    ok(uuid && uuid.pedido === 'a1b2-c3d4-e5f6', 'pedido com hifen fica inteiro', uuid);
    ok(uuid && uuid.modelo === '77', 'e o modelo continua sendo o penultimo pedaco', uuid);

    ok(donoDaArteNaUrl(BASE + 'catalogo_antigo.pdf') === null,
        'arquivo fora do padrao nao inventa dono');
    ok(donoDaArteNaUrl('') === null, 'url vazia nao quebra');
    ok(donoDaArteNaUrl(null) === null, 'url nula nao quebra');

    // A url pode vir com ?t=... de cache; o nome tem de ser lido mesmo assim.
    const comQuery = donoDaArteNaUrl(urlDe('frente', '9', '12', 1756900000002) + '?t=99');
    ok(comQuery && comQuery.modelo === '12', 'query string nao atrapalha', comQuery);
})();

// --- 2 e 3. Os dois lados da colagem -----------------------------------------

const A = { id: '4501', produto: 'Ingresso Pista', arte_url: urlDe('frente', '8123', '4501', 1756900000000) };
const B = { id: '4502', produto: 'Ingresso Camarote', arte_url: A.arte_url };
const C = { id: '4503', produto: 'Cortesia', arte_url: urlDe('frente', '8123', '4503', 1756900000100) };
const PEDIDO = [A, B, C];

(function quemColouEQuemCedeu() {
    const oB = origemDaArteDoModelo(B, 'frente', PEDIDO, '8123');
    ok(oB && oB.papel === 'colada', 'o modelo que colou aparece como colada', oB);
    ok(oB && oB.nome === 'Ingresso Pista', 'e diz o nome de quem cedeu', oB);
    ok(oB && oB.id === '4501', 'e o id de quem cedeu', oB);

    const oA = origemDaArteDoModelo(A, 'frente', PEDIDO, '8123');
    ok(oA && oA.papel === 'cedida', 'o modelo de origem aparece como cedida', oA);
    ok(oA && oA.nome === 'Ingresso Camarote', 'listando quem recebeu', oA);

    // 4. O modelo com arte propria e sozinha nao ganha marca nenhuma.
    ok(origemDaArteDoModelo(C, 'frente', PEDIDO, '8123') === null,
        'arte propria e sozinha nao e marcada');
    ok(origemDaArteDoModelo({ id: '9', produto: 'Sem arte' }, 'frente', PEDIDO, '8123') === null,
        'modelo sem arte nao e marcado');
})();

// --- 5. Frente e verso sao contados separado ---------------------------------

(function frenteEVersoNaoSeMisturam() {
    const D = {
        id: '600', produto: 'Credencial',
        arte_url: urlDe('frente', '8123', '600', 1756900000200),      // propria
        verso_arte_url: urlDe('verso', '8123', '601', 1756900000300),  // colada
    };
    const E = { id: '601', produto: 'Credencial Staff', verso_arte_url: D.verso_arte_url };
    const lista = [D, E];

    ok(origemDaArteDoModelo(D, 'frente', lista, '8123') === null,
        'a frente propria continua limpa');
    const v = origemDaArteDoModelo(D, 'verso', lista, '8123');
    ok(v && v.papel === 'colada' && v.nome === 'Credencial Staff',
        'e so o verso e marcado como colado', v);

    // O mesmo arquivo na frente e no verso do PROPRIO modelo nao e colagem
    // de outro modelo -- a arte continua sendo daquele modelo.
    const F = { id: '700', produto: 'Etiqueta' };
    F.arte_url = urlDe('frente', '8123', '700', 1756900000400);
    F.verso_arte_url = F.arte_url;
    ok(origemDaArteDoModelo(F, 'verso', [F], '8123') === null,
        'reaproveitar a propria arte no verso nao vira marca');
})();

// --- 6. Arte vinda de outro pedido -------------------------------------------

(function arteDeOutroPedido() {
    const G = { id: '800', produto: 'Ingresso Lote 2', arte_url: urlDe('frente', '7000', '111', 1756900000500) };
    const o = origemDaArteDoModelo(G, 'frente', [G], '8123');
    ok(o && o.papel === 'colada', 'arte de outro pedido tambem e colada', o);
    ok(o && !o.nome, 'sem o modelo na lista, nao ha nome a mostrar', o);
    ok(o && o.pedido === '7000', 'mas o pedido de origem e conhecido', o);

    const t = textoDaOrigemDaArte(o, 'frente', '8123');
    ok(/7000/.test(t), 'e o texto do selo cita o pedido de origem', t);
})();

// --- 7. Arte antiga, sem o padrao no nome ------------------------------------

(function arteAntigaAindaEPegaPelaUrlRepetida() {
    const solta = BASE + 'arte_do_cliente_final.pdf';
    const H = { id: '900', produto: 'Voucher', arte_url: solta };
    const I = { id: '901', produto: 'Voucher VIP', arte_url: solta };
    const lista = [H, I];

    const oH = origemDaArteDoModelo(H, 'frente', lista, '8123');
    const oI = origemDaArteDoModelo(I, 'frente', lista, '8123');
    ok(oH && oH.papel === 'cedida', 'o de menor id desempata como origem', oH);
    ok(oI && oI.papel === 'colada' && oI.nome === 'Voucher',
        'e o outro fica como colado dele', oI);

    // Uma url fora do padrao que so um modelo usa nao e colagem.
    ok(origemDaArteDoModelo({ id: '950', produto: 'Solto', arte_url: BASE + 'unico.pdf' }, 'frente', [], '8123') === null,
        'url fora do padrao usada por um modelo so nao e marcada');
})();

// --- 8. A tela usa a marca ---------------------------------------------------

(function osTextosDoSelo() {
    const colada = { papel: 'colada', id: '1', nome: 'Ingresso Pista', pedido: '8123' };
    const tf = textoDaOrigemDaArte(colada, 'frente', '8123');
    ok(/Ingresso Pista/.test(tf), 'o texto da colagem cita o modelo de origem', tf);

    const cedida = { papel: 'cedida', id: '2', nome: 'Ingresso Camarote', pedido: '8123' };
    const tc = textoDaOrigemDaArte(cedida, 'frente', '8123');
    ok(/Ingresso Camarote/.test(tc), 'o texto de quem cedeu cita o destino', tc);
    ok(tf !== tc, 'os dois lados nao dizem a mesma coisa', { tf, tc });

    ok(textoDaOrigemDaArte(null, 'frente', '8123') === '', 'sem origem, sem texto');
})();

(function aTelaChamaTudoIsso() {
    const i = SCRIPT.indexOf('function renderAmostrasOSItens(');
    ok(i > 0, 'renderAmostrasOSItens existe');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\nfunction ', i + 40));

    ok(/const\s+origemArteFrente\s*=\s*origemDaArteDoModelo\(/.test(trecho),
        'o card calcula a origem da arte da frente');
    ok(/const\s+origemArteVerso\s*=\s*origemDaArteDoModelo\(/.test(trecho),
        'e a do verso');

    // Os tres botoes COLAR da tela (frente com verso, verso, e frente sem
    // verso) tem de sair pela marca -- deixar um de fora e justamente o card
    // que mentiria.
    const colares = trecho.match(/onclick="colarArte\(/g) || [];
    ok(colares.length === 3, 'a tela ainda tem os tres botoes de colar', colares.length);
    const marcados = trecho.match(/\$\{marcaDeArteColada\(/g) || [];
    ok(marcados.length === 3, 'e os tres recebem a marca', marcados.length);

    const copias = trecho.match(/onclick="copiarArte\(/g) || [];
    ok(copias.length === 3, 'a tela ainda tem os tres botoes de copiar', copias.length);
    const marcadosCopia = trecho.match(/\$\{marcaDeArteCedida\(/g) || [];
    ok(marcadosCopia.length === 3, 'e os tres recebem a marca de cedida', marcadosCopia.length);

    ok(trecho.indexOf('${selosDeArteCompartilhada}') > 0,
        'o cabecalho do card mostra o selo em texto');
    ok(/selosDeArteCompartilhada\s*=\s*seloDeArte\([^)]*'frente'[^)]*\)\s*\+\s*seloDeArte\([^)]*'verso'[^)]*\)/.test(trecho),
        'com um selo por face, porque frente e verso podem ter origens diferentes');

    // A frase explica o FIO VERDE, entao so pode entrar no botao que esta
    // verde. No outro, o titulo tem de continuar dizendo o que o botao faz --
    // senao o operador passa o mouse no COLAR e le uma frase sobre a arte que
    // ja esta ali, sem saber para que serve o botao.
    const titulosColar = trecho.match(/tituloDeArte\([^)]*'Colar[^)]*\)/g) || [];
    ok(titulosColar.length === 3 && titulosColar.every(t => /'colada'/.test(t)),
        'o titulo do COLAR so troca quando a arte foi colada', titulosColar);
    const titulosCopiar = trecho.match(/tituloDeArte\([^)]*'Copiar[^)]*\)/g) || [];
    ok(titulosCopiar.length === 3 && titulosCopiar.every(t => /'cedida'/.test(t)),
        'e o do COPIAR so quando a arte foi cedida', titulosCopiar);

    // A marca precisa ter onde ser reposta sem redesenhar o card.
    ok(trecho.indexOf('id="btn-paste-amostra-arte-${idx}"') > 0,
        'o botao colar da frente tem id');
    ok(trecho.indexOf('id="btn-paste-amostra-arte-verso-${idx}"') > 0,
        'o botao colar do verso tem id');
    ok(trecho.indexOf('id="selos-arte-${idx}"') > 0,
        'e o selo tem uma caixa com id');
})();

(function aMarcaEUmaClasseComCorNoCss() {
    const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
    const i = CSS.indexOf('.arte-compartilhada {');
    ok(i > 0, 'a classe existe no style.css');
    const regra = CSS.slice(i, i + 400);
    ok(/#22c55e/.test(regra), 'e o fio dela e verde', regra.slice(0, 160));
    ok(/border[^;]*!important/.test(regra),
        'com !important, senao o estilo inline do botao vence o fio');
})();

(function aMarcaSeAtualizaSemRedesenharOCard() {
    ok(SCRIPT.indexOf('function atualizarMarcasDeArteCompartilhada(') > 0,
        'a funcao que repoe as marcas existe');

    // Os tres caminhos que mudam o vinculo: colar, enviar arte nova por cima
    // e remover. Cada um muda a marca de DOIS modelos.
    const chamadas = SCRIPT.match(/atualizarMarcasDeArteCompartilhada\(osId\);/g) || [];
    ok(chamadas.length === 3,
        'colar, enviar e remover repoem as marcas', chamadas.length);

    ['colarArte', 'onItemArteUpload', 'onItemArteRemove'].forEach(nome => {
        const i = SCRIPT.indexOf(nome + ' = async function') > 0
            ? SCRIPT.indexOf(nome + ' = async function')
            : SCRIPT.indexOf('function ' + nome + '(');
        ok(i > 0, 'achei ' + nome);
        const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
        ok(corpo.indexOf('atualizarMarcasDeArteCompartilhada(osId)') > 0,
            nome + ' repoe as marcas');
    });

    // Redesenhar o card inteiro dispara os onchange de Cor e Numeracao, e ja
    // se gravou amostra_cor_id = null por engano assim.
    const i = SCRIPT.indexOf('function atualizarMarcasDeArteCompartilhada(');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}\n', i));
    ok(corpo.indexOf('renderAmostrasOSItens') < 0,
        'e nao redesenha os cards para isso');

    // A mesma regra do desenho: a frase acompanha o fio verde, nao o botao.
    ok(/colar\.title\s*=\s*colada\s*\?/.test(corpo),
        'o titulo reposto no COLAR segue a marca de colada');
    ok(/copiar\.title\s*=\s*cedida\s*\?/.test(corpo),
        'e o do COPIAR segue a marca de cedida');
})();

// --- Resultado ---------------------------------------------------------------

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('OK: arte colada de outro modelo -- ' + total + ' verificacoes, todas passaram.');
