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
    + recortar(LOGO, 'logoDoFrete') + '\nreturn logoDoFrete;')();

const logoDoFreteHtml = new Function(
    ESCAPA + '\n' + extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\n'
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
    // Sem ela, `VEPPO-RS` e `SAO MIGUEL` ficariam sem logo.
    ok(logoDoFrete('VEPPO-RS') === logoDoFrete('VEPPO'), 'VEPPO-RS acha a Veppo');
    ok(/Sao-Miguel/.test(logoDoFrete('SÃO MIGUEL')), 'SAO MIGUEL acha a Sao Miguel',
        logoDoFrete('SÃO MIGUEL'));
    ok(/Sao-Miguel/.test(logoDoFrete('TRANSPORTADORA SÃO MIGUEL')), 'o nome inteiro tambem');
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
    ok(ENTREGA.indexOf('supabase.co/storage') < 0,
        'o endereco das logos nao foi copiado para ca');
})();

(function asDuasPaginasCarregamOArquivo() {
    // Arquivo nao declarado no HTML e uma funcao que nao existe na hora de
    // desenhar -- e a coluna de frete do painel some.
    ok(/logo-do-frete\.js/.test(HTML_PAINEL), 'o painel carrega o arquivo');
    ok(/logo-do-frete\.js/.test(HTML_CLIENTE), 'e a pagina do cliente tambem');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias da logo do frete.');
