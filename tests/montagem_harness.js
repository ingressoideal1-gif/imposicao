// O NÚCLEO DA MONTAGEM, RODANDO AS FUNÇÕES DE VERDADE.
//
// A Montagem junta células a refazer de pedidos DIFERENTES numa folha só
// (pedido do usuário em 29/08/2026). O motor já monta folha com modelos de
// pedidos diferentes desde 18/08, e o `refazer_celulas` dele indexa o
// `multi_map`, que carrega modelo, pedido e a linha do banco de cada item.
//
// O que esta tela faz é TRADUZIR — e é a tradução que este harness cobra.
//
// O erro que ele existe para impedir tem consequência física: o código do QR
// Ideal é `indice(pedido, modelo, item)`. Errar a posição por um faz sair o
// código de OUTRO ingresso, e isso só aparece na portaria, com a fila na porta.
//
// Desde o redesenho de 03/09/2026 há mais três coisas cobradas aqui, e as três
// decidem o que sai no papel: a conta de ONDE cada célula cai na folha (a
// mesma do motor, e não uma pilha vertical), a geometria da folha em
// milímetros, e o saneamento dos quatro campos do número do modelo — que a
// tela e o motor precisam fazer igual, senão a prévia mostra uma coisa e o
// papel sai outra.
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
    let i = FONTE.indexOf('\nfunction ' + nome + '(');
    if (i < 0) i = FONTE.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = FONTE.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim de ' + nome);
    return FONTE.slice(i, fim + 2);
}

function extrairConst(nome) {
    const i = FONTE.indexOf('\nconst ' + nome + ' ');
    if (i < 0) throw new Error('nao achei a constante ' + nome);
    const fim = FONTE.indexOf(';\n', i);
    return FONTE.slice(i, fim + 2);
}

const CONSTANTES = ['MTG_POSICOES_DO_NUMERO', 'MTG_ROTACOES_DO_NUMERO',
                    'MTG_TAMANHO_MIN', 'MTG_TAMANHO_MAX',
                    'MTG_ELEMENTOS_SEM_DADO', 'MTG_MAX_CELULAS_DISTRIBUIDAS'];

const NOMES = [
    'numeroPadraoDaMontagem', 'posicoesDaMontagem', 'totalDeItensDoModelo',
    'porQueNaoCabeNaMontagem', 'chaveDoModelo', 'modeloDaMontagem',
    'celulasDoModelo', 'modelosComCelula', 'posicoesCombinadas',
    'totalDeCelulasDaMontagem', 'contaDaMontagem', 'lugarDaCelulaNaFolha',
    'geometriaDaFolha', 'escalaDaFolhaDaMontagem', 'duplicarCelula', 'tirarCelula',
    'moverCelula', 'completarAFolha', 'ordenarCelulas', 'celulasForaDaTiragem',
    'modoDaFolhaDaMontagem', 'numeroDaMontagemSaneado', 'textoDoNumeroDoModelo',
    'elementoDaNumeracaoVaria', 'numeracaoTemDadoVariavel', 'modeloTemDadoVariavel',
    'sugestaoDeAproveitamento',
    'celulasDaFolhaUnica', 'celulasDistribuidas', 'modoSugeridoDaMontagem',
    'formatoDoItem', 'saidaIdDoItem', 'pecaDaMontagem',
    'payloadDaMontagem', 'prepararArtesDaMontagem', 'imprimirNumeroNaMontagem',
    '_mtgNumeroDoPedido', '_mtgEstiloDoNumero',
];

// O `state` do painel, com o catálogo que a resolução do formato consulta.
// O Triband é 1 coluna × 10 linhas; a credencial PVC é 2 × 2 — e é ela que
// prova que a folha não é uma pilha vertical.
function novoState() {
    return {
        formatos: [
            { id: 'F1', id_formato_num: 77, nome: 'Triband 245x20 mm',
              cols: 1, rows: 10, width_mm: 245, height_mm: 20, gap_h_mm: 0, gap_v_mm: 2,
              default_saida_id: 'S1', default_rotate_page: true },
            { id: 'F2', id_formato_num: 88, nome: 'PVC credencial',
              cols: 2, rows: 2, width_mm: 86, height_mm: 54, gap_h_mm: 4, gap_v_mm: 4,
              default_saida_id: 'S2' },
        ],
        saidas: [
            { id: 'S1', nome: 'SRA3', width_mm: 320, height_mm: 450 },
            { id: 'S2', nome: 'A4', width_mm: 210, height_mm: 297 },
        ],
        produtosGlobais: [
            { id_produto: 501, id_formato: 77 },
            { id_produto: 502, id_formato: 88 },
            { id_produto: 503, id_formato: 999 },   // aponta para formato que nao existe
        ],
        osItens: {},
        montagem: { celulas: [], modelos: [], pedidoSel: null, modeloSel: null,
                    selecao: [], zoom: 'peca', numero: null, historia: [], futuro: [] },
    };
}

// Os nomes que o núcleo consulta com `typeof X === 'function'`. Cada teste
// passa os seus; o que não vier fica `undefined`, como numa estação sem eles.
const GLOBAIS = [
    'fatiaCsvDoItem', 'state', 'document', 'modoDeVersoDoModelo', 'rotacaoDaFolhaDoFormato',
    'arteDoModeloParaFolha', 'arteParaOMotor', 'garantirBancosDoTrabalho', 'garantirCsvDoTrabalho',
    'pedidosComBancoDesconhecido', 'bancoVazioNoPayload', 'recadoDeBancoVazio',
    'numeracaoIdDoItem', 'numeracaoSemElementosDeLayout', 'loadOSItens', 'numeroDoPedidoDoItem',
];
const fabrica = new Function(...GLOBAIS,
    CONSTANTES.map(extrairConst).join('\n') + '\n'
    + NOMES.map(extrair).join('\n') + '\nreturn {' + NOMES.join(',') + '};');
function montarApi(stubs) {
    const s = Object.assign({ state: novoState() }, stubs || {});
    return fabrica(...GLOBAIS.map(n => s[n]));
}

const state = novoState();
const api = montarApi({ state });
state.montagem.numero = api.numeroPadraoDaMontagem();

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

    const soFrente = igual(); soFrente.verso_tipo = 'SÓ FRENTE';
    ok(api.porQueNaoCabeNaMontagem(base, soFrente) === null,
       '"Frente" e "SÓ FRENTE" são a mesma coisa, e as duas grafias existem no banco');

    const porPadrao = { formato_id: 'F1', padrao: 'azul celeste', saida_id: 'S1', verso_tipo: 'Frente' };
    ok(api.porQueNaoCabeNaMontagem(base, porPadrao) === null,
       'a cor vale por `cor` ou por `padrao`, e a caixa não separa duas iguais');

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
const MODELOS = [
    { osId: 'a', itemId: '1000565', qtd: 3000 },
    { osId: 'a', itemId: '1000589', qtd: 1920 },
    { osId: 'b', itemId: '1000412', qtd: 150 },
];
const cel = (osId, itemId, pos) => ({ osId, itemId, pos });
{
    const celulas = [
        cel('a', '1000565', 1), cel('a', '1000565', 6), cel('a', '1000565', 22),
        cel('a', '1000589', 340),
        cel('b', '1000412', 7), cel('b', '1000412', 12),
    ];

    const c = api.posicoesCombinadas(celulas, MODELOS);
    ok(c.join(',') === '1,6,22,3340,4927,4932',
       'a posição do 2º modelo desloca pela TIRAGEM do 1º (3000), não pelas células pedidas (3)', c);

    const errado = [1, 6, 22, 3 + 340, 4 + 7, 4 + 12];
    ok(c.join(',') !== errado.join(','), 'e NÃO desloca pelo número de células pedidas', { c, errado });

    ok(api.posicoesCombinadas([], MODELOS).length === 0, 'montagem vazia não produz posição nenhuma');

    const um = api.posicoesCombinadas([cel('x', '1', 3)], [{ osId: 'x', itemId: '1', qtd: 500 }]);
    ok(um.join(',') === '3', 'com um modelo só, a posição não se desloca');

    const comVazio = api.posicoesCombinadas([cel('x', '2', 1)], [
        { osId: 'x', itemId: '1', qtd: 100 },
        { osId: 'x', itemId: '2', qtd: 50 },
    ]);
    ok(comVazio.join(',') === '101',
       'modelo sem célula pedida AINDA desloca — a arte dele entra no multi_artes de qualquer jeito', comVazio);

    const trocado = api.posicoesCombinadas(celulas, [MODELOS[1], MODELOS[0], MODELOS[2]]);
    ok(trocado.join(',') === '1921,1926,1942,340,4927,4932',
       'trocar a ordem dos modelos troca o deslocamento, como no motor', trocado);

    // A ORDEM DAS CÉLULAS, ao contrário, NÃO mexe no deslocamento — só na
    // ordem da saída. É isso que faz o arrasto ser seguro: mover a célula do
    // pedido b para o começo da folha não muda o código de ninguém.
    const arrastado = api.posicoesCombinadas([celulas[4], celulas[0], celulas[3], celulas[1]], MODELOS);
    ok(arrastado.join(',') === '4927,1,3340,6',
       'arrastar células troca a ORDEM da saída, e cada uma leva o seu deslocamento', arrastado);

    const repetida = api.posicoesCombinadas([celulas[1], celulas[1], celulas[3]], MODELOS);
    ok(repetida.join(',') === '6,6,3340', 'célula repetida vai duas vezes, com o mesmo índice', repetida);
}

// ── 4. A conta da folha ─────────────────────────────────────────────────────
{
    const catorze = [];
    for (let i = 0; i < 14; i++) catorze.push(cel('a', '1', i + 1));
    ok(api.totalDeCelulasDaMontagem(catorze) === 14, 'catorze células ao todo');

    const c = api.contaDaMontagem(catorze, 10);
    ok(c.folhas === 2, 'catorze células num formato de 10 dão duas folhas', c);
    ok(c.vazias === 6, 'e sobram seis células', c);

    const fecha = api.contaDaMontagem(catorze.slice(0, 5), 5);
    ok(fecha.folhas === 1 && fecha.vazias === 0, 'cinco células num formato de 5 fecham certo', fecha);

    const oito = api.contaDaMontagem(catorze.slice(0, 8), 4);
    ok(oito.vazias === 0, 'a sobra é o resto — oito num formato de 4 não sobra nada', oito);

    const vazia = api.contaDaMontagem([], 10);
    ok(vazia.celulas === 0 && vazia.folhas === 0, 'montagem vazia não gasta folha');

    const semFormato = api.contaDaMontagem(catorze, 0);
    ok(semFormato.folhas === 0, 'sem células por folha conhecidas, não inventa a conta', semFormato);

    const comRepetida = api.contaDaMontagem([cel('a', '1', 6), cel('a', '1', 6)], 10);
    ok(comRepetida.celulas === 2, 'a célula repetida conta como célula', comRepetida);
}

// ── 5. ONDE cada célula cai na folha ────────────────────────────────────────
//
// A conta do MOTOR, e não uma escolha de desenho. No caminho compactado do
// engine.py: `k = S * poses_per_sheet + P`, com `P = row * cols + col` — linha
// primeiro. A prévia antiga empilhava tudo numa coluna, o que só coincide com
// a verdade num formato de uma coluna. Numa credencial PVC (2 × 2) a tela
// mostrava quatro linhas e o papel saía em quadrado.
{
    // Triband: 1 coluna, 10 linhas. A pilha vertical de antes está certa AQUI.
    const t = i => api.lugarDaCelulaNaFolha(i, 1, 10);
    ok(t(0).folha === 0 && t(0).linha === 0 && t(0).coluna === 0, 'Triband: a 1ª célula é a 1ª linha');
    ok(t(9).folha === 0 && t(9).linha === 9, 'a 10ª ainda é a primeira folha', t(9));
    ok(t(10).folha === 1 && t(10).linha === 0, 'a 11ª abre a segunda folha', t(10));

    // Credencial 2 × 2: LINHA primeiro, da esquerda para a direita.
    const p = i => api.lugarDaCelulaNaFolha(i, 2, 2);
    ok(p(0).linha === 0 && p(0).coluna === 0, 'PVC: a 1ª vai para cima à esquerda', p(0));
    ok(p(1).linha === 0 && p(1).coluna === 1, 'a 2ª vai para cima à DIREITA — não para baixo', p(1));
    ok(p(2).linha === 1 && p(2).coluna === 0, 'a 3ª desce para a segunda linha', p(2));
    ok(p(3).linha === 1 && p(3).coluna === 1, 'e a 4ª fecha a folha', p(3));
    ok(p(4).folha === 1 && p(4).linha === 0 && p(4).coluna === 0, 'a 5ª abre a folha seguinte', p(4));

    // A armadilha, escrita como teste: uma pilha vertical daria coluna 0 sempre.
    ok(p(1).coluna !== 0, 'a folha NÃO é uma pilha vertical num formato de duas colunas');
}

// ── 6. A geometria da folha, em milímetros ──────────────────────────────────
//
// A mesma conta do motor: `used_w = cols*item_w + (cols-1)*gap_h`, e a área
// imposta é centralizada na folha.
{
    const pecaTri = api.pecaDaMontagem({ id: '1', _vibe_id_produto: 501 });
    const g = api.geometriaDaFolha(pecaTri, state.saidas[0]);
    ok(g !== null, 'a geometria sai do formato e da saída');
    ok(g.usedW === 245, 'a largura usada é uma coluna de 245 mm', g.usedW);
    // 10 linhas de 20 mm mais 9 vãos de 2 mm.
    ok(g.usedH === 218, 'e a altura é 10×20 + 9×2 = 218 mm', g.usedH);
    ok(g.startX === (320 - 245) / 2, 'a área é centralizada na folha, como no motor', g.startX);
    ok(g.startY === (450 - 218) / 2, 'nos dois eixos', g.startY);
    ok(g.temPapel === true, 'e a folha tem papel conhecido');

    const pecaPvc = api.pecaDaMontagem({ id: '2', _vibe_id_produto: 502 });
    const gp = api.geometriaDaFolha(pecaPvc, state.saidas[1]);
    ok(gp.usedW === 2 * 86 + 4, 'PVC: duas colunas de 86 mm com um vão de 4', gp.usedW);
    ok(gp.usedH === 2 * 54 + 4, 'e duas linhas de 54 com um vão de 4', gp.usedH);

    // Sem saída conhecida a folha é a própria área imposta: melhor desenhar a
    // grade certa sem papel do que inventar um papel.
    const semSaida = api.geometriaDaFolha(pecaTri, null);
    ok(semSaida.temPapel === false && semSaida.sheetW === semSaida.usedW,
       'sem saída, a folha é a área imposta e a tela sabe que não há papel', semSaida);
    ok(semSaida.startX === 0 && semSaida.startY === 0, 'e não há margem para centralizar');

    ok(api.geometriaDaFolha(api.pecaDaMontagem({ id: '9' }), state.saidas[0]) === null,
       'peça sem formato não produz geometria — e quem chama desenha a lista simples');
}

// ── 7. O zoom ──────────────────────────────────────────────────────────────
{
    const g = api.geometriaDaFolha(api.pecaDaMontagem({ id: '1', _vibe_id_produto: 501 }), state.saidas[0]);

    const peca = api.escalaDaFolhaDaMontagem('peca', g, 700, 500);
    ok(Math.abs(peca - 700 / 245) < 1e-9, 'no modo Peça as células enchem a largura', peca);

    const folha = api.escalaDaFolhaDaMontagem('folha', g, 700, 500);
    ok(Math.abs(folha - 500 / 450) < 1e-9,
       'no modo Folha o papel inteiro cabe — aqui limitado pela altura', folha);
    ok(folha < peca, 'e por isso ele é mais afastado que o modo Peça', { folha, peca });

    const cem = api.escalaDaFolhaDaMontagem('100', g, 700, 500);
    ok(Math.abs(cem - 96 / 25.4) < 1e-9, '100% é tamanho real a 96 dpi', cem);

    ok(api.escalaDaFolhaDaMontagem('peca', null, 700, 500) === 0, 'sem geometria, escala zero');
}

// ── 8. O mesmo modelo, adicionado duas vezes ────────────────────────────────
{
    const modelos = [
        { osId: '21202', itemId: '1000565', qtd: 3000 },
        { osId: '21188', itemId: '1000412', qtd: 150 },
    ];
    const achado = api.modeloDaMontagem(modelos, '21202', '1000565');
    ok(achado !== null && achado.qtd === 3000, 'acha o modelo já registrado');

    ok(api.modeloDaMontagem(modelos, 21202, 1000565) !== null,
       'acha mesmo com número em vez de texto — o id vem dos dois jeitos no banco');

    ok(api.modeloDaMontagem(modelos, '21202', '1000589') === null,
       'outro modelo do MESMO pedido é outro registro');
    ok(api.modeloDaMontagem(modelos, '21999', '1000565') === null,
       'e o mesmo modelo em outro pedido também');

    ok(api.chaveDoModelo({ osId: 21202, itemId: 1000565 }) === api.chaveDoModelo({ osId: '21202', itemId: '1000565' }),
       'a chave do par (pedido, modelo) não distingue número de texto');

    const celulas = [cel('21202', '1000565', 6), cel('21188', '1000412', 1), cel('21202', '1000565', 6)];
    ok(api.celulasDoModelo(celulas, modelos[0]).join(',') === '6,6',
       'as células de um modelo saem na ordem da folha, com repetição', api.celulasDoModelo(celulas, modelos[0]));

    const vivos = api.modelosComCelula([cel('21188', '1000412', 1)], modelos);
    ok(vivos.length === 1 && vivos[0].itemId === '1000412',
       'modelo sem célula nenhuma sai do registro', vivos);
    ok(api.modelosComCelula(celulas, modelos).map(m => m.itemId).join(',') === '1000565,1000412',
       'e os que ficam mantêm a ordem do registro — que é a do multi_artes');
}

// ── 9. O total de itens do modelo ───────────────────────────────────────────
{
    const semBanco = { quantidade: 150, num_inicial: 1, num_final: 150 };
    ok(api.totalDeItensDoModelo(semBanco, null) === 150, 'sem banco, vale a quantidade');

    const comBanco = { quantidade: 3000 };
    const num = { csv_data: new Array(2800).fill({ Codigo: 'x' }) };
    ok(api.totalDeItensDoModelo(comBanco, num) === 2800,
       'com banco MENOR que a quantidade, vale o banco — item além dele sairia sem dado');

    const numMaior = { csv_data: new Array(3200).fill({ Codigo: 'x' }) };
    ok(api.totalDeItensDoModelo({ quantidade: 3000 }, numMaior) === 3000,
       'com banco MAIOR que a quantidade, vale a quantidade — o motor só cria a contratada');

    ok(api.totalDeItensDoModelo({ quantidade: 42 }, null) === 42, 'sem faixa e sem banco, vale a quantidade');
    ok(api.totalDeItensDoModelo(null, null) === 0, 'sem modelo, zero — e não NaN');
    ok(api.totalDeItensDoModelo({ qtd: 17 }, null) === 17, 'a quantidade vale por `quantidade` ou por `qtd`');
    ok(api.totalDeItensDoModelo({ num_inicial: 1, num_final: 80 }, null) === 80, 'sem quantidade, vale a faixa');

    const apiFatia = montarApi({
        state,
        fatiaCsvDoItem: (item, n) => item.csv_selecao ? n.csv_data.slice(0, 5) : n.csv_data,
    });
    ok(apiFatia.totalDeItensDoModelo({ quantidade: 3000, csv_selecao: { ids: [1] } }, num) === 5,
       'com distribuição do banco vale a fatia do modelo, e só ela');
    ok(apiFatia.totalDeItensDoModelo(comBanco, num) === 2800,
       'sem distribuição, a fatia inteira limitada pela quantidade');
}

// ── 10. O FORMATO, resolvido pela própria tela ──────────────────────────────
{
    const f = api.formatoDoItem({ id: '1', _vibe_id_produto: 501 });
    ok(f && f.id === 'F1', 'o formato sai do PRODUTO do item, como no desenho da fila', f);
    ok(api.formatoDoItem({ id: '2', _vibe_id_produto: 502 }).id === 'F2', 'produto diferente, formato diferente');

    const orfao = api.formatoDoItem({ id: '3', _vibe_id_produto: 503, formato_id: 'F2' });
    ok(orfao && orfao.id === 'F2', 'produto sem formato casado cai no formato_id do item', orfao);

    ok(api.formatoDoItem({ id: '4' }) === null, 'sem produto e sem formato_id, nao inventa formato');
    ok(api.formatoDoItem({ id: '5', _vibe_id_produto: 'sem_produto' }) === null,
       '"sem_produto" e o mesmo que nao ter produto');
    ok(api.formatoDoItem(null) === null, 'item nulo nao explode');

    ok(api.saidaIdDoItem({ saida_id: 'S9' }, state.formatos[0]) === 'S9', 'a saida do item vence');
    ok(api.saidaIdDoItem({}, state.formatos[0]) === 'S1', 'sem ela, a padrao do formato');
    ok(api.saidaIdDoItem({}, null) === '', 'sem as duas, vazio — e nao undefined');

    const p = api.pecaDaMontagem({ id: '1', _vibe_id_produto: 501, cor: 'Azul', verso_tipo: 'Frente' });
    ok(p.formato_id === 'F1', 'a peca leva o formato resolvido', p);
    ok(p.celulas_por_folha === 10, 'e quantas celulas cabem na folha — cols x rows', p);
    ok(p.cols === 1 && p.rows === 10, 'e a GRADE, que a folha desenha', p);
    ok(p.item_w_mm === 245 && p.item_h_mm === 20, 'e as medidas da peça em mm', p);
    ok(p.gap_v_mm === 2, 'e os vãos entre as células', p);
    ok(p.saida_id === 'S1', 'e a saida', p);
    ok(p.formato_nome === 'Triband 245x20 mm', 'e o nome, para a trava mostrar', p);
    ok(p._item && p._item.id === '1', 'e guarda o item, que o payload usa para a arte', !!p._item);

    const semFmt = api.pecaDaMontagem({ id: '9' });
    ok(semFmt.formato_id === '', 'item sem formato produz peca sem formato');
    ok(semFmt.cols === 0 && semFmt.item_w_mm === 0, 'e sem medida nenhuma — nada de chute');

    const boa = api.pecaDaMontagem({ id: '1', _vibe_id_produto: 501, cor: 'Azul', verso_tipo: 'Frente' });
    ok(api.porQueNaoCabeNaMontagem(semFmt, semFmt) !== null,
       'DUAS pecas sem formato NAO cabem juntas — era isso que passava, e era a regra inteira inerte');
    ok(/tela do Pedido/.test(api.porQueNaoCabeNaMontagem(boa, semFmt)),
       'e a recusa diz o que fazer: abrir o pedido na tela do Pedido uma vez');

    const outraF = api.pecaDaMontagem({ id: '2', _vibe_id_produto: 502, cor: 'Azul', verso_tipo: 'Frente' });
    ok(api.porQueNaoCabeNaMontagem(boa, outraF) === 'o formato é outro',
       'formatos diferentes continuam recusados, e pelo motivo certo');
    ok(api.porQueNaoCabeNaMontagem(boa, api.pecaDaMontagem(
        { id: '7', _vibe_id_produto: 501, cor: 'Azul', verso_tipo: 'Frente' })) === null,
       'e duas pecas do mesmo produto e da mesma cor cabem, como sempre');
}

// ── 11. O KANBAN: repetir, tirar e mover uma célula ─────────────────────────
//
// Pedido do usuário em 03/09/2026, e ele confirmou o comportamento do repetir:
// "duplicar deve ocupar a próxima célula da imposição movendo todas as outras
// para a célula subsequente".
{
    const A = cel('a', '1', 1), B = cel('a', '1', 2), C = cel('b', '2', 7), D = cel('c', '3', 4);
    const lista = () => [A, B, C, D];
    const nomes = l => l.map(c => c.osId + c.pos).join(',');

    const dup = api.duplicarCelula(lista(), 0);
    ok(nomes(dup) === 'a1,a1,a2,b7,c4',
       'repetir a célula 0 põe a cópia NA PRÓXIMA e empurra as outras', nomes(dup));
    ok(dup[1] !== dup[0] && dup[1].pos === dup[0].pos && dup[1].itemId === dup[0].itemId,
       'a cópia é a MESMA peça (mesmo pedido, modelo e posição), num objeto próprio');
    ok(nomes(api.duplicarCelula(lista(), 3)) === 'a1,a2,b7,c4,c4', 'repetir a última põe a cópia no fim');
    ok(nomes(api.duplicarCelula(lista(), 9)) === 'a1,a2,b7,c4', 'índice fora da folha não faz nada');

    ok(nomes(api.tirarCelula(lista(), 1)) === 'a1,b7,c4', 'tirar a célula 1 deixa as outras do mesmo modelo');
    ok(nomes(api.tirarCelula(lista(), 9)) === 'a1,a2,b7,c4', 'índice fora da folha não tira nada');

    ok(nomes(api.moverCelula(lista(), 0, 3)) === 'a2,b7,c4,a1', 'mover a 1ª para o fim');
    ok(nomes(api.moverCelula(lista(), 3, 0)) === 'c4,a1,a2,b7', 'mover a última para o começo');
    ok(nomes(api.moverCelula(lista(), 1, 2)) === 'a1,b7,a2,c4', 'trocar duas vizinhas');
    ok(nomes(api.moverCelula(lista(), 2, 2)) === 'a1,a2,b7,c4', 'mover para o mesmo lugar não muda nada');
    ok(nomes(api.moverCelula(lista(), 0, 9)) === 'a1,a2,b7,c4', 'destino fora da folha não move');

    const modelos = [{ osId: 'a', itemId: '1', qtd: 100 }, { osId: 'b', itemId: '2', qtd: 50 }, { osId: 'c', itemId: '3', qtd: 10 }];
    ok(api.posicoesCombinadas(api.moverCelula(lista(), 3, 0), modelos).join(',') === '154,1,2,107',
       'a célula movida para o começo continua com o índice do SEU modelo');
}

// ── 12. Completar a folha ───────────────────────────────────────────────────
//
// A sobra é papel pago igual: uma folha de PVC com duas células vazias custa o
// mesmo que uma cheia.
{
    const nomes = l => l.map(c => c.osId + c.pos).join(',');

    const tres = [cel('a', '1', 1), cel('a', '1', 2), cel('b', '2', 7)];
    const r = api.completarAFolha(tres, 5);
    ok(r.entraram === 2, 'faltando duas para fechar a folha de 5, entram duas', r.entraram);
    ok(tres.length === 5, 'e a folha fica cheia', tres.length);
    // Cada cópia entra logo depois da última cópia da sua célula: o material
    // sai agrupado, que é o que facilita separar depois de cortar.
    ok(nomes(tres) === 'a1,a1,a2,a2,b7', 'e as cópias ficam junto das originais', nomes(tres));

    const cheia = [cel('a', '1', 1), cel('a', '1', 2)];
    const r2 = api.completarAFolha(cheia, 2);
    ok(r2.entraram === 0 && cheia.length === 2, 'folha que já fecha certo não ganha nada');

    const uma = [cel('a', '1', 1)];
    api.completarAFolha(uma, 4);
    ok(uma.length === 4 && nomes(uma) === 'a1,a1,a1,a1',
       'com uma célula só, ela se repete até encher', nomes(uma));

    // Duas folhas e meia: completa só a ÚLTIMA, que é a única com sobra.
    const seis = [];
    for (let i = 1; i <= 6; i++) seis.push(cel('a', '1', i));
    const r3 = api.completarAFolha(seis, 4);
    ok(r3.entraram === 2 && seis.length === 8, 'com 6 numa folha de 4, entram 2 para fechar a segunda', r3);

    ok(api.completarAFolha([], 10).entraram === 0, 'folha vazia não completa nada');
    ok(api.completarAFolha([cel('a', '1', 1)], 0).entraram === 0, 'sem saber quantas cabem, não inventa');
}

// ── 13. Ordenar ─────────────────────────────────────────────────────────────
//
// Isso NÃO muda o código de ingresso nenhum: cada célula continua levando o
// deslocamento do seu modelo. Muda só onde ela cai no papel.
{
    const modelos = [
        { osId: 'a', itemId: '1', qtd: 100 },
        { osId: 'b', itemId: '2', qtd: 50 },
        { osId: 'a', itemId: '3', qtd: 10 },
    ];
    const misturado = [
        cel('b', '2', 1), cel('a', '1', 5), cel('a', '3', 2),
        cel('b', '2', 9), cel('a', '1', 8),
    ];
    const nomes = l => l.map(c => c.itemId + '#' + c.pos).join(',');

    const porModelo = api.ordenarCelulas(misturado, modelos, 'modelo');
    ok(nomes(porModelo) === '1#5,1#8,2#1,2#9,3#2',
       'agrupa por modelo, na ordem do registro — que é a do multi_artes', nomes(porModelo));

    const porPedido = api.ordenarCelulas(misturado, modelos, 'pedido');
    ok(nomes(porPedido) === '1#5,3#2,1#8,2#1,2#9',
       'agrupa por pedido, preservando a ordem que o operador montou dentro do grupo', nomes(porPedido));

    ok(nomes(api.ordenarCelulas(misturado, modelos, 'nada')) === nomes(misturado),
       'critério desconhecido não mexe na folha');

    // O que importa: nenhum código muda. As posições combinadas de cada célula
    // são as mesmas, só em outra ordem.
    const antes = api.posicoesCombinadas(misturado, modelos).slice().sort((a, b) => a - b);
    const depois = api.posicoesCombinadas(porModelo, modelos).slice().sort((a, b) => a - b);
    ok(antes.join(',') === depois.join(','),
       'ordenar NÃO muda o código de ingresso nenhum — o conjunto de posições é o mesmo', { antes, depois });

    // Estabilidade: as repetidas ficam juntas e na ordem.
    const comRepetida = [cel('a', '1', 5), cel('b', '2', 1), cel('a', '1', 5)];
    ok(nomes(api.ordenarCelulas(comRepetida, modelos, 'modelo')) === '1#5,1#5,2#1',
       'as repetidas se agrupam junto da original');
}

// ── 14. Posição que deixou de existir ───────────────────────────────────────
{
    const modelos = [{ osId: 'a', itemId: '1', qtd: 100 }, { osId: 'b', itemId: '2', qtd: 50 }];
    const artes = [{ qtd: 100, _tiragem: 100 }, { qtd: 50, _tiragem: 30 }];
    const celulas = [cel('a', '1', 100), cel('b', '2', 30), cel('b', '2', 31), cel('b', '2', 50)];
    const fora = api.celulasForaDaTiragem(celulas, modelos, artes);
    ok(fora.map(c => c.osId + c.pos).join(',') === 'b31,b50',
       'só as posições além da tiragem da arte pronta saem na lista', fora);
    ok(api.celulasForaDaTiragem(celulas, modelos, [{ qtd: 100 }, { qtd: 50 }]).length === 0,
       'arte sem tiragem conhecida não recusa ninguém — o motor confere de novo');
}

// ── 15. O modo de impressão da folha ────────────────────────────────────────
{
    const apiVerso = montarApi({ state, modoDeVersoDoModelo: it => it.modo });
    const m = modoNome => ({ peca: { _item: { modo: modoNome } } });
    ok(apiVerso.modoDaFolhaDaMontagem([m('front'), m('front')]) === 'front', 'só frente é front');
    ok(apiVerso.modoDaFolhaDaMontagem([m('front'), m('duplex')]) === 'duplex', 'um verso comum faz a folha duplex');
    ok(apiVerso.modoDaFolhaDaMontagem([m('duplex'), m('duplex_unico')]) === 'duplex_unico',
       'o verso único vence: é o único que diz ao motor como ler as páginas');
    ok(apiVerso.modoDaFolhaDaMontagem([]) === 'front', 'sem modelo, frente');
    ok(api.modoDaFolhaDaMontagem([m('duplex')]) === 'front',
       'sem a função da tela do Pedido (estação velha), frente — nunca um valor que o motor não conhece');
}

// ── 16. O número do modelo: os quatro campos ────────────────────────────────
//
// A tela e o motor precisam sanear igual, senão a prévia mostra uma coisa e o
// papel sai outra — que é o defeito que este projeto mais repete. O motor tem
// a mesma tabela em `_numero_do_modelo_corpo/posicao/giro`; ver
// tests/test_numero_do_modelo.py.
{
    const p = api.numeroPadraoDaMontagem();
    ok(p.imprimir === false, 'o número nasce DESLIGADO — novidade que muda o papel entra desligada');
    ok(p.pos === 'esquerda' && p.rot === 90 && p.size === 14 && p.cor === '#000000',
       'e os quatro valores reproduzem o que o motor sempre fez', p);

    const san = api.numeroDaMontagemSaneado;
    ok(san({ imprimir: true, pos: 'topo', rot: 270, size: 9, cor: '#ff0000' }).pos === 'topo',
       'valor válido passa');
    ok(san({ pos: 'diagonal' }).pos === 'esquerda', 'posição desconhecida cai no padrão');
    ok(san({ rot: 45 }).rot === 90, 'rotação fora dos quatro ângulos cai no padrão');
    ok(san({ rot: '180' }).rot === 180, 'rotação em texto é aceita — vem de um atributo HTML');
    ok(san({ size: 999 }).size === 14, 'tamanho fora da faixa cai no padrão');
    ok(san({ size: 2 }).size === 14, 'e abaixo do mínimo também');
    ok(san({ size: 'abc' }).size === 14, 'tamanho não numérico cai no padrão');
    ok(san({ size: '18' }).size === 18, 'tamanho em texto é aceito — vem de um input range');
    ok(san({ cor: 'vermelho' }).cor === '#000000', 'cor que não é hex de 6 casas cai no padrão');
    ok(san({ cor: '#ABCDEF' }).cor === '#ABCDEF', 'hex maiúsculo é aceito');
    ok(san(null).size === 14, 'sem nada, o padrão inteiro');
    ok(san({ imprimir: 'sim' }).imprimir === false, 'só o booleano true liga a impressão');

    // O texto: o motor faz `zfill(6)` — preenche ATÉ seis, e deixa passar o
    // que já tem mais. Os ids da gráfica têm sete dígitos.
    ok(api.textoDoNumeroDoModelo('1000565') === '1000565', 'id de 7 dígitos passa inteiro');
    ok(api.textoDoNumeroDoModelo('4200') === '004200', 'id curto ganha zeros à esquerda, como no zfill(6)');
    ok(api.textoDoNumeroDoModelo(4200) === '004200', 'e vale para número, não só texto');
    ok(api.textoDoNumeroDoModelo(null) === '000000', 'sem id, seis zeros — e não "null"');

    // O estilo da prévia: o texto girado tem de ficar DENTRO da célula. Sem
    // posicionar pelo centro, Topo mais 90° saía decepado.
    const est = api._mtgEstiloDoNumero({ pos: 'topo', rot: 90, size: 14, cor: '#000' }, 3, '1000565');
    ok(/translate\(-50%,-50%\)/.test(est), 'no topo, o texto é posicionado pelo CENTRO');
    ok(/rotate\(-90deg\)/.test(est), 'e girado pelo ângulo escolhido, como o motor faz', est);
    const esq = api._mtgEstiloDoNumero({ pos: 'esquerda', rot: 90, size: 14, cor: '#000' }, 3, '1000565');
    ok(/left:/.test(esq) && /top:50%/.test(esq), 'na esquerda, encostado à esquerda e centrado na altura', esq);
}

// ── 17. As artes saem das funções da tela do Pedido, pedido a pedido ────────
//
// `state.bancosDoPedido` e `state.vinculosDeBanco` guardam os bancos de UM
// pedido por vez. Montar as artes do pedido A depois de carregar os bancos de B
// daria a A a numeração sem o banco dela — número no lugar do nome, calado.
async function testarPreparo() {
    const st = novoState();
    st.montagem.numero = { imprimir: true, pos: 'base', rot: 180, size: 20, cor: '#ff0000' };
    st.osItens = {
        a: [{ id: '1', quantidade: 100, amostra_num_id: 'N1' }, { id: '2', quantidade: 30, amostra_num_id: 'N2' }],
        b: [{ id: '9', quantidade: 50, amostra_num_id: 'N1' }],
    };
    const modelos = [
        { osId: 'a', itemId: '1', peca: {} },
        { osId: 'b', itemId: '9', peca: {} },
        { osId: 'a', itemId: '2', peca: {} },
    ];
    const log = [];
    const base = {
        state: st,
        numeracaoIdDoItem: it => it.amostra_num_id,
        numeracaoSemElementosDeLayout: n => n,
        numeroDoPedidoDoItem: osId => ({ a: '21202', b: '21188' })[osId] || null,
        garantirBancosDoTrabalho: async ids => { log.push('bancos ' + ids.join()); st._bancosPedidoDe = ids[0]; },
        garantirCsvDoTrabalho: async ids => { log.push('csv ' + ids.join()); },
        pedidosComBancoDesconhecido: () => [],
        bancoVazioNoPayload: () => [],
        recadoDeBancoVazio: nomes => 'sem banco: ' + nomes.join(),
        arteDoModeloParaFolha: (s, numId, op) => {
            log.push('arte ' + s.osId + '/' + s.itemId + ' bancos=' + st._bancosPedidoDe);
            return { qtd: 999, _osId: s.osId, _itemId: s.itemId, _comPrevia: op ? op.comPrevia : undefined };
        },
        arteParaOMotor: (arte, multi) => ({
            qtd: arte.qtd, modelo: arte._itemId, pedido: arte._osId,
            nome: arte._imprimirNumero ? String(arte._itemId) : '', numeracao: null, _multi: multi,
        }),
    };

    const artes = await montarApi(base).prepararArtesDaMontagem(modelos);
    ok(log.join(' | ') === 'bancos a | csv N1,N2 | arte a/1 bancos=a | arte a/2 bancos=a | bancos b | csv N1 | arte b/9 bancos=b',
       'pedido a pedido: carrega os bancos de A, monta as artes de A; depois B', log);
    ok(artes.map(a => a.modelo).join(',') === '1,9,2',
       'as artes saem NA ORDEM DOS MODELOS, e não na ordem dos pedidos — é a ordem do multi_artes', artes.map(a => a.modelo));
    ok(artes.every(a => a._multi === true), 'cada arte passa por arteParaOMotor como folha combinada');
    ok(artes.every(a => a.nome === String(a.modelo)),
       'com o número ligado, ele vai em cada arte — a escolha da montagem, não a salva no modelo');
    ok(artes.map(a => a._tiragem).join(',') === '100,50,30',
       'cada arte diz quantos itens têm como sair certo', artes.map(a => a._tiragem));

    // OS QUATRO CAMPOS DO NÚMERO viajam em CADA arte.
    ok(artes.every(a => a.nome_color === '#ff0000' && a.nome_size === 20
                     && a.nome_pos === 'base' && a.nome_rot === 180),
       'e leva os quatro campos de COMO o número sai no papel', artes[0]);

    // Valor inválido no state não chega ao motor.
    const stRuim = Object.assign({}, base);
    stRuim.state = novoState();
    stRuim.state.osItens = st.osItens;
    stRuim.state.montagem.numero = { imprimir: true, pos: 'diagonal', rot: 45, size: 999, cor: 'azul' };
    const artesRuins = await montarApi(stRuim).prepararArtesDaMontagem(modelos);
    ok(artesRuins.every(a => a.nome_pos === 'esquerda' && a.nome_rot === 90
                          && a.nome_size === 14 && a.nome_color === '#000000'),
       'valor inválido é saneado ANTES de ir ao motor, e cai no padrão de hoje', artesRuins[0]);

    let erro = null;
    try {
        await montarApi(Object.assign({}, base, { pedidosComBancoDesconhecido: () => ['a'] })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/bancos de dados do pedido 21202/.test(erro || ''),
       'banco que não se conseguiu ler recusa a montagem, dizendo o pedido', erro);

    erro = null;
    try {
        await montarApi(Object.assign({}, base, { bancoVazioNoPayload: () => ['Expointer 2026'] })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/Expointer 2026/.test(erro || ''), 'numeração com banco vazio recusa a montagem pelo nome', erro);

    erro = null;
    try {
        await montarApi(Object.assign({}, base, { arteDoModeloParaFolha: undefined })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/desatualizad/.test(erro || ''), 'sem o construtor da tela do Pedido a recusa manda atualizar o agente', erro);

    erro = null;
    try {
        await montarApi(base).prepararArtesDaMontagem([{ osId: 'a', itemId: '77', peca: {} }]);
    } catch (e) { erro = e.message; }
    ok(/não está mais no pedido/.test(erro || ''), 'modelo que saiu do pedido é recusado com o que fazer', erro);
}

// ── 18. O payload ───────────────────────────────────────────────────────────
{
    const st = novoState();
    st.montagem.numero = api.numeroPadraoDaMontagem();
    const apiP = montarApi({
        state: st,
        modoDeVersoDoModelo: it => it.modo || 'front',
        rotacaoDaFolhaDoFormato: f => f && f.default_rotate_page ? 90 : 0,
    });
    const peca = { formato_id: 'F1', saida_id: 'S1', celulas_por_folha: 10, _item: { modo: 'duplex' } };
    const modelos = [
        { osId: 'a', itemId: '1000565', qtd: 3000, peca },
        { osId: 'b', itemId: '1000412', qtd: 150, peca: Object.assign({}, peca, { _item: { modo: 'front' } }) },
    ];
    // A arte pronta diz 2990: o banco encolheu desde que a lista foi montada.
    const artes = [{ qtd: 2990, _tiragem: 2990 }, { qtd: 150, _tiragem: 150 }];
    const celulas = [cel('b', '1000412', 7), cel('a', '1000565', 6), cel('a', '1000565', 6)];

    const p = apiP.payloadDaMontagem(celulas, modelos, artes);
    ok(p.schema === 'multi_artes', 'o payload usa `schema`, a chave que o app.py lê', p.schema);
    ok(p.multi_artes === artes, 'as artes vão como saíram do construtor do Pedido');
    ok(p.refazer_celulas.join(',') === '2997,6,6',
       'o deslocamento usa a qtd da ARTE PRONTA (2990), não a tiragem guardada na lista (3000)', p.refazer_celulas);
    ok(p.refazer_repetir === true, 'a chave que faz o motor imprimir a célula repetida');
    ok(p.print_mode === 'duplex', 'o modo de impressão vem dos modelos, nos valores que o motor conhece', p.print_mode);
    ok(p.rotate_page === 90, 'a rotação da folha vem do formato', p.rotate_page);
    ok(p.pedido === null && p.modelo === null, 'sem pedido nem modelo "do trabalho": cada arte leva os seus');
    ok(p.formato && p.formato.id === 'F1' && p.saida && p.saida.id === 'S1', 'formato e saída da primeira peça');
    ok(p.refazer_de === 0 && p.refazer_ate === 0, 'a faixa de folhas fica zerada: com células, ela não se aplica');
    ok(p.numeracao === null && p.numeracao_id === null, 'sem numeração do trabalho: ela vai por arte');
}

// ── 19. O aproveitamento da folha ───────────────────────────────────────────
//
// Pedido do usuário em 03/09/2026, com o exemplo dele dentro: "formato com 10
// células, modelo 1, 30 unidades, modelo 2, 70 unidades. Montagem sugerida 3x o
// modelo 1 e 7x o modelo 2".
//
// A conta é achar o MENOR número de impressões que caiba na folha, porque o
// desperdício é `P * R - Q` e P e Q são dados: imprimir menos vezes é gastar
// menos papel. Errar isso não estraga ingresso nenhum — estraga papel, que é
// custo de produção todo dia.
{
    const pecaT = { formato_id: 'F1', saida_id: 'S1', celulas_por_folha: 10 };
    const mod = (itemId, qtd, variavel) => ({
        osId: 'a', itemId, nome: 'm' + itemId, pedidoNumero: '21346',
        qtd, variavel: variavel === true, peca: pecaT });

    // ── O exemplo do usuário, ao pé da letra ──────────────────────────────
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 30), mod('M2', 70)], 10);
        ok(s.viavel, 'o exemplo do usuário produz sugestão', s.motivo);
        ok(s.itens[0].celulas === 3 && s.itens[1].celulas === 7,
           'formato de 10 células com tiragens 30 e 70 sugere 3× o modelo 1 e 7× o modelo 2',
           s.itens.map(i => i.celulas));
        ok(s.impressoes === 10, 'e a folha é impressa 10 vezes', s.impressoes);
        ok(s.itens.every(i => i.sobra === 0), 'sem sobra: a conta fecha exata', s.itens);
        ok(s.celulasUsadas === 10, 'a folha sai cheia', s.celulasUsadas);
        ok(s.total === 100, 'o total é a soma das tiragens', s.total);
    }

    // Nove impressões NÃO cabem — é isso que faz dez ser a resposta, e não uma
    // proporção arredondada por acaso. Com R = 9 os mínimos são 4 + 8 = 12.
    ok(Math.ceil(30 / 9) + Math.ceil(70 / 9) === 12,
       'com 9 impressões os mínimos somam 12 e estouram a folha de 10');

    // ── A folha sobrando célula vira peça a mais, e a tela diz quanto ─────
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 1), mod('M2', 1)], 10);
        ok(s.impressoes === 1, 'duas peças numa folha de dez saem numa impressão só', s.impressoes);
        ok(s.celulasUsadas === 10, 'as oito células livres são aproveitadas', s.celulasUsadas);
        ok(s.itens[0].celulas === 5 && s.itens[1].celulas === 5,
           'e divididas pela proporção da tiragem', s.itens.map(i => i.celulas));
        ok(s.itens[0].sobra === 4 && s.itens[1].sobra === 4,
           'a sobra é declarada: quatro peças a mais de cada', s.itens.map(i => i.sobra));
    }

    // ── Tiragem de produção: a conta continua valendo ────────────────────
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 3000), mod('M2', 1920)], 10);
        ok(s.impressoes === 500, '3000 e 1920 numa folha de 10 fecham em 500 impressões', s.impressoes);
        ok(s.itens[0].celulas === 6 && s.itens[1].celulas === 4,
           'com 6 células de um e 4 do outro', s.itens.map(i => i.celulas));
        ok(s.itens[0].sobra === 0 && s.itens[1].sobra === 80,
           'e 80 peças a mais do segundo, que é o preço de fechar a folha', s.itens.map(i => i.sobra));
    }

    // ── Distribuir empacota melhor do que repetir ────────────────────────
    //
    // Uma folha repetida obriga TODO modelo a caber em toda folha; distribuindo,
    // as peças se acomodam. Com 1 e 100 numa folha de 10 a diferença aparece: 12
    // impressões contra 11 folhas.
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 1), mod('M2', 100)], 10);
        ok(s.impressoes === 12, 'a folha repetida precisa de 12 impressões', s.impressoes);
        ok(s.folhas === 11, 'distribuindo, são 11 folhas', s.folhas);
    }

    // ── As recusas, cada uma com a saída na frase ────────────────────────
    {
        const um = api.sugestaoDeAproveitamento([mod('M1', 30)], 10);
        ok(!um.viavel && /dois modelos/.test(um.motivo), 'com um modelo só não há o que sugerir', um.motivo);

        const semFormato = api.sugestaoDeAproveitamento([mod('M1', 30), mod('M2', 70)], 0);
        ok(!semFormato.viavel && /formato/.test(semFormato.motivo),
           'sem saber quantas células cabem, não há conta', semFormato.motivo);

        const demais = api.sugestaoDeAproveitamento(
            [mod('A', 1), mod('B', 1), mod('C', 1)], 2);
        ok(!demais.viavel && /não cabe nem um de cada/.test(demais.motivo),
           'três modelos numa folha de duas células é impossível, e a frase diz o que fazer',
           demais.motivo);

        const semTiragem = api.sugestaoDeAproveitamento([mod('M1', 0), mod('M2', 70)], 10);
        ok(!semTiragem.viavel && /tiragem/.test(semTiragem.motivo),
           'modelo sem tiragem conhecida não entra na proporção', semTiragem.motivo);
    }

    // ── UMA folha com a mistura ──────────────────────────────────────────
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 30), mod('M2', 70)], 10);
        const c = api.celulasDaFolhaUnica(s);
        ok(c.length === 10, 'a folha única tem exatamente as células do formato', c.length);
        ok(c.filter(x => x.itemId === 'M1').length === 3
            && c.filter(x => x.itemId === 'M2').length === 7,
           'com 3 de um e 7 do outro');
        ok(c.filter(x => x.itemId === 'M1').map(x => x.pos).join(',') === '1,2,3',
           'e as posições começam em 1, sem buraco', c.map(x => x.pos));
    }

    // ── TODAS as peças, com a mistura em cada folha ──────────────────────
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 30), mod('M2', 70)], 10);
        const c = api.celulasDistribuidas(s);
        ok(c.length === 100, 'a folha distribuída tem uma célula por peça', c.length);

        const posM1 = c.filter(x => x.itemId === 'M1').map(x => x.pos);
        ok(posM1.length === 30 && new Set(posM1).size === 30,
           'as 30 peças do primeiro modelo, sem repetir posição', posM1.length);
        ok(Math.max.apply(null, posM1) === 30,
           'e nenhuma posição além da tiragem dele', Math.max.apply(null, posM1));

        // A mistura por folha é o que o operador vai ver no papel.
        for (let f = 0; f < 10; f++) {
            const folha = c.slice(f * 10, f * 10 + 10);
            ok(folha.filter(x => x.itemId === 'M1').length === 3
                && folha.filter(x => x.itemId === 'M2').length === 7,
               'a folha ' + (f + 1) + ' sai com a mistura sugerida',
               folha.map(x => x.itemId));
        }
    }

    // Modelo que acaba antes não deixa buraco: a vaga vai para quem ainda tem
    // peça. Papel é custo, e uma folha com célula vazia no meio é papel jogado
    // fora — a mesma regra do Refazer Célula.
    {
        const s = api.sugestaoDeAproveitamento([mod('M1', 4), mod('M2', 16)], 10);
        const c = api.celulasDistribuidas(s);
        ok(c.length === 20, 'as vinte peças entram', c.length);
        ok(c.slice(0, 10).length === 10 && c.slice(10, 20).length === 10,
           'e as duas folhas saem cheias');
        ok(c.filter(x => x.itemId === 'M1').length === 4,
           'sem inventar peça do modelo que acabou',
           c.filter(x => x.itemId === 'M1').length);
    }

    // ── Quem varia de um item para o outro ───────────────────────────────
    {
        const varia = api.elementoDaNumeracaoVaria;
        ok(varia({ type: 'TEXT' }) === true, 'texto sequencial varia');
        ok(varia({ type: 'QR_IDEAL' }) === true, 'o QR Ideal varia');
        ok(varia({ type: 'BARCODE' }) === true, 'o código de barras varia');
        ok(varia({ type: 'FOTO' }) === true, 'a foto da credencial varia');
        ok(varia({ type: 'ELEMENTO_QUE_AINDA_NAO_EXISTE' }) === true,
           'tipo desconhecido conta como variável — o erro tem de cair para o lado seguro');
        ok(varia({ type: 'FIXED' }) === false, 'texto fixo não varia');
        ok(varia({ type: 'PICOTE' }) === false, 'o picote não varia');
        ok(varia({ type: 'SVG' }) === false, 'um SVG solto não varia');
        ok(varia({ type: 'SVG', csv_column: 'logo' }) === true,
           'mas um SVG que lê coluna do banco varia');
        ok(varia({ type: 'PDF', source: 'database' }) === true,
           'e um PDF vindo do banco também');

        // E o modelo inteiro, que e' o que a lista guarda. Numeracao que a tela
        // nao conseguiu ler conta como variavel: chutar "arte fixa" ali faria a
        // tela recomendar a folha repetida para um ingresso.
        const doModelo = api.modeloTemDadoVariavel;
        ok(doModelo({ amostra_num_id: null }, null) === false,
           'modelo sem numeracao nenhuma e arte so');
        ok(doModelo({ amostra_num_id: 77 }, null) === true,
           'modelo com numeracao que a tela nao conseguiu ler conta como variavel');
        ok(doModelo({ amostra_num_id: 77 }, { elements: [] }) === false,
           'lida e sem elemento, volta a ser arte so');
        ok(doModelo({ amostra_num_id: 77 }, { elements: [{ type: 'QR_IDEAL' }] }) === true,
           'lida e com elemento variavel, e variavel');

        const temDado = api.numeracaoTemDadoVariavel;
        ok(temDado(null) === false, 'modelo sem numeração não tem dado variável');
        ok(temDado({ elements: [] }) === false,
           'numeração sem elemento nenhum é arte só — caso comum e legítimo neste projeto');
        ok(temDado({ elements: [{ type: 'FIXED' }, { type: 'PICOTE' }] }) === false,
           'só elemento fixo continua sendo arte só');
        ok(temDado({ elements: [{ type: 'FIXED' }, { type: 'QR_IDEAL' }] }) === true,
           'um elemento variável já basta');
    }

    // ── O caminho recomendado sai do tipo da peça ────────────────────────
    {
        const fixa = api.sugestaoDeAproveitamento([mod('M1', 30), mod('M2', 70)], 10);
        ok(api.modoSugeridoDaMontagem(fixa) === 'unica',
           'sem dado variável, o recomendado é a folha impressa N vezes');

        const comDado = api.sugestaoDeAproveitamento(
            [mod('M1', 30), mod('M2', 70, true)], 10);
        ok(comDado.temDadoVariavel === true, 'a sugestão sabe que há dado variável na folha');
        ok(api.modoSugeridoDaMontagem(comDado) === 'distribuir',
           'com dado variável, repetir a folha repetiria o código: o recomendado é distribuir');
    }

    // ── O teto da folha distribuída ──────────────────────────────────────
    //
    // Distribuir desenha uma célula por peça. Numa tiragem de produção isso são
    // milhares de células na tela, e a tela não dá conta — então o caminho nasce
    // travado, com o motivo à vista, em vez de recusar depois do clique.
    {
        const cabe = api.sugestaoDeAproveitamento(
            [mod('M1', 400), mod('M2', 400)], 10);
        ok(cabe.total === 800 && cabe.podeDistribuir === true,
           'oitocentas peças ainda cabem na folha distribuída', cabe.total);

        const naoCabe = api.sugestaoDeAproveitamento(
            [mod('M1', 400), mod('M2', 401)], 10);
        ok(naoCabe.podeDistribuir === false,
           'oitocentas e uma já não cabem — o teto é fechado', naoCabe.total);

        const producao = api.sugestaoDeAproveitamento(
            [mod('M1', 3000), mod('M2', 1920)], 10);
        ok(producao.viavel && producao.podeDistribuir === false,
           'uma tiragem de produção continua tendo sugestão, mas não distribuída',
           producao.total);
    }

    // ── A tradução das posições continua valendo depois de aplicar ───────
    //
    // Esta é a verificação que liga o recurso novo à regra que sustenta a tela
    // inteira: a ordem das células no papel não pode mexer no índice de
    // ingresso nenhum. Cada célula continua deslocada pela TIRAGEM dos modelos
    // anteriores, e não pelo número de células que a sugestão deu a eles.
    {
        const modelos = [mod('M1', 30), mod('M2', 70)];
        const s = api.sugestaoDeAproveitamento(modelos, 10);
        const c = api.celulasDistribuidas(s);
        const comb = api.posicoesCombinadas(c, modelos);
        ok(comb.length === 100, 'uma posição combinada por célula', comb.length);

        const doM1 = c.map((x, i) => ({ x, i })).filter(o => o.x.itemId === 'M1');
        ok(doM1.every(o => comb[o.i] === o.x.pos),
           'o primeiro modelo não sofre deslocamento nenhum');
        const doM2 = c.map((x, i) => ({ x, i })).filter(o => o.x.itemId === 'M2');
        ok(doM2.every(o => comb[o.i] === 30 + o.x.pos),
           'e o segundo é deslocado pela TIRAGEM do primeiro (30), não pelas 3 células dele');
    }
}

testarPreparo().then(() => {
    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes do nucleo da Montagem passaram.`);
}).catch(e => { console.error(e); process.exit(1); });
