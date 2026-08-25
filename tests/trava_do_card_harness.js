// A trava do card do modelo aprovado, num navegador de verdade.
//
// O harness irmao (`regras_de_bloqueio_harness.js`) prova as DECISOES: quem
// pode o que, e quando a conta de Qtd x linhas fecha. Este prova a outra
// metade, que nenhuma funcao pura alcanca: depois de o HTML entrar na pagina,
// QUAIS controles ficaram realmente travados.
//
// A diferenca importa. `travarCardsDeModelosAprovados` trabalha por seletor --
// `[data-modelo-aprovado="1"]` e `data-libera-aprovado` --, e um seletor errado
// nao quebra nada: o card simplesmente continua editavel, calado, e ninguem
// descobre ate o cliente receber alterado o modelo que ele aprovou.
//
// Roda em node: `node tests/trava_do_card_harness.js`. Sai com codigo 1 se
// algum caso falhar.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

// Lidas do script.js, nunca copiadas.
const FONTE = ['papelAtual', 'podeDestravarModeloAprovado', 'podeCopiarDeModeloAprovado',
               'travarCardsDeModelosAprovados']
    .map(extrairFuncao).join('\n');

// O card aprovado com os controles que o card real tem, mais o card livre ao
// lado — ele existe para provar que a trava nao vaza para o vizinho.
const PAGINA = `
<div id="raiz">
  <div class="card" data-modelo-aprovado="1" data-titulo-aprovado="Modelo aprovado pelo ATENDENTE">
    <select id="a-cor"><option>Cor</option></select>
    <select id="a-num"><option>Numeracao</option></select>
    <button id="a-csv">Ver / editar</button>
    <button id="a-linhas">Linhas</button>
    <input id="a-upload" type="file">
    <button id="a-remove">Remover arte</button>
    <button id="a-pronto">MARCAR PRONTO</button>
    <button id="a-colar">Colar link da arte</button>
    <textarea id="a-obs" data-libera-aprovado="1"></textarea>
    <button id="a-alteracao" data-libera-aprovado="1">EM ALTERACAO</button>
    <button id="a-copy" data-libera-copia="1">Copiar link da arte</button>
  </div>
  <div class="card">
    <select id="b-cor"><option>Cor</option></select>
    <button id="b-pronto">MARCAR PRONTO</button>
    <textarea id="b-obs"></textarea>
    <button id="b-copy" data-libera-copia="1">Copiar link da arte</button>
  </div>
</div>`;

/** Roda a trava com um papel e um container, e devolve quem ficou travado. */
async function travados(page, papel, containerId) {
    await page.setContent(PAGINA);
    return page.evaluate((fonte, papelDoUsuario, container) => {
        window.state = { amostrasContainerId: container };
        window._currentPerms = papelDoUsuario ? { role: papelDoUsuario } : null;
        window._acessoLocal = null;
        // Avalia no escopo global, para que `state` e `window` sejam os de cima.
        (0, eval)(fonte);
        travarCardsDeModelosAprovados(document.getElementById('raiz'));

        const mapa = { _titulos: {} };
        document.querySelectorAll('select, button, input, textarea').forEach(el => {
            mapa[el.id] = !!el.disabled;
            mapa._titulos[el.id] = el.title || '';
        });
        return mapa;
    }, FONTE, papel, containerId);
}

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));

    // ── Quem pode destravar: tudo fecha, menos as duas saidas ──
    const atendimento = await travados(page, 'atendimento', 'amostras-itens-container');

    ok(atendimento['a-cor'], 'a cor trava no modelo aprovado');
    ok(atendimento['a-num'], 'a numeracao trava');
    ok(atendimento['a-csv'], 'a tabela do banco trava');
    ok(atendimento['a-linhas'], 'a fatia de linhas trava');
    ok(atendimento['a-upload'], 'o upload de arte trava');
    // Trava tem de cobrir tambem o apagar, e nao so o alterar.
    ok(atendimento['a-remove'], 'remover a arte trava');
    ok(atendimento['a-pronto'], 'marcar PRONTO trava');

    // Colar E alterar: escreve a arte no modelo aprovado, entao fecha.
    ok(atendimento['a-colar'], 'colar a arte trava');

    ok(!atendimento['a-obs'], 'a anotacao continua de pe para o atendimento');
    ok(!atendimento['a-alteracao'], 'e o botao Em Alteracao tambem');
    ok(!atendimento['a-copy'], 'e copiar o link da arte tambem');

    // O card do modelo que NAO esta aprovado nao pode ser afetado.
    ok(!atendimento['b-cor'], 'o card livre ao lado continua livre');
    ok(!atendimento['b-pronto'], 'inclusive o PRONTO dele');
    ok(!atendimento['b-obs'], 'e a anotacao dele');

    // O aviso do controle travado repete QUEM aprovou, e nao uma frase fixa: um
    // modelo aprovado no balcao dizendo "aprovado pelo cliente" e justamente o
    // defeito que o dono apontou em 19/08/2026.
    ok(/ATENDENTE/.test(atendimento._titulos['a-cor'] || ''),
        'o aviso do controle travado nomeia quem aprovou', atendimento._titulos['a-cor']);

    const gerente = await travados(page, 'gerente', 'amostras-itens-container');
    ok(!gerente['a-alteracao'], 'o gerente tambem coloca em alteracao');
    ok(gerente['a-cor'], 'mas nem para ele a cor abre');
    // A lista de quem COPIA nao e a mesma de quem DESTRAVA: o gerente devolve o
    // modelo para alteracao, mas nao e ele quem trabalha a arte. Continua como
    // sempre esteve -- nada aqui foi tirado dele.
    ok(gerente['a-copy'], 'e copiar o link da arte tampouco');

    // ── Quem nao pode destravar: fecha ate a saida ──
    // Regra do usuario, 25/08/2026: para o designer o card aprovado abre uma
    // unica coisa, a copia do link da arte -- que le o modelo sem altera-lo.
    const designer = await travados(page, 'designer', 'amostras-itens-container');
    ok(designer['a-cor'], 'para o designer a cor tambem trava');
    ok(designer['a-obs'], 'e a anotacao trava');
    ok(designer['a-alteracao'], 'e o botao Em Alteracao trava');
    ok(designer['a-colar'], 'e colar a arte trava');
    ok(!designer['a-copy'], 'mas copiar o link da arte fica liberado para ele');
    ok(!designer['b-cor'], 'o card livre continua livre para ele');

    // Quem nao esta na lista dos tres nao ganha nem a copia.
    const impressor = await travados(page, 'impressor', 'amostras-itens-container');
    ok(impressor['a-copy'], 'para quem nao esta na lista, nem a copia abre');

    // Papel ainda em viagem no primeiro desenho: fecha, e nao abre.
    const semPapel = await travados(page, '', 'amostras-itens-container');
    ok(semPapel['a-alteracao'], 'sem papel conhecido, nem a saida abre');
    ok(semPapel['a-copy'], 'nem a copia');

    // A saida de copia nao pode vazar para o card que NAO esta aprovado --
    // la ela ja estava aberta para todo mundo, e continua.
    ok(!semPapel['b-copy'], 'no card livre a copia continua livre para qualquer um');

    // ── O link do cliente ──
    // E a tela em que ELE aprova, e o card dele nem tem painel de configuracao.
    // Travar ali seria travar quem a regra existe para proteger.
    const cliente = await travados(page, '', 'cliente-amostras-itens-container');
    ok(!cliente['a-cor'] && !cliente['a-alteracao'] && !cliente['a-obs'],
        'no link do cliente nada e travado', cliente);

    ok(erros.length === 0, 'a pagina nao lancou erro', erros);

    await browser.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => {
    console.error(String(e && e.stack || e));
    process.exit(1);
});
