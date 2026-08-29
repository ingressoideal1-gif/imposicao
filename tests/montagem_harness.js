// O NÚCLEO DA MONTAGEM, RODANDO AS FUNÇÕES DE VERDADE.
//
// A Montagem junta células a refazer de pedidos DIFERENTES numa folha só
// (pedido do usuário em 29/08/2026). O motor não mudou: ele já monta folha com
// modelos de pedidos diferentes desde 18/08, e o `refazer_celulas` dele indexa
// o `multi_map`, que carrega modelo, pedido e a linha do banco de cada item.
//
// O que esta tela faz é TRADUZIR — e é a tradução que este harness cobra.
//
// O erro que ele existe para impedir tem consequência física: o código do QR
// Ideal é `indice(pedido, modelo, item)`. Errar a posição por um faz sair o
// código de OUTRO ingresso, e isso só aparece na portaria, com a fila na porta.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);

const FONTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'montagem.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

// As funções saem do arquivo de verdade, pelo nome. Copiar o corpo para cá
// aprovaria uma cópia velha — foi a lição dos harnesses anteriores.
function extrair(nome) {
    const i = FONTE.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = FONTE.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim de ' + nome);
    return FONTE.slice(i, fim + 2);
}

const NOMES = [
    'posicoesDaMontagem', 'totalDeItensDoModelo', 'porQueNaoCabeNaMontagem',
    'posicoesCombinadas', 'totalDeCelulasDaMontagem', 'contaDaMontagem',
    'grupoDaMontagem',
];

const api = new Function(
    'fatiaCsvDoItem',
    NOMES.map(extrair).join('\n') + '\nreturn {' + NOMES.join(',') + '};'
)(null);

// ── 1. As posições digitadas ────────────────────────────────────────────────
{
    const r = api.posicoesDaMontagem('1,6,22', 3000);
    ok(r.posicoes.join(',') === '1,6,22', 'lista simples', r);
    ok(r.invalidos.length === 0, 'e sem inválidos', r);

    const f = api.posicoesDaMontagem('1-4', 100);
    ok(f.posicoes.join(',') === '1,2,3,4', 'faixa vira lista', f);

    const m = api.posicoesDaMontagem('7; 3 , 1-3', 100);
    ok(m.posicoes.join(',') === '7,3,1,2', 'ponto e vírgula e espaço separam, e o repetido não entra duas vezes', m);

    // A ORDEM DIGITADA É O PAPEL. Ordenar aqui mudaria qual célula ocupa qual
    // posição na folha, sem ninguém ter pedido.
    const o = api.posicoesDaMontagem('22,1,6', 3000);
    ok(o.posicoes.join(',') === '22,1,6', 'a ordem digitada é preservada — é ela que decide a posição na folha', o);

    const fora = api.posicoesDaMontagem('1,151', 150);
    ok(fora.posicoes.join(',') === '1' && fora.invalidos.join(',') === '151',
       'posição maior que a tiragem do modelo é recusada', fora);

    const lixo = api.posicoesDaMontagem('1, abc, 3.5, -2', 100);
    ok(lixo.posicoes.join(',') === '1', 'texto, decimal e negativo não viram posição', lixo);
    ok(lixo.invalidos.length === 3, 'e os três são relatados', lixo);

    const zero = api.posicoesDaMontagem('0', 100);
    ok(zero.posicoes.length === 0 && zero.invalidos.join(',') === '0',
       'a posição 0 não existe — a contagem é 1-based, como no Refazer Célula', zero);

    const vazio = api.posicoesDaMontagem('', 100);
    ok(vazio.posicoes.length === 0 && vazio.invalidos.length === 0, 'texto vazio não é erro', vazio);

    // Sem total conhecido (modelo ainda carregando) o limite não se aplica —
    // recusar tudo seria pior do que aceitar e conferir depois.
    const semTotal = api.posicoesDaMontagem('1,9999', 0);
    ok(semTotal.posicoes.join(',') === '1,9999', 'sem total conhecido, nada é recusado por tamanho', semTotal);
}

// ── 2. O que pode dividir a folha ───────────────────────────────────────────
{
    const base = { formato_id: 'F1', cor: 'Azul Celeste', saida_id: 'S1', verso_tipo: 'Frente' };
    const igual = () => JSON.parse(JSON.stringify(base));

    ok(api.porQueNaoCabeNaMontagem(base, igual()) === null, 'duas peças iguais cabem');

    const outroFmt = igual(); outroFmt.formato_id = 'F2';
    ok(api.porQueNaoCabeNaMontagem(base, outroFmt) === 'o formato é outro',
       'formato diferente é recusado — foi a única condição que o usuário citou');

    const outraCor = igual(); outraCor.cor = 'Dourado';
    ok(api.porQueNaoCabeNaMontagem(base, outraCor) === 'a cor do material é outra',
       'COR diferente é recusada: a folha é de um material só');

    const outraSaida = igual(); outraSaida.saida_id = 'S2';
    ok(api.porQueNaoCabeNaMontagem(base, outraSaida) === 'a saída é outra',
       'SAÍDA diferente é recusada: é o tamanho da folha física');

    const outraFace = igual(); outraFace.verso_tipo = 'Frente e Verso';
    ok(api.porQueNaoCabeNaMontagem(base, outraFace) === 'um imprime frente e verso e o outro só frente',
       'FACE diferente é recusada: o verso existe ou não existe');

    // As duas grafias convivem no banco — o pedido 20495 tem as duas.
    const soFrente = igual(); soFrente.verso_tipo = 'SÓ FRENTE';
    ok(api.porQueNaoCabeNaMontagem(base, soFrente) === null,
       '"Frente" e "SÓ FRENTE" são a mesma coisa, e as duas grafias existem no banco');

    // A cor pode chegar em `cor` ou em `padrao`, e com caixa diferente.
    const porPadrao = { formato_id: 'F1', padrao: 'azul celeste', saida_id: 'S1', verso_tipo: 'Frente' };
    ok(api.porQueNaoCabeNaMontagem(base, porPadrao) === null,
       'a cor vale por `cor` ou por `padrao`, e a caixa não separa duas iguais');

    // O que a montagem NÃO recusa, e de propósito: aqui não há pilha para
    // cortar, então a ordem das células não é decidida pelo modo do modelo.
    const outroModo = igual(); outroModo.modo_impressao = 'blocado';
    ok(api.porQueNaoCabeNaMontagem(base, outroModo) === null,
       'Sequencial × Blocado NÃO impede a montagem — não há pilha para cortar');

    const outroPdf = igual(); outroPdf.modo_pdf = true;
    ok(api.porQueNaoCabeNaMontagem(base, outroPdf) === null,
       'modo PDF também não impede: cada célula traz a arte do seu próprio modelo');
}

// ── 3. A tradução das posições ──────────────────────────────────────────────
//
// O teste que mais importa do arquivo.
{
    const grupos = [
        { osId: 'a', itemId: '1000565', qtd: 3000, posicoes: [1, 6, 22] },
        { osId: 'a', itemId: '1000589', qtd: 1920, posicoes: [340] },
        { osId: 'b', itemId: '1000412', qtd: 150,  posicoes: [7, 12] },
    ];

    const c = api.posicoesCombinadas(grupos);
    ok(c.join(',') === '1,6,22,3340,4927,4932',
       'a posição do 2º modelo desloca pela TIRAGEM do 1º (3000), não pelas células pedidas (3)', c);

    // A armadilha, escrita como teste: somar as células pedidas em vez da
    // tiragem daria 4,9,25... e o motor imprimiria os itens errados, com os
    // códigos de QR de outros ingressos.
    const errado = [1, 6, 22, 3 + 340, 4 + 7, 4 + 12];
    ok(c.join(',') !== errado.join(','), 'e NÃO desloca pelo número de células pedidas', { c, errado });

    ok(api.posicoesCombinadas([]).length === 0, 'montagem vazia não produz posição nenhuma');

    const um = api.posicoesCombinadas([{ qtd: 500, posicoes: [3] }]);
    ok(um.join(',') === '3', 'com um grupo só, a posição não se desloca');

    // Grupo sem posições ainda desloca os seguintes: ele existe no multi_artes.
    const comVazio = api.posicoesCombinadas([
        { qtd: 100, posicoes: [] },
        { qtd: 50,  posicoes: [1] },
    ]);
    ok(comVazio.join(',') === '101',
       'grupo sem célula pedida AINDA desloca — a arte dele entra no multi_artes de qualquer jeito', comVazio);

    // A ordem dos grupos é a ordem do multi_artes. Trocar os grupos muda as
    // posições, e tem de mudar: é a mesma troca que o motor vai ver.
    const trocado = api.posicoesCombinadas([grupos[1], grupos[0]]);
    ok(trocado.join(',') === '340,1921,1926,1942',
       'trocar a ordem dos grupos troca o deslocamento, como no motor', trocado);
}

// ── 4. A conta da folha ─────────────────────────────────────────────────────
{
    const grupos = [
        { qtd: 3000, posicoes: [1, 6, 22] },
        { qtd: 1920, posicoes: [340, 341, 342, 343] },
        { qtd: 150,  posicoes: [7, 12, 88] },
        { qtd: 800,  posicoes: [3, 4, 5, 6] },
    ];
    ok(api.totalDeCelulasDaMontagem(grupos) === 14, 'catorze células ao todo');

    const c = api.contaDaMontagem(grupos, 10);
    ok(c.folhas === 2, 'catorze células num formato de 10 dão duas folhas', c);
    ok(c.vazias === 6, 'e sobram seis células', c);

    const fecha = api.contaDaMontagem([{ qtd: 9, posicoes: [1, 2, 3, 4, 5] }], 5);
    ok(fecha.folhas === 1 && fecha.vazias === 0, 'cinco células num formato de 5 fecham certo', fecha);

    // A sobra é o RESTO, e não folhas×células − total: no formato de 4, oito
    // células dão duas folhas cheias e sobra ZERO.
    const oito = api.contaDaMontagem([{ qtd: 99, posicoes: [1,2,3,4,5,6,7,8] }], 4);
    ok(oito.vazias === 0, 'a sobra é o resto — oito num formato de 4 não sobra nada', oito);

    const vazia = api.contaDaMontagem([], 10);
    ok(vazia.celulas === 0 && vazia.folhas === 0, 'montagem vazia não gasta folha');

    const semFormato = api.contaDaMontagem(grupos, 0);
    ok(semFormato.folhas === 0, 'sem células por folha conhecidas, não inventa a conta', semFormato);
}

// ── 5. O mesmo modelo, adicionado duas vezes ────────────────────────────────
//
// Tem de SOMAR ao grupo que existe. Dois grupos do mesmo modelo dariam duas
// artes iguais no multi_artes, e o deslocamento contaria a tiragem daquele
// modelo duas vezes — todas as posições seguintes sairiam erradas.
{
    const grupos = [
        { osId: '21202', itemId: '1000565', qtd: 3000, posicoes: [1] },
        { osId: '21188', itemId: '1000412', qtd: 150,  posicoes: [7] },
    ];
    const achado = api.grupoDaMontagem(grupos, '21202', '1000565');
    ok(achado !== null && achado.posicoes.join(',') === '1', 'acha o grupo já existente');

    ok(api.grupoDaMontagem(grupos, 21202, 1000565) !== null,
       'acha mesmo com número em vez de texto — o id vem dos dois jeitos no banco');

    ok(api.grupoDaMontagem(grupos, '21202', '1000589') === null,
       'outro modelo do MESMO pedido é outro grupo');
    ok(api.grupoDaMontagem(grupos, '21999', '1000565') === null,
       'e o mesmo modelo em outro pedido também');
}

// ── 6. O total de itens do modelo ───────────────────────────────────────────
//
// É contra ele que a posição digitada vale. Vem do BANCO quando há banco: a
// quantidade contratada e o que o modelo imprime podem divergir, e quem manda
// é o que vira papel (ver docs/conferencia_pedido_21202.md).
{
    const semBanco = { quantidade: 150, num_inicial: 1, num_final: 150 };
    ok(api.totalDeItensDoModelo(semBanco, null) === 150, 'sem banco, vale a faixa numérica');

    const comBanco = { quantidade: 3000 };
    const num = { csv_data: new Array(2800).fill({ Codigo: 'x' }) };
    ok(api.totalDeItensDoModelo(comBanco, num) === 2800,
       'com banco, vale o BANCO — é ele que vira papel, não a quantidade contratada');

    const soQtd = { quantidade: 42 };
    ok(api.totalDeItensDoModelo(soQtd, null) === 42, 'sem faixa e sem banco, vale a quantidade');

    ok(api.totalDeItensDoModelo(null, null) === 0, 'sem modelo, zero — e não NaN');

    const qtdAlternativa = { qtd: 17 };
    ok(api.totalDeItensDoModelo(qtdAlternativa, null) === 17, 'a quantidade vale por `quantidade` ou por `qtd`');
}

if (falhas) {
    console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
    process.exit(1);
}
console.log(`OK: ${total} verificacoes do nucleo da Montagem passaram.`);
