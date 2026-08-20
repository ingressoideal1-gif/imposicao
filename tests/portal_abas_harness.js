// O casco do Portal do Pedido: o selo do status e as cinco abas.
//
// O status do pedido chega do banco em SEIS grafias diferentes, porque a coluna
// `pedidos_links_cliente.status_arte` e texto livre e foi escrita por tres
// telas ao longo de um ano. Lido no banco em 20/08/2026, nos 50 links:
//
//     EM PRODUCAO (29), APROVADO (7), Em Arte (5), nulo (5),
//     Enviar Arte (2), "Aguard. Aprovacao" (2)
//
// E a documentacao ainda fala de `ARTE_APROVADA`, `ARTE_EM_CORRECAO` e
// `Enviar ARTE`, que o codigo antigo escrevia. Nenhuma dessas grafias pode
// deixar o cliente numa tela em branco: e por isso que a traducao para o selo e
// uma funcao so, com teste, em vez de uma cadeia de `if` espalhada.
//
// Roda em node: `node tests/portal_abas_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-shell.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.html'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = fonte.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return fonte.slice(i, fim + 2);
}

/**
 * Uma declaracao `const NOME = ...;` do fonte, recortada inteira.
 *
 * Conta colchetes e chaves em vez de procurar um fim fixo: a tabela pode caber
 * numa linha (`const SECOES = ['arte', ...];`) ou ocupar dez.
 */
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

function carregar(nomes, alvo) {
    const corpo = nomes.map(n => (n === n.toUpperCase()
        ? extrairTabela(SHELL, n)
        : extrairFuncao(SHELL, n))).join('\n');
    return new Function(corpo + '\nreturn ' + alvo + ';')();
}

const seloDoStatus = carregar(['semAcento', 'seloDoStatus'], 'seloDoStatus');
const SECOES = carregar(['SECOES'], 'SECOES');
const secaoValida = carregar(['SECOES', 'secaoValida'], 'secaoValida');

// ─── 1. O selo entende as seis grafias que existem no banco ─────────────────

(function oQuePedeAprovacao() {
    ok(seloDoStatus('Enviar Arte').chave === 'aprovar', 'Enviar Arte');
    ok(seloDoStatus('Enviar ARTE').chave === 'aprovar', 'Enviar ARTE, a grafia antiga');
    ok(seloDoStatus('Aguard. Aprovação').chave === 'aprovar', 'com acento');
    ok(seloDoStatus('Aguard. Aprovacao').chave === 'aprovar', 'sem acento');
    ok(seloDoStatus('AGUARDANDO_APROVACAO').chave === 'aprovar', 'a grafia de codigo');
})();

(function oQueJaFoiAprovado() {
    ok(seloDoStatus('APROVADO').chave === 'aprovado', 'APROVADO');
    ok(seloDoStatus('APROVADA_CLIENTE').chave === 'aprovado', 'a marca de quem aprovou');
    ok(seloDoStatus('Arte APROVADA').chave === 'aprovado', 'a grafia da documentacao');
})();

(function oQuePediuAlteracao() {
    ok(seloDoStatus('Em Alteração').chave === 'correcao', 'Em Alteracao, o valor que a tela escreve');
    ok(seloDoStatus('REPROVADO').chave === 'correcao', 'REPROVADO');
    ok(seloDoStatus('ARTE_EM_CORRECAO').chave === 'correcao', 'a grafia antiga');
})();

(function oQueJaEstaNaMaquina() {
    ok(seloDoStatus('EM PRODUCAO').chave === 'producao', 'EM PRODUCAO, o status de 29 dos 50 links');
    ok(seloDoStatus('EM PRODUÇÃO').chave === 'producao', 'com cedilha');
    ok(seloDoStatus('EM IMPRESSÃO').chave === 'producao', 'em impressao tambem esta na maquina');
})();

(function oRestoEstaSendoPreparado() {
    ok(seloDoStatus('Em Arte').chave === 'preparando', 'Em Arte');
    ok(seloDoStatus(null).chave === 'preparando', 'nulo -- 5 links do banco estao assim');
    ok(seloDoStatus('').chave === 'preparando', 'vazio');
    ok(seloDoStatus('QUALQUER COISA NOVA').chave === 'preparando',
        'status desconhecido nao deixa o cliente numa tela em branco');
    ok(seloDoStatus('  Em Arte  ').chave === 'preparando', 'espaco em volta nao muda nada');
})();

(function oSeloTemTextoEmPortugues() {
    ['Enviar Arte', 'APROVADO', 'Em Alteração', 'EM PRODUCAO', 'Em Arte', null].forEach(s => {
        const selo = seloDoStatus(s);
        ok(typeof selo.texto === 'string' && selo.texto.length > 3,
            'o selo de ' + s + ' tem frase', selo);
        ok(typeof selo.cor === 'string' && selo.cor.length > 0,
            'e tem cor', selo);
    });
})();

// ─── 2. As cinco secoes ──────────────────────────────────────────────────────

(function saoCincoENaOrdemDaBarra() {
    ok(SECOES.length === 5, 'cinco secoes', SECOES.length);
    ok(SECOES.join(',') === 'arte,entrega,faturamento,orcamento,pagamento',
        'e nesta ordem', SECOES.join(','));
})();

(function secaoDesconhecidaNaoAbre() {
    SECOES.forEach(s => ok(secaoValida(s) === true, s + ' e valida'));
    ok(secaoValida('financeiro') === false, 'nome inventado');
    ok(secaoValida('') === false, 'vazio');
    ok(secaoValida(null) === false, 'nulo');
    // O hash da URL e escrito pelo cliente, e chega pelo WhatsApp: ele pode vir
    // com qualquer coisa dentro.
    ok(secaoValida('<img src=x onerror=alert(1)>') === false, 'e nada que venha do hash');
})();

// ─── 3. O HTML tem os cinco destinos, com rotulo em texto ───────────────────

(function aBarraExisteNoHtml() {
    ok(/id="portal-abas"/.test(HTML), 'a barra de abas esta na pagina');
    SECOES.forEach(s => {
        ok(HTML.indexOf('data-abre="' + s + '"') > 0, 'a aba ' + s + ' tem botao');
        ok(HTML.indexOf('id="secao-' + s + '"') > 0, 'e a secao ' + s + ' tem lugar');
    });
})();

(function todaAbaTemRotuloEmTexto() {
    // Icone sozinho nao diz para onde leva. Controle novo neste projeto precisa
    // de rotulo em texto.
    const rotulos = HTML.match(/class="portal-aba-rotulo"[^>]*>([^<]+)</g) || [];
    ok(rotulos.length === 5, 'cinco rotulos em texto', rotulos.length);
})();

// ─── 4. A aba da arte existe em todos os status ─────────────────────────────
//
// Ate 20/08/2026 a arte sumia da tela depois de aprovada: o cliente nao tinha
// mais como olhar o que aprovou. Agora a aba existe sempre -- e o que muda e o
// MODO, com decisao ou so leitura.

const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
const SECAO_ARTE = extrairFuncao(CLIENTE, 'desenharSecaoArte');

(function todasAsCincoChavesTemTratamento() {
    ['aprovar', 'aprovado', 'producao', 'correcao'].forEach(chave => {
        ok(SECAO_ARTE.indexOf("'" + chave + "'") > 0, 'a chave ' + chave + ' e tratada');
    });
    // `preparando` e o ramo final, sem `if`: e ele que pega tambem o status que
    // o ERP inventar amanha.
    ok(/Arte em prepara/.test(SECAO_ARTE), 'e sobra o caso de preparacao');
})();

(function soAAprovacaoDeixaDecidir() {
    ok(/arteSomenteLeitura = false/.test(SECAO_ARTE), 'aprovar libera a decisao');
    ok(/arteSomenteLeitura = true/.test(SECAO_ARTE), 'e o resto e so leitura');
})();

(function oQueJaFoiDecididoContinuaAVista() {
    // Aprovado e em producao REDESENHAM as artes, e nao so a frase: e para isso
    // que o cliente volta ao link.
    const trecho = SECAO_ARTE.slice(SECAO_ARTE.indexOf('arteSomenteLeitura = true'));
    ok((trecho.match(/renderAmostrasOSItens/g) || []).length >= 3,
        'aprovado, em producao e em correcao continuam mostrando a arte');
})();

(function soLeituraTiraOsBotoesEABarra() {
    ok(/somenteLeitura \? '' : `/.test(CLIENTE),
        'a caixa de observacao some quando nao ha mais o que decidir');
    ok(/somenteLeitura \? 'hidden' : ''/.test(CLIENTE),
        'e os botoes APROVAR/ALTERAR tambem');
    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    ok(/arteSomenteLeitura === true/.test(barra),
        'o botao de finalizar nao reaparece embaixo de arte ja aprovada');
})();

(function aPaginaNaoDecideMaisSeAbre() {
    // A trava antiga: so `Enviar Arte`/`Aguard. Aprovacao`/entrega ALTERADO
    // mostravam alguma coisa. 36 dos 50 links do banco caiam fora dela.
    ok(CLIENTE.indexOf('isAguardandoAprovacao') < 0, 'a trava de status saiu');
    ok(CLIENTE.indexOf('isEntregaAlterada') < 0, 'e a de entrega alterada tambem');
    ok(/registrarSecao\('arte'/.test(CLIENTE), 'a arte virou uma secao registrada');
    ok(/montarPortal\(/.test(CLIENTE), 'e o portal e montado sempre');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log(total + ' verificacoes passaram.');
