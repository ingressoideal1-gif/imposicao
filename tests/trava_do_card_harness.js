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
const FONTE = ['papelAtual', 'podeDestravarModeloAprovado', 'travarCardsDeModelosAprovados']
    .map(extrairFuncao).join('\n');

// O card aprovado com os controles que o card real tem, mais o card livre ao
// lado — ele existe para provar que a trava nao vaza para o vizinho.
const PAGINA = `
<div id="raiz">
  <div class="card" data-modelo-aprovado="1">
    <select id="a-cor"><option>Cor</option></select>
    <select id="a-num"><option>Numeracao</option></select>
    <button id="a-csv">Ver / editar</button>
    <button id="a-linhas">Linhas</button>
    <input id="a-upload" type="file">
    <button id="a-remove">Remover arte</button>
    <button id="a-pronto">MARCAR PRONTO</button>
    <textarea id="a-obs" data-libera-aprovado="1"></textarea>
    <button id="a-alteracao" data-libera-aprovado="1">EM ALTERACAO</button>
  </div>
  <div class="card">
    <select id="b-cor"><option>Cor</option></select>
    <button id="b-pronto">MARCAR PRONTO</button>
    <textarea id="b-obs"></textarea>
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

        const mapa = {};
        document.querySelectorAll('select, button, input, textarea').forEach(el => {
            mapa[el.id] = !!el.disabled;
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

    ok(!atendimento['a-obs'], 'a anotacao continua de pe para o atendimento');
    ok(!atendimento['a-alteracao'], 'e o botao Em Alteracao tambem');

    // O card do modelo que NAO esta aprovado nao pode ser afetado.
    ok(!atendimento['b-cor'], 'o card livre ao lado continua livre');
    ok(!atendimento['b-pronto'], 'inclusive o PRONTO dele');
    ok(!atendimento['b-obs'], 'e a anotacao dele');

    const gerente = await travados(page, 'gerente', 'amostras-itens-container');
    ok(!gerente['a-alteracao'], 'o gerente tambem coloca em alteracao');
    ok(gerente['a-cor'], 'mas nem para ele a cor abre');

    // ── Quem nao pode destravar: fecha ate a saida ──
    const designer = await travados(page, 'designer', 'amostras-itens-container');
    ok(designer['a-cor'], 'para o designer a cor tambem trava');
    ok(designer['a-obs'], 'e a anotacao trava');
    ok(designer['a-alteracao'], 'e o botao Em Alteracao trava');
    ok(!designer['b-cor'], 'o card livre continua livre para ele');

    // Papel ainda em viagem no primeiro desenho: fecha, e nao abre.
    const semPapel = await travados(page, '', 'amostras-itens-container');
    ok(semPapel['a-alteracao'], 'sem papel conhecido, nem a saida abre');

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
