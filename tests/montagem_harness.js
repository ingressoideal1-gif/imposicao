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
// Desde 03/09/2026 a folha é uma lista de CÉLULAS soltas (arrastar, repetir,
// tirar), e as artes saem das funções da tela do Pedido. As duas coisas estão
// cobradas aqui: a ordem das células não mexe no deslocamento, e as artes são
// montadas pedido a pedido, com os bancos de cada um na mão.
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

const NOMES = [
    'posicoesDaMontagem', 'totalDeItensDoModelo', 'porQueNaoCabeNaMontagem',
    'chaveDoModelo', 'modeloDaMontagem', 'celulasDoModelo', 'modelosComCelula',
    'posicoesCombinadas', 'totalDeCelulasDaMontagem', 'contaDaMontagem',
    'duplicarCelula', 'tirarCelula', 'moverCelula', 'celulasForaDaTiragem',
    'modoDaFolhaDaMontagem', 'formatoDoItem', 'saidaIdDoItem', 'pecaDaMontagem',
    'payloadDaMontagem', 'prepararArtesDaMontagem', 'imprimirNumeroNaMontagem',
    '_mtgNumeroDoPedido',
];

// O `state` do painel, com o catálogo que a resolução do formato consulta.
function novoState() {
    return {
        formatos: [
            { id: 'F1', id_formato_num: 77, nome: 'Triband 245x20 mm', cols: 1, rows: 10, default_saida_id: 'S1', default_rotate_page: true },
            { id: 'F2', id_formato_num: 88, nome: 'PVC credencial',    cols: 2, rows: 2,  default_saida_id: 'S2' },
        ],
        saidas: [{ id: 'S1', nome: 'SRA3' }, { id: 'S2', nome: 'A4' }],
        produtosGlobais: [
            { id_produto: 501, id_formato: 77 },
            { id_produto: 502, id_formato: 88 },
            { id_produto: 503, id_formato: 999 },   // aponta para formato que nao existe
        ],
        osItens: {},
        montagem: { celulas: [], modelos: [], pedidoSel: null, modeloSel: null },
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
    NOMES.map(extrair).join('\n') + '\nreturn {' + NOMES.join(',') + '};');
function montarApi(stubs) {
    const s = Object.assign({ state: novoState() }, stubs || {});
    return fabrica(...GLOBAIS.map(n => s[n]));
}

const state = novoState();
const api = montarApi({ state });

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
//
// Os MODELOS dão o deslocamento (a ordem do multi_artes). As CÉLULAS dão a
// ordem da folha. As duas listas são independentes de propósito.
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

    // A armadilha, escrita como teste: somar as células pedidas em vez da
    // tiragem daria 4,9,25... e o motor imprimiria os itens errados, com os
    // códigos de QR de outros ingressos.
    const errado = [1, 6, 22, 3 + 340, 4 + 7, 4 + 12];
    ok(c.join(',') !== errado.join(','), 'e NÃO desloca pelo número de células pedidas', { c, errado });

    ok(api.posicoesCombinadas([], MODELOS).length === 0, 'montagem vazia não produz posição nenhuma');

    const um = api.posicoesCombinadas([cel('x', '1', 3)], [{ osId: 'x', itemId: '1', qtd: 500 }]);
    ok(um.join(',') === '3', 'com um modelo só, a posição não se desloca');

    // Modelo registrado sem célula ainda desloca os seguintes: ele existe no
    // multi_artes.
    const comVazio = api.posicoesCombinadas([cel('x', '2', 1)], [
        { osId: 'x', itemId: '1', qtd: 100 },
        { osId: 'x', itemId: '2', qtd: 50 },
    ]);
    ok(comVazio.join(',') === '101',
       'modelo sem célula pedida AINDA desloca — a arte dele entra no multi_artes de qualquer jeito', comVazio);

    // A ordem dos MODELOS é a ordem do multi_artes. Trocar os modelos muda as
    // posições, e tem de mudar: é a mesma troca que o motor vai ver.
    const trocado = api.posicoesCombinadas(celulas, [MODELOS[1], MODELOS[0], MODELOS[2]]);
    ok(trocado.join(',') === '1921,1926,1942,340,4927,4932',
       'trocar a ordem dos modelos troca o deslocamento, como no motor', trocado);

    // A ORDEM DAS CÉLULAS, ao contrário, NÃO mexe no deslocamento — só na
    // ordem da saída. É isso que faz o arrasto ser seguro: mover a célula do
    // pedido b para o começo da folha não muda o código de ninguém.
    const arrastado = api.posicoesCombinadas([celulas[4], celulas[0], celulas[3], celulas[1]], MODELOS);
    ok(arrastado.join(',') === '4927,1,3340,6',
       'arrastar células troca a ORDEM da saída, e cada uma leva o seu deslocamento', arrastado);

    // Célula repetida (o ⧉) sai duas vezes, com a MESMA posição combinada.
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

    // A sobra é o RESTO, e não folhas×células − total: no formato de 4, oito
    // células dão duas folhas cheias e sobra ZERO.
    const oito = api.contaDaMontagem(catorze.slice(0, 8), 4);
    ok(oito.vazias === 0, 'a sobra é o resto — oito num formato de 4 não sobra nada', oito);

    const vazia = api.contaDaMontagem([], 10);
    ok(vazia.celulas === 0 && vazia.folhas === 0, 'montagem vazia não gasta folha');

    const semFormato = api.contaDaMontagem(catorze, 0);
    ok(semFormato.folhas === 0, 'sem células por folha conhecidas, não inventa a conta', semFormato);

    // As repetidas CONTAM: são células de papel como as outras.
    const comRepetida = api.contaDaMontagem([cel('a', '1', 6), cel('a', '1', 6)], 10);
    ok(comRepetida.celulas === 2, 'a célula repetida conta como célula', comRepetida);
}

// ── 5. O mesmo modelo, adicionado duas vezes ────────────────────────────────
//
// Tem de reaproveitar o registro que existe. Dois registros do mesmo modelo
// dariam duas artes iguais no multi_artes, e o deslocamento contaria a tiragem
// daquele modelo duas vezes — todas as posições seguintes sairiam erradas.
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

    // O registro se poda pelas células: modelo que ficou sem célula sai.
    const vivos = api.modelosComCelula([cel('21188', '1000412', 1)], modelos);
    ok(vivos.length === 1 && vivos[0].itemId === '1000412',
       'modelo sem célula nenhuma sai do registro', vivos);
    ok(api.modelosComCelula(celulas, modelos).map(m => m.itemId).join(',') === '1000565,1000412',
       'e os que ficam mantêm a ordem do registro — que é a do multi_artes');
}

// ── 6. O total de itens do modelo ───────────────────────────────────────────
//
// É contra ele que a posição digitada vale — e é a MESMA conta que o motor vai
// fazer com a arte da tela do Pedido: a quantidade contratada é quantos itens
// ele cria; o banco, quantos têm dado. Vale o menor.
{
    const semBanco = { quantidade: 150, num_inicial: 1, num_final: 150 };
    ok(api.totalDeItensDoModelo(semBanco, null) === 150, 'sem banco, vale a quantidade');

    const comBanco = { quantidade: 3000 };
    const num = { csv_data: new Array(2800).fill({ Codigo: 'x' }) };
    ok(api.totalDeItensDoModelo(comBanco, num) === 2800,
       'com banco MENOR que a quantidade, vale o banco — item além dele sairia sem dado');

    const bancoMaior = { quantidade: 3000 };
    const numMaior = { csv_data: new Array(3200).fill({ Codigo: 'x' }) };
    ok(api.totalDeItensDoModelo(bancoMaior, numMaior) === 3000,
       'com banco MAIOR que a quantidade, vale a quantidade — o motor só cria a contratada');

    const soQtd = { quantidade: 42 };
    ok(api.totalDeItensDoModelo(soQtd, null) === 42, 'sem faixa e sem banco, vale a quantidade');

    ok(api.totalDeItensDoModelo(null, null) === 0, 'sem modelo, zero — e não NaN');

    const qtdAlternativa = { qtd: 17 };
    ok(api.totalDeItensDoModelo(qtdAlternativa, null) === 17, 'a quantidade vale por `quantidade` ou por `qtd`');

    const soFaixa = { num_inicial: 1, num_final: 80 };
    ok(api.totalDeItensDoModelo(soFaixa, null) === 80, 'sem quantidade, vale a faixa numérica');

    // Com distribuição do banco (`csv_selecao`) vale a FATIA, e a quantidade
    // contratada deixa de limitar: é o que o modelo imprime.
    const apiFatia = montarApi({
        state,
        fatiaCsvDoItem: (item, n) => item.csv_selecao ? n.csv_data.slice(0, 5) : n.csv_data,
    });
    const distribuido = { quantidade: 3000, csv_selecao: { ids: [1, 2, 3, 4, 5] } };
    ok(apiFatia.totalDeItensDoModelo(distribuido, num) === 5,
       'com distribuição do banco vale a fatia do modelo, e só ela');
    ok(apiFatia.totalDeItensDoModelo(comBanco, num) === 2800,
       'sem distribuição, a fatia inteira limitada pela quantidade');
}

// ── 7. O FORMATO, resolvido pela própria tela ───────────────────────────────
//
// `formato_id` NÃO existe em `pedidos_modelos` — quem o preenche na memória é
// o DESENHO da fila do Pedido. A Montagem carrega os modelos e nunca desenha
// aquela fila, então os itens chegavam SEM FORMATO (defeito de 29/08/2026).
{
    const item = { id: '1', _vibe_id_produto: 501 };
    const f = api.formatoDoItem(item);
    ok(f && f.id === 'F1', 'o formato sai do PRODUTO do item, como no desenho da fila', f);

    const outro = api.formatoDoItem({ id: '2', _vibe_id_produto: 502 });
    ok(outro && outro.id === 'F2', 'produto diferente, formato diferente', outro);

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
    ok(p.saida_id === 'S1', 'e a saida', p);
    ok(p.formato_nome === 'Triband 245x20 mm', 'e o nome, para a trava mostrar', p);
    ok(p._item && p._item.id === '1', 'e guarda o item, que o payload usa para a arte', !!p._item);

    const semFmt = api.pecaDaMontagem({ id: '9' });
    ok(semFmt.formato_id === '', 'item sem formato produz peca sem formato');

    const boa = api.pecaDaMontagem({ id: '1', _vibe_id_produto: 501, cor: 'Azul', verso_tipo: 'Frente' });
    ok(api.porQueNaoCabeNaMontagem(semFmt, semFmt) !== null,
       'DUAS pecas sem formato NAO cabem juntas — era isso que passava, e era a regra inteira inerte');
    ok(api.porQueNaoCabeNaMontagem(boa, semFmt) !== null,
       'e uma peca sem formato nao entra numa montagem que tem formato');
    ok(/tela do Pedido/.test(api.porQueNaoCabeNaMontagem(boa, semFmt)),
       'e a recusa diz o que fazer: abrir o pedido na tela do Pedido uma vez',
       api.porQueNaoCabeNaMontagem(boa, semFmt));

    const outraF = api.pecaDaMontagem({ id: '2', _vibe_id_produto: 502, cor: 'Azul', verso_tipo: 'Frente' });
    ok(api.porQueNaoCabeNaMontagem(boa, outraF) === 'o formato é outro',
       'formatos diferentes continuam recusados, e pelo motivo certo');

    ok(api.porQueNaoCabeNaMontagem(boa, api.pecaDaMontagem(
        { id: '7', _vibe_id_produto: 501, cor: 'Azul', verso_tipo: 'Frente' })) === null,
       'e duas pecas do mesmo produto e da mesma cor cabem, como sempre');
}

// ── 8. O KANBAN: repetir, tirar e mover uma célula (03/09/2026) ─────────────
//
// Pedido do usuário: "ícone que duplica o modelo na próxima célula", "x na
// célula que exclui ela do gabarito", e "deixar as células em modo kanban para
// movê-las manualmente alterando a sequência".
{
    const A = cel('a', '1', 1), B = cel('a', '1', 2), C = cel('b', '2', 7), D = cel('c', '3', 4);
    const lista = () => [A, B, C, D];
    const nomes = l => l.map(c => c.osId + c.pos).join(',');

    // ⧉ — a cópia entra LOGO DEPOIS, igual, e é outro objeto.
    const dup = api.duplicarCelula(lista(), 0);
    ok(nomes(dup) === 'a1,a1,a2,b7,c4', 'repetir a célula 0 põe a cópia logo abaixo dela', nomes(dup));
    ok(dup[1] !== dup[0] && dup[1].pos === dup[0].pos && dup[1].itemId === dup[0].itemId,
       'a cópia é a MESMA peça (mesmo pedido, modelo e posição), num objeto próprio');
    ok(nomes(api.duplicarCelula(lista(), 3)) === 'a1,a2,b7,c4,c4', 'repetir a última põe a cópia no fim');
    ok(nomes(api.duplicarCelula(lista(), 9)) === 'a1,a2,b7,c4', 'índice fora da folha não faz nada');

    // × — tira SÓ aquela célula.
    ok(nomes(api.tirarCelula(lista(), 1)) === 'a1,b7,c4', 'tirar a célula 1 deixa as outras do mesmo modelo');
    ok(nomes(api.tirarCelula(lista(), 9)) === 'a1,a2,b7,c4', 'índice fora da folha não tira nada');

    // Arrastar — `para` é onde a célula FICA.
    ok(nomes(api.moverCelula(lista(), 0, 3)) === 'a2,b7,c4,a1', 'mover a 1ª para o fim');
    ok(nomes(api.moverCelula(lista(), 3, 0)) === 'c4,a1,a2,b7', 'mover a última para o começo');
    ok(nomes(api.moverCelula(lista(), 1, 2)) === 'a1,b7,a2,c4', 'trocar duas vizinhas');
    ok(nomes(api.moverCelula(lista(), 2, 2)) === 'a1,a2,b7,c4', 'mover para o mesmo lugar não muda nada');
    ok(nomes(api.moverCelula(lista(), 0, 9)) === 'a1,a2,b7,c4', 'destino fora da folha não move');

    // E nenhum dos três gestos mexe no deslocamento: as células levam o seu.
    const modelos = [{ osId: 'a', itemId: '1', qtd: 100 }, { osId: 'b', itemId: '2', qtd: 50 }, { osId: 'c', itemId: '3', qtd: 10 }];
    ok(api.posicoesCombinadas(api.moverCelula(lista(), 3, 0), modelos).join(',') === '154,1,2,107',
       'a célula movida para o começo continua com o índice do SEU modelo');
}

// ── 9. Posição que deixou de existir ────────────────────────────────────────
//
// O banco pode ter mudado entre adicionar a célula e mandar gerar. `_tiragem`
// é o que a arte pronta diz que existe; posição além disso não vai ao motor.
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

// ── 10. O modo de impressão da folha ────────────────────────────────────────
//
// Os três valores que o motor conhece: front, duplex, duplex_unico. A primeira
// versão mandava 'simplex', que o motor trata como frente — o verso nunca saía.
{
    const modo = it => it.modo;
    const apiVerso = montarApi({ state, modoDeVersoDoModelo: modo });
    const m = modoNome => ({ peca: { _item: { modo: modoNome } } });
    ok(apiVerso.modoDaFolhaDaMontagem([m('front'), m('front')]) === 'front', 'só frente é front');
    ok(apiVerso.modoDaFolhaDaMontagem([m('front'), m('duplex')]) === 'duplex', 'um verso comum faz a folha duplex');
    ok(apiVerso.modoDaFolhaDaMontagem([m('duplex'), m('duplex_unico')]) === 'duplex_unico',
       'o verso único vence: é o único que diz ao motor como ler as páginas');
    ok(apiVerso.modoDaFolhaDaMontagem([]) === 'front', 'sem modelo, frente');
    ok(api.modoDaFolhaDaMontagem([m('duplex')]) === 'front',
       'sem a função da tela do Pedido (estação velha), frente — nunca um valor que o motor não conhece');
}

// ── 11. As artes saem das funções da tela do Pedido, pedido a pedido ────────
//
// `state.bancosDoPedido` e `state.vinculosDeBanco` guardam os bancos de UM
// pedido por vez. Montar as artes do pedido A depois de carregar os bancos de B
// daria a A a numeração sem o banco dela — número no lugar do nome, calado.
async function testarPreparo() {
    const st = novoState();
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
        document: { getElementById: () => ({ checked: true }) },
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
            return { qtd: 999, _osId: s.osId, _itemId: s.itemId, _comPrevia: op ? op.comPrevia : undefined, _numId: numId };
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
       'com a caixa marcada, o número do modelo vai em cada arte — a caixa da montagem, não a opção salva no modelo');
    ok(artes.map(a => a._tiragem).join(',') === '100,50,30',
       'cada arte diz quantos itens têm como sair certo (a quantidade, sem banco)', artes.map(a => a._tiragem));
    ok(base.arteDoModeloParaFolha({ osId: 'a', itemId: '1' }, null, { comPrevia: false })._comPrevia === false,
       'o construtor é chamado sem a prévia: a Montagem não desenha a folha do Pedido');

    // Sem a certeza de que os bancos foram lidos, não vai.
    let erro = null;
    try {
        await montarApi(Object.assign({}, base, { pedidosComBancoDesconhecido: () => ['a'] })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/bancos de dados do pedido 21202/.test(erro || ''),
       'banco que não se conseguiu ler recusa a montagem, dizendo o pedido', erro);

    // Numeração que pede banco e chegou vazia também não.
    erro = null;
    try {
        await montarApi(Object.assign({}, base, { bancoVazioNoPayload: () => ['Expointer 2026'] })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/Expointer 2026/.test(erro || ''), 'numeração com banco vazio recusa a montagem pelo nome', erro);

    // Estação com painel velho, sem o construtor do Pedido: diz o que fazer.
    erro = null;
    try {
        await montarApi(Object.assign({}, base, { arteDoModeloParaFolha: undefined })).prepararArtesDaMontagem(modelos);
    } catch (e) { erro = e.message; }
    ok(/desatualizad/.test(erro || ''), 'sem o construtor da tela do Pedido a recusa manda atualizar o agente', erro);

    // Modelo que sumiu do pedido.
    erro = null;
    try {
        await montarApi(base).prepararArtesDaMontagem([{ osId: 'a', itemId: '77', peca: {} }]);
    } catch (e) { erro = e.message; }
    ok(/não está mais no pedido/.test(erro || ''), 'modelo que saiu do pedido é recusado com o que fazer', erro);
}

// ── 12. O payload ───────────────────────────────────────────────────────────
{
    const st = novoState();
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

testarPreparo().then(() => {
    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes do nucleo da Montagem passaram.`);
}).catch(e => { console.error(e); process.exit(1); });
