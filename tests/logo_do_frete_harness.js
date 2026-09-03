// A logo da forma de envio, a mesma no painel e na pagina do cliente.
//
// Em 20/08/2026 o usuario pediu, na aba de Entrega do Portal do Pedido, as
// mesmas logos que o Painel de Producao ja mostra na coluna de frete. Elas
// passaram a morar num arquivo so -- antes eram um mapa preso dentro de uma
// funcao de desenho do `script.js`.
//
// O que este harness prende e o que se perde ao duplicar: o painel PRECISA
// continuar achando as mesmas logos que achava, e a busca por trecho e o motivo
// de `VEPPO-RS` e `SAO MIGUEL` funcionarem.
//
// Roda em node: `node tests/logo_do_frete_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const LOGO = fs.readFileSync(path.join(RAIZ, 'frontend', 'logo-do-frete.js'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const ENTREGA = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-entrega.js'), 'utf8');
const HTML_PAINEL = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const HTML_CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.html'), 'utf8');
const ACABAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'acabamento.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortar(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

function extrairTabela(fonte, nome) {
    const i = fonte.indexOf('\nconst ' + nome + ' = ');
    if (i < 0) throw new Error('nao achei a tabela ' + nome);
    let p = 0;
    for (let j = fonte.indexOf('=', i); j < fonte.length; j++) {
        const c = fonte[j];
        if (c === '[' || c === '{') p++;
        else if (c === ']' || c === '}') p--;
        else if (c === ';' && p === 0) return fonte.slice(i, j + 1);
    }
    throw new Error('nao achei o fim da tabela ' + nome);
}

const ESCAPA = 'function escapeHtml(v) { return String(v === null || v === undefined ? "" : v)'
    + '.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")'
    + '.replace(/"/g, "&quot;"); }';

const logoDoFrete = new Function(
    extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\n'
    + recortar(LOGO, 'normalizarFrete') + '\n'
    + recortar(LOGO, 'logoDoFrete') + '\nreturn logoDoFrete;')();

const logoDoFreteHtml = new Function(
    ESCAPA + '\n' + extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\n'
    + recortar(LOGO, 'normalizarFrete') + '\n'
    + recortar(LOGO, 'logoDoFrete') + '\n'
    + recortar(LOGO, 'logoDoFreteHtml') + '\nreturn logoDoFreteHtml;')();

// ─── 1. As grafias que o ERP escreve de verdade ─────────────────────────────

(function asGrafiasExatas() {
    ok(/Sedex/.test(logoDoFrete('SEDEX')), 'SEDEX', logoDoFrete('SEDEX'));
    ok(/Motoboy/.test(logoDoFrete('MOTOBOY')), 'MOTOBOY');
    ok(/Retira/.test(logoDoFrete('RETIRADA')), 'RETIRADA');
    ok(/Retira/.test(logoDoFrete('RETIRAR')), 'RETIRAR');
    ok(/Retira/.test(logoDoFrete('Retirada Local')), 'Retirada Local');
    ok(/Veppo/.test(logoDoFrete('VEPPO')), 'VEPPO');
})();

(function aCaixaNaoImporta() {
    // O parceiro ja escreveu VEPPO, veppo e Veppo no mesmo campo.
    ok(logoDoFrete('veppo') === logoDoFrete('VEPPO'), 'minuscula');
    ok(logoDoFrete('Veppo') === logoDoFrete('VEPPO'), 'capitalizado');
    ok(logoDoFrete('  sedex  ') === logoDoFrete('SEDEX'), 'com espaco em volta');
})();

(function aBuscaPorTrechoSalvaOsNomesCompostos() {
    // Sem ela, `VEPPO-RS` e os nomes compostos ficariam sem logo.
    ok(logoDoFrete('VEPPO-RS') === logoDoFrete('VEPPO'), 'VEPPO-RS acha a Veppo');
    ok(/Sao-Miguel/.test(logoDoFrete('TRANSPORTADORA SÃO MIGUEL')), 'o nome inteiro');
})();

(function asSeisGrafiasDaSaoMiguelCaemNaMesmaLogo() {
    // Todas medidas no banco em 03/09/2026. As tres ultimas -- 5 pedidos --
    // ficavam SEM LOGO ate aquele dia: a chave tinha til e a comparacao era
    // letra a letra, entao `SAO` nunca encontrava `SÃO`.
    const esperada = logoDoFrete('TRANSPORTADORA SÃO MIGUEL');
    ok(/Sao-Miguel/.test(esperada), 'a logo da Sao Miguel existe', esperada);
    [
        'Transportadora São Miguel',
        'SÃO MIGUEL',
        'São Miguel',
        'EXPRESSO SAO MIGUEL S/A',
        'EXPRESSO SÃO MIGUEL',
        'Expresso São Miguel'
    ].forEach(g => ok(logoDoFrete(g) === esperada, 'grafia: ' + g, logoDoFrete(g)));
})();

(function aBraspressTemLogo() {
    // Mandada pelo usuario em 03/09/2026, com as duas grafias que o ERP escreve.
    const esperada = logoDoFrete('BRASPRESS');
    ok(/Braspress/.test(esperada), 'BRASPRESS', esperada);
    ok(logoDoFrete('Braspress') === esperada, 'Braspress');
})();

(function aChaveMaisLongaVence() {
    // Duas chaves podem casar com o mesmo texto por trecho. Quem decide e o
    // COMPRIMENTO, e nao a ordem em que foram escritas no objeto -- ordem de
    // escrita e uma decisao que ninguem tomou de proposito.
    ok(logoDoFrete('RETIRADA LOCAL') === logoDoFrete('RETIRADA'),
        'RETIRADA LOCAL e RETIRADA apontam para a mesma logo hoje');
})();

(function semLogoDevolveNulo() {
    // Nulo e resposta legitima: transportadora sem logo aparece pelo NOME, e nao
    // como uma imagem quebrada.
    ok(logoDoFrete('Transportadora Parceira') === null, 'transportadora sem logo');
    ok(logoDoFrete('') === null, 'vazio');
    ok(logoDoFrete(null) === null, 'nulo');
})();

// ─── 2. O HTML tem sempre uma saida ─────────────────────────────────────────

(function comLogoSaiImagemComTextoDeReserva() {
    const h = logoDoFreteHtml('SEDEX');
    ok(/<img /.test(h), 'sai a imagem', h);
    ok(/onerror=/.test(h), 'com onerror: o bucket pode nao responder no 4G do cliente');
    ok(/display: none/.test(h), 'e o nome escrito fica escondido, esperando');
    ok(h.indexOf('SEDEX') > 0, 'o nome aparece no alt e no texto de reserva');
})();

(function semLogoSaiOSelo() {
    const h = logoDoFreteHtml('Transportadora Parceira');
    ok(!/<img /.test(h), 'sem imagem quebrada', h);
    ok(h.indexOf('Transportadora Parceira') > 0, 'mas com o nome', h);
})();

(function oNomeVindoDoBancoEEscapado() {
    // `frete_escolhido` e texto livre do ERP e vai para dentro de innerHTML.
    const h = logoDoFreteHtml('<script>alert(1)</script>');
    ok(h.indexOf('<script') < 0, 'a tag nao chega viva ao DOM', h);
})();

(function aAlturaEEscolhidaPorQuemChama() {
    ok(/height: 28px/.test(logoDoFreteHtml('SEDEX')), 'o padrao e o do painel');
    ok(/height: 34px/.test(logoDoFreteHtml('SEDEX', 34)), 'e a pagina do cliente pede maior');
})();

// ─── 3. Os dois lados usam o mesmo arquivo ──────────────────────────────────

(function oPainelNaoTemMaisOMapaPreso() {
    ok(SCRIPT.indexOf('FRETE_IMGS') < 0,
        'o mapa que vivia dentro da funcao de desenho do painel saiu');
    ok(/logoDoFreteHtml\(/.test(SCRIPT), 'e o painel chama a funcao compartilhada');
})();

(function aAbaDeEntregaUsaOMesmoMapa() {
    ok(/logoDoFrete\(/.test(ENTREGA), 'a aba de entrega acha a logo pela mesma funcao');
    // Ela monta a propria imagem, e nao usa o `logoDoFreteHtml`: a linha de
    // baixo ja traz o nome, com o valor do frete junto, e o texto de reserva do
    // painel apareceria duplicado.
    ok(/onerror="this\.remove\(\);"/.test(ENTREGA),
        'e quando a imagem nao carrega, ela some em vez de virar nome repetido');
    // A regra e nao COPIAR os enderecos das transportadoras -- quem sabe onde
    // cada logo mora e o `LOGO_DO_FRETE`, e ter a mesma URL em dois arquivos e
    // ter duas para trocar no dia em que a imagem mudar.
    //
    // A checagem compara os enderecos DE VERDADE, um a um, e nao qualquer coisa
    // que contenha `supabase.co/storage`: desde 25/08/2026 a aba tem tambem a
    // logo do WhatsApp, no botao de atendimento, que nao e transportadora
    // nenhuma e mora aqui por direito.
    const mapa = new Function(
        extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\nreturn LOGO_DO_FRETE;')();
    Object.values(mapa).forEach(url => {
        ok(ENTREGA.indexOf(url) < 0,
            'o endereco de uma logo de transportadora nao foi copiado para ca', url);
    });
})();

(function asDuasPaginasCarregamOArquivo() {
    // Arquivo nao declarado no HTML e uma funcao que nao existe na hora de
    // desenhar -- e a coluna de frete do painel some.
    ok(/logo-do-frete\.js/.test(HTML_PAINEL), 'o painel carrega o arquivo');
    ok(/logo-do-frete\.js/.test(HTML_CLIENTE), 'e a pagina do cliente tambem');
})();

// ─── O rastreio nos Correios ────────────────────────────────────────────────
//
// Pedido do usuario em 25/08/2026: "quando ja existir o link do numero de
// conhecimento do sedex, ao clicar abrir o rastreamento".
//
// `linkDeRastreio` mudou de casa nesse dia -- saiu do `cliente-dados.js` e veio
// para ca --, porque duas telas passaram a mostrar o codigo: a aba de Entrega do
// link do cliente e a coluna Frete do Painel do Acabamento. Este e o modulo que
// as duas ja carregam, e e o lugar tematico: aqui mora o que sabe de
// transportadora.

// O `escapeHtml` de verdade mora no `script.js`/`cliente.js`; aqui ele so
// precisa devolver texto, porque o que se mede e a FORMA do link.
const RASTREIO = new Function('escapeHtml',
    recortar(LOGO, 'linkDeRastreio') + '\n'
    + recortar(LOGO, 'rastreioHtml') + '\n'
    + 'return { linkDeRastreio, rastreioHtml };')(v => String(v == null ? '' : v));

const linkDeRastreio = RASTREIO.linkDeRastreio;
const rastreioHtml = RASTREIO.rastreioHtml;

(function oCodigoViraEnderecoDosCorreios() {
    const l = linkDeRastreio('AD831882537BR');
    ok(/^https:\/\/rastreamento\.correios\.com\.br\//.test(l), 'aponta para os Correios', l);
    ok(l.indexOf('AD831882537BR') > 0, 'com o codigo dentro', l);
    ok(linkDeRastreio('  ad831882537br  ').indexOf('AD831882537BR') > 0,
        'espaco em volta e minuscula nao atrapalham');
})();

(function semCodigoNaoNasceBotaoMorto() {
    // A maioria dos pedidos da tela ainda nao foi postada.
    ok(linkDeRastreio(null) === null, 'nulo');
    ok(linkDeRastreio('') === null, 'vazio');
    ok(linkDeRastreio('   ') === null, 'so espaco');
    ok(rastreioHtml(null) === '', 'o HTML tambem sai vazio, e nao um traco');
    ok(rastreioHtml('   ') === '', 'idem para so espaco');
})();

(function oLinkAbreFORAeNAOabreOPedidoJunto() {
    const h = rastreioHtml('AD831882537BR');
    ok(/target="_blank"/.test(h), 'abre em outra aba');
    ok(/rel="noopener noreferrer"/.test(h), 'sem dar acesso a esta pagina ao site dos Correios');
    // A linha inteira da tabela do Acabamento e clicavel e abre o pedido. Sem
    // isto, tocar no codigo abriria as duas coisas ao mesmo tempo.
    ok(/event\.stopPropagation\(\)/.test(h), 'o clique nao vaza para a linha da tabela');
    ok(/AD831882537BR/.test(h), 'o codigo aparece escrito');
    ok(/title="[^"]*rastrea/i.test(h), 'e o title diz o que o clique faz');
})();

(function asDuasTelasQueMostramOCodigo() {
    ok(/rastreioHtml/.test(ACABAMENTO), 'a coluna Frete do Acabamento usa a funcao compartilhada');
    ok(/linkDeRastreio/.test(ENTREGA), 'e a aba de Entrega do link do cliente tambem');
    ok(!/rastreamento\.correios/.test(ENTREGA) && !/rastreamento\.correios/.test(ACABAMENTO),
        'nenhuma das duas repete o endereco dos Correios por dentro');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias da logo do frete.');
