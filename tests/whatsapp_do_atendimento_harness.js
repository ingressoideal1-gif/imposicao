// O botao "Falar com meu Atendimento" do link do cliente.
//
// Pedido do usuario em 25/08/2026: trocar "Ligar para o meu atendimento" por
// "Falar com meu Atendimento", e cada atendente com o seu link de WhatsApp.
//
// ## O que os cinco links dele tem em comum
//
// TODOS apontam para o mesmo telefone -- 555195343478. O que separa um
// atendente do outro e o RECADO que ja vai escrito na conversa. Por isso o
// codigo guarda um numero so e monta o texto: se cada um tivesse a sua linha,
// seriam cinco numeros para manter.
//
// ## Por que os enderecos aparecem literais aqui
//
// Porque foram DITADOS pelo usuario, caractere por caractere. Este harness
// compara o que o codigo monta com o que ele mandou, byte a byte -- se alguem
// mexer no texto do recado, na ordem dos parametros ou na codificacao, o teste
// mostra a diferenca em vez de deixar passar um link que abre a conversa errada.
//
// Roda em node: `node tests/whatsapp_do_atendimento_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ENTREGA = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-entrega.js'), 'utf8');
const SQL = fs.readFileSync(path.join(RAIZ, 'sql', 'link_cliente_pedido.sql'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function recortar(nome) {
    const i = ENTREGA.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return ENTREGA.slice(i, ENTREGA.indexOf('\n}', i) + 2);
}

/**
 * O CODIGO, sem as linhas de comentario.
 *
 * Os comentarios deste arquivo citam de proposito o rotulo antigo e o
 * `grafica.telefone`, para quem ler saber o que mudou e por que. Uma busca
 * ingenua acha a citacao e acusa o conserto de ser o defeito.
 */
function semComentarios(fonte) {
    return fonte.split('\n')
        .filter(l => {
            const t = l.trim();
            return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
}

function recortarConst(nome) {
    const i = ENTREGA.indexOf('const ' + nome + ' =');
    if (i < 0) throw new Error('nao achei a constante ' + nome);
    const fim = ENTREGA.indexOf(nome === 'ATENDENTES_COM_RECADO_PROPRIO' ? '];' : ';', i);
    return ENTREGA.slice(i, fim + (nome === 'ATENDENTES_COM_RECADO_PROPRIO' ? 2 : 1));
}

const linkDoAtendimento = new Function(
    recortarConst('WHATSAPP_DO_ATENDIMENTO') + '\n'
    + recortarConst('ATENDENTES_COM_RECADO_PROPRIO') + '\n'
    + recortar('chaveDoAtendente') + '\n'
    + recortar('linkDoAtendimento') + '\nreturn linkDoAtendimento;')();

// ─── Os cinco enderecos, como o usuario os mandou ────────────────────────────

const DITADOS = {
    'André Toniazzo':
        'https://api.whatsapp.com/send?phone=555195343478&text=Ol%C3%A1%20Andr%C3%A9%20Toniazzo%2C%20preciso%20de%20atendimento...',
    'Emily Boeira':
        'https://api.whatsapp.com/send?phone=555195343478&text=Ol%C3%A1%20Emily%20Boeira%2C%20preciso%20de%20atendimento...',
    'Alexandre Almeida':
        'https://api.whatsapp.com/send?phone=555195343478&text=Ol%C3%A1%20Alexandre%20Almeida%2C%20preciso%20de%20atendimento...',
    'Fábio Almeida':
        'https://api.whatsapp.com/send?phone=555195343478&text=Ol%C3%A1%20F%C3%A1bio%20Almeida%2C%20preciso%20de%20atendimento...'
};

const DOS_OUTROS =
    'https://api.whatsapp.com/send?phone=555195343478&text=Ol%C3%A1%2C%20estou%20vindo%20do%20site%20da%20Ingresso%20Ideal%2C%20aguardo%20atendimento...%20%F0%9F%98%80';

(function cadaAtendenteRecebeOSeuEndereco() {
    Object.keys(DITADOS).forEach(nome => {
        ok(linkDoAtendimento(nome) === DITADOS[nome],
            nome + ': o endereco e exatamente o que o usuario mandou',
            { montado: linkDoAtendimento(nome), ditado: DITADOS[nome] });
    });
})();

(function quemNaoEstaNaListaCaiNoRecadoGenerico() {
    // Sao os outros nomes que existem no banco hoje. Nenhum fica sem botao por
    // nao estar na lista -- e o atendente que o ERP cadastrar amanha tambem nao.
    ['Lisiane Colbeich', 'Everton Dev', 'Edison Jr', 'Everton Farias', 'Alguem Novo']
        .forEach(nome => {
            ok(linkDoAtendimento(nome) === DOS_OUTROS, nome + ' cai no "Outros"',
                linkDoAtendimento(nome));
        });
})();

(function pedidoSemVendedorNaoFicaSemBotao() {
    [null, undefined, '', '   '].forEach(v => {
        ok(linkDoAtendimento(v) === DOS_OUTROS,
            'sem vendedor (' + JSON.stringify(v) + ') vai para o "Outros"');
    });
})();

(function aGrafiaDoErpNaoPrecisaSerExata() {
    // `propostas.vendedor` e texto livre. Um acento perdido ou uma caixa alta
    // nao podem tirar o cliente do atendente dele.
    ok(linkDoAtendimento('ANDRE TONIAZZO') === DITADOS['André Toniazzo'], 'sem acento e em caixa alta');
    ok(linkDoAtendimento('  andré   toniazzo  ') === DITADOS['André Toniazzo'], 'espaco sobrando e minuscula');
    ok(linkDoAtendimento('Fabio Almeida') === DITADOS['Fábio Almeida'], 'Fabio sem acento');
})();

(function umTelefoneSo() {
    // Se um dia forem cinco numeros, serao cinco coisas para manter. Hoje o que
    // separa os atendentes e o recado, e o teste prende isso.
    const numeros = new Set(
        Object.values(DITADOS).concat([DOS_OUTROS])
            .map(u => (u.match(/phone=(\d+)/) || [])[1]));
    ok(numeros.size === 1, 'os cinco enderecos usam o mesmo telefone', [...numeros]);
    ok(/const WHATSAPP_DO_ATENDIMENTO = '555195343478'/.test(ENTREGA),
        'e o codigo guarda esse numero num lugar so');
})();

// ─── O botao ─────────────────────────────────────────────────────────────────

(function oRotuloEOQueOUsuarioPediu() {
    const botao = semComentarios(recortar('botaoDeAjuda'));
    ok(botao.indexOf('Falar com meu Atendimento') > 0, 'o rotulo novo', botao.slice(-260));
    ok(semComentarios(ENTREGA).indexOf('Ligar para o meu atendimento') < 0, 'o antigo saiu');
    ok(!/href="tel:/.test(semComentarios(ENTREGA)),
        'e nao sobrou nenhum `tel:` -- discar de dentro do navegador do WhatsApp e o pior lugar');
})();

(function oBotaoEXISTEsempre() {
    // Antes ele dependia de `grafica.telefone` e sumia quando o cadastro nao
    // tinha numero. Agora o telefone e do atendimento e esta no codigo.
    const botao = semComentarios(recortar('botaoDeAjuda'));
    ok(botao.indexOf('grafica') < 0, 'nao depende mais do telefone do cadastro', botao.slice(0, 200));
    ok(!/return ''/.test(botao), 'e nao tem mais saida que devolve botao nenhum');
    ok(/target="_blank"/.test(botao) && /noopener noreferrer/.test(botao),
        'abre fora, sem dar acesso a esta pagina');
})();

(function oNomeDoAtendenteVemDoBANCO() {
    // Sem isto o botao nao teria como saber com quem o cliente fala.
    ok(/'vendedor',\s*NULLIF\(btrim\(COALESCE\(v_prop\.vendedor/.test(SQL),
        'a funcao do banco devolve o vendedor do pedido');
    ok(/linkDoAtendimento\(pedido\.vendedor\)/.test(ENTREGA),
        'e o botao o usa');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias do WhatsApp do atendimento.');
