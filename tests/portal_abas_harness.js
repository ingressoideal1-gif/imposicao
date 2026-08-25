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

function extrairFuncao(fonte, nome, assincrona) {
    const cabeca = (assincrona ? '\nasync function ' : '\nfunction ') + nome + '(';
    const i = fonte.indexOf(cabeca);
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

(function oCabecalhoTrazALogoDaEmpresa() {
    // Trocada em 20/08/2026: a antiga era o simbolo sozinho, num arquivo local.
    // Esta e a logo da empresa, com o nome e o "INGRESSOS - PULSEIRAS -
    // CREDENCIAIS" -- e quem abre este link e um cliente que precisa reconhecer
    // de quem e a pagina antes de aprovar arte e conferir dados.
    ok(/logo_ideal_2026\.jpg/.test(HTML), 'a logo da empresa esta no cabecalho');
    ok(HTML.indexOf('Logo Ideal Dark.png') < 0, 'e a antiga saiu');
    ok(/class="cliente-logo"/.test(HTML), 'com a classe que o CSS dimensiona');
    // `alt` nao e enfeite: e o que aparece quando a imagem nao carrega, que num
    // 4G ruim acontece.
    ok(/alt="Ingresso Ideal[^"]*"/.test(HTML), 'e com texto alternativo');
})();

// ─── 4. A aba da arte existe em todos os status ─────────────────────────────
//
// Ate 20/08/2026 a arte sumia da tela depois de aprovada: o cliente nao tinha
// mais como olhar o que aprovou. Agora a aba existe sempre -- e o que muda e o
// MODO, com decisao ou so leitura.

const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
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
    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    ok(/arteSomenteLeitura === true/.test(barra),
        'o botao de finalizar nao reaparece embaixo de arte ja aprovada');
})();

(function aBarraDizQuantosModelosFaltam() {
    // Ate 25/08/2026 o cliente de um pedido de sete modelos aprovava quatro,
    // rolava ate o fim e encontrava um botao cinza morto, sem uma palavra
    // explicando por que. Conferido no navegador no pedido 21143: nenhum
    // contador na aba, e o unico texto da barra era o rotulo do botao.
    //
    // As abas de Entrega e Nota sempre disseram o que falta. A da arte era a
    // unica trava do portal sem a saida escrita ao lado.
    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    const desabilitado = barra.slice(barra.lastIndexOf('} else {'));

    ok(/amostra_status !== 'APROVADA'/.test(desabilitado),
        'a barra conta quantos modelos ainda nao foram aprovados');
    ok(/Faltam?\s?</.test(desabilitado) || /Falta <b>1 modelo/.test(desabilitado),
        'e diz isso em texto, acima do botao');
    ok(/faltam === 1/.test(desabilitado),
        'com singular e plural: "Falta 1 modelo" e "Faltam 3 modelos"');
    ok(desabilitado.indexOf('APROVAR') > 0 && desabilitado.indexOf('ALTERAR') > 0,
        'e diz o que fazer para sair da trava, que e a regra desta casa');

    // A barra empilha o recado ACIMA do botao, e nao ao lado dele num monitor.
    ok(/\.cliente-page \.cliente-actions \{[^}]*flex-direction: column/.test(CSS),
        'a barra empilha em coluna');
})();

(function aprovarAUltimaLEVAOClienteParaAEntrega() {
    // Pedido do usuario em 25/08/2026: "ao aprovar todas, deve automaticamente
    // passar a pagina seguinte".
    const seguir = extrairFuncao(CLIENTE, 'seguirSozinhoSeAprovouTudo', true);
    ok(/every\(i => i\.amostra_status === 'APROVADA'\)/.test(seguir),
        'so segue quando TODAS estao aprovadas');
    ok(/arteSomenteLeitura === true\) return/.test(seguir),
        'e nao refaz nada num pedido que ja foi finalizado');
    ok(/clienteFinalizarFluxo\('APROVAR_TUDO'\)/.test(seguir),
        'segue pelo mesmo caminho do botao FINALIZAR');
    ok(/Todas as artes aprovadas/.test(seguir),
        'anunciando o que vai fazer: o que o sistema faz sozinho se explica');
    ok(/setTimeout\(r, \d{3,}\)/.test(seguir),
        'com uma pausa, para o cliente ver o proprio toque antes de a tela trocar');

    // A BANDEIRA, e nao uma corrida com o relogio: o `renderAmostrasOSItens`
    // agenda o `atualizarBarraFinalCliente` para dali a 50ms, e sem ela o botao
    // verde FINALIZAR piscaria por um segundo no meio do caminho.
    ok(/arteSeguindoSozinho = true/.test(seguir), 'levanta a bandeira antes de esperar');
    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    ok(/arteSeguindoSozinho === true\) return/.test(barra),
        'e a barra respeita a bandeira em vez de reescrever por cima');
})();

(function oSaltoNasceDeUmCLIQUE_eNuncaDaCargaDaPagina() {
    // Existem pedidos com todos os modelos ja em APROVADA_CLIENTE e status
    // ainda em `Aguard. Aprovacao` -- o 21112 e um. Se o avanco fosse decidido
    // pelo ESTADO, esse cliente abriria o link e seria empurrado para a aba de
    // Entrega antes de ver a arte, gravando aprovacao e mensagem no chat do
    // parceiro sem ter tocado em nada.
    const decisao = extrairFuncao(CLIENTE, 'decisionAmostraItem', true);
    ok(/seguirSozinhoSeAprovouTudo\(osId\)/.test(decisao),
        'quem chama o salto e a decisao do item');

    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    ok(barra.indexOf('seguirSozinhoSeAprovouTudo') < 0,
        'e NAO a barra, que tambem roda ao abrir a pagina');
    const init = extrairFuncao(CLIENTE, 'initClientePage', true);
    ok(init.indexOf('seguirSozinhoSeAprovouTudo') < 0, 'nem a carga da pagina');
})();

(function oToastNaoTapaOAvisoDoSalto() {
    // O toast nasce no rodape, exatamente onde a barra fica.
    const decisao = extrairFuncao(CLIENTE, 'decisionAmostraItem', true);
    ok(/vaiSeguirSozinho \? '' : 'Item aprovado!'/.test(decisao),
        'na ultima arte o toast de item cede lugar ao aviso grande');
    ok(/if \(msg\) toast\(msg, toastType\)/.test(decisao),
        'e um toast vazio nao vira um balao em branco');
})();

(function osBotoesDeDecisaoSAEMDoHtml() {
    // NAO com o atributo `hidden`, que era como estava ate 25/08/2026.
    //
    // O `[hidden] { display: none }` vem da folha do NAVEGADOR, e perde para
    // qualquer regra de classe nossa -- e `.amostra-decisao-btns { display:
    // flex }` esta no `style.css`. Medido no pedido 20596, ja EM PRODUCAO: o
    // atributo estava la, o `display` calculado era `flex`, e os dois botoes
    // apareciam clicaveis. O APROVAR gravava: regravava o status e postava mais
    // um "o cliente APROVOU" no chat do atendimento, num pedido que ja estava
    // na impressora.
    ok(CLIENTE.indexOf("somenteLeitura ? 'hidden'") < 0,
        'o `hidden` saiu: ele nao esconde nada contra uma regra de classe');
    ok(/somenteLeitura \? '' : `\s*<div class="amostra-decisao-btns">/.test(CLIENTE),
        'os botoes APROVAR/ALTERAR saem do HTML no modo leitura');
    ok(!/class="amostra-decisao-btns"[^>]*hidden/.test(CLIENTE),
        'e nao sobrou nenhum `hidden` nessa div');
})();

(function oBotaoFinalNaoDesfazOConsertoDoCelular() {
    // O `atualizarBarraFinalCliente` reescreve o `innerHTML` do
    // `.cliente-actions` -- ou seja, joga fora o botao escrito no
    // `cliente.html`. Ate 25/08/2026 ele o trocava por um com `height: 48px` e
    // `font-size: 1.1rem` presos no `style=""`, desfazendo em silencio o
    // conserto documentado la: altura fixa mais um tamanho de fonte que a media
    // query nao alcanca (regra de folha de estilo perde para atributo `style`).
    const barra = extrairFuncao(CLIENTE, 'atualizarBarraFinalCliente');
    ok(barra.indexOf('height: 48px') < 0, 'sem altura fixa');
    ok(!/font-size:\s*1\.1rem/.test(barra), 'e sem tamanho de fonte preso no style');
    ok(/min-height:\s*56px/.test(CLIENTE), 'a forma e a mesma do botao do HTML: `min-height`');

    // E sem `opacity`: o `.cliente-actions` e uma barra `sticky` e o conteudo da
    // pagina passa por baixo dela. Quem tapa esse conteudo e o proprio botao --
    // entao bastou o estado desabilitado ganhar `opacity: 0.6` para o card do
    // modelo seguinte aparecer ATRAVES do rotulo, ilegivel, no primeiro estado
    // que todo cliente ve.
    ok(!/opacity:/.test(barra), 'nenhum dos tres botoes finais e translucido');
    ok(/\.cliente-page \.cliente-actions \{[^}]*background:/.test(CSS),
        'e a propria barra tem fundo, como segunda linha de defesa');
})();

(function oCatalogoDeNumeracoesChegaLeve() {
    // 82 dos 116 kB daquela consulta eram `elements` de 86 numeracoes, e o
    // pedido usa uma ou duas. As LINHAS continuam vindo todas de proposito: o
    // `reconciliarCorNumDoModelo` acerta a numeracao pelo NOME quando o parceiro
    // a troca, e uma lista filtrada por id deixaria de fora justamente a linha
    // que so o nome acha.
    // A consulta do CATALOGO e a que ordena por nome; a do miolo filtra por id.
    const catalogo = (CLIENTE.match(
        /from\('producao_numeracoes'\)\s*\n\s*\.select\('([^']*)'\)\s*\n\s*\.order\('name'/) || [])[1];
    ok(catalogo, 'a consulta do catalogo continua identificavel', catalogo);
    ok(catalogo && catalogo.indexOf('elements') < 0,
        'o catalogo vem sem `elements`', catalogo);
    ok(catalogo && catalogo.indexOf('csv_data') < 0, 'e sem `csv_data`', catalogo);
    ok(catalogo && /\bname\b/.test(catalogo) && /is_custom/.test(catalogo),
        'mas com `name` e `is_custom`, que a reconciliacao pelo nome precisa', catalogo);

    const miolo = extrairFuncao(CLIENTE, 'carregarMioloDasNumeracoes', true);
    ok(/select\('id, elements, csv_data'\)/.test(miolo),
        'o miolo vem depois, so das numeracoes deste pedido');
    ok(/reconciliarCorNumDoModelo/.test(miolo),
        'e a lista de quais sai da mesma reconciliacao que o item usa');

    // A ORDEM: o `numIsDuplex` decide o verso e pergunta ao `elements`. Medido
    // no banco em 25/08/2026: NENHUMA das 86 numeracoes tem
    // `print_mode = 'duplex'`, e CINCO tem elemento no verso -- ou seja, quem
    // responde essa pergunta e so o `elements`. Buscado depois da montagem,
    // essas cinco perderiam o verso na tela do cliente, em silencio.
    const chamada = CLIENTE.indexOf('carregarMioloDasNumeracoes(prodItems');
    const montagem = CLIENTE.indexOf('prodItems.map(item =>');
    ok(chamada > 0 && montagem > 0 && chamada < montagem,
        'o miolo chega ANTES de os itens serem montados', [chamada, montagem]);
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
