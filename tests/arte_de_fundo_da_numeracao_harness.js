// A arte de fundo guardada na numeracao exclusiva de cliente (26/08/2026).
//
// Regra do usuario: *"quando a numeracao for exclusiva do cliente e for
// carregado uma arte de fundo, ao salvar a numeracao deve salvar a arte de
// fundo (referencia), deve ser persistente"*.
//
// Sao tres perguntas, e cada uma tem uma funcao no script.js:
//
//   1. ESTA numeracao guarda fundo?     numeracaoDoEditorGuardaFundo()
//      So a exclusiva de cliente. A generica do catalogo tira o fundo da COR do
//      formato base, que ja vive em producao_cores — duplicar aquele desenho
//      por numeracao seria manter duas verdades sobre a mesma coisa.
//
//   2. O BANCO ja sabe guardar?          bancoGuardaArteDeFundo()
//      Enquanto o ALTER nao rodar, mandar a coluna faria o PostgREST recusar o
//      registro INTEIRO. A resposta sai de graca: state.numeracoes vem de um
//      select('*'), entao a chave existe em toda linha quando a coluna existe.
//
//   3. O que dizer ao operador?          atualizarAvisoDaArteDeFundo()
//      O comportamento muda conforme a numeracao e nada na tela denunciaria
//      isso: no catalogo o arquivo e descartado ao sair, na do cliente ele
//      fica. Sem a frase, o operador aprenderia a diferenca perdendo trabalho.
//
// As funcoes sao RECORTADAS do script.js e executadas contra um DOM de mentira
// — nao ha copia da regra aqui para envelhecer sozinha.
//
// Roda em node: `node tests/arte_de_fundo_da_numeracao_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// `'\n}'`, e nao `'\n}\n'`: o arquivo tem fim de linha CRLF, entao depois da
// chave vem `\r` e o segundo `\n` nunca casaria — o recorte iria ate o fim do
// arquivo. Mesma armadilha ja documentada no harness da homonima.
function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

const FONTE = ['numeracaoEhCompartilhadaDoCliente', 'bancoGuardaArteDeFundo',
               'numeracaoDoEditorGuardaFundo', 'atualizarAvisoDaArteDeFundo']
    .map(recortar).join('\n');

/**
 * Monta o ambiente e devolve as funcoes vivas.
 *
 * @param cenario.numeracoes  o que esta em state.numeracoes
 * @param cenario.numId       o valor do campo #num-id
 * @param cenario.doModelo    veio do fluxo da numeracao exclusiva de um modelo
 * @param cenario.bgFile      ha arquivo carregado agora
 * @param cenario.bgUrl       ha arquivo ja gravado no Storage
 */
function montar(cenario) {
    const aviso = { textContent: '', style: {} };
    const document = {
        getElementById(id) {
            if (id === 'bg-persistencia-aviso') return aviso;
            if (id === 'num-id') return { value: cenario.numId || '' };
            return null;
        },
    };
    const state = {
        numeracoes: cenario.numeracoes || [],
        bgFile: cenario.bgFile || null,
        bgUrl: cenario.bgUrl || '',
    };
    const window = { customNumeracaoEditState: cenario.doModelo ? { itemId: 'it-99' } : null };

    const fn = new Function('state', 'document', 'window',
        FONTE + '\nreturn { bancoGuardaArteDeFundo, numeracaoDoEditorGuardaFundo, '
              + 'atualizarAvisoDaArteDeFundo, aviso: null };');
    const api = fn(state, document, window);
    api.aviso = aviso;
    return api;
}

const GENERICA = { id: 'n-ger', name: 'Generica', bg_url: '' };
const DO_CLIENTE = { id: 'n-cli', name: 'Camarote VIP', bg_url: '',
                     is_custom: true, Cli_Num: 777, os_item_id: 'it-99' };

// ── 1. O banco ja sabe guardar? ─────────────────────────────────────────────

(function oBancoSabeGuardar() {
    ok(montar({ numeracoes: [GENERICA] }).bancoGuardaArteDeFundo(),
        'com a coluna na linha, o banco sabe guardar');

    const semColuna = { id: 'n-ger', name: 'Generica' };   // sem bg_url nenhum
    ok(!montar({ numeracoes: [semColuna] }).bancoGuardaArteDeFundo(),
        'sem a coluna, o ALTER ainda nao rodou');

    ok(!montar({ numeracoes: [] }).bancoGuardaArteDeFundo(),
        'sem nenhuma linha nao da para afirmar que sabe — falha fechado');

    const vazia = { id: 'n', name: 'x', bg_url: '' };
    ok(montar({ numeracoes: [vazia] }).bancoGuardaArteDeFundo(),
        'coluna VAZIA ainda e coluna: e `hasOwnProperty`, nao `!!valor`');
})();

// ── 2. Esta numeracao guarda fundo? ─────────────────────────────────────────

(function quemGuardaFundo() {
    ok(montar({ numeracoes: [GENERICA, DO_CLIENTE], numId: 'n-cli' }).numeracaoDoEditorGuardaFundo(),
        'a exclusiva de cliente guarda');

    ok(!montar({ numeracoes: [GENERICA, DO_CLIENTE], numId: 'n-ger' }).numeracaoDoEditorGuardaFundo(),
        'a generica do catalogo NAO guarda — o fundo dela e a arte da cor');

    ok(!montar({ numeracoes: [GENERICA, DO_CLIENTE], numId: '' }).numeracaoDoEditorGuardaFundo(),
        'numeracao nova do catalogo ainda nao tem cliente, entao nao guarda');

    ok(montar({ numeracoes: [], numId: '', doModelo: true }).numeracaoDoEditorGuardaFundo(),
        'a que nasce de dentro de um modelo guarda desde o primeiro save');

    ok(!montar({ numeracoes: [GENERICA], numId: 'sumiu' }).numeracaoDoEditorGuardaFundo(),
        'id que nao casa com nada nao guarda, em vez de estourar');
})();

// ── 3. O que a barra diz ────────────────────────────────────────────────────

(function oAvisoDizAVerdade() {
    const catalogo = montar({ numeracoes: [GENERICA], numId: 'n-ger', bgFile: {} });
    catalogo.atualizarAvisoDaArteDeFundo();
    ok(/n(ã|a)o fica salva/i.test(catalogo.aviso.textContent),
        'no catalogo a barra avisa que o arquivo e so de tela', catalogo.aviso.textContent);

    const semSql = montar({ numeracoes: [{ id: 'n-cli', name: 'x', is_custom: true, Cli_Num: 777, os_item_id: 'it-99' }],
                            numId: 'n-cli', bgFile: {} });
    semSql.atualizarAvisoDaArteDeFundo();
    ok(/alter_producao_numeracoes_arte_de_fundo\.sql/.test(semSql.aviso.textContent),
        'sem o ALTER a barra diz QUAL arquivo rodar — a trava tem saida', semSql.aviso.textContent);

    const clienteVazio = montar({ numeracoes: [DO_CLIENTE], numId: 'n-cli' });
    clienteVazio.atualizarAvisoDaArteDeFundo();
    ok(/carregue um arquivo/i.test(clienteVazio.aviso.textContent),
        'na do cliente sem arte, a barra convida a carregar', clienteVazio.aviso.textContent);

    const comArquivo = montar({ numeracoes: [DO_CLIENTE], numId: 'n-cli', bgFile: {} });
    comArquivo.atualizarAvisoDaArteDeFundo();
    ok(/fica salva/.test(comArquivo.aviso.textContent),
        'com arquivo carregado agora, a barra promete que fica', comArquivo.aviso.textContent);

    const comUrl = montar({ numeracoes: [DO_CLIENTE], numId: 'n-cli', bgUrl: 'https://x/y.pdf' });
    comUrl.atualizarAvisoDaArteDeFundo();
    ok(/fica salva/.test(comUrl.aviso.textContent),
        'e com a arte que voltou do banco tambem', comUrl.aviso.textContent);
})();

// ── 4. O bloco do saveNumeracao ─────────────────────────────────────────────
//
// Estatico de proposito: sao as tres decisoes que, quebradas, so aparecem em
// producao — uma numeracao inteira recusada pelo PostgREST, um fundo gravado
// onde nao devia, ou um arquivo sobrescrevendo o de outro registro.

(function oSaveRespeitaAsDuasPerguntas() {
    const i = SCRIPT.indexOf('// ── A arte de fundo (referência) da numeração do cliente');
    ok(i > 0, 'o bloco da arte de fundo continua no saveNumeracao');
    const bloco = SCRIPT.slice(i, i + 2200);

    ok(/const guardaFundo = !!cliNumFinal && bancoGuardaArteDeFundo\(\);/.test(bloco),
        'guardar exige as DUAS coisas: ser do cliente E o banco saber');

    ok(/objectPath: `fundos-numeracoes\/\$\{numeracaoId\}\./.test(bloco),
        'o caminho leva o id do registro — um fundo por numeracao, e nunca o de outra');

    ok(/const avisarFaltaSql = !!\(cliNumFinal && state\.bgFile && !bancoGuardaArteDeFundo\(\)\)/.test(bloco),
        'o aviso e calculado ANTES do save: o cancelNumEdit() zera o state.bgFile');

    const j = SCRIPT.indexOf('if (bancoGuardaArteDeFundo()) {\n            data.bg_url');
    ok(j > 0 || /if \(bancoGuardaArteDeFundo\(\)\) \{\r?\n\s+data\.bg_url/.test(SCRIPT),
        'as colunas so entram no payload quando existem — senao o PostgREST recusa o registro inteiro');
})();

// ── 5. Quem NAO pertence a numeracao ────────────────────────────────────────

(function oFundoDaCorNaoViraDaNumeracao() {
    const i = SCRIPT.indexOf('window.autoLoadCorBg = async function');
    const bloco = SCRIPT.slice(i, SCRIPT.indexOf('\n};', i));
    ok(/state\.bgFile = null;/.test(bloco) && /state\.bgUrl = '';/.test(bloco),
        'autoLoadCorBg zera o vinculo: a arte da COR nao se copia para dentro da numeracao');

    const k = SCRIPT.indexOf('window.clearBgImage = function');
    const limpar = SCRIPT.slice(k, SCRIPT.indexOf('\n};', k));
    ok(/state\.bgFile = null;/.test(limpar) && /state\.bgUrl = '';/.test(limpar),
        'clearBgImage zera os tres, senao remover da tela nao apagaria do banco');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias da arte de fundo da numeracao.');
